/**
 * 계약 상세 워크스페이스 — 요약(대금 타임라인) / 계약 정보(특약 템플릿) /
 * 당사자(ContractParty 편집) / 문서 허브(거래신고 D-day, 사본/삭제) /
 * 거래 정보(컨텍스트 점프) / 이력(ActivityLog).
 *
 * 폼 상태는 페이지(index.tsx)가 소유한다 — 문서 편집기로 전환(다이얼로그 닫힘)해도
 * 미저장 편집이 유지되고, 닫기 시 dirty 확인을 다이얼로그 레벨에서 할 수 있다.
 */
import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type {
  Contract,
  ContractDocument,
  ContractDocumentTemplate,
} from '@estate-erp/api-client';
import {
  ContractRichTextView,
  ContractTransactionTypeBadge,
  CONTRACT_STATUS_OPTIONS,
  CONTRACT_TRANSACTION_TYPES,
  MetricTile,
  NumberField,
  StaticField,
  SummaryRow,
  emptyDateToNull,
  emptyStringToNull,
  findDocumentByTemplate,
  getContractProperty,
  getContractPropertyLabel,
  getContractStatusLabel,
  getNextContractStatus,
  getPaymentSumMismatch,
  getReportDeadline,
  toNullableNumber,
  toOptionalNumber,
  validateContractForm,
  type ContractForm,
} from './-contract-shared';
import { DocumentHub } from './-document-hub';
import { ContractPartiesCard } from './-parties-editor';
import { SpecialTermsCard } from './-special-terms-card';
import { ActivityLogPanel, DealInfoTab } from './-contract-context';
import { PaymentTimelineCard } from './-payment-timeline';
import { api } from '@/lib/api';
import { sanitizeContractRichTextForSave } from '@/lib/contract-rich-text';
import {
  formatDate,
  formatDateTime,
  formatDday,
  formatMoney,
} from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { EntityChip, PipelineSteps, StatusBadge } from '@/components/domain';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ContractDetailCard({
  open,
  contract,
  isLoading,
  isError,
  onRetry,
  documentTemplates,
  isDocumentTemplatesLoading,
  form,
  onFormChange,
  isDirty,
  onOpenDocument,
}: {
  open: boolean;
  contract?: Contract;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  documentTemplates: ContractDocumentTemplate[];
  isDocumentTemplatesLoading: boolean;
  /** 페이지 소유 폼 상태 (dirty tracking — 문서 편집기 전환에도 유지) */
  form: ContractForm;
  onFormChange: Dispatch<SetStateAction<ContractForm>>;
  isDirty: boolean;
  onOpenDocument: (
    template: ContractDocumentTemplate,
    document?: ContractDocument,
  ) => void;
}) {
  const queryClient = useQueryClient();

  const dealQuery = useQuery({
    queryKey: ['deal', contract?.dealId],
    queryFn: () => api.deals.findOne(contract?.dealId as string),
    enabled: open && !!contract?.dealId,
  });

  const updateMutation = useMutation({
    mutationFn: (nextForm: ContractForm) =>
      api.contracts.update(contract?.id as string, {
        transactionType: nextForm.transactionType,
        status: nextForm.status,
        totalPrice: toOptionalNumber(nextForm.totalPrice),
        monthlyRent:
          nextForm.transactionType === 'monthly'
            ? toOptionalNumber(nextForm.monthlyRent) ?? null
            : null,
        contractDate: emptyDateToNull(nextForm.contractDate),
        statedDeposit: toNullableNumber(nextForm.statedDeposit),
        statedInterimPayment: toNullableNumber(nextForm.statedInterimPayment),
        statedInterimDate: emptyDateToNull(nextForm.statedInterimDate),
        statedBalance: toNullableNumber(nextForm.statedBalance),
        statedBalanceDate: emptyDateToNull(nextForm.statedBalanceDate),
        moveInDate: emptyDateToNull(nextForm.moveInDate),
        leaseStartDate: emptyDateToNull(nextForm.leaseStartDate),
        leaseEndDate: emptyDateToNull(nextForm.leaseEndDate),
        // 특약은 rich text HTML — 저장 전 새니타이즈 (레거시 plain text 는 그대로)
        specialTerms: emptyStringToNull(
          sanitizeContractRichTextForSave(nextForm.specialTerms),
        ),
        memo: emptyStringToNull(nextForm.memo),
        attachments: nextForm.attachmentsText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.success('계약 정보를 저장했습니다.');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', contract?.id] });
      queryClient.invalidateQueries({
        queryKey: ['activity-logs', 'Contract', contract?.id],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : '계약 정보를 저장하지 못했습니다.',
      );
    },
  });

  // 서식 단건 사본 (레거시 "다른저장") — 같은 kind 는 kindOrder 자동 증가
  const copyDocumentMutation = useMutation({
    mutationFn: (documentId: string) =>
      api.contracts.copyDocument(contract?.id as string, documentId),
    onSuccess: () => {
      toast.success('문서 사본을 만들었습니다.');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', contract?.id] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : '문서 사본을 만들지 못했습니다.',
      );
    },
  });

  // 문서 단건 삭제 — 취소(status=cancelled) 우회가 아닌 영구 삭제
  // (v2 리비전(ContractDocumentRevision)은 DB cascade 로 함께 삭제된다)
  const deleteDocumentMutation = useMutation({
    mutationFn: (documentId: string) =>
      api.contracts.removeDocument(contract?.id as string, documentId),
    onSuccess: () => {
      toast.success('문서를 삭제했습니다.');
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract', contract?.id] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : '문서를 삭제하지 못했습니다.',
      );
    },
  });

  function deleteDocument(documentId: string) {
    const confirmed = window.confirm(
      '이 문서와 수정 이력이 영구 삭제되며 복구할 수 없습니다. 삭제할까요?',
    );
    if (!confirmed) return;
    deleteDocumentMutation.mutate(documentId);
  }

  function handleSave(statusOverride?: string) {
    const nextForm = statusOverride ? { ...form, status: statusOverride } : form;
    const validationError = validateContractForm(nextForm);

    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (statusOverride) onFormChange(nextForm);
    updateMutation.mutate(nextForm);
  }

  // Ctrl/Cmd+S 저장 (PRD 키보드 단축키)
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        // 저장 버튼과 동일하게 미저장 변경이 있을 때만 저장
        if (isDirty) handleSave();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form, contract?.id, isDirty]);

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <DialogTitle className="sr-only">계약 상세</DialogTitle>
        계약 상세 정보를 불러오지 못했습니다.
        <Button variant="outline" size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (isLoading || !contract) {
    return (
      <div className="space-y-4 p-6">
        <DialogTitle className="sr-only">계약 상세</DialogTitle>
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  const property = getContractProperty(contract.deal);
  const propertyLabel = getContractPropertyLabel(contract.deal) || '계약';
  const nextStatus = getNextContractStatus(form.status);
  const mismatch = getPaymentSumMismatch(form);
  const reportDeadline = getReportDeadline(form.contractDate || contract.contractDate);
  const reportTemplates = (contract.requiredDocumentTemplates ?? []).filter(
    (template) => template.category === 'report',
  );
  const unsubmittedReports = reportTemplates.filter((template) => {
    const document = findDocumentByTemplate(contract.documents ?? [], template.id);
    return !document?.submittedAt;
  });
  const showReportWarning =
    !!reportDeadline && unsubmittedReports.length > 0 && form.status !== 'cancelled';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{propertyLabel}</DialogTitle>
              <StatusBadge kind="contractStatus" status={form.status} />
              <ContractTransactionTypeBadge type={form.transactionType} />
            </div>
            <DialogDescription>
              {contract.statedBalanceDate
                ? `잔금일 ${formatDate(contract.statedBalanceDate)} (${formatDday(contract.statedBalanceDate)}) · `
                : ''}
              업데이트 {formatDateTime(contract.updatedAt)}
            </DialogDescription>
            <div className="flex flex-wrap items-center gap-2">
              {contract.deal ? (
                <EntityChip
                  kind="deal"
                  id={contract.deal.id}
                  label={`거래 · ${getStatusMeta('dealStage', contract.deal.stage).label}`}
                />
              ) : null}
              {property?.id ? (
                <EntityChip kind="property" id={property.id} label={propertyLabel} />
              ) : null}
            </div>
          </div>
          <div className="mr-8 flex items-center gap-2">
            {nextStatus ? (
              <Button
                variant="outline"
                onClick={() => handleSave(nextStatus)}
                disabled={updateMutation.isPending}
              >
                {getContractStatusLabel(nextStatus)}로 진행
                <ChevronRight className="size-4" />
              </Button>
            ) : null}
            <Button
              onClick={() => handleSave()}
              disabled={updateMutation.isPending || !isDirty}
            >
              저장
            </Button>
          </div>
        </div>
        <PipelineSteps
          kind="contractStatus"
          current={form.status}
          cancelled={form.status === 'cancelled'}
          className="mt-4"
        />
      </div>

      <Tabs defaultValue="summary" className="min-h-0 flex-1 gap-0">
        <div className="border-b px-6 py-3">
          <TabsList>
            <TabsTrigger value="summary">요약</TabsTrigger>
            <TabsTrigger value="contract">계약 정보</TabsTrigger>
            <TabsTrigger value="parties">당사자</TabsTrigger>
            <TabsTrigger value="documents">문서 허브</TabsTrigger>
            <TabsTrigger value="deal">거래 정보</TabsTrigger>
            <TabsTrigger value="history">이력</TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-6">
            <TabsContent value="summary" className="m-0 space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  label="총 거래금액"
                  value={formatMoney(toOptionalNumber(form.totalPrice) ?? null)}
                />
                <MetricTile
                  label="잔금일"
                  value={
                    form.statedBalanceDate
                      ? `${formatDate(form.statedBalanceDate)} (${formatDday(form.statedBalanceDate)})`
                      : '—'
                  }
                />
                <MetricTile label="작성 문서" value={`${contract.documentCount ?? 0}건`} />
                <MetricTile
                  label="자료 누락"
                  value={`${contract.missingDocumentCount ?? 0}건`}
                />
              </div>

              {showReportWarning ? (
                <ReportDeadlineAlert
                  deadline={reportDeadline}
                  count={unsubmittedReports.length}
                />
              ) : null}

              <PaymentTimelineCard
                form={form}
                payments={dealQuery.data?.payments ?? []}
                isLoading={dealQuery.isLoading}
                isError={dealQuery.isError}
                onRetry={() => dealQuery.refetch()}
                hasDeal={!!contract.dealId}
              />

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="gap-4 py-5">
                  <CardHeader className="px-5">
                    <CardTitle className="text-base">계약 요약</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-5">
                    <SummaryRow label="계약일" value={formatDate(contract.contractDate)} />
                    <SummaryRow
                      label="거래 유형"
                      value={
                        CONTRACT_TRANSACTION_TYPES.find(
                          (type) => type.value === form.transactionType,
                        )?.label ?? form.transactionType
                      }
                    />
                    <SummaryRow
                      label="매수인/임차인"
                      value={contract.buyerContact?.name ?? '—'}
                    />
                    <SummaryRow
                      label="매도인/임대인"
                      value={contract.sellerContact?.name ?? '—'}
                    />
                    <SummaryRow
                      label="금액"
                      value={formatMoney(toOptionalNumber(form.totalPrice) ?? null)}
                    />
                  </CardContent>
                </Card>

                <Card className="gap-4 py-5">
                  <CardHeader className="px-5">
                    <CardTitle className="text-base">문서 준비</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-5">
                    <SummaryRow
                      label="필수 문서"
                      value={`${contract.requiredDocumentTemplates?.length ?? 0}건`}
                    />
                    <SummaryRow label="작성 문서" value={`${contract.documentCount ?? 0}건`} />
                    <SummaryRow
                      label="누락 문서"
                      value={`${contract.missingDocumentCount ?? 0}건`}
                    />
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
                      onValueChange={(value) =>
                        onFormChange((prev) => ({ ...prev, status: value }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="상태 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTRACT_STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
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

                  <StaticField
                    label="매수인/임차인"
                    value={contract.buyerContact?.name ?? '—'}
                  />
                  <StaticField
                    label="매도인/임대인"
                    value={contract.sellerContact?.name ?? '—'}
                  />

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
                  <CardTitle className="text-base">지급 일정 (계약서 명목)</CardTitle>
                  <CardDescription>
                    계약서에 기재되는 명목 금액입니다. 실제 입금 이력은 요약 탭의 대금
                    타임라인에서 확인합니다.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 px-5">
                  {mismatch ? (
                    <Alert>
                      <AlertTriangle className="size-4 text-warning" />
                      <AlertTitle className="text-warning">금액 정합성 확인 필요</AlertTitle>
                      <AlertDescription>
                        계약금+중도금+잔금 합계 {formatMoney(mismatch.sum)}이(가) 총 거래금액{' '}
                        {formatMoney(mismatch.total)}과 일치하지 않습니다.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <PaymentFieldGroup
                      title="계약금"
                      amount={form.statedDeposit}
                      onAmountChange={(value) =>
                        onFormChange((prev) => ({ ...prev, statedDeposit: value }))
                      }
                    />
                    <PaymentFieldGroup
                      title="중도금"
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
                      title="잔금"
                      amount={form.statedBalance}
                      date={form.statedBalanceDate}
                      onAmountChange={(value) =>
                        onFormChange((prev) => ({ ...prev, statedBalance: value }))
                      }
                      onDateChange={(value) =>
                        onFormChange((prev) => ({ ...prev, statedBalanceDate: value }))
                      }
                    />

                    <div className="space-y-4 rounded-md border border-border/60 p-4">
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
                            onFormChange((prev) => ({
                              ...prev,
                              leaseStartDate: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>임대 종료일</Label>
                        <Input
                          type="date"
                          value={form.leaseEndDate}
                          onChange={(event) =>
                            onFormChange((prev) => ({
                              ...prev,
                              leaseEndDate: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <SpecialTermsCard
                form={form}
                onFormChange={onFormChange}
                transactionType={form.transactionType}
              />
            </TabsContent>

            <TabsContent value="parties" className="m-0">
              <ContractPartiesCard contract={contract} />
            </TabsContent>

            <TabsContent value="documents" className="m-0 space-y-4">
              {showReportWarning ? (
                <ReportDeadlineAlert
                  deadline={reportDeadline}
                  count={unsubmittedReports.length}
                />
              ) : null}
              <DocumentHub
                contract={contract}
                templates={
                  documentTemplates.length > 0
                    ? documentTemplates
                    : contract.requiredDocumentTemplates ?? []
                }
                isLoading={isDocumentTemplatesLoading}
                reportDeadline={reportDeadline}
                onOpenDocument={onOpenDocument}
                onCopyDocument={(documentId) => copyDocumentMutation.mutate(documentId)}
                isCopyingDocument={copyDocumentMutation.isPending}
                onDeleteDocument={deleteDocument}
                isDeletingDocument={deleteDocumentMutation.isPending}
              />
            </TabsContent>

            <TabsContent value="deal" className="m-0 space-y-4">
              <DealInfoTab contract={contract} />
            </TabsContent>

            <TabsContent value="history" className="m-0">
              <ActivityLogPanel contractId={contract.id} open={open} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function ReportDeadlineAlert({
  deadline,
  count,
}: {
  deadline: Date | null;
  count: number;
}) {
  if (!deadline) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertTitle>
        부동산 거래신고 기한 {formatDate(deadline)} ({formatDday(deadline)})
      </AlertTitle>
      <AlertDescription>
        계약일 기준 30일 이내 신고가 필요합니다. 신고 서류 {count}건이 아직 제출되지
        않았습니다.
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// 명목 금액 입력 그룹
// ---------------------------------------------------------------------------

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
    <div className="space-y-4 rounded-md border border-border/60 p-4">
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
    </div>
  );
}
