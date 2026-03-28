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
  SELECTION: 'selection',
  DEPOSIT: 'deposit',
  CONTRACT: 'contract',
  COMPLETED: 'completed',
  CLOSED: 'closed',
} as const;
export type DealStage = (typeof DealStage)[keyof typeof DealStage];

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
