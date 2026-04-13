import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ImageIcon, Search, Building } from 'lucide-react';
import type { PropertyPhoto } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

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

function PhotoSearchPage() {
  const [siteName, setSiteName] = useState('');
  const [typeName, setTypeName] = useState('');

  const hasFilter = siteName.length >= 2 || typeName.length >= 1;

  const { data: photos, isLoading } = useQuery({
    queryKey: ['property-photos', 'search', siteName, typeName],
    queryFn: () =>
      api.propertyPhotos.search({
        ...(siteName.length >= 2 ? { siteName } : {}),
        ...(typeName.length >= 1 ? { siteUnitTypeName: typeName } : {}),
      }),
    enabled: hasFilter,
  });

  // Group photos by property
  const grouped = new Map<string, { label: string; propertyId: string; photos: PropertyPhoto[] }>();
  if (photos) {
    for (const photo of photos) {
      const propId = photo.property?.id ?? photo.propertyId;
      if (!grouped.has(propId)) {
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
        grouped.set(propId, { label, propertyId: propId, photos: [] });
      }
      grouped.get(propId)!.photos.push(photo);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ImageIcon className="size-5" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">매물 사진</h1>
          <p className="text-sm text-muted-foreground">
            단지명이나 평형(84A 등)으로 검색하면 해당 매물의 사진을 모아볼 수 있습니다.
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="단지명 (예: 고덕그라시움)"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="relative w-32">
          <Input
            placeholder="평형 (예: 84A)"
            value={typeName}
            onChange={(e) => setTypeName(e.target.value)}
          />
        </div>
      </div>

      {/* Results */}
      {!hasFilter ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Search className="size-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            단지명을 2글자 이상 입력하면 검색이 시작됩니다.
          </p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : !photos || photos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ImageIcon className="size-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            검색 결과가 없습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground">
            {grouped.size}개 매물 · {photos.length}장
          </p>
          {Array.from(grouped.values()).map((group) => (
            <div key={group.propertyId} className="space-y-2">
              <div className="flex items-center gap-2">
                <Link
                  to="/properties/$id"
                  params={{ id: group.propertyId }}
                  className="flex items-center gap-1.5 text-sm font-medium hover:underline"
                >
                  <Building className="size-3.5 text-muted-foreground" />
                  {group.label}
                </Link>
                <Badge variant="outline" className="text-[10px]">
                  {group.photos.length}장
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {group.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border bg-background"
                  >
                    <img
                      src={photo.fileUrl}
                      alt={photo.fileName}
                      className="size-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                      <span className="text-[9px] font-medium text-white">
                        {categoryLabels[photo.category] ?? photo.category}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
