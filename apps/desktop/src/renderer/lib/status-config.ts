/**
 * 전 파이프라인 상태 라벨 + 컬러 단일 소스.
 * DESIGN_SPEC.md 3장(컬러 매핑표)과 9장(라벨 사전)의 코드화 — 페이지에서 직접 컬러/라벨 정의 금지.
 *
 * 사용: <StatusBadge kind="dealStage" status={deal.stage} /> 또는 getStatusMeta('dealStage', deal.stage)
 */

export type Tone =
  | 'gray'
  | 'success'
  | 'warning'
  | 'info'
  | 'violet'
  | 'pink'
  | 'orange'
  | 'destructive'
  | 'neutral';

export type StatusKind =
  | 'confirmationState'
  | 'intakeLifecycle'
  | 'listingAvailability'
  | 'matchStage'
  | 'dealStage'
  | 'contractStatus'
  | 'commissionStatus'
  | 'dealPaymentStatus'
  | 'taskStatus'
  | 'adStatus'
  | 'transactionType'
  | 'buyerStatus'
  | 'buyerUrgency';

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** 특정 도메인에서 공유하는 고정 팔레트. 없으면 tone의 기본 팔레트를 사용한다. */
  className?: string;
}

export type BuyerStatus = 'active' | 'hold' | 'completed';

/**
 * 구매 의뢰 상태는 가동 여부만 나타낸다.
 * matched/inactive는 이전 버전 데이터의 호환을 위해 각각 active/hold로 읽는다.
 */
export function normalizeBuyerStatus(
  value: string | null | undefined,
): BuyerStatus | null {
  if (value === 'active' || value === 'matched') return 'active';
  if (value === 'hold' || value === 'inactive') return 'hold';
  if (value === 'completed') return 'completed';
  return null;
}

