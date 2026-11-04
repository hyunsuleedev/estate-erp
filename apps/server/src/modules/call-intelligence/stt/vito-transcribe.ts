import FormData = require('form-data');
import {
  type AudioInput,
  type FetchFn,
  readJsonResponse,
  sleep as defaultSleep,
  type TranscriptUtterance,
} from './stt.types';

/**
 * 리턴제로(VITO) 받아쓰기. STT_PROVIDER=vito일 때, 또는 Gemini 키 없이 VITO 키만 있을 때 쓴다.
 * 1. 인증 → 2. 파일 업로드(화자 2명) → 3. 3초 간격 폴링(최대 5분)
 */
export async function transcribeWithVito(
  audio: AudioInput,
  options: {
    clientId: string;
    clientSecret: string;
    fetchFn?: FetchFn;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<TranscriptUtterance[]> {
  const fetchFn = options.fetchFn ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  const auth = await readJsonResponse<{ access_token?: string }>(
    await fetchFn('https://openapi.vito.ai/v1/authenticate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${encodeURIComponent(options.clientId)}&client_secret=${encodeURIComponent(options.clientSecret)}`,
    }),
    'VITO 인증',
  );
  if (!auth?.access_token) throw new Error('VITO 인증 실패');
  const authorization = { Authorization: `Bearer ${auth.access_token}` };

  const form = new FormData();
  form.append('file', audio.buffer, { filename: audio.fileName, contentType: audio.mimeType });
  form.append('config', JSON.stringify({ use_diarization: true, spk_count: 2 }));
  const started = await readJsonResponse<{ id?: string }>(
    await fetchFn('https://openapi.vito.ai/v1/transcribe', {
      method: 'POST',
      headers: { ...authorization, ...form.getHeaders() },
      body: form.getBuffer() as unknown as BodyInit,
    }),
    'VITO 받아쓰기 요청',
  );
  if (!started?.id) throw new Error('VITO 받아쓰기 요청 실패');

  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(3000);
    const status = await readJsonResponse<{
      status: string;
      results?: { utterances: Array<{ spk: number; msg: string; start_at: number; duration: number }> };
    }>(
      await fetchFn(`https://openapi.vito.ai/v1/transcribe/${started.id}`, { headers: authorization }),
      'VITO 받아쓰기 조회',
    );
    if (status.status === 'completed') {
      return (status.results?.utterances ?? []).map((utterance) => ({
        speaker: utterance.spk,
        text: utterance.msg,
        startMs: Math.round(utterance.start_at),
        endMs: Math.round(utterance.start_at + utterance.duration),
      }));
    }
    if (status.status === 'failed') throw new Error('VITO 받아쓰기 실패');
  }
  throw new Error('VITO 받아쓰기 시간 초과');
}
