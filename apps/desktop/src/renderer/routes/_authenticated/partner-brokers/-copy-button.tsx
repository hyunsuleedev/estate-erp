import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** 전화번호/이메일 등 값 복사 아이콘 버튼 (행 클릭 전파 차단) */
export function CopyIconButton({ value, label = '값' }: { value: string; label?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={`${label} 복사`}
      className="shrink-0 text-slate-400 hover:text-slate-600"
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard
          .writeText(value)
          .then(() => toast.success('클립보드에 복사했습니다.'))
          .catch(() => toast.error('복사에 실패했습니다.'));
      }}
    >
      <Copy className="size-3" />
    </Button>
  );
}
