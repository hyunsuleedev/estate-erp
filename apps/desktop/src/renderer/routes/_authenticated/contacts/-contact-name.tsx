import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, PenLine } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiErrorMessage } from './-detail-cards';

/**
 * 이름을 모르는 손님의 임시 이름 ("미확인 5678").
 *
 * 이름 없이 번호만 저장하면 서버가 대표 번호 끝 네 자리로 이 이름을 붙인다(화면은 지어내지 않는다).
 * 같은 규칙이 서버에도 있다: apps/server/src/modules/contacts/contact-name.utils.ts.
 * 화면은 이 이름을 흐리게 보이고 "이름 넣기"로 바로 고치게 한다. 번호를 바꿔도 이름은 그대로다.
 */
export const PLACEHOLDER_CONTACT_NAME_PATTERN = /^미확인 \d{4}$/;

export function isPlaceholderContactName(name: string | null | undefined): boolean {
  return typeof name === 'string' && PLACEHOLDER_CONTACT_NAME_PATTERN.test(name);
}

/** 임시 이름 옆의 "이름 넣기": 작은 창에서 이름만 적어 저장한다 (전화 끊고 바로 채우는 자리). */
export function ContactNameFill({
  contactId,
  className,
  size = 'sm',
}: {
  contactId: string;
  className?: string;
  size?: 'sm' | 'xs';
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => api.contacts.update(contactId, { name: name.trim() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('이름을 넣었습니다.');
      setOpen(false);
    },
    onError: (caught) => setError(apiErrorMessage(caught, '이름을 저장하지 못했습니다. 잠시 뒤 다시 시도하세요.')),
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (save.isPending) return;
        setOpen(next);
        if (next) {
          setName('');
          setError('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-contact-name-fill
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-[4px] text-[#2383e2] hover:bg-[#2383e2]/[0.08]',
            size === 'xs' ? 'h-5 px-1 text-[12px]' : 'h-7 px-1.5 text-[13px]',
            className,
          )}
        >
          <PenLine className={size === 'xs' ? 'size-3' : 'size-3.5'} />
          이름 넣기
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-3"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (save.isPending) return;
            if (!name.trim()) {
              setError('이름을 입력하세요.');
              return;
            }
            setError('');
            save.mutate();
          }}
        >
          <label className="block text-[12px] font-medium text-muted-foreground" htmlFor={`name-fill-${contactId}`}>
            이 손님의 이름
          </label>
          <Input
            id={`name-fill-${contactId}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="예: 김민수"
            autoFocus
          />
          {error && <p className="text-[12px] text-destructive">{error}</p>}
          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={save.isPending}>
              취소
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-3.5 animate-spin" />}
              저장
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
