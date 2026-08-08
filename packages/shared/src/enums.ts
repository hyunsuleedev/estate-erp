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

/** 매물 거래 유형 (Listing 등록 단계) */
export const TransactionType = {
  SALE: 'sale',
  JEONSE: 'jeonse',
  MONTHLY: 'monthly',
} as const;
export type TransactionType =
  (typeof TransactionType)[keyof typeof TransactionType];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

/**
 * 연락처 사이에 저장할 수 있는 관계.
 *
 * relationType은 `relatedContactId`가 `contactId`에게 어떤 관계인지를 뜻한다.
 * 예: contactId=자녀, relatedContactId=어머니, relationType=parent.
 */
export const ContactRelationType = {
  PARENT: 'parent',
  SPOUSE: 'spouse',
  CHILD: 'child',
  SIBLING: 'sibling',
  LAWYER: 'lawyer',
  TAX_AGENT: 'tax_agent',
  OTHER: 'other',
} as const;
export type ContactRelationType =
  (typeof ContactRelationType)[keyof typeof ContactRelationType];

export const CONTACT_RELATION_TYPES = Object.values(ContactRelationType);

/** 구매 의뢰 안에서 Contact가 맡는 업무상 역할. 가족관계와는 별개다. */
export const BuyerIntakeContactRole = {
  BUYER: 'buyer',
  CO_BUYER: 'co_buyer',
  REPRESENTATIVE: 'representative',
  SUPPORTER: 'supporter',
  ADVISOR: 'advisor',
  OTHER: 'other',
} as const;
export type BuyerIntakeContactRole =
  (typeof BuyerIntakeContactRole)[keyof typeof BuyerIntakeContactRole];

export const BUYER_INTAKE_CONTACT_ROLES = Object.values(
  BuyerIntakeContactRole,
);

/** 반대쪽 Contact에서 조회할 때만 사용하는 파생 관계 유형. */
export type ContactRelationDisplayType = ContactRelationType | 'client';

export const CONTACT_RELATION_INVERSE_TYPES: Record<
  ContactRelationType,
  ContactRelationDisplayType
> = {
  parent: 'child',
  child: 'parent',
  spouse: 'spouse',
  sibling: 'sibling',
  lawyer: 'client',
  tax_agent: 'client',
  other: 'other',
};

export const CONTACT_RELATION_TYPE_LABELS: Record<
  ContactRelationDisplayType,
  string
> = {
  parent: '부모',
  spouse: '배우자',
  child: '자녀',
  sibling: '형제자매',
  lawyer: '법무사',
  tax_agent: '세무사',
  other: '기타',
  client: '의뢰인',
};

export function invertContactRelationType(
  relationType: string,
): ContactRelationDisplayType | string {
  return (
    CONTACT_RELATION_INVERSE_TYPES[
      relationType as ContactRelationType
    ] ?? relationType
  );
}

/**
 * 계약서 거래 유형 (Contract 단계).
 * Listing 의 3종에 더해 교환·전대·권리양도·권리승계를 추가로 표현한다.
 * 매물 등록 UX 는 단순하게 두고, 계약서 작성 시점에만 확장 유형을 선택한다.
 * 마이스파이더 V2 의 Tran_Clsf 01~07 과 1:1 매핑.
 */
export const ContractTransactionType = {
  SALE: 'sale',
  JEONSE: 'jeonse',
  MONTHLY: 'monthly',
  EXCHANGE: 'exchange',
  SUBLEASE: 'sublease',
  TRANSFER: 'transfer',
  SUCCESSION: 'succession',
} as const;
export type ContractTransactionType =
  (typeof ContractTransactionType)[keyof typeof ContractTransactionType];

export const CONTRACT_TRANSACTION_TYPE_LABELS: Record<
  ContractTransactionType,
  string
> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
  exchange: '교환',
  sublease: '전대',
  transfer: '권리양도',
  succession: '권리승계',
};

