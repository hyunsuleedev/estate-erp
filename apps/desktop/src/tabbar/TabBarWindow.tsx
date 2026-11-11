import { useEffect, useRef, useSyncExternalStore } from 'react';
import { PanelLeft } from 'lucide-react';
import { acceptAppTabDrops } from '../common/tabs/tabDrag';
import { tabBarChrome } from '../common/tabs/tabBarModel';
import type { TabBarPort } from '../common/tabs/tabBarPort';
import { TabBar } from '../renderer/features/tabs/TabBar/TabBar';
import { TabBarProvider } from '../renderer/features/tabs/TabBar/tabBarContext';
import { TabNavigationButtons } from '../renderer/features/tabs/TabBar/TabNavigationButtons';

/**
 * 로그인 뒤의 창 자체의 화면: 맨 위 40px의 탭바만 그린다. 탭바 아래(사이드바 + 화면)는
 * 탭마다의 탭 화면이 그 위에 붙어서 그린다(Notion 방식). 여기서는 main이 보내 준 상태를
 * 그리고 사용자가 한 동작을 보내기만 한다.
 */
export function TabBarWindow({ port }: { port: TabBarPort }) {
  const view = useSyncExternalStore(port.subscribe, port.getView, port.getView);
  const isDetached = view.windowKind === 'detached';
  // macOS 창 모드: 신호등 버튼 80px + 여백 12px. 전체 화면과 다른 플랫폼은 16px.
  const { reserveTrafficLights, reserveWindowControls } = tabBarChrome(view);

  // 탭 단축키는 main이 받는다. macOS 마우스 사이드 버튼(3=뒤로, 4=앞으로)만 여기서 받아 보낸다.
  useEffect(() => {
    if (view.platform !== 'darwin') return;
    const onMouseUp = (event: MouseEvent) => {
      const direction =
        event.button === 3 ? 'back' : event.button === 4 ? 'forward' : null;
      if (!direction) return;
      event.preventDefault();
      port.dispatch({ type: 'command', command: { type: 'history', direction } });
    };
    window.addEventListener('mouseup', onMouseUp, true);
    return () => window.removeEventListener('mouseup', onMouseUp, true);
  }, [port, view.platform]);

  // 탭 줄 아래의 바탕(탭 화면이 아직 붙지 않았을 때 보이는 자리)도 탭 끌기를 받는 자리로
  // 답한다. 탭 화면과 같은 규칙이다: 받기만 하고, 새 창으로 옮기는 요청은 끌기를 시작한
  // 탭 줄이 보낸다. 탭 줄(header) 안에서는 탭 줄이 직접 정한다.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(
    () =>
      acceptAppTabDrops<DragEvent>(document, {
        skip: (event) =>
          event.target instanceof Node &&
          Boolean(headerRef.current?.contains(event.target)),
      }),
    [],
  );

  return (
    <TabBarProvider port={port}>
      <div
        data-window-shell={isDetached ? 'detached' : 'main'}
        className="flex h-full w-full flex-col bg-background"
      >
        <header
          ref={headerRef}
          className="app-titlebar flex h-10 shrink-0 items-center gap-0 border-b border-border bg-sidebar pr-2"
        >
          {isDetached ? (
            // 분리된 창은 옮겨 온 탭만 다룬다. 새 탭은 메인 창에서 연다.
            <div
              data-slot="detached-titlebar-spacer"
              className={`${reserveTrafficLights ? 'w-[92px]' : 'w-4'} h-full shrink-0`}
              aria-hidden
            />
          ) : (
            <div
              className={`app-titlebar-drag-region flex h-full w-(--sidebar-width) shrink-0 items-center gap-1 ${
                reserveTrafficLights ? 'pl-[92px]' : 'pl-4'
              }`}
            >
              <span
                data-slot="desktop-brand"
                className="mr-2 select-none text-sm font-semibold tracking-[-0.02em] text-sidebar-foreground"
              >
                Estaitt
              </span>
              <span
                data-slot="titlebar-brand-spacer"
                className="min-w-0 flex-1"
                aria-hidden
              />
              {/* 사이드바 펼침은 창 단위 상태다. main이 갖고 그 창의 탭 화면들이 따른다. */}
              <button
                type="button"
                data-slot="sidebar-trigger"
                aria-label="Toggle Sidebar"
                aria-pressed={view.sidebarOpen}
                onClick={() => port.dispatch({ type: 'toggle-sidebar' })}
                className="-ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring"
              >
                <PanelLeft className="size-4" />
              </button>
              <div
                data-slot="titlebar-separator"
                className="ml-1 mr-0 w-px self-stretch bg-border"
                aria-hidden
              />
            </div>
          )}
          <TabNavigationButtons className={isDetached ? 'pr-2' : 'px-2'} />
          <TabBar
            className="min-w-0"
            showNewTabButton={view.canCreateTabs}
            detachable
          />
          {/* Windows: titleBarOverlay 자리 확보 */}
          {reserveWindowControls ? (
            <div className="w-[140px] shrink-0" aria-hidden />
          ) : null}
        </header>

        {/* 탭 화면이 뜨기 전(또는 띄우지 못했을 때) 그 자리에 보이는 바탕. 사이드바 자리와
            화면 자리의 색만 칠해, 탭 화면이 붙을 때 번쩍이지 않게 한다. */}
        <div data-slot="tab-view-backdrop" className="flex min-h-0 flex-1" aria-hidden>
          <div
            className={`${
              view.sidebarOpen ? 'w-(--sidebar-width)' : 'w-(--sidebar-width-icon)'
            } shrink-0 border-r border-border bg-sidebar`}
          />
          <div className="min-w-0 flex-1 bg-background" />
        </div>
      </div>
    </TabBarProvider>
  );
}
