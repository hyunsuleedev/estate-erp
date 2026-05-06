import type { Match } from '@estate-erp/api-client';
import type { CreateCalendarEventDto } from '@estate-erp/api-client';

export type MatchViewListItem = Match;

export type MatchStageGroupDefinition = {
  stage: string;
  label: string;
  dotClassName: string;
  isResult: boolean;
};

export type MatchListingGroup = {
  listingId: string;
  listing: MatchViewListItem['listing'] | null;
  matches: MatchViewListItem[];
  summary: {
    total: number;
    active: number;
    converted: number;
    closed: number;
  };
};

export type MatchStageRow = {
  rowNumber: number;
  match: MatchViewListItem;
};

export type MatchStageGroup = {
  stage: string;
  label: string;
  dotClassName: string;
  isResult: boolean;
  rows: MatchStageRow[];
};

export const matchStageGroups: MatchStageGroupDefinition[] = [
  { stage: 'suggested', label: '추천됨', dotClassName: 'bg-slate-500', isResult: false },
  { stage: 'buyerContacted', label: '구매자 관심', dotClassName: 'bg-sky-600', isResult: false },
  { stage: 'viewing', label: '방문', dotClassName: 'bg-violet-600', isResult: false },
  { stage: 'ownerContacted', label: '판매자 동의', dotClassName: 'bg-amber-600', isResult: false },
  { stage: 'negotiating', label: '조건 협의', dotClassName: 'bg-orange-600', isResult: false },
  { stage: 'dealCreated', label: '거래 전환', dotClassName: 'bg-emerald-600', isResult: true },
  { stage: 'closed', label: '종료', dotClassName: 'bg-zinc-500', isResult: true },
];

export function getMatchListingGroups(matches: MatchViewListItem[]): MatchListingGroup[] {
  const grouped = new Map<string, MatchListingGroup>();

  for (const match of matches) {
    const listingId = match.listingId || 'unassigned-listing';
    const existing = grouped.get(listingId);

    if (existing) {
      existing.matches.push(match);
      continue;
    }

    grouped.set(listingId, {
      listingId,
      listing: match.listing ?? null,
      matches: [match],
      summary: {
        total: 0,
        active: 0,
        converted: 0,
        closed: 0,
      },
    });
  }

  return Array.from(grouped.values())
    .map((group) => {
      const matchesForListing = sortMatchesByUpdatedAt(group.matches);

      return {
        ...group,
        matches: matchesForListing,
        summary: summarizeListingMatches(matchesForListing),
      };
    })
    .sort((left, right) => {
      const leftTime = getLatestUpdatedAt(left.matches);
      const rightTime = getLatestUpdatedAt(right.matches);
      return rightTime - leftTime;
    });
}

export function getMatchStageGroups(
  matches: MatchViewListItem[],
  includeEmpty = false,
): MatchStageGroup[] {
  return matchStageGroups
    .map((group) => {
      const stageMatches = sortMatchesByUpdatedAt(
        matches.filter((match) => match.stage === group.stage),
      );

      return {
        ...group,
        rows: stageMatches.map((match, index) => ({
          rowNumber: index + 1,
          match,
        })),
      };
    })
    .filter((group) => includeEmpty || group.rows.length > 0);
}

export function getUpcomingViewingEvent(
  match: MatchViewListItem,
  now: Date = new Date(),
) {
  const nowTime = now.getTime();

  return (match.calendarEvents ?? [])
    .filter((event) => event.type === 'viewing')
    .filter((event) => new Date(event.start).getTime() >= nowTime)
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())[0] ?? null;
}

export function buildViewingCalendarEventPayload(
  match: MatchViewListItem,
  startLocalValue: string,
  durationMinutes = 60,
): CreateCalendarEventDto {
  const start = new Date(startLocalValue);

  if (Number.isNaN(start.getTime())) {
    throw new Error('Invalid viewing start date');
  }

  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const buyerName = match.buyerRequirement?.contact?.name ?? '구매고객';
  const listingName = match.listing?.property?.site?.name ?? '매물';
  const contactId = match.buyerRequirement?.contactId;

  return {
    title: `${buyerName} ${listingName} 방문`,
    description: '매칭 단계에서 등록한 방문 일정',
    type: 'viewing',
    start: start.toISOString(),
    end: end.toISOString(),
    color: '#3b82f6',
    propertyId: match.propertyId,
    listingId: match.listingId,
    matchId: match.id,
    ...(contactId ? { contactId } : {}),
  };
}

function summarizeListingMatches(matches: MatchViewListItem[]) {
  return matches.reduce(
    (summary, match) => {
      summary.total += 1;

      if (match.stage === 'dealCreated') {
        summary.converted += 1;
      } else if (match.stage === 'closed') {
        summary.closed += 1;
      } else {
        summary.active += 1;
      }

      return summary;
    },
    { total: 0, active: 0, converted: 0, closed: 0 },
  );
}

function sortMatchesByUpdatedAt(matches: MatchViewListItem[]) {
  return [...matches].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function getLatestUpdatedAt(matches: MatchViewListItem[]) {
  return matches.reduce(
    (latest, match) => Math.max(latest, new Date(match.updatedAt).getTime()),
    0,
  );
}
