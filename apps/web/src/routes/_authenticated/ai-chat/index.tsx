import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Plus, Send, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_authenticated/ai-chat/')({
  component: AiChatPage,
});

/** 채팅 메시지 — 백엔드 연결 전(Phase 2)이므로 로컬 state 전용 */
interface ChatMessage {
  id: number;
  role: 'user' | 'ai';
  text: string;
  /** AI 응답에 붙는 선택적 아이템 카드 리스트 (매물/일정 등) */
  items?: { title: string; description: string; status?: string }[];
}

/** AI 연결 전 고정 응답 */
const PHASE2_REPLY = '내부 AI 챗은 Phase 2에서 연결됩니다.';

/** 빈 대화 상태에서 보여주는 예시 질문 칩 */
const EXAMPLE_QUESTIONS = [
  '이번 주 잔금 일정이 있는 계약 알려줘',
  '2주 넘게 연락 안 한 구매고객 찾아줘',
  '고덕 그라시움 매물 현황 요약해줘',
];

/** AI 채팅 — UI 선행 구현 (백엔드는 Phase 2에서 연결) */
function AiChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(1);

  const isEmpty = messages.length === 0;

  // 새 메시지 추가 시 항상 맨 아래로 스크롤
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      { id: nextIdRef.current++, role: 'user', text: trimmed },
      { id: nextIdRef.current++, role: 'ai', text: PHASE2_REPLY },
    ]);
    setDraft('');
  };

  const handleNewChat = () => {
    setMessages([]);
    setDraft('');
  };

  return (
    <div className="-mx-4 -mb-4 flex flex-1 min-h-0 flex-col bg-background">
      {/* 헤더: 새 대화 (제목은 상단 앱 헤더가 표시) */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-6 py-[13px]">
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleNewChat}>
          <Plus />새 대화
        </Button>
      </div>

      {/* 메시지 리스트 */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="size-5" aria-hidden="true" />
            </div>
            <div className="text-[14.5px] font-semibold">매물, 고객, 일정에 대해 물어보세요</div>
            <p className="max-w-sm text-[12.5px] text-muted-foreground">
              사무소 데이터를 기반으로 AI가 답변해요. 아래 예시 질문으로 시작해보세요.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[760px] flex-col gap-[18px] px-6 pb-3 pt-6">
            {messages.map((m) =>
              m.role === 'user' ? (
                <div
                  key={m.id}
                  className="max-w-[480px] self-end break-keep rounded-[14px] bg-secondary px-3.5 py-[9px] text-[13.5px] leading-[1.55] text-secondary-foreground"
                >
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className="flex max-w-[640px] gap-[11px] self-start">
                  {/* AI 아바타 */}
                  <div className="mt-0.5 flex size-[26px] shrink-0 items-center justify-center rounded-full bg-primary">
                    <Sparkles className="size-3.5 text-primary-foreground" aria-hidden="true" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-[9px]">
                    <div className="break-keep text-[13.5px] leading-[1.6]">{m.text}</div>
                    {m.items && m.items.length > 0 && (
                      <div className="overflow-hidden rounded-[10px] border border-border/60">
                        {m.items.map((it, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              'flex items-center gap-2.5 px-[13px] py-[9px] hover:bg-muted/50',
                              idx < m.items!.length - 1 && 'border-b border-border/40',
                            )}
                          >
                            <div className="flex min-w-0 flex-1 flex-col gap-px">
                              <span className="text-[12.5px] font-semibold">{it.title}</span>
                              <span className="text-[11.5px] text-muted-foreground">
                                {it.description}
                              </span>
                            </div>
                            {it.status && (
                              <span className="inline-flex h-[21px] shrink-0 items-center rounded-md bg-secondary px-2 text-[11px] font-semibold text-secondary-foreground">
                                {it.status}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* 하단 입력 바 */}
      <div className="shrink-0 border-t border-border/60 px-6 pb-3.5 pt-3">
        <div className="mx-auto max-w-[760px]">
          {/* 예시 질문 칩 — 빈 대화 상태에서만 노출 */}
          {isEmpty && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  className="h-7 whitespace-nowrap rounded-full border bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-muted"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(draft);
            }}
          >
            <div className="flex h-10 flex-1 items-center rounded-[11px] border bg-background px-3.5 transition-colors focus-within:border-muted-foreground/50">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="매물·고객·일정에 대해 물어보세요"
                className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="전송"
              className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              <Send className="size-4" aria-hidden="true" />
            </button>
          </form>
          <div className="mt-[7px] text-[10.5px] text-muted-foreground/60">
            AI 답변은 참고용이에요 — 계약·금액 등 중요한 내용은 원본 데이터를 확인하세요.
          </div>
        </div>
      </div>
    </div>
  );
}
