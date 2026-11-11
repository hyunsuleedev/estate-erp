import { useEffect, useRef, type WheelEvent } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Tab as TabType } from '@estate-erp/shared';
import type { TabMenuItem } from '../../../../common/tabCommands';
import { useTabStore } from '../store/useTabStore';
import { reopenLastClosedTabs } from '../store/useTabHistoryStore';
import { Tab, TAB_MAX_WIDTH, TAB_MIN_WIDTH } from './Tab';
import { NewTabButton } from './NewTabButton';
import { useDetachDrag } from '../hooks/useDetachDrag';
import { cn } from '@/lib/utils';

/** 새 탭 버튼 칸. 버튼은 마지막 탭 바로 뒤에 붙는다(Notion). */
const NEW_TAB_SLOT_WIDTH = 40;

interface Props {
  className?: string;
  showNewTabButton?: boolean;
}

type TabMenuAction =
  | 'reopen'
  | 'close'
  | 'close-others'
  | 'close-left'
  | 'close-right';

function tabMenuItems(index: number, count: number, canReopen: boolean): TabMenuItem[] {
  return [
    {
      type: 'item',
      id: 'reopen',
      label: '닫은 탭 다시 열기',
      enabled: canReopen,
      accelerator: 'CmdOrCtrl+Shift+T',
    },
    { type: 'separator' },
    { type: 'item', id: 'close', label: '탭 닫기', accelerator: 'CmdOrCtrl+W' },
    { type: 'item', id: 'close-others', label: '다른 탭 닫기', enabled: count > 1 },
    { type: 'item', id: 'close-left', label: '왼쪽 탭 닫기', enabled: index > 0 },
    {
      type: 'item',
      id: 'close-right',
      label: '오른쪽 탭 닫기',
      enabled: index < count - 1,
    },
  ];
}

/**
 * TabBar는 부모(타이틀바 헤더) 안에 inline으로 들어간다.
 * 헤더의 아래 선(border-b)까지 덮도록 1px 더 길게 그린다. 그래야 활성 탭이 그 선을
 * 가리고 아래 콘텐츠와 한 면으로 이어진다.
 */
export function TabBar({ className, showNewTabButton = true }: Props) {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activateTab = useTabStore((s) => s.activateTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const reorderTabs = useTabStore((s) => s.reorderTabs);

  const tabBarRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useDetachDrag(tabBarRef);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );

  // 탭이 넘쳐 스크롤될 때 활성 탭이 보이는 자리로 옮긴다.
  useEffect(() => {
    if (!activeTabId) return;
    const node = scrollRef.current?.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(activeTabId)}"]`,
    );
    node?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId, tabs.length]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      reorderTabs(String(active.id), String(over.id));
    }
  };

  // 세로 휠로도 탭 줄을 가로로 넘긴다.
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    if (!element || element.scrollWidth <= element.clientWidth) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    element.scrollLeft += event.deltaY;
  };

  const showTabMenu = async (tab: TabType, index: number) => {
    const showMenu = window.electronBridge?.tabs?.showMenu;
    if (!showMenu) return;
    const state = useTabStore.getState();
    const chosen = (await showMenu(
      tabMenuItems(index, state.tabs.length, state.recentlyClosedTabs.length > 0),
    )) as TabMenuAction | null;
    const store = useTabStore.getState();
    switch (chosen) {
      case 'reopen':
        reopenLastClosedTabs();
        break;
      case 'close':
        store.closeTab(tab.id);
        break;
      case 'close-others':
        store.closeOtherTabs(tab.id);
        break;
      case 'close-left':
        store.closeTabsToLeft(tab.id);
        break;
      case 'close-right':
        store.closeTabsToRight(tab.id);
        break;
      default:
        break;
    }
  };

  const slot = showNewTabButton ? NEW_TAB_SLOT_WIDTH : 0;

  return (
    <div
      ref={tabBarRef}
      className={cn(
        'flex h-[calc(100%_+_1px)] min-w-0 flex-1 self-start items-end',
        className,
      )}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={tabs.map((t) => t.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            ref={scrollRef}
            onWheel={handleWheel}
            className="flex h-full min-w-0 flex-1 items-end overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden"
          >
            <div
              data-slot="tab-list"
              className="flex h-full items-end"
              style={{
                flex: '1 1 0%',
                minWidth: tabs.length * TAB_MIN_WIDTH + slot,
                maxWidth: tabs.length * TAB_MAX_WIDTH + slot,
              }}
            >
              {tabs.map((tab, index) => (
                <Tab
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  isLast={index === tabs.length - 1}
                  onActivate={() => activateTab(tab.id)}
                  onClose={() => closeTab(tab.id)}
                  onContextMenu={() => void showTabMenu(tab, index)}
                />
              ))}
              {showNewTabButton ? (
                <div
                  className="flex h-9 shrink-0 items-center justify-center"
                  style={{ width: NEW_TAB_SLOT_WIDTH }}
                >
                  <NewTabButton />
                </div>
              ) : null}
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
