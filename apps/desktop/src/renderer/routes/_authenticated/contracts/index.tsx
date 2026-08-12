import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { ChevronLeft, ChevronRight, FileText, LayoutGrid, List } from 'lucide-react';
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
import {
  applyEngineFieldsToResidentialSaleAgreement,
  getContractClauseLayout,
  getContractClauseLayoutContext,
  mergeContractDocumentEngineMetadata,
} from './-document-engine';
import {
  DocumentListTable,
  DOC_STATE_PRESETS,
  getDealSummaryLabel,
  type DocStatePreset,
} from './-document-list-table';
import {
  toFormRegistrationMetadata,
  type FormRegistrationSpec,
} from './-form-registration-catalog';
import { FormRegistrationMenu } from './-form-registration-menu';
import {
  BASE_CONTRACT_TRANSACTION_TYPES,
  ContractTransactionTypeBadge,
  CONTRACT_STATUS_OPTIONS,
  CONTRACT_TRANSACTION_TYPES,
  MetricTile,
  NumberField,
  SIGNED_OR_LATER,
  getContractPropertyLabel,
  hasContractFile,
  resolveDocumentTemplate,
  sortContractDocuments,
  stringifyOptionalNumber,
  toContractTransactionType,
  toOptionalNumber,
  todayInput,
  transactionReportStatusMeta,
} from './-contract-shared';
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
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import {
  ConfirmDialog,
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

const DOC_FILTER_OPTIONS = [
  { value: 'missing', label: '자료 누락' },
  { value: 'ready', label: '준비 완료' },
  { value: 'hasFile', label: 'PDF/파일 있음' },
  { value: 'noFile', label: 'PDF/파일 없음' },
];

const CONTRACT_DATE_FIELD_OPTIONS: Array<{
  value: ContractDateField;
  label: string;
}> = [
  { value: 'contractDate', label: '계약일자' },
  { value: 'statedInterimDate', label: '중도금일자' },
  { value: 'statedBalanceDate', label: '잔금일자' },
  { value: 'leaseEndDate', label: '임대만기일' },
  { value: 'createdAt', label: '등록일자' },
];

const CONTRACT_PRICE_FIELD_OPTIONS: Array<{
  value: ContractPriceField;
  label: string;
}> = [
  { value: 'totalPrice', label: '거래금액' },
  { value: 'statedDeposit', label: '계약금' },
  { value: 'monthlyRent', label: '월차임' },
];

const CONTRACT_SEARCH_FIELD_OPTIONS: Array<{
  value: ContractSearchField;
  label: string;
}> = [
  { value: 'party', label: '고객명' },
  { value: 'phone', label: '연락처' },
  { value: 'address', label: '소재지' },
  { value: 'partnerOffice', label: '공동중개사무소' },
];

/** 레거시 문서관리 고밀도 목록 — 페이지 당 행 수 (DMLS 스크롤 체감) */
const CONTRACTS_PAGE_SIZE = 40;

/** 목록 필터 상태 (레거시 DMLS001Q01 검색 조건) — '' = 전체 */
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
  /** '' = 전체(all) */
  searchField: string;
  search: string;
  isJointBrokerage: boolean;
  retentionOverdue: boolean;
};

