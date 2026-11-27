import { createFileRoute, Link, type LinkProps } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Home,
  ListChecks,
  ListTodo,
  Megaphone,
  MessageSquareText,
  MapPin,
  Monitor,
  Moon,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Plus,
  Sparkles as SparklesIcon,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatFloorRange } from '@estate-erp/shared';
import type { CalendarEvent, Consultation, DealListItem as Deal, Notice, Task } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import {
  NOTICES_QUERY_KEY,
  NOTICES_STALE_MS,
  announceNotice,
  applyNoticeRead,
  useKnownNoticeReads,
  withKnownReads,
} from '@/lib/notices';
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
import { formatDate, formatPhone, formatRelativeDay } from '@/lib/format';
import { ConsultationFormDialog } from './consultations/-consultation-form-dialog';
import {
  formatConsultationClock,
  formatConsultationDay,
  formatConsultationWhen,
  getConsultationChannel,
  getConsultationRowStatus,
  getConsultationSummaryLine,
  splitConsultationTag,
  type ConsultationChannelKind,
  type ConsultationRowStatus,
} from './consultations/-consultation-list-model';
import {
  getDealDisplayGroupKey,
  getDealPipelineHealth,
} from './deals/-deal-view-utils';
import { getPropertyLabel } from './tasks/-task-property-label';
import { taskEndedTags } from './tasks/-task-filters';
import {
  OfflineState,
  QueryErrorState,
  WidgetSkeleton,
  daysUntil,
  isQueryPaused,
  localDateKey,
} from './-dashboard-widgets';
import { DashboardScene, type SceneFlag } from './-dashboard-scene';
import { OVERLAY_META, assignedDealIds, useCalendarOverlays, type OverlayItem } from './calendar/-calendar-overlay';
import { formatEventPlace, getEventSuperseded, isEventMoot } from './calendar/-event-meta';
import { EventTitle } from './calendar/-event-title';
import { PRECIP, WEATHER_LABEL, clock, sceneState, type SceneWeather, type WeatherKind } from './-dashboard-sky';
import { dealQueries } from '@/queries/deals';
import './-dashboard.css';

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
});

