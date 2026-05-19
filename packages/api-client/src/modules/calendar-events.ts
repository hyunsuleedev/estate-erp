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
  listingIntakeId: string | null;
  listingId: string | null;
  contactId: string | null;
  matchId: string | null;
  dealId: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string } | null;
  contact?: { id: string; name: string; phone: string | null } | null;
  property?: {
    id: string;
    memo: string | null;
    site?: { name: string | null } | null;
  } | null;
  listingIntake?: {
    id: string;
    status: string;
    propertyId: string;
    receivedAt: string;
  } | null;
  listing?: {
    id: string;
    transactionType: string;
    price: number | null;
    checkStatus: string;
  } | null;
  match?: { id: string; stage: string } | null;
  deal?: { id: string; stage: string } | null;
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
  listingIntakeId?: string;
  listingId?: string;
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
  listingIntakeId?: string | null;
  listingId?: string | null;
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
