import type { RequestFn } from '../client.js';
import type {
  PartnerBroker,
  CreatePartnerBrokerDto,
  UpdatePartnerBrokerDto,
} from './finance.js';

export function createPartnerBrokersApi(request: RequestFn) {
  return {
    list: (includeInactive = false) =>
      request<PartnerBroker[]>('/partner-brokers', {
        params: includeInactive ? { includeInactive: 'true' } : undefined,
      }),
    findOne: (id: string) => request<PartnerBroker>(`/partner-brokers/${id}`),
    create: (dto: CreatePartnerBrokerDto) =>
      request<PartnerBroker>('/partner-brokers', {
        method: 'POST',
        body: dto,
      }),
    update: (id: string, dto: UpdatePartnerBrokerDto) =>
      request<PartnerBroker>(`/partner-brokers/${id}`, {
        method: 'PATCH',
        body: dto,
      }),
    remove: (id: string) =>
      request<PartnerBroker>(`/partner-brokers/${id}`, { method: 'DELETE' }),
  };
}
