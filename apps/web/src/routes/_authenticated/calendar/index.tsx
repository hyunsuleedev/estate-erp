import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_authenticated/calendar/')({
  component: CalendarPage,
});

function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const start = new Date(year, month, 1).toISOString();
  const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const { data: events } = useQuery({
    queryKey: ['calendar-events', year, month],
    queryFn: () => api.calendarEvents.findAll({ start, end }),
  });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  const getEventsForDay = (day: number) => {
    if (!events) return [];
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter((e) => e.start.startsWith(dateStr));
  };

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">캘린더</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[100px] text-center text-sm font-semibold tabular-nums">
            {year}년 {month + 1}월
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl bg-muted/50">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border/40">
          {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
            <div
              key={day}
              className={cn(
                'px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground',
                i === 0 && 'text-red-400',
                i === 6 && 'text-blue-400',
              )}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Date cells */}
        <div className="grid grid-cols-7">
          {blanks.map((i) => (
            <div key={`blank-${i}`} className="min-h-[88px] border-b border-r border-border/40 p-1.5" />
          ))}
          {days.map((day) => {
            const dayEvents = getEventsForDay(day);
            const dayOfWeek = new Date(year, month, day).getDay();
            return (
              <div
                key={day}
                className="min-h-[88px] border-b border-r border-border/40 p-1.5 last:border-r-0"
              >
                <span
                  className={cn(
                    'inline-flex text-xs tabular-nums',
                    isToday(day)
                      ? 'flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground'
                      : dayOfWeek === 0
                        ? 'text-red-400'
                        : dayOfWeek === 6
                          ? 'text-blue-400'
                          : 'text-foreground',
                  )}
                >
                  {day}
                </span>
                <div className="mt-0.5 space-y-0.5">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className="truncate rounded px-1 py-px text-[10px] font-medium leading-tight"
                      style={{
                        backgroundColor: (event.color || '#4f46e5') + '15',
                        color: event.color || '#4f46e5',
                      }}
                    >
                      {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="px-1 text-[10px] text-muted-foreground">+{dayEvents.length - 3}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
