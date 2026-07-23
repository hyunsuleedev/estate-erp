import { useState, type CSSProperties } from 'react';
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
import { CalendarClock, GripVertical } from 'lucide-react';
import type { Deal } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { DealActionsMenu } from './-deal-shared';
import {
  dealDisplayGroups,
  formatDealAmount,
  formatNextPaymentLabel,
  getDealCommissionValue,
  getDealDisplayGroupKey,
  getDealPipelineHealth,
  getDealShortCode,
  getDealTitle,
  getDealTransactionType,
  getNextDealPaymentSummary,
  sortDealsForDisplay,
  summarizeDealGroup,
  type DealDisplayGroup,
  type DealRowActions,
} from './-deal-view-utils';

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

    const targetGroup = dealDisplayGroups.find((group) => group.key === event.over?.id);
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
      <section className="overflow-x-auto pb-2" aria-label="거래 단계 칸반 보드">
        <div className="flex min-w-max items-stretch gap-3">
          {dealDisplayGroups.map((group) => (
            <DealColumn
              key={group.key}
              group={group}
              deals={sortDealsForDisplay(
                deals.filter((deal) => getDealDisplayGroupKey(deal.stage) === group.key),
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

      <DragOverlay dropAnimation={null}>
        {activeDeal ? <DealDragPreview deal={activeDeal} referenceDate={referenceDate} /> : null}
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
  const commissionTotal = deals.reduce((sum, deal) => sum + getDealCommissionValue(deal), 0);
  const { setNodeRef, isOver } = useDroppable({ id: group.key });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex min-h-[560px] shrink-0 flex-col overflow-hidden rounded-[12px] border bg-muted/45 transition-[width,box-shadow,border-color]',
        compact ? 'w-[196px]' : 'w-[246px]',
        isOver && 'border-info/60 bg-info-soft/30 ring-2 ring-info/20',
      )}
    >
      {/* 헤더 — 도트 + 단계명 + 건수 + 수수료 합계 한 줄 (Attio/HubSpot 관례) */}
      <header className="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-background/95 px-3 py-2.5 backdrop-blur">
        <span className={cn('size-2 shrink-0 rounded-full', group.dotClassName)} />
        <h2 className="text-xs font-bold text-foreground">{group.label}</h2>
        <Badge
          variant="outline"
          className="h-[18px] rounded-full bg-background px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground"
        >
          {summary.count}
        </Badge>
        {commissionTotal > 0 ? (
          <span className="ml-auto truncate text-[10px] tabular-nums text-slate-600">
            {formatMoney(commissionTotal)}
          </span>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col gap-2 p-2">
        {deals.length === 0 ? (
          <div
            className={cn(
              'flex min-h-[116px] flex-1 items-center justify-center break-keep rounded-lg border border-dashed bg-background/70 px-3 text-center text-[11px] text-slate-600',
              isOver && 'border-info/50 bg-info-soft/40 text-info-strong',
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  });
  const style: CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-label={`${getDealTitle(deal)} 거래 카드 단계 이동`}
      className={cn(
        'touch-none cursor-grab rounded-[9px] outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isDragging && 'opacity-25',
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

/** 거래유형 → 좌측 색 띠 (Trello 라벨 관례: 배지 대신 3px 스트라이프) */
const TRANSACTION_STRIPE: Record<string, string> = {
  sale: 'bg-info',
  jeonse: 'bg-success',
  monthly: 'bg-orange',
};

const TRANSACTION_LABEL: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

function DealCard({
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
  const transactionType = getDealTransactionType(deal);
  const nextPayment = getNextDealPaymentSummary(deal, referenceDate);
  const health = getDealPipelineHealth(deal, referenceDate);
  const urgent = health.state === 'overdue' || nextPayment?.isUrgent;

  // 메타 한 줄: 유형 · 다음 일정 · 체류일 · 공동.
  // 색(띠·배경 틴트)에만 의존하지 않도록 유형은 텍스트로도 표기한다.
  // 지연/정체 라벨은 truncate에 잘리지 않게 별도 shrink-0 요소로 렌더링.
  const metaParts = [
    transactionType ? TRANSACTION_LABEL[transactionType] : null,
    formatNextPaymentLabel(nextPayment),
    `${health.stageAgeDays}일 체류`,
    deal.isJointBrokerage ? '공동' : null,
  ].filter(Boolean);

  return (
    <article
      title={health.isAtRisk ? health.description : undefined}
      className={cn(
        'group relative overflow-hidden rounded-[9px] border bg-background shadow-xs transition-shadow hover:shadow-md',
        compact ? 'py-2 pl-3 pr-2' : 'py-2.5 pl-3.5 pr-2.5',
        selected ? 'border-info ring-1 ring-info' : 'border-border',
        // 상태 신호는 카드 배경 틴트 하나로 (Pipedrive rotting 방식)
        health.state === 'overdue' && !selected && 'border-destructive/45 bg-destructive-soft/40',
        health.state === 'stale' && !selected && 'border-warning/50 bg-warning-soft/35',
      )}
    >
      {transactionType ? (
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-y-0 left-0 w-[3px]',
            TRANSACTION_STRIPE[transactionType],
          )}
        />
      ) : null}

      <div className="flex items-start gap-1">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => actions.onSelect(deal.id)}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <p className="truncate text-[12.5px] font-semibold leading-[1.35] text-foreground">
            {getDealTitle(deal)}
          </p>
        </button>
        <div
          className="shrink-0"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DealActionsMenu deal={deal} actions={actions} />
        </div>
      </div>

      <div className="mt-1.5 truncate text-[14.5px] font-bold leading-5 tabular-nums text-foreground">
        {formatDealAmount(deal)}
      </div>

      <div
        className={cn(
          'mt-1.5 flex items-center gap-1 text-[10.5px]',
          urgent ? 'font-medium text-destructive-strong' : 'text-slate-600',
        )}
      >
        <CalendarClock className="size-3 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{metaParts.join(' · ')}</span>
        {health.isAtRisk ? (
          <span
            className={cn(
              'ml-auto shrink-0 whitespace-nowrap font-semibold',
              health.state === 'overdue'
                ? 'text-destructive-strong'
                : 'text-warning-strong',
            )}
          >
            {health.label}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function DealDragPreview({ deal, referenceDate }: { deal: Deal; referenceDate: Date }) {
  const health = getDealPipelineHealth(deal, referenceDate);

  return (
    <div className="w-[232px] rotate-2 rounded-[10px] border border-info/50 bg-background p-3 shadow-xl">
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <GripVertical className="size-3.5" aria-hidden="true" />
        {getDealShortCode(deal.id)} · {health.stageAgeDays}일 체류
      </div>
      <div className="mt-2 truncate text-sm font-semibold">{getDealTitle(deal)}</div>
      <div className="mt-1 text-base font-bold tabular-nums">{formatDealAmount(deal)}</div>
    </div>
  );
}
