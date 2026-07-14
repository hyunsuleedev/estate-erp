/**
 * 계약 특약(rich text HTML) 렌더 경로 새니타이즈 — web 앱 전용.
 * (apps/desktop/src/renderer/lib/contract-rich-text.ts 와 동일 구현 — 관례상 앱별 복제)
 *
 * shared 의 순수 새니타이저(sanitizeContractRichText)로 1차 정규화 후
 * DOMPurify 로 2차 검증한다 (defense in depth). dangerouslySetInnerHTML 에
 * 넘기는 모든 특약 HTML 은 반드시 이 모듈의 sanitizeContractHtml 을 거친다.
 */
import DOMPurify from 'dompurify';
import {
  CONTRACT_RICH_TEXT_ALLOWED_TAGS,
  contractPlainTextToRichText,
  isContractRichTextHtml,
  sanitizeContractRichText,
} from '@estate-erp/shared';

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [...CONTRACT_RICH_TEXT_ALLOWED_TAGS],
  ALLOWED_ATTR: [] as string[],
  ALLOW_DATA_ATTR: false,
};

/** 특약 HTML → 안전한 HTML (허용 태그 화이트리스트, 속성 전체 제거) */
export function sanitizeContractHtml(html: string): string {
  return DOMPurify.sanitize(sanitizeContractRichText(html), DOMPURIFY_CONFIG);
}

/**
 * 저장된 특약 값(HTML 또는 레거시 plain text) → 렌더/에디터용 안전한 HTML.
 * plain text 는 줄 단위 `<p>` 문단으로 변환한다.
 */
export function contractRichTextToSafeHtml(value: string | null | undefined): string {
  if (!value) return '';
  if (!isContractRichTextHtml(value)) {
    return sanitizeContractHtml(contractPlainTextToRichText(value));
  }
  return sanitizeContractHtml(value);
}

/**
 * 저장 직전 새니타이즈 — HTML 이면 정화, 레거시 plain text 는 그대로 보존
 * (에디터를 열지 않은 기존 계약의 특약을 강제 변환하지 않는다).
 */
export function sanitizeContractRichTextForSave(value: string): string {
  if (!isContractRichTextHtml(value)) return value;
  return sanitizeContractHtml(value);
}

/** 특약 HTML 렌더 컨테이너 공통 클래스 (Tailwind preflight 가 지운 목록 스타일 복원) */
export const CONTRACT_RICH_TEXT_VIEW_CLASS =
  '[&_p]:min-h-[1lh] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_s]:line-through [&_u]:underline';
