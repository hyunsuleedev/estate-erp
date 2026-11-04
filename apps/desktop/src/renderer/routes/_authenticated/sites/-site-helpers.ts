/**
 * 관리단지 페이지 보조 헬퍼 — 라벨, 배치 파싱, 점유상태 분류, 가격 표기.
 */
import type { OfficeSite, Unit } from '@estate-erp/api-client';
import { formatMoney, formatRent } from '@/lib/format';
import type { PostcodeResult } from '@/lib/kakao-postcode';

// ── Labels ──────────────────────────────────────────────────────

export const siteTypeLabels: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  house: '단독/다가구',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박',
};

export const siteTypeShort: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피',
  villa: '빌라',
  house: '단독',
  commercial: '상가',
  land: '토지',
  living_accommodation: '숙박',
};

export const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

export const tenantStatusLabels: Record<string, string> = {
  residing: '거주중',
  moving_out: '퇴거예정',
  moved: '퇴거',
};

// ── Region / placement helpers ──────────────────────────────────

export function extractRegion(address: string | null): string {
  if (!address) return '기타';
  const match = address.match(/([가-힣]+구)\s*([가-힣]+동)?/);
  if (match) return match[2] ? `${match[1]} ${match[2]}` : match[1];
  const cityMatch = address.match(/([가-힣]+[시군])/);
  return cityMatch ? cityMatch[1] : '기타';
}

/** 법정동 체인(ward)이 projection에 있으면 우선 사용, 없으면 주소 regex fallback */
export function extractRegionFromSite(site: {
  ward?: { name: string; district?: { name: string } | null } | null;
  roadAddress?: string | null;
  jibunAddress?: string | null;
}): string {
  if (site.ward?.district?.name) {
    return `${site.ward.district.name} ${site.ward.name ?? ''}`.trim();
  }
  return extractRegion(site.roadAddress ?? site.jibunAddress ?? null);
}

// ── 관리단지 검색 / 그룹 ────────────────────────────────────────

export type SiteGroupMode = 'none' | 'region' | 'type';

export interface OfficeSiteFacetFilters {
  regions?: string[];
  types?: string[];
}

function compactSiteSearchText(value: string): string {
  return value.toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '');
}

function getSiteSearchTokens(query: string): string[] {
  return query
    .trim()
    .split(/[\s·,./()_-]+/u)
    .map(compactSiteSearchText)
    .filter(Boolean);
}

export function filterOfficeSites(
  officeSites: OfficeSite[],
  query: string,
  facets: OfficeSiteFacetFilters = {},
): OfficeSite[] {
  const tokens = getSiteSearchTokens(query);
  const regions = facets.regions ?? [];
  const types = facets.types ?? [];
  if (tokens.length === 0 && regions.length === 0 && types.length === 0) {
    return officeSites;
  }

  return officeSites.filter((officeSite) => {
    const site = officeSite.site;
    if (!site) return false;
    if (regions.length > 0 && !regions.includes(extractRegionFromSite(site))) {
      return false;
    }
    if (types.length > 0 && !types.includes(site.type)) return false;

    const searchableText = compactSiteSearchText(
      [
        site.name,
        siteTypeLabels[site.type],
        siteTypeShort[site.type],
        site.roadAddress,
        site.jibunAddress,
        site.ward?.district?.province?.name,
        site.ward?.district?.name,
        site.ward?.name,
      ]
        .filter(Boolean)
        .join(' '),
    );

    return tokens.every((token) => searchableText.includes(token));
  });
}

export type RecordPresenceFilter = 'all' | 'present' | 'missing';

export interface UnitRecordFilters {
  owner: RecordPresenceFilter;
  tenant: RecordPresenceFilter;
  listing: RecordPresenceFilter;
  consultation: RecordPresenceFilter;
}

function matchesPresence(hasRecord: boolean, filter: RecordPresenceFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'present' ? hasRecord : !hasRecord;
}

/** 호수 표의 관계형 정보 등록 여부를 같은 규칙으로 필터링한다. */
export function filterUnitsByRecordPresence(
  units: Unit[],
  filters: UnitRecordFilters,
): Unit[] {
  return units.filter((unit) => {
    const properties = unit.properties ?? [];
    const hasOwner = properties.some((property) =>
      (property.propertyContacts ?? []).some((contact) => contact.role === 'owner'),
    );
    const hasTenant = properties.some((property) => (property.tenants ?? []).length > 0);
    const hasListing = properties.some((property) => (property.listings ?? []).length > 0);
    const hasConsultation = properties.some(
      (property) => (property.consultations ?? []).length > 0,
    );

    return (
      matchesPresence(hasOwner, filters.owner) &&
      matchesPresence(hasTenant, filters.tenant) &&
      matchesPresence(hasListing, filters.listing) &&
      matchesPresence(hasConsultation, filters.consultation)
    );
  });
}

