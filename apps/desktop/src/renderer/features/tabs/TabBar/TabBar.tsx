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
import { useDetachDrag } from '../hooks/useDetachDrag';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  showNewTabButton?: boolean;
}

/**
 * TabBar는 부모(타이틀바 헤더) 안에 inline으로 들어간다.
 * 자체 row 스타일(border-b, bg-sidebar, h-9 등)은 갖지 않음 — 부모 헤더가 그 역할.
 */
export function TabBar({ className, showNewTabButton = true }: Props) {
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
      className={cn('flex h-full min-w-0 flex-1 items-center', className)}
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
          <div className="flex h-full min-w-0 flex-1 items-center gap-0 overflow-x-auto pl-1.5 [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <Tab
                  key={tab.id}
                  tab={tab}
                  isActive={isActive}
                  onActivate={() => activateTab(tab.id)}
                  onClose={() => closeTab(tab.id)}
                />
              );
            })}
            {showNewTabButton ? <NewTabButton /> : null}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
