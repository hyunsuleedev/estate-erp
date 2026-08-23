import { TRANSACTION_TYPE_LABELS } from "@estate-erp/shared";
import { STATUS_CONFIG } from "@/lib/status-config";
import type { FilterDefinition } from "@/components/data-table";

/* ── 필터 정의 (StatusBadge 단일 소스의 라벨을 그대로 사용) ── */

const statusOptions = Object.entries(STATUS_CONFIG.buyerStatus).map(
  ([value, meta]) => ({
    value,
    label: meta.label,
  }),
);
const urgencyOptions = Object.entries(STATUS_CONFIG.buyerUrgency).map(
  ([value, meta]) => ({
    value,
    label: meta.label,
  }),
);
const txTypeOptions = Object.entries(TRANSACTION_TYPE_LABELS).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

export const staticFilterDefinitions: FilterDefinition[] = [
  {
    id: "status",
    field: "status",
    label: "요건상태",
    type: "multiSelect",
    operators: ["in"],
    options: statusOptions,
  },
  {
    id: "urgency",
    field: "urgency",
    label: "긴급도",
    type: "multiSelect",
    operators: ["in"],
    options: urgencyOptions,
  },
  {
    id: "transactionType",
    field: "transactionType",
    label: "거래유형",
    type: "multiSelect",
    operators: ["in"],
    options: txTypeOptions,
  },
  {
    id: "price",
    field: "price",
    label: "예산",
    type: "numberRange",
    operators: ["between"],
    unit: "만원",
  },
  {
    id: "deposit",
    field: "deposit",
    label: "보증금",
    type: "numberRange",
    operators: ["between"],
    unit: "만원",
  },
  {
    id: "monthlyRent",
    field: "monthlyRent",
    label: "월세",
    type: "numberRange",
    operators: ["between"],
    unit: "만원",
  },
  {
    id: "area",
    field: "area",
    label: "공급평형",
    type: "numberRange",
    operators: ["between"],
    unit: "평",
  },
  {
    id: "moveIn",
    field: "moveIn",
    label: "입주 희망일",
    type: "dateRange",
    operators: ["between"],
  },
  {
    id: "nextContact",
    field: "nextContact",
    label: "다음 연락일",
    type: "dateRange",
    operators: ["between"],
  },
];

// 정렬은 최소/최대 경계 단위로 유지한다 — 병합 표시 컬럼("budget" 등)과 무관하게
// 고객 원장 API가 이 필드명을 정렬 기준으로 해석한다.
export const sortDefinitions = [
  { field: "customer", label: "고객명" },
  { field: "intentCount", label: "희망조건 수" },
  { field: "budgetMin", label: "최소예산" },
  { field: "budgetMax", label: "최대예산" },
  { field: "monthlyRentMin", label: "최소월세" },
  { field: "monthlyRentMax", label: "최대월세" },
  { field: "areaMin", label: "최소평형" },
  { field: "areaMax", label: "최대평형" },
  { field: "matches", label: "매칭 수" },
  { field: "createdAt", label: "접수일" },
  { field: "nextContactDate", label: "다음 연락일" },
  { field: "urgency", label: "긴급도" },
];

export const SERVER_SORT_FIELDS = new Set(["createdAt"]);

/* ── 구매 의뢰 생명주기 프리셋 ── */

export type PresetId = "all" | "open" | "hold" | "closed";

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "open", label: "진행" },
  { id: "hold", label: "보류" },
  { id: "closed", label: "종료" },
];
