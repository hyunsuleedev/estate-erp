import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import type { Property } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { SideCard } from './SideCard';

interface Props {
  property: Property;
}

export function MemoCard({ property }: Props) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(property.memo ?? '');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // property.memo가 외부에서 갱신되면 draft도 동기화
  useEffect(() => {
    if (!editing) setDraft(property.memo ?? '');
  }, [property.memo, editing]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const end = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(end, end);
    }
  }, [editing]);

  const mutation = useMutation({
    mutationFn: (memo: string | null) =>
      api.properties.update(property.id, { memo: memo ?? undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties', property.id] });
      toast.success('메모가 저장되었습니다.');
      setEditing(false);
    },
    onError: () => {
      toast.error('메모 저장에 실패했습니다.');
    },
  });

  const handleSave = () => {
    const next = draft.trim();
    const current = property.memo?.trim() ?? '';
    if (next === current) {
      setEditing(false);
      return;
    }
    mutation.mutate(next.length === 0 ? null : next);
  };

  const handleCancel = () => {
    setDraft(property.memo ?? '');
    setEditing(false);
  };

  return (
    <SideCard
      title="메모"
      action={
        !editing && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={() => setEditing(true)}
            aria-label="메모 수정"
          >
            <Pencil className="size-3" />
          </Button>
        )
      }
    >
      {editing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSave();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
              }
            }}
            className="w-full resize-none rounded border border-border bg-white px-2 py-1.5 text-[12px] leading-5 outline-none focus:border-foreground/40"
            rows={5}
            placeholder="매물 관련 메모를 적어두세요..."
          />
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={handleCancel}
              disabled={mutation.isPending}
            >
              취소
            </Button>
            <Button
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={handleSave}
              disabled={mutation.isPending}
            >
              저장
            </Button>
          </div>
        </div>
      ) : property.memo ? (
        <p className="whitespace-pre-wrap text-[12px] leading-5 text-foreground">
          {property.memo}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full rounded border border-dashed border-border px-2 py-2 text-left text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        >
          메모를 추가하세요
        </button>
      )}
    </SideCard>
  );
}
