import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type {
  Contract,
  ContractDocument,
  ContractDocumentTemplate,
  CreateContractDocumentDto,
  CreateContractDto,
  DealListItem as Deal,
  UpdateContractDocumentDto,
} from '@estate-erp/api-client';
import { mergeResidentialSaleAgreementMetadata } from '@estate-erp/shared';
import { ApiError } from '@estate-erp/api-client';
import {
  applyEngineFieldsToResidentialSaleAgreement,
  getContractClauseLayout,
  getContractClauseLayoutContext,
  mergeContractDocumentEngineMetadata,
} from './-document-engine';
import { DocumentGallery } from './-document-gallery';
import { DocumentListTable, getDealSummaryLabel } from './-document-list-table';
import { ContractPeek } from './-document-peek';
import {
  CONTRACTS_PAGE_SIZE,
  DOC_STATE_PRESETS,
  countActiveFilters,
  defaultListFilters,
  isPristineList,
  toContractsFilter,
  type ContractListFilterState,
  type DocStatePreset,
} from './-list-model';
import {
  ContractsFilterRow,
  ContractsViewBar,
  type ContractsLayout,
} from './-list-toolbar';
import {
  toFormRegistrationMetadata,
  type FormRegistrationSpec,
} from './-form-registration-catalog';
import { FormRegistrationMenu } from './-form-registration-menu';
import {
  CONTRACT_TRANSACTION_TYPES,
  NumberField,
  getContractPropertyLabel,
  hasContractFile,
  isUnconfirmedContactName,
  resolveDocumentTemplate,
  sortContractDocuments,
  stringifyOptionalNumber,
  toContractTransactionType,
  toOptionalNumber,
  todayInput,
  UNCONFIRMED_CONTACT_MESSAGE,
} from './-contract-shared';
import {
  DocumentEditorWorkspace,
  emptyDocumentEditorForm,
  toDocumentEditorForm,
  type DocumentEditorForm,
} from './-document-editor';
import type { ContractDocumentEngineFields } from './-document-engine';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { tabResourceKeys } from '@/features/tabs/lib/tabResource';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { sanitizeContractRichTextForSave } from '@/lib/contract-rich-text';
import { ConfirmDialog, EmptyState } from '@/components/domain';
import { Button } from '@/components/ui/button';
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

function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

type ContractsSearch = {
  editorContractId?: string;
  editorDocumentId?: string;
};

export const Route = createFileRoute('/_authenticated/contracts/')({
  validateSearch: (search: Record<string, unknown>): ContractsSearch => ({
    editorContractId:
      typeof search.editorContractId === 'string' && search.editorContractId
        ? search.editorContractId
        : undefined,
    editorDocumentId:
      typeof search.editorDocumentId === 'string' && search.editorDocumentId
        ? search.editorDocumentId
        : undefined,
  }),
  component: ContractsPage,
});

