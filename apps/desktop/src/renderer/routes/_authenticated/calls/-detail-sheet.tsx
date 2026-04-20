import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PhoneIncoming,
  PhoneOutgoing,
  Sparkles,
  Clock,
  User as UserIcon,
  Loader2,
} from 'lucide-react';
import type {
  CallRecordingListItem,
  CallRecordingMessage,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  sttStatusLabel,
  sttStatusClass,
  formatDuration,
  formatFullTime,
} from './index';

export function CallDetailSheet({
  item,
  onClose: _onClose,
}: {
  item: CallRecordingListItem;
  onClose: () => void;
}) {
  const isInbound = item.direction === 'inbound';
  const contactName = item.contact?.name ?? '알 수 없음';

  // 상세 조회 — 리스트에 이미 messages 있지만 최신 analysis/consultations 확보용
  const detailQuery = useQuery({
    queryKey: ['call-recordings', 'detail', item.id],
    queryFn: () => api.callRecordings.findOne(item.id),
  });
  const detail = detailQuery.data ?? null;

  const messages = detail?.messages ?? item.messages;
  const analysis = detail?.analysis ?? item.analysis;
  const consultations = detail?.consultations ?? [];

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="space-y-1.5 border-b px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              'flex size-7 items-center justify-center rounded-full',
              isInbound
                ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
                : 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
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
              sttStatusClass[item.sttStatus],
            )}
          >
            {sttStatusLabel[item.sttStatus]}
          </span>
        </div>
        <SheetTitle className="text-lg">
          <span
            className={cn(!item.contact && 'italic text-muted-foreground')}
          >
            {contactName}
          </span>
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
            {item.phoneNumber || '번호 없음'}
          </span>
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{formatFullTime(item.calledAt)}</span>
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

      <div className="flex-1 overflow-y-auto">
        {/* 녹음 재생기 */}
        {item.fileUrl && (
          <div className="border-b px-6 py-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              녹음
            </h3>
            <audio controls src={item.fileUrl} className="w-full" />
          </div>
        )}

        {/* AI 요약 */}
        {(analysis?.summary ||
          analysis?.customerNeed ||
          analysis?.nextActions) && (
          <div className="border-b bg-violet-50/40 px-6 py-5 dark:bg-violet-950/10">
            <h3 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
              <Sparkles className="size-3.5" />
              AI 요약
            </h3>
            <dl className="space-y-3 text-sm">
              {analysis?.summary && (
                <div>
                  <dt className="text-[11px] text-muted-foreground">요약</dt>
                  <dd className="mt-0.5 leading-relaxed">
                    {analysis.summary}
                  </dd>
                </div>
              )}
              {analysis?.customerNeed && (
                <div>
                  <dt className="text-[11px] text-muted-foreground">
                    고객 니즈
                  </dt>
                  <dd className="mt-0.5 leading-relaxed">
                    {analysis.customerNeed}
                  </dd>
                </div>
              )}
              {analysis?.nextActions && (
                <div>
                  <dt className="text-[11px] text-muted-foreground">
                    다음 조치
                  </dt>
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
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            대화 기록 · {messages.length}건
          </h3>
          {item.sttStatus === 'processing' ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-4 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              음성 분석 중입니다. 완료되면 자동으로 업데이트됩니다.
            </div>
          ) : item.sttStatus === 'failed' ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-4 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              STT 처리에 실패했습니다. 잠시 후 다시 시도해주세요.
            </div>
          ) : messages.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-4 text-center text-[13px] text-muted-foreground">
              {item.sttStatus === 'none'
                ? '이 통화에는 녹음이 포함되지 않았습니다.'
                : '대화 내용이 없습니다.'}
            </div>
          ) : (
            <ol className="space-y-2.5">
              {messages.map((m, i) => (
                <MessageBubble key={i} message={m} />
              ))}
            </ol>
          )}
        </div>

        {/* 연결된 상담 기록 */}
        {consultations.length > 0 && (
          <div className="border-t px-6 py-5">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              연결된 상담 기록
            </h3>
            <ul className="space-y-2">
              {consultations.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border bg-muted/20 p-3 text-[13px]"
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{c.type}</span>
                    <span>{formatFullTime(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {c.content}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: CallRecordingMessage }) {
  // 화자 0 = 나, 1 = 고객 (기본 가정, speakerLabel 우선)
  const label =
    message.speakerLabel ?? (message.speaker === 0 ? '나' : '고객');
  const isMine = message.speaker === 0;
  return (
    <li
      className={cn(
        'flex flex-col gap-1',
        isMine ? 'items-start' : 'items-end',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed',
          isMine
            ? 'bg-muted'
            : 'bg-primary/10 text-foreground',
        )}
      >
        {message.text}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">
          {formatMs(message.startMs)}
        </span>
      </div>
    </li>
  );
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
