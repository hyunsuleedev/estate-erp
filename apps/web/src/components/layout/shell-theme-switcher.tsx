import { Check, SwatchBook } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SHELL_THEMES,
  useShellTheme,
  type ShellThemeMeta,
} from '@/providers/shell-theme-provider'

function ThemeSwatch({ theme }: { theme: ShellThemeMeta }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-9 shrink-0 overflow-hidden rounded-[5px] border border-border/70 shadow-[0_1px_2px_rgb(0_0_0/6%)]"
      style={{ background: theme.swatch.canvas }}
    >
      <span
        className="h-full w-[38%] border-r border-black/8"
        style={{ background: theme.swatch.sidebar }}
      />
      <span className="flex flex-1 items-center pl-1">
        <span
          className="h-1.5 w-4 rounded-full"
          style={{ background: theme.swatch.accent }}
        />
      </span>
    </span>
  )
}

/**
 * 셸 테마(사이드바/배경 스타일) 전환 드롭다운.
 * 시안 비교용 — 방향이 확정되면 설정 페이지로 이동하거나 제거.
 */
export function ShellThemeSwitcher() {
  const { themeId, setThemeId } = useShellTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label="셸 테마 전환"
        >
          <SwatchBook className="size-[17px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          셸 테마 시안
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SHELL_THEMES.map((theme) => (
          <DropdownMenuItem
            key={theme.id}
            onSelect={() => setThemeId(theme.id)}
            className="gap-2.5 py-2"
          >
            <ThemeSwatch theme={theme} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] font-medium">{theme.label}</span>
              <span className="truncate text-[11.5px] text-muted-foreground">
                {theme.description}
              </span>
            </span>
            {themeId === theme.id && (
              <Check className="size-4 shrink-0 text-foreground" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
