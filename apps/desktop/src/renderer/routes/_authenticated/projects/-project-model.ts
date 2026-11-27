import {
  formatPlaceLabel,
  MATCH_CLOSED_REASON_LABELS,
  MatchStage,
  normalizeMatchStage,
} from "@estate-erp/shared";
import type {
  Comment,
  CommentList,
  ProjectList,
  ProjectListItem,
  ProjectListStatus,
  ProjectPerson,
  ProjectPlan,
  ProjectStep,
  ProjectStepDeal,
  UpdateProjectDto,
} from "@estate-erp/api-client";

/** 목록의 보기 탭: 활성 / 종료(사용자 결정, 2026-11-22). 끝냈는지는 사용자가 직접 정한다(archivedAt). */
export const PROJECT_STATUS_OPTIONS: ReadonlyArray<{
  value: Exclude<ProjectListStatus, "all">;
  label: string;
}> = [
  { value: "open", label: "활성" },
  { value: "archived", label: "종료" },
];

export const PROJECT_PERSON_ROLE_LABELS: Record<ProjectPerson["role"], string> = {
  primary: "대표 고객",
  buyer: "구매 의뢰",
  owner: "소유자",
};

type TitleSource = Pick<ProjectListItem, "title" | "customerName" | "firstStepTitle">;

/** 이름도 손님도 없는 프로젝트를 어디서나(목록 · 탭 제목 · 연락처 구역 …) 부르는 말. Notion의 빈 페이지와 같다. */
export const UNTITLED_PROJECT = "제목 없음";

/**
 * 프로젝트를 부르는 이름. 이름을 정했으면 그 이름, 아니면 손님 이름으로("김민준님 프로젝트"),
 * 손님도 없으면 "제목 없음"(빈 작업 공간으로 연 프로젝트). 모든 화면이 이 함수 하나로 부른다.
 */
export function getProjectTitle(project: TitleSource) {
  const title = project.title?.trim();
  if (title) return title;
  if (project.customerName) return `${project.customerName}님 프로젝트`;
  return UNTITLED_PROJECT;
}

/** 표에서 줄을 부르는 이름(읽어 주는 이름, 아래 상태 줄): 손님이 먼저, 이름을 정했으면 뒤에 붙인다. */
export function getProjectRowLabel(
  project: Pick<ProjectListItem, "title" | "customerName" | "firstStepTitle">,
) {
  const title = project.title?.trim();
  if (project.customerName) {
    return title ? `${project.customerName} · ${title}` : project.customerName;
  }
  return getProjectTitle(project);
}

/** 고른 프로젝트들의 대표 고객 전화번호. 같은 번호는 한 번만. */
export function collectProjectPhones(
  projects: ReadonlyArray<Pick<ProjectListItem, "primaryContact">>,
) {
  return [
    ...new Set(
      projects.flatMap((project) =>
        project.primaryContact?.phone ? [project.primaryContact.phone] : [],
      ),
    ),
  ];
}

/**
 * 프로젝트의 상태. 저장하는 값이 아니라 볼 때마다 계산한다: 끝냈는지(사용자가 정함)와
 * 진행 계획의 단계가 몇 개 끝났는지(의뢰·거래에서 읽음)에서 나온다.
 *
 * - preparing 준비: 아직 담은 의뢰나 정한 단계가 없다
 * - active 진행 중: 끝나지 않은 단계가 있다
 * - wrapping 마무리: 단계가 모두 끝났는데 아직 끝내지 않았다 (끝낼 차례)
 * - archived 종료: 사용자가 끝냈다(목록의 종료 탭)
 */
export type ProjectStatus = "preparing" | "active" | "wrapping" | "archived";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  preparing: "준비",
  active: "진행 중",
  wrapping: "마무리",
  archived: "종료",
};

export const PROJECT_STATUS_HINTS: Record<ProjectStatus, string> = {
  preparing: "아직 담은 의뢰나 정한 단계가 없습니다",
  active: "끝나지 않은 단계가 있습니다",
  wrapping: "단계가 모두 끝났습니다. 프로젝트를 끝낼 차례입니다",
  archived: "끝낸 프로젝트입니다. 다시 열기로 활성 탭에 돌아옵니다",
};

/**
 * 프로젝트를 풀 수 있는 역할 (서버와 같다). 풀면 남이 적은 코멘트까지 지워지므로 대표 · 매니저만 한다.
 * 직원은 되돌릴 수 있는 끝내기로 정리한다.
 */
export const PROJECT_REMOVER_ROLES: readonly string[] = ["owner", "manager"];
export function canRemoveProject(role: string | null | undefined) {
  return PROJECT_REMOVER_ROLES.includes(role ?? "");
}

/**
 * 아무것도 적지 않은 빈 프로젝트인가: 이름 · 대표 고객 · 메모 · 단계 · 코멘트가 모두 없다.
 * "프로젝트 열기"로 바로 만들어진 뒤 그냥 떠난 프로젝트다. 담당(만든 사람)이 지울 수 있다(서버와 같은 기준).
 */
export function isProjectEmpty(plan: {
  title: string | null;
  memo: string | null;
  primaryContact: unknown | null;
  steps: readonly unknown[];
  commentCount: number;
}) {
  return (
    !plan.title?.trim() &&
    !plan.memo?.trim() &&
    !plan.primaryContact &&
    plan.steps.length === 0 &&
    plan.commentCount === 0
  );
}

/** 이 프로젝트를 지금 사용자가 없앨 수 있는가: 대표 · 매니저는 풀기, 빈 프로젝트는 담당(만든 사람)이 지우기. */
export function projectRemovalFor(
  plan: Parameters<typeof isProjectEmpty>[0] & { assignedTo: { id: string } | null },
  user: { id: string; role: string } | null | undefined,
  /**
   * 이 프로젝트에 적은 업무 수. 업무가 하나라도 있으면 빈 프로젝트가 아니다(서버와 같은 기준 — 지우면 업무의
   * 프로젝트 연결이 끊긴다). null이면 아직 모른다: 빈 프로젝트로 보지 않는다(지우기를 내놓았다가 서버가 막지 않게).
   * 넘기지 않으면 업무를 따지지 않는다.
   */
  taskCount?: number | null,
): "remove" | "delete-empty" | null {
  if (!user) return null;
  const empty =
    isProjectEmpty(plan) && (taskCount === undefined || (taskCount !== null && taskCount === 0));
  if (empty && plan.assignedTo?.id === user.id) return "delete-empty";
  if (canRemoveProject(user.role)) return empty ? "delete-empty" : "remove";
  return null;
}

/** 빈 프로젝트를 지울 때 확인 창의 말 */
export const EMPTY_PROJECT_REMOVAL_NOTE =
  "아무것도 적지 않은 빈 프로젝트입니다. 지워도 남는 기록이 없습니다.";

/**
 * 끝내기가 무엇을 하는지. "종료"를 계약 · 정산이 끝났다는 뜻으로 읽지 않게, 끝내기 단추 · 끝낸 뒤 알림 ·
 * 종료 탭의 빈 목록에 함께 적는다.
 */
export const PROJECT_ARCHIVE_NOTE =
  "프로젝트만 정리합니다. 담긴 의뢰와 거래의 상태는 바뀌지 않고, 종료 탭에서 언제든 다시 열 수 있습니다.";

