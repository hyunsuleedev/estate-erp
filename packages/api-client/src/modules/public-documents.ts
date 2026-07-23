import type { RequestFn } from '../client.js';

export type PublicDocumentType =
  | 'registry'
  | 'building_ledger'
  | 'land_ledger'
  | 'cadastral_map'
  | 'land_use_plan'
  | 'land_register';

export type PublicDocumentStatus = 'pending' | 'completed' | 'failed';
export type PublicDocumentRequestMode =
  | 'data'
  | 'view'
  | 'certificate'
  | 'upload';

export interface PublicDocument {
  id: string;
  officeId: string;
  propertyId: string | null;
  siteId: string;
  type: PublicDocumentType;
  title: string;
  subtitle: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  issuedAt: string;
  expiresAt: string | null;
  cost: number;
  provider: string;
  requestMode: PublicDocumentRequestMode;
  batchId: string | null;
  requestedAt: string;
  completedAt: string | null;
  metadata: Record<string, unknown> | null;
  status: PublicDocumentStatus;
  errorMessage: string | null;
  requestedById: string;
  externalRefId: string | null;
  createdAt: string;
  requestedBy?: { id: string; name: string };
  property?: {
    id: string;
    site: { name: string };
    unit?: { name: string; dong?: { name: string } } | null;
  } | null;
  site?: { id: string; name: string };
}

export interface CreatePublicDocumentDto {
  propertyId?: string;
  siteId: string;
  type: string;
  title?: string;
  subtitle?: string;
  requestMode?: PublicDocumentRequestMode;
  /** @deprecated 비용은 서버 견적에서 계산합니다. */
  cost?: number;
}

export interface PublicDocumentProvider {
  id: string;
  label: string;
  kind: 'public_api' | 'registry_vendor' | 'manual';
  configured: boolean;
  supportedTypes: PublicDocumentType[];
  description: string;
  homepage?: string;
}

export interface PublicDocumentQuoteItem {
  type: PublicDocumentType;
  title: string;
  requestMode: PublicDocumentRequestMode;
  provider: string;
  providerLabel: string;
  cost: number;
  available: boolean;
  reason?: string;
  output: 'structured_data' | 'pdf' | 'manual_upload';
}

export interface PublicDocumentQuote {
  address: {
    siteName: string;
    roadAddress: string | null;
    jibunAddress: string | null;
    dongName: string | null;
    unitName: string | null;
  };
  items: PublicDocumentQuoteItem[];
}

export interface BatchPublicDocumentDto {
  propertyId?: string;
  siteId: string;
  types: PublicDocumentType[];
  registryMode?: 'view' | 'certificate';
}

export function createPublicDocumentsApi(request: RequestFn) {
  return {
    providers: () =>
      request<PublicDocumentProvider[]>('/public-documents/providers'),

    quote: (data: BatchPublicDocumentDto) =>
      request<PublicDocumentQuote>('/public-documents/quote', {
        method: 'POST',
        body: data,
      }),

    createBatch: (data: BatchPublicDocumentDto) =>
      request<{
        batchId: string;
        documents: PublicDocument[];
        skipped: PublicDocumentQuoteItem[];
      }>('/public-documents/batch', {
        method: 'POST',
        body: data,
      }),

    list: (filter?: { propertyId?: string; siteId?: string; type?: string }) =>
      request<PublicDocument[]>('/public-documents', {
        params: (filter ?? {}) as Record<string, string | undefined>,
      }),

    create: (data: CreatePublicDocumentDto) =>
      request<PublicDocument>('/public-documents', {
        method: 'POST',
        body: data,
      }),

    updateStatus: (
      id: string,
      data: {
        status: string;
        fileUrl?: string;
        fileSize?: number;
        mimeType?: string;
        externalRefId?: string;
        errorMessage?: string;
      },
    ) =>
      request<PublicDocument>(`/public-documents/${id}/status`, {
        method: 'PATCH',
        body: data,
      }),

    retry: (id: string) =>
      request<PublicDocument>(`/public-documents/${id}/retry`, {
        method: 'POST',
      }),

    attachFile: (
      id: string,
      data: {
        fileUrl: string;
        fileSize?: number;
        mimeType?: string;
        externalRefId?: string;
      },
    ) =>
      request<PublicDocument>(`/public-documents/${id}/file`, {
        method: 'PATCH',
        body: data,
      }),

    remove: (id: string) =>
      request<void>(`/public-documents/${id}`, { method: 'DELETE' }),
  };
}
