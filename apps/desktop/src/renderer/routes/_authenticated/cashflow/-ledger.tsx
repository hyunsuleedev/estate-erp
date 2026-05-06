import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CirclePause,
  CirclePlus,
  CircleSlash,
  Columns3,
  Download,
  Handshake,
  LayoutList,
  ReceiptText,
  Search,
} from 'lucide-react';
import type {
  LedgerDealGroup,
  LedgerPayment,
  LedgerPreset,
  LedgerView,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

// ─────────────────────────────────────────────────────────────
// 원장 스타일 정의
// ─────────────────────────────────────────────────────────────

const paymentStatusMeta: Record<
  string,
  { label: string; dotClass: string; pillClass: string }
> = {
  draft: {
    label: '초안',
    dotClass: 'bg-zinc-400',
    pillClass:
      'text-zinc-600 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-900',
  },
  pending: {
    label: '예정',
    dotClass: 'bg-sky-500',
    pillClass: 'text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-950/40',
  },
  partial: {
    label: '일부수금',
    dotClass: 'bg-amber-500',
    pillClass: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40',
  },
  collected: {
    label: '수금완료',
    dotClass: 'bg-emerald-500',
    pillClass: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
  },
  overdue: {
    label: '연체',
    dotClass: 'bg-red-500',
    pillClass: 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/40',
  },
  waived: {
    label: '면제',
    dotClass: 'bg-zinc-400',
    pillClass: 'text-zinc-600 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-900',
  },
  cancelled: {
    label: '취소',
    dotClass: 'bg-zinc-400',
    pillClass: 'text-zinc-600 bg-zinc-100 dark:text-zinc-400 dark:bg-zinc-900',
  },
};

const transactionTypeLabel: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

// Deal stage 를 4단계 마일스톤 으로 요약
// 수수료 채권 파이프라인 — 계약 체결 이후 4단계만 의미가 있음
// (계약 이전 단계는 수수료 채권 미발생 상태로, 서버에서 원장에 포함되지 않음)
const commissionPipeline: Array<{
  key: string;
  label: string;
  short: string;
  color: string;
}> = [
  { key: 'contract', label: '계약', short: '계약', color: 'oklch(0.58 0.13 220)' },
  { key: 'interim', label: '중도금', short: '중도', color: 'oklch(0.58 0.13 65)' },
  { key: 'closing', label: '잔금', short: '잔금', color: 'oklch(0.55 0.14 30)' },
  { key: 'closed', label: '종결', short: '종결', color: 'oklch(0.52 0.14 155)' },
];

const stageToCommissionIdx = (stage: string): number => {
  switch (stage) {
    case 'contracted':
      return 0;
    case 'settling':
      return 2; // 중도금/잔금 통합 단계 → 잔금으로 표시
    case 'completed':
    case 'closed':
      return 3;
    default:
      return 0;
  }
};

const stageMilestone = (
  stage: string,
): { idx: number; label: string; total: number } => {
  const idx = stageToCommissionIdx(stage);
  return {
    idx,
    label: commissionPipeline[idx].label,
    total: commissionPipeline.length,
  };
};

function toManwon(value: number): string {
  return `${value.toLocaleString()}만`;
}

function toDateLabel(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  });
}

function daysFrom(value: string | null | undefined): number | null {
  if (!value) return null;
  const diff = Math.round(
    (new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  return diff;
}

function relativeDateLabel(value: string | null | undefined): string {
  const d = daysFrom(value);
  if (d === null) return '-';
  if (d === 0) return '오늘';
  if (d > 0) return `${d}일 후`;
  return `${-d}일 경과`;
}

// ─────────────────────────────────────────────────────────────
// Top-level Ledger view
// ─────────────────────────────────────────────────────────────

export type LedgerViewMode = 'table' | 'calendar';

export type LedgerSortKey = 'dueDate_asc' | 'dueDate_desc' | 'amount_desc';

// ─────────────────────────────────────────────────────────────
// 컬럼 가시성
// ─────────────────────────────────────────────────────────────

export type LedgerColumnKey =
  | 'pipeline'
  | 'dueDate'
  | 'assignee'
  | 'partner'
  | 'action'
  | 'memo';

const COLUMN_OPTIONS: Array<{ key: LedgerColumnKey; label: string }> = [
  { key: 'pipeline', label: '파이프라인' },
  { key: 'dueDate', label: '잔금일' },
  { key: 'assignee', label: '담당' },
  { key: 'partner', label: '공동' },
  { key: 'action', label: '빠른 작업' },
  { key: 'memo', label: '청구 메모' },
];

const DEFAULT_COLUMNS: Record<LedgerColumnKey, boolean> = {
  pipeline: true,
  dueDate: true,
  assignee: true,
  partner: true,
  action: true,
  memo: true,
};

const COLUMN_STORAGE_KEY = 'estate-erp:ledger:columns';

function useVisibleColumns() {
  const [visible, setVisible] = useState<Record<LedgerColumnKey, boolean>>(
    () => {
      if (typeof window === 'undefined') return DEFAULT_COLUMNS;
      try {
        const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
        if (!raw) return DEFAULT_COLUMNS;
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        const next = { ...DEFAULT_COLUMNS };
        for (const k of Object.keys(DEFAULT_COLUMNS) as LedgerColumnKey[]) {
          if (typeof parsed[k] === 'boolean') next[k] = parsed[k];
        }
        return next;
      } catch {
        return DEFAULT_COLUMNS;
      }
    },
  );

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visible));
    } catch {
      /* noop */
    }
  }, [visible]);

  const toggle = (key: LedgerColumnKey) =>
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  const reset = () => setVisible(DEFAULT_COLUMNS);

  return { visible, toggle, reset };
}

