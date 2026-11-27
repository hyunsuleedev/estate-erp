import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { CreateProjectDto, ProjectPlan, UpdateProjectDto } from "@estate-erp/api-client";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { announceProjectChange, listenToProjectChanges } from "@/lib/project-sync";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { tabResourceKeys } from "@/features/tabs/lib/tabResource";
import { useTabStore } from "@/features/tabs/store/useTabStore";
import {
  COMMENT_SAVE_MUTATION_KEY,
  getProjectTitle,
  mergeProjectUpdate,
  PROJECT_ARCHIVE_NOTE,
  settleSavedCommentDraft,
  type CommentDraftStore,
  type CommentSaveRequest,
  isSaveSettled,
  isSaveSuccess,
  afterDiscardedPlan,
  canApplyRefreshedPlan,
  projectFollowerKeysAfterSave,
  projectPlanScope,
} from "./-project-model";

/** 프로젝트 하나의 상세(사람 · 진행 계획). 진행 계획 창과 같은 이름표라 그 창에서 고친 것이 바로 보인다. */
export const planQueryKey = (id: string) => ["projects", "plan", id] as const;
export const commentsQueryKey = (id: string) => ["projects", "comments", id] as const;

/**
 * 다른 탭에서 프로젝트를 고치거나 풀면 이 탭이 들고 있는 프로젝트 데이터를 서버에서 다시 읽는다.
 * 프로젝트를 보여 주는 화면(목록 · 상세 · 고객 원장)마다 한 번 부른다.
 *
 * 풀린 프로젝트의 상세는 다시 읽으면 "없음"이 와서 "찾을 수 없습니다" 화면으로 바뀐다.
 * 고치던 칸은 덮이지 않는다(글 칸은 고치는 동안 바깥 값을 따라가지 않는다).
 */
export function useProjectChangesFromOtherTabs() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      listenToProjectChanges(() => {
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
      }),
    [queryClient],
  );
}

/** 토스트에 보일 오류 문구. 서버가 준 사람용 문구가 없으면 fallback (공용 apiErrorMessage). */
export function errorMessage(error: unknown, fallback: string) {
  return apiErrorMessage(error, fallback);
}

/**
 * 프로젝트의 칸(이름 · 메모 · 대표 고객 · 담당 · 끝냈는지)을 고친다. 옆 패널과 상세 페이지가 함께 쓴다.
 *
 * - 진행 계획 창과 같은 줄에 세운다: 이 프로젝트를 고치는 요청은 보낸 순서대로 하나씩 처리된다.
 * - 글 칸은 응답을 기다리지 않고 바로 반영한다(칸이 예전 글로 잠깐 돌아가지 않게).
 * - 응답은 그 요청이 고친 칸만 덮는다(그 사이에 고친 다른 칸이 예전 값으로 돌아가지 않게).
 * - 같은 칸을 이어서 두 번 고치면, 먼저 보낸 요청의 응답은 그 칸을 덮지 않는다(나중에 적은 글이 잠깐
 *   앞 글로 돌아가지 않게). 그 칸은 나중 요청의 응답이 덮는다.
 */
