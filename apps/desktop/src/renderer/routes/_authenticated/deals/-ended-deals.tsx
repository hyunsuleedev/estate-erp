import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ToolbarPillSearch, ToolbarPillTabs } from '../properties/-components/property-toolbar';
import { formatDealAmount, getDealTitle } from './-deal-view-utils';

export function EndedDeals({ onOpen }: { onOpen: (id: string) => void }) {
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
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <ToolbarPillTabs shape="muted" ariaLabel="종료 구분" value={kind} onChange={setKind}
          options={[{ value: 'closed', label: '정산 종료' }, { value: 'cancelled', label: '거래 취소' }]} />
        <ToolbarPillSearch value={text} onChange={setText} placeholder="단지명, 고객명" ariaLabel="종료 거래 검색" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          종료일 기준
          <input type="date" aria-label="조회 시작일" value={since} onChange={(e) => setSince(e.target.value)} />
          이후
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
            <tr>{['종료일', '매물', '매도·임대인', '매수·임차인', '거래금액'].map((label) => <th key={label} className="border-b px-2 py-2 font-normal">{label}</th>)}</tr>
          </thead>
          <tbody>{rows.map((deal) => (
            <tr key={deal.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => onOpen(deal.id)}>
              <td className="px-2 py-2">{formatDate(kind === 'closed' ? deal.stageChangedAt : deal.cancelledAt)}</td>
              <td className="px-2"><button type="button" className="text-left hover:underline" onClick={(event) => { event.stopPropagation(); onOpen(deal.id); }}>{getDealTitle(deal)}</button></td>
              <td className="px-2">{deal.sellerContact?.name ?? '—'}</td>
              <td className="px-2">{deal.buyerContact?.name ?? '—'}</td>
              <td className="px-2">{formatDealAmount(deal)}</td>
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