/**
 * 프로젝트를 풀 때 확인 창에 적는 말. 무엇이 지워지고 무엇이 남는지 숨기지 않는다:
 * 프로젝트의 이름 · 메모 · 진행 계획(직접 적은 단계 포함) · 코멘트는 지워지고 되돌릴 수 없다.
 * 의뢰 · 거래 · 상담(사람에 적은 기록)은 남는다. 기록을 남기려면 끝내기를 쓰라고 알린다.
 */
export function describeProjectRemoval(commentCount: number) {
  const comments = commentCount > 0 ? `코멘트 ${commentCount.toLocaleString()}개` : "코멘트";
  return (
    `프로젝트의 이름 · 메모 · 진행 계획(직접 적은 단계 포함)과 ${comments}가 지워지고 되돌릴 수 없습니다. ` +
    "담겨 있던 의뢰와 거래, 손님과의 상담은 그대로 남습니다. 기록을 남겨 두려면 풀지 말고 끝내기를 쓰세요."
  );
}

export function getProjectStatus(project: {
  archivedAt: string | null;
  stepCount: number;
  doneStepCount: number;
}): ProjectStatus {
  if (project.archivedAt) return "archived";
  if (project.stepCount === 0) return "preparing";
  return project.doneStepCount >= project.stepCount ? "wrapping" : "active";
}

export type ProjectProgress =
  | { kind: "none" }
  | { kind: "done"; total: number }
  | { kind: "going"; done: number; total: number; next: string | null };

/** 진행 칸: 단계가 없으면 none, 모두 끝났으면 done, 아니면 몇 중 몇과 다음 단계. */
export function getProjectProgress(
  project: Pick<ProjectListItem, "stepCount" | "doneStepCount" | "nextStepTitle">,
): ProjectProgress {
  if (project.stepCount === 0) return { kind: "none" };
  if (project.doneStepCount >= project.stepCount) {
    return { kind: "done", total: project.stepCount };
  }
  return {
    kind: "going",
    done: project.doneStepCount,
    total: project.stepCount,
    next: project.nextStepTitle,
  };
}

/** 정렬 기준과 고르기는 -project-list-filters.ts에 있다(서버가 정렬한다). */

/**
 * 받은 쪽들을 한 줄로 잇는다. 쪽을 넘기는 사이에 누가 프로젝트를 고치면 순서가 밀려
 * 같은 프로젝트가 두 쪽에 나올 수 있다. 먼저 나온 것만 남긴다.
 */
export function mergeProjectPages(pages: readonly ProjectList[] | undefined) {
  const seen = new Set<string>();
  const rows: ProjectListItem[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      rows.push(item);
    }
  }
  return rows;
}

/**
 * 코멘트 쪽들을 오래된 것부터 한 줄로 잇는다. 쪽은 최근 것부터 받고(첫 쪽이 가장 최근),
 * 쪽 안에서는 오래된 것이 위다.
 */
export function mergeCommentPages(pages: readonly CommentList[] | undefined) {
  const seen = new Set<string>();
  const rows: Comment[] = [];
  for (const page of [...(pages ?? [])].reverse()) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      rows.push(item);
    }
  }
  return rows;
}

/**
 * 프로젝트 사람들의 상담을 최근 것부터 한 줄로 잇는다. 사람마다 따로 읽어 온 것을 합친다.
 * 같은 상담이 두 번 들어와도(같은 사람이 두 번 걸린 경우) 한 번만 남긴다.
 */
export function mergeProjectConsultations<
  TPerson,
  TConsultation extends { id: string; createdAt: string },
>(sources: ReadonlyArray<{ person: TPerson; items: readonly TConsultation[] }>) {
  const seen = new Set<string>();
  const rows: Array<{ person: TPerson; consultation: TConsultation }> = [];
  for (const source of sources) {
    for (const consultation of source.items) {
      if (seen.has(consultation.id)) continue;
      seen.add(consultation.id);
      rows.push({ person: source.person, consultation });
    }
  }
  return rows.sort(
    (left, right) =>
      right.consultation.createdAt.localeCompare(left.consultation.createdAt) ||
      left.consultation.id.localeCompare(right.consultation.id),
  );
}

// ── 코멘트 초안 ────────────────────────────────────────────────

/** 적다 만 코멘트. 패널을 닫거나 다른 프로젝트로 옮겨도 프로젝트별로 남는다. */
export type CommentDraftStore = Map<string, string>;

export const COMMENT_SAVE_MUTATION_KEY = ["projects", "comments", "create"] as const;

export interface CommentSaveRequest {
  projectId: string;
  body: string;
}

/** 저장이 끝났을 때, 남아 있는 글이 보낸 글 그대로일 때만 지운다(그 사이에 더 적었으면 둔다). */
export function settleSavedCommentDraft(drafts: CommentDraftStore, request: CommentSaveRequest) {
  if (drafts.get(request.projectId)?.trim() === request.body) {
    drafts.delete(request.projectId);
  }
}

// ── 단계에 담긴 것을 펼쳐 보기 ───────────────────────────────

/** 종료된 매칭의 단계 값 (packages/shared의 MatchStage.CLOSED) */
const MATCH_STAGE_CLOSED = "closed";

/**
 * 매칭을 살아 있는 것과 종료된 것으로 가른다. 살아 있는 것은 최근에 움직인 것부터.
 * 종료된 것은 줄로 늘어놓지 않고 몇 건인지와 왜 닫혔는지만 말한다(지금 할 일이 아니다):
 * 손님이 희망 조건을 끝내 닫힌 것(buyer_closed)은 "손님 조건 종료"처럼 사유별로 센다.
 */
export function splitMatches<
  T extends { id: string; stage: string; updatedAt: string; closedReason?: string | null },
>(matches: readonly T[]) {
  const active = matches
    .filter((match) => match.stage !== MATCH_STAGE_CLOSED)
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
    );
  const reasonCounts = new Map<string, number>();
  for (const match of matches) {
    if (match.stage !== MATCH_STAGE_CLOSED) continue;
    const label =
      (match.closedReason &&
        MATCH_CLOSED_REASON_LABELS[match.closedReason as keyof typeof MATCH_CLOSED_REASON_LABELS]) ||
      "사유 없음";
    reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
  }
  return {
    active,
    closedCount: matches.length - active.length,
    /** 종료 사유별 건수. 많은 것부터. */
    closedReasons: [...reasonCounts]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
  };
}

/** "종료된 매칭 3건 (손님 조건 종료 2 · 직접 종료 1)" */
export function describeClosedMatches(
  closedCount: number,
  closedReasons: ReadonlyArray<{ label: string; count: number }>,
) {
  if (closedCount === 0) return "";
  const reasons = closedReasons
    .filter((reason) => reason.label !== "사유 없음")
    .map((reason) => (closedReasons.length > 1 ? `${reason.label} ${reason.count}` : reason.label))
    .join(" · ");
  return reasons ? `종료된 매칭 ${closedCount}건 (${reasons})` : `종료된 매칭 ${closedCount}건`;
}

interface PlaceSource {
  site?: { name: string } | null;
  unit?: {
    name: string | null;
    floor: number | null;
    floorEnd?: number | null;
    floorLabel?: string | null;
    dong?: { name: string; isPlaceholder?: boolean } | null;
  } | null;
}

