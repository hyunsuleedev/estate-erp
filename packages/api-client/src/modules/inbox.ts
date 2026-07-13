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
  | 'processing' // durable wakeup을 받은 AI가 새 revision 작성 중
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
  listingIntakeId: string | null;
  propertyId: string | null;
  contactId: string | null;
  dealId: string | null;
  contractId: string | null;
  paymentId: string | null;

  agentSessionId: string | null;
  requestedByRunId: string | null;
  agentSession: {
    id: string;
    agentKey: string;
    status: string;
    waitingReason: string | null;
    task: {
      id: string;
      title: string;
      status: string;
      assignedTo: { id: string; name: string } | null;
    } | null;
  } | null;

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
     * 일반 제안의 재작성 완료 보고. 불변 계약서 artifact는 이 API 대신
     * 새 ContractDocumentRevision을 생성해야 한다.
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
