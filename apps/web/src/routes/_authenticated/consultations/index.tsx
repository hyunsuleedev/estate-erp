import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CornerDownRight,
  Globe,
  MapPin,
  MessageSquareText,
  Phone,
  Plus,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Consultation } from '@estate-erp/api-client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/domain';
import { consultationTypeLabels, getInitial } from './-consultation-badges';
import { ConsultationFilterBar } from './-consultation-filter-bar';
import { ConsultationFormDialog } from './-consultation-form-dialog';
import { ConsultationDetailSheet } from './-consultation-detail-sheet';
import {
  buildConsultationApiParams,
  getConsultationActionLabel,
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
  // consultationId 미지정 시 undefined === undefined 로 빈 Sheet가 열리지 않도록 fetch 결과 존재를 함께 확인
  const selectedConsultation =
    selectedFromList ?? (selectedFetched && selectedFetched.id === consultationId ? selectedFetched : null);

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
    <div className="flex h-[calc(100svh-4rem)] min-h-0 flex-col bg-background">
      {/* 툴바 — 검색·퀵필터·상세필터·정렬 + 보기 전환 + 상담 기록 버튼 */}
      <section className="border-b border-border px-3">
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
          actions={
            <>
              <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
                <ViewModeButton active={viewMode === 'date'} icon={CalendarDays} label="날짜별" onClick={() => setViewMode('date')} />
                <ViewModeButton active={viewMode === 'contact'} icon={Users} label="고객별" onClick={() => setViewMode('contact')} />
              </div>
              <Button size="sm" className="h-[34px] shrink-0 gap-1.5 rounded-[9px] px-3.5" onClick={openCreate}>
                <Plus className="size-4" />
                상담 기록
              </Button>
            </>
          }
        />
      </section>

      {/* 본문 — 날짜/고객 그룹 원장 */}
      <div data-testid="consultation-ledger-flow" className="min-h-0 flex-1 overflow-y-auto px-6 pb-7 pt-4">
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
                <Plus className="size-4" />
                상담 기록
              </Button>
            }
            className="py-16"
          />
        ) : (
          groups.map((group) => (
            <ConsultationGroupSection
              key={group.key}
              label={group.label}
              items={group.items}
              viewMode={viewMode}
              selectedId={consultationId ?? null}
              onSelect={selectConsultation}
            />
          ))
        )}
      </div>

      <PaginationFooter
        page={page}
        totalPages={data?.pagination?.totalPages ?? 1}
        total={data?.pagination?.total ?? 0}
        onPageChange={setPage}
      />

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
        'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
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
    <section className="mb-[18px] last:mb-0">
      <div className="mb-[7px] flex items-center gap-2">
        {viewMode === 'contact' && (
          <Avatar className="size-5">
            <AvatarFallback className="text-[10px]">{getInitial(label)}</AvatarFallback>
          </Avatar>
        )}
        <h3 className="text-xs font-bold text-muted-foreground">{label}</h3>
        <span className="text-xs tabular-nums text-muted-foreground/70">{items.length}</span>
      </div>
      <div className="overflow-hidden rounded-[11px] border border-border bg-background">
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

// 상담 채널(전화/방문/온라인) 칩 — 디자인의 아이콘+라벨 soft 톤
const typeChipMeta: Record<string, { icon: typeof Phone; className: string }> = {
  phone: { icon: Phone, className: 'bg-info-soft text-info' },
  visit: { icon: MapPin, className: 'bg-success-soft text-success' },
  online: { icon: Globe, className: 'bg-violet-soft text-violet' },
};

function TypeChip({ type }: { type: string }) {
  const meta = typeChipMeta[type] ?? { icon: MessageSquareText, className: 'bg-secondary text-muted-foreground' };
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex h-[21px] shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium',
        meta.className,
      )}
    >
      <Icon className="size-3" />
      {consultationTypeLabels[type] ?? type}
    </span>
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
  const needsFollowUp = getConsultationOutcomeLabel(consultation) === '후속 필요';
  const contextLabels = getConsultationContextLabels(consultation);
  const [propertyLabel, ...extraLabels] = contextLabels;

  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/60',
        selected && 'bg-muted',
      )}
      onClick={onSelect}
    >
      <span
        className={cn(
          'shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground/80',
          viewMode === 'contact' ? 'w-[84px]' : 'w-[38px]',
        )}
      >
        {viewMode === 'contact' ? formatRowDateTime(consultation.createdAt) : formatRowTime(consultation.createdAt)}
      </span>

      <TypeChip type={consultation.type} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">{consultation.contact?.name ?? '미지정 고객'}</span>
          <span
            className={cn(
              'inline-flex h-[19px] shrink-0 items-center rounded-[5px] px-[7px] text-[10.5px] font-semibold',
              signal.className,
            )}
          >
            {signal.label}
          </span>
          {propertyLabel && (
            <span className="inline-flex h-[19px] items-center gap-1 rounded-[5px] bg-secondary px-[7px] text-[10.5px] text-muted-foreground">
              <Building2 className="size-3" />
              {propertyLabel}
            </span>
          )}
          {extraLabels.slice(0, 2).map((label) => (
            <span key={label} className="inline-flex h-[19px] items-center rounded-[5px] bg-secondary px-[7px] text-[10.5px] text-muted-foreground">
              {label}
            </span>
          ))}
        </div>

        <p className="line-clamp-2 text-[12.5px] leading-normal text-foreground/80">
          {getConsultationPreview(consultation.content, 132)}
        </p>

        {needsFollowUp && (
          <span className="inline-flex h-5 items-center gap-1 self-start rounded-md bg-warning-soft px-2 text-[11px] font-medium text-warning">
            <CornerDownRight className="size-3" />
            {getConsultationActionLabel(consultation)}
          </span>
        )}
      </div>
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
    <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-2.5 text-xs text-muted-foreground">
      <span className="tabular-nums">전체 {total}건</span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="xs" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
          이전
        </Button>
        <span className="min-w-14 text-center tabular-nums">
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
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-20 w-full rounded-[11px]" />
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