export function useProjectUpdate(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateProjectDto) => api.projects.update(projectId, dto),
    scope: { id: projectPlanScope(projectId) },
    onMutate: (dto) => {
      for (const field of Object.keys(dto)) markPendingWrite(projectId, field, 1);
      const previous = queryClient.getQueryData<ProjectPlan>(planQueryKey(projectId));
      queryClient.setQueryData<ProjectPlan>(planQueryKey(projectId), (current) =>
        current
          ? {
              ...current,
              ...(dto.title !== undefined ? { title: dto.title } : {}),
              ...(dto.memo !== undefined ? { memo: dto.memo } : {}),
            }
          : current,
      );
      return { previousTitle: previous?.title ?? null, previousMemo: previous?.memo ?? null };
    },
    onSuccess: (response, dto) => {
      // 이 요청 뒤에 같은 칸을 고치는 요청이 기다리고 있으면 그 칸은 덮지 않는다.
      const settled = Object.fromEntries(
        Object.entries(dto).filter(([field]) => pendingWrites(projectId, field) <= 1),
      ) as UpdateProjectDto;
      queryClient.setQueryData<ProjectPlan>(planQueryKey(projectId), (current) =>
        mergeProjectUpdate(current, response, settled),
      );
      void queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "ledger"] });
      announceProjectChange("changed", projectId);
      // 끝내기 · 다시 열기는 무엇이 바뀌었는지 알린다("종료"를 계약이 끝났다는 뜻으로 읽지 않게).
      if (dto.archived === true) {
        toast.success("프로젝트를 끝냈습니다.", { description: PROJECT_ARCHIVE_NOTE });
      } else if (dto.archived === false) {
        toast.success("프로젝트를 다시 열었습니다.");
      }
    },
    onError: (error, dto, context) => {
      toast.error(errorMessage(error, "프로젝트를 고치지 못했습니다."));
      // 바로 반영해 둔 글을 보내기 전 값으로 곧바로 되돌린다(같은 칸을 고치는 더 새 요청이 뒤에 있으면 그 칸은 둔다).
      // 적은 글은 글 칸(SavedText)이 "저장하지 못함"으로 붙들고 있다. 서버 값도 다시 읽는다.
      if (context) {
        const revertTitle = dto.title !== undefined && pendingWrites(projectId, "title") <= 1;
        const revertMemo = dto.memo !== undefined && pendingWrites(projectId, "memo") <= 1;
        queryClient.setQueryData<ProjectPlan>(planQueryKey(projectId), (current) =>
          current
            ? {
                ...current,
                ...(revertTitle ? { title: context.previousTitle } : {}),
                ...(revertMemo ? { memo: context.previousMemo } : {}),
              }
            : current,
        );
      }
      void queryClient.invalidateQueries({ queryKey: planQueryKey(projectId) });
    },
    onSettled: (_data, _error, dto) => {
      for (const field of Object.keys(dto)) markPendingWrite(projectId, field, -1);
    },
  });
}

/**
 * 프로젝트의 칸마다 "보냈고 아직 끝나지 않은 고치기 요청" 수. 화면(패널 · 상세)이 같은 탭에서 함께 본다.
 * 요청은 보낸 순서대로 하나씩 처리되므로, 내 차례에 이 수가 1보다 크면 같은 칸을 고치는 더 새 요청이 뒤에 있다.
 */
const pendingWriteCounts = new Map<string, number>();
function markPendingWrite(projectId: string, field: string, delta: number) {
  const key = `${projectId}:${field}`;
  const next = (pendingWriteCounts.get(key) ?? 0) + delta;
  if (next > 0) pendingWriteCounts.set(key, next);
  else pendingWriteCounts.delete(key);
}
function pendingWrites(projectId: string, field: string) {
  return pendingWriteCounts.get(`${projectId}:${field}`) ?? 0;
}

/**
 * 이 탭에서 푼 프로젝트. 풀고 나서 닫히는 중인 패널 · 상세 · 진행 계획 창이 없어진 프로젝트를 다시 읽어
 * "찾을 수 없음"(404)을 받지 않게, 그 프로젝트를 읽는 쿼리는 이것을 보고 멈춘다.
 * 쿼리를 지우기 전에 표시해야 한다(지우면 화면이 다시 그려지며 새로 읽으려 한다).
 */
const removedProjectIds = new Set<string>();
export function markProjectRemoved(projectId: string) {
  removedProjectIds.add(projectId);
}
export function isProjectRemoved(projectId: string) {
  return removedProjectIds.has(projectId);
}

/** 프로젝트를 푼다. 의뢰와 거래는 남고 프로젝트 · 진행 계획 · 코멘트가 지워진다. */
export function useProjectRemove(projectId: string, onRemoved: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    /** empty: 아무것도 적지 않은 빈 프로젝트를 지운다(알림 말만 다르다) */
    mutationFn: (_options: { empty?: boolean } | void) => api.projects.remove(projectId),
    onSuccess: (_result, options) => {
      markProjectRemoved(projectId);
      toast.success(
        options && options.empty
          ? "빈 프로젝트를 지웠습니다."
          : "프로젝트를 풀었습니다. 의뢰와 거래는 그대로 있습니다.",
      );
      queryClient.removeQueries({ queryKey: planQueryKey(projectId) });
      queryClient.removeQueries({ queryKey: commentsQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "ledger"] });
      announceProjectChange("removed", projectId);
      onRemoved();
    },
    onError: (error) => {
      toast.error(errorMessage(error, "프로젝트를 풀지 못했습니다."));
    },
  });
}

/**
 * 코멘트 저장. 적는 칸이 아니라 화면이 쥔다: 패널을 닫거나 다른 프로젝트로 옮겨도 저장은 끝까지 가고,
 * 다시 연 적는 칸도 같은 이름표로 "저장 중"을 알아본다(같은 글을 두 번 보내지 않는다).
 *
 * @param isComposerVisible 그 프로젝트의 적는 칸이 지금 화면에 있는지. 있으면 결과를 그 칸이 보여 주므로
 *   알림을 띄우지 않는다(알림이 아래 막대의 단추를 가린다).
 */
