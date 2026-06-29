import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquareIcon, PaperclipIcon, SendIcon, XIcon } from 'lucide-react';
import type { NetworkMessage, NetworkSharedPropertyView } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime, formatMoney, formatRent } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, StatusBadge } from '@/components/domain';
import { getErrorMessage, networkKeys } from './-network-shared';
import { SharedPropertyCard } from './-shared-property-card';

const POLL_INTERVAL_MS = 10_000;

function messageFlags(view: NetworkSharedPropertyView) {
  return {
    showSiteName: view.showSiteName,
    showDong: view.showDong,
    showUnit: view.showUnit,
    showFloor: view.showFloor,
    showPrice: view.showPrice,
    showArea: view.showArea,
    showMemo: view.showMemo,
    showPhotos: view.showPhotos,
  };
}

export interface ChatPanelProps {
  roomId: string;
  myOfficeId: string;
  /** 매물 카드 첨부 후보 (현재 방의 활성 공유 매물) */
  attachables: NetworkSharedPropertyView[];
}

/** 룸 채팅 — 10초 폴링 + 커서 페이지네이션 + 매물 카드 첨부. */
export function ChatPanel({ roomId, myOfficeId, attachables }: ChatPanelProps) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [attachment, setAttachment] = useState<NetworkSharedPropertyView | null>(null);
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
    mutationFn: () =>
      api.network.sendMessage(roomId, {
        content: content.trim(),
        sharedPropertyId: attachment?.id,
      }),
    onSuccess: () => {
      setContent('');
      setAttachment(null);
      void queryClient.invalidateQueries({ queryKey: networkKeys.messages(roomId) });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const submit = () => {
    if (!content.trim()) return;
    sendMutation.mutate();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 메시지 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {messagesQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                className={cn('h-10 w-2/3', i % 2 === 1 && 'ml-auto')}
              />
            ))}
          </div>
        ) : messagesQuery.isError ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            메시지를 불러오지 못했습니다
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={() => void messagesQuery.refetch()}>
                재시도
              </Button>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={MessageSquareIcon}
            title="아직 메시지가 없습니다"
            description="첫 메시지를 남겨 공동중개 대화를 시작해보세요."
          />
        ) : (
          <div className="space-y-3">
            {messagesQuery.hasNextPage && (
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void messagesQuery.fetchNextPage()}
                  disabled={messagesQuery.isFetchingNextPage}
                >
                  {messagesQuery.isFetchingNextPage ? '불러오는 중…' : '이전 메시지 보기'}
                </Button>
              </div>
            )}
            {messages.map((message) => {
              const isMine = message.officeId === myOfficeId;
              return (
                <div
                  key={message.id}
                  className={cn('flex flex-col gap-0.5', isMine ? 'items-end' : 'items-start')}
                >
                  {!isMine && (
                    <span className="px-1 text-[11px] text-muted-foreground">
                      {message.office?.name ?? '사무소 미상'}
                      {message.user?.name ? ` · ${message.user.name}` : ''}
                    </span>
                  )}
                  <div
                    className={cn(
                      'max-w-[85%] space-y-1.5 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
                      isMine
                        ? 'bg-primary text-primary-foreground'
                        : 'border bg-muted/40',
                    )}
                  >
                    {message.content}
                    {message.sharedProperty && (
                      <SharedPropertyCard
                        flags={messageFlags(message.sharedProperty)}
                        listing={message.sharedProperty.listing}
                        isMine={message.sharedProperty.isMine}
                        officeName={message.sharedProperty.office?.name}
                        contactName={message.sharedProperty.contactName}
                        contactPhone={message.sharedProperty.contactPhone}
                        description={message.sharedProperty.description}
                        inactive={!message.sharedProperty.isActive}
                        compact
                        className="bg-background text-foreground"
                      />
                    )}
                  </div>
                  <span className="px-1 text-[10px] text-muted-foreground">
                    {formatDateTime(message.createdAt)}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* 입력 영역 */}
      <div className="border-t p-2.5">
        {attachment && (
          <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
            <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              매물 첨부: {attachment.listing.siteName ?? attachment.listing.regionLabel}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setAttachment(null)}
              aria-label="첨부 해제"
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        )}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Popover open={attachOpen} onOpenChange={setAttachOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="매물 카드 첨부"
                disabled={attachables.length === 0}
                title={attachables.length === 0 ? '첨부할 공유 매물이 없습니다' : '매물 카드 첨부'}
              >
                <PaperclipIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-1">
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                이 방의 공유 매물을 첨부
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
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
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
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {price}
                      </span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="메시지 입력 후 Enter"
            disabled={sendMutation.isPending}
          />
          <Button type="submit" size="icon" disabled={sendMutation.isPending || !content.trim()}>
            <SendIcon className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
