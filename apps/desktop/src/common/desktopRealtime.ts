export interface RealtimeAuthorityClaim {
  schemaVersion: 1;
  claimId: string;
}

export interface RealtimeAuthorityRelease extends RealtimeAuthorityClaim {
  leaseId: string | null;
}

export interface RealtimeAuthoritySnapshot extends RealtimeAuthorityClaim {
  leaseId: string | null;
  generation: number;
  active: boolean;
}
