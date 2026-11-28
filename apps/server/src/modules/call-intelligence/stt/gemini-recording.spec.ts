import { execFileSync } from 'node:child_process';
import * as gemini from './gemini-transcribe';
import { transcribeGeminiRecording } from './gemini-recording';
import type { AudioInput } from './stt.types';

const options = { apiKey: 'test-key' };
const window = { chunkMs: 1000, overlapMs: 200 };

function input(seconds: number, format = 'wav'): AudioInput {
  const buffer = execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'aevalsrc=sin(2*PI*t*(200+50*t)):s=16000',
    '-t', String(seconds), '-f', format, 'pipe:1',
  ]);
  return { buffer, fileName: `input.${format}`, mimeType: `audio/${format}` };
}

function unpack(audio: AudioInput) {
  return execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'flac', '-i', 'pipe:0', '-ac', '2', '-f', 's16le', 'pipe:1',
  ], { input: audio.buffer });
}

afterEach(() => jest.restoreAllMocks());

it('keeps a file exactly one window long in a single transcription with the original timestamp preference', async () => {
  const source = input(1);
  const mock = jest.spyOn(gemini, 'transcribeWithGemini').mockResolvedValue([
    { speaker: 0, startMs: 0, endMs: 0, text: '상담입니다' },
  ]);
  expect(await transcribeGeminiRecording(source, options, window)).toEqual([
    { speaker: 0, startMs: 0, endMs: 0, text: '상담입니다' },
  ]);
  expect(mock).toHaveBeenCalledTimes(1);
  const [audio, config] = mock.mock.calls[0];
  expect(config.wordRows).toBe(false);
  expect(unpack(audio).length).toBe(64_000);
});

it('decodes streaming WebM, preserves shared samples and completes the last partial window', async () => {
  const source = input(2.5, 'webm');
  const mock = jest.spyOn(gemini, 'transcribeWithGemini').mockResolvedValue([]);
  await transcribeGeminiRecording(source, options, window);
  expect(mock).toHaveBeenCalledTimes(3);
  expect(mock.mock.calls.every(([, config]) => config.wordRows)).toBe(true);
  // 요청은 동시에 나가므로 파일 내용으로 첫 두 조각의 순서를 찾는다.
  const parts = mock.mock.calls.map(([audio]) => unpack(audio));
  const tail = parts.pop()!;
  const bytes = window.overlapMs * 64;
  if (!parts[0].subarray(-bytes).equals(parts[1].subarray(0, bytes))) parts.reverse();
  expect(parts[0].length).toBe(64_000);
  expect(parts[1].length).toBe(64_000);
  expect(tail.length).toBe(57_600);
  expect(parts[0].subarray(-bytes)).toEqual(parts[1].subarray(0, bytes));
  expect(parts[1].subarray(-bytes)).toEqual(tail.subarray(0, bytes));
});

it('does not call Gemini for unreadable media', async () => {
  const mock = jest.spyOn(gemini, 'transcribeWithGemini').mockResolvedValue([]);
  await expect(transcribeGeminiRecording({
    fileName: 'corrupt.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid'),
  }, options, window)).rejects.toThrow('녹음 파일을 해독할 수 없습니다');
  expect(mock).not.toHaveBeenCalled();
});

it('rejects chunk output without speaker or word timing even when text was returned', () => {
  expect(() => gemini.utterancesFromInteraction({
    steps: [{ type: 'model_output', content: [{ text: '상담' }] }],
  }, true)).toThrow('구간별 화자와 단어 시각');
  for (const fields of [{ speaker: 'a' }, { start_offset: '0s', end_offset: '1s' }]) {
    expect(() => gemini.utterancesFromInteraction({
      steps: [{ type: 'model_output', content: [{
        type: 'text', annotations: [{ type: 'word_info', text: '상담', ...fields }],
      }] }],
    }, true)).toThrow('구간별 화자와 단어 시각');
  }
});
