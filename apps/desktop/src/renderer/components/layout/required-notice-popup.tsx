/**
 * 필독 공지 팝업. 안 읽은 필독 공지가 있으면 앱을 열 때 화면 가운데에 띄운다.
 * '확인'을 누르면 읽은 것으로 저장하고, 여러 건이면 다음 것을 이어서 보여 준다.
 *
 * - 바깥을 누르거나 Esc로는 닫히지 않는다. 꼭 봐야 하는 안내라 '확인'으로만 닫는다.
 * - 확인한 공지는 대시보드의 공지사항 목록에 남아 다시 읽을 수 있다.
 * - 탭마다 화면이 따로라 팝업도 탭마다 뜬다. 한 탭에서 확인하면 다른 탭의 팝업도 닫힌다(lib/notices).
 * - 읽음 저장이 실패해도 이번에는 다시 띄우지 않는다. 다음에 앱을 열 때 다시 뜬다.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Notice } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import {
  NOTICES_QUERY_KEY,
  NOTICES_STALE_MS,
  announceNotice,
  applyNoticeRead,
  listenToNotices,
  useKnownNoticeReads,
  withKnownReads,
} from '@/lib/notices';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function RequiredNoticePopup() {
  const queryClient = useQueryClient();
  const notices = useQuery({
    queryKey: NOTICES_QUERY_KEY,
    queryFn: () => api.notices.list(),
    staleTime: NOTICES_STALE_MS,
  });
  // 이 탭이나 다른 탭에서 '확인'을 누른 공지. 캐시가 아직 안 읽음이어도 다시 띄우지 않는다.
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(new Set());
  // 닫히는 동안에도 창 안의 글이 남아 있게 마지막으로 보여 준 공지를 기억한다.
  const [last, setLast] = useState<Notice | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(
    () =>
      listenToNotices((signal) => {
        setConfirmed((prev) => (prev.has(signal.noticeId) ? prev : new Set(prev).add(signal.noticeId)));
        if (signal.type === 'read') applyNoticeRead(queryClient, signal.noticeId, signal.readAt);
      }),
    [queryClient],
  );

  const markRead = useMutation({
    mutationFn: (noticeId: string) => api.notices.markRead(noticeId),
    onSuccess: ({ noticeId, readAt }) => {
      applyNoticeRead(queryClient, noticeId, readAt);
      announceNotice({ type: 'read', noticeId, readAt });
    },
  });

  // 서버가 안 읽은 필독을 목록 맨 앞에 최근 것부터 준다. 그 순서대로 하나씩 보여 준다.
  // 한 번 읽은 공지는 목록 캐시가 예전 응답으로 덮여도 다시 띄우지 않는다
  const known = useKnownNoticeReads();
  const waiting = withKnownReads(notices.data, known).items.filter(
    (notice) => notice.isRequired && !notice.readAt && !confirmed.has(notice.id),
  );
  const current = waiting[0] ?? null;
  const shown = current ?? last;

  const confirm = () => {
    if (!current) return;
    setLast(current);
    setConfirmed((prev) => new Set(prev).add(current.id));
    announceNotice({ type: 'confirmed', noticeId: current.id });
    markRead.mutate(current.id);
  };

  return (
    <Dialog open={current !== null}>
      {shown && (
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            event.preventDefault();
            // 바깥을 누르면 포커스가 창 밖으로 빠진다. 확인 단추로 되돌려 Enter로 바로 닫을 수 있게 한다.
            requestAnimationFrame(() => confirmRef.current?.focus());
          }}
        >
          <DialogHeader>
            <DialogTitle className="leading-7 break-keep">{shown.title}</DialogTitle>
            <DialogDescription>
              에스테잇플로우 필독 공지 · {formatDate(shown.publishedAt)}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto text-sm leading-6 break-words whitespace-pre-wrap text-foreground">
            {shown.body}
          </div>
          <DialogFooter className="items-center sm:justify-between">
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {waiting.length > 1 ? `읽지 않은 필독 공지가 ${waiting.length - 1}건 더 있습니다` : '대시보드의 공지사항에서 다시 볼 수 있습니다'}
            </span>
            <Button ref={confirmRef} onClick={confirm} autoFocus>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
