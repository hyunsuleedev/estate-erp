import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import koLocale from '@fullcalendar/core/locales/ko';
import type {
  DateSelectArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core';
import { Landmark } from 'lucide-react';
import type { CalendarEvent } from '@estate-erp/api-client';

import { cn } from '@/lib/utils';
import { getLocalDateKey } from './-calendar-view-utils';
import { formatEventContext, getEventColor, withAlpha } from './-event-meta';
import { OVERLAY_META, type OverlayItem } from './-calendar-overlay';
import { SelectedDayPanel } from './-month-view';

type FullCalendarViewMode = 'month' | 'week' | 'day';

export type CalendarEventDateChange = {
  start: string;
  end: string | null;
  allDay: boolean;
};

type FullCalendarViewProps = {
  viewMode: FullCalendarViewMode;
  currentDate: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  overlaysByDate: Map<string, OverlayItem[]>;
  selectedDateEvents: CalendarEvent[];
  onCreate: (start: Date, end: Date, allDay: boolean) => void;
  onEdit: (event: CalendarEvent) => void;
  onSelectDate: (date: Date) => void;
  onEventDatesChange: (eventId: string, dates: CalendarEventDateChange) => Promise<void>;
};

const VIEW_NAMES: Record<FullCalendarViewMode, string> = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
  day: 'timeGridDay',
};

function getCalendarEnd(event: CalendarEvent) {
  if (!event.end || !event.allDay) return event.end ?? undefined;

  const end = new Date(event.end);
  if (end.getHours() !== 0 || end.getMinutes() !== 0 || end.getSeconds() !== 0) {
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
  }

  return end.toISOString();
}

function toFullCalendarEvent(event: CalendarEvent): EventInput {
  const color = getEventColor(event);

  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: getCalendarEnd(event),
    allDay: event.allDay,
    backgroundColor: withAlpha(color, '18'),
    borderColor: color,
    textColor: '#37352f',
    editable: true,
    extendedProps: { sourceEvent: event },
  };
}

function toOverlayEvent(item: OverlayItem): EventInput {
  const meta = OVERLAY_META[item.kind];

  return {
    id: `overlay-${item.id}`,
    title: item.title,
    start: item.dateKey,
    allDay: true,
    editable: false,
    backgroundColor: withAlpha(meta.color, '0D'),
    borderColor: withAlpha(meta.color, '66'),
    textColor: meta.color,
    classNames: ['estate-calendar-overlay-event'],
    extendedProps: { overlayItem: item },
  };
}

function CalendarEventContent({ event, timeText, view }: EventContentArg) {
  const sourceEvent = event.extendedProps.sourceEvent as CalendarEvent | undefined;
  const overlayItem = event.extendedProps.overlayItem as OverlayItem | undefined;

  if (overlayItem) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 px-0.5">
        <Landmark className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate font-medium">{event.title}</span>
      </span>
    );
  }

  return (
    <span className="flex min-w-0 flex-col px-0.5 leading-tight">
      <span className="flex min-w-0 items-center gap-1.5">
        {timeText ? <span className="shrink-0 tabular-nums opacity-70">{timeText}</span> : null}
        <span className="truncate font-semibold">{event.title}</span>
      </span>
      {sourceEvent && view.type !== 'dayGridMonth' ? (
        <span className="mt-1 truncate text-[10px] opacity-70">{formatEventContext(sourceEvent)}</span>
      ) : null}
    </span>
  );
}

