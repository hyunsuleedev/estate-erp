/**
 * 수금 원장. 거래를 머리 행으로, 청구를 그 아래 행으로 놓는 평면 표다.
 * 청구·수금·잔여를 각각의 열로 두어 자릿수를 맞춰 읽고, 띠는 합계와 일괄 작업이 같은 자리를 쓴다.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CalendarDays,
  Check,
  CircleSlash,
  Columns3,
  Download,
  EllipsisVertical,
  ExternalLink,
  LayoutList,
  CirclePause,
  ReceiptText,
  RotateCcw,
  SquareKanban,
  StickyNote,
  Wallet,
} from 'lucide-react';
import type {
  CommissionPaymentStatus,
  LedgerDealGroup,
  LedgerPayment,
  LedgerPreset,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { EmptyState, StatusBadge } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ToolbarPillSearch,
  ToolbarPillTabs,
  ToolbarPillToggle,
  ToolbarSelectChip,
  toolbarGhostButtonClassName,
} from '@/routes/_authenticated/properties/-components/property-toolbar';
import { LedgerCalendar, LedgerCalendarLegend, calendarTotals } from './-ledger-calendar';
import { LedgerKanban } from './-ledger-kanban';
import { LedgerDetailSheet } from './-ledger-detail';
import {
  ADJUSTMENT_LABEL,
  AdjustmentDecisionDialog,
  PaymentDialogHost,
  useCreateDunningTasks,
  type LedgerAdjustment,
  type PaymentDialogKind,
  type PaymentDialogState,
} from './-payment-dialogs';
import {
  BandItem,
  CashflowBand,
  CashflowError,
  CashflowFilterRow,
  CashflowFooter,
  CashflowLoading,
  CashflowPage,
  CashflowToolbar,
  FoldButton,
  MonthStepper,
  SortHead,
} from './-cashflow-ui';
import {
  clientSideLabel,
  dealLocation,
  countsAsBilled,
  displayStatus,
  downloadCsv,
  effectiveDueDate,
  isFullyCollected,
  isOpenPayment,
  isPaymentDone,
  ourRatioFrom,
  partnerRatioOf,
  payerName,
  paymentRemaining,
  receivedAmount,
  relativeDueLabel,
  rollupPayments,
  shortDate,
  stepMonth,
  toDayKey,
  worstStatus,
} from './-cashflow-utils';

export type LedgerViewMode = 'table' | 'calendar' | 'kanban';

type SortKey = 'due' | 'amount';
type ColumnKey = 'stage' | 'assignee' | 'partner' | 'tax';

const COLUMN_OPTIONS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'stage', label: '거래 단계' },
  { key: 'assignee', label: '담당' },
  { key: 'partner', label: '공동중개' },
  { key: 'tax', label: '세금계산서' },
];

const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  stage: true,
  assignee: true,
  partner: true,
  tax: true,
};

const COLUMN_STORAGE_KEY = 'estate-erp:ledger:columns';

const PERIOD_OPTIONS: ReadonlyArray<{ value: LedgerPreset; label: string }> = [
  { value: 'upcoming', label: '다가오는' },
  { value: 'this-month', label: '이번 달' },
  { value: 'month', label: '월별' },
  { value: 'all', label: '전체' },
];

const STATUS_OPTIONS = (
  ['pending', 'partial', 'overdue', 'collected', 'waived', 'cancelled'] as const
).map((value) => ({
  value,
  label: getStatusMeta('commissionStatus', value).label,
}));

const TYPE_OPTIONS = (['sale', 'jeonse', 'monthly'] as const).map((value) => ({
  value,
  label: getStatusMeta('transactionType', value).label,
}));

function useVisibleColumns() {
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>(() => {
    try {
      const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (!raw) return DEFAULT_COLUMNS;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const next = { ...DEFAULT_COLUMNS };
      for (const key of Object.keys(DEFAULT_COLUMNS) as ColumnKey[]) {
        if (typeof parsed[key] === 'boolean') next[key] = parsed[key];
      }
      return next;
    } catch {
      return DEFAULT_COLUMNS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visible));
    } catch {
      /* 저장하지 못해도 이번 화면에서는 동작한다 */
    }
  }, [visible]);

  const toggle = (key: ColumnKey) =>
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  return { visible, toggle };
}

