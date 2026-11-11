import { Plus } from 'lucide-react';
import { openNewTab, rendererPlatform } from '../lib/tabCommands';

export function NewTabButton() {
  const shortcut = rendererPlatform() === 'darwin' ? '⌘T' : 'Ctrl+T';
  return (
    <button
      type="button"
      onClick={() => openNewTab()}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      className="grid size-6 shrink-0 place-items-center rounded-md text-sidebar-icon transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      aria-label="새 탭"
      title={`새 탭 (${shortcut})`}
    >
      {/* Notion + 아이콘은 20px 칸에 약 12.8px. 같은 비율로 맞춘다. */}
      <Plus className="size-5" strokeWidth={1.5} />
    </button>
  );
}
