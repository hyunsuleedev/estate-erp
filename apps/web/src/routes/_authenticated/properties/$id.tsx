import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, User, Phone, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/api';
import { formatPrice, sqmToPyeong } from '@estate-erp/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ── Label maps ──────────────────────────────────────────────────

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

// ── Price history types ─────────────────────────────────────────

interface PriceHistory {
  id: string;
  priceBefore: number | null;
  priceAfter: number | null;
  depositBefore: number | null;
  depositAfter: number | null;
  monthlyRentBefore: number | null;
  monthlyRentAfter: number | null;
  reason: string | null;
  createdAt: string;
}

// ── Route ───────────────────────────────────────────────────────

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

  const { data: priceHistory } = useQuery({
    queryKey: ['price-history', id],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(`/api/properties/${id}/price-history`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [] as PriceHistory[];
      return res.json() as Promise<PriceHistory[]>;
    },
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
        {property.unit && (
          <span className="text-sm text-muted-foreground">{property.unit.name}</span>
        )}
        <span className={cn(
          'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
          checkStatusColors[property.checkStatus] ?? 'bg-gray-100 text-gray-600',
        )}>
          {checkStatusLabels[property.checkStatus]}
        </span>
        {property.isHidden && (
          <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
            숨김
          </span>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="info">매물 정보</TabsTrigger>
          <TabsTrigger value="contacts">관련 연락처</TabsTrigger>
          <TabsTrigger value="price-history">가격 이력</TabsTrigger>
        </TabsList>

        {/* ── Info tab ── */}
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
              <Field label="거래유형" value={transactionTypeLabels[property.transactionType]} />
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
              {property.unit?.floor != null && (
                <Field label="층" value={`${property.unit.floor}층`} />
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

        {/* ── Contacts tab ── */}
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

        {/* ── Price history tab ── */}
        <TabsContent value="price-history">
          <PriceHistoryTab
            history={priceHistory ?? []}
            transactionType={property.transactionType}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Price History Tab ───────────────────────────────────────────

function PriceHistoryTab({
  history,
  transactionType,
}: {
  history: PriceHistory[];
  transactionType: string;
}) {
  if (history.length === 0) {
    return (
      <div className="rounded-xl bg-muted/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">가격 변경 이력이 없습니다.</p>
        <p className="text-xs text-muted-foreground mt-1">
          가격이 변경되면 자동으로 기록됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-muted/50 p-5">
      {/* Mini spark visualization */}
      <SparkChart history={history} transactionType={transactionType} />

      {/* History list */}
      <ul className="mt-4 space-y-2">
        {[...history].reverse().map((entry, i) => {
          const isSale = transactionType === 'sale' || transactionType === 'jeonse';
          const before = isSale ? entry.priceBefore : entry.depositBefore;
          const after = isSale ? entry.priceAfter : entry.depositAfter;
          const diff = (after ?? 0) - (before ?? 0);
          const isUp = diff > 0;
          const isDown = diff < 0;

          return (
            <li key={entry.id} className="flex items-start justify-between rounded-lg bg-background px-4 py-3">
              <div className="flex items-start gap-3">
                <div className={cn(
                  'mt-0.5 flex size-6 items-center justify-center rounded-full',
                  isUp ? 'bg-rose-50' : isDown ? 'bg-emerald-50' : 'bg-muted',
                )}>
                  {isUp ? (
                    <TrendingUp className="size-3 text-rose-500" />
                  ) : isDown ? (
                    <TrendingDown className="size-3 text-emerald-500" />
                  ) : (
                    <Minus className="size-3 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    {before != null && (
                      <span className="text-[12px] text-muted-foreground line-through tabular-nums">
                        {formatPrice(before)}
                      </span>
                    )}
                    {after != null && (
                      <span className="text-[13px] font-medium tabular-nums">
                        {formatPrice(after)}
                      </span>
                    )}
                    {before != null && after != null && diff !== 0 && (
                      <span className={cn(
                        'text-[11px] font-medium tabular-nums',
                        isUp ? 'text-rose-500' : 'text-emerald-600',
                      )}>
                        {isUp ? '+' : ''}{formatPrice(diff)}
                      </span>
                    )}
                  </div>
                  {/* Monthly rent change if applicable */}
                  {transactionType === 'monthly' && entry.monthlyRentAfter != null && (
                    <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                      월세 {formatPrice(entry.monthlyRentAfter)}
                    </p>
                  )}
                  {entry.reason && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{entry.reason}</p>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {new Date(entry.createdAt).toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'numeric',
                  day: 'numeric',
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Spark chart (SVG-based, no external deps) ───────────────────

function SparkChart({ history, transactionType }: { history: PriceHistory[]; transactionType: string }) {
  const isSale = transactionType === 'sale' || transactionType === 'jeonse';
  const values = history
    .map((h) => (isSale ? (h.priceAfter ?? h.priceBefore) : (h.depositAfter ?? h.depositBefore)))
    .filter((v): v is number => v != null);

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 300;
  const h = 48;
  const pad = 4;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + ((max - v) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const isUp = values[values.length - 1] > values[0];
  const lineColor = isUp ? '#f43f5e' : '#10b981';

  return (
    <div className="mb-1">
      <p className="text-[11px] font-medium text-muted-foreground mb-2">가격 추이</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none">
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots */}
        {points.map((pt, i) => {
          const [x, y] = pt.split(',').map(Number);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="2"
              fill={lineColor}
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums mt-0.5">
        <span>{values[0] != null ? formatPrice(values[0]) : ''}</span>
        <span>{values[values.length - 1] != null ? formatPrice(values[values.length - 1]) : ''}</span>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

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
