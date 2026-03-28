export { createApiClient } from './client.js';
export type { ApiClient, RequestFn } from './client.js';
export { ApiError } from './types.js';
export type { ApiClientConfig, PaginatedResponse } from './types.js';

// Module types
export type { LoginDto, RegisterDto, AuthResponse, MeResponse } from './modules/auth.js';
export type { Property, PropertiesFilter, CreatePropertyDto, UpdatePropertyDto } from './modules/properties.js';
export type { Contact, ContactsFilter, CreateContactDto, UpdateContactDto } from './modules/contacts.js';
export type { Site, CreateSiteDto } from './modules/sites.js';
export type { Dong } from './modules/dongs.js';
export type { Unit, CreateUnitDto, UpdateUnitDto } from './modules/units.js';
export type { Task, CreateTaskDto, UpdateTaskDto } from './modules/tasks.js';
export type { Match, CreateMatchDto } from './modules/matches.js';
export type { Deal, CreateDealDto } from './modules/deals.js';
export type { Consultation, ConsultationsFilter, CreateConsultationDto, UpdateConsultationDto } from './modules/consultations.js';
export type { BuyerRequirement, BuyerRequirementsFilter, CreateBuyerRequirementDto } from './modules/buyer-requirements.js';
export type { CalendarEvent, CalendarEventsFilter, CreateCalendarEventDto, UpdateCalendarEventDto } from './modules/calendar-events.js';
export type { PropertyContact, CreatePropertyContactDto, UpdatePropertyContactDto } from './modules/property-contacts.js';
export type { ContactRelation, CreateContactRelationDto } from './modules/contact-relations.js';
export type { Tenant, CreateTenantDto, UpdateTenantDto } from './modules/tenants.js';
export type { OfficeSite } from './modules/office-sites.js';