/**
 * 우리 사무소가 관리호수로 등록한 호실인지.
 * 호수 API는 요청한 사무소의 Property만 내려주므로 Property가 하나라도 있으면 우리 기록이다.
 */
export function isManagedUnit(unit: Unit): boolean {
  return (unit.properties ?? []).length > 0;
}

/** 기존 필로티 플래그와 배치 셀 유형을 모두 지원한다. */
export function isPilotiUnit(unit: Unit): boolean {
  return unit.isPiloti || unit.cellType === 'piloti';
}

/** 호수 목록 표시 범위 — 기본은 관리호수만, 필요할 때 전체 호실. */
export type UnitTableScope = 'managed' | 'all';

/**
 * 표에 실제로 보여줄 호실.
 * 검색 중에는 범위와 상관없이 전체 호실에서 찾는다 — 처음 연락 온 호실도 바로 찾아 등록할 수 있어야 한다.
 */
export function selectUnitTableRows(
  units: Unit[],
  scope: UnitTableScope,
  isSearching: boolean,
): Unit[] {
  return units.filter(
    (unit) => !isPilotiUnit(unit) && (scope === 'all' || isSearching || isManagedUnit(unit)),
  );
}

/** 즐겨찾기를 먼저 보여주되 서버가 내려준 최신 구독 순서는 그대로 유지한다. */
export function prioritizeFavoriteOfficeSites(officeSites: OfficeSite[]): OfficeSite[] {
  return [...officeSites].sort(
    (left, right) => Number(right.isFavorite) - Number(left.isFavorite),
  );
}

export function groupOfficeSites(
  officeSites: OfficeSite[],
  groupBy: SiteGroupMode,
): Array<[string, OfficeSite[]]> | null {
  if (groupBy === 'none') return null;

  const groups: Record<string, OfficeSite[]> = {};
  for (const officeSite of officeSites) {
    const site = officeSite.site;
    if (!site) continue;
    const key =
      groupBy === 'region'
        ? extractRegionFromSite(site)
        : (siteTypeLabels[site.type] ?? site.type);
    if (!groups[key]) groups[key] = [];
    groups[key].push(officeSite);
  }

  return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], 'ko'));
}

/**
 * 동·호수 구조를 바꿀 수 있는 단지인지 — 사무소가 직접 등록한 비공개 단지만 가능하다.
 * 공공 단지의 구조는 어떤 사무소도 바꿀 수 없고 서버도 거부한다. 토지는 호수가 없다.
 */
export function canEditSiteStructure(
  site: Pick<NonNullable<OfficeSite['site']>, 'isPublic' | 'type'>,
): boolean {
  return site.isPublic === false && site.type !== 'land';
}

