/**
 * EntityDraft 관련 공통 타입.
 *
 * 업무함에서 카드 렌더링 / 실행 디스패치에 쓰이는 enum 들을 TypeScript 측에서 좁힌다.
 * DB 는 string 이지만 코드 레벨에서는 아래 유니온만 사용하도록 강제.
 */

export type DraftEntityType =
  | 'listing'
  | 'contract'
  | 'task'
  | 'commission_payment'
  | 'match'
  | 'consultation'
  | 'property'
  | 'action'; // 외부 액션 — DB 레코드 없음

export type DraftOperation = 'create' | 'update' | 'delete' | 'action';

export type DraftStatus =
  | 'pending'      // 업무함 대기
  | 'processing'   // AI 재작성 대기 (OpenClaw heartbeat 대기)
  | 'approved'     // 사장님 승인, executor 실행 대기
  | 'executing'    // agent executor 가 claim 해서 실행 중
  | 'executed'     // 실행 완료
  | 'failed'       // 실행 실패
  | 'rejected'     // 사장님 거부
  | 'expired';     // expiresAt 지남

export type DraftDecisionMode = 'confirm' | 'approval';

export type DraftExecutor = 'server' | 'agent' | 'manual';

export type DraftPriority = 'urgent' | 'normal' | 'low';

export interface CreateDraftInput {
  officeId: string;

  entityType: DraftEntityType;
  operation: DraftOperation;
  entityId?: string | null;

  proposedChanges: Record<string, unknown>;

  category: string;
  title: string;
  summary: string;
  reasoning?: string;
  priority?: DraftPriority;

  decisionMode: DraftDecisionMode;
  executor?: DraftExecutor;

  generatedBy: string;
  dedupeKey?: string;
  expiresAt?: Date;

  // 컨텍스트 링크
  listingId?: string;
  propertyId?: string;
  contactId?: string;
  dealId?: string;
  contractId?: string;
  paymentId?: string;
}
