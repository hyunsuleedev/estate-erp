import { create } from 'zustand';
import {
  createTabStoreMethods,
  type TabStoreShape,
} from '../../../../common/tabs/tabStoreBindings';
import { createEmptyTabWorkspace } from '../../../../common/tabs/tabWorkspace';

/**
 * 화면 쪽 탭 store. 탭 규칙 자체는 `src/common/tabs/tabWorkspace.ts`에 있고(순수 함수,
 * main의 탭 목록과 같이 쓴다) 여기서는 그것을 zustand에 붙이기만 한다.
 */
export type {
  ClosedTabGroup,
  CreateTabInput,
  NavigateTabInput,
  NavigateTabOptions,
  OpenResourceTabInput,
  ReopenedTab,
  ReplaceTabResourceInput,
  RestoreTabLocationResult,
  TabLocation,
} from '../../../../common/tabs/tabWorkspace';
export {
  RECENTLY_CLOSED_TAB_LIMIT,
  hasUnsavedFormDraft,
} from '../../../../common/tabs/tabWorkspace';

export const useTabStore = create<TabStoreShape>((set, get) => ({
  ...createEmptyTabWorkspace(),
  ...createTabStoreMethods(get, set),
}));
