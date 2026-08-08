import { getListingAvailability } from "@/lib/listing-status";
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Ban,
  Circle,
  CircleAlert,
  ExternalLink,
  FilePlus2,
  FileText,
  Pencil,
  Phone,
  TimerReset,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Contact, Contract, Deal } from '@estate-erp/api-client';
import { normalizeDealStage } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatArea, formatDate, formatMoney, formatPhone, formatRent } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { DetailField, EntityChip, PipelineSteps, StatusBadge } from '@/components/domain';
import { ContactPicker, DealActionsMenu, SectionTitle } from './-deal-shared';
import { DealCommissionSection } from './-deal-commission';
import { DealPaymentsSection } from './-deal-payments';
import {
  formatCancelledBy,
  formatDealAmount,
  formatNextPaymentLabel,
  getDealLocationLine,
  getDealPipelineHealth,
  getDealShortCode,
  getDealTitle,
  getDealTransactionType,
  getNextDealPaymentSummary,
  getNextDealStage,
  ourSideLabels,
  type DealRowActions,
} from './-deal-view-utils';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청 처리에 실패했습니다.';
}

function todayInput() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export function DealDetailSheet({
  deal,
  contract,
  open,
  referenceDate,
  onOpenChange,
  actions,
}: {
  deal: Deal | null;
  contract: Contract | null;
  open: boolean;
  referenceDate: Date;
  onOpenChange: (open: boolean) => void;
  actions: DealRowActions;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[calc(100vw-40px)] max-w-none gap-0 overflow-y-auto p-0 sm:w-[740px] sm:max-w-[740px]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>거래 상세</SheetTitle>
          <SheetDescription>선택한 거래의 일정, 당사자, 지급 스케줄, 수수료 정보를 확인합니다.</SheetDescription>
        </SheetHeader>
        {deal ? (
          <DealDetailPanel
            key={deal.id}
            deal={deal}
            contract={contract}
            referenceDate={referenceDate}
            actions={actions}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DealDetailPanel({
  deal,
  contract,
  referenceDate,
  actions,
}: {
  deal: Deal;
  contract: Contract | null;
  referenceDate: Date;
  actions: DealRowActions;
}) {
  const transactionType = getDealTransactionType(deal);
  const nextPayment = getNextDealPaymentSummary(deal, referenceDate);
  const pipelineHealth = getDealPipelineHealth(deal, referenceDate);
  const participantNames = [
    ...new Set((deal.participants ?? []).map((participant) => participant.user.name)),
  ];
  const currentStage = normalizeDealStage(deal.stage);
  const nextStage = getNextDealStage(currentStage);
  const canSkipPreContract = currentStage === 'preparing';
  const canCreateContract = ['contracted', 'settling', 'completed', 'closed'].includes(currentStage);
  const billed = deal.commissionSummary?.billed ?? 0;
  const [termsOpen, setTermsOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);

  const priceLabel =
    transactionType === 'sale'
      ? '매매가'
      : transactionType === 'jeonse'
        ? '전세금'
        : '합의 가격';

  return (
    <section className="min-h-full overflow-hidden bg-background">
      <div className="border-b bg-muted/50 px-6 py-5 pr-12">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge kind="dealStage" status={currentStage} />
          {transactionType ? <StatusBadge kind="transactionType" status={transactionType} /> : null}
          {deal.isJointBrokerage ? (
            <Badge className="rounded-md bg-violet-soft px-2 py-1 text-[11px] text-violet">공동중개</Badge>
          ) : null}
          {deal.isCancelled ? (
            <Badge className="rounded-md bg-destructive-soft px-2 py-1 text-[11px] text-destructive">취소됨</Badge>
          ) : null}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground/70">{getDealShortCode(deal.id)}</span>
        </div>

        <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground">{getDealTitle(deal)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{getDealLocationLine(deal)}</p>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            {formatDealAmount(deal)}
          </span>
          {billed ? <span className="text-xs text-muted-foreground">예상 수수료 {formatMoney(billed)}</span> : null}
        </div>

        <PipelineSteps kind="dealStage" current={currentStage} cancelled={deal.isCancelled} className="mt-4" />

        {!deal.isCancelled ? (
          <div
            className={cn(
              'mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-2 text-xs',
              pipelineHealth.state === 'overdue' &&
                'border-destructive/35 bg-destructive-soft/45 text-destructive',
              pipelineHealth.state === 'stale' &&
                'border-warning/40 bg-warning-soft/50 text-warning',
              pipelineHealth.state === 'unscheduled' &&
                'border-border bg-background text-muted-foreground',
              pipelineHealth.state === 'healthy' &&
                'border-success/30 bg-success-soft/40 text-success',
            )}
          >
            {pipelineHealth.isAtRisk ? (
              <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <TimerReset className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <strong>{pipelineHealth.label}</strong>
            <span className="text-current/75">{pipelineHealth.description}</span>
            <span className="ml-auto font-mono text-[11px] text-current/75">
              현 단계 {pipelineHealth.stageAgeDays}일
              {pipelineHealth.targetDays > 0 ? ` / 목표 ${pipelineHealth.targetDays}일` : ''}
            </span>
          </div>
        ) : null}
      </div>

      {deal.isCancelled ? (
        <div className="px-6 pt-4">
          <Alert variant="destructive">
            <Ban className="size-4" />
            <AlertTitle>취소된 거래입니다</AlertTitle>
            <AlertDescription>
              {deal.cancelledAt ? `${formatDate(deal.cancelledAt)} · ` : ''}
              취소 주체: {formatCancelledBy(deal.cancelledBy)}
              {deal.cancelReason ? ` · 사유: ${deal.cancelReason}` : ' · 사유 미기록'}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-x-6 gap-y-5 px-6 py-5 pb-7 md:grid-cols-2">
        {/* ── 1열: 다음 액션 · 매물 · 당사자 · 공동중개 · 메모 ───────────── */}
        <div className="min-w-0 space-y-4">
          <SectionTitle>
            다음 액션 · {deal.isCancelled ? '취소' : getStatusMeta('dealStage', deal.stage).label}
          </SectionTitle>
          <div className="rounded-md border border-info/30 bg-info-soft/60 p-3">
            <div className="space-y-2">
              {getNextActions(deal.isCancelled ? 'cancelled' : deal.stage).map((action) => (
                <div key={action} className="flex items-start gap-2 text-sm text-foreground">
                  <Circle className="mt-1 size-2.5 fill-info text-info" />
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </div>

          <SectionTitle>매물</SectionTitle>
          {deal.propertyId ? (
            <div className="space-y-2">
              <EntityChip
                kind="property"
                id={deal.propertyId}
                label={getDealTitle(deal)}
                sublabel={deal.property?.unit?.exclusiveAreaM2 ? formatArea(deal.property.unit.exclusiveAreaM2) : undefined}
              />
              {deal.listing ? (
                <p className="text-xs text-muted-foreground">
                  호가{' '}
                  {deal.listing.transactionType === 'monthly'
                    ? formatRent(deal.listing.deposit, deal.listing.monthlyRent)
                    : formatMoney(deal.listing.price ?? deal.listing.deposit)}
                  {' · '}
                  <StatusBadge kind="listingAvailability" status={getListingAvailability(deal.listing)} size="sm" />
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
              연결된 매물이 없습니다. (매물 없이 생성된 거래)
            </div>
          )}

          <SectionTitle>당사자</SectionTitle>
          <PartyDetailRow label="매도" contact={deal.sellerContact ?? null} />
          <PartyDetailRow label="매수" contact={deal.buyerContact ?? null} />

          <SectionTitle>담당 직원</SectionTitle>
          {participantNames.length ? (
            <div className="flex flex-wrap gap-1.5">
              {participantNames.map((participantName) => (
                <Badge
                  key={participantName}
                  variant="outline"
                  className="gap-1.5 rounded-md bg-background px-2 py-1 text-[11px] font-medium"
                >
                  <UserRound className="size-3" aria-hidden="true" />
                  {participantName}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
              배정된 담당 직원이 없습니다.
            </div>
          )}

          <SectionTitle>공동중개</SectionTitle>
          {deal.isJointBrokerage ? (
            <div className="rounded-md border border-violet/30 bg-violet-soft/50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="rounded bg-background px-1.5 text-[10px] text-violet">
                  파트너
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {deal.partnerBroker?.name ?? '파트너 미지정'}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {formatPhone(deal.partnerBroker?.phone)}
                  </p>
                </div>
                {deal.partnerBroker?.phone ? (
                  <Button variant="ghost" size="icon-xs" asChild>
                    <a href={`tel:${deal.partnerBroker.phone}`} aria-label="파트너 전화">
                      <Phone className="size-3.5" />
                    </a>
                  </Button>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                우리 담당: {ourSideLabels[deal.ourSide ?? 'both'] ?? '양측'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
              단독중개 거래입니다.
            </div>
          )}

          <SectionTitle>메모</SectionTitle>
          <div className="rounded-md border border-warning/30 bg-warning-soft/50 px-3 py-2.5">
            <p className="line-clamp-4 whitespace-pre-line text-sm leading-6 text-foreground">
              {deal.memo || '등록된 메모가 없습니다.'}
            </p>
          </div>
        </div>

        {/* ── 2열: 합의 조건 · 특약 · 지급 스케줄 · 계약 요약 · 수수료 ───────────── */}
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>합의 조건</SectionTitle>
            <Button type="button" variant="outline" size="xs" onClick={() => setTermsOpen(true)}>
              <Pencil className="size-3" />
              조건 수정
            </Button>
          </div>
          <div className="space-y-1 rounded-md border bg-muted/40 px-3 py-2.5">
            <DetailField label={priceLabel} value={formatMoney(deal.agreedPrice)} />
            {transactionType === 'monthly' ? (
              <DetailField label="보증금" value={formatMoney(deal.agreedDeposit)} />
            ) : null}
            {transactionType === 'monthly' ? (
              <DetailField label="월세" value={formatMoney(deal.agreedMonthlyRent)} />
            ) : null}
            <DetailField label="입주 예정" value={deal.agreedMoveInDate ? formatDate(deal.agreedMoveInDate) : undefined} />
            <DetailField label="단계 변경일" value={formatDate(deal.stageChangedAt)} />
          </div>

          <SectionTitle>특약사항</SectionTitle>
          <div className="rounded-md border bg-muted/40 px-3 py-2.5">
            <p className="line-clamp-6 whitespace-pre-line text-sm leading-6 text-foreground">
              {deal.specialTerms || '등록된 특약사항이 없습니다.'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <span />
            <Badge
              className={cn(
                'rounded-md px-2 py-0.5 text-[10px]',
                nextPayment?.isUrgent ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground',
              )}
            >
              다음: {formatNextPaymentLabel(nextPayment)}
            </Badge>
          </div>
          <DealPaymentsSection deal={deal} referenceDate={referenceDate} />

          <SectionTitle>계약 요약</SectionTitle>
          {contract ? (
            <div className="space-y-2 rounded-md border bg-muted/40 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-md bg-info-soft text-info">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">계약서 연결됨</p>
                  <p className="text-xs text-muted-foreground">
                    계약일 {contract.contractDate ? formatDate(contract.contractDate) : '미정'}
                  </p>
                </div>
                <StatusBadge kind="contractStatus" status={contract.status} size="sm" />
              </div>
              <div className="space-y-1">
                <DetailField label="총 거래금액" value={formatMoney(contract.totalPrice)} />
                <DetailField
                  label="잔금일"
                  value={contract.statedBalanceDate ? formatDate(contract.statedBalanceDate) : undefined}
                />
                {contract.leaseStartDate || contract.leaseEndDate ? (
                  <DetailField
                    label="임대기간"
                    value={`${contract.leaseStartDate ? formatDate(contract.leaseStartDate) : '—'} ~ ${contract.leaseEndDate ? formatDate(contract.leaseEndDate) : '—'}`}
                  />
                ) : null}
              </div>
              <Button type="button" variant="outline" size="xs" asChild className="w-full">
                <Link to="/contracts">
                  계약 관리에서 열기
                  <ExternalLink className="size-3" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2 rounded-md border border-dashed bg-muted/50 px-3 py-3">
              <p className="text-sm text-foreground">아직 계약서가 없습니다.</p>
              <p className="text-xs text-muted-foreground">
                {canCreateContract
                  ? '중도금/잔금 단계로 진행하기 전에 계약서를 작성해 주세요.'
                  : '본계약 단계로 이동한 뒤 계약서를 작성할 수 있습니다.'}
              </p>
              {canCreateContract && !deal.isCancelled ? (
                <Button type="button" size="xs" className="w-full" onClick={() => setContractOpen(true)}>
                  <FilePlus2 className="size-3" />
                  계약서 작성
                </Button>
              ) : null}
            </div>
          )}

          <DealCommissionSection key={deal.id} deal={deal} />

          <div className="flex flex-wrap gap-2 pt-1">
            {nextStage && !deal.isCancelled ? (
              <Button
                type="button"
                className="min-w-[160px] flex-1"
                onClick={() => actions.onRequestStage(deal, nextStage)}
                disabled={actions.isUpdating}
              >
                다음: {getStatusMeta('dealStage', nextStage).label}
                <ArrowRight className="size-4" />
              </Button>
            ) : null}
            {canSkipPreContract && !deal.isCancelled ? (
              <Button
                type="button"
                variant="outline"
                className="min-w-[160px] flex-1"
                onClick={() => actions.onRequestStage(deal, 'contracted')}
                disabled={actions.isUpdating}
              >
                가계약 없이 본계약
                <ArrowRight className="size-4" />
              </Button>
            ) : null}
            {!deal.isCancelled ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => actions.onRequestCancel(deal)}
              >
                <Ban className="size-4" />
                취소
              </Button>
            ) : null}
            <DealActionsMenu deal={deal} actions={actions} />
          </div>
        </div>
      </div>

      <EditTermsDialog deal={deal} open={termsOpen} onOpenChange={setTermsOpen} />
      <CreateContractDialog deal={deal} open={contractOpen} onOpenChange={setContractOpen} />
    </section>
  );
}

function PartyDetailRow({ label, contact }: { label: string; contact: Contact | null }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2.5">
      <Badge variant="outline" className="rounded bg-background px-1.5 text-[10px]">
        {label}
      </Badge>
      <div className="min-w-0 flex-1">
        {contact ? (
          <EntityChip
            kind="contact"
            id={contact.id}
            label={contact.name}
            sublabel={formatPhone(contact.phone)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">미지정</p>
        )}
      </div>
      {contact?.phone ? (
        <Button variant="ghost" size="icon-xs" asChild>
          <a href={`tel:${contact.phone}`} aria-label={`${contact.name} 전화`}>
            <Phone className="size-3.5" />
          </a>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 합의 조건 수정 — 서버에 일반 PATCH /deals/:id 가 없어
 * PATCH /deals/:id/stage(동일 stage 유지)로 가격/메모만 갱신한다.
 */
function EditTermsDialog({
  deal,
  open,
  onOpenChange,
}: {
  deal: Deal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const transactionType = getDealTransactionType(deal);
  const [price, setPrice] = useState(deal.agreedPrice != null ? String(deal.agreedPrice) : '');
  const [deposit, setDeposit] = useState(deal.agreedDeposit != null ? String(deal.agreedDeposit) : '');
  const [monthlyRent, setMonthlyRent] = useState(
    deal.agreedMonthlyRent != null ? String(deal.agreedMonthlyRent) : '',
  );
  const [memo, setMemo] = useState(deal.memo ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      api.deals.updateStage(deal.id, {
        stage: deal.stage,
        agreedPrice: price ? Number(price) : undefined,
        agreedDeposit: deposit ? Number(deposit) : undefined,
        agreedMonthlyRent: monthlyRent ? Number(monthlyRent) : undefined,
        memo: memo || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deals'] });
      void queryClient.invalidateQueries({ queryKey: ['commission-payments'] });
      toast.success('합의 조건이 저장되었습니다.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const showPrice = transactionType !== 'monthly';
  const showDeposit = transactionType === 'monthly';
  const showMonthlyRent = transactionType === 'monthly';
  const priceLabel =
    transactionType === 'sale'
      ? '매매가 (만원)'
      : transactionType === 'jeonse'
        ? '전세금 (만원)'
        : '합의 가격 (만원)';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>합의 조건 수정</DialogTitle>
          <DialogDescription>
            금액은 만원 단위입니다. 당사자·특약 변경은 거래 수정 API가 준비되면 지원됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {showPrice ? (
            <div className="grid gap-1.5">
              <Label>{priceLabel}</Label>
              <Input type="number" min={0} value={price} onChange={(event) => setPrice(event.target.value)} />
              {Number(price) > 0 ? (
                <p className="text-xs text-muted-foreground">= {formatMoney(Number(price))}</p>
              ) : null}
            </div>
          ) : null}
          {showDeposit ? (
            <div className="grid gap-1.5">
              <Label>보증금 (만원)</Label>
              <Input type="number" min={0} value={deposit} onChange={(event) => setDeposit(event.target.value)} />
            </div>
          ) : null}
          {showMonthlyRent ? (
            <div className="grid gap-1.5">
              <Label>월세 (만원)</Label>
              <Input
                type="number"
                min={0}
                value={monthlyRent}
                onChange={(event) => setMonthlyRent(event.target.value)}
              />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label>메모</Label>
            <Textarea rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 본계약 단계의 Deal 컨텍스트에서 계약서를 바로 생성한다. */
function CreateContractDialog({
  deal,
  open,
  onOpenChange,
}: {
  deal: Deal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const transactionType = getDealTransactionType(deal);
  const [contractDate, setContractDate] = useState(todayInput());
  const [totalPrice, setTotalPrice] = useState(() => {
    const initial = deal.agreedPrice ?? deal.agreedDeposit;
    return initial != null ? String(initial) : '';
  });
  const [buyer, setBuyer] = useState<Contact | null>(deal.buyerContact ?? null);
  const [seller, setSeller] = useState<Contact | null>(deal.sellerContact ?? null);

  const mutation = useMutation({
    mutationFn: () =>
      api.contracts.create({
        dealId: deal.id,
        transactionType: transactionType ?? undefined,
        buyerContactId: buyer?.id,
        sellerContactId: seller?.id,
        totalPrice: totalPrice ? Number(totalPrice) : undefined,
        monthlyRent: deal.agreedMonthlyRent ?? undefined,
        contractDate: contractDate || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
      void queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('계약서가 생성되었습니다. 이제 중도금/잔금 단계로 진행할 수 있습니다.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const valid = Boolean(buyer && seller && Number(totalPrice) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>계약서 작성</DialogTitle>
          <DialogDescription>
            기본 정보로 계약서를 생성합니다. 대금 일정·특약 등 상세는 계약 관리 화면에서 이어서 작성하세요.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>매도인 (임대인) *</Label>
            <ContactPicker value={seller} onChange={setSeller} />
          </div>
          <div className="grid gap-1.5">
            <Label>매수인 (임차인) *</Label>
            <ContactPicker value={buyer} onChange={setBuyer} />
          </div>
          <div className="grid gap-1.5">
            <Label>총 거래금액 (만원) *</Label>
            <Input
              type="number"
              min={1}
              value={totalPrice}
              onChange={(event) => setTotalPrice(event.target.value)}
            />
            {Number(totalPrice) > 0 ? (
              <p className="text-xs text-muted-foreground">= {formatMoney(Number(totalPrice))}</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label>계약일</Label>
            <Input type="date" value={contractDate} onChange={(event) => setContractDate(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button type="button" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            계약서 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getNextActions(stage: string) {
  if (stage === 'cancelled') {
    return ['취소 사유 기록 확인', '수수료 청구 취소/조정 확인', '관련 일정 정리'];
  }
  if (normalizeDealStage(stage) === 'preparing') {
    return ['최종 합의 조건 확인', '계약 당사자·필요 서류 확인', '가계약 여부와 본계약 일정 결정'];
  }
  if (stage === 'preContract') {
    return ['가계약금 입금 확인', '본계약 일정 확정', '계약 필요 서류 안내'];
  }
  if (stage === 'contracted') {
    return ['계약서 서명·날인', '계약금 입금 확인', '중도금 일정 캘린더 등록', '확인설명서 교부'];
  }
  if (stage === 'settling') {
    return ['잔금 일정 재확인', '등기·인도 준비 상태 점검', '수수료 청구 상태 확인'];
  }
  if (stage === 'completed') {
    return ['수수료 수금 확인', '직원 배분 정산', '거래 자료 보관'];
  }
  return ['거래 상태 확인', '후속 업무 정리'];
}