export function LedgerView({
  defaultViewMode = 'table',
}: { defaultViewMode?: LedgerViewMode } = {}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [partnerFilter, setPartnerFilter] = useState<string>('all');
  const [sort, setSort] = useState<LedgerSortKey>('dueDate_asc');
  const [viewMode, setViewMode] = useState<LedgerViewMode>(defaultViewMode);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailDealId, setDetailDealId] = useState<string | null>(null);
  const [detailHighlightPaymentId, setDetailHighlightPaymentId] = useState<
    string | null
  >(null);
  const { visible: visibleColumns, toggle: toggleColumn, reset: resetColumns } =
    useVisibleColumns();

  // 테이블 뷰 기본: 'upcoming' (오늘부터 끝까지), 캘린더 뷰 기본: 'month'
  const [tablePreset, setTablePreset] = useState<LedgerPreset>('upcoming');
  const effectivePreset: LedgerPreset =
    viewMode === 'calendar' ? 'month' : tablePreset;

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'ledger', effectivePreset, year, month],
    queryFn: () =>
      api.finance.ledger.get({
        preset: effectivePreset,
        year,
        month,
      }),
  });

  // 필터 옵션 목록 — 데이터에서 추출
  const { assigneeOptions, partnerOptions } = useMemo(() => {
    const assignees = new Map<string, string>();
    const partners = new Map<string, string>();
    for (const g of data?.groups ?? []) {
      for (const p of g.deal.participants ?? []) {
        assignees.set(p.userName, p.userName);
      }
      if (g.deal.partnerBroker) {
        partners.set(g.deal.partnerBroker.id, g.deal.partnerBroker.name);
      }
    }
    return {
      assigneeOptions: Array.from(assignees.values()),
      partnerOptions: Array.from(partners.entries()), // [id, name][]
    };
  }, [data]);

  const filtered = useMemo<LedgerDealGroup[]>(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    const list = data.groups.filter((g) => {
      if (typeFilter !== 'all' && g.deal.transactionType !== typeFilter) {
        return false;
      }
      if (statusFilter !== 'all') {
        const hasMatch = g.payments.some((p) => p.status === statusFilter);
        if (!hasMatch) return false;
      }
      if (assigneeFilter !== 'all') {
        const has = (g.deal.participants ?? []).some(
          (p) => p.userName === assigneeFilter,
        );
        if (!has) return false;
      }
      if (partnerFilter !== 'all') {
        if (partnerFilter === 'none') {
          if (g.deal.partnerBroker) return false;
        } else {
          if (g.deal.partnerBroker?.id !== partnerFilter) return false;
        }
      }
      if (query) {
        const hay = [
          g.deal.siteName,
          g.deal.dongName,
          g.deal.unitName,
          g.deal.partnerBroker?.name,
          ...g.payments.map((p) => p.code ?? ''),
          g.deal.buyerContactName,
          g.deal.sellerContactName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    // 정렬 — Deal 그룹 내 최조/최대 dueDate 기준
    const groupKey = (g: LedgerDealGroup) => {
      const dates = g.payments
        .map((p) => (p.dueDate ? new Date(p.dueDate).getTime() : null))
        .filter((v): v is number => v !== null);
      const amounts = g.payments.map((p) => p.expectedAmount);
      return {
        minDue: dates.length ? Math.min(...dates) : Number.POSITIVE_INFINITY,
        maxAmount: amounts.length ? Math.max(...amounts) : 0,
      };
    };
    const withKeys = list.map((g) => ({ g, ...groupKey(g) }));
    withKeys.sort((a, b) => {
      if (sort === 'dueDate_asc') return a.minDue - b.minDue;
      if (sort === 'dueDate_desc') return b.minDue - a.minDue;
      return b.maxAmount - a.maxAmount; // amount_desc
    });
    return withKeys.map((e) => e.g);
  }, [
    data,
    search,
    statusFilter,
    typeFilter,
    assigneeFilter,
    partnerFilter,
    sort,
  ]);

  // 필터된 결과 기준 모든 payment id 집합 (전체 선택 / 선택 정리용)
  const visiblePaymentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of filtered) for (const p of g.payments) ids.add(p.id);
    return ids;
  }, [filtered]);

  // 필터 변경 시 숨겨진 항목의 selection 정리
  useMemo(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) if (visiblePaymentIds.has(id)) next.add(id);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePaymentIds]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (selectedIds.size === visiblePaymentIds.size) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visiblePaymentIds));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl bg-muted/50 p-8 text-center text-sm text-muted-foreground">
        원장 데이터를 불러올 수 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 조정 승인 대기 배너 */}
      {data.adjustmentsPending.length > 0 && (
        <AdjustmentBanner items={data.adjustmentsPending} />
      )}

      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <PeriodPicker
          viewMode={viewMode}
          preset={tablePreset}
          year={year}
          month={month}
          onPresetChange={setTablePreset}
          onMonthChange={(y, m) => {
            setYear(y);
            setMonth(m);
          }}
        />
        <div className="relative flex-1 min-w-[180px] max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="호수·ID·메모·공동중개…"
            className="h-9 pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[130px]">
            <SelectValue placeholder="전체 상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {Object.entries(paymentStatusMeta).map(([key, meta]) => (
              <SelectItem key={key} value={key}>
                {meta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-[110px]">
            <SelectValue placeholder="거래유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 유형</SelectItem>
            <SelectItem value="sale">매매</SelectItem>
            <SelectItem value="jeonse">전세</SelectItem>
            <SelectItem value="monthly">월세</SelectItem>
          </SelectContent>
        </Select>

        {/* 담당자 필터 */}
        {assigneeOptions.length > 0 && (
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-9 w-[110px]">
              <SelectValue placeholder="담당자" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 담당자</SelectItem>
              {assigneeOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* 공동중개 필터 */}
        {partnerOptions.length > 0 && (
          <Select value={partnerFilter} onValueChange={setPartnerFilter}>
            <SelectTrigger className="h-9 w-[130px]">
              <SelectValue placeholder="공동중개" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 (공동/단독)</SelectItem>
              <SelectItem value="none">단독중개만</SelectItem>
              {partnerOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* 정렬 */}
        <Select
          value={sort}
          onValueChange={(v) => setSort(v as LedgerSortKey)}
        >
          <SelectTrigger className="h-9 w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dueDate_asc">잔금일 ↑</SelectItem>
            <SelectItem value="dueDate_desc">잔금일 ↓</SelectItem>
            <SelectItem value="amount_desc">금액 큰 순</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {viewMode === 'table' && (
            <ColumnVisibilityMenu
              visible={visibleColumns}
              onToggle={toggleColumn}
              onReset={resetColumns}
            />
          )}

          <div className="inline-flex items-center rounded-md border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium',
                viewMode === 'table'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutList className="size-3.5" />
              테이블
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium',
                viewMode === 'calendar'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <CalendarDays className="size-3.5" />
              캘린더
            </button>
          </div>
        </div>
      </div>

      {/* KPI 요약 바 */}
      <SummaryBar summary={data.summary} />

      {/* 다중 선택 액션 바 (테이블 뷰에서만, 하나 이상 선택되었을 때) */}
      {viewMode === 'table' && selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          groups={filtered}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {/* 뷰: 테이블 or 캘린더 */}
      {viewMode === 'table' ? (
        <LedgerTable
          groups={filtered}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          onToggleAll={toggleAllVisible}
          allSelected={
            visiblePaymentIds.size > 0 &&
            selectedIds.size === visiblePaymentIds.size
          }
          visibleColumns={visibleColumns}
          onOpenDeal={(dealId, paymentId) => {
            setDetailDealId(dealId);
            setDetailHighlightPaymentId(paymentId ?? null);
          }}
        />
      ) : (
        <LedgerCalendar year={year} month={month} groups={filtered} />
      )}

      <LedgerDetailSheet
        group={
          filtered.find((g) => g.deal.id === detailDealId) ?? null
        }
        highlightPaymentId={detailHighlightPaymentId}
        onClose={() => {
          setDetailDealId(null);
          setDetailHighlightPaymentId(null);
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 컬럼 가시성 팝오버
// ─────────────────────────────────────────────────────────────

function ColumnVisibilityMenu({
  visible,
  onToggle,
  onReset,
}: {
  visible: Record<LedgerColumnKey, boolean>;
  onToggle: (key: LedgerColumnKey) => void;
  onReset: () => void;
}) {
  const activeCount = COLUMN_OPTIONS.filter((c) => visible[c.key]).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Columns3 className="size-3.5" />
          컬럼
          <span className="ml-0.5 rounded bg-muted px-1 text-[10px] text-muted-foreground">
            {activeCount}/{COLUMN_OPTIONS.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex items-center justify-between px-1 pb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            컬럼 표시
          </span>
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] text-primary hover:underline"
          >
            기본값
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {COLUMN_OPTIONS.map((col) => (
            <label
              key={col.key}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60"
            >
              <input
                type="checkbox"
                checked={visible[col.key]}
                onChange={() => onToggle(col.key)}
                className="size-3.5 cursor-pointer rounded border-muted-foreground/30"
              />
              {col.label}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────────────────────────────────────
// 다중 선택 액션 바 — 독촉 Task 생성 + CSV 내보내기
// ─────────────────────────────────────────────────────────────

function BulkActionBar({
  selectedIds,
  groups,
  onClear,
}: {
  selectedIds: Set<string>;
  groups: LedgerDealGroup[];
  onClear: () => void;
}) {
  const qc = useQueryClient();

  // 선택된 Payment 들을 Group 정보와 함께 펼침
  const items = useMemo(() => {
    const out: Array<{
      payment: LedgerPayment;
      location: string;
      code: string | null;
      dealId: string;
    }> = [];
    for (const g of groups) {
      for (const p of g.payments) {
        if (selectedIds.has(p.id)) {
          out.push({
            payment: p,
            location:
              [g.deal.siteName, g.deal.dongName, g.deal.unitName]
                .filter(Boolean)
                .join(' ') || '매물 미지정',
            code: p.code,
            dealId: g.deal.id,
          });
        }
      }
    }
    return out;
  }, [groups, selectedIds]);

  const totalAmount = items.reduce(
    (s, i) =>
      s + (i.payment.expectedAmount - (i.payment.actualAmount ?? 0)),
    0,
  );

  const [dunningLoading, setDunningLoading] = useState(false);

  const handleDunning = async () => {
    if (items.length === 0) return;
    setDunningLoading(true);
    try {
      // 각 payment 당 Task 1건 생성 (category: call, priority: urgent)
      await Promise.all(
        items.map((it) =>
          api.tasks.create({
            title: `[독촉] ${it.location} · ${it.code ?? ''} ${toManwon(
              it.payment.expectedAmount - (it.payment.actualAmount ?? 0),
            )} 수금`,
            content: `${it.payment.clientSide === 'seller' ? '매도측' : '매수측'} 청구 독촉`,
            category: 'call',
            priority: 'urgent',
            source: 'system',
            dueDate: new Date().toISOString(),
            dealId: it.dealId,
          }),
        ),
      );
      qc.invalidateQueries({ queryKey: ['tasks'] });
      alert(`${items.length}건 독촉 태스크를 생성했습니다.`);
      onClear();
    } finally {
      setDunningLoading(false);
    }
  };

  const handleCsv = () => {
    const header = [
      '코드',
      '매물',
      '구분',
      '예정일',
      '예정액(만원)',
      '수금액(만원)',
      '상태',
      '세금계산서',
    ].join(',');
    const rows = items.map((it) => {
      const p = it.payment;
      return [
        p.code ?? '',
        `"${it.location}"`,
        p.clientSide === 'seller' ? '매도측' : '매수측',
        p.dueDate ? new Date(p.dueDate).toLocaleDateString('ko-KR') : '',
        p.expectedAmount,
        p.actualAmount ?? '',
        paymentStatusMeta[p.status]?.label ?? p.status,
        p.taxInvoiceNo ?? '',
      ].join(',');
    });
    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `원장_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={onClear}
          className="inline-flex size-6 items-center justify-center rounded-md border bg-background hover:bg-muted"
          title="선택 해제"
        >
          <CircleSlash className="size-3.5" />
        </button>
        <span className="font-medium">{selectedIds.size}건 선택됨</span>
        <span className="text-xs text-muted-foreground">
          잔여 합계 {toManwon(totalAmount)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleCsv}
          className="h-8"
        >
          <Download className="size-3.5" />
          CSV 내보내기
        </Button>
        <Button
          size="sm"
          className="h-8 bg-red-600 hover:bg-red-700"
          onClick={handleDunning}
          disabled={dunningLoading}
        >
          <Bell className="size-3.5" />
          일괄 독촉 태스크 ({items.length})
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Adjustment banner
// ─────────────────────────────────────────────────────────────

function AdjustmentBanner({
  items,
}: {
  items: LedgerView['adjustmentsPending'];
}) {
  const [selected, setSelected] = useState<LedgerView['adjustmentsPending'][number] | null>(null);
  const total = items.reduce((s, a) => s + a.amount, 0);
  return (
    <>
      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/20">
        <AlertTriangle className="mt-0.5 size-5 text-red-500" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            수수료 조정 승인 대기 · {items.length}건 · 총{' '}
            <span className="text-red-700">
              {total >= 0 ? '+' : ''}
              {toManwon(total)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            담당자가 요청한 할인·면제·대손 처리입니다. 클릭하여 개별 검토하세요.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.slice(0, 6).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a)}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted/60"
              title={a.reason}
            >
              <span className="font-mono text-muted-foreground">{a.code ?? '—'}</span>
              <span>
                {a.type === 'discount'
                  ? '할인 합의'
                  : a.type === 'waive'
                    ? '면제'
                    : '대손 처리'}
              </span>
              <span className="font-semibold text-red-600">{toManwon(a.amount)}</span>
            </button>
          ))}
        </div>
      </div>

      <AdjustmentDecisionDialog
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        adjustment={selected}
      />
    </>
  );
}

function AdjustmentDecisionDialog({
  open,
  onOpenChange,
  adjustment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  adjustment: LedgerView['adjustmentsPending'][number] | null;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');

  const approve = useMutation({
    mutationFn: () =>
      api.finance.adjustments.approve(adjustment!.id, note || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      onOpenChange(false);
      setNote('');
    },
  });

  const reject = useMutation({
    mutationFn: () =>
      api.finance.adjustments.reject(adjustment!.id, note || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      onOpenChange(false);
      setNote('');
    },
  });

  if (!adjustment) return null;

  const typeLabel =
    adjustment.type === 'discount'
      ? '할인 합의'
      : adjustment.type === 'waive'
        ? '면제'
        : '대손 처리';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            수수료 조정 검토 · {adjustment.code ?? ''}
          </DialogTitle>
          <DialogDescription>
            {adjustment.paymentCode ? `${adjustment.paymentCode} · ` : ''}
            {typeLabel} · {toManwon(adjustment.amount)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="text-[11px] text-muted-foreground">요청 사유</div>
            <div className="mt-1 whitespace-pre-wrap">{adjustment.reason}</div>
          </div>

          <div className="grid gap-1.5">
            <Label>결정 메모 (선택)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예) 원칙대로 승인"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => reject.mutate()}
            disabled={reject.isPending || approve.isPending}
          >
            <CircleSlash className="size-3.5" />
            반려
          </Button>
          <Button
            onClick={() => approve.mutate()}
            disabled={approve.isPending || reject.isPending}
          >
            <CircleCheck className="size-3.5" />
            승인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Month selector
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// 기간 선택기 — 프리셋 드롭다운 + (필요시) 월 네비게이터
// ─────────────────────────────────────────────────────────────

const presetLabels: Record<LedgerPreset | 'custom_month', string> = {
  upcoming: '다가오는 수금',
  'this-month': '이번 달 진행',
  month: '이번 달',
  all: '전체 기간',
  custom_month: '특정 월 선택…',
};

function PeriodPicker({
  viewMode,
  preset,
  year,
  month,
  onPresetChange,
  onMonthChange,
}: {
  viewMode: 'table' | 'calendar';
  preset: LedgerPreset;
  year: number;
  month: number;
  onPresetChange: (p: LedgerPreset) => void;
  onMonthChange: (y: number, m: number) => void;
}) {
  const today = new Date();
  const isThisMonth =
    year === today.getFullYear() && month === today.getMonth() + 1;

  // 캘린더 뷰: preset 고정(month), 월 네비게이터만
  if (viewMode === 'calendar') {
    return (
      <MonthSelector year={year} month={month} onChange={onMonthChange} />
    );
  }

  // 테이블 뷰: preset 드롭다운 + month 선택 시 월 네비게이터 동반
  const effectiveKey: LedgerPreset | 'custom_month' =
    preset === 'month' && !isThisMonth ? 'custom_month' : preset;

  const handleSelect = (value: string) => {
    if (value === 'upcoming') {
      onPresetChange('upcoming');
    } else if (value === 'this-month') {
      onPresetChange('this-month');
    } else if (value === 'all') {
      onPresetChange('all');
    } else if (value === 'custom_month') {
      // "특정 월 선택..." — preset 은 month, 월은 현재 상태 유지
      onPresetChange('month');
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Select value={effectiveKey} onValueChange={handleSelect}>
        <SelectTrigger className="h-9 w-[170px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="upcoming">다가오는 수금</SelectItem>
          <SelectItem value="this-month">이번 달 진행</SelectItem>
          <SelectItem value="custom_month">특정 월 선택…</SelectItem>
          <SelectItem value="all">전체 기간</SelectItem>
        </SelectContent>
      </Select>
      {preset === 'month' && (
        <MonthSelector year={year} month={month} onChange={onMonthChange} />
      )}
    </div>
  );
}

function MonthSelector({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (y: number, m: number) => void;
}) {
  const prev = () => {
    if (month === 1) onChange(year - 1, 12);
    else onChange(year, month - 1);
  };
  const next = () => {
    if (month === 12) onChange(year + 1, 1);
    else onChange(year, month + 1);
  };
  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-background">
      <Button variant="ghost" size="sm" className="h-9 px-2" onClick={prev}>
        ‹
      </Button>
      <span className="min-w-[72px] text-center text-sm font-medium">
        {year}.{String(month).padStart(2, '0')}
      </span>
      <Button variant="ghost" size="sm" className="h-9 px-2" onClick={next}>
        ›
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Summary bar
// ─────────────────────────────────────────────────────────────

function SummaryBar({
  summary,
}: {
  summary: LedgerView['summary'];
}) {
  const items = [
    { label: '청구 건수', value: `${summary.paymentCount}건`, accent: '' },
    { label: '합계 금액', value: toManwon(summary.billedTotal), accent: 'text-foreground' },
    {
      label: '수금 완료',
      value: `${toManwon(summary.collectedTotal)} (${summary.collectedCount}건)`,
      accent: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      label: '연체',
      value: `${summary.overdueCount}건`,
      accent: summary.overdueCount > 0 ? 'text-red-700 dark:text-red-300' : '',
    },
    {
      label: '일부수금',
      value: `${summary.partialCount}건`,
      accent: summary.partialCount > 0 ? 'text-amber-700 dark:text-amber-300' : '',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-xl border bg-card md:grid-cols-3 lg:grid-cols-6">
      {items.map((it, i) => (
        <div
          key={it.label}
          className={cn(
            'px-4 py-3',
            i < items.length - 1 && 'border-r last:border-r-0',
          )}
        >
          <div className="text-[11px] text-muted-foreground">{it.label}</div>
          <div className={cn('mt-0.5 text-base font-semibold tracking-tight', it.accent)}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Ledger table
// ─────────────────────────────────────────────────────────────

function LedgerTable({
  groups,
  selectedIds,
  onToggleSelected,
  onToggleAll,
  allSelected,
  visibleColumns,
  onOpenDeal,
}: {
  groups: LedgerDealGroup[];
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  visibleColumns: Record<LedgerColumnKey, boolean>;
  onOpenDeal: (dealId: string, paymentId?: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-10 text-center text-sm text-muted-foreground">
        조건에 맞는 청구 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="w-8 px-2 py-2.5">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="size-3.5 cursor-pointer rounded border-muted-foreground/30"
                title={allSelected ? '전체 해제' : '전체 선택'}
              />
            </th>
            <th className="w-8 px-2 py-2.5"></th>
            <th className="px-3 py-2.5 text-left font-medium">거래 · 호수</th>
            {visibleColumns.pipeline && (
              <th className="px-3 py-2.5 text-left font-medium">파이프라인</th>
            )}
            <th className="px-3 py-2.5 text-left font-medium">
              수수료 합계 · 수금
            </th>
            {visibleColumns.dueDate && (
              <th className="px-3 py-2.5 text-left font-medium">잔금일</th>
            )}
            {visibleColumns.assignee && (
              <th className="px-3 py-2.5 text-left font-medium">담당</th>
            )}
            {visibleColumns.partner && (
              <th className="px-3 py-2.5 text-left font-medium">공동</th>
            )}
            {visibleColumns.action && (
              <th className="px-3 py-2.5 text-left font-medium">빠른 작업</th>
            )}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <DealGroupRow
              key={g.deal.id}
              group={g}
              selectedIds={selectedIds}
              onToggleSelected={onToggleSelected}
              visibleColumns={visibleColumns}
              onOpenDeal={onOpenDeal}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Deal 그룹 상위 행 + 하위 payment 행 (아코디언 토글)
// ─────────────────────────────────────────────────────────────

function DealGroupRow({
  group,
  selectedIds,
  onToggleSelected,
  visibleColumns,
  onOpenDeal,
}: {
  group: LedgerDealGroup;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  visibleColumns: Record<LedgerColumnKey, boolean>;
  onOpenDeal: (dealId: string, paymentId?: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { deal, payments } = group;
  const location = [deal.siteName, deal.dongName, deal.unitName]
    .filter(Boolean)
    .join(' ');

  const worstStatus = payments.some((p) => p.status === 'overdue')
    ? 'overdue'
    : payments.some((p) => p.status === 'partial')
      ? 'partial'
      : payments.every((p) => p.status === 'collected')
        ? 'collected'
        : 'pending';
  const meta = paymentStatusMeta[worstStatus] ?? paymentStatusMeta.pending;

  const milestone = stageMilestone(deal.stage);

  const selectedInGroup = payments.filter((p) =>
    selectedIds.has(p.id),
  ).length;
  const allSelectedInGroup =
    selectedInGroup > 0 && selectedInGroup === payments.length;
  const someSelectedInGroup =
    selectedInGroup > 0 && selectedInGroup < payments.length;

  const toggleGroupSelection = () => {
    if (allSelectedInGroup) {
      // 전부 선택 중이면 다 해제
      for (const p of payments) {
        if (selectedIds.has(p.id)) onToggleSelected(p.id);
      }
    } else {
      // 아직 안 된 것만 추가
      for (const p of payments) {
        if (!selectedIds.has(p.id)) onToggleSelected(p.id);
      }
    }
  };

  return (
    <>
      <tr className="border-b bg-muted/10 hover:bg-muted/20">
        <td className="px-2 py-3 align-top">
          <input
            type="checkbox"
            checked={allSelectedInGroup}
            ref={(el) => {
              if (el) el.indeterminate = someSelectedInGroup;
            }}
            onChange={toggleGroupSelection}
            className="size-3.5 cursor-pointer rounded border-muted-foreground/30"
          />
        </td>
        <td className="px-2 py-3 align-top">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex size-6 items-center justify-center rounded hover:bg-background"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        </td>
        <td
          className="cursor-pointer px-3 py-3 align-top hover:bg-muted/30"
          onClick={() => onOpenDeal(deal.id)}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium underline-offset-2 hover:underline">
              {location || '매물 미지정'}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {transactionTypeLabel[deal.transactionType] ?? deal.transactionType}
            </Badge>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            계약 {toDateLabel(deal.stageChangedAt)}
          </div>
        </td>
        {visibleColumns.pipeline && (
          <td className="px-3 py-3 align-top">
            <MilestoneIndicator idx={milestone.idx} />
            <div
              className="mt-1 text-[11px] font-medium"
              style={{ color: commissionPipeline[milestone.idx].color }}
            >
              <span className="font-mono text-[10px] text-muted-foreground">
                {milestone.idx + 1}/{milestone.total}
              </span>{' '}
              {milestone.label}
            </div>
          </td>
        )}
        <td className="px-3 py-3 align-top">
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', meta.dotClass)} />
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                meta.pillClass,
              )}
            >
              {meta.label}
            </span>
            <span className="text-sm font-semibold">
              {toManwon(deal.summary.billed)}
            </span>
          </div>
          <CollectionProgressBar
            billed={deal.summary.billed}
            collected={deal.summary.collected}
            overdue={worstStatus === 'overdue'}
          />
        </td>
        {visibleColumns.dueDate && (
          <td
            className={cn(
              'px-3 py-3 align-top font-mono text-[11px]',
              worstStatus === 'overdue'
                ? 'font-semibold text-red-700 dark:text-red-300'
                : 'text-foreground/80',
            )}
          >
            {toDateLabel(deal.balanceDueDate)}
            <div
              className={cn(
                'mt-0.5 text-[10px] font-normal',
                worstStatus === 'overdue'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-muted-foreground',
              )}
            >
              {relativeDateLabel(deal.balanceDueDate)}
            </div>
          </td>
        )}
        {visibleColumns.assignee && (
          <td className="px-3 py-3 align-top">
            {deal.participants.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {deal.participants.slice(0, 3).map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-[10px]"
                  >
                    {p.userName}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </td>
        )}
        {visibleColumns.partner && (
          <td className="px-3 py-3 align-top">
            {deal.partnerBroker ? (
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                <Handshake className="size-3" />
                {deal.partnerBroker.name}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </td>
        )}
        {visibleColumns.action && (
          <td className="px-3 py-3 align-top text-xs text-muted-foreground">
            —
          </td>
        )}
      </tr>

      {expanded &&
        payments.map((p) => (
          <PaymentRow
            key={p.id}
            payment={p}
            checked={selectedIds.has(p.id)}
            onToggle={() => onToggleSelected(p.id)}
            visibleColumns={visibleColumns}
            onOpen={() => onOpenDeal(deal.id, p.id)}
          />
        ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 하위 payment 행
// ─────────────────────────────────────────────────────────────

function PaymentRow({
  payment,
  checked,
  onToggle,
  visibleColumns,
  onOpen,
}: {
  payment: LedgerPayment;
  checked: boolean;
  onToggle: () => void;
  visibleColumns: Record<LedgerColumnKey, boolean>;
  onOpen: () => void;
}) {
  const meta = paymentStatusMeta[payment.status] ?? paymentStatusMeta.pending;
  const [collectOpen, setCollectOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const sideLabel = payment.clientSide === 'seller' ? '매도측 청구' : '매수측 청구';

  const remaining =
    payment.actualAmount != null && payment.status === 'partial'
      ? payment.expectedAmount - payment.actualAmount
      : null;

  return (
    <>
      <tr
        className={cn(
          'border-b last:border-b-0 hover:bg-muted/10',
          checked && 'bg-primary/5',
        )}
      >
        <td className="px-2 py-2.5 align-top">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="size-3.5 cursor-pointer rounded border-muted-foreground/30"
          />
        </td>
        <td className="px-2 py-2.5 align-top">
          {/* L자 트리 가이드 */}
          <div
            aria-hidden
            className="ml-[6px] mt-[-2px] size-[10px] rounded-bl-[3px] border-b border-l border-border"
          />
        </td>
        <td
          className="cursor-pointer px-3 py-2.5 align-top hover:bg-muted/30"
          onClick={onOpen}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium',
                payment.clientSide === 'seller'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
              )}
            >
              {sideLabel}
              {payment.code && (
                <span className="font-mono text-[10px] font-normal opacity-70">
                  {payment.code}
                </span>
              )}
            </span>
            {payment.collectedByOffice === 'partner' && (
              <span className="text-[10px] text-muted-foreground">
                파트너 수금
              </span>
            )}
          </div>
          {visibleColumns.memo && payment.note && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              {payment.note}
            </div>
          )}
        </td>
        {visibleColumns.pipeline && (
          <td className="px-3 py-2.5 align-top">
            <div className="text-[10px] italic text-muted-foreground">
              {payment.clientSide === 'seller'
                ? '매도인에 청구'
                : '매수인에 청구'}
            </div>
          </td>
        )}
        <td className="px-3 py-2.5 align-top">
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', meta.dotClass)} />
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', meta.pillClass)}>
              {meta.label}
            </span>
            {payment.pendingAdjustments > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                승인대기
              </span>
            )}
            <span className="text-sm font-semibold">
              {toManwon(payment.expectedAmount)}
            </span>
          </div>
          {payment.status === 'collected' && (
            <div className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
              전액 수금
              {payment.paidAt && ` · ${toDateLabel(payment.paidAt)}`}
            </div>
          )}
          {payment.status === 'partial' && (
            <div className="mt-1 text-[11px]">
              수금 {toManwon(payment.actualAmount ?? 0)} (
              {Math.round(((payment.actualAmount ?? 0) / payment.expectedAmount) * 100)}%)
              {payment.paidAt && ` · ${toDateLabel(payment.paidAt)}`}
              {remaining !== null && (
                <>
                  {' '}
                  · 잔여 {toManwon(remaining)}
                  {payment.agreedRemainingDate &&
                    ` · ${toDateLabel(payment.agreedRemainingDate)} 예정`}
                </>
              )}
            </div>
          )}
          {payment.status === 'overdue' && payment.dueDate && (
            <div className="mt-1 text-[11px] text-red-700 dark:text-red-300">
              {relativeDateLabel(payment.dueDate)}
            </div>
          )}
          <CollectionProgressBar
            billed={payment.expectedAmount}
            collected={
              payment.status === 'collected'
                ? payment.expectedAmount
                : payment.status === 'partial'
                  ? (payment.actualAmount ?? 0)
                  : 0
            }
            overdue={payment.status === 'overdue'}
          />
        </td>
        {visibleColumns.dueDate && (
          <td
            className={cn(
              'px-3 py-2.5 align-top font-mono text-[11px]',
              payment.status === 'overdue'
                ? 'font-semibold text-red-700 dark:text-red-300'
                : 'text-muted-foreground',
            )}
          >
            {toDateLabel(payment.dueDate)}
            {payment.status === 'partial' && payment.agreedRemainingDate && (
              <div className="mt-0.5 text-[10px] font-normal text-amber-700 dark:text-amber-400">
                잔여 {toDateLabel(payment.agreedRemainingDate)}
              </div>
            )}
          </td>
        )}
        {visibleColumns.assignee && <td className="px-3 py-2.5 align-top" />}
        {visibleColumns.partner && (
          <td className="px-3 py-2.5 align-top">
            {payment.distributions.some((d) => d.recipientType === 'partner_broker') && (
              <span className="text-[10px] text-muted-foreground">
                분배:{' '}
                {payment.distributions
                  .map(
                    (d) =>
                      `${d.recipientType === 'our_office' ? '우리' : d.partnerBrokerName ?? '파트너'} ${d.shareRatio}%`,
                  )
                  .join(' · ')}
              </span>
            )}
          </td>
        )}
        {visibleColumns.action && (
          <td className="px-3 py-2.5 align-top">
            <div className="flex flex-wrap gap-1">
              {payment.status !== 'collected' &&
                payment.status !== 'waived' &&
                payment.status !== 'cancelled' && (
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setCollectOpen(true)}
                  >
                    <CircleCheck className="size-3" />
                    수금 처리
                  </Button>
                )}
              {(payment.status === 'collected' || payment.status === 'partial') &&
                payment.taxInvoiceStatus === 'none' && (
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setTaxOpen(true)}
                  >
                    <ReceiptText className="size-3" />
                    계산서
                  </Button>
                )}
              {payment.taxInvoiceStatus !== 'none' && (
                <span className="inline-flex items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground">
                  <ReceiptText className="size-3" />
                  {payment.taxInvoiceNo ?? '발행됨'}
                </span>
              )}
              {payment.status !== 'waived' && payment.status !== 'cancelled' && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px] text-muted-foreground"
                  onClick={() => setAdjustOpen(true)}
                >
                  <CircleSlash className="size-3" />
                  조정
                </Button>
              )}
            </div>
          </td>
        )}
      </tr>

      <CollectDialog
        open={collectOpen}
        onOpenChange={setCollectOpen}
        payment={payment}
      />
      <TaxInvoiceDialog
        open={taxOpen}
        onOpenChange={setTaxOpen}
        payment={payment}
      />
      <AdjustmentRequestDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        payment={payment}
      />
    </>
  );
}

function AdjustmentRequestDialog({
  open,
  onOpenChange,
  payment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: LedgerPayment;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<'discount' | 'waive' | 'bad_debt'>(
    'discount',
  );
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.adjustments.request({
        paymentId: payment.id,
        type,
        amount:
          type === 'discount'
            ? -Math.abs(Number(amount))
            : -payment.expectedAmount,
        reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      onOpenChange(false);
      setAmount('');
      setReason('');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>수수료 조정 요청</DialogTitle>
          <DialogDescription>
            {payment.code ?? '-'} · 예정 {toManwon(payment.expectedAmount)} ·
            승인 후 반영됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>조정 유형</Label>
            <Select
              value={type}
              onValueChange={(v) =>
                setType(v as 'discount' | 'waive' | 'bad_debt')
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discount">할인 합의</SelectItem>
                <SelectItem value="waive">면제</SelectItem>
                <SelectItem value="bad_debt">대손 처리</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === 'discount' && (
            <div className="grid gap-1.5">
              <Label>할인 금액 (만원)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="예) 200"
              />
              <p className="text-[11px] text-muted-foreground">
                음수로 저장됩니다. 최종 청구액 = {toManwon(payment.expectedAmount)} − 입력값.
              </p>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>요청 사유</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예) 고객 요청 협의"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !reason}
          >
            <CirclePlus className="size-3.5" />
            요청 등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// 파이프라인 마일스톤 indicator
// ─────────────────────────────────────────────────────────────

function CollectionProgressBar({
  billed,
  collected,
  overdue,
}: {
  billed: number;
  collected: number;
  overdue: boolean;
}) {
  if (billed <= 0) return null;
  const pct = Math.max(0, Math.min(100, (collected / billed) * 100));
  const isFull = pct >= 100;
  const isEmpty = pct === 0;
  const color = isFull
    ? 'var(--color-emerald-500, #10b981)'
    : overdue
      ? 'var(--color-red-500, #ef4444)'
      : 'var(--color-amber-500, #f59e0b)';

  // 수금 0 + 연체 아님 = "예정" 상태. 촘촘한 대시 패턴 + 수금 예정 텍스트.
  if (isEmpty && !overdue) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-muted-foreground">
        <div
          className="h-[3px] flex-1"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to right, color-mix(in oklch, currentColor 75%, transparent) 0, color-mix(in oklch, currentColor 75%, transparent) 3px, transparent 3px, transparent 5px)',
          }}
        />
        <span className="font-mono text-[10px]">수금 예정</span>
      </div>
    );
  }

  // 100% 완료 = 얇은 초록 실선 + 전액 수금 인라인 (예정 바와 동일 레이아웃)
  if (isFull) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
        <div
          className="h-[3px] flex-1 rounded-sm"
          style={{
            background: 'var(--color-emerald-500, #10b981)',
            opacity: 0.8,
          }}
        />
        <span className="font-mono text-[10px]">전액 수금</span>
      </div>
    );
  }

  // 부분/연체 = 진행 바 + 하단 텍스트
  return (
    <div className="mt-1.5 space-y-1">
      <div
        className="h-1 overflow-hidden rounded-full"
        style={{
          background: 'color-mix(in oklch, currentColor 10%, transparent)',
        }}
      >
        {!isEmpty && (
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${pct}%`, background: color }}
          />
        )}
      </div>
      {collected > 0 && (
        <div
          className={cn(
            'text-[10px] font-mono',
            overdue
              ? 'text-red-700 dark:text-red-300'
              : 'text-amber-700 dark:text-amber-300',
          )}
        >
          수금 {toManwon(collected)} · {Math.round(pct)}%
        </div>
      )}
    </div>
  );
}

function MilestoneIndicator({ idx }: { idx: number }) {
  const safeIdx = Math.max(0, Math.min(commissionPipeline.length - 1, idx));
  const current = commissionPipeline[safeIdx];
  return (
    <div className="min-w-[100px]">
      <div className="flex items-center gap-[3px]">
        {commissionPipeline.map((s, i) => {
          const done = i < safeIdx;
          const active = i === safeIdx;
          return (
            <div key={s.key} className="flex flex-1 items-center gap-[3px]">
              <span
                title={s.label}
                className={cn(
                  'shrink-0 rounded-full border',
                  active ? 'size-3' : 'size-2',
                )}
                style={{
                  background: active
                    ? current.color
                    : done
                      ? 'var(--color-emerald-500, #10b981)'
                      : 'transparent',
                  borderColor: active
                    ? current.color
                    : done
                      ? 'var(--color-emerald-500, #10b981)'
                      : 'color-mix(in oklch, currentColor 20%, transparent)',
                  borderWidth: '1.5px',
                }}
              />
              {i < commissionPipeline.length - 1 && (
                <span
                  className="h-[1.5px] flex-1 rounded-full"
                  style={{
                    background: done
                      ? 'var(--color-emerald-500, #10b981)'
                      : 'color-mix(in oklch, currentColor 15%, transparent)',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 수금 처리 다이얼로그
// ─────────────────────────────────────────────────────────────

function CollectDialog({
  open,
  onOpenChange,
  payment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: LedgerPayment;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(payment.expectedAmount));
  const [method, setMethod] = useState('transfer');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.collect(payment.id, {
        actualAmount: Number(amount),
        method,
        paidAt,
        note: note || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['cashflow'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>수금 처리</DialogTitle>
          <DialogDescription>
            {payment.code ?? '-'} · 예정 {toManwon(payment.expectedAmount)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>수금액 (만원)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              예정액보다 적으면 자동으로 일부수금으로 처리됩니다.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>지급 방식</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">계좌이체</SelectItem>
                <SelectItem value="cash">현금</SelectItem>
                <SelectItem value="card">카드</SelectItem>
                <SelectItem value="other">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>입금일</Label>
            <Input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>메모 (선택)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예) 잔여 4/28 지급약정"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <CirclePlus className="size-3.5" />
            수금 기록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// 세금계산서 발행 다이얼로그
// ─────────────────────────────────────────────────────────────

function TaxInvoiceDialog({
  open,
  onOpenChange,
  payment,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: LedgerPayment;
}) {
  const qc = useQueryClient();
  const [taxInvoiceNo, setTaxInvoiceNo] = useState('');
  const [taxInvoiceDate, setTaxInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const mutation = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.issueTaxInvoice(payment.id, {
        taxInvoiceNo,
        taxInvoiceDate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['cashflow'] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>세금계산서 발행 기록</DialogTitle>
          <DialogDescription>
            {payment.code ?? '-'} · {toManwon(payment.expectedAmount)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>세금계산서 번호</Label>
            <Input
              value={taxInvoiceNo}
              onChange={(e) => setTaxInvoiceNo(e.target.value)}
              placeholder="예) 2026-04-00042"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>발행일</Label>
            <Input
              type="date"
              value={taxInvoiceDate}
              onChange={(e) => setTaxInvoiceDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !taxInvoiceNo}
          >
            <ReceiptText className="size-3.5" />
            발행 기록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 사용하지 않는 아이콘 정리용 export (typecheck 경고 방지)
export const _icons = { CirclePause, CircleSlash };

// ─────────────────────────────────────────────────────────────
// 캘린더 뷰 — 월 그리드에 수금 일정 표시
// ─────────────────────────────────────────────────────────────

type CalendarEvent = {
  paymentId: string;
  dealLocation: string;
  clientSide: string;
  amount: number;
  status: string;
  code: string | null;
  type: 'due' | 'paid' | 'remaining';
  dateKey: string; // YYYY-MM-DD
};

function LedgerCalendar({
  year,
  month,
  groups,
}: {
  year: number;
  month: number;
  groups: LedgerDealGroup[];
}) {
  const events = useMemo<CalendarEvent[]>(() => {
    const out: CalendarEvent[] = [];
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const withinMonth = (d: Date) => d >= startOfMonth && d <= endOfMonth;
    const keyOf = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    for (const g of groups) {
      const loc = [g.deal.siteName, g.deal.dongName, g.deal.unitName]
        .filter(Boolean)
        .join(' ');
      for (const p of g.payments) {
        // 수금 예정일
        if (p.dueDate) {
          const d = new Date(p.dueDate);
          if (withinMonth(d)) {
            out.push({
              paymentId: p.id,
              dealLocation: loc || '매물 미지정',
              clientSide: p.clientSide,
              amount: p.expectedAmount,
              status: p.status,
              code: p.code,
              type: 'due',
              dateKey: keyOf(d),
            });
          }
        }
        // 실제 입금일 (paid)
        if (p.paidAt) {
          const d = new Date(p.paidAt);
          if (withinMonth(d)) {
            out.push({
              paymentId: p.id + ':paid',
              dealLocation: loc || '매물 미지정',
              clientSide: p.clientSide,
              amount: p.actualAmount ?? p.expectedAmount,
              status: 'collected',
              code: p.code,
              type: 'paid',
              dateKey: keyOf(d),
            });
          }
        }
        // 일부수금 잔여 약정일
        if (p.status === 'partial' && p.agreedRemainingDate) {
          const d = new Date(p.agreedRemainingDate);
          if (withinMonth(d)) {
            const remaining =
              p.expectedAmount - (p.actualAmount ?? 0);
            out.push({
              paymentId: p.id + ':remaining',
              dealLocation: loc || '매물 미지정',
              clientSide: p.clientSide,
              amount: remaining,
              status: 'partial',
              code: p.code,
              type: 'remaining',
              dateKey: keyOf(d),
            });
          }
        }
      }
    }
    return out;
  }, [year, month, groups]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const arr = map.get(e.dateKey) ?? [];
      arr.push(e);
      map.set(e.dateKey, arr);
    }
    return map;
  }, [events]);

  // 월 캘린더 셀 생성 (일요일 시작)
  const startOfMonth = new Date(year, month - 1, 1);
  const firstWeekday = startOfMonth.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate();
  const cells: Array<{ date: Date; isCurrentMonth: boolean }> = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({
      date: new Date(year, month - 2, daysInPrevMonth - i),
      isCurrentMonth: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month - 1, d), isCurrentMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const lastDate = cells[cells.length - 1].date;
    cells.push({
      date: new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate() + 1),
      isCurrentMonth: false,
    });
  }

  const todayKey = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-[11px] text-muted-foreground">
        <LegendDot color="bg-emerald-500" label="수금 완료" />
        <LegendDot color="bg-amber-500" label="일부수금/잔여" />
        <LegendDot color="bg-sky-500" label="예정" />
        <LegendDot color="bg-red-500" label="연체" />
        <span className="ml-auto">{year}년 {String(month).padStart(2, '0')}월</span>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b bg-muted/30 text-[11px] font-medium text-muted-foreground">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div
            key={d}
            className={cn(
              'px-2 py-2 text-center',
              i === 0 && 'text-red-600',
              i === 6 && 'text-sky-600',
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 셀 */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const key = `${cell.date.getFullYear()}-${String(cell.date.getMonth() + 1).padStart(2, '0')}-${String(cell.date.getDate()).padStart(2, '0')}`;
          const evs = byDate.get(key) ?? [];
          const isToday = key === todayKey;
          const totalAmount = evs.reduce((s, e) => s + e.amount, 0);
          return (
            <div
              key={idx}
              className={cn(
                'min-h-[110px] border-b border-r p-1.5 last:border-r-0',
                !cell.isCurrentMonth && 'bg-muted/20 text-muted-foreground',
                isToday && 'bg-primary/5',
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    'inline-flex size-5 items-center justify-center rounded-full text-[11px] font-medium',
                    isToday && 'bg-primary text-primary-foreground',
                    !isToday && idx % 7 === 0 && 'text-red-600',
                    !isToday && idx % 7 === 6 && 'text-sky-600',
                  )}
                >
                  {cell.date.getDate()}
                </span>
                {evs.length > 0 && cell.isCurrentMonth && (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {toManwon(totalAmount)}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {evs.slice(0, 3).map((e) => (
                  <CalendarEventPill key={e.paymentId} event={e} />
                ))}
                {evs.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">
                    +{evs.length - 3}건
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full', color)} />
      <span>{label}</span>
    </div>
  );
}

function CalendarEventPill({ event }: { event: CalendarEvent }) {
  // 상태 기반 컬러 결정
  const colorClass = (() => {
    if (event.status === 'overdue') return 'bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200';
    if (event.type === 'paid' || event.status === 'collected')
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
    if (event.type === 'remaining' || event.status === 'partial')
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
    return 'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200';
  })();

  const sideShort = event.clientSide === 'seller' ? '매도' : '매수';
  const typeShort =
    event.type === 'paid' ? '✓' : event.type === 'remaining' ? '잔여' : '';

  return (
    <div
      className={cn(
        'truncate rounded px-1.5 py-0.5 text-[10px]',
        colorClass,
      )}
      title={`${event.code ?? ''} · ${event.dealLocation} · ${sideShort} ${toManwon(event.amount)}`}
    >
      <span className="font-medium">{sideShort} {toManwon(event.amount)}</span>
      {typeShort && <span className="ml-1 opacity-70">{typeShort}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 거래 상세 Sheet
// ─────────────────────────────────────────────────────────────

function LedgerDetailSheet({
  group,
  highlightPaymentId,
  onClose,
}: {
  group: LedgerDealGroup | null;
  highlightPaymentId: string | null;
  onClose: () => void;
}) {
  const open = group !== null;

  useEffect(() => {
    if (!open || !highlightPaymentId) return;
    const id = requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-sheet-payment-id="${highlightPaymentId}"]`,
      );
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [open, highlightPaymentId]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-[520px]"
      >
        {group && (
          <LedgerDetailBody
            group={group}
            highlightPaymentId={highlightPaymentId}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function LedgerDetailBody({
  group,
  highlightPaymentId,
}: {
  group: LedgerDealGroup;
  highlightPaymentId: string | null;
}) {
  const { deal, payments } = group;
  const location = [deal.siteName, deal.dongName, deal.unitName]
    .filter(Boolean)
    .join(' ') || '매물 미지정';

  const milestone = stageMilestone(deal.stage);
  const billed = deal.summary.billed;
  const collected = deal.summary.collected;
  const remaining = Math.max(0, billed - collected);
  const progress = billed > 0 ? Math.min(100, (collected / billed) * 100) : 0;

  const overdueCount = payments.filter((p) => p.status === 'overdue').length;
  const pendingAdjTotal = payments.reduce(
    (acc, p) => acc + p.pendingAdjustments,
    0,
  );

  // 거래 전체 분배 슬라이더 — 드래그 중 preview 로 하위 payment 에 적용
  // draft 는 아직 확정 전이므로 항상 편집 가능
  const isPaymentDistributionEditable = (p: LedgerPayment) =>
    (p.status === 'draft' ||
      p.status === 'pending' ||
      p.status === 'partial' ||
      p.status === 'overdue') &&
    p.distributions.every((d) => d.status !== 'settled');

  // 첫 편집 가능 payment 기준으로 기본 분배율 추출 (없으면 100/0)
  const firstEditable = payments.find(isPaymentDistributionEditable);
  const currentPartnerRatio = firstEditable
    ? Number(
        firstEditable.distributions.find(
          (d) => d.recipientType === 'partner_broker',
        )?.shareRatio ?? 0,
      )
    : 0;

  const [previewPartnerRatio, setPreviewPartnerRatio] = useState<number | null>(
    null,
  );
  const partnerRatio = previewPartnerRatio ?? currentPartnerRatio;
  const ourRatio = 100 - partnerRatio;

  const [confirming, setConfirming] = useState(false);
  const editablePayments = payments.filter(isPaymentDistributionEditable);
  const lockedPayments = payments.filter((p) => !isPaymentDistributionEditable(p));

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="space-y-1 border-b px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {transactionTypeLabel[deal.transactionType] ?? deal.transactionType}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {milestone.label}
          </Badge>
          {deal.partnerBroker && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
              <Handshake className="size-3" />
              공동 · {deal.partnerBroker.name}
            </span>
          )}
        </div>
        <SheetTitle className="text-lg">{location}</SheetTitle>
        <SheetDescription className="text-xs text-muted-foreground">
          단계 변경일 {toDateLabel(deal.stageChangedAt)}
          {deal.balanceDueDate && ` · 잔금일 ${toDateLabel(deal.balanceDueDate)}`}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto">
        {/* 요약 */}
        <div className="border-b px-6 py-5">
          <div className="grid grid-cols-3 gap-3">
            <SummaryStat label="청구 합계" value={toManwon(billed)} />
            <SummaryStat
              label="수금 완료"
              value={toManwon(collected)}
              tone="emerald"
            />
            <SummaryStat
              label="미수금"
              value={toManwon(remaining)}
              tone={remaining > 0 ? 'amber' : 'muted'}
            />
          </div>
          <div className="mt-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>진행률</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          {(overdueCount > 0 || pendingAdjTotal > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  <AlertTriangle className="size-3" />
                  연체 {overdueCount}건
                </span>
              )}
              {pendingAdjTotal > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  <CirclePause className="size-3" />
                  조정 승인대기 {pendingAdjTotal}건
                </span>
              )}
            </div>
          )}
        </div>

        {/* 당사자 / 참여자 */}
        <div className="border-b px-6 py-5">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            거래 당사자
          </h3>
          <dl className="space-y-2 text-sm">
            <InfoRow
              label="매도인"
              value={deal.sellerContactName ?? '—'}
            />
            <InfoRow
              label="매수인"
              value={deal.buyerContactName ?? '—'}
            />
            <InfoRow
              label="거래가"
              value={toManwon(deal.agreedPrice ?? 0)}
            />
            {deal.agreedDeposit != null && deal.agreedDeposit > 0 && (
              <InfoRow
                label="보증금"
                value={toManwon(deal.agreedDeposit)}
              />
            )}
            {deal.agreedMonthlyRent != null && deal.agreedMonthlyRent > 0 && (
              <InfoRow
                label="월세"
                value={toManwon(deal.agreedMonthlyRent)}
              />
            )}
          </dl>

          {deal.participants.length > 0 && (
            <>
              <h3 className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                담당자
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {deal.participants.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[11px]"
                  >
                    <span className="font-medium">{p.userName}</span>
                    <span className="text-muted-foreground">
                      {participantRoleLabel[p.role] ?? p.role}
                    </span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 거래 전체 분배 슬라이더 */}
        {editablePayments.length > 0 && (
          <DealDistributionSlider
            dealId={deal.id}
            partnerBroker={deal.partnerBroker}
            editablePayments={editablePayments}
            lockedCount={lockedPayments.length}
            currentPartnerRatio={currentPartnerRatio}
            previewPartnerRatio={previewPartnerRatio}
            onPreviewChange={setPreviewPartnerRatio}
            confirming={confirming}
            setConfirming={setConfirming}
          />
        )}

        {/* Payment 타임라인 */}
        <div className="px-6 py-5">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            청구 타임라인 · {payments.length}건
          </h3>
          <ol className="space-y-2">
            {payments.map((p) => (
              <DetailPaymentItem
                key={p.id}
                payment={p}
                dealId={deal.id}
                dealPartnerBrokerId={deal.partnerBroker?.id ?? null}
                highlight={p.id === highlightPaymentId}
                previewPartnerRatio={
                  previewPartnerRatio !== null &&
                  isPaymentDistributionEditable(p)
                    ? previewPartnerRatio
                    : null
                }
                locked={!isPaymentDistributionEditable(p)}
              />
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'emerald' | 'amber' | 'muted';
}) {
  const toneClass = {
    default: 'text-foreground',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    muted: 'text-muted-foreground',
  }[tone];
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('text-base font-semibold', toneClass)}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

const participantRoleLabel: Record<string, string> = {
  listing_agent: '매도 담당',
  buying_agent: '매수 담당',
  dual_agent: '양측 담당',
  manager: '매니저',
  assistant: '보조',
  closer: '마감',
};

function DealDistributionSlider({
  dealId,
  partnerBroker,
  editablePayments,
  lockedCount,
  currentPartnerRatio,
  previewPartnerRatio,
  onPreviewChange,
  confirming,
  setConfirming,
}: {
  dealId: string;
  partnerBroker: { id: string; name: string } | null;
  editablePayments: LedgerPayment[];
  lockedCount: number;
  currentPartnerRatio: number;
  previewPartnerRatio: number | null;
  onPreviewChange: (v: number | null) => void;
  confirming: boolean;
  setConfirming: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const partnerRatio = previewPartnerRatio ?? currentPartnerRatio;
  const ourRatio = 100 - partnerRatio;
  const dirty = previewPartnerRatio !== null;

  const [partnerBrokerId, setPartnerBrokerId] = useState<string>(
    partnerBroker?.id ?? '',
  );

  const partnersQuery = useQuery({
    queryKey: ['partner-brokers'],
    queryFn: () => api.partnerBrokers.list(),
    enabled: dirty && partnerRatio > 0,
  });

  const totalExpected = editablePayments.reduce(
    (acc, p) => acc + p.expectedAmount,
    0,
  );
  const partnerAmount = Math.floor((totalExpected * partnerRatio) / 100);
  const ourAmount = totalExpected - partnerAmount;

  const needsPartnerPicker = partnerRatio > 0 && !partnerBrokerId;

  const save = useMutation({
    mutationFn: () => {
      const items = [];
      if (ourRatio > 0) {
        items.push({
          recipientType: 'our_office' as const,
          shareRatio: ourRatio,
        });
      }
      if (partnerRatio > 0) {
        items.push({
          recipientType: 'partner_broker' as const,
          partnerBrokerId,
          shareRatio: partnerRatio,
        });
      }
      if (items.length === 0) {
        items.push({
          recipientType: 'our_office' as const,
          shareRatio: 100,
        });
      }
      return api.finance.commissionPayments.applyDistributionsToDeal(
        dealId,
        items,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['finance', 'cashflow'] });
      onPreviewChange(null);
      setConfirming(false);
    },
  });

  return (
    <div className="border-b bg-muted/10 px-6 py-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          공동중개 분배
        </h3>
        <span className="text-[10px] text-muted-foreground">
          편집 대상 {editablePayments.length}건
          {lockedCount > 0 && ` · 잠김 ${lockedCount}건`}
        </span>
      </div>

      {/* 좌·우 라벨 + 금액 */}
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <div>
          <div className="font-medium">우리 사무소</div>
          <div className="tabular-nums text-muted-foreground">
            {ourRatio}% · {toManwon(ourAmount)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-medium text-violet-700 dark:text-violet-300">
            {partnerBroker?.name ?? '파트너 중개'}
          </div>
          <div className="tabular-nums text-muted-foreground">
            {partnerRatio}% · {toManwon(partnerAmount)}
          </div>
        </div>
      </div>

      {/* 슬라이더 */}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={partnerRatio}
        onChange={(e) => onPreviewChange(Number(e.target.value))}
        className="w-full"
      />

      {/* 숫자 입력 */}
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <Label className="text-muted-foreground">파트너 %</Label>
        <Input
          type="number"
          min={0}
          max={100}
          step={1}
          value={partnerRatio}
          onChange={(e) =>
            onPreviewChange(
              Math.max(0, Math.min(100, Number(e.target.value) || 0)),
            )
          }
          className="h-7 w-20"
        />
        {dirty && (
          <button
            type="button"
            onClick={() => onPreviewChange(null)}
            className="ml-auto text-[11px] text-muted-foreground hover:underline"
          >
            원래대로
          </button>
        )}
      </div>

      {/* 파트너 선택 — 변경이 파트너 비율을 양수로 만들면 활성 */}
      {dirty && partnerRatio > 0 && (
        <div className="mt-2 space-y-1.5">
          <Label className="text-[11px]">파트너 중개사</Label>
          <Select
            value={partnerBrokerId || undefined}
            onValueChange={setPartnerBrokerId}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="파트너 선택" />
            </SelectTrigger>
            <SelectContent>
              {partnersQuery.data?.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                  {b.phone ? ` · ${b.phone}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {needsPartnerPicker && (
            <p className="text-[11px] text-destructive">
              파트너 비율이 0%를 초과하면 파트너를 선택해야 합니다.
            </p>
          )}
        </div>
      )}

      {save.error && (
        <div className="mt-2 rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
          {(save.error as Error).message}
        </div>
      )}

      {/* 저장 */}
      {dirty && (
        <div className="mt-3 flex items-center justify-end gap-2">
          {!confirming ? (
            <Button
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={needsPartnerPicker || save.isPending}
            >
              이 거래 전체 저장
            </Button>
          ) : (
            <div className="flex w-full items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-2">
              <span className="text-[11px]">
                편집 가능한 {editablePayments.length}건에{' '}
                <strong className="font-semibold">
                  우리 {ourRatio}% / 파트너 {partnerRatio}%
                </strong>
                를 적용할까요?
              </span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                  disabled={save.isPending}
                >
                  취소
                </Button>
                <Button
                  size="sm"
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                >
                  {save.isPending ? '저장 중…' : '적용'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailPaymentItem({
  payment,
  dealId,
  dealPartnerBrokerId,
  highlight,
  previewPartnerRatio,
  locked,
}: {
  payment: LedgerPayment;
  dealId: string;
  dealPartnerBrokerId: string | null;
  highlight: boolean;
  previewPartnerRatio: number | null;
  locked: boolean;
}) {
  const meta = paymentStatusMeta[payment.status] ?? paymentStatusMeta.pending;
  const sideLabel = payment.clientSide === 'seller' ? '매도측' : '매수측';
  const remaining =
    payment.actualAmount != null && payment.status === 'partial'
      ? payment.expectedAmount - payment.actualAmount
      : null;

  const [editOpen, setEditOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const qc = useQueryClient();
  const confirmDraft = useMutation({
    mutationFn: () => api.finance.commissionPayments.confirmDraft(payment.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['finance', 'cashflow'] });
    },
  });

  const isDraft = payment.status === 'draft';
  const collectable =
    !isDraft &&
    payment.status !== 'collected' &&
    payment.status !== 'waived' &&
    payment.status !== 'cancelled';
  const taxInvoiceIssuable =
    (payment.status === 'collected' || payment.status === 'partial') &&
    payment.taxInvoiceStatus === 'none';
  const adjustable =
    !isDraft &&
    payment.status !== 'waived' &&
    payment.status !== 'cancelled';

  const distributionEditable =
    payment.status === 'pending' ||
    payment.status === 'partial' ||
    payment.status === 'overdue';

  return (
    <li
      data-sheet-payment-id={payment.id}
      className={cn(
        'rounded-lg border p-3 transition-colors',
        highlight
          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
          : 'bg-muted/10',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                meta.pillClass,
              )}
            >
              {meta.label}
            </span>
            <Badge
              variant="outline"
              className={cn(
                'border-0 text-[10px]',
                payment.clientSide === 'seller'
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
              )}
            >
              {sideLabel}
            </Badge>
            {payment.code && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {payment.code}
              </span>
            )}
          </div>
          {payment.note && (
            <div className="text-[11px] text-muted-foreground">
              {payment.note}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold">
            {toManwon(payment.expectedAmount)}
          </div>
          {payment.dueDate && (
            <div className="text-[10px] text-muted-foreground">
              {toDateLabel(payment.dueDate)}
            </div>
          )}
        </div>
      </div>

      {(payment.status === 'collected' ||
        payment.status === 'partial' ||
        remaining != null) && (
        <div className="mt-2 space-y-0.5 text-[11px]">
          {payment.status === 'collected' && (
            <div className="text-emerald-700 dark:text-emerald-300">
              전액 수금 · {toDateLabel(payment.paidAt)}
            </div>
          )}
          {payment.status === 'partial' && payment.actualAmount != null && (
            <div>
              수금 {toManwon(payment.actualAmount)} /{' '}
              {toManwon(payment.expectedAmount)}
              {remaining !== null && ` · 잔여 ${toManwon(remaining)}`}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
        {previewPartnerRatio !== null ? (
          // preview 모드: 슬라이더 값으로 재계산
          (() => {
            const ourR = 100 - previewPartnerRatio;
            const partnerR = previewPartnerRatio;
            const partnerName =
              payment.distributions.find(
                (d) => d.recipientType === 'partner_broker',
              )?.partnerBrokerName ?? '파트너';
            const partnerShare = Math.floor(
              (payment.expectedAmount * partnerR) / 100,
            );
            const ourShare = payment.expectedAmount - partnerShare;
            return (
              <>
                {ourR > 0 && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                    우리 {ourR}% · {toManwon(ourShare)}
                  </span>
                )}
                {partnerR > 0 && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                    {partnerName} {partnerR}% · {toManwon(partnerShare)}
                  </span>
                )}
                <span className="text-[10px] font-medium text-primary">
                  미리보기
                </span>
              </>
            );
          })()
        ) : (
          <>
            {payment.distributions.map((d) => (
              <span key={d.id} className="rounded bg-muted px-1.5 py-0.5">
                {d.recipientType === 'our_office'
                  ? '우리'
                  : (d.partnerBrokerName ?? '파트너')}{' '}
                {Number(d.shareRatio)}% · {toManwon(d.shareAmount)}
              </span>
            ))}
            {locked && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                🔒 잠김
              </span>
            )}
          </>
        )}
        {distributionEditable && !locked && previewPartnerRatio === null && (
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto h-6 px-2 text-[10px]"
            onClick={() => setEditOpen(true)}
          >
            개별 수정
          </Button>
        )}
      </div>

      {payment.taxInvoiceStatus !== 'none' && (
        <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <ReceiptText className="size-3" />
          세금계산서 {payment.taxInvoiceNo ?? '발행됨'}
        </div>
      )}

      {payment.pendingAdjustments > 0 && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <CirclePause className="size-3" />
          조정 승인대기 {payment.pendingAdjustments}건
        </div>
      )}

      {isDraft && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-[11px]">
          <span className="text-muted-foreground">
            초안 — 계약 체결 전 시뮬레이션
          </span>
          <Button
            size="xs"
            className="h-7 px-2 text-[11px]"
            onClick={() => confirmDraft.mutate()}
            disabled={confirmDraft.isPending}
          >
            {confirmDraft.isPending ? '확정 중…' : '청구 확정'}
          </Button>
        </div>
      )}

      {(collectable || taxInvoiceIssuable || adjustable) && (
        <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
          {collectable && (
            <Button
              size="xs"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => setCollectOpen(true)}
            >
              <CircleCheck className="size-3" />
              수금 처리
            </Button>
          )}
          {taxInvoiceIssuable && (
            <Button
              size="xs"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => setTaxOpen(true)}
            >
              <ReceiptText className="size-3" />
              계산서
            </Button>
          )}
          {adjustable && (
            <Button
              size="xs"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={() => setAdjustOpen(true)}
            >
              <CircleSlash className="size-3" />
              조정 요청
            </Button>
          )}
        </div>
      )}

      <CollectDialog
        open={collectOpen}
        onOpenChange={setCollectOpen}
        payment={payment}
      />
      <TaxInvoiceDialog
        open={taxOpen}
        onOpenChange={setTaxOpen}
        payment={payment}
      />
      <AdjustmentRequestDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        payment={payment}
      />
      <DistributionEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        payment={payment}
        dealId={dealId}
        defaultPartnerBrokerId={dealPartnerBrokerId}
      />
    </li>
  );
}

// ─────────────────────────────────────────────────────────────
// 수수료 분배 편집 다이얼로그
// ─────────────────────────────────────────────────────────────

function DistributionEditDialog({
  open,
  onOpenChange,
  payment,
  dealId,
  defaultPartnerBrokerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: LedgerPayment;
  dealId: string;
  defaultPartnerBrokerId: string | null;
}) {
  const qc = useQueryClient();

  const currentPartner = payment.distributions.find(
    (d) => d.recipientType === 'partner_broker',
  );
  const initialPartnerRatio = currentPartner
    ? Number(currentPartner.shareRatio)
    : 0;
  const initialPartnerId =
    currentPartner?.partnerBrokerId ?? defaultPartnerBrokerId ?? '';

  const [partnerRatio, setPartnerRatio] = useState(initialPartnerRatio);
  const [partnerBrokerId, setPartnerBrokerId] = useState(initialPartnerId);
  const [applyToDeal, setApplyToDeal] = useState(false);

  useEffect(() => {
    if (open) {
      setPartnerRatio(initialPartnerRatio);
      setPartnerBrokerId(initialPartnerId);
      setApplyToDeal(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment.id]);

  const partnersQuery = useQuery({
    queryKey: ['partner-brokers'],
    queryFn: () => api.partnerBrokers.list(),
    enabled: open,
  });

  const ourRatio = Math.max(0, Math.min(100, 100 - partnerRatio));
  const ourShare = Math.floor((payment.expectedAmount * ourRatio) / 100);
  const partnerShare = payment.expectedAmount - ourShare;

  const hasPartner = partnerRatio > 0;
  const needsPartnerPicker = hasPartner && !partnerBrokerId;
  const isValid = !needsPartnerPicker;

  const buildItems = () => {
    const items: Array<{
      recipientType: 'our_office' | 'partner_broker';
      partnerBrokerId?: string;
      shareRatio: number;
    }> = [];
    if (ourRatio > 0) {
      items.push({ recipientType: 'our_office', shareRatio: ourRatio });
    }
    if (partnerRatio > 0) {
      items.push({
        recipientType: 'partner_broker',
        partnerBrokerId,
        shareRatio: partnerRatio,
      });
    }
    // 100/0 인 경우 우리만 남도록 보정
    if (items.length === 0) {
      items.push({ recipientType: 'our_office', shareRatio: 100 });
    }
    return items;
  };

  const saveSingle = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.replaceDistributions(
        payment.id,
        buildItems(),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['finance', 'cashflow'] });
      onOpenChange(false);
    },
  });

  const saveBulk = useMutation({
    mutationFn: () =>
      api.finance.commissionPayments.applyDistributionsToDeal(
        dealId,
        buildItems(),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      qc.invalidateQueries({ queryKey: ['finance', 'cashflow'] });
      onOpenChange(false);
    },
  });

  const pending = saveSingle.isPending || saveBulk.isPending;
  const error = saveSingle.error ?? saveBulk.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>수수료 분배 수정</DialogTitle>
          <DialogDescription>
            청구 {payment.code ?? ''} · 예상 {toManwon(payment.expectedAmount)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 슬라이더: 우리 / 파트너 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">우리 사무소</span>
              <span className="tabular-nums">
                {ourRatio}% · {toManwon(ourShare)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={partnerRatio}
              onChange={(e) => setPartnerRatio(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-violet-700 dark:text-violet-300">
                파트너 중개
              </span>
              <span className="tabular-nums">
                {partnerRatio}% · {toManwon(partnerShare)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">
                파트너 %
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={partnerRatio}
                onChange={(e) =>
                  setPartnerRatio(
                    Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  )
                }
                className="h-8 w-20"
              />
            </div>
          </div>

          {/* 파트너 브로커 선택 */}
          {hasPartner && (
            <div className="space-y-1.5">
              <Label className="text-xs">파트너 중개사</Label>
              <Select
                value={partnerBrokerId || undefined}
                onValueChange={setPartnerBrokerId}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="파트너 선택" />
                </SelectTrigger>
                <SelectContent>
                  {partnersQuery.data?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                      {b.phone ? ` · ${b.phone}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {needsPartnerPicker && (
                <p className="text-[11px] text-destructive">
                  파트너 비율이 0%를 초과하면 파트너를 선택해야 합니다.
                </p>
              )}
            </div>
          )}

          {/* 거래 전체 적용 */}
          <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-2.5 text-xs">
            <input
              type="checkbox"
              checked={applyToDeal}
              onChange={(e) => setApplyToDeal(e.target.checked)}
              className="mt-0.5 size-3.5 cursor-pointer rounded border-muted-foreground/30"
            />
            <div className="flex-1 space-y-0.5">
              <div className="font-medium">이 거래의 모든 청구에 적용</div>
              <div className="text-[11px] text-muted-foreground">
                이미 수금/면제 처리되었거나 정산된 분배가 있는 청구는 건너뜁니다.
              </div>
            </div>
          </label>

          {error && (
            <div className="rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
              {(error as Error).message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            취소
          </Button>
          <Button
            onClick={() => (applyToDeal ? saveBulk.mutate() : saveSingle.mutate())}
            disabled={!isValid || pending}
          >
            {pending ? '저장 중…' : applyToDeal ? '거래 전체 저장' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
