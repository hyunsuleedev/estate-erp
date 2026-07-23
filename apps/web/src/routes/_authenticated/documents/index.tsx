import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Link2,
  Loader2,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PublicDocument } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatDday } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

export const Route = createFileRoute('/_authenticated/documents/')({
  component: PublicDocumentsListPage,
});

const typeLabel: Record<string, string> = {
  registry: '등기사항증명서',
  building_ledger: '건축물대장',
  land_ledger: '토지/임야대장',
  cadastral_map: '지적도/임야도',
  land_use_plan: '토지이용계획확인서',
  land_register: '대지권등록부',
};

const typeOptions = [
  { value: 'registry', label: '등기사항증명서' },
  { value: 'building_ledger', label: '건축물대장' },
  { value: 'land_ledger', label: '토지대장' },
  { value: 'cadastral_map', label: '지적도' },
  { value: 'land_use_plan', label: '토지이용계획' },
  { value: 'land_register', label: '대지권등록부' },
];

const statusOptions = [
  { value: 'completed', label: '완료' },
  { value: 'pending', label: '처리중' },
  { value: 'failed', label: '실패' },
];

const periodOptions = [
  { value: '1m', label: '최근 1개월' },
  { value: '3m', label: '최근 3개월' },
  { value: '6m', label: '최근 6개월' },
  { value: '1y', label: '최근 1년' },
];

const PERIOD_MONTHS: Record<string, number> = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };

const statusMeta: Record<
  string,
  { label: string; className: string; icon: LucideIcon; spin?: boolean }
> = {
  completed: { label: '완료', className: 'bg-success-soft text-success', icon: CheckCircle2 },
  pending: { label: '처리중', className: 'bg-warning-soft text-warning', icon: Loader2, spin: true },
  failed: { label: '실패', className: 'bg-destructive-soft text-destructive', icon: XCircle },
};

function siteNameOf(doc: PublicDocument): string | null {
  return doc.property?.site.name ?? doc.site?.name ?? null;
}

function locationOf(doc: PublicDocument): string {
  if (doc.property) {
    return [
      doc.property.site.name,
      doc.property.unit?.dong?.name,
      doc.property.unit?.name && `${doc.property.unit.name}호`,
    ]
      .filter(Boolean)
      .join(' ');
  }
  return doc.site?.name ?? '—';
}

function PublicDocumentsListPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [period, setPeriod] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PublicDocument | null>(null);
  const [attachTarget, setAttachTarget] = useState<PublicDocument | null>(null);
  const [fileUrl, setFileUrl] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['public-documents', 'all'],
    queryFn: () => api.publicDocuments.list({}),
    // 처리중 건이 있으면 7초 간격 폴링 — 상태 전환을 자동 반영
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.status === 'pending') ? 7000 : false,
  });

  // 매물/단지 필터 옵션 — 이력에 등장하는 단지명에서 파생
  const siteOptions = useMemo(() => {
    const names = new Set<string>();
    for (const doc of data ?? []) {
      const name = siteNameOf(doc);
      if (name) names.add(name);
    }
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map((name) => ({ value: name, label: name }));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const months = PERIOD_MONTHS[period];
    const cutoff = months ? new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000) : null;
    return data.filter((doc) => {
      if (typeFilter && doc.type !== typeFilter) return false;
      if (statusFilter && doc.status !== statusFilter) return false;
      if (siteFilter && siteNameOf(doc) !== siteFilter) return false;
      if (cutoff && new Date(doc.issuedAt) < cutoff) return false;
      if (q) {
        const hay = [
          doc.title,
          doc.subtitle,
          typeLabel[doc.type],
          locationOf(doc),
          doc.requestedBy?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, typeFilter, statusFilter, siteFilter, period]);

  // 요약은 필터와 무관한 전체 기준
  const summary = useMemo(() => {
    const all = data ?? [];
    return {
      total: all.length,
      completedCost: all
        .filter((d) => d.status === 'completed')
        .reduce((s, d) => s + d.cost, 0),
      pendingCount: all.filter((d) => d.status === 'pending').length,
      failedCount: all.filter((d) => d.status === 'failed').length,
    };
  }, [data]);

  const retryMutation = useMutation({
    mutationFn: (doc: PublicDocument) => api.publicDocuments.retry(doc.id),
    onSuccess: () => {
      toast.success('재발급 요청이 등록되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['public-documents'] });
    },
    onError: () => toast.error('재발급 요청에 실패했습니다.'),
  });

  const attachMutation = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) =>
      api.publicDocuments.attachFile(id, { fileUrl: url }),
    onSuccess: () => {
      toast.success('발급 문서를 연결했습니다.');
      queryClient.invalidateQueries({ queryKey: ['public-documents'] });
      setAttachTarget(null);
      setFileUrl('');
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : '문서 연결에 실패했습니다.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.publicDocuments.remove(id),
    onSuccess: () => {
      toast.success('발급 이력이 삭제되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['public-documents'] });
      setDeleteTarget(null);
    },
    onError: () => toast.error('발급 이력 삭제에 실패했습니다.'),
  });

  const hasActiveFilter = Boolean(search || typeFilter || statusFilter || siteFilter || period);
  const resetFilters = () => {
    setSearch('');
    setTypeFilter('');
    setStatusFilter('');
    setSiteFilter('');
    setPeriod('');
  };

  return (
    <div className="flex flex-col">
      <PageHeader
        title="자료실"
        description="발급된 공적장부를 한곳에서 조회하고 관리합니다."
      />
      <DocumentsNav />

      {/* 전체 기준 요약 (필터와 무관) */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-muted/50 p-3 text-sm">
        <div>
          <span className="text-muted-foreground">총 발급 </span>
          <span className="font-semibold tabular-nums">{summary.total}건</span>
        </div>
        <div>
          <span className="text-muted-foreground">발급 비용(완료 기준) </span>
          <span className="font-semibold tabular-nums">
            {summary.completedCost > 0 ? `${summary.completedCost.toLocaleString()}원` : '0원'}
          </span>
        </div>
        {summary.pendingCount > 0 && (
          <div>
            <span className="text-muted-foreground">처리중 </span>
            <span className="font-semibold text-warning tabular-nums">
              {summary.pendingCount}건
            </span>
          </div>
        )}
        {summary.failedCount > 0 && (
          <div>
            <span className="text-muted-foreground">실패 </span>
            <span className="font-semibold text-destructive tabular-nums">
              {summary.failedCount}건
            </span>
          </div>
        )}
        {summary.pendingCount > 0 && (
          <p className="basis-full text-xs text-muted-foreground">
            등기·대지권 문서는 발급 파일을 연결할 때까지 대기 상태로 유지됩니다.
          </p>
        )}
      </div>

      <FilterBar className="mb-4">
        <FilterSearch value={search} onChange={setSearch} placeholder="단지명·장부명 검색" />
        <FilterSelect label="종류" value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
        <FilterSelect label="상태" value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
        <FilterSelect label="기간" value={period} onChange={setPeriod} options={periodOptions} />
        {siteOptions.length > 0 && (
          <FilterSelect label="단지" value={siteFilter} onChange={setSiteFilter} options={siteOptions} />
        )}
        <FilterCount n={filtered.length} />
      </FilterBar>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="발급 이력을 불러오지 못했습니다"
          description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              다시 시도
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={
            hasActiveFilter
              ? '조건에 맞는 발급 이력이 없습니다'
              : '발급된 공적장부가 없습니다'
          }
          description={
            hasActiveFilter
              ? '필터를 조정하거나 초기화해보세요.'
              : '매물 상세의 공적장부 탭에서 장부를 발급하면 이곳에 이력이 쌓입니다.'
          }
          action={
            hasActiveFilter ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                필터 초기화
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                <th className="px-3 py-2.5 text-left font-medium">상태</th>
                <th className="px-3 py-2.5 text-left font-medium">종류</th>
                <th className="px-3 py-2.5 text-left font-medium">매물/단지</th>
                <th className="px-3 py-2.5 text-left font-medium">발급일</th>
                <th className="px-3 py-2.5 text-left font-medium">유효기간</th>
                <th className="px-3 py-2.5 text-left font-medium">요청자</th>
                <th className="px-3 py-2.5 text-right font-medium">비용</th>
                <th className="px-3 py-2.5 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => (
                <DocumentTableRow
                  key={doc.id}
                  doc={doc}
                  onRetry={() => retryMutation.mutate(doc)}
                  retryDisabled={retryMutation.isPending}
                  onAttach={() => {
                    setAttachTarget(doc);
                    setFileUrl(doc.fileUrl ?? '');
                  }}
                  onDelete={() => setDeleteTarget(doc)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="발급 이력을 삭제하시겠습니까?"
        description={
          deleteTarget
            ? `${typeLabel[deleteTarget.type] ?? deleteTarget.type} (${locationOf(deleteTarget)}) 이력이 삭제됩니다. 삭제 후에는 복구할 수 없습니다.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />

      <Dialog
        open={attachTarget !== null}
        onOpenChange={(open) => {
          if (!open && !attachMutation.isPending) {
            setAttachTarget(null);
            setFileUrl('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>발급 문서 연결</DialogTitle>
            <DialogDescription>
              인터넷등기소나 발급 서비스에서 받은 PDF의 HTTPS 보관 URL을 입력하세요.
              문서는 사무소 전용 비공개 저장소 사용을 권장합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="public-document-url">문서 URL</Label>
            <Input
              id="public-document-url"
              type="url"
              inputMode="url"
              placeholder="https://storage.example.com/document.pdf"
              value={fileUrl}
              onChange={(event) => setFileUrl(event.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={attachMutation.isPending}
              onClick={() => setAttachTarget(null)}
            >
              취소
            </Button>
            <Button
              disabled={!fileUrl.trim() || attachMutation.isPending}
              onClick={() => {
                if (attachTarget) {
                  attachMutation.mutate({ id: attachTarget.id, url: fileUrl.trim() });
                }
              }}
            >
              {attachMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              연결 완료
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentTableRow({
  doc,
  onRetry,
  retryDisabled,
  onAttach,
  onDelete,
}: {
  doc: PublicDocument;
  onRetry: () => void;
  retryDisabled: boolean;
  onAttach: () => void;
  onDelete: () => void;
}) {
  const status = statusMeta[doc.status] ?? statusMeta.pending;
  const StatusIcon = status.icon;
  const location = locationOf(doc);
  const expired = doc.expiresAt ? new Date(doc.expiresAt).getTime() < Date.now() : false;

  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/30">
      <td className="px-3 py-2.5">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
            status.className,
          )}
        >
          <StatusIcon className={cn('mr-1 size-3', status.spin && 'animate-spin')} />
          {status.label}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium">{typeLabel[doc.type] ?? doc.type}</span>
        </div>
        {doc.subtitle && (
          <p className="ml-5 text-[11px] text-muted-foreground">{doc.subtitle}</p>
        )}
        <p className="ml-5 text-[10px] text-muted-foreground">
          {doc.provider === 'manual_upload' ? '수동 문서 연결' : doc.provider}
          {' · '}
          {doc.requestMode === 'certificate'
            ? '발급용'
            : doc.requestMode === 'view'
              ? '열람용'
              : doc.requestMode === 'upload'
                ? '파일'
                : '구조화 데이터'}
        </p>
        {doc.status === 'failed' && (
          <p className="ml-5 mt-0.5 text-[11px] text-destructive">
            {doc.errorMessage ?? '발급 처리 중 오류가 발생했습니다.'}
          </p>
        )}
      </td>
      <td className="px-3 py-2.5">
        {doc.property?.id ? (
          <EntityChip kind="property" id={doc.property.id} label={location} />
        ) : (
          <span className="text-xs text-muted-foreground">{location}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
        {formatDate(doc.issuedAt)}
      </td>
      <td className="px-3 py-2.5 text-xs tabular-nums">
        {doc.expiresAt ? (
          expired ? (
            <span className="font-medium text-destructive">만료</span>
          ) : (
            <span className="text-muted-foreground">
              {formatDate(doc.expiresAt)}{' '}
              <span className="text-[10px]">({formatDday(doc.expiresAt)})</span>
            </span>
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">
        {doc.requestedBy?.name ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums">
        {doc.cost > 0 ? (
          <span>{doc.cost.toLocaleString()}원</span>
        ) : (
          <span className="text-muted-foreground">무료</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-0.5">
          {doc.status === 'completed' && doc.fileUrl && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" asChild>
              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                <Download className="size-3" />
                열람
              </a>
            </Button>
          )}
          {doc.status === 'completed' && !doc.fileUrl && doc.metadata && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => downloadMetadata(doc)}
            >
              <Download className="size-3" />
              데이터
            </Button>
          )}
          {doc.status === 'pending' && doc.provider === 'manual_upload' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={onAttach}
            >
              <Link2 className="size-3" />
              파일 연결
            </Button>
          )}
          {doc.status === 'failed' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={retryDisabled}
              onClick={onRetry}
            >
              <RotateCcw className="size-3" />
              재발급
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 text-muted-foreground hover:text-destructive"
            aria-label="발급 이력 삭제"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function downloadMetadata(doc: PublicDocument) {
  const blob = new Blob([JSON.stringify(doc.metadata, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `${doc.title}-${doc.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
