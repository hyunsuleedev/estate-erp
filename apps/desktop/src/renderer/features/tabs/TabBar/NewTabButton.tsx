import { Plus } from 'lucide-react';
import { useTabStore } from '../store/useTabStore';
import { getRouteMeta } from '../lib/routeMeta';

export function NewTabButton() {
  const createTab = useTabStore((s) => s.createTab);

  const handleClick = () => {
    const meta = getRouteMeta('/dashboard');
    createTab({
      route: '/dashboard',
      kind: meta.kind,
      title: meta.title,
      resourceKey: null,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className="ml-1.5 grid size-8 shrink-0 place-items-center self-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="새 탭"
    >
      <Plus className="size-4" />
    </button>
  );
}
