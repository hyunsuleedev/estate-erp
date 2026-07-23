export const PUBLIC_DOCUMENT_TYPES = [
  'registry',
  'building_ledger',
  'land_ledger',
  'cadastral_map',
  'land_use_plan',
  'land_register',
] as const;

export type PublicDocumentType = (typeof PUBLIC_DOCUMENT_TYPES)[number];
export type PublicDocumentRequestMode =
  | 'data'
  | 'view'
  | 'certificate'
  | 'upload';

export interface DocumentAddress {
  siteId: string;
  siteName: string;
  wardCode: string;
  roadAddress: string | null;
  jibunAddress: string | null;
  jibunMain: string | null;
  jibunSub: string | null;
  lat: string | null;
  lng: string | null;
  dongName: string | null;
  unitName: string | null;
}

export interface ProviderExecutionResult {
  status: 'completed' | 'awaiting_upload';
  provider: string;
  externalRefId?: string;
  mimeType?: string;
  metadata: Record<string, unknown>;
}

export interface ProviderOption {
  id: string;
  label: string;
  kind: 'public_api' | 'registry_vendor' | 'manual';
  configured: boolean;
  supportedTypes: PublicDocumentType[];
  description: string;
  homepage?: string;
}

export interface DocumentQuoteItem {
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

export const DOCUMENT_TITLES: Record<PublicDocumentType, string> = {
  registry: '등기사항증명서',
  building_ledger: '건축물대장',
  land_ledger: '토지·임야대장',
  cadastral_map: '지적도·임야도',
  land_use_plan: '토지이용계획',
  land_register: '대지권등록부',
};

export function isPublicDocumentType(
  value: string,
): value is PublicDocumentType {
  return PUBLIC_DOCUMENT_TYPES.includes(value as PublicDocumentType);
}
