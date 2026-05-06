import type { Consultation } from '@estate-erp/api-client';

export type ConsultationListItem = Consultation;

export type ConsultationSignalKey = 'price' | 'schedule' | 'contract' | 'requirement' | 'general';

export interface ConsultationSignal {
  key: ConsultationSignalKey;
  label: string;
  className: string;
}

export interface ConsultationDayGroup {
  key: string;
  label: string;
  items: ConsultationListItem[];
}

export type ConsultationContextCardKey = 'contact' | 'property' | 'listing' | 'match' | 'buyerRequirement';

export interface ConsultationContextCard {
  key: ConsultationContextCardKey;
  label: string;
  title: string;
  description: string;
  to: '/contacts/$id' | '/properties/$id' | '/properties' | '/matches' | '/buyer-requirements';
  params?: { id: string };
}

export type ConsultationQuickFilter = 'all' | 'actionRequired' | 'property' | 'buyerRequirement';

export interface ConsultationFilterOption {
  id: string;
  label: string;
}

export interface ConsultationEntityFilters {
  q?: string;
  quickFilter: ConsultationQuickFilter;
  contact?: ConsultationFilterOption | null;
  site?: ConsultationFilterOption | null;
  dong?: ConsultationFilterOption | null;
  unit?: ConsultationFilterOption | null;
  type?: string | null;
}

export interface ConsultationFilterChip {
  key: string;
  label: string;
}

type ConsultationProperty = NonNullable<ConsultationListItem['property']>;
type ConsultationPropertyUnit = NonNullable<ConsultationProperty['unit']>;

const signalMeta: Record<ConsultationSignalKey, ConsultationSignal> = {
  price: {
    key: 'price',
    label: '가격·조건',
    className: 'bg-blue-50 text-blue-700',
  },
  schedule: {
    key: 'schedule',
    label: '일정·방문',
    className: 'bg-emerald-50 text-emerald-700',
  },
  contract: {
    key: 'contract',
    label: '계약·입금',
    className: 'bg-violet-50 text-violet-700',
  },
  requirement: {
    key: 'requirement',
    label: '요청·요건',
    className: 'bg-amber-50 text-amber-700',
  },
  general: {
    key: 'general',
    label: '상담 메모',
    className: 'bg-slate-100 text-slate-700',
  },
};

const signalMatchers: Array<[ConsultationSignalKey, RegExp]> = [
  ['contract', /계약|입금|잔금|중도금|가계약|서명|날인/],
  ['schedule', /일정|임장|방문|내방|예약|토요일|일요일|오전|오후|확정/],
  ['price', /가격|급매|인하|조정|수락|억|만원|조건/],
  ['requirement', /요청|필수|원함|희망|찾|추가|즉시입주|요건/],
];

export function getConsultationSignal(consultation: ConsultationListItem): ConsultationSignal {
  const content = consultation.content ?? '';
  const match = signalMatchers.find(([, matcher]) => matcher.test(content));
  return signalMeta[match?.[0] ?? 'general'];
}

export function getConsultationOutcomeLabel(consultation: ConsultationListItem) {
  const content = consultation.content ?? '';
  if (/확정|수락|입금 확인|완료|결정/.test(content)) return '확정 기록';
  if (/필요|요청|확인|문의|어떻게|여부/.test(content)) return '후속 필요';
  if (/거절|취소|보류|불가/.test(content)) return '보류';
  return '정보 기록';
}

export function getConsultationActionLabel(consultation: ConsultationListItem) {
  const signal = getConsultationSignal(consultation).key;
  const outcome = getConsultationOutcomeLabel(consultation);

  if (outcome === '후속 필요' && consultation.type === 'phone') return '후속 통화 업무 만들기';
  if (signal === 'schedule') return '캘린더 일정 확인';
  if (signal === 'price') return '매칭·거래 조건 업데이트';
  if (signal === 'contract') return '거래 단계·입금 상태 확인';
  if (signal === 'requirement') return '구매요건 업데이트';
  return '고객 타임라인 확인';
}

