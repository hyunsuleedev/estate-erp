import type {
  ProjectComment,
  ProjectCommentList,
  ProjectList,
  ProjectListItem,
  ProjectListSort,
  ProjectListStatus,
  ProjectPerson,
  ProjectPlan,
  UpdateProjectDto,
} from "@estate-erp/api-client";

/** 목록의 보기 탭. 끝냈는지는 사용자가 직접 정한다(archivedAt). */
export const PROJECT_STATUS_OPTIONS: ReadonlyArray<{
  value: Exclude<ProjectListStatus, "all">;
  label: string;
}> = [
  { value: "open", label: "진행 중" },
  { value: "archived", label: "끝남" },
];

export const PROJECT_PERSON_ROLE_LABELS: Record<ProjectPerson["role"], string> = {
  primary: "대표 고객",
  buyer: "구함 의뢰",
  owner: "소유자",
};

type TitleSource = Pick<ProjectListItem, "title" | "customerName" | "firstStepTitle">;

/** 이름을 정하지 않은 프로젝트는 손님 이름으로, 손님도 없으면 첫 단계로 부른다. */
export function getProjectTitle(project: TitleSource) {
  const title = project.title?.trim();
  if (title) return title;
  if (project.customerName) return `${project.customerName}님 프로젝트`;
  return project.firstStepTitle ?? "이름 없는 프로젝트";
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
 * - archived 끝남: 사용자가 끝냈다
 */
export type ProjectStatus = "preparing" | "active" | "wrapping" | "archived";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  preparing: "준비",
  active: "진행 중",
  wrapping: "마무리",
  archived: "끝남",
};

export const PROJECT_STATUS_HINTS: Record<ProjectStatus, string> = {
  preparing: "아직 담은 의뢰나 정한 단계가 없습니다",
  active: "끝나지 않은 단계가 있습니다",
  wrapping: "단계가 모두 끝났습니다. 프로젝트를 끝낼 차례입니다",
  archived: "끝낸 프로젝트입니다",
};

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

/** 정렬은 서버가 한다(목록을 쪽 단위로 받으므로 화면에서 다시 줄 세우지 않는다). */
export const PROJECT_SORT_OPTIONS: ReadonlyArray<{ value: ProjectListSort; label: string }> = [
  { value: "updated", label: "최근 고친 순" },
  { value: "created", label: "최근 시작한 순" },
];
export const DEFAULT_PROJECT_SORT: ProjectListSort = "updated";

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
export function mergeCommentPages(pages: readonly ProjectCommentList[] | undefined) {
  const seen = new Set<string>();
  const rows: ProjectComment[] = [];
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
 * 종료된 것은 줄로 늘어놓지 않고 몇 건인지만 말한다(지금 할 일이 아니다).
 */
export function splitMatches<T extends { id: string; stage: string; updatedAt: string }>(
  matches: readonly T[],
) {
  const active = matches
    .filter((match) => match.stage !== MATCH_STAGE_CLOSED)
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
    );
  return { active, closedCount: matches.length - active.length };
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
 * 집을 부르는 이름: "고덕그라시움 101동 3501". 동 구분이 없는 건물은 동을 뺀다.
 * 호 이름은 넘겨받은 함수로 만든다(호 없이 층이 단위인 공간은 층으로 부른다 — shared의 formatUnitName).
 */
export function describePlace(
  property: PlaceSource | null | undefined,
  formatUnit: (unit: NonNullable<PlaceSource["unit"]>) => string,
) {
  if (!property) return "매물";
  const dong = property.unit?.dong;
  return (
    [
      property.site?.name,
      dong && !dong.isPlaceholder ? (dong.name.endsWith("동") ? dong.name : `${dong.name}동`) : null,
      property.unit ? formatUnit(property.unit) || null : null,
    ]
      .filter(Boolean)
      .join(" ") || "매물"
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
