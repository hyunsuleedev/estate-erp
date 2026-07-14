import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  BookMarked,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  ClipboardList,
  Copy,
  FileCheck2,
  FilePenLine,
  FileText,
  Printer,
  Trash2,
} from 'lucide-react';
import type {
  Contract,
  ContractClauseTemplate,
  ContractDateField,
  ContractDocument,
  ContractDocumentTemplate,
  ContractPriceField,
  ContractSearchField,
  ContractsPaginatedFilter,
  CreateContractDocumentDto,
  CreateContractDto,
  Deal,
  UpdateContractDocumentDto,
} from '@estate-erp/api-client';
import {
  appendContractRichText,
  contractRichTextToPlainText,
  formatContractAmountWithWon,
  formatPrice,
  isContractRichTextHtml,
  parseContractManwonText,
} from '@estate-erp/shared';
import {
  buildContractDocumentEngineDraft,
  getContractDocumentEngineFieldGroups,
  getContractDocumentEngineSections,
  mergeContractDocumentEngineMetadata,
  type ContractDocumentEngineFieldDefinition,
  type ContractDocumentEngineFieldGroup,
  type ContractDocumentEngineFields,
  type ContractDocumentEngineParty,
  type ContractDocumentEngineWorkflow,
} from './-document-engine';
import { ContractPartiesCard } from './-parties-editor';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  CONTRACT_RICH_TEXT_VIEW_CLASS,
  sanitizeContractHtml,
  sanitizeContractRichTextForSave,
} from '@/lib/contract-rich-text';
import { RichTextEditor } from '@/components/rich-text-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const statusMeta: Record<string, { label: string; className: string }> = {
  draft: { label: '초안', className: 'bg-slate-100 text-slate-700' },
  signed: { label: '서명완료', className: 'bg-blue-50 text-blue-700' },
  depositPaid: { label: '계약금 완료', className: 'bg-amber-50 text-amber-700' },
  balancePaid: { label: '잔금 완료', className: 'bg-emerald-50 text-emerald-700' },
  registered: { label: '등기 완료', className: 'bg-violet-50 text-violet-700' },
  cancelled: { label: '취소', className: 'bg-rose-50 text-rose-700' },
};

const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-rose-50 text-rose-700' },
  jeonse: { label: '전세', className: 'bg-blue-50 text-blue-700' },
  monthly: { label: '월세', className: 'bg-violet-50 text-violet-700' },
  yearly: { label: '연세', className: 'bg-teal-50 text-teal-700' },
  exchange: { label: '교환', className: 'bg-amber-50 text-amber-700' },
  sublease: { label: '전대', className: 'bg-cyan-50 text-cyan-700' },
  transfer: { label: '권리양도', className: 'bg-fuchsia-50 text-fuchsia-700' },
  succession: { label: '권리승계', className: 'bg-indigo-50 text-indigo-700' },
};

const CONTRACT_TRANSACTION_TYPES: Array<{ value: string; label: string }> = [
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly', label: '월세' },
  { value: 'yearly', label: '연세' },
  { value: 'exchange', label: '교환' },
  { value: 'sublease', label: '전대' },
  { value: 'transfer', label: '권리양도' },
  { value: 'succession', label: '권리승계' },
];

/**
 * 거래신고 상태 롤업 (레거시 TRAN_REPT_CLSF) — category=report 문서의 최상위
 * status. 'none' = 신고 문서 없음.
 */
const transactionReportStatusMeta: Record<string, { label: string; className: string }> = {
  none: { label: '신고없음', className: 'bg-muted text-muted-foreground' },
  draft: { label: '신고예정', className: 'bg-amber-50 text-amber-700' },
  generated: { label: '신고예정', className: 'bg-amber-50 text-amber-700' },
  signed: { label: '신고예정', className: 'bg-amber-50 text-amber-700' },
  submitted: { label: '신고완료', className: 'bg-emerald-50 text-emerald-700' },
  archived: { label: '신고보관', className: 'bg-zinc-100 text-zinc-700' },
  cancelled: { label: '신고취소', className: 'bg-rose-50 text-rose-700' },
};

const documentStatusMeta: Record<string, { label: string; className: string }> = {
  draft: { label: '초안', className: 'bg-slate-100 text-slate-700' },
  generated: { label: '작성됨', className: 'bg-blue-50 text-blue-700' },
  signed: { label: '서명완료', className: 'bg-emerald-50 text-emerald-700' },
  submitted: { label: '제출완료', className: 'bg-violet-50 text-violet-700' },
  archived: { label: '보관', className: 'bg-zinc-100 text-zinc-700' },
  cancelled: { label: '취소', className: 'bg-rose-50 text-rose-700' },
};

const documentCategoryLabels: Record<string, string> = {
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

const CONTRACT_DATE_FIELD_OPTIONS: Array<{ value: ContractDateField; label: string }> = [
  { value: 'contractDate', label: '계약일자' },
  { value: 'statedInterimDate', label: '중도금일자' },
  { value: 'statedBalanceDate', label: '잔금일자' },
  { value: 'leaseEndDate', label: '임대만기일' },
  { value: 'createdAt', label: '등록일자' },
];

const CONTRACT_PRICE_FIELD_OPTIONS: Array<{ value: ContractPriceField; label: string }> = [
  { value: 'totalPrice', label: '거래금액' },
  { value: 'statedDeposit', label: '계약금' },
  { value: 'monthlyRent', label: '월차임' },
];

const CONTRACT_SEARCH_FIELD_OPTIONS: Array<{ value: ContractSearchField; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'party', label: '고객명' },
  { value: 'phone', label: '연락처' },
  { value: 'address', label: '소재지' },
  { value: 'partnerOffice', label: '공동중개사무소' },
];

const CONTRACTS_PAGE_SIZE = 20;

/**
 * 주 금액 필드 → 프리뷰 공통 '거래 조건' 행 동기화 매핑.
 * metadata fieldGroups 서식(base_contract 등)에서 salePrice/deposit/monthlyRent 를
 * 편집하면 출력 미리보기의 거래 금액/월 차임 행도 함께 갱신한다.
 */
const PRIMARY_AMOUNT_MIRRORS: Record<string, 'totalPriceText' | 'monthlyRentText'> = {
  salePrice: 'totalPriceText',
  deposit: 'totalPriceText',
  monthlyRent: 'monthlyRentText',
};

