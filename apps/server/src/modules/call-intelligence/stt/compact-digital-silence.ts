import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const blockMs = 10;
const bytesPerMs = 16 * 2 * 2; // 16 kHz signed 16-bit stereo
const zeros = Buffer.alloc(blockMs * bytesPerMs);

interface Cut {
  startMs: number;
  endMs: number;
}

/** 입력은 decodeWindows가 만든 stereo s16le. 양 채널의 모든 비트가 0인 구간만 줄인다. */
export async function compactDigitalSilence(path: string) {
  const cuts: Cut[] = [];
  let positionMs = 0;
  let silentMs = 0;
  const finishRun = () => {
    if (silentMs >= 10_000) {
      cuts.push({ startMs: positionMs - silentMs + 500, endMs: positionMs - 500 });
    }
    silentMs = 0;
  };

  let tail: Buffer = Buffer.alloc(0);
  for await (const block of createReadStream(path, { highWaterMark: bytesPerMs * 1000 })) {
    const data: Buffer = tail.length ? Buffer.concat([tail, block]) : block;
    let offset = 0;
    for (; offset + zeros.length <= data.length; offset += zeros.length) {
      if (data.subarray(offset, offset + zeros.length).equals(zeros)) silentMs += blockMs;
      else finishRun();
      positionMs += blockMs;
    }
    tail = data.subarray(offset);
  }
  finishRun();

  const output = cuts.length ? path + '.compact' : path;
  if (cuts.length) {
    async function* retainedAudio() {
      let start = 0;
      for (const cut of cuts) {
        yield* createReadStream(path, { start, end: cut.startMs * bytesPerMs - 1 });
        start = cut.endMs * bytesPerMs;
      }
      yield* createReadStream(path, { start });
    }
    await pipeline(retainedAudio(), createWriteStream(output, { flags: 'wx', mode: 0o600 }));
  }

  // 같은 접점에서 발화가 끝나면 무음 앞, 시작하면 무음 뒤의 원본 시각이다.
  function originalMs(timeMs: number, edge: 'start' | 'end') {
    let original = timeMs;
    for (const cut of cuts) {
      if (original < cut.startMs || (edge === 'end' && original === cut.startMs)) break;
      original += cut.endMs - cut.startMs;
    }
    return original;
  }
  return { path: output, originalMs };
}
