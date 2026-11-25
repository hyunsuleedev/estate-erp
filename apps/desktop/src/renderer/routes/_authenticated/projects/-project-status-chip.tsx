import { cn } from "@/lib/utils";
import {
  PROJECT_STATUS_HINTS,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from "./-project-model";

/*
 * 프로젝트 상태 알약과 의뢰 꼬리표. 매물관리 표의 부품과 같은 모양 · 같은 색이다(사용자 요청, 2026-11-22).
 * - 상태 알약 = 매물관리 표 매물상태 칸의 알약(properties/index.tsx의 StatusIndicator · listingAvailabilityMeta)
 * - 의뢰 꼬리표 = 매물관리 표 거래 칸의 칩(TransactionStack 안의 TransactionBadge · transactionTypeMeta)
 * 두 부품은 그 화면 파일 안에만 있고 내보내지 않아서 클래스와 색을 그대로 옮겨 왔다. 저쪽을 바꾸면 여기도 바꾼다.
 */

/** 매물관리 StatusIndicator와 같은 알약: 높이 20 · 완전히 둥근 끝 · 14px/450 · 앞에 8px 점 */
const STATUS_PILL_CLASS =
  "inline-flex h-5 max-w-full shrink-0 items-center gap-[5px] rounded-full pl-[7px] pr-[9px] text-[14px] font-[450] leading-5";

const STATUS_TONE: Record<ProjectStatus, { pill: string; dot: string }> = {
  // 진행 중 = 매물의 '활성'
  active: { pill: "bg-[#eef3ed] text-[#44745a]", dot: "bg-[#6c9b7a]" },
  // 마무리 = 매물의 '거래 중'
  wrapping: { pill: "bg-[#e7f3f8] text-[#337ea9]", dot: "bg-[#529cca]" },
  // 준비 = 매물 알약의 기본 회색(아직 적은 단계가 없다)
  preparing: { pill: "bg-[#f1f1ef] text-[#5f5e5b]", dot: "bg-[#b4b4b1]" },
  // 종료 = 매물의 '종료'
  archived: { pill: "bg-[#f1f1ef] text-[#787774]", dot: "bg-[#b4b4b1]" },
};

/**
 * 표의 상태 칸에서 여는 고르는 목록의 한 줄. 칸의 알약과 같은 색 · 같은 점이다
 * (매물관리 매물상태 칸의 listingAvailabilityChipOptions와 같은 방식).
 */
export function projectStatusChipOption(status: ProjectStatus) {
  const tone = STATUS_TONE[status];
  return {
    value: status,
    label: PROJECT_STATUS_LABELS[status],
    className: `${tone.pill} rounded-full pl-[7px] pr-[9px]`,
    dotClassName: tone.dot,
  };
}

/** 표 · 옆 패널 · 상세 · 연락처 상세가 함께 쓰는 프로젝트 상태 알약. */
export function ProjectStatusChip({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  const tone = STATUS_TONE[status];
  return (
    <span
      data-project-status={status}
      title={PROJECT_STATUS_HINTS[status]}
      className={cn(STATUS_PILL_CLASS, tone.pill, className)}
    >
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", tone.dot)} />
      <span className="truncate">{PROJECT_STATUS_LABELS[status]}</span>
    </span>
  );
}

/** 매물관리 거래 칸의 칩(TransactionBadge + 표 칸 크기): 높이 20 · 모서리 4 · 테두리 없음 · 14px/450 */
const INTAKE_TAG_CLASS =
  "inline-flex h-5 max-w-full shrink-0 items-center whitespace-nowrap rounded-[4px] px-1.5 py-0 text-[14px] font-[450] leading-5";

// 매물관리 거래 칩 팔레트 안에서 고른 두 색. 초록 · 파랑은 바로 옆 상태 알약(진행 중 · 마무리)이 쓰므로 피했다.
const INTAKE_TONE: Record<"listing" | "buyer", string> = {
  // 매물관리의 '월세' 칩 색
  listing: "bg-[#fbf3db] text-[#8f6b1f]",
  // 매물관리의 '매매' 칩 색
  buyer: "bg-[#fdebec] text-[#8f4b46]",
};

/**
 * 프로젝트에 담긴 의뢰의 종류 꼬리표: "매물 의뢰" · "구매 의뢰". 진행 계획 창 · 단계 이름과 같은 말을 쓴다
 * (고객 원장의 "내놓음 · 구함"은 쓰지 않는다). 둘 이상이면 개수를 칩 안에 붙인다("매물 의뢰 2").
 */
export function ProjectIntakeTag({ kind, count }: { kind: "listing" | "buyer"; count?: number }) {
  return (
    <span data-project-intake-tag={kind} className={cn(INTAKE_TAG_CLASS, INTAKE_TONE[kind])}>
      {kind === "buyer" ? "구매 의뢰" : "매물 의뢰"}
      {count !== undefined && count > 1 ? ` ${count}` : ""}
    </span>
  );
}
