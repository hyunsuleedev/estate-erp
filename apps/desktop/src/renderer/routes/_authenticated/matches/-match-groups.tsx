import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import type { Match } from '@estate-erp/api-client';
import { MatchStage, normalizeMatchStage } from '@estate-erp/shared';
import {
  formatMatchPrice,
  formatRequirementSummary,
  formatViewingEventTime,
  getBuyerRequirementSummaryParts,
  getListingAddress,
  getMatchTitle,
  getUpcomingViewingEvent,
  type MatchRowActions,
  type MatchStageGroup,
} from './-match-view-utils';
import { MatchActionsMenu, MatchProgressTrack } from './-match-board';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

// ── 고객별 뷰: Contact → BuyerRequirement → Match ───────────────────────────

export function BuyerMatchGroup({
  buyerRequirement,
  matches,
  actions,
  selected,
  onSelectedChange,
}: {
  buyerRequirement: NonNullable<Match['buyerRequirement']>;
  matches: Match[];
  actions: MatchRowActions;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const buyerName = buyerRequirement.contact?.name ?? '미지정';
  const activeCount = matches.filter((match) => {
    const stage = normalizeMatchStage(match.stage);
    return stage !== MatchStage.DEAL_CREATED && stage !== MatchStage.CLOSED;
  }).length;
  const convertedCount = matches.filter(
    (match) => normalizeMatchStage(match.stage) === MatchStage.DEAL_CREATED,
  ).length;
  const closedCount = matches.filter(
    (match) => normalizeMatchStage(match.stage) === MatchStage.CLOSED,
  ).length;
  const requirementSummary = getBuyerRequirementSummaryParts(buyerRequirement);
  return (
    <section
      data-buyer-match-group
      data-match-selected={selected ? 'true' : undefined}
      aria-label={`${buyerName} 매칭 그룹`}
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-background shadow-xs',
        selected && 'border-foreground/25',
      )}
    >
      <header
        data-buyer-summary-header
        className={cn(
          'bg-muted/30 px-3 py-2.5',
          expanded && 'border-b border-border/70',
        )}
      >
        <div className="flex min-w-0 items-start gap-2">
          <Checkbox
            checked={selected}
            onCheckedChange={(value) => onSelectedChange(value === true)}
            aria-label={`${buyerName} 선택`}
            className="mt-1"
          />

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`${buyerName} 매칭 ${expanded ? '접기' : '펼치기'}`}
            aria-expanded={expanded}
            className="shrink-0 text-muted-foreground"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </Button>

          <div
            data-buyer-summary-row
            className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1 xl:flex-nowrap"
          >
            <div className="flex min-w-[170px] max-w-[240px] items-center gap-1.5">
              <p className="min-w-0 truncate text-[13px] font-semibold">
                {buyerName}
              </p>
              {buyerRequirement.urgency === 'urgent' && (
                <StatusBadge kind="buyerUrgency" status="urgent" size="sm" />
              )}
              <span className="shrink-0 text-border">·</span>
              <p
                title={buyerRequirement.contact?.phone ?? '연락처 없음'}
                className="min-w-0 truncate text-xs text-muted-foreground"
              >
                {buyerRequirement.contact?.phone ?? '연락처 없음'}
              </p>
            </div>

            <dl
              data-buyer-requirement-summary
              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1 xl:flex-nowrap"
            >
              <BuyerRequirementSummaryItem
                label="희망 지역"
                value={requirementSummary.regionText}
                className="min-w-[150px] flex-1 xl:max-w-[220px]"
              />
              <BuyerRequirementSummaryItem
                label="매물 유형"
                value={requirementSummary.siteTypeText}
                className="min-w-[100px] shrink-0"
              />
              <BuyerRequirementSummaryItem
                label="예산"
                value={requirementSummary.budgetText}
                className="min-w-40 shrink-0"
                emphasized
              />
            </dl>

            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-xs tabular-nums">
              <span className="text-muted-foreground">
                매칭 {matches.length}
              </span>
              {activeCount > 0 && (
                <span className="rounded-md border border-info/25 bg-info-soft px-1.5 py-0.5 font-medium text-info-strong">
                  진행 {activeCount}
                </span>
              )}
              {convertedCount > 0 && (
                <span className="rounded-md border border-success/25 bg-success-soft px-1.5 py-0.5 font-medium text-success">
                  거래 {convertedCount}
                </span>
              )}
              {closedCount > 0 && (
                <span className="rounded-md border border-destructive/25 bg-destructive-soft px-1.5 py-0.5 font-medium text-destructive-strong">
                  종료 {closedCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {expanded && buyerRequirement.memo && (
          <dl
            data-buyer-expanded-memo
            className="ml-14 mt-1.5 grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-2 border-t border-border/60 pt-1.5 text-xs leading-5"
          >
            <dt className="font-medium text-muted-foreground">고객 메모</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words text-foreground/80">
              {buyerRequirement.memo}
            </dd>
          </dl>
        )}
      </header>

      {expanded && <BuyerMatchBranchList matches={matches} actions={actions} />}
    </section>
  );
}

export function BuyerMatchBranchList({
  matches,
  actions,
  className,
}: {
  matches: Match[];
  actions: MatchRowActions;
  className?: string;
}) {
  const sortedMatches = [...matches].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

  return (
    <div
      data-match-branch-list
      className={cn(
        'relative mb-3 ml-[68px] mr-3 mt-2 space-y-1 pl-12',
        className,
      )}
    >
      <span
        data-match-branch-trunk
        aria-hidden="true"
        className="pointer-events-none absolute -top-2 bottom-0 left-0 w-px bg-border"
      />
      {sortedMatches.map((match, index) => (
        <BuyerMatchLane
          key={match.id}
          match={match}
          actions={actions}
          isLast={index === sortedMatches.length - 1}
        />
      ))}
    </div>
  );
}

function BuyerRequirementSummaryItem({
  label,
  value,
  className,
  emphasized = false,
}: {
  label: string;
  value: string;
  className?: string;
  emphasized?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 items-baseline gap-1.5', className)}>
      <dt className="shrink-0 text-[10.5px] font-medium text-muted-foreground">
        {label}
      </dt>
      <dd
        title={value}
        className={cn(
          'min-w-0 truncate text-[12.5px] font-medium text-foreground',
          emphasized && 'font-semibold tabular-nums',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function BuyerMatchLane({
  match,
  actions,
  isLast,
}: {
  match: Match;
  actions: MatchRowActions;
  isLast: boolean;
}) {
  const transactionType = match.listing?.transactionType;
  const upcomingViewingEvent = getUpcomingViewingEvent(match);
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState(match.memo ?? '');
  const saveInFlightRef = useRef(false);
  const skipBlurSaveRef = useRef(false);
  const isSavingMemo = actions.savingMemoId === match.id;

  const startMemoEdit = () => {
    skipBlurSaveRef.current = false;
    setMemoDraft(match.memo ?? '');
    setIsEditingMemo(true);
  };

  const cancelMemoEdit = () => {
    if (saveInFlightRef.current) return;
    skipBlurSaveRef.current = true;
    setMemoDraft(match.memo ?? '');
    setIsEditingMemo(false);
  };

  const saveMemo = async () => {
    if (saveInFlightRef.current) return;

    const nextMemo = memoDraft.trim();
    const currentMemo = match.memo?.trim() ?? '';
    if (nextMemo === currentMemo) {
      skipBlurSaveRef.current = true;
      setIsEditingMemo(false);
      return;
    }

    saveInFlightRef.current = true;
    try {
      await actions.onSaveMemo(match, nextMemo || null);
      skipBlurSaveRef.current = true;
      setIsEditingMemo(false);
    } catch {
      // 페이지 mutation이 오류를 안내하며, 입력 상태는 재시도를 위해 유지한다.
    } finally {
      saveInFlightRef.current = false;
    }
  };

  return (
    <article
      data-match-branch
      className="relative grid gap-3 rounded-md px-2 py-2.5 hover:bg-muted/30 xl:grid-cols-[minmax(260px,0.8fr)_minmax(520px,1.6fr)_auto] xl:items-center"
      onDoubleClick={() => actions.onOpenDetail(match.id)}
      title="더블클릭하여 상세보기"
    >
      {isLast && (
        <span
          data-match-branch-end
          aria-hidden="true"
          className="pointer-events-none absolute -left-12 bottom-0 top-[calc(50%_-_32px)] z-[1] w-0.5 bg-background"
        />
      )}
      <svg
        data-match-branch-connector
        aria-hidden="true"
        viewBox="0 0 48 64"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -left-12 top-1/2 z-[2] h-16 w-12 -translate-y-1/2 overflow-visible text-border"
      >
        <path
          d="M0 0C0 18 14 32 32 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="min-w-0 truncate text-left text-[13px] font-semibold hover:underline"
            onClick={() => actions.onOpenDetail(match.id)}
          >
            {getMatchTitle(match)}
          </button>
          {transactionType && (
            <StatusBadge
              kind="transactionType"
              status={transactionType}
              size="sm"
            />
          )}
          {normalizeMatchStage(match.stage) === MatchStage.CLOSED && (
            <Badge className="border-destructive/25 bg-destructive-soft text-destructive-strong">
              종료
            </Badge>
          )}
          {normalizeMatchStage(match.stage) === MatchStage.DEAL_CREATED && (
            <Badge className="border-success/25 bg-success-soft text-success">
              거래 전환
            </Badge>
          )}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0 font-medium text-foreground tabular-nums">
            {formatMatchPrice(match)}
          </span>
          <span className="text-border">·</span>
          <span className="truncate">{getListingAddress(match.listing)}</span>
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <MatchProgressTrack match={match} actions={actions} />
        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          {isEditingMemo ? (
            <Input
              autoFocus
              aria-label={`${getMatchTitle(match)} 매칭 메모`}
              value={memoDraft}
              placeholder="메모 입력"
              title="Enter 저장 · Esc 취소"
              className="h-7 min-w-0 flex-1 px-2 py-0 text-xs shadow-none"
              disabled={isSavingMemo}
              onChange={(event) => setMemoDraft(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onBlur={() => {
                if (skipBlurSaveRef.current) {
                  skipBlurSaveRef.current = false;
                  return;
                }
                void saveMemo();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelMemoEdit();
                  return;
                }

                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.stopPropagation();
                  void saveMemo();
                }
              }}
            />
          ) : (
            <button
              type="button"
              data-match-memo-trigger
              aria-label={`${getMatchTitle(match)} 매칭 메모 편집`}
              title="클릭하여 메모 편집"
              className="group/memo flex min-h-6 min-w-0 flex-1 items-center gap-1 rounded-sm px-1 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              onClick={(event) => {
                event.stopPropagation();
                startMemoEdit();
              }}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <span
                className={cn(
                  'line-clamp-1',
                  !match.memo?.trim() && 'italic text-muted-foreground/70',
                )}
              >
                {match.memo?.trim() || '메모 추가'}
              </span>
              <Pencil
                aria-hidden="true"
                className="size-3 shrink-0 opacity-0 group-hover/memo:opacity-100 group-focus-visible/memo:opacity-100"
              />
            </button>
          )}
          <span
            role="status"
            aria-live="polite"
            className="shrink-0 tabular-nums"
          >
            {isSavingMemo
              ? '저장 중…'
              : upcomingViewingEvent
                ? `방문 ${formatViewingEventTime(upcomingViewingEvent)}`
                : `${formatDate(match.updatedAt)} 수정`}
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <MatchActionsMenu match={match} actions={actions} />
      </div>
    </article>
  );
}

// ── 단계별 그룹 테이블 뷰 ────────────────────────────────────────────────────

export function StageMatchView({
  groups,
  actions,
  selectedItemIds,
  onSelectionChange,
}: {
  groups: MatchStageGroup[];
  actions: MatchRowActions;
  selectedItemIds: Set<string>;
  onSelectionChange: (itemIds: string[], selected: boolean) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">
        조건에 맞는 단계별 매칭이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <StageMatchGroupSection
          key={group.stage}
          group={group}
          actions={actions}
          selectedItemIds={selectedItemIds}
          onSelectionChange={onSelectionChange}
        />
      ))}
    </div>
  );
}

