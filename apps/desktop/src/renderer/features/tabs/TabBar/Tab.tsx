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
        'app-tab group relative -ml-px flex h-8 min-w-[112px] max-w-[220px] shrink-0 items-center gap-2 border border-border px-3 text-sm first:ml-0',
        'cursor-default select-none transition-colors',
        isActive
          ? 'z-10 -mb-px h-9 self-end border-b-background! bg-background text-foreground'
          : 'bg-sidebar text-muted-foreground hover:bg-muted/60 hover:text-foreground',
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
          'grid size-5 shrink-0 place-items-center rounded transition-opacity',
          'opacity-0 hover:bg-foreground/10 hover:opacity-100 group-hover:opacity-70 group-focus-within:opacity-70',
          'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        )}
        aria-label="탭 닫기"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
