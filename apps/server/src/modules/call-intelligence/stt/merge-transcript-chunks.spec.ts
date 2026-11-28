import { mergeTranscriptChunks } from './merge-transcript-chunks';

const word = (speaker: number, text: string, startMs: number) => ({
  speaker,
  text,
  startMs,
  endMs: startMs + 200,
});

describe('mergeTranscriptChunks', () => {
  it('carries swapped local speakers across three overlapping chunks and keeps the tail once', () => {
    const result = mergeTranscriptChunks([
      {
        startMs: 0,
        endMs: 10000,
        words: [
          word(0, '안녕하세요', 1000),
          word(0, '희망', 6500),
          word(0, '가격은?', 7000),
          word(1, '오억', 8000),
          word(1, '원입니다.', 8500),
        ],
      },
      {
        startMs: 6000,
        endMs: 16000,
        words: [
          word(1, '희망', 650),
          word(1, '가격은', 1150),
          word(0, '오억', 2110),
          word(0, '원입니다', 2570),
          word(1, '방문', 6500),
          word(1, '일정은요?', 7000),
          word(0, '내일', 8000),
          word(0, '오전에요.', 8500),
        ],
      },
      {
        startMs: 12000,
        endMs: 20000,
        words: [
          word(0, '방문', 560),
          word(0, '일정은요', 1040),
          word(1, '내일', 2070),
          word(1, '오전에요', 2570),
          word(0, '알겠습니다.', 7500),
        ],
      },
    ]);
    expect(result.map((turn) => turn.speaker)).toEqual([0, 1, 0, 1, 0]);
    expect(result.map((turn) => turn.text.replace(/[.?]/g, ''))).toEqual([
      '안녕하세요 희망 가격은',
      '오억 원입니다',
      '방문 일정은요',
      '내일 오전에요',
      '알겠습니다',
    ]);
    expect(result.at(-1)).toMatchObject({ startMs: 19500, endMs: 19700 });
  });

  it('does not infer identity from a reused local label, silence or repeated filler alone', () => {
    const chunks = [
      {
        startMs: 0,
        endMs: 5000,
        words: [word(0, '처음', 100), word(0, '네', 3100), word(0, '네', 4100)],
      },
      {
        startMs: 3000,
        endMs: 8000,
        words: [word(0, '네', 100), word(0, '네', 1100), word(0, '새로운', 2400)],
      },
      { startMs: 7000, endMs: 12000, words: [word(0, '손님입니다', 1600)] },
    ];
    const turns = mergeTranscriptChunks(chunks);
    expect(turns.map((turn) => turn.speaker)).toEqual([0, 1, 2]);
    expect(turns.flatMap((turn) => turn.text.split(' '))).toEqual([
      '처음',
      '네',
      '네',
      '새로운',
      '손님입니다',
    ]);
  });

  it('preserves valid speech when the overlapping portion of either response is empty', () => {
    const turns = mergeTranscriptChunks([
      { startMs: 0, endMs: 6000, words: [word(0, '이전', 5400)] },
      { startMs: 4000, endMs: 10000, words: [word(0, '이후', 3000)] },
      { startMs: 8000, endMs: 14000, words: [word(0, '끝', 100)] },
    ]);
    expect(turns.map((turn) => turn.text)).toEqual(['이전', '이후', '끝']);
    expect(mergeTranscriptChunks([])).toEqual([]);
  });

  it('retains speech heard on only one side of an unaligned overlap in chronological order', () => {
    const turns = mergeTranscriptChunks([
      { startMs: 0, endMs: 10000, words: [word(0, '나중에', 9100)] },
      { startMs: 4000, endMs: 14000, words: [word(0, '먼저', 1100), word(0, '끝', 7100)] },
    ]);
    expect(turns.map((turn) => turn.text)).toEqual(['먼저', '나중에', '끝']);
  });

  it('gives an ambiguous merged speaker a new number', () => {
    const result = mergeTranscriptChunks([
      {
        startMs: 0,
        endMs: 6500,
        words: [
          word(0, '어느', 2100),
          word(0, '지역', 3000),
          word(1, '서울', 4200),
          word(1, '강동구', 5000),
        ],
      },
      {
        startMs: 2000,
        endMs: 9000,
        words: [
          word(0, '어느', 100),
          word(0, '지역', 1000),
          word(0, '서울', 2200),
          word(0, '강동구', 3000),
          word(0, '새로운', 6000),
        ],
      },
    ]);
    expect(result.at(-1)?.speaker).toBe(2);
  });
});
