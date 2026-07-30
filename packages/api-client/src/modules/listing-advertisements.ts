import type { RequestFn } from "../client.js";
import type { PaginatedResponse } from "../types.js";
import type {
  Listing,
  ListingAdvertisement,
  ListingAdvertisementStatus,
} from "./listings.js";
import type { OfficeAdvertisementGroup } from "./office-advertisements.js";

export type ListingAdvertisementWithListing = ListingAdvertisement & {
  listing?: Listing;
  officeAdvertisementGroup?: OfficeAdvertisementGroup | null;
  actionContext?: ListingAdvertisementActionContext;
};

export interface ListingAdvertisementActionContext {
  comparisonGroupId: string | null;
  mainAdvertisementId: string | null;
  observedAt: string | null;
  isActive: boolean | null;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}

export interface MyAdvertisementsSyncSession {
  id: string;
  status: string;
  waitingReason: string | null;
  lastRunAt: string | null;
  completedAt: string | null;
  error: string | null;
  updatedAt: string;
}

export interface MyAdvertisementsSyncWakeup {
  id: string;
  status: string;
  requestedAt: string;
  claimedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  coalescedCount: number;
}

export type MyAdvertisementsSyncRunStatus =
  | "queued"
  | "running"
  | "awaiting_input"
  | "completed"
  | "failed"
  | "cancelled";

export type MyAdvertisementsSyncStepStatus =
  | "blocked"
  | "ready"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "needs_input"
  | "skipped"
  | "cancelled";

export interface MyAdvertisementsSyncStep {
  id: string;
  runId: string;
  stepKey: string;
  position: number;
  kind: string;
  title: string;
  status: MyAdvertisementsSyncStepStatus;
  channel: string | null;
  skillKey: string | null;
  skillVersion: string | null;
  dependsOnKeys: string[];
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  waitingReason: string | null;
  attemptCount: number;
  progressTotal: number;
  progressComplete: number;
  progressFailed: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyAdvertisementsSyncRun {
  id: string;
  workflowKey: string;
  schemaVersion: number;
  status: MyAdvertisementsSyncRunStatus;
  requestedBy: string;
  channels: string[];
  context: Record<string, unknown>;
  currentStepId: string | null;
  currentStepKey: string | null;
  steps: MyAdvertisementsSyncStep[];
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyAdvertisementsSyncStatus {
  run: MyAdvertisementsSyncRun | null;
  session: MyAdvertisementsSyncSession | null;
  wakeup: MyAdvertisementsSyncWakeup | null;
}

export interface RequestMyAdvertisementsSyncResult extends MyAdvertisementsSyncStatus {
  created: boolean;
}

export interface RequestMyAdvertisementsSyncInput {
  executionTarget: "local";
  runnerDeviceId: string;
  credentialProviders: Array<"esiljang" | "budongsanbank">;
}

export interface ListingAdvertisementsFilter {
  listingId?: string;
  channel?: string;
  status?: ListingAdvertisementStatus;
  source?: string;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "startedAt" | "lastCheckedAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface CreateListingAdvertisementDto {
  listingId: string;
  channel: string;
  status?: ListingAdvertisementStatus;
  source?: string;
  advertisedPrice?: number | null;
  advertisedDeposit?: number | null;
  advertisedMonthlyRent?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  url?: string | null;
  memo?: string | null;
  externalAdId?: string | null;
  naverArticleNo?: string | null;
  naverUrl?: string | null;
  lastCheckedAt?: string | null;
  lastSyncedAt?: string | null;
}

export interface UpdateListingAdvertisementDto {
  channel?: string;
  status?: ListingAdvertisementStatus;
  source?: string;
  advertisedPrice?: number | null;
  advertisedDeposit?: number | null;
  advertisedMonthlyRent?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  url?: string | null;
  memo?: string | null;
  externalAdId?: string | null;
  naverArticleNo?: string | null;
  naverUrl?: string | null;
  lastCheckedAt?: string | null;
  lastSyncedAt?: string | null;
}

export function createListingAdvertisementsApi(request: RequestFn) {
  return {
    getFullSyncStatus: () =>
      request<MyAdvertisementsSyncStatus>(
        "/listing-advertisements/full-sync/status",
      ),

    requestFullSync: (input: RequestMyAdvertisementsSyncInput) =>
      request<RequestMyAdvertisementsSyncResult>(
        "/listing-advertisements/full-sync",
        { method: "POST", body: input },
      ),

    retryFullSyncStep: (stepId: string) =>
      request<MyAdvertisementsSyncStatus>(
        `/listing-advertisements/full-sync/steps/${stepId}/retry`,
        { method: "POST" },
      ),

    findAll: (filters?: ListingAdvertisementsFilter) =>
      request<PaginatedResponse<ListingAdvertisementWithListing>>(
        "/listing-advertisements",
        {
          params: filters as Record<
            string,
            string | number | boolean | undefined
          >,
        },
      ),

    create: (dto: CreateListingAdvertisementDto) =>
      request<ListingAdvertisement>("/listing-advertisements", {
        method: "POST",
        body: dto,
      }),

    update: (id: string, dto: UpdateListingAdvertisementDto) =>
      request<ListingAdvertisement>(`/listing-advertisements/${id}`, {
        method: "PATCH",
        body: dto,
      }),

    /** 광고 기록 자체를 잘못 등록한 경우 완전 삭제. 정상 내림은 update({status:'ended'}) 사용. */
    remove: (id: string) =>
      request<ListingAdvertisement>(`/listing-advertisements/${id}`, {
        method: "DELETE",
      }),
  };
}
