import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';

export type ActivityLogAction = 'create' | 'update' | 'delete';

export interface ActivityLogChange {
  before: unknown;
  after: unknown;
}

export interface ActivityLog {
  id: string;
  officeId: string;
  userId: string | null;
  /** "user" | "mcp:claude" | "system:rule_engine" 등 */
  actor: string;
  /** "web" | "mcp" | "system" */
  source: string;
  action: ActivityLogAction;
  entityType: string;
  entityId: string;
  changes: Record<string, ActivityLogChange> | null;
  reason: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

export interface ActivityLogsFilter {
  entityType?: string;
  entityId?: string;
  userId?: string;
  page?: number;
  /** 기본 50, 최대 100 */
  limit?: number;
}

export function createActivityLogsApi(request: RequestFn) {
  return {
    list: (filter: ActivityLogsFilter = {}) =>
      request<PaginatedResponse<ActivityLog>>('/activity-logs', {
        params: filter as Record<string, string | number | boolean | undefined>,
      }),
  };
}
