import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  History,
  Search,
  User as UserIcon,
  Loader2,
} from 'lucide-react';
import type {
  CallRecordingListItem,
  SttStatus,
  CallDirection,
} from '@estate-erp/api-client';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { CallDetailSheet } from './-detail-sheet';

export const Route = createFileRoute('/_authenticated/calls/')({
  component: CallsPage,
});

type RangePreset = 'today' | 'this-week' | 'this-month' | 'all';
type DirectionFilter = 'all' | CallDirection;
type StatusFilter = 'all' | SttStatus;

const rangeLabel: Record<RangePreset, string> = {
  today: '오늘',
  'this-week': '이번 주',
  'this-month': '이번 달',
  all: '전체',
};

const sttStatusLabel: Record<SttStatus, string> = {
  none: '녹음 없음',
  pending: '대기',
  processing: '처리 중',
  completed: '완료',
  failed: '실패',
};

const sttStatusClass: Record<SttStatus, string> = {
  none: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  pending:
    'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  processing:
    'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  completed:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  failed: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

function formatFullTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function presetToDateRange(preset: RangePreset): {
  from: Date | null;
  to: Date | null;
} {
  const now = new Date();
  if (preset === 'today') {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to: null };
  }
  if (preset === 'this-week') {
    const from = new Date(now);
    // 월요일 시작
    const day = from.getDay();
    const diff = day === 0 ? 6 : day - 1;
    from.setDate(from.getDate() - diff);
    from.setHours(0, 0, 0, 0);
    return { from, to: null };
  }
  if (preset === 'this-month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to: null };
  }
  return { from: null, to: null };
}

function CallsPage() {
  const [range, setRange] = useState<RangePreset>('this-week');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['call-recordings', 'list'],
    queryFn: () => api.callRecordings.list({ limit: 100 }),
  });

  const filtered = useMemo(() => {
    const rows = data?.items ?? [];
    const { from } = presetToDateRange(range);
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (from && new Date(r.calledAt) < from) return false;
      if (direction !== 'all' && r.direction !== direction) return false;
      if (status !== 'all' && r.sttStatus !== status) return false;
      if (q) {
        const hay = [
          r.contact?.name,
          r.phoneNumber,
          r.analysis?.summary ?? '',
          r.messages.map((m) => m.text).join(' '),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, range, direction, status, search]);

  const stats = useMemo(() => {
    const all = data?.items ?? [];
    const { from } = presetToDateRange(range);
    const inRange = from
      ? all.filter((r) => new Date(r.calledAt) >= from)
      : all;
    return {
      total: inRange.length,
      inbound: inRange.filter((r) => r.direction === 'inbound').length,
      outbound: inRange.filter((r) => r.direction === 'outbound').length,
      missed: inRange.filter(
        (r) => r.direction === 'inbound' && r.durationSec < 5,
      ).length,
      withStt: inRange.filter((r) => r.sttStatus === 'completed').length,
    };
  }, [data, range]);

  const selectedItem = useMemo(
    () => (data?.items ?? []).find((r) => r.id === selectedId) ?? null,
    [data, selectedId],
  );

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as RangePreset)}>
          <SelectTrigger className="h-9 w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(rangeLabel) as RangePreset[]).map((k) => (
              <SelectItem key={k} value={k}>
                {rangeLabel[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 · 번호 · 요약 · 대화 내용 검색"
            className="h-9 pl-8"
          />
        </div>

        <Select
          value={direction}
          onValueChange={(v) => setDirection(v as DirectionFilter)}
        >
          <SelectTrigger className="h-9 w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="inbound">수신</SelectItem>
            <SelectItem value="outbound">발신</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) => setStatus(v as StatusFilter)}
        >
          <SelectTrigger className="h-9 w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="completed">STT 완료</SelectItem>
            <SelectItem value="processing">처리 중</SelectItem>
            <SelectItem value="pending">대기</SelectItem>
            <SelectItem value="failed">실패</SelectItem>
            <SelectItem value="none">녹음 없음</SelectItem>
          </SelectContent>
        </Select>

        <Button asChild variant="outline" size="sm" className="ml-auto h-9">
          <Link to="/calls/logs">
            <History className="size-3.5" />
            통화 이력
          </Link>
        </Button>
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="전체 통화" value={stats.total} />
        <StatCard
          label="수신"
          value={stats.inbound}
          icon={<PhoneIncoming className="size-3.5 text-sky-600" />}
        />
        <StatCard
          label="발신"
          value={stats.outbound}
          icon={<PhoneOutgoing className="size-3.5 text-violet-600" />}
        />
        <StatCard
          label="부재중"
          value={stats.missed}
          tone={stats.missed > 0 ? 'warn' : undefined}
        />
        <StatCard
          label="STT 완료"
          value={stats.withStt}
          tone="ok"
        />
      </div>

      {/* 리스트 */}
      <div className="overflow-hidden rounded-xl border">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            조건에 맞는 통화 기록이 없습니다.
          </div>
        ) : (
          <ul>
            {filtered.map((call) => (
              <CallRow
                key={call.id}
                call={call}
                selected={selectedId === call.id}
                onOpen={() => setSelectedId(call.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* 상세 Sheet */}
      <Sheet
        open={selectedId !== null}
        onOpenChange={(v) => !v && setSelectedId(null)}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-hidden p-0 sm:max-w-[560px]"
        >
          {selectedItem && (
            <CallDetailSheet
              item={selectedItem}
              onClose={() => setSelectedId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: 'warn' | 'ok';
}) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'mt-0.5 text-lg font-semibold tabular-nums',
          tone === 'warn' && 'text-red-700 dark:text-red-300',
          tone === 'ok' && 'text-emerald-700 dark:text-emerald-300',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function CallRow({
  call,
  selected,
  onOpen,
}: {
  call: CallRecordingListItem;
  selected: boolean;
  onOpen: () => void;
}) {
  const isInbound = call.direction === 'inbound';
  const contactName = call.contact?.name ?? '알 수 없음';
  const missed = isInbound && call.durationSec < 5;
  const sttMeta = sttStatusLabel[call.sttStatus as SttStatus];

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40',
          selected && 'bg-primary/5',
        )}
      >
        {/* direction icon */}
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full',
            isInbound
              ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
              : 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
            missed &&
              'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
          )}
        >
          {isInbound ? (
            <PhoneIncoming className="size-4" />
          ) : (
            <PhoneOutgoing className="size-4" />
          )}
        </div>

        {/* main info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'truncate text-sm font-medium',
                !call.contact && 'text-muted-foreground italic',
              )}
            >
              {contactName}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {call.phoneNumber || '번호 없음'}
            </span>
            {missed && (
              <Badge
                variant="outline"
                className="border-0 bg-red-50 text-[10px] text-red-700 dark:bg-red-950/40 dark:text-red-300"
              >
                부재중
              </Badge>
            )}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px]',
                sttStatusClass[call.sttStatus as SttStatus],
              )}
            >
              {sttMeta}
            </span>
          </div>
          {call.analysis?.summary && (
            <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {call.analysis.summary}
            </div>
          )}
        </div>

        {/* right column — duration + time */}
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-mono">
            <Clock className="size-3" />
            {formatDuration(call.durationSec)}
          </span>
          <span>{formatRelative(call.calledAt)}</span>
        </div>
      </button>
    </li>
  );
}

export { sttStatusLabel, sttStatusClass, formatDuration, formatFullTime };
