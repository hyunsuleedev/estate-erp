/**
 * 화면 문구 자동 번역의 핵심 — 소스에서 한글 문구를 찾아 번역 함수 호출로 바꾼다.
 *
 * 왜 이렇게 하나
 *   화면 코드에는 한글 문구가 1만 줄 넘게 직접 적혀 있다. 이를 하나하나 번역 키로 바꾸면 화면 파일 300여 개를
 *   고쳐야 하고, 그 뒤로 새로 적는 문구마다 키를 만들어야 한다. 그 대신 소스는 한글 그대로 두고, 빌드할 때
 *   한글 문구를 `__t("한글")` 호출로 바꾼다. 실행할 때 `__t`는 한국어면 받은 글을 그대로 돌려주고(동작이 바뀌지
 *   않는다), 영어면 사전(src/renderer/i18n/en/*.json)에서 찾아 돌려준다. 사전에 없는 문구는 한글로 나온다.
 *
 * 바꾸는 것
 *   - JSX 안의 글자:               <b>저장</b>            → <b>{__t("저장")}</b>
 *   - JSX 속성의 문자열:           placeholder="이름"     → placeholder={__t("이름")}
 *   - 문자열:                      '저장했습니다'         → __t("저장했습니다")
 *   - 값이 끼는 문자열:            `${n}건 선택`          → __t("{0}건 선택", [n])   (영어에서 순서를 바꿀 수 있다)
 *   - 날짜·숫자 로캘:              'ko-KR'                → __locale()
 *
 *   - 같은지 견주기:               label === '전체'       → __same(label, "전체")
 *     견주는 상대가 번역된 이름표일 수도, 서버가 준 한글 값일 수도 있다. `__same`은 한글 그대로와도,
 *     그 한글의 영어 번역과도 같다고 본다. 그래서 어느 쪽이든 조건이 한국어일 때와 같게 나온다.
 *
 * 문맥 표시
 *   같은 한글이 한 파일 안에서 두 가지 뜻으로 쓰이면(대화창 단추 "확인"과 매물 "확인") 사전이 둘을 가릴 수 없다.
 *   그 줄 끝이나 바로 윗줄에 `// i18n: dialog`를 달면(JSX 안에서는 중괄호로 싼 블록 주석으로 같은 글을 적는다) 사전에서
 *   `"확인 ⟦dialog⟧"`를 먼저 찾고, 없으면 `"확인"`을 찾는다. 한국어 화면에는 영향이 없다.
 *
 * 바꾸지 않는 것 (화면에 보이는 글이 아니라 값을 가리는 데 쓰는 글)
 *   - 문자열 검사(includes, startsWith, split, replace …)의 인자, case, Map·Set의 키, 객체의 키
 *     — 이런 검사는 대개 서버가 준 글이나 사용자가 친 글에 한다. 번역된 글에 하는 곳은 드물고, 그런 곳은 손으로 고친다.
 *   - 글자 수·자리를 세는 글: `'만원'.length`, `'가나다'[0]` (번역하면 수가 달라진다)
 *   - `key`, `id`, `keywords`처럼 값으로 쓰는 속성
 *   - 타입, import 경로, 정규식, 태그 달린 템플릿, console
 *   - `i18n-ignore` 주석이 붙은 줄과 `i18n-ignore-file` 주석이 있는 파일
 *
 * 줄 번호는 바뀌지 않는다(여러 줄짜리를 한 줄로 바꾸면 줄 수만큼 빈 줄을 넣는다). 열만 달라진다.
 *
 * 이 파일은 Vite 플러그인(vite-plugin.mjs), 문구 목록 뽑기(extract.mjs), 테스트가 함께 쓴다.
 */
import ts from 'typescript';

export const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

