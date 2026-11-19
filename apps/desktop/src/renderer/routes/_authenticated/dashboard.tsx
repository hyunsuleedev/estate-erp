import { createFileRoute, Link, type LinkProps } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  ArrowRight,
  Building2,
  CalendarDays,
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
  Moon,
  Newspaper,
  Plus,
  Sun,
  Tag,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { CalendarEvent, Deal, Notice, Task } from '@estate-erp/api-client';
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
import { formatDate } from '@/lib/format';
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
 * 디자인 메모 — 오늘의 보드와 한 장의 문서
 * 맨 위는 인사 영역이다. 판 전체가 하늘이고 오른쪽에 색이 있는 작은 동네가 있다(-dashboard-scene.tsx).
 * 땅이 오늘의 시간 축이라 해가 지금 시각 위에 뜨고 오늘 일정이 깃발로 꽂힌다. 하늘은 시각과 사무소 위치의 날씨를 따른다 —
 * 밤이면 판이 어두워지고 글자가 밝아진다. 색을 쓰는 곳은 그림뿐이고 글자·알약·도구 단추는 그대로다. 숫자 셋은 알약 단추다.
 * 그 아래는 카드가 아니라 Notion 문서 한 장이다. 테두리와 그림자 없이 제목·여백·가는 선이 구획을 나눈다.
 *   왼쪽 단: 오늘 요약 한 문단(문장 안의 알약이 바로가기) · 이번 주 띠와 고른 날의 일정 · 할 일(지남/오늘/다가옴 접는 묶음)
 *   오른쪽 단: 진행 거래 표 · 공지사항 · 부동산 뉴스 · 관리단지
 * 지표 타일과 수금·'확인할 것' 요약은 두지 않는다. 대시보드는 숫자판이 아니라 오늘의 일정과 일이 보이는 곳이다.
 *
 * 한 화면 원칙 — 두 단이 탭 높이의 나머지를 받고, 길면 단 안에서 굴린다.
 * 부동산 뉴스·관리단지는 서버에 데이터가 없어 자리만 둔다(SoonSection).
 * 공지사항은 사무소 공지가 아니라 에스테잇플로우가 모든 사용자에게 알리는 공지다. 앱에서는 보고 읽음 표시만 한다
 * (올리는 화면은 앱에 두지 않는다. 운영자가 서버 API로 올린다).
 * 움직임과 표의 subgrid처럼 유틸리티로 쓰기 번거로운 것은 -dashboard.css에 있다.
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

/* --------------------------------- 문서 구획 --------------------------------- */

/** 구획 제목 줄: 회색 아이콘 + 제목 + 회색 건수, 오른쪽에 바로가기 */
function SectionHead({
  icon: Icon,
  title,
  count,
  meta,
  action,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex min-h-8 items-center gap-2">
      <Icon className="size-4 shrink-0 text-sidebar-icon" strokeWidth={1.6} aria-hidden="true" />
      <h2 className="shrink-0 text-[15px] leading-6 font-semibold tracking-[-0.01em]">{title}</h2>
      {count != null && <span className="text-[13px] text-muted-foreground/70 tabular-nums">{count}</span>}
      {meta != null && (
        <span className="min-w-0 truncate text-xs text-muted-foreground/80 tabular-nums">{meta}</span>
      )}
      {action && <div className="ml-auto flex shrink-0 items-center gap-0.5">{action}</div>}
    </header>
  );
}

/** 줄에 올렸을 때의 바탕 (Notion의 옅은 먹색) */
const ROW_HOVER = 'hover:bg-foreground/[0.045] focus-within:bg-foreground/[0.045]';
/** 문서의 한 단. 구획 사이는 여백으로만 나누고, 길면 단 안에서 굴린다. */
const DOC_COLUMN = 'flex min-h-0 min-w-0 flex-col gap-4 overflow-auto px-1.5 pb-4';

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

/** 서버에 아직 데이터가 없는 구획. 제목과 한 줄 설명, '준비 중'만 둔다. */
function SoonSection({
  icon,
  title,
  description,
  order,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  order: number;
}) {
  return (
    <section className="dash-sec min-w-0" style={stagger(order)}>
      <SectionHead
        icon={icon}
        title={title}
        action={<span className="px-1.5 text-xs text-muted-foreground/70">준비 중</span>}
      />
      <p className="py-1.5 pl-6 text-[13px] leading-5 break-keep text-muted-foreground/80">{description}</p>
    </section>
  );
}