export function getConsultationContextLabels(consultation: ConsultationListItem) {
  const labels: string[] = [];

  const propertyTitle = formatPropertyContextTitle(consultation.property, consultation.propertyId);
  if (propertyTitle) labels.push(propertyTitle);

  if (consultation.listing) {
    const type = transactionTypeLabels[consultation.listing.transactionType] ?? consultation.listing.transactionType;
    const price = consultation.listing.price ? ` ${formatPrice(consultation.listing.price)}` : '';
    labels.push(`${type}${price}`);
  } else if (consultation.listingId) labels.push('리스팅 연결');

  if (consultation.matchId) labels.push('매칭 연결');
  if (consultation.buyerReqId) labels.push('구매요건 연결');

  return labels;
}

export function getConsultationContextCards(consultation: ConsultationListItem): ConsultationContextCard[] {
  const cards: ConsultationContextCard[] = [];

  cards.push({
    key: 'contact',
    label: '고객',
    title: consultation.contact?.name ?? '미지정 고객',
    description: consultation.contact?.phone ?? '연락처 없음',
    to: '/contacts/$id',
    params: { id: consultation.contact?.id ?? consultation.contactId },
  });

  if (consultation.propertyId) {
    cards.push({
      key: 'property',
      label: '매물',
      title: formatPropertyContextTitle(consultation.property, consultation.propertyId) ?? '매물 연결',
      description: formatPropertyContextDescription(consultation.property),
      to: '/properties/$id',
      params: { id: consultation.propertyId },
    });
  }

  if (consultation.listingId) {
    const listingTitle = consultation.listing
      ? formatListingLabel(consultation.listing.transactionType, consultation.listing.price)
      : '리스팅 연결';
    cards.push({
      key: 'listing',
      label: '리스팅',
      title: listingTitle,
      description: consultation.listing?.checkStatus
        ? `상태 ${consultation.listing.checkStatus}`
        : '거래 조건, 가격 협의, 광고 상태 문맥입니다.',
      to: consultation.propertyId ? '/properties/$id' : '/properties',
      params: consultation.propertyId ? { id: consultation.propertyId } : undefined,
    });
  }

  if (consultation.matchId) {
    cards.push({
      key: 'match',
      label: '매칭',
      title: '매칭 연결',
      description: consultation.match?.stage ? `단계 ${consultation.match.stage}` : `ID ${shortId(consultation.matchId)}`,
      to: '/matches',
    });
  }

  if (consultation.buyerReqId) {
    const transactionType = consultation.buyerRequirement?.transactionType;
    cards.push({
      key: 'buyerRequirement',
      label: '구매요건',
      title: '구매요건 연결',
      description: transactionType
        ? `${transactionTypeLabels[transactionType] ?? transactionType} · ${consultation.buyerRequirement?.status ?? '상태 미지정'}`
        : `ID ${shortId(consultation.buyerReqId)}`,
      to: '/buyer-requirements',
    });
  }

  return cards;
}

export function groupConsultationsByDay(items: ConsultationListItem[]): ConsultationDayGroup[] {
  const groups = new Map<string, ConsultationListItem[]>();

  for (const item of items) {
    const key = item.createdAt.slice(0, 10);
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, groupItems]) => ({
      key,
      label: formatFullDate(key),
      items: groupItems.slice().sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    }));
}

export function getConsultationStats(items: ConsultationListItem[]) {
  return {
    total: items.length,
    linked: items.filter((item) => getConsultationContextLabels(item).length > 0).length,
    actionCandidates: items.filter((item) => getConsultationOutcomeLabel(item) === '후속 필요').length,
  };
}

export function getConsultationPreview(content: string, maxLength = 96) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function getSelectedConsultation(items: ConsultationListItem[], selectedId: string | null) {
  if (!selectedId) return null;
  return items.find((item) => item.id === selectedId) ?? null;
}

