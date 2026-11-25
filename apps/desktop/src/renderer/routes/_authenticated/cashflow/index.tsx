/**
 * 캐시플로우. 맨 위 줄은 수금 · 공동중개 줄 몫 · 받을 돈 · 그달 계약 수수료 (고정비·순이익은 2026-11-22에 내렸다),
 * 왼쪽은 오늘 처리할 일, 오른쪽은 월별 수금과 그달 계약 수수료를 둔다.
 *
 * 월 수금과 줄 몫은 입금 기록의 받은 날(한국 시각) 기준으로 집계한 monthlyTrend에서 읽는다
 * (summary.collected 도 이제 같은 값이다). 금액은 부가세를 뺀 수수료다.
 * 받을 돈은 부분수금 잔액까지 계산하도록 원장에서 직접 구한다.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  CirclePause,
  Clock,
  ReceiptText,
  SquareKanban,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import type { LedgerDealGroup, LedgerPayment } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { EmptyState, StatusBadge } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { toolbarGhostButtonClassName } from '@/routes/_authenticated/properties/-components/property-toolbar';
import { LedgerDetailSheet } from './-ledger-detail';
import {
  ADJUSTMENT_LABEL,
  AdjustmentDecisionDialog,
  PaymentDialogHost,
  useAdjustmentDecision,
  useCreateDunningTasks,
  useOpenDunning,
  type LedgerAdjustment,
  type PaymentDialogKind,
  type PaymentDialogState,
} from './-payment-dialogs';
import {
  CashflowBand,
  CashflowError,
  CashflowLoading,
  CashflowPage,
  CashflowToolbar,
  CollectMeter,
  ManagerOnly,
  MonthStepper,
  PaneHeader,
  SummaryStat,
  SummaryStrip,
} from './-cashflow-ui';
import {
  adjustmentProblem,
  buildTodayQueue,
  buildTrendBars,
  clientSideLabel,
  collectPercent,
  dealLocation,
  monthContracts,
  monthlyOwed,
  payerName,
  paymentOfAdjustment,
  relativeDueLabel,
  receivedAmount,
  rollupPayments,
  dayLabel,
  markCancelledDeals,
  stepMonth,
  type QueueItem,
  type TrendBar,
} from './-cashflow-utils';

export const Route = createFileRoute('/_authenticated/cashflow/')({
  component: CashflowRoute,
});

function CashflowRoute() {
  return (
    <ManagerOnly title="캐시플로우">
      <CashflowDashboard />
    </ManagerOnly>
  );
}

function CashflowDashboard() {
  const now = new Date();
  const currentMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const [selected, setSelected] = useState(currentMonth);
  const [detail, setDetail] = useState<{
    dealId: string;
    paymentId: string | null;
  } | null>(null);
  const [dialog, setDialog] = useState<PaymentDialogState | null>(null);
  const [decision, setDecision] = useState<LedgerAdjustment | null>(null);

  // 차트는 항상 이번 달까지 보여 주고, 맨 위 줄만 고른 달을 따른다.
  const currentSummary = useQuery({
    queryKey: ['cashflow', currentMonth.year, currentMonth.month],
    queryFn: () =>
      api.finance.cashflow.summary(currentMonth.year, currentMonth.month),
  });
  const selectedSummary = useQuery({
    queryKey: ['cashflow', selected.year, selected.month],
    queryFn: () => api.finance.cashflow.summary(selected.year, selected.month),
  });
  const ledger = useQuery({
    queryKey: ['finance', 'ledger', 'all'],
    queryFn: () => api.finance.ledger.get({ preset: 'all' }),
    // 취소한 거래의 청구는 받을 돈이 아니다 (받은 돈은 수금에 남는다)
    select: (view) => ({ ...view, groups: markCancelledDeals(view.groups) }),
  });

  const isThisMonth =
    selected.year === currentMonth.year && selected.month === currentMonth.month;

  const groups = useMemo(() => ledger.data?.groups ?? [], [ledger.data]);
  const openDialog = (
    kind: PaymentDialogKind,
    group: LedgerDealGroup,
    payment: LedgerPayment,
  ) =>
    setDialog({
      kind,
      payment,
      label: `${dealLocation(group.deal)} · ${clientSideLabel(payment.clientSide, group.deal.transactionType)} ${payment.code ?? ''}`.trim(),
    });

  const toolbar = (
    <CashflowToolbar label="캐시플로우 월 선택" withLine>
      <MonthStepper
        year={selected.year}
        month={selected.month}
        onStep={(delta) => setSelected((current) => stepMonth(current, delta))}
      />
      {!isThisMonth && (
        <button
          type="button"
          className={toolbarGhostButtonClassName}
          onClick={() => setSelected(currentMonth)}
        >
          이번 달로
        </button>
      )}
      <div className="ml-auto flex items-center gap-1">
        <Link
          to="/cashflow/ledger"
          search={{ view: 'kanban' }}
          className={toolbarGhostButtonClassName}
        >
          <SquareKanban className="size-3.5" />
          칸반
        </Link>
        <Link
          to="/cashflow/ledger"
          search={{ view: 'calendar' }}
          className={toolbarGhostButtonClassName}
        >
          <CalendarDays className="size-3.5" />
          캘린더
        </Link>
        <Button asChild size="sm" className="ml-1 h-[30px] rounded-full px-3.5">
          <Link to="/cashflow/ledger">
            수금 원장
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    </CashflowToolbar>
  );

  const isLoading =
    currentSummary.isLoading || selectedSummary.isLoading || ledger.isLoading;
  const isError =
    currentSummary.isError || selectedSummary.isError || ledger.isError;

  if (isLoading || isError || !selectedSummary.data || !currentSummary.data) {
    return (
      <CashflowPage title="캐시플로우">
        {toolbar}
        {isLoading ? (
          <CashflowLoading />
        ) : (
          <CashflowError
            icon={Wallet}
            title="캐시플로우 데이터를 불러오지 못했습니다"
            onRetry={() => {
              void currentSummary.refetch();
              void selectedSummary.refetch();
              void ledger.refetch();
            }}
          />
        )}
      </CashflowPage>
    );
  }

  const trend = selectedSummary.data.monthlyTrend;
  const thisMonth = trend[trend.length - 1];
  const previousMonth = trend[trend.length - 2];
  const owed = monthlyOwed(groups, selected.year, selected.month);
  const contracts = monthContracts(groups, selected.year, selected.month);
  const contractsBilled = contracts.reduce(
    (sum, g) => sum + rollupPayments(g.payments).billed,
    0,
  );
  const previousLabel = stepMonth(selected, -1).month;

  return (
    <CashflowPage title="캐시플로우">
      {toolbar}

      {/* 고정비·순이익은 2026-11-22에 내렸다(이 영역의 목적은 직원 정산 계산). 받은 수수료 기준의 숫자만 둔다. */}
      <SummaryStrip>
        <SummaryStat
          label="수금"
          value={formatMoney(thisMonth?.collected ?? 0)}
          hint={
            previousMonth?.collected
              ? `${previousLabel}월 ${formatMoney(previousMonth.collected)}`
              : `${previousLabel}월 수금 없음`
          }
        />
        <SummaryStat
          label="공동중개 줄 몫"
          value={formatMoney(thisMonth?.partnerShare ?? 0)}
          hint="수금 가운데 상대 사무소 몫"
        />
        <SummaryStat
          label="받을 돈"
          value={formatMoney(owed.pending + owed.overdue)}
          hint={
            <>
              {owed.overdue > 0 ? (
                <span className="text-destructive-strong">
                  연체 {formatMoney(owed.overdue)}
                </span>
              ) : (
                '연체 없음'
              )}
              {isThisMonth && owed.dueSoon > 0 &&
                ` · 7일 내 ${formatMoney(owed.dueSoon)}`}
            </>
          }
        />
        <SummaryStat
          label={`${selected.month}월 계약 수수료`}
          value={formatMoney(contractsBilled)}
          hint={`계약 ${contracts.length}건`}
        />
      </SummaryStrip>

      {ledger.data && !ledger.data.hasAnyPayment && (
        // 처음 온 사무소: "—"만 보이면 무엇부터 할지 모른다. 첫 단계를 한 줄로 알려 준다.
        <CashflowBand className="whitespace-normal text-foreground">
          <span>
            아직 받을 수수료가 없습니다. 거래가 본계약 단계로 넘어가면 그 거래의 수수료가 여기에
            받을 돈으로 잡히고, 받은 돈을 기록하면 수금이 계산됩니다.
          </span>
          <Link
            to="/deals"
            className="ml-auto shrink-0 underline decoration-[#d8d6d0] underline-offset-2 hover:decoration-current"
          >
            거래관리로 가기
          </Link>
        </CashflowBand>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.45fr)_minmax(372px,1fr)]">
        <TodayPane
          groups={groups}
          adjustments={ledger.data?.adjustmentsPending ?? []}
          onOpenDeal={(dealId, paymentId) =>
            setDetail({ dealId, paymentId: paymentId ?? null })
          }
          onAction={openDialog}
          onReview={setDecision}
        />
        <div className="min-w-0 overflow-y-auto border-l border-border">
          <TrendPanel
            bars={buildTrendBars(currentSummary.data.monthlyTrend, groups)}
            selected={selected}
            onSelect={setSelected}
          />
          <ContractsPanel
            month={selected.month}
            contracts={contracts}
            onOpenDeal={(dealId) => setDetail({ dealId, paymentId: null })}
          />
        </div>
      </div>

      <LedgerDetailSheet
        group={groups.find((g) => g.deal.id === detail?.dealId) ?? null}
        highlightPaymentId={detail?.paymentId ?? null}
        onClose={() => setDetail(null)}
      />
      <PaymentDialogHost state={dialog} onClose={() => setDialog(null)} />
      {decision && (
        <AdjustmentDecisionDialog
          key={decision.id}
          adjustment={decision}
          label={adjustmentLabel(decision, groups)}
          transactionType={groups.find((g) => g.deal.id === decision.dealId)?.deal.transactionType}
          onClose={() => setDecision(null)}
        />
      )}
    </CashflowPage>
  );
}

