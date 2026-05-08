import { useMemo, useState } from 'react';
import type { Consultation, Match, PropertyListing } from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import {
  CircleDollarSign,
  GitBranch,
  MessageSquare,
  Plus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  consultationTypeLabels,
  formatDateTime,
  matchStageLabels,
  transactionTypeLabels,
} from '../utils';
import { MainSection, MainSectionEmpty } from './MainSection';

type FilterType = 'all' | 'consultation' | 'price' | 'match';

interface ActivityEventBase {
  id: string;
  at: string; // ISO
  type: 'consultation' | 'price' | 'match';
}

interface ConsultationEvent extends ActivityEventBase {
  type: 'consultation';
  consultation: Consultation;
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

type ActivityEvent = ConsultationEvent | PriceEvent | MatchEvent;

interface Props {
  consultations: Consultation[];
  listings: PropertyListing[];
  matches: Match[];
  onAddConsultation: () => void;
}

export function ActivityTimelineSection({
  consultations,
  listings,
  matches,
  onAddConsultation,
}: Props) {
  const [filter, setFilter] = useState<FilterType>('all');

  const allEvents = useMemo<ActivityEvent[]>(() => {
    const events: ActivityEvent[] = [];

    for (const consultation of consultations) {
      events.push({
        id: `c-${consultation.id}`,
        at: consultation.createdAt,
        type: 'consultation',
        consultation,
      });
    }

    for (const listing of listings) {
      for (const ph of listing.priceHistories ?? []) {
        events.push({
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
      events.push({
        id: `m-${match.id}`,
        at: match.createdAt,
        type: 'match',
        match,
      });
    }

    return events.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [consultations, listings, matches]);

  const filtered = useMemo(() => {
    if (filter === 'all') return allEvents;
    return allEvents.filter((e) => e.type === filter);
  }, [allEvents, filter]);

  return (
    <MainSection
      title="활동 타임라인"
      count={allEvents.length}
      action={
        <Button
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={onAddConsultation}
        >
          <Plus className="size-3" />
          상담 추가
        </Button>
      }
    >
      {/* filter chips */}
      <div className="mb-2 flex items-center gap-1">
        {(
          [
            { key: 'all', label: '전체' },
            { key: 'consultation', label: '상담' },
            { key: 'price', label: '가격' },
            { key: 'match', label: '매칭' },
          ] as const
        ).map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className={cn(
              'h-6 rounded px-2 text-[11px] transition-colors',
              filter === chip.key
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <MainSectionEmpty text="활동 내역이 없습니다." />
      ) : (
        <ol className="space-y-2">
          {filtered.slice(0, 30).map((event) => (
            <ActivityRow key={event.id} event={event} />
          ))}
          {filtered.length > 30 && (
            <li className="pt-1 text-center text-[11px] text-muted-foreground">
              {filtered.length - 30}건 더 있음
            </li>
          )}
        </ol>
      )}
    </MainSection>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  return (
    <li className="flex gap-2.5 rounded-lg border border-border bg-white px-3 py-2">
      <div className="mt-0.5 shrink-0">
        <ActivityIcon event={event} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <ActivityTitle event={event} />
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatDateTime(event.at)}
          </span>
        </div>
        <ActivityBody event={event} />
      </div>
    </li>
  );
}

function ActivityIcon({ event }: { event: ActivityEvent }) {
  switch (event.type) {
    case 'consultation':
      return (
        <span className="grid size-6 place-items-center rounded-full bg-blue-50 text-blue-600">
          <MessageSquare className="size-3" />
        </span>
      );
    case 'price': {
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
    case 'match':
      return (
        <span className="grid size-6 place-items-center rounded-full bg-purple-50 text-purple-600">
          <GitBranch className="size-3" />
        </span>
      );
  }
}

function ActivityTitle({ event }: { event: ActivityEvent }) {
  switch (event.type) {
    case 'consultation': {
      const c = event.consultation;
      const typeLabel = consultationTypeLabels[c.type] ?? c.type;
      const contactName = c.contact?.name ?? '연락처';
      return (
        <span className="text-[12px] font-medium text-foreground">
          {typeLabel} 상담 · {contactName}
        </span>
      );
    }
    case 'price': {
      const txLabel =
        transactionTypeLabels[event.transactionType] ?? event.transactionType;
      const before =
        event.priceBefore != null ? formatPrice(event.priceBefore) : '-';
      const after =
        event.priceAfter != null ? formatPrice(event.priceAfter) : '-';
      return (
        <span className="text-[12px] font-medium text-foreground">
          {txLabel} 가격 변경 · {before} → {after}
        </span>
      );
    }
    case 'match': {
      const stage =
        matchStageLabels[event.match.stage] ?? event.match.stage;
      const buyerName =
        event.match.buyerRequirement?.contact?.name ?? '매수자';
      return (
        <span className="text-[12px] font-medium text-foreground">
          매칭 생성 · {buyerName} ({stage})
        </span>
      );
    }
  }
}

function ActivityBody({ event }: { event: ActivityEvent }) {
  switch (event.type) {
    case 'consultation':
      return event.consultation.content ? (
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
          {event.consultation.content}
        </p>
      ) : null;
    case 'price':
      return event.priceAfter != null && event.priceBefore != null ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          <CircleDollarSign className="mr-1 inline size-3" />
          {Math.abs(event.priceAfter - event.priceBefore).toLocaleString()}만원{' '}
          {event.priceAfter > event.priceBefore ? '인상' : '인하'}
        </p>
      ) : null;
    case 'match':
      return event.match.memo ? (
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
          {event.match.memo}
        </p>
      ) : null;
  }
}
