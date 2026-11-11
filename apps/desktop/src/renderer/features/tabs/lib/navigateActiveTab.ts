import {
  useTabStore,
  type NavigateTabInput,
} from '../store/useTabStore';
import { activeTabHasUnsavedWork } from './unsavedWork';

/**
 * 셸 내비게이션(사이드바)으로 활성 탭을 목적지로 이동한다.
 * 화면에 저장 전 편집이 남아 있으면 그 탭은 보존하고 목적지를 새 탭으로 연다.
 */
export async function navigateActiveTab(
  input: NavigateTabInput,
): Promise<string | null> {
  const { activeTabId, tabs } = useTabStore.getState();
  const source = tabs.find((tab) => tab.id === activeTabId);
  const preserveSource = source ? await activeTabHasUnsavedWork() : false;

  // 확인하는 사이 사용자가 다른 탭으로 옮겼다면 오래된 클릭은 적용하지 않는다.
  if (useTabStore.getState().activeTabId !== activeTabId) return null;
  return useTabStore
    .getState()
    .navigateTab(activeTabId, input, { preserveSource });
}
