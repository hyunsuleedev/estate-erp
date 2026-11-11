import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, Loader2, PhoneIncoming, PhoneOutgoing, RotateCcw, Users } from 'lucide-react';
import type { CallRecordingListItem } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/format';
import { timeAgo } from '@/lib/time-ago';
import { directionLabel, pendingReason } from './-call-utils';

const VISIBLE_ROWS = 4;
const PAGE_SIZE = 30;

/**
 * 연결 대기 녹음: 녹음은 있는데 아직 상담 기록이 없는 것 (미등록 번호, 받아쓰기·분석 중, 실패).
 * 상담분석 목록 위에 두고, 누르면 통화 상세를 연다. 연락처를 연결하거나 분석이 끝나면 상담으로 들어가 여기서 빠진다.
 */
export function PendingRecordingsStrip({ onOpen }: { onOpen: (recordingId: string) => void }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  // 통화 목록 화면이 없어졌으므로 오래된 연결 대기 녹음도 여기서 끝까지 넘겨 볼 수 있어야 한다 → 페이지 단위로 더 불러온다
  const query = useInfiniteQuery({
    queryKey: ['call-recordings', 'list', 'unlinked'],
    queryFn: ({ pageParam }) => api.callRecordings.list({ unlinked: true, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    // 받아쓰기·분석 중인 녹음이 있으면 끝날 때까지 다시 불러온다
    refetchInterval: (state) =>
      state.state.data?.pages.some((page) =>
        page.items.some(
          (item) =>
            item.sttStatus === 'pending' || item.sttStatus === 'processing' || item.analysisStatus === 'processing',
        ),
      )
        ? 8000
        : false,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.pagination.total ?? items.length;

  // 여기서 빠진 녹음은 상담 기록이 된 것이다 — 상담 목록을 새로 불러온다
  const previousIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!query.data) return;
    const ids = new Set(query.data.pages.flatMap((page) => page.items).map((item) => item.id));
    const before = previousIds.current;
    if (before && [...before].some((id) => !ids.has(id))) {
      void queryClient.invalidateQueries({ queryKey: ['consultations'] });
    }
    previousIds.current = ids;
  }, [query.data, queryClient]);

  // 불러오지 못했으면 '대기 없음'과 구분해 알린다 (이미 받은 목록이 있으면 그대로 보여 준다)
  if (query.isError && items.length === 0) {
    return (
      <section
        data-pending-recordings-error
        className="flex items-center justify-between gap-3 rounded-[10px] border border-destructive/30 bg-destructive-soft px-4 py-2.5"
      >
        <p className="flex items-center gap-1.5 text-[13px] text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          연결 대기 녹음을 불러오지 못했습니다.
        </p>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => void query.refetch()}>
          <RotateCcw className="size-3.5" />
          다시 시도
        </Button>
      </section>
    );
  }
  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, VISIBLE_ROWS);
  const remaining = Math.max(0, total - items.length);

  return (
    <section
      data-pending-recordings
      className="overflow-hidden rounded-[10px] border border-amber-200 bg-amber-50/60"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">연결 대기 녹음 {total}건</h2>
          <p className="text-xs text-muted-foreground">
            아직 상담 기록이 되지 않은 녹음입니다. 연락처를 연결하거나 분석이 끝나면 상담 목록으로 들어갑니다.
          </p>
        </div>
      </div>
      <ul className="border-t border-amber-200/70 bg-background">
        {visible.map((item) => (
          <PendingRow key={item.id} item={item} onOpen={() => onOpen(item.id)} />
        ))}
      </ul>
      {(items.length > VISIBLE_ROWS || remaining > 0) && (
        <div className="flex items-center justify-center gap-4 border-t border-amber-200/70 bg-background py-1.5 text-[12px] text-muted-foreground">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1 hover:text-foreground"
            aria-expanded={expanded}
          >
            <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
            {expanded ? '접기' : `${items.length - Math.min(items.length, VISIBLE_ROWS) + remaining}건 더 보기`}
          </button>
          {expanded && query.hasNextPage && (
            <button
              type="button"
              data-pending-load-more
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
              className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-60"
            >
              {query.isFetchingNextPage && <Loader2 className="size-3 animate-spin" />}
              더 불러오기 ({remaining}건 남음)
            </button>
          )}
        </div>
      )}
      {query.isError && (
        <p className="flex items-center justify-between gap-2 border-t border-amber-200/70 bg-background px-4 py-1.5 text-[11px] text-destructive">
          최신 상태를 불러오지 못했습니다.
          <button type="button" onClick={() => void query.refetch()} className="underline underline-offset-2">
            다시 시도
          </button>
        </p>
      )}
    </section>
  );
}

function PendingRow({ item, onOpen }: { item: CallRecordingListItem; onOpen: () => void }) {
  const reason = pendingReason(item);
  const Icon = item.direction === 'visit' ? Users : item.direction === 'outbound' ? PhoneOutgoing : PhoneIncoming;
  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={cn('text-sm font-medium', !item.contact && 'italic text-muted-foreground')}>
              {item.contact?.name ?? '미등록 번호'}
            </span>
            {item.phoneNumber && (
              <span className="font-mono text-[11px] text-muted-foreground">{formatPhone(item.phoneNumber)}</span>
            )}
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {directionLabel(item.direction)}
            </span>
            <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]', reason.className)}>
              {reason.busy && <Loader2 className="size-2.5 animate-spin" />}
              {reason.label}
            </span>
          </span>
          {item.analysis?.summary && (
            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{item.analysis.summary}</span>
          )}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(item.calledAt)}</span>
      </button>
    </li>
  );
}
