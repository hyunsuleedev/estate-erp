import type { ReactNode } from 'react';
import { Loader2Icon } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** 확인 버튼 라벨 (기본: "확인", destructive일 때 "삭제" 권장) */
  confirmLabel?: string;
  /** 파괴적 액션이면 true → 확인 버튼이 destructive 스타일 */
  destructive?: boolean;
  /** 확인 클릭 핸들러. 비동기면 loading으로 진행 상태를 제어할 것 (자동으로 닫히지 않음). */
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

/**
 * 삭제 등 확인이 필요한 액션의 공통 다이얼로그.
 * loading 중에는 버튼이 비활성화되며, 성공 시 caller가 onOpenChange(false)로 닫는다.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '확인',
  destructive = false,
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>취소</AlertDialogCancel>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={loading}
            onClick={() => void onConfirm()}
          >
            {loading && <Loader2Icon className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
