import { House, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { useTabStore } from "@/features/tabs/store/useTabStore";
import { nb } from "../properties/-detail/ui";

/**
 * 프로젝트에서 새 의뢰를 등록하러 가는 단추 둘: 새 매물 의뢰 등록 · 새 희망매물 만들기.
 *
 * 프로젝트에는 이미 있는 의뢰만 담을 수 있어, 처음 받은 의뢰는 매물 등록 · 희망매물 화면에서 만들어야 한다.
 * 그 화면을 대표 고객이 채워진 채 새 탭으로 연다. 만든 의뢰는 프로젝트에 알아서 담지 않는다(서버가 알아서
 * 묶지 않는다는 규칙) — 돌아와 진행 계획 창을 열면 담을 후보 맨 위에 "방금 등록"으로 보이고, 사람이 담는다.
 *
 * - 매물 등록: `/properties/new?ownerContactId=&from=project&projectId=` (소유자 칸을 대표 고객으로 미리 채우고,
 *   저장 · 취소 뒤 이 프로젝트로 돌아온다 — 매물 담당이 받는다)
 * - 희망매물: `/buyer-requirements/new?contactId=&from=project&projectId=` (취소하면 이 프로젝트로 돌아온다)
 */
export function ProjectNewIntakeButtons({
  projectId,
  primaryContactId,
  onOpen,
  className,
  variant = "ghost",
}: {
  projectId: string;
  primaryContactId: string | null;
  /** 새 탭을 연 뒤(진행 계획 창을 닫는 데 쓴다) */
  onOpen?: () => void;
  className?: string;
  variant?: "ghost" | "line";
}) {
  const createTab = useTabStore((state) => state.createTab);
  const open = (path: string, params: Record<string, string | null>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    const query = search.toString();
    const meta = getRouteMeta(path);
    createTab({ route: query ? `${path}?${query}` : path, kind: meta.kind, title: meta.title });
    onOpen?.();
  };
  const buttonClassName = variant === "line" ? nb.line : nb.ghost;

  return (
    <span data-project-new-intake className={cn("flex flex-wrap items-center gap-1", className)}>
      <button
        type="button"
        className={buttonClassName}
        title="매물 등록 화면을 새 탭으로 엽니다. 등록한 뒤 돌아와 진행 계획에서 담습니다."
        onClick={() =>
          open("/properties/new", { ownerContactId: primaryContactId, from: "project", projectId })
        }
      >
        <House />
        새 매물 의뢰 등록
      </button>
      <button
        type="button"
        className={buttonClassName}
        title="희망매물 만들기 화면을 새 탭으로 엽니다. 만든 뒤 돌아와 진행 계획에서 담습니다."
        onClick={() =>
          open("/buyer-requirements/new", {
            contactId: primaryContactId,
            from: "project",
            projectId,
          })
        }
      >
        <Target />
        새 희망매물 만들기
      </button>
    </span>
  );
}
