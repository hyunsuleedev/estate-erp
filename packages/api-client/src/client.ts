import type { ApiClientConfig } from './types.js';
import { ApiError } from './types.js';
import { createAuthApi } from './modules/auth.js';
import { createPropertiesApi } from './modules/properties.js';
import { createListingIntakesApi } from './modules/listing-intakes.js';
import { createListingsApi } from './modules/listings.js';
import { createListingAdvertisementsApi } from './modules/listing-advertisements.js';
import { createOfficeAdvertisementsApi } from './modules/office-advertisements.js';
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
import { createCallRecordingsApi } from './modules/call-recordings.js';
import { createInboxApi } from './modules/inbox.js';
import { createMcpApi } from './modules/mcp.js';
import { createRegionsApi } from './modules/regions.js';
import { createServiceVendorsApi } from './modules/service-vendors.js';
import { createNotificationsApi } from './modules/notifications.js';
import { createNetworkApi } from './modules/network.js';
import { createDashboardApi } from './modules/dashboard.js';
import { createActivityLogsApi } from './modules/activity-logs.js';
import { createCtiApi } from './modules/cti.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

async function executeRequest<T>(
  config: ApiClientConfig,
  url: string,
  method: HttpMethod,
  body: unknown,
  token: string | null,
): Promise<Response> {
  // FormData(multipart) body는 Content-Type을 직접 지정하지 않는다 —
  // fetch가 boundary가 포함된 헤더를 자동으로 설정한다.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, {
    method,
    headers,
    body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  });
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

  let res = await executeRequest(
    config,
    url,
    method,
    body,
    (await config.getToken?.()) ?? null,
  );

  if (res.status === 401) {
    config.onAuthFailure?.();
  }

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
    listingIntakes: createListingIntakesApi(req),
    listings: createListingsApi(req),
    listingAdvertisements: createListingAdvertisementsApi(req),
    officeAdvertisements: createOfficeAdvertisementsApi(req),
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
    callRecordings: createCallRecordingsApi(req),
    inbox: createInboxApi(req),
    mcp: createMcpApi(req),
    regions: createRegionsApi(req),
    serviceVendors: createServiceVendorsApi(req),
    notifications: createNotificationsApi(req),
    network: createNetworkApi(req),
    dashboard: createDashboardApi(req),
    activityLogs: createActivityLogsApi(req),
    cti: createCtiApi(req),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type RequestFn = <T>(path: string, options?: RequestOptions) => Promise<T>;
