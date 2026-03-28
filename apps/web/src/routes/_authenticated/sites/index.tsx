import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Search, Plus, X, Frame } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/sites/')({
  component: SitesPage,
});

function SitesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const { data: officeSites, isLoading } = useQuery({
    queryKey: ['office-sites'],
    queryFn: () => api.officeSites.findAll(),
  });

  const { data: searchResults } = useQuery({
    queryKey: ['office-sites-search', searchQuery],
    queryFn: () => api.officeSites.searchCentral(searchQuery),
    enabled: searchQuery.length >= 2,
  });

  const addMutation = useMutation({
    mutationFn: (siteId: string) => api.officeSites.add({ siteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['office-sites'] });
      setSearchQuery('');
      setShowSearch(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.officeSites.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['office-sites'] }),
  });

  const existingSiteIds = new Set(officeSites?.map((os) => os.siteId) ?? []);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">관리 단지</h1>
          <span className="text-xs text-muted-foreground">
            {officeSites?.length ?? 0}개
          </span>
        </div>
        <Button
          size="sm"
          variant={showSearch ? 'outline' : 'default'}
          onClick={() => setShowSearch(!showSearch)}
        >
          {showSearch ? <X className="size-4" /> : <Plus className="size-4" />}
          {showSearch ? '닫기' : '단지 추가'}
        </Button>
      </div>

      {/* Search panel */}
      {showSearch && (
        <div className="rounded-xl bg-muted/50">
          <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
            <Search className="size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="단지명 검색 (2글자 이상)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="h-7 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
          {searchResults && searchResults.length > 0 && (
            <ul className="max-h-60 divide-y divide-border/40 overflow-auto">
              {searchResults.map((site) => (
                <li
                  key={site.id}
                  className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-muted/80"
                >
                  <div>
                    <p className="text-sm font-medium">{site.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {site.roadAddress || site.jibunAddress || '-'}
                    </p>
                  </div>
                  {existingSiteIds.has(site.id) ? (
                    <span className="text-xs text-muted-foreground">추가됨</span>
                  ) : (
                    <Button
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => addMutation.mutate(site.id)}
                      disabled={addMutation.isPending}
                    >
                      추가
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {searchQuery.length >= 2 && searchResults?.length === 0 && (
            <p className="px-4 py-4 text-center text-sm text-muted-foreground">
              검색 결과가 없습니다.
            </p>
          )}
        </div>
      )}

      {/* Site list */}
      <div className="rounded-xl bg-muted/50">
        {isLoading ? (
          <div className="space-y-0 divide-y divide-border/40">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-4" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : officeSites?.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            관리 단지가 없습니다. 위에서 단지를 추가하세요.
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {officeSites?.map((os) => (
              <li
                key={os.id}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/80"
              >
                <div className="flex items-center gap-2.5">
                  <Frame className="size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{os.site?.name ?? '-'}</p>
                    <p className="text-xs text-muted-foreground">
                      {os.site?.roadAddress || os.site?.jibunAddress || '-'}
                    </p>
                    {os.memo && <p className="mt-0.5 text-xs text-muted-foreground">{os.memo}</p>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMutation.mutate(os.id)}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
