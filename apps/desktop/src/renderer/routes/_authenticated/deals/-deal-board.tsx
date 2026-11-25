import { memo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CalendarClock, Plus } from 'lucide-react';
import type { Deal } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { DEAL_GROUP_TONE, DealActionsMenu, DealStagePill } from './-deal-shared';
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
  getPartyLabels,
} from './-deal-view-utils';

const dealBoardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;

  if (args.pointerCoordinates) {
    const measuredColumns = args.droppableContainers.flatMap((container) => {
      const rect = args.droppableRects.get(container.id);
      return rect ? [{ container, rect }] : [];
    });
    const boardTop = Math.min(...measuredColumns.map(({ rect }) => rect.top));
    const { x, y } = args.pointerCoordinates;

    if (y >= boardTop) {
      const targetColumn = measuredColumns.find(
        ({ rect }) => x >= rect.left && x <= rect.right,
      );
      if (targetColumn) {
        return [
          {
            id: targetColumn.container.id,
            data: {
              droppableContainer: targetColumn.container,
              value: 0,
            },
          },
        ];
      }
    }
  }

  return rectIntersection(args);
};

export function DealBoard({
  deals,
  selectedDealId,
  referenceDate,
  compact,
  actions,
  onStageDrop,
  onCreate,
}: {
  deals: Deal[];
  selectedDealId: string | null;
  referenceDate: Date;
  compact: boolean;
  actions: DealRowActions;
  onStageDrop: (deal: Deal, stage: string) => void;
  /** 새 거래는 첫 단계에서 시작하므로 첫 열 아래에만 추가 버튼을 둔다 */
  onCreate?: () => void;
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
      collisionDetection={dealBoardCollisionDetection}
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
              onCreate={group.key === dealDisplayGroups[0]?.key ? onCreate : undefined}
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
  onCreate,
}: {
  group: DealDisplayGroup;
  deals: Deal[];
  selectedDealId: string | null;
  referenceDate: Date;
  compact: boolean;
  actions: DealRowActions;
  onCreate?: () => void;
}) {
  const summary = summarizeDealGroup(deals, group.key);
  // 수수료를 볼 수 없는 거래(담당이 아닌 중개사)가 섞이면 합계가 틀려 보이므로 내지 않는다
  const commissionTotal = deals.some((deal) => deal.commissionHidden)
    ? 0
    : deals.reduce((sum, deal) => sum + getDealCommissionValue(deal), 0);
  const { setNodeRef, isOver } = useDroppable({ id: group.key });
  const tone = DEAL_GROUP_TONE[group.key];

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex shrink-0 self-start flex-col rounded-[10px]',
        compact ? 'w-[228px]' : 'w-[260px]',
        tone.surface,
        isOver && 'ring-2 ring-inset ring-[#2783de]/30',
      )}
    >
      <header className="flex h-10 items-center gap-2 px-2">
        <h2 className="flex p-[3px]">
          <DealStagePill stage={group.stages[0] ?? group.key} label={group.label} />
        </h2>
        <span className={cn('text-[13px] tabular-nums', tone.count)}>
          {summary.count}
        </span>
        {commissionTotal > 0 ? (
          <span
            title="예상 수수료 합계"
            className="ml-auto truncate pr-1 text-[11.5px] tabular-nums text-[#7d7a75]"
          >
            {formatMoney(commissionTotal)}
          </span>
        ) : null}
      </header>

      <div className="flex min-h-2 flex-col gap-2 px-2 pb-2">
        {deals.length === 0 ? (
          // Notion처럼 빈 열에는 안내 글을 두지 않는다. 끌어 올 때만 놓을 자리를 보여 준다.
          isOver ? (
            <div className="flex h-10 items-center justify-center rounded-[10px] bg-white/70 text-[12px] text-[#2783de] shadow-[0_0_0_1px_rgba(39,131,222,0.35)]">
              여기로 이동
            </div>
          ) : null
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
        {onCreate ? (
          // Notion 보드의 열 아래 추가 버튼: 높이 40, 모서리 10, 열 색의 1px 선과 글자
          <button
            type="button"
            onClick={onCreate}
            className={cn(
              'flex h-10 w-full items-center gap-[9px] rounded-[10px] px-2.5 text-[13.5px] transition-colors hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 motion-reduce:transition-none',
              tone.line,
              tone.count,
            )}
          >
            <Plus className="ml-0.5 size-3.5" aria-hidden="true" />
            새 거래
          </button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * 보드를 불러오는 동안의 뼈대. Notion 보드와 같은 모양이다:
 * 열마다 머리 막대(높이 16, 폭 절반) 하나와 카드 자리(모서리 10) 몇 개.
 */
export function DealBoardSkeleton({ compact }: { compact: boolean }) {
  return (
    <div className="flex items-start gap-3 overflow-hidden" aria-hidden="true">
      {dealDisplayGroups.map((group, index) => (
        <div
          key={group.key}
          className={cn('shrink-0 px-2 pb-2', compact ? 'w-[228px]' : 'w-[260px]')}
        >
          <div className="flex h-10 items-center">
            <div className="h-4 w-1/2 animate-pulse rounded-[12px] bg-[rgba(66,35,3,0.06)] motion-reduce:animate-none" />
          </div>
          {Array.from({ length: 3 - (index % 2) }, (_, card) => (
            <div
              key={card}
              className="mb-2 h-[88px] animate-pulse rounded-[10px] bg-[rgba(66,35,3,0.045)] motion-reduce:animate-none"
            />
          ))}
        </div>
      ))}
    </div>
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
        'touch-none cursor-grab rounded-[10px] outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1',
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
  sale: 'bg-[rgba(0,118,217,0.16)] text-[#264a72]',
  jeonse: 'bg-[rgba(0,96,38,0.157)] text-[#2a533c]',
  monthly: 'bg-[rgba(196,88,0,0.204)] text-[#6a4222]',
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
  // 전세·월세는 임대/임차로 부른다
  const parties = getPartyLabels(transactionType);
  const partyParts = [
    deal.sellerContact?.name ? `${parties.sellerShort} ${deal.sellerContact.name}` : null,
    deal.buyerContact?.name ? `${parties.buyerShort} ${deal.buyerContact.name}` : null,
  ].filter(Boolean);

  return (
    <article
      title={health.isAtRisk ? health.description : undefined}
      className={cn(
        // Notion 보드 카드: 테두리 대신 1px 선 + 옅은 그림자
        'group relative overflow-hidden rounded-[10px] bg-white shadow-[0_4px_12px_rgba(25,25,25,0.027),0_1px_2px_rgba(25,25,25,0.02),0_0_0_1px_rgba(42,28,0,0.07)] transition-colors',
        compact ? 'px-2.5 py-2' : 'px-2.5 py-2.5',
        !dragPreview && 'hover:bg-[#fbfaf9]',
        dragPreview && 'h-full w-full shadow-[0_12px_32px_rgba(15,23,42,0.16),0_0_0_1px_rgba(42,28,0,0.07)]',
        selected && 'ring-1 ring-foreground/35',
        health.state === 'overdue' && !selected && 'ring-1 ring-destructive/35',
        health.state === 'stale' && !selected && 'ring-1 ring-warning/40',
      )}
    >
      <div className="flex items-start gap-1">
        {dragPreview ? (
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[13.5px] font-medium leading-[1.4] text-foreground">
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
            <p className="truncate text-[13.5px] font-medium leading-[1.4] text-foreground">
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
          className="mt-1 truncate text-[12px] leading-4 text-[#7d7a75]"
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
              'shrink-0 rounded-[3px] px-1.5 py-0.5 text-[11px]',
              TRANSACTION_TONE[transactionType] ??
                'bg-muted text-muted-foreground',
            )}
          >
            {TRANSACTION_LABEL[transactionType] ?? transactionType}
          </span>
        ) : null}
        {deal.isJointBrokerage ? (
          <span className="shrink-0 rounded-[3px] bg-[rgba(28,19,1,0.11)] px-1.5 py-0.5 text-[11px] text-[#494846]">
            공동
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          'mt-2 flex min-w-0 items-center gap-1.5 text-[11.5px]',
          urgent ? 'font-medium text-destructive-strong' : 'text-[#7d7a75]',
        )}
      >
        <CalendarClock className="size-3 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">
          {formatNextPaymentLabel(nextPayment, deal)}
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
