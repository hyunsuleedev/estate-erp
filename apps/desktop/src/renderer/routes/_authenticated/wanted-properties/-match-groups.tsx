import { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  GitBranch,
  MapPin,
  Pencil,
  Phone,
  Ruler,
  Tag,
  User,
} from 'lucide-react';
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
import { formatDate, formatPhone } from '@/lib/format';
import { StatusBadge } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

// ── 고객별 뷰: Contact → BuyerRequirement → Match ───────────────────────────
// 매물관리 표처럼 맨 위 헤더 한 줄이 칸 이름을 맡고, 고객 행은 값만 보여준다.

/**
 * 헤더와 고객 행이 같은 값을 써서 칸이 세로로 맞는다 (선택 · 펼침 · 값 7칸).
 * 넓은 창에서 값끼리 멀어지지 않게 예산은 상한을 두고, 남는 폭은 희망 지역이 받는다.
 */
const BUYER_TABLE_COLUMNS =
  'grid grid-cols-[40px_28px_88px_128px_96px_112px_minmax(140px,200px)_minmax(110px,1fr)_132px]';
/** 위 칸 너비의 합. 창이 이보다 좁으면 줄바꿈 대신 표 전체가 가로로 스크롤된다. */
export const BUYER_TABLE_MIN_WIDTH_CLASS = 'min-w-[874px]';
const BUYER_TABLE_CELL = 'flex min-w-0 items-center border-r border-border px-2.5';

const BUYER_TABLE_HEADERS = [
  { label: '고객', icon: <User /> },
  { label: '연락처', icon: <Phone /> },
  { label: '매물 유형', icon: <Tag /> },
  { label: '희망 평형', icon: <Ruler /> },
  { label: '예산', icon: <CircleDollarSign /> },
  { label: '희망 지역', icon: <MapPin /> },
  { label: '매칭', icon: <GitBranch /> },
];