/** 화면에 보이는 글이 아닌 JSX 속성 */
const SKIP_ATTRS = new Set([
  'key', 'id', 'className', 'class', 'style', 'htmlFor', 'name', 'type', 'href', 'to', 'src', 'role',
  'value', 'defaultValue', 'testId', 'accept', 'pattern', 'inputMode', 'autoComplete', 'viewBox', 'd',
]);
/**
 * 값으로 쓰는 객체 속성. 이 코드에서 값을 가리는 글은 영어 코드라(enum), 한글이 든 속성 값은 거의 모두 화면에 보이는 글이다
 * (`{ label: '면적', value: '30평' }`의 value처럼). 그래서 여기에는 확실히 값인 것만 둔다.
 */
const SKIP_PROPS = new Set(['key', 'id', 'accessorKey', 'keywords', 'className', 'path', 'to', 'href', 'testId', 'dataKey', 'queryKey', 'mutationKey', 'storageKey']);
/** 글자를 견주거나 가르는 메서드: 그 인자는 번역하지 않는다 */
const LOGIC_METHODS = new Set([
  'includes', 'startsWith', 'endsWith', 'split', 'replace', 'replaceAll', 'indexOf', 'lastIndexOf', 'match',
  'matchAll', 'test', 'search', 'localeCompare', 'has', 'get', 'delete', 'getItem', 'setItem', 'removeItem',
  'querySelector', 'querySelectorAll', 'getElementById', 'closest', 'matches', 'getAttribute', 'setAttribute',
]);
/**
 * 글자 수나 자리를 세는 멤버. 한글 글자열에 곧바로 이것을 하면(`'만원'.length`) 그 글은 화면에 보이는 글이 아니라
 * 계산에 쓰는 글이다 — 번역하면 수가 달라져 잘라 낸 결과가 틀린다. `.trim()`처럼 글을 그대로 돌려주는 것은 넣지 않는다.
 */
const MEASURE_MEMBERS = new Set([
  'length', 'charAt', 'charCodeAt', 'codePointAt', 'at', 'indexOf', 'lastIndexOf', 'search', 'includes', 'startsWith',
  'endsWith', 'localeCompare', 'match', 'matchAll',
]);
const COMPARE_OPS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);
const ENTITIES = {
  nbsp: '\u00a0', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", middot: '·', hellip: '…', ndash: '–', mdash: '—',
  rarr: '→', larr: '←', times: '×', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•',
};

/** JSX 글자·속성에 든 HTML 엔티티를 푼다. 모르는 이름이 있으면 null(그 문구는 건드리지 않는다). */
function decodeEntities(text) {
  if (!text.includes('&')) return text;
  let unknown = false;
  const out = text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (name in ENTITIES) return ENTITIES[name];
    unknown = true;
    return whole;
  });
  return unknown ? null : out;
}

/** JSX가 글자를 다루는 규칙 그대로: 줄마다 앞뒤 공백을 떼고 빈 줄을 버린 뒤 한 칸으로 잇는다. */
function normalizeJsxText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  const kept = [];
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i].replace(/\t/g, ' ');
    if (i > 0) line = line.replace(/^ +/, '');
    if (i < lines.length - 1) line = line.replace(/ +$/, '');
    if (line) kept.push(line);
  }
  return kept.join(' ');
}

const newlines = (text) => '\n'.repeat((text.match(/\n/g) ?? []).length);
const quote = (text) => JSON.stringify(text).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** 이 노드가 타입 자리 안에 있는가 */
function inTypePosition(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isTypeNode(current) || ts.isTypeAliasDeclaration(current) || ts.isInterfaceDeclaration(current)) return true;
    if (ts.isStatement(current) || ts.isJsxElement(current)) return false;
  }
  return false;
}