/**
 * 계약 문서 서식 코드 (레거시 Cntr_Clsf 33종 → 현행 template code 셋).
 * `ContractDocument.kind` 와 `ContractDocumentTemplate.code` 의 1차 지원 목록이며,
 * prisma/contract-template-catalog.ts 의 시드가 이 목록을 그대로 참조한다.
 * 서버는 명시적으로 전달된 kind 를 이 셋으로 검증한다 (오타 방지).
 * 구서식 3종(레거시 33 구판/39/40)은 마이그레이션 대상에서 제외 —
 * docs/desktop-prd/migration/documents-form-catalog.md §5 참조.
 */
export const CONTRACT_DOCUMENT_KINDS = [
  // ── 마이그레이션(20260502170000) 시드 30종 ──
  'base_contract',
  'purchase_right_contract',
  'union_member_right_contract',
  'commercial_premium_contract',
  'right_transfer_contract',
  'right_succession_contract',
  'standard_lease_contract',
  'commercial_standard_lease_contract',
  'house_lease_contract',
  'sublease_contract',
  'sublease_agreement',
  'identity',
  'broker_explanation',
  'broker_explanation_residential',
  'broker_explanation_non_residential',
  'broker_explanation_land',
  'broker_explanation_special',
  'registry_document',
  'real_estate_transaction_report',
  'real_estate_transaction_cancel_report',
  'house_transaction_report',
  'lease_declaration',
  'lease_change_declaration',
  'renewal_confirmation',
  'guarantee_non_enrollment_agreement',
  'guarantee_partial_enrollment_agreement',
  'jeonse_registration_not_requested',
  'cash_receipt_document',
  'privacy_agreement',
  'broker_fee_receipt',
  // ── 레거시 전수 카탈로그 갭 보강 9종 (documents-form-catalog.md §5.2) ──
  'exchange_contract',
  'private_rental_standard_lease_contract',
  'trade_agreement',
  'exclusive_brokerage_contract',
  'transaction_power_of_attorney',
  'house_funds_and_occupancy_plan',
  'fact_confirmation',
  'balance_settlement_sheet',
  'management_fee_settlement_sheet',
] as const;
export type ContractDocumentKind = (typeof CONTRACT_DOCUMENT_KINDS)[number];

/** kind 검증용 Set (서버 write-path 에서 사용) */
export const CONTRACT_DOCUMENT_KIND_SET: ReadonlySet<string> = new Set(
  CONTRACT_DOCUMENT_KINDS,
);

/** 사용자 공인중개사 자격 구분 (User.licenseType) */
export const UserLicenseType = {
  BROKER_OWNER: 'broker_owner', // 개업공인중개사
  BROKER_ASSOCIATE: 'broker_associate', // 소속공인중개사
  ASSISTANT: 'assistant', // 중개보조원
} as const;
export type UserLicenseType =
  (typeof UserLicenseType)[keyof typeof UserLicenseType];

export const USER_LICENSE_TYPE_LABELS: Record<UserLicenseType, string> = {
  broker_owner: '개업공인중개사',
  broker_associate: '소속공인중개사',
  assistant: '중개보조원',
};

/** 관리비 포함 항목 slug (Listing.maintenanceFeeIncludes) */
export const MaintenanceFeeInclude = {
  WATER: 'water',
  ELECTRICITY: 'electricity',
  GAS: 'gas',
  INTERNET: 'internet',
  TV: 'tv',
  CLEANING: 'cleaning',
  PARKING: 'parking',
  HEATING: 'heating',
} as const;
export type MaintenanceFeeInclude =
  (typeof MaintenanceFeeInclude)[keyof typeof MaintenanceFeeInclude];

export const MAINTENANCE_FEE_INCLUDE_LABELS: Record<
  MaintenanceFeeInclude,
  string
> = {
  water: '수도',
  electricity: '전기',
  gas: '가스',
  internet: '인터넷',
  tv: 'TV',
  cleaning: '청소',
  parking: '주차',
  heating: '난방',
};

