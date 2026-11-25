import type { RequestFn } from '../client.js';
import type {
  ListingIntakeState,
  ListingOccupyingDeal,
} from './listings.js';

export interface TaskAssignee {
  id: string;
  name: string;
}

export type TaskUserRef = TaskAssignee;

export interface TaskContact {
  id: string;
  name: string;
  phone: string | null;
}

export interface TaskPropertySummary {
  id: string;
  officeId: string;
  siteId: string;
  unitId: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  site?: {
    id: string;
    name: string;
    type: string;
    roadAddress: string | null;
    jibunAddress: string | null;
  };
  unit?: {
    id: string;
    /** 호 이름. 호 없이 층이 단위인 공간은 null */
    name: string | null;
    floor: number | null;
    lineNo?: number | null;
    exclusiveAreaM2: number | null;
    supplyAreaM2: number | null;
    dong?: {
      id: string;
      name: string;
      isPlaceholder: boolean;
    } | null;
  } | null;
  /** 이 호실의 가장 최근 매물 의뢰 (끝났으면 업무 줄에 '종료된 매물'을 흐리게 붙인다) */
  listingIntakes?: Array<{ id: string; lifecycleStatus: string; closedReason: string | null }>;
}

export interface TaskListingSummary {
  id: string;
  officeId: string;
  propertyId: string;
  intakeId: string;
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  moveInAvailableType: string | null;
  moveInAvailableFrom: string | null;
  moveInAvailableTo: string | null;
  isPaused: boolean;
  memo: string | null;
  intake?: ListingIntakeState | null;
  deals?: ListingOccupyingDeal[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskConsultationSummary {
  id: string;
  officeId: string;
  contactId: string;
  createdById: string;
  type: string;
  content: string;
  propertyId: string | null;
  listingIntakeId: string | null;
  listingId: string | null;
  matchId: string | null;
  buyerReqId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListingIntakeSummary extends ListingIntakeState {
  id: string;
  propertyId: string;
  receivedAt: string;
}

export interface TaskBuyerRequirementSummary {
  id: string;
  status: string;
  contact: TaskContact | null;
}

export interface TaskMatchSummary {
  id: string;
  stage: string;
  listingId: string;
  buyerReqId: string;
}

export interface TaskDealSummary {
  id: string;
  stage: string;
  /** 취소된 거래 (업무 줄에 '취소된 거래'를 흐리게 붙인다) */
  isCancelled?: boolean;
  transactionType: string;
  listingId: string | null;
  matchId: string | null;
  buyerContactId: string | null;
  sellerContactId: string | null;
}

export interface TaskContractSummary {
  id: string;
  status: string;
  dealId: string;
  contractDate: string | null;
  moveInDate: string | null;
}

/** 업무가 속한 프로젝트. 이름이 없으면 화면은 "제목 없음"으로 보인다. */
export interface TaskProjectRef {
  id: string;
  title: string | null;
  /** 끝낸 프로젝트면 끝낸 때 */
  archivedAt: string | null;
}

export interface TaskAdvertisementChangeRequestSummary {
  id: string;
  advertisementId: string | null;
  listingId: string | null;
  channel: string;
  cpAccountId: string | null;
  action: string;
  status: string;
  targetValue: Record<string, unknown> | null;
  baseSnapshot: Record<string, unknown> | null;
  failureReason: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  officeId: string;
  title: string;
  content: string | null;
  source: string;
  status: string;
  priority: string;
  category: string;
  sortOrder: number;
  dueDate: string | null;
  assignedToId: string | null;
  assignedTo: TaskAssignee | null;
  createdById: string | null;
  createdBy: TaskUserRef | null;
  assignedById: string | null;
  assignedBy: TaskUserRef | null;
  assignedAt: string | null;
  contact: TaskContact | null;
  contactId: string | null;
  property: TaskPropertySummary | null;
  propertyId: string | null;
  listingIntake: TaskListingIntakeSummary | null;
  listingIntakeId: string | null;
  listing: TaskListingSummary | null;
  listingId: string | null;
  consultation: TaskConsultationSummary | null;
  consultationId: string | null;
  buyerIntakeId?: string | null;
  buyerRequirement: TaskBuyerRequirementSummary | null;
  buyerReqId: string | null;
  match: TaskMatchSummary | null;
  matchId: string | null;
  deal: TaskDealSummary | null;
  dealId: string | null;
  contract: TaskContractSummary | null;
  contractId: string | null;
  /** 이 업무를 적어 둔 프로젝트 (없으면 null) */
  project: TaskProjectRef | null;
  projectId: string | null;
  advertisementChangeRequests?: TaskAdvertisementChangeRequestSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskDto {
  title: string;
  content?: string;
  source?: string;
  status?: string;
  priority?: string;
  category?: string;
  dueDate?: string;
  assignedToId?: string;
  contactId?: string;
  propertyId?: string;
  listingIntakeId?: string;
  listingId?: string;
  consultationId?: string;
  buyerIntakeId?: string;
  buyerReqId?: string;
  matchId?: string;
  dealId?: string;
  contractId?: string;
  /** 이 프로젝트의 업무로 만든다 */
  projectId?: string;
}

export interface UpdateTaskDto {
  title?: string;
  /** 빈 글을 보내면 설명을 지운다 (보내지 않으면 그대로) */
  content?: string;
  status?: string;
  priority?: string;
  category?: string;
  dueDate?: string | null;
  assignedToId?: string | null;
  contactId?: string | null;
  propertyId?: string | null;
  listingIntakeId?: string | null;
  listingId?: string | null;
  consultationId?: string | null;
  buyerIntakeId?: string | null;
  buyerReqId?: string | null;
  matchId?: string | null;
  dealId?: string | null;
  contractId?: string | null;
  /** null을 보내면 프로젝트에서 뺀다 (보내지 않으면 그대로) */
  projectId?: string | null;
}

export interface TasksFilter {
  status?: string;
  category?: string;
  assignedToId?: string;
  /** 이 프로젝트에 적은 업무만 */
  projectId?: string;
}

export function createTasksApi(request: RequestFn) {
  return {
    findAll: (filter: TasksFilter = {}) =>
      request<Task[]>('/tasks', {
        params: filter as Record<
          string,
          string | number | boolean | undefined
        >,
      }),

    findOne: (id: string) =>
      request<Task>(`/tasks/${id}`),

    create: (dto: CreateTaskDto) =>
      request<Task>('/tasks', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateTaskDto) =>
      request<Task>(`/tasks/${id}`, { method: 'PATCH', body: dto }),

    claim: (id: string) =>
      request<Task>(`/tasks/${id}/claim`, { method: 'POST' }),

    reorder: (orderedIds: string[]) =>
      request<{ count: number }>('/tasks/reorder', { method: 'POST', body: { orderedIds } }),

    bulkUpdateStatus: (ids: string[], status: string) =>
      request<{ count: number }>('/tasks/bulk-status', { method: 'POST', body: { ids, status } }),

    bulkDelete: (ids: string[]) =>
      request<{ count: number }>('/tasks/bulk-delete', { method: 'POST', body: { ids } }),

    remove: (id: string) =>
      request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  };
}
