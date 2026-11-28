import { execFileSync } from 'node:child_process';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transcribeGeminiRecording } from './gemini-recording';
import * as gemini from './gemini-transcribe';
import type { TranscriptUtterance } from './stt.types';

it('restores the timeline and both speakers across a 31-minute recording with long digital silence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gemini-silence-test-'));
  const pcm = join(dir, 'source.pcm');
  const labels = ['안녕', '문의', '보증금', '가격', '시간', '일정', '마무리'];
  try {
    const file = await open(pcm, 'wx');
    try {
      await file.truncate(1860 * 64000);
      // 한 쪽 채널만 소리가 있어도 무음이 아니다. 조각마다 처음 말한 사람도 다르게 둔다.
      for (const [id, start] of [0, 1, 1602, 1603, 1604, 1605, 1859].entries()) {
        const frames = Buffer.alloc(64000);
        const channel = [1, 2, 3, 6].includes(id) ? 1 : 0;
        for (let i = channel * 2; i < frames.length; i += 4) frames.writeInt16LE(id + 1, i);
        // 위치 지정 쓰기로 긴 중간 구간을 파일 전체를 메모리에 올리지 않고 만든다.
        await file.write(frames, 0, frames.length, start * 64000);
      }
    } finally {
      await file.close();
    }
    const source = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-f', 's16le', '-ar', '16000', '-ac', '2', '-i', pcm, '-f', 'flac', 'pipe:1'],
      { maxBuffer: 4_000_000 },
    );
    const transcribe = jest
      .spyOn(gemini, 'transcribeWithGemini')
      .mockImplementation(async (audio) => {
        const frames = execFileSync(
          'ffmpeg',
          ['-v', 'error', '-f', 'flac', '-i', 'pipe:0', '-f', 's16le', 'pipe:1'],
          { input: audio.buffer, maxBuffer: 2_000_000 },
        );
        expect(frames.length / 64000).toBeLessThan(10);
        const speakers = new Map<number, number>();
        const words: TranscriptUtterance[] = [];
        for (let offset = 0; offset < frames.length; offset += 640) {
          const left = frames.readInt16LE(offset);
          const right = frames.readInt16LE(offset + 2);
          const marker = left || right;
          if (!marker) continue;
          const channel = left ? 0 : 1;
          if (!speakers.has(channel)) speakers.set(channel, speakers.size);
          const text = labels[marker - 1];
          if (words.at(-1)?.text !== text) {
            words.push({
              speaker: speakers.get(channel)!,
              text,
              startMs: offset / 64,
              endMs: offset / 64 + 1000,
            });
          }
        }
        return words;
      });
    const result = await transcribeGeminiRecording(
      { fileName: 'long.flac', mimeType: 'audio/flac', buffer: source },
      { apiKey: 'test' },
    );
    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      { speaker: 0, text: '안녕', startMs: 0, endMs: 1000 },
      { speaker: 1, text: '문의', startMs: 1000, endMs: 2000 },
      { speaker: 1, text: '보증금 가격', startMs: 1602000, endMs: 1604000 },
      { speaker: 0, text: '시간 일정', startMs: 1604000, endMs: 1606000 },
      { speaker: 1, text: '마무리', startMs: 1859000, endMs: 1860000 },
    ]);
  } finally {
    jest.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
