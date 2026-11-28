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

/** 연락처 주체 종류 (법적 권리주체: 개인 | 법인·단체) */
export const ContactKind = {
  PERSON: 'person',
  ORGANIZATION: 'organization',
} as const;
export type ContactKind = (typeof ContactKind)[keyof typeof ContactKind];

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  person: '개인',
  organization: '법인·단체',
};

/** 집단/소속 종류 (세대 | 법인 소속) */
export const PartyKind = {
  HOUSEHOLD: 'household',
  ORGANIZATION: 'organization',
} as const;
export type PartyKind = (typeof PartyKind)[keyof typeof PartyKind];

export const PARTY_KIND_LABELS: Record<PartyKind, string> = {
  household: '세대·가족',
  organization: '법인·소속',
};

/** 집단 멤버 상태 */
export const PartyMemberStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;
export type PartyMemberStatus =
  (typeof PartyMemberStatus)[keyof typeof PartyMemberStatus];

export const HOUSEHOLD_ROLE_PRESETS = [
  '남편',
  '아내',
  '아버지',
  '어머니',
  '아들',
  '딸',
  '할아버지',
  '할머니',
  '장인',
  '장모',
  '시아버지',
  '시어머니',
  '형제·자매',
] as const;

export const ORGANIZATION_ROLE_PRESETS = [
  '대표이사',
  '임원',
  '실무 담당자',
  '관리소장',
  '회계·정산',
] as const;

/** 임대차 내 임차인/거주자 역할 */
export const PropertyLeaseTenantRole = {
  TENANT: 'tenant',
  CO_TENANT: 'co_tenant',
  RESIDENT: 'resident',
} as const;
export type PropertyLeaseTenantRole =
  (typeof PropertyLeaseTenantRole)[keyof typeof PropertyLeaseTenantRole];

export const PROPERTY_LEASE_TENANT_ROLE_LABELS: Record<
  PropertyLeaseTenantRole,
  string
> = {
  tenant: '임차인',
  co_tenant: '공동임차인',
  resident: '실거주자',
};

/**
 * 매물의 거주 상태 — 지금 그 집에 누가 사는가. 의뢰를 받을 때 묻는 값이라 의뢰(ListingIntake)에 적는다.
 * 적지 않았으면 null(미확인)이다. "공실"과 "모름"은 중개사에게 정반대의 정보라 따로 둔다.
 */
export const OccupancyStatus = {
  // 이미 쌓인 자료(시드 포함)가 쓰는 값 그대로다
  OWNER: 'owner_occupied',
  TENANT: 'tenant',
  VACANT: 'vacant',
} as const;
export type OccupancyStatus = (typeof OccupancyStatus)[keyof typeof OccupancyStatus];

export const OCCUPANCY_STATUSES: readonly OccupancyStatus[] = [
  'owner_occupied',
  'tenant',
  'vacant',
];

export const OCCUPANCY_STATUS_LABELS: Record<OccupancyStatus, string> = {
  owner_occupied: '주인 거주',
  tenant: '세입자 거주',
  vacant: '공실',
};

/** 목록을 거를 때 "적지 않은 것"을 가리키는 값 */
export const OCCUPANCY_UNKNOWN = 'unknown';

/** 상담 조회 범위 */
export const ConsultationScope = {
  SELF: 'self',
  PARTY: 'party',
  CONTEXT: 'context',
} as const;
export type ConsultationScope =
  (typeof ConsultationScope)[keyof typeof ConsultationScope];

/** 그룹 넣기·빼기 한 번에 처리할 수 있는 연락처 수 */
export const CONTACT_GROUP_MEMBERS_MAX = 500;

/** 연락처 행에 표시하는 구분. 태그와 달리 희망조건·매물·세입·거래 데이터에서 자동으로 계산한다. */
export const CONTACT_ROLE_KEYS = [
  'buyer_sale',
  'buyer_rent',
  'owner',
  'tenant',
  'representative',
  'in_deal',
] as const;
export type ContactRoleKey = (typeof CONTACT_ROLE_KEYS)[number];

/** 연락처 목록의 자동 분류. 역할에 연락 상태와 정리 필요 항목을 더한다. */
export const CONTACT_CATEGORY_KEYS = [
  ...CONTACT_ROLE_KEYS,
  'follow_up',
  'recent_consult',
  'stale_consult',
  'no_consult',
  'uncategorized',
  'no_phone',
] as const;
export type ContactCategoryKey = (typeof CONTACT_CATEGORY_KEYS)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategoryKey, string> = {
  buyer_sale: '매수 희망',
  buyer_rent: '임차 희망',
  owner: '소유자',
  tenant: '세입자',
  representative: '대리인·법무·세무',
  in_deal: '거래 중',
  follow_up: '연락할 사람',
  recent_consult: '최근 30일 상담',
  stale_consult: '30일 넘게 연락 없음',
  no_consult: '상담 없음',
  uncategorized: '분류 없음',
  no_phone: '전화번호 없음',
};

