import { execFile, spawn } from 'node:child_process';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { compactDigitalSilence } from './compact-digital-silence';
import { type GeminiTranscribeOptions, transcribeWithGemini } from './gemini-transcribe';
import { mergeTranscriptChunks, type TranscriptChunk } from './merge-transcript-chunks';
import type { AudioInput, TranscriptUtterance } from './stt.types';

const exec = promisify(execFile);
const defaultWindow = { chunkMs: 28 * 60_000, overlapMs: 90_000 };
const pcmBytesPerMs = 16 * 2 * 2; // 16 kHz, signed 16-bit, stereo (별도로 녹음된 양 채널 보존)
const ffmpegArgs = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-max_error_rate', '0', '-threads', '1'];

interface AudioWindow {
  path: string;
  startMs: number;
  endMs: number;
  single: boolean;
}

/**
 * 파일의 재생 길이가 없거나 잘못돼도 실제 디코딩한 샘플 수로 자른다.
 * 호출자가 두 조각을 전사하는 동안 stdout의 역압으로 디코딩도 기다린다.
 * 디스크에는 원본과 처리 중인 구간만 두고, 다음 구간에 겹치는 부분만 메모리에 남긴다.
 */
async function* decodeWindows(
  dir: string,
  input: string,
  chunkMs: number,
  overlapMs: number,
): AsyncGenerator<AudioWindow> {
  const decoder = spawn('ffmpeg', [
    ...ffmpegArgs, '-protocol_whitelist', 'file',
    // SDP/HLS/concat 같은 외부 자원 참조 포맷은 열지 않는다. MOV 외부 트랙(dref)은 기본 비활성이다.
    '-format_whitelist', 'aac,aiff,asf,ac3,eac3,caf,flac,matroska,webm,mov,mp3,ogg,wav',
    '-i', input, '-map', '0:a:0', '-vn', '-ac', '2', '-ar', '16000', '-f', 's16le', 'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  const exited = new Promise<boolean>((resolve) => {
    decoder.once('error', () => resolve(false));
    decoder.once('close', (code) => resolve(code === 0));
  });

  const capacity = chunkMs * pcmBytesPerMs;
  const overlap = Buffer.alloc(overlapMs * pcmBytesPerMs);
  let startMs = 0;
  let written = 0;
  let path = join(dir, '0.pcm');
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(path, 'wx', 0o600);
    for await (const data of decoder.stdout) {
      const block = data as Buffer;
      let offset = 0;
      while (offset < block.length) {
        // 다음 샘플을 실제로 읽은 뒤에만 다음 조각을 만든다 (정확히 한 구간인 파일 포함).
        if (written === capacity) {
          await file.close();
          file = undefined;
          yield { path, startMs, endMs: startMs + chunkMs, single: false };
          startMs += chunkMs - overlapMs;
          path = join(dir, `${startMs}.pcm`);
          file = await open(path, 'wx', 0o600);
          await file.writeFile(overlap);
          written = overlap.length;
        }
        const count = Math.min(capacity - written, block.length - offset);
        const slice = block.subarray(offset, offset + count);
        await file.writeFile(slice);
        const overlapStart = Math.max(written, capacity - overlap.length);
        if (written + count > overlapStart) {
          slice.copy(overlap, overlapStart - (capacity - overlap.length), overlapStart - written);
        }
        written += count;
        offset += count;
      }
    }
    if (!(await exited) || written === 0) throw new Error('녹음 파일을 해독할 수 없습니다');
    await file.close();
    file = undefined;
    yield { path, startMs, endMs: startMs + written / pcmBytesPerMs, single: startMs === 0 };
  } finally {
    decoder.kill('SIGKILL');
    await exited;
    await file?.close();
  }
}

export async function transcribeGeminiRecording(
  audio: AudioInput,
  options: GeminiTranscribeOptions,
  { chunkMs, overlapMs } = defaultWindow,
): Promise<TranscriptUtterance[]> {
  if (
    !Number.isSafeInteger(chunkMs) || !Number.isSafeInteger(overlapMs) ||
    chunkMs > 30 * 60_000 || overlapMs <= 0 || chunkMs <= overlapMs * 2
  ) {
    throw new RangeError('Invalid transcription window');
  }

  const dir = await mkdtemp(join(tmpdir(), 'estait-recording-'));
  try {
    const input = join(dir, 'input');
    await writeFile(input, audio.buffer, { mode: 0o600 });

    const transcribeWindow = async ({ path, startMs, endMs, single }: AudioWindow) => {
      const compact = single ? undefined : await compactDigitalSilence(path);
      const flac = `${path}.flac`;
      await exec('ffmpeg', [
        ...ffmpegArgs, '-f', 's16le', '-ar', '16000', '-ac', '2', '-i', compact?.path ?? path,
        '-c:a', 'flac', '-compression_level', '2', '-threads', '1', flac,
      ], { timeout: 5 * 60_000 });
      await rm(path);
      if (compact && compact.path !== path) await rm(compact.path);
      const buffer = await readFile(flac);
      await rm(flac);
      const words = await transcribeWithGemini(
        { fileName: 'recording.flac', mimeType: 'audio/flac', buffer },
        { ...options, wordRows: !single },
      );
      if (compact) {
        for (const word of words) {
          const start = compact.originalMs(word.startMs, 'start');
          word.endMs = Math.max(start, compact.originalMs(word.endMs, 'end'));
          word.startMs = start;
        }
      }
      return { startMs, endMs, words };
    };

    const chunks: TranscriptChunk[] = [];
    let batch: AudioWindow[] = [];
    const flush = async () => {
      // 실패할 때도 두 요청 모두 업로드 파일을 정리한 뒤 임시 폴더를 지운다.
      const results = await Promise.allSettled(batch.map(transcribeWindow));
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
        chunks.push(result.value);
      }
      batch = [];
    };
    for await (const window of decodeWindows(dir, input, chunkMs, overlapMs)) {
      if (window.single) return (await transcribeWindow(window)).words;
      batch.push(window);
      if (batch.length === 2) await flush();
    }
    if (batch.length) await flush();
    return mergeTranscriptChunks(chunks);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
