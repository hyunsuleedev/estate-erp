/**
 * 계약서 특약사항(레거시 Rider_Part) rich text(HTML) 유틸.
 *
 * 레거시 MySpider 는 특약을 RichEdit/SmartEditor HTML 로 저장했다. 현행은
 * TipTap(HTML 문자열)로 편집하고 metadata.documentEngine.fields.specialTerms /
 * Contract.specialTerms 에 저장한다. 저장·렌더 전 구간에서 이 모듈의
 * 새니타이저를 거쳐 XSS 를 차단한다.
 *
 * 순수 문자열 구현 (DOM 미사용) — ESM 브라우저·Node 양쪽에서 동작한다.
 * 렌더러(desktop)는 여기에 더해 DOMPurify 를 이중으로 적용한다 (defense in depth).
 *
 * 새니타이즈 정책:
 * - 허용 태그 화이트리스트 외 태그는 제거 (내용 텍스트는 보존)
 * - script/style/iframe 등 위험 태그는 내용까지 통째로 제거
 * - 모든 속성 제거 (onerror/onclick/style/href=javascript: 원천 차단)
 * - 태그로 해석되지 않는 `<` 는 `&lt;` 로 이스케이프
 * - 출력은 여는/닫는 태그가 균형 잡힌 canonical 마크업
 */

/** 허용 태그 (레거시 특약 서식 수준 — 문단/줄바꿈/강조/목록) */
export const CONTRACT_RICH_TEXT_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'ul',
  'ol',
  'li',
  'span',
] as const;

const ALLOWED_TAG_SET = new Set<string>(CONTRACT_RICH_TEXT_ALLOWED_TAGS);

/** 셀프클로징 (닫는 태그 없음) */
const VOID_TAG_SET = new Set(['br']);

/**
 * 태그와 내용을 통째로 제거 (실행 가능/외부 로드 컨텍스트).
 * embed/img/input 등 void 위험 태그는 내용이 없으므로 여기 넣지 않는다
 * — 허용 외 태그 제거 분기에서 태그만 벗겨진다 (닫는 태그 탐색 시
 * 문서 잔여부가 통째로 날아가는 오동작 방지).
 */
const DROP_CONTENT_TAG_SET = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'noscript',
  'svg',
  'math',
  'textarea',
  'title',
  'template',
  'head',
  'xmp',
]);

/** `<tag ...>` / `</tag>` 토큰 — 속성은 따옴표 문자열을 통째로 스킵 */
const TAG_TOKEN_PATTERN = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/;

/** HTML 텍스트 이스케이프 (특약 plain text → HTML 변환용) */
export function escapeContractHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 값이 rich text HTML 로 보이는지 판별.
 * 레거시 plain text 특약("1. 현 시설물 상태의 계약임.")과의 하위호환 분기용.
 */