/**
 * 연락처 태그의 색. 값은 색 이름이고 실제 색(글자 · 배경)은 화면이 정한다.
 * 새 태그에는 서버가 아직 덜 쓰인 색을 붙이고, 사용자가 나중에 바꿀 수 있다.
 */
export const CONTACT_TAG_COLORS = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const;
export type ContactTagColor = (typeof CONTACT_TAG_COLORS)[number];
export const CONTACT_TAG_COLOR_LABELS: Record<ContactTagColor, string> = {
  gray: '회색',
  brown: '갈색',
  orange: '주황',
  yellow: '노랑',
  green: '초록',
  blue: '파랑',
  purple: '보라',
  pink: '분홍',
  red: '빨강',
};
export const CONTACT_TAG_NAME_MAX_LENGTH = 30;

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

export const BUYER_INTAKE_CONTACT_ROLE_LABELS: Record<
  BuyerIntakeContactRole,
  string
> = {
  buyer: '매수인·임차인',
  co_buyer: '공동 당사자',
  representative: '대리인',
  supporter: '자금 지원',
  advisor: '조언·가족',
  other: '기타',
};

/**
 * 계약서 거래 유형 (Contract 단계).
 * Listing 의 3종에 더해 연세·교환·전대·권리양도·권리승계를 추가로 표현한다.
 * 매물 등록 UX 는 단순하게 두고, 계약서 작성 시점에만 확장 유형을 선택한다.
 * 마이스파이더 V2 의 화면상 거래유형과 1:1 매핑한다.
 * 연세는 매물/Deal 타입을 확장하지 않고 Contract 단계에서만 사용한다.
 */
