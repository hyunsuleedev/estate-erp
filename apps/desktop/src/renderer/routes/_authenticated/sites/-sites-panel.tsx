/**
 * 관리단지 사이드바 — 본문 첫 줄의 단지 버튼으로 열고 닫는다.
 *
 * 앱 메뉴 옆에 목록을 늘 펼쳐 두면 사이드바가 둘로 보여 어색했다. 평소에는 닫아 두고,
 * 열면 본문을 밀며 자리를 차지한다(팝업처럼 겹치지 않음). 단지가 많아도 목록 높이를 다 쓴다.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  Building,
  Building2,
  ChevronDown,
  Hotel,
  House,
  LandPlot,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Store,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { OfficeSite } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/domain';
import {
  SITES_PANEL_WIDTH,
  buildSitePanelSections,
  canEditSiteStructure,
  clampPanelWidth,
  extractRegionFromSite,
  filterOfficeSites,
  formatSiteSummary,
  getManagedUnitCount,
  type SiteGroupMode,
  type SitePanelSection,
} from './-site-helpers';

export const SITES_PANEL_ID = 'managed-sites-panel';
const SITE_GROUP_OPTIONS: ReadonlyArray<{ value: SiteGroupMode; label: string }> = [
  { value: 'none', label: '목록' },
  { value: 'region', label: '지역별' },
  { value: 'type', label: '유형별' },
];

/** 줄 앞 아이콘 — 앱 메뉴처럼 아이콘 + 이름 한 줄로 읽히고, 아파트가 아닌 단지는 아이콘으로 구분된다 */
export const SITE_TYPE_ICONS: Record<string, LucideIcon> = {
  apartment: Building2,
  officetel: Building,
  villa: House,
  house: House,
  commercial: Store,
  land: LandPlot,
  living_accommodation: Hotel,
};

/** 단지가 이보다 적으면 검색줄을 숨긴다 */
const SEARCH_MIN_SITES = 6;

const PANEL_OPEN_KEY = 'sites.panelOpen';
const PANEL_WIDTH_KEY = 'sites.panelWidth';

export function readStoredPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_OPEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function storePanelOpen(open: boolean) {
  try {
    localStorage.setItem(PANEL_OPEN_KEY, String(open));
  } catch {
    /* 저장 못 해도 이번 세션 동작에는 영향 없음 */
  }
}

export function readStoredPanelWidth(): number {
  try {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    if (Number.isFinite(stored) && stored >= SITES_PANEL_WIDTH.min) {
      return Math.min(stored, SITES_PANEL_WIDTH.max);
    }
  } catch {
    /* 기본 너비로 연다 */
  }
  return SITES_PANEL_WIDTH.default;
}

export function storePanelWidth(width: number) {
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(width)));
  } catch {
    /* 저장 못 해도 이번 세션 동작에는 영향 없음 */
  }
}

// ── 본문 첫 줄의 단지 버튼 ──────────────────────────────────────

export function SitesPanelToggle({
  open,
  siteName,
  siteCount,
  onToggle,
  buttonRef,
}: {
  open: boolean;
  siteName: string;
  siteCount: number;
  onToggle: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const Icon = open ? PanelLeftClose : PanelLeftOpen;
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-controls={SITES_PANEL_ID}
      aria-expanded={open}
      // 이름이 말줄임될 수 있으니 전체 이름을 툴팁에 함께 둔다
      title={`${siteName} — 단지 목록 ${open ? '닫기' : '열기'} ( [ )`}
      onClick={onToggle}
      className={cn(
        // 버튼은 줄어들지 않고(공간이 모자라면 검색창이 먼저 줄어든다), 최대 폭만 본문 폭의 22%로 제한한다.
        // 그보다 긴 단지 이름만 말줄임되어 오른쪽 도구를 밀어내지 않는다.
        'flex h-[30px] max-w-[min(280px,22cqi)] shrink-0 items-center gap-2 rounded-full bg-[#f1f0ec] pl-1 pr-3 outline-none transition-colors hover:bg-[#e9e8e3] focus-visible:ring-2 focus-visible:ring-foreground/20',
        // 열려 있으면 흰 알약(매물관리 보기 전환의 선택 상태와 같은 표현)
        open && 'bg-white ring-1 ring-[#d6d5d0] hover:bg-white',
      )}
    >
      <span
        className={cn(
          'grid size-[22px] shrink-0 place-items-center rounded-full text-muted-foreground',
          open ? 'bg-[#f1f0ec]' : 'bg-white',
        )}
      >
        <Icon className="size-[13px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 truncate text-[13px] font-semibold">{siteName}</span>
      {!open && siteCount > 1 && (
        <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
          단지 {siteCount.toLocaleString()}
        </span>
      )}
    </button>
  );
}

