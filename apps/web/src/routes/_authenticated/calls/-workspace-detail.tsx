import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeftRight,
  ArrowRight,
  BookUser,
  Building2,
  ChevronRight,
  GitBranch,
  Link2,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import type { CallRecordingListItem } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
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

/** 섹션 캡션 — 디자인 시안의 소제목 스타일 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10.5px] font-bold tracking-[0.04em] text-muted-foreground/70">
      {children}
    </div>
  );
}

/**
 * 통화 워크스페이스 — 중앙(통화 상세·상담 전환) + 우측(컨텍스트) 패널.
 * 기존 CallDetailSheet의 데이터 연동(폴링·화자 전환·다이얼로그)을 그대로 유지하고
 * 시안의 3패널 레이아웃에 맞춰 인라인으로 재배치했다.
 */
export function CallWorkspaceDetail({ item }: { item: CallRecordingListItem }) {
  const queryClient = useQueryClient();

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
    <>
      {/* 중앙: 통화 상세 + 상담 전환 */}
      <div className="flex min-w-0 flex-1 flex-col border-r">
        <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-4">
          {/* 연락처 카드 — 미등록이면 등록 유도, 등록이면 요약 카드 */}
          {contact ? (
            <div className="flex items-center gap-2.5 rounded-[10px] border px-3.5 py-3">
              <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-secondary text-[13.5px] font-bold text-secondary-foreground">
                {contact.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-bold">
                    {contact.name}
                  </span>
                  <span className="inline-flex h-[19px] shrink-0 items-center rounded-md bg-secondary px-2 text-[10.5px] font-semibold text-secondary-foreground">
                    연락처
                  </span>
                </div>
                <div className="mt-px font-mono text-[11px] text-muted-foreground">
                  {formatPhone(contact.phone ?? item.phoneNumber)}
                </div>
              </div>
              <div className="flex-1" />
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-[26px] shrink-0 rounded-[7px] px-2.5 text-[11.5px] font-medium"
              >
                <Link to="/contacts/$id" params={{ id: contact.id }}>
                  연락처 상세
                  <ArrowRight className="size-3" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="rounded-[10px] border border-dashed border-warning/50 bg-warning-soft/30 px-3.5 py-3">
              <div className="mb-2.5 flex items-center gap-1.5">
                <UserPlus className="size-3.5 text-warning" />
                <span className="text-[12.5px] font-semibold text-warning">
                  미등록 번호 — 연락처로 등록하면 상담으로 전환할 수 있어요
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="h-8 rounded-lg"
                  onClick={() => setRegisterOpen(true)}
                >
                  <UserPlus className="size-3.5" />
                  연락처 등록
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg"
                  onClick={() => setLinkOpen(true)}
                >
                  <Link2 className="size-3.5" />
                  기존 연락처 연결
                </Button>
              </div>
            </div>
          )}

          {/* 상담 전환 액션 */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <Button
              className="h-[34px] rounded-[9px] px-4 text-[12.5px] font-semibold"
              disabled={!contact}
              onClick={() => setConvertOpen(true)}
            >
              <MessageSquarePlus className="size-3.5" />
              상담으로 전환
            </Button>
            {!contact && (
              <span className="text-[11px] text-muted-foreground">
                연락처를 등록하거나 연결하면 상담으로 전환할 수 있습니다.
              </span>
            )}
          </div>

          {/* 녹음 재생기 — 서버가 fileUrl을 저장하는 경우에만 표시 */}
          {fileUrl && (
            <div className="mt-5">
              <SectionLabel>녹음</SectionLabel>
              <audio controls src={fileUrl} className="w-full" />
            </div>
          )}

          {/* AI 요약 */}
          {(analysis?.summary || analysis?.customerNeed || analysis?.nextActions) && (
            <div className="mt-5 rounded-[10px] bg-violet-soft/40 px-3.5 py-3">
              <div className="mb-2.5 flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.04em] text-violet">
                <Sparkles className="size-3.5" />
                AI 요약
              </div>
              <dl className="space-y-2.5 text-[13px]">
                {analysis?.summary && (
                  <div>
                    <dt className="text-[11px] text-muted-foreground">요약</dt>
                    <dd className="mt-0.5 leading-relaxed">{analysis.summary}</dd>
                  </div>
                )}
                {analysis?.customerNeed && (
                  <div>
                    <dt className="text-[11px] text-muted-foreground">고객 니즈</dt>
                    <dd className="mt-0.5 leading-relaxed">
                      {analysis.customerNeed}
                    </dd>
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

          {/* STT 대화 기록 */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <SectionLabel>대화 기록 · {messages.length}건</SectionLabel>
              {sttStatus === 'completed' && messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted-foreground"
                  disabled={swapMutation.isPending}
                  onClick={() => swapMutation.mutate()}
                >
                  {swapMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <ArrowLeftRight className="size-3" />
                  )}
                  화자 전환
                </Button>
              )}
            </div>
            {sttStatus === 'processing' ? (
              <div className="flex items-center gap-2 rounded-[10px] border border-dashed bg-muted/50 px-3 py-4 text-[12.5px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                음성 분석 중입니다. 완료되면 자동으로 업데이트됩니다.
              </div>
            ) : sttStatus === 'failed' ? (
              <div className="rounded-[10px] border border-destructive/30 bg-destructive-soft px-3 py-4 text-[12.5px] text-destructive">
                STT 처리에 실패했습니다.
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-[10px] border border-dashed px-3 py-4 text-center text-[12.5px] text-muted-foreground">
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
        </div>
      </div>

      {/* 우측: 컨텍스트 패널 */}
      <div className="flex w-[294px] shrink-0 flex-col gap-3.5 overflow-y-auto px-3.5 py-3.5">
        {/* 통화 정보 */}
        <div>
          <SectionLabel>통화 정보</SectionLabel>
          <div className="rounded-[10px] border px-3 py-2.5 text-[11.5px] leading-relaxed text-foreground">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">통화 시각</span>
              <span className="tabular-nums">{formatDateTime(item.calledAt)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-muted-foreground">담당</span>
              <span>{item.user.name}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-muted-foreground">STT 상태</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  sttStatusClass[sttStatus],
                )}
              >
                {sttStatusLabel[sttStatus]}
              </span>
            </div>
          </div>
        </div>

        {/* 최근 상담 — 이 통화에 연결된 상담 기록 */}
        <div>
          <SectionLabel>연결된 상담 · {consultations.length}건</SectionLabel>
          {consultations.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {consultations.map((c) => (
                <Link
                  key={c.id}
                  to="/consultations"
                  search={{ consultationId: c.id }}
                  className="group flex items-start gap-2 rounded-[9px] border px-2.5 py-2 transition-colors hover:bg-muted/60"
                >
                  <span className="mt-px w-[52px] shrink-0 text-[10.5px] tabular-nums text-muted-foreground">
                    {formatDate(c.createdAt)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] text-muted-foreground">
                      {consultationTypeLabel[c.type] ?? c.type}
                    </span>
                    <span className="line-clamp-3 whitespace-pre-wrap text-[11.5px] leading-normal text-foreground">
                      {c.content}
                    </span>
                  </span>
                  <ChevronRight className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-muted-foreground/70">
              상담 기록 없음 — 이번 통화가 첫 기록이에요
            </div>
          )}
        </div>

        {/* 빠른 액션 */}
        <div>
          <SectionLabel>빠른 액션</SectionLabel>
          <div className="flex flex-col gap-1.5">
            <Button
              asChild
              variant="outline"
              className="h-8 justify-start rounded-lg px-2.5 text-[12px] font-medium"
            >
              <Link to="/matches">
                <GitBranch className="size-3.5 text-muted-foreground" />
                매칭 찾기
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-8 justify-start rounded-lg px-2.5 text-[12px] font-medium"
            >
              <Link to="/properties">
                <Building2 className="size-3.5 text-muted-foreground" />
                매물 검색
              </Link>
            </Button>
            {contact && (
              <Button
                asChild
                variant="outline"
                className="h-8 justify-start rounded-lg px-2.5 text-[12px] font-medium"
              >
                <Link to="/contacts/$id" params={{ id: contact.id }}>
                  <BookUser className="size-3.5 text-muted-foreground" />
                  연락처 상세
                </Link>
              </Button>
            )}
          </div>
        </div>
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
    </>
  );
}
