import type { MouseEvent as ReactMouseEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  shortcutLabel,
  type TabHistoryDirection,
  type TabMenuItem,
} from '../../../../common/tabCommands';
import { cn } from '@/lib/utils';
import { useTabStore } from '../store/useTabStore';
import {
  canTraverse,
  traversalTargets,
  useTabHistoryStore,
} from '../store/useTabHistoryStore';
import {
  openLocationInNewTab,
  rendererPlatform,
  runHistoryJump,
  runHistoryNavigation,
} from '../lib/tabCommands';
import { getRouteMeta } from '../lib/routeMeta';

const LABELS: Record<TabHistoryDirection, string> = {
  back: '뒤로',
  forward: '앞으로',
};

/**
 * 활성 탭의 방문 기록으로 이동한다(Notion·Chrome 방식).
 * - 클릭: 한 칸 이동
 * - 우클릭: 그 방향의 기록 목록
 * - Cmd/Ctrl+클릭: 한 칸 전 화면을 새 탭으로 열기
 */
export function TabNavigationButtons({ className }: { className?: string }) {
  const activeTabId = useTabStore((state) => state.activeTabId);
  const history = useTabHistoryStore((state) =>
    activeTabId ? state.histories[activeTabId] : undefined,
  );
  const platform = rendererPlatform();

  const handleClick = (
    direction: TabHistoryDirection,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (!history || !canTraverse(history, direction)) return;
    if (event.metaKey || event.ctrlKey) {
      const index = direction === 'back' ? history.index - 1 : history.index + 1;
      const location = history.entries[index];
      if (location) openLocationInNewTab(location);
      return;
    }
    void runHistoryNavigation(direction);
  };

  const showHistoryMenu = async (
    direction: TabHistoryDirection,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const showMenu = window.electronBridge?.tabs?.showMenu;
    const targets = traversalTargets(history, direction);
    if (!showMenu || !history || !activeTabId || targets.length === 0) return;
    const items: TabMenuItem[] = targets.map((index) => {
      const entry = history.entries[index];
      return {
        type: 'item',
        id: String(index),
        label: entry.title || getRouteMeta(entry.route).title,
      };
    });
    const chosen = await showMenu(items);
    if (chosen !== null) void runHistoryJump(Number(chosen), activeTabId);
  };

  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)}>
      {(['back', 'forward'] as const).map((direction) => {
        const enabled = canTraverse(history, direction);
        const Icon = direction === 'back' ? ChevronLeft : ChevronRight;
        const label = `${LABELS[direction]} (${shortcutLabel(direction, platform)})`;
        return (
          <button
            key={direction}
            type="button"
            data-tab-history={direction}
            aria-label={LABELS[direction]}
            aria-disabled={!enabled || undefined}
            tabIndex={enabled ? 0 : -1}
            // OS 툴팁은 매물 상세 native view 위에도 보인다.
            title={label}
            onClick={(event) => handleClick(direction, event)}
            onContextMenu={(event) => void showHistoryMenu(direction, event)}
            className={cn(
              'grid size-6 place-items-center rounded-md text-sidebar-icon transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              enabled
                ? 'hover:bg-sidebar-accent hover:text-foreground'
                : 'cursor-default opacity-40',
            )}
          >
            {/* lucide chevron은 24 격자에서 6×12다. 24px로 그려야 Notion 화살표
                (약 6.7×12px)와 같은 크기가 되고, 선 굵기는 다른 아이콘과 맞춘다. */}
            <Icon className="size-6" strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}
