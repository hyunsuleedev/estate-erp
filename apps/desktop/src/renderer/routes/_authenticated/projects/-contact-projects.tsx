import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Contact } from "@estate-erp/api-client";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RailSection } from "../properties/-detail/rail";
import { H2, nb } from "../properties/-detail/ui";
import { useOpenNewProject, useProjectChangesFromOtherTabs } from "./-project-hooks";
import { getProjectProgress, getProjectStatus, getProjectTitle } from "./-project-model";
import { ProjectStatusChip } from "./-project-status-chip";

/** 연락처 화면에 보여 주는 프로젝트 수. 한 손님의 프로젝트는 대개 한둘이다. */
const CONTACT_PROJECTS_LIMIT = 20;

/**
 * 연락처 상세의 "프로젝트" 구역. 본문 맨 앞(메모 바로 아래)에 둔다 — 이 손님의 일이 무엇으로 묶여 있는지가
 * 먼저 보여야 한다(사용자 결정 2026-11-24). 예전처럼 오른쪽 열에 둘 때는 placement="rail".
 *
 * 이 손님이 대표 고객이거나, 담긴 의뢰의 당사자(구매 의뢰 · 매물 의뢰 집의 소유자)인 프로젝트를 끝낸 것까지
 * 보여 주고, 누르면 그 프로젝트로 간다. "프로젝트 열기"는 누르는 순간 이 고객을 대표 고객으로 한 프로젝트를
 * 만들어 새 탭으로 연다(서버가 알아서 만들지 않는다 — 사용자가 누를 때만).
 *
 * 쓰는 곳: contacts/$id.tsx의 본문에 `<ContactProjectsSection contact={contact} />`.
 */
export function ContactProjectsSection({
  contact,
  placement = "body",
}: {
  contact: Contact;
  placement?: "body" | "rail";
}) {
  const inBody = placement === "body";
  // 다른 탭(프로젝트 목록 · 상세)에서 고치거나 풀면 다시 읽는다.
  useProjectChangesFromOtherTabs();
  const filter = { contactId: contact.id, status: "all" as const, limit: CONTACT_PROJECTS_LIMIT };
  // 이름표가 ["projects", "list", …]로 시작해 프로젝트를 고칠 때마다 함께 새로 고쳐진다.
  const projectsQuery = useQuery({
    queryKey: ["projects", "list", filter],
    queryFn: () => api.projects.findAll(filter),
  });
  const items = projectsQuery.data?.items ?? [];
  const total = projectsQuery.data?.total ?? 0;
  // 진행 중인 것이 위, 끝낸 것은 아래로.
  const sorted = useMemo(
    () =>
      [...items].sort(
        (left, right) => Number(Boolean(left.archivedAt)) - Number(Boolean(right.archivedAt)),
      ),
    [items],
  );

  // 프로젝트 열기: 이 고객을 대표 고객으로 넣어 프로젝트를 만들고 그 문서를 새 탭으로 연다.
  const newProject = useOpenNewProject();
  const openNewProject = () => newProject.open({ primaryContactId: contact.id });

  const openButton = (
    <button
      type="button"
      className={inBody ? nb.ghost : cn(nb.ghost, "h-6 px-1.5 text-[12.5px]")}
      onClick={openNewProject}
    >
      <Plus />
      프로젝트 열기
    </button>
  );

  const body = (
      <div data-contact-projects data-placement={placement}>
        {projectsQuery.isPending ? (
          <p className="py-1 text-[12.5px] text-[#37352f]/45">불러오는 중</p>
        ) : projectsQuery.isError ? (
          <p className="py-1 text-[12.5px] text-[rgb(203,107,31)]">
            프로젝트를 불러오지 못했습니다.{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-[#37352f]"
              onClick={() => void projectsQuery.refetch()}
            >
              다시 시도
            </button>
          </p>
        ) : sorted.length === 0 ? (
          <p
            className={cn(
              "break-keep text-[#37352f]/65",
              inBody
                ? "text-[13px] leading-[1.6]"
                : "rounded bg-[rgb(247,246,243)] px-2.5 py-2 text-[12.5px] leading-5",
            )}
          >
            이 손님의 프로젝트가 없습니다. 집을 팔고 새로 사는 갈아타기처럼 의뢰가 여럿 물려 있거나
            오래 챙길 손님이면 프로젝트를 여세요.
          </p>
        ) : (
          <ul>
            {sorted.map((project) => {
              const progress = getProjectProgress(project);
              return (
                <li
                  key={project.id}
                  className={cn(
                    "[&+&]:border-t [&+&]:border-[#37352f]/[0.06]",
                    inBody ? "py-2" : "py-1.5",
                  )}
                >
                  <Link
                    to="/projects/$id"
                    params={{ id: project.id }}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded text-[#37352f] hover:underline",
                      inBody ? "text-[15px]" : "text-[13.5px]",
                    )}
                  >
                    <span className={cn("min-w-0 flex-1 truncate", inBody ? "font-semibold" : "font-medium")}>
                      {getProjectTitle(project)}
                    </span>
                    <ProjectStatusChip status={getProjectStatus(project)} />
                  </Link>
                  {progress.kind !== "none" && (
                    <p
                      className={cn(
                        "mt-0.5 truncate",
                        inBody ? "text-[13px] text-[#37352f]/65" : "text-[12.5px] text-[#37352f]/55",
                      )}
                    >
                      {progress.kind === "done"
                        ? `${progress.total}/${progress.total} 모든 단계가 끝났습니다`
                        : `${progress.done}/${progress.total} 다음 · ${progress.next ?? ""}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
  );

  if (inBody) {
    return (
      <section data-contact-projects-section id="projects">
        <H2 title="프로젝트" count={total} action={openButton} />
        {body}
      </section>
    );
  }

  return (
    <RailSection title="프로젝트" count={total} action={openButton}>
      {body}
    </RailSection>
  );
}
