import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Building2, MapPin, Search, User } from 'lucide-react'
import { formatPrice } from '@estate-erp/shared'

import { api } from '@/lib/api'
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

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
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

  const debouncedQuery = useDebouncedValue(query, 300)
  const trimmed = debouncedQuery.trim()
  const enabled = open && trimmed.length > 0

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

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
  const hasResults = contacts.length > 0 || sites.length > 0 || listings.length > 0

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
          ⌘K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="top-[20%] translate-y-0 overflow-hidden p-0 sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">전역 검색</DialogTitle>
          <DialogDescription className="sr-only">
            연락처, 단지, 매물을 검색합니다
          </DialogDescription>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="연락처 · 단지 · 매물 검색..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[360px]">
              {!enabled && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  이름, 전화번호, 단지명으로 검색하세요
                </p>
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
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
