import type { MouseEvent as ReactMouseEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  shortcutLabel,
  type TabHistoryDirection,
} from '../../../../common/tabCommands';
import { cn } from '@/lib/utils';
import { useTabBar } from './tabBarContext';

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
  // 방문 기록의 주인은 탭 목록과 같다. 갈 수 있는지만 받아 그리고, 누른 것을 보낸다.
  const { view, dispatch } = useTabBar();
  const platform = view.platform;
  const canGo: Record<TabHistoryDirection, boolean> = {
    back: view.history.canGoBack,
    forward: view.history.canGoForward,
  };

  const handleClick = (
    direction: TabHistoryDirection,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (!canGo[direction]) return;
    dispatch({
      type: 'history',
      direction,
      ...(event.metaKey || event.ctrlKey ? { inNewTab: true } : {}),
    });
  };

  const showHistoryMenu = (
    direction: TabHistoryDirection,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    // 기록 목록은 main이 native 메뉴로 띄우고 고른 칸으로 직접 옮긴다.
    if (canGo[direction]) dispatch({ type: 'history-menu', direction });
  };

  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)}>
      {(['back', 'forward'] as const).map((direction) => {
        const enabled = canGo[direction];
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
            onContextMenu={(event) => showHistoryMenu(direction, event)}
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
