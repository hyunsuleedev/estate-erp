import type { RequestFn } from '../client.js';
import type {
  PartnerBroker,
  PartnerBrokerContact,
  CreatePartnerBrokerDto,
  UpdatePartnerBrokerDto,
  CreatePartnerBrokerContactDto,
  UpdatePartnerBrokerContactDto,
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
    addContact: (partnerBrokerId: string, dto: CreatePartnerBrokerContactDto) =>
      request<PartnerBrokerContact>(`/partner-brokers/${partnerBrokerId}/contacts`, {
        method: 'POST',
        body: dto,
      }),
    updateContact: (
      partnerBrokerId: string,
      contactId: string,
      dto: UpdatePartnerBrokerContactDto,
    ) =>
      request<PartnerBrokerContact>(
        `/partner-brokers/${partnerBrokerId}/contacts/${contactId}`,
        { method: 'PATCH', body: dto },
      ),
    removeContact: (partnerBrokerId: string, contactId: string) =>
      request<void>(`/partner-brokers/${partnerBrokerId}/contacts/${contactId}`, {
        method: 'DELETE',
      }),
  };
}