/**
 * CP 광고 원장의 생명주기.
 *
 * ListingAdvertisement는 CP에서 실제로 관측한 광고만 저장한다. 사용자가
 * 요청한 광고 작업은 일반 Task가 나타내고, 세부 실행·재시도 상태는 로컬
 * Skill이 소유하므로 광고 row에는 active / ended만 존재한다.
 */
export const ListingAdvertisementStatus = {
  ACTIVE: 'active',
  ENDED: 'ended',
} as const;
export type ListingAdvertisementStatus =
  (typeof ListingAdvertisementStatus)[keyof typeof ListingAdvertisementStatus];

/** 광고 레코드 출처 (ListingAdvertisement.source) */
export const ListingAdvertisementSource = {
  MANUAL: 'manual',
  CP_SYNC: 'cp_sync',
} as const;
export type ListingAdvertisementSource =
  (typeof ListingAdvertisementSource)[keyof typeof ListingAdvertisementSource];

/** CP사 (ListingAdvertisement.channel) — 자주 쓰이는 CP 슬러그. 자유텍스트도 허용. */
export const ListingAdvertisementChannel = {
  ESILJANG: 'esiljang',
  BUDONGSANBANK: 'budongsanbank',
} as const;
export type ListingAdvertisementChannel =
  (typeof ListingAdvertisementChannel)[keyof typeof ListingAdvertisementChannel];

/**
 * 네이버 광고에 공개된 층 정보의 표현 방식.
 *
 * - exact: "12/25", "B1/5"처럼 실제 층을 공개
 * - band: "저/25", "중/25", "고/25"처럼 구간만 공개
 * - unknown: 값이 없거나 현재 파서가 확정할 수 없는 표현
 *
 * 내부 Unit.floor와는 별개의 외부 광고 관측값이다.
 */
export const OfficeAdvertisementFloorExposureMode = {
  EXACT: 'exact',
  BAND: 'band',
  UNKNOWN: 'unknown',
} as const;
export type OfficeAdvertisementFloorExposureMode =
  (typeof OfficeAdvertisementFloorExposureMode)[keyof typeof OfficeAdvertisementFloorExposureMode];

export function inferOfficeAdvertisementFloorExposureMode(
  floorInfo: string | null | undefined,
): OfficeAdvertisementFloorExposureMode {
  const value = floorInfo?.trim();
  if (!value) return OfficeAdvertisementFloorExposureMode.UNKNOWN;

  const floorToken = value.split('/')[0]?.trim().replace(/층$/u, '');
  if (!floorToken) return OfficeAdvertisementFloorExposureMode.UNKNOWN;
  if (/^(저|중|고)$/u.test(floorToken)) {
    return OfficeAdvertisementFloorExposureMode.BAND;
  }
  if (/^(?:-?\d+|B\d+|지하\s*\d+)$/iu.test(floorToken)) {
    return OfficeAdvertisementFloorExposureMode.EXACT;
  }
  return OfficeAdvertisementFloorExposureMode.UNKNOWN;
}

/**
 * 의뢰(ListingIntake / BuyerIntake)의 생명주기만 저장한다.
 *
 * - 확인 여부/신선도는 lastVerifiedAt, lastCheckResult, nextConfirmAt에서 파생
 * - Listing의 거래중/종료는 비취소 Deal에서 파생
 * - Listing 옵션 단위 중지는 Listing.isPaused가 소유
 */
export const IntakeLifecycleStatus = {
  OPEN: 'open',
  HOLD: 'hold',
  CLOSED: 'closed',
} as const;
export type IntakeLifecycleStatus =
  (typeof IntakeLifecycleStatus)[keyof typeof IntakeLifecycleStatus];

/** 닫히지 않은 의뢰 — DB partial unique index와 동일한 집합 */
export const NON_CLOSED_INTAKE_LIFECYCLE_STATUSES = [
  IntakeLifecycleStatus.OPEN,
  IntakeLifecycleStatus.HOLD,
] as const;