/** 유형 · 동수 · 세대수 · 준공년도 — 이름이 비슷한 단지를 구분할 때 쓴다. 단일 동 건물은 동수를 생략한다. */
export function formatSiteSummary(
  site: Pick<NonNullable<OfficeSite['site']>, 'type' | 'totalDongs' | 'totalUnits' | 'builtYear' | '_count'>,
): string {
  // 호실을 아직 가져오지 않은 단지는 집계가 0이므로 공공데이터의 총수로 대신한다
  const dongCount = site._count?.dongs || site.totalDongs;
  const unitCount = site._count?.units || site.totalUnits;
  return [
    siteTypeLabels[site.type] ?? site.type,
    dongCount && dongCount > 1 ? `${dongCount.toLocaleString()}개동` : null,
    unitCount ? `${unitCount.toLocaleString()}세대` : null,
    site.builtYear ? `${site.builtYear}년 준공` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export interface SiteAddress {
  wardCode: string;
  roadAddress: string | null;
  jibunAddress: string | null;
  zipCode: string | null;
  buildingName: string | null;
  isApartment: boolean;
}

/** 주소 검색 결과에서 단지 등록에 쓸 값을 고른다. 단지는 법정동 코드를 참조하므로 코드가 없으면 null이다. */
export function toSiteAddress(result: PostcodeResult): SiteAddress | null {
  const wardCode = result.bcode?.trim() ?? '';
  if (!/^\d{10}$/.test(wardCode)) return null;

  // autoRoadAddress·autoJibunAddress는 추측한 매핑일 수 있어 쓰지 않는다
  const roadAddress =
    result.roadAddress?.trim() || (result.userSelectedType === 'R' ? result.address?.trim() : '') || null;
  const jibunAddress =
    result.jibunAddress?.trim() || (result.userSelectedType === 'J' ? result.address?.trim() : '') || null;
  if (!roadAddress && !jibunAddress) return null;

  return {
    wardCode,
    roadAddress,
    jibunAddress,
    zipCode: result.zonecode?.trim() || null,
    buildingName: result.buildingName?.trim() || null,
    isApartment: result.apartment === 'Y',
  };
}

export function getSiteGroupKeys(officeSites: OfficeSite[], groupBy: SiteGroupMode): string[] {
  return groupOfficeSites(officeSites, groupBy)?.map(([groupKey]) => groupKey) ?? [];
}

export function parseUnitPlacement(unit: Unit): { floor: number | null; lineNo: number | null } {
  const digits = unit.name.replace(/\D/g, '');
  const fallbackFloor = digits.length >= 3 ? Number.parseInt(digits.slice(0, -2), 10) : null;
  const fallbackLineNo = digits.length >= 2 ? Number.parseInt(digits.slice(-2), 10) : null;

  return {
    floor: unit.floor ?? (Number.isNaN(fallbackFloor) ? null : fallbackFloor),
    lineNo: unit.lineNo ?? (Number.isNaN(fallbackLineNo) ? null : fallbackLineNo),
  };
}

export function formatFloorLabel(floor: number): string {
  if (floor === 0) return 'P';
  if (floor < 0) return `B${Math.abs(floor)}`;
  return `${floor}`;
}

// ── 가격 표기 (만원 → 억 변환은 formatMoney가 담당) ─────────────

export function formatListingPrice(listing: {
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}): string {
  if (listing.transactionType === 'monthly') {
    return formatRent(listing.deposit, listing.monthlyRent);
  }
  if (listing.transactionType === 'jeonse') {
    return formatMoney(listing.deposit ?? listing.price);
  }
  // sale 등
  return formatMoney(listing.price ?? listing.deposit);
}

// ── 점유상태 (내부 CRM 데이터 기반 분류) ────────────────────────

export type OccupancyStatus = 'owner_occupied' | 'jeonse' | 'monthly' | 'vacant_or_unknown';

export const OCCUPANCY_ORDER: OccupancyStatus[] = [
  'owner_occupied',
  'jeonse',
  'monthly',
  'vacant_or_unknown',
];

export interface OccupancyMeta {
  label: string;
  /** 배치표 셀 배경/보더 */
  cellClass: string;
  /** 범례/뱃지 점 색 */
  dotClass: string;
  /** 뱃지 (연한 배경 + 진한 글자) */
  badgeClass: string;
}

export const OCCUPANCY_META: Record<OccupancyStatus, OccupancyMeta> = {
  owner_occupied: {
    label: '자가',
    cellClass: 'border-success/30 bg-success-soft hover:bg-success-soft/80',
    dotClass: 'bg-success',
    badgeClass: 'bg-success-soft text-success',
  },
  jeonse: {
    label: '전세',
    cellClass: 'border-info/30 bg-info-soft hover:bg-info-soft/80',
    dotClass: 'bg-info',
    badgeClass: 'bg-info-soft text-info',
  },
  monthly: {
    label: '월세',
    cellClass: 'border-orange/30 bg-orange-soft hover:bg-orange-soft/80',
    dotClass: 'bg-orange',
    badgeClass: 'bg-orange-soft text-orange',
  },
  vacant_or_unknown: {
    label: '미확인',
    cellClass: 'border-dashed border-border/70 bg-background hover:bg-accent/60',
    dotClass: 'bg-muted-foreground/40',
    badgeClass: 'bg-neutral-soft text-muted-foreground',
  },
};

/**
 * 점유상태 분류 우선순위 (PRD):
 * 1. 세입자(residing) 있음 + 월세 금액 있음 → 월세
 * 2. 세입자(residing) 있음 + 월세 없음 → 전세
 * 3. 소유자(owner, active) 실거주 → 자가
 * 4. 신호 없음 → 미확인 (공실로 단정하지 않음)
 */
export function getUnitOccupancy(unit: Unit): OccupancyStatus {
  const properties = unit.properties ?? [];
  const tenants = properties.flatMap((property) => property.tenants ?? []);
  if (tenants.length > 0) {
    return tenants.some((tenant) => (tenant.monthlyRent ?? 0) > 0) ? 'monthly' : 'jeonse';
  }
  const ownerResident = properties
    .flatMap((property) => property.propertyContacts ?? [])
    .some((pc) => pc.role === 'owner' && pc.isResident);
  if (ownerResident) return 'owner_occupied';
  return 'vacant_or_unknown';
}

// ── 배치표 공용 타입 ────────────────────────────────────────────

export interface MultiSelectOption {
  value: string;
  label: string;
  helper?: string;
}

export function getInitialDongScope(defaultDongId: string | null): string[] {
  return defaultDongId ? [defaultDongId] : [];
}

export function isDefaultDongScope(dongIds: string[], defaultDongId: string | null): boolean {
  return defaultDongId != null && dongIds.length === 1 && dongIds[0] === defaultDongId;
}

export interface PositionedUnit {
  unit: Unit;
  floor: number;
  lineNo: number;
}

export interface LayoutSection {
  key: string;
  label: string;
  floors: number[];
  lineNos: number[];
  cellMap: Map<string, PositionedUnit>;
  unpositionedUnits: Unit[];
}

// ── 관리단지 사이드바 ───────────────────────────────────────────

export const SITES_PANEL_WIDTH = { min: 220, max: 380, default: 280 } as const;
/** 사이드바를 열어도 본문에 남겨 둘 최소 폭 — 이보다 좁으면 도구줄이 화면 밖으로 밀린다 */
export const SITES_MAIN_MIN_WIDTH = 700;

/** 페이지 폭에서 본문 최소 폭을 뺀 만큼까지만 사이드바를 넓힌다. 폭을 아직 모르면 최대치까지 허용. */
export function clampPanelWidth(width: number, containerWidth: number): number {
  const roomForPanel =
    containerWidth > 0 ? containerWidth - SITES_MAIN_MIN_WIDTH : SITES_PANEL_WIDTH.max;
  const max = Math.max(SITES_PANEL_WIDTH.min, Math.min(SITES_PANEL_WIDTH.max, roomForPanel));
  return Math.max(SITES_PANEL_WIDTH.min, Math.min(width, max));
}

/** 이 단지에서 우리 사무소가 관리호수로 등록한 호실 수 (목록 API의 사무소 범위 집계) */
export function getManagedUnitCount(officeSite: OfficeSite): number {
  return officeSite.site?._count?.properties ?? 0;
}

/** 동 선택 요약: 전체 동 / 101동 / 101동 외 2 */
export function summarizeDongScope(
  options: ReadonlyArray<MultiSelectOption>,
  selectedIds: ReadonlyArray<string>,
): string | null {
  if (selectedIds.length === 0) return null;
  const first = options.find((option) => option.value === selectedIds[0])?.label ?? '';
  const firstLabel = /동$/.test(first) ? first : `${first}동`;
  return selectedIds.length > 1 ? `${firstLabel} 외 ${selectedIds.length - 1}` : firstLabel;
}

export interface SitePanelSection {
  key: string;
  /** null이면 제목 없이 바로 단지를 보여준다 */
  label: string | null;
  /** pinned·all은 늘 펼침, group·idle은 접고 펼 수 있다 */
  kind: 'pinned' | 'all' | 'idle' | 'group';
  items: OfficeSite[];
}

/**
 * 관리단지 사이드바의 묶음을 만든다. officeSites는 검색이 끝나고 고정한 단지가 앞에 온 순서여야 한다.
 *
 * - 목록: 고정 → 단지(관리호수 있음) → 기록 없는 단지. 검색 중에는 기록 없는 단지를 따로 모으지 않는다.
 * - 지역별·유형별: 고정한 단지도 자기 묶음 안에 둔다(각 묶음 안에서 맨 앞). 따로 빼면 어느 묶음인지 알 수 없다.
 */
export function buildSitePanelSections(
  officeSites: OfficeSite[],
  { groupBy, searching }: { groupBy: SiteGroupMode; searching: boolean },
): SitePanelSection[] {
  if (groupBy !== 'none') {
    return (groupOfficeSites(officeSites, groupBy) ?? []).map(([groupKey, items]) => ({
      key: `group:${groupKey}`,
      label: groupKey,
      kind: 'group' as const,
      items,
    }));
  }

  const pinned = officeSites.filter((officeSite) => officeSite.isFavorite);
  const rest = officeSites.filter((officeSite) => !officeSite.isFavorite);
  const active = searching ? rest : rest.filter((officeSite) => getManagedUnitCount(officeSite) > 0);
  const idle = searching ? [] : rest.filter((officeSite) => getManagedUnitCount(officeSite) === 0);
  const sections: SitePanelSection[] = [
    { key: 'pinned', label: '고정', kind: 'pinned', items: pinned },
    { key: 'all', label: pinned.length > 0 ? '단지' : null, kind: 'all', items: active },
    { key: 'idle', label: '기록 없는 단지', kind: 'idle', items: idle },
  ];
  return sections.filter((section) => section.items.length > 0);
}
