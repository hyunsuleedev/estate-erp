import { Plus } from 'lucide-react';
import { useTabStore } from '../store/useTabStore';
import { getRouteMeta } from '../lib/routeMeta';

export function NewTabButton() {
  const openTab = useTabStore((s) => s.openTab);

  const handleClick = () => {
    const meta = getRouteMeta('/dashboard');
    openTab({ route: '/dashboard', kind: meta.kind, title: meta.title });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className="ml-0.5 mb-0.5 grid h-7 w-7 shrink-0 place-items-center self-end rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="새 탭"
    >
      <Plus className="size-4" />
    </button>
  );
}
