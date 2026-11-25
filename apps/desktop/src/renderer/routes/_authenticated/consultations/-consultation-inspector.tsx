/**
 * 상담분석의 옆 패널. 목록을 가리지 않고 한 건을 읽는다.
 *
 * 순서는 음성 기록 도구들(Granola · Attio · Grain)의 공통점을 따른다:
 * - 요약이 먼저, 받아쓰기 전문은 눌러서 연다 (같은 패널의 "통화 분석" 탭. 따로 뜨는 시트는 없다).
 * - AI가 쓴 글은 흐리게, 사람이 적은 글은 진하게 — 누가 쓴 말인지 색으로 구분한다.
 * - 통화와 방문을 가르지 않고 한 고객과의 상담을 시간 순서 하나로 잇는다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircle,
  ClipboardList,
  FileAudio,
  Loader2,
  Monitor,
  Pencil,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Trash2,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Consultation } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/format';
import { ConsultationContent } from './-consultation-badges';
import { useInspectorFocus } from '@/hooks/use-inspector-focus';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog, EntityChip } from '@/components/domain';
import { PropertyInspectorToolbar } from '../properties/-components/property-inspector-view';
import { UploadRecordingDialog } from '../calls/-upload-recording-dialog';
import { CallAnalysisPanel } from '../calls/-call-analysis-panel';
import { useRecordingUploadStore } from '../calls/-recording-upload-store';
import { CreateTaskDialog } from './-consultation-detail-sheet';
import {
  getConsultationContextCards,
  type ConsultationContextCard,
} from './-consultation-view-utils';
import {
  buildConsultationThread,
  formatConsultationWhen,
  getConsultationChannel,
  getConsultationRecordingState,
  getConsultationSummaryLine,
  hasOwnNote,
  type ConsultationChannelKind,
} from './-consultation-list-model';
import { useInspectorOutsideClose } from '@/hooks/use-inspector-outside-close';

export const CONSULTATION_INSPECTOR_ID = 'consultation-inspector';
export const CONSULTATION_INSPECTOR_WIDTH = 584;
const THREAD_LIMIT = 30;

/** Esc가 패널이 아니라 떠 있는 대화상자·메뉴를 닫아야 하는 경우 */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

export const consultationChannelIcons: Record<ConsultationChannelKind, LucideIcon> = {
  inbound: PhoneIncoming,
  outbound: PhoneOutgoing,
  phone: Phone,
  visit: Users,
  online: Monitor,
  other: ClipboardList,
};

const barButtonClassName =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground disabled:pointer-events-none disabled:opacity-50';

export function ConsultationInspector({
  consultationId,
  consultation,
  isLoading,
  closing,
  animate,
  onClose,
  onExited,
  onSelect,
  onOpenTab,
  onEdit,
  onDeleted,
  onShowContactOnly,
}: {
  consultationId: string;
  /** 목록에 있으면 목록의 것, 없으면 따로 불러온 것 */
  consultation: Consultation | null;
  isLoading: boolean;
  closing: boolean;
  animate: boolean;
  onClose: (animate?: boolean) => void;
  onExited: () => void;
  /** 상담 흐름에서 다른 상담을 고름 */
  onSelect: (id: string) => void;
  /** 도구 줄의 확장: 이 상담의 전체 화면을 새 탭으로 연다 */
  onOpenTab: (consultationId: string) => void;
  onEdit: (consultation: Consultation) => void;
  onDeleted: () => void;
  /** 이 고객의 상담만 목록에 남기기 */
  onShowContactOnly: (contact: { id: string; name: string }) => void;
}) {
  return (
    <ConsultationPanelShell
      focusKey={consultationId}
      ariaLabel="상담 상세 패널"
      closing={closing}
      animate={animate}
      onClose={onClose}
      onExited={onExited}
      // 매물관리 · 거래관리 패널과 같다: 확장을 누르면 이 상담의 전체 화면이 새 탭으로 열리고 패널은 닫힌다.
      // 녹음이 없는 상담에도 버튼이 있다(전체 화면에는 브리프가 나온다).
      onOpenNewTab={
        consultation
          ? () => {
              onOpenTab(consultation.id);
              onClose(false);
            }
          : undefined
      }
    >
      {consultation ? (
        <InspectorContent
          key={consultation.id}
          consultation={consultation}
          onSelect={onSelect}
          onEdit={() => onEdit(consultation)}
          onDeleted={onDeleted}
          onShowContactOnly={onShowContactOnly}
        />
      ) : isLoading ? (
        <InspectorSkeleton />
      ) : (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
          상담 기록을 찾을 수 없습니다. 지워졌거나 볼 수 없는 기록입니다.
        </div>
      )}
    </ConsultationPanelShell>
  );
}

