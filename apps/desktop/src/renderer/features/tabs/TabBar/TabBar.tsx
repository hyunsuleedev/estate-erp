import { Fragment, useEffect, useRef, type CSSProperties, type WheelEvent } from 'react';
import { useTabBar } from './tabBarContext';
import { Tab, TAB_MAX_WIDTH, TAB_MIN_WIDTH } from './Tab';
import { NewTabButton } from './NewTabButton';
import { useTabDrag } from '../hooks/useTabDrag';
import { cn } from '@/lib/utils';

/** 새 탭 버튼 칸. 버튼은 마지막 탭 바로 뒤에 붙는다(Notion). */
const NEW_TAB_SLOT_WIDTH = 40;
const TAB_SLOT_LIMITS = { min: TAB_MIN_WIDTH, max: TAB_MAX_WIDTH };
/** 끄는 동안 다른 탭이 자리를 비켜 주는 움직임(Notion의 slide와 같은 200ms). */
const GAP_TRANSITION =
  'flex-grow 200ms ease, min-width 200ms ease, max-width 200ms ease';

/**
 * 탭 사이의 빈 칸. 평소에는 폭이 0이고, 탭을 끄는 동안 그 탭이 들어갈 자리에서 탭 한 칸만큼
 * 열린다. 탭과 같은 규칙으로 폭을 나눠 가지므로, 열리면 다른 탭들이 밀려나 자리를 비킨다.
 */
function TabGap({
  open,
  animate,
  isLast,
}: {
  open: boolean;
  animate: boolean;
  isLast: boolean;
}) {
  const separators = [
    'inset 1px 0 0 var(--color-border)',
    'inset 0 -1px 0 var(--color-border)',
  ];
  if (isLast) separators.push('inset -1px 0 0 var(--color-border)');
  return (
    <div
      data-slot="tab-gap"
      data-open={open ? 'true' : undefined}
      aria-hidden
      className="h-9 self-end overflow-hidden bg-sidebar-accent/60"
      style={
        {
          WebkitAppRegion: 'no-drag',
          flexGrow: open ? 1 : 0,
          flexShrink: 1,
          flexBasis: '0%',
          minWidth: open ? TAB_MIN_WIDTH : 0,
          maxWidth: open ? TAB_MAX_WIDTH : 0,
          boxShadow: separators.join(', '),
          transition: animate ? GAP_TRANSITION : 'none',
        } as CSSProperties
      }
    />
  );
}

interface Props {
  className?: string;
  showNewTabButton?: boolean;
  /**
   * 탭을 다른 창으로 옮길 수 있는지(창이 여럿인 Electron에서만): 탭 줄 밖에 놓아 새 창으로,
   * 다른 창의 탭 줄에 놓아 그 창으로. 끌어서 순서를 바꾸는 것은 늘 된다.
   */
  detachable?: boolean;
}

/**
 * TabBar는 부모(타이틀바 헤더) 안에 inline으로 들어간다.
 * 헤더의 아래 선(border-b)까지 덮도록 1px 더 길게 그린다. 그래야 활성 탭이 그 선을
 * 가리고 아래 콘텐츠와 한 면으로 이어진다.
 */
export function TabBar({
  className,
  showNewTabButton = true,
  detachable = false,
}: Props) {
  // 탭 목록의 주인은 따로 있다(Electron에서는 main). 여기서는 받은 것을 그리고
  // 사용자가 한 동작을 보내기만 한다.
  const { view, dispatch } = useTabBar();
  const { tabs, activeTabId } = view;

  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const slot = showNewTabButton ? NEW_TAB_SLOT_WIDTH : 0;
  const drag = useTabDrag({
    tabIds: tabs.map((tab) => tab.id),
    windowId: view.windowId,
    reservedSlot: view.reservedSlot,
    detachable,
    dispatch,
    listRef,
    viewportRef: scrollRef,
    trailingWidth: slot,
    slotLimits: TAB_SLOT_LIMITS,
  });
  const { openGap, collapsedTabId, slotCount } = drag.slots;

  // 탭이 넘쳐 스크롤될 때 활성 탭이 보이는 자리로 옮긴다.
  useEffect(() => {
    if (!activeTabId) return;
    const node = scrollRef.current?.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(activeTabId)}"]`,
    );
    node?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId, tabs.length]);

  // 세로 휠로도 탭 줄을 가로로 넘긴다.
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    if (!element || element.scrollWidth <= element.clientWidth) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    element.scrollLeft += event.deltaY;
  };

  return (
    <div
      // 탭 줄 전체(탭 오른쪽의 빈 자리 포함)가 탭을 놓는 자리다.
      {...drag.stripProps}
      className={cn(
        'flex h-[calc(100%_+_1px)] min-w-0 flex-1 self-start items-end',
        className,
      )}
    >
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex h-full min-w-0 flex-1 items-end overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden"
      >
        <div
          ref={listRef}
          role="tablist"
          data-slot="tab-list"
          className="flex h-full items-end"
          style={{
            flex: '1 1 0%',
            // 끄는 동안 다른 창의 탭이 들어올 빈 칸까지 센다.
            minWidth: slotCount * TAB_MIN_WIDTH + slot,
            maxWidth: slotCount * TAB_MAX_WIDTH + slot,
          }}
        >
          {tabs.map((tab, index) => (
            <Fragment key={tab.id}>
              <TabGap open={openGap === index} animate={drag.animate} isLast={false} />
              <Tab
                tab={tab}
                isActive={tab.id === activeTabId}
                // 맨 끝에 빈 칸이 열려 있으면 끝 선은 그 칸이 그린다.
                isLast={index === tabs.length - 1 && openGap !== tabs.length}
                collapsed={tab.id === collapsedTabId}
                onActivate={() => dispatch({ type: 'activate', tabId: tab.id })}
                onClose={() => dispatch({ type: 'close', tabId: tab.id })}
                // 탭 메뉴는 main이 native 메뉴로 띄우고 고른 것을 직접 적용한다.
                onContextMenu={() => dispatch({ type: 'tab-menu', tabId: tab.id })}
                drag={drag.tabProps(tab.id)}
              />
            </Fragment>
          ))}
          <TabGap open={openGap === tabs.length} animate={drag.animate} isLast />
          {showNewTabButton ? (
            <div
              className="flex h-9 shrink-0 items-center justify-center"
              style={{ width: NEW_TAB_SLOT_WIDTH }}
            >
              <NewTabButton
                shortcut={view.platform === 'darwin' ? '⌘T' : 'Ctrl+T'}
                onClick={() => dispatch({ type: 'new-tab' })}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
