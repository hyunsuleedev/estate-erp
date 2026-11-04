/**
 * 관리 단지 추가 — 단지명·동네·구 이름으로 찾아 이어서 추가한다.
 *
 * 단지를 여러 개 등록하는 경우가 많아 추가해도 창을 닫지 않고 검색창으로 돌아온다.
 * 이미 관리 중인 단지를 찾았다면 그 자리에서 바로 열 수 있고,
 * 찾는 단지가 없으면 우리 사무소 전용 비공개 단지로 직접 등록할 수 있다.
 */
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Loader2, Plus, RotateCcw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import type { OfficeSite, Site } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/domain';
import { RegisterPrivateSiteForm } from './-register-private-site-form';
import { extractRegionFromSite, formatSiteSummary } from './-site-helpers';
import { SITE_TYPE_ICONS } from './-sites-panel';

const SITE_SEARCH_MIN_LENGTH = 2;
const SITE_SEARCH_DEBOUNCE_MS = 250;
/** 서버 검색이 돌려주는 최대 개수 — 이만큼 왔으면 뒤가 잘렸을 수 있다 */
const SITE_SEARCH_LIMIT = 20;

interface AddSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  officeSites: OfficeSite[];
  onOpenSite: (officeSite: OfficeSite) => void;
}

export function AddSiteDialog({ open, onOpenChange, officeSites, onOpenSite }: AddSiteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* 본문이 창과 함께 사라지므로 다시 열면 검색어와 추가 내역이 비어 있다 */}
        <AddSiteDialogBody
          officeSites={officeSites}
          onOpenSite={(officeSite) => {
            onOpenSite(officeSite);
            onOpenChange(false);
          }}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddSiteDialogBody({
  officeSites,
  onOpenSite,
  onDone,
}: {
  officeSites: OfficeSite[];
  onOpenSite: (officeSite: OfficeSite) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [addedSites, setAddedSites] = useState<OfficeSite[]>([]);
  /** null이면 검색 화면, 값이 있으면 그 이름으로 직접 등록 화면을 연다 */
  const [registerName, setRegisterName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, SITE_SEARCH_DEBOUNCE_MS);
  const canSearch = debouncedQuery.length >= SITE_SEARCH_MIN_LENGTH;

  const search = useQuery({
    queryKey: ['office-sites-search', debouncedQuery],
    queryFn: () => api.officeSites.searchCentral(debouncedQuery),
    enabled: canSearch,
    // 다음 글자를 입력하는 동안 목록이 깜빡이지 않게 이전 결과를 잠시 둔다
    placeholderData: keepPreviousData,
  });
  const results = canSearch ? search.data : undefined;
  const isSearching = trimmedQuery !== debouncedQuery || search.isFetching;
  const isQueryTooShort = trimmedQuery.length < SITE_SEARCH_MIN_LENGTH;

  const addSite = useMutation({
    mutationFn: (siteId: string) => api.officeSites.add({ siteId }),
    onSuccess: (officeSite) => {
      queryClient.invalidateQueries({ queryKey: ['office-sites'] });
      setAddedSites((current) => [...current, officeSite]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '단지 추가에 실패했습니다');
    },
    onSettled: () => {
      // 버튼이 사라지거나 비활성화돼 초점을 잃으므로 검색창으로 돌아온다. 바로 입력하면 검색어가 바뀐다
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  });

  // 추가 직후 목록을 다시 받기 전에도 '추가됨'으로 보이게 하되, 받은 뒤에는 집계가 있는 목록 값을 쓴다
  const managedBySiteId = new Map(
    [...addedSites, ...officeSites].map((officeSite) => [officeSite.siteId, officeSite]),
  );
  const addedSiteIds = new Set(addedSites.map((officeSite) => officeSite.siteId));

  // 새 단지는 관리호수가 없어 사이드바의 접힌 '기록 없는 단지'로 들어간다.
  // 마지막에 추가한 단지를 열어 주면 묶음이 펼쳐져 방금 추가한 단지를 바로 찾을 수 있다
  const handleFinish = () => {
    const lastAdded = addedSites.at(-1);
    if (lastAdded) onOpenSite(managedBySiteId.get(lastAdded.siteId) ?? lastAdded);
    else onDone();
  };

  // ↑↓로 검색창과 결과의 버튼 사이를 오간다
  const handleArrowKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.nativeEvent.isComposing) return;
    const actions = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-add-site-action]:not(:disabled)') ?? [],
    );
    const index = actions.indexOf(document.activeElement as HTMLElement);
    if (index === -1) {
      if (event.key === 'ArrowDown' && actions[0]) {
        event.preventDefault();
        actions[0].focus();
      }
      return;
    }
    event.preventDefault();
    const nextIndex = event.key === 'ArrowDown' ? index + 1 : index - 1;
    if (nextIndex < 0) inputRef.current?.focus();
    else actions[Math.min(nextIndex, actions.length - 1)]?.focus();
  };

  const renderResults = () => {
    if (isQueryTooShort) {
      return (
        <EmptyState
          icon={Search}
          title={trimmedQuery ? '2글자 이상 입력하세요' : '단지명, 동네, 구 이름으로 찾아보세요'}
          description="예: 그라시움, 고덕동, 강동구"
          className="py-16"
        />
      );
    }
    if (search.isError && !isSearching) {
      return (
        <EmptyState
          icon={Building2}
          title="단지를 검색하지 못했습니다"
          description="네트워크 상태를 확인한 뒤 다시 시도해주세요"
          action={
            <Button variant="outline" size="sm" onClick={() => search.refetch()}>
              <RotateCcw className="size-3.5" />
              다시 시도
            </Button>
          }
          className="py-16"
        />
      );
    }
    if (!results || (results.length === 0 && isSearching)) {
      return (
        <div className="space-y-1 p-1" aria-label="단지 검색 중">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-2.5 px-2.5 py-2.5">
              <Skeleton className="size-4 shrink-0 rounded" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5" style={{ width: `${34 + ((index * 17) % 26)}%` }} />
                <Skeleton className="h-3" style={{ width: `${56 + ((index * 13) % 30)}%` }} />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (results.length === 0) {
      return (
        <EmptyState
          icon={Search}
          title={`'${debouncedQuery}' 검색 결과가 없습니다`}
          description="찾는 단지가 없으면 우리 사무소 전용으로 직접 등록할 수 있습니다"
          action={
            <Button variant="outline" size="sm" onClick={() => setRegisterName(debouncedQuery)}>
              <Plus className="size-3.5" />
              단지 직접 등록
            </Button>
          }
          className="py-16"
        />
      );
    }
    return (
      <>
        {/* 오른쪽 여백은 스크롤바가 버튼 위에 겹치지 않게 비워 둔다 */}
        <ul ref={listRef} className="space-y-0.5 pr-2.5" aria-label="단지 검색 결과">
          {results.map((site) => {
            const managed = managedBySiteId.get(site.id);
            return (
              <SiteResultRow
                key={site.id}
                site={site}
                managed={managed}
                justAdded={addedSiteIds.has(site.id)}
                isAdding={addSite.isPending && addSite.variables === site.id}
                addDisabled={addSite.isPending}
                onAdd={() => addSite.mutate(site.id)}
                onOpen={() => managed && onOpenSite(managed)}
              />
            );
          })}
        </ul>
        <div className="space-y-1 px-2.5 py-3 text-center text-xs text-muted-foreground">
          {results.length >= SITE_SEARCH_LIMIT && (
            <p>최대 {SITE_SEARCH_LIMIT}개까지 표시합니다. 찾는 단지가 없으면 더 자세히 입력해보세요</p>
          )}
          <p>
            찾는 단지가 없나요?{' '}
            <button
              type="button"
              className="rounded-sm font-medium text-foreground underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2 focus-visible:ring-ring/70"
              onClick={() => setRegisterName(trimmedQuery)}
            >
              직접 등록
            </button>
          </p>
        </div>
      </>
    );
  };

  if (registerName !== null) {
    return (
      <RegisterPrivateSiteForm
        initialName={registerName}
        onBack={() => setRegisterName(null)}
        onRegistered={onOpenSite}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>관리 단지 추가</DialogTitle>
        <DialogDescription>여러 단지를 이어서 추가할 수 있습니다</DialogDescription>
      </DialogHeader>
      <div className="min-w-0 space-y-3" onKeyDown={handleArrowKeys}>
        <div className="flex h-9 items-center gap-2 rounded-full bg-[#f1f0ec] pl-3.5 pr-1.5 text-muted-foreground transition-colors focus-within:bg-white focus-within:shadow-[inset_0_0_0_1px_rgba(55,53,47,0.3)]">
          {isSearching && !isQueryTooShort ? (
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4 shrink-0" aria-hidden="true" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="단지명, 동네, 구 이름으로 검색"
            aria-label="추가할 단지 검색"
            autoComplete="off"
            autoFocus
            className="w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[#a5a39f] outline-none hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="검색어 지우기"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* 상태가 바뀌어도 창 크기가 흔들리지 않게 높이를 고정한다.
            ScrollArea 안쪽 기본값(display: table)은 긴 단지명을 말줄임하지 않고 버튼을 창 밖으로 밀어내므로 block으로 바꾼다 */}
        <ScrollArea className="h-[min(340px,50vh)] [&_[data-slot=scroll-area-viewport]>div]:!block">
          {renderResults()}
        </ScrollArea>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="min-w-0 truncate text-xs text-muted-foreground" aria-live="polite">
            {addedSites.length > 0 ? `단지 ${addedSites.length}개를 추가했습니다` : ''}
          </p>
          <Button
            size="sm"
            variant={addedSites.length > 0 ? 'default' : 'outline'}
            className="shrink-0"
            onClick={handleFinish}
          >
            {addedSites.length > 0 ? '완료' : '닫기'}
          </Button>
        </div>
      </div>
    </>
  );
}

function SiteResultRow({
  site,
  managed,
  justAdded,
  isAdding,
  addDisabled,
  onAdd,
  onOpen,
}: {
  site: Site;
  managed: OfficeSite | undefined;
  justAdded: boolean;
  isAdding: boolean;
  addDisabled: boolean;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const TypeIcon = SITE_TYPE_ICONS[site.type] ?? Building2;
  const address = site.roadAddress || site.jibunAddress || extractRegionFromSite(site);

  return (
    <li className="flex min-w-0 items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors hover:bg-accent">
      <TypeIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium" title={site.name}>
          {site.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {!site.isPublic && <span className="font-medium">비공개 · </span>}
          {formatSiteSummary(site)}
        </p>
        <p className="truncate text-xs text-muted-foreground/80" title={address}>
          {address}
        </p>
      </div>
      {managed ? (
        <>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3" aria-hidden="true" />
            {justAdded ? '추가됨' : '관리 중'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2.5 text-xs"
            data-add-site-action
            aria-label={`${site.name} 열기`}
            onClick={onOpen}
          >
            열기
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 px-2.5 text-xs"
          data-add-site-action
          aria-label={`${site.name} 추가`}
          disabled={addDisabled}
          onClick={onAdd}
        >
          {isAdding ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-3" aria-hidden="true" />
          )}
          추가
        </Button>
      )}
    </li>
  );
}
