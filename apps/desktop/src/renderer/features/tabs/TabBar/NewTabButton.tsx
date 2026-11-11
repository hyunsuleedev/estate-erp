import { Plus } from 'lucide-react';
export function NewTabButton({
  shortcut,
  onClick,
}: {
  /** 단축키 표시(⌘T / Ctrl+T). 플랫폼은 탭바 상태가 알려 준다. */
  shortcut: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