function StageMatchGroupSection({
  group,
  actions,
  selectedItemIds,
  onSelectionChange,
}: {
  group: MatchStageGroup;
  actions: MatchRowActions;
  selectedItemIds: Set<string>;
  onSelectionChange: (itemIds: string[], selected: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(!group.isResult);
  const groupItemIds = group.rows.map((row) => row.match.id);
  const selectedGroupItemCount = groupItemIds.reduce(
    (count, id) => count + (selectedItemIds.has(id) ? 1 : 0),
    0,
  );
  const groupSelectionState: boolean | 'indeterminate' =
    selectedGroupItemCount === groupItemIds.length
      ? true
      : selectedGroupItemCount > 0
        ? 'indeterminate'
        : false;

  return (
    <section className="overflow-hidden rounded-md border border-border bg-background">
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/30"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex size-6 items-center justify-center rounded-md text-muted-foreground">
          {expanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </div>
        <span className={cn('size-2 rounded-full', group.dotClassName)} />
        <h2 className="text-balance text-[13px] font-semibold">
          {group.label}
        </h2>
        <Badge variant="secondary" className="ml-auto rounded-md tabular-nums">
          {group.rows.length}건
        </Badge>
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-border/70">
          <table className="min-w-[1160px] text-[13px]">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2 font-medium">
                  <Checkbox
                    checked={groupSelectionState}
                    onCheckedChange={(value) =>
                      onSelectionChange(groupItemIds, value === true)
                    }
                    aria-label={`${group.label} 매칭 전체 선택`}
                    className="size-3.5"
                  />
                </th>
                <th className="w-12 px-3 py-2 font-medium">No</th>
                <th className="px-3 py-2 font-medium">고객</th>
                <th className="px-3 py-2 font-medium">매물</th>
                <th className="px-3 py-2 font-medium">거래/가격</th>
                <th className="px-3 py-2 font-medium">구매조건</th>
                <th className="px-3 py-2 font-medium">메모</th>
                <th className="px-3 py-2 font-medium">최근 수정</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <StageMatchTableRow
                  key={row.match.id}
                  rowNumber={row.rowNumber}
                  match={row.match}
                  actions={actions}
                  selected={selectedItemIds.has(row.match.id)}
                  onSelectedChange={(selected) =>
                    onSelectionChange([row.match.id], selected)
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StageMatchTableRow({
  rowNumber,
  match,
  actions,
  selected,
  onSelectedChange,
}: {
  rowNumber: number;
  match: Match;
  actions: MatchRowActions;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
  return (
    <tr
      data-match-selected={selected ? 'true' : undefined}
      className={cn(
        'border-t border-border/70 align-top',
        selected ? 'bg-accent/40 hover:bg-accent/60' : 'hover:bg-muted/30',
      )}
      onDoubleClick={() => actions.onOpenDetail(match.id)}
      title="더블클릭하여 상세보기"
    >
      <td className="w-10 px-3 py-2.5 align-middle">
        <Checkbox
          checked={selected}
          onCheckedChange={(value) => onSelectedChange(value === true)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          aria-label={`${getMatchTitle(match)} 선택`}
          className="size-3.5"
        />
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
        {rowNumber}
      </td>
      <td className="px-3 py-2.5">
        <div className="space-y-1">
          <button
            type="button"
            className="text-left font-medium hover:underline"
            onClick={() => actions.onOpenDetail(match.id)}
          >
            {match.buyerRequirement?.contact?.name ?? '미지정'}
          </button>
          <p className="text-xs text-muted-foreground">
            {match.buyerRequirement?.contact?.phone ?? '—'}
          </p>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="space-y-1">
          <button
            type="button"
            className="max-w-64 truncate text-left font-medium hover:underline"
            onClick={() => actions.onOpenDetail(match.id)}
          >
            {getMatchTitle(match)}
          </button>
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {getListingAddress(match.listing)}
          </p>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {match.listing?.transactionType && (
            <StatusBadge
              kind="transactionType"
              status={match.listing.transactionType}
              size="sm"
            />
          )}
          <span className="text-xs font-medium tabular-nums">
            {formatMatchPrice(match)}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs leading-5 text-muted-foreground">
        {formatRequirementSummary(match)}
      </td>
      <td className="px-3 py-2.5 text-xs leading-5 text-muted-foreground">
        <p className="line-clamp-2">{match.memo ?? '—'}</p>
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
        {formatDate(match.updatedAt)}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <MatchActionsMenu match={match} actions={actions} />
        </div>
      </td>
    </tr>
  );
}
