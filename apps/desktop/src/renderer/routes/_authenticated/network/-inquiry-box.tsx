import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CornerDownRightIcon } from 'lucide-react';
import type { NetworkInquiry, NetworkInquiryStatus } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { formatDateTime, formatMoney, formatRent } from '@/lib/format';
import { timeAgo } from '@/lib/time-ago';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/domain';
import { cn } from '@/lib/utils';
import { ToolbarPillTabs } from '../properties/-components/property-toolbar';
import { INQUIRY_STATUS_META, networkKeys } from './-network-shared';
import { InquiryRespondDialog } from './-inquiry-dialogs';

const STATUS_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '응답 대기' },
  { value: 'accepted', label: '수락됨' },
  { value: 'rejected', label: '거절됨' },
  { value: 'expired', label: '만료됨' },
];

function inquiryPropertySummary(inquiry: NetworkInquiry): string {
  const listing = inquiry.sharedProperty.listing;
  const name = listing.siteName ?? listing.regionLabel;
  const price =
    listing.transactionType === 'monthly'
      ? formatRent(listing.deposit, listing.monthlyRent)
      : formatMoney(listing.price);
  return price === '—' ? name : `${name} · ${price}`;
}

type Scope = 'received' | 'sent';

/**
 * 문의함 — 받은 문의는 답할 것, 보낸 문의는 답을 기다리는 것이다.
 * 둘을 탭으로 나누고, 줄마다 누가·어떤 매물에·무슨 말을 했는지와 답을 이어서 보인다.
 */
export function InquiryBox() {
  const [scope, setScope] = useState<Scope>('received');
  const [status, setStatus] = useState('all');
  const [respondTarget, setRespondTarget] = useState<NetworkInquiry | null>(null);
  const [respondOpen, setRespondOpen] = useState(false);

  const statusParam = status === 'all' ? undefined : status;
  const inquiriesQuery = useQuery({
    queryKey: networkKeys.inquiries({ scope, status: statusParam }),
    queryFn: () =>
      api.network.listInquiries({
        scope,
        status: statusParam as NetworkInquiryStatus | undefined,
      }),
  });

  const items = inquiriesQuery.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 px-6 pb-3 pt-5">
        <h1 className="text-[22px] font-bold leading-[1.25] tracking-[-0.025em] text-foreground">
          문의함
        </h1>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-6 py-2.5">
        <ToolbarPillTabs
          shape="soft"
          ariaLabel="문의 방향"
          value={scope}
          onChange={(next) => setScope(next as Scope)}
          options={[
            { value: 'received', label: '받은 문의' },
            { value: 'sent', label: '보낸 문의' },
          ]}
        />
        <div role="group" aria-label="상태" className="flex flex-wrap items-center gap-0.5">
          {STATUS_OPTIONS.map((option) => {
            const selected = status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setStatus(option.value)}
                className={cn(
                  'inline-flex h-7 items-center rounded-full px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/45',
                  selected
                    ? 'bg-[rgba(55,53,47,0.08)] font-medium text-foreground'
                    : 'text-[#6f6c66] hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <span className="ml-auto text-[12.5px] tabular-nums text-muted-foreground">
          {items.length}건
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
        {inquiriesQuery.isLoading ? (
          <div className="space-y-2 px-6 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : inquiriesQuery.isError ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-[13px] text-muted-foreground">문의 목록을 불러오지 못했습니다.</p>
            <Button variant="outline" size="sm" onClick={() => void inquiriesQuery.refetch()}>
              다시 시도
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-8 py-14 text-center">
            <p className="text-[14px] font-medium text-foreground">
              {status !== 'all'
                ? '조건에 맞는 문의가 없습니다'
                : scope === 'received'
                  ? '받은 문의가 없습니다'
                  : '보낸 문의가 없습니다'}
            </p>
            {status === 'all' ? (
              <p className="max-w-[340px] text-[13px] leading-[1.6] text-muted-foreground">
                {scope === 'received'
                  ? '중개방에 매물을 공유하면 다른 사무소의 문의가 여기에 모입니다.'
                  : '중개방의 공유 매물에서 문의를 보낼 수 있습니다.'}
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="max-w-[920px] divide-y divide-border/70 px-6">
            {items.map((inquiry) => {
              const listing = inquiry.sharedProperty.listing;
              const counterpart =
                scope === 'received'
                  ? (inquiry.fromOffice?.name ?? '사무소 미상')
                  : (inquiry.sharedProperty.office?.name ?? '사무소 미상');
              const person = scope === 'received' ? inquiry.fromUser?.name : undefined;
              const canRespond = scope === 'received' && inquiry.status === 'pending';
              return (
                <li key={inquiry.id} className="py-3.5">
                  <div className="flex items-center gap-2 text-[13.5px]">
                    <InquiryStatus status={inquiry.status} />
                    <span className="shrink-0 font-medium text-foreground">{counterpart}</span>
                    {person ? (
                      <span className="shrink-0 text-muted-foreground">{person}</span>
                    ) : null}
                    <span aria-hidden="true" className="text-[#c9c7c1]">
                      ·
                    </span>
                    <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
                    <span className="min-w-0 truncate text-muted-foreground">
                      {inquiryPropertySummary(inquiry)}
                    </span>
                    <span
                      className="ml-auto shrink-0 text-[12px] tabular-nums text-muted-foreground"
                      title={formatDateTime(inquiry.createdAt)}
                    >
                      {timeAgo(inquiry.createdAt)}
                    </span>
                  </div>

                  {inquiry.message ? (
                    <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-[1.6] text-foreground">
                      {inquiry.message}
                    </p>
                  ) : null}

                  {inquiry.response ? (
                    <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-[1.6] text-muted-foreground">
                      <CornerDownRightIcon className="mt-[3px] size-3.5 shrink-0" aria-hidden="true" />
                      <span className="whitespace-pre-wrap">{inquiry.response}</span>
                    </p>
                  ) : null}

                  {canRespond ? (
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5"
                        onClick={() => {
                          setRespondTarget(inquiry);
                          setRespondOpen(true);
                        }}
                      >
                        응답하기
                      </Button>
                    </div>
                  ) : null}
                  {scope === 'sent' && inquiry.status === 'accepted' ? (
                    <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                      수락된 문의입니다. 담당자 연락처로 공동중개를 진행하세요.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <InquiryRespondDialog
        open={respondOpen}
        onOpenChange={setRespondOpen}
        inquiry={respondTarget}
      />
    </div>
  );
}

const INQUIRY_DOT: Record<string, string> = {
  pending: 'bg-[#d9730d]',
  accepted: 'bg-[#448361]',
  rejected: 'bg-[#c4554d]',
  expired: 'bg-[#b8b6b0]',
};

/** 상태는 점 하나와 글자로만 적는다 */
function InquiryStatus({ status }: { status: string }) {
  return (
    <span className="inline-flex w-[72px] shrink-0 items-center gap-1.5 text-[12.5px] text-foreground">
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', INQUIRY_DOT[status] ?? 'bg-[#b8b6b0]')}
      />
      {INQUIRY_STATUS_META[status]?.label ?? status}
    </span>
  );
}
