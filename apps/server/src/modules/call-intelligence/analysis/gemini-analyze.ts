import { type FetchFn, readJsonResponse } from '../stt/stt.types';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';
/** GEMINI_ANALYSIS_MODEL로 바꿀 수 있다 */
export const DEFAULT_GEMINI_ANALYSIS_MODEL = 'gemini-3.8-flash';

interface GenerateContentResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
  promptFeedback?: { blockReason?: string };
}

/** Gemini에 JSON 응답을 요청하고 파싱한 값을 돌려준다. */
export async function generateAnalysisJson(options: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  prompt: string;
  fetchFn?: FetchFn;
}): Promise<unknown> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await readJsonResponse<GenerateContentResponse>(
    await fetchFn(`${GEMINI_BASE}/v1beta/models/${encodeURIComponent(options.model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': options.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    }),
    'Gemini 통화 분석',
  );

  if (response.promptFeedback?.blockReason) {
    throw new Error(`Gemini가 분석을 거절했습니다: ${response.promptFeedback.blockReason}`);
  }
  const candidate = response.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
  if (!text) {
    throw new Error(`Gemini 분석 응답이 비어 있습니다 (${candidate?.finishReason ?? 'unknown'})`);
  }
  return parseJsonText(text);
}

export function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini 분석 응답이 JSON이 아닙니다');
    return JSON.parse(match[0]);
  }
}
