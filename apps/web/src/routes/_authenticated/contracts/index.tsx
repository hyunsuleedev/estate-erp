import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CirclePlus, FileText, LayoutGrid, List } from 'lucide-react';
import { toast } from 'sonner';
import type {
  Contract,
  ContractDocument,
  ContractDocumentTemplate,
  CreateContractDocumentDto,
  CreateContractDto,
  Deal,
  UpdateContractDocumentDto,
} from '@estate-erp/api-client';
import { mergeResidentialSaleAgreementMetadata } from '@estate-erp/shared';
import { mergeContractDocumentEngineMetadata } from './-document-engine';
import {
  ContractTransactionTypeBadge,
  CONTRACT_STATUS_OPTIONS,
  CONTRACT_TRANSACTION_TYPES,
  MetricTile,
  NumberField,
  SIGNED_OR_LATER,
  getContractProperty,
  getContractPropertyLabel,
  hasContractFile,
  stringifyOptionalNumber,
  toContractTransactionType,
  toOptionalNumber,
  todayInput,
} from './-contract-shared';
import { ContractDetailCard } from './-contract-detail';
import {
  DocumentEditorSheet,
  emptyDocumentEditorForm,
  toDocumentEditorForm,
  type DocumentEditorForm,
} from './-document-editor';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
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

export const Route = createFileRoute('/_authenticated/contracts/')({
  component: ContractsPage,
});

