/** 받아쓰기 결과의 발화 한 덩어리 (같은 화자가 이어서 말한 구간) */
export interface TranscriptUtterance {
  /** 0부터 시작하는 화자 번호 (처음 말한 사람이 0) */
  speaker: number;
  text: string;
  /** 시각을 못 받으면 0 */
  startMs: number;
  endMs: number;
}

export type SttProvider = 'gemini' | 'vito' | 'dummy';

export interface AudioInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export type FetchFn = typeof fetch;

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 응답 본문을 JSON으로 읽는다. 오류 응답이면 메시지를 담아 던진다. */
export async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ||
      text.slice(0, 200) ||
      response.statusText;
    throw new Error(`${label} 실패 (${response.status}): ${message}`);
  }
  return body as T;
}
