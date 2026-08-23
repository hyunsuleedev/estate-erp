import type { RealtimeAuthoritySnapshot } from '../common/desktopRealtime';

interface Candidate {
  senderId: number;
  claimId: string;
}

interface Authority extends Candidate {
  leaseId: string;
  revoking: boolean;
}

export interface RealtimeLeaseBrokerOptions {
  createLeaseId?: () => string;
}

/**
 * Exactly-one renderer lease for the Socket.io connection.
 *
 * Candidates stay ordered and an existing healthy owner is never preempted.
 * claimId + leaseId fence StrictMode cleanup, reload and late IPC messages.
 */
export class RealtimeLeaseBroker {
  private readonly candidates = new Map<number, Candidate>();
  private authority: Authority | null = null;
  private generation = 0;
  private readonly createLeaseId: () => string;

  constructor(options: RealtimeLeaseBrokerOptions = {}) {
    this.createLeaseId =
      options.createLeaseId ??
      (() => `${Date.now()}_${Math.random().toString(36).slice(2)}`);
  }

  claim(
    senderId: number,
    claimId: string,
    isEligible: (senderId: number) => boolean,
  ): RealtimeAuthoritySnapshot {
    const previous = this.candidates.get(senderId);
    this.candidates.set(senderId, { senderId, claimId });

    if (
      this.authority?.senderId === senderId &&
      this.authority.claimId !== claimId
    ) {
      // Same live webContents mounted a new provider generation. Keep ownership
      // but fence the old cleanup with a fresh lease.
      this.authority = {
        senderId,
        claimId,
        leaseId: this.createLeaseId(),
        revoking: false,
      };
      this.generation += 1;
    } else if (
      previous &&
      previous.claimId !== claimId &&
      this.authority?.senderId !== senderId
    ) {
      // Map.set preserves deterministic candidate order.
    }

    this.reconcile(isEligible);
    return this.snapshotFor(senderId, claimId);
  }

  release(
    senderId: number,
    claimId: string,
    leaseId: string | null,
    isEligible: (senderId: number) => boolean,
  ): boolean {
    const candidate = this.candidates.get(senderId);
    if (!candidate || candidate.claimId !== claimId) return false;

    if (this.authority?.senderId === senderId) {
      if (this.authority.claimId !== claimId) {
        return false;
      }
      // A standby can be promoted between receiving an inactive snapshot and
      // running its cleanup. It has no lease id to echo yet, but the matching
      // claim id still proves that this renderer generation is withdrawing.
      if (leaseId !== null && this.authority.leaseId !== leaseId) return false;
      this.authority = null;
      this.generation += 1;
    } else if (leaseId !== null) {
      return false;
    }

    this.candidates.delete(senderId);
    this.reconcile(isEligible);
    return true;
  }

  unregister(
    senderId: number,
    isEligible: (senderId: number) => boolean,
  ): boolean {
    const existed = this.candidates.delete(senderId);
    if (this.authority?.senderId === senderId) {
      this.authority = null;
      this.generation += 1;
    }
    const changed = this.reconcile(isEligible);
    return existed || changed;
  }

  reconcile(isEligible: (senderId: number) => boolean): boolean {
    const previous = this.authority;
    if (this.authority) {
      const candidateStillCurrent =
        this.candidates.get(this.authority.senderId)?.claimId ===
        this.authority.claimId;
      if (candidateStillCurrent && isEligible(this.authority.senderId)) {
        // Once revocation was announced, do not silently reactivate the old
        // socket. Its renderer must disconnect and release the exact lease.
        return false;
      }
      if (candidateStillCurrent) {
        if (this.authority.revoking) return false;
        this.authority.revoking = true;
        this.generation += 1;
        return true;
      }
      this.authority = null;
      this.generation += 1;
    }

    const next = [...this.candidates.values()].find((candidate) =>
      isEligible(candidate.senderId),
    );
    this.authority = next
      ? { ...next, leaseId: this.createLeaseId(), revoking: false }
      : null;
    if (
      previous?.senderId !== this.authority?.senderId ||
      previous?.claimId !== this.authority?.claimId ||
      previous?.leaseId !== this.authority?.leaseId
    ) {
      this.generation += 1;
      return true;
    }
    return false;
  }

  snapshotFor(senderId: number, claimId?: string): RealtimeAuthoritySnapshot {
    const candidate = this.candidates.get(senderId);
    const resolvedClaimId = claimId ?? candidate?.claimId ?? '';
    const active = Boolean(
      candidate &&
        candidate.claimId === resolvedClaimId &&
        this.authority?.senderId === senderId &&
        this.authority.claimId === resolvedClaimId &&
        !this.authority.revoking,
    );
    return {
      schemaVersion: 1,
      claimId: resolvedClaimId,
      leaseId:
        this.authority?.senderId === senderId &&
        this.authority.claimId === resolvedClaimId
          ? this.authority.leaseId
          : null,
      generation: this.generation,
      active,
    };
  }

  candidateSenderIds(): readonly number[] {
    return [...this.candidates.keys()];
  }

  ownerSenderId(): number | null {
    return this.authority?.senderId ?? null;
  }

  revokeOwner(): boolean {
    if (!this.authority || this.authority.revoking) return false;
    this.authority.revoking = true;
    this.generation += 1;
    return true;
  }

  reset(): RealtimeAuthoritySnapshot[] {
    const generation = this.generation + 1;
    const snapshots = [...this.candidates.values()].map((candidate) => ({
      schemaVersion: 1 as const,
      claimId: candidate.claimId,
      leaseId: null,
      generation,
      active: false,
    }));
    this.candidates.clear();
    this.authority = null;
    this.generation = generation;
    return snapshots;
  }
}
