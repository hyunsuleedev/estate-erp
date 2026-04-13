import type { RequestFn } from '../client.js';

export type PhotoCategory =
  | 'exterior'
  | 'living'
  | 'kitchen'
  | 'bathroom'
  | 'bedroom'
  | 'balcony'
  | 'entrance'
  | 'parking'
  | 'view'
  | 'floorplan'
  | 'other';

export interface PropertyPhoto {
  id: string;
  officeId: string;
  propertyId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string;
  category: PhotoCategory;
  sortOrder: number;
  memo: string | null;
  createdAt: string;
  property?: {
    id: string;
    site: { name: string };
    unit?: {
      name: string;
      dong?: { name: string };
      siteUnitType?: { name: string } | null;
    } | null;
  };
}

export function createPropertyPhotosApi(request: RequestFn) {
  return {
    listByProperty: (propertyId: string) =>
      request<PropertyPhoto[]>('/property-photos', {
        params: { propertyId },
      }),

    search: (filters?: {
      siteId?: string;
      siteName?: string;
      siteUnitTypeName?: string;
    }) =>
      request<PropertyPhoto[]>('/property-photos', {
        params: (filters ?? {}) as Record<string, string | undefined>,
      }),

    create: (data: {
      propertyId: string;
      fileUrl: string;
      fileName: string;
      fileSize?: number;
      mimeType?: string;
      category?: string;
      memo?: string;
    }) =>
      request<PropertyPhoto>('/property-photos', {
        method: 'POST',
        body: data,
      }),

    update: (
      id: string,
      data: { category?: string; sortOrder?: number; memo?: string },
    ) =>
      request<PropertyPhoto>(`/property-photos/${id}`, {
        method: 'PATCH',
        body: data,
      }),

    reorder: (propertyId: string, photoIds: string[]) =>
      request<{ success: boolean }>('/property-photos/reorder', {
        method: 'POST',
        body: { propertyId, photoIds },
      }),

    remove: (id: string) =>
      request<void>(`/property-photos/${id}`, { method: 'DELETE' }),
  };
}
