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
import { ToolbarPillTabs } from '../properties/-components/property-toolbar';
import {
  SITES_PANEL_MAX_WIDTH_CSS,
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
        'flex h-[30px] max-w-[min(280px,22cqi)] shrink-0 items-center gap-2 rounded-full bg-[rgba(55,53,47,0.08)] pl-1 pr-3 outline-none transition-colors hover:bg-[rgba(55,53,47,0.12)] focus-visible:ring-2 focus-visible:ring-foreground/20',
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
  /** 사용자가 정한 너비. 실제 너비는 페이지가 좁으면 CSS가 이보다 줄인다. */
  width: number;
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
  // 검색은 머리줄의 돋보기로 연다. 열려 있는 동안 묶기 탭 자리를 검색칸이 쓴다.
  const [isSearchRequested, setIsSearchOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<SiteGroupMode>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [isIdleOpen, setIsIdleOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);

  // 실제 너비는 CSS가 정하므로 손잡이의 현재값은 렌더링 없이 DOM에 바로 적는다
  useEffect(() => {
    const aside = asideRef.current;
    const handle = resizeHandleRef.current;
    if (!aside || !handle) return;
    const observer = new ResizeObserver(() => {
      handle.setAttribute('aria-valuenow', String(aside.offsetWidth));
    });
    observer.observe(aside);
    return () => observer.disconnect();
  }, []);

  const showSearch = officeSites.length > SEARCH_MIN_SITES;
  const query = showSearch ? siteQuery.trim() : '';
  // 검색 중에 단지를 지워 검색을 숨길 만큼 줄면 검색도 닫힌 것으로 본다 — 아니면 탭도 검색칸도 없는 빈 머리줄이 남는다
  const isSearchOpen = showSearch && isSearchRequested;
  useEffect(() => {
    if (showSearch) return;
    setIsSearchOpen(false);
    setSiteQuery('');
  }, [showSearch]);

  // 사용자가 열었을 때만 목록에 초점을 옮긴다 — 열린 채로 페이지에 들어올 때는 초점을 뺏지 않는다.
  // 검색칸으로 옮기면 검색이 열리며 묶기 탭을 가리므로 목록으로 옮긴다.
  const wasOpenRef = useRef(open);
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!justOpened) return;
    const frame = requestAnimationFrame(() => {
      // 고를 단지가 없으면 옮길 곳이 없다 — 단지가 없어 자동으로 열릴 때 초점을 뺏지 않는다
      if (!listRef.current?.querySelector('[data-site-row]')) return;
      listRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

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

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSiteQuery('');
  };

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
            <div key={index} className="flex h-[30px] items-center gap-2 px-2">
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
      // 자세한 안내와 추가 버튼은 본문 가운데에 있다. 여기서는 한 줄만 둔다(같은 안내가 두 번 보였다).
      return <p className="px-2 py-1.5 text-xs text-muted-foreground">아직 관리단지가 없습니다</p>;
    }
    if (visibleSiteCount === 0) {
      return (
        <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
          <p className="text-xs text-muted-foreground">조건에 맞는 관리단지가 없습니다</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11.5px]"
            onClick={closeSearch}
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
  // 페이지 폭과 실제 너비는 조작하는 순간에만 DOM에서 읽는다
  const clampToPage = (next: number) =>
    clampPanelWidth(next, frameRef.current?.parentElement?.clientWidth ?? 0);
  const readRenderedWidth = () => asideRef.current?.offsetWidth ?? width;

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = readRenderedWidth();
    let latest = startWidth;
    setIsResizing(true);
    const onMove = (moveEvent: PointerEvent) => {
      latest = clampToPage(startWidth + moveEvent.clientX - startX);
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
    const next = clampToPage(readRenderedWidth() + (event.key === 'ArrowRight' ? 16 : -16));
    onWidthChange(next);
    onWidthCommit(next);
  };

  return (
    <div
      ref={frameRef}
      className={cn(
        'relative shrink-0 overflow-hidden',
        !isResizing && 'motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out',
      )}
      style={{ width: open ? width : 0, maxWidth: SITES_PANEL_MAX_WIDTH_CSS }}
    >
      <aside
        ref={asideRef}
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
          '@container/panel absolute inset-y-0 left-0 flex flex-col border-r border-border bg-sidebar',
          'motion-safe:transition-[opacity,translate] motion-safe:duration-200 motion-safe:ease-out',
          open ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0',
        )}
        style={{ width, maxWidth: SITES_PANEL_MAX_WIDTH_CSS }}
      >
        {/* 머리줄 — 본문 첫 도구줄과 높이를 맞춰 가로선이 이어진다. 묶기 탭과 검색이 한 줄을 나눠 쓴다 */}
        <div className="flex h-[51px] shrink-0 items-center gap-0.5 border-b border-border px-2">
          {!isSearchOpen && (
            // 본문의 관리호수/전체 묶음과 같은 알약 탭 — 옅은 회색 트랙에 고른 탭만 검정
            <ToolbarPillTabs
              shape="muted"
              ariaLabel="단지 묶음 방식"
              value={groupBy}
              onChange={(value) => {
                setGroupBy(value);
                setCollapsedGroups(new Set());
              }}
              options={SITE_GROUP_OPTIONS}
            />
          )}
          {showSearch && (
            // 닫혀 있어도 입력칸은 남겨 둔다 — `/` 단축키가 이 칸에 초점을 주면 그때 열린다
            <div
              className={cn(
                'flex min-w-0 items-center gap-2 pl-1.5 text-sidebar-icon',
                isSearchOpen ? 'flex-1' : 'sr-only',
              )}
            >
              <Search className="size-4 shrink-0" aria-hidden="true" />
              <input
                ref={searchRef}
                value={siteQuery}
                tabIndex={isSearchOpen ? 0 : -1}
                onChange={(event) => setSiteQuery(event.target.value)}
                onFocus={() => setIsSearchOpen(true)}
                onBlur={() => {
                  if (!siteQuery.trim()) closeSearch();
                }}
                onKeyDown={(event) => {
                  // 한글 조합을 끝내는 키는 검색 동작으로 쓰지 않는다
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    if (siteQuery) setSiteQuery('');
                    else {
                      closeSearch();
                      listRef.current?.focus({ preventScroll: true });
                    }
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
                className="w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          {showSearch && (
            <button
              type="button"
              // 누르는 동안 입력칸의 초점을 뺏지 않는다 — 빈 검색칸이 먼저 닫히며 버튼이 바뀌면 누른 것이 다시 여는 동작이 된다
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (isSearchOpen) {
                  closeSearch();
                  listRef.current?.focus({ preventScroll: true });
                } else {
                  searchRef.current?.focus();
                }
              }}
              aria-label={isSearchOpen ? '관리단지 검색 닫기' : '관리단지 검색'}
              title={isSearchOpen ? '검색 닫기 (Esc)' : '단지 검색 ( / )'}
              className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-sidebar-icon outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {isSearchOpen ? <X className="size-4" /> : <Search className="size-4" />}
            </button>
          )}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-1.5 pb-3 pt-1.5">
            <div
              ref={listRef}
              role="listbox"
              aria-label="관리단지"
              tabIndex={-1}
              className="outline-none"
              onKeyDown={handleListKeyDown}
            >
              {renderList()}
            </div>
            {/* 목록 끝의 추가 줄 — 단지가 없을 때도 둔다(본문 가운데에 같은 버튼이 크게 있다) */}
            {!isLoading && !isError && (
              <button
                type="button"
                onClick={onAdd}
                className="mt-0.5 flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <Plus className="size-4 shrink-0" aria-hidden="true" />
                단지 추가
              </button>
            )}
          </div>
        </ScrollArea>

        {/* 요약 — 선이나 띠 없이 글자만 둔다 */}
        <p className="shrink-0 truncate px-3.5 pb-3 pt-2 text-xs tabular-nums text-muted-foreground">
          관리호수 {totalManaged.toLocaleString()}
          {idleSiteCount > 0 && <> · 기록 없음 {idleSiteCount.toLocaleString()}</>}
        </p>

        {/* 너비 조절 손잡이 */}
        <div
          ref={resizeHandleRef}
          role="separator"
          aria-orientation="vertical"
          aria-label="단지 목록 너비 조절"
          aria-valuemin={SITES_PANEL_WIDTH.min}
          aria-valuemax={SITES_PANEL_WIDTH.max}
          tabIndex={0}
          title="끌어서 너비 조절 · 두 번 눌러 원래대로"
          onPointerDown={startResize}
          onDoubleClick={() => {
            const next = clampToPage(SITES_PANEL_WIDTH.default);
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
    'mt-2.5 flex h-7 w-full items-center gap-1 px-2 text-xs font-medium text-muted-foreground first:mt-0';
  if (!onToggle) return <div className={className}>{label}</div>;
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        className,
        'group/section rounded-md outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className="tabular-nums font-normal">{count}</span>
      )}
      <ChevronDown
        className={cn(
          // 접는 화살표는 올렸을 때와 접혀 있을 때만 보인다
          'size-3 shrink-0 opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-visible/section:opacity-100 motion-safe:transition-[opacity,transform]',
          !open && '-rotate-90 opacity-100',
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
            'group relative flex h-[30px] cursor-pointer items-center gap-2 rounded-md pl-2 pr-1 text-sidebar-foreground outline-none transition-colors',
            'hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50',
            isSelected && 'bg-sidebar-accent text-foreground hover:bg-sidebar-accent',
          )}
        >
          <TypeIcon
            className={cn(
              'size-4 shrink-0',
              isSelected ? 'text-sidebar-foreground' : 'text-sidebar-icon',
            )}
            aria-hidden="true"
          />
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span
              className={cn(
                'min-w-0 truncate text-sm',
                isSelected ? 'font-medium' : 'font-[450]',
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
              <span
                className={cn(
                  'min-w-0 shrink-[4] truncate text-xs text-muted-foreground @max-[250px]/panel:hidden',
                )}
              >
                {wardName}
              </span>
            )}
          </span>

          {/* 관리호수 — 줄에 올리면 동작 버튼에 자리를 내준다 */}
          {!isIdle && (
            <span
              className={cn(
                'shrink-0 pr-1.5 text-xs tabular-nums text-muted-foreground group-hover:hidden group-focus-within:hidden group-has-[[data-state=open]]:hidden',
              )}
            >
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
