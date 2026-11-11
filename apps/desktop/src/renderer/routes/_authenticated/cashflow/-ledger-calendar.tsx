/**
 * 수금 캘린더. 평면 격자에 예정, 입금, 잔여 약정, 연체를 아이콘과 금액으로 표시한다.
 */
import { useMemo } from 'react';
import {
  CalendarClock,
  CircleCheck,
  Clock,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { LedgerDealGroup, LedgerPayment } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  clientSideLabel,
  dealLocation,
  effectiveDueDate,
  isOpenPayment,
  isPaymentOverdue,
  monthKeyOf,
  paymentRemaining,
  receivedAmount,
  toDayKey,
} from './-cashflow-utils';

type EventType = 'due' | 'paid' | 'agreed' | 'overdue';

interface CalendarEvent {
  key: string;
  type: EventType;
  dealId: string;
  payment: LedgerPayment;
  siteName: string;
  location: string;
  amount: number;
}

const EVENT_META: Record<
  EventType,
  { label: string; icon: LucideIcon; className: string }
> = {
  due: { label: '수금 예정', icon: Clock, className: 'text-warning-strong' },
  paid: { label: '입금', icon: CircleCheck, className: 'text-success' },
  agreed: { label: '잔여 약정', icon: CalendarClock, className: 'text-orange' },
  overdue: {
    label: '연체',
    icon: TriangleAlert,
    className: 'text-destructive-strong',
  },
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function LedgerCalendarLegend() {
  return (
    <>
      {(Object.keys(EVENT_META) as EventType[]).map((type) => {
        const { label, icon: Icon, className } = EVENT_META[type];
        return (
          <span key={type} className="inline-flex items-center gap-1">
            <Icon className={cn('size-3', className)} />
            {label}
          </span>
        );
      })}
    </>
  );
}

function buildEvents(groups: LedgerDealGroup[], year: number, month: number) {
  const prefix = monthKeyOf(year, month);
  const byDay = new Map<string, CalendarEvent[]>();
  const add = (
    date: string | null | undefined,
    type: EventType,
    group: LedgerDealGroup,
    payment: LedgerPayment,
    amount: number,
  ) => {
    const day = toDayKey(date);
    if (!day?.startsWith(prefix)) return;
    const list = byDay.get(day) ?? [];
    list.push({
      key: `${payment.id}:${type}`,
      type,
      dealId: group.deal.id,
      payment,
      siteName: group.deal.siteName ?? dealLocation(group.deal),
      location: dealLocation(group.deal),
      amount,
    });
    byDay.set(day, list);
  };

  for (const group of groups) {
    const balance = group.deal.balanceDueDate;
    for (const p of group.payments) {
      const received = receivedAmount(p);
      if (p.paidAt && received > 0) add(p.paidAt, 'paid', group, p, received);
      if (isOpenPayment(p)) {
        const type: EventType = isPaymentOverdue(p, balance)
          ? 'overdue'
          : p.status === 'partial' && p.agreedRemainingDate
            ? 'agreed'
            : 'due';
        add(effectiveDueDate(p, balance), type, group, p, paymentRemaining(p));
      }
    }
  }
  return byDay;
}

/** 그달에 받아야 할 돈과 받은 돈 */
export function calendarTotals(
  groups: LedgerDealGroup[],
  year: number,
  month: number,
) {
  let due = 0;
  let paid = 0;
  for (const list of buildEvents(groups, year, month).values()) {
    for (const event of list) {
      if (event.type === 'paid') paid += event.amount;
      else due += event.amount;
    }
  }
  return { due, paid };
}

export function LedgerCalendar({
  year,
  month,
  groups,
  onOpenDeal,
}: {
  year: number;
  month: number;
  groups: LedgerDealGroup[];
  onOpenDeal: (dealId: string, paymentId?: string) => void;
}) {
  const byDay = useMemo(
    () => buildEvents(groups, year, month),
    [groups, year, month],
  );

  const lead = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  const todayKey = toDayKey(new Date());

  return (
    <div className="grid min-w-[840px] grid-cols-7">
      {WEEKDAYS.map((day) => (
        <div
          key={day}
          className="sticky top-0 z-[3] h-8 border-r border-b border-r-[#eeeeec] border-b-[#d8d6d0] bg-[#f7f7f5] px-2 text-[12.5px] leading-8 text-muted-foreground [&:nth-child(7n)]:border-r-0"
        >
          {day}
        </div>
      ))}
      {Array.from({ length: total }, (_, i) => {
        const date = new Date(year, month - 1, i - lead + 1);
        const key = toDayKey(date) ?? '';
        const outside = date.getMonth() !== month - 1;
        const events = outside ? [] : (byDay.get(key) ?? []);
        const sum = events.reduce((acc, e) => acc + e.amount, 0);
        return (
          <div
            key={key}
            className={cn(
              'flex min-h-28 min-w-0 flex-col gap-0.5 border-r border-b border-[#eeeeec] p-[5px] [&:nth-child(7n)]:border-r-0',
              outside && 'bg-[#fbfbfa]',
            )}
          >
            <div className="flex h-[22px] items-center justify-between px-[3px] text-[12.5px]">
              <span
                className={cn(
                  'grid h-[22px] min-w-[22px] place-items-center rounded-full tabular-nums',
                  outside && 'text-[#a5a39f]',
                  key === todayKey && 'bg-foreground font-semibold text-white',
                )}
              >
                {date.getDate()}
              </span>
              {sum > 0 && (
                <span className="text-[11.5px] text-muted-foreground tabular-nums">
                  {formatMoney(sum)}
                </span>
              )}
            </div>
            {events.slice(0, 3).map((event) => (
              <EventButton key={event.key} event={event} onOpenDeal={onOpenDeal} />
            ))}
            {events.length > 3 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="px-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    +{events.length - 3}건 더
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[240px] p-1">
                  {events.map((event) => (
                    <EventButton
                      key={event.key}
                      event={event}
                      onOpenDeal={onOpenDeal}
                    />
                  ))}
                </PopoverContent>
              </Popover>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventButton({
  event,
  onOpenDeal,
}: {
  event: CalendarEvent;
  onOpenDeal: (dealId: string, paymentId?: string) => void;
}) {
  const { label, icon: Icon, className } = EVENT_META[event.type];
  const side = clientSideLabel(event.payment.clientSide);
  const title = `${label} · ${event.location} ${side} ${formatMoney(event.amount)}`;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="flex min-h-[22px] w-full items-center gap-1 rounded-sm px-1 text-left text-xs transition-colors hover:bg-[rgba(55,53,47,0.08)]"
      onClick={() => onOpenDeal(event.dealId, event.payment.id)}
    >
      <Icon className={cn('size-3 shrink-0', className)} />
      <span className="min-w-0 flex-1 truncate">{event.siteName}</span>
      <span className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums">
        {side.slice(0, 2)} {formatMoney(event.amount).replace(/만$/, '')}
      </span>
    </button>
  );
}