/** 요약 문단 안의 알약. 문장 속 낱말이 곧 바로가기다. */
const MENTION =
  'mx-px inline-flex h-6 max-w-full items-center gap-[5px] rounded-[5px] bg-foreground/[0.06] px-[7px] align-[1px] text-sm font-medium whitespace-nowrap text-foreground transition-colors hover:bg-foreground/[0.11] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

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

/**
 * 개발 중 미리보기 — 서버가 사무소 날씨를 주기 전까지 그림의 날씨와 시각을 바꿔 볼 수 있게 한다.
 * 개발 빌드에서만 동작한다. 개발자 도구 콘솔에서:
 *   dashWeather('rain')        비 (clear · partly · cloudy · rain · snow · thunder · fog · mixed)
 *   dashWeather('mixed', 12.5) 오후부터 비, 그림의 시각은 12시 30분
 *   dashWeather(null)          끄기
 * 고른 값은 이 기기에 남아 다시 열어도 유지된다.
 */
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
  // version은 다시 읽게 하려고만 쓴다
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
  /** unavailable: 업무·일정을 불러오지 못했거나 오프라인 — 숫자를 단정하지 않고 비워 둔다 */
  status: 'pending' | 'ready' | 'unavailable';
  /** 그림의 시간 축에 꽂을 오늘 일정 */
  flags: SceneFlag[];
  /** 업무를 완료할 때마다 늘어나는 수 (해가 뛰고 반짝이가 튄다) */
  cheer: number;
  /** 사무소 위치의 날씨. 없으면 그림은 맑은 날로 그리고 날씨 글자는 내지 않는다. */
  weather?: SceneWeather;
  /** 그림과 인사말의 시각 (0~24의 소수) */
  hour: number;
  onPin: (target: PinTarget) => void;
  tools: ReactNode;
}) {
  const greeting = `${greetingByHour(Math.floor(hour))}${userName ? `, ${userName}님` : ''}`;
  // 판의 밝기는 시각과 날씨가 정한다. 어두우면(밤) 글자가 밝아진다.
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

function WeekSection({
  scope,
  userId,
  events,
  weekEvents,
  taskCountByDay,
  weekStart,
  selectedKey,
  onSelectDay,
  now,
  focusDay,
}: {
  scope: Scope;
  userId: string | undefined;
  events: ReturnType<typeof useWeekEventsQuery>;
  /** 범위를 적용한 이번 주 일정 */
  weekEvents: CalendarEvent[];
  /** 날짜별 남은 할 일 수 (기한이 그 날인 것) */
  taskCountByDay: Map<string, number>;
  weekStart: Date;
  selectedKey: string;
  onSelectDay: (key: string) => void;
  now: Date;
  /** 바뀔 때마다 고른 날의 단추로 포커스를 옮긴다 (인사 영역과 요약 문단의 알약) */
  focusDay: number;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusDay > 0) selectedRef.current?.focus();
  }, [focusDay]);
  const view = queryView(events);
  const todayKey = localDateKey(now);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const countByDay = new Map<string, number>();
  for (const day of days) {
    countByDay.set(localDateKey(day), weekEvents.filter((event) => eventCoversDay(event, day)).length);
  }
  const selectedDate = days.find((day) => localDateKey(day) === selectedKey) ?? now;
  // 종일이거나 전날부터 이어지는 일정이 먼저, 그다음 시작 시각 순
  const spansDay = (event: CalendarEvent) => event.allDay || startedBefore(event, selectedDate);
  const dayEvents = weekEvents
    .filter((event) => eventCoversDay(event, selectedDate))
    .sort((a, b) => Number(spansDay(b)) - Number(spansDay(a)) || byDateAsc(a.start, b.start));
  const isToday = selectedKey === todayKey;
  // '지금' 선은 오늘을 볼 때만, 아직 시작하지 않은 첫 일정 앞에 둔다. 남은 일정이 없으면 맨 끝.
  const nowIndex = isToday
    ? dayEvents.findIndex((event) => !spansDay(event) && new Date(event.start).getTime() > now.getTime())
    : -2;
  const nowLine = (
    <li className="flex h-4 items-center gap-2 px-1.5" aria-hidden="true">
      <span className="text-[11px] leading-4 font-semibold text-destructive tabular-nums">
        {clockLabel(now)}
      </span>
      <span className="flex-1 border-t border-destructive/55" />
    </li>
  );
  const personLabel = (id: string | null, name: string | null | undefined) =>
    id && id === userId ? '나' : (name ?? '미배정');
  const status = statusBody(view, () => void events.refetch(), 2);

  return (
    <section className="dash-sec min-w-0" style={stagger(1)}>
      <SectionHead
        icon={CalendarDays}
        title="이번 주"
        meta={`${shortDate(selectedDate)}${isToday ? ' · 오늘' : ''}`}
        action={<MoreLink to="/calendar">캘린더</MoreLink>}
      />
      <div className="grid grid-cols-7 gap-0.5 pt-0.5" role="group" aria-label="이번 주">
        {days.map((day) => {
          const key = localDateKey(day);
          const count = countByDay.get(key) ?? 0;
          const taskCount = taskCountByDay.get(key) ?? 0;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={key === selectedKey}
              aria-label={`${shortDate(day)} 일정 ${count}건, 할 일 ${taskCount}건`}
              onClick={() => onSelectDay(key)}
              ref={key === selectedKey ? selectedRef : undefined}
              className={cn(
                'flex flex-col items-center gap-[3px] rounded-lg pt-1.5 pb-[7px] text-xs leading-4 text-muted-foreground/80 transition-[background-color,transform] duration-150 hover:bg-foreground/[0.045] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.96]',
                key === selectedKey && 'bg-foreground/[0.07] hover:bg-foreground/[0.07]',
              )}
            >
              <span>{WEEKDAYS[day.getDay()]}</span>
              <span
                className={cn(
                  'grid size-[26px] place-items-center rounded-full text-sm font-medium tabular-nums',
                  // 오늘은 Notion 달력처럼 빨간 원, 지난 날은 흐리게
                  key === todayKey
                    ? 'bg-destructive text-white'
                    : key < todayKey
                      ? 'text-muted-foreground/70'
                      : 'text-foreground',
                )}
              >
                {day.getDate()}
              </span>
              <span className="flex h-1.5 gap-[3px]" aria-hidden="true">
                {Array.from({ length: Math.min(count, 3) }, (_, index) => (
                  <span key={index} className="size-1.5 rounded-full bg-muted-foreground/50" />
                ))}
              </span>
              <span className="h-3.5 text-[11px] leading-[14px] text-muted-foreground/70 tabular-nums" aria-hidden="true">
                {taskCount > 0 ? `할 일 ${taskCount}` : ''}
              </span>
            </button>
          );
        })}
      </div>
      <div className="pt-1">
        {status ??
          (dayEvents.length === 0 ? (
            <EmptyNote>
              {isToday ? '오늘 잡힌 일정이 없습니다.' : '이 날 잡힌 일정이 없습니다.'}
            </EmptyNote>
          ) : (
            <ol>
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
                return (
                  <Fragment key={event.id}>
                    {index === nowIndex && nowLine}
                    <li className={cn('grid min-h-[30px] grid-cols-[48px_minmax(0,1fr)_auto] items-baseline gap-x-2 rounded px-1.5 py-[5px]', ROW_HOVER)}>
                      <span className="text-sm leading-5 font-semibold tabular-nums">
                        {eventTimeLabel(event, selectedDate)}
                      </span>
                      <Link to="/calendar" className="truncate text-sm leading-5 font-medium hover:underline">
                        {event.title}
                      </Link>
                      {meta && (
                        <span className="max-w-[12rem] truncate text-xs leading-4 text-muted-foreground">{meta}</span>
                      )}
                    </li>
                  </Fragment>
                );
              })}
              {isToday && nowIndex === -1 && nowLine}
            </ol>
          ))}
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
  /** 바뀔 때마다 그 묶음을 펴고 묶음 머리로 포커스를 옮긴다 (인사 영역과 요약 문단의 알약) */
  reveal: { bucket: TaskBucket; n: number } | null;
  /** 완료가 저장됐을 때 불린다 (해가 뛰고 반짝이가 튄다) */
  onCheer: () => void;
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
    return (
      <li
        key={task.id}
        className={cn(
          'group/task flex min-h-[30px] items-center gap-[9px] rounded px-1.5 py-[3px] transition-[background-color,opacity]',
          ROW_HOVER,
          busy && 'opacity-45',
        )}
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
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <Link to="/tasks" className="truncate text-sm leading-5 hover:underline">
            {task.title}
          </Link>
          {meta && <span className="min-w-0 shrink-[3] truncate text-xs leading-4 text-muted-foreground/80">{meta}</span>}
        </span>
        {options.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={busy}
                aria-label={`${task.title} 미루기`}
                title="미루기"
                // 안 보일 때도 Tab으로 닿는다. 닿으면 드러난다.
                className="text-muted-foreground opacity-0 group-hover/task:opacity-100 group-focus-within/task:opacity-100 data-[state=open]:opacity-100"
              >
                <AlarmClock />
              </Button>
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
        {bucket !== 'today' && (
          <span
            title={task.dueDate ? formatDate(task.dueDate) : undefined}
            className={cn(
              'shrink-0 text-xs leading-5 tabular-nums',
              bucket === 'overdue' ? 'font-medium text-destructive-strong' : 'text-muted-foreground',
            )}
          >
            {!task.dueDate
              ? '기한 없음'
              : bucket === 'overdue' && days != null
                ? `${Math.abs(days)}일 지남`
                : shortDate(task.dueDate)}
          </span>
        )}
      </li>
    );
  };

  return (
    <section className="dash-sec min-w-0" style={stagger(2)}>
      <SectionHead
        icon={ListTodo}
        title="할 일"
        count={view === 'ready' ? openTasks.length : undefined}
        action={<MoreLink to="/tasks">업무</MoreLink>}
      />
      {status ??
        TASK_TABS.map((item) => {
          const list = groups[item.key];
          const isOpen = opened[item.key];
          return (
            <div key={item.key}>
              {/* Notion의 접는 묶음(toggle) */}
              <button
                type="button"
                aria-expanded={isOpen}
                ref={(element) => {
                  headRefs.current[item.key] = element;
                }}
                onClick={() => setOpened((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                className="flex w-full items-center gap-1.5 rounded py-1 pr-1.5 pl-0.5 text-left text-sm font-medium transition-colors hover:bg-foreground/[0.045] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <ChevronRight
                  className={cn('size-[18px] text-muted-foreground transition-transform duration-200', isOpen && 'rotate-90')}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                {item.label}
                <span
                  className={cn(
                    'tabular-nums',
                    item.key === 'overdue' && list.length > 0
                      ? 'font-medium text-destructive-strong'
                      : 'font-normal text-muted-foreground/70',
                  )}
                >
                  {list.length}
                </span>
              </button>
              {isOpen && (
                <div className="pb-1 pl-[22px]">
                  {list.length > 0 ? (
                    <ul>{list.map(row)}</ul>
                  ) : (
                    item.key !== 'today' && <EmptyNote>{emptyText[item.key]}</EmptyNote>
                  )}
                  {item.key === 'today' && (
                    <form
                      className="flex min-h-[30px] items-center gap-[9px] rounded px-1.5 text-muted-foreground/70 focus-within:bg-foreground/[0.045]"
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
                        placeholder={list.length === 0 ? `${emptyText.today} 새 할 일을 적고 Enter` : '새 할 일을 적고 Enter'}
                        aria-label="오늘 할 일 추가"
                        autoComplete="off"
                        className="h-6 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                      />
                    </form>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
    <section className="dash-sec min-w-0" style={stagger(3)}>
      <SectionHead
        icon={Handshake}
        title="진행 거래"
        count={view === 'ready' ? inProgress.length : undefined}
        action={<MoreLink to="/deals">거래관리</MoreLink>}
      />
      {status ??
        (active.length === 0 ? (
          <EmptyNote>진행 중인 거래가 없습니다.</EmptyNote>
        ) : (
          // Notion 표 모양: 머리 글자는 흐리게, 가로선과 옅은 세로선.
          // 줄 하나가 통째로 링크라서 표 역할(role=row)은 쓰지 않는다 — 씌우면 보조 기술에서 링크가 사라진다.
          <div className="dash-table mt-0.5 border-t border-border">
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

/* -------------------------------- 공지사항 -------------------------------- */

/** 접힌 상태에서 보이는 공지 수 */
const NOTICE_PREVIEW = 5;

function noticeDate(value: string): string {
  const date = new Date(value);
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function RequiredBadge() {
  return (
    <span className="shrink-0 rounded px-[5px] py-px text-[11px] leading-4 font-semibold text-destructive-strong bg-destructive/10">
      필독
    </span>
  );
}

/**
 * 에스테잇플로우가 모든 사용자에게 알리는 공지. 안 읽은 것은 점과 굵은 글씨로 보이고,
 * 누르면 본문이 열리면서 읽은 것으로 표시된다. 서버가 안 읽은 필독을 맨 앞에 준다.
 */
function NoticeSection({ notices }: { notices: ReturnType<typeof useNoticesQuery> }) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
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
  // 창을 닫으면 눌렀던 줄로 포커스를 돌려준다. 그 줄이 목록에서 빠졌으면 첫 줄로 보낸다.
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const markRead = useMutation({
    mutationFn: (notice: Notice) => api.notices.markRead(notice.id),
    onSuccess: ({ noticeId, readAt }) => {
      // 그 공지만 읽음으로 바꾼다. 순서는 그대로 둔다 — 읽자마자 줄이 다른 자리로 가면 눈이 따라가지 못한다.
      applyNoticeRead(queryClient, noticeId, readAt);
      // 다른 탭에도 알린다 (필독 팝업이 다른 탭에서 다시 뜨지 않게)
      announceNotice({ type: 'read', noticeId, readAt });
    },
    // 읽음 표시가 실패해도 본문은 읽을 수 있다. 다음에 열 때 다시 시도한다.
  });
  const open = (notice: Notice, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    setLastOpened(notice);
    setOpenId(notice.id);
    if (!notice.readAt) markRead.mutate(notice);
  };

  const status = statusBody(view, () => void notices.refetch(), 3);
  const shown = expanded ? items : items.slice(0, NOTICE_PREVIEW);
  const hidden = items.length - shown.length;

  return (
    <section ref={sectionRef} className="dash-sec min-w-0" style={stagger(4)}>
      <SectionHead
        icon={Megaphone}
        title="공지사항"
        meta={view === 'ready' && items.length > 0 ? (unread > 0 ? `안 읽음 ${unread}` : '모두 읽음') : undefined}
      />
      {status ??
        (items.length === 0 ? (
          <EmptyNote>새 공지가 없습니다.</EmptyNote>
        ) : (
          <>
            <ul>
              {shown.map((notice) => {
                const isUnread = !notice.readAt;
                return (
                  <li key={notice.id}>
                    <button
                      type="button"
                      onClick={(event) => open(notice, event.currentTarget)}
                      aria-label={`${notice.isRequired ? '필독 ' : ''}${notice.title}${isUnread ? ' (안 읽음)' : ''}`}
                      className="grid min-h-[30px] w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-x-2 rounded px-1.5 py-[3px] text-left transition-colors hover:bg-foreground/[0.045] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span
                        aria-hidden="true"
                        className={cn('size-1.5 justify-self-center rounded-full', isUnread && 'bg-info')}
                      />
                      <span className="flex min-w-0 items-center gap-1.5">
                        {notice.isRequired && <RequiredBadge />}
                        <span
                          className={cn(
                            'truncate text-sm leading-5',
                            isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground-strong',
                          )}
                        >
                          {notice.title}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground/80 tabular-nums">{noticeDate(notice.publishedAt)}</span>
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
                className="mt-0.5 ml-[22px] inline-flex h-[26px] items-center rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.045] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {expanded ? '접기' : `${hidden}건 더 보기`}
              </button>
            )}
          </>
        ))}

      <Dialog open={openId !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        {shownNotice && (
          <DialogContent
            className="sm:max-w-lg"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const opener = openerRef.current;
              (opener?.isConnected ? opener : sectionRef.current?.querySelector<HTMLButtonElement>('li button'))?.focus();
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

/** 이번 주(월~일) 일정. 주간 띠의 점과 고른 날의 목록이 같은 응답을 쓴다. */
function useWeekEventsQuery(weekStart: Date) {
  return useQuery({
    queryKey: ['calendar-events', 'week', localDateKey(weekStart)],
    queryFn: () =>
      api.calendarEvents.findAll({
        start: weekStart.toISOString(),
        end: addDays(weekStart, 7).toISOString(),
      }),
  });
}

/* --------------------------------- 요약 문단 --------------------------------- */

/** 오늘을 한 문단으로. 숫자 타일 대신 문장으로 읽고, 문장 안의 알약으로 그 자리에 간다. */
function Lead({
  status,
  todayEvents,
  nextEvent,
  overdueCount,
  oldestOverdue,
  now,
  onShowDay,
  onShowOverdue,
}: {
  status: 'pending' | 'ready' | 'unavailable';
  todayEvents: number;
  nextEvent: CalendarEvent | undefined;
  overdueCount: number;
  oldestOverdue: Task | undefined;
  now: Date;
  onShowDay: (key: string) => void;
  onShowOverdue: () => void;
}) {
  if (status === 'unavailable') return null;
  if (status === 'pending') return <Skeleton className="mt-1 h-6 w-3/4 shrink-0" />;
  const nextStart = nextEvent ? new Date(nextEvent.start) : null;
  const nextDay = nextStart
    ? localDateKey(nextStart) === localDateKey(now)
      ? '오늘'
      : `${WEEKDAYS[nextStart.getDay()]}요일`
    : '';
  return (
    <p className="dash-sec text-[15px] leading-[30px] break-keep text-muted-foreground-strong" style={stagger(0)}>
      {todayEvents > 0 ? (
        <>
          오늘 일정은 <b className="font-semibold text-foreground tabular-nums">{todayEvents}건</b>입니다.{' '}
        </>
      ) : (
        '오늘은 잡힌 일정이 없습니다. '
      )}
      {nextEvent && nextStart && (
        <>
          다음 일정은{' '}
          <button type="button" className={MENTION} onClick={() => onShowDay(localDateKey(nextStart))}>
            <CalendarDays className="size-[13px] shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">
              {nextDay} {clockLabel(nextStart)} {nextEvent.title}
            </span>
          </button>
          입니다.{' '}
        </>
      )}
      {overdueCount > 0 ? (
        <>
          밀린 업무가{' '}
          <button
            type="button"
            className={cn(MENTION, 'bg-destructive/10 text-destructive-strong hover:bg-destructive/15')}
            onClick={onShowOverdue}
          >
            {overdueCount}건
          </button>{' '}
          있습니다.
          {oldestOverdue && (
            <>
              {' '}
              가장 오래된 것은{' '}
              <Link to="/tasks" className={MENTION}>
                <ListTodo className="size-[13px] shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{oldestOverdue.title}</span>
              </Link>
              입니다.
            </>
          )}
        </>
      ) : (
        '밀린 업무는 없습니다.'
      )}
    </p>
  );
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
  const todayKey = localDateKey(now);
  const weekStart = startOfWeek(now);
  const [scope, setScope] = useState<Scope>(user?.role === 'agent' ? 'mine' : 'all');
  // 고른 날은 그 주 안에서만 뜻이 있다. 주가 바뀌면(자정을 넘겨 월요일이 되면) 오늘로 돌아간다.
  const [picked, setPicked] = useState<{ week: string; day: string } | null>(null);
  const weekKey = localDateKey(weekStart);
  const selectedKey = picked?.week === weekKey ? picked.day : todayKey;

  const tasks = useTasksQuery();
  const deals = useDealsQuery();
  const notices = useNoticesQuery();
  const events = useWeekEventsQuery(weekStart);

  const mine = scope === 'mine' && Boolean(user?.id);
  const scopedOpenTasks = (tasks.data ?? [])
    .filter(isOpenTask)
    .filter((task) => !mine || task.assignedToId === user?.id)
    .sort((a, b) => byDateAsc(a.dueDate, b.dueDate));
  const scopedWeekEvents = (events.data ?? []).filter((event) => !mine || event.userId === user?.id);
  const todayEventCount = scopedWeekEvents.filter((event) => eventCoversDay(event, now)).length;
  const overdueTasks = scopedOpenTasks.filter((task) => taskBucket(task) === 'overdue');
  // 주간 띠의 '할 일 n': 기한이 그 날인 남은 업무
  const taskCountByDay = new Map<string, number>();
  for (const task of scopedOpenTasks) {
    if (!task.dueDate) continue;
    const key = localDateKey(new Date(task.dueDate));
    taskCountByDay.set(key, (taskCountByDay.get(key) ?? 0) + 1);
  }
  // 이번 주에 남은, 시각이 있는 가장 가까운 일정
  const nextEvent = scopedWeekEvents
    .filter((event) => !event.allDay && new Date(event.start).getTime() > now.getTime())
    .sort((a, b) => byDateAsc(a.start, b.start))[0];
  // 그림의 시간 축에는 오늘 시작하는, 시각이 있는 일정만 꽂는다.
  const flags: SceneFlag[] = scopedWeekEvents
    .filter((event) => !event.allDay && eventCoversDay(event, now) && !startedBefore(event, now))
    .map((event) => {
      const start = new Date(event.start);
      return { hour: start.getHours() + start.getMinutes() / 60, label: event.title };
    });
  const showDay = (day: string | null) => {
    setPicked(day ? { week: weekKey, day } : null); // null이면 오늘로 돌아간다
    setFocusDay((count) => count + 1);
  };
  const showBucket = (bucket: TaskBucket) => setReveal((prev) => ({ bucket, n: (prev?.n ?? 0) + 1 }));
  const onPin = (target: PinTarget) => {
    if (target === 'schedule') showDay(null);
    else showBucket(target);
  };
  const status =
    tasks.isError || events.isError || isQueryPaused(tasks) || isQueryPaused(events)
      ? 'unavailable'
      : tasks.isPending || events.isPending
        ? 'pending'
        : 'ready';

  return (
    // flex-1 min-h-0: 탭 영역 높이를 그대로 받는다. 창이 아주 낮으면 문서의 min-h 만큼만 넘쳐 스크롤된다.
    // 너비는 제한하지 않는다. 창을 키우면 인사 영역과 두 단이 함께 넓어진다(너비를 묶으면 큰 창에서 오른쪽이 빈다).
    <div className={cn('flex min-h-0 w-full flex-1 flex-col gap-3.5 px-1', playing && 'dash-play')}>
      <Briefing
        now={now}
        officeName={user?.office?.name}
        userName={user?.name}
        events={todayEventCount}
        openTasks={scopedOpenTasks.length}
        overdueCount={overdueTasks.length}
        status={status}
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

      {/* 문서 한 장, 두 단. 단마다 따로 굴린다. */}
      <div className="grid min-h-[420px] flex-[1_1_0] grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] gap-x-11 px-2">
        <div className={DOC_COLUMN}>
          <Lead
            status={status}
            todayEvents={todayEventCount}
            nextEvent={nextEvent}
            overdueCount={overdueTasks.length}
            oldestOverdue={overdueTasks[0]}
            now={now}
            onShowDay={showDay}
            onShowOverdue={() => showBucket('overdue')}
          />
          <WeekSection
            scope={scope}
            userId={user?.id}
            events={events}
            weekEvents={scopedWeekEvents}
            taskCountByDay={taskCountByDay}
            weekStart={weekStart}
            selectedKey={selectedKey}
            onSelectDay={(day) => setPicked({ week: weekKey, day })}
            now={now}
            focusDay={focusDay}
          />
          <TaskSection
            scope={scope}
            userId={user?.id}
            tasks={tasks}
            openTasks={scopedOpenTasks}
            now={now}
            reveal={reveal}
            onCheer={() => setCheer((count) => count + 1)}
          />
        </div>
        <div className={DOC_COLUMN}>
          <DealsSection deals={deals} />
          <div className="grid grid-cols-2 gap-x-6">
            <NoticeSection notices={notices} />
            <SoonSection
              order={5}
              icon={Newspaper}
              title="부동산 뉴스"
              description="정책, 시장, 우리 지역 소식이 여기에 나옵니다."
            />
          </div>
          <div className="border-t border-border pt-3">
            <SoonSection
              order={6}
              icon={Building2}
              title="관리단지"
              description="관리하는 단지의 매물 수와 시세 변동이 여기에 나옵니다."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
