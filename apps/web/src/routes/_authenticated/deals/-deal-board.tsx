import { memo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CalendarClock } from 'lucide-react';
import type { Deal } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { DealActionsMenu } from './-deal-shared';
import {
  dealDisplayGroups,
  formatDealAmount,
  formatNextPaymentLabel,
  getDealCommissionValue,
  getDealDisplayGroupKey,
  getDealPipelineHealth,
  getDealTitle,
  getDealTransactionType,
  getNextDealPaymentSummary,
  sortDealsForDisplay,
  summarizeDealGroup,
  type DealDisplayGroup,
  type DealRowActions,
} from './-deal-view-utils';

const DEAL_COLUMN_TONE: Record<
  DealDisplayGroup['key'],
  { surface: string; label: string }
> = {
  preparing: {
    surface: 'bg-[#f5f5f3]',
    label: 'bg-[#e8e8e5] text-[#5f5e59]',
  },
  preContract: {
    surface: 'bg-[#f2f7fa]',
    label: 'bg-[#dceaf3] text-[#38647a]',
  },
  contracted: {
    surface: 'bg-[#f7f3fa]',
    label: 'bg-[#e8def2] text-[#694c80]',
  },
  settling: {
    surface: 'bg-[#faf7f0]',
    label: 'bg-[#f2e7cd] text-[#765d2f]',
  },
  completed: {
    surface: 'bg-[#f2f8f4]',
    label: 'bg-[#dceee2] text-[#35684a]',
  },
  closed: {
    surface: 'bg-[#f5f5f3]',
    label: 'bg-[#e8e8e5] text-[#5f5e59]',
  },
};

