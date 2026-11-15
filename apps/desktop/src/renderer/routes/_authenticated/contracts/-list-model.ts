import type {
  ContractDateField,
  ContractPriceField,
  ContractSearchField,
  ContractsPaginatedFilter,
} from '@estate-erp/api-client';
import { formatDateShortYear, formatMoney } from '@/lib/format';

/*
 * 문서관리 목록의 필터 상태와 표시 계산 (화면 없이 테스트할 수 있는 순수 함수).
 * 검색 조건 자체는 레거시 DMLS001Q01과 같다: 검색기준+글 / 서식 / 거래유형 / 상태 /
 * 문서 준비 / 날짜기준+범위 / 금액기준+범위(만원) / 공동중개 · 보존기간 경과.
 */

export const DOC_FILTER_OPTIONS = [
  { value: 'missing', label: '자료 누락' },
  { value: 'ready', label: '준비 완료' },
  { value: 'hasFile', label: 'PDF/파일 있음' },
  { value: 'noFile', label: 'PDF/파일 없음' },
];

export const CONTRACT_DATE_FIELD_OPTIONS: Array<{ value: ContractDateField; label: string }> = [
  { value: 'contractDate', label: '계약일자' },
  { value: 'statedInterimDate', label: '중도금일자' },
  { value: 'statedBalanceDate', label: '잔금일자' },
  { value: 'leaseEndDate', label: '임대만기일' },
  { value: 'createdAt', label: '등록일자' },
];

export const CONTRACT_PRICE_FIELD_OPTIONS: Array<{ value: ContractPriceField; label: string }> = [
  { value: 'totalPrice', label: '거래금액' },
  { value: 'statedDeposit', label: '계약금' },
  { value: 'monthlyRent', label: '월차임' },
];

export const CONTRACT_SEARCH_FIELD_OPTIONS: Array<{ value: ContractSearchField; label: string }> = [
  { value: 'party', label: '고객명' },
  { value: 'phone', label: '연락처' },
  { value: 'address', label: '소재지' },
  { value: 'partnerOffice', label: '공동중개사무소' },
];

/** 한 페이지에 보이는 행 수 */
export const CONTRACTS_PAGE_SIZE = 40;

/** 목록 필터 상태 — '' = 전체 */
export type ContractListFilterState = {
  kind: string;
  transactionType: string;
  status: string;
  dateField: ContractDateField;
  dateFrom: string;
  dateTo: string;
  priceField: ContractPriceField;
  priceMin: string;
  priceMax: string;
  /** '' = 전체(all) */
  searchField: string;
  search: string;
  isJointBrokerage: boolean;
  retentionOverdue: boolean;
};

export function defaultListFilters(): ContractListFilterState {
  return {
    kind: '',
    transactionType: '',
    status: '',
    dateField: 'contractDate',
    dateFrom: '',
    dateTo: '',
    priceField: 'totalPrice',
    priceMin: '',
    priceMax: '',
    searchField: '',
    search: '',
    isJointBrokerage: false,
    retentionOverdue: false,
  };
}

/** '' 는 undefined (toOptionalNumber 는 ''→0 이라 필터에 맞지 않는다) */
export function toFilterNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toContractsFilter(filters: ContractListFilterState): ContractsPaginatedFilter {
  const hasDateRange = Boolean(filters.dateFrom || filters.dateTo);
  const priceMin = toFilterNumber(filters.priceMin);
  const priceMax = toFilterNumber(filters.priceMax);
  const hasPriceRange = priceMin !== undefined || priceMax !== undefined;
  const search = filters.search.trim();

  return {
    kind: filters.kind || undefined,
    transactionType: filters.transactionType || undefined,
    status: filters.status || undefined,
    dateField: hasDateRange ? filters.dateField : undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    priceField: hasPriceRange ? filters.priceField : undefined,
    priceMin,
    priceMax,
    searchField: search ? ((filters.searchField || 'all') as ContractSearchField) : undefined,
    search: search || undefined,
    isJointBrokerage: filters.isJointBrokerage ? true : undefined,
    retentionOverdue: filters.retentionOverdue ? true : undefined,
  };
}

// ── 보기 탭 (전체 · 진행중 · 완료) ─────────────────────────────────