export function BuyerMatchTableHeader({
  checked,
  onToggleAll,
}: {
  checked: boolean | 'indeterminate';
  onToggleAll: (selected: boolean) => void;
}) {
  return (
    <div
      data-buyer-table-header
      className={cn(
        BUYER_TABLE_COLUMNS,
        'sticky top-0 z-20 h-9 border-b border-border bg-[#f7f7f5]',
      )}
    >
      <div className="flex items-center justify-center">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onToggleAll(value === true)}
          aria-label="현재 매칭 목록 전체 선택"
        />
      </div>
      <div aria-hidden="true" className="border-r border-border" />
      {BUYER_TABLE_HEADERS.map(({ label, icon }) => (
        <div key={label} className={cn(BUYER_TABLE_CELL, 'last:border-r-0')}>
          <span className="inline-flex min-w-0 items-center gap-1 text-[12px] font-normal text-muted-foreground">
            <span
              aria-hidden="true"
              className="shrink-0 [&>svg]:size-3 [&>svg]:text-muted-foreground/70"
            >
              {icon}
            </span>
            <span className="truncate">{label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

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
  const rawBuyerPhone = buyerRequirement.contact?.phone;
  const buyerPhone = rawBuyerPhone
    ? formatPhone(rawBuyerPhone)
    : '연락처 없음';
  return (
    <section
      data-buyer-match-group
      data-match-selected={selected ? 'true' : undefined}
      aria-label={`${buyerName} 매칭 그룹`}
      className="border-b border-border bg-white"
    >
      <header
        data-buyer-summary-header
        className={cn(
          selected && 'bg-muted/50',
          expanded && 'border-b border-border',
        )}
      >
        <div
          data-buyer-summary-row
          className={cn(BUYER_TABLE_COLUMNS, 'min-h-10')}
        >
          <div className="flex items-center justify-center">
            <Checkbox
              checked={selected}
              onCheckedChange={(value) => onSelectedChange(value === true)}
              aria-label={`${buyerName} 선택`}
            />
          </div>

          <div className="flex items-center justify-center border-r border-border">
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
          </div>

          <div className={BUYER_TABLE_CELL}>
            <p
              title={buyerName}
              className="min-w-0 truncate text-[13px] font-semibold"
            >
              {buyerName}
            </p>
          </div>

          <dl data-buyer-contact-summary className="contents">
            <BuyerRequirementSummaryItem
              label="연락처"
              value={buyerPhone}
              className="tabular-nums"
            />
          </dl>

          <dl data-buyer-requirement-summary className="contents">
            <BuyerRequirementSummaryItem
              label="매물 유형"
              value={requirementSummary.siteTypeText}
            />
            <BuyerRequirementSummaryItem
              label="희망 평형"
              value={requirementSummary.areaText}
              className="tabular-nums"
            />
            <BuyerRequirementSummaryItem
              label="예산"
              value={requirementSummary.budgetText}
              emphasized
            />
            {/* 희망 지역은 매칭 판단의 핵심이라 자르지 않고 줄을 바꾼다 */}
            <BuyerRequirementSummaryItem
              label="희망 지역"
              value={requirementSummary.regionText}
              wrap
            />
          </dl>

          <div
            className={cn(
              BUYER_TABLE_CELL,
              'flex-wrap gap-1 border-r-0 py-1 text-[11.5px] tabular-nums',
            )}
          >
            {activeCount > 0 && (
              <span className="rounded-md bg-info-soft px-1.5 py-0.5 font-medium text-info-strong">
                진행 {activeCount}
              </span>
            )}
            {convertedCount > 0 && (
              <span className="rounded-md bg-success-soft px-1.5 py-0.5 font-medium text-success">
                거래 {convertedCount}
              </span>
            )}
            {closedCount > 0 && (
              <span className="rounded-md bg-destructive-soft px-1.5 py-0.5 font-medium text-destructive-strong">
                종료 {closedCount}
              </span>
            )}
          </div>
        </div>

        {expanded && buyerRequirement.memo && (
          // 78px: 고객 이름 칸의 글자 시작 위치. 메모와 아래 매칭 가지를 여기에 맞춘다.
          <dl
            data-buyer-requirement-details
            className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-2 border-t border-border py-1.5 pl-[78px] pr-3 text-xs leading-5"
          >
            <dt className="text-muted-foreground">고객 메모</dt>
            <dd
              data-buyer-expanded-memo
              className="min-w-0 whitespace-pre-wrap break-words text-foreground/80"
            >
              {buyerRequirement.memo}
            </dd>
          </dl>
        )}
      </header>

      {expanded && (
        <BuyerMatchBranchList
          matches={matches}
          actions={actions}
          className="ml-[78px]"
        />
      )}
    </section>
  );
}

export function BuyerMatchBranchList({
  matches,
  actions,
  counterparty = 'listing',
  className,
}: {
  matches: Match[];
  actions: MatchRowActions;
  counterparty?: 'listing' | 'buyer';
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
          counterparty={counterparty}
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
  wrap = false,
}: {
  label: string;
  value: string;
  className?: string;
  emphasized?: boolean;
  /** 자르지 않고 줄을 바꾼다. 행 높이가 함께 늘어난다. */
  wrap?: boolean;
}) {
  return (
    <div className={cn(BUYER_TABLE_CELL, className)}>
      {/* 칸 이름은 표 헤더가 보여주므로 화면에서는 숨기고 스크린리더에만 남긴다 */}
      <dt className="sr-only">{label}</dt>
      <dd
        title={value}
        className={cn(
          'min-w-0 text-[13px] text-foreground',
          wrap ? 'break-words py-2 leading-5' : 'truncate',
          emphasized && 'font-medium tabular-nums',
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
  counterparty,
  isLast,
}: {
  match: Match;
  actions: MatchRowActions;
  counterparty: 'listing' | 'buyer';
  isLast: boolean;
}) {
  const transactionType =
    counterparty === 'buyer'
      ? match.buyerRequirement?.transactionType
      : match.listing?.transactionType;
  const upcomingViewingEvent = getUpcomingViewingEvent(match);
  const buyerName = match.buyerRequirement?.contact?.name ?? '구매자 미상';
  const buyerPhone = match.buyerRequirement?.contact?.phone;
  const listingTitle = getMatchTitle(match);
  const counterpartyTitle = counterparty === 'buyer' ? buyerName : listingTitle;
  const counterpartyPrimaryMeta =
    counterparty === 'buyer'
      ? buyerPhone
        ? formatPhone(buyerPhone)
        : '연락처 없음'
      : formatMatchPrice(match);
  const counterpartySecondaryMeta =
    counterparty === 'buyer' ? listingTitle : getListingAddress(match.listing);
  const accessibleMatchLabel = `${buyerName} · ${listingTitle}`;
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
            {counterpartyTitle}
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
            {counterpartyPrimaryMeta}
          </span>
          <span className="text-border">·</span>
          <span className="truncate">{counterpartySecondaryMeta}</span>
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <MatchProgressTrack match={match} actions={actions} />
        <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          {isEditingMemo ? (
            <Input
              autoFocus
              aria-label={`${accessibleMatchLabel} 매칭 메모`}
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
              aria-label={`${accessibleMatchLabel} 매칭 메모 편집`}
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
