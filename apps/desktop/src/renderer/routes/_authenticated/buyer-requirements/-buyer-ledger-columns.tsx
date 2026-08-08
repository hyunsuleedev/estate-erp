import type { ColumnDef } from "@tanstack/react-table";
import {
  BadgeAlert,
  CalendarDays,
  CircleDot,
  GitBranch,
  Tag,
  UserRound,
} from "lucide-react";
import type { BuyerRequirement } from "@estate-erp/api-client";
import { DateCell } from "@/components/data-table";
import {
  buyerBudgetBoundaryValue,
  type BuyerRequirementGroup,
} from "./-buyer-ledger";
import {
  BuyerAreaRangeCell,
  BuyerBudgetRangeCell,
  BuyerGroupCustomerCell,
  BuyerHeaderLabel,
  BuyerInlineSelectCell,
  BuyerIntentLinesCell,
  BuyerIntentSummary,
  BuyerMatchCell,
  BuyerMonthlyRentRangeCell,
  BuyerRequirementActionMenu,
  type BuyerInlineField,
} from "./-buyer-ledger-cells";
import { BuyerLinesToggle } from "./-buyer-list-panels";

/**
 * 희망조건 비교 행 아래 "선호 조건" 컨텍스트 행이 가로로 병합되는 컬럼들.
 * 병합 범위 컬럼(budget/monthlyRent/area)이 여기 포함되어 min/max 분리 시절의
 * 병합 폭과 동일한 시각 구조를 유지한다. monthlyRent 컬럼이 숨겨지면 폭 계산에서
 * 자동으로 빠진다(getColumn이 undefined → 0).
 */
export const CONTEXT_COLUMN_IDS = [
  "intentCount",
  "budget",
  "monthlyRent",
  "area",
] as const;

export interface BuyerLedgerColumnsOptions {
  /** 거래유형 필터에 "monthly"가 없으면 월세 컬럼을 통째로 숨긴다. */
  showRent: boolean;
  onOpenDetail: (requirement: BuyerRequirement) => void;
  onContactLog: (requirement: BuyerRequirement) => void;
  onEdit: (requirement: BuyerRequirement) => void;
  isInlineFieldSaving: (
    requirementId: string,
    field: BuyerInlineField,
  ) => boolean;
  onInlineFieldSave: (
    requirement: BuyerRequirement,
    field: BuyerInlineField,
    value: string,
  ) => void;
}

/**
 * 구매원장 컬럼 정의.
 * min/max 경계 컬럼 6개(예산·월세·평형)를 3개의 병합 범위 컬럼으로 묶고,
 * 전화번호는 고객 셀 보조 라인으로 흡수해 1600px 화면에서 가로 스크롤 없이
 * 표시한다. 정렬은 ViewBar의 경계 단위(sortDefinitions) 정의를 그대로 지원하므로
 * 병합 컬럼 헤더 자체는 정렬을 끈다.
 */
