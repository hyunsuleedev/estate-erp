import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Copy,
  FileText,
  LayoutGrid,
  List,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  Contract,
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
import { mergeResidentialSaleAgreementMetadata } from '@estate-erp/shared';
import { mergeContractDocumentEngineMetadata } from './-document-engine';
import {
  BASE_CONTRACT_TRANSACTION_TYPES,
  ContractTransactionTypeBadge,
  CONTRACT_STATUS_OPTIONS,
  CONTRACT_TRANSACTION_TYPES,
  MetricTile,
  NumberField,
  SIGNED_OR_LATER,
  emptyContractForm,
  getContractProperty,
  getContractPropertyLabel,
  hasContractFile,
  stringifyOptionalNumber,
  toContractForm,
  toContractTransactionType,
  toOptionalNumber,
  todayInput,
  transactionReportStatusMeta,
  type ContractForm,
} from './-contract-shared';
import { ContractDetailCard } from './-contract-detail';
import {
  DocumentEditorSheet,
  emptyDocumentEditorForm,
  toDocumentEditorForm,
  type DocumentEditorForm,
} from './-document-editor';
import type { ContractDocumentEngineFields } from './-document-engine';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { sanitizeContractRichTextForSave } from '@/lib/contract-rich-text';
import { formatDate, formatDateTime, formatDday, formatMoney } from '@/lib/format';
import {
  EmptyState,
  FilterBar,
  FilterCount,
  FilterSearch,
  FilterSelect,
  PageHeader,
  StatusBadge,
} from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const DOC_FILTER_OPTIONS = [
  { value: 'missing', label: '자료 누락' },
  { value: 'ready', label: '준비 완료' },
  { value: 'hasFile', label: 'PDF/파일 있음' },
  { value: 'noFile', label: 'PDF/파일 없음' },
];

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

