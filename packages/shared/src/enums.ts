/** 사이트/매물 유형 */
export const SiteType = {
  APARTMENT: 'apartment',
  OFFICETEL: 'officetel',
  VILLA: 'villa',
  HOUSE: 'house',
  COMMERCIAL: 'commercial',
  LAND: 'land',
  LIVING_ACCOMMODATION: 'living_accommodation',
} as const;
export type SiteType = (typeof SiteType)[keyof typeof SiteType];

/** 매물 거래 유형 */
export const TransactionType = {
  SALE: 'sale',
  JEONSE: 'jeonse',
  MONTHLY: 'monthly',
} as const;
export type TransactionType =
  (typeof TransactionType)[keyof typeof TransactionType];

/** 매물 확인 상태 */
export const CheckStatus = {
  UNVERIFIED: 'unverified',
  VERIFIED: 'verified',
  IN_CONTRACT: 'in_contract',
  HOLD: 'hold',
  DONE: 'done',
} as const;
export type CheckStatus = (typeof CheckStatus)[keyof typeof CheckStatus];

/** 매칭 파이프라인 스테이지 */
export const MatchStage = {
  SUGGESTED: 'suggested',
  BUYER_CONTACTED: 'buyerContacted',
  VIEWING: 'viewing',
  OWNER_CONTACTED: 'ownerContacted',
  NEGOTIATING: 'negotiating',
  DEAL_CREATED: 'dealCreated',
  CLOSED: 'closed',
} as const;
export type MatchStage = (typeof MatchStage)[keyof typeof MatchStage];

/** 거래 파이프라인 스테이지 */
export const DealStage = {
  SELECTION: 'selection',          // 매물 선정/임장
  NEGOTIATING: 'negotiating',      // 조건 협상 중
  PRE_CONTRACT: 'preContract',     // 가계약금 수령 (Contract 없음)
  CONTRACTED: 'contracted',        // 본계약 체결 (Contract 생성됨)
  SETTLING: 'settling',            // 중도금/잔금 진행
  COMPLETED: 'completed',          // 잔금 완료 + 등기이전
  CLOSED: 'closed',                // 수수료 정산까지 종료
} as const;
export type DealStage = (typeof DealStage)[keyof typeof DealStage];

/** 거래 취소 주체 */
export const DealCancelledBy = {
  BUYER: 'buyer',
  SELLER: 'seller',
  MUTUAL: 'mutual',
  EXTERNAL: 'external', // 법적/외부 사유
} as const;
export type DealCancelledBy =
  (typeof DealCancelledBy)[keyof typeof DealCancelledBy];

/** 거래 대금 종류 */
export const DealPaymentKind = {
  PRE_CONTRACT: 'pre_contract',  // 가계약금
  CONTRACT: 'contract',          // 계약금 (본계약 시)
  INTERIM: 'interim',            // 중도금 (여러 차수 가능)
  BALANCE: 'balance',            // 잔금
  REFUND: 'refund',              // 환불 (파기 등)
} as const;
export type DealPaymentKind =
  (typeof DealPaymentKind)[keyof typeof DealPaymentKind];

/** 거래 대금 상태 */
export const DealPaymentStatus = {
  PENDING: 'pending',      // 예정
  PARTIAL: 'partial',      // 부분 입금
  PAID: 'paid',            // 완납
  OVERDUE: 'overdue',      // 연체
  CANCELLED: 'cancelled',  // 취소됨
} as const;
export type DealPaymentStatus =
  (typeof DealPaymentStatus)[keyof typeof DealPaymentStatus];

/** 거래 대금 지급 방식 */
export const DealPaymentMethod = {
  TRANSFER: 'transfer',
  CASH: 'cash',
  CHECK: 'check',
  OTHER: 'other',
} as const;
export type DealPaymentMethod =
  (typeof DealPaymentMethod)[keyof typeof DealPaymentMethod];

/** 계약 상태 */
export const ContractStatus = {
  DRAFT: 'draft',                // 작성 중
  SIGNED: 'signed',              // 서명 완료
  DEPOSIT_PAID: 'depositPaid',   // 계약금 납부
  BALANCE_PAID: 'balancePaid',   // 잔금 납부
  REGISTERED: 'registered',      // 등기 완료
  CANCELLED: 'cancelled',        // 취소
} as const;
export type ContractStatus =
  (typeof ContractStatus)[keyof typeof ContractStatus];

/** 태스크 소스 */
export const TaskSource = {
  MANUAL: 'manual',
  SYSTEM: 'system',
  AI: 'ai',
} as const;
export type TaskSource = (typeof TaskSource)[keyof typeof TaskSource];

/** 구독 플랜 */
export const SubscriptionPlan = {
  BASIC: 'basic',
  PRO: 'pro',
  PREMIUM: 'premium',
} as const;
export type SubscriptionPlan =
  (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

/** 캘린더 이벤트 유형 */
export const CalendarEventType = {
  VIEWING: 'viewing',       // 현장 방문/임장
  CONTRACT: 'contract',     // 계약 일정
  MEETING: 'meeting',       // 미팅/상담
  TASK: 'task',             // 할 일
  GENERAL: 'general',       // 일반
} as const;
export type CalendarEventType =
  (typeof CalendarEventType)[keyof typeof CalendarEventType];

/** 네트워크 인콰이어리 상태 */
export const NetworkInquiryStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
} as const;
export type NetworkInquiryStatus =
  (typeof NetworkInquiryStatus)[keyof typeof NetworkInquiryStatus];
