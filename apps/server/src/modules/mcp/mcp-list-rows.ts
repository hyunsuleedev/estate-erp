/**
 * MCP 목록 도구의 가벼운 줄 — find_listings(매물 = 의뢰 한 줄) · find_properties.
 * 칸 이름은 서비스가 주는 그대로 둔다. MCP의 낱말(listing · term)로 옮기는 것은 mcp-vocabulary.ts가 한다.
 *
 * 두 목록의 서비스 조회(`ListingIntakesService.findAll`, `PropertiesService.findAll`)는 아직 화면이 쓰는
 * 무거운 모양이다. 한 줄에 광고(40여 칸), 주소 코드, 호실·평형이 통째로 딸려 와 한 줄이 4~5KB였고,
 * 100줄을 부르면 39만 자가 되어 AI가 한 번에 받지 못했다(2026-11-27).
 *
 * 여기서는 그 줄에서 "그 줄만 보고 무엇인지 알 수 있는 만큼"만 골라 싣는다(server.md의 정규 목록).
 * 나머지는 한 건 조회(get_listing · get_property · get_contact)로 본다. 값을 바꾸거나 계산하지 않고
 * 고르기만 한다. 권한에 따른 가리기는 이 앞 단계(서비스)가 이미 끝낸다.
 *
 * 서비스의 목록이 가벼운 정규 모양으로 바뀌면 이 파일은 지운다.
 */

type Row = Record<string, unknown>;

/**
 * 속을 들여다볼 객체인가. 서비스는 DB에서 읽은 값을 그대로 준다: 시각은 Date, 면적·지분은 Decimal이다.
 * 그런 값 객체는 글이 되는 값이지 줄이 아니다 — 줄로 보면 "빈 객체"로 여겨 지워진다.
 */
function isRow(value: unknown): value is Row {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    typeof (value as { toJSON?: unknown }).toJSON !== 'function'
  );
}

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

/** 고른 칸 가운데 값이 있는 것만 담는다 — 빈 칸은 목록에서 자리만 차지한다 */
function pick(source: unknown, keys: readonly string[]): Row {
  const out: Row = {};
  if (!isRow(source)) return out;
  for (const key of keys) {
    const value = source[key];
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

function withoutEmpty(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (isRow(value)) return Object.keys(value).length > 0;
      return true;
    }),
  );
}

/** 어느 집인가: 단지·동·호와 면적. 주소 전체와 좌표·코드는 get_site로 본다 */
function placeOf(property: unknown): Row {
  if (!isRow(property)) return {};
  const site = isRow(property.site) ? property.site : {};
  const unit = isRow(property.unit) ? property.unit : {};
  const dong = isRow(unit.dong) ? unit.dong : {};
  const unitType = isRow(unit.siteUnitType) ? unit.siteUnitType : {};
  return withoutEmpty({
    siteId: property.siteId ?? site.id,
    siteName: site.name,
    siteType: site.type,
    address: site.roadAddress ?? site.jibunAddress,
    unitId: property.unitId ?? unit.id,
    // 동 구분이 없는 건물의 자리 채우기용 동은 이름이 뜻이 없다
    dong: dong.isPlaceholder === true ? undefined : dong.name,
    unit: unit.name,
    floor: unit.floor,
    floorLabel: unit.floorLabel,
    // 호실에 적은 값이 먼저고, 없으면 평형의 값이다(화면과 같은 순서)
    supplyAreaM2: unit.supplyAreaM2 ?? unitType.supplyAreaM2,
    exclusiveAreaM2: unit.exclusiveAreaM2 ?? unitType.exclusiveAreaM2,
    unitType: unitType.name,
    roomCount: unit.roomCount ?? unitType.roomCount,
    bathRoomCount: unit.bathRoomCount ?? unitType.bathRoomCount,
  });
}

/** 그 집에 걸린 사람(소유자 등): 누구인지와 대표 전화. 나머지는 get_contact */
function propertyContactsOf(property: unknown): Row[] {
  if (!isRow(property)) return [];
  return rowsOf(property.propertyContacts).map((link) => {
    const contact = isRow(link.contact) ? link.contact : {};
    return withoutEmpty({
      contactId: link.contactId ?? contact.id,
      name: contact.name,
      phone: contact.phone,
      role: link.role,
      // 대표가 아니거나 살지 않는 것이 보통이라 그럴 때만 싣는다
      isPrimary: link.isPrimary === true ? true : undefined,
      isResident: link.isResident === true ? true : undefined,
      status: link.status === "active" ? undefined : link.status,
    });
  });
}

