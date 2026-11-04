import {
  type AudioInput,
  type FetchFn,
  readJsonResponse,
  sleep as defaultSleep,
  type TranscriptUtterance,
} from './stt.types';

/**
 * Gemini 3.5 Transcribe 받아쓰기.
 * 1. Files API로 녹음 업로드 → 2. interactions 호출(한국어, 화자 구분) → 3. 업로드 파일 삭제
 *
 * 화자 구분과 사용자 단어장은 함께 쓸 수 없어 단어장은 쓰지 않는다.
 * 단지명 같은 고유명사 보정은 분석 단계에서 사무소 데이터를 함께 넘겨 처리한다.
 * 단어별 시각은 정확도를 떨어뜨릴 수 있어 기본으로 끈다(GEMINI_STT_WORD_TIMESTAMPS=true로 켬).
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';
export const DEFAULT_GEMINI_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

interface GeminiFile {
  name: string;
  uri: string;
  mimeType?: string;
  state?: string;
  error?: { message?: string };
}

interface WordAnnotation {
  type?: string;
  text?: string;
  speaker?: string | number;
  start_offset?: unknown;
  end_offset?: unknown;
}

interface InteractionContent {
  type?: string;
  text?: string;
  annotations?: WordAnnotation[];
}

export interface GeminiInteraction {
  id?: string;
  status?: string;
  steps?: Array<{ type?: string; content?: InteractionContent[] }>;
  error?: { message?: string };
}

export interface GeminiTranscribeOptions {
  apiKey: string;
  model?: string;
  wordTimestamps?: boolean;
  fetchFn?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
  /** interactions 결과 대기 최대 시간 */
  timeoutMs?: number;
}

const PENDING_STATUSES = new Set(['queued', 'pending', 'in_progress', 'running', 'processing']);

export async function transcribeWithGemini(
  audio: AudioInput,
  options: GeminiTranscribeOptions,
): Promise<TranscriptUtterance[]> {
  const fetchFn = options.fetchFn ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const headers = { 'x-goog-api-key': options.apiKey };

  const file = await uploadFile(audio, options.apiKey, fetchFn);
  try {
    await waitForFileActive(file, options.apiKey, fetchFn, sleep);

    const mode: Record<string, unknown> = { type: 'verbatim', diarization_mode: 'speaker' };
    if (options.wordTimestamps) mode.timestamp_granularities = ['word'];

    let interaction = await readJsonResponse<GeminiInteraction>(
      await fetchFn(`${GEMINI_BASE}/v1beta/interactions`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model ?? DEFAULT_GEMINI_TRANSCRIBE_MODEL,
          input: [{ type: 'audio', uri: file.uri, mime_type: audio.mimeType }],
          generation_config: {
            transcription_config: { language_codes: ['ko-KR'], mode },
          },
        }),
      }),
      'Gemini 받아쓰기 요청',
    );

    const deadline = Date.now() + (options.timeoutMs ?? 10 * 60_000);
    while (interaction.status && PENDING_STATUSES.has(interaction.status)) {
      if (!interaction.id) throw new Error('Gemini 받아쓰기 id가 없습니다');
      if (Date.now() > deadline) throw new Error('Gemini 받아쓰기 시간 초과');
      await sleep(3000);
      interaction = await readJsonResponse<GeminiInteraction>(
        await fetchFn(`${GEMINI_BASE}/v1beta/${interactionPath(interaction.id)}`, { headers }),
        'Gemini 받아쓰기 조회',
      );
    }
    return utterancesFromInteraction(interaction);
  } finally {
    // 고객 음성이 남지 않게 바로 지운다 (Files API는 48시간 뒤 자동 삭제되지만 기다리지 않는다)
    await fetchFn(`${GEMINI_BASE}/v1beta/${file.name}`, { method: 'DELETE', headers }).catch(
      () => undefined,
    );
  }
}

function interactionPath(id: string) {
  return id.startsWith('interactions/') ? id : `interactions/${id}`;
}