export function InspectorSkeleton() {
  return (
    <div className="space-y-4 px-6 py-2">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/**
 * 상담분석의 옆 패널 틀. 상담 줄과 연결 대기 녹음 줄이 같은 틀로 열린다
 * (폭 · 도구 줄 · Esc · 미끄러져 열고 닫기가 같다). 목록을 가리는 넓은 시트는 쓰지 않는다.
 */
export function ConsultationPanelShell({
  focusKey,
  ariaLabel,
  closing,
  animate,
  onClose,
  onExited,
  onOpenNewTab,
  showExpand = true,
  children,
}: {
  /** 바뀌면 패널에 초점을 다시 옮긴다 */
  focusKey: string;
  ariaLabel: string;
  closing: boolean;
  animate: boolean;
  onClose: (animate?: boolean) => void;
  onExited: () => void;
  onOpenNewTab?: () => void;
  /** 전체 화면이 없는 것(연결 대기 녹음)은 확장 버튼을 두지 않는다 */
  showExpand?: boolean;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  useInspectorFocus(panelRef, !animate, focusKey);

  useEffect(() => {
    if (!closing) return;
    // 숨은 탭이나 모션 줄이기 설정에서는 transitionend가 오지 않을 수 있다.
    const timer = window.setTimeout(
      onExited,
      !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240,
    );
    return () => window.clearTimeout(timer);
  }, [closing, animate, onExited]);

  // 패널 밖을 누르면 닫는다 (떠 있는 창 · 줄의 열기 단추는 밖이 아니다)
  useInspectorOutsideClose(() => onClose());

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      event.preventDefault();
      onClose(false);
    };
    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true);
  }, [onClose]);

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      id={CONSULTATION_INSPECTOR_ID}
      data-consultation-inspector
      data-property-inspector
      data-state={closing ? 'closed' : 'open'}
      data-motion={animate ? 'slide' : 'none'}
      inert={closing}
      aria-hidden={closing || undefined}
      aria-label={ariaLabel}
      className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col border-l border-border bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.03)] outline-none"
      style={{ width: CONSULTATION_INSPECTOR_WIDTH, maxWidth: '100%' }}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === 'transform') {
          onExited();
        }
      }}
    >
      <PropertyInspectorToolbar onClose={onClose} onOpenNewTab={onOpenNewTab} showExpand={showExpand} />
      {children}
    </aside>
  );
}

type InspectorView = 'overview' | 'analysis';