function ContractsPage() {
  const queryClient = useQueryClient();
  const navigateContracts = Route.useNavigate();
  // 편집기를 여는 함수(useCallback)가 매번 새로 만들어지지 않게 ref로 읽는다
  const navigateContractsRef = useRef(navigateContracts);
  navigateContractsRef.current = navigateContracts;
  const { editorContractId, editorDocumentId } = Route.useSearch();
  const isEditorTab = Boolean(editorContractId);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const openOrRevealResource = useTabStore((state) => state.openOrRevealResource);
  const closeTab = useTabStore((state) => state.closeTab);
  const appliedDealIdRef = useRef<string | null>(null);
  const editorOpenRequestRef = useRef(0);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ContractListFilterState>(defaultListFilters());
  /** 클라이언트 보조 필터 (문서 준비 상태 — 서버 필터 없음, 현재 페이지에만 적용) */
  const [docFilter, setDocFilter] = useState('');
  const [page, setPage] = useState(1);
  /** 보기 방식: 표 / 자료 중심(갤러리) */
  const [layout, setLayout] = useState<ContractsLayout>('list');
  /** 레거시 showCust — 목록에 연락처 표시 */
  const [showPhones, setShowPhones] = useState(true);
  /** 보기 탭 (레거시 State_Type): 전체 / 진행 중 / 완료 */
  const [statePreset, setStatePreset] = useState<DocStatePreset>('all');
  /** 옆 상세 패널에 열린 계약. 부속 서식 등록의 대상이기도 하다 */
  const [focusedContractId, setFocusedContractId] = useState<string | null>(null);
  // 상세 패널은 매물관리 · 거래관리와 같은 방식으로 열고 닫는다: 닫을 때는 미끄러져 나간 뒤에 선택을 지운다.
  const [isPeekClosing, setIsPeekClosing] = useState(false);
  const [peekMotion, setPeekMotion] = useState(true);
  const openPeek = useCallback((contractId: string) => {
    setPeekMotion(!document.activeElement?.matches(':focus-visible'));
    setIsPeekClosing(false);
    setFocusedContractId(contractId);
  }, []);
  const closePeek = useCallback((animate = true) => {
    setPeekMotion(animate);
    setIsPeekClosing(true);
  }, []);
  const finishClosingPeek = useCallback(() => {
    setFocusedContractId(null);
    setIsPeekClosing(false);
  }, []);
  const [isFilterRowOpen, setIsFilterRowOpen] = useState(true);
  /** 값이 바뀌면 검색 칸을 열고 커서를 둔다 */
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
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
  const [deleteContractTarget, setDeleteContractTarget] = useState<Pick<Contract, 'id'> | null>(null);
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
    // 진행 중/완료 프리셋이 있으면 단일 status 필터를 덮어쓴다
    // (서버 status 쿼리는 단건 — 클라이언트 페이지 내 2차 필터로 보완)
    if (statePreset !== 'all' && !filters.status) {
      // status 단일값 API 한계: 진행 중은 draft 우선 조회 후 클라 필터, 완료는 registered
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
    queryKey: ['contracts', 'all'],
    queryFn: () => api.contracts.findAll(),
  });
  const allContracts = useMemo(() => allContractsQuery.data ?? [], [allContractsQuery.data]);

  // 계약서를 새로 만들 때 고를 거래: 계약서가 아직 없는 거래만 받는다
  const { data: deals = [] } = useQuery({
    queryKey: ['deals', 'without-contract'],
    queryFn: () => api.deals.findAll({ withoutContract: true }),
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

  // '/' = 검색 (Esc로 상세 패널을 닫는 것은 패널이 맡는다)
  useEffect(() => {
    if (isEditorTab) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (event.key === '/') {
        event.preventDefault();
        setSearchFocusSignal((value) => value + 1);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditorTab]);

  // 문서 준비 + 진행 중 프리셋 — 서버 단건 status 한계를 페이지 내 필터로 보완
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
      // 거래에 계약서 요약이 실려 온다 — 계약서가 바뀌면 거래도 다시 받는다
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.setQueryData(['contract', contractId], refreshed);

      const refreshedDocument =
        refreshed.documents?.find((item) => item.id === document.id) ?? document;
      const nextForm = toDocumentEditorForm(refreshed, template, refreshedDocument);
      nextForm.title = spec.title;

      setDocumentFormError(null);
      setSelectedContractId(contractId);
      if (isEditorTab) {
        setDocumentEditorForm(nextForm);
        setDocumentEditorBaseline(JSON.stringify(nextForm));
        setIsDocumentEditorOpen(true);
      } else {
        openContractEditorTab(contractId, refreshedDocument.id, spec.title);
      }
      toast.success(
        reused
          ? `기존 「${spec.title}」 서식을 열었습니다.`
          : `「${spec.title}」 양식을 추가했습니다.`,
      );
    },
    onError: (error, { contractId }) => {
      toast.error(apiErrorMessage(error, '선택한 양식 문서를 만들지 못했습니다. 다시 시도해 주세요.'));
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
            ? `계약서를 등록했습니다. 「${formSpec.title}」 양식을 엽니다.`
            : `독립 문서 묶음을 만들었습니다. 「${formSpec.title}」 양식을 엽니다.`
          : '계약서를 등록했습니다.',
      );
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      // 거래에 계약서 요약이 실려 온다 — 계약서가 바뀌면 거래도 다시 받는다
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      setSelectedContractId(created.id);
      if (formSpec) {
        applyFormMutation.mutate({ contractId: created.id, spec: formSpec });
      } else {
        openContractEditorTab(created.id);
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
      toast.error(apiErrorMessage(error, '계약서를 등록하지 못했습니다. 다시 시도해 주세요.'));
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
      // 계약서 문서의 금액·날짜는 서버가 계약서 요약(목록·패널의 잔금일 등)에 옮긴다.
      // 읽지 못한 칸은 요약을 그대로 두었으니 알려 준다.
      const unreadable = savedDocument.summarySync?.unreadable ?? [];
      if (unreadable.length > 0) {
        toast.warning(`${unreadable.join(', ')} 칸을 읽지 못해 계약서 요약에는 반영하지 않았습니다.`, {
          description: '금액은 숫자로, 날짜는 연·월·일을 모두 적어 주세요.',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      // 계약서 요약이 바뀌면 거래 대금 탭의 "계약서와 다릅니다" 표시도 다시 계산한다
      queryClient.invalidateQueries({ queryKey: ['deals'] });

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
      const message = apiErrorMessage(error, '문서를 저장하지 못했습니다. 다시 시도해 주세요.');
      setDocumentFormError(message);
      toast.error(message);
    },
  });

  // 계약 삭제 (레거시 §1.3 삭제 액션) — 문서/당사자/리비전 포함 영구 삭제 (cascade)
  const deleteContractMutation = useMutation({
    mutationFn: (contractId: string) => api.contracts.remove(contractId),
    onSuccess: (_result, contractId) => {
      toast.success('계약서를 삭제했습니다.');
      setDeleteContractTarget(null);
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      // 거래에 계약서 요약이 실려 온다 — 계약서가 바뀌면 거래도 다시 받는다
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.removeQueries({ queryKey: ['contract', contractId] });
      // 지운 계약이 상세 패널에 열려 있었으면 닫는다
      if (focusedContractId === contractId) finishClosingPeek();
      if (selectedContractId === contractId) {
        setSelectedContractId(null);
        setIsDocumentEditorOpen(false);
        setDocumentEditorForm(emptyDocumentEditorForm());
        setDocumentEditorBaseline(null);
      }
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '계약서를 삭제하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  // 계약 문서 세트 전체 사본 (레거시 "계약서/서식 복사")
  const copyContractMutation = useMutation({
    mutationFn: (contractId: string) => api.contracts.copyContract(contractId),
    onSuccess: (copied) => {
      toast.success('계약 문서 사본을 추가했습니다.');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      // 거래에 계약서 요약이 실려 온다 — 계약서가 바뀌면 거래도 다시 받는다
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['contract', copied.id] });
      setSelectedContractId(copied.id);
      openContractEditorTab(copied.id);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '사본을 만들지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const availableDeals = useMemo(() => {
    const contractedDealIds = new Set(allContracts.map((contract) => contract.dealId));
    // 취소한 거래에는 계약서를 새로 만들지 않는다
    return deals.filter((deal) => !contractedDealIds.has(deal.id) && !deal.isCancelled);
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

  /** 편집 탭 route가 지정한 계약/문서를 실제 편집 상태로 불러온다. */
  const loadDocumentEditor = useCallback(async (
    contractId: string,
    preferredDocumentId?: string,
  ) => {
    const requestId = ++editorOpenRequestRef.current;
    setSelectedContractId(contractId);
    setDocumentFormError(null);

    try {
      const [contract, templates] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: ['contract', contractId],
          queryFn: () => api.contracts.findOne(contractId),
        }),
        queryClient.fetchQuery({
          queryKey: ['contract-document-templates', 'all'],
          queryFn: () => api.contracts.documentTemplates(),
        }),
      ]);
      if (requestId !== editorOpenRequestRef.current) return;

      const documents = sortContractDocuments(contract.documents ?? []);
      const document =
        documents.find((item) => item.id === preferredDocumentId) ??
        documents.find(
          (item) => item.status !== 'cancelled' && item.category === 'contract',
        ) ??
        documents.find((item) => item.status !== 'cancelled') ??
        documents[0];

      let template: ContractDocumentTemplate;
      if (document) {
        template = resolveDocumentTemplate(document, templates);
      } else {
        const applicableTemplates = await queryClient.fetchQuery({
          queryKey: ['contract-document-templates', contract.transactionType],
          queryFn: () =>
            api.contracts.documentTemplates({
              transactionType: contract.transactionType,
            }),
        });
        if (requestId !== editorOpenRequestRef.current) return;

        const primaryTemplate =
          applicableTemplates.find(
            (item) => item.category === 'contract' && item.isRequired,
          ) ??
          applicableTemplates.find((item) => item.category === 'contract') ??
          applicableTemplates.find((item) => item.isRequired) ??
          applicableTemplates[0];

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
      // 없는 계약서(404)·형식이 틀린 id(400): 거래관리 바로 가기와 같게 한 번 알리고 주소에서 지워 목록을 보인다
      if (error instanceof ApiError && (error.statusCode === 404 || error.statusCode === 400)) {
        setDocumentFormError(null);
        toast.error('계약서를 찾을 수 없습니다. 지워졌을 수 있습니다.');
        void navigateContractsRef.current({ search: {}, replace: true });
        return;
      }
      const message =
        apiErrorMessage(error, '문서 편집기를 열지 못했습니다. 다시 시도해 주세요.');
      setDocumentFormError(message);
      toast.error(message);
    }
  }, [queryClient]);

  useEffect(() => {
    if (!editorContractId) return;
    void loadDocumentEditor(editorContractId, editorDocumentId);

    return () => {
      editorOpenRequestRef.current += 1;
    };
  }, [editorContractId, editorDocumentId, loadDocumentEditor]);

  /** 목록 탭을 유지한 채 계약 문서 편집 전용 탭을 열거나 기존 탭을 앞으로 가져온다. */
  function openContractEditorTab(
    contractId: string,
    documentId?: string,
    requestedTitle?: string,
  ) {
    const contract =
      contractDetail?.id === contractId
        ? contractDetail
        : allContracts.find((item) => item.id === contractId);
    const propertyLabel = getContractPropertyLabel(contract?.deal);
    const title =
      requestedTitle?.trim() ||
      [propertyLabel, '계약 문서'].filter(Boolean).join(' · ') ||
      '계약 문서';
    const search = new URLSearchParams({ editorContractId: contractId });
    if (documentId) search.set('editorDocumentId', documentId);

    openOrRevealResource({
      route: `/contracts?${search.toString()}`,
      kind: 'contract',
      title,
      resourceKey: tabResourceKeys.entity(
        documentId ? 'contract-document' : 'contract',
        documentId ?? contractId,
      ),
    });
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

  /** 문서 편집 탭 닫기 — 미저장 변경을 확인한 뒤 목록 탭으로 복귀한다. */
  function handleDocumentEditorClose() {
    if (isDocumentEditorDirty && !saveDocumentMutation.isPending) {
      const confirmed = window.confirm('저장하지 않은 변경사항이 있습니다. 저장 없이 닫을까요?');
      if (!confirmed) return;
    }

    editorOpenRequestRef.current += 1;
    if (isEditorTab && activeTabId) {
      closeTab(activeTabId);
      return;
    }

    setIsDocumentEditorOpen(false);
    setDocumentEditorForm(emptyDocumentEditorForm());
    setDocumentEditorBaseline(null);
    setDocumentFormError(null);
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
    // (금액단위·한글 금액 병기·공란인쇄·행 토글)을 printOptions 로 함께 저장한다.
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

  if (isEditorTab) {
    if (!isDocumentEditorOpen) {
      return (
        <div className="-m-4 flex min-h-0 flex-1 items-center justify-center bg-muted/30 p-8">
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            {documentFormError ? (
              <>
                <FileText className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">문서 편집기를 열지 못했습니다.</p>
                <p className="text-sm text-muted-foreground">{documentFormError}</p>
                <Button variant="outline" onClick={handleDocumentEditorClose}>
                  탭 닫기
                </Button>
              </>
            ) : (
              <>
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">계약 문서를 불러오는 중...</p>
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <DocumentEditorWorkspace
        dealId={contractDetail?.dealId ?? null}
        form={documentEditorForm}
        documents={contractDetail?.documents ?? []}
        error={documentFormError}
        isSaving={saveDocumentMutation.isPending}
        isAddingForm={applyFormMutation.isPending}
        isDirty={isDocumentEditorDirty}
        onClose={handleDocumentEditorClose}
        onFormChange={setDocumentEditorForm}
        onSelectDocument={switchDocumentEditor}
        onAddForm={handleEditorAddForm}
        onSave={() => saveDocument(false)}
        onSaveAsNew={() => saveDocument(true)}
      />
    );
  }

  const isFormBusy = createMutation.isPending || applyFormMutation.isPending;
  const peekContract = visibleContracts.find((contract) => contract.id === focusedContractId) ?? null;
  // 닫히는 중인 계약은 목록에서 선택 표시를 바로 뺀다
  const openPeekId = isPeekClosing ? null : (peekContract?.id ?? null);
  const selectContract = (contractId: string | null) => {
    if (contractId) openPeek(contractId);
    else closePeek();
  };
  const isEmptyOffice =
    !contractsQuery.isLoading && !contractsQuery.isError && visibleContracts.length === 0 && !isFiltered;

  const changeStatePreset = (key: DocStatePreset) => {
    setStatePreset(key);
    // 완료 탭은 서버의 상태 조건으로 거른다 (진행 중은 여러 상태라 이 페이지 안에서 거른다)
    if (key === 'done') setFilters((prev) => ({ ...prev, status: 'registered' }));
    else if (filters.status === 'registered') setFilters((prev) => ({ ...prev, status: '' }));
  };

  return (
    <div data-contracts-page className="relative -m-4 flex min-h-0 flex-1 overflow-hidden bg-white">
      <div className="flex min-w-0 flex-1 flex-col">
        <ContractsViewBar
          statePreset={statePreset}
          onStatePresetChange={changeStatePreset}
          isFilterRowOpen={isFilterRowOpen}
          onToggleFilterRow={() => setIsFilterRowOpen((open) => !open)}
          activeFilterCount={countActiveFilters(filters, docFilter)}
          search={filters.search}
          searchField={filters.searchField}
          onSearchChange={(search) => setFilters((prev) => ({ ...prev, search }))}
          onSearchFieldChange={(searchField) => setFilters((prev) => ({ ...prev, searchField }))}
          searchFocusSignal={searchFocusSignal}
          layout={layout}
          onLayoutChange={setLayout}
          showPhones={showPhones}
          onShowPhonesChange={setShowPhones}
          actions={
            <FormRegistrationMenu
              compact
              contractDisabled={isFormBusy}
              annexDisabled={isFormBusy}
              onSelect={handleFormRegistrationSelect}
            />
          }
        />
        {isFilterRowOpen && (
          <ContractsFilterRow
            filters={filters}
            docFilter={docFilter}
            kindOptions={kindOptions}
            canReset={!isPristineList(filters, docFilter, statePreset)}
            onChange={setFilters}
            onStatusChange={(status) => {
              setStatePreset('all');
              setFilters((prev) => ({ ...prev, status }));
            }}
            onDocFilterChange={setDocFilter}
            onReset={() => {
              setFilters(defaultListFilters());
              setDocFilter('');
              setStatePreset('all');
            }}
          />
        )}

        {contractsQuery.isError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[14px] text-muted-foreground">
            계약 목록을 불러오지 못했습니다.
            <Button variant="outline" size="sm" onClick={() => contractsQuery.refetch()}>
              다시 시도
            </Button>
          </div>
        ) : isEmptyOffice ? (
          <div className="flex flex-1 items-center justify-center px-4 pb-16">
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
          </div>
        ) : (
          <>
            <div
              data-contracts-body={layout}
              className={cn(
                'min-h-0 flex-1 overflow-auto',
                // 표는 도구 줄과 같은 자리(16px)에서 시작해 오른쪽 끝까지 간다
                layout === 'list' ? 'ml-4' : 'px-4 pb-6 pt-2',
              )}
            >
              {layout === 'list' ? (
                <DocumentListTable
                  contracts={visibleContracts}
                  isLoading={contractsQuery.isLoading}
                  isFiltered={isFiltered}
                  showPhones={showPhones}
                  selectedId={openPeekId}
                  onSelect={selectContract}
                  onCopy={(contract) => copyContractMutation.mutate(contract.id)}
                  isCopying={copyContractMutation.isPending}
                  onDelete={setDeleteContractTarget}
                  isDeleting={deleteContractMutation.isPending}
                  addRow={
                    <FormRegistrationMenu
                      showAnnex={false}
                      contractAlign="start"
                      contractDisabled={isFormBusy}
                      onSelect={handleFormRegistrationSelect}
                      contractTrigger={
                        <button
                          type="button"
                          className="flex h-9 w-full items-center gap-2 px-2 text-left text-[14px] text-[#a19e99] transition-colors hover:bg-[rgba(33,27,23,0.03)] hover:text-muted-foreground focus-visible:bg-[rgba(33,27,23,0.03)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                        >
                          <Plus className="size-4" />
                          새 계약서
                        </button>
                      }
                    />
                  }
                />
              ) : (
                <DocumentGallery
                  contracts={visibleContracts}
                  isLoading={contractsQuery.isLoading}
                  isFiltered={isFiltered}
                  selectedId={openPeekId}
                  onSelect={selectContract}
                />
              )}
            </div>

            <footer
              data-contracts-footer
              className="flex h-10 shrink-0 items-center gap-3 border-t border-border px-4 text-[13px] text-muted-foreground"
            >
              <span>
                개수 <span className="font-medium tabular-nums text-foreground">{totalCount.toLocaleString()}</span>
              </span>
              {visibleContracts.length !== pageContracts.length && (
                <span>이 페이지에서 {visibleContracts.length}건 표시</span>
              )}
              <span className="flex-1" />
              {pagination && (
                <span className="tabular-nums">
                  {pagination.page} / {Math.max(pagination.totalPages, 1)} 페이지
                </span>
              )}
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[13px] text-muted-foreground-strong"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                >
                  <ChevronLeft className="size-4" />
                  이전
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[13px] text-muted-foreground-strong"
                  disabled={!pagination || page >= pagination.totalPages}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  다음
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </footer>
          </>
        )}
      </div>

      {peekContract && (
        <ContractPeek
          contract={peekContract}
          showPhones={showPhones}
          closing={isPeekClosing}
          animate={peekMotion}
          onClose={closePeek}
          onExited={finishClosingPeek}
          onOpen={openContractEditorTab}
          onCopy={(contract) => copyContractMutation.mutate(contract.id)}
          isCopying={copyContractMutation.isPending}
          onDelete={setDeleteContractTarget}
          isDeleting={deleteContractMutation.isPending}
        />
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
            <DialogTitle>{pendingFormSpec ? pendingFormSpec.title : '계약서 등록'}</DialogTitle>
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
                종별 {pendingFormSpec.groupLabel} · 거래 {pendingFormSpec.tradeLabel}
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
              (isUnconfirmedContactName(selectedCreateDeal.buyerContact?.name) ||
                isUnconfirmedContactName(selectedCreateDeal.sellerContact?.name)) ? (
                <p className="mt-1 text-sm text-warning">{UNCONFIRMED_CONTACT_MESSAGE}</p>
              ) : null}
              {selectedCreateDeal &&
              (!selectedCreateDeal.buyerContactId || !selectedCreateDeal.sellerContactId) ? (
                <p className="mt-1 text-sm text-destructive">
                  거래에 매도인·매수인이 모두 있어야 계약서를 등록할 수 있습니다.{' '}
                  <Link
                    to="/deals"
                    search={{ dealId: selectedCreateDeal.id }}
                    className="underline underline-offset-2"
                  >
                    거래에서 당사자 넣기
                  </Link>
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
              {pendingFormSpec ? '등록하고 양식 열기' : '등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteContractTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteContractTarget(null);
        }}
        title="계약서 삭제"
        description="계약서와 그 안의 문서·당사자 정보가 모두 지워지며 되돌릴 수 없습니다. 거래는 남습니다."
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

function getDealLabel(deal: Deal) {
  return getDealSummaryLabel(deal);
}