function adjustmentLabel(
  adjustment: LedgerAdjustment,
  groups: LedgerDealGroup[],
): string | undefined {
  const group = groups.find((g) => g.deal.id === adjustment.dealId);
  return group ? dealLocation(group.deal) : undefined;
}

/** 바로 승인 버튼을 보여 줄 조정. 확인할 수 없거나 막히는 건은 검토 창에서 이유를 보여 준다. */
function canApproveNow(
  adjustment: LedgerAdjustment,
  groups: LedgerDealGroup[],
): boolean {
  const payment = paymentOfAdjustment(groups, adjustment);
  return payment !== null && adjustmentProblem(adjustment, payment) === null;
}


// ── 오늘 처리할 것 ──────────────────────────────────────

const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_68px_72px_122px] items-center gap-2 min-h-10 border-b border-[#eeeeec] pl-[30px] pr-3 text-[13px] hover:bg-[#fafaf9]';

function TodayPane({
  groups,
  adjustments,
  onOpenDeal,
  onAction,
  onReview,
}: {
  groups: LedgerDealGroup[];
  adjustments: LedgerAdjustment[];
  onOpenDeal: (dealId: string, paymentId?: string) => void;
  onAction: (
    kind: PaymentDialogKind,
    group: LedgerDealGroup,
    payment: LedgerPayment,
  ) => void;
  onReview: (adjustment: LedgerAdjustment) => void;
}) {
  const { user } = useAuth();
  const canDecide = user?.role === 'owner';
  const { approve, reject } = useAdjustmentDecision();
  const dunning = useCreateDunningTasks();
  const openDunning = useOpenDunning();
  // 승인 단추를 한 번 누른 조정. 4초 안에 다시 눌러야 반영된다.
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(null), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const queue = useMemo(() => buildTodayQueue(groups), [groups]);
  const total =
    queue.overdue.length +
    adjustments.length +
    queue.dueSoon.length +
    queue.taxInvoice.length;
  const sum = (items: QueueItem[]) =>
    items.reduce((acc, item) => acc + item.remaining, 0);

  const toggle = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const sectionProps = (key: string) => ({
    open: !closed.has(key),
    onToggle: () => toggle(key),
  });

  const nameCell = (item: QueueItem) => (
    <div className="flex min-w-0 items-baseline gap-2">
      <button
        type="button"
        className="max-w-full shrink-0 truncate rounded-sm text-left font-medium decoration-[#d8d6d0] underline-offset-2 hover:underline"
        title={dealLocation(item.group.deal)}
        onClick={() => onOpenDeal(item.group.deal.id, item.payment.id)}
      >
        {dealLocation(item.group.deal)}
      </button>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {[
          clientSideLabel(item.payment.clientSide, item.group.deal.transactionType),
          payerName(item.group.deal, item.payment),
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </div>
  );

  const collectButton = (item: QueueItem) => (
    <RowButton onClick={() => onAction('collect', item.group, item.payment)}>
      수금 처리
    </RowButton>
  );

  return (
    <section aria-label="오늘 처리할 것" className="min-w-0 overflow-y-auto">
      <PaneHeader>
        오늘 처리할 것
        <span className="font-normal text-[#a5a39f] tabular-nums">{total}</span>
      </PaneHeader>

      {total === 0 && (
        <EmptyState
          icon={CircleCheck}
          title="지금 처리할 일이 없습니다"
          description="연체, 승인 대기, 7일 내 수금 예정이 모두 없습니다."
        />
      )}

      <QueueSection
        {...sectionProps('overdue')}
        icon={<TriangleAlert className="size-3.5 text-destructive-strong" />}
        label="연체"
        count={queue.overdue.length}
        amount={sum(queue.overdue)}
      >
        {queue.overdue.map((item) => (
          <div key={item.payment.id} className={ROW_GRID}>
            {nameCell(item)}
            <When className="text-destructive-strong">
              {relativeDueLabel(item.due)}
            </When>
            <Amount>{formatMoney(item.remaining)}</Amount>
            <div className="flex items-center justify-end gap-1">
              {(() => {
                const task = openDunning(item.payment, item.group.deal.id);
                return task ? (
                  <Link
                    to="/tasks"
                    title={`${dayLabel(task.createdAt, false)}에 만든 독촉 업무가 아직 끝나지 않았습니다 · ${task.title}`}
                    className="px-1 text-xs whitespace-nowrap text-muted-foreground underline decoration-[#d8d6d0] underline-offset-2 hover:text-foreground"
                  >
                    독촉함
                  </Link>
                ) : (
                  <RowButton
                    disabled={dunning.isPending}
                    onClick={() =>
                      dunning.mutate([
                        {
                          payment: item.payment,
                          location: dealLocation(item.group.deal),
                          dealId: item.group.deal.id,
                          transactionType: item.group.deal.transactionType,
                        },
                      ])
                    }
                  >
                    독촉
                  </RowButton>
                );
              })()}
              {collectButton(item)}
            </div>
          </div>
        ))}
      </QueueSection>

      <QueueSection
        {...sectionProps('adjustments')}
        icon={<CirclePause className="size-3.5 text-muted-foreground" />}
        label="조정 승인 대기"
        count={adjustments.length}
        amount={adjustments.reduce((acc, a) => acc + a.amount, 0)}
      >
        {adjustments.map((adjustment) => (
          <div key={adjustment.id} className={ROW_GRID}>
            <div className="flex min-w-0 items-baseline gap-2">
              <button
                type="button"
                className="max-w-full shrink-0 truncate rounded-sm text-left font-medium decoration-[#d8d6d0] underline-offset-2 hover:underline"
                onClick={() => onReview(adjustment)}
              >
                {adjustmentLabel(adjustment, groups) ??
                  adjustment.paymentCode ??
                  adjustment.code}
              </button>
              <span
                className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                title={adjustment.reason}
              >
                {[
                  (() => {
                    const target = paymentOfAdjustment(groups, adjustment);
                    return target
                      ? clientSideLabel(
                          target.clientSide,
                          groups.find((g) => g.deal.id === adjustment.dealId)?.deal.transactionType,
                        )
                      : null;
                  })(),
                  ADJUSTMENT_LABEL[adjustment.type] ?? adjustment.type,
                  adjustment.requestedByName && `${adjustment.requestedByName} 요청`,
                  adjustment.reason,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            <When />
            <Amount>{formatMoney(adjustment.amount)}</Amount>
            <div className="flex justify-end gap-1">
              {canDecide ? (
                <>
                  <RowButton
                    disabled={approve.isPending || reject.isPending}
                    onClick={() => reject.mutate({ id: adjustment.id })}
                  >
                    반려
                  </RowButton>
                  {canApproveNow(adjustment, groups) ? (
                    // 승인은 되돌릴 수 없어 한 번 더 누르게 한다 (창은 띄우지 않는다)
                    <RowButton
                      primary
                      disabled={approve.isPending || reject.isPending}
                      onClick={() => {
                        if (armed !== adjustment.id) {
                          setArmed(adjustment.id);
                          return;
                        }
                        setArmed(null);
                        approve.mutate({ adjustment });
                      }}
                    >
                      {armed === adjustment.id ? '승인 · 확인' : '승인'}
                    </RowButton>
                  ) : (
                    <RowButton primary onClick={() => onReview(adjustment)}>
                      검토
                    </RowButton>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  대표 승인 대기
                </span>
              )}
            </div>
          </div>
        ))}
      </QueueSection>

      <QueueSection
        {...sectionProps('dueSoon')}
        icon={<Clock className="size-3.5 text-muted-foreground" />}
        label="7일 내 수금 예정"
        count={queue.dueSoon.length}
        amount={sum(queue.dueSoon)}
      >
        {queue.dueSoon.map((item) => (
          <div key={item.payment.id} className={ROW_GRID}>
            {nameCell(item)}
            <When>{relativeDueLabel(item.due)}</When>
            <Amount>{formatMoney(item.remaining)}</Amount>
            <div className="flex justify-end">{collectButton(item)}</div>
          </div>
        ))}
      </QueueSection>

      <QueueSection
        {...sectionProps('tax')}
        icon={<ReceiptText className="size-3.5 text-muted-foreground" />}
        label="현금영수증·계산서 미기록"
        count={queue.taxInvoice.length}
        amount={queue.taxInvoice.reduce(
          (acc, item) => acc + receivedAmount(item.payment),
          0,
        )}
      >
        {queue.taxInvoice.map((item) => (
          <div key={item.payment.id} className={ROW_GRID}>
            {nameCell(item)}
            <When>{dayLabel(item.payment.paidAt, false)} 수금</When>
            <Amount>{formatMoney(receivedAmount(item.payment))}</Amount>
            <div className="flex justify-end">
              <RowButton
                onClick={() => onAction('tax', item.group, item.payment)}
              >
                영수증 기록
              </RowButton>
            </div>
          </div>
        ))}
      </QueueSection>
    </section>
  );
}

function QueueSection({
  open,
  onToggle,
  icon,
  label,
  count,
  amount,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  label: string;
  count: number;
  amount: number;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="sticky top-9 z-[2] flex h-9 w-full items-center gap-2 border-b border-[#eeeeec] bg-[#f7f7f5] pr-3 pl-2 text-left text-[13px] hover:bg-[#f3f3f1]"
      >
        <ChevronDown
          className={cn(
            'size-3.5 text-[#a5a39f] transition-transform duration-100',
            !open && '-rotate-90',
          )}
        />
        {icon}
        <b className="font-semibold">{label}</b>
        <span className="text-[#a5a39f] tabular-nums">{count}</span>
        <span className="ml-auto text-[12.5px] text-muted-foreground tabular-nums">
          {formatMoney(amount)}
        </span>
      </button>
      {open && children}
    </>
  );
}

function When({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'text-right text-[12.5px] whitespace-nowrap text-muted-foreground tabular-nums',
        className,
      )}
    >
      {children}
    </div>
  );
}

function Amount({ children }: { children: ReactNode }) {
  return (
    <div className="text-right font-semibold whitespace-nowrap tabular-nums">
      {children}
    </div>
  );
}

function RowButton({
  primary,
  disabled,
  onClick,
  children,
}: {
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={primary ? 'default' : 'outline'}
      className="h-[26px] px-2 font-normal"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

// ── 월별 수금 ───────────────────────────────────────────

/** 색은 dataviz 검증기 ordinal 모드를 통과한 값이다. 수금완료와 같은 계열의 진하기로 확정·예정을 나눈다. */
const COLOR_COLLECTED = '#0f7b6c';
const COLOR_FORECAST = '#79b8ac';
const CHART_HEIGHT = 172;

function TrendPanel({
  bars,
  selected,
  onSelect,
}: {
  bars: TrendBar[];
  selected: { year: number; month: number };
  onSelect: (month: { year: number; month: number }) => void;
}) {
  const [mode, setMode] = useState<'chart' | 'table'>('chart');
  const segmentClass = (on: boolean) =>
    cn(
      'h-[22px] rounded-[5px] px-2 text-xs font-normal text-muted-foreground transition-colors',
      on && 'bg-white font-medium text-foreground',
    );
  return (
    <section aria-label="월별 수금">
      <PaneHeader>
        월별 수금
        <div
          role="group"
          aria-label="보기 방식"
          className="ml-auto flex gap-px rounded-md bg-[#f1f0ec] p-px"
        >
          <button
            type="button"
            aria-pressed={mode === 'chart'}
            className={segmentClass(mode === 'chart')}
            onClick={() => setMode('chart')}
          >
            차트
          </button>
          <button
            type="button"
            aria-pressed={mode === 'table'}
            className={segmentClass(mode === 'table')}
            onClick={() => setMode('table')}
          >
            표
          </button>
        </div>
      </PaneHeader>
      {mode === 'chart' ? (
        <div className="px-3 pt-2.5 pb-3">
          <div className="mb-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <i
                className="inline-block size-2.5 rounded-[2px]"
                style={{ background: COLOR_COLLECTED }}
              />
              수금
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i
                className="inline-block size-2.5 rounded-[2px]"
                style={{ background: COLOR_FORECAST }}
              />
              예정
            </span>
            <span className="ml-auto text-[#a5a39f]">단위 만원 · 부가세 별도</span>
          </div>
          <TrendChart bars={bars} selected={selected} onSelect={onSelect} />
        </div>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="[&_th]:h-[30px] [&_th]:border-b [&_th]:border-[#d8d6d0] [&_th]:px-3 [&_th]:text-right [&_th]:font-medium [&_th]:text-muted-foreground [&_th:first-child]:text-left">
              <th>월</th>
              <th>수금</th>
              <th>예정</th>
              <th title="수금 가운데 공동중개 상대에게 넘겨줄 몫">줄 몫</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr
                key={bar.key}
                className={cn(
                  '[&_td]:h-8 [&_td]:border-b [&_td]:border-[#eeeeec] [&_td]:px-3 [&_td]:text-right [&_td]:tabular-nums [&_td:first-child]:text-left',
                  bar.year === selected.year &&
                    bar.month === selected.month &&
                    'font-semibold',
                )}
              >
                <td>{bar.label}</td>
                <td>{formatMoney(bar.collected)}</td>
                <td>{formatMoney(bar.forecast)}</td>
                <td>{formatMoney(bar.partnerShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function roundedTopPath(x: number, top: number, width: number, height: number) {
  const r = Math.min(4, height);
  return `M${x} ${top + height}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + width - r}Q${x + width} ${top} ${x + width} ${top + r}V${top + height}Z`;
}

function TrendChart({
  bars,
  selected,
  onSelect,
}: {
  bars: TrendBar[];
  selected: { year: number; month: number };
  onSelect: (month: { year: number; month: number }) => void;
}) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{
    bar: TrendBar;
    x: number;
    y: number;
  } | null>(null);
  const width = Math.max(280, measured);
  const H = CHART_HEIGHT;
  const left = 40;
  const right = 4;
  const top = 18;
  const bottom = 24;
  const peak = Math.max(...bars.map((b) => b.collected + b.forecast), 1);
  const step = niceStep(peak);
  const max = Math.ceil(peak / step) * step;
  const y = (value: number) => top + (H - top - bottom) * (1 - value / max);
  const band = (width - left - right) / Math.max(1, bars.length);
  const barWidth = Math.min(24, Math.round(band * 0.5));
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);

  return (
    <div ref={ref} className="relative">
      <svg
        role="group"
        aria-label="월별 수금 막대 차트"
        viewBox={`0 0 ${width} ${H}`}
        height={H}
        className="block w-full overflow-visible text-[11.5px]"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={y(tick)}
              y2={y(tick)}
              stroke={tick === 0 ? '#d8d6d0' : '#eeeeec'}
            />
            <text
              x={left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-muted-foreground tabular-nums"
            >
              {tick.toLocaleString()}
            </text>
          </g>
        ))}
        {bars.map((bar, i) => {
          const x = left + band * i + (band - barWidth) / 2;
          const base = y(0);
          const doneHeight = base - y(bar.collected);
          const planHeight = base - y(bar.forecast);
          const isSelected =
            bar.year === selected.year && bar.month === selected.month;
          const total = bar.collected + bar.forecast;
          const pick = () => onSelect({ year: bar.year, month: bar.month });
          return (
            <g
              key={bar.key}
              role="button"
              tabIndex={0}
              aria-label={`${bar.label} 수금 ${formatMoney(bar.collected)}, 예정 ${formatMoney(bar.forecast)}`}
              className="cursor-pointer outline-none [&:focus-visible_.cf-hit]:fill-[#f7f7f5] [&:hover_.cf-hit]:fill-[#f7f7f5]"
              onClick={pick}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  pick();
                }
              }}
              onPointerMove={(event) => {
                const rect = ref.current?.getBoundingClientRect();
                if (!rect) return;
                setHover({
                  bar,
                  x: event.clientX - rect.left,
                  y: event.clientY - rect.top,
                });
              }}
              onPointerLeave={() => setHover(null)}
              onFocus={() =>
                setHover({ bar, x: x + barWidth, y: top + 20 })
              }
              onBlur={() => setHover(null)}
            >
              <rect
                className="cf-hit"
                x={left + band * i + 1}
                y={top - 14}
                width={Math.max(0, band - 2)}
                height={H - top - bottom + 14}
                fill="transparent"
                rx={4}
              />
              {doneHeight > 0 &&
                (bar.forecast > 0 ? (
                  <rect
                    x={x}
                    y={base - doneHeight}
                    width={barWidth}
                    height={doneHeight}
                    fill={COLOR_COLLECTED}
                  />
                ) : (
                  <path
                    d={roundedTopPath(x, base - doneHeight, barWidth, doneHeight)}
                    fill={COLOR_COLLECTED}
                  />
                ))}
              {planHeight > 0 && (
                <path
                  d={roundedTopPath(
                    x,
                    base - doneHeight - planHeight,
                    barWidth,
                    Math.max(1, planHeight - (doneHeight > 0 ? 2 : 0)),
                  )}
                  fill={COLOR_FORECAST}
                />
              )}
              {isSelected && total > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y(total) - 5}
                  textAnchor="middle"
                  className="fill-foreground font-semibold tabular-nums [paint-order:stroke] [stroke-linejoin:round] [stroke-width:3px] [stroke:white]"
                >
                  {total.toLocaleString()}
                </text>
              )}
              <text
                x={x + barWidth / 2}
                y={H - 6}
                textAnchor="middle"
                className={cn(
                  'tabular-nums',
                  isSelected
                    ? 'fill-foreground font-semibold'
                    : 'fill-muted-foreground',
                )}
              >
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 min-w-[148px] rounded-md border border-border bg-popover px-2.5 py-2 text-[12.5px] shadow-md"
          style={{
            left: Math.min(hover.x + 12, Math.max(0, width - 160)),
            top: Math.max(0, hover.y - 20),
          }}
        >
          <div className="mb-1 text-muted-foreground">
            {hover.bar.year}년 {hover.bar.month}월
          </div>
          <TooltipRow color={COLOR_COLLECTED} label="수금" value={hover.bar.collected} />
          {hover.bar.forecast > 0 && (
            <TooltipRow color={COLOR_FORECAST} label="예정" value={hover.bar.forecast} />
          )}
          {hover.bar.partnerShare > 0 && (
            <TooltipRow label="공동중개 줄 몫" value={hover.bar.partnerShare} />
          )}
        </div>
      )}
    </div>
  );
}

function niceStep(peak: number) {
  if (peak <= 500) return 100;
  if (peak <= 1000) return 250;
  if (peak <= 6000) return 1000;
  if (peak <= 12000) return 2000;
  return 5000;
}

function TooltipRow({
  color,
  label,
  value,
}: {
  color?: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1.5 leading-5">
      {color && (
        <i className="h-0.5 w-2.5 rounded-[1px]" style={{ background: color }} />
      )}
      <span className="text-muted-foreground">{label}</span>
      <b className="ml-auto font-semibold tabular-nums">{formatMoney(value)}</b>
    </div>
  );
}

// ── 그달 계약 수수료 ─────────────────────────────────────

function ContractsPanel({
  month,
  contracts,
  onOpenDeal,
}: {
  month: number;
  contracts: LedgerDealGroup[];
  onOpenDeal: (dealId: string) => void;
}) {
  const totals = contracts.reduce(
    (acc, g) => {
      // 진행 %는 청구가 얼마나 받아졌는지(상대가 받은 돈 포함)로 센다
      const { billed, claimCollected } = rollupPayments(g.payments);
      acc.billed += billed;
      acc.collected += claimCollected;
      return acc;
    },
    { billed: 0, collected: 0 },
  );
  const percent = collectPercent(totals.collected, totals.billed);

  return (
    <section aria-label={`${month}월 계약 수수료`}>
      <PaneHeader>
        {month}월 계약 수수료
        <span className="font-normal text-[#a5a39f] tabular-nums">
          {contracts.length}
        </span>
        {contracts.length > 0 && (
          <span className="ml-auto text-[12.5px] font-normal tabular-nums">
            {formatMoney(totals.billed)} · 수금 {percent}%
          </span>
        )}
      </PaneHeader>
      {contracts.length === 0 ? (
        <p className="px-6 py-7 text-center text-[13px] text-muted-foreground">
          이 달에 새로 계약된 거래가 없습니다.
        </p>
      ) : (
        contracts.map((group) => {
          const { billed, claimCollected } = rollupPayments(group.payments);
          const rowPercent = collectPercent(claimCollected, billed);
          return (
            <button
              key={group.deal.id}
              type="button"
              onClick={() => onOpenDeal(group.deal.id)}
              className="grid min-h-10 w-full grid-cols-[minmax(0,1fr)_76px_58px] items-center gap-2.5 border-b border-[#eeeeec] px-3 text-left text-[13px] hover:bg-[#fafaf9]"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate">{dealLocation(group.deal)}</span>
                <StatusBadge
                  kind="transactionType"
                  status={group.deal.transactionType}
                  size="sm"
                />
              </span>
              <span className="text-right tabular-nums">{formatMoney(billed)}</span>
              <span className="grid gap-[3px] text-right text-[11.5px] text-muted-foreground tabular-nums">
                {rowPercent}%
                <CollectMeter percent={rowPercent} />
              </span>
            </button>
          );
        })
      )}
    </section>
  );
}
