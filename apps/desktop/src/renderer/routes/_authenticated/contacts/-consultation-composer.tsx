import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useTabScopedState } from '@/features/tabs/hooks/useTabScopedState';
import { nb } from '../properties/-detail/ui';
import { apiErrorMessage, consultationTypeLabels } from './-detail-cards';

/**
 * 연락처 상세의 상담 기록 맨 위에 두는 적는 칸. 대화창을 열지 않고 그 자리에서 바로 적는다(사용자 요청 2026-11-24:
 * "상담을 손쉽게 적을 수 있게"). 방식(전화 · 방문 · 문자·온라인)과 내용만 받는다 — 상담한 때를 바꾸거나 다음 업무를
 * 함께 만들 때는 머리의 "상담 적기" 창을 쓴다.
 *
 * 적는 중인 글은 탭에 남겨 두어 다른 탭에 다녀와도 사라지지 않고, 글이 있는 동안 이 탭은 버려지지 않는다.
 * 저장에 실패하면 글을 그대로 둔다.
 */
const TYPES = ['phone', 'visit', 'online'] as const;

export function ConsultationComposer({ contactId, contactName }: { contactId: string; contactName: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useTabScopedState<{ type: string; content: string }>(
    `contact-consultation-draft:${contactId}`,
    { type: 'phone', content: '' },
  );
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dirty = draft.content.trim().length > 0;

  const mutation = useMutation({
    mutationFn: (payload: { type: string; content: string }) =>
      api.consultations.create({ contactId, type: payload.type, content: payload.content }),
    onSuccess: async (_created, payload) => {
      // 저장하는 동안 더 적은 글이 있으면 지우지 않는다
      setDraft((current) =>
        current.content.trim() === payload.content ? { type: current.type, content: '' } : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['consultations'] }),
      ]);
      toast.success('상담을 적었습니다.');
      inputRef.current?.focus();
    },
    onError: (caught) => {
      toast.error(apiErrorMessage(caught, '상담을 적지 못했습니다. 잠시 뒤 다시 시도하세요.'));
    },
  });

  const save = () => {
    if (mutation.isPending) return;
    const content = draft.content.trim();
    if (!content) {
      setError('적을 내용을 먼저 넣어 주세요.');
      inputRef.current?.focus();
      return;
    }
    setError('');
    mutation.mutate({ type: draft.type, content });
  };

  // 글의 줄 수만큼 자란다 (2줄에서 시작해 8줄까지, 그 뒤는 칸 안에서 굴린다)
  const rows = Math.min(8, Math.max(2, draft.content.split('\n').length));

  return (
    <div data-contact-consultation-composer data-native-tab-dirty={dirty ? 'true' : undefined} className="mb-2 mt-1">
      <div
        className={cn(
          'rounded-md px-2.5 pb-2 pt-2 shadow-[inset_0_0_0_1px_rgba(55,53,47,0.16)] transition-shadow',
          'focus-within:shadow-[inset_0_0_0_1px_#2383e2,0_0_0_3px_rgba(35,131,226,0.14)]',
        )}
      >
        <textarea
          ref={inputRef}
          rows={rows}
          value={draft.content}
          aria-label="상담 내용"
          aria-invalid={error ? true : undefined}
          placeholder={`${contactName} 님과 나눈 이야기를 적어 두세요`}
          className="block w-full resize-none bg-transparent text-[14px] leading-[1.6] text-[#37352f] outline-none placeholder:text-[#37352f]/45"
          onChange={(event) => {
            const content = event.target.value;
            setDraft((current) => ({ ...current, content }));
            if (error) setError('');
          }}
          onKeyDown={(event) => {
            // 한글을 조합하는 중의 Enter는 글자를 끝내는 키다
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              save();
            }
          }}
        />
        <div className="mt-1.5 flex items-center gap-0.5">
          <div role="group" aria-label="상담 방식" className="flex min-w-0 items-center gap-0.5">
            {TYPES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={draft.type === type}
                onClick={() => setDraft((current) => ({ ...current, type }))}
                className={cn(
                  'h-6 shrink-0 rounded-full px-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/40',
                  draft.type === type
                    ? 'bg-[#37352f]/[0.08] font-semibold text-[#37352f]'
                    : 'text-[#37352f]/65 hover:bg-[#37352f]/[0.06] hover:text-[#37352f]',
                )}
              >
                {consultationTypeLabels[type]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={cn(nb.solid, 'ml-auto h-6 px-2.5 text-[13px]')}
            disabled={mutation.isPending}
            title="⌘ Enter"
            onClick={save}
          >
            {mutation.isPending ? '적는 중' : '적기'}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1 px-0.5 text-[13px] text-[#bb3430]">
          {error}
        </p>
      )}
    </div>
  );
}