export function buildConsultationApiParams({
  page,
  sortOrder,
  filters,
}: {
  page: number;
  sortOrder: 'asc' | 'desc';
  filters: ConsultationEntityFilters;
}) {
  const params: Record<string, string | number> = {
    page,
    limit: 20,
    sortOrder,
  };

  const q = filters.q?.trim();
  if (q) params.q = q;

  if (filters.quickFilter === 'actionRequired') params.outcome = 'actionRequired';
  if (filters.quickFilter === 'property') params.context = 'property';
  if (filters.quickFilter === 'buyerRequirement') params.context = 'buyerRequirement';

  if (filters.contact?.id) params.contactId = filters.contact.id;
  if (filters.site?.id) params.siteId = filters.site.id;
  if (filters.dong?.id) params.dongId = filters.dong.id;
  if (filters.unit?.id) params.unitId = filters.unit.id;
  if (filters.type) params.type = filters.type;

  return params;
}

export function getConsultationFilterChips(filters: ConsultationEntityFilters): ConsultationFilterChip[] {
  const chips: ConsultationFilterChip[] = [];
  const q = filters.q?.trim();

  if (q) chips.push({ key: 'q', label: `검색 ${q}` });
  if (filters.quickFilter === 'actionRequired') chips.push({ key: 'quickFilter', label: '후속 필요' });
  if (filters.quickFilter === 'property') chips.push({ key: 'quickFilter', label: '매물 연결' });
  if (filters.quickFilter === 'buyerRequirement') chips.push({ key: 'quickFilter', label: '구매요건' });
  if (filters.contact) chips.push({ key: 'contact', label: `고객 ${filters.contact.label}` });

  const propertyLabel = [filters.site?.label, filters.dong?.label, filters.unit?.label].filter(Boolean).join(' ');
  if (propertyLabel) chips.push({ key: 'property', label: `매물 ${propertyLabel}` });

  if (filters.type) chips.push({ key: 'type', label: `상담유형 ${typeLabel(filters.type)}` });

  return chips;
}

const transactionTypeLabels: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

function typeLabel(type: string) {
  return consultationTypeLabels[type] ?? type;
}

function formatListingLabel(transactionType: string, price: number | null): string {
  const type = transactionTypeLabels[transactionType] ?? transactionType;
  return price ? `${type} ${formatPrice(price)}` : type;
}

function formatPropertyContextTitle(
  property: ConsultationListItem['property'] | null | undefined,
  propertyId: string | null | undefined,
) {
  const siteName = property?.site?.name?.trim();
  const unitLabel = formatPropertyUnitLabel(property?.unit);

  if (siteName && unitLabel) return `${siteName} ${unitLabel}`;
  if (siteName) return siteName;
  if (unitLabel) return unitLabel;
  if (propertyId) return '매물 연결';
  return null;
}

function formatPropertyContextDescription(property: ConsultationListItem['property'] | null | undefined) {
  const memo = property?.memo?.trim();
  if (memo) return memo;

  const details = [
    property?.unit?.floor != null ? `${property.unit.floor}층` : null,
    property?.unit?.lineNo != null ? `${property.unit.lineNo}라인` : null,
  ].filter((detail): detail is string => Boolean(detail));

  return details.length > 0
    ? details.join(' · ')
    : '매물 상세에서 소유주·임차인·상담 이력을 확인합니다.';
}

function formatPropertyUnitLabel(unit: ConsultationPropertyUnit | null | undefined) {
  if (!unit) return null;

  const dongName = unit.dong?.name?.trim();
  const shouldShowDong = dongName && dongName !== '-' && !unit.dong?.isPlaceholder;
  const dongLabel = shouldShowDong ? withSuffix(dongName, '동') : null;

  const unitName = unit.name?.trim();
  const unitLabel = unitName && unitName !== '-' ? withSuffix(unitName, '호') : null;

  return [dongLabel, unitLabel].filter(Boolean).join(' ') || null;
}

function withSuffix(value: string, suffix: string) {
  return value.endsWith(suffix) ? value : `${value}${suffix}`;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}

function formatPrice(priceInManwon: number): string {
  if (priceInManwon >= 10000) {
    const eok = Math.floor(priceInManwon / 10000);
    const man = priceInManwon % 10000;
    if (man === 0) return `${eok}억`;
    return `${eok}억 ${man.toLocaleString()}만`;
  }
  return `${priceInManwon.toLocaleString()}만`;
}
