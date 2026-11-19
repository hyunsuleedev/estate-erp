/**
 * 연결 대기 녹음(아직 상담 기록이 되지 않은 통화 · 방문 녹음)의 옆 패널.
 *
 * 상담 줄과 같은 틀(`ConsultationPanelShell`)로 열린다 — 상담분석의 상세는 이 옆 패널 하나다.
 * 머리에는 누구와 · 어떻게 · 언제와 왜 아직 상담이 아닌지를 두고, 본문은 상담의 "통화 분석" 탭과
 * 같은 `CallAnalysisPanel`(요약 · 업무 제안 · 받아쓰기)이다. 연락처를 잇고 상담으로 전환하는 것도 여기서 한다.
 */
import { useState } from 'react';
import { AlertCircle, Link2, Loader2, MessageSquarePlus, UserPlus } from 'lucide-react';
import type { CallRecordingDetail, CallRecordingListItem, Consultation } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatDateTime, formatPhone } from '@/lib/format';
import { EntityChip } from '@/components/domain';
import { CallAnalysisPanel, useCallRecordingDetail } from '../calls/-call-analysis-panel';
import { formatDuration } from '../calls/-call-utils';
import { LinkContactDialog, RegisterContactDialog } from '../calls/-contact-dialogs';
import { ConvertConsultationDialog } from '../calls/-convert-dialog';
import {
  ConsultationPanelShell,
  InspectorSkeleton,
  consultationChannelIcons,
} from './-consultation-inspector';
import { getPanelStatusHint, getPendingRecordingStatus } from './-consultation-list-model';

const barButtonClassName =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground disabled:pointer-events-none disabled:opacity-50';

type RecordingItem = CallRecordingListItem & Partial<Pick<CallRecordingDetail, 'suggestions'>>;

export function RecordingInspector({
  recordingId,
  initial,
  closing,
  animate,
  onClose,
  onExited,
  onConverted,
}: {
  recordingId: string;
  /** 표에 이미 있는 줄 — 상세를 불러오는 동안 먼저 보여 준다 */
  initial: CallRecordingListItem | null;
  closing: boolean;
  animate: boolean;
  onClose: (animate?: boolean) => void;
  onExited: () => void;
  /** 상담으로 전환하면 그 상담을 같은 패널에서 이어서 연다 */
  onConverted: (consultation: Consultation) => void;
}) {
  // 받아쓰기 · 분석 중이면 끝날 때까지 다시 읽는다 (본문의 CallAnalysisPanel과 같은 조회)
  const detailQuery = useCallRecordingDetail(recordingId, initial);
  const item: RecordingItem | null =
    detailQuery.data ?? (initial && initial.id === recordingId ? initial : null);

  return (
    <ConsultationPanelShell
      focusKey={recordingId}
      ariaLabel="녹음 상세 패널"
      closing={closing}
      animate={animate}
      onClose={onClose}
      onExited={onExited}
      // 녹음에는 따로 여는 전체 화면이 없다. 상담으로 전환하면 상담의 확장 버튼을 쓴다
      showExpand={false}
    >
      {item ? (
        <RecordingContent key={item.id} item={item} onConverted={onConverted} />
      ) : detailQuery.isError ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
          녹음을 찾을 수 없습니다. 이미 상담 기록이 되었거나 지워진 녹음입니다.
        </div>
      ) : (
        <InspectorSkeleton />
      )}
    </ConsultationPanelShell>
  );
}