function ContractsPage() {
  const queryClient = useQueryClient();
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const appliedDealIdRef = useRef<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [docFilter, setDocFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [view, setView] = useState<'list' | 'docs'>('list');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDocumentEditorOpen, setIsDocumentEditorOpen] = useState(false);
  const [documentFormError, setDocumentFormError] = useState<string | null>(null);
  const [documentEditorForm, setDocumentEditorForm] = useState<DocumentEditorForm>(
    emptyDocumentEditorForm(),
  );
  const [createForm, setCreateForm] = useState<CreateContractDto>({
    dealId: '',
    transactionType: 'sale',
    totalPrice: undefined,
    monthlyRent: undefined,
    contractDate: todayInput(),
  });

  const contractsQuery = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api.contracts.findAll(),
  });
  const contracts = useMemo(
    () => contractsQuery.data ?? [],
    [contractsQuery.data],
  );

  const { data: deals = [] } = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

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
    const active = contracts.filter(
      (contract) => !['registered', 'cancelled'].includes(contract.status),
    );
    const signed = contracts.filter((contract) => SIGNED_OR_LATER.has(contract.status));
    const balancePending = contracts.filter((contract) =>
      ['signed', 'depositPaid'].includes(contract.status),
    );
    const missingDocs = contracts.filter(
      (contract) =>
        (contract.missingDocumentCount ?? 0) > 0 && contract.status !== 'cancelled',
    );

    return {
      active: active.length,
      signed: signed.length,
      balancePending: balancePending.length,
      missingDocs: missingDocs.length,
    };
  }, [contracts]);

  const filteredContracts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return contracts.filter((contract) => {
      if (statusFilter && contract.status !== statusFilter) return false;
      if (typeFilter && contract.transactionType !== typeFilter) return false;

      if (docFilter === 'missing' && (contract.missingDocumentCount ?? 0) === 0) {
        return false;
      }
      if (docFilter === 'ready' && (contract.missingDocumentCount ?? 0) > 0) {
        return false;
      }
      if (docFilter === 'hasFile' && !hasContractFile(contract)) return false;
      if (docFilter === 'noFile' && hasContractFile(contract)) return false;

      if (dateFrom || dateTo) {
        const contractDate = contract.contractDate?.slice(0, 10);
        if (!contractDate) return false;
        if (dateFrom && contractDate < dateFrom) return false;
        if (dateTo && contractDate > dateTo) return false;
      }

      if (!query) return true;

      const property = getContractProperty(contract.deal);

      return [
        getContractPropertyLabel(contract.deal),
        property?.site?.roadAddress,
        property?.site?.jibunAddress,
        contract.buyerContact?.name,
        contract.buyerContact?.phone,
        contract.sellerContact?.name,
        contract.sellerContact?.phone,
        contract.memo,
        contract.specialTerms,
        ...(contract.documents ?? []).map((document) => document.title),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [contracts, search, statusFilter, typeFilter, docFilter, dateFrom, dateTo]);

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

  const availableDeals = useMemo(() => {
    const contractedDealIds = new Set(contracts.map((contract) => contract.dealId));
    return deals.filter((deal) => !contractedDealIds.has(deal.id));
  }, [contracts, deals]);

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
    setDocumentEditorForm(toDocumentEditorForm(contractDetail, template, document));
    setIsDetailOpen(false);
    setIsDocumentEditorOpen(true);
  }

  function openContractDetail(contractId: string) {
    setSelectedContractId(contractId);
    setIsDetailOpen(true);
  }

  /** 문서 편집기를 닫으면(저장 외 취소/ESC 포함) 계약 상세로 복귀 */
  function handleDocumentEditorOpenChange(nextOpen: boolean) {
    setIsDocumentEditorOpen(nextOpen);
    if (!nextOpen && selectedContractId) {
      setIsDetailOpen(true);
    }
  }

  function saveDocument() {
    setDocumentFormError(null);
    const savedAt = new Date().toISOString();

    const engineMetadata = mergeContractDocumentEngineMetadata(
      documentEditorForm.metadata,
      documentEditorForm.engineFields,
    );
    const metadata = documentEditorForm.saleAgreement
      ? mergeResidentialSaleAgreementMetadata(
          engineMetadata,
          documentEditorForm.saleAgreement,
        )
      : engineMetadata;
    const title =
      documentEditorForm.engineFields.documentTitle.trim() || documentEditorForm.title;

    saveDocumentMutation.mutate({
      documentId: documentEditorForm.documentId,
      dto: {
        templateId: documentEditorForm.templateId,
        type: documentEditorForm.type,
        category: documentEditorForm.category,
        title,
        status: documentEditorForm.status,
        fileUrl: documentEditorForm.fileUrl.trim() || undefined,
        signedAt:
          documentEditorForm.status === 'signed'
            ? documentEditorForm.signedAt || savedAt
            : documentEditorForm.signedAt || undefined,
        submittedAt:
          documentEditorForm.status === 'submitted'
            ? documentEditorForm.submittedAt || savedAt
            : documentEditorForm.submittedAt || undefined,
        memo: documentEditorForm.memo.trim() || null,
        metadata,
      },
    });
  }

  const isFiltered =
    !!search.trim() || !!statusFilter || !!typeFilter || !!docFilter || !!dateFrom || !!dateTo;

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

      <FilterBar className="mb-3">
        <div ref={searchWrapRef}>
          <FilterSearch
            value={search}
            onChange={setSearch}
            placeholder="매물명, 당사자, 메모 검색 (/)"
          />
        </div>
        <FilterSelect
          label="상태"
          value={statusFilter}
          onChange={setStatusFilter}
          options={CONTRACT_STATUS_OPTIONS}
        />
        <FilterSelect
          label="거래유형"
          value={typeFilter}
          onChange={setTypeFilter}
          options={CONTRACT_TRANSACTION_TYPES}
        />
        <FilterSelect
          label="문서 준비"
          value={docFilter}
          onChange={setDocFilter}
          options={DOC_FILTER_OPTIONS}
        />
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="h-8 w-36"
            aria-label="계약일 시작"
          />
          <span className="text-xs text-muted-foreground">~</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="h-8 w-36"
            aria-label="계약일 종료"
          />
        </div>
        <FilterCount n={filteredContracts.length} />
        <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
          <Button
            variant={view === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setView('list')}
          >
            <List className="size-3.5" />
            목록
          </Button>
          <Button
            variant={view === 'docs' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setView('docs')}
          >
            <LayoutGrid className="size-3.5" />
            자료 중심
          </Button>
        </div>
      </FilterBar>

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
      ) : contracts.length === 0 ? (
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
      ) : view === 'list' ? (
        <ContractsTable
          contracts={filteredContracts}
          isFiltered={isFiltered}
          onOpen={openContractDetail}
        />
      ) : (
        <ContractsDocGrid
          contracts={filteredContracts}
          isFiltered={isFiltered}
          onOpen={openContractDetail}
        />
      )}

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="h-[calc(100vh-32px)] max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none xl:w-[1180px]">
          <ContractDetailCard
            open={isDetailOpen}
            contract={contractDetail}
            isLoading={detailQuery.isLoading}
            isError={detailQuery.isError}
            onRetry={() => detailQuery.refetch()}
            documentTemplates={documentTemplates}
            isDocumentTemplatesLoading={isDocumentTemplatesLoading}
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
        onOpenChange={handleDocumentEditorOpenChange}
        onFormChange={setDocumentEditorForm}
        onSave={saveDocument}
      />
    </div>
  );
}
function ContractsTable({
  contracts,
  isFiltered,
  onOpen,
}: {
  contracts: Contract[];
  isFiltered: boolean;
  onOpen: (contractId: string) => void;
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
              <TableHead className="min-w-24 text-xs text-muted-foreground">수정일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.map((contract) => {
              const missingCount = contract.missingDocumentCount ?? 0;
              const propertyLabel = getContractPropertyLabel(contract.deal);
              const balanceDday = getBalanceDday(contract);

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
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(contract.updatedAt)}
                  </TableCell>
                </TableRow>
              );
            })}
            {contracts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
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