/*
 * 디자인 메모 — 오늘의 보드와 3단 풀화면 카드 워크벤치
 * 맨 위는 인사 영역이다. 판 전체가 하늘이고 오른쪽에 색이 있는 작은 동네가 있다(-dashboard-scene.tsx).
 * 땅이 오늘의 시간 축이라 해가 지금 시각 위에 뜨고 오늘 일정이 깃발로 꽂힌다. 하늘은 시각과 사무소 위치의 날씨를 따른다.
 * 아래는 순백(#ffffff) 바탕 위에 Notion형 카드(모서리 10px, 옅은 선 + 얕은 그림자) 3단으로 나눈다
 * (2026-11-23 개편, 시안 docs/mockups/dashboard-board/v12.html):
 *   왼쪽 단: 월간 달력(이번 주 띠 · 일정 수만큼 점) · 선택한 날의 타임라인 + 다가오는 일정
 *   가운데 단: 할 일 · 최근 상담 내역 — 화면에 맞출 때 높이를 정확히 반씩 나눈다
 *   오른쪽 단: 현재 상황(계기 셋: 매칭 중 → 거래 진행 → 거래 완료) · 앱 사용법 가이드 · 소식(남은 높이)
 * 2026-11-25 개편(시안 docs/mockups/dashboard-2026-11-25/a-refine.html, 사용자 결정):
 *   - 진행 중인 거래 목록(단계 띠)을 빼고 현재 상황 계기판을 두었다. 거래 하나하나는 거래관리에서 본다.
 *   - 오른쪽 단은 좁아지면(판 960px 아래) 아래로 내려가지 않고 화면에서 빠진다.
 *   - 상담 내역은 날짜로 묶고, 매물 확인으로 생긴 짧은 기록은 한 줄로 접는다.
 * 이달 수금 카드는 대시보드에서 뺐다(사용자 결정 2026-11-23). 예전 코드는 .qa/backups/ 아래에 있다.
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

/** "11.6 (금)" — 앱 공통 날짜 표기(formatRelativeDay)와 같은 모양에서 '오늘·내일' 바꿈만 뺀 것 */
function shortDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getMonth() + 1}.${date.getDate()} (${WEEKDAYS[date.getDay()]})`;
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
  if (view === 'ready') return null;
  // 목록과 같은 굴림 상자에 담는다. 카드가 화면 높이에 맞춰 줄어들 때 상자 밖으로 넘치면
  // 아래 구획·카드에 덮여 '다시 시도'를 누를 수 없다.
  return (
    <div className="dash-scroll">
      {view === 'offline' ? (
        <OfflineState />
      ) : view === 'pending' ? (
        <WidgetSkeleton rows={rows} />
      ) : (
        <QueryErrorState onRetry={onRetry} className="py-6" />
      )}
    </div>
  );
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
      <h2 className="min-w-0 truncate text-[14px] leading-6 font-semibold text-foreground">{title}</h2>
      {count != null && <span className="shrink-0 text-[13px] text-muted-foreground/75 tabular-nums">{count}</span>}
      {meta != null && (
        <span className="min-w-0 truncate text-xs text-muted-foreground/80 tabular-nums">{meta}</span>
      )}
      {action && <div className="ml-auto flex shrink-0 items-center gap-1.5">{action}</div>}
    </header>
  );
}

const MORE_LINK_CLASS =
  'group inline-flex h-[26px] items-center gap-[3px] rounded-md px-[7px] text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.045] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

function MoreArrow() {
  return <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />;
}

function MoreLink({ to, children }: { to: LinkProps['to']; children: ReactNode }) {
  return (
    <Link to={to} className={MORE_LINK_CLASS}>
      {children}
      <MoreArrow />
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

/** 다가오는 일정의 날: '내일' · '11.26 (목)' (앱 공통 표기) */
function upcomingDayLabel(startIso: string, now: Date): string {
  return formatRelativeDay(startIso, now);
}

function MiniCalendarCard({
  viewMonth,
  calendarDays,
  monthEvents,
  overlaysByDate,
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
  overlaysByDate: Map<string, OverlayItem[]>;
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

  // 이번 주(오늘이 든 주)에는 옅은 띠를 깐다
  const today = parseDateKey(todayKey);
  // 달력이 일요일부터 놓이므로 띠도 일요일~토요일이다 (startOfWeek는 월요일 기준이라 쓰지 않는다)
  const weekStartMs = addDays(today, -today.getDay()).getTime();
  const weekEndMs = addDays(today, 7 - today.getDay()).getTime();
  const countByDay = new Map<string, number>();
  for (const day of calendarDays) {
    const key = localDateKey(day);
    countByDay.set(key, monthEvents.filter((event) => eventCoversDay(event, day)).length + (overlaysByDate.get(key)?.length ?? 0));
  }

  return (
    <section className="dash-sec dash-bento-card dash-cal-card min-w-0" style={stagger(0)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="flex items-baseline gap-1.5 text-[18px] leading-6 font-semibold tracking-[-0.02em] text-foreground tabular-nums">
          {`${viewMonth.month + 1}월`}
          <span className="text-xs font-normal tracking-normal text-muted-foreground">{viewMonth.year}</span>
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
        {WEEKDAYS.map((day, index) => (
          <span key={day} className={cn(index === 0 && 'is-sun', index === 6 && 'is-sat')}>
            {day}
          </span>
        ))}
      </div>

      <div className="dash-cal-grid" role="group" aria-label="월간 달력">
        {calendarDays.map((day) => {
          const key = localDateKey(day);
          const count = countByDay.get(key) ?? 0;
          const isOut = day.getMonth() !== viewMonth.month;
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const inWeek = day.getTime() >= weekStartMs && day.getTime() < weekEndMs;
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
                day.getTime() < today.getTime() && 'is-past',
                day.getDay() === 0 && 'is-sun',
                day.getDay() === 6 && 'is-sat',
                inWeek && 'in-week',
              )}
            >
              <span className="dash-cal-num">{day.getDate()}</span>
              {/* 일정 수만큼 점(셋까지) — 바쁜 날이 구분된다 */}
              <span className="dash-cal-dots" aria-hidden="true">
                {Array.from({ length: Math.min(count, 3) }, (_, dot) => (
                  <i key={dot} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 다가오는 일정에서 줄로 보이는 수. 나머지는 '더 보기'로 캘린더에서 본다. */
const UPCOMING_SHOWN = 5;

/**
 * 계약일 · 대금일 · 수금예정 한 줄을 눌렀을 때 갈 곳. 캘린더를 거치지 않고 그 날짜가 나온 원본(계약 · 거래 · 수금)으로 바로 간다
 * (예전에는 캘린더의 그 날로만 가서, 거기서 줄을 다시 찾아 누르고 '원본 열기'를 또 눌러야 했다).
 * 갈 곳은 캘린더의 '원본 열기'와 같다. 수금 원장은 대표 · 매니저만 보므로 중개사는 그 거래로 보낸다.
 */
function OverlaySourceLink({
  item,
  canSeeLedger,
  className,
  children,
}: {
  item: OverlayItem;
  canSeeLedger: boolean;
  className: string;
  children: ReactNode;
}) {
  const source = item.source;
  if (source.type === 'contract') {
    return (
      <Link to="/contracts" search={{ editorContractId: source.contract.id }} className={className}>
        {children}
      </Link>
    );
  }
  if (source.type === 'dealPayment') {
    return (
      <Link to="/deals" search={{ dealId: source.deal.id }} className={className}>
        {children}
      </Link>
    );
  }
  if (canSeeLedger) {
    return (
      <Link
        to="/cashflow/ledger"
        search={{ deal: source.payment.dealId, payment: source.payment.id }}
        className={className}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link to="/deals" search={{ dealId: source.payment.dealId }} className={className}>
      {children}
    </Link>
  );
}

type UpcomingItem =
  | { kind: 'event'; event: CalendarEvent; at: number }
  | { kind: 'overlay'; item: OverlayItem; at: number };

function ScheduleCard({
  scope,
  userId,
  canSeeLedger,
  eventsQuery,
  monthEvents,
  overlaysByDate,
  selectedDate,
  selectedKey,
  todayKey,
  now,
}: {
  scope: Scope;
  userId: string | undefined;
  /** 수금예정을 수금 원장으로 열 수 있는가 (대표 · 매니저) */
  canSeeLedger: boolean;
  eventsQuery: ReturnType<typeof useMonthEventsQuery>;
  monthEvents: CalendarEvent[];
  /** 계약일·중도금일·잔금일·수금예정 — 캘린더에 보이는 것과 같은 날짜 */
  overlaysByDate: Map<string, OverlayItem[]>;
  selectedDate: Date;
  selectedKey: string;
  todayKey: string;
  now: Date;
}) {
  const view = queryView(eventsQuery);
  const dayOverlays = overlaysByDate.get(selectedKey) ?? [];
  const spansDay = (event: CalendarEvent) => event.allDay || startedBefore(event, selectedDate);
  const dayEvents = monthEvents
    .filter((event) => eventCoversDay(event, selectedDate))
    .sort((a, b) => Number(spansDay(b)) - Number(spansDay(a)) || byDateAsc(a.start, b.start));

  const afterSelectedMs = addDays(selectedDate, 1).getTime();
  const rangeEndMs = addDays(selectedDate, 15).getTime();
  // 다가오는 2주. 계약·잔금 같은 날짜도 같이 세운다. 건수는 전부 세고, 줄은 앞의 몇 개만 보인 뒤 '더 보기'로 캘린더에 넘긴다
  // (같은 날 일정이 몇 개 앞에 있으면 주말 임장이 잘려 보이지 않던 것을 막는다).
  const upcomingItems: UpcomingItem[] = [
    ...monthEvents
      .filter((event) => {
        const at = new Date(event.start).getTime();
        // 매칭이 임장을 지났거나 거래가 끝난 일정은 앞으로 할 일이 아니다(캘린더에는 흐리게 남는다)
        return at >= afterSelectedMs && at < rangeEndMs && !getEventSuperseded(event, now);
      })
      .map((event): UpcomingItem => ({ kind: 'event', event, at: new Date(event.start).getTime() })),
    ...[...overlaysByDate.entries()].flatMap(([key, items]) => {
      const at = parseDateKey(key).getTime();
      // 받은 대금 · 정산 끝난 거래의 날짜는 앞으로 할 일이 아니다(캘린더에는 흐리게 남는다)
      return at >= afterSelectedMs && at < rangeEndMs
        ? items.filter((item) => !item.done).map((item): UpcomingItem => ({ kind: 'overlay', item, at }))
        : [];
    }),
  ]
    .sort((a, b) => a.at - b.at);
  const upcomingEvents = upcomingItems.slice(0, UPCOMING_SHOWN);
  const upcomingHidden = upcomingItems.length - upcomingEvents.length;

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
      <div className="dash-sched-part">
        <SectionHead
          icon={CalendarDays}
          title={`${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 (${WEEKDAYS[selectedDate.getDay()]})${isToday ? ' · 오늘' : ''}`}
          count={
            view === 'ready'
              ? dayEvents.filter((event) => !isEventMoot(event, now)).length + dayOverlays.length
              : undefined
          }
          action={
            // 달력에서 고른 날로 캘린더를 연다(예전에는 늘 캘린더가 마지막에 보던 날로 열려 고른 날을 다시 찾아야 했다)
            <Link to="/calendar" search={isToday ? {} : { date: selectedKey }} className={MORE_LINK_CLASS}>
              캘린더
              <MoreArrow />
            </Link>
          }
          divided
        />
        {status ??
          (dayEvents.length === 0 && dayOverlays.length === 0 ? (
            <div className="flex items-center justify-between gap-2">
              <EmptyNote>
                {isToday ? '오늘 잡힌 일정이 없습니다.' : '이 날 잡힌 일정이 없습니다.'}
              </EmptyNote>
              {/* 빈 날에서 바로 그 날의 일정을 잡는다 — 캘린더의 새 일정 창이 이 날짜로 열린다 */}
              <Link to="/calendar" search={{ date: selectedKey, new: true }} className={MORE_LINK_CLASS}>
                <Plus className="size-3" aria-hidden="true" />
                일정 추가
              </Link>
            </div>
          ) : (
            <div className="dash-scroll">
            <ol className="dash-timeline">
              {dayOverlays.map((item) => (
                <li key={item.id} className="relative">
                  <span
                    className={cn('dash-tl-dot', item.kind !== 'commissionDue' && 'is-contract')}
                    aria-hidden="true"
                  />
                  <OverlaySourceLink
                    item={item}
                    canSeeLedger={canSeeLedger}
                    // 받은 대금 · 정산 끝난 거래의 날짜는 흐리게(그 날 있었던 일로는 남긴다)
                    className={cn(
                      'dash-tl-item focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      item.done && 'opacity-55',
                    )}
                  >
                    <span className="w-[46px] shrink-0 pt-px text-[11px] leading-5 font-semibold tracking-[-0.02em] whitespace-nowrap text-foreground">
                      {OVERLAY_META[item.kind].label}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] leading-5 font-medium text-foreground">
                        {item.title.replace(`${OVERLAY_META[item.kind].label} · `, '')}
                      </span>
                      {item.sublabel && (
                        <span className="block truncate text-[11.5px] leading-4 text-muted-foreground tabular-nums">
                          {item.sublabel}
                        </span>
                      )}
                    </span>
                  </OverlaySourceLink>
                </li>
              ))}
              {dayEvents.map((event, index) => {
                const meta = [
                  formatEventPlace(event),
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
                        search={{ date: selectedKey, event: event.id }}
                        className="dash-tl-item focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span className="w-[46px] shrink-0 pt-px text-xs leading-5 font-semibold text-foreground tabular-nums">
                          {eventTimeLabel(event, selectedDate)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] leading-5 font-medium text-foreground">
                            <EventTitle event={event} now={now} />
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
            </div>
          ))}
      </div>

      <div className="dash-sched-part border-t border-border pt-3.5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">다가오는 일정</h3>
          {view === 'ready' && upcomingItems.length > 0 && (
            <span className="text-[11.5px] text-muted-foreground/80 tabular-nums">2주 · {upcomingItems.length}건</span>
          )}
        </div>
        {view !== 'ready' ? (
          <p className="px-1 py-1 text-xs text-muted-foreground/75">
            {view === 'pending' ? '불러오는 중입니다.' : '일정을 불러오면 여기에 표시됩니다.'}
          </p>
        ) : upcomingEvents.length === 0 ? (
          <EmptyNote>예정된 다가오는 일정이 없습니다.</EmptyNote>
        ) : (
          <ul className="dash-scroll flex flex-col gap-0.5">
            {upcomingEvents.map((entry) => {
              if (entry.kind === 'overlay') {
                const { item } = entry;
                return (
                  <li key={item.id}>
                    <OverlaySourceLink
                      item={item}
                      canSeeLedger={canSeeLedger}
                      className="flex items-start gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-foreground/[0.045] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span className="w-[52px] shrink-0 pt-0.5 text-[11.5px] font-semibold text-muted-foreground tabular-nums">
                        {upcomingDayLabel(parseDateKey(item.dateKey).toISOString(), now)}
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-[6px] size-1.5 shrink-0 rounded-full',
                          item.kind === 'commissionDue' ? 'bg-success' : 'bg-violet',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] leading-[1.35] font-medium text-foreground">
                          {item.title}
                        </span>
                        {item.sublabel && (
                          <span className="block truncate text-[11px] leading-4 text-muted-foreground tabular-nums">
                            {item.sublabel}
                          </span>
                        )}
                      </span>
                    </OverlaySourceLink>
                  </li>
                );
              }
              const { event } = entry;
              const eventStart = new Date(event.start);
              const dotTone = eventDotTone(event.type);
              const meta = [
                event.allDay ? '종일' : clockLabel(eventStart),
                formatEventPlace(event) || event.contact?.name,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={event.id}>
                  <Link
                    to="/calendar"
                    search={{ date: localDateKey(eventStart), event: event.id }}
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
                        <EventTitle event={event} now={now} />
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
            {upcomingHidden > 0 && (
              <li>
                <Link
                  to="/calendar"
                  search={{ date: localDateKey(new Date(upcomingItems[UPCOMING_SHOWN].at)) }}
                  className="mt-0.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.045] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {upcomingHidden}건 더 보기
                  <ArrowRight className="size-3" aria-hidden="true" />
                </Link>
              </li>
            )}
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
  { key: 'overdue', label: '지남' },
  { key: 'today', label: '오늘' },
  { key: 'upcoming', label: '다가옴' },
];


/** 기한 알약의 색: 지남 빨강 · 오늘 노랑 · 그 밖 회색. 프로젝트 · 희망매물의 점 알약과 같은 값이다. */
const DUE_PILL_CLASS: Record<'late' | 'today' | 'later', { pill: string; dot: string }> = {
  late: { pill: 'bg-[#fdebec] text-[#b0423a]', dot: 'bg-[#e16259]' },
  today: { pill: 'bg-[#fbf3db] text-[#9f6b00]', dot: 'bg-[#dfab01]' },
  later: { pill: 'bg-[#f1f1ef] text-[#787774]', dot: 'bg-[#b4b4b1]' },
};

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
}: {
  scope: Scope;
  userId: string | undefined;
  tasks: ReturnType<typeof useTasksQuery>;
  openTasks: Task[];
  now: Date;
  /** 바뀔 때마다 그 탭을 고르고 탭으로 포커스를 옮긴다 (인사 영역의 알약). focus가 false면 탭만 고른다. */
  reveal: { bucket: TaskBucket; n: number; focus?: boolean } | null;
  /** 완료가 저장됐을 때 불린다 (해가 뛰고 반짝이가 튄다) */
  onCheer: () => void;
}) {
  const queryClient = useQueryClient();
  // 방금 완료를 누른 줄. 체크 상자에서 반짝이가 한 번 튄다.
  const [burst, setBurst] = useState<{ id: string; n: number } | null>(null);
  // 고른 탭. 고르기 전에는 일이 있는 첫 탭(지남 → 오늘 → 다가옴)을 보인다.
  const [pickedTab, setPickedTab] = useState<TaskBucket | null>(null);
  const [draft, setDraft] = useState('');
  const tabRefs = useRef<Partial<Record<TaskBucket, HTMLButtonElement | null>>>({});
  const selectTab = (bucket: TaskBucket) => setPickedTab(bucket);
  useEffect(() => {
    if (!reveal) return;
    setPickedTab(reveal.bucket);
    if (reveal.focus === false) return;
    const tabButton = tabRefs.current[reveal.bucket];
    tabButton?.focus();
    tabButton?.scrollIntoView({ block: 'nearest' });
  }, [reveal]);
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  // 되돌리기는 바꾸기 전의 값으로 다시 저장한다.
  const restore = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { status?: string; dueDate?: string | null } }) =>
      api.tasks.update(id, patch),
    onError: (error) => toast.error(apiErrorMessage(error, '되돌리지 못했습니다. 다시 시도해 주세요.')),
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
    onError: (error) => toast.error(apiErrorMessage(error, '업무를 완료하지 못했습니다. 다시 시도해 주세요.')),
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
    onError: (error) => toast.error(apiErrorMessage(error, '기한을 미루지 못했습니다. 다시 시도해 주세요.')),
    onSettled: invalidate,
  });
  // 엔터를 연달아 쳐도 한 건만 만든다 (isPending은 다음 그리기에야 바뀐다)
  const creatingRef = useRef(false);
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
      // 방금 적은 업무가 보이게 '오늘' 탭으로 옮긴다. '지남' 탭을 보던 채로 두면 적은 것이 어디로 갔는지 안 보인다.
      setPickedTab('today');
      toast.success('오늘 업무에 추가했습니다', { description: title });
    },
    onError: (error) => toast.error(apiErrorMessage(error, '업무를 추가하지 못했습니다. 다시 시도해 주세요.')),
    onSettled: () => {
      creatingRef.current = false;
      invalidate();
    },
  });

  const view = queryView(tasks);
  const mine = scope === 'mine' && Boolean(userId);
  const groups: Record<TaskBucket, Task[]> = { overdue: [], today: [], upcoming: [] };
  for (const task of openTasks) groups[taskBucket(task)].push(task);
  const activeTab: TaskBucket =
    pickedTab ?? TASK_TABS.find((item) => groups[item.key].length > 0)?.key ?? 'today';
  const activeList = groups[activeTab];
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
      // 걸린 일이 끝났으면 알려 둔다(업무를 알아서 닫지는 않는다)
      ...taskEndedTags(task),
    ]
      .filter(Boolean)
      .join(' · ');
    const dueLabel = !task.dueDate
      ? '마감일 없음'
      : bucket === 'overdue' && days != null
        ? // 업무 화면과 같은 말: 하루 지난 것은 '어제'
          days === -1
          ? '어제'
          : `${Math.abs(days)}일 지남`
        : days === 0
          ? '오늘'
          : days === 1
            ? '내일'
            : formatRelativeDay(task.dueDate, now);
    const dueTone = DUE_PILL_CLASS[bucket === 'overdue' ? 'late' : days === 0 ? 'today' : 'later'];
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
        {/* 한 줄: 제목 뒤에 곁 정보(매물 · 고객 · 담당)를 흐리게 잇는다. 좁으면 곁 정보가 먼저 줄어든다. */}
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <Link
            to="/tasks"
            search={{ task: task.id }}
            className="min-w-0 shrink truncate text-[14px] leading-[21px] font-[450] text-foreground hover:underline"
          >
            {task.title}
          </Link>
          {meta && (
            <span className="min-w-0 flex-1 basis-0 truncate text-[12.5px] leading-[21px] text-muted-foreground">
              {meta}
            </span>
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
            'inline-flex h-5 shrink-0 items-center gap-[5px] rounded-full pl-[7px] pr-[9px] text-[13px] leading-5 font-[450] whitespace-nowrap tabular-nums',
            dueTone.pill,
          )}
        >
          <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', dueTone.dot)} />
          {dueLabel}
        </span>
      </li>
    );
  };

  return (
    <section className="dash-sec dash-bento-card dash-center-card dash-tasks-card min-w-0" style={stagger(1)}>
      <header className="mb-1.5 flex min-h-8 items-center gap-2">
        <ListTodo className="size-4 shrink-0 text-sidebar-icon" strokeWidth={1.6} aria-hidden="true" />
        <h2 className="shrink-0 text-[14px] leading-6 font-semibold text-foreground">
          {/* '사무소 전체'일 때는 다른 직원의 업무도 섞여 있다 */}
          {mine ? '내 할 일' : '사무소 할 일'}
        </h2>
        {/* 지남 · 오늘 · 다가옴은 접는 묶음이 아니라 탭이다. 한 번에 한 묶음만 보여 카드가 길어지지 않는다. */}
        <div role="group" aria-label="할 일 나누기" className="dash-tabs ml-1">
          {TASK_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={activeTab === item.key}
              ref={(element) => {
                tabRefs.current[item.key] = element;
              }}
              onClick={() => selectTab(item.key)}
              className="dash-tab focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {item.label}
              {view === 'ready' && <span className="tabular-nums">{groups[item.key].length}</span>}
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="dash-scope-caption">{mine ? '내 담당 기준' : '사무소 전체 기준'}</span>
          <MoreLink to="/tasks">업무</MoreLink>
        </div>
      </header>
      {status ?? (
        <>
          {activeList.length === 0 ? (
            <EmptyNote>{openTasks.length === 0 ? (mine ? '남은 내 업무가 없습니다.' : '남은 업무가 없습니다.') : emptyText[activeTab]}</EmptyNote>
          ) : (
            // 탭의 일을 모두 싣고 카드 안에서 굴린다. 탭을 바꾸면 맨 위에서 시작하도록 key를 준다.
            <ul key={activeTab} className="dash-scroll flex flex-col">
              {activeList.map(row)}
            </ul>
          )}
          <form
            className="dash-todo-add"
            onSubmit={(event) => {
              event.preventDefault();
              const title = draft.trim();
              if (creatingRef.current) return;
              if (title && !create.isPending) create.mutate(title);
              if (title) creatingRef.current = true;
            }}
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="새 업무 적고 Enter"
              aria-label="오늘 업무 추가"
              autoComplete="off"
              className="h-6 min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground/75"
            />
          </form>
        </>
      )}
    </section>
  );
}

/* -------------------------------- 처음 할 일 -------------------------------- */

interface SetupStep {
  key: 'sites' | 'properties' | 'contacts';
  title: string;
  desc: string;
  done: boolean;
  link: ReactNode;
}

/**
 * 새 사무소의 '처음 할 일'. 저장하지 않고 지금 데이터에서 센다(각 목록의 건수).
 * 매물·연락처 가운데 하나라도 비어 있을 때만 보이고, 다 채우면 사라진다.
 * 관리단지는 순서상 첫 단계라 함께 보이지만, 그것만 비었다고 이 칸을 띄우지는 않는다
 * (단독주택·토지만 다루는 사무소는 관리단지 없이도 일한다).
 * 직원 추가는 넣지 않는다. 혼자 일하는 대표에게는 끝나지 않는 할 일이 된다.
 */
function useSetupProgress() {
  const sites = useQuery({ queryKey: ['office-sites'], queryFn: () => api.officeSites.findAll(), staleTime: 60_000 });
  const properties = useQuery({
    queryKey: ['properties', 'dashboard-setup'],
    queryFn: () => api.properties.findAll({ limit: 1 }),
    staleTime: 60_000,
  });
  const contacts = useQuery({
    queryKey: ['contacts', 'dashboard-setup'],
    queryFn: () => api.contacts.findAll({ limit: 1 }),
    staleTime: 60_000,
  });
  const queries = [sites, properties, contacts];
  // 하나라도 못 불러왔으면 띄우지 않는다 (모르는 것을 '아직 안 함'으로 보이지 않게)
  if (queries.some((query) => !query.data)) return null;
  return {
    sites: (sites.data?.length ?? 0) > 0,
    properties: (properties.data?.pagination.total ?? 0) > 0,
    contacts: (contacts.data?.pagination.total ?? 0) > 0,
  };
}

function SetupSection() {
  const progress = useSetupProgress();
  if (!progress || (progress.properties && progress.contacts)) return null;

  const linkClass =
    'inline-flex h-[26px] shrink-0 items-center gap-[3px] rounded-md px-[7px] text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.045] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';
  const arrow = <ArrowRight className="size-3" aria-hidden="true" />;
  const steps: SetupStep[] = [
    {
      key: 'sites',
      title: '관리단지 고르기',
      desc: '우리 사무소가 다루는 아파트·건물을 고릅니다. 매물과 광고가 이 단지에 붙습니다.',
      done: progress.sites,
      link: (
        <Link to="/sites" className={linkClass}>
          단지 고르기{arrow}
        </Link>
      ),
    },
    {
      key: 'properties',
      title: '매물 등록',
      desc: '관리하는 호실을 매물로 올리고 매매·전세·월세 조건을 적습니다.',
      done: progress.properties,
      link: (
        <Link to="/properties/new" className={linkClass}>
          매물 등록{arrow}
        </Link>
      ),
    },
    {
      key: 'contacts',
      title: '연락처 추가',
      desc: '집주인·손님 연락처를 넣어 두면 상담과 매물에 바로 연결됩니다.',
      done: progress.contacts,
      link: (
        <Link to="/contacts/new" className={linkClass}>
          연락처 추가{arrow}
        </Link>
      ),
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  // 다음에 할 단계. 화면 높이에 맞춰 줄일 때는 이 단계의 설명만 남긴다(-dashboard.css의 .dash-setup-desc).
  const nextKey = steps.find((step) => !step.done)?.key;

  return (
    <section className="dash-sec dash-bento-card dash-center-card dash-setup min-w-0" style={stagger(0)} aria-labelledby="dash-setup-title">
      <header className="mb-1 flex min-h-8 items-center gap-2 border-b border-border pb-2">
        <ListChecks className="size-4 shrink-0 text-sidebar-icon" strokeWidth={1.6} aria-hidden="true" />
        <h2 id="dash-setup-title" className="text-[15.5px] leading-6 font-bold tracking-[-0.02em] text-foreground">
          처음 할 일
        </h2>
        <span className="text-xs text-muted-foreground/80 tabular-nums">
          {steps.length}개 중 {doneCount}개 마침
        </span>
      </header>
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={cn(
              'flex items-start gap-3 border-b border-border/70 px-1.5 py-2.5 last:border-b-0',
              step.key === nextKey && 'is-next',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-px grid size-[18px] shrink-0 place-items-center rounded-full text-[10.5px] font-semibold tabular-nums',
                step.done
                  ? 'bg-success text-white'
                  : 'text-muted-foreground shadow-[inset_0_0_0_1.5px_rgb(55_53_47_/_0.22)]',
              )}
            >
              {step.done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-[13.5px] leading-5 font-medium',
                  step.done ? 'text-muted-foreground' : 'text-foreground',
                )}
              >
                {step.title}
                <span className="sr-only">{step.done ? ' (마침)' : ' (아직 안 함)'}</span>
              </p>
              {!step.done && (
                <p className="dash-setup-desc mt-0.5 text-xs leading-[1.5] text-muted-foreground">{step.desc}</p>
              )}
            </div>
            {!step.done && step.link}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* -------------------------------- 현재 상황 -------------------------------- */

interface GaugeStat {
  key: 'match' | 'going' | 'done';
  label: string;
  /** 아직 모르면 null (불러오는 중 · 오류) */
  value: number | null;
  /** 호의 끝에서 호박색으로 보일 건수 (정체 · 지연된 거래) */
  flag?: number;
  sub: string | null;
  subWarn?: boolean;
  to: LinkProps['to'];
}

/** 270° 눈금판의 한 점. f는 0~1, r은 반지름 */
function gaugePoint(f: number, r: number): [number, number] {
  const angle = ((135 + 270 * f) * Math.PI) / 180;
  return [60 + r * Math.cos(angle), 60 + r * Math.sin(angle)];
}

const GAUGE_ARC = (() => {
  const [sx, sy] = gaugePoint(0, 44);
  const [ex, ey] = gaugePoint(1, 44);
  return `M${sx.toFixed(2)} ${sy.toFixed(2)} A44 44 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
})();

