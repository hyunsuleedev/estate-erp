import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { PaperclipIcon, SendIcon, XIcon } from 'lucide-react';
import type { NetworkMessage, NetworkSharedPropertyView } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatArea, formatMoney, formatRent } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/domain';
import { clockTime, dayHeading } from '../employees/-employee-shared';
import { getErrorMessage, networkKeys } from './-network-shared';

const POLL_INTERVAL_MS = 10_000;

function priceOf(view: NetworkSharedPropertyView) {
  const { listing } = view;
  if (listing.price === undefined && listing.deposit === undefined) return '가격 비공개';
  return listing.transactionType === 'monthly'
    ? formatRent(listing.deposit, listing.monthlyRent)
    : formatMoney(listing.price ?? listing.deposit);
}

/** 말에 붙인 매물. 어떤 매물 이야기인지만 알리고, 자세한 것은 공유 매물 표에서 본다. */
function AttachedListing({ view }: { view: NetworkSharedPropertyView }) {
  const { listing } = view;
  const detail = [
    listing.exclusiveAreaM2 != null ? formatArea(listing.exclusiveAreaM2) : null,
    listing.dongName,
    listing.floor != null ? `${listing.floor}층` : null,
    view.office?.name,
  ].filter(Boolean);
  return (
    <div
      className={cn(
        'whitespace-normal border-l-2 border-[#c9c7c1] pl-2.5 text-[13px] leading-[1.5]',
        !view.isActive && 'opacity-60',
      )}
    >
      <p className="flex min-w-0 items-center gap-1.5">
        <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
        <span className="min-w-0 truncate font-medium text-foreground">
          {listing.siteName ?? listing.regionLabel}
        </span>
        <span className="shrink-0 tabular-nums text-foreground">{priceOf(view)}</span>
      </p>
      {detail.length > 0 || !view.isActive ? (
        <p className="truncate text-[12.5px] text-muted-foreground">
          {[...detail, !view.isActive ? '공유 회수됨' : null].filter(Boolean).join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

/** 쓰고 있던 말과 붙인 매물. 화면 폭이 바뀌어 대화 칸이 자리를 옮겨도 남도록 방 화면이 갖고 있는다. */
export interface ChatDraft {
  content: string;
  attachment: NetworkSharedPropertyView | null;
  /** 보내는 중. 대화 칸이 다시 그려져도 입력을 막아 두려고 초안과 같이 둔다. */
  sending: boolean;
}

export const EMPTY_CHAT_DRAFT: ChatDraft = { content: '', attachment: null, sending: false };

export interface ChatPanelProps {
  roomId: string;
  myOfficeId: string;
  /** 매물 카드 첨부 후보 (현재 방의 활성 공유 매물) */
  attachables: NetworkSharedPropertyView[];
  draft: ChatDraft;
  onDraftChange: (update: (previous: ChatDraft) => ChatDraft) => void;
}

/** 룸 채팅 — 10초 폴링 + 커서 페이지네이션 + 매물 카드 첨부. */
export function ChatPanel({
  roomId,
  myOfficeId,
  attachables,
  draft,
  onDraftChange,
}: ChatPanelProps) {
  const queryClient = useQueryClient();
  const { content, attachment, sending } = draft;
  const setContent = (next: string) => onDraftChange((previous) => ({ ...previous, content: next }));
  const setAttachment = (next: NetworkSharedPropertyView | null) =>
    onDraftChange((previous) => ({ ...previous, attachment: next }));
  const [attachOpen, setAttachOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messagesQuery = useInfiniteQuery({
    queryKey: networkKeys.messages(roomId),
    queryFn: ({ pageParam }) =>
      api.network.listMessages(roomId, { cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: POLL_INTERVAL_MS,
  });

  // 페이지는 createdAt desc — 화면은 asc(위→아래 시간순)로 뒤집어 렌더
  const messages: NetworkMessage[] = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    return pages
      .flatMap((page) => page.items)
      .slice()
      .reverse();
  }, [messagesQuery.data]);

  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

  // 새 메시지 도착/전송 시 맨 아래로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lastMessageId]);

  const sendMutation = useMutation({
    mutationFn: (sent: { content: string; attachmentId: string | undefined }) =>
      api.network.sendMessage(roomId, {
        content: sent.content.trim(),
        sharedPropertyId: sent.attachmentId,
      }),
    onMutate: () => onDraftChange((previous) => ({ ...previous, sending: true })),
    // 응답은 이 칸이 다시 그려진 뒤에 올 수 있다. 보낸 것과 지금 초안이 같을 때만 비운다.
    onSuccess: (_message, sent) => {
      onDraftChange((previous) =>
        previous.content === sent.content && previous.attachment?.id === sent.attachmentId
          ? EMPTY_CHAT_DRAFT
          : { ...previous, sending: false },
      );
      void queryClient.invalidateQueries({ queryKey: networkKeys.messages(roomId) });
    },
    onError: (error) => {
      onDraftChange((previous) => ({ ...previous, sending: false }));
      toast.error(getErrorMessage(error));
    },
  });

  const submit = () => {
    if (sending || !content.trim()) return;
    sendMutation.mutate({ content, attachmentId: attachment?.id });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 메시지 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {messagesQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className={cn('h-9 w-2/3', i % 2 === 1 && 'ml-auto')} />
            ))}
          </div>
        ) : messagesQuery.isError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-[13px] text-muted-foreground">대화를 불러오지 못했습니다.</p>
            <Button variant="outline" size="sm" onClick={() => void messagesQuery.refetch()}>
              다시 시도
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-[13.5px] font-medium text-foreground">아직 대화가 없습니다</p>
            <p className="max-w-[260px] text-[12.5px] leading-[1.6] text-muted-foreground">
              매물을 붙여서 물어보면 어떤 매물 이야기인지 바로 전해집니다.
            </p>
          </div>
        ) : (
          <div>
            {messagesQuery.hasNextPage ? (
              <div className="pb-2 text-center">
                <button
                  type="button"
                  onClick={() => void messagesQuery.fetchNextPage()}
                  disabled={messagesQuery.isFetchingNextPage}
                  className="h-7 rounded-md px-2.5 text-[12.5px] text-muted-foreground outline-none hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45 disabled:opacity-60"
                >
                  {messagesQuery.isFetchingNextPage ? '불러오는 중…' : '이전 대화 보기'}
                </button>
              </div>
            ) : null}
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const isMine = message.officeId === myOfficeId;
              const newDay =
                !previous || dayHeading(previous.createdAt) !== dayHeading(message.createdAt);
              // 같은 사람이 이어서 쓴 말은 이름을 다시 적지 않는다
              const continued =
                !newDay &&
                previous.officeId === message.officeId &&
                previous.user?.id === message.user?.id;
              return (
                <div key={message.id}>
                  {newDay ? (
                    <p className="pb-1 pt-6 text-center text-[11.5px] text-[#a09d96]">
                      {dayHeading(message.createdAt)}
                    </p>
                  ) : null}
                  <div
                    className={cn(
                      'flex flex-col',
                      isMine ? 'items-end' : 'items-start',
                      continued ? 'mt-1' : 'mt-3',
                    )}
                  >
                    {!isMine && !continued ? (
                      <span className="mb-1 text-[12px] text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {message.office?.name ?? '사무소 미상'}
                        </span>
                        {message.user?.name ? ` ${message.user.name}` : ''}
                      </span>
                    ) : null}
                    <div
                      className={cn(
                        'flex max-w-[88%] items-end gap-1.5',
                        isMine && 'flex-row-reverse',
                      )}
                    >
                      <div
                        className={cn(
                          'min-w-0 space-y-1.5 whitespace-pre-wrap break-words rounded-[10px] px-3 py-[7px] text-[13.5px] leading-[1.55] text-foreground',
                          isMine
                            ? 'bg-[#e9eef5]'
                            : 'bg-white shadow-[inset_0_0_0_1px_rgba(42,28,0,0.09)]',
                        )}
                      >
                        {message.content}
                        {message.sharedProperty ? (
                          <AttachedListing view={message.sharedProperty} />
                        ) : null}
                      </div>
                      <time
                        dateTime={message.createdAt}
                        className="shrink-0 pb-0.5 text-[11px] tabular-nums text-[#a09d96]"
                      >
                        {clockTime(message.createdAt)}
                      </time>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* 입력 영역 */}
      <div className="shrink-0 px-4 pb-4 pt-1">
        <form
          className="rounded-[10px] bg-white shadow-[inset_0_0_0_1px_rgba(42,28,0,0.14)] focus-within:shadow-[inset_0_0_0_1.5px_rgba(35,131,226,0.55)]"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {attachment ? (
            <div className="flex items-center gap-2 border-b border-border/70 py-1.5 pl-3 pr-1.5 text-[12.5px]">
              <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {attachment.listing.siteName ?? attachment.listing.regionLabel}
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                disabled={sending}
                aria-label="붙인 매물 빼기"
                className="inline-grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ) : null}
          <div className="flex items-center gap-1 p-1">
            <Popover open={attachOpen} onOpenChange={setAttachOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="매물 붙이기"
                  disabled={sending || attachables.length === 0}
                  title={attachables.length === 0 ? '붙일 공유 매물이 없습니다' : '매물 붙이기'}
                  className="inline-grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-40"
                >
                  <PaperclipIcon className="size-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-1">
                <p className="px-2 py-1.5 text-[12px] text-muted-foreground">
                  이 방의 공유 매물 붙이기
                </p>
                <div className="max-h-56 overflow-y-auto">
                  {attachables.map((shared) => {
                    const listing = shared.listing;
                    const price =
                      listing.transactionType === 'monthly'
                        ? formatRent(listing.deposit, listing.monthlyRent)
                        : formatMoney(listing.price);
                    return (
                      <button
                        key={shared.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-muted"
                        onClick={() => {
                          setAttachment(shared);
                          setAttachOpen(false);
                        }}
                      >
                        <StatusBadge
                          kind="transactionType"
                          status={listing.transactionType}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {listing.siteName ?? listing.regionLabel}
                        </span>
                        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                          {price}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="메시지 입력"
              aria-label="메시지"
              disabled={sending}
              className="h-8 min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-[#a09d96] disabled:opacity-60"
            />
            <button
              type="submit"
              aria-label="보내기"
              disabled={sending || !content.trim()}
              className="inline-grid size-8 shrink-0 place-items-center rounded-md bg-foreground text-background outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring/45 disabled:bg-transparent disabled:text-[#c4c2bc]"
            >
              <SendIcon className="size-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
