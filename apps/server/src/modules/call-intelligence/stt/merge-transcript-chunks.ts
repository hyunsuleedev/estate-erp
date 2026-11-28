import { joinWords } from './gemini-transcribe';
import type { TranscriptUtterance } from './stt.types';

export interface TranscriptChunk {
  startMs: number;
  endMs: number;
  /** 단어 시각은 이 조각의 시작을 기준으로 한다. */
  words: TranscriptUtterance[];
}

function midpoint(word: TranscriptUtterance) {
  return (word.startMs + word.endMs) / 2;
}

function normalizedText(word: TranscriptUtterance) {
  return word.text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

interface Match {
  left: number;
  right: number;
}

/** 두 응답에서 같은 시각에 한 번씩만 나타나는 단어를 순서대로 짝짓는다. */
function matchOverlap(left: TranscriptUtterance[], right: TranscriptUtterance[]): Match[] {
  const rightKeys = right.map(normalizedText);
  const candidates = left.map((word) => {
    const key = normalizedText(word);
    const indices: number[] = [];
    if (!key) return indices;
    for (let i = 0; i < right.length; i++) {
      if (key === rightKeys[i] && Math.abs(midpoint(word) - midpoint(right[i])) <= 600) {
        indices.push(i);
      }
    }
    return indices;
  });
  const counts = Array<number>(right.length).fill(0);
  for (const indices of candidates) {
    for (const i of indices) counts[i]++;
  }
  const matches: Match[] = [];
  let lastRight = -1;
  for (const [i, indices] of candidates.entries()) {
    const j = indices[0];
    if (indices.length === 1 && counts[j] === 1 && j > lastRight) {
      matches.push({ left: i, right: j });
      lastRight = j;
    }
  }
  return matches;
}

/** 적어도 서로 다른 두 단어가 일치하고 양쪽 모두에서 우세한 대응만 채택한다. */
function matchedSpeakers(
  left: TranscriptUtterance[],
  right: TranscriptUtterance[],
  matches: Match[],
) {
  const evidence = new Map<number, Map<number, Set<string>>>();
  for (const match of matches) {
    const previous = left[match.left];
    const current = right[match.right];
    const votes = evidence.get(current.speaker) ?? new Map<number, Set<string>>();
    const words = votes.get(previous.speaker) ?? new Set<string>();
    words.add(normalizedText(current));
    votes.set(previous.speaker, words);
    evidence.set(current.speaker, votes);
  }

  const mapping = new Map<number, number>();
  for (const [local, votes] of evidence) {
    const ranked = [...votes].sort((a, b) => b[1].size - a[1].size);
    const [global, words] = ranked[0];
    const alternatives = ranked.slice(1).reduce((sum, [, keys]) => sum + keys.size, 0);
    let competing = 0;
    for (const [other, otherVotes] of evidence) {
      if (other !== local) competing += otherVotes.get(global)?.size ?? 0;
    }
    if (words.size >= 2 && words.size > 2 * Math.max(alternatives, competing)) {
      mapping.set(local, global);
    }
  }
  return mapping;
}

/** 같은 음성을 다르게 받아쓴 경우, 쉼으로 나뉜 각 구간마다 한 응답을 쓴다. */
function stitchUnaligned(
  left: TranscriptUtterance[],
  right: TranscriptUtterance[],
  middle: number,
) {
  const ordered = [
    ...left.map((word) => ({ word, side: 'left' })),
    ...right.map((word) => ({ word, side: 'right' })),
  ].sort((a, b) => a.word.startMs - b.word.startMs);
  const result: TranscriptUtterance[] = [];
  let i = 0;
  while (i < ordered.length) {
    const start = i;
    let endMs = ordered[i].word.endMs;
    while (++i < ordered.length && ordered[i].word.startMs <= endMs + 400) {
      endMs = Math.max(endMs, ordered[i].word.endMs);
    }
    const block = ordered.slice(start, i);
    const side = (block[0].word.startMs + endMs) / 2 < middle ? 'left' : 'right';
    const preferred = block.filter((entry) => entry.side === side);
    for (const entry of preferred.length ? preferred : block) result.push(entry.word);
  }
  return result;
}

function groupTurns(words: TranscriptUtterance[]) {
  const turns: TranscriptUtterance[] = [];
  const speakers = new Map<number, number>();
  let i = 0;
  while (i < words.length) {
    const first = words[i];
    const speaker = speakers.get(first.speaker) ?? speakers.size;
    speakers.set(first.speaker, speaker);
    let endMs = first.endMs;
    const tokens: string[] = [];
    do {
      tokens.push(words[i].text);
      endMs = Math.max(endMs, words[i].endMs);
      i++;
    } while (
      i < words.length && words[i].speaker === first.speaker && words[i].startMs - endMs < 10_000
    );
    turns.push({ speaker, startMs: first.startMs, endMs, text: joinWords(tokens) });
  }
  return turns;
}

export function mergeTranscriptChunks(chunks: TranscriptChunk[]): TranscriptUtterance[] {
  let merged: TranscriptUtterance[] = [];
  let nextSpeaker = 0;
  for (const [index, chunk] of chunks.entries()) {
    const words = chunk.words
      .map((word) => ({
        ...word,
        startMs: chunk.startMs + word.startMs,
        endMs: chunk.startMs + word.endMs,
      }))
      .sort((a, b) => midpoint(a) - midpoint(b));
    const overlapEnd = chunks[index - 1]?.endMs ?? chunk.startMs;
    const leftStart = merged.findIndex((word) => midpoint(word) >= chunk.startMs);
    const left = leftStart < 0 ? [] : merged.slice(leftStart);
    const right = words.filter((word) => midpoint(word) <= overlapEnd);
    const matches = matchOverlap(left, right);
    const mapping = matchedSpeakers(left, right, matches);
    const middle = (chunk.startMs + overlapEnd) / 2;
    // 일치 단어 바로 뒤에서 자르면 단어 경계가 조금 어긋나도 한 번만 남는다.
    const anchor = matches.reduce<Match | undefined>((best, match) => {
      if (!best) return match;
      return Math.abs(midpoint(left[match.left]) - middle) <
        Math.abs(midpoint(left[best.left]) - middle)
        ? match
        : best;
    }, undefined);
    const mapped = words.map((word) => {
      let speaker = mapping.get(word.speaker);
      if (speaker === undefined) {
        speaker = nextSpeaker++;
        mapping.set(word.speaker, speaker);
      }
      return { ...word, speaker };
    });
    let startRight = 0;
    if (anchor) {
      merged.length = leftStart + anchor.left + 1;
      startRight = anchor.right + 1;
    } else if (left.length && right.length) {
      const overlap = stitchUnaligned(left, mapped.slice(0, right.length), middle);
      merged.length = leftStart;
      for (const word of overlap) merged.push(word);
      startRight = right.length;
    }
    for (let i = startRight; i < mapped.length; i++) merged.push(mapped[i]);
  }
  return groupTurns(merged);
}
