import { toast } from 'sonner';
import { ApiError } from '@estate-erp/api-client';

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return '요청을 처리하지 못했습니다';
}

/**
 * 낙관적 제거 + 실행 취소(undo) 토스트 패턴.
 *
 * 1. applyOptimistic() 으로 목록에서 즉시 제거
 * 2. "실행 취소" 액션이 있는 토스트 표시
 * 3. 토스트가 닫히면(자동/수동) 그때 서버 commit — 결정은 서버에서 되돌릴 수
 *    없으므로 commit 자체를 지연시킨다 (Gmail 보관 패턴)
 * 4. undo 클릭 시 commit 을 건너뛰고 rollback()
 */
export function startUndoableAction(opts: {
  message: string;
  applyOptimistic: () => void;
  commit: () => Promise<unknown>;
  rollback: () => void;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
  duration?: number;
}): void {
  opts.applyOptimistic();

  let settled = false;
  const run = () => {
    if (settled) return;
    settled = true;
    void opts
      .commit()
      .then(() => opts.onSuccess?.())
      .catch((error: unknown) => {
        if (opts.onError) {
          opts.onError(error);
        } else {
          toast.error(getErrorMessage(error));
          opts.rollback();
        }
      });
  };

  toast(opts.message, {
    duration: opts.duration ?? 4500,
    action: {
      label: '실행 취소',
      onClick: () => {
        settled = true;
        opts.rollback();
      },
    },
    onAutoClose: run,
    onDismiss: run,
  });
}