/** 보기 탭 → Contract.status 값 */
export const DOC_STATE_PRESETS = {
  all: { label: '전체', statuses: [] as string[] },
  active: {
    label: '진행중',
    statuses: ['draft', 'signed', 'depositPaid', 'balancePaid'],
  },
  done: {
    label: '완료',
    statuses: ['registered'],
  },
} as const;

export type DocStatePreset = keyof typeof DOC_STATE_PRESETS;

// ── 날짜 ───────────────────────────────────────────────────────────

export type DateTone = 'today' | 'tomorrow' | 'past' | 'future' | 'none';

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 오늘 · 내일 · 지난 날 · 앞으로 올 날 */
export function getContractDateTone(
  iso: string | null | undefined,
  now: Date = new Date(),
): DateTone {
  if (!iso) return 'none';
  const value = startOfLocalDay(new Date(iso));
  if (Number.isNaN(value.getTime())) return 'none';
  const diffDays = Math.round((value.getTime() - startOfLocalDay(now).getTime()) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays < 0) return 'past';
  return 'future';
}

/** 잔금을 아직 치르지 않은 계약 (잔금일이 지나면 경고하고, 남은 날을 센다) */
export function isBalanceOutstanding(status: string): boolean {
  return !['balancePaid', 'registered', 'cancelled'].includes(status);
}

/** 잔금일이 지났는데 아직 잔금을 치르지 않았다 */
export function isBalanceOverdue(
  contract: { status: string; statedBalanceDate: string | null },
  now: Date = new Date(),
): boolean {
  return (
    isBalanceOutstanding(contract.status) &&
    getContractDateTone(contract.statedBalanceDate, now) === 'past'
  );
}

// ── 필터 알약에 적는 요약 ──────────────────────────────────────────

function labelOf<T extends string>(options: Array<{ value: T; label: string }>, value: T) {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** "계약일자 26.11.01 ~ 26.11.30" · "잔금일자 26.11.01 이후". 범위가 없으면 null */
export function summarizeDateFilter(filters: ContractListFilterState): string | null {
  if (!filters.dateFrom && !filters.dateTo) return null;
  const field = labelOf(CONTRACT_DATE_FIELD_OPTIONS, filters.dateField);
  const from = filters.dateFrom ? formatDateShortYear(filters.dateFrom) : null;
  const to = filters.dateTo ? formatDateShortYear(filters.dateTo) : null;
  if (from && to) return `${field} ${from} ~ ${to}`;
  return from ? `${field} ${from} 이후` : `${field} ${to} 이전`;
}

/** "거래금액 1억 ~ 5억" · "계약금 3,000만 이상". 범위가 없으면 null */
export function summarizePriceFilter(filters: ContractListFilterState): string | null {
  const min = toFilterNumber(filters.priceMin);
  const max = toFilterNumber(filters.priceMax);
  if (min === undefined && max === undefined) return null;
  const field = labelOf(CONTRACT_PRICE_FIELD_OPTIONS, filters.priceField);
  // 0원은 "없음(—)"이 아니라 금액이다
  const money = (value: number) => (value === 0 ? '0' : formatMoney(value));
  if (min !== undefined && max !== undefined) return `${field} ${money(min)} ~ ${money(max)}`;
  return min !== undefined ? `${field} ${money(min)} 이상` : `${field} ${money(max as number)} 이하`;
}

/** 걸려 있는 조건 수 (검색어 제외). 필터 줄을 접었을 때 아이콘 옆에 보인다. */
export function countActiveFilters(filters: ContractListFilterState, docFilter: string): number {
  return [
    filters.kind,
    filters.transactionType,
    filters.status,
    docFilter,
    filters.dateFrom || filters.dateTo,
    filters.priceMin.trim() || filters.priceMax.trim(),
    filters.isJointBrokerage,
    filters.retentionOverdue,
  ].filter(Boolean).length;
}

/** 필터 · 검색 · 보기 탭이 모두 처음 상태인지 */
export function isPristineList(
  filters: ContractListFilterState,
  docFilter: string,
  statePreset: DocStatePreset,
): boolean {
  return (
    JSON.stringify(filters) === JSON.stringify(defaultListFilters()) &&
    !docFilter &&
    statePreset === 'all'
  );
}

/** 대표 번호 (phone 이 없으면 첫 번째 등록 번호) */
export function getContactPhone(
  contact: { phone?: string | null; phones?: Array<{ phone: string }> } | null | undefined,
): string | null {
  if (!contact) return null;
  return contact.phone || contact.phones?.[0]?.phone || null;
}
