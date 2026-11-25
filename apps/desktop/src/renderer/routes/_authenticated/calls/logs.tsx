import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Search,
} from 'lucide-react';
import type { CallLogStatus } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatConsultationWhen } from '../consultations/-consultation-list-model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface CallLogsSearch {
  phone?: string;
}

export const Route = createFileRoute('/_authenticated/calls/logs')({
  validateSearch: (search: Record<string, unknown>): CallLogsSearch => ({
    phone: typeof search.phone === 'string' ? search.phone : undefined,
  }),
  component: CallLogsPage,
});

type DirectionFilter = 'all' | 'inbound' | 'outbound';
type StatusFilter = 'all' | CallLogStatus;

const statusLabel: Record<CallLogStatus, string> = {
  ringing: '수신 중',
  answered: '통화 중',
  missed: '부재중',
  ended: '통화 완료',
};

const statusBadgeClass: Record<CallLogStatus, string> = {
  ringing: 'border-emerald-400 text-emerald-600',
  answered: 'border-emerald-400 text-emerald-600',
  missed: 'border-red-400 text-red-500',
  ended: '',
};

/**
 * 전화기가 "끊김" 신호를 보내지 못한 통화는 몇 시간이 지나도 "수신 중"으로 남는다.
 * 지금 울리는 전화처럼 보이지 않게, 오래된 것은 끝났는지 모른다고 말한다.
 */
const STALE_LIVE_CALL_MS = 2 * 60 * 60 * 1000;

function displayStatus(log: { status: CallLogStatus; startedAt: string }) {
  const isLive = log.status === 'ringing' || log.status === 'answered';
  if (isLive && Date.now() - new Date(log.startedAt).getTime() > STALE_LIVE_CALL_MS) {
    return { label: '끝남 확인 안 됨', className: 'text-muted-foreground' };
  }
  return { label: statusLabel[log.status], className: statusBadgeClass[log.status] };
}

function formatDuration(sec: number): string {
  if (sec === 0) return '-';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

const PAGE_SIZE = 30;

function CallLogsPage() {
  const { phone: searchPhone } = Route.useSearch();
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [phoneInput, setPhoneInput] = useState(searchPhone ?? '');
  const [phoneFilter, setPhoneFilter] = useState(searchPhone ?? '');
  const [page, setPage] = useState(1);

  // 페이지가 이미 열린 상태에서 ?phone= 만 바뀌는 네비게이션(팝업 '이력 보기')은
  // 컴포넌트를 remount하지 않으므로 search 변경을 로컬 필터에 반영한다
  useEffect(() => {
    if (searchPhone === undefined) return;
    setPhoneInput(searchPhone);
    setPhoneFilter(searchPhone);
    setPage(1);
  }, [searchPhone]);

  const { data, isLoading } = useQuery({
    queryKey: ['cti', 'call-logs', { direction, status, phone: phoneFilter, page }],
    queryFn: () =>
      api.cti.listCallLogs({
        direction: direction === 'all' ? undefined : direction,
        status: status === 'all' ? undefined : status,
        phone: phoneFilter || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const applyPhoneFilter = () => {
    setPage(1);
    setPhoneFilter(phoneInput.trim());
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">통화 이력</h1>
          <p className="text-sm text-muted-foreground">
            사무실 전화로 받고 건 통화가 시간 순서로 남습니다. 녹음과 상담 기록은 상담분석에서 봅니다.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/consultations">
            <AudioLines className="size-3.5" />
            상담분석
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyPhoneFilter();
            }}
            placeholder="전화번호 검색"
            className="h-8 w-52 pl-8 text-sm"
          />
        </div>
        <Select
          value={direction}
          onValueChange={(v) => {
            setPage(1);
            setDirection(v as DirectionFilter);
          }}
        >
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 방향</SelectItem>
            <SelectItem value="inbound">수신</SelectItem>
            <SelectItem value="outbound">발신</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setPage(1);
            setStatus(v as StatusFilter);
          }}
        >
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="ended">통화 완료</SelectItem>
            <SelectItem value="missed">부재중</SelectItem>
            <SelectItem value="ringing">수신 중</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50 text-left text-xs text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-3 py-2 font-medium">시간</th>
              <th className="px-3 py-2 font-medium">방향</th>
              <th className="px-3 py-2 font-medium">상대방</th>
              <th className="px-3 py-2 font-medium">상태</th>
              <th className="px-3 py-2 font-medium">통화시간</th>
              <th className="px-3 py-2 font-medium">담당</th>
              <th className="px-3 py-2 font-medium">메모</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-t">
                  <td colSpan={7} className="px-3 py-2.5">
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))
            ) : !data || data.items.length === 0 ? (
              <tr className="border-t">
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  {phoneFilter || direction !== 'all' || status !== 'all'
                    ? '조건에 맞는 통화가 없습니다.'
                    : '아직 남은 통화가 없습니다. 사무실 전화가 연결되면 받고 건 통화가 여기에 쌓입니다.'}
                </td>
              </tr>
            ) : (
              data.items.map((log) => (
                <tr key={log.id} className="border-t hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">
                    {formatConsultationWhen(log.startedAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    {log.direction === 'inbound' ? (
                      log.status === 'missed' ? (
                        <PhoneMissed className="size-4 text-red-500" />
                      ) : (
                        <PhoneIncoming className="size-4 text-emerald-600" />
                      )
                    ) : (
                      <PhoneOutgoing className="size-4 text-blue-500" />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {log.contact ? (
                      <Link
                        to="/contacts/$id"
                        params={{ id: log.contact.id }}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {log.contact.name}
                      </Link>
                    ) : (
                      <>
                        <span>{formatPhone(log.phoneNumber)}</span>
                        {/* 모르는 번호: 바로 연락처로 등록한다 (번호를 채워 연다) */}
                        {log.phoneNumber && (
                          <Link
                            to="/contacts/new"
                            search={{ phone: log.phoneNumber }}
                            className="ml-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          >
                            연락처로 등록
                          </Link>
                        )}
                      </>
                    )}
                    {log.contact && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatPhone(log.phoneNumber)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn('font-normal', displayStatus(log).className)}
                    >
                      {displayStatus(log).label}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                    {formatDuration(log.durationSec)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {log.user?.name ?? '-'}
                  </td>
                  <td className="max-w-48 truncate px-3 py-2.5 text-muted-foreground">
                    {log.memo ?? '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            총 {data.total.toLocaleString()}건 · {page}/{totalPages} 페이지
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