// ── 사이드바 ────────────────────────────────────────────────────

interface SitesPanelProps {
  open: boolean;
  width: number;
  containerWidth: number;
  onWidthChange: (width: number) => void;
  onWidthCommit: (width: number) => void;
  onClose: () => void;
  officeSites: OfficeSite[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  selectedOfficeSiteId: string | null;
  onSelect: (officeSite: OfficeSite) => void;
  onTogglePin: (officeSite: OfficeSite) => void;
  pinPendingId: string | null;
  onRemove: (officeSite: OfficeSite) => void;
  onAddDong: (officeSite: OfficeSite) => void;
  onAddUnit: (officeSite: OfficeSite) => void;
  onAdd: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

export function SitesPanel({
  open,
  width,
  containerWidth,
  onWidthChange,
  onWidthCommit,
  onClose,
  officeSites,
  isLoading,
  isError,
  onRetry,
  selectedOfficeSiteId,
  onSelect,
  onTogglePin,
  pinPendingId,
  onRemove,
  onAddDong,
  onAddUnit,
  onAdd,
  searchRef,
}: SitesPanelProps) {
  const [siteQuery, setSiteQuery] = useState('');
  const [groupBy, setGroupBy] = useState<SiteGroupMode>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [isIdleOpen, setIsIdleOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const showSearch = officeSites.length > SEARCH_MIN_SITES;
  const query = showSearch ? siteQuery.trim() : '';

  // 사용자가 열었을 때만 검색창(없으면 목록)에 초점을 옮긴다 — 열린 채로 페이지에 들어올 때는 초점을 뺏지 않는다
  const wasOpenRef = useRef(open);
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!justOpened) return;
    const frame = requestAnimationFrame(() => {
      // 고를 단지가 없으면 옮길 곳이 없다 — 단지가 없어 자동으로 열릴 때 초점을 뺏지 않는다
      if (!listRef.current?.querySelector('[data-site-row]')) return;
      (searchRef.current ?? listRef.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, searchRef]);

  const matchingSites = useMemo(
    () => filterOfficeSites(officeSites, query),
    [officeSites, query],
  );
  const sections = useMemo(
    () => buildSitePanelSections(matchingSites, { groupBy, searching: query.length > 0 }),
    [groupBy, matchingSites, query],
  );
  const visibleSiteCount = sections.reduce((sum, section) => sum + section.items.length, 0);

  // 지금 연 단지가 다른 묶음으로 옮겨 갈 때(단지·묶기 방식·고정 변경)만 그 묶음을 한 번 펼친다.
  // 펼친 뒤에는 사용자가 다시 접을 수 있어야 하므로 렌더할 때 강제로 펼치지 않는다.
  const selectedSectionKey =
    sections.find((section) =>
      section.items.some((officeSite) => officeSite.id === selectedOfficeSiteId),
    )?.key ?? null;
  useEffect(() => {
    if (!selectedSectionKey) return;
    if (selectedSectionKey === 'idle') {
      setIsIdleOpen(true);
      return;
    }
    setCollapsedGroups((previous) => {
      if (!previous.has(selectedSectionKey)) return previous;
      const next = new Set(previous);
      next.delete(selectedSectionKey);
      return next;
    });
  }, [selectedSectionKey]);
  const totalManaged = officeSites.reduce((sum, officeSite) => sum + getManagedUnitCount(officeSite), 0);
  const idleSiteCount = officeSites.filter((officeSite) => getManagedUnitCount(officeSite) === 0).length;

  const toggleGroup = (key: string) => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderRow = (officeSite: OfficeSite) => (
    <SiteRow
      key={officeSite.id}
      officeSite={officeSite}
      isSelected={officeSite.id === selectedOfficeSiteId}
      groupBy={groupBy}
      pinPending={pinPendingId === officeSite.id}
      onSelect={onSelect}
      onTogglePin={onTogglePin}
      onRemove={onRemove}
      onAddDong={onAddDong}
      onAddUnit={onAddUnit}
    />
  );

  const renderSection = (section: SitePanelSection) => {
    if (section.kind === 'pinned' || section.kind === 'all') {
      return (
        <div key={section.key}>
          {section.label && <SectionLabel label={section.label} />}
          {section.items.map(renderRow)}
        </div>
      );
    }
    // 묶음은 기본으로 펼치고 기록 없는 단지만 접어 둔다 — 어느 묶음이든 사용자가 접고 펼 수 있다
    const sectionOpen =
      section.kind === 'idle' ? isIdleOpen : !collapsedGroups.has(section.key);
    return (
      <div key={section.key}>
        <SectionLabel
          label={section.label ?? ''}
          count={section.items.length}
          open={sectionOpen}
          onToggle={() =>
            section.kind === 'idle' ? setIsIdleOpen(!sectionOpen) : toggleGroup(section.key)
          }
        />
        {sectionOpen && section.items.map(renderRow)}
      </div>
    );
  };

  const renderList = () => {
    if (isLoading) {
      return (
        <div className="pt-1" aria-label="관리단지 불러오는 중">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="flex h-8 items-center gap-2 px-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-3.5" style={{ width: `${46 + ((index * 17) % 30)}%` }} />
            </div>
          ))}
        </div>
      );
    }
    if (isError) {
      return (
        <div className="flex flex-col items-center gap-2 p-6 text-center">
          <p className="text-xs text-muted-foreground">관리단지 목록을 불러오지 못했습니다</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="size-3.5" />
            다시 시도
          </Button>
        </div>
      );
    }
    if (officeSites.length === 0) {
      return (
        <EmptyState
          icon={Building2}
          title="관리 단지가 없습니다"
          description="자주 다루는 단지를 추가해보세요"
          action={
            <Button size="sm" variant="outline" onClick={onAdd}>
              <Plus className="size-3.5" />
              단지 추가
            </Button>
          }
          className="py-8"
        />
      );
    }
    if (visibleSiteCount === 0) {
      return (
        <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
          <p className="text-xs text-muted-foreground">조건에 맞는 관리단지가 없습니다</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11.5px]"
            onClick={() => setSiteQuery('')}
          >
            검색 지우기
          </Button>
        </div>
      );
    }
    return <>{sections.map(renderSection)}</>;
  };

  // ── 키보드: 목록 안에서 ↑↓로 이동, Esc로 닫기 ──
  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    // 줄 메뉴는 포털로 그려져도 React 이벤트가 여기까지 올라온다 — 메뉴 안의 ↑↓는 메뉴가 처리한다
    if (!event.currentTarget.contains(event.target as Node)) return;
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-site-row]') ?? [],
    );
    event.preventDefault();
    const index = rows.indexOf(document.activeElement as HTMLElement);
    if (index === -1) {
      // 목록 자체에 초점이 있으면 지금 단지(없으면 첫 단지)부터 시작
      (rows.find((row) => row.getAttribute('aria-selected') === 'true') ?? rows[0])?.focus();
      return;
    }
    const nextIndex = event.key === 'ArrowDown' ? index + 1 : index - 1;
    rows[Math.max(0, Math.min(rows.length - 1, nextIndex))]?.focus();
  };

  // ── 너비 조절 ──
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = width;
    let latest = width;
    setIsResizing(true);
    const onMove = (moveEvent: PointerEvent) => {
      latest = clampPanelWidth(startWidth + moveEvent.clientX - startX, containerWidth);
      onWidthChange(latest);
    };
    const onUp = () => {
      setIsResizing(false);
      onWidthCommit(latest);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  const resizeByKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = clampPanelWidth(width + (event.key === 'ArrowRight' ? 16 : -16), containerWidth);
    onWidthChange(next);
    onWidthCommit(next);
  };

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden',
        !isResizing && 'motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out',
      )}
      style={{ width: open ? width : 0 }}
    >
      <aside
        id={SITES_PANEL_ID}
        aria-label="관리단지 목록"
        inert={!open}
        onKeyDown={(event) => {
          // 줄 메뉴는 포털로 그려져도 React 이벤트가 여기까지 올라온다 — 메뉴의 Esc가 패널까지 닫지 않게 한다
          if (!event.currentTarget.contains(event.target as Node)) return;
          if (event.key === 'Escape' && !(event.target as HTMLElement).closest('input')) {
            onClose();
          }
        }}
        className={cn(
          '@container/panel absolute inset-y-0 left-0 flex flex-col border-r border-border bg-[#f9f9f8]',
          'motion-safe:transition-[opacity,translate] motion-safe:duration-200 motion-safe:ease-out',
          open ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0',
        )}
        style={{ width }}
      >
        {/* 검색줄 — 본문 첫 도구줄과 높이를 맞춰 가로선이 이어진다 */}
        {showSearch && (
          <div className="flex h-[51px] shrink-0 items-center border-b border-border px-2.5">
            {/* 매물관리 검색바와 같은 베이지 알약 */}
            <div className="flex h-[30px] w-full items-center gap-2 rounded-full bg-[#f1f0ec] pl-3 pr-1.5 text-muted-foreground transition-colors hover:bg-[#ecebe6] focus-within:bg-white focus-within:shadow-[inset_0_0_0_1px_rgba(55,53,47,0.3)]">
              <Search className="size-3.5 shrink-0" />
              <input
                ref={searchRef}
                value={siteQuery}
                onChange={(event) => setSiteQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    if (siteQuery) setSiteQuery('');
                    else onClose();
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    listRef.current?.querySelector<HTMLElement>('[data-site-row]')?.focus();
                  } else if (event.key === 'Enter') {
                    const first = sections[0]?.items[0];
                    if (first) onSelect(first);
                  }
                }}
                placeholder="단지명 · 동네 검색"
                aria-label="관리단지 검색"
                autoComplete="off"
                className="w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
              />
              {siteQuery && (
                <button
                  type="button"
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[#a5a39f] outline-none hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
                  onClick={() => {
                    setSiteQuery('');
                    searchRef.current?.focus();
                  }}
                  aria-label="관리단지 검색 지우기"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 묶기 — 목록 위에 늘 보인다. 검색줄이 없으면 맨 윗줄이 되므로 본문 첫 도구줄과 가로선을 맞춘다 */}
        <div
          className={cn(
            'flex shrink-0 items-center px-2.5',
            showSearch ? 'pb-1 pt-2' : 'h-[51px] border-b border-border',
          )}
        >
          <div
            className="flex h-[30px] min-w-0 flex-1 items-center gap-px rounded-full bg-[#f1f0ec] p-0.5"
            role="group"
            aria-label="단지 묶음 방식"
          >
            {SITE_GROUP_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={groupBy === value}
                onClick={() => {
                  setGroupBy(value);
                  setCollapsedGroups(new Set());
                }}
                className={cn(
                  'h-[26px] flex-1 rounded-full text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/20',
                  groupBy === value
                    ? 'bg-white font-medium text-foreground shadow-[0_1px_2px_rgba(15,15,15,0.08)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div
            ref={listRef}
            role="listbox"
            aria-label="관리단지"
            tabIndex={-1}
            className="px-2 pb-3 pt-1 outline-none"
            onKeyDown={handleListKeyDown}
          >
            {renderList()}
          </div>
        </ScrollArea>

        <div className="flex shrink-0 items-center gap-2 border-t border-border px-2.5 py-2">
          <span className="min-w-0 truncate text-[11.5px] text-muted-foreground">
            관리호수 <span className="font-medium tabular-nums text-foreground/75">{totalManaged.toLocaleString()}</span>
            {idleSiteCount > 0 && (
              <>
                {' · '}기록 없음 <span className="tabular-nums">{idleSiteCount.toLocaleString()}</span>
              </>
            )}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 shrink-0 gap-1 px-2.5 text-xs font-medium"
            onClick={onAdd}
          >
            <Plus className="size-3" />
            단지 추가
          </Button>
        </div>

        {/* 너비 조절 손잡이 */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="단지 목록 너비 조절"
          aria-valuenow={Math.round(width)}
          aria-valuemin={SITES_PANEL_WIDTH.min}
          aria-valuemax={SITES_PANEL_WIDTH.max}
          tabIndex={0}
          title="끌어서 너비 조절 · 두 번 눌러 원래대로"
          onPointerDown={startResize}
          onDoubleClick={() => {
            const next = clampPanelWidth(SITES_PANEL_WIDTH.default, containerWidth);
            onWidthChange(next);
            onWidthCommit(next);
          }}
          onKeyDown={resizeByKeyboard}
          className={cn(
            'group/resize absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none outline-none',
            'after:absolute after:inset-y-0 after:right-0 after:w-0.5 after:bg-transparent after:transition-colors',
            'hover:after:bg-foreground/15 focus-visible:after:bg-ring/60',
            isResizing && 'after:bg-foreground/20',
          )}
        />
      </aside>
    </div>
  );
}

// ── 조각 ────────────────────────────────────────────────────────

/**
 * 묶음 머리 — 앱 메뉴의 묶음 이름(시작 · 매물·공간 …)과 같은 글씨.
 * 접는 화살표는 이름 뒤에 둬서 접히는 묶음과 아닌 묶음의 글자 시작점이 같다.
 */
function SectionLabel({
  label,
  count,
  open,
  onToggle,
}: {
  label: string;
  count?: number;
  open?: boolean;
  onToggle?: () => void;
}) {
  const className =
    'mt-2 flex h-7 w-full items-center gap-1 px-2 text-xs text-muted-foreground first:mt-0';
  if (!onToggle) return <div className={className}>{label}</div>;
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        className,
        'group/section rounded-md outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70',
      )}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className="tabular-nums text-muted-foreground/60">{count}</span>
      )}
      <ChevronDown
        className={cn(
          'size-3 shrink-0 text-muted-foreground/60 motion-safe:transition-transform group-hover/section:text-foreground',
          !open && '-rotate-90',
        )}
        aria-hidden="true"
      />
    </button>
  );
}

