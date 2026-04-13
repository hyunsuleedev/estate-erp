import type { RequestFn } from '../client.js';

export interface TaskAssignee {
  id: string;
  name: string;
}

export interface TaskContact {
  id: string;
  name: string;
  phone: string | null;
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
  contact: TaskContact | null;
  contactId: string | null;
  propertyId: string | null;
  listingId: string | null;
  consultationId: string | null;
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
}

export interface UpdateTaskDto {
  title?: string;
  content?: string;
  status?: string;
  priority?: string;
  category?: string;
  dueDate?: string | null;
  assignedToId?: string | null;
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
