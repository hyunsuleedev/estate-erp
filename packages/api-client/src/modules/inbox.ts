import type { RequestFn } from '../client.js';

export type DraftEntityType =
  | 'listing'
  | 'contract'
  | 'task'
  | 'commission_payment'
  | 'match'
  | 'consultation'
  | 'property'
  | 'action';

export type DraftOperation = 'create' | 'update' | 'delete' | 'action';

export type DraftStatus =
  | 'pending'
  | 'processing'  // AI 재작성 대기 (OpenClaw heartbeat 대기)
  | 'approved'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'rejected'
  | 'expired';

export type DraftDecisionMode = 'confirm' | 'approval';
export type DraftExecutor = 'server' | 'agent' | 'manual';
export type DraftPriority = 'urgent' | 'normal' | 'low';

export interface InboxComment {
  id: string;
  draftId: string;
  officeId: string;
  authorId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface InboxItem {
  id: string;
  officeId: string;

  entityType: DraftEntityType;
  operation: DraftOperation;
  entityId: string | null;

  proposedChanges: Record<string, unknown>;

  category: string;
  title: string;
  summary: string;
  reasoning: string | null;
  priority: DraftPriority;

  decisionMode: DraftDecisionMode;
  executor: DraftExecutor;
  status: DraftStatus;

  snoozedUntil: string | null;
  expiresAt: string | null;

  decidedAt: string | null;
  decidedById: string | null;
  decisionNote: string | null;

  executedAt: string | null;
  executionError: string | null;
  resultEntityId: string | null;

  claimedAt: string | null;
  claimedBy: string | null;
  lockExpiresAt: string | null;

  attempts: number;
  maxAttempts: number;

  generatedBy: string;
  dedupeKey: string | null;

  listingId: string | null;
  propertyId: string | null;
  contactId: string | null;
  dealId: string | null;
  contractId: string | null;
  paymentId: string | null;

  createdAt: string;
  updatedAt: string;

  comments: InboxComment[];
}

export interface ListInboxOptions {
  scope?: 'pending' | 'processing' | 'approved' | 'resolved' | 'all';
  decisionMode?: DraftDecisionMode;
  priority?: DraftPriority;
  category?: string;
  limit?: number;
}

export function createInboxApi(request: RequestFn) {
  return {
    list: (opts: ListInboxOptions = {}) =>
      request<InboxItem[]>('/inbox', {
        params: opts as Record<string, string | number | undefined>,
      }),

    findOne: (id: string) => request<InboxItem>(`/inbox/${id}`),

    edit: (id: string, patch: { proposedChanges?: Record<string, unknown> }) =>
      request<InboxItem>(`/inbox/${id}`, {
        method: 'PATCH',
        body: patch,
      }),

    decide: (id: string, note?: string) =>
      request<InboxItem>(`/inbox/${id}/decide`, {
        method: 'POST',
        body: { note },
      }),

    reject: (id: string, note: string) =>
      request<InboxItem>(`/inbox/${id}/reject`, {
        method: 'POST',
        body: { note },
      }),

    snooze: (id: string, until: string) =>
      request<InboxItem>(`/inbox/${id}/snooze`, {
        method: 'POST',
        body: { until },
      }),

    unsnooze: (id: string) =>
      request<InboxItem>(`/inbox/${id}/unsnooze`, {
        method: 'POST',
        body: {},
      }),

    addComment: (id: string, body: string) =>
      request<InboxComment>(`/inbox/${id}/comments`, {
        method: 'POST',
        body: { body },
      }),

    /**
     * 재작성(revision) 완료 보고 — processing 상태 draft 의 proposedChanges 를
     * 새 내용으로 교체하고 pending 으로 복귀시킨다.
     * readCommentIds 를 생략하면 모든 미읽음 코멘트가 읽음 처리된다.
     */
    submitRevision: (
      id: string,
      body: {
        proposedChanges: Record<string, unknown>;
        readCommentIds?: string[];
      },
    ) =>
      request<InboxItem>(`/inbox/${id}/revision`, {
        method: 'POST',
        body,
      }),
  };
}
