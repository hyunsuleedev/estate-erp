import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';
import type { Tab as TabType } from '@estate-erp/shared';
import { cn } from '@/lib/utils';
import { getRouteMeta } from '../lib/routeMeta';

/** Notion 탭바와 같은 폭 규칙: 공간을 균등하게 나누되 36~200px 사이. */
export const TAB_MIN_WIDTH = 36;
export const TAB_MAX_WIDTH = 200;
/** 이보다 좁은 비활성 탭은 닫기 버튼을 그리지 않는다(아이콘만 남는 폭 + 여백). */
const CLOSE_BUTTON_MIN_WIDTH = TAB_MIN_WIDTH + 16;

interface Props {
  tab: TabType;
  isActive: boolean;
  isLast: boolean;
  onActivate: () => void;
  onClose: () => void;
  onContextMenu: () => void;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(TAB_MAX_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export function Tab({
  tab,
  isActive,
  isLast,
  onActivate,
  onClose,
  onContextMenu,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });
  const { ref: widthRef, width } = useElementWidth<HTMLDivElement>();

  const meta = getRouteMeta(tab.route);
  const Icon = meta.icon;
  const showCloseButton = isActive || width > CLOSE_BUTTON_MIN_WIDTH;
  // 경계선은 inset 그림자로 그린다(Notion). 시작쪽은 항상, 끝쪽은 마지막 탭만,
  // 아래쪽은 비활성 탭만 그린다. 활성 탭은 헤더 아래 선을 덮어 콘텐츠와 이어진다.
  const separators = ['inset 1px 0 0 var(--color-border)'];
  if (isLast) separators.push('inset -1px 0 0 var(--color-border)');
  if (!isActive) separators.push('inset 0 -1px 0 var(--color-border)');

  return (
    <div
      ref={(node) => {
        widthRef.current = node;
        setNodeRef(node);
      }}
      data-tab-id={tab.id}
      data-tab-active={isActive ? 'true' : 'false'}
      title={tab.title}
      style={
        {
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.5 : 1,
          WebkitAppRegion: 'no-drag',
          flex: '1 1 0%',
          minWidth: TAB_MIN_WIDTH,
          maxWidth: TAB_MAX_WIDTH,
          paddingInline: 'clamp(9px, 25%, 16px)',
          boxShadow: separators.join(', '),
        } as CSSProperties
      }
      {...attributes}
      {...listeners}
      onPointerDown={(event) => {
        // Notion처럼 누르는 순간 활성화한다. 드래그 시작은 dnd-kit이 이어서 판단한다.
        const fromAction = (event.target as Element).closest('[data-tab-action]');
        if (event.button === 0 && !fromAction) onActivate();
        listeners?.onPointerDown?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      }}
      onAuxClick={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          onClose();
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu();
      }}
      className={cn(
        'app-tab group relative flex h-9 items-center gap-2 self-end overflow-hidden',
        'cursor-default select-none transition-colors duration-100',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
        isActive
          ? 'z-10 bg-background text-foreground [--tab-bg:var(--color-background)]'
          : 'bg-sidebar text-muted-foreground [--tab-bg:var(--color-sidebar)] hover:bg-sidebar-accent hover:[--tab-bg:var(--color-sidebar-accent)]',
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0 transition-opacity',
          isActive ? 'opacity-100' : 'opacity-75 group-hover:opacity-100',
        )}
      />
      <span
        className={cn(
          'min-w-0 flex-1 overflow-hidden whitespace-nowrap text-[13px] font-medium leading-5',
          isActive
            ? 'text-ellipsis'
            : '[mask-image:linear-gradient(to_right,#000_calc(100%_-_9px),transparent)]',
        )}
      >
        {tab.title}
      </span>
      {showCloseButton ? (
        <span
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 flex items-center pl-4 pr-[7px]',
            'bg-[linear-gradient(to_right,transparent,var(--tab-bg)_16px)]',
            'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
        >
          <button
            type="button"
            data-tab-action="close"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className={cn(
              'pointer-events-auto grid size-5 place-items-center rounded-md text-muted-foreground',
              'hover:bg-foreground/10 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            )}
            aria-label="탭 닫기"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </span>
      ) : null}
    </div>
  );
}