export function useCommentSave(
  drafts: CommentDraftStore,
  isComposerVisible: (projectId: string) => boolean,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: COMMENT_SAVE_MUTATION_KEY,
    mutationFn: (request: CommentSaveRequest) =>
      api.comments.create({ projectId: request.projectId, body: request.body }),
    onSuccess: async (_comment, request) => {
      // 보낸 글과 남아 있는 글이 같을 때만 지운다.
      settleSavedCommentDraft(drafts, request);
      if (!isComposerVisible(request.projectId)) toast.success("코멘트를 적었습니다.");
      announceProjectChange("changed", request.projectId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: commentsQueryKey(request.projectId) }),
        queryClient.invalidateQueries({ queryKey: ["projects", "list"] }),
      ]);
    },
    onError: (_error, request) => {
      if (!isComposerVisible(request.projectId)) {
        toast.error("코멘트를 저장하지 못했습니다. 적은 글은 남아 있습니다.");
      }
    },
  });
}

/**
 * 지금 만들고 있는 새 프로젝트(이 화면 전체에서 하나). 단추를 빨리 두 번 눌러도 프로젝트 하나 · 탭 하나만 생기게
 * 두 번째 요청을 보내지 않는다(isPending은 다음 그리기에야 바뀌어 막지 못한다).
 */
let openingNewProject = false;

/**
 * 프로젝트 열기 (사용자 결정, 2026-11-22 — Notion의 새 페이지처럼): 누르는 순간 빈 프로젝트를 만들고 그 문서를
 * 새 탭으로 연다. 프로젝트는 작업 공간이라 이름 · 대표 고객 · 의뢰가 없어도 열린다(나중에 채운다).
 * 담당은 서버가 만든 사람으로 넣는다. 새 문서는 `?new=1`로 열려 제목 칸에 커서가 놓인다.
 *
 * 탭은 옆 패널의 "새 탭으로 열기"와 같은 길(openOrRevealResource)로 연다. 실패하면 알림에서 다시 시도한다.
 */
export function useOpenNewProject() {
  const queryClient = useQueryClient();
  const openOrRevealResource = useTabStore((state) => state.openOrRevealResource);
  const mutation = useMutation({
    mutationFn: (dto: CreateProjectDto) => api.projects.create(dto),
    onSuccess: (project) => {
      // 새 탭(같은 화면이면)이 바로 그려지게 만든 결과를 상세 쿼리에 먼저 넣는다.
      queryClient.setQueryData(planQueryKey(project.id), project);
      announceProjectChange("changed", project.id);
      void queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["projects", "ledger"] });
      const route = `/projects/${project.id}?new=1`;
      const meta = getRouteMeta(route);
      openOrRevealResource({
        route,
        kind: meta.kind,
        title: getProjectTitle({
          title: project.title,
          customerName: project.people[0]?.name ?? null,
          firstStepTitle: null,
        }),
        resourceKey: tabResourceKeys.entity("project", project.id),
      });
    },
    onError: (error, dto) => {
      const reason = apiErrorMessage(error, "");
      toast.error("프로젝트를 열지 못했습니다", {
        description: reason && reason !== "프로젝트를 열지 못했습니다." ? reason : undefined,
        action: { label: "다시 시도", onClick: () => open(dto) },
      });
    },
    onSettled: () => {
      openingNewProject = false;
    },
  });
  const open = (dto: CreateProjectDto = {}) => {
    if (openingNewProject) return;
    openingNewProject = true;
    mutation.mutate(dto);
  };
  return { open, isPending: mutation.isPending };
}

