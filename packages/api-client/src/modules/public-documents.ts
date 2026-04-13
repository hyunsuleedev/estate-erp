import type { RequestFn } from '../client.js';

export type PublicDocumentType =
  | 'registry'
  | 'building_ledger'
  | 'land_ledger'
  | 'cadastral_map'
  | 'land_use_plan'
  | 'land_register';

export type PublicDocumentStatus = 'pending' | 'completed' | 'failed';

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
  title: string;
  subtitle?: string;
  cost?: number;
}

export function createPublicDocumentsApi(request: RequestFn) {
  return {
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

    remove: (id: string) =>
      request<void>(`/public-documents/${id}`, { method: 'DELETE' }),
  };
}