function defaultListFilters(): ContractListFilterState {
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
    searchField: search ? ((filters.searchField || 'all') as ContractSearchField) : undefined,
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
  const editorOpenRequestRef = useRef(0);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ContractListFilterState>(defaultListFilters());
  /** 클라이언트 보조 필터 (문서 준비 상태 — 서버 필터 없음, 현재 페이지에만 적용) */
  const [docFilter, setDocFilter] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'docs'>('list');
  /** 레거시 showCust — 목록에 연락처 표시 */
  const [showPhones, setShowPhones] = useState(true);
  /** 레거시 State_Type: 전체 / 진행중 / 완료 */
  const [statePreset, setStatePreset] = useState<DocStatePreset>('all');
  /** 목록 포커스 행 (하단 상태바) */
  const [focusedContractId, setFocusedContractId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  /**
   * MySpider ShowNewContract — 메뉴에서 고른 서식(종별×거래유형).
   * 계약 생성 후 해당 양식 문서를 자동 작성하고 편집기를 연다.
   */
  const [pendingFormSpec, setPendingFormSpec] = useState<FormRegistrationSpec | null>(null);
  const [isDocumentEditorOpen, setIsDocumentEditorOpen] = useState(false);
  const [documentFormError, setDocumentFormError] = useState<string | null>(null);
  const [documentEditorForm, setDocumentEditorForm] =
    useState<DocumentEditorForm>(emptyDocumentEditorForm());
  /** 에디터 오픈 시점 스냅샷 — §3.1 dirty tracking (미저장 변경 감지) */
  const [documentEditorBaseline, setDocumentEditorBaseline] = useState<string | null>(null);
  const [deleteContractTarget, setDeleteContractTarget] = useState<Contract | null>(null);
  const [createForm, setCreateForm] = useState<CreateContractDto>({
    dealId: '',
    transactionType: 'sale',
    totalPrice: undefined,
    monthlyRent: undefined,
    contractDate: todayInput(),
  });
  // 텍스트/금액 입력은 디바운스 후 서버 검색 (레거시 DMLS001Q01 필터)
  const debouncedSearch = useDebouncedValue(filters.search);
  const debouncedPriceMin = useDebouncedValue(filters.priceMin);
  const debouncedPriceMax = useDebouncedValue(filters.priceMax);

  const effectiveFilters = useMemo<ContractListFilterState>(() => {
    const next: ContractListFilterState = {
      ...filters,
      search: debouncedSearch,
      priceMin: debouncedPriceMin,
      priceMax: debouncedPriceMax,
    };
    // 진행중/완료 프리셋이 있으면 단일 status 필터를 덮어쓴다
    // (서버 status 쿼리는 단건 — 클라이언트 페이지 내 2차 필터로 보완)
    if (statePreset !== 'all' && !filters.status) {
      // status 단일값 API 한계: 진행중은 draft 우선 조회 후 클라 필터, 완료는 registered
      if (statePreset === 'done') {
        next.status = 'registered';
      }
    }
    return next;
  }, [filters, debouncedSearch, debouncedPriceMin, debouncedPriceMax, statePreset]);

  const filterKey = JSON.stringify(effectiveFilters);

  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  // 서버 페이지네이션 목록 (레거시 DMLS001Q01 검색)
  const contractsQuery = useQuery({
    queryKey: ['contracts', 'list', filterKey, page],
    queryFn: () =>
      api.contracts.findAllPaginated({
        ...toContractsFilter(effectiveFilters),
        page,
        limit: CONTRACTS_PAGE_SIZE,
      }),
  });

  const pageContracts = useMemo(() => contractsQuery.data?.items ?? [], [contractsQuery.data]);
  const pagination = contractsQuery.data?.pagination;

  // 지표 + "이미 계약된 거래 제외" 계산용 전체 목록 (필터 무관)
  const allContractsQuery = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api.contracts.findAll(),
  });
  const allContracts = useMemo(() => allContractsQuery.data ?? [], [allContractsQuery.data]);

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

  // '/' 키로 검색 포커스 (PRD 키보드 단축키)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
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
      (contract) => (contract.missingDocumentCount ?? 0) > 0 && contract.status !== 'cancelled',
    );

    return {
      active: active.length,
      signed: signed.length,
      balancePending: balancePending.length,
      missingDocs: missingDocs.length,
    };
  }, [allContracts]);

  // 문서 준비 + 진행중 프리셋 — 서버 단건 status 한계를 페이지 내 필터로 보완
  const visibleContracts = useMemo(() => {
    return pageContracts.filter((contract) => {
      if (docFilter === 'missing' && (contract.missingDocumentCount ?? 0) === 0) {
        return false;
      }
      if (docFilter === 'ready' && (contract.missingDocumentCount ?? 0) > 0) {
        return false;
      }
      if (docFilter === 'hasFile' && !hasContractFile(contract)) return false;
      if (docFilter === 'noFile' && hasContractFile(contract)) return false;

      if (statePreset === 'active') {
        return (DOC_STATE_PRESETS.active.statuses as readonly string[]).includes(contract.status);
      }
      if (statePreset === 'done') {
        return contract.status === 'registered';
      }
      return true;
    });
  }, [pageContracts, docFilter, statePreset]);

  /**
   * 메뉴 선택 → 템플릿 조회 → 문서 생성/재사용 → 편집기 오픈을 한 번에 수행한다.
   * 쿼리 갱신을 감시하는 effect에서 생성하면 재실행 시 반복 서식이 중복될 수 있으므로,
   * 사용자 이벤트에서 시작하는 단일 mutation으로 직렬화한다.
   */
  const applyFormMutation = useMutation({
    mutationFn: async ({
      contractId,
      spec,
    }: {
      contractId: string;
      spec: FormRegistrationSpec;
    }) => {
      const [currentContract, fetchedTemplates] = await Promise.all([
        api.contracts.findOne(contractId),
        allDocumentTemplates.length > 0
          ? Promise.resolve(allDocumentTemplates)
          : api.contracts.documentTemplates(),
      ]);
      const template = fetchedTemplates.find((item) => item.code === spec.templateCode);

      if (!template) {
        throw new Error(
          `「${spec.title}」 템플릿(${spec.templateCode})을 찾을 수 없습니다. 시드/마이그레이션을 확인하세요.`,
        );
      }

      const existing = (currentContract.documents ?? []).find((document) => {
        if (
          document.kind !== spec.templateCode &&
          document.template?.code !== spec.templateCode
        ) {
          return false;
        }

        const registrationValue = document.metadata?.formRegistration;
        const registration =
          registrationValue &&
          typeof registrationValue === 'object' &&
          !Array.isArray(registrationValue)
            ? (registrationValue as Record<string, unknown>)
            : null;

        // 같은 templateCode를 공유하는 아파트/오피스텔/부동산/상가 문서를
        // 서로 재사용하지 않는다. 등록 스냅샷이 있는 문서는 타입과 거래유형이
        // 모두 같은 경우에만 기존 탭을 연다.
        if (registration) {
          return (
            registration.cntrClsf === spec.cntrClsf &&
            registration.transactionType === spec.transactionType
          );
        }

        // 구버전 base_contract는 목적물 타입을 알 수 없어 안전하게 새 문서를 만든다.
        // 전용 서식은 계약의 거래유형이 같은 경우에만 하위 호환 재사용한다.
        return (
          spec.templateCode !== 'base_contract' &&
          currentContract.transactionType === spec.transactionType
        );
      });
      const registrationMetadata = toFormRegistrationMetadata(spec);
      const document =
        !spec.repeatable && existing
          ? await api.contracts.updateDocument(contractId, existing.id, {
              metadata: {
                ...existing.metadata,
                formRegistration: registrationMetadata,
              },
            })
          : await api.contracts.createDocument(contractId, {
              templateId: template.id,
              kind: spec.templateCode,
              category: template.category,
              title: spec.title,
              status: 'draft',
              metadata: {
                formRegistration: registrationMetadata,
              },
            });
      const refreshed = await api.contracts.findOne(contractId);

      return {
        contractId,
        document,
        refreshed,
        reused: Boolean(!spec.repeatable && existing),
        spec,
        template,
      };
    },
    onSuccess: ({ contractId, document, refreshed, reused, spec, template }) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.setQueryData(['contract', contractId], refreshed);

      const refreshedDocument =
        refreshed.documents?.find((item) => item.id === document.id) ?? document;
      const nextForm = toDocumentEditorForm(refreshed, template, refreshedDocument);
      nextForm.title = spec.title;

      setDocumentFormError(null);
      setDocumentEditorForm(nextForm);
      setDocumentEditorBaseline(JSON.stringify(nextForm));
      setSelectedContractId(contractId);
      setIsDocumentEditorOpen(true);
      toast.success(
        reused
          ? `기존 「${spec.title}」 서식을 열었습니다.`
          : `「${spec.title}」 양식을 추가했습니다.`,
      );
    },
    onError: (error, { contractId }) => {
      toast.error(error instanceof Error ? error.message : '선택한 양식 문서를 만들지 못했습니다.');
      setSelectedContractId(contractId);
    },
  });

  const createMutation = useMutation({
    mutationFn: ({
      formSpec,
      ...payload
    }: CreateContractDto & { formSpec?: FormRegistrationSpec | null }) => {
      void formSpec;
      return api.contracts.create(payload);
    },
    onSuccess: (created, variables) => {
      const formSpec = variables.formSpec ?? null;
      toast.success(
        formSpec
          ? variables.dealId
            ? `계약을 생성했습니다. 「${formSpec.title}」 양식을 적용합니다.`
            : `독립 문서 묶음을 만들었습니다. 「${formSpec.title}」 양식을 적용합니다.`
          : '계약을 생성했습니다.',
      );
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setSelectedContractId(created.id);
      if (formSpec) {
        applyFormMutation.mutate({ contractId: created.id, spec: formSpec });
      } else {
        void openContractEditor(created.id);
      }
      setIsCreateOpen(false);
      setPendingFormSpec(null);
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
      saveAsNew: _saveAsNew,
    }: {
      documentId?: string;
      dto: CreateContractDocumentDto | UpdateContractDocumentDto;
      saveAsNew: boolean;
    }) => {
      void _saveAsNew;
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

      return api.contracts.createDocument(selectedContractId, dto as CreateContractDocumentDto);
    },
    onSuccess: (savedDocument, { saveAsNew }) => {
      toast.success(saveAsNew ? '문서 사본을 새 탭으로 저장했습니다.' : '문서를 저장했습니다.');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });

      if (selectedContractId && contractDetail) {
        const nextDocuments = [
          ...(contractDetail.documents ?? []).filter(
            (document) => document.id !== savedDocument.id,
          ),
          savedDocument,
        ];
        const nextContract: Contract = {
          ...contractDetail,
          documents: nextDocuments,
          documentCount: nextDocuments.filter((document) => document.status !== 'cancelled').length,
        };
        const template = resolveDocumentTemplate(savedDocument, allDocumentTemplates);
        const nextForm = toDocumentEditorForm(nextContract, template, savedDocument);

        queryClient.setQueryData(['contract', selectedContractId], nextContract);
        setDocumentEditorForm(nextForm);
        setDocumentEditorBaseline(JSON.stringify(nextForm));
      } else {
        const nextForm: DocumentEditorForm = {
          ...documentEditorForm,
          documentId: savedDocument.id,
          templateId: savedDocument.templateId ?? undefined,
          title: savedDocument.title,
          status: savedDocument.status,
          fileUrl: savedDocument.fileUrl ?? '',
          signedAt: savedDocument.signedAt ?? '',
          submittedAt: savedDocument.submittedAt ?? '',
          memo: savedDocument.memo ?? '',
          metadata: savedDocument.metadata,
          kind: savedDocument.kind,
          sortOrder: savedDocument.sortOrder,
          kindOrder: savedDocument.kindOrder,
        };
        setDocumentEditorForm(nextForm);
        setDocumentEditorBaseline(JSON.stringify(nextForm));
      }

      setDocumentFormError(null);
      setIsDocumentEditorOpen(true);

      queryClient.invalidateQueries({
        queryKey: ['contract', selectedContractId],
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : '문서를 저장하지 못했습니다.';
      setDocumentFormError(message);
      toast.error(message);
    },
  });

  // 계약 삭제 (레거시 §1.3 삭제 액션) — 문서/당사자/리비전 포함 영구 삭제 (cascade)
  const deleteContractMutation = useMutation({
    mutationFn: (contractId: string) => api.contracts.remove(contractId),
    onSuccess: (_result, contractId) => {
      toast.success('계약을 삭제했습니다.');
      setDeleteContractTarget(null);
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.removeQueries({ queryKey: ['contract', contractId] });
      if (selectedContractId === contractId) {
        setSelectedContractId(null);
        setIsDocumentEditorOpen(false);
        setDocumentEditorForm(emptyDocumentEditorForm());
        setDocumentEditorBaseline(null);
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
      toast.success('계약 문서 사본을 추가했습니다.');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', copied.id] });
      setSelectedContractId(copied.id);
      void openContractEditor(copied.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '사본을 만들지 못했습니다.');
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
  // 서식 메뉴에서 고른 양식(pendingFormSpec)이 있으면 거래유형은 양식 값을 유지한다.
  useEffect(() => {
    if (!selectedCreateDeal || appliedDealIdRef.current === selectedCreateDeal.id) {
      return;
    }
    appliedDealIdRef.current = selectedCreateDeal.id;

    const dealTransactionType = toContractTransactionType(selectedCreateDeal);
    setCreateForm((prev) => {
      const transactionType = pendingFormSpec?.transactionType ?? dealTransactionType;
      return {
        ...prev,
        transactionType,
        totalPrice:
          selectedCreateDeal.agreedPrice ??
          selectedCreateDeal.agreedDeposit ??
          selectedCreateDeal.listing?.price ??
          selectedCreateDeal.listing?.deposit ??
          undefined,
        monthlyRent: ['monthly', 'yearly'].includes(transactionType)
          ? (selectedCreateDeal.agreedMonthlyRent ??
            selectedCreateDeal.listing?.monthlyRent ??
            undefined)
          : undefined,
      };
    });
  }, [selectedCreateDeal, pendingFormSpec]);

  // §3.1 dirty tracking — 저장 버튼 활성화 + 닫기 시 미저장 확인
  const isDocumentEditorDirty =
    documentEditorBaseline !== null &&
    JSON.stringify(documentEditorForm) !== documentEditorBaseline;

  /** 목록에서 계약을 열면 중간 허브 없이 대표 문서 편집기로 바로 진입한다. */
  async function openContractEditor(contractId: string) {
    const requestId = ++editorOpenRequestRef.current;
    setSelectedContractId(contractId);
    setDocumentFormError(null);

    try {
      const contract = await queryClient.fetchQuery({
        queryKey: ['contract', contractId],
        queryFn: () => api.contracts.findOne(contractId),
      });
      if (requestId !== editorOpenRequestRef.current) return;

      const documents = sortContractDocuments(contract.documents ?? []);
      const document =
        documents.find(
          (item) => item.status !== 'cancelled' && item.category === 'contract',
        ) ??
        documents.find((item) => item.status !== 'cancelled') ??
        documents[0];

      let template: ContractDocumentTemplate;
      if (document) {
        template = resolveDocumentTemplate(document, allDocumentTemplates);
      } else {
        const templates = await queryClient.fetchQuery({
          queryKey: ['contract-document-templates', contract.transactionType],
          queryFn: () =>
            api.contracts.documentTemplates({
              transactionType: contract.transactionType,
            }),
        });
        if (requestId !== editorOpenRequestRef.current) return;

        const primaryTemplate =
          templates.find((item) => item.category === 'contract' && item.isRequired) ??
          templates.find((item) => item.category === 'contract') ??
          templates.find((item) => item.isRequired) ??
          templates[0];

        if (!primaryTemplate) {
          throw new Error('이 계약에 적용할 수 있는 작성 서식이 없습니다.');
        }
        template = primaryTemplate;
      }

      const nextForm = toDocumentEditorForm(contract, template, document);
      setDocumentEditorForm(nextForm);
      setDocumentEditorBaseline(JSON.stringify(nextForm));
      setIsDocumentEditorOpen(true);
    } catch (error) {
      if (requestId !== editorOpenRequestRef.current) return;
      toast.error(error instanceof Error ? error.message : '문서 편집기를 열지 못했습니다.');
    }
  }

  /** 편집기 상단 문서 탭 전환 — 미저장 변경은 확인한 뒤에만 폐기한다. */
  function switchDocumentEditor(document: ContractDocument) {
    if (!contractDetail || document.id === documentEditorForm.documentId) return;
    if (saveDocumentMutation.isPending || applyFormMutation.isPending) return;

    if (isDocumentEditorDirty) {
      const confirmed = window.confirm(
        '현재 문서에 저장하지 않은 변경사항이 있습니다. 변경을 버리고 다른 문서로 이동할까요?',
      );
      if (!confirmed) return;
    }

    const template = resolveDocumentTemplate(document, allDocumentTemplates);
    const nextForm = toDocumentEditorForm(contractDetail, template, document);
    setDocumentFormError(null);
    setDocumentEditorForm(nextForm);
    setDocumentEditorBaseline(JSON.stringify(nextForm));
  }

  /** 편집기 안에서 새 서식을 추가할 때도 현재 탭의 미저장 변경을 보호한다. */
  function handleEditorAddForm(spec: FormRegistrationSpec) {
    if (isDocumentEditorDirty) {
      const confirmed = window.confirm(
        '현재 문서에 저장하지 않은 변경사항이 있습니다. 변경을 버리고 새 서식을 열까요?',
      );
      if (!confirmed) return;
    }
    handleFormRegistrationSelect(spec);
  }

  /** MySpider 계약서/서식 등록 메뉴 선택 → 거래 연결 후 해당 양식 적용 */
  function handleFormRegistrationSelect(spec: FormRegistrationSpec) {
    if (applyFormMutation.isPending) return;

    if (spec.isAnnex) {
      const targetContractId =
        (isDocumentEditorOpen ? contractDetail?.id : null) ??
        focusedContractId ??
        selectedContractId;

      if (!targetContractId) {
        createMutation.mutate({
          transactionType: spec.transactionType,
          totalPrice: 0,
          formSpec: spec,
        });
        return;
      }

      setSelectedContractId(targetContractId);
      applyFormMutation.mutate({ contractId: targetContractId, spec });
      return;
    }

    setPendingFormSpec(spec);
    setCreateForm((prev) => ({
      ...prev,
      dealId: '',
      transactionType: spec.transactionType,
      totalPrice: undefined,
      monthlyRent: undefined,
      contractDate: todayInput(),
    }));
    appliedDealIdRef.current = null;
    setIsCreateOpen(true);
  }

  /** 문서 편집기 닫기 — 미저장 변경을 확인한 뒤 문서 목록으로 복귀 */
  function handleDocumentEditorOpenChange(nextOpen: boolean) {
    if (!nextOpen && isDocumentEditorDirty && !saveDocumentMutation.isPending) {
      const confirmed = window.confirm('저장하지 않은 변경사항이 있습니다. 저장 없이 닫을까요?');
      if (!confirmed) return;
    }
    setIsDocumentEditorOpen(nextOpen);
    if (!nextOpen) {
      editorOpenRequestRef.current += 1;
      setDocumentEditorForm(emptyDocumentEditorForm());
      setDocumentEditorBaseline(null);
      setDocumentFormError(null);
    }
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

    // 조항 임베디드 에디터 서식(base_contract × sale)은 표기/인쇄 옵션
    // (금액단위·한글/漢字·공란인쇄·행 토글)을 printOptions 로 함께 저장한다.
    // 그 외 서식은 인자를 생략 — merge 가 기존 저장값을 보존한다.
    const clauseLayout = documentEditorForm.kind
      ? getContractClauseLayout(
          documentEditorForm.kind,
          documentEditorForm.transactionType,
          getContractClauseLayoutContext(
            documentEditorForm.metadata,
            documentEditorForm.engineFields,
          ),
        )
      : null;

    const engineMetadata = mergeContractDocumentEngineMetadata(
      documentEditorForm.metadata,
      engineFields,
      clauseLayout ? documentEditorForm.printOptions : undefined,
    );
    // 조항 에디터 문서(saleAgreement=null)는 contractAgreement 스냅샷을 편집값
    // (engineFields) 기준으로 재생성해 함께 저장한다 — 서버 완료 검증
    // (assertSaleAgreementDocumentCanComplete)·MCP validate/prepare 가 스냅샷을
    // 진실로 읽으므로 stale 스냅샷과의 분기(완료 저장 400·잘못된 AI 응답)를
    // 차단한다. 스냅샷이 없던 문서는 새로 만들지 않는다(engineFields 단일 포맷).
    const clauseAgreement =
      clauseLayout && !documentEditorForm.saleAgreement
        ? applyEngineFieldsToResidentialSaleAgreement(
            engineMetadata,
            engineFields,
            documentEditorForm.printOptions,
          )
        : null;
    const agreementToSave = documentEditorForm.saleAgreement ?? clauseAgreement;
    const metadata = agreementToSave
      ? mergeResidentialSaleAgreementMetadata(engineMetadata, agreementToSave)
      : engineMetadata;
    const title = documentEditorForm.engineFields.documentTitle.trim() || documentEditorForm.title;
    const status = saveAsNew ? 'draft' : documentEditorForm.status;

    saveDocumentMutation.mutate({
      documentId: saveAsNew ? undefined : documentEditorForm.documentId,
      saveAsNew,
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
        // 서명완료/제출완료로 저장 시 자동 스탬프 (web 과 동일 —
        // 문서 편집기의 거래신고 제출 상태가 즉시 갱신되도록
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

  const isFiltered =
    JSON.stringify(filters) !== JSON.stringify(defaultListFilters()) || !!docFilter;
  const totalCount = pagination?.total ?? visibleContracts.length;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="문서관리"
        description="아파트·오피스텔 등 종별과 매매·전세 등 거래유형을 고르면 해당 계약 양식이 그대로 적용됩니다."
        actions={
          <FormRegistrationMenu
            contractDisabled={createMutation.isPending || applyFormMutation.isPending}
            annexDisabled={createMutation.isPending || applyFormMutation.isPending}
            onSelect={handleFormRegistrationSelect}
          />
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="진행 계약" value={`${metrics.active}건`} />
        <MetricTile label="서명 완료" value={`${metrics.signed}건`} />
        <MetricTile label="잔금 대기" value={`${metrics.balancePending}건`} />
        <MetricTile label="자료 누락 계약" value={`${metrics.missingDocs}건`} />
      </div>

      <ContractListFilterBar
        searchWrapRef={searchWrapRef}
        filters={filters}
        docFilter={docFilter}
        kindOptions={kindOptions}
        totalCount={totalCount}
        view={view}
        statePreset={statePreset}
        showPhones={showPhones}
        onChange={setFilters}
        onDocFilterChange={setDocFilter}
        onViewChange={setView}
        onStatePresetChange={setStatePreset}
        onShowPhonesChange={setShowPhones}
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
      ) : visibleContracts.length === 0 && !isFiltered ? (
        <EmptyState
          icon={FileText}
          title="등록된 계약이 없습니다"
          description="계약서 등록 메뉴에서 아파트·오피스텔 등 양식을 고른 뒤, 거래를 연결하세요."
          action={
            availableDeals.length > 0 ? (
              <FormRegistrationMenu showAnnex={false} onSelect={handleFormRegistrationSelect} />
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
            <DocumentListTable
              contracts={visibleContracts}
              isFiltered={isFiltered}
              showPhones={showPhones}
              focusedId={focusedContractId}
              onFocus={setFocusedContractId}
              onOpen={(contractId) => void openContractEditor(contractId)}
              onCopy={(contract) => copyContractMutation.mutate(contract.id)}
              isCopying={copyContractMutation.isPending}
              onDelete={setDeleteContractTarget}
              isDeleting={deleteContractMutation.isPending}
            />
          ) : (
            <ContractsDocGrid
              contracts={visibleContracts}
              isFiltered={isFiltered}
              onOpen={(contractId) => void openContractEditor(contractId)}
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

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setPendingFormSpec(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{pendingFormSpec ? pendingFormSpec.title : '계약 생성'}</DialogTitle>
            <DialogDescription>
              {pendingFormSpec
                ? `선택한 양식 「${pendingFormSpec.groupLabel} · ${pendingFormSpec.tradeLabel}」을 거래에 연결한 뒤 바로 적용합니다.`
                : '거래에 연결된 당사자와 가격을 기준으로 계약서를 시작합니다.'}
            </DialogDescription>
          </DialogHeader>

          {pendingFormSpec ? (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <p className="font-medium text-foreground">{pendingFormSpec.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                서식 {pendingFormSpec.templateCode} · 종별 {pendingFormSpec.groupLabel} · 거래{' '}
                {pendingFormSpec.tradeLabel} (Cntr_Clsf {pendingFormSpec.cntrClsf})
              </p>
            </div>
          ) : null}

          {availableDeals.length === 0 ? (
            <div className="flex items-center justify-between gap-4 rounded-md border border-warning/30 bg-warning-soft px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  연결할 수 있는 거래가 없습니다
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  서식은 선택되었습니다. 먼저 거래를 만든 뒤 다시 연결해주세요.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link to="/deals">거래 만들기</Link>
              </Button>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>대상 거래 *</Label>
              <Select
                value={createForm.dealId}
                disabled={availableDeals.length === 0}
                onValueChange={(value) => setCreateForm((prev) => ({ ...prev, dealId: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      availableDeals.length === 0 ? '연결 가능한 거래 없음' : '거래 선택'
                    }
                  />
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
                disabled={Boolean(pendingFormSpec)}
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
              {pendingFormSpec ? (
                <p className="text-[11px] text-muted-foreground">
                  메뉴에서 고른 양식의 거래유형이 고정됩니다.
                </p>
              ) : null}
            </div>

            <NumberField
              label="총 거래금액 *"
              value={stringifyOptionalNumber(createForm.totalPrice)}
              onChange={(value) =>
                setCreateForm((prev) => ({
                  ...prev,
                  totalPrice: toOptionalNumber(value),
                }))
              }
              suffix="만원"
            />

            <NumberField
              label={createForm.transactionType === 'yearly' ? '연세' : '월세'}
              value={stringifyOptionalNumber(createForm.monthlyRent)}
              onChange={(value) =>
                setCreateForm((prev) => ({
                  ...prev,
                  monthlyRent: toOptionalNumber(value),
                }))
              }
              suffix="만원"
              disabled={!['monthly', 'yearly'].includes(createForm.transactionType ?? '')}
            />

            <div className="space-y-2">
              <Label>계약일</Label>
              <Input
                type="date"
                value={createForm.contractDate ?? ''}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    contractDate: event.target.value,
                  }))
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
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateOpen(false);
                setPendingFormSpec(null);
              }}
            >
              닫기
            </Button>
            <Button
              onClick={() =>
                createMutation.mutate({
                  ...createForm,
                  formSpec: pendingFormSpec,
                })
              }
              disabled={
                createMutation.isPending ||
                applyFormMutation.isPending ||
                !createForm.dealId ||
                !selectedCreateDeal?.buyerContactId ||
                !selectedCreateDeal?.sellerContactId ||
                !createForm.totalPrice ||
                (['monthly', 'yearly'].includes(createForm.transactionType ?? '') &&
                  !createForm.monthlyRent)
              }
            >
              {pendingFormSpec ? '생성 후 양식 열기' : '생성'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentEditorSheet
        open={isDocumentEditorOpen}
        form={documentEditorForm}
        documents={contractDetail?.documents ?? []}
        error={documentFormError}
        isSaving={saveDocumentMutation.isPending}
        isAddingForm={applyFormMutation.isPending}
        isDirty={isDocumentEditorDirty}
        onOpenChange={handleDocumentEditorOpenChange}
        onFormChange={setDocumentEditorForm}
        onSelectDocument={switchDocumentEditor}
        onAddForm={handleEditorAddForm}
        onSave={() => saveDocument(false)}
        onSaveAsNew={() => saveDocument(true)}
      />

      <ConfirmDialog
        open={!!deleteContractTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteContractTarget(null);
        }}
        title="계약 삭제"
        description="계약과 소속 문서·당사자·리비전 정보가 모두 영구 삭제되며 복구할 수 없습니다."
        confirmLabel="삭제"
        destructive
        loading={deleteContractMutation.isPending}
        onConfirm={() => {
          if (deleteContractTarget) {
            deleteContractMutation.mutate(deleteContractTarget.id);
          }
        }}
      />
    </div>
  );
}

/**
 * 목록 필터 바 — 레거시 DMLS001Q01 검색 조건
 * (검색기준+텍스트 / 서식종류 / 거래유형(기본 3종) / 상태 / 문서준비 /
 *  날짜기준+범위 / 금액기준+범위(만원) / 공동중개·보존기간경과 토글).
 */
function ContractListFilterBar({
  searchWrapRef,
  filters,
  docFilter,
  kindOptions,
  totalCount,
  view,
  statePreset,
  showPhones,
  onChange,
  onDocFilterChange,
  onViewChange,
  onStatePresetChange,
  onShowPhonesChange,
}: {
  searchWrapRef: RefObject<HTMLDivElement | null>;
  filters: ContractListFilterState;
  docFilter: string;
  kindOptions: Array<{ value: string; label: string }>;
  totalCount: number;
  view: 'list' | 'docs';
  statePreset: DocStatePreset;
  showPhones: boolean;
  onChange: Dispatch<SetStateAction<ContractListFilterState>>;
  onDocFilterChange: (value: string) => void;
  onViewChange: (view: 'list' | 'docs') => void;
  onStatePresetChange: (value: DocStatePreset) => void;
  onShowPhonesChange: (value: boolean) => void;
}) {
  function patch(partial: Partial<ContractListFilterState>) {
    onChange((prev) => ({ ...prev, ...partial }));
  }

  const isDefault =
    JSON.stringify(filters) === JSON.stringify(defaultListFilters()) &&
    !docFilter &&
    statePreset === 'all';

  return (
    <div className="mb-3 space-y-2">
      {/* 레거시 State_Type 전체/진행중/완료 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 rounded-md border border-border/60 p-0.5">
          {(Object.keys(DOC_STATE_PRESETS) as DocStatePreset[]).map((key) => (
            <Button
              key={key}
              variant={statePreset === key ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => {
                onStatePresetChange(key);
                if (key === 'done') patch({ status: 'registered' });
                else if (filters.status === 'registered') patch({ status: '' });
              }}
            >
              {DOC_STATE_PRESETS[key].label}
            </Button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 px-1 text-xs text-muted-foreground">
          <Checkbox
            checked={showPhones}
            onCheckedChange={(checked) => onShowPhonesChange(checked === true)}
          />
          고객정보(연락처) 표시
        </label>
      </div>

      <FilterBar>
        <div ref={searchWrapRef}>
          <FilterSearch
            value={filters.search}
            onChange={(value) => patch({ search: value })}
            placeholder="고객명, 연락처, 소재지 검색 (/)"
          />
        </div>
        <FilterSelect
          label="검색기준"
          value={filters.searchField}
          onChange={(value) => patch({ searchField: value })}
          options={CONTRACT_SEARCH_FIELD_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
        <FilterSelect
          label="서식"
          value={filters.kind}
          onChange={(value) => patch({ kind: value })}
          options={kindOptions}
        />
        <FilterSelect
          label="거래유형"
          value={filters.transactionType}
          onChange={(value) => patch({ transactionType: value })}
          options={BASE_CONTRACT_TRANSACTION_TYPES}
        />
        <FilterSelect
          label="상태"
          value={filters.status}
          onChange={(value) => {
            onStatePresetChange('all');
            patch({ status: value });
          }}
          options={CONTRACT_STATUS_OPTIONS}
        />
        <FilterSelect
          label="문서 준비"
          value={docFilter}
          onChange={onDocFilterChange}
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
            <span className="text-muted-foreground">날짜</span>
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
            <span className="text-muted-foreground">금액</span>
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
        <label className="flex cursor-pointer items-center gap-2 px-1 text-sm">
          <Checkbox
            checked={filters.isJointBrokerage}
            onCheckedChange={(checked) => patch({ isJointBrokerage: checked === true })}
          />
          공동중개
        </label>
        <label className="flex cursor-pointer items-center gap-2 px-1 text-sm">
          <Checkbox
            checked={filters.retentionOverdue}
            onCheckedChange={(checked) => patch({ retentionOverdue: checked === true })}
          />
          보존기간 경과
        </label>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7"
          disabled={isDefault}
          onClick={() => {
            onChange(defaultListFilters());
            onDocFilterChange('');
            onStatePresetChange('all');
          }}
        >
          필터 초기화
        </Button>
      </FilterBar>
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
                  <p className="truncate text-sm font-medium">{propertyLabel || '매물 미지정'}</p>
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

function getDealLabel(deal: Deal) {
  return getDealSummaryLabel(deal);
}
