import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  RotateCcw,
} from 'lucide-react';
import type {
  CallRecordingListItem,
  SttStatus,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/format';
import { timeAgo } from '@/lib/time-ago';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmptyState,
  FilterBar,
  FilterCount,
  FilterSearch,
  FilterSelect,
  PageHeader,
} from '@/components/domain';
import {
  formatDuration,
  isMissedCall,
  sttStatusClass,
  sttStatusLabel,
} from './-call-utils';
import { CallDetailSheet } from './-detail-sheet';

export const Route = createFileRoute('/_authenticated/calls/')({
  component: CallsPage,
});

const PAGE_SIZE = 20;

type RangePreset = 'today' | 'this-week' | 'this-month';

const rangeOptions: Array<{ value: RangePreset; label: string }> = [
  { value: 'today', label: '오늘' },
  { value: 'this-week', label: '이번 주' },
  { value: 'this-month', label: '이번 달' },
];

const directionOptions = [
  { value: 'inbound', label: '수신' },
  { value: 'outbound', label: '발신' },
];

const sttOptions = (Object.keys(sttStatusLabel) as SttStatus[]).map(
  (value) => ({ value, label: sttStatusLabel[value] }),
);

/** 기간 프리셋 → calledAt >= dateFrom ISO 문자열 ('' = 전체) */
function presetToDateFrom(preset: RangePreset | ''): string | undefined {
  if (!preset) return undefined;
  const now = new Date();
  if (preset === 'today') {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return from.toISOString();
  }
  if (preset === 'this-week') {
    const from = new Date(now);
    // 월요일 시작
    const day = from.getDay();
    const diff = day === 0 ? 6 : day - 1;
    from.setDate(from.getDate() - diff);
    from.setHours(0, 0, 0, 0);
    return from.toISOString();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function CallsPage() {
  const [range, setRange] = useState<RangePreset | ''>('this-week');
  const [direction, setDirection] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CallRecordingListItem | null>(null);

  // 검색 디바운스 (서버사이드 q 필터)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const dateFrom = useMemo(() => presetToDateFrom(range), [range]);

  // 필터 변경 시 1페이지로
  useEffect(() => {
    setPage(1);
  }, [dateFrom, direction, status, debouncedSearch]);

  const listQuery = useQuery({
    queryKey: [
      'call-recordings',
      'list',
      { dateFrom, direction, status, q: debouncedSearch, page },
    ],
    queryFn: () =>
      api.callRecordings.list({
        dateFrom,
        direction: direction || undefined,
        sttStatus: status || undefined,
        q: debouncedSearch || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const items = listQuery.data?.items ?? [];
  const pagination = listQuery.data?.pagination;
  const stats = listQuery.data?.stats;
  const totalPages = pagination?.totalPages ?? 1;
  const hasFilter = Boolean(direction || status || debouncedSearch);

  return (
    <div className="space-y-4">
      <PageHeader
        title="통화 기록"
        description="통화 녹음과 STT·AI 분석 결과를 확인하고 상담으로 전환합니다."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/calls/logs">
              <History className="size-3.5" />
              통화 이력
            </Link>
          </Button>
        }
      />

      {/* 필터 바 */}
      <FilterBar>
        <FilterSelect
          label="기간"
          value={range}
          onChange={(v) => setRange(v as RangePreset | '')}
          options={rangeOptions}
          allLabel="전체"
        />
        <FilterSearch
          value={search}
          onChange={setSearch}
          placeholder="이름 · 번호 · 대화 내용 검색"
          className="w-64"
        />
        <FilterSelect
          label="방향"
          value={direction}
          onChange={setDirection}
          options={directionOptions}
        />
        <FilterSelect
          label="STT"
          value={status}
          onChange={setStatus}
          options={sttOptions}
          allLabel="전체 상태"
        />
        <FilterCount n={pagination?.total ?? 0} />
      </FilterBar>

      {/* 요약 통계 — 기간 필터만 반영 (서버 집계) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="전체 통화" value={stats?.total ?? 0} />
        <StatCard
          label="수신"
          value={stats?.inbound ?? 0}
          icon={<PhoneIncoming className="size-3.5 text-info" />}
        />
        <StatCard
          label="발신"
          value={stats?.outbound ?? 0}
          icon={<PhoneOutgoing className="size-3.5 text-violet" />}
        />
        <StatCard
          label="부재중"
          value={stats?.missed ?? 0}
          tone={stats && stats.missed > 0 ? 'warn' : undefined}
        />
        <StatCard label="STT 완료" value={stats?.sttCompleted ?? 0} tone="ok" />
      </div>

      {/* 리스트 */}
      <div className="overflow-hidden rounded-lg border">
        {listQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : listQuery.isError ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              통화 기록을 불러오지 못했습니다.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void listQuery.refetch()}
            >
              <RotateCcw className="size-3.5" />
              다시 시도
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Phone}
            title={
              hasFilter
                ? '조건에 맞는 통화 기록이 없습니다'
                : '통화 기록이 없습니다'
            }
            description={
              hasFilter
                ? '검색어나 필터를 변경해 보세요.'
                : '모바일 앱에서 통화가 기록되면 여기에 표시됩니다.'
            }
            className="py-10"
          />
        ) : (
          <>
            <ul>
              {items.map((call) => (
                <CallRow
                  key={call.id}
                  call={call}
                  selected={selected?.id === call.id}
                  onOpen={() => setSelected(call)}
                />
              ))}
            </ul>
            {totalPages > 1 && pagination && (
              <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2">
                <span className="text-xs text-muted-foreground">
                  총 {pagination.total}건 중{' '}
                  {(pagination.page - 1) * pagination.limit + 1}–
                  {Math.min(pagination.page * pagination.limit, pagination.total)}건
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    disabled={page <= 1 || listQuery.isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="size-3.5" />
                    이전
                  </Button>
                  <span className="px-1 text-xs tabular-nums text-muted-foreground">
                    {pagination.page} / {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    disabled={page >= totalPages || listQuery.isFetching}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    다음
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 상세 Sheet */}
      <Sheet
        open={selected !== null}
        onOpenChange={(v) => !v && setSelected(null)}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-hidden p-0 sm:max-w-[560px]"
        >
          {selected && <CallDetailSheet item={selected} />}
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
    <div className="rounded-md border bg-background px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'mt-0.5 text-lg font-semibold tabular-nums',
          tone === 'warn' && 'text-destructive',
          tone === 'ok' && 'text-success',
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
  const contactName = call.contact?.name ?? '미등록 번호';
  const missed = isMissedCall(call.direction, call.durationSec);

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
            isInbound ? 'bg-info-soft text-info' : 'bg-violet-soft text-violet',
            missed && 'bg-destructive-soft text-destructive',
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
                !call.contact && 'italic text-muted-foreground',
              )}
            >
              {contactName}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {call.phoneNumber ? formatPhone(call.phoneNumber) : '번호 없음'}
            </span>
            {missed && (
              <Badge
                variant="outline"
                className="border-0 bg-destructive-soft text-[10px] text-destructive"
              >
                부재중
              </Badge>
            )}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px]',
                sttStatusClass[call.sttStatus],
              )}
            >
              {sttStatusLabel[call.sttStatus]}
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
          <span>{timeAgo(call.calledAt)}</span>
        </div>
      </button>
    </li>
  );
}
