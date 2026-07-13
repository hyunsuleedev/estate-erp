import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  RotateCcw,
  Search,
} from 'lucide-react';
import type {
  CallRecordingListItem,
  SttStatus,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime, formatPhone } from '@/lib/format';
import { timeAgo } from '@/lib/time-ago';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/domain';
import {
  formatDuration,
  isMissedCall,
  sttStatusClass,
  sttStatusLabel,
} from './-call-utils';
import { CallWorkspaceDetail } from './-workspace-detail';

export const Route = createFileRoute('/_authenticated/calls/')({
  component: CallsPage,
});

const PAGE_SIZE = 20;

type RangePreset = 'today' | 'this-week' | 'this-month';

const rangeOptions: Array<{ value: RangePreset | ''; label: string }> = [
  { value: '', label: '전체' },
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
    <div className="flex h-[calc(100svh-4rem)] min-h-0 flex-col pt-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background">
        {/* 세션 배너 — 선택한 통화 요약 + 기간 통계 */}
        <div className="flex items-center gap-2.5 border-b px-5 py-2.5">
          {selected ? (
            <SelectedCallBanner call={selected} />
          ) : (
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-secondary text-secondary-foreground">
                <Phone className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[14.5px] font-bold">통화 기록</div>
                <div className="truncate text-[11.5px] text-muted-foreground">
                  통화 녹음과 STT·AI 분석 결과를 확인하고 상담으로 전환합니다.
                </div>
              </div>
            </div>
          )}
          <div className="flex-1" />
          {/* 요약 통계 — 기간 필터만 반영 (서버 집계) */}
          <div className="flex shrink-0 items-center gap-4">
            <BannerStat label="전체" value={stats?.total ?? 0} />
            <BannerStat
              label="수신"
              value={stats?.inbound ?? 0}
              valueClass="text-info"
            />
            <BannerStat
              label="발신"
              value={stats?.outbound ?? 0}
              valueClass="text-violet"
            />
            <BannerStat
              label="부재중"
              value={stats?.missed ?? 0}
              valueClass={
                stats && stats.missed > 0 ? 'text-destructive' : undefined
              }
            />
            <BannerStat
              label="STT 완료"
              value={stats?.sttCompleted ?? 0}
              valueClass="text-success"
            />
          </div>
        </div>

        {/* 3패널 — 좌: 콜 리스트 / 중앙: 상세·상담 전환 / 우: 컨텍스트 */}
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex h-full min-w-[1120px]">
            {/* 좌: 콜 리스트 */}
            <div className="flex w-[262px] shrink-0 flex-col border-r">
              <div className="px-2.5 pb-1.5 pt-2.5">
                <div className="flex h-[30px] items-center gap-1.5 rounded-lg border bg-muted px-2.5">
                  <Search className="size-3.5 shrink-0 text-muted-foreground/70" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="이름 · 번호 · 대화 내용 검색"
                    className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
                  />
                </div>
              </div>
              {/* 필터 칩 — 기간 (단일 선택) */}
              <div className="flex flex-wrap gap-1 px-2.5 pb-1.5">
                {rangeOptions.map((o) => (
                  <FilterChip
                    key={o.value || 'all'}
                    active={range === o.value}
                    onClick={() => setRange(o.value)}
                  >
                    {o.label}
                  </FilterChip>
                ))}
              </div>
              {/* 필터 칩 — 방향 · STT 상태 (토글) */}
              <div className="flex flex-wrap gap-1 px-2.5 pb-2">
                {directionOptions.map((o) => (
                  <FilterChip
                    key={o.value}
                    active={direction === o.value}
                    onClick={() =>
                      setDirection(direction === o.value ? '' : o.value)
                    }
                  >
                    {o.label}
                  </FilterChip>
                ))}
                {sttOptions.map((o) => (
                  <FilterChip
                    key={o.value}
                    active={status === o.value}
                    onClick={() => setStatus(status === o.value ? '' : o.value)}
                  >
                    {o.label}
                  </FilterChip>
                ))}
              </div>

              {/* 리스트 */}
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {listQuery.isLoading ? (
                  <div className="space-y-1.5 px-0.5 pt-1">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-[52px] w-full rounded-lg" />
                    ))}
                  </div>
                ) : listQuery.isError ? (
                  <div className="flex flex-col items-center gap-2.5 px-2 py-8 text-center">
                    <p className="text-xs text-muted-foreground">
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
                    className="py-8"
                  />
                ) : (
                  <ul>
                    {items.map((call) => (
                      <CallListItem
                        key={call.id}
                        call={call}
                        selected={selected?.id === call.id}
                        onSelect={() => setSelected(call)}
                      />
                    ))}
                  </ul>
                )}
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && pagination && (
                <div className="flex items-center justify-between border-t px-2 py-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[11px]"
                    disabled={page <= 1 || listQuery.isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="size-3.5" />
                    이전
                  </Button>
                  <span className="text-[10.5px] tabular-nums text-muted-foreground">
                    {pagination.page} / {totalPages} · 총 {pagination.total}건
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[11px]"
                    disabled={page >= totalPages || listQuery.isFetching}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    다음
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* 중앙 + 우측: 선택한 통화의 상세 워크스페이스 */}
            {selected ? (
              <CallWorkspaceDetail key={selected.id} item={selected} />
            ) : (
              <>
                <div className="flex min-w-0 flex-1 items-center justify-center border-r">
                  <EmptyState
                    icon={Phone}
                    title="통화를 선택하세요"
                    description="왼쪽 목록에서 통화를 선택하면 상세와 상담 전환 도구가 표시됩니다."
                  />
                </div>
                <div className="w-[294px] shrink-0" />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 배너 우측 요약 통계 항목 */
function BannerStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={cn('text-[13px] font-semibold tabular-nums', valueClass)}>
        {value}
      </span>
    </div>
  );
}

/** 세션 배너 — 선택한 통화 요약 */
function SelectedCallBanner({ call }: { call: CallRecordingListItem }) {
  const isInbound = call.direction === 'inbound';
  const missed = isMissedCall(call.direction, call.durationSec);
  const contactName = call.contact?.name ?? '미등록 번호';

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-[9px]',
          isInbound ? 'bg-info-soft text-info' : 'bg-violet-soft text-violet',
          missed && 'bg-destructive-soft text-destructive',
        )}
      >
        {isInbound ? (
          <PhoneIncoming className="size-4" />
        ) : (
          <PhoneOutgoing className="size-4" />
        )}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-[14.5px] font-bold">
            {call.phoneNumber ? formatPhone(call.phoneNumber) : '번호 없음'}
          </span>
          <span
            className={cn(
              'inline-flex h-[19px] shrink-0 items-center rounded-md px-2 text-[10.5px] font-bold',
              sttStatusClass[call.sttStatus],
            )}
          >
            {sttStatusLabel[call.sttStatus]}
          </span>
          {missed && (
            <span className="inline-flex h-[19px] shrink-0 items-center rounded-md bg-destructive-soft px-2 text-[10.5px] font-bold text-destructive">
              부재중
            </span>
          )}
        </div>
        <div className="mt-px truncate text-[11.5px] text-muted-foreground">
          {contactName} · {formatDateTime(call.calledAt)} ·{' '}
          {formatDuration(call.durationSec)} · {call.user.name}
        </div>
      </div>
    </div>
  );
}