/**
 * 집을 부르는 이름: "고덕그라시움 101동 3501호". 동 구분이 없는 건물은 동을 빼고("고덕빌라 201호"),
 * 호 없이 층인 공간은 층으로 부른다("○○상가 2층"). 공용 formatPlaceLabel — 손으로 이어 붙이지 않는다.
 */
export function describePlace(property: PlaceSource | null | undefined) {
  if (!property) return "매물";
  return (
    formatPlaceLabel({
      siteName: property.site?.name,
      dongName: property.unit?.dong?.name,
      dongIsPlaceholder: property.unit?.dong?.isPlaceholder,
      unit: property.unit,
    }) || "매물"
  );
}

/**
 * 대금 일정을 보여 줄 순서로: 취소된 것은 빼고, 예정일이 이른 것부터(예정일이 없는 것은 뒤로),
 * 같은 날이면 차수 순.
 */
export function orderPayments<
  T extends { id: string; status: string; scheduledDate: string | null; sequence: number },
>(payments: readonly T[]) {
  return payments
    .filter((payment) => payment.status !== "cancelled")
    .sort((left, right) => {
      if (left.scheduledDate && right.scheduledDate) {
        return (
          left.scheduledDate.localeCompare(right.scheduledDate) ||
          left.sequence - right.sequence ||
          left.id.localeCompare(right.id)
        );
      }
      if (left.scheduledDate) return -1;
      if (right.scheduledDate) return 1;
      return left.sequence - right.sequence || left.id.localeCompare(right.id);
    });
}

/**
 * 대금 한 줄의 상태 표기. 기준은 서버의 status다(거래 화면과 같다).
 *
 * 입금한 때(paidAt)로 판단하지 않는다: 일부만 받아도, 받았다가 상태를 되돌려도 그 칸은 차 있다.
 * 그것으로 "입금"이라 하면 덜 받은 대금이 다 받은 것으로 보인다.
 * 예정일이 지났는지는 서버가 아직 overdue로 바꾸지 않았어도 날짜로 본다.
 */
