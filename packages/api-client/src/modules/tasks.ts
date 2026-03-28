import type { RequestFn } from '../client.js';

export interface Task {
  id: string;
  officeId: string;
  title: string;
  content: string | null;
  source: string;
  isDone: boolean;
  dueDate: string | null;
  contactId: string | null;
  propertyId: string | null;
  consultationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskDto {
  title: string;
  content?: string;
  source?: string;
  dueDate?: string;
}

export interface UpdateTaskDto {
  title?: string;
  content?: string;
  isDone?: boolean;
  dueDate?: string;
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

    remove: (id: string) =>
      request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  };
}
