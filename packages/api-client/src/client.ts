import type { ApiClientConfig } from './types.js';
import { ApiError } from './types.js';
import { createAuthApi } from './modules/auth.js';
import { createPropertiesApi } from './modules/properties.js';
import { createListingIntakesApi } from './modules/listing-intakes.js';
import { createListingsApi } from './modules/listings.js';
import { createListingAdvertisementsApi } from './modules/listing-advertisements.js';
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

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * 진행 중인 refresh 요청을 모듈 레벨에서 공유.
 *
 * 동시에 여러 요청이 401을 받았을 때 (예: dashboard 7개 useQuery 동시 발사),
 * 각자 /auth/refresh를 따로 호출하면 Supabase가 refresh token을 회전시키기 때문에
 * 두 번째부터는 stale token으로 실패한다. 첫 401만 refresh를 시작하고
 * 나머지는 같은 Promise를 await해서 새 access token을 받는다.
 */
let refreshPromise: Promise<string> | null = null;

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

async function performRefresh(config: ApiClientConfig): Promise<string> {
  const refreshToken = config.getRefreshToken?.();
  if (!refreshToken) {
    throw new ApiError(401, { message: 'No refresh token' });
  }

  const res = await fetch(`${config.baseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errorBody);
  }

  const data = (await res.json()) as RefreshResponse;
  config.setTokens?.(data.accessToken, data.refreshToken);
  return data.accessToken;
}

async function getOrStartRefresh(config: ApiClientConfig): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performRefresh(config).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function executeRequest<T>(
  config: ApiClientConfig,
  url: string,
  method: HttpMethod,
  body: unknown,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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

  // /auth/refresh 자체는 인터셉터를 거치지 않는다 — 무한 재귀 방지.
  // (호출 경로는 performRefresh()가 직접 fetch.)
  const isRefreshCall = path === '/auth/refresh';
  const canRetry =
    !isRefreshCall &&
    Boolean(config.getRefreshToken && config.setTokens);

  let res = await executeRequest(
    config,
    url,
    method,
    body,
    (await config.getToken?.()) ?? null,
  );

  if (res.status === 401 && canRetry) {
    try {
      const newAccessToken = await getOrStartRefresh(config);
      res = await executeRequest(config, url, method, body, newAccessToken);
    } catch {
      // Refresh 실패 = refresh token도 만료/폐기. 호스트 앱에 알리고 원래 401을 그대로 throw.
      config.onAuthFailure?.();
      throw new ApiError(401, { message: 'Authentication required' });
    }
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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type RequestFn = <T>(path: string, options?: RequestOptions) => Promise<T>;