export function DealBoard({
  deals,
  selectedDealId,
  referenceDate,
  compact,
  actions,
  onStageDrop,
}: {
  deals: Deal[];
  selectedDealId: string | null;
  referenceDate: Date;
  compact: boolean;
  actions: DealRowActions;
  onStageDrop: (deal: Deal, stage: string) => void;
}) {
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDeal(deals.find((deal) => deal.id === event.active.id) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const deal = activeDeal;
    setActiveDeal(null);
    if (!deal || !event.over) return;

    const targetGroup = dealDisplayGroups.find(
      (group) => group.key === event.over?.id,
    );
    if (!targetGroup || targetGroup.stages.includes(deal.stage)) return;

    const targetStage = targetGroup.stages[targetGroup.stages.length - 1];
    if (targetStage) onStageDrop(deal, targetStage);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveDeal(null)}
      onDragEnd={handleDragEnd}
    >
      <section
        className="overflow-x-auto pb-2"
        aria-label="거래 단계 칸반 보드"
      >
        <div className="flex min-w-max items-start gap-3 pr-1">
          {dealDisplayGroups.map((group) => (
            <DealColumn
              key={group.key}
              group={group}
              deals={sortDealsForDisplay(
                deals.filter(
                  (deal) => getDealDisplayGroupKey(deal.stage) === group.key,
                ),
                referenceDate,
              )}
              selectedDealId={selectedDealId}
              referenceDate={referenceDate}
              compact={compact}
              actions={actions}
            />
          ))}
        </div>
      </section>

      <DragOverlay
        adjustScale={false}
        className="will-change-transform"
        dropAnimation={null}
        transition="none"
      >
        {activeDeal ? (
          <DealDragPreview
            deal={activeDeal}
            referenceDate={referenceDate}
            compact={compact}
            actions={actions}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DealColumn({
  group,
  deals,
  selectedDealId,
  referenceDate,
  compact,
  actions,
}: {
  group: DealDisplayGroup;
  deals: Deal[];
  selectedDealId: string | null;
  referenceDate: Date;
  compact: boolean;
  actions: DealRowActions;
}) {
  const summary = summarizeDealGroup(deals, group.key);
  const commissionTotal = deals.reduce(
    (sum, deal) => sum + getDealCommissionValue(deal),
    0,
  );
  const { setNodeRef, isOver } = useDroppable({ id: group.key });
  const tone = DEAL_COLUMN_TONE[group.key];

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex min-h-[148px] shrink-0 self-start flex-col overflow-hidden rounded-xl',
        compact ? 'w-[228px]' : 'w-[272px]',
        tone.surface,
        isOver && 'ring-2 ring-inset ring-info/30',
      )}
    >
      <header className="flex min-h-11 items-center gap-2 px-3 py-2.5">
        <h2
          className={cn(
            'inline-flex h-6 items-center rounded-md px-2 text-[11.5px] font-semibold',
            tone.label,
          )}
        >
          {group.label}
        </h2>
        <span className="text-[12px] font-medium tabular-nums text-muted-foreground">
          {summary.count}
        </span>
        {commissionTotal > 0 ? (
          <span
            title="예상 수수료 합계"
            className="ml-auto truncate text-[10px] tabular-nums text-slate-500"
          >
            {formatMoney(commissionTotal)}
          </span>
        ) : null}
      </header>

      <div className="flex flex-col gap-2 px-2 pb-2">
        {deals.length === 0 ? (
          <div
            className={cn(
              'flex min-h-[88px] items-center justify-center break-keep rounded-lg border border-dashed border-black/10 bg-white/55 px-3 text-center text-[11px] text-slate-500',
              isOver && 'border-info/45 bg-info-soft/35 text-info-strong',
            )}
          >
            {isOver ? '여기로 이동' : '해당 단계의 거래가 없습니다'}
          </div>
        ) : (
          deals.map((deal) => (
            <DraggableDealCard
              key={deal.id}
              deal={deal}
              selected={deal.id === selectedDealId}
              referenceDate={referenceDate}
              compact={compact}
              actions={actions}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DraggableDealCard({
  deal,
  selected,
  referenceDate,
  compact,
  actions,
}: {
  deal: Deal;
  selected: boolean;
  referenceDate: Date;
  compact: boolean;
  actions: DealRowActions;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`${getDealTitle(deal)} 거래 카드 단계 이동`}
      className={cn(
        'touch-none cursor-grab rounded-md outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1',
        isDragging && 'opacity-20',
      )}
    >
      <DealCard
        deal={deal}
        selected={selected}
        referenceDate={referenceDate}
        compact={compact}
        actions={actions}
      />
    </div>
  );
}

const TRANSACTION_TONE: Record<string, string> = {
  sale: 'bg-[#e2eef8] text-[#315f7c]',
  jeonse: 'bg-[#e2f1e7] text-[#37684b]',
  monthly: 'bg-[#f8e8dc] text-[#865a35]',
};

const TRANSACTION_LABEL: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

const DealCard = memo(function DealCard({
  deal,
  selected,
  referenceDate,
  compact,
  actions,
  dragPreview = false,
}: {
  deal: Deal;
  selected: boolean;
  referenceDate: Date;
  compact: boolean;
  actions: DealRowActions;
  dragPreview?: boolean;
}) {
  const transactionType = getDealTransactionType(deal);
  const nextPayment = getNextDealPaymentSummary(deal, referenceDate);
  const health = getDealPipelineHealth(deal, referenceDate);
  const urgent = health.state === 'overdue' || nextPayment?.isUrgent;
  const partyParts = [
    deal.sellerContact?.name ? `매도 ${deal.sellerContact.name}` : null,
    deal.buyerContact?.name ? `매수 ${deal.buyerContact.name}` : null,
  ].filter(Boolean);

  return (
    <article
      title={health.isAtRisk ? health.description : undefined}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-black/[0.08] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]',
        compact ? 'p-2.5' : 'p-3',
        !dragPreview && 'hover:border-black/[0.14]',
        dragPreview && 'h-full w-full shadow-[0_12px_32px_rgba(15,23,42,0.16)]',
        selected && 'border-foreground/35 ring-1 ring-foreground/10',
        health.state === 'overdue' && !selected && 'border-destructive/35',
        health.state === 'stale' && !selected && 'border-warning/40',
      )}
    >
      <div className="flex items-start gap-1">
        {dragPreview ? (
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[13px] font-semibold leading-[1.4] text-foreground">
              {getDealTitle(deal)}
            </p>
          </div>
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => actions.onSelect(deal.id)}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <p className="truncate text-[13px] font-semibold leading-[1.4] text-foreground">
              {getDealTitle(deal)}
            </p>
          </button>
        )}
        {dragPreview ? (
          <span aria-hidden="true" className="size-6 shrink-0" />
        ) : (
          <div
            className="shrink-0"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <DealActionsMenu deal={deal} actions={actions} />
          </div>
        )}
      </div>

      {!compact && partyParts.length > 0 ? (
        <p
          title={partyParts.join(' · ')}
          className="mt-1.5 truncate text-[11px] leading-4 text-muted-foreground"
        >
          {partyParts.join(' · ')}
        </p>
      ) : null}

      <div className="mt-2 flex min-w-0 items-center gap-1.5">
        <div className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-5 tabular-nums text-foreground">
          {formatDealAmount(deal)}
        </div>
        {transactionType ? (
          <span
            className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
              TRANSACTION_TONE[transactionType] ??
                'bg-muted text-muted-foreground',
            )}
          >
            {TRANSACTION_LABEL[transactionType] ?? transactionType}
          </span>
        ) : null}
        {deal.isJointBrokerage ? (
          <span className="shrink-0 rounded bg-[#efefed] px-1.5 py-0.5 text-[10px] font-medium text-[#66645f]">
            공동
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          'mt-2 flex min-w-0 items-center gap-1.5 text-[10.5px]',
          urgent ? 'font-medium text-destructive-strong' : 'text-slate-600',
        )}
      >
        <CalendarClock className="size-3 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">
          {formatNextPaymentLabel(nextPayment)}
        </span>
        <span aria-hidden="true" className="text-black/20">
          ·
        </span>
        <span className="shrink-0 tabular-nums">
          {health.stageAgeDays}일 체류
        </span>
      </div>

      {health.isAtRisk ? (
        <div className="mt-2 flex justify-end">
          <span
            className={cn(
              'shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9.5px] font-semibold',
              health.state === 'overdue'
                ? 'bg-destructive-soft text-destructive-strong'
                : health.state === 'stale'
                  ? 'bg-warning-soft text-warning-strong'
                  : 'bg-[#efefed] text-slate-600',
            )}
          >
            {health.label}
          </span>
        </div>
      ) : null}
    </article>
  );
});

function DealDragPreview({
  deal,
  referenceDate,
  compact,
  actions,
}: {
  deal: Deal;
  referenceDate: Date;
  compact: boolean;
  actions: DealRowActions;
}) {
  return (
    <div aria-hidden="true" className="pointer-events-none h-full w-full">
      <DealCard
        deal={deal}
        selected={false}
        referenceDate={referenceDate}
        compact={compact}
        actions={actions}
        dragPreview
      />
    </div>
  );
}
