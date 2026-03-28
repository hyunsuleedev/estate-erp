import type { RequestFn } from '../client.js';

export interface CalendarEvent {
  id: string;
  officeId: string;
  userId: string;
  title: string;
  description: string | null;
  type: string;
  allDay: boolean;
  start: string;
  end: string | null;
  color: string | null;
  propertyId: string | null;
  contactId: string | null;
  matchId: string | null;
  dealId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventsFilter {
  start?: string;
  end?: string;
  userId?: string;
  type?: string;
}

export interface CreateCalendarEventDto {
  title: string;
  description?: string;
  type?: string;
  allDay?: boolean;
  start: string;
  end?: string;
  color?: string;
  propertyId?: string;
  contactId?: string;
  matchId?: string;
  dealId?: string;
}

export interface UpdateCalendarEventDto {
  title?: string;
  description?: string;
  type?: string;
  allDay?: boolean;
  start?: string;
  end?: string;
  color?: string;
  propertyId?: string | null;
  contactId?: string | null;
  matchId?: string | null;
  dealId?: string | null;
}

export function createCalendarEventsApi(request: RequestFn) {
  return {
    findAll: (filters?: CalendarEventsFilter) =>
      request<CalendarEvent[]>('/calendar-events', {
        params: filters as Record<string, string | number | boolean | undefined>,
      }),

    findOne: (id: string) =>
      request<CalendarEvent>(`/calendar-events/${id}`),

    create: (dto: CreateCalendarEventDto) =>
      request<CalendarEvent>('/calendar-events', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateCalendarEventDto) =>
      request<CalendarEvent>(`/calendar-events/${id}`, { method: 'PATCH', body: dto }),

    remove: (id: string) =>
      request<void>(`/calendar-events/${id}`, { method: 'DELETE' }),
  };
}