export function LedgerView({
  defaultViewMode = 'table',
  initialDealId,
  initialPaymentId,
}: {
  defaultViewMode?: LedgerViewMode;
  /** 다른 화면에서 ?deal= 로 들어오면 거래 상세를 바로 연다 */
  initialDealId?: string;
  /** ?payment= 로 들어오면 그 청구를 강조한다 */
  initialPaymentId?: string;
} = {}) {
  const now = new Date();
  const [{ year, month }, setSelectedMonth] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'due',
    dir: 'asc',
  });
  const [viewMode, setViewMode] = useState<LedgerViewMode>(defaultViewMode);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [foldToggled, setFoldToggled] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<{
    dealId: string;
    paymentId: string | null;
  } | null>(
    initialDealId
      ? { dealId: initialDealId, paymentId: initialPaymentId ?? null }
      : null,
  );
  const [paymentDialog, setPaymentDialog] = useState<PaymentDialogState | null>(
    null,
  );
  const [decision, setDecision] = useState<LedgerAdjustment | null>(null);
  const { visible: columns, toggle: toggleColumn } = useVisibleColumns();

  // 다른 화면에서 특정 거래로 들어오면 기간 밖일 수 있어 전체로 시작한다.
  const [preset, setPreset] = useState<LedgerPreset>(
    initialDealId ? 'all' : 'upcoming',
  );
  // 캘린더는 잔여 약정일까지 보여야 해서 기간을 좁히지 않고 받아 온다.
  const effectivePreset: LedgerPreset = viewMode === 'calendar' ? 'all' : preset;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      'finance',
      'ledger',
      effectivePreset,
      ...(effectivePreset === 'month' ? [year, month] : []),
    ],
    queryFn: () =>
      api.finance.ledger.get({ preset: effectivePreset, year, month }),
  });

  const { assigneeOptions, partnerOptions } = useMemo(() => {
    const assignees = new Set<string>();
    const partners = new Map<string, string>();
    for (const g of data?.groups ?? []) {
      for (const p of g.deal.participants) assignees.add(p.userName);
      if (g.deal.partnerBroker) {
        partners.set(g.deal.partnerBroker.id, g.deal.partnerBroker.name);
      }
    }
    return {
      assigneeOptions: Array.from(assignees, (name) => ({
        value: name,
        label: name,
      })),
      partnerOptions: [
        { value: 'none', label: '단독중개만' },
        ...Array.from(partners, ([value, label]) => ({ value, label })),
      ],
    };
  }, [data]);

  const paymentsOf = (group: LedgerDealGroup) =>
    statusFilter
      ? group.payments.filter(
          (p) => displayStatus(p, group.deal.balanceDueDate) === statusFilter,
        )
      : group.payments;

  const filtered = useMemo<LedgerDealGroup[]>(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    const list = data.groups.filter((g) => {
      if (typeFilter && g.deal.transactionType !== typeFilter) return false;
      if (statusFilter && paymentsOf(g).length === 0) return false;
      if (
        assigneeFilter &&
        !g.deal.participants.some((p) => p.userName === assigneeFilter)
      ) {
        return false;
      }
      if (partnerFilter === 'none' && g.deal.partnerBroker) return false;
      if (
        partnerFilter &&
        partnerFilter !== 'none' &&
        g.deal.partnerBroker?.id !== partnerFilter
      ) {
        return false;
      }
      if (!query) return true;
      return [
        dealLocation(g.deal),
        g.deal.partnerBroker?.name,
        g.deal.buyerContactName,
        g.deal.sellerContactName,
        ...g.payments.map((p) => `${p.code ?? ''} ${p.note ?? ''}`),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });

    const firstDue = (g: LedgerDealGroup) =>
      g.payments
        .map((p) => toDayKey(effectiveDueDate(p, g.deal.balanceDueDate)))
        .filter((d): d is string => d !== null)
        .sort()[0] ?? '9999';
    const direction = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === 'amount') {
        return (
          (rollupPayments(a.payments).billed -
            rollupPayments(b.payments).billed) *
          direction
        );
      }
      // 다 받은 거래는 처리할 게 없으니 예정일과 상관없이 아래로 보낸다.
      const finished = Number(isFullyCollected(a)) - Number(isFullyCollected(b));
      return finished || firstDue(a).localeCompare(firstDue(b)) * direction;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search, statusFilter, typeFilter, assigneeFilter, partnerFilter, sort]);

  const visiblePayments = useMemo(
    () =>
      filtered.flatMap((group) =>
        paymentsOf(group).map((payment) => ({ group, payment })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, statusFilter],
  );

  // 필터로 숨겨진 청구는 선택에서 뺀다.
  useEffect(() => {
    setSelectedIds((prev) => {
      const ids = new Set(visiblePayments.map(({ payment }) => payment.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visiblePayments]);

  const toggleSelected = (id: string, checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const openDeal = (dealId: string, paymentId?: string) =>
    setDetail({ dealId, paymentId: paymentId ?? null });

  const openPaymentDialog = (
    kind: PaymentDialogKind,
    group: LedgerDealGroup,
    payment: LedgerPayment,
  ) =>
    setPaymentDialog({
      kind,
      payment,
      label: `${dealLocation(group.deal)} · ${clientSideLabel(payment.clientSide)} ${payment.code ?? ''}`.trim(),
    });

  const hasFilter = Boolean(
    search || statusFilter || typeFilter || assigneeFilter || partnerFilter,
  );
  const resetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setTypeFilter('');
    setAssigneeFilter('');
    setPartnerFilter('');
  };

  const exportPayments = (
    items: Array<{ group: LedgerDealGroup; payment: LedgerPayment }>,
  ) =>
    downloadCsv(`수금원장_${toDayKey(new Date())}.csv`, [
      [
        '청구번호',
        '거래',
        '유형',
        '측',
        '상태',
        '청구액(만원)',
        '수금액(만원)',
        '잔여(만원)',
        '예정일',
        '입금일',
        '공동중개',
        '세금계산서',
      ],
      ...items.map(({ group, payment }) => [
        payment.code,
        dealLocation(group.deal),
        getStatusMeta('transactionType', group.deal.transactionType).label,
        clientSideLabel(payment.clientSide),
        getStatusMeta(
          'commissionStatus',
          displayStatus(payment, group.deal.balanceDueDate),
        ).label,
        payment.expectedAmount,
        receivedAmount(payment),
        paymentRemaining(payment),
        toDayKey(payment.dueDate),
        toDayKey(payment.paidAt),
        group.deal.partnerBroker?.name,
        payment.taxInvoiceNo,
      ]),
    ]);

  // 거래 상세는 기간과 상관없이 그 거래의 청구를 전부 보여 준다.
  // 일부만 보면 합계와 분배를 바꿀 대상이 틀어진다.
  const fullLedger = useQuery({
    queryKey: ['finance', 'ledger', 'all'],
    queryFn: () => api.finance.ledger.get({ preset: 'all' }),
    enabled: detail !== null,
  });
  const detailGroup =
    fullLedger.data?.groups.find((g) => g.deal.id === detail?.dealId) ??
    data?.groups.find((g) => g.deal.id === detail?.dealId) ??
    null;
  const adjustments = data?.adjustmentsPending ?? [];

  return (
    <CashflowPage title="수금 원장">
      <CashflowToolbar label="수금 원장 기간과 검색">
        {viewMode !== 'calendar' && (
          <ToolbarPillTabs
            ariaLabel="기간"
            value={preset}
            options={PERIOD_OPTIONS}
            onChange={(value) => {
              setPreset(value);
              setSelectedIds(new Set());
            }}
          />
        )}
        {(viewMode === 'calendar' || preset === 'month') && (
          <MonthStepper
            year={year}
            month={month}
            onStep={(delta) =>
              setSelectedMonth((current) => stepMonth(current, delta))
            }
          />
        )}
        <div className="min-w-[150px] max-w-[460px] flex-1">
          <ToolbarPillSearch
            value={search}
            onChange={setSearch}
            placeholder="호수, 고객, 청구번호, 공동중개 사무소"
            ariaLabel="수금 원장 검색"
          />
        </div>
        <div className="ml-auto">
          <ToolbarPillToggle
            ariaLabel="보기 방식"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: 'table', label: '표', icon: <LayoutList /> },
              { value: 'kanban', label: '칸반', icon: <SquareKanban /> },
              { value: 'calendar', label: '캘린더', icon: <CalendarDays /> },
            ]}
          />
        </div>
      </CashflowToolbar>

      <CashflowFilterRow label="수금 원장 필터">
        <ToolbarSelectChip
          label="상태"
          value={statusFilter}
          allValue=""
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
        />
        <ToolbarSelectChip
          label="유형"
          value={typeFilter}
          allValue=""
          onChange={setTypeFilter}
          options={TYPE_OPTIONS}
        />
        <ToolbarSelectChip
          label="담당자"
          value={assigneeFilter}
          allValue=""
          onChange={setAssigneeFilter}
          options={assigneeOptions}
        />
        <ToolbarSelectChip
          label="공동중개"
          value={partnerFilter}
          allValue=""
          onChange={setPartnerFilter}
          options={partnerOptions}
        />
        {hasFilter && (
          <button
            type="button"
            className={toolbarGhostButtonClassName}
            onClick={resetFilters}
          >
            <RotateCcw className="size-3.5" />
            초기화
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {viewMode === 'table' && (
            <ColumnMenu visible={columns} onToggle={toggleColumn} />
          )}
          <button
            type="button"
            className={toolbarGhostButtonClassName}
            disabled={visiblePayments.length === 0}
            onClick={() => exportPayments(visiblePayments)}
          >
            <Download className="size-3.5" />
            내보내기
          </button>
        </div>
      </CashflowFilterRow>

      {adjustments.length > 0 && (
        <AdjustmentBand
          items={adjustments}
          groups={data?.groups ?? []}
          onOpen={setDecision}
        />
      )}

      {isLoading ? (
        <CashflowLoading />
      ) : isError || !data ? (
        <CashflowError
          icon={Wallet}
          title="원장 데이터를 불러오지 못했습니다"
          onRetry={() => refetch()}
        />
      ) : (
        <>
          <LedgerBand
            viewMode={viewMode}
            year={year}
            month={month}
            groups={filtered}
            payments={visiblePayments}
            selectedIds={selectedIds}
            statusFilter={statusFilter}
            onQuickStatus={(status) =>
              setStatusFilter((current) => (current === status ? '' : status))
            }
            onExport={exportPayments}
            onClearSelection={() => setSelectedIds(new Set())}
          />
          <div className="min-h-0 flex-1 overflow-auto">
            {viewMode === 'table' ? (
              <LedgerTable
                groups={filtered}
                paymentsOf={paymentsOf}
                columns={columns}
                sort={sort}
                onSort={(key) =>
                  setSort((current) =>
                    current.key === key
                      ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
                      : { key, dir: key === 'amount' ? 'desc' : 'asc' },
                  )
                }
                selectedIds={selectedIds}
                onToggleSelected={toggleSelected}
                onToggleMany={(ids, checked) =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    for (const id of ids) {
                      if (checked) next.add(id);
                      else next.delete(id);
                    }
                    return next;
                  })
                }
                foldToggled={foldToggled}
                onToggleFold={(dealId) =>
                  setFoldToggled((prev) => {
                    const next = new Set(prev);
                    if (next.has(dealId)) next.delete(dealId);
                    else next.add(dealId);
                    return next;
                  })
                }
                highlightPaymentId={initialPaymentId ?? null}
                onOpenDeal={openDeal}
                onPaymentAction={openPaymentDialog}
              />
            ) : viewMode === 'kanban' ? (
              <LedgerKanban groups={filtered} onOpenDeal={openDeal} />
            ) : (
              <LedgerCalendar
                year={year}
                month={month}
                groups={filtered}
                onOpenDeal={openDeal}
              />
            )}
          </div>
          <CashflowFooter>
            거래 {filtered.length}건 · 청구 {visiblePayments.length}건 표시
          </CashflowFooter>
        </>
      )}

      <LedgerDetailSheet
        group={detailGroup}
        highlightPaymentId={detail?.paymentId ?? null}
        onClose={() => setDetail(null)}
      />
      <PaymentDialogHost
        state={paymentDialog}
        onClose={() => setPaymentDialog(null)}
      />
      {decision && (
        <AdjustmentDecisionDialog
          key={decision.id}
          adjustment={decision}
          label={adjustmentLocation(decision, data?.groups ?? [])}
          onClose={() => setDecision(null)}
        />
      )}
    </CashflowPage>
  );
}

function adjustmentLocation(
  adjustment: LedgerAdjustment,
  groups: LedgerDealGroup[],
): string | undefined {
  const group = groups.find((g) => g.deal.id === adjustment.dealId);
  return group ? dealLocation(group.deal) : undefined;
}

function ColumnMenu({
  visible,
  onToggle,
}: {
  visible: Record<ColumnKey, boolean>;
  onToggle: (key: ColumnKey) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={toolbarGhostButtonClassName}>
          <Columns3 className="size-3.5" />
          컬럼
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        {COLUMN_OPTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="menuitemcheckbox"
            aria-checked={visible[key]}
            className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[13px] hover:bg-[rgba(55,53,47,0.06)]"
            onClick={() => onToggle(key)}
          >
            <span className="grid size-3.5 place-items-center">
              {visible[key] && <Check className="size-3.5" />}
            </span>
            {label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function AdjustmentBand({
  items,
  groups,
  onOpen,
}: {
  items: LedgerAdjustment[];
  groups: LedgerDealGroup[];
  onOpen: (item: LedgerAdjustment) => void;
}) {
  const total = items.reduce((sum, a) => sum + a.amount, 0);
  return (
    <CashflowBand className="bg-white">
      <span className="shrink-0 rounded-md bg-warning-soft px-1.5 py-px text-[11.5px] font-medium text-warning-strong">
        승인 대기 {items.length}건
      </span>
      <BandItem label="수수료 조정 합계" value={formatMoney(total)} />
      <span className="flex min-w-0 gap-1 overflow-hidden">
        {items.slice(0, 6).map((a) => (
          <Button
            key={a.id}
            type="button"
            size="xs"
            variant="outline"
            className="h-6 shrink-0 px-2 font-normal"
            title={a.reason}
            onClick={() => onOpen(a)}
          >
            {adjustmentLocation(a, groups) ?? a.paymentCode ?? a.code} ·{' '}
            {ADJUSTMENT_LABEL[a.type] ?? a.type} {formatMoney(a.amount)}
          </Button>
        ))}
      </span>
    </CashflowBand>
  );
}

function LedgerBand({
  viewMode,
  year,
  month,
  groups,
  payments,
  selectedIds,
  statusFilter,
  onQuickStatus,
  onExport,
  onClearSelection,
}: {
  viewMode: LedgerViewMode;
  year: number;
  month: number;
  groups: LedgerDealGroup[];
  payments: Array<{ group: LedgerDealGroup; payment: LedgerPayment }>;
  selectedIds: Set<string>;
  statusFilter: string;
  onQuickStatus: (status: string) => void;
  onExport: (
    items: Array<{ group: LedgerDealGroup; payment: LedgerPayment }>,
  ) => void;
  onClearSelection: () => void;
}) {
  const dunning = useCreateDunningTasks();

  if (viewMode === 'calendar') {
    const totals = calendarTotals(groups, year, month);
    return (
      <CashflowBand>
        <LedgerCalendarLegend />
        <span className="ml-auto" />
        <BandItem label="이 달 예정" value={formatMoney(totals.due)} />
        <BandItem label="입금" value={formatMoney(totals.paid)} />
      </CashflowBand>
    );
  }

  if (viewMode === 'table' && selectedIds.size > 0) {
    const picked = payments.filter(({ payment }) => selectedIds.has(payment.id));
    const remaining = picked.reduce(
      (sum, { payment }) => sum + paymentRemaining(payment),
      0,
    );
    const dunnable = picked.filter(({ payment }) => isOpenPayment(payment));
    return (
      <CashflowBand>
        <b className="font-semibold text-foreground tabular-nums">
          {picked.length}건 선택
        </b>
        <BandItem label="잔여 합계" value={formatMoney(remaining)} />
        <span className="ml-auto" />
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-[26px] bg-white px-2"
          disabled={dunning.isPending || dunnable.length === 0}
          onClick={() =>
            dunning.mutate(
              dunnable.map(({ group, payment }) => ({
                payment,
                location: dealLocation(group.deal),
                dealId: group.deal.id,
              })),
              { onSuccess: onClearSelection },
            )
          }
        >
          <Bell className="size-3" />
          독촉 업무 만들기
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="h-[26px] bg-white px-2"
          onClick={() => onExport(picked)}
        >
          <Download className="size-3" />
          내보내기
        </Button>
        <button
          type="button"
          className={toolbarGhostButtonClassName}
          onClick={onClearSelection}
        >
          선택 해제
        </button>
      </CashflowBand>
    );
  }

  const billedCount = payments.filter(({ payment }) =>
    countsAsBilled(payment),
  ).length;
  const totals = rollupPayments(payments.map(({ payment }) => payment));
  // 버튼을 눌렀을 때 걸러지는 건수와 같도록 화면 표시 상태로 센다.
  const countByStatus = (status: CommissionPaymentStatus) =>
    payments.filter(
      ({ group, payment }) =>
        displayStatus(payment, group.deal.balanceDueDate) === status,
    ).length;
  const overdueCount = countByStatus('overdue');
  const partialCount = countByStatus('partial');
  const quickClass = (on: boolean) =>
    cn(
      '-mx-1.5 inline-flex h-6 items-center rounded-md px-1.5 transition-colors hover:bg-[rgba(55,53,47,0.08)]',
      on && 'bg-[#ebeae6] text-foreground',
    );

  return (
    <CashflowBand>
      <BandItem label="청구" value={`${billedCount}건`} />
      <BandItem label="합계" value={formatMoney(totals.billed)} />
      <BandItem label="수금" value={formatMoney(totals.collected)} />
      <BandItem label="미수" value={formatMoney(totals.remaining)} />
      <span className="ml-auto" />
      <button
        type="button"
        aria-pressed={statusFilter === 'overdue'}
        className={quickClass(statusFilter === 'overdue')}
        onClick={() => onQuickStatus('overdue')}
      >
        <BandItem
          label="연체"
          value={`${overdueCount}건`}
          valueClassName={overdueCount > 0 ? 'text-destructive-strong' : undefined}
        />
      </button>
      <button
        type="button"
        aria-pressed={statusFilter === 'partial'}
        className={quickClass(statusFilter === 'partial')}
        onClick={() => onQuickStatus('partial')}
      >
        <BandItem label="부분수금" value={`${partialCount}건`} />
      </button>
    </CashflowBand>
  );
}

function DueCell({
  date,
  relative,
  overdue,
  muted,
}: {
  date: string;
  relative: string;
  overdue?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        'flex items-baseline gap-1.5 tabular-nums',
        overdue && 'font-medium text-destructive-strong',
      )}
    >
      <span className={cn(muted && 'text-muted-foreground')}>{date}</span>
      <small
        className={cn(
          'text-xs font-normal',
          overdue ? 'text-destructive-strong' : 'text-muted-foreground',
        )}
      >
        {relative}
      </small>
    </span>
  );
}

function LedgerTable({
  groups,
  paymentsOf,
  columns,
  sort,
  onSort,
  selectedIds,
  onToggleSelected,
  onToggleMany,
  foldToggled,
  onToggleFold,
  highlightPaymentId,
  onOpenDeal,
  onPaymentAction,
}: {
  groups: LedgerDealGroup[];
  paymentsOf: (group: LedgerDealGroup) => LedgerPayment[];
  columns: Record<ColumnKey, boolean>;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
  selectedIds: Set<string>;
  onToggleSelected: (id: string, checked: boolean) => void;
  onToggleMany: (ids: string[], checked: boolean) => void;
  foldToggled: Set<string>;
  onToggleFold: (dealId: string) => void;
  highlightPaymentId: string | null;
  onOpenDeal: (dealId: string, paymentId?: string) => void;
  onPaymentAction: (
    kind: PaymentDialogKind,
    group: LedgerDealGroup,
    payment: LedgerPayment,
  ) => void;
}) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="조건에 맞는 청구가 없습니다"
        description="기간이나 필터를 바꿔 보세요."
      />
    );
  }

  const allIds = groups.flatMap((g) => paymentsOf(g).map((p) => p.id));
  const selectedCount = allIds.filter((id) => selectedIds.has(id)).length;

  return (
    <table
      className="cf-table"
      style={{ '--cf-table-min': '1180px' } as React.CSSProperties}
    >
      <colgroup>
        <col style={{ width: 36 }} />
        <col />
        {columns.stage && <col style={{ width: 90 }} />}
        <col style={{ width: 80 }} />
        <col style={{ width: 80 }} />
        <col style={{ width: 76 }} />
        <col style={{ width: 76 }} />
        <col style={{ width: 120 }} />
        {columns.assignee && <col style={{ width: 78 }} />}
        {columns.partner && <col style={{ width: 112 }} />}
        {columns.tax && <col style={{ width: 60 }} />}
        <col style={{ width: 104 }} />
      </colgroup>
      <thead>
        <tr>
          <th className="cf-pin-left left-0 !px-0 text-center">
            <Checkbox
              aria-label="전체 선택"
              className="mx-auto block size-3.5"
              checked={
                selectedCount === allIds.length && allIds.length > 0
                  ? true
                  : selectedCount > 0
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={(v) => onToggleMany(allIds, !!v)}
            />
          </th>
          <th className="cf-pin-left cf-pin-edge left-9">거래 · 청구</th>
          {columns.stage && <th>거래 단계</th>}
          <th>수금 상태</th>
          <SortHead
            sortKey="amount"
            active={sort.key}
            direction={sort.dir}
            align="right"
            onSort={onSort}
          >
            청구
          </SortHead>
          <th className="cf-num">수금</th>
          <th className="cf-num">잔여</th>
          <SortHead
            sortKey="due"
            active={sort.key}
            direction={sort.dir}
            onSort={onSort}
          >
            예정일
          </SortHead>
          {columns.assignee && <th>담당</th>}
          {columns.partner && <th>공동중개</th>}
          {columns.tax && <th>계산서</th>}
          <th className="cf-pin-right">
            <span className="sr-only">작업</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <DealRows
            key={group.deal.id}
            group={group}
            payments={paymentsOf(group)}
            columns={columns}
            selectedIds={selectedIds}
            onToggleSelected={onToggleSelected}
            onToggleMany={onToggleMany}
            // 다 받은 거래는 접어서 시작한다. 강조할 청구가 있으면 펼친다.
            open={
              (isFullyCollected(group) &&
                !group.payments.some((p) => p.id === highlightPaymentId)) ===
              foldToggled.has(group.deal.id)
            }
            onToggleFold={() => onToggleFold(group.deal.id)}
            onOpenDeal={onOpenDeal}
            onPaymentAction={onPaymentAction}
          />
        ))}
      </tbody>
    </table>
  );
}

