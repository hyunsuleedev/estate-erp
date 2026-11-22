import { createFileRoute, Link, type LinkProps } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Handshake,
  ListTodo,
  Megaphone,
  MessageSquareText,
  Monitor,
  Moon,
  Newspaper,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Plus,
  Sparkles as SparklesIcon,
  Sun,
  Tag,
  Type,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatFloorRange } from '@estate-erp/shared';
import type { CalendarEvent, Consultation, Deal, Notice, Task } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  NOTICES_QUERY_KEY,
  NOTICES_STALE_MS,
  announceNotice,
  applyNoticeRead,
  useKnownNoticeReads,
  withKnownReads,
} from '@/lib/notices';
import { StatusBadge } from '@/components/domain';
import { QuickCreate } from '@/components/layout/quick-create';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { formatDate, formatMoney, formatPhone } from '@/lib/format';
import { collectPercent } from './cashflow/-cashflow-utils';
import {
  formatConsultationWhen,
  getConsultationChannel,
  getConsultationRowStatus,
  getConsultationSummaryLine,
  type ConsultationChannelKind,
  type ConsultationRowStatus,
} from './consultations/-consultation-list-model';
import {
  formatDealAmount,
  formatNextPaymentName,
  formatDaysLabel,
  getDealDisplayGroupKey,
  getDealPipelineHealth,
  getDealTitle,
  getNextDealPaymentSummary,
  sortDealsForDisplay,
  type DealPipelineHealthState,
} from './deals/-deal-view-utils';
import { getPropertyLabel } from './tasks/-task-property-label';
import {
  OfflineState,
  QueryErrorState,
  WidgetSkeleton,
  daysUntil,
  isQueryPaused,
  localDateKey,
} from './-dashboard-widgets';
import { DashboardScene, type SceneFlag } from './-dashboard-scene';
import { PRECIP, WEATHER_LABEL, clock, sceneState, type SceneWeather, type WeatherKind } from './-dashboard-sky';
import './-dashboard.css';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

/*
 * 디자인 메모 — 오늘의 보드와 3단 풀화면 카드 워크벤치
 * 맨 위는 인사 영역이다. 판 전체가 하늘이고 오른쪽에 색이 있는 작은 동네가 있다(-dashboard-scene.tsx).
 * 땅이 오늘의 시간 축이라 해가 지금 시각 위에 뜨고 오늘 일정이 깃발로 꽂힌다. 하늘은 시각과 사무소 위치의 날씨를 따른다.
 * 아래는 순백(#ffffff) 바탕 위에 둥근 흰 카드(14px) 3단으로 나눈다:
 *   왼쪽 단(308px, sticky): 월간 달력 · 선택한 날의 타임라인 + 다가오는 일정
 *   가운데 단(유동): 내 할 일(지남/오늘/다가옴 접는 묶음) · 진행 중인 거래 표 · 최근 상담 내역
 *   오른쪽 단(276px, sticky, 1260px 미만에서 자동 숨김): 이달 수금(대표·실장) · 공지사항 · 앱 사용법 가이드 · 부동산 뉴스(준비 중)
 */

/* --------------------------------- 공통 --------------------------------- */

type Scope = 'mine' | 'all';

