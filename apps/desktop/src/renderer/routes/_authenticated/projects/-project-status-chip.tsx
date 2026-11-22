import { cn } from "@/lib/utils";
import { ledgerChipClassName } from "../customers-table/-ledger-chips";
import {
  PROJECT_STATUS_HINTS,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from "./-project-model";

// 고객 원장 · 매물관리 표의 상태 꼬리표와 같은 색 묶음이다.
const STATUS_TONE: Record<ProjectStatus, string> = {
  preparing: "bg-[#f1f1ef] text-[#5f5e5b] [&>[data-dot]]:bg-[#9b9a97]",
  active: "bg-[#eef3ed] text-[#44745a] [&>[data-dot]]:bg-[#44745a]",
  wrapping: "bg-[#fbf3db] text-[#8f6b1f] [&>[data-dot]]:bg-[#b98a1d]",
  archived: "bg-[#f1f1ef] text-[#79766f] [&>[data-dot]]:bg-[#b9b6b0]",
};

/** 표와 상세 패널이 함께 쓰는 프로젝트 상태 꼬리표. 앞에 점을 둔다. */
export function ProjectStatusChip({ status }: { status: ProjectStatus }) {
  return (
    <span
      data-project-status={status}
      title={PROJECT_STATUS_HINTS[status]}
      className={cn(ledgerChipClassName, "gap-1", STATUS_TONE[status])}
    >
      <span data-dot aria-hidden="true" className="size-1.5 rounded-full" />
      {PROJECT_STATUS_LABELS[status]}
    </span>
  );
}
