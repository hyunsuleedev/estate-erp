import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  CornerDownLeft,
  FolderKanban,
  Handshake,
  MapPin,
  Search,
  SquareArrowOutUpRight,
  User,
} from 'lucide-react'

import { formatPlaceLabel, IntakeClosedReason, ListingAvailability, normalizeDealStage } from '@estate-erp/shared'
import { api } from '@/lib/api'
import { getListingAvailability } from '@/lib/listing-status'
import { getStatusMeta } from '@/lib/status-config'
import { formatMoney, formatPhone, formatRent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'
import { navigateActiveTab } from '@/features/tabs/lib/navigateActiveTab'
import { getRouteMeta } from '@/features/tabs/lib/routeMeta'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { SidebarMenuButton } from '@/components/ui/sidebar'
import { getNavGroups } from '@/components/layout/nav-config'
import {
  dealMatchesQuery,
  listingMatchesPlace,
  listingSearchTerm,
  parseSearchQuery,
} from '@/components/layout/global-search-query'
import {
  formatDealAmount,
  formatPartyNames,
  getDealDisplayGroupKey,
  getDealTitle,
} from '@/routes/_authenticated/deals/-deal-view-utils'

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
}

const RESULT_LIMIT = 5

/** 끝난 의뢰의 사유 — 매물관리 표의 "종료 · 우리 거래"와 같은 낱말 */
const CLOSED_REASON_LABELS: Record<string, string> = {
  [IntakeClosedReason.DEAL_COMPLETED]: '종료 · 우리 거래',
  [IntakeClosedReason.EXTERNAL_DEAL_COMPLETED]: '종료 · 타 거래',
  [IntakeClosedReason.WITHDRAWN]: '종료 · 의뢰 철회',
  [IntakeClosedReason.UNAVAILABLE]: '종료 · 거래 불가',
  [IntakeClosedReason.SUPERSEDED]: '종료 · 의뢰 대체',
  [IntakeClosedReason.OTHER]: '종료 · 기타',
}

/** 결과 줄에 붙일 매물 상태. 활성은 붙이지 않는다(대부분이 활성이라 줄만 길어진다). */
function listingStatusLabel(listing: Parameters<typeof getListingAvailability>[0] & {
  intake?: { lifecycleStatus: string; closedReason?: string | null } | null
}): string | null {
  const availability = getListingAvailability(listing)
  if (availability === ListingAvailability.CLOSED) {
    const reason = listing.intake?.closedReason
    if (reason && CLOSED_REASON_LABELS[reason]) return CLOSED_REASON_LABELS[reason]
    // 우리 거래가 끝났으면(잔금·정산) 의뢰가 아직 열려 있어도 우리 거래로 끝난 것이다
    return (listing.deals ?? []).length > 0 ? '종료 · 우리 거래' : '종료'
  }
  if (availability === ListingAvailability.AVAILABLE) return null
  return getStatusMeta('listingAvailability', availability).label
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
}

function openRoute(route: string) {
  const meta = getRouteMeta(route)
  void navigateActiveTab({ route, kind: meta.kind, title: meta.title })
}

/**
 * 전체 검색 (⌘K / Ctrl+K).
 * 찾는 것: 연락처(이름·전화번호 일부) · 프로젝트 · 매물(단지명·동·호·소유자) · 거래(단지·동·호·당사자) · 관리단지 · 메뉴.
 * 서버 검색 결과를 그대로 쓰므로 cmdk 자체 필터링은 끈다 (shouldFilter=false).
 * 사이드바 맨 위에 붙인다(variant="sidebar"). 제목줄에는 두지 않는다.
 */
