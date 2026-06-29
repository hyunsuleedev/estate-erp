import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CornerDownRightIcon, MailQuestionIcon } from 'lucide-react';
import type { NetworkInquiry, NetworkInquiryStatus } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { formatDateTime, formatMoney, formatRent } from '@/lib/format';
import { timeAgo } from '@/lib/time-ago';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, FilterBar, FilterCount, FilterSelect, StatusBadge } from '@/components/domain';
import { INQUIRY_STATUS_META, NetBadge, networkKeys } from './-network-shared';
import { InquiryRespondDialog } from './-inquiry-dialogs';

const STATUS_OPTIONS = [
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

/** 문의함 — 받은 문의(응답 처리)와 보낸 문의(상태 추적)를 분리해 보여준다. */
export function InquiryBox() {
  const [scope, setScope] = useState<'received' | 'sent'>('received');
  const [status, setStatus] = useState('');
  const [respondTarget, setRespondTarget] = useState<NetworkInquiry | null>(null);
  const [respondOpen, setRespondOpen] = useState(false);

  const inquiriesQuery = useQuery({
    queryKey: networkKeys.inquiries({ scope, status: status || undefined }),
    queryFn: () =>
      api.network.listInquiries({
        scope,
        status: (status || undefined) as NetworkInquiryStatus | undefined,
      }),
  });

  const items = inquiriesQuery.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b p-3">
        <h2 className="text-base font-semibold">문의함</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          공유 매물에 대한 사무소 간 공식 문의를 관리합니다.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={scope} onValueChange={(v) => setScope(v as 'received' | 'sent')}>
            <TabsList>
              <TabsTrigger value="received">받은 문의</TabsTrigger>
              <TabsTrigger value="sent">보낸 문의</TabsTrigger>
            </TabsList>
          </Tabs>
          <FilterBar className="flex-1">
            <FilterSelect
              label="상태"
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS}
            />
            <FilterCount n={items.length} />
          </FilterBar>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {inquiriesQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : inquiriesQuery.isError ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              문의 목록을 불러오지 못했습니다
              <div className="mt-2">
                <Button variant="outline" size="sm" onClick={() => void inquiriesQuery.refetch()}>
                  재시도
                </Button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={MailQuestionIcon}
              title={scope === 'received' ? '받은 문의가 없습니다' : '보낸 문의가 없습니다'}
              description={
                scope === 'received'
                  ? '매물을 공유하면 다른 사무소의 문의가 여기에 모입니다.'
                  : '중개방의 공유 매물 카드에서 문의를 보낼 수 있습니다.'
              }
            />
          ) : (
            <ul className="space-y-2">
              {items.map((inquiry) => {
                const counterpart =
                  scope === 'received'
                    ? `${inquiry.fromOffice?.name ?? '사무소 미상'}${
                        inquiry.fromUser?.name ? ` · ${inquiry.fromUser.name}` : ''
                      }`
                    : (inquiry.sharedProperty.office?.name ?? '사무소 미상');
                return (
                  <li key={inquiry.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <NetBadge meta={INQUIRY_STATUS_META[inquiry.status]} size="sm" />
                      <span className="text-sm font-medium">{counterpart}</span>
                      <StatusBadge
                        kind="transactionType"
                        status={inquiry.sharedProperty.listing.transactionType}
                        size="sm"
                      />
                      <span className="truncate text-sm text-muted-foreground">
                        {inquiryPropertySummary(inquiry)}
                      </span>
                      <span
                        className="ml-auto shrink-0 text-xs text-muted-foreground"
                        title={formatDateTime(inquiry.createdAt)}
                      >
                        {timeAgo(inquiry.createdAt)}
                      </span>
                    </div>

                    {inquiry.message && (
                      <p className="mt-1.5 text-sm whitespace-pre-wrap">{inquiry.message}</p>
                    )}

                    {inquiry.response && (
                      <p className="mt-1.5 flex items-start gap-1 text-sm text-muted-foreground">
                        <CornerDownRightIcon className="mt-0.5 size-3.5 shrink-0" />
                        <span className="whitespace-pre-wrap">{inquiry.response}</span>
                      </p>
                    )}

                    {scope === 'received' && inquiry.status === 'pending' && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRespondTarget(inquiry);
                            setRespondOpen(true);
                          }}
                        >
                          응답하기
                        </Button>
                      </div>
                    )}
                    {scope === 'sent' && inquiry.status === 'accepted' && (
                      <p className="mt-1.5 text-xs text-success">
                        수락된 문의입니다 — 담당자 연락처로 공동중개를 진행하세요.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <InquiryRespondDialog
        open={respondOpen}
        onOpenChange={setRespondOpen}
        inquiry={respondTarget}
      />
    </div>
  );
}
