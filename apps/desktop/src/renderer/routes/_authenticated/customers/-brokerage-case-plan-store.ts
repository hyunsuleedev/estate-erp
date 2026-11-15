import { useSyncExternalStore } from "react";
import type { BrokerageCase } from "@estate-erp/api-client";

/**
 * 지금 열려 있는 진행 계획 창이 무엇을 보여 주는지.
 *
 * 창은 고객 원장의 한 줄(메뉴)에서 열지만 그 줄 안에 두지 않는다. 원장이 다시
 * 불러와져 줄이 새로 그려지거나(묶으면 줄의 id가 건 id로 바뀐다) 목록에서 빠져도
 * 창과 입력 중인 글이 그대로 남도록, 화면에 하나뿐인 자리(BrokerageCasePlanHost)가
 * 이 값을 보고 창을 띄운다.
 */
export type BrokerageCasePlanTarget =
  | {
      /** 이미 있는 건의 진행 계획. */
      kind: "case";
      caseId: string;
      customerName: string | null;
    }
  | {
      /** 건이 없는 원장 줄. 묶을지 묻는다. row는 연 시점의 값이다. */
      kind: "bundle";
      row: BrokerageCase;
      customerName: string;
    };

let current: BrokerageCasePlanTarget | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function openBrokerageCasePlan(target: BrokerageCasePlanTarget) {
  current = target;
  emit();
}

export function closeBrokerageCasePlan() {
  if (current === null) return;
  current = null;
  emit();
}

export function useBrokerageCasePlanTarget() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}
