import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronsRight,
  Circle,
  CircleAlert,
  CircleDot,
  CircleOff,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import type { CalendarEvent, Match, MatchDealLink } from '@estate-erp/api-client';
import { MatchStage, normalizeMatchStage } from '@estate-erp/shared';
import {
  buyerProgressStages,
  getActiveDealLink,
  getDealProgressNodeState,
  getDealProgressStages,
  getDealStageLabel,
  getDefaultViewingStartDate,
  getMatchStageActionCopy,
  getMatchStageBlockReason,
  getMatchStageLabel,
  getMatchTitle,
  getNextMatchStage,
  getProgressNodeState,
  getUpcomingViewingEvent,
  shouldMoveToViewingOnSchedule,
  toDateTimeLocalInputValue,
  formatViewingEventTime,
  type MatchProgressStage,
  type MatchProgressNodeState,
  type MatchRowActions,
} from './-match-view-utils';
import { cn } from '@/lib/utils';

export type MatchProgressActions = Pick<
  MatchRowActions,
  'isUpdating' | 'isScheduling' | 'onStageChange' | 'onScheduleViewing'
>;
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ── 공통 액션 메뉴 ───────────────────────────────────────────────────────────

export function MatchActionsMenu({
  match,
  actions,
}: {
  match: Match;
  actions: MatchRowActions;
}) {
  const hasActiveDeal = getActiveDealLink(match) !== null;
  const currentStage = normalizeMatchStage(match.stage);
  const nextStage = getNextMatchStage(currentStage);
  const actionCopy = getMatchStageActionCopy(currentStage);
  const isClosed = currentStage === MatchStage.CLOSED;
  const isConverted = currentStage === MatchStage.DEAL_CREATED;
  const resumeStage = match.closedFromStage
    ? normalizeMatchStage(match.closedFromStage)
    : MatchStage.SUGGESTED;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${match.buyerRequirement?.contact?.name ?? '미지정'} · ${getMatchTitle(match)} 매칭 작업 메뉴`}
          title="매칭 작업 메뉴"
          disabled={actions.isUpdating}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <MoreVertical className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onSelect={() => actions.onOpenDetail(match.id)}>
          상세 보기
        </DropdownMenuItem>
        {!isClosed && !isConverted && nextStage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {getMatchStageLabel(currentStage)} 결과
            </DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => actions.onStageChange(match.id, nextStage)}
            >
              <ArrowRight className="size-4" />
              {actionCopy?.progressLabel ?? `다음: ${getMatchStageLabel(nextStage)}`}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => actions.onStageChange(match.id, MatchStage.CLOSED)}
            >
              <CircleOff className="size-4" />
              {actionCopy?.closeLabel ?? '이 단계에서 종료'}
            </DropdownMenuItem>
          </>
        )}
        {isClosed && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">종료된 매칭</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => actions.onStageChange(match.id, resumeStage)}
            >
              <ArrowRight className="size-4" />
              {match.closedFromStage
                ? `${getMatchStageLabel(resumeStage)}에서 다시 시작`
                : '내부 후보에서 다시 시작'}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => actions.onRequestDelete(match.id)}
          disabled={hasActiveDeal}
          title={hasActiveDeal ? '거래와 연결된 매칭은 삭제 대신 종료를 권장합니다' : undefined}
        >
          <Trash2 className="size-4" />
          삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── 단계 진행 노드 (popover 기반 단계 액션) ──────────────────────────────────

export function ProgressNode({
  match,
  stage,
  isLast,
  actions,
}: {
  match: Match;
  stage: MatchProgressStage;
  isLast: boolean;
  actions: MatchProgressActions;
}) {
  const [open, setOpen] = useState(false);
  const [viewingStartLocalValue, setViewingStartLocalValue] = useState('');
  const state = getProgressNodeState(match, stage);
  const isClosed = normalizeMatchStage(match.stage) === MatchStage.CLOSED;
  const isConverted = normalizeMatchStage(match.stage) === MatchStage.DEAL_CREATED;
  const upcomingViewingEvent = getUpcomingViewingEvent(match);
  const disabled = actions.isUpdating || actions.isScheduling;

  const baseClassName = cn(
    'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
    state === 'completed' && 'border-success/35 bg-success-soft text-success hover:bg-success-soft/80',
    state === 'current' && 'border-info/40 bg-info-soft text-info-strong ring-1 ring-info/15 hover:bg-info-soft/80',
    state === 'pending' && 'border-border bg-muted text-muted-foreground hover:bg-secondary',
    state === 'failed' && 'border-destructive/35 bg-destructive-soft text-destructive-strong',
    isConverted && stage === MatchStage.DEAL_CREATED && 'ring-2 ring-success/25 ring-offset-1',
  );
  const lineClassName = cn(
    'h-0.5 w-3 rounded-full',
    state === 'completed' && 'bg-success/45',
    state === 'current' && 'bg-info/45',
    state === 'pending' && 'bg-border',
    state === 'failed' && 'bg-destructive/45',
  );
  const label = getMatchStageLabel(stage);
  const stateIcon = upcomingViewingEvent && stage === MatchStage.VIEWING
    ? <CalendarClock className="size-3.5" />
    : state === 'completed'
      ? <Check className="size-3.5" />
      : state === 'current'
        ? <CircleDot className="size-3.5" />
        : state === 'failed'
          ? <CircleOff className="size-3.5" />
          : <Circle className="size-3.5" />;

  useEffect(() => {
    if (!open || stage !== 'viewing') {
      return;
    }

    setViewingStartLocalValue(
      toDateTimeLocalInputValue(
        upcomingViewingEvent ? new Date(upcomingViewingEvent.start) : getDefaultViewingStartDate(),
      ),
    );
  }, [open, stage, upcomingViewingEvent?.start]);

  if (isClosed) {
    return (
      <div className="flex items-center">
        <div className={baseClassName}>
          {stateIcon}
          {label}
        </div>
        {!isLast && <div className={lineClassName} />}
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(baseClassName, 'cursor-pointer')}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            disabled={disabled}
          >
            {stateIcon}
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 p-3"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <StageActionPopoverContent
            match={match}
            stage={stage}
            state={state}
            upcomingViewingEvent={upcomingViewingEvent}
            viewingStartLocalValue={viewingStartLocalValue}
            onViewingStartLocalValueChange={setViewingStartLocalValue}
            onStageChange={(nextStage) => {
              actions.onStageChange(match.id, nextStage);
              setOpen(false);
            }}
            onScheduleViewing={(matchToSchedule, startLocalValue) => {
              actions.onScheduleViewing(matchToSchedule, startLocalValue);
              setOpen(false);
            }}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>
      {!isLast && <div className={lineClassName} />}
    </div>
  );
}

function StageActionPopoverContent({
  match,
  stage,
  state,
  upcomingViewingEvent,
  viewingStartLocalValue,
  onViewingStartLocalValueChange,
  onStageChange,
  onScheduleViewing,
  disabled,
}: {
  match: Match;
  stage: MatchProgressStage;
  state: MatchProgressNodeState;
  upcomingViewingEvent: CalendarEvent | null;
  viewingStartLocalValue: string;
  onViewingStartLocalValueChange: (value: string) => void;
  onStageChange: (stage: string) => void;
  onScheduleViewing: (match: Match, startLocalValue: string) => void;
  disabled: boolean;
}) {
  const stageLabel = getMatchStageLabel(stage);
  const nextStage = getNextMatchStage(match.stage);
  const actionCopy = getMatchStageActionCopy(stage);
  const shouldAdvanceToViewing = shouldMoveToViewingOnSchedule(match.stage);
  const requestedStage = state === 'current' ? nextStage : stage;
  const blockReason = requestedStage
    ? getMatchStageBlockReason(match, requestedStage)
    : null;

  if (stage === MatchStage.VIEWING) {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold">방문 작업</p>
          <p className="mt-1 text-xs text-muted-foreground">
            방문 일정을 캘린더에 남기고, 방문 완료 시 협상 단계로 이동합니다.
          </p>
        </div>

        {upcomingViewingEvent && (
          <div className="rounded-md bg-info-soft px-3 py-2 text-xs text-info">
            예정된 방문: {formatViewingEventTime(upcomingViewingEvent)}
          </div>
        )}

        {blockReason && (
          <div
            role="alert"
            className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning"
          >
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{blockReason}</span>
          </div>
        )}

        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          <span>방문 일시</span>
          <Input
            type="datetime-local"
            value={viewingStartLocalValue}
            onChange={(event) => onViewingStartLocalValueChange(event.target.value)}
            disabled={disabled}
          />
        </label>

        <div className="grid gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => onScheduleViewing(match, viewingStartLocalValue)}
            disabled={disabled || !viewingStartLocalValue || Boolean(blockReason)}
          >
            <CalendarClock className="size-4" />
            {upcomingViewingEvent
              ? '방문 일정 변경'
              : shouldAdvanceToViewing
                ? '일정 잡고 방문 단계로 이동'
                : '방문 일정 잡기'}
          </Button>

          {normalizeMatchStage(match.stage) === MatchStage.VIEWING ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onStageChange(MatchStage.NEGOTIATING)}
                disabled={disabled}
              >
                <CheckCircle2 className="size-4" />
                {actionCopy?.progressLabel ?? '방문 완료하고 협상으로'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                onClick={() => onStageChange(MatchStage.CLOSED)}
                disabled={disabled}
              >
                <CircleOff className="size-4" />
                {actionCopy?.closeLabel ?? '이 단계에서 종료'}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onStageChange(MatchStage.VIEWING)}
              disabled={disabled || Boolean(blockReason)}
            >
              방문 단계로 이동
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{stageLabel}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {stage === MatchStage.VIEWING_CONFIRMED
            ? '집주인·점유자에게 임장 가능 여부를 확인한 뒤 다음 단계로 진행합니다.'
            : state === 'current'
            ? '업무 결과를 선택해 다음 단계로 진행하거나 이 단계에서 종료합니다.'
            : state === 'completed'
              ? '이미 지난 단계입니다. 필요하면 이 단계로 되돌립니다.'
              : '아직 도달하지 않은 단계입니다. 앞 단계를 완료한 뒤 진행합니다.'}
        </p>
      </div>

      {blockReason && (
        <div
          role="alert"
          className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning"
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{blockReason}</span>
        </div>
      )}

      <div className="grid gap-2">
        {state !== 'current' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onStageChange(stage)}
            disabled={disabled || Boolean(blockReason)}
          >
            {stage === MatchStage.DEAL_CREATED
              ? '거래 전환…'
              : state === 'completed'
                ? '이 단계로 되돌리기'
                : '이 단계로 이동'}
          </Button>
        )}

        {state === 'current' && nextStage && (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => onStageChange(nextStage)}
              disabled={disabled || Boolean(blockReason)}
            >
              {actionCopy?.progressLabel ?? (
                nextStage === MatchStage.DEAL_CREATED
                  ? '거래 전환…'
                  : `다음: ${getMatchStageLabel(nextStage)}`
              )}
              <ArrowRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive-soft hover:text-destructive"
              onClick={() => onStageChange(MatchStage.CLOSED)}
              disabled={disabled}
            >
              <CircleOff className="size-4" />
              {actionCopy?.closeLabel ?? '이 단계에서 종료'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── 진행 스텝퍼 (카드/상세 공용) ─────────────────────────────────────────────

export function MatchProgressTrack({
  match,
  actions,
}: {
  match: Match;
  actions: MatchProgressActions;
}) {
  const isClosed = normalizeMatchStage(match.stage) === MatchStage.CLOSED;
  const isConverted =
    normalizeMatchStage(match.stage) === MatchStage.DEAL_CREATED;
  const activeDeal = getActiveDealLink(match);

  if (isConverted && activeDeal) {
    return <DealHandoffTrack match={match} deal={activeDeal} actions={actions} />;
  }

  const stages = isClosed
    ? buyerProgressStages.filter((stage) => stage !== MatchStage.DEAL_CREATED)
    : buyerProgressStages;

  return (
    <div className="flex min-w-max items-center">
      {stages.map((stage, index) => (
        <ProgressNode
          key={stage}
          match={match}
          stage={stage}
          isLast={!isClosed && index === stages.length - 1}
          actions={actions}
        />
      ))}
      {isClosed && (
        <div className="inline-flex h-7 items-center gap-1.5 rounded-md border border-destructive/35 bg-destructive-soft px-2 text-xs font-semibold text-destructive-strong whitespace-nowrap">
          <CircleOff className="size-3.5" />
          종료
        </div>
      )}
    </div>
  );
}

// ── 거래 전환 후: 매칭 요약 + 거래관리 파이프라인 이어달리기 ──────────────────
// 매칭 단계는 "매칭 완료" 칩으로 접고, 연결 Deal의 단계를 읽기 전용으로 이어서
// 보여준다. 거래 노드를 클릭하면 거래관리(/deals)로 이동해 실제 단계를 관리한다.

function DealHandoffTrack({
  match,
  deal,
  actions,
}: {
  match: Match;
  deal: MatchDealLink;
  actions: MatchProgressActions;
}) {
  const navigate = useNavigate();
  const dealStages = getDealProgressStages(deal.stage);

  const goToDeal = () => {
    navigate({ to: '/deals', search: { dealId: deal.id } });
  };

  return (
    <div data-deal-handoff-track className="flex min-w-max items-center">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="완료된 매칭 단계 펼쳐보기"
            className="inline-flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-success/35 bg-success-soft px-2 text-xs font-semibold text-success outline-none hover:bg-success-soft/80 focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <Check className="size-3.5" />
            매칭 완료
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto max-w-[min(90vw,640px)] p-3"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            완료된 매칭 단계
          </p>
          <div className="flex items-center overflow-x-auto">
            {buyerProgressStages.map((stage, index) => (
              <ProgressNode
                key={stage}
                match={match}
                stage={stage}
                isLast={index === buyerProgressStages.length - 1}
                actions={actions}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <ChevronsRight
        aria-hidden="true"
        className="mx-0.5 size-3.5 shrink-0 text-success/60"
      />

      {dealStages.map((stage, index) => {
        const state = getDealProgressNodeState(deal.stage, stage);
        return (
          <div key={stage} className="flex items-center">
            <button
              type="button"
              title="거래관리에서 진행 · 클릭하여 이동"
              aria-label={`거래 ${getDealStageLabel(stage)} 단계 — 거래관리로 이동`}
              className={cn(
                'inline-flex h-7 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                state === 'completed' &&
                  'border-success/35 bg-success-soft text-success hover:bg-success-soft/80',
                state === 'current' &&
                  'border-info/40 bg-info-soft text-info-strong ring-1 ring-info/15 hover:bg-info-soft/80',
                state === 'pending' &&
                  'border-border bg-muted text-muted-foreground hover:bg-secondary',
              )}
              onClick={(event) => {
                event.stopPropagation();
                goToDeal();
              }}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              {state === 'completed' ? (
                <Check className="size-3.5" />
              ) : state === 'current' ? (
                <CircleDot className="size-3.5" />
              ) : (
                <Circle className="size-3.5" />
              )}
              {getDealStageLabel(stage)}
            </button>
            {index < dealStages.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-3 rounded-full',
                  state === 'completed' && 'bg-success/45',
                  state === 'current' && 'bg-info/45',
                  state === 'pending' && 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
