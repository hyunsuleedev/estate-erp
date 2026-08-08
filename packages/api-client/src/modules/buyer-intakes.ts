import type { RequestFn } from "../client.js";
import type { PaginatedResponse } from "../types.js";
import type { BuyerRequirement } from "./buyer-requirements.js";

export type BuyerIntakeLifecycleStatus = "open" | "hold" | "closed";
export type BuyerIntakeContactRole =
  | "buyer"
  | "co_buyer"
  | "representative"
  | "supporter"
  | "advisor"
  | "other";

export interface BuyerIntakeContact {
  id: string;
  officeId: string;
  buyerIntakeId: string;
  contactId: string;
  role: BuyerIntakeContactRole;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  contact?: {
    id: string;
    name: string;
    phone: string | null;
    email?: string | null;
  };
}

export interface BuyerIntake {
  id: string;
  officeId: string;
  brokerageCaseId: string;
  casePriorityRank: number;
  lifecycleStatus: BuyerIntakeLifecycleStatus;
  receivedAt: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  contacts: BuyerIntakeContact[];
  requirements?: BuyerRequirement[];
}

export interface BuyerIntakesFilter {
  contactId?: string;
  lifecycleStatus?: BuyerIntakeLifecycleStatus;
  status?: string;
  urgency?: string;
  transactionType?: string;
  siteTypes?: string;
  assignedToId?: string;
  preferredSiteIds?: string;
  provinceCodes?: string;
  districtCodes?: string;
  wardCodes?: string;
  priceMin?: number;
  priceMax?: number;
  depositMin?: number;
  depositMax?: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMin?: number;
  areaMax?: number;
  nextContactAfter?: string;
  nextContactBefore?: string;
  moveInAfter?: string;
  moveInBefore?: string;
  search?: string;
  sortBy?: "createdAt" | "receivedAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface BuyerIntakeContactInput {
  contactId: string;
  role?: BuyerIntakeContactRole;
  isPrimary?: boolean;
}

export interface CreateBuyerIntakeDto {
  brokerageCaseId?: string;
  lifecycleStatus?: BuyerIntakeLifecycleStatus;
  receivedAt?: string;
  memo?: string;
  contacts: BuyerIntakeContactInput[];
}

export interface UpdateBuyerIntakeDto {
  lifecycleStatus?: BuyerIntakeLifecycleStatus;
  receivedAt?: string;
  memo?: string | null;
}

export type UpdateBuyerIntakeContactDto = Omit<
  BuyerIntakeContactInput,
  "contactId"
>;

export function createBuyerIntakesApi(request: RequestFn) {
  return {
    findAll: (filters?: BuyerIntakesFilter) =>
      request<PaginatedResponse<BuyerIntake>>("/buyer-intakes", {
        params: filters as Record<
          string,
          string | number | boolean | undefined
        >,
      }),

    findOne: (id: string) => request<BuyerIntake>(`/buyer-intakes/${id}`),

    create: (dto: CreateBuyerIntakeDto) =>
      request<BuyerIntake>("/buyer-intakes", { method: "POST", body: dto }),

    update: (id: string, dto: UpdateBuyerIntakeDto) =>
      request<BuyerIntake>(`/buyer-intakes/${id}`, {
        method: "PATCH",
        body: dto,
      }),

    addContact: (id: string, dto: BuyerIntakeContactInput) =>
      request<BuyerIntake>(`/buyer-intakes/${id}/contacts`, {
        method: "POST",
        body: dto,
      }),

    updateContact: (
      id: string,
      contactId: string,
      dto: UpdateBuyerIntakeContactDto,
    ) =>
      request<BuyerIntake>(`/buyer-intakes/${id}/contacts/${contactId}`, {
        method: "PATCH",
        body: dto,
      }),

    removeContact: (id: string, contactId: string) =>
      request<BuyerIntake>(`/buyer-intakes/${id}/contacts/${contactId}`, {
        method: "DELETE",
      }),
  };
}