async function uploadFile(audio: AudioInput, apiKey: string, fetchFn: FetchFn): Promise<GeminiFile> {
  const start = await fetchFn(`${GEMINI_BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(audio.buffer.length),
      'X-Goog-Upload-Header-Content-Type': audio.mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'call-recording' } }),
  });
  if (!start.ok) await readJsonResponse(start, 'Gemini 녹음 업로드 시작');
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini 녹음 업로드 주소를 받지 못했습니다');

  const uploaded = await readJsonResponse<{ file?: GeminiFile }>(
    await fetchFn(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(audio.buffer.length),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: new Uint8Array(audio.buffer),
    }),
    'Gemini 녹음 업로드',
  );
  if (!uploaded?.file?.name || !uploaded.file.uri) {
    throw new Error('Gemini 녹음 업로드 응답이 올바르지 않습니다');
  }
  return uploaded.file;
}

async function waitForFileActive(
  file: GeminiFile,
  apiKey: string,
  fetchFn: FetchFn,
  sleep: (ms: number) => Promise<void>,
) {
  let current = file;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!current.state || current.state === 'ACTIVE') return;
    if (current.state === 'FAILED') {
      throw new Error(`Gemini가 녹음 파일을 읽지 못했습니다: ${current.error?.message ?? ''}`);
    }
    await sleep(1000);
    current = await readJsonResponse<GeminiFile>(
      await fetchFn(`${GEMINI_BASE}/v1beta/${file.name}`, {
        headers: { 'x-goog-api-key': apiKey },
      }),
      'Gemini 녹음 파일 조회',
    );
  }
  throw new Error('Gemini 녹음 파일 준비 시간 초과');
}

/** "1.250s", 1.25, { seconds, nanos } → ms */
function offsetToMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 1000);
  if (typeof value === 'string') {
    const seconds = Number.parseFloat(value.replace(/s$/, ''));
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
  }
  if (value && typeof value === 'object') {
    const { seconds, nanos } = value as { seconds?: string | number; nanos?: number };
    const total = Number(seconds ?? 0) + Number(nanos ?? 0) / 1e9;
    return Number.isFinite(total) ? Math.round(total * 1000) : null;
  }
  return null;
}

function joinWords(words: string[]) {
  return words
    .join(' ')
    .replace(/\s+([.,?!])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * interactions 응답 → 발화 목록.
 * 단어별 화자 정보(word_info)를 같은 화자끼리 이어 붙인다. 화자 정보가 없으면 전체를 한 발화로 둔다.
 */
export function utterancesFromInteraction(interaction: GeminiInteraction): TranscriptUtterance[] {
  if (interaction.error?.message) {
    throw new Error(`Gemini 받아쓰기 오류: ${interaction.error.message}`);
  }
  if (interaction.status && interaction.status !== 'completed') {
    throw new Error(`Gemini 받아쓰기 실패 (${interaction.status})`);
  }

  const contents = (interaction.steps ?? [])
    .filter((step) => !step.type || step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === 'text' || typeof content.text === 'string');

  const speakerIndex = new Map<string, number>();
  const indexOf = (raw: unknown) => {
    const key = raw === undefined || raw === null ? '' : String(raw);
    if (!speakerIndex.has(key)) speakerIndex.set(key, speakerIndex.size);
    return speakerIndex.get(key)!;
  };

  const utterances: TranscriptUtterance[] = [];
  for (const content of contents) {
    const words = (content.annotations ?? []).filter(
      (annotation) => annotation.type === 'word_info' && annotation.text?.trim(),
    );
    if (words.length === 0) {
      const text = content.text?.trim();
      if (text) utterances.push({ speaker: indexOf(undefined), text, startMs: 0, endMs: 0 });
      continue;
    }

    let current: { speaker: number; words: string[]; startMs: number; endMs: number } | null = null;
    const flush = () => {
      if (!current) return;
      const text = joinWords(current.words);
      if (text) {
        utterances.push({
          speaker: current.speaker,
          text,
          startMs: current.startMs,
          endMs: Math.max(current.startMs, current.endMs),
        });
      }
      current = null;
    };
    for (const word of words) {
      const speaker = indexOf(word.speaker);
      const startMs = offsetToMs(word.start_offset);
      const endMs = offsetToMs(word.end_offset);
      if (!current || current.speaker !== speaker) {
        flush();
        const previousEnd = utterances.at(-1)?.endMs ?? 0;
        current = {
          speaker,
          words: [],
          startMs: startMs ?? previousEnd,
          endMs: endMs ?? startMs ?? previousEnd,
        };
      }
      current.words.push(word.text!.trim());
      if (endMs !== null) current.endMs = endMs;
    }
    flush();
  }
  return utterances;
}
