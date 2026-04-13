import type { RequestFn } from '../client.js';

export type ProposalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'failed'
  | 'auto_resolved';

export type ProposalPriority = 'urgent' | 'normal' | 'low';

export type TrustTier = 'auto' | 'approval_required' | 'inform_only';

export interface Proposal {
  id: string;
  officeId: string;

  type: string;
  title: string;
  description: string;
  reasoning: string | null;

  status: ProposalStatus;
  priority: ProposalPriority;
  trustTier: TrustTier;

  actionType: string | null;
  actionPayload: Record<string, unknown> | null;

  generatedBy: string;
  dedupeKey: string | null;

  createdByUserId: string | null;

  // 컨텍스트 링크
  listingId: string | null;
  propertyId: string | null;
  contactId: string | null;
  dealId: string | null;
  contractId: string | null;
  tenantId: string | null;

  // 라이프사이클
  proposedAt: string;
  expiresAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  executedAt: string | null;
  executionError: string | null;
}

export interface ListProposalsFilter {
  status?: ProposalStatus;
  priority?: ProposalPriority;
  type?: string;
}

export interface ApproveProposalDto {
  note?: string;
}

export interface RejectProposalDto {
  note: string;
}

export function createProposalsApi(request: RequestFn) {
  return {
    list: (filter: ListProposalsFilter = {}) =>
      request<Proposal[]>('/proposals', { params: filter as Record<string, string | undefined> }),

    findOne: (id: string) =>
      request<Proposal>(`/proposals/${id}`),

    approve: (id: string, dto: ApproveProposalDto = {}) =>
      request<Proposal>(`/proposals/${id}/approve`, { method: 'POST', body: dto }),

    reject: (id: string, dto: RejectProposalDto) =>
      request<Proposal>(`/proposals/${id}/reject`, { method: 'POST', body: dto }),
  };
}
