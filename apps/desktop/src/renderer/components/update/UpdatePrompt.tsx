import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, DownloadCloud, RefreshCw, RotateCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getUpdatePromptModel,
  shouldShowUpdatePrompt,
  type UpdatePromptAction,
} from './update-prompt-utils';

type DesktopUpdateStatus = Awaited<ReturnType<NonNullable<typeof window.electronBridge>['updater']['getStatus']>>;

export function UpdatePrompt() {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [dismissedStartedAt, setDismissedStartedAt] = useState<number | null>(null);

  useEffect(() => {
    const bridge = window.electronBridge?.updater;
    if (!bridge) return;

    let mounted = true;
    void bridge.getStatus().then((nextStatus) => {
      if (mounted) setStatus(nextStatus);
    });

    const cleanup = bridge.onStatus((nextStatus) => {
      setStatus(nextStatus);
      setDismissedStartedAt(null);
    });

    return () => {
      mounted = false;
      cleanup();
    };
  }, []);

  const model = useMemo(
    () => (status ? getUpdatePromptModel(status) : null),
    [status],
  );

  if (!status || !model || !shouldShowUpdatePrompt(model)) return null;
  if (dismissedStartedAt === status.startedAt) return null;

  const handleAction = (action: UpdatePromptAction) => {
    if (action === 'dismiss') {
      setDismissedStartedAt(status.startedAt);
      return;
    }

    if (action === 'check') {
      void window.electronBridge?.updater.check();
      return;
    }

    if (action === 'restart') {
      void window.electronBridge?.updater.install();
    }
  };

  if (model.variant === 'modal') {
    const primaryAction = model.primaryAction;
    const secondaryAction = model.secondaryAction;

    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/20 px-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-prompt-title"
          className="w-full max-w-[420px] rounded-lg border border-border bg-white p-5 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="update-prompt-title" className="text-base font-semibold text-slate-950">
                {model.title}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {model.detail}
              </p>
            </div>
            {secondaryAction && (
              <button
                type="button"
                aria-label="업데이트 알림 닫기"
                onClick={() => handleAction(secondaryAction)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            {secondaryAction && (
              <Button variant="ghost" size="sm" onClick={() => handleAction(secondaryAction)}>
                나중에
              </Button>
            )}
            {primaryAction && (
              <Button size="sm" onClick={() => handleAction(primaryAction)}>
                <RotateCw className="size-3.5" />
                지금 재시작
              </Button>
            )}
          </div>
        </section>
      </div>
    );
  }

  const isError = status.state === 'error';
  const primaryAction = model.primaryAction;
  const secondaryAction = model.secondaryAction;

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[360px] max-w-[calc(100vw-32px)]">
      <section className="rounded-lg border border-border bg-white p-3 shadow-xl">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md',
              isError ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700',
            )}
          >
            {isError ? <AlertCircle className="size-4" /> : <DownloadCloud className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-950">{model.title}</div>
            <p className="mt-0.5 text-xs leading-5 text-slate-600">{model.detail}</p>
            {model.progressLabel && (
              <div className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                <RefreshCw className="size-3 animate-spin" />
                {model.progressLabel}
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              {secondaryAction && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleAction(secondaryAction)}>
                  닫기
                </Button>
              )}
              {primaryAction && (
                <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleAction(primaryAction)}>
                  다시 확인
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