/** 'YYYY-MM-DD' input[type=date] 값 파싱 (로컬 기준) */
function parseDateInputValue(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** N개월 더하기 — 말일 초과 시 해당 월 말일로 보정 (1/31 +1개월 → 2/28) */
function addMonthsToDate(date: Date, months: number): Date {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/** 시작일 + N개월 = 종료일이 정확히 성립하는 N (아니면 null) */
function diffWholeMonths(start: Date, end: Date): number | null {
  if (end.getTime() <= start.getTime()) return null;
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  if (months <= 0) return null;
  return toDateInputValue(addMonthsToDate(start, months)) === toDateInputValue(end)
    ? months
    : null;
}

/**
 * 임대차 개월수 ↔ 만기일 양방향 파생 (레거시 setRentMonth 대응).
 * - leaseMonths / leaseStartDate 편집 → leaseEndDate = 시작일 + N개월
 * - leaseEndDate 편집 → 온전한 개월수면 leaseMonths 갱신, 아니면 비움
 */
function applyLeasePeriodDerivation(
  fields: ContractDocumentEngineFields,
  key: string,
  value: string,
) {
  if (key === 'leaseMonths' || key === 'leaseStartDate') {
    const months = Number(
      (key === 'leaseMonths' ? value : (fields.leaseMonths ?? '')).trim(),
    );
    const start = parseDateInputValue(
      key === 'leaseStartDate' ? value : fields.leaseStartDate,
    );
    if (
      start &&
      Number.isInteger(months) &&
      months > 0 &&
      fields.leaseEndDate !== undefined
    ) {
      fields.leaseEndDate = toDateInputValue(addMonthsToDate(start, months));
    }
    return;
  }

  if (key === 'leaseEndDate') {
    const start = parseDateInputValue(fields.leaseStartDate);
    const end = parseDateInputValue(value);
    if (start && end && fields.leaseMonths !== undefined) {
      const months = diffWholeMonths(start, end);
      fields.leaseMonths = months !== null ? String(months) : '';
    }
  }
}

type ContractForm = {
  transactionType: string;
  status: string;
  totalPrice: string;
  monthlyRent: string;
  contractDate: string;
  /// 계약서 상 계약금
  statedDeposit: string;
  /// 계약서 상 중도금
  statedInterimPayment: string;
  statedInterimDate: string;
  /// 계약서 상 잔금
  statedBalance: string;
  statedBalanceDate: string;
  moveInDate: string;
  leaseStartDate: string;
  leaseEndDate: string;
  specialTerms: string;
  memo: string;
  attachmentsText: string;
};

type DocumentEditorForm = {
  documentId?: string;
  templateId?: string;
  type: string;
  category: string;
  title: string;
  status: string;
  fileUrl: string;
  memo: string;
  metadata: Record<string, unknown>;
  workflow: ContractDocumentEngineWorkflow;
  engineFields: ContractDocumentEngineFields;
  /** 서식 코드 (레거시 Cntr_Clsf) — 신규 문서는 template.code 에서 유도 */
  kind: string | null;
  /** 묶음 내 탭 순서 / 동일 서식 반복 순번 — 기존 문서 수정 시 보존 */
  sortOrder?: number;
  kindOrder?: number;
  /** metadata.documentEngine.fieldGroups 구동 + appliesTo 필터 적용된 그룹 */
  fieldGroups: ContractDocumentEngineFieldGroup[];
  /** 프리뷰 당사자 반복 렌더용 (contract.parties) */
  parties: ContractDocumentEngineParty[];
  /** 계약 거래유형 — 특약 템플릿 필터 등 편의 기능용 */
  transactionType: string;
};

/** 목록 필터 상태 (레거시 DMLS002Q1M 검색 조건) */
type ContractListFilterState = {
  kind: string;
  transactionType: string;
  status: string;
  dateField: ContractDateField;
  dateFrom: string;
  dateTo: string;
  priceField: ContractPriceField;
  priceMin: string;
  priceMax: string;
  searchField: ContractSearchField;
  search: string;
  isJointBrokerage: boolean;
  retentionOverdue: boolean;
};

function defaultListFilters(): ContractListFilterState {
  return {
    kind: 'all',
    transactionType: 'all',
    status: 'all',
    dateField: 'contractDate',
    dateFrom: '',
    dateTo: '',
    priceField: 'totalPrice',
    priceMin: '',
    priceMax: '',
    searchField: 'all',
    search: '',
    isJointBrokerage: false,
    retentionOverdue: false,
  };
}

/** '' 는 undefined (기존 toOptionalNumber 는 ''→0 이라 필터에 부적합) */
function toFilterNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toContractsFilter(filters: ContractListFilterState): ContractsPaginatedFilter {
  const hasDateRange = Boolean(filters.dateFrom || filters.dateTo);
  const priceMin = toFilterNumber(filters.priceMin);
  const priceMax = toFilterNumber(filters.priceMax);
  const hasPriceRange = priceMin !== undefined || priceMax !== undefined;
  const search = filters.search.trim();

  return {
    kind: filters.kind !== 'all' ? filters.kind : undefined,
    transactionType:
      filters.transactionType !== 'all' ? filters.transactionType : undefined,
    status: filters.status !== 'all' ? filters.status : undefined,
    dateField: hasDateRange ? filters.dateField : undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    priceField: hasPriceRange ? filters.priceField : undefined,
    priceMin,
    priceMax,
    searchField: search ? filters.searchField : undefined,
    search: search || undefined,
    isJointBrokerage: filters.isJointBrokerage ? true : undefined,
    retentionOverdue: filters.retentionOverdue ? true : undefined,
  };
}

function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export const Route = createFileRoute('/_authenticated/contracts/')({
  component: ContractsPage,
});

function ContractsPage() {
  const queryClient = useQueryClient();
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ContractListFilterState>(defaultListFilters());
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDocumentEditorOpen, setIsDocumentEditorOpen] = useState(false);
  const [documentFormError, setDocumentFormError] = useState<string | null>(null);
  const [documentEditorForm, setDocumentEditorForm] = useState<DocumentEditorForm>(
    emptyDocumentEditorForm(),
  );
  /** 에디터 오픈 시점 스냅샷 — §3.1 dirty tracking (미저장 변경 감지) */
  const [documentEditorBaseline, setDocumentEditorBaseline] = useState<string | null>(
    null,
  );
  const [createForm, setCreateForm] = useState<CreateContractDto>({
    dealId: '',
    transactionType: 'sale',
    totalPrice: undefined,
    monthlyRent: undefined,
    contractDate: todayInput(),
  });
  const [detailForm, setDetailForm] = useState<ContractForm>(emptyContractForm());

  // 텍스트/금액 입력은 디바운스 후 서버 검색 (레거시 DMLS001Q01 필터)
  const debouncedSearch = useDebouncedValue(filters.search);
  const debouncedPriceMin = useDebouncedValue(filters.priceMin);
  const debouncedPriceMax = useDebouncedValue(filters.priceMax);

  const effectiveFilters = useMemo<ContractListFilterState>(
    () => ({
      ...filters,
      search: debouncedSearch,
      priceMin: debouncedPriceMin,
      priceMax: debouncedPriceMax,
    }),
    [filters, debouncedSearch, debouncedPriceMin, debouncedPriceMax],
  );

  const filterKey = JSON.stringify(effectiveFilters);

  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  const { data: contractsPage } = useQuery({
    queryKey: ['contracts', 'list', filterKey, page],
    queryFn: () =>
      api.contracts.findAllPaginated({
        ...toContractsFilter(effectiveFilters),
        page,
        limit: CONTRACTS_PAGE_SIZE,
      }),
  });

  const contracts = contractsPage?.items ?? [];
  const pagination = contractsPage?.pagination;

  // 계약 생성 다이얼로그의 "이미 계약된 거래 제외" 계산용 전체 목록 (필터 무관)
  const { data: allContracts = [] } = useQuery({
    queryKey: ['contracts', 'all'],
    queryFn: () => api.contracts.findAll(),
  });

  const { data: deals = [] } = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  // 서식종류(kind) 필터 옵션 — 전체 템플릿 목록에서 code/title 추출
  const { data: allDocumentTemplates = [] } = useQuery({
    queryKey: ['contract-document-templates', 'all'],
    queryFn: () => api.contracts.documentTemplates(),
  });

  const kindOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const template of allDocumentTemplates) {
      if (!seen.has(template.code)) seen.set(template.code, template.title);
    }
    return Array.from(seen, ([code, title]) => ({ code, title }));
  }, [allDocumentTemplates]);

  const { data: contractDetail } = useQuery({
    queryKey: ['contract', selectedContractId],
    queryFn: () => api.contracts.findOne(selectedContractId as string),
    enabled: !!selectedContractId,
  });

  const { data: documentTemplates = [], isLoading: isDocumentTemplatesLoading } = useQuery({
    queryKey: ['contract-document-templates', contractDetail?.transactionType],
    queryFn: () =>
      api.contracts.documentTemplates({
        transactionType: contractDetail?.transactionType,
      }),
    enabled: !!contractDetail?.transactionType,
  });

  useEffect(() => {
    if (!contractDetail) return;
    setDetailForm(toContractForm(contractDetail));
  }, [contractDetail]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateContractDto) => api.contracts.create(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setSelectedContractId(created.id);
      setIsDetailOpen(true);
      setIsCreateOpen(false);
      setCreateForm({
        dealId: '',
        transactionType: 'sale',
        totalPrice: undefined,
        monthlyRent: undefined,
        contractDate: todayInput(),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.contracts.update(selectedContractId as string, {
        transactionType: detailForm.transactionType,
        status: detailForm.status,
        totalPrice: toOptionalNumber(detailForm.totalPrice),
        monthlyRent: detailForm.transactionType === 'monthly'
          ? toOptionalNumber(detailForm.monthlyRent)
          : null,
        contractDate: emptyDateToNull(detailForm.contractDate),
        statedDeposit: toNullableNumber(detailForm.statedDeposit),
        statedInterimPayment: toNullableNumber(detailForm.statedInterimPayment),
        statedInterimDate: emptyDateToNull(detailForm.statedInterimDate),
        statedBalance: toNullableNumber(detailForm.statedBalance),
        statedBalanceDate: emptyDateToNull(detailForm.statedBalanceDate),
        moveInDate: emptyDateToNull(detailForm.moveInDate),
        leaseStartDate: emptyDateToNull(detailForm.leaseStartDate),
        leaseEndDate: emptyDateToNull(detailForm.leaseEndDate),
        // 특약은 rich text HTML — 저장 전 새니타이즈 (레거시 plain text 는 그대로)
        specialTerms: emptyStringToNull(
          sanitizeContractRichTextForSave(detailForm.specialTerms),
        ),
        memo: emptyStringToNull(detailForm.memo),
        attachments: detailForm.attachmentsText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', selectedContractId] });
    },
  });

  const saveDocumentMutation = useMutation({
    mutationFn: ({
      documentId,
      dto,
    }: {
      documentId?: string;
      dto: CreateContractDocumentDto | UpdateContractDocumentDto;
    }) => {
      if (!selectedContractId) {
        throw new Error('계약을 먼저 선택해주세요.');
      }

      if (documentId) {
        return api.contracts.updateDocument(
          selectedContractId,
          documentId,
          dto as UpdateContractDocumentDto,
        );
      }

      return api.contracts.createDocument(
        selectedContractId,
        dto as CreateContractDocumentDto,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', selectedContractId] });
      setIsDocumentEditorOpen(false);
      setDocumentEditorForm(emptyDocumentEditorForm());
      setDocumentEditorBaseline(null);
    },
    onError: (error) => {
      setDocumentFormError(
        error instanceof Error ? error.message : '문서를 저장하지 못했습니다.',
      );
    },
  });

  // 계약 삭제 (레거시 §1.3 삭제 액션) — 문서/당사자 포함 영구 삭제 (DB cascade)
  const deleteContractMutation = useMutation({
    mutationFn: (contractId: string) => api.contracts.remove(contractId),
    onSuccess: (_result, contractId) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.removeQueries({ queryKey: ['contract', contractId] });
      if (selectedContractId === contractId) {
        setSelectedContractId(null);
        setIsDetailOpen(false);
      }
    },
  });

  // 문서 단건 삭제 — 취소(status=cancelled) 우회가 아닌 영구 삭제
  const deleteDocumentMutation = useMutation({
    mutationFn: (documentId: string) => {
      if (!selectedContractId) {
        throw new Error('계약을 먼저 선택해주세요.');
      }
      return api.contracts.removeDocument(selectedContractId, documentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', selectedContractId] });
    },
  });

  // 계약 문서 세트 전체 사본 (레거시 "계약서/서식 복사")
  const copyContractMutation = useMutation({
    mutationFn: (contractId: string) => api.contracts.copyContract(contractId),
    onSuccess: (copied) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', copied.id] });
      setSelectedContractId(copied.id);
      setIsDetailOpen(true);
    },
  });

  // 서식 단건 사본 (레거시 "다른저장") — 같은 kind 는 kindOrder 자동 증가
  const copyDocumentMutation = useMutation({
    mutationFn: ({ documentId }: { documentId: string }) => {
      if (!selectedContractId) {
        throw new Error('계약을 먼저 선택해주세요.');
      }
      return api.contracts.copyDocument(selectedContractId, documentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', selectedContractId] });
    },
  });

  const availableDeals = useMemo(() => {
    const contractedDealIds = new Set(allContracts.map((contract) => contract.dealId));
    return deals.filter((deal) => !contractedDealIds.has(deal.id));
  }, [allContracts, deals]);

  const selectedCreateDeal = useMemo(
    () => availableDeals.find((deal) => deal.id === createForm.dealId),
    [availableDeals, createForm.dealId],
  );

  useEffect(() => {
    if (!selectedCreateDeal) return;

    setCreateForm((prev) => ({
      ...prev,
      transactionType:
        prev.transactionType ??
        selectedCreateDeal.transactionType ??
        selectedCreateDeal.listing?.transactionType ??
        'sale',
      totalPrice:
        prev.totalPrice ??
        selectedCreateDeal.agreedPrice ??
        selectedCreateDeal.agreedDeposit ??
        selectedCreateDeal.listing?.price ??
        selectedCreateDeal.listing?.deposit ??
        undefined,
      monthlyRent:
        selectedCreateDeal.transactionType === 'monthly' ||
        selectedCreateDeal.listing?.transactionType === 'monthly'
          ? selectedCreateDeal.agreedMonthlyRent ??
            selectedCreateDeal.listing?.monthlyRent ??
            prev.monthlyRent
          : undefined,
    }));
  }, [selectedCreateDeal]);

  function openDocumentEditor(
    template: ContractDocumentTemplate,
    document?: ContractDocument,
  ) {
    if (!contractDetail) return;

    setDocumentFormError(null);
    const nextForm = toDocumentEditorForm(contractDetail, template, document);
    setDocumentEditorForm(nextForm);
    // §3.1 dirty tracking — 오픈 시점 스냅샷 보관
    setDocumentEditorBaseline(JSON.stringify(nextForm));
    setIsDetailOpen(false);
    setIsDocumentEditorOpen(true);
  }

  function openContractDetail(contractId: string) {
    setSelectedContractId(contractId);
    setIsDetailOpen(true);
  }

  // §3.1 dirty tracking — 저장 버튼 활성화 + 닫기 시 미저장 확인
  const isDocumentEditorDirty =
    documentEditorBaseline !== null &&
    JSON.stringify(documentEditorForm) !== documentEditorBaseline;

  const isDetailDirty = useMemo(
    () =>
      contractDetail
        ? JSON.stringify(detailForm) !== JSON.stringify(toContractForm(contractDetail))
        : false,
    [contractDetail, detailForm],
  );

  function handleDocumentEditorOpenChange(open: boolean) {
    if (!open && isDocumentEditorDirty && !saveDocumentMutation.isPending) {
      const confirmed = window.confirm(
        '저장하지 않은 변경사항이 있습니다. 저장 없이 닫을까요?',
      );
      if (!confirmed) return;
    }
    setIsDocumentEditorOpen(open);
    if (!open) {
      setDocumentEditorForm(emptyDocumentEditorForm());
      setDocumentEditorBaseline(null);
      setDocumentFormError(null);
    }
  }

  function handleDetailOpenChange(open: boolean) {
    if (!open && isDetailDirty && !updateMutation.isPending) {
      const confirmed = window.confirm(
        '저장하지 않은 계약 정보 변경이 있습니다. 저장 없이 닫을까요?',
      );
      if (!confirmed) return;
    }
    setIsDetailOpen(open);
    if (!open && contractDetail) {
      // 폐기 확정 — 다음 오픈 때 서버 상태 기준으로 리셋
      setDetailForm(toContractForm(contractDetail));
    }
  }

  function deleteContract(contractId: string) {
    const confirmed = window.confirm(
      '계약과 소속 문서·당사자 정보가 모두 영구 삭제되며 복구할 수 없습니다. 삭제할까요?',
    );
    if (!confirmed) return;
    deleteContractMutation.mutate(contractId);
  }

  function deleteDocument(documentId: string) {
    const confirmed = window.confirm(
      '이 문서가 영구 삭제되며 복구할 수 없습니다. 삭제할까요?',
    );
    if (!confirmed) return;
    deleteDocumentMutation.mutate(documentId);
  }

  /**
   * 문서 저장. saveAsNew=true 는 레거시 '다른저장' — 현재 편집 중인 값으로
   * 새 draft 문서를 생성한다 (같은 kind 는 서버가 kindOrder 자동 증가).
   */
  function saveDocument(saveAsNew = false) {
    setDocumentFormError(null);

    // 특약은 rich text HTML — 저장 전 새니타이즈 (레거시 plain text 는 그대로)
    const engineFields: ContractDocumentEngineFields = {
      ...documentEditorForm.engineFields,
      specialTerms: sanitizeContractRichTextForSave(
        documentEditorForm.engineFields.specialTerms ?? '',
      ),
    };

    const metadata = mergeContractDocumentEngineMetadata(
      documentEditorForm.metadata,
      engineFields,
    );
    const title =
      documentEditorForm.engineFields.documentTitle.trim() ||
      documentEditorForm.title;

    saveDocumentMutation.mutate({
      documentId: saveAsNew ? undefined : documentEditorForm.documentId,
      dto: {
        templateId: documentEditorForm.templateId,
        type: documentEditorForm.type,
        category: documentEditorForm.category,
        title,
        status: saveAsNew ? 'draft' : documentEditorForm.status,
        // 서식 코드/순서 (레거시 Cntr_Clsf/Orde/Cntr_Clsf_Orde) — 신규는 kind 만
        // 전달해 서버가 sortOrder/kindOrder 를 자동 부여, 수정은 기존 값 보존.
        // 템플릿 없는 문서(uploaded/external, kind=null)는 kind 를 보내지 않는다
        // — category 등 자유 문자열이 서버 kind 검증(400)에 걸리지 않도록.
        kind: documentEditorForm.kind || undefined,
        sortOrder: saveAsNew ? undefined : documentEditorForm.sortOrder,
        kindOrder: saveAsNew ? undefined : documentEditorForm.kindOrder,
        fileUrl: emptyStringToUndefined(documentEditorForm.fileUrl),
        memo: emptyStringToNull(documentEditorForm.memo),
        metadata,
      },
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">계약서 관리</h1>
            <span className="text-xs text-muted-foreground">
              {pagination?.total ?? contracts.length}건
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            거래에서 이어지는 계약 일정과 문서 상태를 계약 단위로 관리합니다.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} disabled={availableDeals.length === 0}>
          <CirclePlus className="size-4" />
          계약 생성
        </Button>
      </div>

      <Card className="min-h-0">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>계약 목록</CardTitle>
              <CardDescription>
                계약을 누르면 상세 정보와 문서 허브를 모달에서 확인합니다.
              </CardDescription>
            </div>
            <span className="text-sm text-muted-foreground">
              총 {pagination?.total ?? contracts.length}건
            </span>
          </div>
          <ContractListFilterBar
            filters={filters}
            kindOptions={kindOptions}
            onChange={setFilters}
          />
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-hidden rounded-lg border border-border/60">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-28">계약일</TableHead>
                    <TableHead className="min-w-36">계약</TableHead>
                    <TableHead className="min-w-36">매물</TableHead>
                    <TableHead className="min-w-40">당사자</TableHead>
                    <TableHead className="min-w-28 text-right">금액</TableHead>
                    <TableHead className="min-w-24">상태</TableHead>
                    <TableHead className="min-w-28">문서</TableHead>
                    <TableHead className="min-w-24">거래신고</TableHead>
                    <TableHead className="min-w-28">수정일</TableHead>
                    <TableHead className="w-36 text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map((contract) => {
                    const missingCount = contract.missingDocumentCount ?? 0;
                    const reportStatus = contract.transactionReportStatus ?? 'none';

                    return (
                      <TableRow
                        key={contract.id}
                        tabIndex={0}
                        onClick={() => openContractDetail(contract.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openContractDetail(contract.id);
                          }
                        }}
                        className="cursor-pointer outline-none hover:bg-muted/40 focus-visible:bg-muted/50"
                      >
                        <TableCell className="font-medium">
                          {formatDate(contract.contractDate)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'border-0',
                                transactionTypeMeta[contract.transactionType]?.className,
                              )}
                            >
                              {transactionTypeMeta[contract.transactionType]?.label ??
                                contract.transactionType}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              #{contract.id.slice(0, 8)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {contract.deal?.property?.site?.name ?? '계약'}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {contract.deal?.property?.unit?.name ?? '호실 미지정'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {contract.buyerContact?.name ?? '매수인 미지정'} /{' '}
                            {contract.sellerContact?.name ?? '매도인 미지정'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatPrice(contract.totalPrice)}
                          {contract.transactionType === 'monthly' && contract.monthlyRent ? (
                            <span className="block text-xs text-muted-foreground">
                              월 {formatPrice(contract.monthlyRent)}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('border-0', statusMeta[contract.status]?.className)}>
                            {statusMeta[contract.status]?.label ?? contract.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm">
                              문서 {contract.documentCount ?? 0}건
                            </span>
                            <span
                              className={cn(
                                'text-xs',
                                missingCount > 0
                                  ? 'font-medium text-rose-600'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {missingCount > 0 ? `누락 ${missingCount}건` : '누락 없음'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              'border-0',
                              transactionReportStatusMeta[reportStatus]?.className ??
                                transactionReportStatusMeta.none.className,
                            )}
                          >
                            {transactionReportStatusMeta[reportStatus]?.label ?? reportStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(contract.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={copyContractMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation();
                                copyContractMutation.mutate(contract.id);
                              }}
                            >
                              <Copy className="size-3.5" />
                              사본
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-600 hover:text-rose-700"
                              disabled={deleteContractMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteContract(contract.id);
                              }}
                            >
                              <Trash2 className="size-3.5" />
                              삭제
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {contracts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="h-40 text-center text-sm text-muted-foreground"
                      >
                        조건에 맞는 계약이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {pagination
                ? `${pagination.page} / ${Math.max(pagination.totalPages, 1)} 페이지 · 총 ${pagination.total}건`
                : ' '}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              >
                <ChevronLeft className="size-4" />
                이전
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination || page >= pagination.totalPages}
                onClick={() => setPage((prev) => prev + 1)}
              >
                다음
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDetailOpen} onOpenChange={handleDetailOpenChange}>
        <DialogContent
          className="h-[calc(100vh-32px)] max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none xl:w-[1180px]"
        >
          <ContractDetailCard
            contract={contractDetail}
            documentTemplates={documentTemplates}
            isDocumentTemplatesLoading={isDocumentTemplatesLoading}
            form={detailForm}
            onFormChange={setDetailForm}
            onSave={() => updateMutation.mutate()}
            isSaving={updateMutation.isPending}
            isDirty={isDetailDirty}
            onOpenDocument={openDocumentEditor}
            onCopyDocument={(documentId) => copyDocumentMutation.mutate({ documentId })}
            isCopyingDocument={copyDocumentMutation.isPending}
            onDeleteDocument={deleteDocument}
            isDeletingDocument={deleteDocumentMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>계약 생성</DialogTitle>
            <DialogDescription>
              거래에 연결된 당사자와 가격을 기준으로 계약서를 시작합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>대상 거래</Label>
              <Select
                value={createForm.dealId}
                onValueChange={(value) => setCreateForm((prev) => ({ ...prev, dealId: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="거래 선택" />
                </SelectTrigger>
                <SelectContent>
                  {availableDeals.map((deal) => (
                    <SelectItem key={deal.id} value={deal.id}>
                      {getDealLabel(deal)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>거래 유형</Label>
              <Select
                value={createForm.transactionType ?? 'sale'}
                onValueChange={(value) =>
                  setCreateForm((prev) => ({ ...prev, transactionType: value }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TRANSACTION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <NumberField
              label="총 거래금액"
              value={stringifyOptionalNumber(createForm.totalPrice)}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, totalPrice: toOptionalNumber(value) }))
              }
              suffix="만원"
            />

            <NumberField
              label="월세"
              value={stringifyOptionalNumber(createForm.monthlyRent)}
              onChange={(value) =>
                setCreateForm((prev) => ({ ...prev, monthlyRent: toOptionalNumber(value) }))
              }
              suffix="만원"
              disabled={createForm.transactionType !== 'monthly'}
            />

            <div className="space-y-2">
              <Label>계약일</Label>
              <Input
                type="date"
                value={createForm.contractDate ?? ''}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, contractDate: event.target.value }))
                }
              />
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 md:col-span-2">
              <p className="text-sm font-medium">생성 기준</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedCreateDeal
                  ? `${selectedCreateDeal.buyerContact?.name ?? '매수인 미지정'} / ${selectedCreateDeal.sellerContact?.name ?? '매도인 미지정'} · ${selectedCreateDeal.property?.site?.name ?? '매물'}`
                  : '거래를 선택하면 당사자와 매물 정보를 미리 확인할 수 있습니다.'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              닫기
            </Button>
            <Button
              onClick={() => createMutation.mutate(createForm)}
              disabled={
                createMutation.isPending ||
                !createForm.dealId ||
                !selectedCreateDeal?.buyerContactId ||
                !selectedCreateDeal?.sellerContactId ||
                !createForm.totalPrice
              }
            >
              생성
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentEditorSheet
        open={isDocumentEditorOpen}
        form={documentEditorForm}
        error={documentFormError}
        isSaving={saveDocumentMutation.isPending}
        isDirty={isDocumentEditorDirty}
        onOpenChange={handleDocumentEditorOpenChange}
        onFormChange={setDocumentEditorForm}
        onSave={() => saveDocument(false)}
        onSaveAsNew={() => saveDocument(true)}
      />
    </div>
  );
}

/** 목록 필터 바 — 레거시 DMLS002Q1M 검색 조건 (서식종류/거래유형/상태/날짜/금액/텍스트/토글) */
function ContractListFilterBar({
  filters,
  kindOptions,
  onChange,
}: {
  filters: ContractListFilterState;
  kindOptions: Array<{ code: string; title: string }>;
  onChange: Dispatch<SetStateAction<ContractListFilterState>>;
}) {
  function patch(partial: Partial<ContractListFilterState>) {
    onChange((prev) => ({ ...prev, ...partial }));
  }

  const isDefault = useMemo(
    () => JSON.stringify(filters) === JSON.stringify(defaultListFilters()),
    [filters],
  );

  return (
    <div className="space-y-2">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(200px,1.2fr)_160px_160px_minmax(0,1fr)]">
        <Select
          value={filters.kind}
          onValueChange={(value) => patch({ kind: value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="서식 종류" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 서식</SelectItem>
            {kindOptions.map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {option.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.transactionType}
          onValueChange={(value) => patch({ transactionType: value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="거래 유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 유형</SelectItem>
            {CONTRACT_TRANSACTION_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.status}
          onValueChange={(value) => patch({ status: value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="계약 상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {Object.entries(statusMeta).map(([key, meta]) => (
              <SelectItem key={key} value={key}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-4 rounded-md border border-border/60 px-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={filters.isJointBrokerage}
              onCheckedChange={(checked) =>
                patch({ isJointBrokerage: checked === true })
              }
            />
            공동중개
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={filters.retentionOverdue}
              onCheckedChange={(checked) =>
                patch({ retentionOverdue: checked === true })
              }
            />
            보존기간 경과
          </label>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[160px_150px_150px_160px_130px_130px]">
        <Select
          value={filters.dateField}
          onValueChange={(value) => patch({ dateField: value as ContractDateField })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="날짜 기준" />
          </SelectTrigger>
          <SelectContent>
            {CONTRACT_DATE_FIELD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(event) => patch({ dateFrom: event.target.value })}
          aria-label="날짜 시작"
        />
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(event) => patch({ dateTo: event.target.value })}
          aria-label="날짜 끝"
        />
        <Select
          value={filters.priceField}
          onValueChange={(value) => patch({ priceField: value as ContractPriceField })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="금액 기준" />
          </SelectTrigger>
          <SelectContent>
            {CONTRACT_PRICE_FIELD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Input
            inputMode="numeric"
            value={filters.priceMin}
            onChange={(event) => patch({ priceMin: event.target.value })}
            placeholder="최소"
            className="pr-11"
            aria-label="금액 최소"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            만원
          </span>
        </div>
        <div className="relative">
          <Input
            inputMode="numeric"
            value={filters.priceMax}
            onChange={(event) => patch({ priceMax: event.target.value })}
            placeholder="최대"
            className="pr-11"
            aria-label="금액 최대"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            만원
          </span>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)_auto]">
        <Select
          value={filters.searchField}
          onValueChange={(value) =>
            patch({ searchField: value as ContractSearchField })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="검색 기준" />
          </SelectTrigger>
          <SelectContent>
            {CONTRACT_SEARCH_FIELD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={filters.search}
          onChange={(event) => patch({ search: event.target.value })}
          placeholder="고객명, 연락처, 소재지, 공동중개사무소 검색"
        />
        <Button
          variant="ghost"
          disabled={isDefault}
          onClick={() => onChange(defaultListFilters())}
        >
          필터 초기화
        </Button>
      </div>
    </div>
  );
}

function ContractDetailCard({
  contract,
  documentTemplates,
  isDocumentTemplatesLoading,
  form,
  onFormChange,
  onSave,
  isSaving,
  isDirty,
  onOpenDocument,
  onCopyDocument,
  isCopyingDocument,
  onDeleteDocument,
  isDeletingDocument,
}: {
  contract?: Contract;
  documentTemplates: ContractDocumentTemplate[];
  isDocumentTemplatesLoading: boolean;
  form: ContractForm;
  onFormChange: Dispatch<SetStateAction<ContractForm>>;
  onSave: () => void;
  isSaving: boolean;
  isDirty: boolean;
  onOpenDocument: (
    template: ContractDocumentTemplate,
    document?: ContractDocument,
  ) => void;
  onCopyDocument: (documentId: string) => void;
  isCopyingDocument: boolean;
  onDeleteDocument: (documentId: string) => void;
  isDeletingDocument: boolean;
}) {
  if (!contract) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        계약 상세 정보를 불러오는 중입니다.
      </div>
    );
  }

  const availableTemplates =
    documentTemplates.length > 0
      ? documentTemplates
      : contract.requiredDocumentTemplates ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <DialogTitle>{contract.deal?.property?.site?.name ?? '계약'}</DialogTitle>
              <Badge className={cn('border-0', statusMeta[form.status]?.className)}>
                {statusMeta[form.status]?.label ?? form.status}
              </Badge>
              <Badge
                variant="outline"
                className={cn('border-0', transactionTypeMeta[form.transactionType]?.className)}
              >
                {transactionTypeMeta[form.transactionType]?.label ?? form.transactionType}
              </Badge>
            </div>
            <DialogDescription>
              {contract.deal?.property?.unit?.name ?? '호실 미지정'} · 업데이트 {formatDateTime(contract.updatedAt)}
            </DialogDescription>
          </div>
          <Button className="mr-8" onClick={onSave} disabled={isSaving || !isDirty}>
            저장
          </Button>
        </div>
      </div>

      <Tabs defaultValue="summary" className="min-h-0 flex-1 gap-0">
        <div className="border-b px-6 py-3">
          <TabsList>
            <TabsTrigger value="summary">요약</TabsTrigger>
            <TabsTrigger value="contract">계약 정보</TabsTrigger>
            <TabsTrigger value="parties">당사자</TabsTrigger>
            <TabsTrigger value="documents">문서 허브</TabsTrigger>
            <TabsTrigger value="deal">거래 정보</TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-6">
            <TabsContent value="summary" className="m-0 space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricTile label="총 거래금액" value={formatPrice(Number(form.totalPrice || 0))} />
                <MetricTile label="문서 수" value={`${contract.documentCount ?? 0}건`} />
                <MetricTile
                  label="계약 상태"
                  value={statusMeta[form.status]?.label ?? form.status}
                />
                <MetricTile
                  label="자료 누락"
                  value={`${contract.missingDocumentCount ?? 0}건`}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="gap-4 py-5">
                  <CardHeader className="px-5">
                    <CardTitle className="text-base">계약 요약</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-5">
                    <SummaryRow label="계약일" value={formatDate(contract.contractDate)} />
                    <SummaryRow
                      label="거래 유형"
                      value={transactionTypeMeta[form.transactionType]?.label ?? form.transactionType}
                    />
                    <SummaryRow label="매수인/임차인" value={contract.buyerContact?.name ?? '-'} />
                    <SummaryRow label="매도인/임대인" value={contract.sellerContact?.name ?? '-'} />
                    <SummaryRow label="금액" value={formatPrice(Number(form.totalPrice || 0))} />
                  </CardContent>
                </Card>

                <Card className="gap-4 py-5">
                  <CardHeader className="px-5">
                    <CardTitle className="text-base">문서 준비</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-5">
                    <SummaryRow label="필수 문서" value={`${contract.requiredDocumentTemplates?.length ?? 0}건`} />
                    <SummaryRow label="작성 문서" value={`${contract.documentCount ?? 0}건`} />
                    <SummaryRow label="누락 문서" value={`${contract.missingDocumentCount ?? 0}건`} />
                    <SummaryRow label="최근 수정" value={formatDateTime(contract.updatedAt)} />
                  </CardContent>
                </Card>
              </div>

              {form.specialTerms ? (
                <Card className="gap-4 py-5">
                  <CardHeader className="px-5">
                    <CardTitle className="text-base">특약 미리보기</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5">
                    <ContractRichTextView
                      value={form.specialTerms}
                      className="text-sm leading-6 text-muted-foreground"
                    />
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            <TabsContent value="contract" className="m-0 space-y-4">
              <Card className="gap-4 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-base">계약 기본 정보</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 px-5 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-2">
                    <Label>계약 상태</Label>
                    <Select
                      value={form.status}
                      onValueChange={(value) => onFormChange((prev) => ({ ...prev, status: value }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="상태 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusMeta).map(([key, meta]) => (
                          <SelectItem key={key} value={key}>
                            {meta.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>거래 유형</Label>
                    <Select
                      value={form.transactionType}
                      onValueChange={(value) =>
                        onFormChange((prev) => ({ ...prev, transactionType: value }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="유형 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTRACT_TRANSACTION_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <StaticField label="매수인/임차인" value={contract.buyerContact?.name ?? '-'} />
                  <StaticField label="매도인/임대인" value={contract.sellerContact?.name ?? '-'} />

                  <NumberField
                    label="총 거래금액"
                    value={form.totalPrice}
                    onChange={(value) => onFormChange((prev) => ({ ...prev, totalPrice: value }))}
                    suffix="만원"
                  />

                  <NumberField
                    label="월세"
                    value={form.monthlyRent}
                    onChange={(value) => onFormChange((prev) => ({ ...prev, monthlyRent: value }))}
                    suffix="만원"
                    disabled={form.transactionType !== 'monthly'}
                  />

                  <div className="space-y-2">
                    <Label>계약일</Label>
                    <Input
                      type="date"
                      value={form.contractDate}
                      onChange={(event) =>
                        onFormChange((prev) => ({ ...prev, contractDate: event.target.value }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="gap-4 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-base">지급 일정</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 px-5 md:grid-cols-2 xl:grid-cols-4">
                  <PaymentFieldGroup
                    title="계약금 (계약서 명목)"
                    amount={form.statedDeposit}
                    onAmountChange={(value) =>
                      onFormChange((prev) => ({ ...prev, statedDeposit: value }))
                    }
                  />
                  <PaymentFieldGroup
                    title="중도금 (계약서 명목)"
                    amount={form.statedInterimPayment}
                    date={form.statedInterimDate}
                    onAmountChange={(value) =>
                      onFormChange((prev) => ({ ...prev, statedInterimPayment: value }))
                    }
                    onDateChange={(value) =>
                      onFormChange((prev) => ({ ...prev, statedInterimDate: value }))
                    }
                  />
                  <PaymentFieldGroup
                    title="잔금 (계약서 명목)"
                    amount={form.statedBalance}
                    date={form.statedBalanceDate}
                    onAmountChange={(value) =>
                      onFormChange((prev) => ({ ...prev, statedBalance: value }))
                    }
                    onDateChange={(value) =>
                      onFormChange((prev) => ({ ...prev, statedBalanceDate: value }))
                    }
                  />

                  <div className="space-y-4 rounded-xl border border-border/60 p-4">
                    <div className="space-y-2">
                      <Label>입주일</Label>
                      <Input
                        type="date"
                        value={form.moveInDate}
                        onChange={(event) =>
                          onFormChange((prev) => ({ ...prev, moveInDate: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>임대 시작일</Label>
                      <Input
                        type="date"
                        value={form.leaseStartDate}
                        onChange={(event) =>
                          onFormChange((prev) => ({ ...prev, leaseStartDate: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>임대 종료일</Label>
                      <Input
                        type="date"
                        value={form.leaseEndDate}
                        onChange={(event) =>
                          onFormChange((prev) => ({ ...prev, leaseEndDate: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="gap-4 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-base">특약 및 메모</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 px-5">
                  <div className="space-y-2">
                    <Label>특약사항</Label>
                    <RichTextEditor
                      value={form.specialTerms}
                      onChange={(html) =>
                        onFormChange((prev) => ({ ...prev, specialTerms: html }))
                      }
                      placeholder="특약사항을 입력하세요"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>내부 메모</Label>
                    <Textarea
                      rows={4}
                      value={form.memo}
                      onChange={(event) =>
                        onFormChange((prev) => ({ ...prev, memo: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>기타 첨부 URL</Label>
                    <Textarea
                      rows={4}
                      value={form.attachmentsText}
                      onChange={(event) =>
                        onFormChange((prev) => ({
                          ...prev,
                          attachmentsText: event.target.value,
                        }))
                      }
                      placeholder="https://...pdf"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="parties" className="m-0">
              <ContractPartiesCard contract={contract} />
            </TabsContent>

            <TabsContent value="documents" className="m-0">
              <DocumentHub
                contract={contract}
                templates={availableTemplates}
                isLoading={isDocumentTemplatesLoading}
                onOpenDocument={onOpenDocument}
                onCopyDocument={onCopyDocument}
                isCopyingDocument={isCopyingDocument}
                onDeleteDocument={onDeleteDocument}
                isDeletingDocument={isDeletingDocument}
              />
            </TabsContent>

            <TabsContent value="deal" className="m-0">
              <Card className="gap-4 py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-base">연결 거래 정보</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 px-5 text-sm md:grid-cols-2">
                  <SummaryRow
                    label="매물"
                    value={contract.deal?.property?.site?.name ?? '-'}
                  />
                  <SummaryRow
                    label="호실"
                    value={contract.deal?.property?.unit?.name ?? '-'}
                  />
                  <SummaryRow
                    label="거래 단계"
                    value={contract.deal?.stage ?? '-'}
                  />
                  <SummaryRow
                    label="거래 메모"
                    value={contract.deal?.memo ?? '-'}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function DocumentHub({
  contract,
  templates,
  isLoading,
  onOpenDocument,
  onCopyDocument,
  isCopyingDocument,
  onDeleteDocument,
  isDeletingDocument,
}: {
  contract: Contract;
  templates: ContractDocumentTemplate[];
  isLoading: boolean;
  onOpenDocument: (
    template: ContractDocumentTemplate,
    document?: ContractDocument,
  ) => void;
  onCopyDocument: (documentId: string) => void;
  isCopyingDocument: boolean;
  onDeleteDocument: (documentId: string) => void;
  isDeletingDocument: boolean;
}) {
  const documents = sortContractDocuments(contract.documents ?? []);
  const rows = templates.map((template) => ({
    template,
    document: findDocumentByTemplate(contract.documents ?? [], template.id),
  }));
  const requiredRows = rows.filter(({ template }) => template.isRequired);
  const optionalRows = rows.filter(({ template }) => !template.isRequired);

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="size-4" />
              문서 허브
            </CardTitle>
            <CardDescription>
              필수 문서 {requiredRows.length}건 · 누락 {contract.missingDocumentCount ?? 0}건
            </CardDescription>
          </div>
          <Badge variant={(contract.missingDocumentCount ?? 0) > 0 ? 'outline' : 'secondary'}>
            {(contract.missingDocumentCount ?? 0) > 0 ? '확인 필요' : '준비 완료'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 px-5">
        <ContractDocumentListTable
          documents={documents}
          templates={templates}
          onOpenDocument={onOpenDocument}
          onCopyDocument={onCopyDocument}
          isCopyingDocument={isCopyingDocument}
          onDeleteDocument={onDeleteDocument}
          isDeletingDocument={isDeletingDocument}
        />
        <DocumentRowsTable
          title="필수 문서"
          rows={requiredRows}
          emptyText={isLoading ? '문서 템플릿을 불러오는 중입니다.' : '필수 문서가 없습니다.'}
          onOpenDocument={onOpenDocument}
        />
        <DocumentRowsTable
          title="선택 문서"
          rows={optionalRows}
          emptyText={isLoading ? '문서 템플릿을 불러오는 중입니다.' : '선택 문서가 없습니다.'}
          onOpenDocument={onOpenDocument}
        />
      </CardContent>
    </Card>
  );
}

/**
 * 작성된 문서 목록 — sortOrder(묶음 내 탭 순서) → kindOrder(동일 서식 반복 순번)
 * 정렬 표시. "사본"은 같은 서식의 다음 kindOrder 를 자동 부여한다 (위임장 2장 케이스).
 */
function ContractDocumentListTable({
  documents,
  templates,
  onOpenDocument,
  onCopyDocument,
  isCopyingDocument,
  onDeleteDocument,
  isDeletingDocument,
}: {
  documents: ContractDocument[];
  templates: ContractDocumentTemplate[];
  onOpenDocument: (
    template: ContractDocumentTemplate,
    document?: ContractDocument,
  ) => void;
  onCopyDocument: (documentId: string) => void;
  isCopyingDocument: boolean;
  onDeleteDocument: (documentId: string) => void;
  isDeletingDocument: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">작성된 문서</p>
        <span className="text-xs text-muted-foreground">{documents.length}건</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">순서</TableHead>
              <TableHead>문서</TableHead>
              <TableHead className="w-24">분류</TableHead>
              <TableHead className="w-24">상태</TableHead>
              <TableHead className="w-52 text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((document) => (
              <TableRow key={document.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {document.sortOrder + 1}
                  {document.kindOrder > 1 ? ` · ${document.kindOrder}부` : ''}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-5">
                      {document.title}
                      {document.kindOrder > 1 ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({document.kindOrder})
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {document.kind ?? document.template?.code ?? '-'}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">
                    {documentCategoryLabels[document.category] ?? document.category}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      'border-0',
                      documentStatusMeta[document.status]?.className,
                    )}
                  >
                    {documentStatusMeta[document.status]?.label ?? document.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onOpenDocument(resolveDocumentTemplate(document, templates), document)
                      }
                    >
                      <FilePenLine className="size-3.5" />
                      수정
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isCopyingDocument}
                      onClick={() => onCopyDocument(document.id)}
                    >
                      <Copy className="size-3.5" />
                      사본
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:text-rose-700"
                      disabled={isDeletingDocument}
                      onClick={() => onDeleteDocument(document.id)}
                    >
                      <Trash2 className="size-3.5" />
                      삭제
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                  아직 작성된 문서가 없습니다. 아래 서식 목록에서 작성하세요.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DocumentRowsTable({
  title,
  rows,
  emptyText,
  onOpenDocument,
}: {
  title: string;
  rows: Array<{
    template: ContractDocumentTemplate;
    document?: ContractDocument;
  }>;
  emptyText: string;
  onOpenDocument: (
    template: ContractDocumentTemplate,
    document?: ContractDocument,
  ) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <span className="text-xs text-muted-foreground">{rows.length}건</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>문서</TableHead>
              <TableHead className="w-24">상태</TableHead>
              <TableHead className="w-20 text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ template, document }) => (
              <TableRow key={template.id}>
                <TableCell className="whitespace-normal">
                  <div className="flex min-w-0 items-start gap-2">
                    {document ? (
                      <FileCheck2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-5">{template.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {template.code}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      'border-0',
                      document
                        ? documentStatusMeta[document.status]?.className
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {document
                      ? documentStatusMeta[document.status]?.label ?? document.status
                      : '대기'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant={document ? 'outline' : 'default'}
                    onClick={() => onOpenDocument(template, document)}
                  >
                    <FilePenLine className="size-3.5" />
                    {document ? '수정' : '작성'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-20 text-center text-sm text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DocumentEditorSheet({
  open,
  form,
  error,
  isSaving,
  isDirty,
  onOpenChange,
  onFormChange,
  onSave,
  onSaveAsNew,
}: {
  open: boolean;
  form: DocumentEditorForm;
  error: string | null;
  isSaving: boolean;
  isDirty: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: Dispatch<SetStateAction<DocumentEditorForm>>;
  onSave: () => void;
  onSaveAsNew: () => void;
}) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  // metadata.documentEngine.fieldGroups 구동 (draft 빌드 시 appliesTo 필터 적용됨).
  // 없으면 기존 category 공통 그룹 fallback.
  const fieldGroups =
    form.fieldGroups.length > 0
      ? form.fieldGroups
      : getContractDocumentEngineFieldGroups(form.category);
  // 문서 제목은 에디터 셸(사이드바)에 고정 배치하므로 그룹에서는 제외 (§3.1 제목 콤보)
  const visibleFieldGroups = fieldGroups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => field.key !== 'documentTitle'),
    }))
    .filter((group) => group.fields.length > 0);
  // 당사자 반복 렌더 (공동 N명 + 대리인 중첩 + 사무소/공동중개 행)
  // + metadata fieldGroups 서식별 필드도 그룹 섹션으로 함께 출력
  const sections = getContractDocumentEngineSections(form.category, form.engineFields, {
    parties: form.parties.length > 0 ? form.parties : undefined,
    fieldGroups,
  });
  const documentTitle = form.engineFields.documentTitle || form.title || '계약 문서';
  // 기존 문서 수정은 변경이 있어야 저장 활성화 (§3.1 enableSaveButton 대응).
  // 신규 문서는 기본값 그대로도 저장(생성) 가능해야 하므로 dirty 를 요구하지 않는다.
  const isSaveDisabled =
    isSaving ||
    !documentTitle ||
    !form.category ||
    (Boolean(form.documentId) && !isDirty);

  function updateEngineField(
    key: string,
    value: string,
    field?: ContractDocumentEngineFieldDefinition,
  ) {
    onFormChange((prev) => {
      const nextFields: ContractDocumentEngineFields = {
        ...prev.engineFields,
        [key]: value,
      };

      // 한글 병기 파생값 동기화 ("일금 삼억오천만원정 (₩350,000,000)").
      // amount 필드뿐 아니라 공통(fallback) 그룹의 금액 텍스트 필드
      // (totalPriceText/monthlyRentText)도 병기 시블링이 있으면 함께 갱신한다.
      const manwon = parseContractManwonText(value);
      const hangul =
        manwon !== null && manwon > 0 ? formatContractAmountWithWon(manwon) : '';

      if (field?.inputType === 'amount') {
        nextFields[`${key}HangulText`] = hangul;

        // 주 금액 필드(salePrice/deposit/monthlyRent)는 프리뷰 공통
        // '거래 조건' 행(totalPriceText/monthlyRentText)에도 반영한다.
        const mirrorKey = PRIMARY_AMOUNT_MIRRORS[key];
        if (mirrorKey && prev.engineFields[mirrorKey] !== undefined) {
          nextFields[mirrorKey] = manwon !== null && manwon > 0 ? formatPrice(manwon) : '';
          nextFields[`${mirrorKey.slice(0, -'Text'.length)}HangulText`] = hangul;
        }
      } else {
        const hangulKey = key.endsWith('Text')
          ? `${key.slice(0, -'Text'.length)}HangulText`
          : `${key}HangulText`;
        if (prev.engineFields[hangulKey] !== undefined) {
          nextFields[hangulKey] = hangul;
        }
      }

      // 임대차 개월수 ↔ 만기일 양방향 파생 (레거시 setRentMonth)
      applyLeasePeriodDerivation(nextFields, key, value);

      return { ...prev, engineFields: nextFields };
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-[calc(100vw-24px)] gap-0 overflow-hidden p-0 sm:max-w-none xl:w-[calc(100vw-64px)]"
        >
          <SheetHeader className="border-b px-6 py-5">
            <div className="flex items-start justify-between gap-6 pr-8">
              <div className="space-y-1">
                <SheetTitle>{form.workflow.formTitle}</SheetTitle>
                <SheetDescription>
                  {form.workflow.inputFormName} · {form.workflow.reportName}
                </SheetDescription>
              </div>
              <Badge className={cn('border-0', documentStatusMeta[form.status]?.className)}>
                {documentStatusMeta[form.status]?.label ?? form.status}
              </Badge>
            </div>
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="grid min-h-full gap-5 bg-slate-100/70 p-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
              <main className="min-w-0 space-y-4">
                <section className="rounded-lg border border-border/60 bg-background p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold tracking-tight">
                        문서별 입력폼
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        값을 입력한 뒤 출력 미리보기에서 리포트 형태를 확인합니다.
                      </p>
                    </div>
                    <Badge variant="outline">{form.workflow.inputFormName}</Badge>
                  </div>
                </section>

                {visibleFieldGroups.map((group) => (
                  <DocumentInputFormSection
                    // documentId 를 key 에 포함 — 다른 문서로 전환 시 컨트롤의
                    // 로컬 상태(금액 단위 토글 등)가 이월되지 않도록 리마운트
                    key={`${form.documentId ?? 'new'}:${group.key ?? group.title}`}
                    title={group.title}
                    fields={group.fields}
                    values={form.engineFields}
                    onFieldChange={updateEngineField}
                  />
                ))}
              </main>

              <aside className="space-y-4">
                <section className="rounded-lg border border-border/60 bg-background p-4">
                  <p className="text-sm font-medium">출력 리포트</p>
                  <div className="mt-3 space-y-2">
                    <SummaryRow label="입력폼" value={form.workflow.inputFormName} />
                    <SummaryRow label="리포트" value={form.workflow.reportName} />
                    <SummaryRow
                      label="분류"
                      value={documentCategoryLabels[form.category] ?? form.category}
                    />
                    <SummaryRow
                      label="상태"
                      value={documentStatusMeta[form.status]?.label ?? form.status}
                    />
                  </div>
                  <Button
                    type="button"
                    className="mt-4 w-full"
                    onClick={() => setIsPreviewOpen(true)}
                  >
                    <FileText className="size-4" />
                    출력 미리보기
                  </Button>
                </section>

                <section className="rounded-lg border border-border/60 bg-background p-4">
                  <p className="text-sm font-medium">문서 설정</p>
                  <div className="mt-4 grid gap-4">
                    <div className="space-y-2">
                      <Label>문서 제목</Label>
                      <Input
                        value={form.engineFields.documentTitle ?? ''}
                        onChange={(event) =>
                          updateEngineField('documentTitle', event.target.value)
                        }
                        placeholder="비우면 서식명이 사용됩니다"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>문서 상태</Label>
                      <Select
                        value={form.status}
                        onValueChange={(value) =>
                          onFormChange((prev) => ({ ...prev, status: value }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="상태 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(documentStatusMeta).map(([key, meta]) => (
                            <SelectItem key={key} value={key}>
                              {meta.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>작업 유형</Label>
                      <Select
                        value={form.type}
                        onValueChange={(value) =>
                          onFormChange((prev) => ({ ...prev, type: value }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="유형 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="generated">작성</SelectItem>
                          <SelectItem value="uploaded">첨부</SelectItem>
                          <SelectItem value="external">외부 제출</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>파일 URL</Label>
                      <Input
                        value={form.fileUrl}
                        onChange={(event) =>
                          onFormChange((prev) => ({ ...prev, fileUrl: event.target.value }))
                        }
                        placeholder="https://...pdf"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>내부 메모</Label>
                      <Textarea
                        rows={4}
                        value={form.memo}
                        onChange={(event) =>
                          onFormChange((prev) => ({ ...prev, memo: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                </section>

                <ClauseTemplateToolsSection
                  contractKind={form.kind}
                  transactionType={form.transactionType}
                  specialTerms={form.engineFields.specialTerms ?? ''}
                  onInsert={(content) =>
                    // 특약은 rich text — 템플릿(plain text)을 문단 HTML 로 이어붙임
                    updateEngineField(
                      'specialTerms',
                      appendContractRichText(
                        form.engineFields.specialTerms,
                        content,
                      ),
                    )
                  }
                />

                {error ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {error}
                  </p>
                ) : null}
              </aside>
            </div>
          </ScrollArea>

          <SheetFooter className="border-t px-6 py-4">
            <div className="flex flex-row justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                닫기
              </Button>
              <Button variant="outline" onClick={() => setIsPreviewOpen(true)}>
                출력 미리보기
              </Button>
              {form.documentId ? (
                <Button
                  variant="outline"
                  onClick={onSaveAsNew}
                  disabled={isSaving || !documentTitle || !form.category}
                >
                  다른 이름으로 저장
                </Button>
              ) : null}
              <Button onClick={onSave} disabled={isSaveDisabled}>
                저장
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none xl:w-[1040px]">
          <div className="border-b px-6 py-5">
            <DialogHeader>
              <DialogTitle>{form.workflow.previewTitle}</DialogTitle>
              <DialogDescription>{form.workflow.reportName}</DialogDescription>
            </DialogHeader>
          </div>
          <ScrollArea className="min-h-0 flex-1 bg-slate-100/70">
            <div className="p-6">
              <ContractDocumentPage
                title={documentTitle}
                templateCode={form.workflow.reportName}
                status={documentStatusMeta[form.status]?.label ?? form.status}
                fields={form.engineFields}
                sections={sections}
              />
            </div>
          </ScrollArea>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              닫기
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="size-4" />
              인쇄
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 특약/조항 도구 (레거시 특약 가져오기/등록 대응, M2 #3 부분).
 * 사무소 ContractClauseTemplate(special_terms_clause)을 특약사항에 삽입하고,
 * 현재 특약을 템플릿으로 등록한다. 리치 텍스트 편집은 후속 단계.
 */
function ClauseTemplateToolsSection({
  contractKind,
  transactionType,
  specialTerms,
  onInsert,
}: {
  contractKind: string | null;
  transactionType: string;
  specialTerms: string;
  onInsert: (content: string) => void;
}) {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState('');

  const { data: clauseTemplates = [], isLoading } = useQuery({
    queryKey: ['contract-clause-templates', 'special_terms_clause'],
    queryFn: () => api.contracts.clauseTemplates({ type: 'special_terms_clause' }),
  });

  // 현재 서식(kind)/거래유형과 맞는 템플릿을 앞에 정렬 (무관 템플릿도 뒤에 노출)
  const sortedTemplates = useMemo(() => {
    function rank(template: ContractClauseTemplate) {
      const kindMatch =
        !template.contractKind || template.contractKind === contractKind;
      const typeMatch =
        template.transactionTypes.length === 0 ||
        (transactionType !== '' &&
          template.transactionTypes.includes(transactionType));
      return (kindMatch ? 0 : 2) + (typeMatch ? 0 : 1);
    }

    return [...clauseTemplates].sort(
      (left, right) => rank(left) - rank(right) || left.sortOrder - right.sortOrder,
    );
  }, [clauseTemplates, contractKind, transactionType]);

  // 템플릿 content 는 plain text 로 저장 (HTML 특약은 텍스트 추출) —
  // 목록 미리보기·web 등 다른 소비처와의 호환 유지
  const specialTermsPlainText = contractRichTextToPlainText(specialTerms).trim();

  const registerMutation = useMutation({
    mutationFn: () =>
      api.contracts.createClauseTemplate({
        type: 'special_terms_clause',
        contractKind: contractKind ?? null,
        transactionTypes: transactionType ? [transactionType] : [],
        title: newTitle.trim(),
        content: specialTermsPlainText,
      }),
    onSuccess: () => {
      setNewTitle('');
      queryClient.invalidateQueries({ queryKey: ['contract-clause-templates'] });
    },
  });

  return (
    <section className="rounded-lg border border-border/60 bg-background p-4">
      <p className="text-sm font-medium">특약 문구</p>
      <p className="mt-1 text-xs text-muted-foreground">
        사무소 특약 템플릿을 특약사항에 삽입하거나, 현재 특약을 템플릿으로
        등록합니다.
      </p>
      <div className="mt-3 space-y-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              <BookMarked className="size-3.5" />
              특약 가져오기
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-2" align="end">
            {isLoading ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                불러오는 중...
              </p>
            ) : sortedTemplates.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                등록된 특약 템플릿이 없습니다.
              </p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {sortedTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
                    onClick={() => onInsert(template.content)}
                  >
                    <span className="block text-sm font-medium">{template.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {template.content}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
        <div className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="템플릿 이름"
            className="h-8"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={
              !newTitle.trim() || !specialTermsPlainText || registerMutation.isPending
            }
            onClick={() => registerMutation.mutate()}
          >
            등록
          </Button>
        </div>
      </div>
    </section>
  );
}

function DocumentInputFormSection({
  title,
  fields,
  values,
  onFieldChange,
}: {
  title: string;
  fields: ContractDocumentEngineFieldDefinition[];
  values: ContractDocumentEngineFields;
  onFieldChange: (
    key: string,
    value: string,
    field?: ContractDocumentEngineFieldDefinition,
  ) => void;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-background p-5">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <div
            key={field.key}
            className={
              field.multiline || field.inputType === 'textarea'
                ? 'md:col-span-2 xl:col-span-3'
                : ''
            }
          >
            <DocumentEngineFieldControl
              field={field}
              value={values[field.key] ?? ''}
              onChange={(value) => onFieldChange(field.key, value, field)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/** 만원 단위 정수 파싱 — 숫자가 아니거나 음수/소수면 null */
function parseManwonInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  if (!Number.isInteger(parsed) || parsed < 0 || !Number.isSafeInteger(parsed)) {
    return null;
  }
  return parsed;
}

/**
 * 서식 필드 타입별 입력 컨트롤 (template.metadata fieldGroups 의 inputType 구동).
 * - amount: 만원 숫자 입력 + 실시간 한글 병기 미리보기
 * - number: 숫자 입력 (+unit 접미)
 * - date / select / checkbox / textarea / text
 * checkbox 는 엔진 필드가 전부 string 이므로 'true'/'' 관례를 따른다.
 */
/** 엔진이 라벨에 붙인 단위 접미("매매대금 (만원)")를 입력 접미와 중복되지 않게 제거 */
function stripUnitSuffix(label: string, unit: string | undefined): string {
  if (!unit) return label;
  const suffix = ` (${unit})`;
  return label.endsWith(suffix) ? label.slice(0, -suffix.length) : label;
}

function DocumentEngineFieldControl({
  field,
  value,
  onChange,
}: {
  field: ContractDocumentEngineFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputType = field.inputType ?? (field.multiline ? 'textarea' : 'text');

  if (inputType === 'checkbox') {
    return (
      <div className="flex h-full min-h-9 items-center gap-2 pt-5">
        <Checkbox
          id={`engine-field-${field.key}`}
          checked={value === 'true'}
          onCheckedChange={(checked) => onChange(checked === true ? 'true' : '')}
        />
        <Label htmlFor={`engine-field-${field.key}`} className="cursor-pointer">
          {field.label}
        </Label>
      </div>
    );
  }

  if (inputType === 'select') {
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <Select
          value={value || undefined}
          onValueChange={(next) => onChange(next)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="선택" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (inputType === 'date') {
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <Input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {/* 날짜 편의 버튼 — 레거시 인도일 +1/+2/+3월 대응 (기준: 입력값, 없으면 오늘) */}
        <div className="flex gap-1">
          {[1, 2, 3].map((months) => (
            <Button
              key={months}
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                const base = parseDateInputValue(value) ?? new Date();
                onChange(toDateInputValue(addMonthsToDate(base, months)));
              }}
            >
              +{months}개월
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (inputType === 'amount') {
    return <AmountEngineFieldControl field={field} value={value} onChange={onChange} />;
  }

  if (inputType === 'number') {
    return (
      <div className="space-y-2">
        <Label>{stripUnitSuffix(field.label, field.unit)}</Label>
        <div className="relative">
          <Input
            inputMode="numeric"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={field.unit ? 'pr-14' : undefined}
          />
          {field.unit ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {field.unit}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  // 특약사항은 rich text (레거시 Rider_Part HTML) — TipTap 에디터로 편집
  if (field.key === 'specialTerms') {
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <RichTextEditor value={value} onChange={onChange} />
      </div>
    );
  }

  if (inputType === 'textarea' || field.multiline) {
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <Textarea
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

type AmountInputUnit = 'man' | 'cheon' | 'won';

const AMOUNT_UNIT_LABELS: Record<AmountInputUnit, string> = {
  man: '만원',
  cheon: '천원',
  won: '원',
};

/** 선택 단위 입력값 → 만원 정수 (만원 정수로 환산 불가/소수/음수는 null) */
function parseUnitToManwon(raw: string, unit: AmountInputUnit): number | null {
  const digits = raw.trim().replace(/,/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const parsed = Number(digits);
  if (!Number.isSafeInteger(parsed)) return null;
  if (unit === 'man') return parsed;
  const divisor = unit === 'cheon' ? 10 : 10000;
  return parsed % divisor === 0 ? parsed / divisor : null;
}

/** 저장값(만원 정수) → 선택 단위 표시 문자열 */
function formatManwonInUnit(manwon: number, unit: AmountInputUnit): string {
  if (unit === 'man') return String(manwon);
  return String(manwon * (unit === 'cheon' ? 10 : 10000));
}

/**
 * 금액 입력 컨트롤 — 만/천/원 단위 토글 (레거시 Cost_Unit 라디오 대응, M2 #2).
 * 저장값은 항상 만원 단위 정수 문자열이며, 토글은 입력 해석/표시만 바꾼다.
 */
function AmountEngineFieldControl({
  field,
  value,
  onChange,
}: {
  field: ContractDocumentEngineFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  const [unit, setUnit] = useState<AmountInputUnit>('man');
  const [draft, setDraft] = useState<string | null>(null);

  const manwon = parseManwonInt(value);
  const displayValue =
    draft ?? (manwon !== null ? formatManwonInUnit(manwon, unit) : value);
  const isDraftInvalid =
    draft !== null &&
    draft.trim() !== '' &&
    parseUnitToManwon(draft, unit) === null;

  function handleChange(raw: string) {
    setDraft(raw);
    if (!raw.trim()) {
      onChange('');
      return;
    }
    const parsed = parseUnitToManwon(raw, unit);
    onChange(parsed !== null ? String(parsed) : '');
  }

  function handleUnitChange(next: AmountInputUnit) {
    setUnit(next);
    setDraft(null); // 저장값(만원) 기준으로 표시 재계산
  }

  return (
    <div className="space-y-2">
      <Label>{stripUnitSuffix(field.label, field.unit)}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            inputMode="numeric"
            value={displayValue}
            onChange={(event) => handleChange(event.target.value)}
            className="pr-11"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {AMOUNT_UNIT_LABELS[unit]}
          </span>
        </div>
        <Select
          value={unit}
          onValueChange={(next) => handleUnitChange(next as AmountInputUnit)}
        >
          <SelectTrigger className="w-20 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(AMOUNT_UNIT_LABELS) as AmountInputUnit[]).map((option) => (
              <SelectItem key={option} value={option}>
                {AMOUNT_UNIT_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {manwon !== null && manwon > 0 ? (
        <p className="text-xs text-muted-foreground">
          {formatContractAmountWithWon(manwon)}
        </p>
      ) : isDraftInvalid || (draft === null && value.trim()) ? (
        <p className="text-xs text-rose-600">
          만원 단위 정수로 환산되는 금액을 입력해주세요.
        </p>
      ) : null}
    </div>
  );
}

function ContractDocumentPage({
  title,
  templateCode,
  status,
  fields,
  sections,
}: {
  title: string;
  templateCode: string;
  status: string;
  fields: ContractDocumentEngineFields;
  sections: ReturnType<typeof getContractDocumentEngineSections>;
}) {
  return (
    <div className="mx-auto min-h-[1123px] w-full max-w-[794px] border border-slate-200 bg-white px-14 py-12 text-slate-950 shadow-sm print:shadow-none">
      <div className="flex items-start justify-between gap-4 text-[11px] text-slate-500">
        <span>{templateCode || 'contract-document'}</span>
        <span>{status}</span>
      </div>

      <header className="mt-10 text-center">
        <h2 className="text-2xl font-semibold tracking-normal">{title}</h2>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          본 문서는 계약 정보와 문서별 입력값을 기준으로 작성되었습니다.
        </p>
      </header>

      <div className="mt-10 rounded-md border border-slate-300">
        <DocumentPreviewRow label="작성일" value={fields.writtenDate} />
        <DocumentPreviewRow label="거래유형" value={fields.transactionTypeText} />
        <DocumentPreviewRow label="대상물" value={fields.propertyLabel} />
      </div>

      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.title} className="break-inside-avoid">
            <h3 className="border-b border-slate-900 pb-2 text-sm font-semibold">
              {section.title}
            </h3>
            <div className="mt-3 rounded-md border border-slate-300">
              {section.rows.map((row, rowIndex) => (
                <DocumentPreviewRow
                  // 당사자 반복 행은 라벨이 중복될 수 있어 index 를 key 에 포함
                  key={`${section.title}-${rowIndex}-${row.label}`}
                  label={row.label}
                  value={row.value}
                  multiline={row.multiline}
                  html={row.html}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-14 grid gap-6 text-sm sm:grid-cols-2">
        <SignatureBlock role={fields.partyOneRole} name={fields.partyOneName} />
        <SignatureBlock role={fields.partyTwoRole} name={fields.partyTwoName} />
      </div>
    </div>
  );
}

function DocumentPreviewRow({
  label,
  value,
  multiline,
  html,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  /** value \uAC00 \uD2B9\uC57D rich text HTML \u2014 DOMPurify \uC0C8\uB2C8\uD0C0\uC774\uC988 \uD6C4 HTML \uB80C\uB354 */
  html?: boolean;
}) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] border-b border-slate-200 last:border-b-0">
      <div className="bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
        {label}
      </div>
      {html ? (
        <div
          className={cn(
            'min-h-9 px-3 py-2 text-sm leading-6',
            CONTRACT_RICH_TEXT_VIEW_CLASS,
          )}
          // \uBC18\uB4DC\uC2DC \uC0C8\uB2C8\uD0C0\uC774\uC988\uB97C \uAC70\uCE5C\uB2E4 \u2014 \uD2B9\uC57D HTML XSS \uBC29\uC5B4
          dangerouslySetInnerHTML={{ __html: sanitizeContractHtml(value) }}
        />
      ) : (
        <div
          className={cn(
            'min-h-9 px-3 py-2 text-sm leading-6',
            multiline ? 'whitespace-pre-wrap' : 'truncate',
          )}
        >
          {value || '\u00A0'}
        </div>
      )}
    </div>
  );
}

/**
 * \uD2B9\uC57D rich text \uD45C\uC2DC \uCEF4\uD3EC\uB10C\uD2B8 \u2014 HTML \uC774\uBA74 \uC0C8\uB2C8\uD0C0\uC774\uC988 \uD6C4 HTML \uB80C\uB354,
 * \uB808\uAC70\uC2DC plain text \uB294 \uAE30\uC874 whitespace-pre-wrap \uD45C\uC2DC\uB97C \uC720\uC9C0\uD55C\uB2E4.
 */
function ContractRichTextView({
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
        // \uBC18\uB4DC\uC2DC \uC0C8\uB2C8\uD0C0\uC774\uC988\uB97C \uAC70\uCE5C\uB2E4 \u2014 \uD2B9\uC57D HTML XSS \uBC29\uC5B4
        dangerouslySetInnerHTML={{ __html: sanitizeContractHtml(value) }}
      />
    );
  }

  return <p className={cn('whitespace-pre-wrap', className)}>{value}</p>;
}

function SignatureBlock({ role, name }: { role: string; name: string }) {
  return (
    <div className="rounded-md border border-slate-300 p-4">
      <p className="text-xs text-slate-500">{role}</p>
      <div className="mt-6 flex items-end justify-between gap-3">
        <span className="text-base font-medium">{name || '\u00A0'}</span>
        <span className="text-sm text-slate-500">(인)</span>
      </div>
    </div>
  );
}

function PaymentFieldGroup({
  title,
  amount,
  date,
  onAmountChange,
  onDateChange,
}: {
  title: string;
  amount: string;
  date?: string;
  onAmountChange: (value: string) => void;
  onDateChange?: (value: string) => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border/60 p-4">
      <p className="text-sm font-medium">{title}</p>
      <NumberField label="금액" value={amount} onChange={onAmountChange} suffix="만원" />
      {onDateChange ? (
        <div className="space-y-2">
          <Label>예정일</Label>
          <Input
            type="date"
            value={date ?? ''}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        계약서에 기재되는 명목 금액입니다. 실제 입금 이력은 거래 대금 탭에서 관리합니다.
      </p>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function NumberField({
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

function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex h-9 items-center rounded-md border border-border/60 bg-muted/30 px-3 text-sm">
        {value}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function emptyContractForm(): ContractForm {
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

function emptyDocumentEditorForm(): DocumentEditorForm {
  return {
    type: 'generated',
    category: 'contract',
    title: '',
    status: 'generated',
    fileUrl: '',
    memo: '',
    metadata: {},
    workflow: emptyDocumentEngineWorkflow(),
    engineFields: emptyDocumentEngineFields(),
    kind: null,
    sortOrder: undefined,
    kindOrder: undefined,
    fieldGroups: [],
    parties: [],
    transactionType: '',
  };
}

function toDocumentEditorForm(
  contract: Contract,
  template: ContractDocumentTemplate,
  document?: ContractDocument,
): DocumentEditorForm {
  // 부속 서식(계약서 이외 category)은 주 계약서 문서의 입력값(소재지·금액
  // 스케줄 등)을 기본값으로 승계한다 (§3.3-3, 레거시 getMainContractInfo)
  const primaryDocument =
    template.category !== 'contract'
      ? findPrimaryContractDocument(contract.documents ?? [], document?.id)
      : null;

  const draft = buildContractDocumentEngineDraft({
    contract,
    template,
    document,
    primaryDocument,
  });

  return {
    documentId: document?.id,
    templateId: template.id || document?.templateId || undefined,
    type: document?.type ?? 'generated',
    category: document?.category ?? template.category,
    title: draft.title,
    status: document?.status ?? 'generated',
    fileUrl: document?.fileUrl ?? '',
    memo: document?.memo ?? '',
    metadata: document?.metadata ?? template.metadata ?? {},
    workflow: draft.workflow,
    engineFields: draft.fields,
    // 신규 문서는 template.code 를 kind 로 전달 (서버가 sortOrder/kindOrder 자동 부여).
    // 템플릿 없는 문서(uploaded/external)는 합성 code 가 '' 이므로 null 유지
    // — category 등 자유 문자열이 kind 로 저장되지 않도록 (서버 400 방지).
    kind: document?.kind ?? (template.code || null),
    sortOrder: document?.sortOrder,
    kindOrder: document?.kindOrder,
    // metadata 구동 필드그룹 (appliesTo 는 contract.transactionType 기준 필터 적용됨)
    fieldGroups: draft.fieldGroups,
    parties: contract.parties ?? [],
    transactionType: contract.transactionType,
  };
}

/**
 * 주 계약서 문서 탐색 — category=contract, cancelled 제외, 현재 편집 중인
 * 문서 제외. sortOrder(탭 순서)가 가장 앞선 문서를 주 서식으로 본다.
 */
function findPrimaryContractDocument(
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

/** 문서 목록 정렬 — sortOrder(탭 순서) → kindOrder(동일 서식 반복 순번) */
function sortContractDocuments(documents: ContractDocument[]): ContractDocument[] {
  return [...documents].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.kindOrder - b.kindOrder ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * 문서의 템플릿 해석 — 템플릿 목록 → 문서 동봉 template → 문서 자체 정보 합성 순.
 * (거래유형 필터로 목록에 없는 템플릿으로 만든 문서도 편집 가능해야 함)
 * 합성 code 는 kind 가 없으면 '' — category('attachment' 등)를 kind 로 위장하면
 * 저장 시 서버 kind 검증(400)에 걸린다.
 */
function resolveDocumentTemplate(
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

function emptyDocumentEngineWorkflow(): ContractDocumentEngineWorkflow {
  return {
    inputFormName: 'ContractInputForm',
    reportName: 'AnnexedReport',
    formTitle: '계약 문서 입력',
    previewTitle: '계약 문서 출력 미리보기',
  };
}

function emptyDocumentEngineFields(): ContractDocumentEngineFields {
  return {
    documentTitle: '',
    writtenDate: '',
    contractDateText: '',
    propertyLabel: '',
    propertyAddress: '',
    propertyAreaText: '',
    partyOneRole: '',
    partyOneName: '',
    partyOneAddress: '',
    partyOnePhone: '',
    partyTwoRole: '',
    partyTwoName: '',
    partyTwoAddress: '',
    partyTwoPhone: '',
    transactionTypeText: '',
    totalPriceText: '',
    monthlyRentText: '',
    paymentSchedule: '',
    leasePeriod: '',
    moveInDateText: '',
    bodyText: '',
    legalBasisText: '',
    sourceNotice: '',
    specialTerms: '',
    officeNotice: '',
    confirmationMemo: '',
    receiptMemo: '',
    ledgerMemo: '',
    settlementMemo: '',
  };
}

function toContractForm(contract: Contract): ContractForm {
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

function getDealLabel(deal: Deal) {
  const propertyName = deal.property?.site?.name ?? '매물';
  const unitName = deal.property?.unit?.name ?? '호실 미지정';
  const buyer = deal.buyerContact?.name ?? '매수인 미지정';
  const seller = deal.sellerContact?.name ?? '매도인 미지정';
  return `${propertyName} ${unitName} · ${buyer} / ${seller}`;
}

function toOptionalNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toNullableNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringifyOptionalNumber(value: number | undefined) {
  return value === undefined ? '' : String(value);
}

function emptyDateToNull(value: string) {
  return value ? value : null;
}

function emptyStringToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function emptyStringToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function findDocumentByTemplate(
  documents: ContractDocument[],
  templateId: string,
) {
  return documents.find(
    (document) =>
      document.templateId === templateId && document.status !== 'cancelled',
  );
}

function toDateInput(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
