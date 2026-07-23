import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  Building2,
  ChevronDown,
  MapPin,
  Plus,
  RotateCcw,
  Star,
  X,
} from 'lucide-react';
import type { ServiceVendor, ServiceVendorFilter } from '@estate-erp/api-client';
import {
  SERVICE_CATEGORY_LABEL,
  SERVICE_CATEGORY_ORDER,
  type ServiceCategory,
} from '@estate-erp/shared';

import { DataTable } from '@/components/data-table';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  ConfirmDialog,
  EmptyState,
  FilterBar,
  FilterCount,
  FilterSearch,
  FilterSelect,
  PageHeader,
} from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { normalizeToDistrictCode, useDistrictMap } from './-region-labels';
import { getErrorMessage } from './-vendor-utils';
import { buildVendorColumns } from './-vendor-columns';
import { VendorFormDialog } from './-vendor-form-dialog';
import { VendorDetailDialog } from './-vendor-detail-dialog';

/** 딥링크 검색 파라미터 — 매물 상세 등에서 "이 지역 업체 찾기"로 진입할 때 사용. */
interface VendorSearchParams {
  /** 법정동 코드 (시군구 5자리 권장 — 읍면동 10자리는 시군구로 정규화) */
  district?: string;
  /** 서비스 카테고리 slug (plumbing 등) */
  category?: string;
  /** 검색어 */
  q?: string;
}

export const Route = createFileRoute('/_authenticated/service-vendors/')({
  validateSearch: (search: Record<string, unknown>): VendorSearchParams => {
    const out: VendorSearchParams = {};
    if (typeof search.district === 'string' && search.district)
      out.district = search.district;
    if (typeof search.category === 'string' && search.category)
      out.category = search.category;
    if (typeof search.q === 'string' && search.q) out.q = search.q;
    return out;
  },
  component: ServiceVendorsPage,
});

const SCOPE_OPTIONS = [
  { value: 'public', label: '공용 풀만' },
  { value: 'private', label: '내 업체만' },
];

const CATEGORY_OPTIONS = SERVICE_CATEGORY_ORDER.map((slug) => ({
  value: slug,
  label: SERVICE_CATEGORY_LABEL[slug],
}));

function ServiceVendorsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isPlatformAdmin = !!user?.isPlatformAdmin;
  const myOfficeId = user?.office?.id;
  const urlParams = Route.useSearch();

  const [categoryFilter, setCategoryFilter] = useState<string>(() =>
    urlParams.category &&
    SERVICE_CATEGORY_ORDER.includes(urlParams.category as ServiceCategory)
      ? urlParams.category
      : '',
  );
  const [districtCode, setDistrictCode] = useState<string | null>(() =>
    urlParams.district ? normalizeToDistrictCode(urlParams.district) : null,
  );
  const [searchQuery, setSearchQuery] = useState(urlParams.q ?? '');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [scope, setScope] = useState<'all' | 'public' | 'private'>('all');
  const [tagFilter, setTagFilter] = useState('');

  // 딥링크 파라미터가 마운트 중에 바뀌어도 필터에 반영 (매물 상세 → "이 지역 업체 찾기" 재진입 등)
  useEffect(() => {
    if (
      urlParams.category &&
      SERVICE_CATEGORY_ORDER.includes(urlParams.category as ServiceCategory)
    ) {
      setCategoryFilter(urlParams.category);
    }
    if (urlParams.district) {
      setDistrictCode(normalizeToDistrictCode(urlParams.district));
    }
    if (urlParams.q !== undefined) setSearchQuery(urlParams.q);
  }, [urlParams.category, urlParams.district, urlParams.q]);

  const [editingVendor, setEditingVendor] = useState<ServiceVendor | null>(
    null,
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createAsPublic, setCreateAsPublic] = useState(false);
  const [detailVendor, setDetailVendor] = useState<ServiceVendor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceVendor | null>(null);

  const filter: ServiceVendorFilter = useMemo(
    () => ({
      category: categoryFilter || undefined,
      district: districtCode ?? undefined,
      search: searchQuery.trim() || undefined,
      favoritesOnly: favoritesOnly || undefined,
      scope,
    }),
    [categoryFilter, districtCode, searchQuery, favoritesOnly, scope],
  );

  const {
    data: vendors = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['service-vendors', filter],
    queryFn: () => api.serviceVendors.findAll(filter),
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: (vendorId: string) =>
      api.serviceVendors.toggleFavorite(vendorId),
    onMutate: async (vendorId) => {
      await queryClient.cancelQueries({ queryKey: ['service-vendors'] });
      const snapshots = queryClient.getQueriesData<ServiceVendor[]>({
        queryKey: ['service-vendors'],
      });
      for (const [key, prev] of snapshots) {
        if (!prev) continue;
        queryClient.setQueryData(
          key,
          prev.map((v) =>
            v.id === vendorId ? { ...v, isFavorite: !v.isFavorite } : v,
          ),
        );
      }
      return { snapshots };
    },
    onError: (e, _v, ctx) => {
      if (ctx) {
        for (const [key, prev] of ctx.snapshots)
          queryClient.setQueryData(key, prev);
      }
      toast.error(getErrorMessage(e));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['service-vendors'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (vendorId: string) => api.serviceVendors.remove(vendorId),
    onSuccess: () => {
      toast.success('업체가 삭제되었습니다');
      queryClient.invalidateQueries({ queryKey: ['service-vendors'] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // 태그 필터 (클라이언트 측 — 서버 검색은 태그를 포함하지 않으므로 결과 내 좁히기)
  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendors) for (const t of v.tags) set.add(t);
    if (tagFilter) set.add(tagFilter); // 결과에서 사라져도 해제 가능하게 유지
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map((t) => ({ value: t, label: t }));
  }, [vendors, tagFilter]);

  const visibleVendors = useMemo(
    () =>
      tagFilter ? vendors.filter((v) => v.tags.includes(tagFilter)) : vendors,
    [vendors, tagFilter],
  );

  const activeFilterCount =
    (categoryFilter ? 1 : 0) +
    (districtCode ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0) +
    (favoritesOnly ? 1 : 0) +
    (scope !== 'all' ? 1 : 0) +
    (tagFilter ? 1 : 0);

  const resetFilters = () => {
    setCategoryFilter('');
    setDistrictCode(null);
    setSearchQuery('');
    setFavoritesOnly(false);
    setScope('all');
    setTagFilter('');
  };

  const { mutate: toggleFavorite } = toggleFavoriteMutation;
  const columns = useMemo(
    () =>
      buildVendorColumns({
        myOfficeId,
        isPlatformAdmin,
        onToggleFavorite: (id) => toggleFavorite(id),
        onEdit: (v) => setEditingVendor(v),
        onDelete: (v) => setDeleteTarget(v),
      }),
    [myOfficeId, isPlatformAdmin, toggleFavorite],
  );

  return (
    <div className="-mx-4 -mb-4 flex min-h-0 min-w-0 flex-1 flex-col p-4 pt-0">
      <PageHeader
        title="업체 디렉토리"
        description="단골 수리·시공 업체와 공용 업체 풀을 한 곳에서 관리합니다"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreateAsPublic(false);
                setIsCreateOpen(true);
              }}
            >
              <Plus className="mr-1 size-4" />내 업체 등록
            </Button>
            {isPlatformAdmin && (
              <Button
                size="sm"
                onClick={() => {
                  setCreateAsPublic(true);
                  setIsCreateOpen(true);
                }}
              >
                <Plus className="mr-1 size-4" />공용 업체 등록
              </Button>
            )}
          </>
        }
      />

      <FilterBar className="mb-4">
        <FilterSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="업체명·메모·설명 검색"
        />
        <FilterSelect
          label="카테고리"
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={CATEGORY_OPTIONS}
        />
        <DistrictFilter value={districtCode} onChange={setDistrictCode} />
        <FilterSelect
          label="범위"
          value={scope === 'all' ? '' : scope}
          onChange={(v) =>
            setScope(v === '' ? 'all' : (v as 'public' | 'private'))
          }
          options={SCOPE_OPTIONS}
        />
        {tagOptions.length > 0 && (
          <FilterSelect
            label="태그"
            value={tagFilter}
            onChange={setTagFilter}
            options={tagOptions}
          />
        )}
        <Button
          type="button"
          size="sm"
          variant={favoritesOnly ? 'default' : 'outline'}
          className={cn('h-8', !favoritesOnly && 'bg-background')}
          onClick={() => setFavoritesOnly((v) => !v)}
        >
          <Star
            className={cn('mr-1 size-3.5', favoritesOnly && 'fill-current')}
          />
          즐겨찾기
        </Button>
        {activeFilterCount > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={resetFilters}>
            <RotateCcw className="mr-1 size-3.5" />
            초기화
          </Button>
        )}
        <FilterCount n={visibleVendors.length} unit="곳" />
      </FilterBar>

      {/* 본문 */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-background">
        {isError ? (
          <EmptyState
            icon={AlertCircle}
            title="업체 목록을 불러오지 못했습니다"
            description={getErrorMessage(error)}
            className="my-auto"
            action={
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <RotateCcw className="mr-1 size-3.5" />
                다시 시도
              </Button>
            }
          />
        ) : !isLoading && visibleVendors.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={
              activeFilterCount > 0
                ? '조건에 맞는 협력업체가 없습니다'
                : '등록된 협력업체가 없습니다'
            }
            description={
              activeFilterCount > 0
                ? '필터 조건을 바꾸거나 초기화해 보세요.'
                : '자주 쓰는 수리·시공 업체를 등록해두면 하자 처리 때 바로 연락할 수 있습니다.'
            }
            className="my-auto"
            action={
              activeFilterCount > 0 ? (
                <Button size="sm" variant="outline" onClick={resetFilters}>
                  <RotateCcw className="mr-1 size-3.5" />
                  필터 초기화
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setCreateAsPublic(false);
                    setIsCreateOpen(true);
                  }}
                >
                  <Plus className="mr-1 size-4" />내 업체 등록
                </Button>
              )
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={visibleVendors}
            layout="full-height"
            rowHeight={56}
            isLoading={isLoading}
            onRowClick={(v) => setDetailVendor(v)}
            emptyMessage={
              activeFilterCount > 0
                ? '조건에 맞는 업체가 없습니다'
                : '등록된 업체가 없습니다'
            }
          />
        )}
      </section>

      {/* 등록 다이얼로그 */}
      {isCreateOpen && (
        <VendorFormDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          mode="create"
          isPublic={createAsPublic}
          isPlatformAdmin={isPlatformAdmin}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['service-vendors'] });
            setIsCreateOpen(false);
          }}
        />
      )}

      {/* 수정 다이얼로그 */}
      {editingVendor && (
        <VendorFormDialog
          open={!!editingVendor}
          onOpenChange={(o) => !o && setEditingVendor(null)}
          mode="edit"
          vendor={editingVendor}
          isPublic={editingVendor.officeId === null}
          isPlatformAdmin={isPlatformAdmin}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['service-vendors'] });
            queryClient.invalidateQueries({
              queryKey: ['service-vendor', editingVendor.id],
            });
            setEditingVendor(null);
          }}
        />
      )}

      {/* 상세 다이얼로그 */}
      {detailVendor && (
        <VendorDetailDialog
          vendor={detailVendor}
          isPlatformAdmin={isPlatformAdmin}
          myOfficeId={myOfficeId}
          onOpenChange={(o) => !o && setDetailVendor(null)}
          onEdit={() => {
            setEditingVendor(detailVendor);
            setDetailVendor(null);
          }}
        />
      )}

      {/* 삭제 확인 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="업체 삭제"
        description={
          deleteTarget
            ? `'${deleteTarget.name}' 업체를 삭제하시겠습니까? 담당자 연락처도 함께 삭제됩니다.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────
// 지역 필터 (법정동 검색 → 시군구 코드로 정규화 선택)
// ────────────────────────────────────────────────────────

function DistrictFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (code: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const districtMap = useDistrictMap();

  const { data: options = [] } = useQuery({
    queryKey: ['regions-search', query],
    queryFn: () => api.regions.search(query.trim(), 15),
    enabled: query.trim().length >= 1,
  });

  const suggestions = options.filter((o) => o.level !== 'province');
  const selectedLabel = value ? (districtMap.get(value) ?? value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 bg-background font-normal"
        >
          <MapPin className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">지역</span>
          {selectedLabel ?? '전체'}
          {value ? (
            <X
              className="size-3.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                setQuery('');
              }}
            />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="시군구/읍면동 검색 (예: 강동구)"
          className="h-8"
          autoFocus
        />
        {query.trim() && suggestions.length > 0 && (
          <div className="mt-2 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {suggestions.map((o) => {
              const normalized = normalizeToDistrictCode(o.code);
              return (
                <button
                  key={`${o.level}-${o.code}`}
                  type="button"
                  className="rounded-sm px-2 py-1 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onChange(normalized);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  {o.fullName}
                  {o.level === 'ward' && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      → {districtMap.get(normalized) ?? '시군구'} 기준
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {query.trim() && suggestions.length === 0 && (
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            검색 결과가 없습니다.
          </p>
        )}
        <p className="mt-2 px-1 text-[10px] text-muted-foreground">
          업체 지역은 시군구 단위로 관리됩니다. 읍면동 선택 시 상위 시군구로
          검색합니다.
        </p>
        {value && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="mt-1 w-full"
            onClick={() => {
              onChange(null);
              setQuery('');
              setOpen(false);
            }}
          >
            지역 필터 해제
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
