import { formatPlaceLabel } from '@estate-erp/shared';
import type { Consultation, ListingIntakeState } from '@estate-erp/api-client';
import { formatDate } from '@/lib/format';
import { getIntakeConfirmationState } from '@/lib/listing-status';
import { getStatusMeta } from '@/lib/status-config';
import { consultationViewParams, type ConsultationView } from './-consultation-list-model';

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

export type ConsultationContextCardKey =
  | 'contact'
  | 'property'
  | 'listingIntake'
  | 'buyerIntake'
  | 'deal'
  | 'project';

export interface ConsultationContextCard {
  key: ConsultationContextCardKey;
  label: string;
  title: string;
  description: string;
  to:
    | '/contacts/$id'
    | '/properties/$id'
    | '/properties'
    | '/wanted-properties'
    | '/deals'
    | '/projects/$id';
  params?: { id: string };
  search?: { dealId?: string };
}

export type ConsultationQuickFilter =
  | 'all'
  | 'actionRequired'
  | 'property'
  | 'listingIntake'
  | 'buyerIntake'
  | 'deal'
  | 'project'
  | 'unlinked';

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
  createdBy?: ConsultationFilterOption | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface ConsultationFilterChip {
  key: string;
  label: string;
}

type ConsultationProperty = NonNullable<ConsultationListItem['property']>;

// ----------------------------------------------------------------
// purpose (상담 목적)
// ----------------------------------------------------------------

export interface ConsultationPurposeMeta {
  label: string;
  className: string;
}

export const consultationPurposeMeta: Record<string, ConsultationPurposeMeta> = {
  general: { label: '일반 상담', className: 'bg-slate-100 text-slate-700' },
  listing_confirm: { label: '매물 확인', className: 'bg-sky-50 text-sky-700' },
  buyer_consult: { label: '매수 상담', className: 'bg-amber-50 text-amber-700' },
  deal_followup: { label: '거래 후속', className: 'bg-violet-50 text-violet-700' },
};

export const consultationPurposeOptions: Array<{ value: string; label: string }> = [
  { value: 'general', label: '일반 상담' },
  { value: 'listing_confirm', label: '매물 확인' },
  { value: 'buyer_consult', label: '매수 상담' },
  { value: 'deal_followup', label: '거래 후속' },
];

export function getConsultationPurposeMeta(purpose: string | null | undefined): ConsultationPurposeMeta {
  if (!purpose) return consultationPurposeMeta.general;
  return consultationPurposeMeta[purpose] ?? { label: purpose, className: 'bg-slate-100 text-slate-700' };
}

// ----------------------------------------------------------------
// 업무 신호 (purpose 우선, content 휴리스틱 fallback)
// ----------------------------------------------------------------

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

const purposeSignalMap: Record<string, ConsultationSignal> = {
  listing_confirm: { key: 'price', label: '매물 확인', className: 'bg-sky-50 text-sky-700' },
  buyer_consult: { key: 'requirement', label: '매수 상담', className: 'bg-amber-50 text-amber-700' },
  deal_followup: { key: 'contract', label: '거래 후속', className: 'bg-violet-50 text-violet-700' },
};

const signalMatchers: Array<[ConsultationSignalKey, RegExp]> = [
  ['contract', /계약|입금|잔금|중도금|가계약|서명|날인/],
  ['schedule', /일정|임장|방문|내방|예약|토요일|일요일|오전|오후|확정/],
  ['price', /가격|급매|인하|조정|수락|억|만원|조건/],
  ['requirement', /요청|필수|원함|희망|찾|추가|즉시입주|요건/],
];

export function getConsultationSignal(consultation: ConsultationListItem): ConsultationSignal {
  // purpose가 분류돼 있으면 정규식 휴리스틱보다 우선한다.
  const byPurpose = consultation.purpose ? purposeSignalMap[consultation.purpose] : undefined;
  if (byPurpose) return byPurpose;

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
  if (consultation.purpose === 'listing_confirm') return '매물 확인 상태 업데이트';
  if (consultation.purpose === 'buyer_consult') return '희망 조건 업데이트';
  if (consultation.purpose === 'deal_followup') return '거래 단계·입금 상태 확인';

  const signal = getConsultationSignal(consultation).key;
  const outcome = getConsultationOutcomeLabel(consultation);

  if (outcome === '후속 필요' && consultation.type === 'phone') return '후속 통화 업무 만들기';
  if (signal === 'schedule') return '캘린더 일정 확인';
  if (signal === 'price') return '매칭·거래 조건 업데이트';
  if (signal === 'contract') return '거래 단계·입금 상태 확인';
  if (signal === 'requirement') return '희망 조건 업데이트';
  return '고객 타임라인 확인';
}

