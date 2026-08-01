import { useState } from 'react';
import { ArrowRight, Building2, ChevronDown, ChevronRight } from 'lucide-react';
import type { Match } from '@estate-erp/api-client';
import {
  formatListingPrice,
  formatMatchPrice,
  formatRequirementSummary,
  formatViewingEventTime,
  getBuyerRequirementSummaryParts,
  getListingAddress,
  getListingTitle,
  getMatchTitle,
  getNextMatchStage,
  getPrimaryOwnerText,
  getUpcomingViewingEvent,
  type MatchListingGroup,
  type MatchRowActions,
  type MatchStageGroup,
} from './-match-view-utils';
import { MatchActionsMenu, MatchProgressTrack } from './-match-board';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ── 고객별 뷰: Contact → BuyerRequirement → Match ───────────────────────────

export function BuyerMatchGroup({
  buyerRequirement,
  matches,
  actions,
}: {
  buyerRequirement: NonNullable<Match['buyerRequirement']>;
  matches: Match[];
  actions: MatchRowActions;
}) {
  const [expanded, setExpanded] = useState(true);
  const buyerName = buyerRequirement.contact?.name ?? '미지정';
  const activeCount = matches.filter(
    (match) => !['dealCreated', 'closed'].includes(match.stage),
  ).length;
  const convertedCount = matches.filter((match) => match.stage === 'dealCreated').length;
  const closedCount = matches.filter((match) => match.stage === 'closed').length;
  const requirementSummary = getBuyerRequirementSummaryParts(buyerRequirement);
  const sortedMatches = [...matches].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

  return (
    <section className="overflow-hidden rounded-md border border-border bg-background">
      <button
        type="button"
        aria-expanded={expanded}
        className="grid w-full grid-cols-[auto_minmax(160px,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 xl:grid-cols-[auto_minmax(180px,0.55fr)_minmax(520px,1.7fr)_auto]"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex size-6 items-center justify-center rounded-md text-muted-foreground">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-[13px] font-semibold">{buyerName}</p>
            {buyerRequirement.urgency === 'urgent' && (
              <StatusBadge kind="buyerUrgency" status="urgent" size="sm" />
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {buyerRequirement.contact?.phone ?? '연락처 없음'}
          </p>
        </div>

        <dl
          data-buyer-requirement-summary
          className="hidden min-w-0 grid-cols-[minmax(160px,1.3fr)_minmax(100px,0.7fr)_minmax(130px,0.8fr)] gap-5 border-l border-border/70 pl-4 xl:grid"
        >
          <BuyerRequirementSummaryItem
            label="희망 지역"
            value={requirementSummary.regionText}
          />
          <BuyerRequirementSummaryItem
            label="매물 유형"
            value={requirementSummary.siteTypeText}
          />
          <BuyerRequirementSummaryItem
            label="예산"
            value={requirementSummary.budgetText}
            emphasized
          />
        </dl>

        <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs tabular-nums">
          <span className="text-muted-foreground">매칭 {matches.length}</span>
          {activeCount > 0 && (
            <span className="rounded-md bg-info-soft px-1.5 py-0.5 font-medium text-info">
              진행 {activeCount}
            </span>
          )}
          {convertedCount > 0 && (
            <span className="rounded-md bg-success-soft px-1.5 py-0.5 font-medium text-success">
              거래 {convertedCount}
            </span>
          )}
          {closedCount > 0 && (
            <span className="rounded-md bg-neutral-soft px-1.5 py-0.5 font-medium text-neutral-strong">
              종료 {closedCount}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <>
          {buyerRequirement.memo && (
            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-t border-border/70 bg-muted/20 py-2 pl-12 pr-3 text-xs leading-5">
              <span className="font-medium text-muted-foreground">고객 메모</span>
              <p className="text-pretty text-foreground/80">{buyerRequirement.memo}</p>
            </div>
          )}

          <div className="divide-y divide-border/70 border-t border-border/70">
            {sortedMatches.map((match) => (
              <BuyerMatchLane key={match.id} match={match} actions={actions} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function BuyerRequirementSummaryItem({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-medium text-muted-foreground">{label}</dt>
      <dd
        title={value}
        className={cn(
          'mt-0.5 truncate text-[12.5px] font-medium text-foreground',
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
}: {
  match: Match;
  actions: MatchRowActions;
}) {
  const transactionType = match.listing?.transactionType;
  const upcomingViewingEvent = getUpcomingViewingEvent(match);

  return (
    <article
      className="grid gap-3 px-3 py-2.5 hover:bg-muted/20 xl:grid-cols-[minmax(220px,0.75fr)_minmax(460px,1.55fr)_auto] xl:items-center"
      onDoubleClick={() => actions.onOpenDetail(match.id)}
      title="더블클릭하여 상세보기"
    >
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
            <StatusBadge kind="transactionType" status={transactionType} size="sm" />
          )}
          {match.stage === 'closed' && (
            <Badge className="border-0 bg-neutral-soft text-neutral-strong">종료</Badge>
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
          <p className="line-clamp-1">{match.memo ?? '메모 없음'}</p>
          <span className="shrink-0 tabular-nums">
            {upcomingViewingEvent
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

// ── 매물별 뷰: Listing → Match ───────────────────────────────────────────────

export function PropertyMatchGroup({
  group,
  actions,
}: {
  group: MatchListingGroup;
  actions: MatchRowActions;
}) {
  const [expanded, setExpanded] = useState(true);
  const listing = group.listing;
  const ownerText = getPrimaryOwnerText(listing);

  return (
    <section className="overflow-hidden rounded-md border border-border bg-background">
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex size-6 items-center justify-center rounded-md text-muted-foreground">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>

        <div className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Building2 className="size-4" />
        </div>

        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{getListingTitle(listing)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {getListingAddress(listing)} · {ownerText}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {listing?.transactionType && (
            <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
          )}
          <span className="text-xs font-medium tabular-nums">{formatListingPrice(listing)}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            매칭 {group.summary.total}
          </span>
          {group.summary.active > 0 && (
            <span className="rounded-md bg-info-soft px-1.5 py-0.5 text-xs font-medium text-info">
              진행 {group.summary.active}
            </span>
          )}
          {group.summary.converted > 0 && (
            <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-xs font-medium text-success">
              거래 {group.summary.converted}
            </span>
          )}
          {group.summary.closed > 0 && (
            <span className="rounded-md bg-neutral-soft px-1.5 py-0.5 text-xs font-medium text-neutral-strong">
              종료 {group.summary.closed}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-border/70">
          <table className="min-w-[900px] text-[13px]">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">단계</th>
                <th className="px-3 py-2 font-medium">구매고객</th>
                <th className="px-3 py-2 font-medium">구매조건</th>
                <th className="px-3 py-2 font-medium">메모</th>
                <th className="px-3 py-2 font-medium">최근 수정</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {group.matches.map((match) => (
                <PropertyMatchRow key={match.id} match={match} actions={actions} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PropertyMatchRow({
  match,
  actions,
}: {
  match: Match;
  actions: MatchRowActions;
}) {
  return (
    <tr
      className="border-t border-border/70 align-top hover:bg-muted/30"
      onDoubleClick={() => actions.onOpenDetail(match.id)}
      title="더블클릭하여 상세보기"
    >
      <td className="px-3 py-2.5">
        <StatusBadge kind="matchStage" status={match.stage} size="sm" />
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
        <div className="flex justify-end">
          <MatchActionsMenu match={match} actions={actions} />
        </div>
      </td>
    </tr>
  );
}

// ── 단계별 그룹 테이블 뷰 ────────────────────────────────────────────────────

export function StageMatchView({
  groups,
  actions,
}: {
  groups: MatchStageGroup[];
  actions: MatchRowActions;
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
        <StageMatchGroupSection key={group.stage} group={group} actions={actions} />
      ))}
    </div>
  );
}

function StageMatchGroupSection({
  group,
  actions,
}: {
  group: MatchStageGroup;
  actions: MatchRowActions;
}) {
  const [expanded, setExpanded] = useState(!group.isResult);

  return (
    <section className="overflow-hidden rounded-md border border-border bg-background">
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/30"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex size-6 items-center justify-center rounded-md text-muted-foreground">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>
        <span className={cn('size-2 rounded-full', group.dotClassName)} />
        <h2 className="text-balance text-[13px] font-semibold">{group.label}</h2>
        <Badge variant="secondary" className="ml-auto rounded-md tabular-nums">
          {group.rows.length}건
        </Badge>
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-border/70">
          <table className="min-w-[1120px] text-[13px]">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
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
}: {
  rowNumber: number;
  match: Match;
  actions: MatchRowActions;
}) {
  const nextStage = getNextMatchStage(match.stage);

  return (
    <tr
      className="border-t border-border/70 align-top hover:bg-muted/30"
      onDoubleClick={() => actions.onOpenDetail(match.id)}
      title="더블클릭하여 상세보기"
    >
      <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{rowNumber}</td>
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
            <StatusBadge kind="transactionType" status={match.listing.transactionType} size="sm" />
          )}
          <span className="text-xs font-medium tabular-nums">{formatMatchPrice(match)}</span>
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
          {nextStage && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => actions.onStageChange(match.id, nextStage)}
              disabled={actions.isUpdating}
            >
              {nextStage === 'dealCreated' ? '거래 전환' : '다음'}
              <ArrowRight className="size-3" />
            </Button>
          )}
          <MatchActionsMenu match={match} actions={actions} />
        </div>
      </td>
    </tr>
  );
}
