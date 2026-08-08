import type { RequestFn } from '../client.js';

export type BrokerageCaseLedgerMode = 'all' | 'demand' | 'supply' | 'both';
export type BrokerageCaseLedgerSortField =
  | 'customer'
  | 'intentCount'
  | 'budgetMin'
  | 'budgetMax'
  | 'monthlyRentMin'
  | 'monthlyRentMax'
  | 'areaMin'
  | 'areaMax'
  | 'matchCount'
  | 'updatedAt';

export interface BrokerageCaseParticipant {
  id: string;
  contactId: string;
  roles: string[];
  isPrincipal: boolean;
  isCommunicationPrimary: boolean;
  memo: string | null;
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
}

export interface BrokerageCaseDemandIntent {
  kind: 'demand';
  buyerIntakeId: string;
  intakePriorityRank: number;
  lifecycleStatus: string;
  receivedAt: string;
  requirementId: string;
  priorityRank: number;
  status: string;
  urgency: string;
  transactionType: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  depositMin: number | null;
  depositMax: number | null;
  monthlyRentMin: number | null;
  monthlyRentMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  moveInDate: string | null;
  lastContactDate: string | null;
  nextContactDate: string | null;
  memo: string | null;
  assignedTo: { id: string; name: string } | null;
  matchCount: number;
  preferredSites: Array<{
    id: string;
    name: string;
    type: string;
    priority: number | null;
  }>;
  preferredRegions: Array<{
    provinceCode: string | null;
    provinceName: string | null;
    districtCode: string | null;
    districtName: string | null;
    wardCode: string | null;
    wardName: string | null;
  }>;
  contextLabel: string;
}

export interface BrokerageCaseSupplyIntent {
  kind: 'supply';
  listingIntakeId: string;
  intakePriorityRank: number;
  lifecycleStatus: string;
  receivedAt: string;
  listingId: string;
  transactionType: string;
  askingPrice: number | null;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  area: number | null;
  isPaused: boolean;
  matchCount: number;
  propertyId: string;
  siteId: string;
  siteName: string;
  districtName: string;
  wardName: string;
  dongName: string | null;
  unitName: string | null;
  contextLabel: string;
  memo: string | null;
}

export interface BrokerageCaseDependency {
  id: string;
  officeId: string;
  brokerageCaseId: string;
  fromListingIntakeId: string;
  toBuyerIntakeId: string;
  type: string;
  isRequired: boolean;
  expectedAmount: number | null;
  requiredBy: string | null;
  status: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrokerageCase {
  id: string;
  title: string | null;
  memo: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  participants: BrokerageCaseParticipant[];
  primaryParticipant: BrokerageCaseParticipant | null;
  demandIntents: BrokerageCaseDemandIntent[];
  supplyIntents: BrokerageCaseSupplyIntent[];
  intentCount: number;
  mode: Exclude<BrokerageCaseLedgerMode, 'all'>;
  dependencies: BrokerageCaseDependency[];
}

export interface BrokerageCaseLedgerFilter {
  search?: string;
  mode?: BrokerageCaseLedgerMode;
  /** 아래 조건들은 BuyerRequirement에만 적용된다. 하나라도 있으면 구함 없는 케이스는 제외된다. */
  status?: string;
  urgency?: string;
  transactionType?: string;
  assignedToId?: string;
  preferredSiteIds?: string;
  provinceCodes?: string;
  districtCodes?: string;
  wardCodes?: string;
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  budgetMin?: number;
  budgetMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  nextContactAfter?: string;
  nextContactBefore?: string;
  moveInAfter?: string;
  moveInBefore?: string;
  /** 이전 고객원장 가격 필터 호환용 납품 조건. 신규 구매고객 필터에서는 사용하지 않는다. */
  supplyPriceMin?: number;
  supplyPriceMax?: number;
  sortBy?: BrokerageCaseLedgerSortField;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface BrokerageCaseLedgerResponse {
  items: BrokerageCase[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    cases: number;
    demand: number;
    supply: number;
    both: number;
  };
}

export interface CreateBrokerageCaseDependencyDto {
  fromListingIntakeId: string;
  toBuyerIntakeId: string;
  type: 'sale_proceeds' | 'timing' | 'move_sequence' | 'other';
  isRequired?: boolean;
  expectedAmount?: number | null;
  requiredBy?: string | null;
  status?: 'planned' | 'confirmed' | 'resolved' | 'cancelled';
  memo?: string | null;
}

export function createBrokerageCasesApi(request: RequestFn) {
  return {
    ledger: (filters?: BrokerageCaseLedgerFilter) =>
      request<BrokerageCaseLedgerResponse>('/brokerage-cases/ledger', {
        params: filters as Record<
          string,
          string | number | boolean | undefined
        >,
      }),
    findOne: (id: string) => request<BrokerageCase>(`/brokerage-cases/${id}`),
    update: (
      id: string,
      dto: { title?: string | null; memo?: string | null; archived?: boolean },
    ) =>
      request<BrokerageCase>(`/brokerage-cases/${id}`, {
        method: 'PATCH',
        body: dto,
      }),
    createDependency: (id: string, dto: CreateBrokerageCaseDependencyDto) =>
      request<BrokerageCase>(`/brokerage-cases/${id}/dependencies`, {
        method: 'POST',
        body: dto,
      }),
    removeDependency: (caseId: string, dependencyId: string) =>
      request<BrokerageCase>(
        `/brokerage-cases/${caseId}/dependencies/${dependencyId}`,
        { method: 'DELETE' },
      ),
  };
}