export function getConsultationContextLabels(consultation: ConsultationListItem) {
  const labels: string[] = [];

  const propertyTitle = formatPropertyContextTitle(consultation.property, consultation.propertyId);
  if (propertyTitle) labels.push(propertyTitle);

  if (consultation.listingIntakeId) labels.push('의뢰 연결');
  if (consultation.buyerIntakeId) labels.push('구매 의뢰 연결');
  if (consultation.dealId) labels.push('거래 연결');
  if (consultation.projectId) labels.push('프로젝트 연결');

  return labels;
}

export function formatIntakeState(intake: ListingIntakeState) {
  const lifecycle = getStatusMeta(
    'intakeLifecycle',
    intake.lifecycleStatus,
  ).label;
  const confirmation = getStatusMeta(
    'confirmationState',
    getIntakeConfirmationState(intake),
  ).label;
  return `${lifecycle} · ${confirmation}`;
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

  if (consultation.listingIntakeId) {
    const intake = consultation.listingIntake;
    const statusLabel = intake ? formatIntakeState(intake) : null;
    const targetPropertyId = intake?.propertyId ?? consultation.propertyId;
    cards.push({
      key: 'listingIntake',
      label: '의뢰',
      title: statusLabel ? `의뢰 (${statusLabel})` : '의뢰 연결',
      description: intake?.receivedAt
        ? `접수일 ${formatDate(intake.receivedAt)}`
        : '매물 확인·권리·현장 메모 맥락입니다.',
      to: targetPropertyId ? '/properties/$id' : '/properties',
      params: targetPropertyId ? { id: targetPropertyId } : undefined,
    });
  }

  if (consultation.buyerIntakeId) {
    const buyerIntake = consultation.buyerIntake;
    const lifecycle = buyerIntake
      ? getStatusMeta('intakeLifecycle', buyerIntake.lifecycleStatus).label
      : null;
    cards.push({
      key: 'buyerIntake',
      label: '구매 의뢰',
      title: lifecycle ? `구매 의뢰 (${lifecycle})` : '구매 의뢰 연결',
      description: buyerIntake?.receivedAt
        ? `접수일 ${formatDate(buyerIntake.receivedAt)}`
        : '희망매물에서 구매 조건과 매칭을 확인합니다.',
      to: '/wanted-properties',
    });
  }

  if (consultation.dealId) {
    const deal = consultation.deal;
    const txLabel = deal ? getStatusMeta('transactionType', deal.transactionType).label : null;
    const stageLabel = deal
      ? deal.isCancelled
        ? '취소'
        : getStatusMeta('dealStage', deal.stage).label
      : null;
    cards.push({
      key: 'deal',
      label: '거래',
      title: txLabel && stageLabel ? `${txLabel} · ${stageLabel}` : '거래 연결',
      description: '거래관리에서 이 거래의 진행과 계약을 엽니다.',
      to: '/deals',
      search: { dealId: consultation.dealId },
    });
  }

  if (consultation.projectId) {
    cards.push({
      key: 'project',
      label: '프로젝트',
      title: consultation.project?.title?.trim() || '프로젝트 연결',
      description: '프로젝트 작업 공간을 엽니다.',
      to: '/projects/$id',
      params: { id: consultation.projectId },
    });
  }

  return cards;
}

// ----------------------------------------------------------------
// 그룹핑 (날짜별 / 고객별)
// ----------------------------------------------------------------

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