/** 번역하지 않는 까닭. 번역해도 되면 null. */
function excludedReason(node) {
  const parent = node.parent;
  if (!parent) return null;
  if (inTypePosition(node)) return 'type';
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return 'module';
  if (ts.isEnumMember(parent)) return 'enum';
  if (ts.isTaggedTemplateExpression(parent)) return 'tagged';
  if (ts.isCaseClause(parent)) return 'case';
  // '만원'.length · ('만원')[0]: 글자 수·자리를 세는 글 (괄호·as·!는 벗겨서 본다)
  {
    let inner = node;
    let holder = parent;
    while (holder && (ts.isParenthesizedExpression(holder) || ts.isAsExpression(holder) || ts.isNonNullExpression(holder) || ts.isSatisfiesExpression(holder))) {
      inner = holder;
      holder = holder.parent;
    }
    if (holder && ts.isPropertyAccessExpression(holder) && holder.expression === inner && MEASURE_MEMBERS.has(holder.name.text)) return `measure:${holder.name.text}`;
    if (holder && ts.isElementAccessExpression(holder) && holder.expression === inner) return 'measure:index';
  }
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return 'key';
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) return 'key';
  if (ts.isComputedPropertyName(parent)) return 'key';
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    const name = ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name) ? parent.name.text : '';
    if (SKIP_PROPS.has(name)) return `prop:${name}`;
  }
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
    const callee = parent.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      const method = callee.name.text;
      if (ts.isIdentifier(callee.expression) && callee.expression.text === 'console') return 'console';
      if (LOGIC_METHODS.has(method)) return `method:${method}`;
      // Map.set('키', 값): 첫 인자는 키다
      if (method === 'set' && parent.arguments?.[0] === node) return 'method:set';
    }
    if (ts.isIdentifier(callee) && callee.text === 'RegExp') return 'regexp';
  }
  // ['매매', '전세'].includes(x) · new Set(['매매', '전세']): 견주는 데 쓰는 목록
  if (ts.isArrayLiteralExpression(parent)) {
    const holder = parent.parent;
    if (holder && ts.isPropertyAccessExpression(holder) && holder.expression === parent && LOGIC_METHODS.has(holder.name.text)) return 'logic-list';
    if (holder && ts.isNewExpression(holder) && ts.isIdentifier(holder.expression) && holder.expression.text === 'Set') return 'logic-list';
  }
  return null;
}

/**
 * 소스에서 한글 문구가 있는 자리를 모두 찾는다.
 * @returns {{ ignoredFile: boolean, sites: Array<{ kind: string, text: string, line: number, excluded: string | null, edits: Array<{ start: number, end: number, text: string }> }>, locales: Array<{ start: number, end: number }> }}
 */