export function buildBuyerLedgerColumns({
  showRent,
  onOpenDetail,
  onContactLog,
  onEdit,
  isInlineFieldSaving,
  onInlineFieldSave,
}: BuyerLedgerColumnsOptions): ColumnDef<BuyerRequirementGroup, unknown>[] {
  const columns: ColumnDef<BuyerRequirementGroup, unknown>[] = [
    {
      id: "customer",
      accessorFn: (group) => group.primaryParticipant?.contact?.name ?? "",
      header: () => (
        <BuyerHeaderLabel
          icon={<UserRound className="size-3.5" />}
          label="구매 의뢰"
        />
      ),
      size: 190,
      minSize: 170,
      enableSorting: true,
      cell: ({ row }) => <BuyerGroupCustomerCell group={row.original} />,
    },
    {
      id: "actions",
      header: () => (
        <span className="text-[12px] font-normal text-muted-foreground">
          작업
        </span>
      ),
      size: 48,
      minSize: 48,
      maxSize: 48,
      enableResizing: false,
      enableSorting: false,
      meta: { cellClassName: "px-0" },
      cell: ({ row }) => {
        const name =
          row.original.primaryParticipant?.contact?.name ?? "구매 의뢰";
        return (
          <BuyerIntentLinesCell group={row.original}>
            {(requirement, index) => (
              <BuyerRequirementActionMenu
                label={`${name} 구함 ${index + 1}`}
                onOpen={() => onOpenDetail(requirement)}
                onContact={() => onContactLog(requirement)}
                onEdit={() => onEdit(requirement)}
              />
            )}
          </BuyerIntentLinesCell>
        );
      },
    },
    {
      id: "intentCount",
      accessorFn: (group) => group.requirements.length,
      header: () => (
        <BuyerHeaderLabel
          icon={<Tag className="size-3.5" />}
          label="희망조건"
        />
      ),
      size: 150,
      minSize: 132,
      enableSorting: true,
      meta: { cellClassName: "px-0 overflow-visible" },
      cell: ({ row, table }) => (
        <BuyerIntentLinesCell
          group={row.original}
          childRail
          mergedWidth={CONTEXT_COLUMN_IDS.reduce(
            (width, id) => width + (table.getColumn(id)?.getSize() ?? 0),
            0,
          )}
        >
          {(requirement, index) => (
            <>
              {index === 0 && (
                <BuyerLinesToggle
                  groupId={row.original.id}
                  hiddenCount={row.original.requirements.length - 1}
                />
              )}
              <BuyerIntentSummary requirement={requirement} index={index} />
            </>
          )}
        </BuyerIntentLinesCell>
      ),
    },
    {
      id: "budget",
      accessorFn: (group) =>
        group.requirements[0]
          ? buyerBudgetBoundaryValue(group.requirements[0], "min")
          : null,
      header: () => <BuyerHeaderLabel label="예산/보증금" />,
      size: 140,
      minSize: 120,
      enableSorting: false,
      meta: { cellClassName: "px-0" },
      cell: ({ row }) => (
        <BuyerIntentLinesCell group={row.original}>
          {(requirement) => <BuyerBudgetRangeCell requirement={requirement} />}
        </BuyerIntentLinesCell>
      ),
    },
  ];

  // 월세는 월세 요건에만 값이 있다 — 거래유형 필터가 월세를 포함하지 않으면
  // 컬럼 자체를 렌더링하지 않아 대부분 빈 칸이 되는 것을 막는다.
  if (showRent) {
    columns.push({
      id: "monthlyRent",
      accessorFn: (group) => group.requirements[0]?.monthlyRentMin ?? null,
      header: () => <BuyerHeaderLabel label="월세" />,
      size: 116,
      minSize: 104,
      enableSorting: false,
      meta: { cellClassName: "px-0" },
      cell: ({ row }) => (
        <BuyerIntentLinesCell group={row.original}>
          {(requirement) => (
            <BuyerMonthlyRentRangeCell requirement={requirement} />
          )}
        </BuyerIntentLinesCell>
      ),
    });
  }

  columns.push(
    {
      id: "area",
      accessorFn: (group) => group.requirements[0]?.areaMin ?? null,
      header: () => <BuyerHeaderLabel label="평형" />,
      size: 122,
      minSize: 108,
      enableSorting: false,
      meta: { cellClassName: "px-0" },
      cell: ({ row }) => (
        <BuyerIntentLinesCell group={row.original}>
          {(requirement) => <BuyerAreaRangeCell requirement={requirement} />}
        </BuyerIntentLinesCell>
      ),
    },
    {
      id: "matches",
      accessorFn: (group) =>
        group.requirements.reduce(
          (total, requirement) => total + (requirement._count?.matches ?? 0),
          0,
        ),
      header: () => (
        <BuyerHeaderLabel
          icon={<GitBranch className="size-3.5" />}
          label="매칭상태"
        />
      ),
      size: 92,
      minSize: 84,
      enableSorting: true,
      meta: { cellClassName: "px-0" },
      cell: ({ row }) => (
        <BuyerIntentLinesCell group={row.original}>
          {(requirement) => <BuyerMatchCell requirement={requirement} />}
        </BuyerIntentLinesCell>
      ),
    },
    {
      id: "status",
      accessorFn: (group) => group.requirements[0]?.status ?? "",
      header: () => (
        <BuyerHeaderLabel
          icon={<CircleDot className="size-3.5" />}
          label="요건상태"
        />
      ),
      size: 92,
      enableSorting: false,
      meta: { cellClassName: "z-[2] overflow-visible px-0" },
      cell: ({ row }) => (
        <BuyerIntentLinesCell group={row.original}>
          {(requirement) => (
            <BuyerInlineSelectCell
              requirement={requirement}
              field="status"
              isSaving={isInlineFieldSaving(requirement.id, "status")}
              onSave={(value) =>
                onInlineFieldSave(requirement, "status", value)
              }
            />
          )}
        </BuyerIntentLinesCell>
      ),
    },
    {
      id: "urgency",
      accessorFn: (group) => group.requirements[0]?.urgency ?? "",
      header: () => (
        <BuyerHeaderLabel
          icon={<BadgeAlert className="size-3.5" />}
          label="긴급도"
        />
      ),
      size: 74,
      enableSorting: true,
      meta: { cellClassName: "z-[2] overflow-visible px-0" },
      cell: ({ row }) => (
        <BuyerIntentLinesCell group={row.original}>
          {(requirement) => (
            <BuyerInlineSelectCell
              requirement={requirement}
              field="urgency"
              isSaving={isInlineFieldSaving(requirement.id, "urgency")}
              onSave={(value) =>
                onInlineFieldSave(requirement, "urgency", value)
              }
            />
          )}
        </BuyerIntentLinesCell>
      ),
    },
    {
      id: "assignedTo",
      accessorFn: (group) => group.requirements[0]?.assignedTo?.name ?? "",
      header: () => (
        <BuyerHeaderLabel
          icon={<UserRound className="size-3.5" />}
          label="담당"
        />
      ),
      size: 76,
      enableSorting: false,
      meta: { cellClassName: "px-0" },
      cell: ({ row }) => (
        <BuyerIntentLinesCell group={row.original}>
          {(requirement) => (
            <span className="truncate text-[12px] text-slate-600">
              {requirement.assignedTo?.name ?? "—"}
            </span>
          )}
        </BuyerIntentLinesCell>
      ),
    },
    {
      id: "lastContactDate",
      accessorFn: (group) => group.requirements[0]?.lastContactDate ?? "",
      header: () => (
        <BuyerHeaderLabel
          icon={<CalendarDays className="size-3.5" />}
          label="최근 연락"
        />
      ),
      size: 92,
      enableSorting: false,
      meta: { cellClassName: "px-0" },
      cell: ({ row }) => (
        <BuyerIntentLinesCell group={row.original}>
          {(requirement) =>
            requirement.lastContactDate ? (
              <span className="text-[12px] tabular-nums text-slate-600">
                <DateCell value={requirement.lastContactDate} relative />
              </span>
            ) : (
              <span className="text-[12px] text-muted-foreground">—</span>
            )
          }
        </BuyerIntentLinesCell>
      ),
    },
  );

  return columns;
}
