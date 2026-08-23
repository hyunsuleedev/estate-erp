import { useEffect, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { RealtimeAuthoritySnapshot } from '../../common/desktopRealtime';
import { getToken } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { queryClient } from '@/providers/query-provider';

interface ListingUpdatedEvent {
  listingId: string;
  propertyId: string;
  intakeId?: string | null;
}

interface ListingIntakeUpdatedEvent {
  intakeId: string;
  propertyId: string;
}

const crossRendererInvalidate = (queryKey: readonly unknown[]) => {
  void queryClient.invalidateQueries({ queryKey });
};

function getRealtimeUrl() {
  const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!baseUrl) {
    return window.location.protocol === 'file:'
      ? 'http://localhost:3000/realtime'
      : `${window.location.origin}/realtime`;
  }
  const url = new URL(baseUrl, window.location.origin);
  return `${url.origin}/realtime`;
}

function invalidateListing(event: ListingUpdatedEvent) {
  crossRendererInvalidate(['listings']);
  crossRendererInvalidate(['listing-intakes']);
  crossRendererInvalidate(['properties']);
  crossRendererInvalidate(['properties', event.propertyId]);
  if (event.intakeId) {
    crossRendererInvalidate(['listing-intakes', 'quick-sheet', event.intakeId]);
  }
}

function invalidateListingIntake(event: ListingIntakeUpdatedEvent) {
  crossRendererInvalidate(['listings']);
  crossRendererInvalidate(['listing-intakes']);
  crossRendererInvalidate(['properties']);
  crossRendererInvalidate(['properties', event.propertyId]);
  crossRendererInvalidate(['listing-intakes', 'quick-sheet', event.intakeId]);
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const isNativeTab = window.electronBridge?.surface.kind === 'native-tab';
  const principalKey = `${user?.id ?? ''}:${user?.office?.id ?? ''}`;

  useEffect(() => {
    const bridge = window.electronBridge?.realtime;
    if (!bridge || !isAuthenticated || isNativeTab || !principalKey) return;

    const claimId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `realtime_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let active = true;
    let latestGeneration = -1;
    let current: RealtimeAuthoritySnapshot | null = null;
    let socket: ReturnType<typeof io> | null = null;
    let retryTimer: number | null = null;

    const disconnectSocket = () => {
      socket?.off('connect');
      socket?.off('connect_error');
      socket?.off('disconnect');
      socket?.off('listing.updated', invalidateListing);
      socket?.off('listing-intake.updated', invalidateListingIntake);
      socket?.disconnect();
      socket = null;
    };

    const release = () => {
      if (!current) return;
      const released = current;
      current = null;
      bridge.releaseAuthority({
        schemaVersion: 1,
        claimId,
        leaseId: released.leaseId,
      });
    };

    const claim = () => {
      if (!active) return;
      void bridge
        .claimAuthority({ schemaVersion: 1, claimId })
        .then((result) => {
          if (!active) {
            if (result.ok && result.snapshot) {
              bridge.releaseAuthority({
                schemaVersion: 1,
                claimId,
                leaseId: result.snapshot.leaseId,
              });
            }
            return;
          }
          if (result.ok && result.snapshot) apply(result.snapshot);
        })
        .catch(() => scheduleRetry());
    };

    const scheduleRetry = () => {
      if (!active || retryTimer !== null) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        claim();
      }, 750 + Math.floor(Math.random() * 500));
    };

    const loseLeaseAndRetry = () => {
      // Strict ordering: the old socket is fully disconnected before main can grant
      // this exact lease to a standby renderer.
      disconnectSocket();
      release();
      scheduleRetry();
    };

    const connectSocket = async (snapshot: RealtimeAuthoritySnapshot) => {
      disconnectSocket();
      let token: string | null = null;
      try {
        token = await getToken();
      } catch {
        // handled below
      }
      if (!active || current?.leaseId !== snapshot.leaseId) return;
      if (!token) {
        loseLeaseAndRetry();
        return;
      }
      socket = io(getRealtimeUrl(), {
        auth: { token },
        transports: ['websocket'],
      });
      socket.on('connect', () => {
        for (const key of [
          ['properties'],
          ['listings'],
          ['listing-intakes'],
          ['contacts'],
          ['tenants'],
          ['consultations'],
          ['matches'],
          ['deals'],
        ] as const) {
          crossRendererInvalidate(key);
        }
      });
      socket.on('connect_error', loseLeaseAndRetry);
      socket.on('disconnect', (reason) => {
        if (reason === 'io server disconnect') loseLeaseAndRetry();
      });
      socket.on('listing.updated', invalidateListing);
      socket.on('listing-intake.updated', invalidateListingIntake);
    };

    function apply(snapshot: RealtimeAuthoritySnapshot) {
      if (
        !active ||
        snapshot.claimId !== claimId ||
        snapshot.generation < latestGeneration
      ) {
        return;
      }
      latestGeneration = snapshot.generation;
      if (!snapshot.active) {
        if (current?.active) disconnectSocket();
        current = snapshot;
        if (snapshot.leaseId) {
          // Main is revoking this exact lease (for example on an office
          // switch). Complete the disconnect barrier before a standby can be
          // granted, then re-enter the candidate queue with fresh auth state.
          release();
          scheduleRetry();
        }
        return;
      }
      if (current?.active && current.leaseId === snapshot.leaseId) return;
      current = snapshot;
      void connectSocket(snapshot);
    }

    const cleanupAuthority = bridge.onAuthority(apply);
    claim();
    return () => {
      active = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      cleanupAuthority();
      disconnectSocket();
      release();
    };
  }, [isAuthenticated, isNativeTab, principalKey]);

  return children;
}
