import { useEffect, type ReactNode } from 'react';
import { io } from 'socket.io-client';
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
  queryClient.invalidateQueries({ queryKey: ['listings'] });
  queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
  queryClient.invalidateQueries({ queryKey: ['properties'] });
  queryClient.invalidateQueries({ queryKey: ['properties', event.propertyId] });

  if (event.intakeId) {
    queryClient.invalidateQueries({
      queryKey: ['listing-intakes', 'quick-sheet', event.intakeId],
    });
  }
}

function invalidateListingIntake(event: ListingIntakeUpdatedEvent) {
  queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
  queryClient.invalidateQueries({ queryKey: ['properties'] });
  queryClient.invalidateQueries({ queryKey: ['properties', event.propertyId] });
  queryClient.invalidateQueries({
    queryKey: ['listing-intakes', 'quick-sheet', event.intakeId],
  });
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    let socket: ReturnType<typeof io> | null = null;
    let cancelled = false;

    getToken().then((token) => {
      if (cancelled || !token) return;

      socket = io(getRealtimeUrl(), {
        auth: { token },
        transports: ['websocket'],
      });

      socket.on('listing.updated', invalidateListing);
      socket.on('listing-intake.updated', invalidateListingIntake);
    });

    return () => {
      cancelled = true;
      socket?.off('listing.updated', invalidateListing);
      socket?.off('listing-intake.updated', invalidateListingIntake);
      socket?.disconnect();
    };
  }, [isAuthenticated]);

  return children;
}