/** 계기 하나: 값만큼 호가 차오르고 끝에 바늘 점이 선다. 세 계기가 같은 눈금(scale)을 써서 호의 길이로 견줄 수 있다. */
function Gauge({ stat, scale, order }: { stat: GaugeStat; scale: number; order: number }) {
  const value = stat.value ?? 0;
  const full = Math.min(1, value / scale);
  const calm = Math.min(1, Math.max(0, value - (stat.flag ?? 0)) / scale);
  const tickCount = Math.min(scale * 2, 48);
  const [capX, capY] = gaugePoint(full, 44);
  const [startX, startY] = gaugePoint(0, 34);
  const [endX, endY] = gaugePoint(1, 34);
  return (
    <Link
      to={stat.to}
      className={cn('dash-gauge focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', `is-${stat.key}`)}
      style={{ '--i': order } as CSSProperties}
    >
      <svg viewBox="0 0 120 112" role="img" aria-label={stat.value === null ? stat.label : `${stat.label} ${stat.value}건`}>
        {Array.from({ length: tickCount + 1 }, (_, tick) => {
          const f = tick / tickCount;
          const [x1, y1] = gaugePoint(f, 51);
          const [x2, y2] = gaugePoint(f, tick % 2 ? 53.5 : 55.5);
          return (
            <line
              key={tick}
              className={cn('tk', f <= calm + 0.001 ? 'lit' : f <= full + 0.001 && 'amber')}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
            />
          );
        })}
        <path className="trk" d={GAUGE_ARC} pathLength={100} />
        {stat.flag ? <path className="flag" d={GAUGE_ARC} pathLength={100} strokeDasharray={`${full * 100} 100`} /> : null}
        <path className="val" d={GAUGE_ARC} pathLength={100} strokeDasharray={`${calm * 100} 100`} />
        {stat.value !== null && <circle className={cn('cap', stat.flag ? 'amber' : null)} cx={capX} cy={capY} r={4.5} />}
        <text className="n" x={60} y={68} textAnchor="middle">
          {stat.value ?? '–'}
        </text>
        <text className="u" x={60} y={82} textAnchor="middle">
          건
        </text>
        <text className="sc" x={startX} y={startY + 8} textAnchor="middle">
          0
        </text>
        <text className="sc" x={endX} y={endY + 8} textAnchor="middle">
          {scale}
        </text>
      </svg>
      <span className="dash-gauge-name">{stat.label}</span>
      <span className={cn('dash-gauge-sub', stat.subWarn && 'is-warn')}>{stat.sub ?? ' '}</span>
    </Link>
  );
}