/** 연락처별 타임라인 그룹 — 최신 상담이 있는 고객이 위로 */
export function groupConsultationsByContact(items: ConsultationListItem[]): ConsultationDayGroup[] {
  const groups = new Map<string, ConsultationListItem[]>();

  for (const item of items) {
    const key = item.contact?.id ?? item.contactId;
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }

  return Array.from(groups.entries())
    .map(([key, groupItems]) => {
      const sorted = groupItems
        .slice()
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
      return {
        key,
        label: sorted[0]?.contact?.name ?? '미지정 고객',
        items: sorted,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.items[0]?.createdAt ?? 0).getTime() - new Date(left.items[0]?.createdAt ?? 0).getTime(),
    );
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

// ----------------------------------------------------------------
// API 파라미터 / 필터 칩
// ----------------------------------------------------------------

export function buildConsultationApiParams({
  page,
  sortOrder,
  filters,
  view = 'all',
  limit = 20,
}: {
  page: number;
  sortOrder: 'asc' | 'desc';
  filters: ConsultationEntityFilters;
  /** 보기 탭 (전체 · 녹음 있음 · 후속 필요) */
  view?: ConsultationView;
  limit?: number;
}) {
  const params: Record<string, string | number> = {
    page,
    limit,
    sortOrder,
    ...consultationViewParams(view),
  };

  const q = filters.q?.trim();
  if (q) params.q = q;

  if (filters.quickFilter === 'actionRequired') params.outcome = 'actionRequired';
  if (filters.quickFilter === 'property') params.context = 'property';
  if (filters.quickFilter === 'listingIntake') params.context = 'listingIntake';
  if (filters.quickFilter === 'buyerIntake') params.context = 'buyerIntake';
  if (filters.quickFilter === 'deal') params.context = 'deal';
  if (filters.quickFilter === 'project') params.context = 'project';
  if (filters.quickFilter === 'unlinked') params.context = 'unlinked';

  if (filters.contact?.id) params.contactId = filters.contact.id;
  if (filters.site?.id) params.siteId = filters.site.id;
  if (filters.dong?.id) params.dongId = filters.dong.id;
  if (filters.unit?.id) params.unitId = filters.unit.id;
  if (filters.type) params.type = filters.type;
  if (filters.createdBy?.id) params.createdById = filters.createdBy.id;
  // 날짜는 이 컴퓨터의 하루(0시~23:59)로 바꿔 시각까지 보낸다.
  // "2026-11-22"만 보내면 서버가 UTC 0시(한국 오전 9시)로 읽어 아침 상담이 빠진다.
  if (filters.dateFrom) params.dateFrom = localDayStart(filters.dateFrom);
  if (filters.dateTo) params.dateTo = localDayEnd(filters.dateTo);

  return params;
}

/** "2026-11-22" → 이 컴퓨터 시간 그날 0시의 ISO */
export function localDayStart(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(date.getTime()) ? ymd : date.toISOString();
}

/** "2026-11-22" → 이 컴퓨터 시간 그날 23:59:59.999의 ISO */
export function localDayEnd(ymd: string): string {
  const date = new Date(`${ymd}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? ymd : date.toISOString();
}

export function getConsultationFilterChips(filters: ConsultationEntityFilters): ConsultationFilterChip[] {
  const chips: ConsultationFilterChip[] = [];
  const q = filters.q?.trim();

  if (q) chips.push({ key: 'q', label: `검색 ${q}` });
  if (filters.quickFilter === 'actionRequired') chips.push({ key: 'quickFilter', label: '후속 필요' });
  if (filters.quickFilter === 'property') chips.push({ key: 'quickFilter', label: '매물 연결' });
  if (filters.quickFilter === 'listingIntake') chips.push({ key: 'quickFilter', label: '의뢰 연결' });
  if (filters.quickFilter === 'buyerIntake') chips.push({ key: 'quickFilter', label: '구매 의뢰 연결' });
  if (filters.quickFilter === 'deal') chips.push({ key: 'quickFilter', label: '거래 연결' });
  if (filters.quickFilter === 'project') chips.push({ key: 'quickFilter', label: '프로젝트 연결' });
  if (filters.quickFilter === 'unlinked') chips.push({ key: 'quickFilter', label: '미연결' });
  if (filters.contact) chips.push({ key: 'contact', label: `고객 ${filters.contact.label}` });

  const propertyLabel = [filters.site?.label, filters.dong?.label, filters.unit?.label].filter(Boolean).join(' ');
  if (propertyLabel) chips.push({ key: 'property', label: `매물 ${propertyLabel}` });

  if (filters.type) chips.push({ key: 'type', label: `상담유형 ${typeLabel(filters.type)}` });
  if (filters.createdBy) chips.push({ key: 'createdBy', label: `상담자 ${filters.createdBy.label}` });

  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? filters.dateFrom.replaceAll('-', '.') : '';
    const to = filters.dateTo ? filters.dateTo.replaceAll('-', '.') : '';
    chips.push({ key: 'dateRange', label: `기간 ${from} ~ ${to}`.trim() });
  }

  return chips;
}

// ----------------------------------------------------------------
// 라벨/포맷 헬퍼
// ----------------------------------------------------------------

const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '문자·온라인',
};

function typeLabel(type: string) {
  return consultationTypeLabels[type] ?? type;
}

function formatPropertyContextTitle(
  property: ConsultationListItem['property'] | null | undefined,
  propertyId: string | null | undefined,
) {
  // "고덕그라시움 102동 2203호" — 공용 규칙(formatPlaceLabel)으로 잇는다
  const label = property
    ? formatPlaceLabel({
        siteName: property.site?.name,
        dongName: property.unit?.dong?.name,
        dongIsPlaceholder: property.unit?.dong?.isPlaceholder,
        unit: property.unit,
      })
    : '';
  if (label) return label;
  if (propertyId) return '매물 연결';
  return null;
}

function formatPropertyContextDescription(property: ConsultationListItem['property'] | null | undefined) {
  const details = [
    property?.unit?.floor != null ? `${property.unit.floor}층` : null,
    property?.unit?.lineNo != null ? `${property.unit.lineNo}라인` : null,
  ].filter((detail): detail is string => Boolean(detail));

  return details.length > 0
    ? details.join(' · ')
    : '매물 상세에서 소유자·임차인·상담 이력을 확인합니다.';
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(value));
}
