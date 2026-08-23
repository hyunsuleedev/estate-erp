import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, ImageIcon, Search, Star, Trash2 } from 'lucide-react';
import type { PropertyPhoto } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ConfirmDialog,
  EmptyState,
  EntityChip,
  FilterBar,
  FilterCount,
  FilterSearch,
  FilterSelect,
  PageHeader,
} from '@/components/domain';
import { DocumentsNav } from './-documents-nav';

export const Route = createFileRoute('/_authenticated/documents/photos')({
  component: PhotoSearchPage,
});

const categoryLabels: Record<string, string> = {
  exterior: '외관',
  living: '거실',
  kitchen: '주방',
  bathroom: '욕실',
  bedroom: '침실',
  balcony: '베란다',
  entrance: '현관',
  parking: '주차장',
  view: '전망',
  floorplan: '평면도',
  other: '기타',
};

const categoryOptions = Object.entries(categoryLabels).map(([value, label]) => ({
  value,
  label,
}));

/** 입력 디바운스 — 키 입력마다 쿼리가 발사되지 않도록 350ms 지연. */
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function PhotoSearchPage() {
  const queryClient = useQueryClient();
  const [siteName, setSiteName] = useState('');
  const [typeName, setTypeName] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lightbox, setLightbox] = useState<PropertyPhoto | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const debouncedSiteName = useDebounced(siteName.trim());
  const debouncedTypeName = useDebounced(typeName.trim());

  const hasFilter = debouncedSiteName.length >= 2 || debouncedTypeName.length >= 1;

  const {
    data: photos,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['property-photos', 'search', debouncedSiteName, debouncedTypeName],
    queryFn: () =>
      api.propertyPhotos.search({
        ...(debouncedSiteName.length >= 2 ? { siteName: debouncedSiteName } : {}),
        ...(debouncedTypeName.length >= 1 ? { siteUnitTypeName: debouncedTypeName } : {}),
      }),
    enabled: hasFilter,
  });

  // 카테고리 필터는 클라이언트 측 적용 (평면도만 모아보기 등)
  const visiblePhotos = useMemo(
    () =>
      (photos ?? []).filter(
        (photo) => !categoryFilter || photo.category === categoryFilter,
      ),
    [photos, categoryFilter],
  );

  // 매물별 대표 사진(sortOrder 최솟값) — 필터와 무관하게 원본 데이터 기준
  const repPhotoIds = useMemo(() => {
    const map = new Map<string, { id: string; sortOrder: number }>();
    for (const photo of photos ?? []) {
      const current = map.get(photo.propertyId);
      if (!current || photo.sortOrder < current.sortOrder) {
        map.set(photo.propertyId, { id: photo.id, sortOrder: photo.sortOrder });
      }
    }
    return new Map(Array.from(map, ([propertyId, v]) => [propertyId, v.id]));
  }, [photos]);

  // 매물(Property) 단위 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { label: string; propertyId: string; photos: PropertyPhoto[] }
    >();
    for (const photo of visiblePhotos) {
      const propId = photo.property?.id ?? photo.propertyId;
      if (!map.has(propId)) {
        const p = photo.property;
        const label = p
          ? [
              p.site.name,
              p.unit?.siteUnitType?.name,
              p.unit?.dong?.name,
              p.unit?.name && `${p.unit.name}호`,
            ]
              .filter(Boolean)
              .join(' ')
          : propId;
        map.set(propId, { label, propertyId: propId, photos: [] });
      }
      map.get(propId)!.photos.push(photo);
    }
    return map;
  }, [visiblePhotos]);

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, category }: { id: string; category: string }) =>
      api.propertyPhotos.update(id, { category }),
    meta: { invalidates: [['property-photos']] },
    onSuccess: (updated) => {
      toast.success('사진 카테고리가 변경되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['property-photos'] });
      setLightbox((prev) => (prev && prev.id === updated.id ? { ...prev, category: updated.category } : prev));
    },
    onError: () => toast.error('카테고리 변경에 실패했습니다.'),
  });

  // 대표 사진 지정 — 해당 매물의 전체 사진 순서에서 맨 앞으로 이동
  const setRepresentativeMutation = useMutation({
    mutationFn: (photo: PropertyPhoto) => {
      const ids = (photos ?? [])
        .filter((p) => p.propertyId === photo.propertyId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => p.id);
      const reordered = [photo.id, ...ids.filter((id) => id !== photo.id)];
      return api.propertyPhotos.reorder(photo.propertyId, reordered);
    },
    meta: { invalidates: [['property-photos']] },
    onSuccess: () => {
      toast.success('대표 사진으로 설정되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['property-photos'] });
    },
    onError: () => toast.error('대표 사진 설정에 실패했습니다.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.propertyPhotos.remove(id),
    meta: { invalidates: [['property-photos']] },
    onSuccess: () => {
      toast.success('사진이 삭제되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['property-photos'] });
      setDeleteOpen(false);
      setLightbox(null);
    },
    onError: () => toast.error('사진 삭제에 실패했습니다.'),
  });

  return (
    <div className="flex flex-col">
      <PageHeader
        title="자료실"
        description="단지명이나 평형(84A 등)으로 등록된 매물 사진을 검색하고 관리합니다. 사진 업로드는 저장소 연동 후 제공될 예정이며, 현재는 등록된 사진의 조회·분류·삭제만 가능합니다."
      />
      <DocumentsNav />

      <FilterBar className="mb-4">
        <FilterSearch
          value={siteName}
          onChange={setSiteName}
          placeholder="단지명 (예: 고덕그라시움)"
        />
        <Input
          value={typeName}
          onChange={(e) => setTypeName(e.target.value)}
          placeholder="평형 (예: 84A)"
          className="h-8 w-28 bg-background"
        />
        <FilterSelect
          label="카테고리"
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={categoryOptions}
        />
        {hasFilter && !isLoading && !isError && (
          <FilterCount n={visiblePhotos.length} unit="장" />
        )}
      </FilterBar>

      {!hasFilter ? (
        <EmptyState
          icon={Search}
          title="단지명을 2글자 이상 입력하세요"
          description="단지명 또는 평형으로 검색하면 해당 매물의 사진을 모아볼 수 있습니다."
        />
      ) : isLoading ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="사진을 불러오지 못했습니다"
          description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              다시 시도
            </Button>
          }
        />
      ) : visiblePhotos.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="검색 결과가 없습니다"
          description={
            categoryFilter
              ? '카테고리 필터를 해제하거나 다른 조건으로 검색해보세요.'
              : '다른 단지명이나 평형으로 검색해보세요.'
          }
          action={
            categoryFilter ? (
              <Button variant="outline" size="sm" onClick={() => setCategoryFilter('')}>
                카테고리 필터 해제
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground">
            {grouped.size}개 매물 · {visiblePhotos.length}장
          </p>
          {Array.from(grouped.values()).map((group) => (
            <div key={group.propertyId} className="space-y-2">
              <div className="flex items-center gap-2">
                <EntityChip
                  kind="property"
                  id={group.propertyId}
                  label={group.label}
                />
                <Badge variant="outline" className="text-[10px]">
                  {group.photos.length}장
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {group.photos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setLightbox(photo)}
                    className="group relative aspect-square overflow-hidden rounded-md border bg-background text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`${categoryLabels[photo.category] ?? photo.category} 사진 크게 보기`}
                  >
                    <img
                      src={photo.fileUrl}
                      alt={photo.fileName}
                      loading="lazy"
                      className="size-full object-cover transition-transform group-hover:scale-105"
                    />
                    {repPhotoIds.get(photo.propertyId) === photo.id && (
                      <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded-sm bg-black/55 px-1 py-0.5 text-[9px] font-medium text-white">
                        <Star className="size-2.5 fill-current" />
                        대표
                      </span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                      <span className="text-[9px] font-medium text-white">
                        {categoryLabels[photo.category] ?? photo.category}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 라이트박스 — 원본 확대 + 카테고리 변경 + 삭제 */}
      <Dialog
        open={lightbox !== null}
        onOpenChange={(open) => {
          if (!open) setLightbox(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6 text-base">
              {lightbox?.fileName ?? '사진'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {lightbox
                ? `${categoryLabels[lightbox.category] ?? lightbox.category} · 카테고리 변경, 대표 사진 지정, 삭제가 가능합니다.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {lightbox && (
            <div className="space-y-3">
              <div className="flex max-h-[60vh] items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                <img
                  src={lightbox.fileUrl}
                  alt={lightbox.fileName}
                  className="max-h-[60vh] w-auto object-contain"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">카테고리</span>
                  <Select
                    value={lightbox.category}
                    onValueChange={(category) => {
                      if (category !== lightbox.category) {
                        updateCategoryMutation.mutate({ id: lightbox.id, category });
                      }
                    }}
                    disabled={updateCategoryMutation.isPending}
                  >
                    <SelectTrigger size="sm" className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  {repPhotoIds.get(lightbox.propertyId) === lightbox.id ? (
                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-warning">
                      <Star className="size-3.5 fill-current" />
                      대표 사진
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1"
                      disabled={setRepresentativeMutation.isPending}
                      onClick={() => setRepresentativeMutation.mutate(lightbox)}
                    >
                      <Star className="size-3.5" />
                      대표 사진으로
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-destructive hover:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="size-3.5" />
                    삭제
                  </Button>
                </div>
              </div>
              {lightbox.memo && (
                <p className="text-xs text-muted-foreground">{lightbox.memo}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="사진을 삭제하시겠습니까?"
        description="삭제한 사진은 복구할 수 없습니다."
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (lightbox) deleteMutation.mutate(lightbox.id);
        }}
      />
    </div>
  );
}
