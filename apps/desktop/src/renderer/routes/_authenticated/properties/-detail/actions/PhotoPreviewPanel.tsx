import { useQuery } from '@tanstack/react-query';
import { ImageIcon, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { SideCard } from '../cards/SideCard';

interface Props {
  propertyId: string;
}

export function PhotoPreviewPanel({ propertyId }: Props) {
  const { data: photos, isLoading } = useQuery({
    queryKey: ['property-photos', propertyId],
    queryFn: () => api.propertyPhotos.listByProperty(propertyId),
  });

  const previews = (photos ?? []).slice(0, 4);
  const hiddenCount = Math.max(0, (photos?.length ?? 0) - 4);

  return (
    <SideCard
      title={`사진 ${photos?.length ?? 0}`}
      action={
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          aria-label="사진 추가"
          disabled
        >
          <Upload className="size-3" />
        </Button>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-2 gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded" />
          ))}
        </div>
      ) : previews.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded border border-dashed border-border bg-muted/20 px-2 py-4 text-center text-[11px] text-muted-foreground">
          <ImageIcon className="size-4 opacity-50" />
          <span>사진이 없습니다</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1">
          {previews.map((photo, idx) => (
            <div
              key={photo.id}
              className="relative aspect-square overflow-hidden rounded bg-muted"
            >
              {photo.fileUrl ? (
                <img
                  src={photo.fileUrl}
                  alt={photo.category ?? '사진'}
                  className="size-full object-cover"
                />
              ) : (
                <ImageIcon className="absolute inset-0 m-auto size-5 text-muted-foreground/40" />
              )}
              {idx === 3 && hiddenCount > 0 && (
                <div className="absolute inset-0 grid place-items-center bg-black/50 text-[12px] font-medium text-white">
                  +{hiddenCount}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SideCard>
  );
}
