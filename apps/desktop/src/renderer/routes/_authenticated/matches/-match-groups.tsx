import { useState } from 'react';
import { ArrowRight, Building2, ChevronDown, ChevronRight } from 'lucide-react';
import type { Match } from '@estate-erp/api-client';
import {
  formatListingPrice,
  formatMatchPrice,
  formatRequirementSummary,
  formatRequirementSummaryFromBuyerRequirement,
  formatViewingEventTime,
  getInitials,
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  const sortedMatches = [...matches].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-background">
      <button
        type="button"
        className="grid w-full grid-cols-[auto_minmax(160px,0.75fr)_minmax(220px,1fr)_auto] items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="rounded-md border border-border/60 bg-muted/30 p-1 text-muted-foreground">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <Avatar size="sm">
            <AvatarFallback>{getInitials(buyerName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{buyerName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {buyerRequirement.contact?.phone ?? '연락처 없음'}
            </p>
          </div>
        </div>

        <div className="min-w-0 truncate text-sm text-muted-foreground">
          {formatRequirementSummaryFromBuyerRequirement(buyerRequirement)}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant="secondary">매칭 {matches.length}</Badge>
          {activeCount > 0 && (
            <Badge className="border-0 bg-info-soft text-info">진행 {activeCount}</Badge>
          )}
          {convertedCount > 0 && (
            <Badge className="border-0 bg-success-soft text-success">거래 {convertedCount}</Badge>
          )}
          {closedCount > 0 && (
            <Badge className="border-0 bg-neutral-soft text-neutral-strong">종료 {closedCount}</Badge>
          )}
        </div>
      </button>

      {expanded && (
        <>
          {buyerRequirement.memo && (
            <div className="border-t border-border/60 bg-muted/10 px-4 py-2 text-xs leading-5 text-muted-foreground">
              {buyerRequirement.memo}
            </div>
          )}

          <div className="divide-y divide-border/60 border-t border-border/60">
            {sortedMatches.map((match) => (
              <BuyerMatchLane key={match.id} match={match} actions={actions} />
            ))}
          </div>
        </>
      )}
    </section>
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
      className="grid gap-3 px-4 py-3 hover:bg-muted/20 xl:grid-cols-[minmax(220px,0.75fr)_minmax(420px,1.45fr)_auto] xl:items-center"
      onDoubleClick={() => actions.onOpenDetail(match.id)}
      title="더블클릭하여 상세보기"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{getMatchTitle(match)}</p>
          {transactionType && (
            <StatusBadge kind="transactionType" status={transactionType} size="sm" />
          )}
          {match.stage === 'closed' && (
            <Badge className="border-0 bg-neutral-soft text-neutral-strong">종료</Badge>
          )}
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {getListingAddress(match.listing)}
        </div>
        <p className="mt-1 text-sm font-semibold tabular-nums">{formatMatchPrice(match)}</p>
      </div>

      <div className="min-w-0 overflow-x-auto">
        <MatchProgressTrack match={match} actions={actions} />
        <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          <p className="line-clamp-1">{match.memo ?? '메모 없음'}</p>
          <span className="shrink-0">
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
    <section className="rounded-lg border border-border/60 bg-background">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="rounded-md border border-border/60 bg-muted/30 p-1 text-muted-foreground">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>

        <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-muted-foreground">
          <Building2 className="size-5" />
        </div>

        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{getListingTitle(listing)}</p>
          <p className="truncate text-sm text-muted-foreground">
            {getListingAddress(listing)} · {ownerText}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {listing?.transactionType && (
            <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
          )}
          <Badge variant="secondary" className="tabular-nums">{formatListingPrice(listing)}</Badge>
          <Badge variant="secondary">매칭 {group.summary.total}</Badge>
          {group.summary.active > 0 && (
            <Badge className="border-0 bg-info-soft text-info">진행 {group.summary.active}</Badge>
          )}
          {group.summary.converted > 0 && (
            <Badge className="border-0 bg-success-soft text-success">거래 {group.summary.converted}</Badge>
          )}
          {group.summary.closed > 0 && (
            <Badge className="border-0 bg-neutral-soft text-neutral-strong">종료 {group.summary.closed}</Badge>
          )}
        </div>
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-border/60">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">단계</th>
                <th className="px-4 py-3 font-medium">구매고객</th>
                <th className="px-4 py-3 font-medium">구매조건</th>
                <th className="px-4 py-3 font-medium">메모</th>
                <th className="px-4 py-3 font-medium">최근 수정</th>
                <th className="px-4 py-3 font-medium" />
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
      className="border-t border-border/60 align-top hover:bg-muted/30"
      onDoubleClick={() => actions.onOpenDetail(match.id)}
      title="더블클릭하여 상세보기"
    >
      <td className="px-4 py-3">
        <StatusBadge kind="matchStage" status={match.stage} size="sm" />
      </td>
      <td className="px-4 py-3">
        <div className="space-y-1">
          <p className="font-medium">{match.buyerRequirement?.contact?.name ?? '미지정'}</p>
          <p className="text-xs text-muted-foreground">
            {match.buyerRequirement?.contact?.phone ?? '—'}
          </p>
        </div>
      </td>
      <td className="px-4 py-3 text-xs leading-5 text-muted-foreground">
        {formatRequirementSummary(match)}
      </td>
      <td className="px-4 py-3 text-xs leading-5 text-muted-foreground">
        <p className="line-clamp-2">{match.memo ?? '—'}</p>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(match.updatedAt)}</td>
      <td className="px-4 py-3">
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
    <div className="space-y-4">
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
    <section className="overflow-hidden rounded-lg border border-border/60 bg-background">
      <button
        type="button"
        className="flex w-full items-center gap-3 bg-muted/20 px-4 py-3 text-left"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="rounded-md border border-border/60 bg-background p-1 text-muted-foreground">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>
        <span className={cn('size-2 rounded-full', group.dotClassName)} />
        <h2 className="text-sm font-semibold">{group.label}</h2>
        <Badge variant="secondary" className="ml-auto">
          {group.rows.length}건
        </Badge>
      </button>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-14 px-4 py-3 font-medium">No</th>
                <th className="px-4 py-3 font-medium">고객</th>
                <th className="px-4 py-3 font-medium">매물</th>
                <th className="px-4 py-3 font-medium">거래/가격</th>
                <th className="px-4 py-3 font-medium">구매조건</th>
                <th className="px-4 py-3 font-medium">메모</th>
                <th className="px-4 py-3 font-medium">최근 수정</th>
                <th className="px-4 py-3 font-medium" />
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
      className="border-t border-border/60 align-top hover:bg-muted/30"
      onDoubleClick={() => actions.onOpenDetail(match.id)}
      title="더블클릭하여 상세보기"
    >
      <td className="px-4 py-3 text-xs text-muted-foreground">{rowNumber}</td>
      <td className="px-4 py-3">
        <div className="space-y-1">
          <p className="font-medium">{match.buyerRequirement?.contact?.name ?? '미지정'}</p>
          <p className="text-xs text-muted-foreground">
            {match.buyerRequirement?.contact?.phone ?? '—'}
          </p>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="space-y-1">
          <p className="font-medium">{getMatchTitle(match)}</p>
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {getListingAddress(match.listing)}
          </p>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {match.listing?.transactionType && (
            <StatusBadge kind="transactionType" status={match.listing.transactionType} size="sm" />
          )}
          <span className="text-xs font-medium tabular-nums">{formatMatchPrice(match)}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-xs leading-5 text-muted-foreground">
        {formatRequirementSummary(match)}
      </td>
      <td className="px-4 py-3 text-xs leading-5 text-muted-foreground">
        <p className="line-clamp-2">{match.memo ?? '—'}</p>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(match.updatedAt)}</td>
      <td className="px-4 py-3">
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