export const ContractTransactionType = {
  SALE: 'sale',
  JEONSE: 'jeonse',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
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
  yearly: '연세',
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
  'house_lease_declaration',
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
 * ListingAdvertisement는 CP에서 실제로 관측하거나 직접 입력한 광고를 저장한다.
 * 동기화 상태(manual / synced / manual_override)는 컬럼으로 저장하지 않고
 * lastSyncedAt · manualEditedAt에서 계산한다. ended row도 실제 게재 이력으로 보존하고
 * endedAt은 예정일이 아닌 관측 종료 시각이다.
 */
export const ListingAdvertisementStatus = {
  ACTIVE: 'active',
  ENDED: 'ended',
} as const;
export type ListingAdvertisementStatus =
  (typeof ListingAdvertisementStatus)[keyof typeof ListingAdvertisementStatus];

/** 광고 동기화 상태 (저장하지 않고 lastSyncedAt · manualEditedAt에서 파생) */
export const AdvertisementSyncState = {
  MANUAL: 'manual',
  SYNCED: 'synced',
  MANUAL_OVERRIDE: 'manual_override',
} as const;
export type AdvertisementSyncState =
  (typeof AdvertisementSyncState)[keyof typeof AdvertisementSyncState];

/** 광고 변경 요청 액션 */
export const AdvertisementChangeAction = {
  PUBLISH: 'publish',
  UPDATE: 'update',
  READVERTISE: 'readvertise',
  TAKEDOWN: 'takedown',
} as const;
export type AdvertisementChangeAction =
  (typeof AdvertisementChangeAction)[keyof typeof AdvertisementChangeAction];

/** 광고 변경 요청 상태 */
export const AdvertisementChangeRequestStatus = {
  REQUESTED: 'requested',
  IN_PROGRESS: 'in_progress',
  EXECUTED: 'executed',
  VERIFIED: 'verified',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;
export type AdvertisementChangeRequestStatus =
  (typeof AdvertisementChangeRequestStatus)[keyof typeof AdvertisementChangeRequestStatus];

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
  EXTERNAL_DEAL_COMPLETED: 'external_deal_completed',
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
  /**
   * 고객 검토 — 방문은 마쳤고, 고객이 본 집들을 놓고 고민하는 동안.
   * 고객은 보통 여러 집을 보고 고르므로 이 기간이 며칠에서 몇 주 이어진다.
   * 임장(일정을 잡고 동행하는 일)과 하는 일이 달라 단계를 따로 둔다.
   */
  BUYER_REVIEWING: 'buyerReviewing',
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
  MatchStage.BUYER_REVIEWING,
  MatchStage.NEGOTIATING,
  MatchStage.DEAL_CREATED,
  MatchStage.CLOSED,
] as const;

/**
 * 매칭 종료 이유. 시스템이 자동 종료한 매칭만 거래 취소 시 되살리기 위해 구분한다.
 * - manual: 사용자가 직접 종료 (되살리지 않음)
 * - other_buyer_contracted: 같은 거래 조건에서 다른 손님과 본계약
 * - intake_closed: 의뢰 종료 (거래 완료·철회 등)
 * - deal_cancelled: 이 매칭에서 전환한 거래가 취소됨
 */
export const MatchClosedReason = {
  MANUAL: 'manual',
  OTHER_BUYER_CONTRACTED: 'other_buyer_contracted',
  INTAKE_CLOSED: 'intake_closed',
  /** 손님 쪽 희망 조건을 끝냈다(다른 곳에서 구함 등). INTAKE_CLOSED는 매물 의뢰 쪽이다. */
  BUYER_CLOSED: 'buyer_closed',
  DEAL_CANCELLED: 'deal_cancelled',
} as const;
export type MatchClosedReason =
  (typeof MatchClosedReason)[keyof typeof MatchClosedReason];

export const MATCH_CLOSED_REASON_LABELS: Record<MatchClosedReason, string> = {
  manual: '직접 종료',
  other_buyer_contracted: '다른 손님과 본계약',
  intake_closed: '매물 의뢰 종료',
  buyer_closed: '손님 조건 종료',
  deal_cancelled: '거래 취소',
};

/**
 * 통화 분석이 제안하는 업무 종류.
 * 받아쓰기 오류가 있을 수 있어 사람이 확인한 뒤 반영한다.
 */
export const CallSuggestionType = {
  TASK: 'task',
  CALENDAR_EVENT: 'calendar_event',
  BUYER_REQUIREMENT_CREATE: 'buyer_requirement_create',
  BUYER_REQUIREMENT_UPDATE: 'buyer_requirement_update',
  MATCH_CREATE: 'match_create',
  MATCH_STAGE: 'match_stage',
  LISTING_CONFIRM: 'listing_confirm',
} as const;
export type CallSuggestionType =
  (typeof CallSuggestionType)[keyof typeof CallSuggestionType];

export const CALL_SUGGESTION_TYPE_LABELS: Record<CallSuggestionType, string> = {
  task: '할 일',
  calendar_event: '일정',
  buyer_requirement_create: '고객 요청 추가',
  buyer_requirement_update: '고객 요청 변경',
  match_create: '매칭 추가',
  match_stage: '매칭 진행',
  listing_confirm: '매물 확인',
};

/** pending → (applying) → accepted, 또는 dismissed */
export const CallSuggestionStatus = {
  PENDING: 'pending',
  APPLYING: 'applying',
  ACCEPTED: 'accepted',
  DISMISSED: 'dismissed',
} as const;
export type CallSuggestionStatus =
  (typeof CallSuggestionStatus)[keyof typeof CallSuggestionStatus];

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

/** 끝난 거래 단계 — 잔금 완료 · 정산 종료 */
const ENDED_DEAL_STAGES: ReadonlySet<string> = new Set([DealStage.COMPLETED, DealStage.CLOSED]);

/**
 * 앞날의 일정이 "이미 끝난 거래의 일"인지 본다. 끝난(잔금 완료 · 정산 종료) 거래가 있고,
 * 그 일정이 **거래를 만들기 전에** 잡힌 것이어야 한다(거래 전환 전에 잡아 둔 임장이 날짜만 앞날로 남은 경우).
 * 그런 거래를 돌려준다(없으면 null).
 *
 * 기준 시각은 거래를 만든 시각(createdAt)이다. 바뀌지 않는 값이라 판정이 뒤집히지 않는다.
 * 단계가 바뀐 시각(stageChangedAt)은 쓰지 않는다 — 잔금 완료 뒤에 새로 잡은 약속이 정산 종료로 넘어가는 순간
 * "끝나기 전에 잡힌 일정"으로 바뀌어 다시 숨겨진다. 단계만 보고 판정하지도 않는다 — 고객 검토 · 협상 중의 재임장,
 * 거래 전환 뒤 잔금 전 집 확인, 거래가 끝난 뒤 새로 잡은 약속은 모두 유효한 일정이다.
 * 일정이나 거래의 시각을 모르면 끝난 일로 보지 않는다.
 */
export function findDealThatOutlivedEvent<
  T extends { stage: string; createdAt?: string | Date | null; isCancelled?: boolean | null },
>(eventCreatedAt: string | Date | null | undefined, deals: ReadonlyArray<T | null | undefined>): T | null {
  if (!eventCreatedAt) return null;
  const createdMs = new Date(eventCreatedAt).getTime();
  if (Number.isNaN(createdMs)) return null;
  for (const deal of deals) {
    if (!deal || deal.isCancelled || !deal.createdAt) continue;
    if (!ENDED_DEAL_STAGES.has(normalizeDealStage(deal.stage))) continue;
    const dealCreatedMs = new Date(deal.createdAt).getTime();
    if (!Number.isNaN(dealCreatedMs) && createdMs < dealCreatedMs) return deal;
  }
  return null;
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
