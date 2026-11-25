import type { ProjectListItem } from "@estate-erp/api-client";
import { formatRelativeDay } from "@/lib/format";
import { ContactNameBadge, RowOpenButton } from "@/components/domain";
import { EditableCell, type ChipOption } from "@/components/data-table";
import { useProjectUpdate } from "./-project-hooks";
import { PROJECT_INSPECTOR_ID, PrimaryContactField } from "./-project-inspector";
import { getProjectRowLabel, getProjectStatus, UNTITLED_PROJECT } from "./-project-model";
import { ProjectStatusChip, projectStatusChipOption } from "./-project-status-chip";

/*
 * 프로젝트 목록 표의 칸. 매물관리 표의 칸과 같은 부품 · 같은 규격(14px/450 · 줄 높이 21px · 칸 안 여백 10px)이다.
 * - 빈 값은 매물관리처럼 흐린 "-"
 * - 프로젝트 이름은 이 표의 주 칸이라 매물관리 '단지' 칸처럼 굵기 500에 열기 단추를 단다
 * - 두 조각 칸(최근 코멘트)은 매물관리 가격 칸처럼 본문 글은 본문 색, 곁의 정보는 흐리게
 * 칸에서 바로 고치는 것(이름 · 대표 고객 · 담당)은 매물관리 칸 편집과 같은 부품(EditableCell)이고,
 * 저장은 상세 · 옆 패널과 같은 useProjectUpdate(보낸 순서대로 · 고친 칸만 덮기 · 실패하면 되돌림)를 탄다.
 * 의뢰 · 최근 코멘트는 계산한 값이라 읽기만 한다. 상태도 계산한 값이지만, 칸에서 끝내기 · 다시 열기는 할 수 있다(ProjectStatusCell).
 */