/** 의뢰 확인 시도의 구조화된 최신 결과 */
export const IntakeCheckResult = {
  ALIVE: 'alive',
  PRICE_CHANGED: 'price_changed',
  UNAVAILABLE: 'unavailable',
  NO_ANSWER: 'no_answer',
  PENDING: 'pending',
} as const;
export type IntakeCheckResult =
  (typeof IntakeCheckResult)[keyof typeof IntakeCheckResult];

/** 의뢰 종결 사유 — closed 생명주기일 때 필수 */
export const IntakeClosedReason = {
  WITHDRAWN: 'withdrawn',
  UNAVAILABLE: 'unavailable',
  DEAL_COMPLETED: 'deal_completed',
  SUPERSEDED: 'superseded',
  OTHER: 'other',
} as const;
export type IntakeClosedReason =
  (typeof IntakeClosedReason)[keyof typeof IntakeClosedReason];

/** 화면/API에서 확인 이력으로 계산하는 확인 상태 */
export const IntakeConfirmationState = {
  UNVERIFIED: 'unverified',
  VERIFIED: 'verified',
  OVERDUE: 'overdue',
  NO_ANSWER: 'no_answer',
} as const;
export type IntakeConfirmationState =
  (typeof IntakeConfirmationState)[keyof typeof IntakeConfirmationState];

/** Listing의 저장 컬럼이 아닌 표시/필터용 파생 가용 상태 */
export const ListingAvailability = {
  AVAILABLE: 'available',
  PAUSED: 'paused',
  IN_CONTRACT: 'in_contract',
  CLOSED: 'closed',
} as const;
export type ListingAvailability =
  (typeof ListingAvailability)[keyof typeof ListingAvailability];

/** Listing을 현재 거래 진행 중으로 표시하는 활성 Deal 단계 */
export const IN_CONTRACT_DEAL_STAGES = [
  'preparing',
  'preContract',
  'contracted',
  'settling',
] as const;

/** Listing의 거래를 종결짓는 Deal 단계 */
export const DONE_DEAL_STAGES = ['completed', 'closed'] as const;

/** Listing을 점유하는 모든 Deal 단계 — 진행 중 + 종결 */
export const OCCUPYING_DEAL_STAGES = [
  ...IN_CONTRACT_DEAL_STAGES,
  'completed',
  'closed',
] as const;

/** 매칭 파이프라인 스테이지 */
export const MatchStage = {
  SUGGESTED: 'suggested',
  BUYER_INTERESTED: 'buyerInterested',
  VIEWING_CONFIRMED: 'viewingConfirmed',
  VIEWING: 'viewing',
  NEGOTIATING: 'negotiating',
  DEAL_CREATED: 'dealCreated',
  CLOSED: 'closed',
} as const;
export type MatchStage = (typeof MatchStage)[keyof typeof MatchStage];

/** 화면·서버·MCP가 공유하는 매칭 단계 순서 */
export const MATCH_STAGE_ORDER = [
  MatchStage.SUGGESTED,
  MatchStage.BUYER_INTERESTED,
  MatchStage.VIEWING_CONFIRMED,
  MatchStage.VIEWING,
  MatchStage.NEGOTIATING,
  MatchStage.DEAL_CREATED,
  MatchStage.CLOSED,
] as const;

/** 2026-08 파이프라인 개편 이전 저장값 — 마이그레이션 중 읽기 호환용 */
export const LEGACY_MATCH_STAGE_VALUES = [
  'buyerContacted',
  'ownerContacted',
] as const;
export type LegacyMatchStage = (typeof LEGACY_MATCH_STAGE_VALUES)[number];

export function normalizeMatchStage(stage: string): string {
  if (stage === 'buyerContacted') return MatchStage.BUYER_INTERESTED;
  if (stage === 'ownerContacted') return MatchStage.VIEWING_CONFIRMED;
  return stage;
}

