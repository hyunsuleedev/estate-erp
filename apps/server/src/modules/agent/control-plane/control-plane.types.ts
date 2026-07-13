import { Prisma } from '@prisma/client';

export const AGENT_SESSION_STATUSES = [
  'pending',
  'active',
  'awaiting_input',
  'complete',
  'error',
  'stale',
] as const;
export type AgentSessionStatus = (typeof AGENT_SESSION_STATUSES)[number];

export const AGENT_RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const AGENT_WAKEUP_STATUSES = [
  'queued',
  'claimed',
  'completed',
  'failed',
  'cancelled',
] as const;
export type AgentWakeupStatus = (typeof AGENT_WAKEUP_STATUSES)[number];

export const AGENT_ACTIVITY_TYPES = [
  'thought',
  'action',
  'elicitation',
  'response',
  'error',
  'system',
] as const;
export type AgentActivityType = (typeof AGENT_ACTIVITY_TYPES)[number];

export interface CreateAgentSessionInput {
  agentKey: string;
  adapter?: string;
  taskId?: string | null;
  taskKey: string;
  context?: Prisma.InputJsonValue;
  plan?: Prisma.InputJsonValue | null;
}

export interface ListAgentSessionsOptions {
  status?: AgentSessionStatus;
  agentKey?: string;
  taskId?: string;
  limit?: number;
}

export interface UpdateAgentSessionInput {
  status?: AgentSessionStatus;
  taskId?: string | null;
  waitingReason?: string | null;
  context?: Prisma.InputJsonValue;
  plan?: Prisma.InputJsonValue | null;
}

export interface CreateAgentWakeupInput {
  sessionId: string;
  source: string;
  reason: string;
  payload?: Prisma.InputJsonValue;
  idempotencyKey?: string | null;
  requestedBy?: string | null;
  maxAttempts?: number;
}

export interface ListAgentWakeupsOptions {
  sessionId?: string;
  status?: AgentWakeupStatus;
  source?: string;
  limit?: number;
}

export interface ClaimAgentWakeupOptions {
  source?: string;
  leaseMs?: number;
}

export interface CreateAgentRunInput {
  sessionId: string;
  trigger: string;
  wakeupRequestId?: string | null;
}

export interface ListAgentRunsOptions {
  sessionId?: string;
  status?: AgentRunStatus;
  limit?: number;
}

export type CompleteAgentRunOutcome =
  | 'completed'
  | 'awaiting_input'
  | 'failed';

export interface CompleteAgentRunInput {
  outcome: CompleteAgentRunOutcome;
  result?: Prisma.InputJsonValue;
  usage?: Prisma.InputJsonValue;
  error?: string | null;
  waitingReason?: string | null;
}

export interface AppendAgentActivityInput {
  sessionId: string;
  runId?: string | null;
  type: AgentActivityType;
  message?: string | null;
  payload?: Prisma.InputJsonValue;
  ephemeral?: boolean;
}

export interface ListAgentActivitiesOptions {
  runId?: string;
  afterSequence?: number;
  limit?: number;
}