export function FullCalendarView({
  viewMode,
  currentDate,
  selectedDate,
  events,
  overlaysByDate,
  selectedDateEvents,
  onCreate,
  onEdit,
  onSelectDate,
  onEventDatesChange,
}: FullCalendarViewProps) {
  const calendarRef = useRef<FullCalendar>(null);
  const navigate = useNavigate();

  const calendarEvents = useMemo(() => {
    const overlays = [...overlaysByDate.values()].flat();
    return [...events.map(toFullCalendarEvent), ...overlays.map(toOverlayEvent)];
  }, [events, overlaysByDate]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;

    const nextView = VIEW_NAMES[viewMode];
    if (api.view.type !== nextView) api.changeView(nextView, currentDate);
    else api.gotoDate(currentDate);
  }, [currentDate, viewMode]);

  const handleSelect = (selection: DateSelectArg) => {
    onSelectDate(selection.start);
    onCreate(selection.start, selection.end, selection.allDay);
    selection.view.calendar.unselect();
  };

  const handleEventClick = (click: EventClickArg) => {
    const overlayItem = click.event.extendedProps.overlayItem as OverlayItem | undefined;
    if (overlayItem) {
      void navigate({ to: OVERLAY_META[overlayItem.kind].link });
      return;
    }

    const sourceEvent = click.event.extendedProps.sourceEvent as CalendarEvent | undefined;
    if (sourceEvent) onEdit(sourceEvent);
  };

  const persistEventDates = async (
    eventId: string,
    start: Date | null,
    end: Date | null,
    allDay: boolean,
    revert: () => void,
  ) => {
    if (!start) {
      revert();
      return;
    }

    try {
      await onEventDatesChange(eventId, {
        start: start.toISOString(),
        end: end?.toISOString() ?? null,
        allDay,
      });
    } catch {
      revert();
    }
  };

  const handleEventDrop = (drop: EventDropArg) => {
    void persistEventDates(
      drop.event.id,
      drop.event.start,
      drop.event.end,
      drop.event.allDay,
      drop.revert,
    );
  };

  const handleEventResize = (resize: EventResizeDoneArg) => {
    void persistEventDates(
      resize.event.id,
      resize.event.start,
      resize.event.end,
      resize.event.allDay,
      resize.revert,
    );
  };

  const calendar = (
    <div className="estate-full-calendar min-w-[680px] bg-background">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        locale={koLocale}
        initialView={VIEW_NAMES[viewMode]}
        initialDate={currentDate}
        headerToolbar={false}
        events={calendarEvents}
        editable
        selectable
        selectMirror
        nowIndicator
        navLinks={false}
        dayMaxEvents={4}
        moreLinkClick="popover"
        eventResizableFromStart
        eventStartEditable
        eventDurationEditable
        allDayMaintainDuration
        slotMinTime="06:00:00"
        slotMaxTime="23:00:00"
        slotDuration="00:30:00"
        snapDuration="00:15:00"
        scrollTime="08:00:00"
        scrollTimeReset={false}
        slotLabelInterval="01:00:00"
        height="auto"
        expandRows={viewMode === 'month'}
        businessHours={{
          daysOfWeek: [1, 2, 3, 4, 5, 6],
          startTime: '09:00',
          endTime: '18:00',
        }}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        dayHeaderFormat={{ weekday: 'short', month: 'numeric', day: 'numeric', omitCommas: true }}
        select={handleSelect}
        eventClick={handleEventClick}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        eventContent={(content) => <CalendarEventContent {...content} />}
        dayCellClassNames={(cell) =>
          cn(getLocalDateKey(cell.date) === getLocalDateKey(selectedDate) && 'estate-calendar-selected-day')
        }
      />
    </div>
  );

  if (viewMode !== 'month') {
    return <div className="overflow-x-auto rounded-[12px] border border-border bg-background">{calendar}</div>;
  }

  return (
    <div className="grid overflow-hidden rounded-[12px] border border-border bg-background xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 overflow-x-auto xl:border-r">{calendar}</div>
      <SelectedDayPanel
        selectedDate={selectedDate}
        selectedDateEvents={selectedDateEvents}
        selectedDateOverlays={overlaysByDate.get(getLocalDateKey(selectedDate)) ?? []}
        onCreate={(date) => {
          const end = new Date(date);
          end.setHours(date.getHours() + 1);
          onCreate(date, end, false);
        }}
        onEdit={onEdit}
      />
    </div>
  );
}