export function describePaymentState(
  payment: { kind?: string; status: string; scheduledDate: string | null },
  now: Date = new Date(),
): { label: string; tone: "done" | "late" | "plain" } {
  if (payment.status === "paid") {
    // 환불은 받은 돈이 아니라 돌려준 돈이다.
    return { label: payment.kind === "refund" ? "환불함" : "입금", tone: "done" };
  }
  let late = payment.status === "overdue";
  if (!late && payment.scheduledDate) {
    const due = new Date(payment.scheduledDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    late = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() < today.getTime();
  }
  if (payment.status === "partial") {
    return late ? { label: "일부 입금 · 지남", tone: "late" } : { label: "일부 입금", tone: "plain" };
  }
  return late ? { label: "지남", tone: "late" } : { label: "예정", tone: "plain" };
}

/**
 * 대금 일정의 줄이 잔금일을 이미 보여 주는지. 그럴 때만 거래 첫 줄의 "잔금 …"을 뺀다(같은 날짜를 두 번 보이지 않으려고).
 *
 * 잔금 줄이 있어도 **날짜가 비어 있으면** 그 줄은 "날짜 미정"으로 보인다. 그때 첫 줄의 잔금일(계약서의 잔금일)까지
 * 빼면 알고 있는 잔금일이 화면에서 사라진다. 그래서 날짜가 적힌 잔금 줄이 있을 때만 true다.
 * (취소된 줄은 `orderPayments`가 이미 걸러 낸다.)
 */
export function balanceShownInSchedule(
  payments: ReadonlyArray<{ kind: string; scheduledDate: string | null }>,
): boolean {
  return payments.some((payment) => payment.kind === "balance" && Boolean(payment.scheduledDate));
}

// ── 글 칸을 벗어날 때 저장할지 ───────────────────────────────

export type TextCommit =
  /** 지금 값과 같다. 할 일이 없다. */
  | { kind: "none" }
  /** 이 칸에서는 바꾼 것이 없는데 그 사이에 다른 곳에서 바뀌었다. 바뀐 값을 받아들인다(저장하지 않는다). */
  | { kind: "adopt" }
  /** 이 칸에서만 바꿨다. 저장한다. */
  | { kind: "save"; value: string }
  /** 이 칸에서도 바꾸고 다른 곳에서도 바뀌었다. 알아서 덮지 않고 사용자에게 묻는다. */
  | { kind: "conflict" };

/**
 * 글 칸을 벗어날 때 무엇을 할지 정한다.
 *
 * "적은 글이 지금 값과 다르면 저장"만으로는 틀린다: 칸에 들어가 있는 동안 다른 탭이나 다른 사람이
 * 그 칸을 저장하면, 손대지 않은 예전 글이 "다른 글"로 보여 새 값을 예전 값으로 덮어쓴다.
 * 그래서 칸에 들어갈 때의 값(base)을 기억해 두고 셋을 견준다.
 *
 * @param draft 칸에 적혀 있는 글
 * @param base 칸에 들어갈 때의 값
 * @param current 지금 값 (그 사이에 다른 곳에서 바뀌었을 수 있다)
 */
export function decideTextCommit(input: {
  draft: string;
  base: string;
  current: string;
}): TextCommit {
  const draft = input.draft.trim();
  const base = input.base.trim();
  const current = input.current.trim();
  if (draft === current) return { kind: "none" };
  if (draft === base) return { kind: "adopt" };
  if (current !== base) return { kind: "conflict" };
  return { kind: "save", value: draft };
}

// ── 고친 칸만 덮기 ─────────────────────────────────────────────

/**
 * 고치기 요청의 응답에서, 그 요청이 고친 칸만 지금 값 위에 덮는다.
 * 응답 전체로 바꾸면 그 사이에 다른 칸을 고친 결과(아직 응답이 오지 않은 것)가 예전 값으로 돌아간다.
 */
export function mergeProjectUpdate(
  current: ProjectPlan | undefined,
  response: ProjectPlan,
  dto: UpdateProjectDto,
): ProjectPlan {
  if (!current) return response;
  return {
    ...current,
    updatedAt: response.updatedAt,
    ...(dto.title !== undefined ? { title: response.title } : {}),
    ...(dto.memo !== undefined ? { memo: response.memo } : {}),
    ...(dto.archived !== undefined ? { archivedAt: response.archivedAt } : {}),
    ...(dto.assignedToId !== undefined ? { assignedTo: response.assignedTo } : {}),
    ...(dto.primaryContactId !== undefined
      ? { primaryContact: response.primaryContact, people: response.people }
      : {}),
  };
}

// ── 작업 공간: 업무 ────────────────────────────────────────────

/** 끝나지 않은 업무의 상태 (업무 화면과 같다: 대기 · 진행 중) */
const OPEN_TASK_STATUSES: readonly string[] = ["pending", "in_progress"];

function dueTime(dueDate: string | null) {
  if (!dueDate) return Number.POSITIVE_INFINITY;
  const time = new Date(dueDate).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

/**
 * 프로젝트의 업무를 안 끝난 것과 끝낸 것으로 가른다(취소한 업무는 어디에도 넣지 않는다).
 * - 안 끝난 것: 마감이 빠른 것부터, 마감이 없는 것은 맨 뒤, 같으면 먼저 적은 것부터.
 * - 끝낸 것: 최근에 끝낸(고친) 것부터.
 *
 * held: 방금 이 자리에서 체크한 업무. 끝냈어도 그 자리에 둔다(업무 화면과 같은 보호) — 체크하자마자 줄이
 * 빠지면 아래 줄이 커서 밑으로 올라와, 이어서 누르면 다른 업무가 끝난다.
 */
export function splitProjectTasks<
  T extends { id: string; status: string; dueDate: string | null; createdAt: string; updatedAt?: string },
>(tasks: readonly T[], held: ReadonlySet<string> = new Set()) {
  const open = tasks
    .filter(
      (task) =>
        OPEN_TASK_STATUSES.includes(task.status) || (held.has(task.id) && task.status === "completed"),
    )
    .sort(
      (left, right) =>
        dueTime(left.dueDate) - dueTime(right.dueDate) ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
  const done = tasks
    .filter((task) => task.status === "completed" && !held.has(task.id))
    .sort(
      (left, right) =>
        (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt) ||
        left.id.localeCompare(right.id),
    );
  return { open, done };
}

/** 이 날짜(내 달력의 날)의 키 "2026-11-22". 업무 화면이 마감을 보내는 모양과 같다. */
export function toDueDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// ── 작업 공간: 상담 · 코멘트 한 흐름 ─────────────────────────────

export type ProjectFlowFilter = "all" | "consultation" | "comment";

export const PROJECT_FLOW_FILTERS: ReadonlyArray<{ value: ProjectFlowFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "consultation", label: "상담" },
  { value: "comment", label: "코멘트" },
];

export type ProjectFlowItem<TPerson, TConsultation, TComment> =
  | { kind: "consultation"; id: string; at: string; person: TPerson; consultation: TConsultation }
  | { kind: "comment"; id: string; at: string; comment: TComment };

/**
 * 상담(사람마다 따로 읽은 것)과 코멘트(쪽으로 읽은 것)를 최근 것부터 한 줄로 잇는다.
 *
 * 둘은 따로 쪽을 넘긴다. 그래서 그냥 합치면 "더 있는" 쪽의 더 오래된 기록이 빠진 채로 다른 쪽의 오래된
 * 기록이 이어져, 그 사이에 아무 일도 없었던 것처럼 보인다. 더 받을 것이 남은 출처마다 받아 둔 가장
 * 오래된 때를 재고, 그중 가장 늦은 때(경계)보다 오래된 기록은 아직 보이지 않는다(더 보기로 이어 받는다).
 *
 * 같은 상담이 두 사람에게서 들어와도 한 번만 남긴다.
 */
export function mergeProjectFlow<
  TPerson,
  TConsultation extends { id: string; createdAt: string },
  TComment extends { id: string; createdAt: string },
>(input: {
  consultations: ReadonlyArray<{ person: TPerson; items: readonly TConsultation[]; hasMore: boolean }>;
  comments: { items: readonly TComment[]; hasMore: boolean };
  filter: ProjectFlowFilter;
}): {
  items: Array<ProjectFlowItem<TPerson, TConsultation, TComment>>;
  /** 더 받을 기록이 남았다 (지금 거르기 기준) */
  hasMore: boolean;
  /** 받아 두었지만 경계보다 오래되어 아직 보이지 않는 기록 수 */
  heldBack: number;
} {
  const useConsultations = input.filter !== "comment";
  const useComments = input.filter !== "consultation";
  const all: Array<ProjectFlowItem<TPerson, TConsultation, TComment>> = [];
  let horizon = "";
  let hasMore = false;
  const pushHorizon = (items: ReadonlyArray<{ createdAt: string }>, more: boolean) => {
    if (!more) return;
    hasMore = true;
    let oldest = "";
    for (const item of items) if (!oldest || item.createdAt < oldest) oldest = item.createdAt;
    if (oldest && oldest > horizon) horizon = oldest;
  };

  if (useConsultations) {
    const seen = new Set<string>();
    for (const source of input.consultations) {
      pushHorizon(source.items, source.hasMore);
      for (const consultation of source.items) {
        if (seen.has(consultation.id)) continue;
        seen.add(consultation.id);
        all.push({
          kind: "consultation",
          id: `consultation:${consultation.id}`,
          at: consultation.createdAt,
          person: source.person,
          consultation,
        });
      }
    }
  }
  if (useComments) {
    pushHorizon(input.comments.items, input.comments.hasMore);
    const seen = new Set<string>();
    for (const comment of input.comments.items) {
      if (seen.has(comment.id)) continue;
      seen.add(comment.id);
      all.push({ kind: "comment", id: `comment:${comment.id}`, at: comment.createdAt, comment });
    }
  }

  all.sort((left, right) => right.at.localeCompare(left.at) || left.id.localeCompare(right.id));
  const items = horizon ? all.filter((item) => item.at >= horizon) : all;
  return { items, hasMore, heldBack: all.length - items.length };
}

// ── 작업 공간: 보기 탭 ──────────────────────────────────────────

export type ProjectViewTab = "overview" | "matches" | "deals" | "files";

type StepForCounts = Pick<ProjectStep, "listingIntake" | "buyerIntake" | "deal">;

/**
 * 보기 탭의 숫자. 숫자가 0이면 탭에 적지 않는다.
 * - 매물·매칭: 담긴 의뢰들의 진행 중인 매칭 수(서버가 센 값, 종료된 매칭은 빼고)
 * - 거래·보수: 취소되지 않은 거래 수(같은 거래를 두 단계가 가리켜도 한 번)
 */
export function projectTabCounts(steps: readonly StepForCounts[]) {
  let matches = 0;
  const deals = new Set<string>();
  for (const step of steps) {
    matches += (step.listingIntake?.matchCount ?? 0) + (step.buyerIntake?.matchCount ?? 0);
    if (step.deal && !step.deal.isCancelled) deals.add(step.deal.id);
  }
  return { matches, deals: deals.size };
}

/**
 * 이 프로젝트의 거래를 한 번씩: 지금 거래가 먼저(진행 계획 순서대로), 취소된 거래는 뒤에.
 * 의뢰 단계의 "지금 거래"와 "가장 최근에 취소된 거래", 거래를 직접 가리키는 단계의 거래를 모은다.
 */
export function collectProjectDeals<
  TStep extends {
    id: string;
    title: string;
    sortOrder: number;
    deal: ProjectStepDeal | null;
    cancelledDeal?: ProjectStepDeal | null;
  },
>(steps: readonly TStep[]) {
  const ordered = [...steps].sort((left, right) => left.sortOrder - right.sortOrder);
  const seen = new Set<string>();
  const current: Array<{ deal: ProjectStepDeal; step: TStep }> = [];
  const cancelled: Array<{ deal: ProjectStepDeal; step: TStep }> = [];
  for (const step of ordered) {
    for (const deal of [step.deal, step.cancelledDeal ?? null]) {
      if (!deal || seen.has(deal.id)) continue;
      seen.add(deal.id);
      (deal.isCancelled ? cancelled : current).push({ deal, step });
    }
  }
  return [...current, ...cancelled];
}

/** 진행한 정도가 큰 단계부터: "협상 1 · 임장 1"처럼 지금 가장 앞선 것이 먼저 읽힌다. */
const MATCH_SUMMARY_ORDER: readonly string[] = [
  MatchStage.DEAL_CREATED,
  MatchStage.NEGOTIATING,
  MatchStage.BUYER_REVIEWING,
  MatchStage.VIEWING,
  MatchStage.VIEWING_CONFIRMED,
  MatchStage.BUYER_INTERESTED,
  MatchStage.SUGGESTED,
];

/**
 * 진행 중인 매칭을 단계별로 센다: [{ stage: "negotiating", count: 1 }, …]. 종료된 매칭은 세지 않는다.
 * 예전 단계 값(buyerContacted 등)은 지금 값으로 읽는다.
 */
export function countMatchStages(matches: ReadonlyArray<{ stage: string }>) {
  const counts = new Map<string, number>();
  for (const match of matches) {
    const stage = normalizeMatchStage(match.stage);
    if (stage === MatchStage.CLOSED) continue;
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  const rank = (stage: string) => {
    const index = MATCH_SUMMARY_ORDER.indexOf(stage);
    return index < 0 ? MATCH_SUMMARY_ORDER.length : index;
  };
  return [...counts]
    .map(([stage, count]) => ({ stage, count }))
    .sort((left, right) => rank(left.stage) - rank(right.stage) || left.stage.localeCompare(right.stage));
}

// ── 작업 공간: 진행 계획의 차례 묶음 ─────────────────────────────

/** 차례의 상태: 끝남 · 진행 중(가장 앞의 안 끝난 차례) · 다음 차례(그 바로 뒤) · 예정 */
export type PlanStageState = "done" | "current" | "next" | "upcoming";

export const PLAN_STAGE_STATE_LABELS: Record<PlanStageState, string> = {
  done: "끝남",
  current: "진행 중",
  next: "다음 차례",
  upcoming: "예정",
};

/**
 * 진행 계획을 차례(같은 sortOrder = 동시 진행)로 묶는다. 차례 번호는 1부터 다시 매긴다.
 * 모든 단계가 끝난 차례는 끝남, 가장 앞의 안 끝난 차례가 진행 중, 그 바로 뒤가 다음 차례, 나머지는 예정.
 * 끝난 차례가 안 끝난 차례 뒤에 있어도(순서를 건너뛴 경우) 끝남으로 둔다.
 */
export function planStageGroups<T extends { id: string; sortOrder: number; done: boolean }>(
  steps: readonly T[],
) {
  const ordered = [...steps].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  );
  const groups: Array<{ order: number; index: number; steps: T[]; state: PlanStageState }> = [];
  for (const step of ordered) {
    const last = groups[groups.length - 1];
    if (last && last.order === step.sortOrder) last.steps.push(step);
    else groups.push({ order: step.sortOrder, index: groups.length + 1, steps: [step], state: "upcoming" });
  }
  let currentSeen = false;
  let nextGiven = false;
  for (const group of groups) {
    if (group.steps.every((step) => step.done)) {
      group.state = "done";
    } else if (!currentSeen) {
      group.state = "current";
      currentSeen = true;
    } else if (!nextGiven) {
      group.state = "next";
      nextGiven = true;
    }
  }
  return groups;
}

/** 진행 계획 머리의 요약 알약: "1/4 끝남 · 매물 의뢰 1 · 구매 의뢰 2". 단계가 없으면 빈 글. */
export function describePlanSummary(
  steps: ReadonlyArray<{ kind: string; done: boolean }>,
) {
  if (steps.length === 0) return "";
  const done = steps.filter((step) => step.done).length;
  const listing = steps.filter((step) => step.kind === "listing_intake").length;
  const buyer = steps.filter((step) => step.kind === "buyer_intake").length;
  return [
    `${done}/${steps.length} 끝남`,
    listing > 0 ? `매물 의뢰 ${listing}` : "",
    buyer > 0 ? `구매 의뢰 ${buyer}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// ─── 매물·매칭 표의 열 폭 ─────────────────────────────────
// 남는 폭을 비율로 나눈다: 이름·조건 칸도 조금씩 늘지만 가장 큰 몫은 메모 칸이 가져간다.
// 메모 칸의 최소 폭은 0이다 — 최소 폭을 주면 본문이 좁을 때 열 최소 폭의 합이 카드보다 커져
// 표가 카드 밖으로 넘친다(메모는 좁으면 말줄임으로 줄어드는 칸이다). 앞 칸에 "최대 폭"을 주는
// 방식(minmax(a, b))은 앞 칸이 먼저 최대까지 늘어 메모가 수십 px로 눌리므로 쓰지 않는다.
export const REQUIREMENT_GRID =
  "grid grid-cols-[minmax(120px,1.2fr)_56px_minmax(96px,0.9fr)_128px_minmax(0,1.6fr)] items-center gap-x-3";
export const LISTING_GRID =
  "grid grid-cols-[minmax(110px,1fr)_minmax(140px,1.1fr)_128px_minmax(0,1.6fr)] items-center gap-x-3";

// ── 작업 공간: 진행 계획을 그 자리에서 끌어다 놓기 ───────────────────

/**
 * 끌어다 놓을 곳.
 * - join: 그 차례(sortOrder) 상자 위 → 그 차례와 동시 진행이 된다.
 * - gap: 차례 사이의 틈(index = 그 앞에 놓일 차례의 자리. 0은 맨 앞, 차례 수는 맨 뒤) → 새 차례로 들어간다.
 */
export type PlanDrop = { kind: "join"; order: number } | { kind: "gap"; index: number };

/**
 * 한 단계를 놓은 뒤의 전체 순서. 차례는 1부터 빈틈없이 다시 매기고(비게 된 차례는 사라진다), 서버에는
 * 모든 단계의 { id, sortOrder }를 보낸다(서버가 일부만 받지 않는다). 아무것도 바뀌지 않으면(제자리) null.
 * 같은 차례 안의 줄 순서는 화면과 같은 기준(sortOrder, 그다음 id)으로 둔다.
 */
export function planOrderAfterDrop(
  steps: ReadonlyArray<{ id: string; sortOrder: number }>,
  stepId: string,
  drop: PlanDrop,
): Array<{ id: string; sortOrder: number }> | null {
  const ordered = [...steps].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  );
  const groups: Array<{ order: number; ids: string[] }> = [];
  for (const step of ordered) {
    const last = groups[groups.length - 1];
    if (last && last.order === step.sortOrder) last.ids.push(step.id);
    else groups.push({ order: step.sortOrder, ids: [step.id] });
  }
  const sourceIndex = groups.findIndex((group) => group.ids.includes(stepId));
  if (sourceIndex < 0) return null;
  const source = groups[sourceIndex]!;

  let next: string[][];
  if (drop.kind === "join") {
    const targetIndex = groups.findIndex((group) => group.order === drop.order);
    if (targetIndex < 0 || targetIndex === sourceIndex) return null;
    next = groups.map((group, index) => {
      const ids = group.ids.filter((id) => id !== stepId);
      return index === targetIndex ? [...ids, stepId] : ids;
    });
  } else {
    const index = Math.max(0, Math.min(groups.length, drop.index));
    // 혼자 있던 차례의 바로 앞 · 바로 뒤 틈은 제자리다.
    if (source.ids.length === 1 && (index === sourceIndex || index === sourceIndex + 1)) return null;
    next = [];
    for (let position = 0; position <= groups.length; position += 1) {
      if (position === index) next.push([stepId]);
      const group = groups[position];
      if (group) next.push(group.ids.filter((id) => id !== stepId));
    }
  }
  const result = next
    .filter((ids) => ids.length > 0)
    .flatMap((ids, groupIndex) => ids.map((id) => ({ id, sortOrder: groupIndex + 1 })));
  // 번호만 다시 매긴 것과 같으면(제자리) 보내지 않는다.
  const normalized = new Map(
    groups.flatMap((group, groupIndex) => group.ids.map((id) => [id, groupIndex + 1] as const)),
  );
  return result.every((item) => normalized.get(item.id) === item.sortOrder) ? null : result;
}

export type PlanMove = "earlier" | "later" | "withPrevious" | "split";

/**
 * 끌지 않고 옮기기(카드의 ⋯ 메뉴 · 키보드): 앞으로 · 뒤로 · 앞 차례와 함께 · 따로 떼기를 놓을 곳으로 바꾼다.
 * 할 수 없는 옮기기(맨 앞에서 앞으로, 혼자인데 따로 떼기 등)는 null.
 */
export function planDropForMove(
  steps: ReadonlyArray<{ id: string; sortOrder: number }>,
  stepId: string,
  move: PlanMove,
): PlanDrop | null {
  const orders = [...new Set([...steps].map((step) => step.sortOrder))].sort((left, right) => left - right);
  const step = steps.find((item) => item.id === stepId);
  if (!step) return null;
  const index = orders.indexOf(step.sortOrder);
  const alone = steps.filter((item) => item.sortOrder === step.sortOrder).length === 1;
  switch (move) {
    case "earlier":
      if (alone) return index > 0 ? { kind: "gap", index: index - 1 } : null;
      return { kind: "gap", index };
    case "later":
      if (alone) return index < orders.length - 1 ? { kind: "gap", index: index + 2 } : null;
      return { kind: "gap", index: index + 1 };
    case "withPrevious":
      return index > 0 ? { kind: "join", order: orders[index - 1]! } : null;
    case "split":
      return alone ? null : { kind: "gap", index: index + 1 };
  }
}


// ─── 끌어다 놓기: 손 밑의 놓을 곳 ─────────────────────────────

/** 놓을 곳 하나의 지금 화면 자리(창 기준). gap이면 차례 사이의 틈, 아니면 차례 상자. */
export interface PlanDropRect {
  id: string;
  gap: boolean;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** 흐름의 옆으로 이만큼까지 벗어난 손은 흐름 위·아래에 있는 것으로 본다. */
const PLAN_DROP_SIDE_SLACK = 24;

/**
 * 손(포인터)이 가리키는 놓을 곳의 id. 없으면 null(거기서 놓으면 아무 일도 없다).
 *
 * 1. 손이 들어 있는 놓을 곳. 틈과 상자가 함께 걸리면 틈.
 * 2. 흐름의 가로 범위 안에서 맨 위 틈보다 위에 있으면 맨 앞 틈, 맨 아래 틈보다 아래에 있으면 맨 끝 틈.
 *    (맨 끝 틈 아래의 "단계 추가" 줄이나 빈 곳에 놓아도 맨 끝으로 간다.)
 * 3. 흐름 안인데 어느 놓을 곳에도 들어 있지 않으면(번호 줄, 좁은 여백) 세로로 가장 가까운 곳.
 * 4. 옆으로 벗어난 자리(오른쪽 열 등)는 null.
 */
export function pickPlanDropTarget(
  pointer: { x: number; y: number },
  rects: PlanDropRect[],
): string | null {
  const inside = rects.filter(
    (rect) =>
      pointer.x >= rect.left &&
      pointer.x <= rect.right &&
      pointer.y >= rect.top &&
      pointer.y <= rect.bottom,
  );
  const hit = inside.find((rect) => rect.gap) ?? inside[0];
  if (hit) return hit.id;

  const gaps = rects.filter((rect) => rect.gap).sort((a, b) => a.top - b.top);
  if (gaps.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.left)) - PLAN_DROP_SIDE_SLACK;
  const right = Math.max(...rects.map((rect) => rect.right)) + PLAN_DROP_SIDE_SLACK;
  if (pointer.x < left || pointer.x > right) return null;
  const first = gaps[0];
  const last = gaps[gaps.length - 1];
  if (pointer.y < first.top) return first.id;
  if (pointer.y > last.bottom) return last.id;
  // 흐름 안인데 어느 놓을 곳에도 들어 있지 않다(왼쪽 번호 줄, 상자와 틈 사이의 좁은 여백):
  // 세로로 가장 가까운 곳. 거리가 같으면 틈.
  const distance = (rect: PlanDropRect) =>
    pointer.y < rect.top ? rect.top - pointer.y : pointer.y > rect.bottom ? pointer.y - rect.bottom : 0;
  return [...rects].sort(
    (a, b) => distance(a) - distance(b) || Number(b.gap) - Number(a.gap),
  )[0].id;
}

// ── 단계 카드의 표 한 줄: 카드 폭에 들어가는 칸 고르기 ─────────────────────

/**
 * 표의 한 칸. 폭은 매물관리 · 희망매물 표의 것을 그대로 쓴다.
 * - drop: 0이면 늘 둔다. 나머지는 폭이 모자랄 때 작은 수부터 뺀다(1이 가장 먼저 빠진다).
 * - minWidth: 늘 두는 칸만으로도 넘칠 때 이 폭까지 줄인다(매물관리 표의 minSize).
 * - grow: 남는 폭을 이 칸이 받는다(최대 width까지). 고를 때는 minWidth로 센다.
 */
export interface StepTableColumn<Id extends string = string> {
  id: Id;
  width: number;
  minWidth?: number;
  drop: number;
  grow?: boolean;
}

/**
 * 카드 폭(available)에 들어가는 칸과 각 칸의 폭. 가로 스크롤을 만들지 않으려고 칸을 뺀다.
 * 늘 두는 칸은 빼지 않는다(그것만으로 넘치면 줄일 수 있는 칸을 minWidth까지 줄이고, 그래도 넘치면 overflow).
 * 반환하는 칸은 원래 순서 그대로다.
 */
export function pickStepTableColumns<Id extends string>(
  columns: ReadonlyArray<StepTableColumn<Id>>,
  available: number,
): { visible: Id[]; widths: Record<Id, number>; overflow: boolean } {
  const base = (column: StepTableColumn<Id>) => (column.grow ? (column.minWidth ?? column.width) : column.width);
  const chosen = new Set<Id>(columns.filter((column) => column.drop === 0).map((column) => column.id));
  let used = columns.filter((column) => chosen.has(column.id)).reduce((sum, column) => sum + base(column), 0);
  const candidates = columns
    .filter((column) => column.drop > 0)
    .slice()
    .sort((left, right) => right.drop - left.drop);
  for (const column of candidates) {
    if (used + column.width <= available) {
      chosen.add(column.id);
      used += column.width;
    }
  }
  const visible = columns.filter((column) => chosen.has(column.id));
  const widths = Object.fromEntries(visible.map((column) => [column.id, base(column)])) as Record<Id, number>;
  // 늘 두는 칸만으로 넘치면 줄일 수 있는 칸을 줄인다(뒤 칸부터)
  if (used > available) {
    for (const column of visible.slice().reverse()) {
      if (column.grow || column.minWidth === undefined || used <= available) continue;
      const cut = Math.min(column.width - column.minWidth, used - available);
      widths[column.id] -= cut;
      used -= cut;
    }
  }
  // 남는 폭은 grow 칸이 받는다(원래 폭까지)
  for (const column of visible) {
    if (!column.grow || used >= available) continue;
    const gain = Math.min(column.width - widths[column.id], available - used);
    widths[column.id] += gain;
    used += gain;
  }
  return { visible: visible.map((column) => column.id), widths, overflow: used > available };
}

/**
 * 매물 의뢰 단계의 이름이 주소를 되풀이할 뿐인지(기본 이름 "고덕그라시움 102동 3501호 매물 의뢰", "고덕그라시움 3501 매도" 등).
 * 그런 이름은 표의 한 줄(단지 · 동 · 호)과 겹치므로 따로 보이지 않는다. 사용자가 다른 이름을 붙였을 때만 보인다.
 * 단지 이름이 들어 있고, 나머지 낱말이 모두 주소의 낱말("102동" = "102", "3501호" = "3501")이거나 "매물 의뢰 · 매도 · 매물"일 때.
 */
export function isAddressOnlyStepTitle(
  title: string,
  place: { siteName?: string | null; placeLabel: string },
): boolean {
  const siteName = place.siteName?.trim();
  if (!siteName) return false;
  const normalized = title.trim();
  if (!normalized) return true;
  if (!normalized.includes(siteName)) return false;
  const rest = normalized.replace(siteName, " ");
  const filler = new Set(["매물", "의뢰", "매도", "매물의뢰"]);
  const strip = (word: string) => word.replace(/(동|호)$/, "");
  const placeWords = new Set(
    place.placeLabel
      .replace(siteName, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map(strip),
  );
  return rest
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => filler.has(word) || placeWords.has(strip(word)));
}

/** 구매 의뢰 단계의 이름이 기본 이름인지("구매 의뢰", "매매 구매 의뢰" 등). 그러면 표의 한 줄과 겹쳐 따로 보이지 않는다. */
export function isDefaultBuyerStepTitle(title: string): boolean {
  return /^(?:(?:매매|전세|월세)\s*)?구매\s*의뢰$/.test(title.trim()) || !title.trim();
}

/** 주소 표기("고덕그라시움 101동 3501호")에서 단지 이름: 숫자가 든 첫 낱말(동 · 호 · 층) 앞까지 */
export function siteNameFromPlaceLabel(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const firstPlaceWord = words.findIndex((word, index) => index > 0 && /\d/.test(word));
  return (firstPlaceWord > 0 ? words.slice(0, firstPlaceWord) : words).join(" ");
}

/**
 * 매물 의뢰 카드의 칸(매물관리 표의 size · minSize). 빼는 순서(사용자 지시 2026-11-24): 메모 → 월세가 없는 줄의 월세 →
 * 타입 → 입주가능일, 그래도 모자라면 광고(매칭 패널의 "광고" 탭에 있다) → 확인 → 공급 → 월세.
 * 거래 · 단지 · 동 · 호 · 매칭 · 매물상태 · 가격은 늘 둔다.
 */
export type ListingStepColumnId =
  | "info"
  | "site"
  | "dong"
  | "unit"
  | "supplyArea"
  | "unitType"
  | "matching"
  | "advertisement"
  | "confirmationAt"
  | "listingAvailability"
  | "price"
  | "monthlyRent"
  | "moveInAvailable"
  | "memo";

export function listingStepColumns(hasMonthly: boolean): StepTableColumn<ListingStepColumnId>[] {
  return [
    // 거래·동·매칭 칸은 매물관리 표(74 · 58 · 74px)보다 조금 좁다. 넓힌 호 칸만큼을 여기서 덜어야
    // 본문이 좁을 때(1440 창) 매물상태 칸의 거래 단계("거래 중 가계약")가 잘리지 않는다.
    { id: "info", width: 66, drop: 0 },
    { id: "site", width: 240, minWidth: 96, drop: 0, grow: true },
    { id: "dong", width: 56, drop: 0 },
    // 매물관리 표의 호 칸(58px)은 "3501호"가 "350…"으로 잘린다. 프로젝트 카드에서는 어느 집인지가
    // 이 줄의 이름이라(제목 줄을 따로 두지 않는다) 네 자리 호수가 다 보이는 폭으로 둔다.
    { id: "unit", width: 78, drop: 0 },
    { id: "supplyArea", width: 74, drop: 7 },
    { id: "unitType", width: 74, drop: 3 },
    { id: "matching", width: 68, drop: 0 },
    { id: "advertisement", width: 74, drop: 5 },
    { id: "confirmationAt", width: 120, drop: 6 },
    { id: "listingAvailability", width: 148, minWidth: 96, drop: 0 },
    // 가격은 "매매 26억 8,000만"(조건 꼬리표 + 금액)이 한 줄에 다 보이는 150px까지 줄인다
    { id: "price", width: 155, minWidth: 150, drop: 0 },
    { id: "monthlyRent", width: 82, drop: hasMonthly ? 8 : 2 },
    { id: "moveInAvailable", width: 120, drop: 4 },
    { id: "memo", width: 320, drop: 1 },
  ];
}

/**
 * 구매 의뢰 카드의 칸(희망매물 표 BUYER_TABLE_COLUMNS에서 선택 칸을 뺀 것). 늘 두는 칸: 펼침 · 고객 · 예산 · 희망 지역·단지.
 * 모자라면 매물 유형 → 연락처(프로젝트 머리에도 있다) → 긴급도 → 입주 희망일 → 희망 평형 → 상태 순으로 뺀다.
 */
export type BuyerStepColumnId =
  | "toggle"
  | "urgency"
  | "customer"
  | "phone"
  | "status"
  | "siteTypes"
  | "area"
  | "budget"
  | "places"
  | "moveIn";

export const BUYER_STEP_COLUMNS: StepTableColumn<BuyerStepColumnId>[] = [
  { id: "toggle", width: 28, drop: 0 },
  { id: "urgency", width: 80, drop: 3 },
  { id: "customer", width: 148, drop: 0 },
  { id: "phone", width: 130, drop: 2 },
  { id: "status", width: 80, drop: 6 },
  { id: "siteTypes", width: 100, drop: 1 },
  { id: "area", width: 104, drop: 5 },
  { id: "budget", width: 168, drop: 0 },
  { id: "places", width: 520, minWidth: 140, drop: 0, grow: true },
  { id: "moveIn", width: 110, drop: 4 },
];

/**
 * 매물관리의 매칭 패널(PropertyMatchPanel)은 매물관리 표 폭(약 1,180px)에 맞춘 8칸 표라, 카드 안에서는 "단계" 칸이
 * 가로 스크롤 밖으로 밀린다. 패널에 칸을 고르는 길이 없어(properties 쪽 파일은 고치지 않는다) 카드 폭이 모자랄 때만
 * 바깥에서 칸을 감춘다. mid(카드 860px 이상): 고객 메모 · 담당. narrow: 연락처 · 면적까지 — 고객 · 거래 · 예산 · 단계가 남는다.
 * 패널에 칸을 고르는 속성이 생기면 이것을 지운다.
 */
export type MatchPanelFit = "full" | "mid" | "narrow";

export const MATCH_PANEL_HIDDEN: Record<Exclude<MatchPanelFit, "full">, readonly string[]> = {
  mid: ["memo", "assignee"],
  narrow: ["phone", "area", "memo", "assignee"],
};

export function matchPanelFitFor(cardWidth: number): MatchPanelFit {
  if (cardWidth >= 1180) return "full";
  return cardWidth >= 860 ? "mid" : "narrow";
}

/**
 * 감출 칸의 CSS. 칸의 자리(nth-child)와 남는 칸의 폭은 패널의 칸 정의(matchTableColumns)에서 계산한다 —
 * 패널이 칸 순서를 바꿔도 같은 칸이 감춰진다. 줄의 첫 칸은 펼침 화살표(24px)다.
 */
export function compactMatchPanelCss(
  columns: ReadonlyArray<{ id: string; width: number; minWidth: number }>,
): string {
  return (Object.keys(MATCH_PANEL_HIDDEN) as Array<keyof typeof MATCH_PANEL_HIDDEN>)
    .map((fit) => {
      const hidden = new Set(MATCH_PANEL_HIDDEN[fit]);
      const scope = `[data-project-match-panel="${fit}"]`;
      const template = [
        "24px",
        ...columns
          .filter((column) => !hidden.has(column.id))
          .map((column) => `minmax(${column.minWidth}px, ${column.width}fr)`),
      ].join(" ");
      const children = columns
        .map((column, index) => (hidden.has(column.id) ? `:nth-child(${index + 2})` : null))
        .filter(Boolean)
        .join(", ");
      return [
        `${scope} [data-property-match-panel] > div > div { min-width: 0 !important; width: auto !important; --match-table-columns: ${template} !important; }`,
        children
          ? `${scope} :is([data-property-match-header], [data-property-match-row]) > :is(${children}) { display: none !important; }`
          : "",
        // 감춘 칸에서는 너비를 끌어 바꾸지 않는다(그 값은 매물관리 화면의 칸 너비로 저장된다)
        `${scope} [data-property-match-header] [role="separator"] { display: none !important; }`,
      ].join("\n");
    })
    .join("\n");
}

// ─── 매물 의뢰 줄이 달라졌는지 ───────────────────────────────

/**
 * 매물 의뢰 줄에서 프로젝트의 진행 계획에 영향을 주는 것만 뽑은 글. 이 글이 달라지면 진행 계획과 거래를 다시 읽는다.
 *
 * 들어가는 것: 의뢰의 생명주기 · 종료 사유, 거래 조건마다 보류 여부 · 금액 · 걸린 매칭 수 · 걸린 거래(단계 · 취소 여부).
 * 매칭 패널에서 거래로 넘기면 거래가 생기고, 고객을 연결하거나 끊으면 매칭 수가 바뀐다.
 * 고친 때(updatedAt)는 넣지 않는다 — 아무것도 달라지지 않았는데 다시 읽게 된다.
 */
export function listingRowSignature(group: {
  representative: { lifecycleStatus?: string | null; closedReason?: string | null };
  listings: ReadonlyArray<{
    id: string;
    isPaused?: boolean | null;
    price?: number | null;
    deposit?: number | null;
    monthlyRent?: number | null;
    _count?: { matches?: number | null } | null;
    deals?: ReadonlyArray<{ id: string; stage?: string | null; isCancelled?: boolean | null }> | null;
  }>;
}): string {
  return JSON.stringify([
    group.representative.lifecycleStatus ?? null,
    group.representative.closedReason ?? null,
    [...group.listings]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((listing) => [
        listing.id,
        Boolean(listing.isPaused),
        listing.price ?? null,
        listing.deposit ?? null,
        listing.monthlyRent ?? null,
        listing._count?.matches ?? 0,
        [...(listing.deals ?? [])]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((deal) => [deal.id, deal.stage ?? null, Boolean(deal.isCancelled)]),
      ]),
  ]);
}

// ─── 저장이 끝난 뒤 다시 읽을 것 ─────────────────────────────

/** mutation 하나가 끝났다는(성공 또는 실패) 알림인지 */
export function isSaveSettled(event: { type: string; action?: { type: string } }): boolean {
  return event.type === "updated" && (event.action?.type === "success" || event.action?.type === "error");
}

/** mutation 하나가 성공으로 끝났다는 알림인지 */
export function isSaveSuccess(event: { type: string; action?: { type: string } }): boolean {
  return event.type === "updated" && event.action?.type === "success";
}

/** 이 프로젝트의 진행 계획을 고치는 저장들이 서는 줄(scope) 이름. 보낸 순서대로 하나씩 처리된다. */
export function projectPlanScope(projectId: string): string {
  return `project-plan-${projectId}`;
}

/**
 * 저장 뒤에 그냥 다시 읽어도 되는 것: 단계 카드의 매물 줄, 거래(단계 · 대금 일정).
 * 화면을 먼저 바꾸는 저장이 없는 조회들이다. 진행 계획은 여기 넣지 않는다 — `canApplyRefreshedPlan`으로 조심해서 넣는다.
 * 매칭은 빌려 온 부품들이 스스로 다시 읽는다.
 */
export function projectFollowerKeysAfterSave(): ReadonlyArray<readonly unknown[]> {
  return [
    ["listing-intakes", "project-row"],
    ["deals", "detail"],
  ];
}

/**
 * 따로 받아 온 진행 계획을 화면에 넣어도 되는지.
 *
 * 받아 오기 시작한 뒤에 저장이 하나라도 시작됐거나(now가 올랐다) 지금 저장 중인 것이 있으면 안 된다:
 * 받아 온 것은 그 저장 이전의 서버 값이라, 넣으면 화면에 먼저 바꿔 둔 값(고친 메모, 끌어 놓은 순서)이 되돌아간다.
 */
export function canApplyRefreshedPlan(state: { startedAt: number; now: number; saving: number }): boolean {
  return state.startedAt === state.now && state.saving === 0;
}

/**
 * 받아 온 진행 계획을 버린 뒤에 할 일.
 *
 * - "covered": 이 결과보다 **뒤에**, 지금의 저장 차례(now)에서 시작한 받아 오기가 따로 있다. 그것이 넣을 것이므로 할 일이 없다.
 * - "wait-for-save": 저장이 아직 진행 중이다. 그 저장이 끝났다는 알림이 다시 받게 한다.
 * - "refetch-now": 저장은 이미 끝났다. 더 올 알림이 없으니 지금 다시 받는다.
 *
 * 마지막 경우를 빼먹으면(버리고 "나중에"라고만 해 두면) 다시 읽기가 영영 일어나지 않는다:
 * 받아 오는 사이에 짧은 저장이 시작해서 끝나 버리면 그 저장의 끝 알림은 이미 지나갔다.
 */
export function afterDiscardedPlan(state: {
  lastFetchEpoch: number;
  now: number;
  saving: number;
}): "covered" | "wait-for-save" | "refetch-now" {
  if (state.lastFetchEpoch === state.now && state.saving === 0) return "covered";
  return state.saving > 0 ? "wait-for-save" : "refetch-now";
}