function DealRows({
  group,
  payments,
  columns,
  selectedIds,
  onToggleSelected,
  onToggleMany,
  open,
  onToggleFold,
  onOpenDeal,
  onPaymentAction,
}: {
  group: LedgerDealGroup;
  payments: LedgerPayment[];
  columns: Record<ColumnKey, boolean>;
  selectedIds: Set<string>;
  onToggleSelected: (id: string, checked: boolean) => void;
  onToggleMany: (ids: string[], checked: boolean) => void;
  open: boolean;
  onToggleFold: () => void;
  onOpenDeal: (dealId: string, paymentId?: string) => void;
  onPaymentAction: (
    kind: PaymentDialogKind,
    group: LedgerDealGroup,
    payment: LedgerPayment,
  ) => void;
}) {
  const { deal } = group;
  const location = dealLocation(deal);
  const totals = rollupPayments(group.payments);
  const worst = worstStatus(group);
  const overdue = worst === 'overdue';
  const ids = payments.map((p) => p.id);
  const pickedCount = ids.filter((id) => selectedIds.has(id)).length;
  const names = deal.participants.map((p) => p.userName);
  const firstDue = group.payments
    .map((p) => effectiveDueDate(p, deal.balanceDueDate))
    .filter((d): d is string => d !== null)
    .sort()[0];
  const dueDate = deal.balanceDueDate ?? firstDue ?? null;

  return (
    <Fragment>
      <tr data-row="group" data-clickable onClick={() => onOpenDeal(deal.id)}>
        <td
          className="cf-pin-left left-0 !px-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            aria-label={`${location} 전체 선택`}
            className="mx-auto block size-3.5"
            checked={
              pickedCount > 0 && pickedCount === ids.length
                ? true
                : pickedCount > 0
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(v) => onToggleMany(ids, !!v)}
          />
        </td>
        <td className="cf-pin-left cf-pin-edge left-9">
          <div className="flex min-w-0 items-center gap-1.5">
            <FoldButton open={open} onToggle={onToggleFold} />
            <span className="min-w-0 truncate" title={location}>
              {location}
            </span>
            <StatusBadge
              kind="transactionType"
              status={deal.transactionType}
              size="sm"
            />
          </div>
        </td>
        {columns.stage && (
          <td>
            <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
          </td>
        )}
        <td>
          <StatusBadge kind="commissionStatus" status={worst} size="sm" />
        </td>
        <td className="cf-num">{formatMoney(totals.billed)}</td>
        <td className="cf-num">{formatMoney(totals.collected)}</td>
        <td className={cn('cf-num', overdue && 'text-destructive-strong')}>
          {formatMoney(totals.remaining)}
        </td>
        <td>
          <DueCell
            date={shortDate(dueDate)}
            relative={worst === 'collected' ? '' : relativeDueLabel(dueDate)}
            overdue={overdue}
          />
        </td>
        {columns.assignee && (
          <td className="cf-plain" title={names.join(', ')}>
            {names[0] ?? <span className="text-[#a5a39f]">—</span>}
            {names.length > 1 && (
              <span className="text-muted-foreground"> +{names.length - 1}</span>
            )}
          </td>
        )}
        {columns.partner && (
          <td className="cf-plain" title={deal.partnerBroker?.name}>
            {deal.partnerBroker?.name ?? <span className="text-[#a5a39f]">—</span>}
          </td>
        )}
        {columns.tax && <td />}
        <td className="cf-pin-right" />
      </tr>
      {open &&
        payments.map((payment) => (
          <PaymentRow
            key={payment.id}
            group={group}
            payment={payment}
            columns={columns}
            selected={selectedIds.has(payment.id)}
            onToggleSelected={onToggleSelected}
            onOpenDeal={onOpenDeal}
            onPaymentAction={onPaymentAction}
          />
        ))}
    </Fragment>
  );
}