function RecordingContent({
  item,
  onConverted,
}: {
  item: RecordingItem;
  onConverted: (consultation: Consultation) => void;
}) {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  const contact = item.contact;
  const channelKind = item.direction === 'visit' ? 'visit' : item.direction === 'outbound' ? 'outbound' : 'inbound';
  const ChannelIcon = consultationChannelIcons[channelKind];
  // 표의 "방식" 칸과 같은 말
  const channelLabel = channelKind === 'visit' ? '방문' : channelKind === 'outbound' ? '전화 발신' : '전화 수신';
  const title = contact?.name ?? (item.phoneNumber ? formatPhone(item.phoneNumber) : '미등록 번호');
  // 상세를 받으면 지금 남은 제안 수로, 아직이면 목록이 알려 준 수로 센다
  const pendingSuggestionCount = item.suggestions
    ? item.suggestions.filter((suggestion) => suggestion.status === 'pending').length
    : (item._count?.suggestions ?? 0);
  // 표의 "상태" 칸과 같은 판단: 왜 아직 상담이 아닌지
  const status = getPendingRecordingStatus({
    hasContact: Boolean(contact),
    sttStatus: item.sttStatus,
    analysisStatus: item.analysisStatus,
    pendingSuggestionCount,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {/* 머리: 누구와 · 어떻게 · 언제 + 연락처 */}
      <div className="shrink-0 border-b border-[#ecebe8] px-6 pb-4">
        <h2 className={cn('truncate text-[22px] font-semibold leading-8 text-foreground', !contact && 'tabular-nums')}>
          {title}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <ChannelIcon className="size-4 text-[#8e8b86]" />
            {channelLabel}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{formatDateTime(item.calledAt)}</span>
          {item.durationSec > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{formatDuration(item.durationSec)}</span>
            </>
          )}
          {item.user?.name && (
            <>
              <span aria-hidden>·</span>
              <span>{item.user.name}</span>
            </>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {contact ? (
            <EntityChip
              kind="contact"
              id={contact.id}
              label={contact.name}
              sublabel={formatPhone(contact.phone ?? item.phoneNumber)}
            />
          ) : (
            <>
              <button
                type="button"
                data-register-contact
                className={cn(barButtonClassName, 'border border-border')}
                onClick={() => setRegisterOpen(true)}
              >
                <UserPlus className="size-3.5" />
                연락처로 등록
              </button>
              <button
                type="button"
                data-link-contact
                className={cn(barButtonClassName, 'border border-border')}
                onClick={() => setLinkOpen(true)}
              >
                <Link2 className="size-3.5" />
                기존 연락처 연결
              </button>
            </>
          )}
        </div>

        {/* 아직 상담이 아닌 이유. 표에서는 상태 배지를 올려 두면 나오는 설명이다 */}
        <p
          data-recording-status={status.tone}
          className={cn(
            'mt-3 flex items-start gap-2 text-[13px] leading-5',
            status.tone === 'failed' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {status.tone === 'busy' ? (
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
          ) : status.tone === 'failed' ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
          ) : null}
          <span>
            <span className="font-medium text-foreground">{status.label}</span>
            {status.hint ? ` · ${getPanelStatusHint(status.hint)}` : ''}
          </span>
        </p>
      </div>

      {/* 본문: 상담의 "통화 분석" 탭과 같은 요약 · 업무 제안 · 받아쓰기 */}
      <div data-recording-analysis className="flex min-h-0 flex-1 flex-col">
        <CallAnalysisPanel recordingId={item.id} initial={item} />
      </div>

      <div className="flex shrink-0 items-center gap-1 border-t border-[#ecebe8] px-6 py-3">
        <button
          type="button"
          data-convert-recording
          className={barButtonClassName}
          disabled={!contact}
          title={contact ? undefined : '연락처를 등록하거나 연결하면 상담으로 전환할 수 있습니다'}
          onClick={() => setConvertOpen(true)}
        >
          <MessageSquarePlus className="size-3.5" />
          상담으로 전환
        </button>
        {!contact && (
          <span className="ml-1 text-[12px] text-muted-foreground">연락처를 먼저 이어 주세요</span>
        )}
      </div>

      <RegisterContactDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        recordingId={item.id}
        phoneNumber={item.phoneNumber}
      />
      <LinkContactDialog open={linkOpen} onOpenChange={setLinkOpen} recordingId={item.id} />
      {contact && (
        <ConvertConsultationDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          recordingId={item.id}
          contact={contact}
          analysis={item.analysis}
          messages={item.messages}
          onConverted={onConverted}
        />
      )}
    </div>
  );
}
