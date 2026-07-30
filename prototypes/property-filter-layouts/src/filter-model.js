import { useMemo, useState } from "react";
import {
  advertisementOptions,
  areaOptions,
  availabilityOptions,
  confirmationOptions,
  moveInOptions,
  priceOptions,
  properties,
  rentOptions,
  regionOptions,
  siteOptions,
  siteTypeOptions,
  transactionOptions,
} from "./data.js";

export const emptyFilters = {
  transaction: "all",
  search: "",
  site: "all",
  region: "all",
  dong: "",
  unit: "",
  siteType: "all",
  availability: "all",
  price: "all",
  rent: "all",
  area: "all",
  moveIn: "all",
  advertisement: "all",
  confirmation: "all",
};

const filterDefinitions = {
  site: { label: "단지", options: siteOptions },
  region: { label: "지역", options: regionOptions },
  dong: { label: "동", freeform: true },
  unit: { label: "호", freeform: true },
  siteType: { label: "유형", options: siteTypeOptions },
  availability: { label: "상태", options: availabilityOptions },
  price: { label: "가격", options: priceOptions },
  rent: { label: "월세", options: rentOptions },
  area: { label: "면적", options: areaOptions },
  moveIn: { label: "입주", options: moveInOptions },
  advertisement: { label: "광고", options: advertisementOptions },
  confirmation: { label: "확인", options: confirmationOptions },
};

function optionLabel(definition, value) {
  if (definition.freeform) return value;
  return definition.options.find((option) => option.value === value)?.label ?? value;
}

export function getActiveFilterEntries(filters, includePrimary = true) {
  const entries = [];

  if (includePrimary && filters.transaction !== "all") {
    entries.push({
      key: "transaction",
      label: "거래",
      value: transactionOptions.find((item) => item.value === filters.transaction)?.label ?? filters.transaction,
    });
  }

  for (const [key, definition] of Object.entries(filterDefinitions)) {
    const value = filters[key];
    if (!value || value === "all") continue;
    entries.push({ key, label: definition.label, value: optionLabel(definition, value) });
  }

  if (includePrimary && filters.search.trim()) {
    entries.push({ key: "search", label: "검색", value: filters.search.trim() });
  }

  return entries;
}

function matchesPrice(priceEok, value) {
  if (value === "under10") return priceEok < 10;
  if (value === "10to20") return priceEok >= 10 && priceEok < 20;
  if (value === "20to30") return priceEok >= 20 && priceEok < 30;
  if (value === "over30") return priceEok >= 30;
  return true;
}

function matchesArea(area, value) {
  if (value === "under20") return area < 20;
  if (value === "20to30") return area >= 20 && area < 30;
  if (value === "30to40") return area >= 30 && area < 40;
  if (value === "over40") return area >= 40;
  return true;
}

function matchesRent(monthlyRent, value) {
  if (value === "under150") return monthlyRent !== null && monthlyRent < 150;
  if (value === "150to250") return monthlyRent !== null && monthlyRent >= 150 && monthlyRent < 250;
  if (value === "over250") return monthlyRent !== null && monthlyRent >= 250;
  return true;
}

export function applyFilters(source, filters) {
  const query = filters.search.trim().toLocaleLowerCase("ko");
  const dong = filters.dong.trim().toLocaleLowerCase("ko").replace(/동$/, "");
  const unit = filters.unit.trim().toLocaleLowerCase("ko").replace(/호$/, "");

  return source.filter((property) => {
    if (filters.transaction !== "all" && property.transaction !== filters.transaction) return false;
    if (filters.site !== "all" && property.siteId !== filters.site) return false;
    if (filters.region !== "all" && property.region !== filters.region) return false;
    if (filters.siteType !== "all" && property.siteType !== filters.siteType) return false;
    if (filters.availability !== "all" && property.availability !== filters.availability) return false;
    if (!matchesPrice(property.priceEok, filters.price)) return false;
    if (!matchesRent(property.monthlyRent, filters.rent)) return false;
    if (!matchesArea(property.area, filters.area)) return false;
    if (filters.moveIn !== "all" && property.moveIn !== filters.moveIn) return false;
    if (filters.advertisement === "with" && !property.advertised) return false;
    if (filters.advertisement === "without" && property.advertised) return false;
    if (filters.confirmation !== "all" && property.confirmation !== filters.confirmation) return false;
    if (dong && !property.dong.toLocaleLowerCase("ko").includes(dong)) return false;
    if (unit && !property.unit.toLocaleLowerCase("ko").includes(unit)) return false;

    if (
      query &&
      ![
        property.site,
        property.ward,
        property.dong,
        property.unit,
        property.contact,
        property.memo,
        property.priceLabel,
      ].some((value) => String(value).toLocaleLowerCase("ko").includes(query))
    ) {
      return false;
    }

    return true;
  });
}

export function usePropertyFilters(initial = {}) {
  const [filters, setFilters] = useState(() => ({ ...emptyFilters, ...initial }));
  const filteredProperties = useMemo(() => applyFilters(properties, filters), [filters]);
  const activeFilters = useMemo(() => getActiveFilterEntries(filters), [filters]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilter = (key) => {
    setFilters((current) => ({ ...current, [key]: emptyFilters[key] }));
  };

  const resetFilters = () => setFilters({ ...emptyFilters });
  const replaceFilters = (next) => setFilters({ ...emptyFilters, ...next });

  return {
    activeFilters,
    clearFilter,
    filteredProperties,
    filters,
    replaceFilters,
    resetFilters,
    setFilters,
    updateFilter,
  };
}

export const savedLenses = [
  {
    id: "all",
    label: "전체 매물",
    description: "등록된 모든 의뢰",
    filters: {},
  },
  {
    id: "needs-check",
    label: "확인 필요",
    description: "재확인이 필요한 의뢰",
    filters: { confirmation: "overdue" },
  },
  {
    id: "ready-now",
    label: "즉시 입주",
    description: "가용 · 즉시 입주",
    filters: { availability: "available", moveIn: "immediate" },
  },
  {
    id: "no-ad",
    label: "광고 없는 가용",
    description: "광고 등록 후보",
    filters: { availability: "available", advertisement: "without" },
  },
  {
    id: "in-progress",
    label: "거래 진행",
    description: "활성 Deal 연결",
    filters: { availability: "in_contract" },
  },
];

export function getLensCount(lens) {
  return applyFilters(properties, { ...emptyFilters, ...lens.filters }).length;
}

export function describeFilters(filters) {
  const active = getActiveFilterEntries(filters);
  if (active.length === 0) return "모든 매물을 표시합니다.";

  const descriptions = active.map((entry) => `${entry.label} ${entry.value}`);
  return `${descriptions.join(" · ")} 조건으로 좁혔습니다.`;
}
