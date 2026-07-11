import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheckBig,
  Clock,
  FileText,
  Inbox as InboxIcon,
  MessageCircle,
  Pencil,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  InboxItem,
  DraftDecisionMode,
  DraftPriority,
  Proposal,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  EmptyState,
  FilterBar,
  FilterCount,
  FilterSearch,
  FilterSelect,
  PageHeader,
} from '@/components/domain';
import { formatDate, formatDateTime, formatDday, formatMoney } from '@/lib/format';
import { ContractDocumentPreview } from './-renderers/contract-document';
import { ChangesView, hasEditableFields } from './-renderers/changes-summary';
import { ContextChips, ResultEntityLink } from './-context-chips';
import { ProposalCard, proposalTypeLabel } from './-proposal-card';
import { RejectNoteDialog } from './-reject-dialog';
import { getErrorMessage, startUndoableAction } from './-undoable';

export const Route = createFileRoute('/_authenticated/inbox/')({
  component: InboxPage,
});

type Tab = 'pending' | 'processing' | 'approved' | 'resolved';

/** 규칙 제안(Proposal)의 종결 상태 — resolved 탭에 합쳐 표시 */
const RESOLVED_PROPOSAL_STATUSES = new Set([
  'executed',
  'failed',
  'rejected',
  'expired',
  'auto_resolved',
]);

const PRIORITY_RANK: Record<string, number> = { urgent: 0, normal: 1, low: 2 };

type QueueEntry =
  | { kind: 'draft'; draft: InboxItem }
  | { kind: 'proposal'; proposal: Proposal };

function entryPriority(e: QueueEntry): string {
  return e.kind === 'draft' ? e.draft.priority : e.proposal.priority;
}

function entryCreatedAt(e: QueueEntry): number {
  return new Date(
    e.kind === 'draft' ? e.draft.createdAt : e.proposal.proposedAt,
  ).getTime();
}

const priorityStyle: Record<
  DraftPriority,
  { dotClass: string; labelClass: string }
> = {
  urgent: {
    dotClass: 'bg-red-500',
    labelClass: 'text-red-700 dark:text-red-300',
  },
  normal: {
    dotClass: 'bg-sky-500',
    labelClass: 'text-sky-700 dark:text-sky-300',
  },
  low: {
    dotClass: 'bg-zinc-400',
    labelClass: 'text-zinc-600 dark:text-zinc-400',
  },
};

const decisionModeStyle: Record<
  DraftDecisionMode,
  { icon: React.ReactNode; tone: string }