/** 거래 파이프라인 스테이지 */
export const DealStage = {
  PREPARING: 'preparing', // 최종 조건/당사자/계약 일정·서류 준비
  PRE_CONTRACT: 'preContract', // 가계약금 수령 (Contract 없음)
  CONTRACTED: 'contracted', // 본계약 진행 (이 단계에서 Contract 작성)
  SETTLING: 'settling', // 중도금/잔금 진행
  COMPLETED: 'completed', // 잔금 완료 + 등기이전
  CLOSED: 'closed', // 수수료 정산까지 종료
} as const;
export type DealStage = (typeof DealStage)[keyof typeof DealStage];

/** 화면·서버·MCP가 공유하는 거래 단계 순서. 가계약은 선택 단계다. */
export const DEAL_STAGE_ORDER = [
  DealStage.PREPARING,
  DealStage.PRE_CONTRACT,
  DealStage.CONTRACTED,
  DealStage.SETTLING,
  DealStage.COMPLETED,
  DealStage.CLOSED,
] as const;

/** 2026-08 거래 경계 개편 이전 저장값 — 마이그레이션 중 읽기 호환용 */
export const LEGACY_DEAL_STAGE_VALUES = ['selection', 'negotiating'] as const;
export type LegacyDealStage = (typeof LEGACY_DEAL_STAGE_VALUES)[number];

export function normalizeDealStage(stage: string): string {
  if (stage === 'selection' || stage === 'negotiating') {
    return DealStage.PREPARING;
  }
  return stage;
}

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
  PRE_CONTRACT: 'pre_contract', // 가계약금
  CONTRACT: 'contract', // 계약금 (본계약 시)
  INTERIM: 'interim', // 중도금 (여러 차수 가능)
  BALANCE: 'balance', // 잔금
  REFUND: 'refund', // 환불 (파기 등)
} as const;
export type DealPaymentKind =
  (typeof DealPaymentKind)[keyof typeof DealPaymentKind];

/** 거래 대금 상태 */
export const DealPaymentStatus = {
  PENDING: 'pending', // 예정
  PARTIAL: 'partial', // 부분 입금
  PAID: 'paid', // 완납
  OVERDUE: 'overdue', // 연체
  CANCELLED: 'cancelled', // 취소됨
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

/** 수수료 청구 대상 (법적 청구 측) */
export const CommissionClientSide = {
  SELLER: 'seller',
  BUYER: 'buyer',
} as const;
export type CommissionClientSide =
  (typeof CommissionClientSide)[keyof typeof CommissionClientSide];

/** 수수료 수금 주체 */
export const CommissionCollectedBy = {
  US: 'us', // 우리 사무소가 수금
  PARTNER: 'partner', // 파트너 사무소가 수금, 우리는 분배로만 몫 수취
} as const;
export type CommissionCollectedBy =
  (typeof CommissionCollectedBy)[keyof typeof CommissionCollectedBy];

/** 수수료 청구 상태 */
export const CommissionPaymentStatus = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  COLLECTED: 'collected',
  OVERDUE: 'overdue',
  WAIVED: 'waived',
  CANCELLED: 'cancelled',
} as const;
export type CommissionPaymentStatus =
  (typeof CommissionPaymentStatus)[keyof typeof CommissionPaymentStatus];

/** 수수료 분배 수취 주체 */
export const CommissionRecipientType = {
  OUR_OFFICE: 'our_office',
  PARTNER_BROKER: 'partner_broker',
} as const;
export type CommissionRecipientType =
  (typeof CommissionRecipientType)[keyof typeof CommissionRecipientType];

/** 수수료 분배 정산 상태 */
export const CommissionDistributionStatus = {
  PENDING: 'pending',
  SETTLED: 'settled',
} as const;
export type CommissionDistributionStatus =
  (typeof CommissionDistributionStatus)[keyof typeof CommissionDistributionStatus];

