import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { CirclePlus, FileText, Landmark, ReceiptText } from 'lucide-react';
import type { Contract, CreateContractDto, Deal } from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
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

  useEffect(() => {
    if (!selectedContractId && filteredContracts.length > 0) {
      setSelectedContractId(filteredContracts[0].id);
    }

    if (
      selectedContractId &&
      filteredContracts.length > 0 &&
      !filteredContracts.some((contract) => contract.id === selectedContractId)
    ) {
      setSelectedContractId(filteredContracts[0].id);
    }
  }, [filteredContracts, selectedContractId]);

  const { data: contractDetail } = useQuery({
    queryKey: ['contract', selectedContractId],
    queryFn: () => api.contracts.findOne(selectedContractId as string),
    enabled: !!selectedContractId,
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
        selectedCreateDeal.transactionType ??
        selectedCreateDeal.listing?.transactionType ??
        prev.transactionType ??
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

  const metrics = useMemo(() => {
    return [
      { label: '전체 계약', value: `${contracts.length}건`, icon: FileText },
      {
        label: '진행 계약',
        value: `${contracts.filter((contract) => contract.status !== 'cancelled').length}건`,
        icon: Landmark,
      },
      {
        label: '서명 완료',
        value: `${contracts.filter((contract) => contract.status === 'signed').length}건`,
        icon: ReceiptText,
      },
      {
        label: '자료 누락',
        value: `${contracts.filter((contract) => (contract.missingDocumentCount ?? 0) > 0).length}건`,
        icon: FileText,
      },
    ];
  }, [contracts]);

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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="gap-3 py-4">
            <CardContent className="flex items-center justify-between px-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="text-xl font-semibold tracking-tight">{metric.value}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <metric.icon className="size-4" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid min-h-[780px] gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>계약 목록</CardTitle>
            <CardDescription>상태, 거래유형, 문서 준비 수준으로 필터링합니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="매물명, 당사자, 메모 검색"
            />
            <div className="grid gap-2 md:grid-cols-2">
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
            <ScrollArea className="h-[600px] rounded-lg border border-border/60">
              <div className="space-y-2 p-2">
                {filteredContracts.map((contract) => (
                  <button
                    key={contract.id}
                    type="button"
                    onClick={() => setSelectedContractId(contract.id)}
                    className={cn(
                      'w-full rounded-xl border border-transparent px-3 py-3 text-left transition-colors',
                      selectedContractId === contract.id
                        ? 'border-primary/30 bg-primary/5'
                        : 'hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {contract.deal?.property?.site?.name ?? '계약'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {contract.deal?.property?.unit?.name ?? '호실 미지정'}
                        </p>
                      </div>
                      <Badge className={cn('border-0', statusMeta[contract.status]?.className)}>
                        {statusMeta[contract.status]?.label ?? contract.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn('border-0', transactionTypeMeta[contract.transactionType]?.className)}
                      >
                        {transactionTypeMeta[contract.transactionType]?.label ?? contract.transactionType}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {contract.buyerContact?.name ?? '매수인 미지정'} / {contract.sellerContact?.name ?? '매도인 미지정'}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatPrice(contract.totalPrice)}</span>
                      <span>문서 {contract.documentCount ?? contract.attachments.length}</span>
                    </div>
                  </button>
                ))}
                {filteredContracts.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                    조건에 맞는 계약이 없습니다.
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <ContractDetailCard
          contract={contractDetail}
          form={detailForm}
          onFormChange={setDetailForm}
          onSave={() => updateMutation.mutate()}
          isSaving={updateMutation.isPending}
        />
      </div>

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
                  <SelectItem value="sale">매매</SelectItem>
                  <SelectItem value="jeonse">전세</SelectItem>
                  <SelectItem value="monthly">월세</SelectItem>
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
    </div>
  );
}

function ContractDetailCard({
  contract,
  form,
  onFormChange,
  onSave,
  isSaving,
}: {
  contract?: Contract;
  form: ContractForm;
  onFormChange: Dispatch<SetStateAction<ContractForm>>;
  onSave: () => void;
  isSaving: boolean;
}) {
  if (!contract) {
    return (
      <Card>
        <CardContent className="flex min-h-[540px] items-center justify-center text-sm text-muted-foreground">
          계약을 선택하면 상세 정보가 표시됩니다.
        </CardContent>
      </Card>
    );
  }

  const attachments = form.attachmentsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const missingDocuments = (contract.requiredDocuments ?? []).slice(attachments.length);

  return (
    <Card className="min-h-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle>{contract.deal?.property?.site?.name ?? '계약'}</CardTitle>
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
            <CardDescription>
              {contract.deal?.property?.unit?.name ?? '호실 미지정'} · 업데이트 {formatDateTime(contract.updatedAt)}
            </CardDescription>
          </div>
          <Button onClick={onSave} disabled={isSaving}>
            저장
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid min-h-0 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <MetricTile label="총 거래금액" value={formatPrice(Number(form.totalPrice || 0))} />
            <MetricTile label="문서 수" value={`${attachments.length}건`} />
            <MetricTile
              label="계약 상태"
              value={statusMeta[form.status]?.label ?? form.status}
            />
            <MetricTile
              label="자료 누락"
              value={`${Math.max((contract.requiredDocuments?.length ?? 0) - attachments.length, 0)}건`}
            />
          </div>

          <Card className="gap-4 py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-base">계약 기본 정보</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 px-5 md:grid-cols-2">
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
                    <SelectItem value="sale">매매</SelectItem>
                    <SelectItem value="jeonse">전세</SelectItem>
                    <SelectItem value="monthly">월세</SelectItem>
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
            <CardContent className="grid gap-4 px-5 md:grid-cols-2">
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
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="gap-4 py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-base">문서 허브</CardTitle>
              <CardDescription>
                첨부 URL을 한 줄에 하나씩 입력합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-5">
              <div className="space-y-2">
                <Label>첨부 문서</Label>
                <Textarea
                  rows={8}
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
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">현재 문서</p>
                {attachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">등록된 첨부 문서가 없습니다.</p>
                ) : (
                  attachments.map((attachment) => (
                    <div
                      key={attachment}
                      className="rounded-lg border border-border/60 px-3 py-2 text-sm"
                    >
                      {attachment}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="gap-4 py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-base">준비 서류 상태</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-5">
              {(contract.requiredDocuments ?? []).map((item, index) => {
                const ready = index < attachments.length;
                return (
                  <div
                    key={item}
                    className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                  >
                    <span className="text-sm">{item}</span>
                    <Badge variant={ready ? 'secondary' : 'outline'}>
                      {ready ? '준비됨' : '대기'}
                    </Badge>
                  </div>
                );
              })}
              {missingDocuments.length === 0 ? (
                <p className="pt-2 text-sm text-emerald-600">필수 서류가 모두 준비되었습니다.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="gap-4 py-5">
            <CardHeader className="px-5">
              <CardTitle className="text-base">연결 거래 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-5 text-sm">
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
        </div>
      </CardContent>
    </Card>
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

function toDateInput(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
