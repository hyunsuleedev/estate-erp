import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  CircleCheckBig,
  FileText,
  Inbox as InboxIcon,
  MessageCircle,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  InboxItem,
  DraftDecisionMode,
  DraftPriority,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ContractDocumentPreview } from './-renderers/contract-document';

export const Route = createFileRoute('/_authenticated/inbox/')({
  component: InboxPage,
});

type Tab = 'pending' | 'processing' | 'approved' | 'resolved';

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
  const [tab, setTab] = useState<Tab>('pending');
  const [priorityFilter, setPriorityFilter] = useState<
    DraftPriority | 'all'
  >('all');

  const listQuery = useQuery({
    queryKey: ['inbox', tab],
    queryFn: () => api.inbox.list({ scope: tab, limit: 200 }),
  });

  const pendingCountQuery = useQuery({
    queryKey: ['inbox', 'pending'],
    queryFn: () => api.inbox.list({ scope: 'pending', limit: 200 }),
  });
  const processingCountQuery = useQuery({
    queryKey: ['inbox', 'processing'],
    queryFn: () => api.inbox.list({ scope: 'processing', limit: 200 }),
  });
  const approvedCountQuery = useQuery({
    queryKey: ['inbox', 'approved'],
    queryFn: () => api.inbox.list({ scope: 'approved', limit: 200 }),
  });

  const items = useMemo(() => {
    const rows = listQuery.data ?? [];
    if (priorityFilter === 'all') return rows;
    return rows.filter((r) => r.priority === priorityFilter);
  }, [listQuery.data, priorityFilter]);

  const counts = useMemo(() => {
    const rows = listQuery.data ?? [];
    return {
      total: rows.length,
      urgent: rows.filter((r) => r.priority === 'urgent').length,
      normal: rows.filter((r) => r.priority === 'normal').length,
      low: rows.filter((r) => r.priority === 'low').length,
      tabCounts: {
        pending: pendingCountQuery.data?.length ?? 0,
        processing: processingCountQuery.data?.length ?? 0,
        approved: approvedCountQuery.data?.length ?? 0,
      },
    };
  }, [
    listQuery.data,
    pendingCountQuery.data,
    processingCountQuery.data,
    approvedCountQuery.data,
  ]);

  return (
    <div className="space-y-4">
      {/* 탭 + 필터 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <TabButton active={tab === 'pending'} onClick={() => setTab('pending')}>
            {t('tabs.pending')}
            {counts.tabCounts.pending > 0 && (
              <span className="ml-1.5 text-[11px] opacity-80">
                {counts.tabCounts.pending}
              </span>
            )}
          </TabButton>
          <TabButton
            active={tab === 'processing'}
            onClick={() => setTab('processing')}
          >
            {t('tabs.processing')}
            {counts.tabCounts.processing > 0 && (
              <span className="ml-1.5 text-[11px] opacity-80">
                {counts.tabCounts.processing}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === 'approved'} onClick={() => setTab('approved')}>
            {t('tabs.approved')}
            {counts.tabCounts.approved > 0 && (
              <span className="ml-1.5 text-[11px] opacity-80">
                {counts.tabCounts.approved}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === 'resolved'} onClick={() => setTab('resolved')}>
            {t('tabs.resolved')}
          </TabButton>
        </div>

        <div className="flex items-center gap-1">
          <FilterPill
            active={priorityFilter === 'all'}
            onClick={() => setPriorityFilter('all')}
          >
            {t('priorities.all')} {counts.total}
          </FilterPill>
          <FilterPill
            active={priorityFilter === 'urgent'}
            onClick={() => setPriorityFilter('urgent')}
            tone="red"
          >
            {t('priorities.urgent')} {counts.urgent}
          </FilterPill>
          <FilterPill
            active={priorityFilter === 'normal'}
            onClick={() => setPriorityFilter('normal')}
            tone="sky"
          >
            {t('priorities.normal')} {counts.normal}
          </FilterPill>
          <FilterPill
            active={priorityFilter === 'low'}
            onClick={() => setPriorityFilter('low')}
          >
            {t('priorities.low')} {counts.low}
          </FilterPill>
        </div>
      </div>

      {/* 목록 */}
      {listQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-16 text-center">
          <InboxIcon className="mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {t(`empty.${tab}`)}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <InboxCard item={item} tab={tab} />
            </li>
          ))}
        </ul>
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