export function analyze(code, fileName = 'file.tsx') {
  const result = { ignoredFile: false, sites: [], locales: [] };
  if (code.includes('i18n-ignore-file')) {
    result.ignoredFile = true;
    return result;
  }
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineStarts = source.getLineStarts();
  const lines = code.split('\n');
  const lineOf = (pos) => source.getLineAndCharacterOfPosition(pos).line;
  /** 그 줄이나 바로 윗줄에 i18n-ignore 주석이 있는가 */
  const lineIgnored = (pos) => {
    const line = lineOf(pos);
    return (lines[line] ?? '').includes('i18n-ignore') || (line > 0 && /^\s*(\/\/|\/\*|\{\/\*).*i18n-ignore/.test(lines[line - 1] ?? ''));
  };
  void lineStarts;
  /** 문구가 실제로 시작하는 자리. JSX 글자는 앞의 줄바꿈·들여쓰기를 뺀다. */
  const startOf = (node) => {
    if (!ts.isJsxText(node)) return node.getStart(source);
    const raw = node.getFullText(source);
    return node.getFullStart() + (raw.length - raw.trimStart().length);
  };
  /** 그 줄이나 바로 윗줄 주석에 적힌 문맥: `// i18n: dialog` → "dialog" */
  const contextOf = (node) => {
    const line = lineOf(startOf(node));
    const pattern = /i18n:\s*([\w-]+)/;
    const here = pattern.exec(lines[line] ?? '');
    if (here) return here[1];
    const above = line > 0 ? (lines[line - 1] ?? '') : '';
    return /^\s*(\/\/|\/\*|\{\/\*)/.test(above) ? (pattern.exec(above)?.[1] ?? null) : null;
  };
  /** `__t(` 뒤에 붙일 문맥 인자 */
  const contextArg = (context, hasArgs) => (context ? `${hasArgs ? '' : ', undefined'}, ${quote(context)}` : '');

  const push = (kind, text, node, excluded, edits, context = null) => {
    result.sites.push({
      kind,
      // 사전의 열쇠. 문맥이 있으면 "확인 ⟦dialog⟧" 꼴이다.
      text: context ? `${text} ⟦${context}⟧` : text,
      line: lineOf(startOf(node)) + 1,
      excluded: excluded ?? (lineIgnored(startOf(node)) ? 'ignore-comment' : null),
      edits,
    });
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const raw = node.getFullText(source);
      const normalized = normalizeJsxText(raw);
      if (HANGUL.test(normalized)) {
        const decoded = decodeEntities(normalized);
        const core = (decoded ?? normalized).trim();
        const lead = /^\s/.test(normalized) ? ' ' : '';
        const trail = /\s$/.test(normalized) ? ' ' : '';
        const context = contextOf(node);
        const call = `__t(${quote(core)}${contextArg(context, false)})`;
        const expr = lead || trail ? `${lead ? '" " + ' : ''}${call}${trail ? ' + " "' : ''}` : call;
        push('jsx-text', core, node, decoded === null ? 'entity' : null, [
          { start: node.getFullStart(), end: node.getEnd(), text: `{${expr}}${newlines(raw)}` },
        ], context);
      }
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text;
      const parent = node.parent;
      if (text === 'ko-KR' && !inTypePosition(node) && !ts.isJsxAttribute(parent)) {
        result.locales.push({ start: node.getStart(source), end: node.getEnd() });
        return;
      }
      if (!HANGUL.test(text)) return;
      const raw = node.getText(source);
      // 같은지 견주기: 상대 쪽 식은 그대로 두고 둘레만 __same(…)으로 감싼다
      if (ts.isBinaryExpression(parent) && COMPARE_OPS.has(parent.operatorToken.kind) && !inTypePosition(node)) {
        const other = parent.left === node ? parent.right : parent.left;
        const literalFirst = parent.left === node;
        const negate = parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken || parent.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken;
        const open = `${negate ? '!' : ''}__same(`;
        const edits = literalFirst
          ? [
              { start: node.getStart(source), end: other.getStart(source), text: `${open}${quote(text)}, ${newlines(code.slice(node.getStart(source), other.getStart(source)))}` },
              { start: other.getEnd(), end: other.getEnd(), text: ')' },
            ]
          : [
              { start: other.getStart(source), end: other.getStart(source), text: open },
              { start: other.getEnd(), end: node.getEnd(), text: `, ${quote(text)})${newlines(code.slice(other.getEnd(), node.getEnd()))}` },
            ];
        // 양쪽이 모두 한글 글자열이면(거의 없다) 건드리지 않는다
        const bothLiteral = ts.isStringLiteral(other) || ts.isNoSubstitutionTemplateLiteral(other);
        push('compare', text, node, bothLiteral ? 'compare-literals' : null, edits);
        return;
      }
      if (ts.isJsxAttribute(parent)) {
        const name = parent.name.getText(source);
        const decoded = decodeEntities(text);
        const skip = SKIP_ATTRS.has(name) || name.startsWith('data-') ? `attr:${name}` : decoded === null ? 'entity' : null;
        const attrContext = contextOf(node);
        push('jsx-attr', decoded ?? text, node, skip, [
          { start: node.getStart(source), end: node.getEnd(), text: `{__t(${quote(decoded ?? text)}${contextArg(attrContext, false)})}` },
        ], attrContext);
        return;
      }
      const context = contextOf(node);
      push('string', text, node, excludedReason(node), [
        { start: node.getStart(source), end: node.getEnd(), text: `__t(${quote(text)}${contextArg(context, false)})${newlines(raw)}` },
      ], context);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
      if (parts.some((part) => HANGUL.test(part))) {
        const key = parts.map((part, index) => (index < parts.length - 1 ? `${part}{${index}}` : part)).join('');
        // 원래 글에 {0} 같은 모양이 있으면 끼워 넣는 자리와 구분할 수 없다
        const clash = parts.some((part) => /\{\d+\}/.test(part));
        const context = contextOf(node);
        const edits = [];
        const headRaw = code.slice(node.head.getStart(source), node.head.getEnd());
        edits.push({ start: node.head.getStart(source), end: node.head.getEnd(), text: `__t(${quote(key)}, [${newlines(headRaw)}` });
        node.templateSpans.forEach((span, index) => {
          const literalRaw = code.slice(span.literal.getStart(source), span.literal.getEnd());
          const last = index === node.templateSpans.length - 1;
          edits.push({ start: span.literal.getStart(source), end: span.literal.getEnd(), text: `${newlines(literalRaw)}${last ? `]${contextArg(context, true)})` : ', '}` });
        });
        push('template', key, node, clash ? 'placeholder-clash' : excludedReason(node), edits, context);
      }
      // 끼워 넣은 값 안에도 문구가 있을 수 있다
      node.templateSpans.forEach((span) => visit(span.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

/**
 * 한글 문구를 번역 함수 호출로 바꾼 코드를 돌려준다. 바꿀 것이 없으면 null.
 * @param {string} code
 * @param {{ fileName?: string, scope: string, area: string, runtime?: string }} options
 */
export function transform(code, { fileName = 'file.tsx', scope, area, runtime = '@/i18n/auto' }) {
  if (!HANGUL.test(code) && !code.includes('ko-KR')) return null;
  const { ignoredFile, sites, locales } = analyze(code, fileName);
  if (ignoredFile) return null;
  const edits = [];
  for (const site of sites) if (!site.excluded) edits.push(...site.edits);
  for (const locale of locales) edits.push({ start: locale.start, end: locale.end, text: '__locale()' });
  if (!edits.length) return null;
  // 뒤에서부터 바꾼다. 같은 자리에서 시작하면 바꾸기를 먼저, 끼워 넣기(길이 0)를 나중에 해서 끼운 글이 앞에 오게 한다.
  edits.sort((a, b) => b.start - a.start || (b.end - b.start) - (a.end - a.start));
  let out = code;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  // 첫 줄 앞에 붙인다(줄을 늘리지 않는다). import는 어디에 있든 맨 먼저 실행된다.
  const header = `import { __i18n as __i18n$, __locale, __same } from ${JSON.stringify(runtime)}; const __t = __i18n$(${JSON.stringify(scope)}, ${JSON.stringify(area)}); `;
  return header + out;
}

/**
 * 파일 경로 → 사전에서 쓰는 자리 이름(scope)과 영역(area).
 * scope는 그 파일만의 번역을 따로 둘 때 쓰고, area는 사전 파일 하나에 해당한다.
 * @returns {{ scope: string, area: string } | null} 번역 대상이 아니면 null
 */
export function scopeOf(absolutePath) {
  const file = absolutePath.replace(/\\/g, '/').replace(/\?.*$/, '');
  if (!/\.(tsx?|mts)$/.test(file) || /\.d\.ts$|\.test\.|\.spec\.|routeTree\.gen/.test(file)) return null;
  let match = file.match(/\/apps\/desktop\/src\/renderer\/(.+)$/);
  if (match) {
    const rel = match[1];
    if (rel.startsWith('i18n/')) return null;
    return { scope: rel, area: areaOf(rel) };
  }
  match = file.match(/\/packages\/(shared|api-client)\/src\/(.+)$/);
  if (match) return { scope: `@${match[1]}/${match[2]}`, area: 'shared' };
  match = file.match(/\/apps\/desktop\/src\/(common|main)\/(.+)$/);
  if (match) return { scope: `@${match[1]}/${match[2]}`, area: 'main' };
  return null;
}

/** 화면 폴더 안의 경로 → 영역 이름 */
export function areaOf(rel) {
  let match = rel.match(/^routes\/_authenticated\/([^/]+)\//);
  if (match) return match[1];
  match = rel.match(/^routes\/_authenticated\/-?([a-z]+)/);
  if (match) return match[1] === 'dashboard' ? 'dashboard' : 'app';
  match = rel.match(/^components\/([^/]+)\//);
  if (match) return `c-${match[1]}`;
  match = rel.match(/^features\/([^/]+)\//);
  if (match) return `f-${match[1]}`;
  return 'app';
}
