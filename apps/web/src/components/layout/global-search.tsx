import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  BookUser,
  Building2,
  LayoutDashboard,
  MapPin,
  Plus,
  Search,
  User,
  UserSearch,
} from 'lucide-react'
import { formatPrice } from '@estate-erp/shared'

import { api } from '@/lib/api'
import { useAuth } from '@/providers/auth-provider'
import { getNavGroups } from '@/components/layout/nav-config'
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
  CommandSeparator,
} from '@/components/ui/command'

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
}

const QUICK_PAGE_PATHS = [
  '/dashboard',
  '/properties',
  '/contacts',
  '/consultations',
  '/tasks',
  '/calendar',
]

const GO_SHORTCUTS: Record<string, string> = {
  d: '/dashboard',
  p: '/properties',
  c: '/contacts',
  s: '/consultations',
  t: '/tasks',
  a: '/calendar',
}

const PAGE_SHORTCUTS: Record<string, string> = {
  '/dashboard': 'G D',
  '/properties': 'G P',
  '/contacts': 'G C',
  '/consultations': 'G S',
  '/tasks': 'G T',
  '/calendar': 'G A',
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/**
 * 전역 검색 (⌘K 커맨드 팔레트).
 * 검색 그룹: 연락처(contacts.findAll search) · 단지(officeSites.searchCentral) · 매물(listings.findAll search).
 * 서버 검색 결과를 그대로 쓰므로 cmdk 자체 필터링은 끔 (shouldFilter=false).
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { user } = useAuth()
  const goPrefixRef = useRef(false)
  const goPrefixTimerRef = useRef<number | null>(null)

  const pageItems = useMemo(() => {
    const entries = new Map<
      string,
      { path: string; label: string; section: string; icon: typeof LayoutDashboard }
    >()

    for (const group of getNavGroups(user?.role)) {
      for (const item of group.items) {
        if (item.children?.length) {
          for (const child of item.children) {
            entries.set(child.path, {
              path: child.path,
              label: child.path === item.path ? child.label : `${item.label} · ${child.label}`,
              section: group.label,
              icon: item.icon,
            })
          }
          continue
        }

        entries.set(item.path, {
          path: item.path,
          label: item.label,
          section: group.label,
          icon: item.icon,
        })
      }
    }

    return Array.from(entries.values())
  }, [user?.role])

  const quickPages = useMemo(
    () =>
      QUICK_PAGE_PATHS.map((path) => pageItems.find((item) => item.path === path)).filter(
        (item): item is (typeof pageItems)[number] => !!item,
      ),
    [pageItems],
  )

  const debouncedQuery = useDebouncedValue(query, 300)
  const trimmed = debouncedQuery.trim()
  const enabled = open && trimmed.length > 0
  const pageQuery = query.trim().toLocaleLowerCase('ko')
  const matchedPages = useMemo(
    () =>
      pageQuery.length === 0
        ? []
        : pageItems
            .filter((item) =>
              `${item.label} ${item.section}`.toLocaleLowerCase('ko').includes(pageQuery),
            )
            .slice(0, 8),
    [pageItems, pageQuery],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((prev) => !prev)
        return
      }

      const target = event.target as HTMLElement | null
      const isTyping =
        target?.isContentEditable ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT'
      if (open || isTyping || event.metaKey || event.ctrlKey || event.altKey) return

      const key = event.key.toLocaleLowerCase('en')
      if (goPrefixRef.current) {
        goPrefixRef.current = false
        if (goPrefixTimerRef.current !== null) {
          window.clearTimeout(goPrefixTimerRef.current)
          goPrefixTimerRef.current = null
        }
        const destination = GO_SHORTCUTS[key]
        if (destination) {
          event.preventDefault()
          void navigate({ to: destination as never })
        }
        return
      }

      if (key === 'g') {
        goPrefixRef.current = true
        goPrefixTimerRef.current = window.setTimeout(() => {
          goPrefixRef.current = false
          goPrefixTimerRef.current = null
        }, 900)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (goPrefixTimerRef.current !== null) window.clearTimeout(goPrefixTimerRef.current)
    }
  }, [navigate, open])

  const contactsQuery = useQuery({
    queryKey: ['global-search', 'contacts', trimmed],
    queryFn: () => api.contacts.findAll({ search: trimmed, limit: 5 }),
    enabled,
  })
  const sitesQuery = useQuery({
    queryKey: ['global-search', 'sites', trimmed],
    queryFn: () => api.officeSites.searchCentral(trimmed),
    enabled,
  })
  const listingsQuery = useQuery({
    queryKey: ['global-search', 'listings', trimmed],
    queryFn: () => api.listings.findAll({ search: trimmed, limit: 5 }),
    enabled,
  })

  const contacts = contactsQuery.data?.items ?? []
  const sites = (sitesQuery.data ?? []).slice(0, 5)
  const listings = listingsQuery.data?.items ?? []

  const isSearching =
    enabled &&
    (contactsQuery.isFetching || sitesQuery.isFetching || listingsQuery.isFetching)
  const hasResults =
    matchedPages.length > 0 || contacts.length > 0 || sites.length > 0 || listings.length > 0

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
  const shortcutLabel = isMac ? '⌘ K' : 'Ctrl K'

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setQuery('')
  }

  const closeAndNavigate = (fn: () => void) => {
    handleOpenChange(false)
    fn()
  }

  const listingTitle = (listing: (typeof listings)[number]) => {
    const property = listing.property
    const siteName = property?.site?.name ?? '매물'
    const dong = property?.unit?.dong
    const dongName = dong && !dong.isPlaceholder ? ` ${dong.name}` : ''
    const unitName = property?.unit?.name ? ` ${property.unit.name}` : ''
    return `${siteName}${dongName}${unitName}`
  }

  const listingPrice = (listing: (typeof listings)[number]) => {
    const typeLabel = TRANSACTION_TYPE_LABELS[listing.transactionType] ?? listing.transactionType
    if (listing.transactionType === 'monthly') {
      const deposit = listing.deposit != null ? formatPrice(listing.deposit) : '—'
      const rent = listing.monthlyRent != null ? listing.monthlyRent.toLocaleString() : '—'
      return `${typeLabel} ${deposit} / ${rent}`
    }
    const amount = listing.price != null ? formatPrice(listing.price) : '—'
    return `${typeLabel} ${amount}`
  }

  return (
    <>
      {/* 디자인 헤더 검색 트리거: 34px 높이 · 280px · muted 배경 */}
      <Button
        variant="ghost"
        size="sm"
        className="h-[34px] w-40 justify-start gap-2 rounded-[9px] border border-[#ececea] bg-muted px-3 font-normal text-[#a8a59f] hover:bg-muted sm:w-[280px]"
        onClick={() => setOpen(true)}
      >
        <Search className="size-[15px]" />
        <span className="flex-1 text-left text-[13px]">전체 검색</span>
        <kbd className="pointer-events-none hidden items-center rounded bg-[#efedea] px-[5px] py-px text-[10px] font-semibold text-[#b2afa9] sm:inline-flex">
          {shortcutLabel}
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="top-[16%] translate-y-0 overflow-hidden p-0 sm:max-w-[640px]"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">전역 검색</DialogTitle>
          <DialogDescription className="sr-only">
            페이지, 연락처, 단지, 매물을 검색하거나 새 업무를 시작합니다
          </DialogDescription>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="연락처 · 단지 · 매물 검색..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[440px]">
              {!enabled && (
                <>
                  <CommandGroup heading="바로 이동">
                    {quickPages.map((page) => {
                      const PageIcon = page.icon
                      return (
                        <CommandItem
                          key={page.path}
                          value={`quick-page-${page.path}`}
                          onSelect={() =>
                            closeAndNavigate(() => navigate({ to: page.path as never }))
                          }
                        >
                          <PageIcon />
                          <span>{page.label}</span>
                          <kbd className="ml-auto rounded border bg-muted/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {PAGE_SHORTCUTS[page.path]}
                          </kbd>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                  <CommandSeparator />
                  <CommandGroup heading="새로 만들기">
                    <CommandItem
                      value="create-property"
                      onSelect={() =>
                        closeAndNavigate(() => navigate({ to: '/properties/new' }))
                      }
                    >
                      <Building2 />
                      <span>매물 등록</span>
                      <Plus className="ml-auto size-3.5" />
                    </CommandItem>
                    <CommandItem
                      value="create-contact"
                      onSelect={() => closeAndNavigate(() => navigate({ to: '/contacts/new' }))}
                    >
                      <BookUser />
                      <span>연락처 추가</span>
                      <Plus className="ml-auto size-3.5" />
                    </CommandItem>
                    <CommandItem
                      value="create-buyer-requirement"
                      onSelect={() =>
                        closeAndNavigate(() => navigate({ to: '/buyer-requirements/new' }))
                      }
                    >
                      <UserSearch />
                      <span>구매·임차 희망조건 등록</span>
                      <Plus className="ml-auto size-3.5" />
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
              {enabled && isSearching && !hasResults && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  검색 중...
                </p>
              )}
              {enabled && !isSearching && !hasResults && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  검색 결과가 없습니다
                </p>
              )}

              {matchedPages.length > 0 && (
                <CommandGroup heading="페이지">
                  {matchedPages.map((page) => {
                    const PageIcon = page.icon
                    return (
                      <CommandItem
                        key={page.path}
                        value={`page-${page.path}`}
                        onSelect={() =>
                          closeAndNavigate(() => navigate({ to: page.path as never }))
                        }
                      >
                        <PageIcon />
                        <span className="truncate">{page.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{page.section}</span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}

              {contacts.length > 0 && (
                <CommandGroup heading="연락처">
                  {contacts.map((contact) => (
                    <CommandItem
                      key={contact.id}
                      value={`contact-${contact.id}`}
                      onSelect={() =>
                        closeAndNavigate(() =>
                          navigate({
                            to: '/contacts/$id',
                            params: { id: contact.id },
                          }),
                        )
                      }
                    >
                      <User />
                      <span className="truncate">{contact.name}</span>
                      {contact.phone && (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {contact.phone}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {sites.length > 0 && (
                <CommandGroup heading="단지">
                  {sites.map((site) => (
                    <CommandItem
                      key={site.id}
                      value={`site-${site.id}`}
                      onSelect={() =>
                        closeAndNavigate(() => navigate({ to: '/sites' }))
                      }
                    >
                      <MapPin />
                      <span className="truncate">{site.name}</span>
                      {(site.roadAddress ?? site.jibunAddress) && (
                        <span className="ml-auto max-w-48 shrink-0 truncate text-xs text-muted-foreground">
                          {site.roadAddress ?? site.jibunAddress}
                        </span>
                      )}
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
                      onSelect={() =>
                        closeAndNavigate(() =>
                          navigate({
                            to: '/properties/$id',
                            params: { id: listing.propertyId },
                          }),
                        )
                      }
                    >
                      <Building2 />
                      <span className="truncate">{listingTitle(listing)}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                        {listingPrice(listing)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
            <div className="flex items-center gap-3 border-t bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
              <span><kbd className="rounded border bg-background px-1">↑↓</kbd> 이동</span>
              <span><kbd className="rounded border bg-background px-1">Enter</kbd> 열기</span>
              <span><kbd className="rounded border bg-background px-1">Esc</kbd> 닫기</span>
              <span className="ml-auto hidden sm:inline">어디서든 G 다음 P/C/S/T로 바로 이동</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
