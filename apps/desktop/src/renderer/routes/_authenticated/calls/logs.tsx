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
import { cn } from '@/lib/utils';
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

function formatPhone(phone: string): string {
  if (/^01\d{9}$/.test(phone)) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`;
  }
  return phone;
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
            CTI로 수집된 수신/발신 통화 기록 (녹음과 별개)
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/calls">
            <AudioLines className="size-3.5" />
            통화 녹음
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
                  통화 기록이 없습니다
                </td>
              </tr>
            ) : (
              data.items.map((log) => (
                <tr key={log.id} className="border-t hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                    {new Date(log.startedAt).toLocaleString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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
                      <span className="font-medium">{log.contact.name}</span>
                    ) : (
                      <span>{formatPhone(log.phoneNumber)}</span>
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
                      className={cn('font-normal', statusBadgeClass[log.status])}
                    >
                      {statusLabel[log.status]}
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