function FilterPill({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'red' | 'sky';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
        active
          ? tone === 'red'
            ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
            : tone === 'sky'
              ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300'
              : 'border-foreground/30 bg-foreground/5'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

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

function InboxCard({ item, tab }: { item: InboxItem; tab: Tab }) {
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

  const qc = useQueryClient();

  const decideMutation = useMutation({
    mutationFn: () => api.inbox.decide(item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });

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
              </div>
            </div>
          </button>

          {/* 접힘 상태 퀵 액션 */}
          {showQuickActions && (
            <div
              className="flex shrink-0 items-center gap-1.5 py-4 pr-4"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                size="sm"
                className={cn('gap-1', decisionUI.tone)}
                disabled={decideMutation.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  decideMutation.mutate();
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
            </div>
          )}
        </div>
      </div>

      <InboxItemDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        item={item}
        tab={tab}
      />

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        itemId={item.id}
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

    // 금액 포맷
    const priceLabel = (() => {
      if (price == null) return null;
      if (i18n.language.startsWith('ko')) {
        const eok = Math.floor(price / 10000);
        const man = price % 10000;
        return `${eok.toLocaleString('ko-KR')}억${man !== 0 ? ` ${man.toLocaleString('ko-KR')}만` : ''}`;
      }
      return `₩${(price * 10000).toLocaleString('en-US')}`;
    })();

    const seller = (doc.sellerName as string) ?? '—';
    const buyer = (doc.buyerName as string) ?? '—';

    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        <FileText className="size-3.5 text-muted-foreground" />
        <span>{t('contract.sellerBuyerLead', { seller, buyer })}</span>
        {priceLabel && (
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: InboxItem;
  tab: Tab;
}) {
  const { t } = useTranslation('inbox');
  const relative = useRelative();
  const categoryLabel = useCategoryLabel();
  const qc = useQueryClient();
  const isPending = tab === 'pending';
  const isProcessingTab = tab === 'processing';
  const isProcessing = item.status === 'processing';
  const canDecide = isPending && !isProcessing;
  const showCommentArea = isPending || isProcessingTab;
  const decisionUI = decisionModeStyle[item.decisionMode];
  const decisionPrimaryLabel =
    item.decisionMode === 'confirm'
      ? t('decisionMode.confirmAction')
      : t('decisionMode.approveAction');
  const isBulk = isBulkOperation(item.operation);

  const [editMode, setEditMode] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);

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
      qc.invalidateQueries({ queryKey: ['inbox'] });
      setEditMode(false);
    },
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
      qc.invalidateQueries({ queryKey: ['inbox'] });
      onOpenChange(false);
    },
  });

  const changes = draftChanges;

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
          </div>
          <DialogTitle className="text-lg">{item.title}</DialogTitle>
          {item.reasoning && (
            <p className="text-[12px] text-muted-foreground">
              {item.reasoning}
            </p>
          )}
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
            <pre className="overflow-x-auto rounded-md bg-background p-3 text-[11px]">
              {JSON.stringify(changes, null, 2)}
            </pre>
          )}

          {item.executionError && (
            <div className="mt-3 rounded-md bg-red-50 p-2 text-[12px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="mr-1 inline size-3" />
              {t('detail.executionFailed', { error: item.executionError })}
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
                    <span>{relative(c.createdAt)}</span>
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
            <div className="mt-4">
              {isProcessing ? (
                <div className="rounded-md border border-violet-200 bg-violet-50/50 px-3 py-2 text-[12px] text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
                  {t('detail.processingBanner')}
                </div>
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

                {item.category === 'contract_draft' && (
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
                  onClick={() => setRejectOpen(true)}
                >
                  <X className="size-4" />
                  {isBulk ? t('actions.rejectAll') : t('actions.reject')}
                </Button>

                <div className="ml-auto text-[11px] text-muted-foreground">
                  {relative(item.createdAt)} · {item.generatedBy}
                </div>
              </>
            )}
          </div>
        )}

        <RejectDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          itemId={item.id}
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
      qc.invalidateQueries({ queryKey: ['inbox'] });
    },
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

function RejectDialog({
  open,
  onOpenChange,
  itemId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string;
}) {
  const { t } = useTranslation('inbox');
  const [note, setNote] = useState('');
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.inbox.reject(itemId, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox'] });
      setNote('');
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('reject.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="note" className="text-xs">
            {t('reject.label')}
          </Label>
          <Textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('reject.placeholder')}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('reject.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => note.trim() && mutation.mutate()}
            disabled={!note.trim() || mutation.isPending}
          >
            {t('reject.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
