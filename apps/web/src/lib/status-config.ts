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
    available: { label: '가용', tone: 'success' },
    paused: { label: '보류', tone: 'warning' },
    in_contract: { label: '거래중', tone: 'info' },
    closed: { label: '종료', tone: 'neutral' },
  },
  /** Match.stage — 매칭 파이프라인 */
  matchStage: {
    suggested: { label: '제안', tone: 'gray' },
    buyerContacted: { label: '고객연락', tone: 'info' },
    viewing: { label: '임장', tone: 'violet' },
    ownerContacted: { label: '집주인연락', tone: 'info' },
    negotiating: { label: '협상', tone: 'warning' },
    dealCreated: { label: '거래전환', tone: 'success' },
    closed: { label: '종료', tone: 'neutral' },
  },
  /** Deal.stage — 거래 파이프라인 */
  dealStage: {
    selection: { label: '검토', tone: 'gray' },
    negotiating: { label: '협상', tone: 'warning' },
    preContract: { label: '가계약', tone: 'violet' },
    contracted: { label: '계약', tone: 'info' },
    settling: { label: '중도금/잔금', tone: 'orange' },
    completed: { label: '잔금완료', tone: 'success' },
    closed: { label: '정산종료', tone: 'neutral' },
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
    sale: { label: '매매', tone: 'info' },
    jeonse: { label: '전세', tone: 'success' },
    monthly: { label: '월세', tone: 'orange' },
  },
  /** BuyerRequirement.status — 구매고객 상태 */
  buyerStatus: {
    active: { label: '활성', tone: 'success' },
    matched: { label: '매칭됨', tone: 'info' },
    completed: { label: '완료', tone: 'neutral' },
    inactive: { label: '비활성', tone: 'gray' },
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
    'buyerContacted',
    'viewing',
    'ownerContacted',
    'negotiating',
    'dealCreated',
    'closed',
  ],
  dealStage: [
    'selection',
    'negotiating',
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
  return STATUS_CONFIG[kind]?.[value] ?? { label: value, tone: 'gray' };
}
