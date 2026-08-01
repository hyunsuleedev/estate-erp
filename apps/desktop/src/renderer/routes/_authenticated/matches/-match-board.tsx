import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  CircleDot,
  CircleOff,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import type { CalendarEvent, Match } from '@estate-erp/api-client';
import {
  buyerProgressStages,
  formatElapsedDays,
  formatMatchPrice,
  formatRequirementSummary,
  getActiveDealLink,
  getDefaultViewingStartDate,
  getInitials,
  getMatchStageDotClass,
  getMatchStageLabel,
  getMatchTitle,
  getNextMatchStage,
  getProgressNodeState,
  getUpcomingViewingEvent,
  matchStageOrder,
  shouldMoveToViewingOnSchedule,
  toDateTimeLocalInputValue,
  formatViewingEventTime,
  type MatchBoardStage,
  type MatchProgressStage,
  type MatchRowActions,
} from './-match-view-utils';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/domain';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => actions.onOpenDetail(match.id)}>
          상세 보기
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">단계 변경</DropdownMenuLabel>
        {matchStageOrder.slice(0, -1).map((stage) => (
          <DropdownMenuItem
            key={stage}
            onSelect={() => actions.onStageChange(match.id, stage)}
            className={cn(stage === match.stage && 'font-medium text-foreground')}
          >
            {stage === 'dealCreated' ? '거래 전환…' : getMatchStageLabel(stage)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => actions.onStageChange(match.id, 'closed')}
          disabled={match.stage === 'closed'}
        >
          <CircleOff className="size-4" />
          종료
        </DropdownMenuItem>
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
  actions: MatchRowActions;
}) {
  const [open, setOpen] = useState(false);
  const [viewingStartLocalValue, setViewingStartLocalValue] = useState('');
  const state = getProgressNodeState(match.stage, stage);
  const isClosed = match.stage === 'closed';
  const upcomingViewingEvent = getUpcomingViewingEvent(match);
  const disabled = actions.isUpdating || actions.isScheduling;

  const baseClassName = cn(
    'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
    state === 'completed' && 'text-success hover:bg-success-soft/70',
    state === 'current' && 'bg-info-soft text-info',
    state === 'pending' && 'text-muted-foreground hover:bg-muted',
    isClosed && 'bg-transparent text-muted-foreground/70 hover:bg-transparent',
  );
  const lineClassName = cn(
    'h-px w-3',
    state === 'completed' && !isClosed ? 'bg-success/50' : 'bg-border',
  );
  const label = getMatchStageLabel(stage);
  const stateIcon = upcomingViewingEvent && stage === 'viewing'
    ? <CalendarClock className="size-3.5" />
    : state === 'completed'
      ? <Check className="size-3.5" />
      : state === 'current'
        ? <CircleDot className="size-3.5" />
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
  state: 'completed' | 'current' | 'pending';
  upcomingViewingEvent: CalendarEvent | null;
  viewingStartLocalValue: string;
  onViewingStartLocalValueChange: (value: string) => void;
  onStageChange: (stage: string) => void;
  onScheduleViewing: (match: Match, startLocalValue: string) => void;
  disabled: boolean;
}) {
  const stageLabel = getMatchStageLabel(stage);
  const nextStage = getNextMatchStage(match.stage);
  const shouldAdvanceToViewing = shouldMoveToViewingOnSchedule(match.stage);

  if (stage === 'viewing') {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold">방문 작업</p>
          <p className="mt-1 text-xs text-muted-foreground">
            방문 일정을 캘린더에 남기고, 방문 완료 시 다음 단계로 넘깁니다.
          </p>
        </div>

        {upcomingViewingEvent && (
          <div className="rounded-md bg-info-soft px-3 py-2 text-xs text-info">
            예정된 방문: {formatViewingEventTime(upcomingViewingEvent)}
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
            disabled={disabled || !viewingStartLocalValue}
          >
            <CalendarClock className="size-4" />
            {upcomingViewingEvent
              ? '방문 일정 변경'
              : shouldAdvanceToViewing
                ? '일정 잡고 방문 단계로 이동'
                : '방문 일정 잡기'}
          </Button>

          {match.stage === 'viewing' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onStageChange('ownerContacted')}
              disabled={disabled}
            >
              <CheckCircle2 className="size-4" />
              방문 완료
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onStageChange('viewing')}
              disabled={disabled}
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
          {state === 'current'
            ? '현재 단계입니다. 다음 업무로 넘기거나 다른 단계로 이동할 수 있습니다.'
            : state === 'completed'
              ? '이미 지난 단계입니다. 필요하면 이 단계로 되돌립니다.'
              : '아직 도달하지 않은 단계입니다. 필요한 경우 바로 이동합니다.'}
        </p>
      </div>

      <div className="grid gap-2">
        {state !== 'current' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onStageChange(stage)}
            disabled={disabled}
          >
            {stage === 'dealCreated'
              ? '거래 전환…'
              : state === 'completed'
                ? '이 단계로 되돌리기'
                : '이 단계로 이동'}
          </Button>
        )}

        {state === 'current' && nextStage && (
          <Button
            type="button"
            size="sm"
            onClick={() => onStageChange(nextStage)}
            disabled={disabled}
          >
            {nextStage === 'dealCreated' ? '거래 전환…' : `다음: ${getMatchStageLabel(nextStage)}`}
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── 칸반 컬럼 / 카드 ─────────────────────────────────────────────────────────

export function MatchColumn({
  stage,
  matches,
  actions,
}: {
  stage: MatchBoardStage;
  matches: Match[];
  actions: MatchRowActions;
}) {
  return (
    <section className="flex w-[280px] shrink-0 flex-col overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5 text-[13px] font-medium">
        <span className={cn('size-2 rounded-full', getMatchStageDotClass(stage))} />
        <span>{getMatchStageLabel(stage)}</span>
        <Badge variant="secondary" className="ml-auto rounded-md bg-muted text-foreground tabular-nums">
          {matches.length}
        </Badge>
      </div>

      <div className="flex min-h-[360px] flex-1 flex-col gap-2 bg-muted/20 p-2">
        {matches.length === 0 ? (
          <div className="flex min-h-[140px] items-center justify-center rounded-md border border-dashed border-border/80 bg-background px-3 text-center text-xs text-muted-foreground">
            해당 단계의 매칭이 없습니다.
          </div>
        ) : (
          matches.map((match) => <MatchCard key={match.id} match={match} actions={actions} />)
        )}
      </div>
    </section>
  );
}

export function MatchCard({
  match,
  actions,
}: {
  match: Match;
  actions: MatchRowActions;
}) {
  const nextStage = getNextMatchStage(match.stage);
  const buyerName = match.buyerRequirement?.contact?.name ?? '미지정';

  return (
    <article
      className="cursor-pointer rounded-md border border-border/80 bg-background p-3 hover:bg-muted/20"
      onClick={() => actions.onOpenDetail(match.id)}
      title="클릭하여 상세보기"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(buyerName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{buyerName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {match.buyerRequirement?.contact?.phone ?? '연락처 없음'}
              </p>
            </div>
          </div>

          <div>
            <p className="truncate text-sm font-medium">{getMatchTitle(match)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {match.listing?.transactionType && (
                <StatusBadge kind="transactionType" status={match.listing.transactionType} size="sm" />
              )}
              <span className="text-xs font-medium tabular-nums text-foreground">
                {formatMatchPrice(match)}
              </span>
            </div>
          </div>
        </div>

        <MatchActionsMenu match={match} actions={actions} />
      </div>

      <div className="mt-3 border-t border-border/70 pt-2">
        <p className="text-xs text-muted-foreground">매수 요건</p>
        <p className="mt-1 text-[13px] text-pretty">{formatRequirementSummary(match)}</p>
      </div>

      {match.memo && (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{match.memo}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatElapsedDays(match.createdAt)}
        </span>
        {nextStage && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              actions.onStageChange(match.id, nextStage);
            }}
            disabled={actions.isUpdating}
          >
            {nextStage === 'dealCreated' ? '거래 전환' : '다음 단계'}
            <ArrowRight className="size-3" />
          </Button>
        )}
      </div>
    </article>
  );
}

// ── 칸반 하단 결과 패널 (거래 전환 / 종료) ──────────────────────────────────

export function ResultPanel({
  title,
  emptyMessage,
  matches,
  actions,
}: {
  title: string;
  emptyMessage: string;
  matches: Match[];
  actions: MatchRowActions;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
        <h2 className="text-balance text-[13px] font-semibold">{title}</h2>
        <Badge variant="secondary" className="rounded-md tabular-nums">{matches.length}</Badge>
      </div>
      <div className="divide-y divide-border/70">
        {matches.length === 0 ? (
          <div className="px-3 py-7 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          matches.map((match) => (
            <div
              key={match.id}
              className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/20"
              onClick={() => actions.onOpenDetail(match.id)}
              title="클릭하여 상세보기"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium">
                  {match.buyerRequirement?.contact?.name ?? '미지정'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {getMatchTitle(match)} · {formatMatchPrice(match)}
                </p>
              </div>
              <MatchActionsMenu match={match} actions={actions} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ── 진행 스텝퍼 (카드/상세 공용) ─────────────────────────────────────────────

export function MatchProgressTrack({
  match,
  actions,
}: {
  match: Match;
  actions: MatchRowActions;
}) {
  return (
    <div className="flex min-w-max items-center">
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
  );
}
