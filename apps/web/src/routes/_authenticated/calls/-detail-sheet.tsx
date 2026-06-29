import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeftRight,
  ChevronRight,
  Clock,
  Link2,
  Loader2,
  MessageSquarePlus,
  PhoneIncoming,
  PhoneOutgoing,
  Sparkles,
  User as UserIcon,
  UserPlus,
} from 'lucide-react';
import type { CallRecordingListItem } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime, formatPhone } from '@/lib/format';
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EntityChip } from '@/components/domain';
import {
  formatDuration,
  formatMs,
  speakerLabelOf,
  sttStatusClass,
  sttStatusLabel,
} from './-call-utils';
import { LinkContactDialog, RegisterContactDialog } from './-contact-dialogs';
import { ConvertConsultationDialog } from './-convert-dialog';

const consultationTypeLabel: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

export function CallDetailSheet({ item }: { item: CallRecordingListItem }) {
  const queryClient = useQueryClient();
  const isInbound = item.direction === 'inbound';

  const [registerOpen, setRegisterOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  // 상세 조회 — STT/분석 대기·처리 중이면 5초 폴링, 완료/실패 시 자동 중단
  const detailQuery = useQuery({
    queryKey: ['call-recordings', 'detail', item.id],
    queryFn: () => api.callRecordings.findOne(item.id),
    refetchInterval: (query) => {
      const d = query.state.data;
      const stt = d?.sttStatus ?? item.sttStatus;
      const analysisStatus = d?.analysisStatus ?? item.analysisStatus;
      const inProgress =
        stt === 'pending' || stt === 'processing' || analysisStatus === 'processing';
      return inProgress ? 5000 : false;
    },
  });
  const detail = detailQuery.data ?? null;

  const sttStatus = detail?.sttStatus ?? item.sttStatus;
  const messages = detail?.messages ?? item.messages;
  const analysis = detail?.analysis ?? item.analysis;
  const consultations = detail?.consultations ?? [];
  const contact = detail?.contact ?? item.contact;
  const fileUrl = detail?.fileUrl ?? item.fileUrl;
  const contactName = contact?.name ?? '미등록 번호';

  // 화자 전환 (나 ↔ 고객)
  const swapMutation = useMutation({
    mutationFn: () => {
      const speakers = [...new Set(messages.map((m) => m.speaker))];
      return api.callRecordings.update(item.id, {
        speakerLabels: speakers.map((speaker) => {
          const current = speakerLabelOf(
            speaker,
            messages.find((m) => m.speaker === speaker)?.speakerLabel ?? null,
          );
          return { speaker, label: current === '나' ? '고객' : '나' };
        }),
      });
    },
    onSuccess: () => {
      toast.success('화자 라벨을 변경했습니다');
      void queryClient.invalidateQueries({ queryKey: ['call-recordings'] });
    },
    onError: () => toast.error('화자 라벨 변경에 실패했습니다'),
  });

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="space-y-1.5 border-b px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              'flex size-7 items-center justify-center rounded-full',
              isInbound ? 'bg-info-soft text-info' : 'bg-violet-soft text-violet',
            )}
          >
            {isInbound ? (
              <PhoneIncoming className="size-3.5" />
            ) : (
              <PhoneOutgoing className="size-3.5" />
            )}
          </div>
          <Badge variant="outline" className="text-[10px]">
            {isInbound ? '수신' : '발신'}
          </Badge>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px]',
              sttStatusClass[sttStatus],
            )}
          >
            {sttStatusLabel[sttStatus]}
          </span>
        </div>
        <SheetTitle className="text-lg">
          <span className={cn(!contact && 'italic text-muted-foreground')}>
            {contactName}
          </span>
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
            {item.phoneNumber ? formatPhone(item.phoneNumber) : '번호 없음'}
          </span>
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{formatDateTime(item.calledAt)}</span>
          <span className="inline-flex items-center gap-1 font-mono">
            <Clock className="size-3" />
            {formatDuration(item.durationSec)}
          </span>
          {item.user && (
            <span className="inline-flex items-center gap-1">
              <UserIcon className="size-3" />
              {item.user.name}
            </span>
          )}
        </SheetDescription>
      </SheetHeader>

      {/* 액션 바 — 연락처 연결 / 상담 전환 */}
      <div className="border-b bg-muted/30 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {contact ? (
            <EntityChip
              kind="contact"
              id={contact.id}
              label={contact.name}
              sublabel={formatPhone(contact.phone ?? item.phoneNumber)}
            />
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setRegisterOpen(true)}>
                <UserPlus className="size-3.5" />
                연락처로 등록
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                <Link2 className="size-3.5" />
                기존 연락처 연결
              </Button>
            </>
          )}
          <Button
            size="sm"
            className="ml-auto"
            disabled={!contact}
            onClick={() => setConvertOpen(true)}
          >
            <MessageSquarePlus className="size-3.5" />
            상담으로 전환
          </Button>
        </div>
        {!contact && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            연락처를 등록하거나 연결하면 상담으로 전환할 수 있습니다.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 녹음 재생기 — 서버가 fileUrl을 저장하는 경우에만 표시 */}
        {fileUrl && (
          <div className="border-b px-6 py-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              녹음
            </h3>
            <audio controls src={fileUrl} className="w-full" />
          </div>
        )}

        {/* AI 요약 */}
        {(analysis?.summary || analysis?.customerNeed || analysis?.nextActions) && (
          <div className="border-b bg-violet-soft/40 px-6 py-5">
            <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet">
              <Sparkles className="size-3.5" />
              AI 요약
            </h3>
            <dl className="space-y-3 text-sm">
              {analysis?.summary && (
                <div>
                  <dt className="text-[11px] text-muted-foreground">요약</dt>
                  <dd className="mt-0.5 leading-relaxed">{analysis.summary}</dd>
                </div>
              )}
              {analysis?.customerNeed && (
                <div>
                  <dt className="text-[11px] text-muted-foreground">고객 니즈</dt>
                  <dd className="mt-0.5 leading-relaxed">{analysis.customerNeed}</dd>
                </div>
              )}
              {analysis?.nextActions && (
                <div>
                  <dt className="text-[11px] text-muted-foreground">다음 조치</dt>
                  <dd className="mt-0.5 leading-relaxed">
                    {Array.isArray(analysis.nextActions) ? (
                      <ul className="list-disc space-y-0.5 pl-4">
                        {analysis.nextActions.map((action, i) => (
                          <li key={i}>{String(action)}</li>
                        ))}
                      </ul>
                    ) : (
                      String(analysis.nextActions)
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* STT 타임라인 */}
        <div className="px-6 py-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              대화 기록 · {messages.length}건
            </h3>
            {sttStatus === 'completed' && messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                disabled={swapMutation.isPending}
                onClick={() => swapMutation.mutate()}
              >
                {swapMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowLeftRight className="size-3.5" />
                )}
                화자 전환
              </Button>
            )}
          </div>
          {sttStatus === 'processing' ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-4 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              음성 분석 중입니다. 완료되면 자동으로 업데이트됩니다.
            </div>
          ) : sttStatus === 'failed' ? (
            <div className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-4 text-[13px] text-destructive">
              STT 처리에 실패했습니다.
            </div>
          ) : messages.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">
              {sttStatus === 'none'
                ? '이 통화에는 녹음이 포함되지 않았습니다.'
                : '대화 내용이 없습니다.'}
            </div>
          ) : (
            <ol className="space-y-2.5">
              {messages.map((m, i) => {
                const label = speakerLabelOf(m.speaker, m.speakerLabel);
                const isMine = label === '나';
                return (
                  <li
                    key={i}
                    className={cn(
                      'flex flex-col gap-1',
                      isMine ? 'items-start' : 'items-end',
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed',
                        isMine ? 'bg-muted' : 'bg-primary/10 text-foreground',
                      )}
                    >
                      {m.text}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>{label}</span>
                      <span className="font-mono">{formatMs(m.startMs)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* 연결된 상담 기록 */}
        {consultations.length > 0 && (
          <div className="border-t px-6 py-5">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              연결된 상담 기록 · {consultations.length}건
            </h3>
            <ul className="space-y-2">
              {consultations.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/consultations"
                    search={{ consultationId: c.id }}
                    className="group block rounded-md border bg-muted/20 p-3 text-[13px] transition-colors hover:bg-muted/50"
                  >
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{consultationTypeLabel[c.type] ?? c.type}</span>
                      <span className="inline-flex items-center gap-0.5">
                        {formatDateTime(c.createdAt)}
                        <ChevronRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                    </div>
                    <p className="line-clamp-3 whitespace-pre-wrap leading-relaxed">
                      {c.content}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 다이얼로그 */}
      <RegisterContactDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        recordingId={item.id}
        phoneNumber={item.phoneNumber}
      />
      <LinkContactDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        recordingId={item.id}
      />
      {contact && (
        <ConvertConsultationDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          recordingId={item.id}
          contact={contact}
          analysis={analysis}
          messages={messages}
        />
      )}
    </div>
  );
}
