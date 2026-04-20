import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  User,
  Phone,
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ImageIcon,
} from 'lucide-react';
import type { PublicDocument, PropertyPhoto } from '@estate-erp/api-client';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatPrice, sqmToPyeong } from '@estate-erp/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const transactionTypeLabels: Record<string, string> = {
  sale: '매매', jeonse: '전세', monthly: '월세',
};
const checkStatusLabels: Record<string, string> = {
  unverified: '미확인', verified: '확인', in_contract: '계약중', hold: '보류', done: '완료',
};
const checkStatusColors: Record<string, string> = {
  unverified: 'bg-gray-100 text-gray-600',
  verified: 'bg-emerald-50 text-emerald-700',
  in_contract: 'bg-blue-50 text-blue-700',
  hold: 'bg-amber-50 text-amber-700',
  done: 'bg-gray-50 text-gray-400',
};
const roleLabels: Record<string, string> = {
  owner: '소유자', co_owner: '공동소유', representative: '대리인',
  lawyer: '법무사', tax_agent: '세무사',
};

export const Route = createFileRoute('/_authenticated/properties/$id')({
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { id } = Route.useParams();

  const { data: property, isLoading } = useQuery({
    queryKey: ['properties', id],
    queryFn: () => api.properties.findOne(id),
  });

  const { data: propertyContacts } = useQuery({
    queryKey: ['property-contacts', id],
    queryFn: () => api.propertyContacts.findByProperty(id),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!property) {
    return <div className="py-12 text-center text-sm text-muted-foreground">매물을 찾을 수 없습니다.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-7" asChild>
          <Link to="/properties">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">
          {property.site?.name ?? '매물 상세'}
        </h1>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="info">기본 정보</TabsTrigger>
          <TabsTrigger value="listings">매물 ({property.listings?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="contacts">관련 연락처</TabsTrigger>
          <TabsTrigger value="photos">사진</TabsTrigger>
          <TabsTrigger value="documents">공적장부</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="rounded-xl bg-muted/50 p-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="단지/건물" value={property.site?.name} />
              {property.unit && <Field label="호실" value={property.unit.name} />}
              <Field
                label="주소"
                value={property.site?.roadAddress || property.site?.jibunAddress || '-'}
                className="sm:col-span-2"
              />
              {property.unit?.exclusiveAreaM2 && (
                <Field
                  label="전용면적"
                  value={`${Number(property.unit.exclusiveAreaM2).toFixed(1)}m² (${sqmToPyeong(Number(property.unit.exclusiveAreaM2))}평)`}
                  mono
                />
              )}
              {property.memo && (
                <div className="sm:col-span-2">
                  <dt className="mb-1.5 text-xs font-medium text-muted-foreground">메모</dt>
                  <dd className="whitespace-pre-wrap rounded-lg bg-background px-3 py-2.5 text-sm leading-relaxed">
                    {property.memo}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </TabsContent>

        <TabsContent value="listings">
          <div className="rounded-xl bg-muted/50 p-5">
            {!property.listings || property.listings.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                등록된 매물(거래 정보)이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {property.listings.map((listing) => (
                  <div
                    key={listing.id}
                    className="flex items-center justify-between rounded-lg bg-background px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                          listing.transactionType === 'sale' && 'bg-rose-50 text-rose-700',
                          listing.transactionType === 'jeonse' && 'bg-blue-50 text-blue-700',
                          listing.transactionType === 'monthly' && 'bg-violet-50 text-violet-700',
                        )}
                      >
                        {transactionTypeLabels[listing.transactionType] ?? listing.transactionType}
                      </span>
                      <span className="text-sm font-medium tabular-nums">
                        {listing.transactionType === 'monthly'
                          ? `${listing.deposit ? formatPrice(listing.deposit) : '-'} / ${listing.monthlyRent ? formatPrice(listing.monthlyRent) : '-'}`
                          : listing.price ? formatPrice(listing.price) : '-'}
                      </span>
                    </div>
                    <span className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                      checkStatusColors[listing.checkStatus] ?? 'bg-gray-100 text-gray-600',
                    )}>
                      {checkStatusLabels[listing.checkStatus] ?? listing.checkStatus}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="contacts">
          <div className="rounded-xl bg-muted/50 p-5">
            {!propertyContacts || propertyContacts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                관련 연락처가 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {propertyContacts.map((pc) => (
                  <li
                    key={pc.id}
                    className="flex items-center justify-between rounded-lg bg-background px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                        <User className="size-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{pc.contact?.name ?? '-'}</p>
                        <p className="text-xs text-muted-foreground">
                          {roleLabels[pc.role] ?? pc.role}
                          {pc.isPrimary ? ' · 주 연락처' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Phone className="size-3.5" />
                      {pc.contact?.phone ?? '-'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="photos">
          <PhotosTab propertyId={id} />
        </TabsContent>

        <TabsContent value="documents">
          <PublicDocumentsTab propertyId={id} siteId={property.site?.id ?? ''} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 사진 탭
// ─────────────────────────────────────────────────────────────

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

function PhotosTab({ propertyId }: { propertyId: string }) {
  const { data: photos, isLoading } = useQuery({
    queryKey: ['property-photos', propertyId],
    queryFn: () => api.propertyPhotos.listByProperty(propertyId),
  });

  return (
    <div className="rounded-xl bg-muted/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          매물 사진
          {photos && photos.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({photos.length}장)
            </span>
          )}
        </h3>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled>
          <ImageIcon className="size-3.5" />
          사진 추가
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : !photos || photos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <ImageIcon className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            등록된 사진이 없습니다.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-background"
            >
              <img
                src={photo.fileUrl}
                alt={photo.fileName}
                className="size-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                <span className="text-[10px] font-medium text-white">
                  {categoryLabels[photo.category] ?? photo.category}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 공적장부 탭
// ─────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  {
    type: 'registry',
    title: '등기부등본 (집합건물)',
    source: '대법원 인터넷등기소',
    cost: 700,
    options: ['현재유효사항', '말소사항포함'],
  },
  {
    type: 'building_ledger',
    title: '건축물대장',
    source: '세움터',
    cost: 0,
    options: ['총괄표제부', '표제부', '전유부'],
  },
  {
    type: 'land_ledger',
    title: '토지/임야대장',
    source: '정부24',
    cost: 0,
  },
  {
    type: 'cadastral_map',
    title: '지적도/임야도',
    source: '정부24',
    cost: 0,
  },
  {
    type: 'land_use_plan',
    title: '토지이용계획확인서',
    source: '토지이음',
    cost: 0,
  },
  {
    type: 'land_register',
    title: '대지권등록부',
    source: '정부24',
    cost: 0,
  },
];

function PublicDocumentsTab({
  propertyId,
  siteId,
}: {
  propertyId: string;
  siteId: string;
}) {
  const queryClient = useQueryClient();

  const { data: documents, isLoading } = useQuery({
    queryKey: ['public-documents', propertyId],
    queryFn: () => api.publicDocuments.list({ propertyId }),
  });

  const issueMutation = useMutation({
    mutationFn: (data: { type: string; title: string; cost: number; subtitle?: string }) =>
      api.publicDocuments.create({
        propertyId,
        siteId,
        type: data.type,
        title: data.title,
        cost: data.cost,
        subtitle: data.subtitle,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-documents', propertyId] });
      toast.success('발급 요청이 등록되었습니다.');
    },
    onError: () => {
      toast.error('발급 요청에 실패했습니다.');
    },
  });

  const docsByType = (type: string) =>
    documents?.filter((d) => d.type === type) ?? [];

  return (
    <div className="space-y-4">
      {/* 발급 버튼 그리드 */}
      <div className="rounded-xl bg-muted/50 p-5">
        <h3 className="mb-3 text-sm font-semibold">장부 발급</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DOCUMENT_TYPES.map((doc) => (
            <button
              key={doc.type}
              onClick={() =>
                issueMutation.mutate({
                  type: doc.type,
                  title: doc.title,
                  cost: doc.cost,
                })
              }
              disabled={issueMutation.isPending}
              className="flex items-start gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
            >
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{doc.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{doc.source}</span>
                  {doc.cost > 0 ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {doc.cost.toLocaleString()}원
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      무료
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 발급 이력 */}
      <div className="rounded-xl bg-muted/50 p-5">
        <h3 className="mb-3 text-sm font-semibold">
          발급 이력
          {documents && documents.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({documents.length}건)
            </span>
          )}
        </h3>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : !documents || documents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            발급된 장부가 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentRow({ doc }: { doc: PublicDocument }) {
  const statusIcon =
    doc.status === 'completed' ? (
      <CheckCircle2 className="size-4 text-emerald-500" />
    ) : doc.status === 'failed' ? (
      <XCircle className="size-4 text-red-500" />
    ) : (
      <Clock className="size-4 text-amber-500" />
    );

  return (
    <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
      <div className="flex items-center gap-3">
        {statusIcon}
        <div>
          <div className="text-sm font-medium">{doc.title}</div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              {new Date(doc.issuedAt).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            {doc.requestedBy && <span>{doc.requestedBy.name}</span>}
            {doc.cost > 0 && <span>{doc.cost.toLocaleString()}원</span>}
            {doc.subtitle && (
              <Badge variant="outline" className="text-[10px]">
                {doc.subtitle}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {doc.status === 'failed' && doc.errorMessage && (
          <span className="text-xs text-red-500">{doc.errorMessage}</span>
        )}
        {doc.status === 'completed' && doc.fileUrl && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" asChild>
            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
              <Download className="size-3.5" />
              열람
            </a>
          </Button>
        )}
        {doc.status === 'pending' && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono, className }: { label: string; value?: string | null; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-medium', mono && 'tabular-nums')}>
        {value ?? '-'}
      </dd>
    </div>
  );
}
