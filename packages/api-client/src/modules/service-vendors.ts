import type { RequestFn } from '../client.js';

export type VendorAdTier = 'none' | 'basic' | 'premium';
export type VendorBusinessType =
  | 'individual'
  | 'sole_proprietor'
  | 'corporate';

export interface VendorContact {
  id: string;
  vendorId: string;
  name: string;
  phone: string;
  role: string | null;
  memo: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceVendor {
  id: string;
  /** null = 공용 풀, UUID = 사무소 개인 업체 */
  officeId: string | null;
  name: string;
  businessType: VendorBusinessType | null;
  serviceCategories: string[];
  coverageDistricts: string[];
  priceNote: string | null;
  description: string | null;
  memo: string | null;
  tags: string[];

  adTier: VendorAdTier;
  adStartDate: string | null;
  adEndDate: string | null;
  adPriority: number;

  isActive: boolean;
  isVerified: boolean;
  verifiedAt: string | null;

  createdAt: string;
  updatedAt: string;

  vendorContacts: VendorContact[];
  isFavorite: boolean;
  favoriteMemo: string | null;
}

export interface ServiceVendorFilter {
  category?: string;
  district?: string;
  search?: string;
  favoritesOnly?: boolean;
  scope?: 'all' | 'public' | 'private';
}

export interface CreateServiceVendorDto {
  name: string;
  businessType?: VendorBusinessType;
  serviceCategories: string[];
  coverageDistricts: string[];
  priceNote?: string;
  description?: string;
  memo?: string;
  tags?: string[];
  /** true면 공용 풀 업체로 생성 (platform admin만 가능). 생략 시 사무소 개인 업체. */
  isPublic?: boolean;
  adTier?: VendorAdTier;
  adStartDate?: string;
  adEndDate?: string;
  adPriority?: number;
  isVerified?: boolean;
}

export interface UpdateServiceVendorDto {
  name?: string;
  businessType?: VendorBusinessType | null;
  serviceCategories?: string[];
  coverageDistricts?: string[];
  priceNote?: string | null;
  description?: string | null;
  memo?: string | null;
  tags?: string[];
  adTier?: VendorAdTier;
  adStartDate?: string | null;
  adEndDate?: string | null;
  adPriority?: number;
  isActive?: boolean;
  isVerified?: boolean;
}

export interface CreateVendorContactDto {
  name: string;
  phone: string;
  role?: string;
  memo?: string;
  sortOrder?: number;
}

export interface UpdateVendorContactDto {
  name?: string;
  phone?: string;
  role?: string | null;
  memo?: string | null;
  sortOrder?: number;
}

export function createServiceVendorsApi(request: RequestFn) {
  return {
    findAll: (filter: ServiceVendorFilter = {}) => {
      const params: Record<string, string | boolean | undefined> = {};
      if (filter.category) params.category = filter.category;
      if (filter.district) params.district = filter.district;
      if (filter.search) params.search = filter.search;
      if (filter.favoritesOnly) params.favoritesOnly = 'true';
      if (filter.scope) params.scope = filter.scope;
      return request<ServiceVendor[]>('/service-vendors', { params });
    },

    findOne: (id: string) =>
      request<ServiceVendor>(`/service-vendors/${id}`),

    create: (dto: CreateServiceVendorDto) =>
      request<ServiceVendor>('/service-vendors', {
        method: 'POST',
        body: dto,
      }),

    update: (id: string, dto: UpdateServiceVendorDto) =>
      request<ServiceVendor>(`/service-vendors/${id}`, {
        method: 'PATCH',
        body: dto,
      }),

    remove: (id: string) =>
      request<{ success: true }>(`/service-vendors/${id}`, {
        method: 'DELETE',
      }),

    // ─── VendorContact ──────────────────────────────
    addContact: (vendorId: string, dto: CreateVendorContactDto) =>
      request<VendorContact>(`/service-vendors/${vendorId}/contacts`, {
        method: 'POST',
        body: dto,
      }),

    updateContact: (contactId: string, dto: UpdateVendorContactDto) =>
      request<VendorContact>(`/service-vendors/contacts/${contactId}`, {
        method: 'PATCH',
        body: dto,
      }),

    removeContact: (contactId: string) =>
      request<{ success: true }>(
        `/service-vendors/contacts/${contactId}`,
        { method: 'DELETE' },
      ),

    // ─── 즐겨찾기 ──────────────────────────────────
    toggleFavorite: (vendorId: string, memo?: string | null) =>
      request<{ isFavorite: boolean }>(
        `/service-vendors/${vendorId}/favorite`,
        { method: 'POST', body: { memo: memo ?? null } },
      ),

    updateFavoriteMemo: (vendorId: string, memo: string | null) =>
      request<{ memo: string | null }>(
        `/service-vendors/${vendorId}/favorite`,
        { method: 'PATCH', body: { memo } },
      ),
  };
}
