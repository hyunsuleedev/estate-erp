import type { ApiClientConfig } from './types.js';
import { ApiError } from './types.js';
import { createAuthApi } from './modules/auth.js';
import { createPropertiesApi } from './modules/properties.js';
import { createListingsApi } from './modules/listings.js';
import { createContactsApi } from './modules/contacts.js';
import { createSitesApi } from './modules/sites.js';
import { createDongsApi } from './modules/dongs.js';
import { createUnitsApi } from './modules/units.js';
import { createTasksApi } from './modules/tasks.js';
import { createMatchesApi } from './modules/matches.js';
import { createDealsApi } from './modules/deals.js';
import { createContractsApi } from './modules/contracts.js';
import { createConsultationsApi } from './modules/consultations.js';
import { createBuyerRequirementsApi } from './modules/buyer-requirements.js';
import { createCalendarEventsApi } from './modules/calendar-events.js';
import { createPropertyContactsApi } from './modules/property-contacts.js';
import { createContactRelationsApi } from './modules/contact-relations.js';
import { createTenantsApi } from './modules/tenants.js';
import { createOfficeSitesApi } from './modules/office-sites.js';
import { createEmployeesApi } from './modules/employees.js';
import { createOfficesApi } from './modules/offices.js';
import { createExternalListingsApi } from './modules/external-listings.js';
import { createProposalsApi } from './modules/proposals.js';
import { createRulesApi } from './modules/rules.js';
import { createFinanceApi } from './modules/finance.js';
import { createPartnerBrokersApi } from './modules/partner-brokers.js';
import { createPublicDocumentsApi } from './modules/public-documents.js';
import { createPropertyPhotosApi } from './modules/property-photos.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

export async function request<T>(
  config: ApiClientConfig,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, params } = options;

  let url = `${config.baseUrl}${path}`;

  if (params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        search.set(key, String(value));
      }
    }
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = config.getToken?.();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errorBody);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export function createApiClient(config: ApiClientConfig) {
  const req = <T>(path: string, options?: RequestOptions) =>
    request<T>(config, path, options);

  return {
    auth: createAuthApi(req),
    properties: createPropertiesApi(req),
    listings: createListingsApi(req),
    contacts: createContactsApi(req),
    sites: createSitesApi(req),
    dongs: createDongsApi(req),
    units: createUnitsApi(req),
    tasks: createTasksApi(req),
    matches: createMatchesApi(req),
    deals: createDealsApi(req),
    contracts: createContractsApi(req),
    consultations: createConsultationsApi(req),
    buyerRequirements: createBuyerRequirementsApi(req),
    calendarEvents: createCalendarEventsApi(req),
    propertyContacts: createPropertyContactsApi(req),
    contactRelations: createContactRelationsApi(req),
    tenants: createTenantsApi(req),
    officeSites: createOfficeSitesApi(req),
    employees: createEmployeesApi(req),
    offices: createOfficesApi(req),
    externalListings: createExternalListingsApi(req),
    proposals: createProposalsApi(req),
    rules: createRulesApi(req),
    finance: createFinanceApi(req),
    partnerBrokers: createPartnerBrokersApi(req),
    publicDocuments: createPublicDocumentsApi(req),
    propertyPhotos: createPropertyPhotosApi(req),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type RequestFn = <T>(path: string, options?: RequestOptions) => Promise<T>;
