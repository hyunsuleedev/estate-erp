import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import type {
  CallAnalysisFact,
  CallAnalysisPoint,
  CallRecordingListItem,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  computeTalkShares,
  findQuotedLine,
  findTranscriptMatches,
  formatMs,
  speakerDisplayNames,
  speakerLabelOf,
  type TalkShare,
} from './-call-utils';
import { CallSuggestionList } from './-call-suggestions';
import { EvidenceChips, useTranscriptNavigator } from './-call-evidence';

/**
 * 통화 분석 본문: 녹음 · AI 요약(확인할 점·핵심 정보·숫자) · AI 제안 · 대화 기록.
 * 통화 상세와 상담분석의 상담 상세(통화 분석 탭)가 함께 쓴다.
 */

const TALK_SHARE_COLORS = ['bg-violet', 'bg-info', 'bg-warning', 'bg-success'];

const consultationTypeLabel: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

/** 통화 상세 조회 — 받아쓰기·분석 대기·처리 중이면 5초마다 다시 불러오고, 끝나면 멈춘다 */
export function useCallRecordingDetail(
  recordingId: string,
  initial?: Pick<CallRecordingListItem, 'sttStatus' | 'analysisStatus'> | null,
) {
  return useQuery({
    queryKey: ['call-recordings', 'detail', recordingId],
    queryFn: () => api.callRecordings.findOne(recordingId),
    refetchInterval: (query) => {
      const d = query.state.data;
      const stt = d?.sttStatus ?? initial?.sttStatus;
      const analysisStatus = d?.analysisStatus ?? initial?.analysisStatus;
      const inProgress =
        stt === 'pending' || stt === 'processing' || analysisStatus === 'processing';
      return inProgress ? 5000 : false;
    },
  });
}