function InspectorContent({
  consultation,
  onSelect,
  onEdit,
  onDeleted,
  onShowContactOnly,
}: {
  consultation: Consultation;
  onSelect: (id: string) => void;
  onEdit: () => void;
  onDeleted: () => void;
  onShowContactOnly: (contact: { id: string; name: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [taskOpen, setTaskOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  // 녹음이 있는 상담은 받아쓰기 · 업무 제안을 같은 패널의 분석 탭에서 본다 (따로 뜨는 시트 없음)
  const [view, setView] = useState<InspectorView>('overview');

  const channel = getConsultationChannel(consultation);
  const ChannelIcon = consultationChannelIcons[channel.kind];
  const recordingState = getConsultationRecordingState(consultation);
  const aiSummary = consultation.callRecording?.summary?.trim() || null;
  const ownNote = hasOwnNote(consultation);
  const contextCards = getConsultationContextCards(consultation).filter((card) => card.key !== 'contact');
  const contactName = consultation.contact?.name ?? '미지정 고객';
  const recordingId = consultation.callRecordingId ?? null;
  const hasRecording = Boolean(recordingId);
  const pendingSuggestions = consultation.callRecording?.pendingSuggestionCount ?? 0;
  const analysisLabel = consultation.type === 'visit' ? '방문 분석' : '통화 분석';
  const inspectorTabs: { value: InspectorView; label: string; count?: number }[] = [
    { value: 'overview', label: '상담' },
    { value: 'analysis', label: analysisLabel, count: pendingSuggestions },
  ];
  // 이 상담에 붙이려고 올리는 중인 녹음 (올리기 창은 바로 닫히고 여기서 진행을 본다)
  const attachUpload = useRecordingUploadStore((state) =>
    state.uploads.find((upload) => upload.attachTo?.id === consultation.id),
  );
  const retryUpload = useRecordingUploadStore((state) => state.retry);
  const dismissUpload = useRecordingUploadStore((state) => state.dismiss);
  // 실패로 남았는데 이미 녹음이 붙어 있으면 그 실패 표시는 사실이 아니다 — 지운다
  const staleFailedUploadId =
    attachUpload?.status === 'failed' && consultation.callRecordingId ? attachUpload.id : null;
  useEffect(() => {
    if (staleFailedUploadId) dismissUpload(staleFailedUploadId);
  }, [staleFailedUploadId, dismissUpload]);

  const deleteMutation = useMutation({
    mutationFn: () => api.consultations.remove(consultation.id),
    onSuccess: () => {
      toast.success('상담 기록을 지웠습니다.');
      void queryClient.invalidateQueries({ queryKey: ['consultations'] });
      // 연락처 상세와 목록의 최근 상담에서도 빠져야 한다
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setDeleteOpen(false);
      onDeleted();
    },
    onError: () => toast.error('상담 삭제에 실패했습니다'),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {/* 머리: 누구와 · 어떻게 · 언제 (녹음이 있으면 아래 탭 줄이 구분선을 맡는다) */}
      <div className={cn('shrink-0 px-6 pb-4', !recordingId && 'border-b border-[#ecebe8]')}>
        <h2 className="truncate text-[22px] font-semibold leading-8 text-foreground">{contactName}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <ChannelIcon className="size-4 text-[#8e8b86]" />
            {channel.label}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{formatConsultationWhen(consultation.createdAt)}</span>
          {consultation.createdBy?.name && (
            <>
              <span aria-hidden>·</span>
              <span>{consultation.createdBy.name} 기록</span>
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <EntityChip
            kind="contact"
            id={consultation.contact?.id ?? consultation.contactId}
            label={contactName}
            sublabel={consultation.contact?.phone ? formatPhone(consultation.contact.phone) : undefined}
          />
        </div>
      </div>

      {/* 탭: 매물관리 패널과 같은 밑줄 글자 탭 */}
      {recordingId && (
        <div role="tablist" aria-label="상담 상세 구역" className="flex shrink-0 gap-5 border-b border-[#ecebe8] px-6">
          {inspectorTabs.map((item) => {
            const selected = view === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={selected}
                data-inspector-tab={item.value}
                onClick={() => setView(item.value)}
                className={cn(
                  'relative h-10 whitespace-nowrap text-[13px] font-medium transition-colors focus-visible:outline-none',
                  selected
                    ? 'text-[#2f2e2a] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
                {item.count ? (
                  <span className="ml-1 text-[11.5px] font-medium text-[#a9a7a1]">{item.count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {recordingId && view === 'analysis' ? (
        // 받아쓰기 · 근거 · 업무 제안. 패널 폭에서는 브리프 아래에 녹음과 대화 기록이 이어진다
        <div role="tabpanel" data-consultation-analysis className="flex min-h-0 flex-1 flex-col">
          <CallAnalysisPanel recordingId={recordingId} showConsultations={false} />
        </div>
      ) : (
      <div role={recordingId ? 'tabpanel' : undefined} className="min-h-0 flex-1 overflow-y-auto">
        {hasRecording && (
          <Section title="AI 요약" data-consultation-ai-summary>
            {recordingState.tone === 'busy' ? (
              <p className="flex items-center gap-2 text-[14px] leading-6 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {recordingState.label} — {recordingState.hint}
              </p>
            ) : recordingState.tone === 'failed' ? (
              <p className="flex items-start gap-2 text-[14px] leading-6 text-destructive">
                <AlertCircle className="mt-1 size-4 shrink-0" />
                <span>
                  {recordingState.label}. {recordingState.hint}
                </span>
              </p>
            ) : aiSummary ? (
              // AI가 쓴 글은 흐리게 (사람이 적은 글과 색으로 구분)
              <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#6f6c66]">{aiSummary}</p>
            ) : (
              <p className="text-[14px] leading-6 text-muted-foreground">요약이 아직 없습니다.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              <button
                type="button"
                data-open-transcript
                onClick={() => setView('analysis')}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                받아쓰기 · 근거 보기
              </button>
              {pendingSuggestions > 0 && (
                <button
                  type="button"
                  onClick={() => setView('analysis')}
                  className="text-info underline-offset-4 hover:underline"
                >
                  확인할 업무 제안 {pendingSuggestions}건
                </button>
              )}
              {recordingState.tone === 'ready' && consultation.callRecording?.durationSec ? (
                <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
                  <FileAudio className="size-3.5" />
                  {recordingState.label.split(' · ')[0]}
                </span>
              ) : null}
            </div>
          </Section>
        )}

        {(ownNote || !hasRecording) && (
          <Section title={hasRecording ? '직접 적은 내용' : '상담 내용'} data-consultation-note>
            {/* 사람이 적은 글은 진하게 */}
            <ConsultationContent content={consultation.content} className="text-[14px] leading-6 text-foreground" />
          </Section>
        )}

        {!hasRecording && attachUpload && (
          <Section title="녹음" data-attach-upload={attachUpload.status}>
            {attachUpload.status === 'uploading' ? (
              <p className="flex items-center gap-2 text-[13px] leading-5 text-muted-foreground">
                <Loader2 className="size-4 shrink-0 animate-spin" />
                녹음을 올리는 중입니다 ({attachUpload.fileName}). 다 올라가면 받아쓰기가 시작됩니다.
              </p>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-start gap-2 text-[13px] leading-5 text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>녹음을 올리지 못했습니다. {attachUpload.error}</span>
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={cn(barButtonClassName, 'border border-border')}
                    onClick={() => retryUpload(attachUpload.id, queryClient)}
                  >
                    다시 올리기
                  </button>
                  <button type="button" className={barButtonClassName} onClick={() => dismissUpload(attachUpload.id)}>
                    지우기
                  </button>
                </div>
              </div>
            )}
          </Section>
        )}

        {!hasRecording && !attachUpload && (
          <Section title="녹음">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] leading-5 text-muted-foreground">
                녹음을 붙이면 받아쓰고 요약합니다. 적어 둔 내용은 바뀌지 않습니다.
              </p>
              <button
                type="button"
                data-attach-recording
                className={cn(barButtonClassName, 'border border-border')}
                onClick={() => setAttachOpen(true)}
              >
                <Upload className="size-3.5" />
                녹음 붙이기
              </button>
            </div>
          </Section>
        )}

        <Section title="연결">
          {contextCards.length > 0 ? (
            <ul className="-my-1 divide-y divide-[#f1f0ee]">
              {contextCards.map((card) => (
                <li key={`${card.key}-${card.title}`}>
                  <ContextLine card={card} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">연결된 매물·의뢰·희망 조건이 없습니다.</p>
          )}
        </Section>

        <ContactThread
          consultation={consultation}
          onSelect={onSelect}
          onShowContactOnly={onShowContactOnly}
        />
      </div>
      )}

      <div className="flex shrink-0 items-center gap-1 border-t border-[#ecebe8] px-6 py-3">
        <button type="button" className={barButtonClassName} onClick={() => setTaskOpen(true)}>
          <ClipboardList className="size-3.5" />업무 추가
        </button>
        <button type="button" className={barButtonClassName} onClick={onEdit}>
          <Pencil className="size-3.5" />수정
        </button>
        <button
          type="button"
          className={cn(barButtonClassName, 'ml-auto hover:text-destructive')}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-3.5" />삭제
        </button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="상담 기록을 삭제할까요?"
        description="삭제한 상담 기록은 복구할 수 없습니다."
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
      <CreateTaskDialog open={taskOpen} onOpenChange={setTaskOpen} consultation={consultation} />
      <UploadRecordingDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        attachTo={{
          id: consultation.id,
          type: consultation.type,
          contactName,
          createdAt: consultation.createdAt,
        }}
      />
    </div>
  );
}

// ----------------------------------------------------------------
// 이 고객과의 상담 흐름 (통화와 방문을 한 줄기로)
// ----------------------------------------------------------------

function ContactThread({
  consultation,
  onSelect,
  onShowContactOnly,
}: {
  consultation: Consultation;
  onSelect: (id: string) => void;
  onShowContactOnly: (contact: { id: string; name: string }) => void;
}) {
  const contactId = consultation.contact?.id ?? consultation.contactId;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['consultations', 'thread', contactId],
    queryFn: () => api.consultations.findAll({ contactId, limit: THREAD_LIMIT, sortOrder: 'desc' }),
    enabled: Boolean(contactId),
    // 흐름 속에 받아쓰기·분석 중인 상담이 있으면 끝날 때까지 다시 읽는다
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => getConsultationRecordingState(item).tone === 'busy') ? 8000 : false,
  });

  const items = data?.items ?? [];
  const total = data?.pagination?.total ?? items.length;
  // 지금 보는 상담이 최근 30건 밖에 있어도 흐름에서 빠지지 않게 한다
  const thread = buildConsultationThread(
    items.some((item) => item.id === consultation.id) ? items : [...items, consultation],
    consultation.id,
  );
  const contactName = consultation.contact?.name ?? '미지정 고객';

  return (
    <Section
      title="이 고객과의 상담 흐름"
      count={total}
      data-consultation-thread
      action={
        total > 1 ? (
          <button
            type="button"
            className="text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => onShowContactOnly({ id: contactId, name: contactName })}
          >
            목록에서 이 고객만 보기
          </button>
        ) : null
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : isError ? (
        <p className="text-[13px] text-muted-foreground">
          상담 흐름을 불러오지 못했습니다.{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            다시 시도
          </button>
        </p>
      ) : thread.length <= 1 ? (
        <p className="text-[13px] text-muted-foreground">이 고객과의 첫 상담입니다.</p>
      ) : (
        <ol className="relative">
          {/* 세로 줄기: 통화든 방문이든 같은 선 위에 놓인다 */}
          <span aria-hidden className="absolute bottom-3 left-[9px] top-3 w-px bg-[#e6e4e0]" />
          {thread.map(({ item, current, gapLabel }) => {
            const itemChannel = getConsultationChannel(item);
            const Icon = consultationChannelIcons[itemChannel.kind];
            const line = getConsultationSummaryLine(item);
            const hasAudio = Boolean(item.callRecordingId);
            return (
              <li key={item.id}>
                {gapLabel && (
                  <div className="py-0.5 pl-7 text-[11px] leading-4 text-[#a9a7a1]">{gapLabel}</div>
                )}
                <button
                  type="button"
                  aria-current={current ? 'true' : undefined}
                  disabled={current}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    'group/thread relative flex w-full items-start gap-2 rounded-[6px] py-1.5 pr-2 text-left transition-colors',
                    current ? 'bg-[rgba(33,27,23,0.04)]' : 'hover:bg-[rgba(33,27,23,0.04)]',
                  )}
                >
                  <span
                    className={cn(
                      'relative z-[1] mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full bg-white',
                      current ? 'text-foreground' : 'text-[#8e8b86]',
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[12px] leading-5 text-muted-foreground">
                      <span className={cn('tabular-nums', current && 'font-medium text-foreground')}>
                        {formatConsultationWhen(item.createdAt)}
                      </span>
                      <span>{itemChannel.label}</span>
                      {hasAudio && <FileAudio aria-label="녹음 있음" className="size-3 text-[#a9a7a1]" />}
                      {current && <span className="text-[11px] text-[#a9a7a1]">지금 보는 상담</span>}
                    </span>
                    <span
                      className={cn(
                        'block truncate text-[13px] leading-5',
                        line.fromAi ? 'text-[#6f6c66]' : 'text-foreground',
                      )}
                    >
                      {line.text || '내용 없음'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {total > thread.length && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          최근 {THREAD_LIMIT}건만 보입니다. 전체는 "목록에서 이 고객만 보기"로 확인하세요.
        </p>
      )}
    </Section>
  );
}

// ----------------------------------------------------------------
// 작은 부품
// ----------------------------------------------------------------

function Section({
  title,
  count,
  action,
  children,
  ...rest
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <section className="border-b border-[#ecebe8] px-6 py-4 last:border-b-0" {...rest}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[12px] font-medium leading-5 text-muted-foreground">
          {title}
          {count ? <span className="ml-1 text-[#a9a7a1]">{count}</span> : null}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

const contextLineClassName =
  'flex items-baseline gap-3 rounded-[6px] py-2 text-[13px] leading-5 transition-colors hover:bg-[rgba(33,27,23,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function ContextLine({ card }: { card: ConsultationContextCard }) {
  const content = (
    <>
      <span className="w-16 shrink-0 text-muted-foreground">{card.label}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{card.title}</span>
        {card.description && <span className="block truncate text-muted-foreground">{card.description}</span>}
      </span>
    </>
  );

  if (card.to === '/contacts/$id' && card.params) {
    return (
      <Link to="/contacts/$id" params={card.params} className={contextLineClassName}>
        {content}
      </Link>
    );
  }
  if (card.to === '/properties/$id' && card.params) {
    return (
      <Link to="/properties/$id" params={card.params} className={contextLineClassName}>
        {content}
      </Link>
    );
  }
  if (card.to === '/wanted-properties') {
    return (
      <Link to="/wanted-properties" search={card.search} className={contextLineClassName}>
        {content}
      </Link>
    );
  }
  if (card.to === '/buyer-requirements/$id' && card.params) {
    return (
      <Link to="/buyer-requirements/$id" params={card.params} className={contextLineClassName}>
        {content}
      </Link>
    );
  }
  return (
    <Link to="/properties" className={contextLineClassName}>
      {content}
    </Link>
  );
}
