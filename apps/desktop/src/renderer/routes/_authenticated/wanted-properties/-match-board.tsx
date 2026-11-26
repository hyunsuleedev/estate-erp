import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { refreshMatchData } from '@/queries/matches';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronsRight,
  Circle,
  CircleAlert,
  CircleDashed,
  CircleDot,
  CircleOff,
  MoreVertical,
  Route,
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
  getMatchStageDotClass,
  getMatchStageHeaderClass,
  getMatchStageLabel,
  getMatchTitle,
  getNextMatchStage,
  getProgressNodeState,
  getUpcomingViewingEvent,
  formatViewingEventTime,
  shouldMoveToViewingOnSchedule,
  toDateTimeLocalInputValue,
  type MatchProgressStage,
  type MatchProgressNodeState,
  type MatchRowActions,
} from './-match-view-utils';
import { cn } from '@/lib/utils';
import { getStatusMeta } from '@/lib/status-config';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { useTabStore } from '@/features/tabs/store/useTabStore';

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
              // 완료한 손님의 매칭은 손님을 다시 활성으로 바꾼 뒤에 연다 (서버도 막는다)
              disabled={match.buyerRequirement?.status === 'completed'}
              title={
                match.buyerRequirement?.status === 'completed'
                  ? '완료한 손님입니다. 손님 상태를 활성으로 바꾼 뒤 다시 시작해 주세요'
                  : undefined
              }
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

/** 띠 모양 칸의 화살표 윤곽. 첫 칸은 왼쪽이 반듯하고 마지막 칸은 오른쪽이 반듯하다. */
const BAND_CLIP = {
  first: 'polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%)',
  middle: 'polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%, 9px 50%)',
  last: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 9px 50%)',
} as const;

/**
 * 띠에서 지금 단계는 단계 색을 꽉 채우고 흰 글씨로 쓴다 (사용자 의견 2026-11-22: 옅은 띠는 파악하기 힘들다).
 * 옅은 단계 색(…-soft) 위의 같은 색 글씨로는 "지금 어디인지"가 한눈에 들어오지 않았다.
 * 주황·노랑은 흰 글씨가 읽히도록 토큰보다 한 단계 어두운 값을 쓴다.
 */
const BAND_CURRENT_CLASS: Record<string, string> = {
  gray: 'bg-muted-foreground-strong',
  neutral: 'bg-muted-foreground-strong',
  info: 'bg-info-strong',
  orange: 'bg-[#c2650b]',
  violet: 'bg-violet',
  pink: 'bg-pink',
  warning: 'bg-[#a8721a]',
  success: 'bg-success',
  destructive: 'bg-destructive-strong',
};

