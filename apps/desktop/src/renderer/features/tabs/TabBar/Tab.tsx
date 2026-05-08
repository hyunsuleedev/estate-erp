import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';
import type { Tab as TabType } from '@estate-erp/shared';
import { cn } from '@/lib/utils';
import { getRouteMeta } from '../lib/routeMeta';

interface Props {
  tab: TabType;
  isActive: boolean;
  hideDivider: boolean;
  onActivate: () => void;
  onClose: () => void;
}

export function Tab({ tab, isActive, hideDivider, onActivate, onClose }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const meta = getRouteMeta(tab.route);
  const Icon = meta.icon;

  return (
    <div
      ref={setNodeRef}
      data-tab-id={tab.id}
      data-tab-active={isActive ? 'true' : 'false'}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
      onClick={onActivate}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
      data-hide-divider={hideDivider ? 'true' : 'false'}
      className={cn(
        'group relative flex min-w-[120px] max-w-[220px] shrink-0 gap-2 px-3 text-sm',
        'cursor-default select-none',
        // inactive 탭 사이 세로 구분선 (왼쪽). active이거나 active 인접 또는 첫 탭이면 숨김.
        'before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-border',
        'data-[hide-divider=true]:before:hidden',
        isActive
          // 박스 h-[34px]: 헤더(40) - 위 여백(6) = 34. self-end + -mb-px로 헤더 바닥 1px overlap.
          // items-center + pb-[3px]로 컨텐츠를 위쪽으로 살짝 올려 inactive와 글자 baseline 맞춤.
          // 모든 자식(아이콘/글자)이 동일하게 박스 가운데에서 위로 이동 → 어긋남 없음.
          ? 'h-[34px] self-end -mb-px items-center pb-[8px] bg-background text-foreground rounded-t-md border-t border-l border-r border-border'
          : 'h-8 items-center text-muted-foreground rounded-t-md hover:bg-muted/60',
      )}
      {...attributes}
      {...listeners}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{tab.title}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          'shrink-0 grid place-items-center size-5 rounded transition-opacity',
          'hover:bg-foreground/10',
          isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        aria-label="탭 닫기"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
