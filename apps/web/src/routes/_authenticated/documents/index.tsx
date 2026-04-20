import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Building,
} from 'lucide-react';
import type { PublicDocument } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/documents/')({
  component: PublicDocumentsListPage,
});

const typeLabel: Record<string, string> = {
  registry: '등기부등본',
  building_ledger: '건축물대장',
  land_ledger: '토지/임야대장',
  cadastral_map: '지적도/임야도',
  land_use_plan: '토지이용계획확인서',
  land_register: '대지권등록부',
};

const typeFilters = [
  { key: 'all', label: '전체' },
  { key: 'registry', label: '등기부등본' },
  { key: 'building_ledger', label: '건축물대장' },
  { key: 'land_ledger', label: '토지대장' },
  { key: 'cadastral_map', label: '지적도' },
  { key: 'land_use_plan', label: '토지이용계획' },
  { key: 'land_register', label: '대지권등록부' },
];

const statusConfig: Record<string, { label: string; color: string }> = {
  completed: { label: '완료', color: 'bg-emerald-100 text-emerald-700' },
  pending: { label: '처리중', color: 'bg-amber-100 text-amber-700' },
  failed: { label: '실패', color: 'bg-red-100 text-red-700' },
};

function PublicDocumentsListPage() {
  const [typeFilter, setTypeFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['public-documents', 'all', typeFilter],
    queryFn: () =>
      api.publicDocuments.list(
        typeFilter === 'all' ? {} : { type: typeFilter },
      ),
  });

  const totalCost =
    data
      ?.filter((d) => d.status === 'completed')
      .reduce((s, d) => s + d.cost, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FileText className="size-5" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">공적장부</h1>
          <p className="text-sm text-muted-foreground">
            발급된 공적장부를 한곳에서 조회하고 다운로드할 수 있습니다.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4 rounded-xl bg-muted/50 p-4 text-sm">
        <div>
          <span className="text-muted-foreground">총 발급: </span>
          <span className="font-semibold">{data?.length ?? 0}건</span>
        </div>
        {totalCost > 0 && (
          <div>
            <span className="text-muted-foreground">발급 비용: </span>
            <span className="font-semibold">{totalCost.toLocaleString()}원</span>
          </div>
        )}
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-1.5">
        {typeFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={cn(
              'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
              typeFilter === f.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-muted/50',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          {typeFilter === 'all'
            ? '발급된 공적장부가 없습니다. 매물 상세에서 장부를 발급해보세요.'
            : `${typeFilters.find((f) => f.key === typeFilter)?.label} 이력이 없습니다.`}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-medium">상태</th>
                <th className="px-3 py-2.5 text-left font-medium">종류</th>
                <th className="px-3 py-2.5 text-left font-medium">매물/단지</th>
                <th className="px-3 py-2.5 text-left font-medium">발급일</th>
                <th className="px-3 py-2.5 text-left font-medium">요청자</th>
                <th className="px-3 py-2.5 text-right font-medium">비용</th>
                <th className="px-3 py-2.5 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.map((doc) => (
                <DocumentTableRow key={doc.id} doc={doc} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DocumentTableRow({ doc }: { doc: PublicDocument }) {
  const status = statusConfig[doc.status] ?? statusConfig.pending;

  const location = doc.property
    ? [
        doc.property.site.name,
        doc.property.unit?.dong?.name,
        doc.property.unit?.name && `${doc.property.unit.name}호`,
      ]
        .filter(Boolean)
        .join(' ')
    : doc.site?.name ?? '-';

  const propertyLink = doc.property?.id
    ? `/properties/${doc.property.id}`
    : null;

  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/30">
      <td className="px-3 py-2.5">
        <span
          className={cn(
            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
            status.color,
          )}
        >
          {doc.status === 'pending' && <Loader2 className="mr-1 size-3 animate-spin" />}
          {doc.status === 'completed' && <CheckCircle2 className="mr-1 size-3" />}
          {doc.status === 'failed' && <XCircle className="mr-1 size-3" />}
          {status.label}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <FileText className="size-3.5 text-muted-foreground" />
          <span className="font-medium">{typeLabel[doc.type] ?? doc.type}</span>
        </div>
        {doc.subtitle && (
          <span className="ml-5 text-[11px] text-muted-foreground">{doc.subtitle}</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        {propertyLink ? (
          <Link
            to={propertyLink}
            className="inline-flex items-center gap-1 text-xs hover:underline"
          >
            <Building className="size-3 text-muted-foreground" />
            {location}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">{location}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">
        {new Date(doc.issuedAt).toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">
        {doc.requestedBy?.name ?? '-'}
      </td>
      <td className="px-3 py-2.5 text-right text-xs">
        {doc.cost > 0 ? (
          <span>{doc.cost.toLocaleString()}원</span>
        ) : (
          <span className="text-muted-foreground">무료</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        {doc.status === 'completed' && doc.fileUrl && (
          <Button variant="ghost" size="sm" className="gap-1 text-xs" asChild>
            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
              <Download className="size-3" />
              열람
            </a>
          </Button>
        )}
      </td>
    </tr>
  );
}