/** 목록 필터 상태 (레거시 DMLS001Q01 검색 조건 + v2 문서 준비 필터) */
type ContractListFilterState = {
  /** 서식 템플릿 코드 (레거시 Cntr_Clsf). '' = 전체 */
  kind: string;
  transactionType: string;
  status: string;
  /** 문서 준비 필터 — 서버 미지원, 현재 페이지에 클라이언트 적용 */
  docFilter: string;
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
    kind: '',
    transactionType: '',
    status: '',
    docFilter: '',
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
    kind: filters.kind || undefined,
    transactionType: filters.transactionType || undefined,
    status: filters.status || undefined,
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
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const appliedDealIdRef = useRef<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ContractListFilterState>(defaultListFilters());
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'docs'>('list');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDocumentEditorOpen, setIsDocumentEditorOpen] = useState(false);
  const [documentFormError, setDocumentFormError] = useState<string | null>(null);
  const [documentEditorForm, setDocumentEditorForm] = useState<DocumentEditorForm>(
    emptyDocumentEditorForm(),
  );
  /** 에디터 오픈 시점 스냅샷 — dirty tracking (미저장 변경 감지) */
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
  /** 상세 폼 — 페이지가 소유 (문서 편집기 전환으로 다이얼로그가 닫혀도 미저장 편집 유지) */
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

  // docFilter 는 클라이언트 필터 — 서버 요청 키에서 제외해 불필요한 재조회 방지
  const filterKey = JSON.stringify({ ...effectiveFilters, docFilter: '' });

  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  const contractsQuery = useQuery({
    queryKey: ['contracts', 'list', filterKey, page],
    queryFn: () =>
      api.contracts.findAllPaginated({
        ...toContractsFilter(effectiveFilters),
        page,
        limit: CONTRACTS_PAGE_SIZE,
      }),
  });

  const pageContracts = useMemo(
    () => contractsQuery.data?.items ?? [],
    [contractsQuery.data],
  );
  const pagination = contractsQuery.data?.pagination;

  // 계약 생성 다이얼로그의 "이미 계약된 거래 제외" + 상단 메트릭 계산용
  // 전체 목록 (필터 무관)
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
    return Array.from(seen, ([code, title]) => ({ value: code, label: title }));
  }, [allDocumentTemplates]);

  const detailQuery = useQuery({
    queryKey: ['contract', selectedContractId],
    queryFn: () => api.contracts.findOne(selectedContractId as string),
    enabled: !!selectedContractId,
  });
  const contractDetail = detailQuery.data;

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

  // '/' 키로 검색 포커스 (PRD 키보드 단축키)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchWrapRef.current?.querySelector('input')?.focus();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const metrics = useMemo(() => {
    const active = allContracts.filter(
      (contract) => !['registered', 'cancelled'].includes(contract.status),
    );
    const signed = allContracts.filter((contract) => SIGNED_OR_LATER.has(contract.status));
    const balancePending = allContracts.filter((contract) =>
      ['signed', 'depositPaid'].includes(contract.status),
    );
    const missingDocs = allContracts.filter(
      (contract) =>
        (contract.missingDocumentCount ?? 0) > 0 && contract.status !== 'cancelled',
    );

    return {
      active: active.length,
      signed: signed.length,
      balancePending: balancePending.length,
      missingDocs: missingDocs.length,
    };
  }, [allContracts]);

  // 문서 준비 필터 — 서버 미지원 조건이라 현재 페이지에만 적용
  const visibleContracts = useMemo(() => {
    const docFilter = effectiveFilters.docFilter;
    if (!docFilter) return pageContracts;

    return pageContracts.filter((contract) => {
      if (docFilter === 'missing') return (contract.missingDocumentCount ?? 0) > 0;
      if (docFilter === 'ready') return (contract.missingDocumentCount ?? 0) === 0;
      if (docFilter === 'hasFile') return hasContractFile(contract);
      if (docFilter === 'noFile') return !hasContractFile(contract);
      return true;
    });
  }, [pageContracts, effectiveFilters.docFilter]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateContractDto) => api.contracts.create(payload),
    onSuccess: (created) => {
      toast.success('계약을 생성했습니다.');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setSelectedContractId(created.id);
      setIsDetailOpen(true);
      setIsCreateOpen(false);
      appliedDealIdRef.current = null;
      setCreateForm({
        dealId: '',
        transactionType: 'sale',
        totalPrice: undefined,
        monthlyRent: undefined,
        contractDate: todayInput(),
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '계약을 생성하지 못했습니다.');
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
      toast.success('문서를 저장했습니다.');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', selectedContractId] });
      setIsDocumentEditorOpen(false);
      setDocumentEditorForm(emptyDocumentEditorForm());
      setDocumentEditorBaseline(null);
      // 문서 작업이 끝나면 계약 상세 워크스페이스로 복귀
      setIsDetailOpen(true);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : '문서를 저장하지 못했습니다.';
      setDocumentFormError(message);
      toast.error(message);
    },
  });

  // 계약 삭제 (레거시 §1.3 삭제 액션) — 문서/당사자/리비전 포함 영구 삭제 (DB cascade)
  const deleteContractMutation = useMutation({
    mutationFn: (contractId: string) => api.contracts.remove(contractId),
    onSuccess: (_result, contractId) => {
      toast.success('계약을 삭제했습니다.');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.removeQueries({ queryKey: ['contract', contractId] });
      if (selectedContractId === contractId) {
        setSelectedContractId(null);
        setIsDetailOpen(false);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '계약을 삭제하지 못했습니다.');
    },
  });

  // 계약 문서 세트 전체 사본 (레거시 "계약서/서식 복사")
  const copyContractMutation = useMutation({
    mutationFn: (contractId: string) => api.contracts.copyContract(contractId),
    onSuccess: (copied) => {
      toast.success('계약 문서 사본을 만들었습니다.');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', copied.id] });
      setSelectedContractId(copied.id);
      setIsDetailOpen(true);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : '계약 사본을 만들지 못했습니다.',
      );
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

  // 거래 선택 시 거래유형/금액 기본값 채움.
  // (기존 `prev.transactionType ?? ...` 폴백은 초기값 'sale'이 truthy라 동작하지 않던 버그 수정)
  useEffect(() => {
    if (!selectedCreateDeal || appliedDealIdRef.current === selectedCreateDeal.id) {
      return;
    }
    appliedDealIdRef.current = selectedCreateDeal.id;

    const transactionType = toContractTransactionType(selectedCreateDeal);
    setCreateForm((prev) => ({
      ...prev,
      transactionType,
      totalPrice:
        selectedCreateDeal.agreedPrice ??
        selectedCreateDeal.agreedDeposit ??
        selectedCreateDeal.listing?.price ??
        selectedCreateDeal.listing?.deposit ??
        undefined,
      monthlyRent:
        transactionType === 'monthly'
          ? selectedCreateDeal.agreedMonthlyRent ??
            selectedCreateDeal.listing?.monthlyRent ??
            undefined
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
    // dirty tracking — 오픈 시점 스냅샷 보관
    setDocumentEditorBaseline(JSON.stringify(nextForm));
    // 상세 폼 상태는 페이지가 소유하므로 다이얼로그를 닫아도 편집값이 유지된다
    setIsDetailOpen(false);
    setIsDocumentEditorOpen(true);
  }

  function openContractDetail(contractId: string) {
    setSelectedContractId(contractId);
    setIsDetailOpen(true);
  }

  // dirty tracking — 저장 버튼 활성화 + 닫기 시 미저장 확인
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

  /** 문서 편집기를 닫으면(저장 외 취소/ESC 포함) 계약 상세로 복귀 */
  function handleDocumentEditorOpenChange(nextOpen: boolean) {
    if (!nextOpen && isDocumentEditorDirty && !saveDocumentMutation.isPending) {
      const confirmed = window.confirm(
        '저장하지 않은 변경사항이 있습니다. 저장 없이 닫을까요?',
      );
      if (!confirmed) return;
    }
    setIsDocumentEditorOpen(nextOpen);
    if (!nextOpen) {
      setDocumentEditorForm(emptyDocumentEditorForm());
      setDocumentEditorBaseline(null);
      setDocumentFormError(null);
      if (selectedContractId) {
        setIsDetailOpen(true);
      }
    }
  }

  /** 상세 다이얼로그 닫기 — 미저장 변경이 있으면 확인 후 서버 상태로 리셋 */
  function handleDetailOpenChange(nextOpen: boolean) {
    if (!nextOpen && isDetailDirty && !isDocumentEditorOpen) {
      const confirmed = window.confirm(
        '저장하지 않은 계약 정보 변경이 있습니다. 저장 없이 닫을까요?',
      );
      if (!confirmed) return;
      // 폐기 확정 — 다음 오픈 때 서버 상태 기준으로 리셋
      if (contractDetail) setDetailForm(toContractForm(contractDetail));
    }
    setIsDetailOpen(nextOpen);
  }

  function deleteContract(contractId: string) {
    const confirmed = window.confirm(
      '계약과 소속 문서·당사자·수정 이력이 모두 영구 삭제되며 복구할 수 없습니다. 삭제할까요?',
    );
    if (!confirmed) return;
    deleteContractMutation.mutate(contractId);
  }

  /**
   * 문서 저장. saveAsNew=true 는 레거시 '다른저장' — 현재 편집 중인 값으로
   * 새 draft 문서를 생성한다 (같은 kind 는 서버가 kindOrder 자동 증가).
   */
  function saveDocument(saveAsNew = false) {
    setDocumentFormError(null);
    const savedAt = new Date().toISOString();

    // 특약은 rich text HTML — 저장 전 새니타이즈 (레거시 plain text 는 그대로)
    const engineFields: ContractDocumentEngineFields = {
      ...documentEditorForm.engineFields,
      specialTerms: sanitizeContractRichTextForSave(
        documentEditorForm.engineFields.specialTerms ?? '',
      ),
    };

    const engineMetadata = mergeContractDocumentEngineMetadata(
      documentEditorForm.metadata,
      engineFields,
    );
    const metadata = documentEditorForm.saleAgreement
      ? mergeResidentialSaleAgreementMetadata(
          engineMetadata,
          documentEditorForm.saleAgreement,
        )
      : engineMetadata;
    const title =
      documentEditorForm.engineFields.documentTitle.trim() || documentEditorForm.title;
    const status = saveAsNew ? 'draft' : documentEditorForm.status;

    saveDocumentMutation.mutate({
      documentId: saveAsNew ? undefined : documentEditorForm.documentId,
      dto: {
        templateId: documentEditorForm.templateId,
        type: documentEditorForm.type,
        category: documentEditorForm.category,
        title,
        status,
        // 서식 코드/순서 (레거시 Cntr_Clsf/Orde/Cntr_Clsf_Orde) — 신규는 kind 만
        // 전달해 서버가 sortOrder/kindOrder 를 자동 부여, 수정은 기존 값 보존.
        // 템플릿 없는 문서(uploaded/external, kind=null)는 kind 를 보내지 않는다
        // — category 등 자유 문자열이 서버 kind 검증(400)에 걸리지 않도록.
        kind: documentEditorForm.kind || undefined,
        sortOrder: saveAsNew ? undefined : documentEditorForm.sortOrder,
        kindOrder: saveAsNew ? undefined : documentEditorForm.kindOrder,
        fileUrl: documentEditorForm.fileUrl.trim() || undefined,
        signedAt:
          status === 'signed'
            ? documentEditorForm.signedAt || savedAt
            : documentEditorForm.signedAt || undefined,
        submittedAt:
          status === 'submitted'
            ? documentEditorForm.submittedAt || savedAt
            : documentEditorForm.submittedAt || undefined,
        memo: documentEditorForm.memo.trim() || null,
        metadata,
      },
    });
  }

  const isFiltered = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(defaultListFilters()),
    [filters],
  );

  return (
    <div className="flex flex-col">
      <PageHeader
        title="계약"
        description="거래에서 이어지는 계약 일정과 문서 상태를 계약 단위로 관리합니다."
        actions={
          <Button onClick={() => setIsCreateOpen(true)} disabled={availableDeals.length === 0}>
            <CirclePlus className="size-4" />
            계약 생성
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="진행 계약" value={`${metrics.active}건`} />
        <MetricTile label="서명 완료" value={`${metrics.signed}건`} />
        <MetricTile label="잔금 대기" value={`${metrics.balancePending}건`} />
        <MetricTile label="자료 누락 계약" value={`${metrics.missingDocs}건`} />
      </div>

      <ContractListFilterBar
        filters={filters}
        kindOptions={kindOptions}
        onChange={setFilters}
        isFiltered={isFiltered}
        totalCount={pagination?.total ?? visibleContracts.length}
        searchWrapRef={searchWrapRef}
        view={view}
        onViewChange={setView}
      />

      {contractsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : contractsQuery.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-border/60 py-16 text-sm text-muted-foreground">
          계약 목록을 불러오지 못했습니다.
          <Button variant="outline" size="sm" onClick={() => contractsQuery.refetch()}>
            다시 시도
          </Button>
        </div>
      ) : visibleContracts.length === 0 && !isFiltered && page === 1 ? (
        <EmptyState
          icon={FileText}
          title="등록된 계약이 없습니다"
          description="거래(Deal)에서 계약을 생성하면 이곳에서 일정과 문서를 관리할 수 있습니다."
          action={
            availableDeals.length > 0 ? (
              <Button onClick={() => setIsCreateOpen(true)}>
                <CirclePlus className="size-4" />
                계약 생성
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link to="/deals">거래 만들러 가기</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          {view === 'list' ? (
            <ContractsTable
              contracts={visibleContracts}
              isFiltered={isFiltered}
              onOpen={openContractDetail}
              onCopy={(contractId) => copyContractMutation.mutate(contractId)}
              isCopying={copyContractMutation.isPending}
              onDelete={deleteContract}
              isDeleting={deleteContractMutation.isPending}
            />
          ) : (
            <ContractsDocGrid
              contracts={visibleContracts}
              isFiltered={isFiltered}
              onOpen={openContractDetail}
            />
          )}

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
        </>
      )}

      <Dialog open={isDetailOpen} onOpenChange={handleDetailOpenChange}>
        <DialogContent className="h-[calc(100vh-32px)] max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none xl:w-[1180px]">
          <ContractDetailCard
            open={isDetailOpen}
            contract={contractDetail}
            isLoading={detailQuery.isLoading}
            isError={detailQuery.isError}
            onRetry={() => detailQuery.refetch()}
            documentTemplates={documentTemplates}
            isDocumentTemplatesLoading={isDocumentTemplatesLoading}
            form={detailForm}
            onFormChange={setDetailForm}
            isDirty={isDetailDirty}
            onOpenDocument={openDocumentEditor}
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
              <Label>대상 거래 *</Label>
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
              <Label>거래 유형 *</Label>
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
              label="총 거래금액 *"
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

            <div className="rounded-md border border-border/60 bg-muted/20 p-4 md:col-span-2">
              <p className="text-sm font-medium">생성 기준</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedCreateDeal
                  ? `${selectedCreateDeal.buyerContact?.name ?? '매수인 미지정'} / ${selectedCreateDeal.sellerContact?.name ?? '매도인 미지정'} · ${getContractPropertyLabel(selectedCreateDeal) || '매물 미지정'}`
                  : '거래를 선택하면 당사자와 매물 정보를 미리 확인할 수 있습니다.'}
              </p>
              {selectedCreateDeal &&
              (!selectedCreateDeal.buyerContactId || !selectedCreateDeal.sellerContactId) ? (
                <p className="mt-1 text-sm text-destructive">
                  거래에 매수인/매도인이 모두 연결돼 있어야 계약을 생성할 수 있습니다.
                </p>
              ) : null}
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

/**
 * 목록 필터 바 — 레거시 DMLS001Q01 검색 조건
 * (서식종류/거래유형/상태/날짜기준+범위/금액기준+범위/텍스트검색기준/토글)
 * + v2 문서 준비 필터/뷰 토글.
 */
function ContractListFilterBar({
  filters,
  kindOptions,
  onChange,
  isFiltered,
  totalCount,
  searchWrapRef,
  view,
  onViewChange,
}: {
  filters: ContractListFilterState;
  kindOptions: Array<{ value: string; label: string }>;
  onChange: Dispatch<SetStateAction<ContractListFilterState>>;
  isFiltered: boolean;
  totalCount: number;
  searchWrapRef: RefObject<HTMLDivElement | null>;
  view: 'list' | 'docs';
  onViewChange: (view: 'list' | 'docs') => void;
}) {
  function patch(partial: Partial<ContractListFilterState>) {
    onChange((prev) => ({ ...prev, ...partial }));
  }

  return (
    <div className="mb-3 space-y-2">
      <FilterBar>
        <div ref={searchWrapRef}>
          <FilterSearch
            value={filters.search}
            onChange={(value) => patch({ search: value })}
            placeholder="고객명, 연락처, 소재지 검색 (/)"
          />
        </div>
        <Select
          value={filters.searchField}
          onValueChange={(value) => patch({ searchField: value as ContractSearchField })}
        >
          <SelectTrigger size="sm" className="gap-1.5 bg-background">
            <span className="text-muted-foreground">검색 기준</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTRACT_SEARCH_FIELD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FilterSelect
          label="서식"
          value={filters.kind}
          onChange={(value) => patch({ kind: value })}
          options={kindOptions}
        />
        <FilterSelect
          label="상태"
          value={filters.status}
          onChange={(value) => patch({ status: value })}
          options={CONTRACT_STATUS_OPTIONS}
        />
        <FilterSelect
          label="거래유형"
          value={filters.transactionType}
          onChange={(value) => patch({ transactionType: value })}
          // 제품 결정 — 기본 3종만 필터 (연세 없음, 확장 유형 필터 제외)
          options={BASE_CONTRACT_TRANSACTION_TYPES}
        />
        <FilterSelect
          label="문서 준비"
          value={filters.docFilter}
          onChange={(value) => patch({ docFilter: value })}
          options={DOC_FILTER_OPTIONS}
        />
        <FilterCount n={totalCount} />
        <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
          <Button
            variant={view === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => onViewChange('list')}
          >
            <List className="size-3.5" />
            목록
          </Button>
          <Button
            variant={view === 'docs' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => onViewChange('docs')}
          >
            <LayoutGrid className="size-3.5" />
            자료 중심
          </Button>
        </div>
      </FilterBar>

      <FilterBar>
        <Select
          value={filters.dateField}
          onValueChange={(value) => patch({ dateField: value as ContractDateField })}
        >
          <SelectTrigger size="sm" className="gap-1.5 bg-background">
            <span className="text-muted-foreground">날짜 기준</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTRACT_DATE_FIELD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => patch({ dateFrom: event.target.value })}
            className="h-8 w-36 bg-background"
            aria-label="날짜 시작"
          />
          <span className="text-xs text-muted-foreground">~</span>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(event) => patch({ dateTo: event.target.value })}
            className="h-8 w-36 bg-background"
            aria-label="날짜 종료"
          />
        </div>
        <Select
          value={filters.priceField}
          onValueChange={(value) => patch({ priceField: value as ContractPriceField })}
        >
          <SelectTrigger size="sm" className="gap-1.5 bg-background">
            <span className="text-muted-foreground">금액 기준</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTRACT_PRICE_FIELD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Input
              inputMode="numeric"
              value={filters.priceMin}
              onChange={(event) => patch({ priceMin: event.target.value })}
              placeholder="최소"
              className="h-8 w-28 bg-background pr-11"
              aria-label="금액 최소"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              만원
            </span>
          </div>
          <span className="text-xs text-muted-foreground">~</span>
          <div className="relative">
            <Input
              inputMode="numeric"
              value={filters.priceMax}
              onChange={(event) => patch({ priceMax: event.target.value })}
              placeholder="최대"
              className="h-8 w-28 bg-background pr-11"
              aria-label="금액 최대"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              만원
            </span>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-sm">
          <Checkbox
            checked={filters.isJointBrokerage}
            onCheckedChange={(checked) => patch({ isJointBrokerage: checked === true })}
          />
          공동중개
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-sm">
          <Checkbox
            checked={filters.retentionOverdue}
            onCheckedChange={(checked) => patch({ retentionOverdue: checked === true })}
          />
          보존기간 경과
        </label>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={!isFiltered}
          onClick={() => onChange(defaultListFilters())}
        >
          필터 초기화
        </Button>
      </FilterBar>
    </div>
  );
}

function ContractsTable({
  contracts,
  isFiltered,
  onOpen,
  onCopy,
  isCopying,
  onDelete,
  isDeleting,
}: {
  contracts: Contract[];
  isFiltered: boolean;
  onOpen: (contractId: string) => void;
  onCopy: (contractId: string) => void;
  isCopying: boolean;
  onDelete: (contractId: string) => void;
  isDeleting: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-24 text-xs text-muted-foreground">계약일</TableHead>
              <TableHead className="min-w-28 text-xs text-muted-foreground">유형</TableHead>
              <TableHead className="min-w-36 text-xs text-muted-foreground">매물</TableHead>
              <TableHead className="min-w-36 text-xs text-muted-foreground">당사자</TableHead>
              <TableHead className="min-w-28 text-right text-xs text-muted-foreground">
                금액
              </TableHead>
              <TableHead className="min-w-28 text-xs text-muted-foreground">잔금일</TableHead>
              <TableHead className="min-w-24 text-xs text-muted-foreground">상태</TableHead>
              <TableHead className="min-w-24 text-xs text-muted-foreground">문서</TableHead>
              <TableHead className="min-w-24 text-xs text-muted-foreground">거래신고</TableHead>
              <TableHead className="min-w-24 text-xs text-muted-foreground">수정일</TableHead>
              <TableHead className="w-36 text-right text-xs text-muted-foreground">
                작업
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.map((contract) => {
              const missingCount = contract.missingDocumentCount ?? 0;
              const propertyLabel = getContractPropertyLabel(contract.deal);
              const balanceDday = getBalanceDday(contract);
              const reportStatus = contract.transactionReportStatus ?? 'none';

              return (
                <TableRow
                  key={contract.id}
                  tabIndex={0}
                  onClick={() => onOpen(contract.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onOpen(contract.id);
                    }
                  }}
                  className="h-10 cursor-pointer text-sm outline-none hover:bg-muted/40 focus-visible:bg-muted/50"
                >
                  <TableCell className="font-medium">
                    {formatDate(contract.contractDate)}
                  </TableCell>
                  <TableCell>
                    <ContractTransactionTypeBadge type={contract.transactionType} />
                  </TableCell>
                  <TableCell>
                    <p className="max-w-52 truncate text-sm font-medium">
                      {propertyLabel || '매물 미지정'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {contract.buyerContact?.name ?? '매수인 미지정'} /{' '}
                      {contract.sellerContact?.name ?? '매도인 미지정'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(contract.totalPrice)}
                    {contract.transactionType === 'monthly' && contract.monthlyRent ? (
                      <span className="block text-xs text-muted-foreground">
                        월 {formatMoney(contract.monthlyRent)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {contract.statedBalanceDate ? (
                      <div className="text-sm">
                        {formatDate(contract.statedBalanceDate)}
                        {balanceDday ? (
                          <span
                            className={cn(
                              'ml-1 text-xs',
                              balanceDday.overdue
                                ? 'font-medium text-destructive'
                                : 'text-muted-foreground',
                            )}
                          >
                            {balanceDday.text}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="contractStatus" status={contract.status} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={missingCount > 0 ? 'outline' : 'secondary'}
                      className={cn(missingCount > 0 && 'text-destructive')}
                    >
                      {missingCount > 0
                        ? `누락 ${missingCount}건`
                        : `완료 ${contract.documentCount ?? 0}건`}
                    </Badge>
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
                        disabled={isCopying}
                        onClick={(event) => {
                          event.stopPropagation();
                          onCopy(contract.id);
                        }}
                      >
                        <Copy className="size-3.5" />
                        사본
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive/80"
                        disabled={isDeleting}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(contract.id);
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
                  colSpan={11}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  {isFiltered ? '조건에 맞는 계약이 없습니다.' : '계약이 없습니다.'}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ContractsDocGrid({
  contracts,
  isFiltered,
  onOpen,
}: {
  contracts: Contract[];
  isFiltered: boolean;
  onOpen: (contractId: string) => void;
}) {
  if (contracts.length === 0) {
    return (
      <div className="rounded-md border border-border/60 py-16 text-center text-sm text-muted-foreground">
        {isFiltered ? '조건에 맞는 계약이 없습니다.' : '계약이 없습니다.'}
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {contracts.map((contract) => {
        const missingCount = contract.missingDocumentCount ?? 0;
        const requiredCount = contract.requiredDocumentTemplates?.length ?? 0;
        const propertyLabel = getContractPropertyLabel(contract.deal);
        const reportStatus = contract.transactionReportStatus ?? 'none';

        return (
          <Card
            key={contract.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(contract.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(contract.id);
              }
            }}
            className="cursor-pointer gap-3 py-4 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardContent className="space-y-3 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {propertyLabel || '매물 미지정'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {contract.buyerContact?.name ?? '매수인 미지정'} /{' '}
                    {contract.sellerContact?.name ?? '매도인 미지정'}
                  </p>
                </div>
                <StatusBadge kind="contractStatus" status={contract.status} />
              </div>

              <div className="flex items-center gap-2">
                <ContractTransactionTypeBadge type={contract.transactionType} />
                <span className="text-sm font-medium tabular-nums">
                  {formatMoney(contract.totalPrice)}
                </span>
                <Badge
                  className={cn(
                    'ml-auto border-0',
                    transactionReportStatusMeta[reportStatus]?.className ??
                      transactionReportStatusMeta.none.className,
                  )}
                >
                  {transactionReportStatusMeta[reportStatus]?.label ?? reportStatus}
                </Badge>
              </div>

              <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">작성 문서</span>
                  <span className="font-medium tabular-nums">
                    {contract.documentCount ?? 0}건
                    {requiredCount > 0 ? ` / 필수 ${requiredCount}건` : ''}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">자료 누락</span>
                  <span
                    className={cn(
                      'font-medium tabular-nums',
                      missingCount > 0 ? 'text-destructive' : 'text-success',
                    )}
                  >
                    {missingCount > 0 ? `${missingCount}건` : '없음'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>계약일 {formatDate(contract.contractDate)}</span>
                <span>수정 {formatDateTime(contract.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function getBalanceDday(contract: Contract): { text: string; overdue: boolean } | null {
  if (!contract.statedBalanceDate) return null;
  if (['balancePaid', 'registered', 'cancelled'].includes(contract.status)) return null;

  const text = formatDday(contract.statedBalanceDate);
  return { text, overdue: text.startsWith('D+') };
}

function getDealLabel(deal: Deal) {
  const propertyLabel = getContractPropertyLabel(deal) || '매물 미지정';
  const buyer = deal.buyerContact?.name ?? '매수인 미지정';
  const seller = deal.sellerContact?.name ?? '매도인 미지정';
  return `${propertyLabel} · ${buyer} / ${seller}`;
}
