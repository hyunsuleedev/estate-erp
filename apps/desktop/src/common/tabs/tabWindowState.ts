import type { TabId } from '@estate-erp/shared';
import type { TabHistoryDirection } from '../tabCommands';
import {
  adjacentHistoryIndex,
  createEmptyTabHistoryState,
  planHistoryTraversal,
  reattachReopenedHistories,
  syncTabHistory,
  withHistoryIndex,
  withPendingTraversal,
  withoutPendingTraversal,
  type TabHistoryNavigationResult,
  type TabHistoryState,
} from './tabHistory';
import {
  applyTabStep,
  createEmptyTabWorkspace,
  defaultTabWorkspaceEnv,
  hasUnsavedFormDraft,
  navigateTab,
  reopenClosedTabs,
  restoreTabLocation,
  type TabStep,
  type TabWorkspaceEnv,
  type TabWorkspaceState,
} from './tabWorkspace';

/**
 * 창 하나의 탭 상태 전체: 탭 목록과 그 탭들의 방문 기록.
 *
 * 화면에서는 두 store와 그 사이의 구독이 하던 일을, 여기서는 한 값과 순수 함수로
 * 묶는다. main의 탭 목록과 브라우저 미리보기가 쓴다.
 */
export interface TabWindowState {
  workspace: TabWorkspaceState;
  history: TabHistoryState;
}

export interface TabWindowResult<R> {
  state: TabWindowState;
  result: R;
}

export function createEmptyTabWindowState(): TabWindowState {
  return {
    workspace: createEmptyTabWorkspace(),
    history: createEmptyTabHistoryState(),
  };
}

/** 탭 목록을 바꾸고, 바뀐 만큼 방문 기록에 반영한다. 바뀐 것이 없으면 같은 값을 돌려준다. */
export function commitWorkspace(
  state: TabWindowState,
  workspace: TabWorkspaceState,
): TabWindowState {
  if (workspace === state.workspace) return state;
  return {
    workspace,
    history: syncTabHistory(state.history, state.workspace, workspace),
  };
}

/** 탭 목록 동작 하나(tabWorkspace.ts의 함수 결과)를 창 상태에 적용한다. */
export function applyWorkspaceStep<R>(
  state: TabWindowState,
  step: TabStep<R>,
): TabWindowResult<R> {
  return {
    state: commitWorkspace(state, applyTabStep(state.workspace, step)),
    result: step.result,
  };
}

export interface TraverseHistoryInput {
  /** 생략하면 활성 탭. */
  tabId?: TabId;
  index: number;
  /**
   * 탭에 보관된 입력 초안 말고도 저장 전 입력이 있는지(열린 편집기, 진행 중인 저장 등).
   * 부르는 쪽이 탭 화면의 보고로 판단해 넘긴다.
   */
  hasExternalUnsavedWork: boolean;
}

/**
 * 탭을 기록의 index 칸으로 옮긴다. 저장 전 입력이 남아 있으면 그 탭을 덮어쓰지 않고
 * 목적지를 새 탭으로 연다(같은 업무 안의 이동이면 움직이지 않는다).
 */
export function traverseTabHistory(
  state: TabWindowState,
  input: TraverseHistoryInput,
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabWindowResult<TabHistoryNavigationResult> {
  const id = input.tabId ?? state.workspace.activeTabId;
  const tab = state.workspace.tabs.find((candidate) => candidate.id === id);
  if (!tab || !id) return { state, result: 'ignored' };
  const history = state.history.histories[id];
  const plan = planHistoryTraversal(
    tab,
    history,
    input.index,
    hasUnsavedFormDraft(tab) || input.hasExternalUnsavedWork,
  );

  switch (plan.kind) {
    case 'ignored':
      return { state, result: 'ignored' };
    case 'blocked-by-unsaved-work':
      return { state, result: 'blocked-by-unsaved-work' };
    case 'open-in-new-tab': {
      const { target } = plan;
      const step = navigateTab(
        state.workspace,
        id,
        {
          route: target.route,
          title: target.title,
          kind: target.kind,
          routeParams: target.routeParams,
        },
        { preserveSource: true },
        env,
      );
      return { state: applyWorkspaceStep(state, step).state, result: 'opened-in-new-tab' };
    }
    case 'move-index':
      return {
        state: { ...state, history: withHistoryIndex(state.history, id, plan.index) },
        result: 'navigated',
      };
    case 'restore': {
      const pending: TabWindowState = {
        ...state,
        history: withPendingTraversal(state.history, id, {
          route: plan.target.route,
          index: plan.index,
        }),
      };
      const restored = applyWorkspaceStep(
        pending,
        restoreTabLocation(pending.workspace, id, plan.target),
      );
      const status = restored.result.status;
      const next =
        status === 'navigated'
          ? restored.state
          : {
              ...restored.state,
              history: withoutPendingTraversal(restored.state.history, id),
            };
      return {
        state: next,
        result: status === 'blocked' ? 'blocked-by-unsaved-work' : status,
      };
    }
  }
}

/** 뒤로/앞으로 한 칸. 갈 곳이 없으면 'ignored'. */
export function navigateTabHistory(
  state: TabWindowState,
  direction: TabHistoryDirection,
  options: { tabId?: TabId; hasExternalUnsavedWork: boolean },
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabWindowResult<TabHistoryNavigationResult> {
  const id = options.tabId ?? state.workspace.activeTabId;
  const index = id
    ? adjacentHistoryIndex(state.history.histories[id], direction)
    : null;
  if (!id || index === null) return { state, result: 'ignored' };
  return traverseTabHistory(
    state,
    { tabId: id, index, hasExternalUnsavedWork: options.hasExternalUnsavedWork },
    env,
  );
}

/** 가장 최근에 닫은 탭 묶음을 다시 열고, 닫기 전 방문 기록을 이어 붙인다. */
export function reopenLastClosedTabs(
  state: TabWindowState,
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabWindowResult<TabId | null> {
  // 다시 열면 그 묶음이 닫은 목록에서 빠져 기록도 정리되므로 먼저 챙겨 둔다.
  const savedRetired = { ...state.history.retired };
  const reopened = applyWorkspaceStep(state, reopenClosedTabs(state.workspace, env));
  if (reopened.result.length === 0) return { state, result: null };
  return {
    state: {
      ...reopened.state,
      history: reattachReopenedHistories(
        reopened.state.history,
        savedRetired,
        reopened.result,
      ),
    },
    result: reopened.result[0]?.tabId ?? null,
  };
}