/** 매물관리 표의 빈 값(의뢰 메모 칸 등)과 같은 흐린 "-" */
export function EmptyCellValue({ label }: { label?: string }) {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden="true">-</span>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

/** 매물관리 광고 칸과 같은 편집 칸 모양 */
const editableCellClassName =
  "min-h-9 rounded-none px-2.5 text-[14px] font-[450] leading-[21px] focus-visible:ring-inset focus-visible:ring-offset-0";

/** 고객 칸: 이름 배지(대표 고객, 없으면 담긴 의뢰의 손님) · 외 N명. 칸을 누르면 대표 고객을 고른다. */
export function ProjectCustomerCell({ project }: { project: ProjectListItem }) {
  const update = useProjectUpdate(project.id);
  return (
    <span
      className="-mx-2.5 flex h-full min-w-0 flex-1 items-stretch"
      // 칸을 누르면 고르기가 열린다. 줄을 두 번 눌러 여는 옆 패널과 겹치지 않게 여기서 멈춘다.
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <PrimaryContactField
        value={project.primaryContact}
        onChange={(contactId) => update.mutate({ primaryContactId: contactId })}
        triggerClassName="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2.5 text-left text-[14px] leading-[21px] text-foreground outline-none hover:bg-[rgba(55,53,47,0.04)] focus-visible:shadow-[inset_0_0_0_2px_#2383e2]"
        trigger={
          project.customerName ? (
            <>
              <ContactNameBadge name={project.customerName} />
              {project.peopleCount > 1 && (
                <span className="shrink-0 text-[12px] text-muted-foreground">
                  외 {project.peopleCount - 1}명
                </span>
              )}
            </>
          ) : (
            <EmptyCellValue label="대표 고객 비어 있음" />
          )
        }
      />
    </span>
  );
}

/**
 * 프로젝트 이름 칸(주 칸): 누르면 그 자리에서 고친다. 이름이 없으면 흐리게 "제목 없음".
 * 매물관리 '단지' 칸처럼 줄에 올리면 오른쪽 끝에 "열기"(옆 패널)가 뜬다.
 */
export function ProjectTitleCell({
  project,
  current,
  onToggleOpen,
}: {
  project: ProjectListItem;
  current: boolean;
  onToggleOpen: () => void;
}) {
  const update = useProjectUpdate(project.id);
  const title = project.title?.trim() ?? "";
  const label = getProjectRowLabel(project);
  return (
    <div className="-mx-2.5 relative h-full w-[calc(100%+20px)]" onDoubleClick={(event) => event.stopPropagation()}>
      <EditableCell
        recordId={project.id}
        field="title"
        value={title}
        onSave={async (_id, _field, value) => {
          const next = String(value ?? "").trim();
          if (next === title) return;
          await update.mutateAsync({ title: next || null });
        }}
        editType="text"
        commitOnBlur
        activation="click"
        portalAnchor="tableCell"
        editorChrome="floating"
        portalContainer="body"
        hoverHighlight={false}
        ariaLabel={`${label} 프로젝트 이름`}
        className={editableCellClassName}
      >
        <span className="flex h-full w-full min-w-0 items-center" title={title || undefined}>
          {title ? (
            <span className="truncate font-medium text-foreground">{title}</span>
          ) : (
            <span className="truncate text-muted-foreground">{UNTITLED_PROJECT}</span>
          )}
        </span>
      </EditableCell>
      <RowOpenButton
        label={label}
        current={current}
        controls={PROJECT_INSPECTOR_ID}
        onToggle={onToggleOpen}
      />
    </div>
  );
}

const NO_ASSIGNEE = "none";
const ASSIGNEE_OPTION_CLASS = "bg-transparent px-0 text-foreground";
const ASSIGNEE_OPTION_EMPTY_CLASS = "bg-transparent px-0 text-muted-foreground";

/** 담당 칸: 이름(본문 글자). 누르면 직원 목록(맨 위 "담당 없음")에서 고른다. */
export function ProjectAssigneeCell({
  project,
  options,
}: {
  project: ProjectListItem;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const update = useProjectUpdate(project.id);
  const value = project.assignedTo?.id ?? NO_ASSIGNEE;
  // 한 번 누르면 바로 목록이 뜬다(매물관리 매물상태 칸과 같은 고르기 부품). 이름은 칩 바탕 없이 본문 글자로.
  // 그만둔 직원이 담당이면 목록에 없으니 그 이름도 넣어 둔다(고르기 전 값이 사라지지 않게).
  const chipOptions: ChipOption[] = [
    { value: NO_ASSIGNEE, label: "담당 없음", className: ASSIGNEE_OPTION_EMPTY_CLASS },
    ...options.map((option) => ({ ...option, className: ASSIGNEE_OPTION_CLASS })),
    ...(project.assignedTo && !options.some((option) => option.value === project.assignedTo?.id)
      ? [{ value: project.assignedTo.id, label: project.assignedTo.name, className: ASSIGNEE_OPTION_CLASS }]
      : []),
  ];
  return (
    <div className="-mx-2.5 relative h-full w-[calc(100%+20px)]" onDoubleClick={(event) => event.stopPropagation()}>
      <EditableCell
        recordId={project.id}
        field="assignedToId"
        value={value}
        onSave={async (_id, _field, next) => {
          const id = String(next ?? NO_ASSIGNEE);
          if (id === value) return;
          await update.mutateAsync({ assignedToId: id === NO_ASSIGNEE ? null : id });
        }}
        editType="select-chip"
        chipOptions={chipOptions}
        activation="click"
        portalAnchor="tableCell"
        editorChrome="floating"
        portalContainer="body"
        hoverHighlight={false}
        ariaLabel={`${getProjectRowLabel(project)} 담당`}
        className={editableCellClassName}
      >
        <span className="flex h-full w-full min-w-0 items-center">
          {project.assignedTo ? (
            <span className="truncate text-foreground">{project.assignedTo.name}</span>
          ) : (
            <EmptyCellValue label="담당 없음" />
          )}
        </span>
      </EditableCell>
    </div>
  );
}

/**
 * 상태 칸: 매물관리 매물상태 칸처럼 한 번 누르면 고르는 목록이 뜬다(사용자 요청, 2026-11-22).
 *
 * 상태는 저장한 값이 아니라 끝냈는지와 단계 수에서 계산한다. 그래서 사람이 고를 수 있는 것은 둘뿐이다:
 * - 지금 상태(준비 · 진행 중 · 마무리 중 계산된 하나) — 끝낸 프로젝트에서 고르면 다시 연다
 * - 종료 — 고르면 끝낸다
 * 준비 · 진행 중 · 마무리 사이는 단계를 끝내면 저절로 바뀌므로 목록에 따로 두지 않는다
 * (고를 수 있게 하면 단계와 어긋난 상태가 저장된 것처럼 보인다).
 * 저장은 옆 패널 · 상세의 끝내기 · 다시 열기와 같은 길(useProjectUpdate)을 타서, 같은 알림이 뜬다.
 */
export function ProjectStatusCell({ project }: { project: ProjectListItem }) {
  const update = useProjectUpdate(project.id);
  const status = getProjectStatus(project);
  // 끝내지 않았다면 어떤 상태인지 (끝낸 프로젝트를 다시 열면 돌아갈 상태)
  const openStatus = getProjectStatus({ ...project, archivedAt: null });
  const chipOptions: ChipOption[] = [
    projectStatusChipOption(openStatus),
    projectStatusChipOption("archived"),
  ];
  return (
    <div className="-mx-2.5 relative h-full w-[calc(100%+20px)]" onDoubleClick={(event) => event.stopPropagation()}>
      <EditableCell
        recordId={project.id}
        field="status"
        value={status}
        onSave={async (_id, _field, next) => {
          const picked = String(next ?? status);
          if (picked === status) return;
          await update.mutateAsync({ archived: picked === "archived" });
        }}
        editType="select-chip"
        chipOptions={chipOptions}
        activation="click"
        portalAnchor="tableCell"
        editorChrome="floating"
        portalContainer="body"
        hoverHighlight={false}
        ariaLabel={`${getProjectRowLabel(project)} 상태`}
        className={editableCellClassName}
      >
        <span className="flex h-full w-full min-w-0 items-center">
          <ProjectStatusChip status={status} />
        </span>
      </EditableCell>
    </div>
  );
}

/**
 * 최근 코멘트 칸: 매물관리 가격 칸처럼 내용을 본문 색으로 먼저, 곁에 흐리게 "박실장 · 어제"(공용 날짜 표기).
 * 내용이 길면 내용만 줄이고 쓴 사람 · 날은 남긴다.
 */
export function ProjectLatestCommentCell({ project }: { project: ProjectListItem }) {
  const comment = project.latestComment;
  if (!comment) return <EmptyCellValue label="코멘트 없음" />;
  const day = formatRelativeDay(comment.createdAt, undefined, { withWeekday: false });
  const body = comment.body.replace(/\s+/g, " ").trim();
  const meta = comment.authorName ? `${comment.authorName} · ${day}` : day;
  return (
    <span
      title={`${body} — ${meta}`}
      className="flex w-full min-w-0 items-baseline gap-1.5 leading-[21px]"
    >
      <span className="min-w-0 truncate text-foreground">{body}</span>
      <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{meta}</span>
    </span>
  );
}

/** 날짜 칸(시작 · 최근 고침): "오늘 · 어제 · 11.19" (공용 날짜 표기, 좁은 칸이라 요일은 뺀다) */
export function ProjectDayCell({ value }: { value: string }) {
  return (
    <span className="truncate tabular-nums text-foreground">
      {formatRelativeDay(value, undefined, { withWeekday: false })}
    </span>
  );
}
