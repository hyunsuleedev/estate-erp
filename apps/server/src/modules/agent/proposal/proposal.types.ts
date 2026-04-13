import type { ProposalDraft, TrustTier, ProposalPriority } from '../rule/rule.types';

export type { ProposalDraft, TrustTier, ProposalPriority };

export type ProposalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'failed'
  | 'auto_resolved';

export interface CreateProposalsResult {
  created: number;
  skipped: number;
  autoExecuted: number;
}
