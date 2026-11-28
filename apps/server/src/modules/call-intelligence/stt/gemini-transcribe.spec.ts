import { transcribeWithGemini, utterancesFromInteraction } from './gemini-transcribe';

function word(text: string, speaker: string, start?: string, end?: string) {
  return { type: 'word_info', text, speaker, start_offset: start, end_offset: end };
}

describe('Gemini transcribe', () => {
  it('joins words of the same speaker and numbers speakers by first appearance', () => {
    const utterances = utterancesFromInteraction({
      status: 'completed',
      steps: [
        {
          type: 'model_output',
          content: [
            {
              type: 'text',
              text: '여보세요 네 부동산입니다 그 매물 아직 있나요?',
              annotations: [
                word('여보세요', 'spk_2', '0.100s', '0.800s'),
                word('네', 'spk_1', '1.000s', '1.200s'),
                word('부동산입니다', 'spk_1', '1.300s', '2.000s'),
                word('그', 'spk_2', '2.500s', '2.600s'),
                word('매물', 'spk_2', '2.700s', '3.000s'),
                word('아직', 'spk_2', '3.100s', '3.300s'),
                word('있나요', 'spk_2', '3.400s', '3.800s'),
                word('?', 'spk_2', '3.800s', '3.900s'),
              ],
            },
          ],
        },
      ],
    });

    expect(utterances).toEqual([
      { speaker: 0, text: '여보세요', startMs: 100, endMs: 800 },
      { speaker: 1, text: '네 부동산입니다', startMs: 1000, endMs: 2000 },
      { speaker: 0, text: '그 매물 아직 있나요?', startMs: 2500, endMs: 3900 },
    ]);
  });

  it('keeps the whole text when there is no word information', () => {
    expect(
      utterancesFromInteraction({
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: ' 전체 대화 ' }] }],
      }),
    ).toEqual([{ speaker: 0, text: '전체 대화', startMs: 0, endMs: 0 }]);
  });

  it('reports failed interactions', () => {
    expect(() => utterancesFromInteraction({ status: 'failed' })).toThrow('Gemini 받아쓰기 실패 (failed)');
  });

  it('uploads the audio, asks for Korean diarization, and deletes the upload even when transcription fails', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const fetchFn = jest.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      if (url.endsWith('/upload/v1beta/files')) {
        return new Response('{}', { status: 200, headers: { 'x-goog-upload-url': 'https://upload.test/session' } });
      }
      if (url === 'https://upload.test/session') {
        return Response.json({ file: { name: 'files/abc', uri: 'https://files.test/abc', state: 'ACTIVE' } });
      }
      if (url.endsWith('/v1beta/interactions')) {
        return Response.json({ error: { message: 'quota exceeded' } }, { status: 429 });
      }
      return new Response('{}', { status: 200 });
    });

    const sleep = jest.fn(async () => undefined);
    await expect(
      transcribeWithGemini(
        { buffer: Buffer.from('audio'), fileName: 'call.m4a', mimeType: 'audio/m4a' },
        { apiKey: 'key', fetchFn: fetchFn as never, sleep },
      ),
    ).rejects.toThrow('quota exceeded');

    expect(sleep.mock.calls).toEqual([[30_000], [60_000], [90_000]]);
    expect(calls.filter((call) => call.url.endsWith('/v1beta/interactions'))).toHaveLength(4);
    const interaction = calls.find((call) => call.url.endsWith('/v1beta/interactions'));
    expect(interaction?.body).toEqual({
      model: 'gemini-3.5-transcribe',
      input: [{ type: 'audio', uri: 'https://files.test/abc', mime_type: 'audio/m4a' }],
      generation_config: {
        transcription_config: {
          language_codes: ['ko-KR'],
          mode: { type: 'verbatim', diarization_mode: 'speaker' },
        },
      },
    });
    expect(calls.at(-1)).toMatchObject({ url: expect.stringContaining('/v1beta/files/abc'), method: 'DELETE' });
  });
});

describe('Gemini 전사 요청의 일시적인 사용량 제한', () => {
  function run(initial: Response, second = Response.json({ status: 'completed' })) {
    const responses = [
      new Response(null, { headers: { 'x-goog-upload-url': 'https://upload.test/1' } }),
      Response.json({ file: { name: 'files/one', uri: 'https://files.test/one', state: 'ACTIVE' } }),
      initial, second, new Response(null),
    ];
    const fetchFn = jest.fn(async (_url: string, _init: RequestInit) => responses.shift()!);
    const sleep = jest.fn(async () => undefined);
    const result = transcribeWithGemini(
      { buffer: Buffer.from('test'), fileName: 'test.flac', mimeType: 'audio/flac' },
      { apiKey: 'key', fetchFn: fetchFn as never, sleep },
    );
    return { result, fetchFn, sleep };
  }

  it.each([
    [{ message: 'quota' }, { 'Retry-After': '17' }, 17_000],
    [{ details: [{ retryDelay: '14.2s' }] }, {}, 14_200],
    [{ message: 'Please retry in 12s.' }, {}, 12_000],
    [{ message: 'quota' }, {}, 30_000],
  ] as const)('reuses the upload and respects the rate limit', async (error, headers, delay) => {
    const { result, fetchFn, sleep } = run(Response.json({ error }, { status: 429, headers }));
    await expect(result).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(delay);
    expect(fetchFn.mock.calls[2]).toEqual(fetchFn.mock.calls[3]);
    expect(fetchFn.mock.calls[4][1].method).toBe('DELETE');
  });

  it.each([429, 400, 503])('stops on an excessive wait or a different HTTP error (%i)', async (status) => {
    const { result, sleep } = run(Response.json({ error: { message: 'unavailable' } }, {
      status, headers: { 'Retry-After': '181' },
    }));
    await expect(result).rejects.toThrow('unavailable');
    expect(sleep).not.toHaveBeenCalled();
  });
});
