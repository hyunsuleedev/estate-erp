import { useEffect, useRef } from 'react';
import { useTabStore } from '@/features/tabs/store/useTabStore';

/**
 * 상세 화면이 자기 이름을 탭 제목으로 알린다.
 * 링크로 연 상세 탭은 처음에 화면 종류("프로젝트 상세")로만 보이므로, 불러온 뒤 이렇게 부른다:
 *
 *   useTabTitle(project ? project.title ?? project.customerName : null);
 *   useTabTitle(contact?.name);
 *   useTabTitle(place ? `${siteName} ${formatDongUnitLabel(dong, unit)}` : null);
 *
 * - 비었거나(null·'') 아직 불러오는 중이면 아무것도 하지 않는다(화면 종류 제목이 그대로 남는다).
 * - 화면이 처음 그려질 때의 탭(그 화면을 가진 탭)에만 적는다. 그 사이 다른 탭으로 옮겨도 남의 탭을 바꾸지 않는다.
 * - Electron 탭 화면에서는 탭 저장소가 main에 'update-title'로 넘긴다(nativeTabStoreBridge).
 *   같은 업무(같은 resourceKey) 안에서 주소만 바뀌면 붙인 제목이 유지된다(TabContent의 keepsCustomTitle).
 */
export function useTabTitle(title: string | null | undefined): void {
  const ownerTabIdRef = useRef(useTabStore.getState().activeTabId);
  useEffect(() => {
    const next = title?.trim();
    const tabId = ownerTabIdRef.current;
    if (!next || !tabId) return;
    const tab = useTabStore.getState().tabs.find((item) => item.id === tabId);
    if (!tab || tab.title === next) return;
    useTabStore.getState().updateTabTitle(tabId, next);
  }, [title]);
}
