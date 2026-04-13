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
  contractDeposit: number | null;
  contractDepositDate: string | null;
  contractDepositPaid: boolean;
  middlePayment: number | null;
  middlePaymentDate: string | null;
  middlePaymentPaid: boolean;
  finalPayment: number | null;
  finalPaymentDate: string | null;
  finalPaymentPaid: boolean;
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
  contractDeposit?: number;
  contractDepositDate?: string;
  contractDepositPaid?: boolean;
  middlePayment?: number;
  middlePaymentDate?: string;
  middlePaymentPaid?: boolean;
  finalPayment?: number;
  finalPaymentDate?: string;
  finalPaymentPaid?: boolean;
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
  contractDeposit?: number | null;
  contractDepositDate?: string | null;
  contractDepositPaid?: boolean;
  middlePayment?: number | null;
  middlePaymentDate?: string | null;
  middlePaymentPaid?: boolean;
  finalPayment?: number | null;
  finalPaymentDate?: string | null;
  finalPaymentPaid?: boolean;
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