function PaymentRow({
  group,
  payment,
  columns,
  selected,
  onToggleSelected,
  onOpenDeal,
  onPaymentAction,
}: {
  group: LedgerDealGroup;
  payment: LedgerPayment;
  columns: Record<ColumnKey, boolean>;
  selected: boolean;
  onToggleSelected: (id: string, checked: boolean) => void;
  onOpenDeal: (dealId: string, paymentId?: string) => void;
  onPaymentAction: (
    kind: PaymentDialogKind,
    group: LedgerDealGroup,
    payment: LedgerPayment,
  ) => void;
}) {
  const { deal } = group;
  const status = displayStatus(payment, deal.balanceDueDate);
  const overdue = status === 'overdue';
  const due = effectiveDueDate(payment, deal.balanceDueDate);
  const partnerRatio = partnerRatioOf(payment.distributions);
  const taxPending =
    (payment.status === 'collected' || payment.status === 'partial') &&
    payment.taxInvoiceStatus === 'none' &&
    payment.collectedByOffice === 'us';
  const dunning = useCreateDunningTasks();

  return (
    <tr
      data-clickable
      data-selected={selected || undefined}
      onClick={() => onOpenDeal(deal.id, payment.id)}
    >
      <td
        className="cf-pin-left left-0 !px-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          aria-label={`${payment.code ?? '청구'} 선택`}
          className="mx-auto block size-3.5"
          checked={selected}
          onCheckedChange={(v) => onToggleSelected(payment.id, !!v)}
        />
      </td>
      <td className="cf-pin-left cf-pin-edge left-9">
        <div className="flex min-w-0 items-center gap-1.5 pl-[22px]">
          <span className="shrink-0">{clientSideLabel(payment.clientSide)}</span>
          <span className="min-w-0 truncate text-muted-foreground">
            {payerName(deal, payment)}
          </span>
          {payment.code && (
            <span className="shrink-0 text-xs text-[#a5a39f] tabular-nums">
              {payment.code}
            </span>
          )}
          {payment.collectedByOffice === 'partner' && (
            <span className="shrink-0 text-xs text-muted-foreground">
              상대 수금
            </span>
          )}
          {payment.note && (
            <span title={payment.note} className="shrink-0 text-[#a5a39f]">
              <StickyNote className="size-3" aria-label="메모 있음" />
            </span>
          )}
        </div>
      </td>
      {columns.stage && <td />}
      <td>
        <span className="inline-flex items-center gap-1">
          <StatusBadge kind="commissionStatus" status={status} size="sm" />
          {payment.pendingAdjustments > 0 && (
            <span title="조정 승인 대기" className="text-warning-strong">
              <CirclePause className="size-3.5" aria-label="조정 승인 대기" />
            </span>
          )}
        </span>
      </td>
      <td className="cf-num">{formatMoney(payment.expectedAmount)}</td>
      <td className="cf-num">{formatMoney(receivedAmount(payment))}</td>
      <td className={cn('cf-num', overdue && 'text-destructive-strong')}>
        {formatMoney(paymentRemaining(payment))}
      </td>
      <td>
        {isPaymentDone(payment) ? (
          <DueCell date={shortDate(payment.paidAt)} relative="입금" muted />
        ) : (
          <DueCell
            date={shortDate(due)}
            relative={relativeDueLabel(due)}
            overdue={overdue}
          />
        )}
      </td>
      {columns.assignee && <td />}
      {columns.partner && (
        <td className="text-muted-foreground">
          {partnerRatio > 0 ? `우리 몫 ${ourRatioFrom(partnerRatio)}%` : ''}
        </td>
      )}
      {columns.tax && (
        <td>
          {payment.taxInvoiceStatus !== 'none' ? (
            <span className="text-muted-foreground" title={payment.taxInvoiceNo ?? undefined}>
              기록함
            </span>
          ) : taxPending ? (
            <span className="text-warning-strong">미기록</span>
          ) : null}
        </td>
      )}
      <td
        className="cf-pin-right !px-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end gap-0.5">
          {payment.status === 'draft' ? (
            <RowAction onClick={() => onPaymentAction('confirmDraft', group, payment)}>
              청구 확정
            </RowAction>
          ) : isOpenPayment(payment) ? (
            <RowAction onClick={() => onPaymentAction('collect', group, payment)}>
              수금 처리
            </RowAction>
          ) : taxPending ? (
            <RowAction onClick={() => onPaymentAction('tax', group, payment)}>
              계산서
            </RowAction>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-[26px] text-muted-foreground"
                aria-label={`${payment.code ?? '청구'} 더보기`}
              >
                <EllipsisVertical className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => onOpenDeal(deal.id, payment.id)}>
                <ExternalLink className="size-3.5" />
                거래 상세
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!isOpenPayment(payment) || dunning.isPending}
                onSelect={() =>
                  dunning.mutate([
                    {
                      payment,
                      location: dealLocation(deal),
                      dealId: deal.id,
                    },
                  ])
                }
              >
                <Bell className="size-3.5" />
                독촉 업무 만들기
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={
                  !(payment.status === 'collected' || payment.status === 'partial') ||
                  payment.taxInvoiceStatus !== 'none'
                }
                onSelect={() => onPaymentAction('tax', group, payment)}
              >
                <ReceiptText className="size-3.5" />
                세금계산서 기록
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!isOpenPayment(payment)}
                onSelect={() => onPaymentAction('adjust', group, payment)}
              >
                <CircleSlash className="size-3.5" />
                조정 요청
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}

function RowAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      className="h-[26px] px-2 font-normal"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
