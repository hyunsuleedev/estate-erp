import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@estate-erp/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { validateContactGroupName } from './-contact-categories';

/** 그룹 만들기·이름 바꾸기 공통 창. 서버가 거절한 이유(이미 있는 이름 등)를 창 안에 보여 준다. */
export function ContactGroupNameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialName = '',
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialName?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setError(null);
  }, [initialName, open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateContactGroupName(name);
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsPending(true);
    setError(null);
    try {
      await onSubmit(name.trim());
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : '저장하지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-1.5">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 재개발 관심 고객"
              aria-label="그룹 이름"
              aria-invalid={Boolean(error)}
              maxLength={30}
            />
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={isPending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
