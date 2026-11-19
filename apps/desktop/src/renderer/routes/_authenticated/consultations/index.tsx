/**
 * 상담분석: 통화와 방문 상담을 한 표에서 본다.
 *
 * - 목록 화면이므로 제목 · 설명 · 지표 없이 보기 탭과 도구 줄에서 시작한다.
 * - 통화와 방문은 탭으로 가르지 않는다. 둘 다 상담이고, "방식" 칸과 옆 패널의 상담 흐름으로 잇는다.
 * - 한 줄을 열면 옆 패널 하나로 본다. 상담은 요약 먼저, 받아쓰기와 업무 제안은 같은 패널의 분석 탭에서 읽는다.
 *   연결 대기 녹음도 같은 패널로 열린다 (목록을 가리는 넓은 시트는 쓰지 않는다).
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  CalendarClock,
  FileAudio,
  History,
  CircleDashed,
  Loader2,
  MessageSquareText,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Waypoints,
  Headset,
} from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type { CallRecordingListItem, Consultation } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTable } from '@/components/data-table';
import { ConfirmDialog, ContactNameChip, EmptyState, RowOpenButton } from '@/components/domain';
import { toast } from 'sonner';
import { ToolbarPillSearch, toolbarGhostButtonClassName } from '../properties/-components/property-toolbar';
import { ConsultationFilterBar } from './-consultation-filter-bar';
import { ConsultationFormDialog } from './-consultation-form-dialog';
import {
  CONSULTATION_INSPECTOR_ID,
  ConsultationInspector,
  consultationChannelIcons,
} from './-consultation-inspector';
import { RecordingInspector } from './-recording-inspector';
import { formatPhone } from '@/lib/format';
import { formatDuration, pendingReason } from '../calls/-call-utils';
import { useRecordingUploadStore, type RecordingUpload } from '../calls/-recording-upload-store';
import { UploadRecordingDialog } from '../calls/-upload-recording-dialog';
import {
  buildConsultationApiParams,
  type ConsultationEntityFilters,
} from './-consultation-view-utils';
import {
  CONSULTATION_VIEWS,
  formatConsultationWhen,
  getConsultationChannel,
  getConsultationRecordingLength,
  getConsultationRecordingState,
  getConsultationRowStatus,
  getPendingRecordingStatus,
  getConsultationSummaryLine,
  filterPendingRecordings,
  mergeConsultationRows,
  viewShowsPendingRecordings,
  type ConsultationTableRow,
  type ConsultationRowStatus,
  type ConsultationView,
} from './-consultation-list-model';

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

const PAGE_SIZE = 50;
/** 연결 대기 녹음은 한 번에 이만큼씩(서버 상한), 끝까지 불러온다 */
const PENDING_PAGE_SIZE = 100;

/** 올리는 중인 녹음도 표의 한 줄이다 (다 올라가면 서버의 줄이 그 자리를 잇는다) */
type UploadRow = { id: string; kind: 'uploading'; at: string; upload: RecordingUpload };
type Row = ConsultationTableRow<Consultation, CallRecordingListItem> | UploadRow;
/** 매물관리 표와 같은 행 높이 (36 + 선 1) */
const ROW_HEIGHT = 37;

/** 이름 배지를 담는 칸 (관리단지 표의 소유자명 칸과 같은 규격) */
const contactChipCell = 'flex min-w-0 text-[14px] leading-[21px] text-foreground';
const cellText = 'truncate text-[14px] leading-[21px] text-foreground';
const cellSub = 'truncate text-[14px] leading-[21px] text-muted-foreground';
const cellNumber = 'whitespace-nowrap text-[14px] leading-[21px] tabular-nums text-muted-foreground';

interface ConsultationsSearch {
  consultationId?: string;
  /** 연결 대기 녹음(아직 상담이 아닌 통화) 상세 */
  callId?: string;
}

export const Route = createFileRoute('/_authenticated/consultations/')({
  validateSearch: (search: Record<string, unknown>): ConsultationsSearch => ({
    consultationId: typeof search.consultationId === 'string' ? search.consultationId : undefined,
    callId: typeof search.callId === 'string' ? search.callId : undefined,
  }),
  component: ConsultationsPage,
});

function ConsultationsPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { consultationId, callId } = Route.useSearch();

  const [view, setView] = useState<ConsultationView>('all');
  const [filters, setFilters] = useState<ConsultationEntityFilters>(initialFilters);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Consultation | null>(null);

  const apiParams = useMemo(
    () => buildConsultationApiParams({ page: 1, sortOrder, filters, view, limit: PAGE_SIZE }),
    [sortOrder, filters, view],
  );

  const queryClient = useQueryClient();
  const showConsultations = view !== 'pending';
  const { data, isLoading: isConsultationsLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      enabled: showConsultations,
      queryKey: ['consultations', 'list', apiParams],
      queryFn: ({ pageParam }) => api.consultations.findAll({ ...apiParams, page: pageParam }),
      initialPageParam: 1,
      getNextPageParam: (last) =>
        last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
      // 받아쓰기 · 분석 중인 줄이 있으면 끝날 때까지 다시 불러온다
      refetchInterval: (query) =>
        query.state.data?.pages.some((page) =>
          page.items.some((item) => getConsultationRecordingState(item).tone === 'busy'),
        )
          ? 8000
          : false,
    });

  const consultations = useMemo(
    () => (showConsultations ? (data?.pages.flatMap((page) => page.items) ?? []) : []),
    [data?.pages, showConsultations],
  );
  const consultationTotal = showConsultations ? (data?.pages[0]?.pagination.total ?? 0) : 0;

  // 연결 대기 녹음: 녹음은 있는데 아직 상담 기록이 없는 것 (미등록 번호, 받아쓰기·분석 중, 실패).
  // 따로 떼어 두지 않고 상담과 같은 표에 시간 순서로 놓는다. 누르면 통화 상세가 열린다.
  const pendingQuery = useInfiniteQuery({
    queryKey: ['call-recordings', 'list', 'unlinked'],
    queryFn: ({ pageParam }) =>
      api.callRecordings.list({ unlinked: true, page: pageParam, limit: PENDING_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    // 받아쓰기·분석 중인 녹음이 있으면 끝날 때까지 다시 불러온다
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.items.some((item) => pendingReason(item).busy)) ? 8000 : false,
  });
  const { hasNextPage: hasMorePending, isFetchingNextPage: isFetchingPending, fetchNextPage: fetchMorePending } =
    pendingQuery;
  const isPendingError = pendingQuery.isError;
  useEffect(() => {
    // 오래된 대기 녹음도 표에서 빠지지 않게 끝까지 이어 불러온다
    // 건수에 상한을 두지 않는다: 중간에 멈추면 오래된 대기 녹음이 표에서 조용히 빠진다
    if (hasMorePending && !isFetchingPending && !isPendingError) void fetchMorePending();
  }, [hasMorePending, isFetchingPending, isPendingError, fetchMorePending]);

  // 이어 불러오다 실패했으면 남은 쪽부터, 처음부터 실패했으면 처음부터 다시 읽는다
  const retryPending = () =>
    pendingQuery.data && pendingQuery.hasNextPage ? pendingQuery.fetchNextPage() : pendingQuery.refetch();

  const pendingAll = useMemo(
    () => pendingQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [pendingQuery.data?.pages],
  );
  const pendingTotal = pendingQuery.data?.pages[0]?.pagination.total ?? pendingAll.length;

  // 표에서 빠진 대기 녹음은 상담 기록이 된 것이다 — 상담 목록을 새로 불러온다
  const previousPendingIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!pendingQuery.data) return;
    const ids = new Set(pendingAll.map((item) => item.id));
    const before = previousPendingIds.current;
    if (before && [...before].some((id) => !ids.has(id))) {
      void queryClient.invalidateQueries({ queryKey: ['consultations'] });
    }
    previousPendingIds.current = ids;
  }, [pendingQuery.data, pendingAll, queryClient]);

  // 목록에 건 조건은 대기 녹음에도 똑같이 건다 (연결 대기 보기에서도 무시하지 않는다)
  const pendingVisible = useMemo(() => {
    if (!viewShowsPendingRecordings(view)) return [];
    // 작업 요청 보기: 대기 녹음 가운데 사람이 처리할 것이 있는 것만
    const candidates =
      view === 'actionRequired'
        ? pendingAll.filter((recording) => pendingRowStatus(recording).tone === 'todo')
        : pendingAll;
    return filterPendingRecordings(candidates, {
      q: filters.q,
      quickFilter: filters.quickFilter,
      contactId: filters.contact?.id,
      hasPlaceFilter: Boolean(filters.site || filters.dong || filters.unit),
      type: filters.type,
      createdById: filters.createdBy?.id,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });
  }, [pendingAll, view, filters]);

  // 올리는 중인 녹음. 새 녹음은 표의 줄로, 상담에 붙이는 녹음은 그 상담 줄의 상태로 보인다.
  const uploads = useRecordingUploadStore((state) => state.uploads);
  const retryUpload = useRecordingUploadStore((state) => state.retry);
  const dismissUpload = useRecordingUploadStore((state) => state.dismiss);
  const attachUploads = useMemo(
    () => new Map(uploads.filter((upload) => upload.attachTo).map((upload) => [upload.attachTo!.id, upload])),
    [uploads],
  );
  const newUploads = useMemo(() => uploads.filter((upload) => !upload.attachTo), [uploads]);
  // 붙이기에 실패했다고 남아 있는데 그 상담에 이미 녹음이 붙어 있으면(응답만 못 받았거나 다른 사람이 붙임)
  // 실패 표시는 사실이 아니다 — 지운다. 다시 올리면 "이미 녹음이 붙어 있는 상담"으로 거절될 뿐이다.
  useEffect(() => {
    for (const consultation of consultations) {
      const upload = attachUploads.get(consultation.id);
      if (upload?.status === 'failed' && consultation.callRecordingId) dismissUpload(upload.id);
    }
  }, [consultations, attachUploads, dismissUpload]);
  // 목록에 건 조건은 올리는 중인 줄에도 똑같이 건다
  const visibleUploads = useMemo(() => {
    // 올리는 중인 줄은 아직 작업 요청이 아니다
    if (view === 'actionRequired') return [];
    const asRecordings = newUploads.map((upload) => ({
      id: upload.id,
      calledAt: upload.calledAt,
      direction: upload.kind === 'visit' ? 'visit' : upload.direction,
      phoneNumber: upload.phoneNumber,
      contact: null,
      user: null,
      analysis: null,
    }));
    const kept = new Set(
      filterPendingRecordings(asRecordings, {
        q: filters.q,
        quickFilter: filters.quickFilter,
        contactId: filters.contact?.id,
        hasPlaceFilter: Boolean(filters.site || filters.dong || filters.unit),
        type: filters.type,
        // 올리는 사람은 나 자신이라 상담자 조건으로는 거르지 않는다
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      }).map((item) => item.id),
    );
    return newUploads.filter((upload) => kept.has(upload.id));
  }, [newUploads, view, filters]);

  const rows = useMemo<Row[]>(() => {
    const merged: Row[] = mergeConsultationRows(consultations, pendingVisible, {
      sortOrder,
      hasMoreConsultations: showConsultations && Boolean(hasNextPage),
    });
    // 올리는 중인 줄은 방금 한 일이라 표의 앞머리에 둔다 (오래된 순이면 끝에)
    const uploading: UploadRow[] = visibleUploads.map((upload) => ({
      id: `upload:${upload.id}`,
      kind: 'uploading',
      at: upload.calledAt,
      upload,
    }));
    return sortOrder === 'desc' ? [...uploading, ...merged] : [...merged, ...uploading];
  }, [consultations, pendingVisible, visibleUploads, sortOrder, showConsultations, hasNextPage]);
  const isLoading = showConsultations ? isConsultationsLoading : pendingQuery.isLoading;
  const total = consultationTotal + pendingVisible.length;

  // 선택 상담: 주소의 값이 기준 (딥링크 가능). 지금 목록에 없으면 한 건만 따로 읽는다.
  const selectedFromList = useMemo(
    () => consultations.find((item) => item.id === consultationId) ?? null,
    [consultations, consultationId],
  );
  const { data: selectedFetched, isLoading: isSelectedLoading } = useQuery({
    queryKey: ['consultation', consultationId],
    queryFn: () => api.consultations.findOne(consultationId!),
    enabled: Boolean(consultationId) && !selectedFromList,
    // 목록 밖의 상담(주소로 열었거나 필터에 걸러진 것)도 받아쓰기·분석이 끝날 때까지 다시 읽는다
    refetchInterval: (query) =>
      query.state.data && getConsultationRecordingState(query.state.data).tone === 'busy' ? 8000 : false,
  });
  const selectedConsultation =
    selectedFromList ??
    (consultationId != null && selectedFetched?.id === consultationId ? (selectedFetched ?? null) : null);

  // 옆 패널은 매물관리와 같은 방식으로 열고 닫는다: 닫을 때는 미끄러져 나간 뒤에 선택을 지운다.
  const [isInspectorClosing, setIsInspectorClosing] = useState(false);
  const [inspectorMotion, setInspectorMotion] = useState(true);

  const selectConsultation = useCallback(
    (id: string | null) => {
      void navigate({
        search: (current) => ({ ...current, callId: undefined, consultationId: id ?? undefined }),
        replace: false,
      });
    },
    [navigate],
  );
  const openInspector = useCallback(
    (id: string) => {
      setInspectorMotion(!document.activeElement?.matches(':focus-visible'));
      setIsInspectorClosing(false);
      selectConsultation(id);
    },
    [selectConsultation],
  );
  const closeInspector = useCallback((animate = true) => {
    setInspectorMotion(animate);
    setIsInspectorClosing(true);
  }, []);
  const finishClosingInspector = useCallback(() => {
    setIsInspectorClosing(false);
    selectConsultation(null);
  }, [selectConsultation]);
  // 닫히는 중인 줄은 표의 열기 버튼을 바로 "열기"로 되돌린다
  const openConsultationId = isInspectorClosing ? null : (consultationId ?? null);
  const openCallId = isInspectorClosing ? null : (callId ?? null);

  // 연결 대기 녹음도 같은 옆 패널로 연다 (주소의 callId가 기준. 목록에 없는 녹음은 패널이 따로 읽는다)
  const selectCall = useCallback(
    (id: string | null) => {
      void navigate({
        search: (current) => ({ ...current, consultationId: undefined, callId: id ?? undefined }),
        replace: false,
      });
    },
    [navigate],
  );
  const openCall = useCallback(
    (id: string) => {
      setInspectorMotion(!document.activeElement?.matches(':focus-visible'));
      setIsInspectorClosing(false);
      selectCall(id);
    },
    [selectCall],
  );
  // 상담으로 전환한 녹음은 그 상담으로 이어서 연다 (같은 자리의 패널이 내용만 바뀐다)
  const openConvertedConsultation = useCallback(
    (consultation: Consultation) => {
      setInspectorMotion(false);
      setIsInspectorClosing(false);
      selectConsultation(consultation.id);
    },
    [selectConsultation],
  );

  const updateFilters = (updater: (current: ConsultationEntityFilters) => ConsultationEntityFilters) => {
    setFilters(updater);
  };

  const openCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };
  // 옆 패널의 확장 버튼: 상담 전체 화면을 새 탭으로 연다 (매물관리 · 거래관리 패널과 같다)
  const createTab = useTabStore((state) => state.createTab);
  const openConsultationTab = (id: string) => {
    const route = `/consultations/${id}`;
    const meta = getRouteMeta(route);
    createTab({ route, kind: meta.kind, title: meta.title });
  };

  const openEdit = (consultation: Consultation) => {
    setEditTarget(consultation);
    setFormOpen(true);
  };

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: 'when',
        accessorKey: 'at',
        header: () => <HeaderLabel icon={<CalendarClock />} label="일시" />,
        size: 148,
        minSize: 120,
        enableSorting: true,
        cell: ({ row }) => <span className={cellNumber}>{formatConsultationWhen(row.original.at)}</span>,
      },
      {
        id: 'contact',
        header: () => <HeaderLabel icon={<UserRound />} label="고객" />,
        size: 152,
        minSize: 112,
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.kind === 'uploading') {
            const { phoneNumber } = row.original.upload;
            return (
              <span className={cn(cellNumber, 'block truncate')}>
                {phoneNumber ? formatPhone(phoneNumber) : '—'}
              </span>
            );
          }
          if (row.original.kind === 'pending') {
            const { recording } = row.original;
            const isCurrent = openCallId === recording.id;
            const name = recording.contact?.name;
            return (
              <>
                {name && recording.contact ? (
                  // 등록된 번호의 고객은 관리단지 표의 소유자명과 같은 이름 배지로 보인다 (누르면 연락처)
                  <span className={contactChipCell}>
                    <ContactNameChip contactId={recording.contact.id} name={name} />
                  </span>
                ) : (
                  // 미등록 번호는 이름 자리에 번호를 보인다
                  <span className={cn(cellNumber, 'block truncate')}>
                    {recording.phoneNumber ? formatPhone(recording.phoneNumber) : '미등록 번호'}
                  </span>
                )}
                <RowOpenButton
                  label={`${name ?? '미등록 번호'} 녹음`}
                  current={isCurrent}
                  controls={CONSULTATION_INSPECTOR_ID}
                  openTitle="녹음 상세 열기"
                  closeTitle="녹음 상세 닫기"
                  onToggle={() => (isCurrent ? closeInspector() : openCall(recording.id))}
                />
              </>
            );
          }
          const { consultation } = row.original;
          const name = consultation.contact?.name ?? '미지정 고객';
          const isCurrent = openConsultationId === consultation.id;
          return (
            <>
              {consultation.contact ? (
                <span className={contactChipCell}>
                  <ContactNameChip contactId={consultation.contact.id} name={name} />
                </span>
              ) : (
                <span className={cn(cellSub, 'block')}>{name}</span>
              )}
              <RowOpenButton
                label={`${name} 상담`}
                current={isCurrent}
                controls={CONSULTATION_INSPECTOR_ID}
                onToggle={() => (isCurrent ? closeInspector() : openInspector(consultation.id))}
              />
            </>
          );
        },
      },
      {
        id: 'channel',
        header: () => <HeaderLabel icon={<Waypoints />} label="방식" />,
        size: 112,
        minSize: 88,
        enableSorting: false,
        cell: ({ row }) => {
          const channel = rowChannel(row.original);
          const Icon = consultationChannelIcons[channel.kind];
          return (
            <span className={cn(cellText, 'flex items-center gap-1.5')}>
              <Icon className="size-4 shrink-0 text-[#8e8b86]" />
              <span className="truncate">{channel.label}</span>
            </span>
          );
        },
      },
      {
        id: 'createdBy',
        header: () => <HeaderLabel icon={<Headset />} label="상담자" />,
        size: 96,
        minSize: 72,
        enableSorting: false,
        cell: ({ row }) => (
          <span className={cellSub}>
            {(row.original.kind === 'uploading'
              ? null
              : row.original.kind === 'pending'
                ? row.original.recording.user?.name
                : row.original.consultation.createdBy?.name) ?? '—'}
          </span>
        ),
      },
      {
        id: 'summary',
        header: () => <HeaderLabel icon={<MessageSquareText />} label="내용" />,
        size: 440,
        minSize: 200,
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.kind === 'uploading') {
            const { upload } = row.original;
            return (
              <span className="flex min-w-0 items-center gap-2" title={upload.fileName}>
                <span className={cellSub}>{upload.fileName}</span>
                {upload.status === 'failed' && (
                  // 실패한 줄은 조용히 사라지지 않는다: 여기서 다시 올리거나 지운다
                  <span className="flex shrink-0 items-center gap-2 text-[13px]">
                    <button
                      type="button"
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        retryUpload(upload.id, queryClient);
                      }}
                    >
                      다시 올리기
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        dismissUpload(upload.id);
                      }}
                    >
                      지우기
                    </button>
                  </span>
                )}
              </span>
            );
          }
          const line =
            row.original.kind === 'pending'
              ? // 대기 녹음의 글은 모두 AI 요약이다
                { text: (row.original.recording.analysis?.summary ?? '').replace(/\s+/g, ' ').trim(), fromAi: true }
              : getConsultationSummaryLine(row.original.consultation);
          if (!line.text) {
            return (
              <span className={cellSub}>{row.original.kind === 'pending' ? '아직 요약이 없습니다' : '내용 없음'}</span>
            );
          }
          return (
            <span className="flex min-w-0 items-center gap-1.5" title={line.text}>
              {/* 누가 쓴 말인지: AI 요약은 흐리게, 사람이 적은 글은 진하게 */}
              {line.fromAi ? (
                <Sparkles aria-label="AI 요약" className="size-3.5 shrink-0 text-[#a9a7a1]" />
              ) : (
                <PenLine aria-label="직접 적은 내용" className="size-3.5 shrink-0 text-[#a9a7a1]" />
              )}
              <span className={line.fromAi ? cellSub : cellText}>{line.text}</span>
            </span>
          );
        },
      },
      {
        id: 'recording',
        header: () => <HeaderLabel icon={<FileAudio />} label="녹음" />,
        size: 92,
        minSize: 72,
        enableSorting: false,
        cell: ({ row }) => {
          const length =
            row.original.kind === 'uploading'
              ? row.original.upload.durationSec
                ? formatDuration(row.original.upload.durationSec)
                : '있음'
              : row.original.kind === 'pending'
              ? row.original.recording.durationSec > 0
                ? formatDuration(row.original.recording.durationSec)
                : '있음'
              : getConsultationRecordingLength(row.original.consultation);
          return <span className={cellNumber}>{length || '—'}</span>;
        },
      },
      {
        // 이 줄에 지금 무슨 일이 필요한지. 무엇에 연결된 상담인지는 옆 패널에서 본다.
        id: 'status',
        header: () => <HeaderLabel icon={<CircleDashed />} label="상태" />,
        size: 168,
        minSize: 112,
        enableSorting: false,
        cell: ({ row }) => (
          <StatusCell
            status={
              row.original.kind === 'uploading'
                ? getUploadStatus(row.original.upload)
                : row.original.kind === 'pending'
                  ? pendingRowStatus(row.original.recording)
                  : // 이 상담에 붙이는 녹음을 올리는 중이면 그 상태가 먼저다
                    attachUploads.has(row.original.consultation.id) && !row.original.consultation.callRecordingId
                    ? getUploadStatus(attachUploads.get(row.original.consultation.id)!)
                    : getConsultationRowStatus(row.original.consultation)
            }
          />
        ),
      },
    ],
    [openConsultationId, openCallId, closeInspector, openInspector, openCall, attachUploads, retryUpload, dismissUpload, queryClient],
  );

  const sorting = useMemo<SortingState>(() => [{ id: 'when', desc: sortOrder === 'desc' }], [sortOrder]);

  const hasConditions = view !== 'all' || JSON.stringify(filters) !== JSON.stringify(initialFilters);
  const hiddenPendingCount = pendingAll.length - pendingVisible.length;

  return (
    <div data-consultations-page className="relative -m-4 flex min-h-0 flex-1 bg-white">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* 보기 탭 + 도구 */}
        {/* 매물관리의 도구줄과 같은 구성: 탭 + 검색 + 오른쪽 작업, 그 아래 선 */}
        <div
          data-consultations-viewbar
          className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5"
        >
          <div role="tablist" aria-label="보기" className="flex shrink-0 items-center gap-0.5">
            {CONSULTATION_VIEWS.map((item) => {
              const selected = view === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setView(item.value)}
                  className={cn(
                    'inline-flex h-8 items-center rounded-[20px] px-3 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    selected
                      ? 'bg-[rgba(33,27,23,0.05)] text-foreground'
                      : 'text-muted-foreground hover:bg-[rgba(33,27,23,0.05)] hover:text-foreground',
                  )}
                >
                  {item.label}
                  {/* 연결 대기는 처리할 건수를 함께 보인다 */}
                  {item.value === 'pending' && pendingTotal > 0 && (
                    <span className="ml-1.5 text-[13px] tabular-nums text-warning-strong">{pendingTotal}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex min-w-[160px] max-w-[360px] flex-1">
            <ToolbarPillSearch
              value={filters.q ?? ''}
              onChange={(q) => updateFilters((current) => ({ ...current, q }))}
              placeholder="고객, 상담 내용, 단지"
              ariaLabel="상담 검색"
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Link to="/calls/logs" className={cn(toolbarGhostButtonClassName, 'rounded-full')}>
              <History className="size-3.5" />
              통화 이력
            </Link>
            <button
              type="button"
              className={cn(toolbarGhostButtonClassName, 'rounded-full')}
              onClick={() => setUploadOpen(true)}
            >
              <Upload className="size-3.5" />
              녹음 올리기
            </button>
            <Button size="sm" className="ml-1 h-[30px] shrink-0 rounded-[8px] px-3" onClick={openCreate}>
              <Plus className="size-3.5" />새 상담
            </Button>
          </div>
        </div>

        <ConsultationFilterBar
          filters={filters}
          onFiltersChange={updateFilters}
          hasActiveFilters={
            sortOrder !== 'desc' || JSON.stringify(filters) !== JSON.stringify(initialFilters)
          }
          onReset={() => {
            setFilters(initialFilters);
            setSortOrder('desc');
          }}
        />

        {/* 대기 녹음을 (일부라도) 불러오지 못했으면 알리고 여기서 다시 시도하게 한다. 받은 줄은 표에 그대로 둔다 */}
        {isPendingError && viewShowsPendingRecordings(view) && !(view === 'pending' && pendingAll.length === 0) && (
          <div
            role="alert"
            data-pending-recordings-error
            className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2 text-[13px] text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {pendingAll.length > 0
                ? `연결 대기 녹음을 끝까지 불러오지 못했습니다. ${pendingTotal.toLocaleString()}건 중 ${pendingAll.length.toLocaleString()}건만 표에 있습니다.`
                : '연결 대기 녹음을 불러오지 못했습니다. 표에는 상담만 보입니다.'}
            </span>
            <button
              type="button"
              disabled={pendingQuery.isFetching}
              className={cn(toolbarGhostButtonClassName, 'rounded-full text-foreground')}
              onClick={() => void retryPending()}
            >
              {pendingQuery.isFetching && <Loader2 className="size-3.5 animate-spin" />}
              다시 시도
            </button>
          </div>
        )}

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          {(showConsultations ? isError : pendingQuery.isError && pendingAll.length === 0) ? (
            <EmptyState
              icon={AlertCircle}
              title="상담 기록을 불러오지 못했습니다"
              description="네트워크 상태를 확인한 뒤 다시 시도하세요."
              className="flex-1"
              action={
                <Button
                  variant="outline"
                  onClick={() => void (showConsultations ? refetch() : retryPending())}
                >
                  다시 시도
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              totalCount={total}
              pageSize={PAGE_SIZE}
              sorting={sorting}
              onSortingChange={(next) => {
                // 정렬은 일시 하나뿐이다: 지우면 최신순으로 돌아간다
                setSortOrder(next[0]?.id === 'when' && !next[0].desc ? 'asc' : 'desc');
              }}
              layout="full-height"
              variant="notion"
              propertyListTone
              rowHeight={ROW_HEIGHT}
              scrollResetKey={JSON.stringify(apiParams)}
              getRowSelectionLabel={(row) => `${rowName(row)} ${row.kind === 'consultation' ? '상담' : '녹음'} 선택`}
              // 체크박스로 여러 줄을 골라 한 번에 처리한다. 선택 막대는 표 아래에 두어 체크해도 표가 밀리지 않는다.
              enableRowSelection
              selectedRowIds={selectedRowIds}
              onRowSelectionChange={setSelectedRowIds}
              selectionToolbarPlacement="bottom"
              selectionItemLabel="줄"
              renderBulkActions={(selectedRows) => (
                <ConsultationBulkActions
                  rows={selectedRows}
                  onRemoved={(removedIds) => {
                    // 지운 줄은 선택에서도 뺀다 (지우지 못한 줄은 골라진 채로 남는다)
                    setSelectedRowIds((current) => current.filter((id) => !removedIds.includes(id)));
                    // 옆 패널에 열려 있던 상담이 지워졌으면 닫는다 — 없는 상담을 계속 보이지 않게
                    if (consultationId && removedIds.includes(consultationId)) {
                      setIsInspectorClosing(false);
                      selectConsultation(null);
                    }
                  }}
                />
              )}
              activateOnDoubleClick
              isLoading={isLoading}
              isLoadingMore={isFetchingNextPage}
              onEndReached={() => {
                if (showConsultations && hasNextPage && !isFetchingNextPage) void fetchNextPage();
              }}
              emptyMessage={
                view === 'pending'
                  ? '연결 대기 녹음이 없습니다. 올린 녹음은 모두 상담 기록이 되었습니다.'
                  : view === 'actionRequired' && JSON.stringify(filters) === JSON.stringify(initialFilters)
                    ? '처리할 것이 남은 상담이 없습니다.'
                    : hasConditions
                  ? '조건에 맞는 상담이 없습니다.'
                  : '상담 기록이 없습니다. 새 상담을 적거나 녹음을 올려 보세요.'
              }
              onRowClick={(row) =>
                // 올리는 중인 줄은 아직 열 것이 없다
                row.kind === 'uploading'
                  ? undefined
                  : row.kind === 'pending'
                    ? openCall(row.recording.id)
                    : openInspector(row.consultation.id)
              }
              renderStatusBar={({ focusedRow }) => (
                <span>
                  {isLoading
                    ? '불러오는 중'
                    : focusedRow
                      ? `${rowName(focusedRow)} · ${rowChannel(focusedRow).label} · ${formatConsultationWhen(focusedRow.at)}${focusedRow.kind === 'pending' ? ` · ${pendingRowStatus(focusedRow.recording).label}` : focusedRow.kind === 'uploading' ? ` · ${getUploadStatus(focusedRow.upload).label}` : ''}`
                      : [
                          showConsultations
                            ? `상담 ${consultations.length.toLocaleString()} / ${consultationTotal.toLocaleString()}건`
                            : null,
                          pendingVisible.length > 0 ? `연결 대기 녹음 ${pendingVisible.length.toLocaleString()}건` : null,
                          sortOrder === 'desc' ? '최신순' : '오래된 순',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  {/* 작업 요청 보기는 원래 할 일이 있는 줄만 보인다 — 빠진 건수를 알릴 일이 아니다 */}
                  {!isLoading && !focusedRow && hiddenPendingCount > 0 && view !== 'actionRequired'
                    ? ` · 조건에 맞지 않는 연결 대기 녹음 ${hiddenPendingCount}건은 빠져 있습니다`
                    : ''}
                  {hasMorePending && !isPendingError ? ' · 연결 대기 녹음을 더 불러오는 중...' : ''}
                  {newUploads.length > visibleUploads.length
                    ? ` · 올리는 중인 녹음 ${newUploads.length - visibleUploads.length}건은 지금 조건에 맞지 않아 보이지 않습니다`
                    : ''}
                  {!isLoading && hasNextPage && !isFetchingNextPage ? ' · 아래로 스크롤하면 더 불러옵니다' : ''}
                  {isFetchingNextPage ? ' · 더 불러오는 중...' : ''}
                  {!isLoading && !focusedRow ? ' · 두 번 누르면 상세' : ''}
                </span>
              )}
            />
          )}
        </section>
      </div>

      {consultationId ? (
        <ConsultationInspector
          consultationId={consultationId}
          consultation={selectedConsultation}
          isLoading={isSelectedLoading}
          closing={isInspectorClosing}
          animate={inspectorMotion}
          onClose={closeInspector}
          onExited={finishClosingInspector}
          onSelect={(id) => {
            setIsInspectorClosing(false);
            selectConsultation(id);
          }}
          onOpenTab={openConsultationTab}
          onEdit={openEdit}
          onDeleted={() => selectConsultation(null)}
          onShowContactOnly={(contact) =>
            setFilters((current) => ({ ...current, contact: { id: contact.id, label: contact.name } }))
          }
        />
      ) : null}

      {/* 연결 대기 녹음도 상담과 같은 옆 패널로 연다 */}
      {callId ? (
        <RecordingInspector
          recordingId={callId}
          initial={pendingAll.find((recording) => recording.id === callId) ?? null}
          closing={isInspectorClosing}
          animate={inspectorMotion}
          onClose={closeInspector}
          onExited={finishClosingInspector}
          onConverted={openConvertedConsultation}
        />
      ) : null}

      <UploadRecordingDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />

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

/**
 * 고른 줄을 한 번에 처리한다. 지울 수 있는 것은 상담 기록뿐이다 —
 * 아직 상담이 아닌 녹음과 올리는 중인 줄은 골라져 있어도 건드리지 않고, 그렇다고 알린다.
 */
function ConsultationBulkActions({
  rows,
  onRemoved,
}: {
  rows: Row[];
  /** 실제로 지워진 상담의 id (일부만 지워졌어도 불린다) */
  onRemoved: (removedIds: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const consultations = rows.flatMap((row) => (row.kind === 'consultation' ? [row.consultation] : []));
  const others = rows.length - consultations.length;

  const remove = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        consultations.map((consultation) => api.consultations.remove(consultation.id)),
      );
      const removedIds = consultations
        .filter((_, index) => results[index].status === 'fulfilled')
        .map((consultation) => consultation.id);
      return { removedIds, failed: results.length - removedIds.length };
    },
    onSuccess: async ({ removedIds, failed }) => {
      const removed = removedIds.length;
      // 지워진 상담의 한 건 조회 결과를 버린다. 남겨 두면 다시 읽기가 404로 실패해도 옛 내용이 계속 보인다.
      for (const id of removedIds) queryClient.removeQueries({ queryKey: ['consultation', id] });
      onRemoved(removedIds);
      // 일부만 지워졌어도 목록은 새로 불러온다 (지워진 줄이 남아 보이지 않게)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['consultations'] }),
        queryClient.invalidateQueries({ queryKey: ['consultation'] }),
        queryClient.invalidateQueries({ queryKey: ['call-recordings'] }),
      ]);
      setConfirmOpen(false);
      if (failed > 0) {
        toast.error(`상담 ${removed}건을 지웠고 ${failed}건은 지우지 못했습니다. 남은 줄을 확인해 주세요.`);
        return;
      }
      toast.success(`상담 ${removed}건을 지웠습니다`);
    },
    onError: () => toast.error('상담을 지우지 못했습니다'),
  });

  return (
    <div data-consultation-bulk-actions className="flex flex-wrap items-center gap-2">
      {others > 0 && (
        <span className="text-[11.5px] text-muted-foreground">
          녹음 {others}건은 상담 기록이 아니라 여기서 지울 수 없습니다
        </span>
      )}
      <button
        type="button"
        className={cn(toolbarGhostButtonClassName, 'rounded-full hover:text-destructive')}
        disabled={consultations.length === 0 || remove.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="size-3.5" />
        상담 {consultations.length}건 삭제
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`상담 기록 ${consultations.length}건을 삭제할까요?`}
        description="삭제한 상담 기록은 복구할 수 없습니다. 붙어 있던 녹음과 받아쓰기는 지워지지 않고 연결 대기 녹음으로 남습니다."
        confirmLabel="삭제"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function pendingRowStatus(recording: CallRecordingListItem): ConsultationRowStatus {
  return getPendingRecordingStatus({
    hasContact: Boolean(recording.contact),
    sttStatus: recording.sttStatus,
    analysisStatus: recording.analysisStatus,
    pendingSuggestionCount: recording._count?.suggestions ?? 0,
  });
}

/** 올리는 중 · 올리기 실패 */
function getUploadStatus(upload: RecordingUpload): ConsultationRowStatus {
  return upload.status === 'failed'
    ? { tone: 'failed', label: '올리기 실패', hint: upload.error ?? '녹음을 올리지 못했습니다. 다시 올려 주세요.' }
    : {
        tone: 'busy',
        label: '올리는 중',
        hint: '녹음 파일을 서버로 보내고 있습니다. 다 올라가면 받아쓰기가 시작됩니다. 앱을 닫으면 올라가지 않습니다.',
      };
}

function rowName(row: Row) {
  if (row.kind === 'uploading') return row.upload.phoneNumber ? formatPhone(row.upload.phoneNumber) : row.upload.fileName;
  return row.kind === 'pending'
    ? (row.recording.contact?.name ?? '미등록 번호')
    : (row.consultation.contact?.name ?? '미지정 고객');
}

function rowChannel(row: Row) {
  if (row.kind === 'consultation') return getConsultationChannel(row.consultation);
  const direction =
    row.kind === 'uploading'
      ? row.upload.kind === 'visit'
        ? 'visit'
        : row.upload.direction
      : row.recording.direction;
  if (direction === 'visit') return { kind: 'visit' as const, label: '방문' };
  return direction === 'outbound'
    ? { kind: 'outbound' as const, label: '전화 발신' }
    : { kind: 'inbound' as const, label: '전화 수신' };
}

function HeaderLabel({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    // 매물관리 표 머리와 같은 모양: 13px 보통 굵기, 16px 아이콘
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[21px] text-inherit">
      {icon && <span className="shrink-0 [&>svg]:size-4 [&>svg]:text-[#8e8b86]">{icon}</span>}
      <span className="truncate">{label}</span>
    </span>
  );
}

/** 문서관리 표의 상태 꼬리표와 같은 규격: 높이 20 · 모서리 4 · 좌우 6 · 13px 보통 굵기 */
const statusPillClassName =
  'inline-flex h-5 min-w-0 max-w-full items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 py-0 text-[13px] font-normal leading-5';

/** 연한 바탕 + 진한 글자 (StatusBadge와 같은 색 짝). 기다리면 되는 것은 파랑, 할 일은 노랑, 실패는 빨강, 끝난 것은 초록 */
const STATUS_TONE_CLASS: Record<Exclude<ConsultationRowStatus['tone'], 'none'>, string> = {
  busy: 'bg-info-soft text-info',
  todo: 'bg-warning-soft text-warning-strong',
  quiet: 'bg-neutral-soft text-muted-foreground',
  failed: 'bg-destructive-soft text-destructive',
  done: 'bg-success-soft text-success',
};

/** 상태 칸: 상태는 줄에서 배지로 바로 보이고, 이유는 올려 두면 나온다 */
function StatusCell({ status }: { status: ConsultationRowStatus }) {
  if (status.tone === 'none') return <span className={cellSub}>—</span>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-row-status={status.tone} className={cn(statusPillClassName, STATUS_TONE_CLASS[status.tone])}>
          {status.tone === 'busy' && <Loader2 className="size-3 shrink-0 animate-spin" />}
          <span className="truncate">{status.label}</span>
        </span>
      </TooltipTrigger>
      {status.hint && <TooltipContent side="bottom">{status.hint}</TooltipContent>}
    </Tooltip>
  );
}
