import { useMemo } from 'react';
import type { Match, PropertyListing } from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { GitBranch, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatDateTime,
  matchStageLabels,
  transactionTypeLabels,
} from '../utils';
import { MainSection, MainSectionEmpty } from './MainSection';

/**
 * 가격 변경 + 매칭 생성 같은 비-상담 활동 이력.
 * 상담은 PeopleConsultationsSection에서 인물 카드 안으로 이동.
 */

interface ActivityEventBase {
  id: string;
  at: string;
}

interface PriceEvent extends ActivityEventBase {
  type: 'price';
  listingId: string;
  transactionType: string;
  priceBefore: number | null;
  priceAfter: number | null;
}

interface MatchEvent extends ActivityEventBase {
  type: 'match';
  match: Match;
}

type ActivityEvent = PriceEvent | MatchEvent;

interface Props {
  listings: PropertyListing[];
  matches: Match[];
}

export function ActivityTimelineSection({ listings, matches }: Props) {
  const events = useMemo<ActivityEvent[]>(() => {
    const list: ActivityEvent[] = [];

    for (const listing of listings) {
      for (const ph of listing.priceHistories ?? []) {
        list.push({
          id: `p-${listing.id}-${ph.createdAt}`,
          at: ph.createdAt,
          type: 'price',
          listingId: listing.id,
          transactionType: listing.transactionType,
          priceBefore: ph.priceBefore,
          priceAfter: ph.priceAfter,
        });
      }
    }

    for (const match of matches) {
      list.push({
        id: `m-${match.id}`,
        at: match.createdAt,
        type: 'match',
        match,
      });
    }

    return list.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [listings, matches]);

  return (
    <MainSection title="활동 이력" count={events.length}>
      {events.length === 0 ? (
        <MainSectionEmpty text="가격 변경 / 매칭 활동이 없습니다." />
      ) : (
        <ol className="divide-y divide-border/60 rounded-lg border border-border bg-white">
          {events.slice(0, 12).map((event) => (
            <ActivityRow key={event.id} event={event} />
          ))}
          {events.length > 12 && (
            <li className="px-3 py-1.5 text-center text-[10px] text-muted-foreground">
              +{events.length - 12}건 더
            </li>
          )}
        </ol>
      )}
    </MainSection>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  return (
    <li className="flex items-center gap-2.5 px-3 py-2">
      <div className="shrink-0">
        <ActivityIcon event={event} />
      </div>
      <div className="min-w-0 flex-1">
        <ActivityTitle event={event} />
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {formatDateTime(event.at)}
      </span>
    </li>
  );
}

function ActivityIcon({ event }: { event: ActivityEvent }) {
  if (event.type === 'price') {
    const direction =
      event.priceAfter != null &&
      event.priceBefore != null &&
      event.priceAfter > event.priceBefore
        ? 'up'
        : 'down';
    const Icon = direction === 'up' ? TrendingUp : TrendingDown;
    const color =
      direction === 'up'
        ? 'bg-rose-50 text-rose-600'
        : 'bg-emerald-50 text-emerald-600';
    return (
      <span
        className={cn('grid size-6 place-items-center rounded-full', color)}
      >
        <Icon className="size-3" />
      </span>
    );
  }
  return (
    <span className="grid size-6 place-items-center rounded-full bg-purple-50 text-purple-600">
      <GitBranch className="size-3" />
    </span>
  );
}

function ActivityTitle({ event }: { event: ActivityEvent }) {
  if (event.type === 'price') {
    const txLabel =
      transactionTypeLabels[event.transactionType] ?? event.transactionType;
    const before =
      event.priceBefore != null ? formatPrice(event.priceBefore) : '-';
    const after =
      event.priceAfter != null ? formatPrice(event.priceAfter) : '-';
    return (
      <span className="text-[12px] text-foreground">
        {txLabel} 가격 변경 · <span className="text-muted-foreground">{before}</span>
        {' → '}
        <span className="font-medium">{after}</span>
      </span>
    );
  }
  const stage = matchStageLabels[event.match.stage] ?? event.match.stage;
  const buyerName = event.match.buyerRequirement?.contact?.name ?? '매수자';
  return (
    <span className="text-[12px] text-foreground">
      매칭 생성 · {buyerName}{' '}
      <span className="text-muted-foreground">({stage})</span>
    </span>
  );
}