export function CallAnalysisPanel({
  recordingId,
  initial = null,
  showConsultations = true,
}: {
  recordingId: string;
  /** 목록에서 이미 받은 값 — 상세를 불러오는 동안 먼저 보여 준다 */
  initial?: CallRecordingListItem | null;
  /** 이 통화로 남긴 상담 기록 목록 (상담 상세 안에서는 숨긴다) */
  showConsultations?: boolean;
}) {
  const queryClient = useQueryClient();
  const detailQuery = useCallRecordingDetail(recordingId, initial);
  const detail = detailQuery.data ?? null;

  const sttStatus = detail?.sttStatus ?? initial?.sttStatus ?? 'none';
  const messages = detail?.messages ?? initial?.messages ?? [];
  const analysis = detail?.analysis ?? initial?.analysis ?? null;
  const consultations = detail?.consultations ?? [];
  const contact = detail?.contact ?? initial?.contact ?? null;
  const fileUrl = detail?.fileUrl ?? initial?.fileUrl ?? null;
  const analysisStatus = detail?.analysisStatus ?? initial?.analysisStatus ?? 'none';
  const sttError = detail?.sttError ?? initial?.sttError ?? null;
  const suggestions = detail?.suggestions ?? [];
  const suggestionLabels = detail?.suggestionLabels ?? {};
  const autoConsultationId = detail?.autoConsultationId ?? null;
  const canAnalyze =
    sttStatus === 'completed' && messages.length > 0 && analysisStatus !== 'processing';
  const keyPoints = Array.isArray(analysis?.keyPoints) ? analysis.keyPoints : [];
  // 근거 줄이 붙은 항목 (예전 분석은 글만 있어 근거 없이 보여 준다)
  const points: CallAnalysisPoint[] = Array.isArray(analysis?.points)
    ? analysis.points
    : keyPoints.map((point) => ({ text: String(point), lines: [] }));
  const facts: CallAnalysisFact[] = Array.isArray(analysis?.facts) ? analysis.facts : [];
  const checks: CallAnalysisPoint[] = Array.isArray(analysis?.checks) ? analysis.checks : [];
  // 예전 분석(제안 기능 이전)은 "다음 조치" 글로만 있다
  const legacyNextActions =
    suggestions.length === 0 && keyPoints.length === 0 ? analysis?.nextActions : undefined;
  const nav = useTranscriptNavigator(messages);
  const speakerNames = useMemo(() => speakerDisplayNames(messages), [messages]);
  const talkShares = useMemo(() => computeTalkShares(messages), [messages]);

  // 대화 검색: Enter·화살표로 맞는 줄을 차례로 보여 준다 (재생은 하지 않는다)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCursor, setSearchCursor] = useState(-1);
  const searchMatches = useMemo(() => findTranscriptMatches(messages, searchQuery), [messages, searchQuery]);
  useEffect(() => setSearchCursor(-1), [searchQuery]);
  const stepSearch = (direction: 1 | -1) => {
    if (searchMatches.length === 0) return;
    const next =
      searchCursor < 0
        ? direction === 1
          ? 0
          : searchMatches.length - 1
        : (searchCursor + direction + searchMatches.length) % searchMatches.length;
    setSearchCursor(next);
    nav.jumpTo(searchMatches[next], { play: false });
  };

  // 분석이 끝나면 서버가 상담 기록을 만들거나 고친다 — 상담 목록·상담 상세·통화 목록도 새로 불러온다
  const previousAnalysisStatus = useRef(analysisStatus);
  useEffect(() => {
    if (previousAnalysisStatus.current === 'processing' && analysisStatus !== 'processing') {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['consultations'] }),
        queryClient.invalidateQueries({ queryKey: ['consultation'] }),
        queryClient.invalidateQueries({ queryKey: ['call-recordings', 'list'] }),
      ]);
    }
    previousAnalysisStatus.current = analysisStatus;
  }, [analysisStatus, queryClient]);

  // 받아쓰기는 두고 분석만 다시 (연락처를 연결한 뒤 등)
  const reanalyzeMutation = useMutation({
    mutationFn: () => api.callRecordings.reanalyze(recordingId),
    onSuccess: () => {
      toast.success('다시 분석합니다. 끝나면 자동으로 바뀝니다.');
      void queryClient.invalidateQueries({ queryKey: ['call-recordings'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error && error.message ? error.message : '다시 분석하지 못했습니다'),
  });

  // 화자 전환 (나 ↔ 고객)
  const swapMutation = useMutation({
    mutationFn: () => {
      const speakers = [...new Set(messages.map((m) => m.speaker))];
      return api.callRecordings.update(recordingId, {
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

  if (!detail && !initial) {
    return detailQuery.isError ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground">
        통화 분석을 불러오지 못했습니다.
        <Button variant="outline" size="sm" onClick={() => void detailQuery.refetch()}>
          다시 시도
        </Button>
      </div>
    ) : (
      <div className="space-y-3 p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const hasAnalysisBlock =
    Boolean(analysis?.summary) || analysisStatus === 'processing' || analysisStatus === 'failed' || canAnalyze;

  return (
    // 넓으면(시트 768px 이상) 왼쪽 브리프 · 오른쪽 녹음과 대화 기록을 나란히, 좁으면 위아래로 쌓는다.
    // 두 칸은 따로 스크롤된다 — 왼쪽 근거 칩을 누르면 오른쪽 대화 줄로 이동하고 그 시각부터 재생한다.
    <div
      data-call-analysis-panel
      className="@container min-h-0 flex-1 overflow-y-auto @3xl:overflow-hidden"
    >
      <div className="@3xl:grid @3xl:h-full @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ── 왼쪽: 브리프 ─────────────────────────────── */}
        <div data-call-brief className="@3xl:min-h-0 @3xl:overflow-y-auto @3xl:border-r">
          {hasAnalysisBlock && (
            <div className="border-b bg-violet-soft/40 px-6 py-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet">
                  <Sparkles className="size-3.5" />
                  AI 요약
                </h3>
                {canAnalyze && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    disabled={reanalyzeMutation.isPending}
                    onClick={() => reanalyzeMutation.mutate()}
                  >
                    {reanalyzeMutation.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    {analysis?.summary ? '다시 분석' : '분석하기'}
                  </Button>
                )}
              </div>
              {analysisStatus === 'processing' && (
                <p className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  통화 내용을 분석하고 있습니다. 끝나면 상담 기록과 제안이 생깁니다.
                </p>
              )}
              {analysisStatus === 'failed' && (
                <p className="mb-3 text-[12px] text-destructive">
                  분석하지 못했습니다{analysis?.error ? `: ${analysis.error}` : ''}
                </p>
              )}
              {!analysis?.summary && analysisStatus !== 'processing' && analysisStatus !== 'failed' && (
                <p className="text-[12px] text-muted-foreground">아직 분석하지 않은 통화입니다.</p>
              )}
              {analysis?.summary && (
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">요약</dt>
                    <dd className="mt-0.5 leading-relaxed">{analysis.summary}</dd>
                  </div>
                  {analysis.customerNeed && (
                    <div>
                      <dt className="text-[11px] text-muted-foreground">고객 니즈</dt>
                      <dd className="mt-0.5 leading-relaxed">{analysis.customerNeed}</dd>
                    </div>
                  )}
                  {checks.length > 0 && (
                    <div
                      data-call-checks
                      className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2"
                    >
                      <dt className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-warning-strong">
                        <AlertTriangle className="size-3.5" aria-hidden />
                        원문을 듣고 확인하세요
                      </dt>
                      <dd>
                        <ul className="space-y-1">
                          {checks.map((check, i) => (
                            <li key={i} className="flex items-start justify-between gap-2 text-[13px] leading-relaxed">
                              <span className="min-w-0">{check.text}</span>
                              <EvidenceChips lines={check.lines} nav={nav} />
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}
                  {legacyNextActions && (
                    <div>
                      <dt className="text-[11px] text-muted-foreground">다음 조치</dt>
                      <dd className="mt-0.5 leading-relaxed">
                        {Array.isArray(legacyNextActions) ? (
                          <ul className="list-disc space-y-0.5 pl-4">
                            {legacyNextActions.map((action, i) => (
                              <li key={i}>{String(action)}</li>
                            ))}
                          </ul>
                        ) : (
                          String(legacyNextActions)
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          )}

          {/* 다음 행동 — 확인 후 반영 (실행 항목을 정리 내용보다 먼저 둔다) */}
          <CallSuggestionList
            suggestions={suggestions}
            labels={suggestionLabels}
            hasContact={Boolean(contact)}
            renderEvidenceLink={(evidence) => {
              const seq = findQuotedLine(messages, evidence);
              return seq === null ? null : <EvidenceChips lines={[seq]} nav={nav} />;
            }}
          />

          {/* 통화 내용 정리: 핵심 정보 · 통화에서 말한 숫자 */}
          {analysis?.summary && (points.length > 0 || facts.length > 0) && (
            <dl data-call-notes className="space-y-4 border-b px-6 py-5 text-sm">
              {points.length > 0 && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    핵심 정보
                  </dt>
                  <dd className="mt-1.5 leading-relaxed">
                    <ul className="space-y-1">
                      {points.map((point, i) => (
                        <li key={i} className="flex items-start justify-between gap-2">
                          <span className="min-w-0 before:mr-1.5 before:text-muted-foreground before:content-['·']">
                            {point.text}
                          </span>
                          <EvidenceChips lines={point.lines} nav={nav} />
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}
              {facts.length > 0 && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    통화에서 말한 숫자
                  </dt>
                  <dd className="mt-1.5 overflow-hidden rounded-md border bg-background">
                    <table data-call-facts className="w-full text-[13px]">
                      <tbody>
                        {facts.map((fact, i) => (
                          <tr key={i} className="border-b align-top last:border-0">
                            <th
                              scope="row"
                              className="w-[34%] px-3 py-1.5 text-left text-[12px] font-normal text-muted-foreground"
                            >
                              {fact.label}
                            </th>
                            <td className="px-2 py-1.5">
                              <span className="font-medium tabular-nums">{fact.value}</span>
                              {fact.previous && (
                                <span className="block text-[11px] text-muted-foreground">
                                  정정 전 <s>{fact.previous}</s>
                                </span>
                              )}
                            </td>
                            <td className="w-px whitespace-nowrap px-2 py-1.5 text-right">
                              <EvidenceChips lines={fact.lines} nav={nav} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </dd>
                </div>
              )}
            </dl>
          )}

          {/* 연결된 상담 기록 */}
          {showConsultations && consultations.length > 0 && (
            <div className="px-6 py-5">
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
                        <span>
                          {consultationTypeLabel[c.type] ?? c.type}
                          {c.id === autoConsultationId && ' · AI 통화 요약'}
                        </span>
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

        {/* ── 오른쪽: 녹음 · 대화 기록 ──────────────────── */}
        <div data-call-transcript-pane className="border-t @3xl:min-h-0 @3xl:overflow-y-auto @3xl:border-t-0">
          {/* 재생기·검색은 위에 붙여 둔다 — 근거로 이동해도 보인다 */}
          <div className="sticky top-0 z-10 space-y-2.5 border-b bg-background px-6 py-3">
            {fileUrl && (
              <audio
                ref={nav.audioRef}
                controls
                src={fileUrl}
                onTimeUpdate={nav.onTimeUpdate}
                className="h-9 w-full"
              />
            )}
            <div className="flex items-center justify-between gap-2">
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
            {talkShares.length > 1 && <TalkShareBar shares={talkShares} />}
            {messages.length > 0 && (
              <TranscriptSearch
                query={searchQuery}
                onQueryChange={setSearchQuery}
                matchCount={searchMatches.length}
                current={searchCursor}
                onStep={stepSearch}
              />
            )}
          </div>

          <div className="px-6 py-5">
            {sttStatus === 'processing' ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-4 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                음성 분석 중입니다. 완료되면 자동으로 업데이트됩니다.
              </div>
            ) : sttStatus === 'failed' ? (
              <div className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-4 text-[13px] text-destructive">
                받아쓰기에 실패했습니다{sttError ? `: ${sttError}` : '.'}
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
                  const label = speakerNames.get(m.speaker) ?? speakerLabelOf(m.speaker, m.speakerLabel);
                  const isMine = speakerLabelOf(m.speaker, m.speakerLabel) === '나';
                  // 시각을 받지 못한 받아쓰기(0~0)는 시각을 숨긴다
                  const timed = m.startMs > 0 || m.endMs > 0;
                  const focused = nav.focusSeq === m.seq;
                  const playing = nav.playingSeq === m.seq;
                  return (
                    <li
                      key={i}
                      ref={nav.registerLine(m.seq)}
                      data-transcript-seq={m.seq}
                      className={cn(
                        'flex flex-col gap-1',
                        isMine ? 'items-start' : 'items-end',
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed transition-shadow',
                          isMine ? 'bg-muted' : 'bg-primary/10 text-foreground',
                          playing && 'ring-1 ring-violet/40',
                          focused && 'ring-2 ring-violet',
                        )}
                      >
                        <HighlightedText text={m.text} query={searchQuery} />
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>{label}</span>
                        {timed &&
                          (fileUrl ? (
                            <button
                              type="button"
                              onClick={() => nav.jumpTo(m.seq)}
                              title="이 부분부터 듣기"
                              className="font-mono underline-offset-2 hover:text-foreground hover:underline"
                            >
                              {formatMs(m.startMs)}
                            </button>
                          ) : (
                            <span className="font-mono">{formatMs(m.startMs)}</span>
                          ))}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 화자별 말한 비율 — 누가 대화를 이끌었는지 한눈에 */
function TalkShareBar({ shares }: { shares: TalkShare[] }) {
  return (
    <div data-call-talk-share>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        {shares.map((share, index) => (
          <span
            key={share.speaker}
            className={TALK_SHARE_COLORS[index % TALK_SHARE_COLORS.length]}
            style={{ width: `${share.percent}%` }}
          />
        ))}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        {shares.map((share, index) => (
          <span key={share.speaker} className="inline-flex items-center gap-1">
            <span className={cn('size-1.5 rounded-full', TALK_SHARE_COLORS[index % TALK_SHARE_COLORS.length])} />
            {share.label} {share.percent}%
          </span>
        ))}
      </p>
    </div>
  );
}

/** 대화 검색 — 맞는 줄을 강조하고 Enter·화살표로 다음 줄로 이동한다 */
function TranscriptSearch({
  query,
  onQueryChange,
  matchCount,
  current,
  onStep,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  matchCount: number;
  current: number;
  onStep: (direction: 1 | -1) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onStep(event.shiftKey ? -1 : 1);
            }
          }}
          placeholder="대화에서 찾기 (예: 억, 토요일)"
          aria-label="대화에서 찾기"
          className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>
      {query.trim() && (
        <>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {matchCount === 0 ? '없음' : current < 0 ? `${matchCount}건` : `${current + 1}/${matchCount}`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={matchCount === 0}
            onClick={() => onStep(-1)}
            aria-label="이전 찾기"
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={matchCount === 0}
            onClick={() => onStep(1)}
            aria-label="다음 찾기"
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, 'gi'));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark key={index} className="rounded-sm bg-warning-soft px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
