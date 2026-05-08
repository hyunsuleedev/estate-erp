import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';
import type { Tab as TabType } from '@estate-erp/shared';
import { cn } from '@/lib/utils';
import { getRouteMeta } from '../lib/routeMeta';

interface Props {
  tab: TabType;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
}

export function Tab({ tab, isActive, onActivate, onClose }: Props) {
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
      className={cn(
        'group relative flex h-9 min-w-[120px] max-w-[220px] shrink-0 items-center gap-2 px-3',
        'cursor-default select-none rounded-t-md text-sm',
        'border-x border-t',
        isActive
          ? 'border-border bg-background z-10'
          : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70',
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