/**
 * 현재 상황: 일이 흘러가는 순서대로 계기 셋 — 매칭 중 → 거래 진행 → 거래 완료(이번 달).
 * 실적 지표가 아니라 지금 손에 든 일의 수다. 거래 하나하나는 계기를 눌러 그 화면에서 본다.
 * '내 담당'이면 거래는 내가 담당인 것만 센다. 매칭에는 담당이 없어 사무소 전체를 센다.
 */
function StatusSection({
  deals,
  matches,
  scope,
  userId,
  now,
}: {
  deals: ReturnType<typeof useDealsQuery>;
  matches: ReturnType<typeof useMatchesQuery>;
  scope: Scope;
  userId: string | undefined;
  now: Date;
}) {
  const view = queryView(deals);
  const mine = scope === 'mine' && Boolean(userId);
  const assigned = mine && userId ? assignedDealIds(deals.data ?? [], userId) : null;
  const scoped = (deals.data ?? []).filter((deal) => !assigned || assigned.has(deal.id));
  const active = scoped.filter(isActiveDeal);
  const atRisk = active.filter((deal) => getDealPipelineHealth(deal, now).state !== 'healthy').length;
  const monthStartMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const doneThisMonth = scoped.filter(
    (deal) =>
      !deal.isCancelled &&
      getDealDisplayGroupKey(deal.stage) === 'closed' &&
      new Date(deal.stageChangedAt).getTime() >= monthStartMs,
  ).length;

  const matchesReady = queryView(matches) === 'ready';
  const openMatchCount = matches.data?.open ?? 0;
  const viewingsAhead = matches.data?.viewingsAhead ?? 0;

  const stats: GaugeStat[] = [
    {
      key: 'match',
      label: '매칭 중',
      value: matchesReady ? openMatchCount : null,
      sub: matchesReady && viewingsAhead > 0 ? `임장 예정 ${viewingsAhead}` : null,
      to: '/wanted-properties',
    },
    {
      key: 'going',
      label: '거래 진행',
      value: active.length,
      flag: atRisk,
      sub: atRisk > 0 ? `정체·지연 ${atRisk}` : null,
      subWarn: true,
      to: '/deals',
    },
    { key: 'done', label: '거래 완료', value: doneThisMonth, sub: '이번 달', to: '/deals' },
  ];
  // 가장 큰 값보다 넉넉한 4의 배수를 눈금 끝으로 쓴다
  const scale = Math.max(4, Math.ceil((Math.max(...stats.map((stat) => stat.value ?? 0)) * 1.2) / 4) * 4);
  const status = statusBody(view, () => void deals.refetch(), 2);

  return (
    <section className="dash-sec dash-bento-card dash-side-card dash-status-card min-w-0" style={stagger(2)}>
      <SectionHead icon={Home} title="현재 상황" />
      {status ?? (
        <div className="dash-cluster">
          {stats.map((stat, index) => (
            <Gauge key={stat.key} stat={stat} scale={scale} order={index} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ----------------------------- 최근 상담 내역 ----------------------------- */

const CHANNEL_ICON: Record<ConsultationChannelKind, LucideIcon> = {
  inbound: PhoneIncoming,
  outbound: PhoneOutgoing,
  phone: Phone,
  visit: MapPin,
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

const CONSULT_STATUS_TEXT: Record<Exclude<ConsultationRowStatus['tone'], 'none'>, string> = {
  todo: 'text-destructive-strong',
  busy: 'text-info-strong',
  failed: 'text-destructive-strong',
  done: 'text-muted-foreground',
  quiet: 'text-muted-foreground',
};

type TalkEntry = { kind: 'talk'; item: Consultation } | { kind: 'confirm'; items: Consultation[] };

/** 접힌 매물 확인 묶음의 한 줄: "매물 확인 3건 — 유효함 2 · 부재중 1" */
function confirmSummary(items: Consultation[]): string {
  const counts = new Map<string, number>();
  let head = '';
  for (const item of items) {
    const [name, result] = (splitConsultationTag(item.content).tag ?? '').split(' · ');
    head ||= name;
    if (result) counts.set(result, (counts.get(result) ?? 0) + 1);
  }
  const parts = [...counts].map(([result, count]) => `${result} ${count}`).join(' · ');
  return parts ? `${head} ${items.length}건 — ${parts}` : `${head} ${items.length}건`;
}

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
  onFollowUpCreated,
}: {
  scope: Scope;
  userId: string | undefined;
  consultations: ReturnType<typeof useRecentConsultationsQuery>;
  now: Date;
  /** '다음 업무 추가'가 저장됐을 때 — 할 일 카드를 그 업무가 있는 '오늘' 탭으로 옮긴다 */
  onFollowUpCreated?: () => void;
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
        title: `${who} 상담 뒤 다시 연락`,
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
      toast.success('다음 업무를 추가했습니다', {
        description: `${consultation.contact?.name ?? '고객'} 상담 · 오늘 할 일에 넣었습니다`,
      });
      setSelected(null);
      onFollowUpCreated?.();
    },
    onError: (error) => toast.error(apiErrorMessage(error, '다음 업무를 추가하지 못했습니다. 다시 시도해 주세요.')),
  });

  const view = queryView(consultations);
  const items = consultations.data?.items ?? [];
  const totalCount = consultations.data?.pagination?.total;
  const status = statusBody(view, () => void consultations.refetch(), 3);

  // 날짜로 묶는다(오늘 · 어제 · 그 전). 매물 확인으로 생긴 짧은 기록은 그 날의 한 묶음으로 접는다.
  const dayGroups: Array<{ label: string; entries: TalkEntry[] }> = [];
  for (const item of items) {
    const label = formatConsultationDay(item.createdAt, now);
    let group = dayGroups[dayGroups.length - 1];
    if (!group || group.label !== label) {
      group = { label, entries: [] };
      dayGroups.push(group);
    }
    if (splitConsultationTag(item.content).tag) {
      const fold = group.entries.find((entry) => entry.kind === 'confirm');
      if (fold?.kind === 'confirm') fold.items.push(item);
      else group.entries.push({ kind: 'confirm', items: [item] });
    } else {
      group.entries.push({ kind: 'talk', item });
    }
  }
  const [openFolds, setOpenFolds] = useState<ReadonlySet<string>>(new Set());
  const toggleFold = (key: string) =>
    setOpenFolds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [writing, setWriting] = useState(false);

  const selectedChannel = selected ? getConsultationChannel(selected) : null;
  const selectedProperty = selected ? getConsultationPropertyLabel(selected) : null;
  const selectedPhone = selected?.contact?.phone ? formatPhone(selected.contact.phone) : null;
  const selectedAiSummary = selected?.callRecording?.summary?.trim();

  return (
    <section ref={sectionRef} className="dash-sec dash-bento-card dash-center-card dash-consult-card min-w-0" style={stagger(3)}>
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
          <div className="dash-scroll">
            {dayGroups.map((group) => (
              <Fragment key={group.label}>
                <div className="dash-talk-day">{group.label}</div>
                {group.entries.map((entry) => {
                  if (entry.kind === 'confirm') {
                    const [first] = entry.items;
                    const foldKey = `${group.label}:${first.id}`;
                    const open = entry.items.length === 1 || openFolds.has(foldKey);
                    return (
                      <Fragment key={foldKey}>
                        {entry.items.length > 1 && (
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => toggleFold(foldKey)}
                            className="dash-talk-fold focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            <span className="dash-talk-ico is-line" aria-hidden="true">
                              <Check className="size-3.5" />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{confirmSummary(entry.items)}</span>
                            <ChevronRight
                              className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
                              aria-hidden="true"
                            />
                          </button>
                        )}
                        {open &&
                          entry.items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={(event) => {
                                openerRef.current = event.currentTarget;
                                setSelected(item);
                              }}
                              className={cn(
                                'dash-consult-row is-fold focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                                entry.items.length > 1 && 'is-nested',
                              )}
                            >
                              {entry.items.length === 1 && (
                                <span className="dash-talk-ico is-line" aria-hidden="true">
                                  <Check className="size-3.5" />
                                </span>
                              )}
                              <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground-strong">
                                {getConsultationSummaryLine(item).text}
                                <span className="text-muted-foreground"> · {item.contact?.name ?? '미연결 고객'}</span>
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                {formatConsultationClock(item.createdAt)}
                              </span>
                            </button>
                          ))}
                      </Fragment>
                    );
                  }
                  const { item } = entry;
                  const channel = getConsultationChannel(item);
                  const ChannelIcon = CHANNEL_ICON[channel.kind];
                  const rowStatus = getConsultationRowStatus(item);
                  const summaryLine = getConsultationSummaryLine(item);
                  const metaTail = [
                    getConsultationPropertyLabel(item),
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
                      {/* 수단(전화 · 방문 · 문자)은 색 꼬리표가 아니라 회색 아이콘 — 이름을 먼저 읽게 한다 */}
                      <span className="dash-talk-ico" title={channel.label}>
                        <ChannelIcon className="size-3.5" aria-label={channel.label} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className="shrink-0 text-sm font-semibold text-foreground">
                            {item.contact?.name ?? '미연결 고객'}
                          </span>
                          {metaTail && <span className="min-w-0 truncate text-xs text-muted-foreground">· {metaTail}</span>}
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                            {formatConsultationClock(item.createdAt)}
                          </span>
                        </span>
                        <span className="dash-talk-text">
                          {summaryLine.fromAi && (
                            <SparklesIcon className="mr-1 inline size-3 -translate-y-px text-info" aria-label="AI 요약" />
                          )}
                          {summaryLine.text || '기록된 상담 메모가 없습니다.'}
                        </span>
                        {rowStatus.tone !== 'none' && (
                          <span title={rowStatus.hint} className={cn('dash-talk-next', CONSULT_STATUS_TEXT[rowStatus.tone])}>
                            <ArrowRight className="size-3" aria-hidden="true" />
                            {rowStatus.label}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        ))}

      {/* 전화를 받으며 바로 적는다 — 화면을 옮기지 않고 이 자리에서 창을 연다 (빠른 등록의 '상담 적기'와 같은 창) */}
      <button
        type="button"
        onClick={() => setWriting(true)}
        className="dash-talk-add focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Plus className="size-4" aria-hidden="true" />
        상담 적기
      </button>
      <ConsultationFormDialog open={writing} onOpenChange={setWriting} />

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
              {/* 상담 뒤 다음 일은 대개 그 사람에게 이어진다(다시 전화, 희망 조건, 매물 연결) — 연락처로 바로 간다 */}
              {selected.contactId && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/contacts/$id" params={{ id: selected.contactId }}>
                    연락처 열기
                  </Link>
                </Button>
              )}
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
                {createFollowUp.isPending ? '추가 중…' : '다음 업무 추가'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

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

/**
 * 소식 카드: 공지사항과 부동산 뉴스를 한 카드에서 탭으로 본다 (2026-11-23).
 * 예전에는 카드 둘이었고, 좁은 화면에서는 둘 다 숨긴 채 할 일 머리의 "공지 · 가이드" 단추로만 열었다.
 */
function NoticeSection({
  notices,
  reader,
  sectionRef,
}: {
  notices: ReturnType<typeof useNoticesQuery>;
  reader: ReturnType<typeof useNoticeReader>;
  sectionRef: React.RefObject<HTMLElement | null>;
}) {
  const [feed, setFeed] = useState<'notice' | 'news'>('notice');
  const { view, items, unread, openNotice } = reader;
  const status = statusBody(view, () => void notices.refetch(), 3);

  return (
    <section ref={sectionRef} className="dash-sec dash-bento-card dash-side-card dash-notice-card min-w-0" style={stagger(3)}>
      <header className="flex min-h-8 items-center gap-2">
        <Megaphone className="size-4 shrink-0 text-sidebar-icon" strokeWidth={1.6} aria-hidden="true" />
        <h2 className="shrink-0 text-[14px] leading-6 font-semibold text-foreground">소식</h2>
        <div role="group" aria-label="소식 나누기" className="dash-feed-tabs ml-auto">
          <button
            type="button"
            aria-pressed={feed === 'notice'}
            onClick={() => setFeed('notice')}
            className="dash-feed-tab focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            공지사항
            {view === 'ready' && unread > 0 && (
              <span className="font-semibold text-destructive-strong tabular-nums" aria-label={`안 읽음 ${unread}`}>
                {unread}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-pressed={feed === 'news'}
            onClick={() => setFeed('news')}
            className="dash-feed-tab focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            부동산 뉴스
          </button>
        </div>
      </header>

      {feed === 'news' ? (
        // 부동산 · 시장 뉴스는 아직 서버 데이터가 없다. 지어낸 기사로 채우지 않고 준비 중임을 알린다.
        <p className="px-1.5 py-2 text-[13px] leading-[1.55] break-keep text-muted-foreground/85">
          부동산 · 시장 뉴스는 준비 중입니다. 정책, 시장, 우리 지역 소식이 여기에 나옵니다.
        </p>
      ) : (
        (status ??
        (items.length === 0 ? (
          <EmptyNote>새 공지가 없습니다.</EmptyNote>
        ) : (
          // 공지는 모두 싣고 네 줄 높이 안에서 굴린다 (-dashboard.css의 .dash-notice-scroll)
            <ul className="dash-scroll dash-notice-scroll flex flex-col">
              {items.map((notice) => {
                const isUnread = !notice.readAt;
                return (
                  <li key={notice.id}>
                    <button
                      type="button"
                      onClick={(event) => openNotice(notice, event.currentTarget)}
                      aria-label={`${notice.isRequired ? '필독 ' : ''}${notice.title}${isUnread ? ' (안 읽음)' : ''}`}
                      className="dash-feed-row group focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {notice.isRequired && <RequiredBadge />}
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-[14px] leading-[21px] transition-colors group-hover:text-foreground',
                          isUnread ? 'font-semibold text-foreground' : 'font-[450] text-muted-foreground-strong',
                        )}
                      >
                        {notice.title}
                      </span>
                      <span className="shrink-0 text-[12.5px] text-muted-foreground tabular-nums">
                        {noticeDate(notice.publishedAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
        )))
      )}
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
    tip: '사이드바 맨 위 ‘검색’(⌘K)으로 거래·고객·메뉴를 바로 열고, 사이드바 접기/펼치기로 넓은 화면을 확보할 수 있습니다.',
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
    tip: '사이드바 맨 위 ‘검색’(⌘K)이나 왼쪽 메뉴에서 여러 업무 화면을 탭으로 열어두고 빠르게 오갈 수 있습니다.',
    steps: [
      { title: '1. 상단 탭으로 여러 업무 동시에 열기', desc: '상담 중인 매물과 계약서 화면 여러 개를 상단 탭에 나란히 열어두고 전환할 수 있습니다.' },
      { title: '2. 사이드바 ‘검색’(⌘K)으로 거래·고객·메뉴 바로 이동', desc: '사이드바 맨 위 ‘검색’을 누르거나 ⌘K를 눌러 단지명·고객명·정산 화면으로 한 번에 이동합니다.' },
      { title: '3. 대시보드에서 바로 다음 업무 연결', desc: '최근 상담 내역을 열어 통화·방문 메모를 확인하고 오늘 할 다음 업무를 바로 추가합니다.' },
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

/* --------------------------------- 쿼리 --------------------------------- */

/** 필독 팝업(components/layout/required-notice-popup)과 같은 캐시를 쓴다. */
function useNoticesQuery() {
  return useQuery({ queryKey: NOTICES_QUERY_KEY, queryFn: () => api.notices.list(), staleTime: NOTICES_STALE_MS });
}

function useTasksQuery() {
  return useQuery({ queryKey: ['tasks'], queryFn: () => api.tasks.findAll() });
}

function useDealsQuery() {
  return useQuery(dealQueries.list());
}

/**
 * 현재 상황의 '매칭 중': 진행 중인 매칭 수와 그 가운데 임장이 잡힌 수.
 * 건수만 필요하므로 조건을 건 목록을 한 줄만 청하고 전체 수(total)를 읽는다 (예전에는 매칭을 전부 받아 셌다).
 */
function useMatchesQuery() {
  return useQuery({
    queryKey: ['matches', 'open-counts'],
    queryFn: async () => {
      const [open, viewing] = await Promise.all([
        api.matches.findAll({ scope: 'open', limit: 1 }),
        api.matches.findAll({ scope: 'open', upcomingViewing: true, limit: 1 }),
      ]);
      return { open: open.pagination.total, viewingsAhead: viewing.pagination.total };
    },
  });
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

/** 이달 수금은 대표·매니저 권한 전용(/finance/ledger @Roles('owner', 'manager')). */
function DashboardPage() {
  const { user } = useAuth();
  const now = useMinuteClock();
  // 등장 움직임은 화면을 열 때 한 번뿐이다. 끝나면 표식을 떼어 그 뒤의 다시 그리기에는 재생되지 않게 한다.
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setPlaying(false), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  const [reveal, setReveal] = useState<{ bucket: TaskBucket; n: number; focus?: boolean } | null>(null);
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

  const noticeSectionRef = useRef<HTMLElement | null>(null);
  const scheduleAsideRef = useRef<HTMLElement | null>(null);

  // 월간 캘린더 5~6주 격자 계산. 캘린더 화면과 같이 일요일부터 놓는다.
  const monthFirst = new Date(viewMonth.year, viewMonth.month, 1);
  const gridStart = addDays(monthFirst, -monthFirst.getDay());
  const all42 = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const calendarDays = all42[35].getMonth() === viewMonth.month ? all42 : all42.slice(0, 35);
  const gridEnd = addDays(gridStart, calendarDays.length);
  const rangeStart = new Date(Math.min(gridStart.getTime(), startOfDay(selectedDate).getTime()));
  const rangeEnd = new Date(Math.max(addDays(gridEnd, 14).getTime(), addDays(selectedDate, 15).getTime()));

  const tasks = useTasksQuery();
  const deals = useDealsQuery();
  const matches = useMatchesQuery();
  const notices = useNoticesQuery();
  const todayEventsQuery = useTodayEventsQuery(todayKey, todayStart);
  const monthEventsQuery = useMonthEventsQuery(rangeStart, rangeEnd);
  const consultations = useRecentConsultationsQuery(scope, user?.id);
  // 캘린더에 보이는 계약일·중도금일·잔금일·수금예정을 대시보드에도 같이 보인다 (같은 캐시를 쓴다)
  // '내 담당'이면 내가 담당인 거래의 날짜만 (담당이 없는 옛 거래는 '사무소 전체'에서만)
  const { overlaysByDate } = useCalendarOverlays(true, scope === 'mine' ? (user?.id ?? null) : null);

  const noticeReader = useNoticeReader(notices);
  const { openId, setOpenId, shownNotice, openerRef: noticeOpenerRef } = noticeReader;

  const mine = scope === 'mine' && Boolean(user?.id);
  const scopedOpenTasks = (tasks.data ?? [])
    .filter(isOpenTask)
    .filter((task) => !mine || task.assignedToId === user?.id)
    .sort((a, b) => byDateAsc(a.dueDate, b.dueDate));
  // 닫힌 매칭에 걸린 앞날의 임장은 없어진 약속이다 — '오늘 일정' 숫자와 그림의 깃발에서 뺀다
  const scopedTodayEvents = (todayEventsQuery.data ?? []).filter(
    (event) => (!mine || event.userId === user?.id) && !isEventMoot(event, now),
  );
  const scopedMonthEvents = (monthEventsQuery.data ?? []).filter((event) => !mine || event.userId === user?.id);
  const todayEventCount =
    scopedTodayEvents.filter((event) => eventCoversDay(event, now)).length + (overlaysByDate.get(todayKey)?.length ?? 0);
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
              // 달력의 점도 없어진 약속(닫힌 매칭의 앞날 임장)은 세지 않는다
              monthEvents={scopedMonthEvents.filter((event) => !isEventMoot(event, now))}
              overlaysByDate={overlaysByDate}
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
              canSeeLedger={user?.role === 'owner' || user?.role === 'manager'}
              eventsQuery={monthEventsQuery}
              monthEvents={scopedMonthEvents}
              overlaysByDate={overlaysByDate}
              selectedDate={selectedDate}
              selectedKey={selectedKey}
              todayKey={todayKey}
              now={now}
            />
          </aside>

          <div className="dash-center">
            <SetupSection />
            <TaskSection
              scope={scope}
              userId={user?.id}
              tasks={tasks}
              openTasks={scopedOpenTasks}
              now={now}
              reveal={reveal}
              onCheer={() => setCheer((count) => count + 1)}
            />
            <ConsultationsSection
              scope={scope}
              userId={user?.id}
              consultations={consultations}
              now={now}
              onFollowUpCreated={() => setReveal((prev) => ({ bucket: 'today', n: (prev?.n ?? 0) + 1, focus: false }))}
            />
          </div>

          {/* 오른쪽 단: 현재 상황 · 가이드 · 소식(남은 높이). 좁아지면 아래로 내려가지 않고 화면에서 빠진다(-dashboard.css의 @container). */}
          <aside className="dash-rail">
            <StatusSection deals={deals} matches={matches} scope={scope} userId={user?.id} now={now} />
            <GuideBannerCard
              bannerIdx={bannerIdx}
              onSelectBanner={setBannerIdx}
              onOpenGuide={(id) => setOpenGuideId(id)}
            />
            <NoticeSection notices={notices} reader={noticeReader} sectionRef={noticeSectionRef} />
          </aside>
        </div>
      </div>

      {/* 공지 본문 창 */}
      <Dialog open={openId !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        {shownNotice && (
          <DialogContent
            className="sm:max-w-lg"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const opener = noticeOpenerRef.current;
              const fallback = noticeSectionRef.current?.querySelector<HTMLButtonElement>('li button');
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

    </div>
  );
}