/** 좌측 리스트 필터 칩 */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-6 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
        active
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

/** 좌측 콜 리스트 아이템 */
function CallListItem({
  call,
  selected,
  onSelect,
}: {
  call: CallRecordingListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const isInbound = call.direction === 'inbound';
  const missed = isMissedCall(call.direction, call.durationSec);
  const contactName = call.contact?.name ?? '미등록 번호';

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'mb-px flex w-full flex-col gap-[3px] rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted',
          selected && 'bg-muted',
        )}
      >
        <span className="flex w-full items-center gap-1.5">
          <span
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-md',
              isInbound
                ? 'bg-info-soft text-info'
                : 'bg-violet-soft text-violet',
              missed && 'bg-destructive-soft text-destructive',
            )}
          >
            {isInbound ? (
              <PhoneIncoming className="size-3" />
            ) : (
              <PhoneOutgoing className="size-3" />
            )}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[12.5px] font-semibold',
              !call.contact && 'font-normal italic text-muted-foreground',
            )}
          >
            {contactName}
          </span>
          <span className="shrink-0 text-[10.5px] text-muted-foreground">
            {timeAgo(call.calledAt)}
          </span>
        </span>
        <span className="flex w-full items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] tabular-nums text-muted-foreground">
            {call.phoneNumber ? formatPhone(call.phoneNumber) : '번호 없음'} ·{' '}
            {formatDuration(call.durationSec)}
          </span>
          <span
            className={cn(
              'inline-flex h-4 shrink-0 items-center rounded-full px-1.5 text-[9px] font-bold',
              sttStatusClass[call.sttStatus],
            )}
          >
            {sttStatusLabel[call.sttStatus]}
          </span>
        </span>
      </button>
    </li>
  );
}