const LISTING_TERM_KEYS = [
  "transactionType",
  "price",
  "deposit",
  "monthlyRent",
  "maintenanceFee",
  "loanAmount",
  "premium",
  "moveInAvailableType",
  "moveInAvailableFrom",
  "moveInAvailableTo",
] as const;

const LISTING_KEYS = [
  "lifecycleStatus",
  "closedReason",
  "receivedAt",
  "lastVerifiedAt",
  "nextConfirmAt",
  "occupancyStatus",
  "memo",
] as const;

const DEAL_KEYS = [
  "id",
  "stage",
  "stageChangedAt",
  "agreedPrice",
  "agreedDeposit",
  "agreedMonthlyRent",
] as const;

const ADVERTISEMENT_KEYS = [
  "id",
  "channel",
  "status",
  "advertisedPrice",
  "advertisedDeposit",
  "advertisedMonthlyRent",
  "externalAdId",
  "naverArticleNo",
  "startedAt",
] as const;

/** 매물 안의 거래 조건 하나(매매 · 전세 · 월세) */
function termOf(term: Row): Row {
  const count = isRow(term._count) ? term._count : {};
  return withoutEmpty({
    id: term.id,
    ...pick(term, LISTING_TERM_KEYS),
    isPaused: term.isPaused === true ? true : undefined,
    memo: term.memo,
    updatedAt: term.updatedAt,
    // 이 조건을 잡고 있는 거래. 있으면 지금 거래 중이다
    deals: rowsOf(term.deals).map((deal) => pick(deal, DEAL_KEYS)),
    activeAdvertisements: rowsOf(term.activeAdvertisements).map((ad) =>
      pick(ad, ADVERTISEMENT_KEYS),
    ),
    matchCount:
      typeof count.matches === "number" && count.matches > 0
        ? count.matches
        : undefined,
  });
}

/**
 * find_listings의 한 줄 — 매물관리 화면의 한 줄과 같은 단위다(집주인이 한 번 맡긴 의뢰).
 * 그 안의 매매 · 전세 · 월세는 terms에 싣는다. 가격 이력 · 광고 전체는 get_listing, 소유자는 find_property_contacts로 본다.
 */
export function toListingRow(intake: Row): Row {
  return withoutEmpty({
    id: intake.id,
    propertyId: intake.propertyId,
    ...pick(intake, LISTING_KEYS),
    // 공동중개가 아닌 것이 보통이다
    isJointBrokerageRequired:
      intake.isJointBrokerageRequired === true ? true : undefined,
    createdAt: intake.createdAt,
    updatedAt: intake.updatedAt,
    place: placeOf(intake.property),
    terms: rowsOf(intake.listings).map(termOf),
  });
}

/** find_properties의 한 줄 */
export function toPropertyRow(property: Row): Row {
  return withoutEmpty({
    id: property.id,
    createdAt: property.createdAt,
    updatedAt: property.updatedAt,
    place: placeOf(property),
    contacts: propertyContactsOf(property),
    listings: rowsOf(property.listings).map((listing) =>
      withoutEmpty({
        id: listing.id,
        intakeId: listing.intakeId,
        ...pick(listing, [
          "transactionType",
          "price",
          "deposit",
          "monthlyRent",
        ]),
        isPaused: listing.isPaused === true ? true : undefined,
        intakeLifecycleStatus: isRow(listing.intake)
          ? listing.intake.lifecycleStatus
          : undefined,
        deals: rowsOf(listing.deals).map((deal) => pick(deal, ["id", "stage"])),
      }),
    ),
    leases: rowsOf(property.leases).map((lease) =>
      withoutEmpty({
        id: lease.id,
        ...pick(lease, [
          "status",
          "deposit",
          "monthlyRent",
          "contractStart",
          "contractEnd",
          "moveOutDate",
        ]),
        tenants: rowsOf(lease.tenants).map((tenant) => {
          const contact = isRow(tenant.contact) ? tenant.contact : {};
          return withoutEmpty({
            contactId: tenant.contactId ?? contact.id,
            name: contact.name,
            phone: contact.phone,
          });
        }),
      }),
    ),
  });
}

/**
 * 목록 응답(`{ items, pagination }`)의 각 줄을 가벼운 줄로 바꾼다. 쪽 정보는 그대로 둔다.
 * 그 모양이 아니면(서비스가 다른 것을 돌려주면) 손대지 않는다.
 */
export function toLightList<T>(result: T, toRow: (row: Row) => Row): T {
  if (!isRow(result) || !Array.isArray(result.items)) return result;
  return {
    ...result,
    items: result.items.map((row) => (isRow(row) ? toRow(row) : row)),
  } as T;
}