function byDateAsc(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function isOpenTask(task: Task): boolean {
  return task.status !== 'completed' && task.status !== 'cancelled';
}

function isActiveDeal(deal: Deal): boolean {
  return !deal.isCancelled && getDealDisplayGroupKey(deal.stage) !== 'closed';
}

function greetingByHour(hour: number): string {
  if (hour < 5) return '늦은 시간까지 수고 많으세요';
  if (hour < 12) return '좋은 아침이에요';
  if (hour < 18) return '좋은 오후예요';
  return '오늘도 수고 많으셨어요';
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAYS_MON = ['월', '화', '수', '목', '금', '토', '일'];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** 이번 주 월요일 0시 */
function startOfWeek(date: Date): Date {
  return addDays(startOfDay(date), -((date.getDay() + 6) % 7));
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function shortDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${formatDate(date).slice(5)} (${WEEKDAYS[date.getDay()]})`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '요청을 처리하지 못했습니다';
}

/** 등장 순서. 처음 한 번(.dash-play가 붙어 있는 동안)만 -dashboard.css가 이 값만큼 늦춰 올린다. */
function stagger(order: number): CSSProperties {
  return { '--d': order } as CSSProperties;
}

/** 1분마다 다시 그리게 하는 시계. 해와 '지금' 선이 실제 시각을 따라간다. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 반짝이. key를 바꿔 다시 그리면 다시 튄다. */
function Sparkles({ count = 7 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <i
          key={index}
          aria-hidden="true"
          className="dash-spark"
          style={{ '--a': `${(360 / count) * index}deg` } as CSSProperties}
        />
      ))}
    </>
  );
}

/** 처음 나타날 때 0에서 세어 올라가는 숫자. 그 뒤로 값이 바뀌면 한 번 통 튄다. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const settled = useRef(prefersReducedMotion());
  const shownRef = useRef(shown);
  useEffect(() => {
    if (settled.current) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    // 세는 도중에 값이 바뀌면(다시 불러오기) 0으로 돌아가지 않고 지금 보이는 수에서 이어 간다.
    const from = shownRef.current;
    const startAt = performance.now() + (from === 0 ? 500 : 0);
    let frame = 0;
    const step = (time: number) => {
      const progress = Math.min(Math.max((time - startAt) / 700, 0), 1);
      const next = Math.round(from + (value - from) * (1 - Math.pow(1 - progress, 3)));
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
      else settled.current = true;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <b key={settled.current ? value : 'counting'} className={cn('font-semibold tabular-nums', settled.current && 'dash-numpop')}>
      {shown}
    </b>
  );
}

type QueryView = 'offline' | 'pending' | 'error' | 'ready';

function queryView(query: { isPending: boolean; isError: boolean; fetchStatus: string }): QueryView {
  if (isQueryPaused(query)) return 'offline';
  if (query.isPending) return 'pending';
  if (query.isError) return 'error';
  return 'ready';
}

/** 불러오는 중·오프라인·오류일 때 목록 자리에 그릴 것. 준비됐으면 null. */
function statusBody(view: QueryView, onRetry: () => void, rows = 4): ReactNode {
  if (view === 'offline') return <OfflineState />;
  if (view === 'pending') return <WidgetSkeleton rows={rows} />;
  if (view === 'error') return <QueryErrorState onRetry={onRetry} className="py-6" />;
  return null;
}

/* --------------------------------- 카드 머리 --------------------------------- */

function SectionHead({
  icon: Icon,
  title,
  count,
  meta,
  action,
  divided = false,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  meta?: ReactNode;
  action?: ReactNode;
  divided?: boolean;
}) {
  return (
    <header className={cn('flex min-h-8 items-center gap-2', divided && 'mb-2 border-b border-border pb-2')}>
      <Icon className="size-4 shrink-0 text-sidebar-icon" strokeWidth={1.6} aria-hidden="true" />
      <h2 className="min-w-0 truncate text-[15.5px] leading-6 font-bold tracking-[-0.02em] text-foreground">{title}</h2>
      {count != null && <span className="shrink-0 text-[13px] text-muted-foreground/75 tabular-nums">{count}</span>}
      {meta != null && (
        <span className="min-w-0 truncate text-xs text-muted-foreground/80 tabular-nums">{meta}</span>
      )}
      {action && <div className="ml-auto flex shrink-0 items-center gap-1.5">{action}</div>}
    </header>
  );
}

function MoreLink({ to, children }: { to: LinkProps['to']; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex h-[26px] items-center gap-[3px] rounded-md px-[7px] text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.045] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {children}
      <ArrowRight
        className="size-3 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="px-1.5 py-2 text-[13px] text-muted-foreground/80">{children}</p>;
}

/* -------------------------------- 인사 헤더 -------------------------------- */

function ScopeToggle({ value, onChange }: { value: Scope; onChange: (next: Scope) => void }) {
  const options: Array<{ value: Scope; label: string }> = [
    { value: 'mine', label: '내 담당' },
    { value: 'all', label: '사무소 전체' },
  ];
  return (
    <div
      role="group"
      aria-label="표시 범위"
      // 인사 영역의 바탕(하늘)에 묻히지 않게 옅은 먹색을 깐다. 밤의 색은 -dashboard.css(.dash-scope)가 바꾼다.
      className="dash-scope inline-flex h-8 items-center rounded-lg bg-foreground/[0.06] p-[3px]"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-full rounded-md px-2.5 text-sm font-medium transition-[color,background-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-foreground/60 hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type PinTarget = 'schedule' | 'today' | 'overdue';

const WEATHER_ICON: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  thunder: CloudLightning,
  fog: CloudFog,
};

const PREVIEW_KEY = 'dashboard-weather-preview';
const PREVIEW_TEMP: Record<WeatherKind, number> = { clear: 14, partly: 13, cloudy: 11, rain: 9, snow: -2, thunder: 10, fog: 7 };

interface WeatherPreview {
  weather: SceneWeather;
  hour?: number;
}

function readWeatherPreview(realHour: number): WeatherPreview | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PREVIEW_KEY) ?? 'null') as { kind?: string; hour?: number } | null;
    if (!saved?.kind) return null;
    const hour = typeof saved.hour === 'number' ? saved.hour : undefined;
    if (saved.kind === 'mixed') {
      const hourly = Array.from({ length: 24 }, (_, h): WeatherKind => (h < 11 ? 'clear' : h < 13 ? 'partly' : h < 15 ? 'cloudy' : 'rain'));
      return { weather: { now: hourly[Math.floor(hour ?? realHour) % 24], hourly, temp: 13 }, hour };
    }
    if (!(saved.kind in PREVIEW_TEMP)) return null;
    const kind = saved.kind as WeatherKind;
    return { weather: { now: kind, temp: PREVIEW_TEMP[kind] }, hour };
  } catch {
    return null;
  }
}

function useWeatherPreview(realHour: number): WeatherPreview | null {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const target = window as unknown as { dashWeather?: (kind: string | null, hour?: number) => void };
    target.dashWeather = (kind, hour) => {
      if (kind) window.localStorage.setItem(PREVIEW_KEY, JSON.stringify({ kind, hour }));
      else window.localStorage.removeItem(PREVIEW_KEY);
      setVersion((count) => count + 1);
    };
    return () => {
      delete target.dashWeather;
    };
  }, []);
  void version;
  return import.meta.env.DEV ? readWeatherPreview(realHour) : null;
}

/** 날짜 줄 끝의 날씨: 지금 날씨와 기온, 그리고 오늘 남은 일정 가운데 비·눈 예보에 걸리는 첫 일정 */
function WeatherNote({ weather, hour, date, flags }: { weather: SceneWeather; hour: number; date: Date; flags: SceneFlag[] }) {
  const sky = sceneState(hour, date, weather);
  const Icon = sky.wx === 'clear' && !sky.lum.sunUp ? Moon : sky.wx === 'partly' && !sky.lum.sunUp ? CloudMoon : WEATHER_ICON[sky.wx];
  const wet = sky.lum.offAxis
    ? undefined
    : flags
        .filter((flag) => flag.hour > hour && PRECIP[sky.wxAtHour(flag.hour)])
        .sort((a, b) => a.hour - b.hour)[0];
  return (
    <>
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      <span className="dash-weather inline-flex items-center gap-1">
        <Icon className="size-3.5" strokeWidth={1.7} aria-hidden="true" />
        {WEATHER_LABEL[sky.wx]}
        {typeof weather.temp === 'number' ? ` ${Math.round(weather.temp)}°` : ''}
      </span>
      {wet && (
        <>
          <span aria-hidden="true" className="opacity-50">
            ·
          </span>
          <span className="dash-weather-tip">
            {clock(wet.hour)} 일정 때 {PRECIP[sky.wxAtHour(wet.hour)] === 'snow' ? '눈' : '비'} 예보
          </span>
        </>
      )}
    </>
  );
}

/** 인사 영역 — 오늘의 보드. 왼쪽에 인사와 숫자 알약 셋, 오른쪽에 오늘의 그림. 판 전체가 하늘이다. */
function Briefing({
  now,
  officeName,
  userName,
  events,
  openTasks,
  overdueCount,
  status,
  flags,
  cheer,
  weather,
  hour,
  onPin,
  tools,
}: {
  now: Date;
  officeName?: string;
  userName?: string;
  events: number;
  openTasks: number;
  overdueCount: number;
  status: 'pending' | 'ready' | 'unavailable';
  flags: SceneFlag[];
  cheer: number;
  weather?: SceneWeather;
  hour: number;
  onPin: (target: PinTarget) => void;
  tools: ReactNode;
}) {
  const greeting = `${greetingByHour(Math.floor(hour))}${userName ? `, ${userName}님` : ''}`;
  const tone = sceneState(hour, now, weather).amb.tone;
  const pins: Array<{ key: PinTarget; icon: LucideIcon; label: string; value: number; bad?: boolean }> = [
    { key: 'schedule', icon: CalendarDays, label: '오늘 일정', value: events },
    { key: 'today', icon: ListTodo, label: '남은 업무', value: openTasks },
    { key: 'overdue', icon: AlarmClock, label: '기한 지남', value: overdueCount, bad: overdueCount > 0 },
  ];
  return (
    <header
      data-tone={tone}
      className="dash-hero relative flex min-h-44 shrink-0 items-end overflow-hidden rounded-[14px] pt-[18px] pr-5 pb-4 pl-[22px]"
    >
      <DashboardScene hour={hour} date={now} flags={flags} cheer={cheer} weather={weather} />
      <div className="dash-copy relative min-w-0">
        <p className="dash-up dash-date flex flex-wrap items-center gap-x-1.5 text-xs leading-[18px] font-medium" style={stagger(0)}>
          <span>
            {now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
            {officeName ? ` · ${officeName}` : ''}
          </span>
          {weather && <WeatherNote weather={weather} hour={hour} date={now} flags={flags} />}
        </p>
        <h1 className="dash-title mt-0.5 mb-3 text-[26px] leading-[34px] font-semibold tracking-[-0.02em]">
          {greeting.split(' ').map((word, index) => (
            <Fragment key={index}>
              <span className="dash-up inline-block" style={stagger(1 + index)}>
                {word}
              </span>{' '}
            </Fragment>
          ))}
        </h1>
        <div className="flex min-h-[30px] flex-wrap gap-1.5">
          {status === 'unavailable' ? null : status === 'pending' ? (
            <Skeleton className="h-[30px] w-72 rounded-full" />
          ) : (
            pins.map((pin, index) => (
              <button
                key={pin.key}
                type="button"
                onClick={() => onPin(pin.key)}
                className="dash-pin dash-up inline-flex h-[30px] items-center gap-[7px] rounded-full bg-background pr-[11px] pl-[9px] text-[13px] whitespace-nowrap text-muted-foreground-strong focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                style={stagger(5 + index)}
              >
                <pin.icon className="size-[15px] text-sidebar-icon" strokeWidth={1.6} aria-hidden="true" />
                {pin.label}
                <span className={pin.bad ? 'text-destructive-strong' : 'text-foreground'}>
                  <CountUp value={pin.value} />
                </span>
                {pin.key === 'today' && cheer > 0 && <Sparkles key={cheer} />}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="dash-tools dash-up absolute top-3.5 right-4 z-10 flex items-center gap-2" style={stagger(3)}>
        {tools}
      </div>
    </header>
  );
}

/* --------------------------------- 일정 --------------------------------- */

function clockLabel(date: Date): string {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * 일정이 그 날에 걸쳐 있는지. 여러 날짜리 일정은 걸친 날마다 나온다.
 * 끝 시각은 서버·캘린더와 같이 '그 시각 직전까지'로 본다(종일 일정의 끝은 다음 날 0시).
 */
function eventCoversDay(event: CalendarEvent, day: Date): boolean {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(day, 1).getTime();
  const start = new Date(event.start).getTime();
  if (start >= dayEnd) return false;
  if (start >= dayStart) return true;
  return event.end != null && new Date(event.end).getTime() > dayStart;
}

/** 그 날보다 먼저 시작해 이어지는 일정인지 */
function startedBefore(event: CalendarEvent, day: Date): boolean {
  return new Date(event.start).getTime() < startOfDay(day).getTime();
}

/**
 * 고른 날에서 본 시각 표시. 전날부터 이어지는 일정은 그 날 안에 끝나면 끝나는 시각(~15:00),
 * 그 날을 끝까지 덮으면 '종일'이다. 다음 날 0시에 끝나는 것도 그 날을 다 덮은 것이라 '~00:00'이 아니라 '종일'이다.
 */
function eventTimeLabel(event: CalendarEvent, day: Date): string {
  if (event.allDay) return '종일';
  if (!startedBefore(event, day)) return clockLabel(new Date(event.start));
  const end = event.end ? new Date(event.end) : null;
  return end && end.getTime() < addDays(day, 1).getTime() ? `~${clockLabel(end)}` : '종일';
}

function eventDotTone(type: string | null | undefined): 'contract' | 'meeting' | 'default' {
  const normalized = (type ?? '').toLowerCase();
  if (normalized.includes('contract') || normalized.includes('closing') || normalized.includes('payment')) {
    return 'contract';
  }
  if (normalized.includes('meeting') || normalized.includes('visit') || normalized.includes('consult')) {
    return 'meeting';
  }
  return 'default';
}

function upcomingDayLabel(startIso: string, now: Date): string {
  const start = new Date(startIso);
  const diffDays = Math.round((startOfDay(start).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (diffDays === 1) return '내일';
  return `${start.getMonth() + 1}.${start.getDate()} (${WEEKDAYS[start.getDay()]})`;
}

function MiniCalendarCard({
  viewMonth,
  calendarDays,
  monthEvents,
  selectedKey,
  todayKey,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  onGoToday,
  focusDay,
}: {
  viewMonth: { year: number; month: number };
  calendarDays: Date[];
  monthEvents: CalendarEvent[];
  selectedKey: string;
  todayKey: string;
  onSelectDay: (day: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoToday: () => void;
  focusDay: number;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusDay > 0) selectedRef.current?.focus();
  }, [focusDay]);

  const countByDay = new Map<string, number>();
  for (const day of calendarDays) {
    countByDay.set(localDateKey(day), monthEvents.filter((event) => eventCoversDay(event, day)).length);
  }

  return (
    <section className="dash-sec dash-bento-card dash-cal-card min-w-0" style={stagger(0)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-[13.5px] font-bold tracking-[-0.015em] text-foreground tabular-nums">
          {viewMonth.year}년 {viewMonth.month + 1}월
        </h2>
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            className="dash-cal-btn focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={onPrevMonth}
            aria-label="이전 달"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="dash-cal-btn focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={onGoToday}
          >
            오늘
          </button>
          <button
            type="button"
            className="dash-cal-btn focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={onNextMonth}
            aria-label="다음 달"
          >
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="dash-cal-weekdays" aria-hidden="true">
        {WEEKDAYS_MON.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="dash-cal-grid" role="group" aria-label="월간 달력">
        {calendarDays.map((day) => {
          const key = localDateKey(day);
          const count = countByDay.get(key) ?? 0;
          const isOut = day.getMonth() !== viewMonth.month;
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              ref={isSelected ? selectedRef : undefined}
              aria-pressed={isSelected}
              aria-label={`${shortDate(day)} 일정 ${count}건`}
              onClick={() => onSelectDay(day)}
              className={cn(
                'dash-cal-day focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                isOut && 'is-out',
                isToday && 'is-today',
                isSelected && 'is-selected',
              )}
            >
              <span className="dash-cal-num">{day.getDate()}</span>
              <span className={cn('dash-cal-dot', count > 0 && 'has')} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ScheduleCard({
  scope,
  userId,
  eventsQuery,
  monthEvents,
  selectedDate,
  selectedKey,
  todayKey,
  now,
}: {
  scope: Scope;
  userId: string | undefined;
  eventsQuery: ReturnType<typeof useMonthEventsQuery>;
  monthEvents: CalendarEvent[];
  selectedDate: Date;
  selectedKey: string;
  todayKey: string;
  now: Date;
}) {
  const view = queryView(eventsQuery);
  const spansDay = (event: CalendarEvent) => event.allDay || startedBefore(event, selectedDate);
  const dayEvents = monthEvents
    .filter((event) => eventCoversDay(event, selectedDate))
    .sort((a, b) => Number(spansDay(b)) - Number(spansDay(a)) || byDateAsc(a.start, b.start));

  const afterSelectedMs = addDays(selectedDate, 1).getTime();
  const upcomingEvents = monthEvents
    .filter((event) => new Date(event.start).getTime() >= afterSelectedMs)
    .sort((a, b) => byDateAsc(a.start, b.start))
    .slice(0, 4);

  const isToday = selectedKey === todayKey;
  const nowIndex = isToday
    ? dayEvents.findIndex((event) => !spansDay(event) && new Date(event.start).getTime() > now.getTime())
    : -2;

  const nowLine = (
    <li className="flex h-4 items-center gap-2 py-0.5 pl-1" aria-hidden="true">
      <span className="text-[11px] leading-4 font-semibold text-destructive tabular-nums">
        {clockLabel(now)}
      </span>
      <span className="flex-1 border-t border-destructive/55" />
    </li>
  );

  const personLabel = (id: string | null, name: string | null | undefined) =>
    id && id === userId ? '나' : (name ?? '미배정');

  const status = statusBody(view, () => void eventsQuery.refetch(), 3);

  return (
    <section className="dash-sec dash-bento-card dash-sched-card min-w-0" style={stagger(1)}>
      <div>
        <SectionHead
          icon={CalendarDays}
          title={`${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 (${WEEKDAYS[selectedDate.getDay()]})${isToday ? ' · 오늘' : ''}`}
          count={view === 'ready' ? dayEvents.length : undefined}
          action={<MoreLink to="/calendar">캘린더</MoreLink>}
          divided
        />
        {status ??
          (dayEvents.length === 0 ? (
            <EmptyNote>
              {isToday ? '오늘 잡힌 일정이 없습니다.' : '이 날 잡힌 일정이 없습니다.'}
            </EmptyNote>
          ) : (
            <ol className="dash-timeline">
              {dayEvents.map((event, index) => {
                const meta = [
                  event.property?.site?.name,
                  event.contact?.name,
                  scope === 'all' && event.user?.name
                    ? personLabel(event.userId, event.user.name)
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                const dotTone = eventDotTone(event.type);
                return (
                  <Fragment key={event.id}>
                    {index === nowIndex && nowLine}
                    <li className="relative">
                      <span
                        className={cn(
                          'dash-tl-dot',
                          dotTone === 'contract' && 'is-contract',
                          dotTone === 'meeting' && 'is-meeting',
                        )}
                        aria-hidden="true"
                      />
                      <Link
                        to="/calendar"
                        className="dash-tl-item focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span className="w-[46px] shrink-0 pt-px text-xs leading-5 font-semibold text-foreground tabular-nums">
                          {eventTimeLabel(event, selectedDate)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] leading-5 font-medium text-foreground">
                            {event.title}
                          </span>
                          {meta && (
                            <span className="block truncate text-[11.5px] leading-4 text-muted-foreground">
                              {meta}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  </Fragment>
                );
              })}
              {isToday && nowIndex === -1 && nowLine}
            </ol>
          ))}
      </div>

      <div className="border-t border-border pt-3.5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">다가오는 일정</h3>
          {view === 'ready' && upcomingEvents.length > 0 && (
            <span className="text-[11.5px] text-muted-foreground/80 tabular-nums">{upcomingEvents.length}건</span>
          )}
        </div>
        {view !== 'ready' ? (
          <p className="px-1 py-1 text-xs text-muted-foreground/75">
            {view === 'pending' ? '불러오는 중입니다.' : '일정을 불러오면 여기에 표시됩니다.'}
          </p>
        ) : upcomingEvents.length === 0 ? (
          <EmptyNote>예정된 다가오는 일정이 없습니다.</EmptyNote>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {upcomingEvents.map((event) => {
              const dotTone = eventDotTone(event.type);
              const meta = [
                event.allDay ? '종일' : clockLabel(new Date(event.start)),
                event.property?.site?.name ?? event.contact?.name,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={event.id}>
                  <Link
                    to="/calendar"
                    className="flex items-start gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-foreground/[0.045] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="w-[52px] shrink-0 pt-0.5 text-[11.5px] font-semibold text-muted-foreground tabular-nums">
                      {upcomingDayLabel(event.start, now)}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-[6px] size-1.5 shrink-0 rounded-full bg-orange',
                        dotTone === 'contract' && 'bg-violet',
                        dotTone === 'meeting' && 'bg-info',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] leading-[1.35] font-medium text-foreground">
                        {event.title}
                      </span>
                      {meta && (
                        <span className="block truncate text-[11px] leading-4 text-muted-foreground tabular-nums">
                          {meta}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/* --------------------------------- 할 일 --------------------------------- */

type TaskBucket = 'overdue' | 'today' | 'upcoming';

/** 기한이 없는 업무는 '다가옴'의 끝에 둔다. */
function taskBucket(task: Task): TaskBucket {
  const days = daysUntil(task.dueDate);
  if (days == null) return 'upcoming';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return 'upcoming';
}

const TASK_TABS: Array<{ key: TaskBucket; label: string }> = [
  { key: 'overdue', label: '기한 지남' },
  { key: 'today', label: '오늘' },
  { key: 'upcoming', label: '다가오는 할 일' },
];

/** 미룰 날짜 후보. 지금 기한(없으면 오늘)보다 뒤인 날만 남긴다. */
function snoozeOptions(task: Task, now: Date): Array<{ label: string; date: Date }> {
  const today = startOfDay(now);
  const monday = startOfWeek(now);
  const candidates = [
    { label: '내일', date: addDays(today, 1) },
    { label: '이번 주 금요일', date: addDays(monday, 4) },
    { label: '다음 주 월요일', date: addDays(monday, 7) },
  ];
  const current = task.dueDate ? startOfDay(new Date(task.dueDate)).getTime() : today.getTime();
  const floor = Math.max(current, today.getTime());
  return candidates.filter((option) => option.date.getTime() > floor);
}

/** 날짜만 바꾸고 시각은 원래 기한의 것을 지킨다. */
function moveDueDate(task: Task, date: Date): string {
  const next = new Date(date);
  if (task.dueDate) {
    const original = new Date(task.dueDate);
    next.setHours(original.getHours(), original.getMinutes(), 0, 0);
  }
  return next.toISOString();
}

function TaskSection({
  scope,
  userId,
  tasks,
  openTasks,
  now,
  reveal,
  onCheer,
  canViewCashflow,
  ledgerPercentLabel,
  unreadNotices,
  onOpenDigest,
  digestTriggerRef,
}: {
  scope: Scope;
  userId: string | undefined;
  tasks: ReturnType<typeof useTasksQuery>;
  openTasks: Task[];
  now: Date;
  /** 바뀔 때마다 그 묶음을 펴고 묶음 머리로 포커스를 옮긴다 (인사 영역의 알약) */
  reveal: { bucket: TaskBucket; n: number } | null;
  /** 완료가 저장됐을 때 불린다 (해가 뛰고 반짝이가 튄다) */
  onCheer: () => void;
  canViewCashflow: boolean;
  ledgerPercentLabel: string;
  unreadNotices: number;
  onOpenDigest: () => void;
  digestTriggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const queryClient = useQueryClient();
  // 방금 완료를 누른 줄. 체크 상자에서 반짝이가 한 번 튄다.
  const [burst, setBurst] = useState<{ id: string; n: number } | null>(null);
  // 펴 둔 묶음. 처음에는 지남과 오늘.
  const [opened, setOpened] = useState<Record<TaskBucket, boolean>>({ overdue: true, today: true, upcoming: false });
  const [draft, setDraft] = useState('');
  const headRefs = useRef<Partial<Record<TaskBucket, HTMLButtonElement | null>>>({});
  useEffect(() => {
    if (!reveal) return;
    setOpened((prev) => ({ ...prev, [reveal.bucket]: true }));
    const head = headRefs.current[reveal.bucket];
    head?.focus();
    head?.scrollIntoView({ block: 'nearest' });
  }, [reveal]);
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  // 되돌리기는 바꾸기 전의 값으로 다시 저장한다.
  const restore = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { status?: string; dueDate?: string | null } }) =>
      api.tasks.update(id, patch),
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: invalidate,
  });
  const complete = useMutation({
    mutationFn: (task: Task) => api.tasks.update(task.id, { status: 'completed' }),
    onSuccess: (_result, task) => {
      // 축하는 서버가 완료를 받아들인 뒤에 한다. 실패했는데 해가 뛰고 숫자가 그대로면 거짓말이 된다.
      onCheer();
      toast.success('업무를 완료했습니다', {
        description: task.title,
        action: {
          label: '되돌리기',
          onClick: () => restore.mutate({ id: task.id, patch: { status: task.status } }),
        },
      });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: invalidate,
  });
  const snooze = useMutation({
    mutationFn: ({ task, date }: { task: Task; date: Date; label: string }) =>
      api.tasks.update(task.id, { dueDate: moveDueDate(task, date) }),
    onSuccess: (_result, { task, label }) =>
      toast.success(`${label}로 미뤘습니다`, {
        description: task.title,
        action: {
          label: '되돌리기',
          onClick: () => restore.mutate({ id: task.id, patch: { dueDate: task.dueDate } }),
        },
      }),
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: invalidate,
  });
  // 오늘 묶음 끝에서 바로 적어 넣는다. 기한은 오늘, 담당은 나.
  const create = useMutation({
    mutationFn: (title: string) => {
      const due = startOfDay(new Date());
      due.setHours(9);
      return api.tasks.create({ title, dueDate: due.toISOString(), assignedToId: userId });
    },
    onSuccess: (_result, title) => {
      // 저장되는 사이에 다음 것을 적기 시작했으면 그 글은 지우지 않는다.
      setDraft((current) => (current.trim() === title ? '' : current));
      toast.success('오늘 할 일에 추가했습니다', { description: title });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: invalidate,
  });

  const view = queryView(tasks);
  const mine = scope === 'mine' && Boolean(userId);
  const groups: Record<TaskBucket, Task[]> = { overdue: [], today: [], upcoming: [] };
  for (const task of openTasks) groups[taskBucket(task)].push(task);
  const visibleGroups = TASK_TABS.filter((item) => groups[item.key].length > 0 || reveal?.bucket === item.key);
  const emptyText: Record<TaskBucket, string> = {
    overdue: '기한이 지난 업무가 없습니다.',
    today: mine ? '오늘 안에 할 내 업무가 없습니다.' : '오늘 안에 할 업무가 없습니다.',
    upcoming: '다가오는 업무가 없습니다.',
  };
  const personLabel = (id: string | null, name: string | null | undefined) =>
    id && id === userId ? '나' : (name ?? '미배정');
  const status = statusBody(view, () => void tasks.refetch());

  const row = (task: Task) => {
    const completing = complete.isPending && complete.variables?.id === task.id;
    const busy = completing || (snooze.isPending && snooze.variables?.task.id === task.id);
    const bucket = taskBucket(task);
    const days = daysUntil(task.dueDate);
    const options = snoozeOptions(task, now);
    const meta = [
      task.property ? getPropertyLabel(task) : null,
      task.contact?.name,
      scope === 'all' ? personLabel(task.assignedToId, task.assignedTo?.name) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const dueLabel = !task.dueDate
      ? '기한 없음'
      : bucket === 'overdue' && days != null
        ? `${Math.abs(days)}일 지남`
        : days === 0
          ? '오늘'
          : days === 1
            ? '내일'
            : shortDate(task.dueDate);
    return (
      <li
        key={task.id}
        className={cn('group/task dash-todo', busy && 'opacity-45')}
      >
        {/* Notion의 네모 체크 상자. 누르면 파랗게 차며 체크가 그려진다. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={completing}
          aria-label={`${task.title} 완료 처리`}
          disabled={busy}
          onClick={() => {
            setBurst((prev) => ({ id: task.id, n: (prev?.n ?? 0) + 1 }));
            complete.mutate(task);
          }}
          className="dash-chk focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path pathLength={1} d="M2.5 6.4l2.4 2.4 4.6-5.3" />
          </svg>
          {burst?.id === task.id && <Sparkles key={burst.n} count={6} />}
        </button>
        <div className="min-w-0 flex-1">
          <Link to="/tasks" className="block truncate text-[13.5px] leading-[1.4] text-foreground hover:underline">
            {task.title}
          </Link>
          {meta && (
            <div className="truncate text-[11.5px] leading-[1.4] text-muted-foreground">
              {meta}
            </div>
          )}
        </div>
        {options.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={busy}
                aria-label={`${task.title} 미루기`}
                // 안 보일 때도 Tab으로 닿는다. 닿으면 드러난다.
                className="dash-todo-act opacity-0 group-hover/task:opacity-100 group-focus-within/task:opacity-100 data-[state=open]:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                미루기
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {options.map((option) => (
                <DropdownMenuItem
                  key={option.label}
                  onClick={() => snooze.mutate({ task, date: option.date, label: option.label })}
                >
                  {option.label}
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {shortDate(option.date)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <span
          title={task.dueDate ? formatDate(task.dueDate) : undefined}
          className={cn(
            'shrink-0 text-xs leading-5 whitespace-nowrap tabular-nums',
            bucket === 'overdue' ? 'font-medium text-destructive-strong' : 'text-muted-foreground',
          )}
        >
          {dueLabel}
        </span>
      </li>
    );
  };

  return (
    <section className="dash-sec dash-bento-card dash-center-card min-w-0" style={stagger(1)}>
      <header className="mb-2 flex min-h-8 items-center justify-between gap-2.5 border-b border-border pb-2">
        <span className="flex min-w-0 items-baseline gap-2">
          <ListTodo className="size-4 shrink-0 translate-y-[2px] text-sidebar-icon" strokeWidth={1.6} aria-hidden="true" />
          <h2 className="truncate text-[16px] leading-6 font-bold tracking-[-0.02em] text-foreground">
            내 할 일
          </h2>
          {view === 'ready' && (
            <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
              남은 업무 {openTasks.length}건
            </span>
          )}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="dash-scope-caption">{mine ? '내 담당 기준' : '사무소 전체 기준'}</span>
          <div className="dash-compact-actions">
            {canViewCashflow && (
              <Link
                to="/cashflow"
                className="dash-compact-pill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                이달 수금
                <b className="font-semibold text-foreground tabular-nums">{ledgerPercentLabel}</b>
              </Link>
            )}
            <button
              ref={digestTriggerRef}
              type="button"
              onClick={onOpenDigest}
              className="dash-compact-pill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              공지
              {unreadNotices > 0 && (
                <b className="font-semibold text-info tabular-nums">{unreadNotices}</b>
              )}
              {' · 가이드'}
            </button>
          </div>
          <MoreLink to="/tasks">업무</MoreLink>
        </div>
      </header>
      {status ?? (
        <>
          {visibleGroups.length === 0 ? (
            <EmptyNote>{mine ? '남은 내 할 일이 없습니다.' : '남은 할 일이 없습니다.'}</EmptyNote>
          ) : (
            visibleGroups.map((item) => {
              const list = groups[item.key];
              const isOpen = opened[item.key];
              return (
                <div key={item.key}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    ref={(element) => {
                      headRefs.current[item.key] = element;
                    }}
                    onClick={() => setOpened((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                    className="dash-group-btn focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <ChevronRight
                      className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-90')}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    <span className={cn(item.key === 'overdue' && list.length > 0 && 'text-destructive-strong')}>
                      {item.label}
                    </span>
                    <span className="font-normal text-muted-foreground tabular-nums">
                      {list.length}
                    </span>
                  </button>
                  {isOpen &&
                    (list.length > 0 ? (
                      <ul className="mb-1 flex flex-col gap-0.5">{list.map(row)}</ul>
                    ) : (
                      <EmptyNote>{emptyText[item.key]}</EmptyNote>
                    ))}
                </div>
              );
            })
          )}
          <form
            className="dash-todo-add"
            onSubmit={(event) => {
              event.preventDefault();
              const title = draft.trim();
              if (title && !create.isPending) create.mutate(title);
            }}
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="새 할 일 추가 후 Enter..."
              aria-label="오늘 할 일 추가"
              autoComplete="off"
              className="h-6 min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground/75"
            />
          </form>
        </>
      )}
    </section>
  );
}

/* -------------------------------- 진행 거래 -------------------------------- */

const HEALTH_TEXT: Record<Exclude<DealPipelineHealthState, 'healthy'>, string> = {
  overdue: 'text-destructive-strong',
  stale: 'text-warning-strong',
  unscheduled: 'text-muted-foreground',
};

function DealsSection({ deals }: { deals: ReturnType<typeof useDealsQuery> }) {
  const view = queryView(deals);
  // 종료·취소를 뺀 거래를 거래관리와 같은 순서로 놓는다.
  const active = sortDealsForDisplay((deals.data ?? []).filter(isActiveDeal));
  const inProgress = active.filter((deal) => getDealDisplayGroupKey(deal.stage) !== 'completed');
  const status = statusBody(view, () => void deals.refetch());
  const headIcon = 'size-[13px] shrink-0';

  return (
    <section className="dash-sec dash-bento-card dash-center-card min-w-0" style={stagger(2)}>
      <SectionHead
        icon={Handshake}
        title="진행 중인 거래"
        count={view === 'ready' ? inProgress.length : undefined}
        action={<MoreLink to="/deals">거래관리</MoreLink>}
        divided={active.length === 0}
      />
      {status ??
        (active.length === 0 ? (
          <EmptyNote>진행 중인 거래가 없습니다.</EmptyNote>
        ) : (
          // 줄 하나가 통째로 링크라서 표 역할(role=row)은 쓰지 않는다 — 씌우면 보조 기술에서 링크가 사라진다.
          <div className="dash-table mt-1 border-t border-border">
            <div className="dash-tr" aria-hidden="true">
              <span className="dash-th">
                <Type className={headIcon} /> 거래
              </span>
              <span className="dash-th">
                <Tag className={headIcon} /> 단계
              </span>
              <span className="dash-th">
                <CalendarDays className={headIcon} /> 다음 일정
              </span>
            </div>
            {active.map((deal) => (
              <DealRow key={deal.id} deal={deal} />
            ))}
          </div>
        ))}
    </section>
  );
}

function DealRow({ deal }: { deal: Deal }) {
  const health = getDealPipelineHealth(deal);
  const nextPayment = getNextDealPaymentSummary(deal);
  const amount = formatDealAmount(deal);
  const title = getDealTitle(deal);
  // 좁은 카드에서 단지 이름이 길어도 동·호는 잘리지 않게 둘로 나눠 그린다.
  const [, site = title, unit = ''] = /^(.*?)\s((?:\S+동\s)?\S+호)$/.exec(title) ?? [];

  return (
    <Link to="/deals" search={{ dealId: deal.id }} className="dash-tr">
      <span className="dash-td">
        <span className="min-w-0">
          <span className="flex min-w-0 gap-1 text-sm leading-5 font-medium" title={title}>
            <span className="truncate">{site}</span>
            {unit && <span className="shrink-0">{unit}</span>}
          </span>
          {amount !== '—' && (
            <span className="block truncate text-xs leading-4 text-muted-foreground tabular-nums">
              {amount}
            </span>
          )}
        </span>
      </span>
      <span className="dash-td">
        <StatusBadge kind="dealStage" status={deal.stage} />
      </span>
      <span className="dash-td">
        <span className="min-w-0 truncate text-sm tabular-nums">
          {health.state !== 'healthy' ? (
            <span title={health.description} className={cn('font-medium', HEALTH_TEXT[health.state])}>
              {health.label}
            </span>
          ) : nextPayment?.payment.scheduledDate ? (
            <>
              {formatNextPaymentName(nextPayment)}
              <span
                className={cn(
                  'ml-1.5 font-semibold',
                  nextPayment.isUrgent ? 'text-warning-strong' : 'text-foreground',
                )}
              >
                {formatDaysLabel(nextPayment.daysUntil)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      </span>
    </Link>
  );
}

/* ----------------------------- 최근 상담 내역 ----------------------------- */

const CHANNEL_ICON: Record<ConsultationChannelKind, LucideIcon> = {
  inbound: PhoneIncoming,
  outbound: PhoneOutgoing,
  phone: Phone,
  visit: Users,
  online: Monitor,
  other: MessageSquareText,
};

const CHANNEL_TONE_CLASS: Record<ConsultationChannelKind, string> = {
  inbound: 'bg-violet-soft text-violet',
  outbound: 'bg-violet-soft text-violet',
  phone: 'bg-violet-soft text-violet',
  visit: 'bg-info-soft text-info-strong',
  online: 'bg-success-soft text-success',
  other: 'bg-neutral-soft text-muted-foreground-strong',
};

const CONSULT_STATUS_CLASS: Record<Exclude<ConsultationRowStatus['tone'], 'none'>, string> = {
  todo: 'bg-destructive-soft text-destructive-strong',
  busy: 'bg-info-soft text-info-strong',
  failed: 'bg-destructive-soft text-destructive-strong',
  done: 'bg-neutral-soft text-muted-foreground-strong',
  quiet: 'bg-neutral-soft text-muted-foreground',
};

function getConsultationPropertyLabel(consultation: Consultation): string | null {
  const siteName = consultation.property?.site?.name?.trim();
  const unit = consultation.property?.unit;
  if (!siteName && !unit) return null;
  const dongName = unit?.dong?.name?.trim();
  const dongLabel =
    dongName && dongName !== '-' && !unit?.dong?.isPlaceholder
      ? dongName.endsWith('동') ? dongName : `${dongName}동`
      : null;
  const unitName = unit?.name?.trim();
  const unitLabel =
    unitName && unitName !== '-'
      ? unitName.endsWith('호') ? unitName : `${unitName}호`
      : unit
        ? formatFloorRange(unit) || null
        : null;
  return [siteName, dongLabel, unitLabel].filter(Boolean).join(' ') || null;
}

function ConsultationsSection({
  scope,
  userId,
  consultations,
  now,
}: {
  scope: Scope;
  userId: string | undefined;
  consultations: ReturnType<typeof useRecentConsultationsQuery>;
  now: Date;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Consultation | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const createFollowUp = useMutation({
    mutationFn: (consultation: Consultation) => {
      const due = startOfDay(new Date());
      due.setHours(9);
      const who = consultation.contact?.name ?? '고객';
      return api.tasks.create({
        title: `[상담 후속] ${who} 확인`,
        dueDate: due.toISOString(),
        assignedToId: userId,
        contactId: consultation.contactId,
        propertyId: consultation.propertyId ?? undefined,
        consultationId: consultation.id,
      });
    },
    onSuccess: (_result, consultation) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('후속 할 일을 추가했습니다', {
        description: `${consultation.contact?.name ?? '고객'} 상담 후속`,
      });
      setSelected(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const view = queryView(consultations);
  const items = consultations.data?.items ?? [];
  const totalCount = consultations.data?.pagination?.total;
  const status = statusBody(view, () => void consultations.refetch(), 3);

  const selectedChannel = selected ? getConsultationChannel(selected) : null;
  const selectedProperty = selected ? getConsultationPropertyLabel(selected) : null;
  const selectedPhone = selected?.contact?.phone ? formatPhone(selected.contact.phone) : null;
  const selectedAiSummary = selected?.callRecording?.summary?.trim();

  return (
    <section ref={sectionRef} className="dash-sec dash-bento-card dash-center-card min-w-0" style={stagger(3)}>
      <SectionHead
        icon={MessageSquareText}
        title="최근 상담 내역"
        count={view === 'ready' ? (totalCount ?? items.length) : undefined}
        action={<MoreLink to="/consultations">상담분석</MoreLink>}
        divided
      />
      {status ??
        (items.length === 0 ? (
          <EmptyNote>
            {scope === 'mine' ? '내가 기록한 최근 상담이 없습니다.' : '최근 상담 내역이 없습니다.'}
          </EmptyNote>
        ) : (
          <div>
            {items.map((item) => {
              const channel = getConsultationChannel(item);
              const ChannelIcon = CHANNEL_ICON[channel.kind];
              const rowStatus = getConsultationRowStatus(item);
              const summaryLine = getConsultationSummaryLine(item);
              const propertyLabel = getConsultationPropertyLabel(item);
              const metaTail = [
                propertyLabel,
                scope === 'all' && item.createdBy?.name
                  ? item.createdById === userId
                    ? '나'
                    : item.createdBy.name
                  : null,
              ]
                .filter(Boolean)
                .join(' · ');

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={(event) => {
                    openerRef.current = event.currentTarget;
                    setSelected(item);
                  }}
                  className="dash-consult-row focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-flex h-[18px] shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium',
                          CHANNEL_TONE_CLASS[channel.kind],
                        )}
                      >
                        <ChannelIcon className="size-3" aria-hidden="true" />
                        {channel.label}
                      </span>
                      <span className="truncate text-[13px] font-semibold text-foreground">
                        {item.contact?.name ?? '미연결 고객'}
                      </span>
                      {metaTail && (
                        <span className="min-w-0 truncate text-[11.5px] text-muted-foreground">
                          · {metaTail}
                        </span>
                      )}
                    </div>
                    <p className="flex items-center gap-1 truncate text-[12.5px] leading-5 text-muted-foreground-strong">
                      {summaryLine.fromAi && (
                        <SparklesIcon className="size-3 shrink-0 text-info" aria-label="AI 요약" />
                      )}
                      <span className="truncate">
                        {summaryLine.text || '기록된 상담 메모가 없습니다.'}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {formatConsultationWhen(item.createdAt, now)}
                    </span>
                    {rowStatus.tone !== 'none' && (
                      <span
                        title={rowStatus.hint}
                        className={cn(
                          'inline-flex h-[18px] items-center rounded px-1.5 text-[10.5px] font-semibold',
                          CONSULT_STATUS_CLASS[rowStatus.tone],
                        )}
                      >
                        {rowStatus.label}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}

      <Dialog open={selected !== null} onOpenChange={(next) => !next && setSelected(null)}>
        {selected && selectedChannel && (
          <DialogContent
            className="sm:max-w-lg"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const opener = openerRef.current;
              (opener?.isConnected ? opener : sectionRef.current?.querySelector<HTMLButtonElement>('button.dash-consult-row'))?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 leading-7">
                <span>{selected.contact?.name ?? '미연결 고객'}</span>
                <span
                  className={cn(
                    'inline-flex h-5 items-center gap-1 rounded px-1.5 text-xs font-medium',
                    CHANNEL_TONE_CLASS[selectedChannel.kind],
                  )}
                >
                  {selectedChannel.label}
                </span>
              </DialogTitle>
              <DialogDescription>
                {[
                  formatConsultationWhen(selected.createdAt, now),
                  selectedPhone,
                  selectedProperty,
                  selected.createdBy?.name ? `담당 ${selected.createdBy.name}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {selectedAiSummary && selectedAiSummary !== selected.content.trim() && (
                <div className="rounded-lg border border-border bg-muted px-3 py-2.5 text-xs leading-5 text-muted-foreground-strong">
                  <div className="mb-1 inline-flex items-center gap-1 font-semibold text-info-strong">
                    <SparklesIcon className="size-3" aria-hidden="true" />
                    통화 AI 요약
                  </div>
                  <p className="whitespace-pre-wrap">{selectedAiSummary}</p>
                </div>
              )}
              <div className="max-h-[45vh] overflow-auto rounded-lg border border-border bg-background px-3.5 py-3 text-sm leading-6 break-words whitespace-pre-wrap text-foreground">
                {selected.content.trim() || '기록된 상담 내용이 없습니다.'}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/consultations" search={{ consultationId: selected.id }}>
                  상담분석에서 열기
                </Link>
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={createFollowUp.isPending}
                onClick={() => createFollowUp.mutate(selected)}
              >
                {createFollowUp.isPending ? '추가 중...' : '후속 할 일 추가'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

/* ----------------------------- 오른쪽 레일 카드 ----------------------------- */

function CollectionCard({
  ledger,
}: {
  ledger: ReturnType<typeof useMonthlyLedgerQuery>;
}) {
  const paused = isQueryPaused(ledger);
  const summary = ledger.data?.summary;
  const pct = summary ? collectPercent(summary.collectedTotal, summary.billedTotal) : 0;
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <Link
      to="/cashflow"
      className="dash-sec dash-bento-card dash-cash-card min-w-0 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      style={stagger(2)}
    >
      {paused || ledger.isError ? (
        <div className="flex w-full items-center gap-2.5 text-xs text-muted-foreground">
          <Wallet className="size-4 shrink-0 text-sidebar-icon" aria-hidden="true" />
          <span className="truncate">
            {paused ? '오프라인 상태라 이달 수금을 불러올 수 없습니다.' : '이달 수금 정보를 불러오지 못했습니다.'}
          </span>
        </div>
      ) : ledger.isPending ? (
        <div className="flex w-full items-center gap-3">
          <Skeleton className="size-[42px] shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      ) : summary ? (
        <>
          <div className="relative size-[42px] shrink-0" aria-hidden="true">
            <svg viewBox="0 0 42 42" className="size-[42px] -rotate-90">
              <circle
                cx="21"
                cy="21"
                r={radius}
                fill="none"
                stroke="rgb(55 53 47 / 0.09)"
                strokeWidth="3.8"
              />
              <circle
                cx="21"
                cy="21"
                r={radius}
                fill="none"
                stroke="var(--color-success)"
                strokeWidth="3.8"
                strokeLinecap="round"
                strokeDasharray={circumference.toFixed(2)}
                strokeDashoffset={dashOffset.toFixed(2)}
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-[10.5px] font-bold text-foreground tabular-nums">
              {pct}%
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">이달 수금</span>
              {summary.overdueCount > 0 && (
                <span className="rounded bg-destructive-soft px-1.5 py-px text-[10px] font-semibold text-destructive-strong tabular-nums">
                  미수 {summary.overdueCount}건
                </span>
              )}
            </div>
            <div className="truncate text-[14.5px] leading-tight font-bold text-foreground tabular-nums">
              {summary.billedTotal <= 0 ? (
                '이번 달 청구 없음'
              ) : (
                <>
                  {summary.collectedTotal > 0 ? formatMoney(summary.collectedTotal) : '0원'}
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {' '}
                    / {formatMoney(summary.billedTotal)}
                  </span>
                </>
              )}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground tabular-nums">
              {summary.paymentCount > 0
                ? `완료 ${summary.collectedCount}/${summary.paymentCount}건`
                : ledger.data?.periodLabel ?? '이번 달'}
            </div>
          </div>
        </>
      ) : null}
    </Link>
  );
}

/* -------------------------------- 공지사항 -------------------------------- */

/** 접힌 상태에서 보이는 공지 수 */
const NOTICE_PREVIEW = 4;

function noticeDate(value: string): string {
  const date = new Date(value);
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function RequiredBadge() {
  return (
    <span className="shrink-0 rounded px-[5px] py-px text-[10.5px] leading-4 font-semibold text-destructive-strong bg-destructive/10">
      필독
    </span>
  );
}

/**
 * 에스테잇플로우가 모든 사용자에게 알리는 공지 상태 및 읽음 동기화.
 * 오른쪽 레일과 좁은 화면 요약 창이 같은 상태·열기 규칙을 공유한다.
 */
function useNoticeReader(notices: ReturnType<typeof useNoticesQuery>) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const view = queryView(notices);
  // 읽은 공지의 기록을 목록 위에 얹는다. 대시보드에서 읽은 것뿐 아니라 필독 팝업이나 다른 탭에서 읽은 것도 들어 있다.
  // 읽기 전에 떠난 목록 응답이 늦게 도착해 캐시를 덮어도 다시 '안 읽음'으로 돌아가지 않는다.
  const { items, unreadCount: unread } = withKnownReads(notices.data, useKnownNoticeReads());
  // 안 읽은 공지가 아주 많으면 목록에 일부만 온다. 보이는 것을 다 읽었는데 수가 남으면 나머지를 받아 온다.
  const listedUnread = items.filter((item) => !item.readAt).length;
  const hasHiddenUnread = unread > 0 && listedUnread === 0;
  const refetchedFor = useRef(0);
  const { dataUpdatedAt, isFetching, refetch } = notices;
  useEffect(() => {
    // 같은 응답에 대해서는 한 번만 다시 부른다 (서버 값이 그대로여도 되풀이하지 않는다)
    if (!hasHiddenUnread || isFetching || refetchedFor.current === dataUpdatedAt) return;
    refetchedFor.current = dataUpdatedAt;
    void refetch();
  }, [hasHiddenUnread, isFetching, dataUpdatedAt, refetch]);
  // 본문 창은 사용자가 닫을 때까지 열려 있다. 목록이 다시 불려 그 공지가 빠져도(읽은 오래된 공지는
  // 최근 목록에 없다) 닫지 않는다 — 읽자마자 창이 사라지면 안 된다. 그래서 연 공지를 따로 기억해 둔다.
  const [lastOpened, setLastOpened] = useState<Notice | null>(null);
  const shownNotice = items.find((item) => item.id === openId) ?? lastOpened;
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const markRead = useMutation({
    mutationFn: (notice: Notice) => api.notices.markRead(notice.id),
    onSuccess: ({ noticeId, readAt }) => {
      // 그 공지만 읽음으로 바꾼다. 순서는 그대로 둔다 — 읽자마자 줄이 다른 자리로 가면 눈이 따라가지 못한다.
      applyNoticeRead(queryClient, noticeId, readAt);
      // 다른 탭에도 알린다 (필독 팝업이 다른 탭에서 다시 뜨지 않게)
      announceNotice({ type: 'read', noticeId, readAt });
    },
  });

  const openNotice = (notice: Notice, opener: HTMLButtonElement | null) => {
    openerRef.current = opener;
    setLastOpened(notice);
    setOpenId(notice.id);
    if (!notice.readAt) markRead.mutate(notice);
  };

  return { view, items, unread, openId, setOpenId, shownNotice, openNotice, openerRef };
}

function NoticeSection({
  notices,
  reader,
  sectionRef,
}: {
  notices: ReturnType<typeof useNoticesQuery>;
  reader: ReturnType<typeof useNoticeReader>;
  sectionRef: React.RefObject<HTMLElement | null>;
}) {
  const [expanded, setExpanded] = useState(false);
  const { view, items, unread, openNotice } = reader;
  const status = statusBody(view, () => void notices.refetch(), 3);
  const shown = expanded ? items : items.slice(0, NOTICE_PREVIEW);
  const hidden = items.length - shown.length;

  return (
    <section ref={sectionRef} className="dash-sec dash-bento-card dash-side-card min-w-0" style={stagger(3)}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Megaphone className="size-3.5 text-sidebar-icon" strokeWidth={1.7} aria-hidden="true" />
          공지사항
        </span>
        {view === 'ready' && items.length > 0 && (
          <span className={cn('text-[11px] tabular-nums', unread > 0 ? 'font-semibold text-info-strong' : 'text-muted-foreground')}>
            {unread > 0 ? `안 읽음 ${unread}` : '모두 읽음'}
          </span>
        )}
      </div>

      {status ??
        (items.length === 0 ? (
          <EmptyNote>새 공지가 없습니다.</EmptyNote>
        ) : (
          <>
            <ul className="dash-tl-feed">
              {shown.map((notice) => {
                const isUnread = !notice.readAt;
                return (
                  <li key={notice.id}>
                    <button
                      type="button"
                      onClick={(event) => openNotice(notice, event.currentTarget)}
                      aria-label={`${notice.isRequired ? '필독 ' : ''}${notice.title}${isUnread ? ' (안 읽음)' : ''}`}
                      className={cn(
                        'dash-tl-entry group focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        isUnread && 'is-unread',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {notice.isRequired && <RequiredBadge />}
                        <span
                          className={cn(
                            'line-clamp-2 text-[12.5px] leading-[1.38] transition-colors group-hover:text-foreground',
                            isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground-strong',
                          )}
                        >
                          {notice.title}
                        </span>
                      </span>
                      <span className="text-[11px] text-muted-foreground/80 tabular-nums">
                        {noticeDate(notice.publishedAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {(hidden > 0 || expanded) && items.length > NOTICE_PREVIEW && (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
                className="self-start rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.055] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {expanded ? '접기' : `${hidden}건 더 보기`}
              </button>
            )}
          </>
        ))}
    </section>
  );
}

/* --------------------------- 앱 사용법 가이드 배너 --------------------------- */

interface AppGuide {
  id: string;
  theme: 'is-slate' | 'is-forest' | 'is-stone';
  badge: string;
  title: string;
  sub: string;
  tip: string;
  steps: Array<{ title: string; desc: string }>;
}

const APP_GUIDES: AppGuide[] = [
  {
    id: 'guide-start',
    theme: 'is-slate',
    badge: 'GUIDE · 3분 시작',
    title: '에스테잇플로우 빠른 시작 가이드',
    sub: '매물 접수부터 프로젝트·계약까지 핵심 흐름 한눈에',
    tip: '⌘K로 거래·고객·메뉴를 즉시 열고, 사이드바 접기/펼치기로 넓은 화면을 확보할 수 있습니다.',
    steps: [
      { title: '1. 매물·의뢰 등록', desc: '단지와 동·호수를 고르고 매매·전세·월세 의뢰 조건을 차곡차곡 쌓습니다.' },
      { title: '2. 프로젝트로 손님별 진행 묶기', desc: '계속 주고받을 손님이나 공동중개 건은 프로젝트로 열어 상담·단계·코멘트를 한곳에서 봅니다.' },
      { title: '3. 거래·계약·수금 자동 추적', desc: '가계약·본계약·중도금·잔금 일정과 중개보수 수금 현황을 대시보드에서 바로 확인합니다.' },
    ],
  },
  {
    id: 'guide-mcp',
    theme: 'is-forest',
    badge: 'MCP · AI 연동',
    title: 'Claude로 네이버 내광고 비교하기',
    sub: '내 광고 순위·층 노출 분석을 MCP로 바로 확인하세요',
    tip: '로컬 PC에서 수집한 스냅샷만 서버에 반영되므로 네이버 계정이나 차단 걱정 없이 비교할 수 있습니다.',
    steps: [
      { title: '1. 로컬 Skill로 이실장·네이버 스냅샷 수집', desc: '이실장 내 광고와 네이버 동일 매물 묶음 스냅샷을 내 PC에서 안전하게 읽습니다.' },
      { title: '2. 순위·대표광고·층 노출 차이 비교', desc: '더 저렴한 경쟁 광고나 정확한 층수가 공개된 타사 매물을 자동으로 짚어냅니다.' },
      { title: '3. 수정 요청 정리 및 ERP 태스크 연계', desc: '가격·층 노출 조정과 재전송 요청을 ERP 광고 업무 태스크로 이어서 관리합니다.' },
    ],
  },
  {
    id: 'guide-tabs',
    theme: 'is-stone',
    badge: 'TIP · 멀티탭',
    title: '멀티탭 & 단축키로 빠르게 일하기',
    sub: '여러 거래·고객을 탭으로 열어두고 오가며 상담하세요',
    tip: '상단 전역 검색(⌘K)이나 왼쪽 메뉴에서 여러 업무 화면을 탭으로 열어두고 빠르게 오갈 수 있습니다.',
    steps: [
      { title: '1. 상단 탭으로 여러 업무 동시에 열기', desc: '상담 중인 매물과 계약서 화면 여러 개를 상단 탭에 나란히 열어두고 전환할 수 있습니다.' },
      { title: '2. 상단 ⌘K로 거래·고객·메뉴 즉시 이동', desc: '마우스 이동 없이 검색창에서 단지명·고객명·정산 화면으로 한 번에 점프합니다.' },
      { title: '3. 대시보드에서 바로 후속 할 일 연결', desc: '최근 상담 내역을 열어 통화·방문 메모를 확인하고 오늘 후속 할 일을 바로 추가합니다.' },
    ],
  },
];

function GuideBannerCard({
  bannerIdx,
  onSelectBanner,
  onOpenGuide,
}: {
  bannerIdx: number;
  onSelectBanner: (index: number) => void;
  onOpenGuide: (guideId: string) => void;
}) {
  const guide = APP_GUIDES[bannerIdx] ?? APP_GUIDES[0];
  return (
    <section
      className={cn('dash-sec dash-guide-banner min-w-0', guide.theme)}
      style={stagger(4)}
      aria-label="앱 사용법 가이드"
    >
      <svg className="dash-banner-svg" viewBox="0 0 80 80" fill="none" aria-hidden="true">
        <path d="M12 68V30l18-12 18 12v38H12z" stroke="#ffffff" strokeWidth="2.4" />
        <path d="M48 68V20l20-10v58H48z" stroke="#ffffff" strokeWidth="2.4" />
        <path d="M22 40h6M22 49h6M56 32h6M56 41h6M56 50h6" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>

      <div className="relative z-[1] flex items-center justify-between gap-2">
        <span className="inline-flex h-[18px] items-center rounded bg-white/15 px-1.5 text-[10px] font-semibold tracking-[0.02em] text-white/95">
          {guide.badge}
        </span>
        <div className="inline-flex items-center gap-1" role="tablist" aria-label="가이드 슬라이드">
          {APP_GUIDES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={index === bannerIdx}
              aria-label={`가이드 ${index + 1}: ${item.title}`}
              onClick={() => onSelectBanner(index)}
              className={cn(
                'dash-banner-dot focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none',
                index === bannerIdx && 'is-active',
              )}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpenGuide(guide.id)}
        className="relative z-[1] flex flex-col gap-1 rounded-md text-left focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
      >
        <div className="text-[13.5px] leading-[1.35] font-bold tracking-[-0.015em] text-white">
          {guide.title}
        </div>
        <div className="text-[11.5px] leading-[1.4] text-white/80">{guide.sub}</div>
        <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-white/95">
          가이드 보기
          <ArrowRight className="size-3" aria-hidden="true" />
        </div>
      </button>
    </section>
  );
}

function NewsCard() {
  return (
    <section className="dash-sec dash-bento-card dash-side-card min-w-0" style={stagger(5)}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Newspaper className="size-3.5 text-sidebar-icon" strokeWidth={1.7} aria-hidden="true" />
          부동산 · 시장 뉴스
        </span>
        <span className="text-[11px] font-medium text-muted-foreground/75">준비 중</span>
      </div>
      <p className="text-xs leading-[1.55] break-keep text-muted-foreground/85">
        정책, 시장, 우리 지역 소식이 여기에 나옵니다.
      </p>
    </section>
  );
}

/* --------------------------------- 쿼리 --------------------------------- */

/** 필독 팝업(components/layout/required-notice-popup)과 같은 캐시를 쓴다. */
function useNoticesQuery() {
  return useQuery({ queryKey: NOTICES_QUERY_KEY, queryFn: () => api.notices.list(), staleTime: NOTICES_STALE_MS });
}

function useTasksQuery() {
  return useQuery({ queryKey: ['tasks'], queryFn: () => api.tasks.findAll() });
}

function useDealsQuery() {
  return useQuery({ queryKey: ['deals'], queryFn: () => api.deals.findAll() });
}

/** 오늘(0시~다음 날 0시) 일정. 달력을 다른 달로 넘겨도 인사 영역 숫자·그림 깃발이 유지된다. */
function useTodayEventsQuery(todayKey: string, todayStart: Date) {
  return useQuery({
    queryKey: ['calendar-events', 'day', todayKey],
    queryFn: () =>
      api.calendarEvents.findAll({
        start: todayStart.toISOString(),
        end: addDays(todayStart, 1).toISOString(),
      }),
  });
}

/** 보고 있는 월간 달력과 선택한 날·다가오는 일정을 한 번에 불러온다. */
function useMonthEventsQuery(rangeStart: Date, rangeEnd: Date) {
  return useQuery({
    queryKey: ['calendar-events', 'month', localDateKey(rangeStart), localDateKey(rangeEnd)],
    queryFn: () =>
      api.calendarEvents.findAll({
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
      }),
  });
}

function useRecentConsultationsQuery(scope: Scope, userId: string | undefined) {
  return useQuery({
    queryKey: ['consultations', 'dashboard', scope, scope === 'mine' ? (userId ?? 'none') : 'all'],
    queryFn: () =>
      api.consultations.findAll({
        limit: 6,
        sortOrder: 'desc',
        createdById: scope === 'mine' && userId ? userId : undefined,
      }),
    enabled: scope === 'all' || Boolean(userId),
  });
}

/** 이달 수금은 대표·실장 권한 전용(/finance/ledger @Roles('owner', 'manager')). */
function useMonthlyLedgerQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['finance', 'ledger', 'this-month'],
    queryFn: () => api.finance.ledger.get({ preset: 'this-month' }),
    enabled,
    staleTime: 60_000,
  });
}

/* --------------------------------- 페이지 --------------------------------- */

function DashboardPage() {
  const { user } = useAuth();
  const now = useMinuteClock();
  // 등장 움직임은 화면을 열 때 한 번뿐이다. 끝나면 표식을 떼어 그 뒤의 다시 그리기에는 재생되지 않게 한다.
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setPlaying(false), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  const [reveal, setReveal] = useState<{ bucket: TaskBucket; n: number } | null>(null);
  const [cheer, setCheer] = useState(0);
  // 사무소 위치의 날씨는 서버가 아직 주지 않는다. 주게 되면 여기에 잇는다. 그때까지 그림은 맑은 날이고 날씨 글자는 없다.
  const preview = useWeatherPreview(now.getHours() + now.getMinutes() / 60);
  const weather: SceneWeather | undefined = preview?.weather;
  const [focusDay, setFocusDay] = useState(0);
  const todayStart = startOfDay(now);
  const todayKey = localDateKey(now);

  const [scope, setScope] = useState<Scope>(user?.role === 'agent' ? 'mine' : 'all');
  const [viewMonth, setViewMonth] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() }));
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const selectedKey = pickedKey ?? todayKey;
  const selectedDate = parseDateKey(selectedKey);

  const [bannerIdx, setBannerIdx] = useState(0);
  const [openGuideId, setOpenGuideId] = useState<string | null>(null);
  const [digestOpen, setDigestOpen] = useState(false);

  const digestTriggerRef = useRef<HTMLButtonElement | null>(null);
  const noticeSectionRef = useRef<HTMLElement | null>(null);
  const scheduleAsideRef = useRef<HTMLElement | null>(null);

  // 월간 캘린더 5~6주 격자 계산 (월요일 시작)
  const monthFirst = new Date(viewMonth.year, viewMonth.month, 1);
  const gridStart = startOfWeek(monthFirst);
  const all42 = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const calendarDays = all42[35].getMonth() === viewMonth.month ? all42 : all42.slice(0, 35);
  const gridEnd = addDays(gridStart, calendarDays.length);
  const rangeStart = new Date(Math.min(gridStart.getTime(), startOfDay(selectedDate).getTime()));
  const rangeEnd = new Date(Math.max(addDays(gridEnd, 14).getTime(), addDays(selectedDate, 15).getTime()));

  const canViewCashflow = user?.role === 'owner' || user?.role === 'manager';

  const tasks = useTasksQuery();
  const deals = useDealsQuery();
  const notices = useNoticesQuery();
  const todayEventsQuery = useTodayEventsQuery(todayKey, todayStart);
  const monthEventsQuery = useMonthEventsQuery(rangeStart, rangeEnd);
  const consultations = useRecentConsultationsQuery(scope, user?.id);
  const ledger = useMonthlyLedgerQuery(canViewCashflow);

  const noticeReader = useNoticeReader(notices);
  const {
    items: noticeItems,
    unread: unreadNotices,
    openId,
    setOpenId,
    shownNotice,
    openNotice,
    openerRef: noticeOpenerRef,
  } = noticeReader;

  const mine = scope === 'mine' && Boolean(user?.id);
  const scopedOpenTasks = (tasks.data ?? [])
    .filter(isOpenTask)
    .filter((task) => !mine || task.assignedToId === user?.id)
    .sort((a, b) => byDateAsc(a.dueDate, b.dueDate));
  const scopedTodayEvents = (todayEventsQuery.data ?? []).filter((event) => !mine || event.userId === user?.id);
  const scopedMonthEvents = (monthEventsQuery.data ?? []).filter((event) => !mine || event.userId === user?.id);
  const todayEventCount = scopedTodayEvents.filter((event) => eventCoversDay(event, now)).length;
  const overdueTasks = scopedOpenTasks.filter((task) => taskBucket(task) === 'overdue');

  // 그림의 시간 축에는 오늘 시작하는, 시각이 있는 일정만 꽂는다.
  const flags: SceneFlag[] = scopedTodayEvents
    .filter((event) => !event.allDay && eventCoversDay(event, now) && !startedBefore(event, now))
    .map((event) => {
      const start = new Date(event.start);
      return { hour: start.getHours() + start.getMinutes() / 60, label: event.title };
    });

  const stepMonth = (delta: number) => {
    setViewMonth((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const goToday = () => {
    setViewMonth({ year: now.getFullYear(), month: now.getMonth() });
    setPickedKey(null);
    setFocusDay((count) => count + 1);
  };

  const selectCalendarDay = (day: Date) => {
    const key = localDateKey(day);
    setPickedKey(key === todayKey ? null : key);
    if (day.getFullYear() !== viewMonth.year || day.getMonth() !== viewMonth.month) {
      setViewMonth({ year: day.getFullYear(), month: day.getMonth() });
    }
  };

  const showBucket = (bucket: TaskBucket) => setReveal((prev) => ({ bucket, n: (prev?.n ?? 0) + 1 }));
  const onPin = (target: PinTarget) => {
    if (target === 'schedule') {
      goToday();
      scheduleAsideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      showBucket(target);
    }
  };

  const heroStatus =
    tasks.isError || todayEventsQuery.isError || isQueryPaused(tasks) || isQueryPaused(todayEventsQuery)
      ? 'unavailable'
      : tasks.isPending || todayEventsQuery.isPending
        ? 'pending'
        : 'ready';

  const ledgerPercentLabel = ledger.data
    ? `${collectPercent(ledger.data.summary.collectedTotal, ledger.data.summary.billedTotal)}%`
    : '—';

  const activeGuide = APP_GUIDES.find((g) => g.id === openGuideId) ?? null;

  return (
    <div className={cn('dash-canvas flex-1', playing && 'dash-play')}>
      <div className="dash-wrap">
        <Briefing
          now={now}
          officeName={user?.office?.name}
          userName={user?.name}
          events={todayEventCount}
          openTasks={scopedOpenTasks.length}
          overdueCount={overdueTasks.length}
          status={heroStatus}
          flags={flags}
          cheer={cheer}
          weather={weather}
          hour={preview?.hour ?? now.getHours() + now.getMinutes() / 60}
          onPin={onPin}
          tools={
            <>
              <ScopeToggle value={scope} onChange={setScope} />
              <QuickCreate />
            </>
          }
        />

        <div className="dash-bento-grid">
          <aside ref={scheduleAsideRef} className="dash-left">
            <MiniCalendarCard
              viewMonth={viewMonth}
              calendarDays={calendarDays}
              monthEvents={scopedMonthEvents}
              selectedKey={selectedKey}
              todayKey={todayKey}
              onSelectDay={selectCalendarDay}
              onPrevMonth={() => stepMonth(-1)}
              onNextMonth={() => stepMonth(1)}
              onGoToday={goToday}
              focusDay={focusDay}
            />
            <ScheduleCard
              scope={scope}
              userId={user?.id}
              eventsQuery={monthEventsQuery}
              monthEvents={scopedMonthEvents}
              selectedDate={selectedDate}
              selectedKey={selectedKey}
              todayKey={todayKey}
              now={now}
            />
          </aside>

          <div className="dash-center">
            <TaskSection
              scope={scope}
              userId={user?.id}
              tasks={tasks}
              openTasks={scopedOpenTasks}
              now={now}
              reveal={reveal}
              onCheer={() => setCheer((count) => count + 1)}
              canViewCashflow={canViewCashflow}
              ledgerPercentLabel={ledgerPercentLabel}
              unreadNotices={unreadNotices}
              onOpenDigest={() => setDigestOpen(true)}
              digestTriggerRef={digestTriggerRef}
            />
            <DealsSection deals={deals} />
            <ConsultationsSection
              scope={scope}
              userId={user?.id}
              consultations={consultations}
              now={now}
            />
          </div>

          <aside className="dash-rail">
            {canViewCashflow && <CollectionCard ledger={ledger} />}
            <NoticeSection notices={notices} reader={noticeReader} sectionRef={noticeSectionRef} />
            <GuideBannerCard
              bannerIdx={bannerIdx}
              onSelectBanner={setBannerIdx}
              onOpenGuide={(id) => setOpenGuideId(id)}
            />
            <NewsCard />
          </aside>
        </div>
      </div>

      {/* 공지 본문 창 — 3단 오른쪽 레일과 좁은 화면 요약 창이 함께 쓴다 */}
      <Dialog open={openId !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        {shownNotice && (
          <DialogContent
            className="sm:max-w-lg"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const opener = noticeOpenerRef.current;
              const fallback =
                noticeSectionRef.current?.querySelector<HTMLButtonElement>('li button') ??
                digestTriggerRef.current;
              (opener?.isConnected && opener.offsetParent !== null ? opener : fallback)?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-start gap-2 leading-7 break-keep">
                {shownNotice.isRequired && (
                  <span className="mt-1.5">
                    <RequiredBadge />
                  </span>
                )}
                {shownNotice.title}
              </DialogTitle>
              <DialogDescription>에스테잇플로우 공지 · {formatDate(shownNotice.publishedAt)}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto text-sm leading-6 break-words whitespace-pre-wrap text-foreground">
              {shownNotice.body}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* 앱 사용법 가이드 창 */}
      <Dialog open={activeGuide !== null} onOpenChange={(next) => !next && setOpenGuideId(null)}>
        {activeGuide && (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex h-5 items-center rounded bg-muted px-2 text-[11px] font-semibold text-muted-foreground-strong">
                  {activeGuide.badge}
                </span>
              </div>
              <DialogTitle className="leading-7">{activeGuide.title}</DialogTitle>
              <DialogDescription>{activeGuide.sub}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2.5">
              {activeGuide.steps.map((step) => (
                <div key={step.title} className="rounded-lg border border-border bg-muted px-3.5 py-2.5">
                  <div className="text-[13px] font-semibold text-foreground">{step.title}</div>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground-strong">{step.desc}</p>
                </div>
              ))}
              <div className="rounded-lg bg-info/10 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground-strong">
                <b className="text-info-strong">TIP</b> · {activeGuide.tip}
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <div className="mb-2 text-[11.5px] font-semibold text-muted-foreground">다른 가이드 보기</div>
              <div className="flex flex-wrap gap-1.5">
                {APP_GUIDES.map((g, index) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setBannerIdx(index);
                      setOpenGuideId(g.id);
                    }}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      g.id === activeGuide.id
                        ? 'border-foreground/30 bg-muted font-semibold text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <BookOpen className="size-3" aria-hidden="true" />
                    {g.badge}
                  </button>
                ))}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* 좁은 화면(1260px 미만) 공지·가이드 요약 창 */}
      <Dialog open={digestOpen} onOpenChange={setDigestOpen}>
        <DialogContent
          className="sm:max-w-md"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            digestTriggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>공지사항 · 앱 사용법 가이드</DialogTitle>
            <DialogDescription>오른쪽 레일이 접힌 화면에서 공지와 가이드를 바로 확인합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">공지사항</h3>
              {noticeItems.length === 0 ? (
                <EmptyNote>새 공지가 없습니다.</EmptyNote>
              ) : (
                <ul className="max-h-52 space-y-1 overflow-auto">
                  {noticeItems.map((notice) => {
                    const isUnread = !notice.readAt;
                    return (
                      <li key={notice.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setDigestOpen(false);
                            openNotice(notice, null);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <span
                            aria-hidden="true"
                            className={cn('size-1.5 shrink-0 rounded-full', isUnread && 'bg-info')}
                          />
                          {notice.isRequired && <RequiredBadge />}
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-sm',
                              isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground-strong',
                            )}
                          >
                            {notice.title}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {noticeDate(notice.publishedAt)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-border pt-3">
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">앱 사용법 가이드</h3>
              <div className="space-y-1.5">
                {APP_GUIDES.map((g, index) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setBannerIdx(index);
                      setDigestOpen(false);
                      setOpenGuideId(g.id);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-foreground">{g.title}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">{g.sub}</div>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{g.badge}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
