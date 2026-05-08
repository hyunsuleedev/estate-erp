import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { PublicDocument } from '@estate-erp/api-client';
import { SideCard } from '../cards/SideCard';
import { formatRelativeDate } from '../utils';

interface Props {
  propertyId: string;
}

const documentTypeLabels: Record<string, string> = {
  registry: '등기부등본',
  building_ledger: '건축물대장',
  land_ledger: '토지대장',
  cadastral_map: '지적도',
  land_use_plan: '토지이용계획',
  land_register: '대지권등록부',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-rose-50 text-rose-700',
};

const statusLabels: Record<string, string> = {
  pending: '발급중',
  completed: '발급완료',
  failed: '실패',
};

export function DocumentsPanel({ propertyId }: Props) {
  const { data: documents } = useQuery({
    queryKey: ['public-documents', { propertyId }],
    queryFn: () => api.publicDocuments.list({ propertyId }),
  });

  // 가장 최근 발급된 것 3개
  const latest = (documents ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
    )
    .slice(0, 3);

  return (
    <SideCard
      title={`공적장부 ${documents?.length ?? 0}`}
      action={
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          disabled
        >
          발급
        </Button>
      }
    >
      {latest.length === 0 ? (
        <p className="py-1 text-[11px] text-muted-foreground">
          발급된 장부가 없습니다.
        </p>
      ) : (
        <ul className="-mx-1 divide-y divide-border/60">
          {latest.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} />
          ))}
        </ul>
      )}
    </SideCard>
  );
}

function DocumentRow({ doc }: { doc: PublicDocument }) {
  return (
    <li>
      <Link
        to="/properties"
        className="flex items-center gap-1.5 px-1 py-1.5 hover:bg-muted/40"
      >
        <FileText className="size-3 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium text-foreground">
            {documentTypeLabels[doc.type] ?? doc.type}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {formatRelativeDate(doc.issuedAt)}
          </div>
        </div>
        <span
          className={cn(
            'rounded px-1 py-0.5 text-[9px]',
            statusColors[doc.status] ?? 'bg-muted text-muted-foreground',
          )}
        >
          {statusLabels[doc.status] ?? doc.status}
        </span>
        <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
