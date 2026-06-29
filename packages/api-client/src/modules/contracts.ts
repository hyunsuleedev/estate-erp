import type { RequestFn } from '../client.js';
import type { Contact } from './contacts.js';
import type { Deal } from './deals.js';

export type ContractDocumentType = 'generated' | 'uploaded' | 'external';

export type ContractDocumentStatus =
  | 'draft'
  | 'generated'
  | 'signed'
  | 'submitted'
  | 'archived'
  | 'cancelled';

export interface ContractDocumentTemplate {
  id: string;
  officeId: string | null;
  code: string;
  title: string;
  category: string;
  transactionTypes: string[];
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContractDocument {
  id: string;
  officeId: string;
  contractId: string;
  templateId: string | null;
  type: ContractDocumentType | string;
  category: string;
  title: string;
  status: ContractDocumentStatus | string;
  fileUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  generatedAt: string | null;
  signedAt: string | null;
  submittedAt: string | null;
  generatedById: string | null;
  externalRefId: string | null;
  metadata: Record<string, unknown>;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  template?: ContractDocumentTemplate | null;
  generatedBy?: { id: string; name: string } | null;
}

export interface OfficePrintTemplate {
  id: string;
  officeId: string;
  type: string;
  title: string;
  transactionTypes: string[];
  isDefault: boolean;
  isActive: boolean;
  data: Record<string, unknown>;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractClauseTemplate {
  id: string;
  officeId: string;
  type: string;
  contractKind: string | null;
  transactionTypes: string[];
  title: string;
  content: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  missingDocuments?: string[];
  requiredDocumentTemplates?: ContractDocumentTemplate[];
  documents?: ContractDocument[];
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

export interface CreateContractDocumentDto {
  templateId?: string;
  type?: ContractDocumentType | string;
  category?: string;
  title?: string;
  status?: ContractDocumentStatus | string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  generatedAt?: string;
  signedAt?: string;
  submittedAt?: string;
  externalRefId?: string;
  metadata?: Record<string, unknown>;
  memo?: string;
}

export interface UpdateContractDocumentDto {
  templateId?: string | null;
  type?: ContractDocumentType | string;
  category?: string;
  title?: string;
  status?: ContractDocumentStatus | string;
  fileUrl?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  generatedAt?: string | null;
  signedAt?: string | null;
  submittedAt?: string | null;
  externalRefId?: string | null;
  metadata?: Record<string, unknown>;
  memo?: string | null;
}

export interface ContractDocumentTemplateFilter {
  transactionType?: string;
  category?: string;
  requiredOnly?: boolean;
}

export interface OfficePrintTemplateFilter {
  type?: string;
  transactionType?: string;
  activeOnly?: boolean;
}

export interface CreateOfficePrintTemplateDto {
  type: string;
  title: string;
  transactionTypes?: string[];
  isDefault?: boolean;
  isActive?: boolean;
  data?: Record<string, unknown>;
}

export interface UpdateOfficePrintTemplateDto {
  type?: string;
  title?: string;
  transactionTypes?: string[];
  isDefault?: boolean;
  isActive?: boolean;
  data?: Record<string, unknown>;
}

export interface ContractClauseTemplateFilter {
  type?: string;
  contractKind?: string;
  transactionType?: string;
  activeOnly?: boolean;
}

export interface CreateContractClauseTemplateDto {
  type: string;
  contractKind?: string | null;
  transactionTypes?: string[];
  title: string;
  content: string;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateContractClauseTemplateDto {
  type?: string;
  contractKind?: string | null;
  transactionTypes?: string[];
  title?: string;
  content?: string;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export function createContractsApi(request: RequestFn) {
  return {
    findAll: () => request<Contract[]>('/contracts'),
    findOne: (id: string) => request<Contract>(`/contracts/${id}`),
    create: (dto: CreateContractDto) =>
      request<Contract>('/contracts', { method: 'POST', body: dto }),
    update: (id: string, dto: UpdateContractDto) =>
      request<Contract>(`/contracts/${id}`, { method: 'PATCH', body: dto }),
    documentTemplates: (filter?: ContractDocumentTemplateFilter) =>
      request<ContractDocumentTemplate[]>('/contracts/document-templates', {
        params: (filter ?? {}) as Record<string, string | number | boolean | undefined>,
      }),
    printTemplates: (filter?: OfficePrintTemplateFilter) =>
      request<OfficePrintTemplate[]>('/contracts/print-templates', {
        params: (filter ?? {}) as Record<string, string | number | boolean | undefined>,
      }),
    createPrintTemplate: (dto: CreateOfficePrintTemplateDto) =>
      request<OfficePrintTemplate>('/contracts/print-templates', {
        method: 'POST',
        body: dto,
      }),
    updatePrintTemplate: (
      templateId: string,
      dto: UpdateOfficePrintTemplateDto,
    ) =>
      request<OfficePrintTemplate>(`/contracts/print-templates/${templateId}`, {
        method: 'PATCH',
        body: dto,
      }),
    deletePrintTemplate: (templateId: string) =>
      request<void>(`/contracts/print-templates/${templateId}`, {
        method: 'DELETE',
      }),
    clauseTemplates: (filter?: ContractClauseTemplateFilter) =>
      request<ContractClauseTemplate[]>('/contracts/clause-templates', {
        params: (filter ?? {}) as Record<string, string | number | boolean | undefined>,
      }),
    createClauseTemplate: (dto: CreateContractClauseTemplateDto) =>
      request<ContractClauseTemplate>('/contracts/clause-templates', {
        method: 'POST',
        body: dto,
      }),
    updateClauseTemplate: (
      templateId: string,
      dto: UpdateContractClauseTemplateDto,
    ) =>
      request<ContractClauseTemplate>(`/contracts/clause-templates/${templateId}`, {
        method: 'PATCH',
        body: dto,
      }),
    deleteClauseTemplate: (templateId: string) =>
      request<void>(`/contracts/clause-templates/${templateId}`, {
        method: 'DELETE',
      }),
    documents: (contractId: string) =>
      request<ContractDocument[]>(`/contracts/${contractId}/documents`),
    createDocument: (contractId: string, dto: CreateContractDocumentDto) =>
      request<ContractDocument>(`/contracts/${contractId}/documents`, {
        method: 'POST',
        body: dto,
      }),
    updateDocument: (
      contractId: string,
      documentId: string,
      dto: UpdateContractDocumentDto,
    ) =>
      request<ContractDocument>(
        `/contracts/${contractId}/documents/${documentId}`,
        { method: 'PATCH', body: dto },
      ),
  };
}
