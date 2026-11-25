import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { ToolbarPillSearch, ToolbarPillTabs } from '../properties/-components/property-toolbar';
import { formatCancelledBy, formatDealAmount, getDealTitle } from './-deal-view-utils';

/** trailing: 툴바 오른쪽 끝에 놓는 것 (거래관리의 진행/종료 전환·보기 전환·새 거래) */
export function EndedDeals({ onOpen, trailing }: { onOpen: (id: string) => void; trailing?: ReactNode }) {
  const [kind, setKind] = useState<'closed' | 'cancelled'>('closed');
  const [text, setText] = useState('');
  const [since, setSince] = useState('');
  const q = useDeferredValue(text.trim());
  const end = useRef<HTMLButtonElement>(null);
  const query = useInfiniteQuery({
    queryKey: ['deals', 'archive', kind, q, since],
    initialPageParam: '',
    queryFn: ({ pageParam }) => api.deals.findArchive({ kind, q, since }, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const { hasNextPage, isFetching, isError, fetchNextPage } = query;
  useEffect(() => {
    if (!end.current || !hasNextPage || isFetching || isError) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void fetchNextPage();
    });
    observer.observe(end.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetching, isError, fetchNextPage, kind, q, since]);
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {/* 진행 목록의 1행과 같은 치수 — 진행/종료를 오갈 때 줄 높이와 오른쪽 단추 자리가 그대로다 */}
      <div className="shrink-0 border-b border-border bg-white px-3 py-2.5">
      <div className="@container flex min-w-0 items-center gap-2">
        <ToolbarPillTabs shape="muted" ariaLabel="종료 구분" value={kind} onChange={setKind}
          options={[{ value: 'closed', label: '정산 종료' }, { value: 'cancelled', label: '거래 취소' }]} />
        <div className="flex min-w-0 max-w-[360px] flex-1">
          <ToolbarPillSearch value={text} onChange={setText} placeholder="단지명, 고객명" ariaLabel="종료 거래 검색" />
        </div>
        <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
          종료일 기준
          <Input
            type="date"
            aria-label="조회 시작일"
            className="h-8 w-auto"
            value={since}
            onChange={(e) => setSince(e.target.value)}
          />
          이후
        </label>
        {trailing ? <div className="ml-auto flex shrink-0 items-center gap-2">{trailing}</div> : null}
      </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
            <tr>{['종료일', '매물', '매도·임대인', '매수·임차인', '거래금액', ...(kind === 'cancelled' ? ['취소 사유'] : [])].map((label) => <th key={label} className="border-b px-2 py-2 font-normal">{label}</th>)}</tr>
          </thead>
          <tbody>{rows.map((deal) => (
            <tr key={deal.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => onOpen(deal.id)}>
              <td className="px-2 py-2">{formatDate(kind === 'closed' ? deal.stageChangedAt : deal.cancelledAt)}</td>
              <td className="px-2"><button type="button" className="text-left hover:underline" onClick={(event) => { event.stopPropagation(); onOpen(deal.id); }}>{getDealTitle(deal)}</button></td>
              <td className="px-2">{deal.sellerContact?.name ?? '—'}</td>
              <td className="px-2">{deal.buyerContact?.name ?? '—'}</td>
              <td className="px-2">{formatDealAmount(deal)}</td>
              {kind === 'cancelled' ? (
                <td className="max-w-[260px] truncate px-2 text-muted-foreground" title={deal.cancelReason ?? undefined}>
                  {[formatCancelledBy(deal.cancelledBy, deal.transactionType), deal.cancelReason].filter(Boolean).join(' · ')}
                </td>
              ) : null}
            </tr>
          ))}</tbody>
        </table>
        {query.isPending ? <p className="p-6 text-center text-sm">불러오는 중…</p> : !isError && !rows.length && <p className="p-6 text-center text-sm text-muted-foreground">해당하는 종료 거래가 없습니다.</p>}
        {isError && <button className="p-3 text-sm" onClick={() => query.isFetchNextPageError ? fetchNextPage() : query.refetch()}>종료 거래를 불러오지 못했습니다. 재시도</button>}
        {hasNextPage && !isError && <button ref={end} className="w-full p-2 text-sm text-muted-foreground" disabled={isFetching} onClick={() => fetchNextPage()}>더 보기</button>}
      </div>
    </section>
  );
}