/**
 * 다른 화면에서 빌려 온 부품이 저장을 끝내면 진행 계획과 그에 딸린 조회를 다시 읽는다.
 *
 * 단계 카드는 다른 화면의 부품을 그대로 쓴다(매물관리의 매칭 패널, 희망매물의 매칭 묶음과 거래 전환 창).
 * 그 부품들은 자기 화면에서 필요한 것만 다시 읽는다 — 거래 전환 창은 매칭과 거래만, 매칭 패널은 매칭과 매물만.
 * 프로젝트의 진행 계획은 아무도 다시 읽지 않아서, 카드에서 거래로 넘겨도 이 화면의 단계 상태 · 거래 흐름 ·
 * 거래·보수 탭이 그대로 남는다. 그 부품들은 다른 세션이 고치는 다른 화면의 것이라 여기서 고칠 수 없으므로,
 * "저장이 끝났다"는 사실 자체(mutation 성공)를 듣고 이 화면의 것을 다시 읽는다.
 *
 * 진행 계획은 **조심해서** 다시 읽는다. 이 화면의 글 칸(이름 · 메모)과 순서 바꾸기는 응답을 기다리지 않고
 * 화면을 먼저 바꾸고, 응답은 고친 칸만 덮는다. 여기에 그냥 "다시 읽어라"(invalidate)를 걸면, 다시 읽기를 시작한
 * 뒤에 사용자가 메모를 고쳤을 때 늦게 온 응답(고치기 전의 서버 값)이 저장 중인 메모를 예전 글로 되돌린다
 * (실제 화면에서 재현: 2초 동안 예전 글이 보였다). 그래서:
 *
 * - 진행 계획은 따로 받아 와, **받아 오는 동안 어떤 저장도 시작되지 않았고 지금 저장 중인 것도 없을 때만** 넣는다.
 *   그 사이에 저장이 시작됐으면 받아 온 것은 버리고, 그 저장이 끝난 뒤 다시 받는다.
 * - 이 화면 자신의 진행 계획 저장(이름 · 메모 · 담당 · 단계 · 순서 — 같은 줄 `project-plan-<id>`)은 응답으로
 *   계획을 스스로 맞추므로 다시 읽을 이유가 아니다. 빌려 온 부품의 저장만 이유가 된다.
 * - 매물 줄과 거래는 화면을 먼저 바꾸는 저장이 없어 그냥 다시 읽는다.
 */
export function useRefreshAfterSaves(projectId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    // 마지막으로 다시 읽은 뒤에 끝난, 다시 읽을 이유가 되는 저장이 있는지
    let dirty = false;
    // 저장이 하나 시작될 때마다 올라간다. 받아 오는 동안 올랐으면 그 결과는 낡았다.
    let saveEpoch = 0;
    // 가장 최근에 받아 오기 시작한 때의 saveEpoch. 버린 결과보다 새로 시작한 받아 오기가 있는지 볼 때 쓴다.
    let lastFetchEpoch = -1;
    let disposed = false;
    const ownScope = projectPlanScope(projectId);

    const refresh = async () => {
      timer = null;
      // 아직 저장 중인 것이 있으면 그것이 끝날 때(성공이든 실패든) 다시 불린다.
      if (queryClient.isMutating() > 0 || !dirty) return;
      dirty = false;
      for (const queryKey of projectFollowerKeysAfterSave()) {
        void queryClient.invalidateQueries({ queryKey });
      }
      const startedAt = saveEpoch;
      lastFetchEpoch = startedAt;
      let fresh: ProjectPlan;
      try {
        fresh = await api.projects.findOne(projectId);
      } catch {
        // 못 받아 왔다. 다음 저장이 끝날 때 다시 받는다(화면으로 돌아올 때는 조회가 스스로 다시 읽는다).
        if (!disposed) dirty = true;
        return;
      }
      if (disposed) return;
      const saving = queryClient.isMutating();
      if (canApplyRefreshedPlan({ startedAt, now: saveEpoch, saving })) {
        queryClient.setQueryData(planQueryKey(projectId), fresh);
        return;
      }
      // 받아 오는 사이에 저장이 시작됐다. 이 결과는 그 저장 이전의 것이라 넣지 않는다 — 대신 꼭 다시 받는다.
      const next = afterDiscardedPlan({ lastFetchEpoch, now: saveEpoch, saving });
      if (next === "covered") return;
      dirty = true;
      // 그 저장이 아직 진행 중이면 끝날 때(아래 알림) 다시 받는다. 이미 끝났으면 알려 줄 것이 더 없으므로
      // 지금 바로 다시 받는다 — 여기서 기다리기만 하면 다시 읽기가 통째로 빠진다(짧은 저장이 받아 오는 사이에
      // 시작해서 끝난 경우. 실제 화면에서 재현했다).
      if (next === "refetch-now" && timer === null) timer = setTimeout(() => void refresh(), 0);
    };

    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "added") {
        saveEpoch += 1;
        return;
      }
      if (!isSaveSettled(event)) return;
      if (isSaveSuccess(event) && event.mutation?.options.scope?.id !== ownScope) dirty = true;
      // 실패로 끝난 저장, 이 화면 자신의 저장이 끝난 것도 듣는다: 미뤄 둔 다시 읽기를 그때 한다.
      if (timer === null) timer = setTimeout(() => void refresh(), 0);
    });
    return () => {
      disposed = true;
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, [queryClient, projectId]);
}
