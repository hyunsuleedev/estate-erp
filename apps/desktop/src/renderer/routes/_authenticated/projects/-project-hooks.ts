import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ProjectPlan, UpdateProjectDto } from "@estate-erp/api-client";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { announceProjectChange, listenToProjectChanges } from "@/lib/project-sync";
import {
  COMMENT_SAVE_MUTATION_KEY,
  mergeProjectUpdate,
  settleSavedCommentDraft,
  type CommentDraftStore,
  type CommentSaveRequest,
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

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
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
    scope: { id: `project-plan-${projectId}` },
    onMutate: (dto) => {
      for (const field of Object.keys(dto)) markPendingWrite(projectId, field, 1);
      queryClient.setQueryData<ProjectPlan>(planQueryKey(projectId), (current) =>
        current
          ? {
              ...current,
              ...(dto.title !== undefined ? { title: dto.title } : {}),
              ...(dto.memo !== undefined ? { memo: dto.memo } : {}),
            }
          : current,
      );
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
    },
    onError: (error) => {
      toast.error(errorMessage(error, "프로젝트를 고치지 못했습니다."));
      // 바로 반영해 둔 글을 서버 값으로 되돌린다.
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

/** 프로젝트를 푼다. 의뢰와 거래는 남고 프로젝트 · 진행 계획 · 코멘트가 지워진다. */
export function useProjectRemove(projectId: string, onRemoved: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.projects.remove(projectId),
    onSuccess: () => {
      toast.success("프로젝트를 풀었습니다. 의뢰와 거래는 그대로 있습니다.");
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
      api.projects.createComment(request.projectId, request.body),
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
