import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { TabBarAction } from '../../../../common/tabs/tabBarContract';
import type { TabBarPort, TabBarView } from '../../../../common/tabs/tabBarPort';

/**
 * 탭바 부품이 보는 것과 보내는 곳. 탭 목록의 주인이 누구든(Electron에서는 main, 브라우저
 * 단독 미리보기에서는 그 문서의 탭 store) 같은 부품이 그린다. 이 파일과 탭바 부품은
 * 앱의 store·라우터·서버 호출을 끌어오지 않는다: 탭바 문서가 작게 유지돼야 한다.
 */
const TabBarPortContext = createContext<TabBarPort | null>(null);

export function TabBarProvider({
  port,
  children,
}: {
  port: TabBarPort;
  children: ReactNode;
}) {
  return (
    <TabBarPortContext.Provider value={port}>{children}</TabBarPortContext.Provider>
  );
}

/** 이 창의 탭바 상태와, 사용자가 한 동작을 보내는 함수. */
export function useTabBar(): {
  view: TabBarView;
  dispatch: (action: TabBarAction) => void;
} {
  const port = useContext(TabBarPortContext);
  if (!port) throw new Error('TabBarProvider is missing');
  const view = useSyncExternalStore(port.subscribe, port.getView, port.getView);
  return { view, dispatch: port.dispatch };
}