> = {
  confirm: {
    icon: <CircleCheckBig className="size-4" />,
    tone: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  approval: {
    icon: <Check className="size-4" />,
    tone: 'bg-primary hover:bg-primary/90',
  },
};

function useRelative() {
  const { t } = useTranslation('inbox');
  return (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return t('relative.justNow');
    if (min < 60) return t('relative.minutesAgo', { count: min });
    const hr = Math.floor(min / 60);
    if (hr < 24) return t('relative.hoursAgo', { count: hr });
    const day = Math.floor(hr / 24);
    return t('relative.daysAgo', { count: day });
  };
}

function useCategoryLabel() {
  const { t } = useTranslation('inbox');
  return (category: string): string => {
    const key = `categories.${category}`;
    const translated = t(key);
    return translated === key ? category : translated;
  };
}

function InboxPage() {
  const { t } = useTranslation('inbox');
  const categoryLabel = useCategoryLabel();
  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ── 탭별 draft 큐 (탭 카운트 겸용 — 같은 queryKey 라 활성 탭 목록과 공유) ──
  const processingQuery = useQuery({
    queryKey: ['inbox', 'processing'],
    queryFn: () => api.inbox.list({ scope: 'processing', limit: 200 }),
    // AI 재작성 완료(→ pending 복귀)를 감지하기 위한 폴링
    refetchInterval: (query) =>
      (query.state.data?.length ?? 0) > 0 ? 20_000 : false,
  });
  const processingActive = (processingQuery.data?.length ?? 0) > 0;

  const pendingQuery = useQuery({
    queryKey: ['inbox', 'pending'],
    queryFn: () => api.inbox.list({ scope: 'pending', limit: 200 }),
    refetchInterval: processingActive ? 20_000 : false,
  });
  const approvedQuery = useQuery({
    queryKey: ['inbox', 'approved'],
    queryFn: () => api.inbox.list({ scope: 'approved', limit: 200 }),
  });
  const resolvedQuery = useQuery({
    queryKey: ['inbox', 'resolved'],
    queryFn: () => api.inbox.list({ scope: 'resolved', limit: 200 }),
  });

  // 보류(snooze) 중인 draft — pending scope 에서는 서버가 제외하므로 all 로 조회
  const snoozedQuery = useQuery({
    queryKey: ['inbox', 'snoozed'],
    queryFn: () => api.inbox.list({ scope: 'all', limit: 200 }),
    enabled: tab === 'pending',
    select: (rows) =>
      rows.filter(
        (r) =>
          r.status === 'pending' &&
          r.snoozedUntil &&
          new Date(r.snoozedUntil).getTime() > Date.now(),
      ),
  });

  // ── 규칙 엔진 제안 (Proposal) — 같은 업무함 큐에 합쳐 표시 ──
  const proposalsQuery = useQuery({
    queryKey: ['proposals'],
    queryFn: () => api.proposals.list(),
  });

  // ── 직원 이름 해석 (코멘트 작성자 / 결정자 표시용) ──
  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const nameOf = useCallback(
    (id: string | null): string | null => {
      if (!id) return null;
      return employeesQuery.data?.find((e) => e.id === id)?.name ?? null;
    },
    [employeesQuery.data],
  );

  const draftQueryByTab = {
    pending: pendingQuery,
    processing: processingQuery,
    approved: approvedQuery,
    resolved: resolvedQuery,
  } as const;
  const activeDraftsQuery = draftQueryByTab[tab];

  const proposalsByTab = useMemo(() => {
    const all = proposalsQuery.data ?? [];
    return {
      pending: all.filter((p) => p.status === 'pending'),
      processing: [] as Proposal[],
      approved: all.filter((p) => p.status === 'approved'),
      resolved: all.filter((p) => RESOLVED_PROPOSAL_STATUSES.has(p.status)),
    };
  }, [proposalsQuery.data]);

  // 현재 탭의 병합 큐 (긴급 우선 → 최신순)
  const entries = useMemo<QueueEntry[]>(() => {
    const merged: QueueEntry[] = [
      ...(activeDraftsQuery.data ?? []).map(
        (draft): QueueEntry => ({ kind: 'draft', draft }),
      ),
      ...proposalsByTab[tab].map(
        (proposal): QueueEntry => ({ kind: 'proposal', proposal }),
      ),
    ];
    merged.sort((a, b) => {
      const pa = PRIORITY_RANK[entryPriority(a)] ?? 9;
      const pb = PRIORITY_RANK[entryPriority(b)] ?? 9;
      if (pa !== pb) return pa - pb;
      return entryCreatedAt(b) - entryCreatedAt(a);
    });
    return merged;
  }, [activeDraftsQuery.data, proposalsByTab, tab]);

  // ── 필터 적용 ──
  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return entries.filter((e) => {
      const priority = entryPriority(e);
      if (priorityFilter && priority !== priorityFilter) return false;
      const category = e.kind === 'draft' ? e.draft.category : e.proposal.type;
      if (categoryFilter && category !== categoryFilter) return false;
      if (tab === 'resolved' && statusFilter) {
        const status = e.kind === 'draft' ? e.draft.status : e.proposal.status;
        if (status !== statusFilter) return false;
      }
      if (text) {
        const haystack =
          e.kind === 'draft'
            ? `${e.draft.title}\n${e.draft.summary}`
            : `${e.proposal.title}\n${e.proposal.description}`;
        if (!haystack.toLowerCase().includes(text)) return false;
      }
      return true;
    });
  }, [entries, search, priorityFilter, categoryFilter, statusFilter, tab]);

  // 카테고리 옵션 — 로드된 모든 draft 카테고리 + 제안 type 의 합집합
  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of [pendingQuery, processingQuery, approvedQuery, resolvedQuery]) {
      for (const d of q.data ?? []) map.set(d.category, categoryLabel(d.category));
    }
    for (const p of proposalsQuery.data ?? []) {
      map.set(p.type, proposalTypeLabel(p.type));
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  }, [
    pendingQuery.data,
    processingQuery.data,
    approvedQuery.data,
    resolvedQuery.data,
    proposalsQuery.data,
    categoryLabel,
  ]);

  const tabCounts = {
    pending: (pendingQuery.data?.length ?? 0) + proposalsByTab.pending.length,
    processing: processingQuery.data?.length ?? 0,
    approved: (approvedQuery.data?.length ?? 0) + proposalsByTab.approved.length,
    resolved: (resolvedQuery.data?.length ?? 0) + proposalsByTab.resolved.length,
  };

  const isLoading =
    (activeDraftsQuery.isLoading && !activeDraftsQuery.data) ||
    (proposalsQuery.isLoading && !proposalsQuery.data);

  return (
    <div className="space-y-4">
      <PageHeader
        title="업무함"
        description="AI 직원과 규칙 엔진이 올린 작업을 검토하고 승인합니다."
        className="mb-0"
      />

      {/* 탭 */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {(['pending', 'processing', 'approved', 'resolved'] as const).map(
          (key) => (
            <TabButton
              key={key}
              active={tab === key}
              onClick={() => {
                setTab(key);
                setStatusFilter('');
              }}
            >
              {t(`tabs.${key}`)}
              {tabCounts[key] > 0 && (
                <span className="ml-1.5 text-[11px] opacity-80">
                  {tabCounts[key]}
                </span>
              )}
            </TabButton>
          ),
        )}
      </div>

      {/* 필터 */}
      <FilterBar>
        <FilterSearch
          value={search}
          onChange={setSearch}
          placeholder="제목·요약 검색"
        />
        <FilterSelect
          label="우선순위"
          value={priorityFilter}
          onChange={setPriorityFilter}
          options={[
            { value: 'urgent', label: '긴급' },
            { value: 'normal', label: '일반' },
            { value: 'low', label: '참고' },
          ]}
        />
        <FilterSelect
          label="카테고리"
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={categoryOptions}
        />
        {tab === 'resolved' && (
          <FilterSelect
            label="상태"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'executed', label: '실행완료' },
              { value: 'failed', label: '실패' },
              { value: 'rejected', label: '거부' },
              { value: 'expired', label: '만료' },
              { value: 'auto_resolved', label: '자동해결' },
            ]}
          />
        )}
        <FilterCount n={filtered.length} />
      </FilterBar>

      {/* 규칙 제안 로드 실패 — draft 목록은 유지하고 배너로 안내 */}
      {proposalsQuery.isError && (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-[12px] text-warning">
          <AlertTriangle className="size-3.5 shrink-0" />
          규칙 제안을 불러오지 못했습니다: {getErrorMessage(proposalsQuery.error)}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-6 px-2 text-[11px]"
            onClick={() => void proposalsQuery.refetch()}
          >
            다시 시도
          </Button>
        </div>
      )}

      {/* 목록 */}
      {activeDraftsQuery.isError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-16 text-center">
          <AlertTriangle className="mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">업무함을 불러오지 못했습니다</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {getErrorMessage(activeDraftsQuery.error)}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4 gap-1"
            onClick={() => {
              void activeDraftsQuery.refetch();
              void proposalsQuery.refetch();
            }}
          >
            <RotateCcw className="size-3.5" />
            다시 시도
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title={t(`empty.${tab}`)}
          description={
            entries.length > 0 ? '필터 조건에 맞는 항목이 없습니다.' : undefined
          }
          className="rounded-xl border border-dashed bg-muted/20 p-16"
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((entry) =>
            entry.kind === 'draft' ? (
              <li key={`d-${entry.draft.id}`}>
                <InboxCard item={entry.draft} tab={tab} nameOf={nameOf} />
              </li>
            ) : (
              <li key={`p-${entry.proposal.id}`}>
                <ProposalCard
                  proposal={entry.proposal}
                  showQuickActions={tab === 'pending'}
                  nameOf={nameOf}
                />
              </li>
            ),
          )}
        </ul>
      )}

      {/* 보류 중 섹션 — 처리 대기 탭에서만 */}
      {tab === 'pending' && (snoozedQuery.data?.length ?? 0) > 0 && (
        <SnoozedSection items={snoozedQuery.data ?? []} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// 보류 (snooze)

function snoozeUntil(option: 'tomorrow' | 'in3days' | 'nextWeek'): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  if (option === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (option === 'in3days') d.setDate(d.getDate() + 3);
  else {
    // 다음 주 월요일
    const day = d.getDay();
    d.setDate(d.getDate() + ((8 - day) % 7 || 7));
  }
  return d;
}

function SnoozeMenu({ itemId }: { itemId: string }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (until: Date) => api.inbox.snooze(itemId, until.toISOString()),
    onSuccess: (_data, until) => {
      toast.success(`보류했습니다 — ${formatDate(until)} 이후 다시 표시됩니다`);
      void qc.invalidateQueries({ queryKey: ['inbox'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1 text-muted-foreground"
          disabled={mutation.isPending}
        >
          <Clock className="size-4" />
          보류
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => mutation.mutate(snoozeUntil('tomorrow'))}>
          내일 오전 9시
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => mutation.mutate(snoozeUntil('in3days'))}>
          3일 후
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => mutation.mutate(snoozeUntil('nextWeek'))}>
          다음 주 월요일
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SnoozedSection({ items }: { items: InboxItem[] }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const categoryLabel = useCategoryLabel();
  const unsnoozeMutation = useMutation({
    mutationFn: (id: string) => api.inbox.unsnooze(id),
    onSuccess: () => {
      toast.success('보류를 해제했습니다 — 처리 대기로 돌아갑니다');
      void qc.invalidateQueries({ queryKey: ['inbox'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="rounded-xl border border-dashed bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
        <Clock className="size-4" />
        보류 중 {items.length}건
      </button>
      {open && (
        <ul className="divide-y border-t">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 px-4 py-2.5 text-[13px]"
            >
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {categoryLabel(item.category)}
              </Badge>
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {item.snoozedUntil
                  ? `${formatDate(item.snoozedUntil)}까지 보류`
                  : ''}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 px-2 text-[11px]"
                disabled={unsnoozeMutation.isPending}
                onClick={() => unsnoozeMutation.mutate(item.id)}
              >
                보류 해제
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

type BulkItem = {
  enabled?: boolean;
  displayLabel?: string;
  subtitle?: string;
  warning?: string;
  [key: string]: unknown;
};

function isBulkOperation(op: string): boolean {
  return op.endsWith('_bulk');
}

const TERMINAL_STATUSES = new Set(['executed', 'failed', 'rejected', 'expired']);

/** pending draft 의 만료 임박(72시간 이내) 표시 칩 */
function ExpiryChip({ item }: { item: InboxItem }) {
  if (item.status !== 'pending' || !item.expiresAt) return null;
  const remaining = new Date(item.expiresAt).getTime() - Date.now();
  if (remaining > 72 * 3_600_000) return null;
  const overdue = remaining < 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] tabular-nums',
        overdue
          ? 'bg-neutral-soft text-muted-foreground'
          : 'bg-warning-soft text-warning',
      )}
    >
      <Clock className="size-2.5" />
      {overdue ? '만료 처리 예정' : `만료 ${formatDday(item.expiresAt)}`}
    </span>
  );
}

function InboxCard({
  item,
  tab,
  nameOf,
}: {
  item: InboxItem;
  tab: Tab;
  nameOf: (id: string | null) => string | null;
}) {
  const { t } = useTranslation('inbox');
  const relative = useRelative();
  const categoryLabel = useCategoryLabel();
  const [detailOpen, setDetailOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const style = priorityStyle[item.priority];
  const decisionUI = decisionModeStyle[item.decisionMode];
  const priorityLabel = t(`priorities.${item.priority}`);
  const decisionPrimaryLabel =
    item.decisionMode === 'confirm'
      ? t('decisionMode.confirmAction')
      : t('decisionMode.approveAction');
  const isPending = tab === 'pending';
  const isResolved = tab === 'resolved';
  const isBulk = isBulkOperation(item.operation);
  const decidedByName = nameOf(item.decidedById);

  const qc = useQueryClient();

  // 결정 후 낙관적 제거 + 실행 취소 토스트 (commit 은 토스트 종료 시점)
  const quickDecide = () => {
    const prev = qc.getQueryData<InboxItem[]>(['inbox', 'pending']);
    startUndoableAction({
      message:
        item.decisionMode === 'confirm'
          ? '확인 처리했습니다'
          : '승인했습니다 — 곧 실행됩니다',
      applyOptimistic: () =>
        qc.setQueryData<InboxItem[]>(['inbox', 'pending'], (rows) =>
          rows?.filter((r) => r.id !== item.id),
        ),
      commit: () => api.inbox.decide(item.id),
      rollback: () => {
        if (prev) qc.setQueryData(['inbox', 'pending'], prev);
        else void qc.invalidateQueries({ queryKey: ['inbox'] });
      },
      onSuccess: () => void qc.invalidateQueries({ queryKey: ['inbox'] }),
      onError: (error) => {
        toast.error(getErrorMessage(error));
        void qc.invalidateQueries({ queryKey: ['inbox'] });
      },
    });
  };

  const quickReject = (note: string) => {
    const prev = qc.getQueryData<InboxItem[]>(['inbox', 'pending']);
    startUndoableAction({
      message: '거부했습니다',
      applyOptimistic: () =>
        qc.setQueryData<InboxItem[]>(['inbox', 'pending'], (rows) =>
          rows?.filter((r) => r.id !== item.id),
        ),
      commit: () => api.inbox.reject(item.id, note),
      rollback: () => {
        if (prev) qc.setQueryData(['inbox', 'pending'], prev);
        else void qc.invalidateQueries({ queryKey: ['inbox'] });
      },
      onSuccess: () => void qc.invalidateQueries({ queryKey: ['inbox'] }),
      onError: (error) => {
        toast.error(getErrorMessage(error));
        void qc.invalidateQueries({ queryKey: ['inbox'] });
      },
    });
  };

  const statusBadge =
    item.status === 'executed'
      ? {
          label: t('statusBadges.executed'),
          tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        }
      : item.status === 'rejected'
        ? {
            label: t('statusBadges.rejected'),
            tone: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400',
          }
        : item.status === 'failed'
          ? {
              label: t('statusBadges.failed'),
              tone: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
            }
          : item.status === 'expired'
            ? {
                label: t('statusBadges.expired'),
                tone: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900',
              }
            : item.status === 'processing'
              ? {
                  label: t('statusBadges.processing'),
                  tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
                }
              : item.status === 'approved'
                ? {
                    label:
                      item.executor === 'agent'
                        ? t('statusBadges.approvedAgent')
                        : t('statusBadges.approvedDefault'),
                    tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
                  }
                : item.status === 'executing'
                  ? {
                      label: t('statusBadges.executing'),
                      tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
                    }
                  : null;

  const showQuickActions =
    isPending &&
    item.status === 'pending' &&
    item.decisionMode === 'approval' &&
    !isBulk;
  const showSnooze = isPending && item.status === 'pending';

  return (
    <>
      <div
        className={cn(
          'group overflow-hidden rounded-xl border bg-card transition-colors',
          item.priority === 'urgent' && !isResolved && 'border-red-200 dark:border-red-900/60',
        )}
      >
        <div className="flex items-start">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="flex flex-1 items-start gap-3 p-4 text-left transition-colors hover:bg-muted/30"
          >
            {/* priority dot */}
            <div className="pt-1">
              <span
                className={cn('inline-block size-2 rounded-full', style.dotClass)}
                title={priorityLabel}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('text-[10px] font-semibold uppercase tracking-wider', style.labelClass)}>
                  {priorityLabel}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {categoryLabel(item.category)}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px]',
                    item.decisionMode === 'confirm'
                      ? 'border-emerald-300 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                      : 'border-primary/40 text-primary',
                  )}
                >
                  {item.decisionMode === 'confirm'
                    ? t('decisionMode.confirm')
                    : t('decisionMode.approval')}
                </Badge>
                {item.executor === 'agent' && (
                  <Badge variant="outline" className="text-[10px]">
                    <Sparkles className="mr-0.5 size-2.5" />
                    {t('badges.agentPending')}
                  </Badge>
                )}
                {statusBadge && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px]',
                      statusBadge.tone,
                    )}
                  >
                    {statusBadge.label}
                  </span>
                )}
                <ExpiryChip item={item} />
              </div>
              <h3 className="mt-1 text-[15px] font-semibold leading-snug">
                {item.title}
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {item.summary}
              </p>

              {/* 카테고리별 인라인 요약 미리보기 */}
              <CardSummaryLine item={item} />

              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <span>{relative(item.createdAt)}</span>
                <span className="opacity-60">·</span>
                <span className="font-mono opacity-80">{item.generatedBy}</span>
                {item.comments.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="size-3" />
                    {item.comments.length}
                  </span>
                )}
                {isResolved && item.decidedAt && (
                  <span>
                    {decidedByName ? `${decidedByName} · ` : ''}
                    {formatDateTime(item.decidedAt)} 결정
                  </span>
                )}
                {isResolved && item.decisionNote && (
                  <span className="max-w-64 truncate">
                    사유: {item.decisionNote}
                  </span>
                )}
              </div>
            </div>
          </button>

          {/* 접힘 상태 퀵 액션 */}
          {(showQuickActions || showSnooze) && (
            <div
              className="flex shrink-0 items-center gap-1.5 py-4 pr-4"
              onClick={(e) => e.stopPropagation()}
            >
              {showQuickActions && (
                <>
                  <Button
                    size="sm"
                    className={cn('gap-1', decisionUI.tone)}
                    onClick={(e) => {
                      e.stopPropagation();
                      quickDecide();
                    }}
                  >
                    {decisionUI.icon}
                    {decisionPrimaryLabel}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRejectOpen(true);
                    }}
                  >
                    <X className="size-4" />
                    {t('actions.reject')}
                  </Button>
                </>
              )}
              {showSnooze && <SnoozeMenu itemId={item.id} />}
            </div>
          )}
        </div>
      </div>

      <InboxItemDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        item={item}
        tab={tab}
        nameOf={nameOf}
      />

      <RejectNoteDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={quickReject}
      />
    </>
  );
}

