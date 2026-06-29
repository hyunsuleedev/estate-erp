import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarDays, Clock3, MessageSquareText, Plus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Consultation } from '@estate-erp/api-client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, PageHeader } from '@/components/domain';
import { PurposeBadge, TypeBadge, getInitial } from './-consultation-badges';
import { ConsultationFilterBar } from './-consultation-filter-bar';
import { ConsultationFormDialog } from './-consultation-form-dialog';
import { ConsultationDetailSheet } from './-consultation-detail-sheet';
import {
  buildConsultationApiParams,
  getConsultationContextLabels,
  getConsultationOutcomeLabel,
  getConsultationPreview,
  getConsultationSignal,
  groupConsultationsByContact,
  groupConsultationsByDay,
  type ConsultationEntityFilters,
  type ConsultationListItem,
} from './-consultation-view-utils';

const initialFilters: ConsultationEntityFilters = {
  q: '',
  quickFilter: 'all',
  contact: null,
  site: null,
  dong: null,
  unit: null,
  type: null,
  createdBy: null,
  dateFrom: null,
  dateTo: null,
};

interface ConsultationsSearch {
  consultationId?: string;
}

export const Route = createFileRoute('/_authenticated/consultations/')({
  validateSearch: (search: Record<string, unknown>): ConsultationsSearch => ({
    consultationId: typeof search.consultationId === 'string' ? search.consultationId : undefined,
  }),
  component: ConsultationsPage,
});

type ViewMode = 'date' | 'contact';

function ConsultationsPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { consultationId } = Route.useSearch();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ConsultationEntityFilters>(initialFilters);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('date');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Consultation | null>(null);

  const apiParams = useMemo(
    () => buildConsultationApiParams({ page, sortOrder, filters }),
    [page, sortOrder, filters],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['consultations', apiParams],
    queryFn: () => api.consultations.findAll(apiParams),
  });

  const consultations = data?.items ?? [];
  const groups = useMemo(
    () => (viewMode === 'contact' ? groupConsultationsByContact(consultations) : groupConsultationsByDay(consultations)),
    [consultations, viewMode],
  );

  // 선택 상담: URL search param 기반 (딥링크 가능). 현재 페이지에 없으면 단건 조회.
  const selectedFromList = useMemo(
    () => consultations.find((item) => item.id === consultationId) ?? null,
    [consultations, consultationId],
  );
  const { data: selectedFetched } = useQuery({
    queryKey: ['consultation', consultationId],
    queryFn: () => api.consultations.findOne(consultationId!),
    enabled: Boolean(consultationId) && !selectedFromList,
  });
  const selectedConsultation = selectedFromList ?? (selectedFetched?.id === consultationId ? selectedFetched : null);

  const selectConsultation = (id: string | null) => {
    void navigate({
      search: (current) => ({ ...current, consultationId: id ?? undefined }),
      replace: false,
    });
  };

  const updateFilters = (updater: (current: ConsultationEntityFilters) => ConsultationEntityFilters) => {
    setFilters(updater);
    setPage(1);
  };

  const openCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  const openEdit = (consultation: Consultation) => {
    setEditTarget(consultation);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        title="상담기록"
        description="고객과 나눈 대화를 기록하고 매물·거래 맥락에 연결합니다."
        actions={
          <Button size="sm" className="gap-1" onClick={openCreate}>
            <Plus className="size-4" />새 상담
          </Button>
        }
        className="mb-0"
      />

      <section className="rounded-[10px] border border-slate-200 bg-background">
        <ConsultationFilterBar
          filters={filters}
          sortOrder={sortOrder}
          onFiltersChange={updateFilters}
          onSortOrderChange={(value) => {
            setSortOrder(value);
            setPage(1);
          }}
          onReset={() => {
            setFilters(initialFilters);
            setSortOrder('desc');
            setPage(1);
          }}
        />
      </section>

      <section className="min-h-0 overflow-hidden rounded-[10px] border border-slate-200 bg-background">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">대화 원장</h2>
            <p className="text-xs text-muted-foreground">
              {viewMode === 'date' ? '날짜별 상담과 업무 신호를 한 번에 확인합니다.' : '고객별 상담 타임라인을 확인합니다.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border border-slate-200 bg-background p-0.5">
              <ViewModeButton active={viewMode === 'date'} icon={CalendarDays} label="날짜별" onClick={() => setViewMode('date')} />
              <ViewModeButton active={viewMode === 'contact'} icon={Users} label="고객별" onClick={() => setViewMode('contact')} />
            </div>
            <Badge variant="outline" className="rounded-lg bg-background text-[11px] text-slate-500">
              {consultations.length}건 표시
            </Badge>
          </div>
        </div>

        <div data-testid="consultation-ledger-flow">
          {isLoading ? (
            <ConsultationLoading />
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <AlertCircle className="size-8 text-destructive/60" />
              <p className="text-sm text-muted-foreground">상담 기록을 불러오지 못했습니다.</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                다시 시도
              </Button>
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              icon={MessageSquareText}
              title="상담 기록이 없습니다"
              description="고객과 나눈 첫 상담을 기록해 보세요. 매물·구매조건과 연결하면 후속 업무로 이어집니다."
              action={
                <Button size="sm" className="gap-1" onClick={openCreate}>
                  <Plus className="size-4" />새 상담
                </Button>
              }
              className="py-16"
            />
          ) : (
            <div className="px-4 py-3">
              {groups.map((group) => (
                <ConsultationGroupSection
                  key={group.key}
                  label={group.label}
                  items={group.items}
                  viewMode={viewMode}
                  selectedId={consultationId ?? null}
                  onSelect={selectConsultation}
                />
              ))}
            </div>
          )}
        </div>

        <PaginationFooter
          page={page}
          totalPages={data?.pagination?.totalPages ?? 1}
          total={data?.pagination?.total ?? 0}
          onPageChange={setPage}
        />
      </section>

      <Sheet open={selectedConsultation !== null} onOpenChange={(open) => !open && selectConsultation(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[560px]">
          {selectedConsultation && (
            <ConsultationDetailSheet
              key={selectedConsultation.id}
              consultation={selectedConsultation}
              onEdit={() => openEdit(selectedConsultation)}
              onDeleted={() => selectConsultation(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <ConsultationFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditTarget(null);
        }}
        consultation={editTarget}
      />
    </div>
  );
}

function ViewModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof CalendarDays;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
        active ? 'bg-slate-100 text-slate-900' : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={onClick}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function ConsultationGroupSection({
  label,
  items,
  viewMode,
  selectedId,
  onSelect,
}: {
  label: string;
  items: ConsultationListItem[];
  viewMode: ViewMode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center gap-2">
        {viewMode === 'contact' ? (
          <Avatar className="size-5">
            <AvatarFallback className="text-[10px]">{getInitial(label)}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="size-2 rounded-full bg-slate-400" />
        )}
        <h3 className="text-sm font-medium text-slate-900">{label}</h3>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        {items.map((consultation) => (
          <ConsultationTimelineRow
            key={consultation.id}
            consultation={consultation}
            viewMode={viewMode}
            selected={consultation.id === selectedId}
            onSelect={() => onSelect(consultation.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ConsultationTimelineRow({
  consultation,
  viewMode,
  selected,
  onSelect,
}: {
  consultation: ConsultationListItem;
  viewMode: ViewMode;
  selected: boolean;
  onSelect: () => void;
}) {
  const signal = getConsultationSignal(consultation);
  const outcome = getConsultationOutcomeLabel(consultation);
  const contextLabels = getConsultationContextLabels(consultation);

  return (
    <button
      type="button"
      className={cn(
        'group/row flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/30',
        selected && 'bg-slate-50',
      )}
      onClick={onSelect}
    >
      <Avatar className="mt-0.5 size-8">
        <AvatarFallback className="text-xs">{getInitial(consultation.contact?.name)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{consultation.contact?.name ?? '미지정 고객'}</span>
          <TypeBadge type={consultation.type} />
          <PurposeBadge purpose={consultation.purpose} />
          <Badge className={cn('rounded-md px-1.5 text-[10px]', signal.className)}>{signal.label}</Badge>
          <Badge variant="outline" className="rounded-md px-1.5 text-[10px] text-slate-500">
            {outcome}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-700">
          {getConsultationPreview(consultation.content, 132)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock3 className="size-3" />
            {viewMode === 'contact' ? formatRowDateTime(consultation.createdAt) : formatRowTime(consultation.createdAt)}
          </span>
          {contextLabels.slice(0, 3).map((label) => (
            <Badge key={label} variant="outline" className="rounded-md bg-background px-1.5 text-[10px] text-slate-500">
              {label}
            </Badge>
          ))}
        </div>
      </div>

      <ArrowRight className="mt-2 size-4 text-slate-300 opacity-0 transition-opacity group-hover/row:opacity-100" />
    </button>
  );
}

function PaginationFooter({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-muted-foreground">
      <span>전체 {total}건</span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="xs" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
          이전
        </Button>
        <span className="min-w-14 text-center">
          {page} / {Math.max(1, totalPages)}
        </span>
        <Button type="button" variant="outline" size="xs" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
          다음
        </Button>
      </div>
    </div>
  );
}

function ConsultationLoading() {
  return (
    <div className="space-y-3 px-4 py-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );
}

// 같은 날짜 그룹 안에서는 시각만, 고객별 그룹에서는 날짜+시각 표기
function formatRowTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatRowDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