export function GlobalSearch({ variant = 'button' }: { variant?: 'button' | 'sidebar' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { user } = useAuth()
  const shortcutLabel = isMacPlatform() ? '⌘K' : 'Ctrl K'

  const debouncedQuery = useDebouncedValue(query, 250)
  const parsed = useMemo(() => parseSearchQuery(debouncedQuery), [debouncedQuery])
  const trimmed = parsed.raw
  const enabled = open && trimmed.length > 0
  const listingTerm = listingSearchTerm(parsed)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key === 'k' || event.key === 'K') &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const contactsQuery = useQuery({
    queryKey: ['global-search', 'contacts', trimmed],
    queryFn: () => api.contacts.findAll({ search: trimmed, limit: RESULT_LIMIT }),
    // "그라시움 101동"처럼 동·호를 찾을 때는 묻지 않는다. 서버가 검색어 속 숫자(101)를
    // 전화번호 일부로 보고 엉뚱한 손님을 돌려준다. 전화번호 모양("102-3302" 등)은 묻는다.
    enabled: enabled && (!parsed.isPlace || parsed.isPhoneLike),
  })
  const projectsQuery = useQuery({
    queryKey: ['global-search', 'projects', trimmed],
    queryFn: () =>
      api.projects.findAll({ search: trimmed, status: 'all', limit: RESULT_LIMIT }),
    enabled: enabled && !parsed.isPlace && !parsed.isPhoneLike,
  })
  const listingsQuery = useQuery({
    queryKey: ['global-search', 'listings', listingTerm, parsed.isPlace],
    queryFn: () =>
      api.listings.findAll({
        search: listingTerm,
        // 거래가 끝난 매물도 찾는다(한 달 뒤 손님 전화). 진행 중인 것을 위에 놓으려고 넉넉히 받는다.
        includeClosed: true,
        limit: parsed.isPlace ? 50 : 20,
      }),
    enabled: enabled && listingTerm.length > 0,
  })
  // 거래는 서버 검색이 없어 거래 목록(대시보드·캘린더와 같은 캐시)에서 단지·동·호·당사자 이름으로 거른다.
  const dealsQuery = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
    enabled: open,
    staleTime: 60_000,
  })
  // 관리단지는 우리 사무소가 고른 단지만 보인다(공공 단지 전체를 띄우면 열어도 볼 것이 없다).
  const officeSitesQuery = useQuery({
    queryKey: ['office-sites'],
    queryFn: () => api.officeSites.findAll(),
    enabled: open,
    staleTime: 60_000,
  })

  const contacts = contactsQuery.data?.items ?? []
  const projects = (projectsQuery.data?.items ?? []).slice(0, RESULT_LIMIT)
  const listings = useMemo(
    () =>
      (listingsQuery.data?.items ?? [])
        .filter((listing) =>
          listingMatchesPlace(parsed, {
            siteName: listing.property?.site?.name,
            siteAddress:
              listing.property?.site?.roadAddress ?? listing.property?.site?.jibunAddress,
            dongName: listing.property?.unit?.dong?.name,
            unitName: listing.property?.unit?.name,
          }),
        )
        // 진행 중(활성·보류·거래 중)을 위에, 끝난 매물을 아래에. 같은 무리 안의 순서는 서버 순서 그대로
        .map((listing, index) => ({ listing, index, closed: getListingAvailability(listing) === ListingAvailability.CLOSED }))
        .sort((a, b) => Number(a.closed) - Number(b.closed) || a.index - b.index)
        .slice(0, RESULT_LIMIT)
        .map(({ listing }) => listing),
    [listingsQuery.data, parsed],
  )
  const deals = useMemo(() => {
    if (!enabled) return []
    return (dealsQuery.data ?? [])
      .filter((deal) =>
        dealMatchesQuery(parsed, {
          siteName: deal.property?.site?.name,
          siteAddress: deal.property?.site?.roadAddress ?? deal.property?.site?.jibunAddress,
          dongName: deal.property?.unit?.dong?.name,
          unitName: deal.property?.unit?.name,
          partyNames: [deal.sellerContact?.name, deal.buyerContact?.name],
        }),
      )
      // 진행 중인 거래를 위에, 끝나거나 취소된 거래를 아래에
      .map((deal, index) => ({
        deal,
        index,
        ended: deal.isCancelled || getDealDisplayGroupKey(deal.stage) === 'closed',
      }))
      .sort((a, b) => Number(a.ended) - Number(b.ended) || a.index - b.index)
      .slice(0, RESULT_LIMIT)
      .map(({ deal }) => deal)
  }, [enabled, dealsQuery.data, parsed])
  const sites = useMemo(() => {
    if (!enabled || parsed.isPhoneLike) return []
    const words = (parsed.isPlace ? parsed.words : trimmed.split(' '))
      .map((word) => word.toLowerCase())
      .filter(Boolean)
    if (words.length === 0) return []
    return (officeSitesQuery.data ?? [])
      .filter((officeSite) => {
        const site = officeSite.site
        if (!site) return false
        const haystack = `${site.name} ${site.roadAddress ?? ''} ${site.jibunAddress ?? ''}`.toLowerCase()
        return words.every((word) => haystack.includes(word))
      })
      .slice(0, RESULT_LIMIT)
  }, [enabled, officeSitesQuery.data, parsed, trimmed])
  const menus = useMemo(() => {
    if (!enabled || parsed.isPhoneLike || parsed.isPlace) return []
    const needle = trimmed.replace(/\s+/g, '').toLowerCase()
    return getNavGroups(user?.role)
      .flatMap((group) =>
        group.items.flatMap((item) =>
          item.children && item.children.length > 0
            ? item.children.map((child) => ({
                path: child.path,
                label: child.label,
                context: item.label,
              }))
            : [{ path: item.path, label: item.label, context: group.label }],
        ),
      )
      .filter((entry) => entry.label.replace(/\s+/g, '').toLowerCase().includes(needle))
      .slice(0, RESULT_LIMIT)
  }, [enabled, parsed, trimmed, user?.role])

  const isSearching =
    enabled &&
    (debouncedQuery.trim() !== query.trim() ||
      contactsQuery.isFetching ||
      projectsQuery.isFetching ||
      listingsQuery.isFetching)
  const hasError = contactsQuery.isError || listingsQuery.isError || projectsQuery.isError
  const hasResults =
    contacts.length > 0 ||
    projects.length > 0 ||
    listings.length > 0 ||
    deals.length > 0 ||
    sites.length > 0 ||
    menus.length > 0

  // 고른 줄은 늘 화면에 보이는 첫 줄에서 시작한다. 결과가 무리마다 따로 도착하므로(관리단지·메뉴는 바로, 매물은 서버를 다녀와서)
  // 그대로 두면 먼저 온 아래쪽 줄(관리단지)이 골라진 채로 남아, 맨 위 매물을 보고 Enter를 쳐도 단지가 열렸다.
  const resultValues = [
    ...contacts.map((contact) => `contact-${contact.id}`),
    ...projects.map((project) => `project-${project.id}`),
    ...listings.map((listing) => `listing-${listing.id}`),
    ...deals.map((deal) => `deal-${deal.id}`),
    ...sites.map((officeSite) => `site-${officeSite.id}`),
    ...menus.map((menu) => `menu-${menu.path}`),
  ]
  const resultKey = resultValues.join('|')
  const [selectedValue, setSelectedValue] = useState('')
  useEffect(() => {
    setSelectedValue(resultKey.split('|')[0] ?? '')
  }, [resultKey])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setQuery('')
  }

  // 관리단지는 주소로 단지·동·호를 받는다(/sites?siteId=&dong=&ho=). "그라시움 102동 3302호"면 그 동·호로 연다.
  const siteRoute = (siteId: string) => {
    const params = new URLSearchParams({ siteId })
    if (parsed.isPlace && parsed.dong) params.set('dong', parsed.dong)
    if (parsed.isPlace && parsed.unit) params.set('ho', parsed.unit)
    return `/sites?${params.toString()}`
  }

  const go = (route: string) => {
    handleOpenChange(false)
    openRoute(route)
  }

  // 주소 표기는 앱 공통 함수(@estate-erp/shared formatPlaceLabel): "고덕그라시움 102동 2203호"
  const listingTitle = (listing: (typeof listings)[number]) => {
    const property = listing.property
    return (
      formatPlaceLabel({
        siteName: property?.site?.name,
        dongName: property?.unit?.dong?.name,
        dongIsPlaceholder: property?.unit?.dong?.isPlaceholder,
        unit: property?.unit,
      }) || '매물'
    )
  }

  // 금액 표기는 목록 화면과 같은 규칙(lib/format의 formatMoney·formatRent)
  const listingPrice = (listing: (typeof listings)[number]) => {
    const typeLabel = TRANSACTION_TYPE_LABELS[listing.transactionType] ?? ''
    if (listing.transactionType === 'monthly') {
      return `${typeLabel} ${formatRent(listing.deposit, listing.monthlyRent)}`
    }
    const amount =
      listing.transactionType === 'jeonse'
        ? (listing.deposit ?? listing.price)
        : listing.price
    return `${typeLabel} ${formatMoney(amount)}`
  }

  const trigger =
    variant === 'sidebar' ? (
      <SidebarMenuButton
        type="button"
        tooltip={`검색 (${shortcutLabel})`}
        aria-keyshortcuts={isMacPlatform() ? 'Meta+K' : 'Control+K'}
        onClick={() => setOpen(true)}
        data-slot="sidebar-global-search"
        className="text-muted-foreground"
      >
        <Search />
        <span>검색</span>
        <kbd className="pointer-events-none ml-auto inline-flex h-5 items-center rounded border bg-background px-1.5 font-sans text-[10px] font-medium text-muted-foreground">
          {shortcutLabel}
        </kbd>
      </SidebarMenuButton>
    ) : (
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-40 justify-start gap-2 px-2.5 font-normal text-muted-foreground sm:w-48"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">검색</span>
        <kbd className="pointer-events-none hidden h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
          {shortcutLabel}
        </kbd>
      </Button>
    )

  return (
    <>
      {trigger}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">전체 검색</DialogTitle>
          <DialogDescription className="sr-only">
            연락처, 프로젝트, 매물, 거래, 관리단지, 메뉴를 찾습니다
          </DialogDescription>
          <Command
            shouldFilter={false}
            value={selectedValue}
            onValueChange={setSelectedValue}
            className="rounded-none"
          >
            <CommandInput
              placeholder="이름, 전화번호 뒷자리, 단지명, 102동 1203호"
              aria-label="검색어"
              value={query}
              onValueChange={setQuery}
              className="text-[15px]"
            />
            <CommandList className="max-h-[min(420px,60dvh)] p-1">
              {!query.trim() && (
                <div className="px-3 py-5 text-sm text-muted-foreground">
                  <p>손님 이름이나 전화번호 뒷자리 네 자리, 단지명, 동·호로 찾습니다.</p>
                  <p className="mt-1.5 text-xs">예: 김민준 · 0001 · 그라시움 · 102동 3302호</p>
                </div>
              )}
              {query.trim() && isSearching && !hasResults && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  찾는 중…
                </p>
              )}
              {query.trim() && !isSearching && !hasResults && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {hasError ? (
                    <p>검색하지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>
                  ) : (
                    <>
                      <p>‘{query.trim()}’에 맞는 것이 없습니다.</p>
                      <p className="mt-1.5 text-xs">
                        이름 일부, 전화번호 뒷자리, 단지명이나 ‘102동 1203호’처럼 찾아 보세요.
                      </p>
                    </>
                  )}
                </div>
              )}

              {contacts.length > 0 && (
                <CommandGroup heading="연락처">
                  {contacts.map((contact) => (
                    <CommandItem
                      key={contact.id}
                      value={`contact-${contact.id}`}
                      onSelect={() => go(`/contacts/${contact.id}`)}
                    >
                      <User />
                      <span className="truncate">{contact.name}</span>
                      {contact.phone && (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatPhone(contact.phone)}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {projects.length > 0 && (
                <CommandGroup heading="프로젝트">
                  {projects.map((project) => (
                    <CommandItem
                      key={project.id}
                      value={`project-${project.id}`}
                      onSelect={() => go(`/projects/${project.id}`)}
                    >
                      <FolderKanban />
                      <span className="truncate">
                        {project.title || project.customerName || '제목 없음'}
                      </span>
                      <span className="ml-auto max-w-48 shrink-0 truncate text-xs text-muted-foreground">
                        {project.archivedAt
                          ? '종료'
                          : [project.title ? project.customerName : null, project.nextStepTitle]
                              .filter(Boolean)
                              .join(' · ')}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {listings.length > 0 && (
                <CommandGroup heading="매물">
                  {listings.map((listing) => (
                    <CommandItem
                      key={listing.id}
                      value={`listing-${listing.id}`}
                      onSelect={() => go(`/properties/${listing.propertyId}`)}
                    >
                      <Building2 />
                      <span className="truncate">{listingTitle(listing)}</span>
                      {listingStatusLabel(listing) ? (
                        <span className="shrink-0 rounded-[4px] bg-neutral-soft px-1.5 text-[11px] leading-5 text-muted-foreground">
                          {listingStatusLabel(listing)}
                        </span>
                      ) : null}
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                        {listingPrice(listing)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {deals.length > 0 && (
                <CommandGroup heading="거래">
                  {deals.map((deal) => {
                    // 거래 화면과 같은 말: 단계 이름은 공용 상태 이름(dealStage, 끝난 거래는 '정산 종료'),
                    // 취소는 종료된 거래 목록의 '거래 취소'
                    const ended = deal.isCancelled ? '거래 취소' : null
                    const amount = formatDealAmount(deal)
                    return (
                      <CommandItem
                        key={deal.id}
                        value={`deal-${deal.id}`}
                        onSelect={() => go(`/deals?dealId=${encodeURIComponent(deal.id)}`)}
                      >
                        <Handshake />
                        <span className="truncate">
                          {deal.property ? getDealTitle(deal) : formatPartyNames(deal) || '거래'}
                        </span>
                        <span className="shrink-0 rounded-[4px] bg-neutral-soft px-1.5 text-[11px] leading-5 text-muted-foreground">
                          {ended ?? getStatusMeta('dealStage', normalizeDealStage(deal.stage)).label}
                        </span>
                        <span className="ml-auto max-w-48 shrink-0 truncate text-xs text-muted-foreground tabular-nums">
                          {[deal.property ? formatPartyNames(deal) : null, amount !== '—' ? amount : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}

              {sites.length > 0 && (
                <CommandGroup heading="관리단지">
                  {sites.map((officeSite) => (
                    <CommandItem
                      key={officeSite.id}
                      value={`site-${officeSite.id}`}
                      onSelect={() => go(siteRoute(officeSite.siteId))}
                    >
                      <MapPin />
                      <span className="truncate">{officeSite.site?.name}</span>
                      {(officeSite.site?.roadAddress ?? officeSite.site?.jibunAddress) && (
                        <span className="ml-auto max-w-48 shrink-0 truncate text-xs text-muted-foreground">
                          {officeSite.site?.roadAddress ?? officeSite.site?.jibunAddress}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {menus.length > 0 && (
                <CommandGroup heading="메뉴">
                  {menus.map((menu) => (
                    <CommandItem
                      key={menu.path}
                      value={`menu-${menu.path}`}
                      onSelect={() => go(menu.path)}
                    >
                      <SquareArrowOutUpRight />
                      <span className="truncate">{menu.label}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {menu.context}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
            <div
              className={cn(
                'flex items-center gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground',
              )}
            >
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft className="size-3" aria-hidden />
                열기
              </span>
              <span>↑↓ 고르기</span>
              <span>Esc 닫기</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
