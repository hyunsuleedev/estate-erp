import type { RequestFn } from '../client.js';
import type {
  ListingIntakeState,
  ListingOccupyingDeal,
} from './listings.js';

export interface CalendarListingIntake extends ListingIntakeState {
  id: string;
  propertyId: string;
  receivedAt: string;
}

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
  buyerIntakeId?: string | null;
  projectId?: string | null;
  contactId: string | null;
  matchId: string | null;
  dealId: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string } | null;
  contact?: { id: string; name: string; phone: string | null } | null;
  property?: {
    id: string;
    site?: { name: string | null } | null;
    /** 같은 단지의 여러 호실을 구분하는 동·호 */
    unit?: {
      name: string | null;
      floor?: number | null;
      floorEnd?: number | null;
      floorLabel?: string | null;
      dong?: { name: string; isPlaceholder?: boolean } | null;
    } | null;
  } | null;
  listingIntake?: CalendarListingIntake | null;
  listing?: {
    id: string;
    transactionType: string;
    price: number | null;
    isPaused: boolean;
    intake?: ListingIntakeState | null;
    deals?: ListingOccupyingDeal[];
  } | null;
  /** closedReason: 매칭이 닫혔으면 그 이유(MatchClosedReason). 닫힌 매칭의 앞날 일정은 취소된 약속으로 보인다 */
  match?: {
    id: string;
    stage: string;
    closedReason?: string | null;
    deals?: Array<{ id: string; stage: string; createdAt?: string | null; isCancelled?: boolean }>;
  } | null;
  deal?: { id: string; stage: string; createdAt?: string | null; isCancelled?: boolean } | null;
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
  /** 담당 직원. 비우면 만든 사람 */
  userId?: string;
  propertyId?: string;
  listingIntakeId?: string;
  listingId?: string;
  buyerIntakeId?: string;
  projectId?: string;
  contactId?: string;
  matchId?: string;
  dealId?: string;
}

export interface UpdateCalendarEventDto {
  title?: string;
  /** null·빈 글이면 설명을 지운다 */
  description?: string | null;
  type?: string;
  allDay?: boolean;
  start?: string;
  /** null 전달 시 종료 시간 제거 (서버가 null을 그대로 저장) */
  end?: string | null;
  color?: string | null;
  /** 담당 직원 바꾸기 */
  userId?: string;
  propertyId?: string | null;
  listingIntakeId?: string | null;
  listingId?: string | null;
  buyerIntakeId?: string | null;
  projectId?: string | null;
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
