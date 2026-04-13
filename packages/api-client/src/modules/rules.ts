import type { RequestFn } from '../client.js';

export type RuleTriggerType = 'schedule' | 'event';

export interface AgentRule {
  name: string;
  version: string;
  displayName: string;
  description: string | null;
  triggerType: RuleTriggerType;
  schedule: string | null;
  eventName: string | null;
  isSystem: boolean;
  isActive: boolean;
  config: Record<string, unknown>;
  seeded: boolean;
}

export interface UpdateAgentRuleDto {
  isActive?: boolean;
}

export function createRulesApi(request: RequestFn) {
  return {
    list: () => request<AgentRule[]>('/agent/rules'),

    update: (name: string, dto: UpdateAgentRuleDto) =>
      request<AgentRule>(`/agent/rules/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        body: dto,
      }),
  };
}
