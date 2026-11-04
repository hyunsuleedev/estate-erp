import type { ReactNode } from 'react';

/** Window chrome for the screens shown before an office workspace opens. */
export function AuthWindowFrame({ children }: { children: ReactNode }) {
  const platform = window.electronBridge?.platform;
  const hasCustomTitlebar = platform === 'darwin' || platform === 'win32';

  if (!hasCustomTitlebar) return children;

  return (
    <div className="min-h-svh pt-10 [--auth-content-height:calc(100svh-2.5rem)]">
      <header
        data-slot="auth-titlebar"
        className={`app-titlebar fixed inset-x-0 top-0 z-40 flex h-10 select-none items-center justify-center border-b border-border bg-[#f6f5f0] ${platform === 'darwin' ? 'px-[92px]' : 'px-[140px]'}`}
      >
        <span className="truncate text-xs font-medium tracking-tight text-muted-foreground">
          에스테잇플로우
        </span>
      </header>
      {children}
    </div>
  );
}
