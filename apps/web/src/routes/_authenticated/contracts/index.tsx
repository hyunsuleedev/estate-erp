import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  CirclePlus,
  ClipboardList,
  FileCheck2,
  FilePenLine,
  FileText,
  Printer,
} from 'lucide-react';
import type {
  Contract,
  ContractDocument,
  ContractDocumentTemplate,
  CreateContractDocumentDto,
  CreateContractDto,
  Deal,
  UpdateContractDocumentDto,
} from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import {
  buildContractDocumentEngineDraft,
  getContractDocumentEngineFieldGroups,
  getContractDocumentEngineSections,
  mergeContractDocumentEngineMetadata,
  type ContractDocumentEngineFieldDefinition,
  type ContractDocumentEngineFields,
  type ContractDocumentEngineWorkflow,
} from './-document-engine';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  exchange: { label: '교환', className: 'bg-amber-50 text-amber-700' },
  sublease: { label: '전대', className: 'bg-cyan-50 text-cyan-700' },
  transfer: { label: '권리양도', className: 'bg-fuchsia-50 text-fuchsia-700' },
  succession: { label: '권리승계', className: 'bg-indigo-50 text-indigo-700' },
};

const CONTRACT_TRANSACTION_TYPES: Array<{ value: string; label: string }> = [
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly', label: '월세' },
  { value: 'exchange', label: '교환' },
  { value: 'sublease', label: '전대' },
  { value: 'transfer', label: '권리양도' },
  { value: 'succession', label: '권리승계' },
];

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
};

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
};

export const Route = createFileRoute('/_authenticated/contracts/')({
  component: ContractsPage,
});

