import { useState, type ReactNode } from 'react';
import {
  CalendarCheck,
  ExternalLink,
  FileClock,
  Handshake,
  Megaphone,
  MessageSquareText,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecordFilter, RecordItem, RecordKind } from './model';
import { recordFilterOf } from './model';
import { H2, nb } from './ui';

/*
 * 기록: 상담 · 확인 · 가격 · 광고 · 거래 · 의뢰를 한 줄기로. 날짜별로 묶고 20개씩 더 본다.
 */

const recordFilters: Array<{ value: RecordFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'consultation', label: '상담·확인' },
  { value: 'price', label: '가격' },
  { value: 'ad', label: '광고' },
  { value: 'deal', label: '거래·의뢰' },
];

const recordIcon: Record<RecordKind, ReactNode> = {
  consultation: <MessageSquareText />,
  confirm: <CalendarCheck />,
  price: <TrendingDown />,
  ad: <Megaphone />,
  deal: <Handshake />,
  intake: <FileClock />,
};

const recordIconClassName: Record<RecordKind, string> = {
  consultation: 'bg-[rgb(231,243,248)] text-[rgb(51,126,169)]',
  confirm: 'bg-[rgb(237,243,236)] text-[rgb(68,131,97)]',
  price: 'bg-[rgb(237,243,236)] text-[rgb(68,131,97)]',
  ad: 'bg-[rgb(251,243,219)] text-[rgb(203,145,47)]',
  deal: 'bg-[rgb(231,243,248)] text-[rgb(51,126,169)]',
  intake: 'bg-[rgb(241,240,236)] text-[rgb(120,117,110)]',
};

const RECORD_PAGE = 20;

export function RecordsSection({
  records,
  action,
  notice,
}: {
  records: RecordItem[];
  action: ReactNode;
  notice?: ReactNode;
}) {
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [limit, setLimit] = useState(RECORD_PAGE);
  const counts = records.reduce<Record<RecordFilter, number>>(
    (acc, record) => {
      acc[recordFilterOf[record.kind]] += 1;
      acc.all += 1;
      return acc;
    },
    { all: 0, consultation: 0, price: 0, ad: 0, deal: 0 },
  );
  const visible = records.filter((record) => filter === 'all' || recordFilterOf[record.kind] === filter);
  const shown = visible.slice(0, limit);
  const groups: Array<{ dateText: string; items: RecordItem[] }> = [];
  for (const record of shown) {
    const last = groups[groups.length - 1];
    if (last && last.dateText === record.dateText) last.items.push(record);
    else groups.push({ dateText: record.dateText, items: [record] });
  }

  return (
    <section id="records">
      <H2 title="기록" count={records.length} action={action} />
      <div role="tablist" aria-label="기록 종류" className="mt-1 flex gap-0.5 border-b border-[#e9e9e7]">
        {recordFilters.map((item) => {
          const selected = filter === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setFilter(item.value);
                setLimit(RECORD_PAGE);
              }}
              className={cn(
                'relative inline-flex h-[34px] items-center gap-1.5 px-2 text-[14px] text-[#37352f]/65 hover:text-[#37352f]',
                selected &&
                  'font-medium text-[#37352f] after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-[1px] after:bg-[#37352f]',
              )}
            >
              {item.label}
              <span className="font-normal tabular-nums text-[#37352f]/45">{counts[item.value]}</span>
            </button>
          );
        })}
      </div>
      {notice && <div className="mt-3">{notice}</div>}
      {shown.length === 0 ? (
        <p className="mt-4 text-[14px] text-[#37352f]/45">
          {filter === 'all' ? '아직 기록이 없습니다.' : '이 종류의 기록이 없습니다.'}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.dateText} className="mt-3.5">
            <div className="py-1 text-[12px] font-semibold tabular-nums text-[#37352f]/65">{group.dateText}</div>
            <ol>
              {group.items.map((record) => (
                <li key={record.id} className="-mx-1.5 flex gap-2.5 rounded px-1.5 py-2 hover:bg-[#37352f]/[0.03]">
                  <span
                    className={cn(
                      'grid size-[26px] shrink-0 place-items-center rounded-full [&_svg]:size-3.5',
                      record.kind === 'price' && record.direction === 'up'
                        ? 'bg-[rgb(253,235,236)] text-[rgb(205,60,58)]'
                        : recordIconClassName[record.kind],
                    )}
                  >
                    {record.kind === 'price' && record.direction === 'up' ? <TrendingUp /> : recordIcon[record.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-1.5 text-[14px] leading-[22px]">
                      <span className="shrink-0 font-semibold text-[#37352f]">{record.title}</span>
                      {record.meta && <span className="truncate text-[#37352f]/65">{record.meta}</span>}
                      {record.summary && <span className="truncate tabular-nums text-[#37352f]">{record.summary}</span>}
                      {record.url && (
                        <a
                          href={record.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="광고 열기"
                          className="shrink-0 text-[#37352f]/45 hover:text-[#37352f]"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                      {record.timeText && (
                        <span className="ml-auto shrink-0 pl-2 text-[12px] tabular-nums text-[#37352f]/45">
                          {record.timeText}
                        </span>
                      )}
                    </div>
                    {record.body && (
                      <p className="mt-0.5 whitespace-pre-wrap break-keep text-[14px] leading-[1.65] text-[#37352f]/90 [overflow-wrap:anywhere]">
                        {record.body}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
      {visible.length > shown.length && (
        <button type="button" onClick={() => setLimit((value) => value + RECORD_PAGE)} className={cn(nb.line, 'mt-3 w-full')}>
          이전 기록 {Math.min(RECORD_PAGE, visible.length - shown.length)}개 더 보기
        </button>
      )}
    </section>
  );
}
