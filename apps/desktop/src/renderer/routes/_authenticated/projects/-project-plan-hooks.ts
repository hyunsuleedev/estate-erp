import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectPlan } from "@estate-erp/api-client";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { announceProjectChange } from "@/lib/project-sync";
import { planQueryKey } from "./-project-hooks";
import { projectPlanScope } from "./-project-model";

/*
 * 진행 계획을 프로젝트 상세에서 그 자리에서 고치는 저장(사용자 지시 2026-11-23: "진행 계획 고치기" 창 대신
 * 끌어다 놓기). 진행 계획 창과 같은 줄(scope)에 세워 보낸 순서대로 하나씩 처리한다.
 *
 * 순서 바꾸기는 응답을 기다리지 않고 화면을 먼저 바꾼다. 저장 중에 또 끌면 마지막 것이 이긴다:
 * 아직 응답이 오지 않은 가장 새 순서를 기억해 두고, 그보다 앞서 보낸 요청(순서든 체크든)의 응답이 오면
 * 그 위에 가장 새 순서를 다시 얹는다(앞 응답이 뒤 끌기를 되돌리지 않게).
 */

type StepOrder = Array<{ id: string; sortOrder: number }>;

/** 프로젝트마다 아직 응답을 받지 못한 가장 새 순서 */
const pendingOrders = new Map<string, { seq: number; order: StepOrder }>();
let orderSeq = 0;

/** 계획의 단계 순서를 주어진 순서로 바꾼다(화면이 sortOrder로 줄 세운다). */
export function overlayStepOrder(plan: ProjectPlan, order: StepOrder): ProjectPlan {
  const next = new Map(order.map((item) => [item.id, item.sortOrder]));
  return {
    ...plan,
    steps: plan.steps
      .map((step) => (next.has(step.id) ? { ...step, sortOrder: next.get(step.id)! } : step))
      .sort((left, right) => left.sortOrder - right.sortOrder),
  };
}

function usePlanApply(projectId: string) {
  const queryClient = useQueryClient();
  return (plan: ProjectPlan) => {
    const pending = pendingOrders.get(projectId);
    queryClient.setQueryData(planQueryKey(projectId), pending ? overlayStepOrder(plan, pending.order) : plan);
    // 이 화면에서 고친 것을 다른 탭(열어 둔 목록 · 옆 패널)도 다시 읽게 한다.
    announceProjectChange("changed", projectId);
    void queryClient.invalidateQueries({ queryKey: [...planQueryKey(projectId), "candidates"] });
    void queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
    void queryClient.invalidateQueries({ queryKey: ["projects", "ledger"] });
  };
}

/** 단계 추가 · 의뢰 담기 · 단계 고치기 · 빼기: 응답(새 계획)으로 바꾼다. */
export function usePlanChange(projectId: string) {
  const queryClient = useQueryClient();
  const apply = usePlanApply(projectId);
  return useMutation({
    scope: { id: projectPlanScope(projectId) },
    mutationFn: (run: () => Promise<ProjectPlan>) => run(),
    onSuccess: apply,
    onError: (error) => {
      toast.error(apiErrorMessage(error, "저장하지 못했습니다."));
      // 다른 곳에서 바뀐 계획일 수 있으니 다시 불러온다.
      void queryClient.invalidateQueries({ queryKey: planQueryKey(projectId) });
    },
  });
}

/** 순서 바꾸기(끌어다 놓기 · ⋯ 메뉴): 화면을 먼저 바꾸고 전체 단계의 sortOrder를 보낸다. */
export function usePlanReorder(projectId: string) {
  const queryClient = useQueryClient();
  const apply = usePlanApply(projectId);
  return useMutation({
    scope: { id: projectPlanScope(projectId) },
    mutationFn: (order: StepOrder) => api.projects.reorderSteps(projectId, order),
    onMutate: (order) => {
      const seq = ++orderSeq;
      pendingOrders.set(projectId, { seq, order });
      void queryClient.cancelQueries({ queryKey: planQueryKey(projectId) });
      const snapshot = queryClient.getQueryData<ProjectPlan>(planQueryKey(projectId));
      if (snapshot) queryClient.setQueryData(planQueryKey(projectId), overlayStepOrder(snapshot, order));
      return { seq, snapshot };
    },
    onSuccess: (plan, _order, context) => {
      if (pendingOrders.get(projectId)?.seq === context?.seq) pendingOrders.delete(projectId);
      apply(plan);
    },
    onError: (error, _order, context) => {
      const latest = pendingOrders.get(projectId)?.seq === context?.seq;
      if (latest) {
        pendingOrders.delete(projectId);
        // 가장 새 끌기가 실패했다: 끌기 전 모습으로 곧바로 되돌리고, 서버의 지금 순서를 다시 읽는다.
        if (context?.snapshot) queryClient.setQueryData(planQueryKey(projectId), context.snapshot);
      }
      toast.error(apiErrorMessage(error, "순서를 저장하지 못했습니다. 되돌렸습니다."));
      void queryClient.invalidateQueries({ queryKey: planQueryKey(projectId) });
    },
  });
}
