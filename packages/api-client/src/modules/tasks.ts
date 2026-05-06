import type { RequestFn } from '../client.js';

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
    name: string;
    floor: number | null;
    lineNo?: number | null;
    exclusiveAreaM2: number | null;
    supplyAreaM2: number | null;
  } | null;
}

export interface TaskListingSummary {
  id: string;
  officeId: string;
  propertyId: string;
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  moveInAvailableType: string | null;
  moveInAvailableFrom: string | null;
  moveInAvailableTo: string | null;
  isJointBrokerageRequired: boolean;
  jointBrokeragePartnerId: string | null;
  checkStatus: string;
  isHidden: boolean;
  memo: string | null;
  checkStatusChangedAt?: string | null;
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
  listingId: string | null;
  matchId: string | null;
  buyerReqId: string | null;
  createdAt: string;
  updatedAt: string;
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
  listing: TaskListingSummary | null;
  listingId: string | null;
  consultation: TaskConsultationSummary | null;
  consultationId: string | null;
  buyerRequirement: TaskBuyerRequirementSummary | null;
  buyerReqId: string | null;
  match: TaskMatchSummary | null;
  matchId: string | null;
  deal: TaskDealSummary | null;
  dealId: string | null;
  contract: TaskContractSummary | null;
  contractId: string | null;
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
  listingId?: string;
  consultationId?: string;
  buyerReqId?: string;
  matchId?: string;
  dealId?: string;
  contractId?: string;
}

export interface UpdateTaskDto {
  title?: string;
  content?: string;
  status?: string;
  priority?: string;
  category?: string;
  dueDate?: string | null;
  assignedToId?: string | null;
  contactId?: string | null;
  propertyId?: string | null;
  listingId?: string | null;
  consultationId?: string | null;
  buyerReqId?: string | null;
  matchId?: string | null;
  dealId?: string | null;
  contractId?: string | null;
}

export function createTasksApi(request: RequestFn) {
  return {
    findAll: () =>
      request<Task[]>('/tasks'),

    findOne: (id: string) =>
      request<Task>(`/tasks/${id}`),

    create: (dto: CreateTaskDto) =>
      request<Task>('/tasks', { method: 'POST', body: dto }),

    update: (id: string, dto: UpdateTaskDto) =>
      request<Task>(`/tasks/${id}`, { method: 'PATCH', body: dto }),

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