export function ProgressNode({
  match,
  stage,
  isLast,
  actions,
  variant = 'chip',
  bandPosition = 'middle',
}: {
  match: Match;
  stage: MatchProgressStage;
  isLast: boolean;
  actions: MatchProgressActions;
  /** band: 매물관리의 매칭 펼침과 같은 화살표 띠의 한 칸 (희망매물의 매칭 줄) */
  variant?: 'chip' | 'band';
  bandPosition?: keyof typeof BAND_CLIP;
}) {
  const [open, setOpen] = useState(false);
  const [viewingStartLocalValue, setViewingStartLocalValue] = useState('');
  const state = getProgressNodeState(match, stage);
  const isClosed = normalizeMatchStage(match.stage) === MatchStage.CLOSED;
  const isConverted = normalizeMatchStage(match.stage) === MatchStage.DEAL_CREATED;
  const upcomingViewingEvent = getUpcomingViewingEvent(match);
  const disabled = actions.isUpdating || actions.isScheduling;

  const isBand = variant === 'band';
  // 누를 수 없는 칸(종료 · 거래로 넘긴 매칭)은 올려도 색이 바뀌지 않는다
  const isStatic = isClosed || (isConverted && getActiveDealLink(match) !== null);
  // 거래로 넘긴 매칭의 마지막 칸은 "끝낸 단계"가 아니라 지금 서 있는 자리로 채워 보인다
  const bandState: MatchProgressNodeState =
    isConverted && stage === MatchStage.DEAL_CREATED ? 'current' : state;
  const bandClassName = cn(
    // 윤곽을 잘라 낸 모양이라 테두리 초점 표시는 보이지 않는다. 초점은 밝기와 밑줄로 알린다.
    'flex h-9 w-full min-w-0 items-center gap-0.5 whitespace-nowrap text-[13px] outline-none transition-[background-color,color,scale] duration-150 focus-visible:brightness-95 focus-visible:[&>span]:underline',
    // 좁은 창(왼쪽 메뉴를 편 1440px)에서도 "✓ 고객 관심"이 잘리지 않는 여백
    bandPosition === 'first' ? 'rounded-l-lg pl-3 pr-2.5' : 'pl-4 pr-2.5',
    bandPosition === 'last' && 'rounded-r-lg',
    bandState === 'completed' &&
      (isClosed
        ? 'bg-[#e3e2df] text-muted-foreground-strong'
        : cn('bg-[#cfe6d2] font-medium text-[#0a5c51]', !isStatic && 'hover:bg-[#bfdcc3]')),
    bandState === 'current' &&
      cn('font-semibold text-white', BAND_CURRENT_CLASS[getStatusMeta('matchStage', stage).tone]),
    bandState === 'pending' &&
      cn('bg-[#efeeec] text-muted-foreground-strong', !isStatic && 'hover:bg-[#e4e3e0] hover:text-foreground'),
    bandState === 'failed' && 'bg-[#d13a3a] font-semibold text-white',
  );
  const baseClassName = isBand ? bandClassName : cn(
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
  // 띠: 끝낸 단계만 체크를 붙인다. 지금 단계는 색으로, 남은 단계는 글자만으로 충분하다.
  const bandContent = (
    <>
      {bandState === 'completed' && !isClosed && (
        <Check className="size-3 shrink-0" strokeWidth={2.4} aria-hidden="true" />
      )}
      <span className="truncate">{label}</span>
    </>
  );
  const wrapperClassName = isBand ? 'flex min-w-0 flex-1' : 'flex items-center';
  const bandStyle = isBand ? { clipPath: BAND_CLIP[bandPosition] } : undefined;
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

  // 종료했거나 거래로 넘긴 매칭은 단계를 보여 주기만 한다. 거래로 넘긴 뒤의 진행은 거래관리가 맡는다
  // (여기서 단계를 되돌리면 거래는 진행 중인데 매칭만 예전 단계로 돌아간다. 서버도 막는다).
  if (isStatic) {
    return (
      <div className={wrapperClassName} role={isBand ? 'listitem' : undefined}>
        <div
          className={baseClassName}
          style={bandStyle}
          aria-current={isBand && bandState === 'current' ? 'step' : undefined}
        >
          {isBand ? bandContent : (
            <>
              {stateIcon}
              {label}
            </>
          )}
        </div>
        {!isBand && !isLast && <div className={lineClassName} />}
      </div>
    );
  }

  return (
    <div className={wrapperClassName} role={isBand ? 'listitem' : undefined}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              baseClassName,
              'cursor-pointer',
              isBand && 'active:scale-[0.98] disabled:cursor-wait motion-reduce:active:scale-100',
            )}
            style={bandStyle}
            aria-current={isBand && bandState === 'current' ? 'step' : undefined}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            disabled={disabled}
          >
            {isBand ? bandContent : (
              <>
                {stateIcon}
                {label}
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          // 매물관리의 단계 고르는 목록과 같은 판: 테두리 대신 옅은 선 한 겹 + 얕은 그림자, 모서리 10px
          className="w-[304px] overflow-hidden rounded-[10px] border-0 p-0 shadow-[0_0_0_1px_rgba(42,28,0,0.07),0_5px_8px_rgba(25,25,25,0.027),0_20px_24px_rgba(25,25,25,0.05)]"
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
      {!isBand && !isLast && <div className={lineClassName} />}
    </div>
  );
}

// ── 단계 작업 창 ─────────────────────────────────────────────────────────────
// 매물관리 매칭 펼침의 "진행" 카드와 같은 짜임이다: 머리(단계 알약 + 몇 번째) → 속성 줄 → 선으로 나눈 버튼 줄.
// 설명 문장을 두지 않는다. 지금 단계에서는 "다음 할 일"을, 다른 단계로 옮길 때는 "지금 → 옮길 곳"을 한 줄로 보여 준다
// (시안: docs/mockups/wanted-properties/stage-popups.html, 사용자 결정 2026-11-22).

function StageChip({ stage }: { stage: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full pl-[7px] pr-[9px] text-[13px] font-medium leading-5',
        getMatchStageHeaderClass(stage),
      )}
    >
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', getMatchStageDotClass(stage))} />
      {getMatchStageLabel(stage)}
    </span>
  );
}

function PopoverPropertyRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-[30px] grid-cols-[94px_minmax(0,1fr)] items-center">
      <dt className="flex items-center gap-[7px] whitespace-nowrap px-1.5 text-muted-foreground [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-sidebar-icon">
        {icon}
        {label}
      </dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1.5 px-1.5 text-foreground">{children}</dd>
    </div>
  );
}

/** 버튼 줄의 주 버튼 */
const POPOVER_PRIMARY_CLASS = 'h-7 gap-1.5 px-2.5 text-[13px]';
/** 버튼 줄의 조용한 글자 버튼 */
const POPOVER_QUIET_CLASS =
  'inline-flex h-7 items-center rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50';
/** 이 단계에서 끝내기: 오른쪽 끝에 물려 두고, 올렸을 때만 빨갛게 드러난다 (실수로 누르기 어렵게) */
const POPOVER_CLOSE_CLASS = cn(POPOVER_QUIET_CLASS, 'ml-auto hover:bg-destructive-soft hover:text-destructive-strong');

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
  const currentStage = normalizeMatchStage(match.stage);
  const nextStage = getNextMatchStage(match.stage);
  const actionCopy = getMatchStageActionCopy(stage);
  const shouldAdvanceToViewing = shouldMoveToViewingOnSchedule(match.stage);
  const requestedStage = state === 'current' ? nextStage : stage;
  const blockReason = requestedStage
    ? getMatchStageBlockReason(match, requestedStage)
    : null;
  const isCurrent = state === 'current';
  const isViewingStep = stage === MatchStage.VIEWING;
  const stageIndex = buyerProgressStages.indexOf(stage);
  const currentIndex = buyerProgressStages.indexOf(currentStage as MatchProgressStage);
  // 남은 단계로 바로 옮기면 그 사이 단계를 건너뛴다. 무엇을 건너뛰는지 이름으로 알린다.
  const skippedLabels =
    state === 'pending' && currentIndex >= 0
      ? buyerProgressStages.slice(currentIndex + 1, stageIndex).map(getMatchStageLabel)
      : [];
  // "이 단계에서 종료"의 이름에서 뒤의 " · 종료"는 뗀다 — 오른쪽 끝의 자리와 빨간 강조가 종료임을 알린다
  const closeText = (actionCopy?.closeLabel ?? '이 단계에서 종료').replace(/ · 종료$/, '');
  const stateText = isCurrent ? '지금 단계' : state === 'completed' ? '끝낸 단계' : '남은 단계';
  // 막힌 까닭(매물 확인 · 보류 · 종료)은 매물 쪽에서 푼다. 이 목록은 그대로 두고 매물 상세를 새 탭으로 연다.
  const createTab = useTabStore((store) => store.createTab);
  const propertyId = match.propertyId || null;
  const openProperty = () => {
    if (!propertyId) return;
    const route = `/properties/${propertyId}`;
    const meta = getRouteMeta(route);
    createTab({ route, kind: meta.kind, title: meta.title });
  };

  const viewingRow = isViewingStep && (
    <PopoverPropertyRow icon={<CalendarClock />} label="임장 일시">
      <Input
        type="datetime-local"
        aria-label="임장 일시"
        value={viewingStartLocalValue}
        onChange={(event) => onViewingStartLocalValueChange(event.target.value)}
        disabled={disabled}
        // 평소에는 글처럼 보이고, 올리거나 고칠 때만 칸이 드러난다. 테두리는 색이 아니라 두께로 없앤다.
        className="-mx-1.5 h-7 w-auto rounded-md border-0 bg-transparent px-1.5 py-0 text-[13px] tabular-nums shadow-none hover:bg-foreground/[0.05] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-ring/40 md:text-[13px]"
      />
    </PopoverPropertyRow>
  );

  // 임장을 날짜보다 먼저 마쳤거나(임장 완료 · 고객 검토로) 이미 고객 검토 · 협상으로 넘어갔는데 앞날의 임장 일정이 남아 있으면
  // 캘린더 · 연락처에 "다가오는 임장"으로 계속 보인다. 지금 단계 창에서 한 줄로 알리고 그 자리에서 지우게 한다.
  const queryClient = useQueryClient();
  const staleViewingEvent =
    upcomingViewingEvent &&
    isCurrent &&
    (isViewingStep ||
      currentStage === MatchStage.BUYER_REVIEWING ||
      currentStage === MatchStage.NEGOTIATING)
      ? upcomingViewingEvent
      : null;
  const removeViewingEvent = useMutation({
    mutationFn: (eventId: string) => api.calendarEvents.remove(eventId),
    onSuccess: async () => {
      toast.success('임장 일정을 지웠습니다');
      await Promise.all([
        refreshMatchData(queryClient, queryClient, match.buyerReqId),
        queryClient.invalidateQueries({ queryKey: ['calendar-events'] }),
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
      ]);
    },
    onError: (error: Error) =>
      toast.error(apiErrorMessage(error, '임장 일정을 지우지 못했습니다. 다시 시도해 주세요.')),
  });

  const scheduleLabel = upcomingViewingEvent
    ? '임장 일정 변경'
    : shouldAdvanceToViewing
      ? '일정 잡고 임장으로'
      : '임장 일정 잡기';
  const scheduleDisabled = disabled || !viewingStartLocalValue || Boolean(blockReason);

  return (
    <div className="text-[13px] leading-5">
      <div className="flex items-center gap-2 px-3 pb-1.5 pt-2.5">
        <StageChip stage={stage} />
        <span className="text-xs tabular-nums text-muted-foreground">
          {stageIndex + 1}/{buyerProgressStages.length}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{stateText}</span>
      </div>

      <dl className="px-1.5 pb-2">
        {isCurrent ? (
          actionCopy && (
            <PopoverPropertyRow icon={<CircleDashed />} label="다음 할 일">
              {actionCopy.nextTask}
            </PopoverPropertyRow>
          )
        ) : (
          <PopoverPropertyRow icon={<Route />} label="이동">
            <StageChip stage={currentStage} />
            <ArrowRight aria-hidden="true" className="size-3 shrink-0 text-sidebar-icon" />
            <StageChip stage={stage} />
          </PopoverPropertyRow>
        )}
        {viewingRow}
      </dl>

      {skippedLabels.length > 0 && (
        <p className="-mt-0.5 px-3 pb-2 text-xs leading-[17px] text-muted-foreground">
          {skippedLabels.join(' · ')} 단계를 건너뜁니다.
        </p>
      )}

      {staleViewingEvent && (
        <div
          data-stale-viewing-event
          className="mx-2 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-muted px-2.5 py-[7px] text-xs leading-[17px] text-muted-foreground-strong"
        >
          <CalendarClock className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            {isViewingStep
              ? `임장 일정이 ${formatViewingEventTime(staleViewingEvent)}로 남아 있습니다. 먼저 다녀왔다면 지워 두세요.`
              : `임장 일정이 ${formatViewingEventTime(staleViewingEvent)}에 잡혀 있습니다. 이미 다녀온 임장이면 지워 두세요.`}
          </span>
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-2 disabled:opacity-50"
            disabled={removeViewingEvent.isPending}
            onClick={() => removeViewingEvent.mutate(staleViewingEvent.id)}
          >
            일정 지우기
          </button>
        </div>
      )}

      {blockReason && (
        <div
          role="alert"
          className="mx-2 mb-2 flex gap-2 rounded-md bg-warning-soft px-2.5 py-[7px] text-xs leading-[17px] text-warning-strong"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          <span>
            {blockReason}
            {propertyId && (
              <>
                {' '}
                <button
                  type="button"
                  data-match-open-property
                  className="font-medium underline underline-offset-2 hover:text-foreground"
                  onClick={openProperty}
                >
                  매물 열기
                </button>
              </>
            )}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 border-t border-border bg-muted/60 px-2 py-1.5">
        {isViewingStep && isCurrent ? (
          <>
            <Button
              type="button"
              size="sm"
              className={POPOVER_PRIMARY_CLASS}
              onClick={() => onStageChange(MatchStage.BUYER_REVIEWING)}
              disabled={disabled}
            >
              <CheckCircle2 className="size-3.5" />
              {actionCopy?.progressLabel ?? '임장 완료 · 고객 검토로'}
            </Button>
            <button
              type="button"
              className={POPOVER_QUIET_CLASS}
              onClick={() => onScheduleViewing(match, viewingStartLocalValue)}
              disabled={scheduleDisabled}
            >
              {scheduleLabel}
            </button>
            <button
              type="button"
              className={POPOVER_CLOSE_CLASS}
              onClick={() => onStageChange(MatchStage.CLOSED)}
              disabled={disabled}
            >
              {closeText}
            </button>
          </>
        ) : isViewingStep ? (
          <>
            <Button
              type="button"
              size="sm"
              className={POPOVER_PRIMARY_CLASS}
              onClick={() => onScheduleViewing(match, viewingStartLocalValue)}
              disabled={scheduleDisabled}
            >
              <CalendarClock className="size-3.5" />
              {scheduleLabel}
            </Button>
            <button
              type="button"
              className={POPOVER_QUIET_CLASS}
              onClick={() => onStageChange(MatchStage.VIEWING)}
              disabled={disabled || Boolean(blockReason)}
            >
              {state === 'completed' ? '이 단계로 되돌리기' : '일정 없이 이동'}
            </button>
          </>
        ) : isCurrent ? (
          nextStage && (
            <>
              <Button
                type="button"
                size="sm"
                className={POPOVER_PRIMARY_CLASS}
                onClick={() => onStageChange(nextStage)}
                disabled={disabled || Boolean(blockReason)}
              >
                <Check className="size-3.5" />
                {actionCopy?.progressLabel ?? (
                  nextStage === MatchStage.DEAL_CREATED
                    ? '거래 전환…'
                    : `다음: ${getMatchStageLabel(nextStage)}`
                )}
              </Button>
              <button
                type="button"
                className={POPOVER_CLOSE_CLASS}
                onClick={() => onStageChange(MatchStage.CLOSED)}
                disabled={disabled}
              >
                {closeText}
              </button>
            </>
          )
        ) : (
          <Button
            type="button"
            size="sm"
            className={POPOVER_PRIMARY_CLASS}
            onClick={() => onStageChange(stage)}
            disabled={disabled || Boolean(blockReason)}
          >
            {stage === MatchStage.DEAL_CREATED ? (
              <>
                <Check className="size-3.5" />
                거래 전환…
              </>
            ) : state === 'completed' ? (
              <>
                <ArrowLeft className="size-3.5" />
                이 단계로 되돌리기
              </>
            ) : (
              <>
                <ArrowRight className="size-3.5" />
                이 단계로 이동
              </>
            )}
          </Button>
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

// ── 단계 띠 (희망매물의 매칭 줄) ─────────────────────────────────────────────
// 매물관리의 매칭 펼침과 같은 화살표 띠. 칸을 누르면 그 단계의 작업 창(다음으로 · 이 단계에서 종료 ·
// 임장 일정)이 뜬다 — 스텝퍼(MatchProgressTrack)와 같은 창이다. 일곱 단계를 늘 다 보여 주고,
// 종료한 매칭은 끝난 칸을 빨갛게, 거래로 넘긴 매칭은 마지막 칸을 채워 보여 준다.
// 단계마다 도달한 날짜는 넣지 않았다: 활동 기록을 매칭마다 따로 불러야 해서, 고객을 모두 펼쳐 두는
// 이 화면에서는 요청이 매칭 수만큼 나간다.

export function MatchStageBand({
  match,
  actions,
}: {
  match: Match;
  actions: MatchProgressActions;
}) {
  return (
    <div
      data-match-stage-band
      role="list"
      aria-label="매칭 진행 단계"
      className="flex min-w-[560px] gap-[3px]"
    >
      {buyerProgressStages.map((stage, index) => (
        <ProgressNode
          key={stage}
          variant="band"
          bandPosition={
            index === 0
              ? 'first'
              : index === buyerProgressStages.length - 1
                ? 'last'
                : 'middle'
          }
          match={match}
          stage={stage}
          isLast={index === buyerProgressStages.length - 1}
          actions={actions}
        />
      ))}
    </div>
  );
}

// ── 거래 단계 띠 (읽기 전용) ─────────────────────────────────────────────────
// 매칭 단계 띠(MatchStageBand)와 같은 화살표 띠로 거래가 어디까지 왔는지만 보여 준다. 단계는 거래관리에서 바꾸므로
// 여기서는 누를 수 없다(쓰는 쪽이 띠를 거래 화면으로 가는 링크로 감싼다). 가계약은 그 단계에 머무를 때만 칸이 생긴다.

export function DealStageBand({ stage, className }: { stage: string; className?: string }) {
  const stages = getDealProgressStages(stage);
  return (
    <div
      data-deal-stage-band
      role="list"
      aria-label="거래 진행 단계"
      className={cn('flex gap-[3px]', className)}
    >
      {stages.map((nodeStage, index) => {
        const state = getDealProgressNodeState(stage, nodeStage);
        const position: keyof typeof BAND_CLIP =
          index === 0 ? 'first' : index === stages.length - 1 ? 'last' : 'middle';
        return (
          <div key={nodeStage} role="listitem" className="flex min-w-0 flex-1">
            <div
              aria-current={state === 'current' ? 'step' : undefined}
              style={{ clipPath: BAND_CLIP[position] }}
              className={cn(
                'flex h-9 w-full min-w-0 items-center gap-0.5 whitespace-nowrap text-[13px]',
                position === 'first' ? 'rounded-l-lg pl-3 pr-2.5' : 'pl-4 pr-2.5',
                position === 'last' && 'rounded-r-lg',
                state === 'completed' && 'bg-[#cfe6d2] font-medium text-[#0a5c51]',
                state === 'current' &&
                  cn('font-semibold text-white', BAND_CURRENT_CLASS[getStatusMeta('dealStage', nodeStage).tone]),
                state === 'pending' && 'bg-[#efeeec] text-muted-foreground-strong',
              )}
            >
              {state === 'completed' && (
                <Check className="size-3 shrink-0" strokeWidth={2.4} aria-hidden="true" />
              )}
              <span className="truncate">{getDealStageLabel(nodeStage)}</span>
            </div>
          </div>
        );
      })}
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
