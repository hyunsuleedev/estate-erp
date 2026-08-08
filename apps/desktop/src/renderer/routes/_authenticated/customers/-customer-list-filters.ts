import type {
  BrokerageCaseLedgerFilter,
  BrokerageCaseLedgerSortField,
} from "@estate-erp/api-client";
import { pyeongToSqm } from "@estate-erp/shared";
import type { ActiveFilter, FilterDefinition } from "@/components/data-table";
import { staticFilterDefinitions } from "../buyer-requirements/-buyer-list-filters";

// 고객원장은 구매고객과 같은 필터 문법·라벨·선택지를 그대로 사용한다.
export const customerLedgerFilterDefinitions: FilterDefinition[] = [
  ...staticFilterDefinitions,
];

export const customerLedgerSortDefinitions: Array<{
  field: BrokerageCaseLedgerSortField;
  label: string;
}> = [
  { field: "customer", label: "고객명" },
  { field: "intentCount", label: "요건 수" },
  { field: "budgetMin", label: "최소예산" },
  { field: "budgetMax", label: "최대예산" },
  { field: "monthlyRentMin", label: "최소월세" },
  { field: "monthlyRentMax", label: "최대월세" },
  { field: "areaMin", label: "최소평형" },
  { field: "areaMax", label: "최대평형" },
  { field: "matchCount", label: "매칭 수" },
  { field: "updatedAt", label: "최근 갱신" },
];

function numberBoundary(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 구매고객 필터를 고객원장 API 파라미터로 직렬화한다. 이 파라미터들은
 * BuyerRequirement에만 적용되며, 서버는 하나라도 존재하면 구함 없는 케이스를 제외한다.
 */
export function customerLedgerFiltersToApiParams(
  activeFilters: ActiveFilter[],
): BrokerageCaseLedgerFilter {
  const params: BrokerageCaseLedgerFilter = {};

  for (const filter of activeFilters) {
    if (filter.field === "preferredSites" && filter.values?.length) {
      params.preferredSiteIds = filter.values.join(",");
      continue;
    }

    if (filter.field === "preferredRegions" && filter.values?.length) {
      const provinceCodes: string[] = [];
      const districtCodes: string[] = [];
      const wardCodes: string[] = [];
      for (const value of filter.values) {
        const [level, code] = value.split(":");
        if (!code) continue;
        if (level === "province") provinceCodes.push(code);
        else if (level === "district") districtCodes.push(code);
        else if (level === "ward") wardCodes.push(code);
      }
      if (provinceCodes.length) params.provinceCodes = provinceCodes.join(",");
      if (districtCodes.length) params.districtCodes = districtCodes.join(",");
      if (wardCodes.length) params.wardCodes = wardCodes.join(",");
      continue;
    }

    if (
      filter.field === "status" &&
      filter.operator === "in" &&
      filter.values?.length
    ) {
      params.status = filter.values
        .flatMap((value) => {
          if (value === "active") return ["active", "matched"];
          if (value === "hold") return ["hold", "inactive"];
          return [value];
        })
        .join(",");
      continue;
    }

    if (filter.operator === "in" && filter.values?.length) {
      const value = filter.values.join(",");
      if (filter.field === "urgency") params.urgency = value;
      else if (filter.field === "transactionType")
        params.transactionType = value;
      else if (filter.field === "assignedToId") params.assignedToId = value;
      continue;
    }

    if (filter.operator !== "between") continue;
    if (filter.field === "moveIn") {
      if (filter.valueMin) params.moveInAfter = filter.valueMin;
      if (filter.valueMax) params.moveInBefore = filter.valueMax;
      continue;
    }
    if (filter.field === "nextContact") {
      if (filter.valueMin) params.nextContactAfter = filter.valueMin;
      if (filter.valueMax) params.nextContactBefore = filter.valueMax;
      continue;
    }

    const min = numberBoundary(filter.valueMin);
    const max = numberBoundary(filter.valueMax);
    if (filter.field === "price") {
      if (min !== undefined) params.priceMin = min;
      if (max !== undefined) params.priceMax = max;
    } else if (filter.field === "deposit") {
      if (min !== undefined) params.depositMin = min;
      if (max !== undefined) params.depositMax = max;
    } else if (filter.field === "monthlyRent") {
      if (min !== undefined) params.monthlyRentMin = min;
      if (max !== undefined) params.monthlyRentMax = max;
    } else if (filter.field === "area") {
      if (min !== undefined) params.areaMin = pyeongToSqm(min);
      if (max !== undefined) params.areaMax = pyeongToSqm(max);
    }
  }

  return params;
}
