import type {
  AgentActionCapability,
  AgentActionBlockerReason,
  AgentActionExecutionMode,
  AgentActionExecutionStatus,
  AgentActionReviewStatus,
  AgentActionVerificationStatus,
} from '@estate-erp/shared';
import type { Prisma } from '@prisma/client';

export interface AgentActionActor {
  actor: string;
  source: 'web' | 'mcp' | 'system';
  userId?: string;
  role?: string;
}

export interface CreateAgentActionRequestInput {
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

export interface ListAgentActionRequestsOptions {
  reviewerId?: string;
  escalationTaskId?: string;
  listingAdvertisementId?: string;
  capability?: AgentActionCapability;
  reviewStatus?: AgentActionReviewStatus;
  executionStatus?: AgentActionExecutionStatus;
  verificationStatus?: AgentActionVerificationStatus;
  limit?: number;
}

export interface DecideAgentActionRequestInput {
  contentHash: string;
  version: number;
  note?: string | null;
}

export interface RejectAgentActionRequestInput extends DecideAgentActionRequestInput {
  reason: string;
}

export type WithdrawAgentActionRequestInput = RejectAgentActionRequestInput;

export interface RecordAgentActionExecutionInput {
  contentHash: string;
  version: number;
  note?: string | null;
  receipt: Prisma.InputJsonValue;
}

export interface ReportAgentActionBlockerInput {
  contentHash: string;
  version: number;
  reasonCode: AgentActionBlockerReason;
  summary: string;
  evidence?: unknown;
}