/**
 * 카드 내 1줄 요약
 */
function CardSummaryLine({ item }: { item: InboxItem }) {
  const { t, i18n } = useTranslation('inbox');
  const changes = item.proposedChanges as Record<string, unknown>;
  const dateLocale = i18n.language.startsWith('ko') ? 'ko-KR' : 'en-US';

  if (item.category === 'contract_draft') {
    const doc = (changes._document as Record<string, unknown> | undefined) ?? {};
    const price = changes.totalPrice as number | undefined;
    const specialTerms = (changes.specialTerms as string | undefined) ?? '';
    const termsCount = specialTerms
      ? specialTerms.split(/\n/).filter((l) => l.trim()).length
      : 0;
    const balance = changes.statedBalanceDate as string | undefined;
    const balanceLabel = balance
      ? new Date(balance).toLocaleDateString(dateLocale, {
          month: 'numeric',
          day: 'numeric',
        })
      : null;

    // 금액 포맷 — 1억 미만 '0억 N만' 방지: 공용 formatMoney 사용
    const priceLabel = price != null ? formatMoney(price) : null;

    const seller = (doc.sellerName as string) ?? '—';
    const buyer = (doc.buyerName as string) ?? '—';

    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        <FileText className="size-3.5 text-muted-foreground" />
        <span>{t('contract.sellerBuyerLead', { seller, buyer })}</span>
        {priceLabel && priceLabel !== '—' && (
          <span className="text-muted-foreground">· {priceLabel}</span>
        )}
        {balanceLabel && (
          <span className="text-muted-foreground">
            {t('cardSummary.balanceDue', { date: balanceLabel })}
          </span>
        )}
        {termsCount > 0 && (
          <span className="text-muted-foreground">
            {t('cardSummary.termsCount', { count: termsCount })}
          </span>
        )}
      </div>
    );
  }

  if (isBulkOperation(item.operation)) {
    const items = (changes.items as unknown[]) ?? [];
    const enabled = items.filter(
      (it) => (it as { enabled?: boolean }).enabled !== false,
    ).length;
    return (
      <div className="mt-2 text-[12px] text-muted-foreground">
        {t('cardSummary.bulkSummary', { total: items.length, enabled })}
      </div>
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────

function InboxItemDetailDialog({
  open,
  onOpenChange,
  item,
  tab,
  nameOf,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: InboxItem;
  tab: Tab;
  nameOf: (id: string | null) => string | null;
}) {
  const { t } = useTranslation('inbox');
  const relative = useRelative();
  const categoryLabel = useCategoryLabel();
  const qc = useQueryClient();
  const isPending = tab === 'pending';
  const isProcessingTab = tab === 'processing';
  const isProcessing = item.status === 'processing';
  const isTerminal = TERMINAL_STATUSES.has(item.status);
  const canDecide = isPending && !isProcessing && item.status === 'pending';
  const showCommentArea = isPending || isProcessingTab;
  const decisionUI = decisionModeStyle[item.decisionMode];
  const decisionPrimaryLabel =
    item.decisionMode === 'confirm'
      ? t('decisionMode.confirmAction')
      : t('decisionMode.approveAction');
  const isBulk = isBulkOperation(item.operation);
  const decidedByName = nameOf(item.decidedById);

  const [editMode, setEditMode] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);
  const [revisionMode, setRevisionMode] = useState(false);

  const [draftChanges, setDraftChanges] = useState<Record<string, unknown>>(
    () => deepClone(item.proposedChanges),
  );
  useEffect(() => {
    setDraftChanges(deepClone(item.proposedChanges));
  }, [item.proposedChanges]);

  const bulkItems = useMemo<BulkItem[]>(() => {
    if (!isBulk) return [];
    const rawItems = (draftChanges as { items?: unknown }).items;
    return Array.isArray(rawItems) ? (rawItems as BulkItem[]) : [];
  }, [isBulk, draftChanges]);
  const [localChecked, setLocalChecked] = useState<boolean[]>([]);
  useEffect(() => {
    setLocalChecked(bulkItems.map((i) => i.enabled !== false));
  }, [bulkItems]);
  const checkedCount = localChecked.filter(Boolean).length;
  const noneChecked = bulkItems.length > 0 && checkedCount === 0;

  const toggleAll = () =>
    setLocalChecked(
      localChecked.every(Boolean)
        ? bulkItems.map(() => false)
        : bulkItems.map(() => true),
    );
  const toggleOne = (idx: number) =>
    setLocalChecked((prev) => prev.map((v, i) => (i === idx ? !v : v)));

  const saveEditMutation = useMutation({
    mutationFn: () =>
      api.inbox.edit(item.id, { proposedChanges: draftChanges }),
    onSuccess: () => {
      toast.success('편집 내용을 저장했습니다');
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      setEditMode(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const decideMutation = useMutation({
    mutationFn: async () => {
      const hasEdits =
        JSON.stringify(draftChanges) !== JSON.stringify(item.proposedChanges);

      let payload = draftChanges;

      if (isBulk) {
        payload = {
          ...draftChanges,
          items: bulkItems.map((it, idx) => ({
            ...it,
            enabled: localChecked[idx] === true,
          })),
        };
      }

      if (hasEdits || isBulk) {
        await api.inbox.edit(item.id, { proposedChanges: payload });
      }
      return api.inbox.decide(item.id);
    },
    onSuccess: () => {
      toast.success(
        item.decisionMode === 'confirm'
          ? '확인 처리했습니다'
          : '승인했습니다 — 곧 실행됩니다',
      );
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const rejectMutation = useMutation({
    mutationFn: (note: string) => api.inbox.reject(item.id, note),
    onSuccess: () => {
      toast.success('거부했습니다');
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  // 코멘트 → 재작성 루프: 수동 반영 (AI 가 아닌 사용자가 직접 반영)
  const revisionMutation = useMutation({
    mutationFn: () =>
      api.inbox.submitRevision(item.id, { proposedChanges: draftChanges }),
    onSuccess: () => {
      toast.success('재작성을 반영했습니다 — 검토 대기로 돌아갑니다');
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      setRevisionMode(false);
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const changes = draftChanges;
  const canEditInline =
    !isBulk &&
    (item.category === 'contract_draft' || hasEditableFields(changes));

  const primaryLabel = isBulk
    ? t('actions.selectedDecide', {
        count: checkedCount,
        action: decisionPrimaryLabel,
      })
    : decisionPrimaryLabel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-w-5xl flex-col gap-0 p-0 sm:max-w-5xl">
        {/* 헤더 */}
        <DialogHeader className="space-y-1 border-b px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {categoryLabel(item.category)}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px]',
                item.decisionMode === 'confirm'
                  ? 'border-emerald-300 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                  : 'border-primary/40 text-primary',
              )}
            >
              {item.decisionMode === 'confirm'
                ? t('decisionMode.confirm')
                : t('decisionMode.approval')}
            </Badge>
            {item.executor === 'agent' && (
              <Badge variant="outline" className="text-[10px]">
                <Sparkles className="mr-0.5 size-2.5" />
                {t('badges.agentPending')}
              </Badge>
            )}
            <ExpiryChip item={item} />
          </div>
          <DialogTitle className="text-lg">{item.title}</DialogTitle>
          {item.reasoning && (
            <p className="text-[12px] text-muted-foreground">
              {item.reasoning}
            </p>
          )}
          <ContextChips
            listingId={item.listingId}
            propertyId={item.propertyId}
            contactId={item.contactId}
            dealId={item.dealId}
            contractId={item.contractId}
            className="pt-1"
          />
        </DialogHeader>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto bg-muted/10 px-6 py-5">
          {isBulk ? (
            <BulkItemsList
              items={bulkItems}
              checked={localChecked}
              onToggleAll={toggleAll}
              onToggleOne={toggleOne}
              showAll={showAllItems}
              onShowAll={() => setShowAllItems(true)}
            />
          ) : item.category === 'contract_draft' ? (
            <ContractDraftBody
              changes={changes}
              editMode={editMode}
              onChange={setDraftChanges}
            />
          ) : (
            <ChangesView
              category={item.category}
              changes={changes}
              editMode={editMode}
              onChange={setDraftChanges}
            />
          )}

          {item.executionError && (
            <div className="mt-3 rounded-md bg-red-50 p-2 text-[12px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="mr-1 inline size-3" />
              {t('detail.executionFailed', { error: item.executionError })}
            </div>
          )}

          {/* 처리됨 — 결정/실행 정보 */}
          {isTerminal && (
            <div className="mt-4 space-y-1.5 rounded-md border bg-background p-3 text-[12px] text-muted-foreground">
              {item.decidedAt && (
                <div>
                  결정: {formatDateTime(item.decidedAt)}
                  {decidedByName ? ` · ${decidedByName}` : ''}
                </div>
              )}
              {item.decisionNote && <div>사유: {item.decisionNote}</div>}
              {item.executedAt && (
                <div>실행 완료: {formatDateTime(item.executedAt)}</div>
              )}
              {item.status === 'executed' && (
                <div className="pt-1">
                  <ResultEntityLink
                    entityType={item.entityType}
                    resultEntityId={item.resultEntityId}
                    propertyId={item.propertyId}
                  />
                </div>
              )}
            </div>
          )}

          {item.comments.length > 0 && (
            <div className="mt-5 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('detail.commentThreadHeading')}
              </div>
              {item.comments.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    'rounded-md border bg-background p-2 text-[12px]',
                    c.readAt && 'bg-muted/40 opacity-70',
                  )}
                >
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>
                      {nameOf(c.authorId) ? `${nameOf(c.authorId)} · ` : ''}
                      {relative(c.createdAt)}
                    </span>
                    {c.readAt && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                        <CircleCheckBig className="size-3" />
                        {t('detail.commentReflected', { time: relative(c.readAt) })}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>
          )}

          {showCommentArea && (
            <div className="mt-4 space-y-3">
              {isProcessing ? (
                <>
                  <div className="rounded-md border border-violet-200 bg-violet-50/50 px-3 py-2 text-[12px] text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
                    {t('detail.processingBanner')}
                  </div>
                  {!revisionMode ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => setRevisionMode(true)}
                    >
                      <Pencil className="size-3.5" />
                      재작성 결과 직접 반영
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      {item.category === 'contract_draft' ? (
                        <ContractDraftBody
                          changes={changes}
                          editMode
                          onChange={setDraftChanges}
                        />
                      ) : (
                        <ChangesView
                          category={item.category}
                          changes={changes}
                          editMode
                          onChange={setDraftChanges}
                        />
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={revisionMutation.isPending}
                          onClick={() => revisionMutation.mutate()}
                        >
                          {revisionMutation.isPending
                            ? t('actions.saving')
                            : '반영 완료 — 검토 대기로 복귀'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRevisionMode(false);
                            setDraftChanges(deepClone(item.proposedChanges));
                          }}
                        >
                          {t('actions.cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <CommentForm itemId={item.id} />
              )}
            </div>
          )}
        </div>

        {/* 푸터 액션 */}
        {canDecide && (
          <div className="flex flex-wrap items-center gap-2 border-t bg-background px-6 py-3">
            {editMode ? (
              <>
                <Button
                  size="sm"
                  onClick={() => saveEditMutation.mutate()}
                  disabled={saveEditMutation.isPending}
                >
                  {saveEditMutation.isPending
                    ? t('actions.saving')
                    : t('actions.saveEdit')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraftChanges(deepClone(item.proposedChanges));
                    setEditMode(false);
                  }}
                >
                  {t('actions.cancel')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  className={cn('gap-1', decisionUI.tone)}
                  disabled={
                    decideMutation.isPending || (isBulk && noneChecked)
                  }
                  onClick={() => decideMutation.mutate()}
                >
                  {decisionUI.icon}
                  {primaryLabel}
                </Button>

                {canEditInline && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setEditMode(true)}
                  >
                    <Pencil className="size-4" />
                    {t('actions.edit')}
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-muted-foreground"
                  disabled={rejectMutation.isPending}
                  onClick={() => setRejectOpen(true)}
                >
                  <X className="size-4" />
                  {isBulk ? t('actions.rejectAll') : t('actions.reject')}
                </Button>

                <SnoozeMenu itemId={item.id} />

                <div className="ml-auto text-[11px] text-muted-foreground">
                  {relative(item.createdAt)} · {item.generatedBy}
                </div>
              </>
            )}
          </div>
        )}

        <RejectNoteDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          onConfirm={(note) => rejectMutation.mutate(note)}
        />
      </DialogContent>
    </Dialog>
  );
}

function deepClone<T>(v: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(v)
    : JSON.parse(JSON.stringify(v));
}

function ContractDraftBody({
  changes,
  editMode,
  onChange,
}: {
  changes: Record<string, unknown>;
  editMode: boolean;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation('inbox');

  if (!editMode) {
    return <ContractDocumentPreview proposedChanges={changes} />;
  }

  const totalPrice = (changes.totalPrice as number) ?? 0;
  const statedDeposit = (changes.statedDeposit as number) ?? 0;
  const statedInterimPayment = (changes.statedInterimPayment as number) ?? 0;
  const statedBalance = (changes.statedBalance as number) ?? 0;
  const specialTerms = (changes.specialTerms as string) ?? '';
  const balanceDate = (changes.statedBalanceDate as string) ?? '';

  const setField = (key: string, value: unknown) => {
    onChange({ ...changes, [key]: value });
  };

  return (
    <div className="space-y-4 rounded-md border bg-background p-4">
      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <div className="space-y-1">
          <Label className="text-[11px]">{t('contractEdit.totalPrice')}</Label>
          <Input
            type="number"
            value={totalPrice}
            onChange={(e) =>
              setField('totalPrice', Number(e.target.value))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{t('contractEdit.balanceDate')}</Label>
          <Input
            type="date"
            value={balanceDate.slice(0, 10)}
            onChange={(e) =>
              setField(
                'statedBalanceDate',
                new Date(e.target.value).toISOString(),
              )
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{t('contractEdit.deposit')}</Label>
          <Input
            type="number"
            value={statedDeposit}
            onChange={(e) =>
              setField('statedDeposit', Number(e.target.value))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{t('contractEdit.interimPayment')}</Label>
          <Input
            type="number"
            value={statedInterimPayment}
            onChange={(e) =>
              setField('statedInterimPayment', Number(e.target.value))
            }
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-[11px]">{t('contractEdit.balance')}</Label>
          <Input
            type="number"
            value={statedBalance}
            onChange={(e) =>
              setField('statedBalance', Number(e.target.value))
            }
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-[11px]">{t('contractEdit.specialTerms')}</Label>
        <Textarea
          value={specialTerms}
          onChange={(e) => setField('specialTerms', e.target.value)}
          rows={10}
          className="font-mono text-[12px]"
        />
        <p className="text-[11px] text-muted-foreground">
          {t('contractEdit.specialTermsHelp')}
        </p>
      </div>
    </div>
  );
}

function BulkItemsList({
  items,
  checked,
  onToggleAll,
  onToggleOne,
  showAll,
  onShowAll,
}: {
  items: BulkItem[];
  checked: boolean[];
  onToggleAll: () => void;
  onToggleOne: (idx: number) => void;
  showAll: boolean;
  onShowAll: () => void;
}) {
  const { t } = useTranslation('inbox');
  const total = items.length;
  const checkedCount = checked.filter(Boolean).length;
  const PREVIEW_LIMIT = 10;
  const visibleCount = showAll ? total : Math.min(PREVIEW_LIMIT, total);
  const hiddenCount = total - visibleCount;

  const allChecked = checkedCount === total && total > 0;
  const someChecked = checkedCount > 0 && checkedCount < total;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium">
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => {
              if (el) el.indeterminate = someChecked;
            }}
            onChange={onToggleAll}
            className="size-3.5 cursor-pointer rounded border-muted-foreground/30"
          />
          {t('bulk.selectAll')}
        </label>
        <span className="text-[11px] text-muted-foreground">
          {t('bulk.selectedCount', { checked: checkedCount, total })}
        </span>
      </div>

      <ul className="divide-y rounded-md border bg-background">
        {items.slice(0, visibleCount).map((it, idx) => (
          <li key={idx}>
            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-muted/30',
                !checked[idx] && 'text-muted-foreground',
              )}
            >
              <input
                type="checkbox"
                checked={!!checked[idx]}
                onChange={() => onToggleOne(idx)}
                className="size-3.5 cursor-pointer rounded border-muted-foreground/30"
              />
              <div className="min-w-0 flex-1">
                <div className={cn('flex items-center gap-2', !checked[idx] && 'line-through')}>
                  <span className="truncate font-medium">
                    {it.displayLabel ?? t('bulk.itemLabel', { index: idx + 1 })}
                  </span>
                  {it.subtitle && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      · {it.subtitle}
                    </span>
                  )}
                </div>
                {it.warning && (
                  <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-3" />
                    {it.warning}
                  </div>
                )}
              </div>
            </label>
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onShowAll}
          className="w-full rounded-md border border-dashed py-2 text-[12px] text-muted-foreground hover:bg-muted/30"
        >
          {t('bulk.showMore', { count: hiddenCount })}
        </button>
      )}
    </div>
  );
}

function CommentForm({ itemId }: { itemId: string }) {
  const { t } = useTranslation('inbox');
  const [body, setBody] = useState('');
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: () => api.inbox.addComment(itemId, body),
    onSuccess: () => {
      setBody('');
      toast.success('재작성을 요청했습니다 — AI가 반영해 다시 올립니다');
      void qc.invalidateQueries({ queryKey: ['inbox'] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px]">{t('commentForm.label')}</Label>
      <div className="flex gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('commentForm.placeholder')}
          className="h-8 text-[13px]"
          disabled={add.isPending}
        />
        <Button
          size="sm"
          onClick={() => body.trim() && add.mutate()}
          disabled={!body.trim() || add.isPending}
        >
          <Sparkles className="mr-1 size-3.5" />
          {t('commentForm.button')}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t('commentForm.help')}
      </p>
    </div>
  );
}