function ContractsPage() {
  const queryClient = useQueryClient();
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
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
  const [detailForm, setDetailForm] = useState<ContractForm>(emptyContractForm());

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api.contracts.findAll(),
  });

  const { data: deals = [] } = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  const filteredContracts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return contracts.filter((contract) => {
      if (statusFilter !== 'all' && contract.status !== statusFilter) return false;
      if (typeFilter !== 'all' && contract.transactionType !== typeFilter) return false;

      if (!query) return true;

      return [
        contract.deal?.property?.site?.name,
        contract.deal?.property?.unit?.name,
        contract.buyerContact?.name,
        contract.sellerContact?.name,
        contract.memo,
        contract.specialTerms,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [contracts, search, statusFilter, typeFilter]);

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
        specialTerms: emptyStringToNull(detailForm.specialTerms),
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
    },
    onError: (error) => {
      setDocumentFormError(
        error instanceof Error ? error.message : '문서를 저장하지 못했습니다.',
      );
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
    setDocumentEditorForm(toDocumentEditorForm(contractDetail, template, document));
    setIsDetailOpen(false);
    setIsDocumentEditorOpen(true);
  }

  function openContractDetail(contractId: string) {
    setSelectedContractId(contractId);
    setIsDetailOpen(true);
  }

  function saveDocument() {
    setDocumentFormError(null);

    const metadata = mergeContractDocumentEngineMetadata(
      documentEditorForm.metadata,
      documentEditorForm.engineFields,
    );
    const title =
      documentEditorForm.engineFields.documentTitle.trim() ||
      documentEditorForm.title;

    saveDocumentMutation.mutate({
      documentId: documentEditorForm.documentId,
      dto: {
        templateId: documentEditorForm.templateId,
        type: documentEditorForm.type,
        category: documentEditorForm.category,
        title,
        status: documentEditorForm.status,
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
            <span className="text-xs text-muted-foreground">{contracts.length}건</span>
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
              {filteredContracts.length} / {contracts.length}건
            </span>
          </div>
          <div className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_180px_180px]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="매물명, 당사자, 메모 검색"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="거래 유형" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 유형</SelectItem>
                {Object.entries(transactionTypeMeta).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                    <TableHead className="min-w-28">수정일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContracts.map((contract) => {
                    const missingCount = contract.missingDocumentCount ?? 0;

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
                          <Badge variant={missingCount > 0 ? 'outline' : 'secondary'}>
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
                  {filteredContracts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
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
        </CardContent>
      </Card>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
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
        onOpenChange={setIsDocumentEditorOpen}
        onFormChange={setDocumentEditorForm}
        onSave={saveDocument}
      />
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
  onOpenDocument,
}: {
  contract?: Contract;
  documentTemplates: ContractDocumentTemplate[];
  isDocumentTemplatesLoading: boolean;
  form: ContractForm;
  onFormChange: Dispatch<SetStateAction<ContractForm>>;
  onSave: () => void;
  isSaving: boolean;
  onOpenDocument: (
    template: ContractDocumentTemplate,
    document?: ContractDocument,
  ) => void;
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
          <Button className="mr-8" onClick={onSave} disabled={isSaving}>
            저장
          </Button>
        </div>
      </div>

      <Tabs defaultValue="summary" className="min-h-0 flex-1 gap-0">
        <div className="border-b px-6 py-3">
          <TabsList>
            <TabsTrigger value="summary">요약</TabsTrigger>
            <TabsTrigger value="contract">계약 정보</TabsTrigger>
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
                    <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {form.specialTerms}
                    </p>
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
                    <Textarea
                      rows={5}
                      value={form.specialTerms}
                      onChange={(event) =>
                        onFormChange((prev) => ({ ...prev, specialTerms: event.target.value }))
                      }
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

            <TabsContent value="documents" className="m-0">
              <DocumentHub
                contract={contract}
                templates={availableTemplates}
                isLoading={isDocumentTemplatesLoading}
                onOpenDocument={onOpenDocument}
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
}: {
  contract: Contract;
  templates: ContractDocumentTemplate[];
  isLoading: boolean;
  onOpenDocument: (
    template: ContractDocumentTemplate,
    document?: ContractDocument,
  ) => void;
}) {
  const documents = contract.documents ?? [];
  const rows = templates.map((template) => ({
    template,
    document: findDocumentByTemplate(documents, template.id),
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
  onOpenChange,
  onFormChange,
  onSave,
}: {
  open: boolean;
  form: DocumentEditorForm;
  error: string | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: Dispatch<SetStateAction<DocumentEditorForm>>;
  onSave: () => void;
}) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const fieldGroups = getContractDocumentEngineFieldGroups(form.category);
  const sections = getContractDocumentEngineSections(form.category, form.engineFields);
  const documentTitle = form.engineFields.documentTitle || form.title || '계약 문서';

  function updateEngineField(key: string, value: string) {
    onFormChange((prev) => ({
      ...prev,
      engineFields: {
        ...prev.engineFields,
        [key]: value,
      },
    }));
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

                {fieldGroups.map((group) => (
                  <DocumentInputFormSection
                    key={group.title}
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
              <Button
                onClick={onSave}
                disabled={isSaving || !documentTitle || !form.category}
              >
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

function DocumentInputFormSection({
  title,
  fields,
  values,
  onFieldChange,
}: {
  title: string;
  fields: ContractDocumentEngineFieldDefinition[];
  values: ContractDocumentEngineFields;
  onFieldChange: (key: string, value: string) => void;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-background p-5">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <div key={field.key} className={field.multiline ? 'md:col-span-2 xl:col-span-3' : ''}>
            <DocumentEngineFieldControl
              field={field}
              value={values[field.key] ?? ''}
              onChange={(value) => onFieldChange(field.key, value)}
            />
          </div>
        ))}
      </div>
    </section>
  );
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
  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      {field.multiline ? (
        <Textarea
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
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
              {section.rows.map((row) => (
                <DocumentPreviewRow
                  key={`${section.title}-${row.label}`}
                  label={row.label}
                  value={row.value}
                  multiline={row.multiline}
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
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] border-b border-slate-200 last:border-b-0">
      <div className="bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
        {label}
      </div>
      <div
        className={cn(
          'min-h-9 px-3 py-2 text-sm leading-6',
          multiline ? 'whitespace-pre-wrap' : 'truncate',
        )}
      >
        {value || '\u00A0'}
      </div>
    </div>
  );
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
  };
}

function toDocumentEditorForm(
  contract: Contract,
  template: ContractDocumentTemplate,
  document?: ContractDocument,
): DocumentEditorForm {
  const draft = buildContractDocumentEngineDraft({
    contract,
    template,
    document,
  });

  return {
    documentId: document?.id,
    templateId: template.id,
    type: document?.type ?? 'generated',
    category: document?.category ?? template.category,
    title: draft.title,
    status: document?.status ?? 'generated',
    fileUrl: document?.fileUrl ?? '',
    memo: document?.memo ?? '',
    metadata: document?.metadata ?? template.metadata ?? {},
    workflow: draft.workflow,
    engineFields: draft.fields,
  };
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