function SiteRow({
  officeSite,
  isSelected,
  groupBy,
  pinPending,
  onSelect,
  onTogglePin,
  onRemove,
  onAddDong,
  onAddUnit,
}: {
  officeSite: OfficeSite;
  isSelected: boolean;
  groupBy: SiteGroupMode;
  pinPending: boolean;
  onSelect: (officeSite: OfficeSite) => void;
  onTogglePin: (officeSite: OfficeSite) => void;
  onRemove: (officeSite: OfficeSite) => void;
  onAddDong: (officeSite: OfficeSite) => void;
  onAddUnit: (officeSite: OfficeSite) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const site = officeSite.site;
  if (!site) return null;
  const managed = getManagedUnitCount(officeSite);
  const isIdle = managed === 0;
  const TypeIcon = SITE_TYPE_ICONS[site.type] ?? Building2;
  // 묶은 기준과 같은 정보(지역별이면 동네)는 줄 안에서 다시 보여주지 않는다
  const wardName = site.ward?.name ?? extractRegionFromSite(site).split(' ').pop();
  const showWard = groupBy !== 'region' && !!wardName;
  const managedLabel = isIdle ? '관리호수 없음' : `관리호수 ${managed.toLocaleString()}`;

  return (
    // 메뉴가 열려 있으면 툴팁을 끈다 — 메뉴와 겹치고, 메뉴보다 먼저 Esc를 가져가기 때문이다
    <Tooltip delayDuration={600} open={isMenuOpen ? false : undefined}>
      <TooltipTrigger asChild>
        <div
          role="option"
          aria-selected={isSelected}
          aria-label={`${site.name}${showWard ? `, ${wardName}` : ''}, ${managedLabel}`}
          tabIndex={0}
          data-site-row
          onClick={() => onSelect(officeSite)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(officeSite);
            }
          }}
          className={cn(
            // 앱 메뉴 항목과 같은 한 줄·같은 높이·같은 평평한 선택 바탕 — 목록 안에 카드가 떠 보이지 않게
            'group relative flex h-8 cursor-pointer items-center gap-2 rounded-md pl-2 pr-1 outline-none transition-colors',
            'hover:bg-[rgba(55,53,47,0.05)] focus-visible:ring-2 focus-visible:ring-ring/60',
            isSelected && 'bg-[rgba(55,53,47,0.08)] hover:bg-[rgba(55,53,47,0.08)]',
          )}
        >
          <TypeIcon
            className={cn(
              'size-4 shrink-0',
              isSelected ? 'text-foreground/80' : 'text-muted-foreground/70',
            )}
            aria-hidden="true"
          />
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span
              className={cn(
                'min-w-0 truncate text-[13px]',
                isSelected ? 'font-semibold' : 'font-normal',
                isIdle && !isSelected && 'text-muted-foreground',
              )}
            >
              {site.name}
            </span>
            {officeSite.isFavorite && groupBy !== 'none' && (
              <Pin
                className="size-2.5 shrink-0 self-center fill-current text-muted-foreground/60"
                aria-label="고정한 단지"
              />
            )}
            {/* 동네는 이름보다 먼저 줄어들고, 목록이 좁으면 숨긴다 */}
            {showWard && (
              <span className="min-w-0 shrink-[4] truncate text-[11.5px] text-muted-foreground/75 @max-[250px]/panel:hidden">
                {wardName}
              </span>
            )}
          </span>

          {/* 관리호수 — 줄에 올리면 동작 버튼에 자리를 내준다 */}
          {!isIdle && (
            <span className="shrink-0 pr-1.5 text-xs tabular-nums text-muted-foreground group-hover:hidden group-focus-within:hidden group-has-[[data-state=open]]:hidden">
              {managed.toLocaleString()}
            </span>
          )}

          {/* 줄에 올렸을 때만 보이는 동작 */}
          <div className="hidden shrink-0 items-center group-hover:flex group-focus-within:flex has-[[data-state=open]]:flex">
            <button
              type="button"
              disabled={pinPending}
              onClick={(event) => {
                event.stopPropagation();
                onTogglePin(officeSite);
              }}
              className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-foreground/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-40"
              aria-label={`${site.name} ${officeSite.isFavorite ? '고정 해제' : '위에 고정'}`}
              title={officeSite.isFavorite ? '고정 해제' : '위에 고정'}
            >
              <Pin className={cn('size-[13px]', officeSite.isFavorite && 'fill-current')} />
            </button>
            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-foreground/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
                  aria-label={`${site.name} 단지 메뉴`}
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                {/* 공공 단지의 동·호수는 바꿀 수 없다 — 직접 등록한 단지에만 보인다 */}
                {canEditSiteStructure(site) && (
                  <>
                    <DropdownMenuItem onClick={() => onAddDong(officeSite)}>
                      <Plus className="size-3.5" />
                      동 추가
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAddUnit(officeSite)}>
                      <Plus className="size-3.5" />
                      호수 추가
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem className="text-destructive" onClick={() => onRemove(officeSite)}>
                  <Trash2 className="size-3.5" />
                  관리단지에서 제거
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="max-w-60 px-3 py-2 text-xs">
        <p className="font-semibold">{site.name}</p>
        <p className="mt-0.5">{managedLabel}</p>
        <p className="mt-0.5 opacity-80">{formatSiteSummary(site)}</p>
        {(site.roadAddress || site.jibunAddress) && (
          <p className="mt-0.5 opacity-70">{site.roadAddress ?? site.jibunAddress}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
