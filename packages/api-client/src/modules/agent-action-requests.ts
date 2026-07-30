import type {
  AgentActionBlockerReason,
  AgentActionCapability,
  AgentActionExecutionMode,
  AgentActionExecutionStatus,
  AgentActionReviewStatus,
  AgentActionVerificationStatus,
} from '@estate-erp/shared';
import type { RequestFn } from '../client.js';

export interface AgentActionVerification {
  id: string;
  officeId: string;
  requestId: string;
  provider: string;
  captureKind: string;
  result: string;
  state: Record<string, unknown>;
  stateHash: string;
  captureKey: string;
  observedAt: string;
  verifiedBy: string;
  createdAt: string;
}

export interface AgentActionPerson {
  id: string;
  name: string;
  role: string;
}

export interface AgentActionEscalationTask {
  id: string;
  title: string;
  status: string;
  assignedToId: string | null;
  assignedTo?: AgentActionPerson | null;
}

export interface AgentActionListingAdvertisement {
  id: string;
  listingId: string;
  channel: string;
  status: string;
  advertisedPrice: number | null;
  advertisedDeposit: number | null;
  advertisedMonthlyRent: number | null;
  externalAdId: string | null;
  naverArticleNo: string | null;
  naverUrl: string | null;
  url: string | null;
  lastCheckedAt: string | null;
  lastSyncedAt: string | null;
}

export interface AgentActionRequest {
  id: string;
  officeId: string;
  reviewerId: string;
  escalationTaskId: string | null;
  listingAdvertisementId: string;
  supersedesId: string | null;
  capability: AgentActionCapability;
  schemaVersion: number;
  sourceSkillKey: string | null;
  sourceSkillVersion: string | null;
  executorSkillKey: string;
  executorSkillVersion: string;
  title: string;
  summary: string;
  rationale: string;
  riskLevel: string;
  executionMode: AgentActionExecutionMode;
  payload: Record<string, unknown>;
  preconditions: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  baseStateHash: string;
  contentHash: string;
  reviewStatus: AgentActionReviewStatus;
  executionStatus: AgentActionExecutionStatus;
  verificationStatus: AgentActionVerificationStatus;
  version: number;
  dedupeKey: string | null;
  observedAt: string;
  expiresAt: string;
  createdBy: string;
  createdByUserId: string | null;
  approvedContentHash: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  executedById: string | null;
  executedAt: string | null;
  executionResult: Record<string, unknown> | null;
  verifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  reviewer?: AgentActionPerson;
  escalationTask?: AgentActionEscalationTask | null;
  listingAdvertisement?: AgentActionListingAdvertisement;
  createdByUser?: AgentActionPerson | null;
  decidedBy?: AgentActionPerson | null;
  executedBy?: AgentActionPerson | null;
  verifications?: AgentActionVerification[];
}

export interface CreateAgentActionRequestDto {
  reviewerId: string;
  listingAdvertisementId: string;
  capability: AgentActionCapability;
  rationale: string;
  payload: Record<string, unknown>;
  sourceSkillKey?: string | null;
  sourceSkillVersion?: string | null;
  executorSkillVersion?: string | null;
  executionMode?: AgentActionExecutionMode;
  dedupeKey?: string | null;
  supersedesId?: string | null;
}

export interface AgentActionRequestFilter {
  reviewerId?: string;
  escalationTaskId?: string;
  listingAdvertisementId?: string;
  capability?: AgentActionCapability;
  reviewStatus?: AgentActionReviewStatus;
  executionStatus?: AgentActionExecutionStatus;
  verificationStatus?: AgentActionVerificationStatus;
  limit?: number;
}

export interface DecideAgentActionRequestDto {
  contentHash: string;
  version: number;
  note?: string | null;
}

export interface RejectAgentActionRequestDto extends DecideAgentActionRequestDto {
  reason: string;
}

export type WithdrawAgentActionRequestDto = RejectAgentActionRequestDto;

export interface RecordAgentActionExecutionDto {
  contentHash: string;
  version: number;
  note?: string | null;
  receipt: Record<string, unknown>;
}

export interface ReportAgentActionBlockerDto {
  contentHash: string;
  version: number;
  reasonCode: AgentActionBlockerReason;
  summary: string;
  evidence?: Record<string, unknown>;
}

export type RecordManualAgentActionExecutionDto = RecordAgentActionExecutionDto;

export function createAgentActionRequestsApi(request: RequestFn) {
  return {
    list: (filter: AgentActionRequestFilter = {}) =>
      request<AgentActionRequest[]>('/agent-action-requests', {
        params: filter as Record<string, string | number | boolean | undefined>,
      }),

    get: (id: string) =>
      request<AgentActionRequest>(`/agent-action-requests/${id}`),

    create: (dto: CreateAgentActionRequestDto) =>
      request<AgentActionRequest>('/agent-action-requests', {
        method: 'POST',
        body: dto,
      }),

    approve: (id: string, dto: DecideAgentActionRequestDto) =>
      request<AgentActionRequest>(`/agent-action-requests/${id}/approve`, {
        method: 'POST',
        body: dto,
      }),

    reject: (id: string, dto: RejectAgentActionRequestDto) =>
      request<AgentActionRequest>(`/agent-action-requests/${id}/reject`, {
        method: 'POST',
        body: dto,
      }),

    withdraw: (id: string, dto: WithdrawAgentActionRequestDto) =>
      request<AgentActionRequest>(`/agent-action-requests/${id}/withdraw`, {
        method: 'POST',
        body: dto,
      }),

    recordManualExecution: (
      id: string,
      dto: RecordManualAgentActionExecutionDto,
    ) =>
      request<AgentActionRequest>(
        `/agent-action-requests/${id}/manual-execution`,
        {
          method: 'POST',
          body: dto,
        },
      ),

    recordExecution: (id: string, dto: RecordAgentActionExecutionDto) =>
      request<AgentActionRequest>(`/agent-action-requests/${id}/execution`, {
        method: 'POST',
        body: dto,
      }),

    reportBlocker: (id: string, dto: ReportAgentActionBlockerDto) =>
      request<AgentActionRequest>(`/agent-action-requests/${id}/blocker`, {
        method: 'POST',
        body: dto,
      }),
  };
}
