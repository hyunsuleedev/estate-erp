import { useState } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * 로그인은 유지되고 있지만 서버에서 사용자 정보를 받지 못했을 때의 안내.
 * 로그인 화면으로 보내지 않는다. main이 자동으로 다시 확인하고, 사용자도 바로
 * 다시 시도할 수 있다.
 */
export function ServerUnreachableScreen({
  onRetry,
  onLogout,
}: {
  onRetry: () => Promise<void>;
  onLogout: () => void | Promise<void>;
}) {
  const [isRetrying, setIsRetrying] = useState(false);

  async function handleRetry() {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <main className="flex min-h-[var(--auth-content-height,100svh)] w-full items-center justify-center bg-[#f6f5f0] px-6 text-foreground">
      <div className="w-full max-w-sm text-center" role="status" aria-live="polite">
        <WifiOff className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-xl font-semibold tracking-tight">서버에 연결하지 못했습니다</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          로그인은 유지되고 있습니다. 인터넷 연결을 확인해 주세요. 연결되면 자동으로 이어집니다.
        </p>
        <div className="mt-6 space-y-2">
          <Button type="button" className="w-full" disabled={isRetrying} onClick={handleRetry}>
            {isRetrying && <Loader2 className="size-4 animate-spin" />}
            다시 시도
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => void onLogout()}
          >
            로그아웃
          </Button>
        </div>
      </div>
    </main>
  );
}
