import type { RequestFn } from '../client.js';
import type { Contact } from './contacts.js';
import type { Deal } from './deals.js';

export interface Contract {
  id: string;
  officeId: string;
  dealId: string;
  transactionType: string;
  buyerContactId: string;
  sellerContactId: string;
  totalPrice: number;
  monthlyRent: number | null;
  status: string;
  contractDate: string | null;
  /// 계약서 상 계약금 (만원). 실제 입금은 DealPayment(kind='contract') 참조.
  statedDeposit: number | null;
  /// 계약서 상 중도금 (만원).
  statedInterimPayment: number | null;
  statedInterimDate: string | null;
  /// 계약서 상 잔금 (만원).
  statedBalance: number | null;
  statedBalanceDate: string | null;
  moveInDate: string | null;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  specialTerms: string | null;
  attachments: string[];
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount?: number;
  missingDocumentCount?: number;
  requiredDocuments?: string[];
  deal?: Deal | null;
  buyerContact?: Contact | null;
  sellerContact?: Contact | null;
}

export interface CreateContractDto {
  dealId: string;
  transactionType?: string;
  buyerContactId?: string;
  sellerContactId?: string;
  totalPrice?: number;
  monthlyRent?: number;
  status?: string;
  contractDate?: string;
  statedDeposit?: number;
  statedInterimPayment?: number;
  statedInterimDate?: string;
  statedBalance?: number;
  statedBalanceDate?: string;
  moveInDate?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  specialTerms?: string;
  attachments?: string[];
  memo?: string;
}

export interface UpdateContractDto {
  transactionType?: string;
  buyerContactId?: string;
  sellerContactId?: string;
  totalPrice?: number;
  monthlyRent?: number | null;
  status?: string;
  contractDate?: string | null;
  statedDeposit?: number | null;
  statedInterimPayment?: number | null;
  statedInterimDate?: string | null;
  statedBalance?: number | null;
  statedBalanceDate?: string | null;
  moveInDate?: string | null;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
  specialTerms?: string | null;
  attachments?: string[];
  memo?: string | null;
}

export function createContractsApi(request: RequestFn) {
  return {
    findAll: () => request<Contract[]>('/contracts'),
    findOne: (id: string) => request<Contract>(`/contracts/${id}`),
    create: (dto: CreateContractDto) =>
      request<Contract>('/contracts', { method: 'POST', body: dto }),
    update: (id: string, dto: UpdateContractDto) =>
      request<Contract>(`/contracts/${id}`, { method: 'PATCH', body: dto }),
  };
}
