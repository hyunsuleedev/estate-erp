import type { ReactNode } from "react";
import { FolderKanban } from "lucide-react";
import { nb } from "../properties/-detail/ui";

/**
 * 프로젝트 문서의 뼈대(위 얇은 줄 · 칸 · 글자). 상세(`$id.tsx`)가 쓰고, 프로젝트 문서를 그리는 다른 화면이
 * 생기면 같이 쓴다.
 */

/** 위 얇은 줄 (Notion 문서의 위 줄): 왼쪽은 어디인지(프로젝트 / 이 문서), 오른쪽은 자주 쓰는 작업. */
export function ProjectDocHeader({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children?: ReactNode;
}) {
  return (
    <header
      data-project-detail-header
      className="flex h-[46px] shrink-0 items-center gap-2 border-b border-[#e9e9e7] bg-white pl-4 pr-5"
    >
      <nav aria-label="위치" className="flex min-w-0 flex-1 items-center gap-0.5 text-[14px]">
        <button type="button" className={nb.ghost} onClick={onBack}>
          <FolderKanban />
          프로젝트
        </button>
        <span className="text-[#37352f]/25">/</span>
        <span className="min-w-0 truncate px-2 text-[#37352f]" title={title}>
          {title}
        </span>
      </nav>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </header>
  );
}

/** 화면 전체 틀 */
export const PROJECT_DOC_ROOT_CLASS =
  "-m-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-[#37352f]";
/** 본문이 굴러가는 칸 */
export const PROJECT_DOC_SCROLLER_CLASS = "relative flex min-w-0 flex-1 flex-col overflow-y-auto";
/**
 * 본문 묶음의 폭과 좌우 여백. 머리 · 탭 패널 · 불러오는 중 뼈대가 모두 이것을 쓴다(왼쪽 선이 맞게).
 * 작업 공간이라 폭을 채워 쓴다(사용자 지적 2026-11-23: 900px에 묶으면 넓은 창에서 양옆이 비었다).
 */
export const PROJECT_DOC_WIDTH_CLASS = "mx-auto w-full max-w-[1280px] px-6";
/** 가운데 글 줄 */
export const PROJECT_DOC_COLUMN_CLASS = "mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-6 pb-6 pt-2";
/** 오른쪽 열 */
export const PROJECT_DOC_RAIL_CLASS =
  "w-[344px] shrink-0 overflow-y-auto overflow-x-hidden border-l border-[#e9e9e7] bg-white";

/** 큰 제목 */
export const PROJECT_DOC_TITLE_CLASS =
  "-mx-1.5 mt-5 w-[calc(100%+12px)] rounded px-1.5 text-[32px] font-bold leading-[1.25] tracking-[-0.028em] text-[#37352f] placeholder:text-[#37352f]/35";
/** 메모 (속성 아래 선 다음의 첫 글) */
export const PROJECT_DOC_MEMO_CLASS =
  "-mx-1.5 w-[calc(100%+12px)] rounded px-1.5 py-1 text-[15px] leading-[1.65] text-[#37352f] placeholder:text-[#37352f]/45";
export const PROJECT_DOC_MEMO_PLACEHOLDER = "메모 — 이 프로젝트가 어떤 일인지 한두 줄 적어 두세요";
