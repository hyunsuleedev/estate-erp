/**
 * contracts 라우트 공용 유틸/소형 컴포넌트.
 * 페이지(index)와 문서 편집기(-document-editor)에서 공유한다.
 */
import type {
  Contract,
  ContractDocument,
  ContractDocumentTemplate,
  Deal,
} from '@estate-erp/api-client';
import {
  CONTRACT_TRANSACTION_TYPE_LABELS,
  isContractRichTextHtml,
} from '@estate-erp/shared';
import { StatusBadge } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CONTRACT_RICH_TEXT_VIEW_CLASS,
  sanitizeContractHtml,
} from '@/lib/contract-rich-text';
import { STATUS_CONFIG, getStatusMeta } from '@/lib/status-config';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** 계약서 거래 유형 (shared ContractTransactionType 전종, 라벨은 shared 단일 소스) */
export const CONTRACT_TRANSACTION_TYPES: Array<{ value: string; label: string }> =
  Object.entries(CONTRACT_TRANSACTION_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

const CONTRACT_TRANSACTION_TYPE_SET = new Set(
  CONTRACT_TRANSACTION_TYPES.map((type) => type.value),
);

/** StatusBadge(kind=transactionType)가 커버하는 매물/Deal 기본 거래유형 */
const DEAL_TRANSACTION_TYPES = new Set(['sale', 'jeonse', 'monthly']);

/** 문서관리 기본 필터에 노출하는 부동산 계약 거래유형 */
const BASE_TRANSACTION_TYPES = new Set(['sale', 'jeonse', 'monthly', 'yearly']);

/**
 * 목록 필터바용 기본 거래유형 4종.
 * 계약서 확장 유형(교환/전대/양도/승계)은 필터 대상에서 제외한다.
 */
export const BASE_CONTRACT_TRANSACTION_TYPES: Array<{ value: string; label: string }> =
  CONTRACT_TRANSACTION_TYPES.filter((type) => BASE_TRANSACTION_TYPES.has(type.value));

/** 계약 상태 옵션 — 라벨은 status-config(STATUS_CONFIG.contractStatus) 단일 소스 */
export const CONTRACT_STATUS_OPTIONS: Array<{ value: string; label: string }> =
  Object.entries(STATUS_CONFIG.contractStatus).map(([value, meta]) => ({
    value,
    label: meta.label,
  }));

/** signed 이상으로 취급하는 상태 (검증/표시용) */
export const SIGNED_OR_LATER = new Set([
  'signed',
  'depositPaid',
  'balancePaid',
  'registered',
]);

/** 상태 전이 순서 (cancelled 제외) */
export const CONTRACT_STATUS_FLOW = [
  'draft',
  'signed',
  'depositPaid',
  'balancePaid',
  'registered',
];

/** 다음 단계 상태 (registered/cancelled 등 마지막이면 null) */
export function getNextContractStatus(status: string): string | null {
  const index = CONTRACT_STATUS_FLOW.indexOf(status);
  if (index < 0 || index >= CONTRACT_STATUS_FLOW.length - 1) return null;
  return CONTRACT_STATUS_FLOW[index + 1];
}

export function getContractStatusLabel(status: string): string {
  return getStatusMeta('contractStatus', status).label;
}

/** DealPayment.kind 라벨 (shared enums에 라벨 상수가 없어 로컬 정의) */
export const DEAL_PAYMENT_KIND_LABELS: Record<string, string> = {
  pre_contract: '가계약금',
  contract: '계약금',
  interim: '중도금',
  balance: '잔금',
  refund: '환불',
};

export const documentStatusMeta: Record<string, { label: string; className: string }> = {
  draft: { label: '초안', className: 'bg-muted text-muted-foreground' },
  generated: { label: '작성됨', className: 'bg-info-soft text-info' },
  signed: { label: '서명완료', className: 'bg-success-soft text-success' },
  submitted: { label: '제출완료', className: 'bg-violet-soft text-violet' },
  archived: { label: '보관', className: 'bg-neutral-soft text-neutral-strong' },
  cancelled: { label: '취소', className: 'bg-destructive-soft text-destructive' },
};

export const documentCategoryLabels: Record<string, string> = {
  agreement: '동의서',
  attachment: '첨부',
  confirmation: '확인서',
  contract: '계약서',
  explanation: '확인설명',
  guarantee: '보증',
  identity: '신분',
  receipt: '영수증',
  report: '신고',
  power_of_attorney: '위임장',
  brokerage: '중개계약',
  settlement: '정산서',
};

/**
 * 거래신고 상태 롤업 (레거시 TRAN_REPT_CLSF) — category=report 문서의 최상위
 * status. 'none' = 신고 문서 없음.
 */
export const transactionReportStatusMeta: Record<
  string,
  { label: string; className: string }
> = {
  none: { label: '신고없음', className: 'bg-muted text-muted-foreground' },
  draft: { label: '신고예정', className: 'bg-warning-soft text-warning' },
  generated: { label: '신고예정', className: 'bg-warning-soft text-warning' },
  signed: { label: '신고예정', className: 'bg-warning-soft text-warning' },
  submitted: { label: '신고완료', className: 'bg-success-soft text-success' },
  archived: { label: '신고보관', className: 'bg-neutral-soft text-neutral-strong' },
  cancelled: { label: '신고취소', className: 'bg-destructive-soft text-destructive' },
};

// ---------------------------------------------------------------------------
// 거래유형 뱃지 — 기본 4종은 StatusBadge, 계약 전용 확장 유형은 shared 라벨 뱃지
// ---------------------------------------------------------------------------

export function ContractTransactionTypeBadge({
  type,
  className,
}: {
  type: string | null | undefined;
  className?: string;
}) {
  if (!type) return null;
  if (DEAL_TRANSACTION_TYPES.has(type)) {
    return <StatusBadge kind="transactionType" status={type} className={className} />;
  }
  return (
    <Badge
      variant="outline"
      className={cn('bg-neutral-soft text-neutral-strong border-0 text-xs font-medium', className)}
    >
      {CONTRACT_TRANSACTION_TYPE_LABELS[
        type as keyof typeof CONTRACT_TRANSACTION_TYPE_LABELS
      ] ?? type}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// 매물 정보 접근자 — 서버 /contracts 응답은 deal.property가 합성되지 않으므로
// deal.listing.property 폴백이 반드시 필요하다 (감사 갭 #1).
// ---------------------------------------------------------------------------

export function getContractProperty(deal: Deal | null | undefined) {
  return deal?.property ?? deal?.listing?.property ?? null;
}

/** "래미안고덕 101동 1503호" (placeholder 동은 생략) */
export function getContractPropertyLabel(deal: Deal | null | undefined): string {
  const property = getContractProperty(deal);
  if (!property) return '';
  const dong = property.unit?.dong;
  return [
    property.site?.name,
    dong && !dong.isPlaceholder ? dong.name : null,
    property.unit?.name,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Deal의 거래유형을 계약서 거래유형으로 변환 (미지원 유형은 sale 폴백) */
export function toContractTransactionType(deal: Deal | null | undefined): string {
  const dealType = deal?.transactionType ?? deal?.listing?.transactionType;
  if (dealType && CONTRACT_TRANSACTION_TYPE_SET.has(dealType)) return dealType;
  return 'sale';
}

// ---------------------------------------------------------------------------
// 폼 타입/변환
// ---------------------------------------------------------------------------

export type ContractForm = {
  transactionType: string;
  status: string;
  totalPrice: string;
  monthlyRent: string;
  contractDate: string;
  /** 계약서 상 계약금 (명목) */
  statedDeposit: string;
  /** 계약서 상 중도금 (명목) */
  statedInterimPayment: string;
  statedInterimDate: string;
  /** 계약서 상 잔금 (명목) */
  statedBalance: string;
  statedBalanceDate: string;
  moveInDate: string;
  leaseStartDate: string;
  leaseEndDate: string;
  specialTerms: string;
  memo: string;
  attachmentsText: string;
};

export function emptyContractForm(): ContractForm {
  return {
    transactionType: 'sale',
    status: 'draft',
    totalPrice: '',
    monthlyRent: '',
    contractDate: '',
    statedDeposit: '',
    statedInterimPayment: '',
    statedInterimDate: '',
    statedBalance: '',
    statedBalanceDate: '',
    moveInDate: '',
    leaseStartDate: '',
    leaseEndDate: '',
    specialTerms: '',
    memo: '',
    attachmentsText: '',
  };
}

export function toContractForm(contract: Contract): ContractForm {
  return {
    transactionType: contract.transactionType,
    status: contract.status,
    totalPrice: contract.totalPrice ? String(contract.totalPrice) : '',
    monthlyRent: contract.monthlyRent ? String(contract.monthlyRent) : '',
    contractDate: toDateInput(contract.contractDate),
    statedDeposit: contract.statedDeposit ? String(contract.statedDeposit) : '',
    statedInterimPayment: contract.statedInterimPayment
      ? String(contract.statedInterimPayment)
      : '',
    statedInterimDate: toDateInput(contract.statedInterimDate),
    statedBalance: contract.statedBalance ? String(contract.statedBalance) : '',
    statedBalanceDate: toDateInput(contract.statedBalanceDate),
    moveInDate: toDateInput(contract.moveInDate),
    leaseStartDate: toDateInput(contract.leaseStartDate),
    leaseEndDate: toDateInput(contract.leaseEndDate),
    specialTerms: contract.specialTerms ?? '',
    memo: contract.memo ?? '',
    attachmentsText: (contract.attachments ?? []).join('\n'),
  };
}

/**
 * 저장 전 검증 (PRD §9). 차단 사유가 있으면 메시지를 반환한다.
 */
export function validateContractForm(form: ContractForm): string | null {
  const signedPlus = SIGNED_OR_LATER.has(form.status);
  if (signedPlus && !form.contractDate) {
    return '서명완료 이상 상태는 계약일 입력이 필요합니다.';
  }
  if (
    (form.transactionType === 'monthly' || form.transactionType === 'yearly') &&
    !toOptionalNumber(form.monthlyRent)
  ) {
    return `${form.transactionType === 'yearly' ? '연세' : '월세'} 계약은 차임 금액 입력이 필요합니다.`;
  }
  if (
    signedPlus &&
    ['jeonse', 'monthly', 'yearly'].includes(form.transactionType) &&
    (!form.leaseStartDate || !form.leaseEndDate)
  ) {
    return '전세/월세/연세 계약은 임대 시작일과 종료일 입력이 필요합니다.';
  }
  return null;
}

/**
 * 계약금+중도금+잔금 합계와 총액 정합성 — 세 값이 모두 입력됐을 때만 경고용으로 계산.
 */
export function getPaymentSumMismatch(form: ContractForm): {
  sum: number;
  total: number;
} | null {
  const deposit = toOptionalNumber(form.statedDeposit);
  const interim = toOptionalNumber(form.statedInterimPayment);
  const balance = toOptionalNumber(form.statedBalance);
  const total = toOptionalNumber(form.totalPrice);
  if (deposit == null || balance == null || total == null) return null;
  const sum = deposit + (interim ?? 0) + balance;
  return sum === total ? null : { sum, total };
}

// ---------------------------------------------------------------------------
// 값 변환 헬퍼
// ---------------------------------------------------------------------------

export function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toNullableNumber(value: string): number | null {
  return toOptionalNumber(value) ?? null;
}

export function stringifyOptionalNumber(value: number | undefined) {
  return value === undefined ? '' : String(value);
}

export function emptyDateToNull(value: string) {
  return value ? value : null;
}

export function emptyStringToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function emptyStringToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function toDateInput(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

export function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

/** contractDate + 30일 = 부동산 거래신고 기한 */
export function getReportDeadline(contractDate: string | null | undefined): Date | null {
  if (!contractDate) return null;
  const date = new Date(contractDate);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + 30);
  return date;
}

export function findDocumentByTemplate(
  documents: ContractDocument[],
  templateId: string,
) {
  return documents.find(
    (document) =>
      document.templateId === templateId && document.status !== 'cancelled',
  );
}

/** PDF/파일이 연결된 문서가 하나라도 있는지 (취소 문서 제외) */
export function hasContractFile(contract: Contract): boolean {
  if ((contract.attachments ?? []).length > 0) return true;
  return (contract.documents ?? []).some(
    (document) => document.status !== 'cancelled' && !!document.fileUrl,
  );
}

/** 문서 목록 정렬 — sortOrder(묶음 내 탭 순서) → kindOrder(동일 서식 반복 순번) */
export function sortContractDocuments(documents: ContractDocument[]): ContractDocument[] {
  return [...documents].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.kindOrder - b.kindOrder ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * 주 계약서 문서 탐색 (레거시 getMainContractInfo) — category=contract,
 * cancelled 제외, 현재 편집 중인 문서 제외. sortOrder 가 가장 앞선 문서를
 * 주 서식으로 본다. 부속 서식이 값 승계(primaryDocument)에 사용한다.
 */
export function findPrimaryContractDocument(
  documents: ContractDocument[],
  excludeDocumentId?: string,
): ContractDocument | null {
  const candidates = documents.filter(
    (document) =>
      document.id !== excludeDocumentId &&
      document.status !== 'cancelled' &&
      document.category === 'contract',
  );

  if (candidates.length === 0) return null;

  return sortContractDocuments(candidates)[0] ?? null;
}

/**
 * 문서의 템플릿 해석 — 템플릿 목록 → 문서 동봉 template → 문서 자체 정보 합성 순.
 * (거래유형 필터로 목록에 없는 템플릿으로 만든 문서도 편집 가능해야 함)
 * 합성 code 는 kind 가 없으면 '' — category('attachment' 등)를 kind 로 위장하면
 * 저장 시 서버 kind 검증(400)에 걸린다.
 */
export function resolveDocumentTemplate(
  document: ContractDocument,
  templates: ContractDocumentTemplate[],
): ContractDocumentTemplate {
  return (
    templates.find((template) => template.id === document.templateId) ??
    document.template ?? {
      id: document.templateId ?? '',
      officeId: null,
      code: document.kind ?? '',
      title: document.title,
      category: document.category,
      transactionTypes: [],
      isRequired: false,
      isActive: true,
      sortOrder: document.sortOrder,
      metadata: {},
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }
  );
}

// ---------------------------------------------------------------------------
// 소형 폼/표시 컴포넌트
// ---------------------------------------------------------------------------

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-12"
          disabled={disabled}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
    </div>
  );
}

export function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex h-9 items-center rounded-md border border-border/60 bg-muted/30 px-3 text-sm">
        {value}
      </div>
    </div>
  );
}

export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

/**
 * 특약 rich text 표시 컴포넌트 — HTML 이면 반드시 새니타이즈 후 HTML 렌더,
 * 레거시 plain text 는 기존 whitespace-pre-wrap 표시를 유지한다.
 */
export function ContractRichTextView({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  if (isContractRichTextHtml(value)) {
    return (
      <div
        className={cn(CONTRACT_RICH_TEXT_VIEW_CLASS, className)}
        // 반드시 새니타이즈를 거친다 — 특약 HTML XSS 방어
        dangerouslySetInnerHTML={{ __html: sanitizeContractHtml(value) }}
      />
    );
  }

  return <p className={cn('whitespace-pre-wrap', className)}>{value}</p>;
}
