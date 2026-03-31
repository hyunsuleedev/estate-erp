import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, User, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPrice, sqmToPyeong } from '@estate-erp/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
        <span className={cn(
          'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
          checkStatusColors[property.checkStatus] ?? 'bg-gray-100 text-gray-600',
        )}>
          {checkStatusLabels[property.checkStatus]}
        </span>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="info">매물 정보</TabsTrigger>
          <TabsTrigger value="contacts">관련 연락처</TabsTrigger>
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
              <Field
                label="거래유형"
                value={transactionTypeLabels[property.transactionType]}
              />
              {property.price != null && (
                <Field label="매매가/전세가" value={formatPrice(property.price)} mono />
              )}
              {property.deposit != null && (
                <Field label="보증금" value={formatPrice(property.deposit)} mono />
              )}
              {property.monthlyRent != null && (
                <Field label="월세" value={formatPrice(property.monthlyRent)} mono />
              )}
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
      </Tabs>
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
