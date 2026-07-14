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

/** 내 사무소의 광고 게재 상태 (ListingAdvertisement.status) */
export const ListingAdvertisementStatus = {
  PLANNED: 'planned',
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  ENDED: 'ended',
  ERROR: 'error',
} as const;
export type ListingAdvertisementStatus =
  (typeof ListingAdvertisementStatus)[keyof typeof ListingAdvertisementStatus];

/** 광고 레코드 출처 (ListingAdvertisement.source) */
export const ListingAdvertisementSource = {
  MANUAL: 'manual',
  EXTERNAL_OBSERVED: 'external_observed',
  CP_SYNC: 'cp_sync',
} as const;
export type ListingAdvertisementSource =
  (typeof ListingAdvertisementSource)[keyof typeof ListingAdvertisementSource];

/** 광고 채널 (ListingAdvertisement.channel) — 자주 쓰이는 채널 슬러그. 자유텍스트도 허용. */
export const ListingAdvertisementChannel = {
  NAVER: 'naver',
  ASIL: 'asil',
  ZIGBANG: 'zigbang',
  DABANG: 'dabang',
  HANBANG: 'hanbang',
  ETC: 'etc',
} as const;
export type ListingAdvertisementChannel =
  (typeof ListingAdvertisementChannel)[keyof typeof ListingAdvertisementChannel];

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

/** 수수료 청구 대상 (법적 청구 측) */
export const CommissionClientSide = {
  SELLER: 'seller',
  BUYER: 'buyer',
} as const;
export type CommissionClientSide =
  (typeof CommissionClientSide)[keyof typeof CommissionClientSide];

/** 수수료 수금 주체 */
export const CommissionCollectedBy = {
  US: 'us',           // 우리 사무소가 수금
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
  DISCOUNT: 'discount',   // 고객과 할인 합의
  WAIVE: 'waive',         // 면제(서비스)
  BAD_DEBT: 'bad_debt',   // 대손 처리
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
