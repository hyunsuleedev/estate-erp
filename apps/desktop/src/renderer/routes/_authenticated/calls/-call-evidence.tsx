import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import type { CallRecordingMessage } from '@estate-erp/api-client';
import { formatMs } from './-call-utils';

/**
 * 분석 항목 ↔ 받아쓰기 원문 연결.
 * 분석의 근거 줄(받아쓰기 seq)을 누르면 대화 기록의 그 줄로 스크롤하고, 녹음이 있으면 그 시각부터 재생한다.
 * 받아쓰기는 이름·숫자를 틀릴 수 있어 사람이 원문을 바로 들어 보고 확인하게 하려는 것이다.
 */

/** 시각을 받지 못한 받아쓰기(0~0)는 재생 위치로 쓸 수 없다 */
function hasTiming(message: CallRecordingMessage) {
  return message.startMs > 0 || message.endMs > 0;
}

export function useTranscriptNavigator(messages: CallRecordingMessage[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lineElements = useRef(new Map<number, HTMLElement>());
  const focusTimer = useRef<number | undefined>(undefined);
  const [focusSeq, setFocusSeq] = useState<number | null>(null);
  const [playingSeq, setPlayingSeq] = useState<number | null>(null);
  const bySeq = useMemo(() => new Map(messages.map((message) => [message.seq, message])), [messages]);

  useEffect(() => () => window.clearTimeout(focusTimer.current), []);

  const registerLine = useCallback(
    (seq: number) => (element: HTMLElement | null) => {
      if (element) lineElements.current.set(seq, element);
      else lineElements.current.delete(seq);
    },
    [],
  );

  /** play: false면 줄로만 이동한다 (대화 검색 등) */
  const jumpTo = useCallback(
    (seq: number, options: { play?: boolean } = {}) => {
      const message = bySeq.get(seq);
      if (!message) return;
      lineElements.current.get(seq)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFocusSeq(seq);
      window.clearTimeout(focusTimer.current);
      focusTimer.current = window.setTimeout(() => setFocusSeq(null), 2500);
      const audio = audioRef.current;
      if (options.play !== false && audio && hasTiming(message)) {
        audio.currentTime = message.startMs / 1000;
        void audio.play().catch(() => undefined);
      }
    },
    [bySeq],
  );

  /** 재생 중인 줄 표시 */
  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const ms = audio.currentTime * 1000;
    const current = messages.find(
      (message) => hasTiming(message) && ms >= message.startMs && ms < message.endMs,
    );
    setPlayingSeq(current?.seq ?? null);
  }, [messages]);

  const chipLabel = useCallback(
    (seq: number) => {
      const message = bySeq.get(seq);
      if (!message) return null;
      return hasTiming(message) ? formatMs(message.startMs) : '원문';
    },
    [bySeq],
  );

  return { audioRef, registerLine, jumpTo, onTimeUpdate, chipLabel, focusSeq, playingSeq };
}

export type TranscriptNavigator = ReturnType<typeof useTranscriptNavigator>;

/** 근거 줄 칩 — 누르면 원문으로 이동 */
export function EvidenceChips({ lines, nav }: { lines: number[]; nav: TranscriptNavigator }) {
  const chips = lines
    .map((seq) => ({ seq, label: nav.chipLabel(seq) }))
    .filter((chip): chip is { seq: number; label: string } => chip.label !== null);
  if (chips.length === 0) return null;
  return (
    // 근거가 여러 줄이어도 한 줄로 둔다 (세로로 쌓이면 행이 길어진다)
    <span className="inline-flex shrink-0 justify-end gap-1">
      {chips.map((chip) => (
        <button
          key={chip.seq}
          type="button"
          data-evidence-seq={chip.seq}
          onClick={() => nav.jumpTo(chip.seq)}
          title="원문 보기"
          aria-label={`원문 ${chip.label}로 이동`}
          className="inline-flex h-5 items-center gap-0.5 rounded border border-violet/25 bg-background px-1.5 font-mono text-[10px] text-violet transition-colors hover:bg-violet-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/40"
        >
          <Play className="size-2.5 fill-current" aria-hidden />
          {chip.label}
        </button>
      ))}
    </span>
  );
}
