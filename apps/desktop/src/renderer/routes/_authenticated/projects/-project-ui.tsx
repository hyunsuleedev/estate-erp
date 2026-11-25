import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * 프로젝트 상세(작업 공간)의 겉모양 부품. 사용자가 시안(docs/mockups/project-workspace "1+2 통합안")의 생김새를
 * 가져오라고 했다(2026-11-23: "지금 UI는 너무 심심하다"). 시안의 색은 앱의 대응 색(app.css 토큰 · 꼬리표 색)으로 옮겼다:
 * 파랑 → info, 초록 → success, 주황(호박) → warning · orange, 회색 → muted · secondary. 선은 앱의 선 색(#e9e9e7).
 *
 * 본문 바탕은 옅은 회색(muted), 구역은 흰 상자 + 가는 테 + 둥근 모서리. 상자 안의 상자는
 * "차례 상자 → 단계 카드"까지만 둔다. 카드 안의 속성은 테 · 바탕 없이 놓는다(Notion 카드, 사용자 지적 2026-11-23).
 */

/*
 * 테는 border 대신 ring(box-shadow)으로 긋는다. app.css가 모든 요소의 border-color를 레이어 밖에서 정해
 * border-* 색 유틸리티가 먹지 않기 때문이다(앱의 다른 화면도 테 색은 shadow로 준다).
 */

/** 구역 상자의 테와 바탕(Notion 카드와 같은 머리카락 테 + 옅은 그림자, 모서리만 10px) */
export const BOX_CLASS =
  "rounded-[10px] bg-white shadow-[0_0_0_1px_rgba(55,53,47,0.09),0_2px_4px_rgba(15,15,15,0.03)]";

/** 머리 있는 구역 상자: 아이콘 + 제목 + 요약 알약 · 곁들임 … 오른쪽 동작 */
export function SectionBox({
  icon,
  title,
  badge,
  note,
  hint,
  action,
  children,
  className,
  ...rest
}: {
  icon?: ReactNode;
  title: ReactNode;
  /** 제목 옆의 요약 알약("1/4 끝남 · 매물 의뢰 1") */
  badge?: ReactNode;
  /** 요약 알약 바로 옆의 작은 회색 글("끌어서 순서를 바꿉니다") */
  note?: ReactNode;
  /** 오른쪽의 흐린 안내("누르면 바로 고칩니다") */
  hint?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <section className={cn(BOX_CLASS, "px-4 pb-4 pt-3", className)} {...rest}>
      <div className="mb-2.5 flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold leading-[1.35] text-[#37352f] [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-[#37352f]/55">
          {icon}
          <span className="min-w-0 truncate">{title}</span>
        </h2>
        {badge && <SummaryPill>{badge}</SummaryPill>}
        {note && <span className="text-[12.5px] text-[#37352f]/45">{note}</span>}
        <span className="flex-1" />
        {hint && <span className="text-[12.5px] text-[#37352f]/45">{hint}</span>}
        {action && <div className="flex shrink-0 flex-wrap items-center gap-1">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** 회색 요약 알약 */
export function SummaryPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-full bg-secondary px-2 text-[12.5px] font-medium tabular-nums text-[#37352f]/75",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * 카드의 속성 한 칸(Notion 갤러리 카드의 속성처럼): 테도 바탕도 없이 작은 회색 이름표 위, 값 아래.
 * 누를 수 있으면(onClick — 다른 탭으로 데려간다) 값을 파랑 글자 + 작은 화살표로 쓰고, 올리면 바탕만 살짝 어두워진다.
 * (사용자 지적 2026-11-23: 테 있는 회색 타일과 초록 타일은 상자 안 상자라 무겁다.)
 */
export function CardProp({
  label,
  children,
  onClick,
  title,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const body = (
    <>
      <span className="text-[12px] leading-[17px] text-[#37352f]/50">{label}</span>
      <span
        className={cn(
          "min-w-0 break-keep text-[14px] leading-[21px]",
          onClick ? "text-info" : "text-[#37352f]",
        )}
      >
        {children}
      </span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="-mx-1.5 -my-1 flex min-w-0 flex-col gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[rgba(55,53,47,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40"
    >
      {body}
    </button>
  ) : (
    <div className="flex min-w-0 flex-col gap-0.5" title={title}>
      {body}
    </div>
  );
}

/** 카드 속성의 격자. 칸 사이는 간격으로만 나눈다. 넓으면(카드 폭 560px 이상) 칸 수대로 한 줄, 좁으면 2칸. */
const PROP_COLUMNS: Record<number, string> = {
  1: "@min-[560px]:grid-cols-1",
  2: "@min-[560px]:grid-cols-2",
  3: "@min-[560px]:grid-cols-3",
  4: "@min-[560px]:grid-cols-4",
};
export function CardPropGrid({ count, children }: { count: number; children: ReactNode }) {
  return (
    <div className="@container">
      <div className={cn("grid grid-cols-2 gap-x-6 gap-y-3", PROP_COLUMNS[Math.min(4, Math.max(1, count))])}>
        {children}
      </div>
    </div>
  );
}

/** 사람 알약: 이름(굵게) · 역할(회색) · 전화(파랑) */
export const PERSON_PILL_CLASS =
  "inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full bg-secondary pl-2.5 pr-1 text-[13.5px]";

/**
 * Notion 카드: 흰 바탕, 머리카락 굵기 테와 아주 옅은 그림자 한 겹(둘 다 box-shadow), 모서리 8px.
 * 단계 카드 · 업무 · 상담/코멘트가 함께 쓴다. 색은 카드가 아니라 태그 · 아이콘 · 글자에만 둔다.
 */
export const CARD_CLASS =
  "rounded-lg bg-white shadow-[0_0_0_1px_rgba(55,53,47,0.09),0_2px_4px_rgba(15,15,15,0.03)]";
