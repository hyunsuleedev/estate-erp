import { useRef } from 'react';
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
import { useTabStore } from '../store/useTabStore';
import { Tab } from './Tab';
import { NewTabButton } from './NewTabButton';
import { TrafficLightSpacer } from './TrafficLightSpacer';
import { useDetachDrag } from '../hooks/useDetachDrag';

const isMac = window.electronBridge?.platform === 'darwin';
const isWin = window.electronBridge?.platform === 'win32';

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activateTab = useTabStore((s) => s.activateTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const reorderTabs = useTabStore((s) => s.reorderTabs);

  const tabBarRef = useRef<HTMLDivElement>(null);
  useDetachDrag(tabBarRef);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      reorderTabs(String(active.id), String(over.id));
    }
  };

  return (
    <div
      ref={tabBarRef}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="app-titlebar relative flex h-9 shrink-0 items-end border-b border-border bg-sidebar"
    >
      <TrafficLightSpacer />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={tabs.map((t) => t.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex flex-1 items-end gap-px overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab) => (
              <Tab
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onActivate={() => activateTab(tab.id)}
                onClose={() => closeTab(tab.id)}
              />
            ))}
            <NewTabButton />
          </div>
        </SortableContext>
      </DndContext>

      {/* Windows: titleBarOverlay가 우측에 시스템 컨트롤을 그려주므로 자리만 비움 */}
      {isWin && <div className="w-[140px] shrink-0" aria-hidden />}
      {/* macOS: 우측 끝 패딩 */}
      {isMac && <div className="w-2 shrink-0" aria-hidden />}
    </div>
  );
}