export function isContractRichTextHtml(value: string | null | undefined): boolean {
  if (!value) return false;
  return /<\/?[a-zA-Z][a-zA-Z0-9-]*(\s(?:"[^"]*"|'[^']*'|[^"'>])*)?\/?>/.test(value);
}

/**
 * 사용자 입력 HTML 새니타이즈.
 * 허용 태그만 canonical 형태(`<p>`/`</p>`, 속성 없음)로 재구성해 반환한다.
 */
export function sanitizeContractRichText(html: string): string {
  const source = String(html);
  const out: string[] = [];
  /** 열려 있는 (non-void) 허용 태그 스택 — 출력 균형 보장 */
  const openStack: string[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char !== '<') {
      const nextLt = source.indexOf('<', index);
      const text = nextLt === -1 ? source.slice(index) : source.slice(index, nextLt);
      out.push(text);
      index = nextLt === -1 ? source.length : nextLt;
      continue;
    }

    const rest = source.slice(index);

    // 주석 (조건부 주석 포함) 제거
    if (rest.startsWith('<!--')) {
      const end = source.indexOf('-->', index + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }

    // DOCTYPE/CDATA/PI 등 제거
    if (rest.startsWith('<!') || rest.startsWith('<?')) {
      const end = source.indexOf('>', index + 1);
      index = end === -1 ? source.length : end + 1;
      continue;
    }

    const tagMatch = TAG_TOKEN_PATTERN.exec(rest);
    if (!tagMatch) {
      // 태그로 해석 불가한 `<` — 텍스트로 이스케이프
      out.push('&lt;');
      index += 1;
      continue;
    }

    const [token, closeSlash, rawName] = tagMatch;
    const tagName = rawName.toLowerCase();
    const isClose = closeSlash === '/';
    index += token.length;

    // 위험 태그: 여는 태그면 대응하는 닫는 태그까지 내용 통째로 제거
    if (DROP_CONTENT_TAG_SET.has(tagName)) {
      if (!isClose) {
        const closePattern = new RegExp(`</${tagName}(?:\\s(?:"[^"]*"|'[^']*'|[^"'>])*)?>`, 'i');
        const closeMatch = closePattern.exec(source.slice(index));
        index = closeMatch ? index + closeMatch.index + closeMatch[0].length : source.length;
      }
      continue;
    }

    // 허용 외 태그: 태그만 제거, 내용은 유지 (div → 문단 텍스트 등)
    if (!ALLOWED_TAG_SET.has(tagName)) {
      continue;
    }

    if (VOID_TAG_SET.has(tagName)) {
      if (!isClose) out.push(`<${tagName}>`);
      continue;
    }

    if (!isClose) {
      out.push(`<${tagName}>`);
      openStack.push(tagName);
      continue;
    }

    // 닫는 태그 — 열린 스택에 있는 경우만 (중간 태그 자동 닫힘 포함) 출력
    const openIndex = openStack.lastIndexOf(tagName);
    if (openIndex === -1) continue;
    for (let depth = openStack.length - 1; depth >= openIndex; depth -= 1) {
      out.push(`</${openStack[depth]}>`);
    }
    openStack.length = openIndex;
  }

  // 안 닫힌 태그 마감
  for (let depth = openStack.length - 1; depth >= 0; depth -= 1) {
    out.push(`</${openStack[depth]}>`);
  }

  return out.join('');
}

/**
 * 저장값 새니타이즈 — HTML 이면 새니타이즈, plain text 는 그대로 보존
 * (레거시 Textarea 특약 하위호환: 손대지 않은 plain 값을 HTML 로 강제 변환하지 않는다).
 */
export function sanitizeContractRichTextValue(value: string): string;
export function sanitizeContractRichTextValue(
  value: string | null | undefined,
): string | null | undefined;
export function sanitizeContractRichTextValue(
  value: string | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (!isContractRichTextHtml(value)) return value;
  return sanitizeContractRichText(value);
}

/** plain text 특약 → 문단 HTML (줄 단위 `<p>`) */
export function contractPlainTextToRichText(text: string): string {
  const normalized = String(text).replace(/\r\n?/g, '\n');
  if (!normalized.trim()) return '';
  return normalized
    .split('\n')
    .map((line) => (line.trim() ? `<p>${escapeContractHtmlText(line)}</p>` : '<p></p>'))
    .join('');
}

/**
 * 에디터/HTML 렌더에 안전하게 넣을 수 있는 형태로 정규화.
 * HTML 이면 새니타이즈, plain text 면 문단 HTML 로 변환한다.
 */
export function ensureContractRichTextHtml(value: string | null | undefined): string {
  if (!value) return '';
  if (isContractRichTextHtml(value)) return sanitizeContractRichText(value);
  return contractPlainTextToRichText(value);
}

/**
 * rich text HTML → plain text (특약 템플릿 등록·목록 미리보기·검색용).
 * 블록 경계(`</p>`, `</li>`, `<br>`)는 줄바꿈으로 유지한다.
 */
export function contractRichTextToPlainText(value: string | null | undefined): string {
  if (!value) return '';
  if (!isContractRichTextHtml(value)) return value;

  const sanitized = sanitizeContractRichText(value);
  const text = sanitized
    .replace(/<br>/gi, '\n')
    .replace(/<\/(?:p|li|ul|ol)>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&');

  return text
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

/**
 * 특약 HTML 두 조각 병합 (특약 가져오기 삽입용).
 * 어느 한쪽이라도 값이 있으면 HTML 로 정규화해 이어붙인다.
 */
export function appendContractRichText(
  current: string | null | undefined,
  addition: string | null | undefined,
): string {
  const currentHtml = ensureContractRichTextHtml(current);
  const additionHtml = ensureContractRichTextHtml(addition);
  if (!currentHtml) return additionHtml;
  if (!additionHtml) return currentHtml;
  return `${currentHtml}${additionHtml}`;
}
