import { buildAnalysisPrompt } from './call-analysis.prompt';

describe('call analysis prompt', () => {
  it('numbers transcript lines by seq with their offset so the analysis can cite them', () => {
    const prompt = buildAnalysisPrompt({
      calledAt: new Date('2026-11-08T05:02:00Z'),
      direction: 'inbound',
      durationSec: 252,
      contactName: '박준혁',
      utterances: [
        { seq: 0, speaker: 1, text: '어떤 평형 보세요?', startMs: 12_000 },
        { seq: 1, speaker: 0, text: '84 방 3개요', startMs: 65_400 },
      ],
      contextText: '',
      resolvedSuggestions: [],
    });

    expect(prompt).toContain('[0] 0:12 화자1: 어떤 평형 보세요?\n[1] 1:05 화자0: 84 방 3개요');
    expect(prompt).toContain('"facts"');
    expect(prompt).toContain('"checks"');
  });
});