/** 수수료 조정 유형 */
export const CommissionAdjustmentType = {
  DISCOUNT: 'discount', // 고객과 할인 합의
  WAIVE: 'waive', // 면제(서비스)
  BAD_DEBT: 'bad_debt', // 대손 처리
} as const;
export type CommissionAdjustmentType =
  (typeof CommissionAdjustmentType)[keyof typeof CommissionAdjustmentType];

/** 수수료 조정 승인 상태 */
export const CommissionAdjustmentStatus = {
  REQUESTED: 'requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
export type CommissionAdjustmentStatus =
  (typeof CommissionAdjustmentStatus)[keyof typeof CommissionAdjustmentStatus];

/** 계약 상태 */
export const ContractStatus = {
  DRAFT: 'draft', // 작성 중
  SIGNED: 'signed', // 서명 완료
  DEPOSIT_PAID: 'depositPaid', // 계약금 납부
  BALANCE_PAID: 'balancePaid', // 잔금 납부
  REGISTERED: 'registered', // 등기 완료
  CANCELLED: 'cancelled', // 취소
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
  VIEWING: 'viewing', // 현장 방문/임장
  CONTRACT: 'contract', // 계약 일정
  MEETING: 'meeting', // 미팅/상담
  TASK: 'task', // 할 일
  GENERAL: 'general', // 일반
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

/** 협력업체 서비스 카테고리 (slug). DATA_STRUCTURE.md 14장의 대분류 11개. */
export const ServiceCategory = {
  PLUMBING: 'plumbing', // 배관/수도
  HEATING: 'heating', // 보일러/난방
  ELECTRICAL: 'electrical', // 전기/조명
  WALLPAPER: 'wallpaper', // 도배/장판
  WATERPROOF: 'waterproof', // 방수/방충
  TILE_BATH: 'tile_bath', // 타일/욕실
  LOCK_SECURITY: 'lock_security', // 잠금/보안
  CLEANING: 'cleaning', // 청소
  INTERIOR: 'interior', // 인테리어
  MOVING: 'moving', // 이사
  PROFESSIONAL: 'professional', // 법무사/세무사/감정평가사 등
} as const;
export type ServiceCategory =
  (typeof ServiceCategory)[keyof typeof ServiceCategory];

/** 카테고리 slug → 한글 라벨. UI 표시 + 필터 매핑에 사용. */
export const SERVICE_CATEGORY_LABEL: Record<ServiceCategory, string> = {
  plumbing: '배관/수도',
  heating: '보일러/난방',
  electrical: '전기/조명',
  wallpaper: '도배/장판',
  waterproof: '방수/방충',
  tile_bath: '타일/욕실',
  lock_security: '잠금/보안',
  cleaning: '청소',
  interior: '인테리어',
  moving: '이사',
  professional: '전문가',
};

/** 카테고리 표시 순서 (UI 드롭다운에 이 순서로 출력). */
export const SERVICE_CATEGORY_ORDER: ServiceCategory[] = [
  'plumbing',
  'heating',
  'electrical',
  'wallpaper',
  'waterproof',
  'tile_bath',
  'lock_security',
  'cleaning',
  'interior',
  'moving',
  'professional',
];

/** 협력업체 광고 티어. */
export const VendorAdTier = {
  NONE: 'none',
  BASIC: 'basic',
  PREMIUM: 'premium',
} as const;
export type VendorAdTier = (typeof VendorAdTier)[keyof typeof VendorAdTier];

/** 협력업체 사업자 유형. */
export const VendorBusinessType = {
  INDIVIDUAL: 'individual', // 개인 (무등록)
  SOLE_PROPRIETOR: 'sole_proprietor', // 개인사업자
  CORPORATE: 'corporate', // 법인
} as const;
export type VendorBusinessType =
  (typeof VendorBusinessType)[keyof typeof VendorBusinessType];
