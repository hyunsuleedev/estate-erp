import type { JsonValue, Tab, TabId } from '@estate-erp/shared';
import type {
  NativeTabAction,
  NativeTabRouteInput,
} from '../../../../common/nativeTabActions';
import {
  useTabStore,
  type CreateTabInput,
} from '../store/useTabStore';

export type NativeTabActionSender = (action: NativeTabAction) => void;

let pendingIdSequence = 0;

/** 셸이 실제 id를 정하는 새 탭의 자리표시 id. 페이지는 이 값을 쓰지 않는다. */
function pendingTabId(): TabId {
  pendingIdSequence += 1;
  return `pending-native-tab-${pendingIdSequence}`;
}

function routeInput(input: {
  route: string;
  kind?: NativeTabRouteInput['kind'];
  title: string;
  routeParams?: Record<string, JsonValue>;
}): NativeTabRouteInput {
  return {
    route: input.route,
    title: input.title,
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.routeParams !== undefined ? { routeParams: input.routeParams } : {}),
  };
}

function activateOption(input: Pick<CreateTabInput, 'activate'>) {
  return input.activate !== undefined ? { activate: input.activate } : {};
}

/**
 * 탭 화면(native 탭) 안의 useTabStore를 "자기 탭 하나만 담은 사본"으로 바꾼다.
 *
 * 탭 목록의 주인은 창의 셸이다. 페이지가 새 탭 열기·저장 후 탭 바꾸기·탭 닫기를
 * 하면 그 요청을 셸에 보낸다. 자기 탭에 대한 변경(제목, 입력 초안, 업무 전환)은
 * 사본에도 바로 반영해 `useTabScopedState` 같은 읽기가 그대로 동작하게 한다.
 */
export function installNativeTabStoreBridge(
  tab: Tab,
  sendAction: NativeTabActionSender,
): () => void {
  const ownId = tab.id;
  const original = useTabStore.getState();

  useTabStore.setState({
    tabs: [tab],
    activeTabId: ownId,
    recentlyClosedTabs: [],

    createTab(input) {
      sendAction({
        type: 'create-tab',
        input: {
          ...routeInput(input),
          ...activateOption(input),
          ...(input.resourceKey !== undefined
            ? { resourceKey: input.resourceKey }
            : {}),
        },
      });
      return pendingTabId();
    },

    openOrRevealResource(input) {
      sendAction({
        type: 'open-resource',
        input: {
          ...routeInput(input),
          ...activateOption(input),
          resourceKey: input.resourceKey,
        },
      });
      return pendingTabId();
    },

    openModule(input) {
      sendAction({
        type: 'open-module',
        input: { ...routeInput(input), ...activateOption(input) },
      });
      return pendingTabId();
    },

    replaceTabResource(id, input) {
      if (id !== ownId) return id;
      original.replaceTabResource(id, input);
      sendAction({
        type: 'replace-resource',
        input: { ...routeInput(input), resourceKey: input.resourceKey },
      });
      return ownId;
    },

    navigateTab(_id, input) {
      sendAction({ type: 'navigate', input: routeInput(input) });
      return ownId;
    },

    closeTab(id) {
      if (id === ownId) sendAction({ type: 'close' });
    },

    updateTabTitle(id, title) {
      if (id !== ownId) return;
      original.updateTabTitle(id, title);
      sendAction({ type: 'update-title', title });
    },

    updateTabFormDraft(id, key, value) {
      if (id !== ownId) return;
      original.updateTabFormDraft(id, key, value);
      sendAction({ type: 'update-form-draft', key, value });
    },

    clearTabFormDraft(id) {
      if (id !== ownId) return;
      original.clearTabFormDraft(id);
      sendAction({ type: 'clear-form-draft' });
    },
  });

  return () => {
    useTabStore.setState({
      tabs: original.tabs,
      activeTabId: original.activeTabId,
      recentlyClosedTabs: original.recentlyClosedTabs,
      createTab: original.createTab,
      openOrRevealResource: original.openOrRevealResource,
      openModule: original.openModule,
      replaceTabResource: original.replaceTabResource,
      navigateTab: original.navigateTab,
      closeTab: original.closeTab,
      updateTabTitle: original.updateTabTitle,
      updateTabFormDraft: original.updateTabFormDraft,
      clearTabFormDraft: original.clearTabFormDraft,
    });
  };
}

/** 탭 화면 안의 라우터가 같은 업무 안에서 옮긴 주소를 사본에 반영한다. */
export function updateNativeTabMirrorLocation(
  tabId: TabId,
  route: string,
  resourceKey: string,
): void {
  useTabStore.setState((state) => ({
    tabs: state.tabs.map((candidate) =>
      // 처음 받은 탭의 identity(launcher 등)는 주소가 실제로 바뀔 때까지 유지한다.
      candidate.id === tabId && candidate.route !== route
        ? { ...candidate, route, resourceKey }
        : candidate,
    ),
  }));
}
