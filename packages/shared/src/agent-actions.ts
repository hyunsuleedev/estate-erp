/**
 * 사람이 승인한 뒤 외부 시스템에 적용되는 단일 부작용 계약.
 *
 * 첫 슬라이스는 광고 업무만 지원한다. capability를 임의 문자열 패치나
 * entityType/update JSON으로 확장하지 않고, 각 capability의 payload를
 * 코드로 검증한다.
 */
export const AgentActionCapability = {
  ADVERTISEMENT_TAKEDOWN: "advertisement.takedown",
  ADVERTISEMENT_TERMS_SET: "advertisement.terms.set",
} as const;
export type AgentActionCapability =
  (typeof AgentActionCapability)[keyof typeof AgentActionCapability];

export const AGENT_ACTION_CAPABILITIES = Object.values(
  AgentActionCapability,
) as AgentActionCapability[];

export const AgentActionRiskLevel = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;
export type AgentActionRiskLevel =
  (typeof AgentActionRiskLevel)[keyof typeof AgentActionRiskLevel];

export const AGENT_ACTION_RISK_LEVELS = Object.values(
  AgentActionRiskLevel,
) as AgentActionRiskLevel[];

export const AgentActionReviewStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  WITHDRAWN: "withdrawn",
  EXPIRED: "expired",
  STALE: "stale",
  SUPERSEDED: "superseded",
} as const;
export type AgentActionReviewStatus =
  (typeof AgentActionReviewStatus)[keyof typeof AgentActionReviewStatus];

export const AGENT_ACTION_REVIEW_STATUSES = Object.values(
  AgentActionReviewStatus,
) as AgentActionReviewStatus[];

export const AgentActionExecutionMode = {
  MANUAL: "manual",
  CONNECTOR: "connector",
} as const;
export type AgentActionExecutionMode =
  (typeof AgentActionExecutionMode)[keyof typeof AgentActionExecutionMode];

export const AgentActionExecutionStatus = {
  NOT_STARTED: "not_started",
  AWAITING_MANUAL: "awaiting_manual",
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  NEEDS_INPUT: "needs_input",
  CANCELLED: "cancelled",
} as const;
export type AgentActionExecutionStatus =
  (typeof AgentActionExecutionStatus)[keyof typeof AgentActionExecutionStatus];

export const AGENT_ACTION_EXECUTION_STATUSES = Object.values(
  AgentActionExecutionStatus,
) as AgentActionExecutionStatus[];

export const AgentActionVerificationStatus = {
  PENDING: "pending",
  MATCHED: "matched",
  MISMATCH: "mismatch",
  NOT_FOUND: "not_found",
  BLOCKED: "blocked",
  NOT_REQUIRED: "not_required",
} as const;
export type AgentActionVerificationStatus =
  (typeof AgentActionVerificationStatus)[keyof typeof AgentActionVerificationStatus];

export const AGENT_ACTION_VERIFICATION_STATUSES = Object.values(
  AgentActionVerificationStatus,
) as AgentActionVerificationStatus[];

export const AgentActionVerificationResult = {
  MATCHED: "matched",
  MISMATCH: "mismatch",
  NOT_FOUND: "not_found",
  BLOCKED: "blocked",
} as const;
export type AgentActionVerificationResult =
  (typeof AgentActionVerificationResult)[keyof typeof AgentActionVerificationResult];

export const AgentActionBlockerReason = {
  CAPTCHA: "captcha",
  MFA: "mfa",
  ACCOUNT_MISMATCH: "account_mismatch",
  TARGET_NOT_FOUND: "target_not_found",
  LAYOUT_MISMATCH: "layout_mismatch",
  PRECONDITION_MISMATCH: "precondition_mismatch",
  OUTCOME_UNKNOWN: "outcome_unknown",
  PROVIDER_WARNING: "provider_warning",
  OTHER: "other",
} as const;
export type AgentActionBlockerReason =
  (typeof AgentActionBlockerReason)[keyof typeof AgentActionBlockerReason];

export const AGENT_ACTION_BLOCKER_REASONS = Object.values(
  AgentActionBlockerReason,
) as AgentActionBlockerReason[];

export const NAVER_READER_SKILL_KEY = "naver-real-estate-reader";
export const ESILJANG_AD_MANAGER_SKILL_KEY = "esiljang-ad-manager";

export const AdvertisementTakedownReason = {
  DEAL_PROGRESS: "deal_progress",
  OWNER_REQUEST: "owner_request",
  DUPLICATE: "duplicate",
  STALE_LISTING: "stale_listing",
  OTHER: "other",
} as const;
export type AdvertisementTakedownReason =
  (typeof AdvertisementTakedownReason)[keyof typeof AdvertisementTakedownReason];

export interface AdvertisementTakedownPayload {
  schemaVersion: 1;
  listingAdvertisementId: string;
  channel: string;
  articleNo: string;
  desiredStatus: "ended";
  reasonCode: AdvertisementTakedownReason;
}

export interface AdvertisementTermsSetPayload {
  schemaVersion: 1;
  listingAdvertisementId: string;
  channel: string;
  articleNo: string;
  advertisedPrice: number | null;
  advertisedDeposit: number | null;
  advertisedMonthlyRent: number | null;
  /**
   * 가격 조건 저장 후 CP사의 "바로 재광고" 절차까지 수행할지 여부.
   * 외부 실행 전 반드시 AgentActionRequest의 정확한 payload로 승인된다.
   */
  republishAfterSave: boolean;
}

export type AgentActionPayload =
  | AdvertisementTakedownPayload
  | AdvertisementTermsSetPayload;