export const STATUS_CONFIG: Record<StatusKind, Record<string, StatusMeta>> = {
  /** ListingIntake 확인 이력에서 파생한 상태 */
  confirmationState: {
    unverified: { label: '미확인', tone: 'gray' },
    verified: { label: '확인완료', tone: 'success' },
    overdue: { label: '재확인 필요', tone: 'destructive' },
    no_answer: { label: '부재중', tone: 'orange' },
  },
  /** ListingIntake.lifecycleStatus — 의뢰 생명주기 */
  intakeLifecycle: {
    open: { label: '진행중', tone: 'success' },
    hold: { label: '보류', tone: 'warning' },
    closed: { label: '종료', tone: 'neutral' },
  },
  /** Listing의 Deal·의뢰·옵션 중지를 합성한 가용 상태 */
  listingAvailability: {
    available: { label: '활성', tone: 'success' },
    paused: { label: '보류', tone: 'warning' },
    in_contract: { label: '거래중', tone: 'info' },
    closed: { label: '종료', tone: 'neutral' },
  },
  /** Match.stage — 매칭 파이프라인 */
  matchStage: {
    suggested: { label: '내부 후보', tone: 'gray' },
    buyerInterested: { label: '고객 관심', tone: 'info' },
    viewingConfirmed: { label: '임장 가능 확인', tone: 'orange' },
    viewing: { label: '임장', tone: 'violet' },
    negotiating: { label: '협상', tone: 'warning' },
    dealCreated: { label: '거래전환', tone: 'success' },
    closed: { label: '종료', tone: 'destructive' },
    // 마이그레이션 전 데이터의 표시 호환
    buyerContacted: { label: '고객 관심', tone: 'info' },
    ownerContacted: { label: '임장 가능 확인', tone: 'orange' },
  },
  /** Deal.stage — 거래 파이프라인 */
  dealStage: {
    preparing: { label: '계약 준비', tone: 'gray' },
    preContract: { label: '가계약', tone: 'violet' },
    contracted: { label: '본계약', tone: 'info' },
    settling: { label: '중도금/잔금', tone: 'orange' },
    completed: { label: '잔금완료', tone: 'success' },
    closed: { label: '정산종료', tone: 'neutral' },
    // 거래 경계 개편 전 데이터의 표시 호환
    selection: { label: '계약 준비', tone: 'gray' },
    negotiating: { label: '계약 준비', tone: 'gray' },
  },
  /** Contract.status — 계약 상태 */
  contractStatus: {
    draft: { label: '작성중', tone: 'gray' },
    signed: { label: '서명완료', tone: 'info' },
    depositPaid: { label: '계약금 완료', tone: 'violet' },
    balancePaid: { label: '잔금 완료', tone: 'success' },
    registered: { label: '등기 완료', tone: 'neutral' },
    cancelled: { label: '취소', tone: 'destructive' },
  },
  /** CommissionPayment.status — 수수료 수금 상태 */
  commissionStatus: {
    draft: { label: '작성중', tone: 'gray' },
    pending: { label: '수금대기', tone: 'warning' },
    partial: { label: '부분수금', tone: 'orange' },
    collected: { label: '수금완료', tone: 'success' },
    overdue: { label: '연체', tone: 'destructive' },
    waived: { label: '면제', tone: 'gray' },
    cancelled: { label: '취소', tone: 'gray' },
  },
  /** DealPayment.status — 거래 대금 상태 */
  dealPaymentStatus: {
    pending: { label: '예정', tone: 'warning' },
    partial: { label: '부분입금', tone: 'orange' },
    paid: { label: '완납', tone: 'success' },
    overdue: { label: '연체', tone: 'destructive' },
    cancelled: { label: '취소', tone: 'gray' },
  },
  /** Task.status — 업무 상태 */
  taskStatus: {
    pending: { label: '대기', tone: 'gray' },
    in_progress: { label: '진행중', tone: 'info' },
    completed: { label: '완료', tone: 'success' },
    cancelled: { label: '취소', tone: 'gray' },
  },
  /** ListingAdvertisement.status — 실제 CP 광고 생명주기 */
  adStatus: {
    active: { label: '게재중', tone: 'success' },
    ended: { label: '종료', tone: 'neutral' },
  },
  /** 거래유형 — 라벨/컬러 전 페이지 통일 */
  transactionType: {
    sale: {
      label: '매매',
      tone: 'pink',
      className: 'bg-[#fdebec] text-[#8f4b46]',
    },
    jeonse: {
      label: '전세',
      tone: 'info',
      className: 'bg-[#e7f3f8] text-[#337ea9]',
    },
    monthly: {
      label: '월세',
      tone: 'warning',
      className: 'bg-[#fbf3db] text-[#8f6b1f]',
    },
  },
  /** BuyerRequirement.status — 구매고객 상태 */
  buyerStatus: {
    active: { label: '활성', tone: 'success' },
    hold: { label: '보류', tone: 'warning' },
    completed: { label: '완료', tone: 'neutral' },
  },
  /** BuyerRequirement.urgency — 긴급도 */
  buyerUrgency: {
    urgent: { label: '급함', tone: 'destructive' },
    normal: { label: '보통', tone: 'gray' },
    flexible: { label: '여유', tone: 'info' },
  },
};

/**
 * 파이프라인 단계 순서 (PipelineSteps용). 취소/예외 상태는 포함하지 않는다.
 */
export const PIPELINE_STEPS: Partial<Record<StatusKind, string[]>> = {
  confirmationState: ['unverified', 'no_answer', 'overdue', 'verified'],
  intakeLifecycle: ['open', 'hold', 'closed'],
  listingAvailability: ['available', 'paused', 'in_contract', 'closed'],
  matchStage: [
    'suggested',
    'buyerInterested',
    'viewingConfirmed',
    'viewing',
    'negotiating',
    'dealCreated',
    'closed',
  ],
  dealStage: [
    'preparing',
    'preContract',
    'contracted',
    'settling',
    'completed',
    'closed',
  ],
  contractStatus: ['draft', 'signed', 'depositPaid', 'balancePaid', 'registered'],
};

/**
 * 상태 메타 조회. 미정의 값은 gray + 원문 라벨로 fallback (절대 throw 하지 않음).
 */
export function getStatusMeta(kind: StatusKind, value: string | null | undefined): StatusMeta {
  if (!value) return { label: '—', tone: 'gray' };
  const normalizedValue = kind === 'buyerStatus' ? normalizeBuyerStatus(value) ?? value : value;
  return STATUS_CONFIG[kind]?.[normalizedValue] ?? { label: value, tone: 'gray' };
}
