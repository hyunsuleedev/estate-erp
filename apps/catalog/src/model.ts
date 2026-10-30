export type Office = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  licenseNo: string | null;
  ceoName: string | null;
};
export type Home = {
  id: string;
  title: string;
  description: string;
  photoUrls: string[];
  updatedAt: string;
  office: Office;
  listing: {
    transactionType: string;
    price: number | null;
    deposit: number | null;
    monthlyRent: number | null;
    maintenanceFee: number | null;
    moveInAvailableType?: string | null;
    moveInAvailableFrom?: string | null;
    intake: { lastVerifiedAt: string | null };
    property: {
      site: {
        id: string;
        name: string;
        type: string;
        roadAddress: string | null;
        lat: string | number | null;
        lng: string | number | null;
      };
      unit: {
        exclusiveAreaM2: string | number | null;
        floor: number | null;
        siteUnitType?: { exclusiveAreaM2: string | number | null } | null;
      } | null;
    };
  };
};
export type Bounds = {
  south: number;
  north: number;
  west: number;
  east: number;
};
export type Filters = {
  search: string;
  transactionType: string;
  siteType: string;
  priceMin: string;
  priceMax: string;
  areaMin: string;
  areaMax: string;
  sort: string;
  siteId?: string;
  officeId?: string;
  bounds?: Bounds;
};
export type MapPoint = {
  siteId: string;
  name: string;
  lat: number;
  lng: number;
  count: number;
  minPrice: number | null;
  transactionType: string;
};
export type Results = {
  items: Home[];
  total: number;
  page: number;
  pageSize: number;
  office?: Office;
};
export type MapResults = {
  items: MapPoint[];
  total: number;
  truncated: boolean;
};
export const initialFilters: Filters = {
  search: "",
  transactionType: "",
  siteType: "",
  priceMin: "",
  priceMax: "",
  areaMin: "",
  areaMax: "",
  sort: "latest",
};
export const transactions: Record<string, string> = {
  sale: "매매",
  jeonse: "전세",
  monthly: "월세",
};
export const siteTypes: Record<string, string> = {
  apartment: "아파트",
  officetel: "오피스텔",
  villa: "빌라",
  house: "단독·다가구",
  commercial: "상가",
  land: "토지",
  living_accommodation: "생활숙박시설",
};
export function money(value: number | null) {
  return value == null
    ? "가격 문의"
    : value >= 10000
      ? `${Math.floor(value / 10000)}억${value % 10000 ? ` ${(value % 10000).toLocaleString()}만` : ""}`
      : `${value.toLocaleString()}만`;
}
export function price(home: Home) {
  const l = home.listing;
  return l.transactionType === "monthly"
    ? `${money(l.deposit)} / ${money(l.monthlyRent)}`
    : money(l.price);
}
export function area(home: Home) {
  const u = home.listing.property.unit;
  const n = u?.exclusiveAreaM2 ?? u?.siteUnitType?.exclusiveAreaM2;
  return n == null ? null : Number(n);
}
export function queryString(filters: Filters, page = 1) {
  const query = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries(filters)) {
    if (key === "bounds") continue;
    if (value) query.set(key, String(value));
  }
  if (filters.bounds)
    for (const [key, value] of Object.entries(filters.bounds))
      query.set(key, String(value));
  return query.toString();
}
export function filterHomes(homes: Home[], filters: Filters) {
  const result = homes.filter((home) => {
    const l = home.listing,
      site = l.property.site,
      amount = l.transactionType === "monthly" ? l.deposit : l.price,
      size = area(home),
      b = filters.bounds;
    if (
      (filters.officeId && home.office.id !== filters.officeId) ||
      (filters.siteId && site.id !== filters.siteId) ||
      (filters.transactionType &&
        l.transactionType !== filters.transactionType) ||
      (filters.siteType && site.type !== filters.siteType)
    )
      return false;
    if (
      filters.search &&
      !`${home.title} ${site.name} ${site.roadAddress}`
        .toLowerCase()
        .includes(filters.search.toLowerCase().trim())
    )
      return false;
    if (
      (filters.priceMin &&
        (amount == null || amount < Number(filters.priceMin))) ||
      (filters.priceMax &&
        (amount == null || amount > Number(filters.priceMax)))
    )
      return false;
    if (
      (filters.areaMin && (size == null || size < Number(filters.areaMin))) ||
      (filters.areaMax && (size == null || size > Number(filters.areaMax)))
    )
      return false;
    if (
      b &&
      (site.lat == null ||
        site.lng == null ||
        Number(site.lat) < b.south ||
        Number(site.lat) > b.north ||
        Number(site.lng) < b.west ||
        Number(site.lng) > b.east)
    )
      return false;
    return true;
  });
  return result.sort((a, b) => {
    if (filters.sort === "latest")
      return b.updatedAt.localeCompare(a.updatedAt);
    const av =
      a.listing.transactionType === "monthly"
        ? a.listing.deposit
        : a.listing.price;
    const bv =
      b.listing.transactionType === "monthly"
        ? b.listing.deposit
        : b.listing.price;
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    return (av - bv) * (filters.sort === "priceAsc" ? 1 : -1);
  });
}
export function mapPoints(homes: Home[]): MapPoint[] {
  const groups = new Map<string, MapPoint>();
  for (const h of homes) {
    const site = h.listing.property.site;
    if (site.lat == null || site.lng == null) continue;
    const amount =
      h.listing.transactionType === "monthly"
        ? h.listing.deposit
        : h.listing.price;
    const group = groups.get(site.id);
    if (group) {
      group.count++;
      if (group.transactionType !== h.listing.transactionType)
        group.transactionType = "mixed";
      group.minPrice =
        group.transactionType === "mixed"
          ? null
          : amount == null
            ? group.minPrice
            : group.minPrice == null
              ? amount
              : Math.min(group.minPrice, amount);
    } else
      groups.set(site.id, {
        siteId: site.id,
        name: site.name,
        lat: Number(site.lat),
        lng: Number(site.lng),
        count: 1,
        minPrice: amount,
        transactionType: h.listing.transactionType,
      });
  }
  return [...groups.values()];
}
