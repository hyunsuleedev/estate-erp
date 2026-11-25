/**
 * 자동 번역의 사전 찾기 — 사전을 받아 찾는 함수들을 만들어 준다(화면·저장값과 떨어져 있어 테스트할 수 있다).
 * 무엇을 하는지는 ./auto.ts의 설명을 본다.
 */
export interface AreaDictionary {
  strings?: Record<string, string>;
  files?: Record<string, Record<string, string>>;
  /** 서버 문구 사전(_server)에만 있다: 값이 낀 문구. "{0}은(는) 필수입니다" → "{0} is required" */
  patterns?: Record<string, string>;
}

/** context: 같은 한글이 한 파일에서 여러 뜻일 때 가려 주는 이름(빌드가 `// i18n: 이름` 주석에서 가져온다) */
export type Translate = (text: string, args?: readonly unknown[], context?: string) => string;

/** "{0}건 선택"의 자리에 값을 끼운다. 템플릿 문자열과 같은 방식으로 글자로 바꾼다. */
export function fill(text: string, args: readonly unknown[]): string {
  return text.replace(/\{(\d+)\}/g, (whole, index: string) => (Number(index) < args.length ? `${args[Number(index)]}` : whole));
}

export const passthrough: Translate = (text, args) => (args ? fill(text, args) : text);

export function createLookup(dictionaries: Record<string, AreaDictionary>, onMissing?: (area: string, text: string) => void) {
  const common = dictionaries._common?.strings ?? {};

  /** 그 파일에서 쓸 번역 함수. 찾는 순서: 그 파일만의 번역 → 그 영역의 번역 → 공통 번역 → 한글 그대로 */
  function translatorFor(scope: string, area: string): Translate {
    const dictionary = dictionaries[area];
    const own = dictionary?.files?.[scope];
    const strings = dictionary?.strings;
    const find = (key: string) => own?.[key] ?? strings?.[key] ?? common[key];
    return (text, args, context) => {
      // 문맥이 있으면 "확인 ⟦dialog⟧"를 먼저 찾고, 없으면 그냥 "확인"을 찾는다
      const found = (context ? find(`${text} ⟦${context}⟧`) : undefined) ?? find(text);
      if (found === undefined) onMissing?.(area, text);
      const out = found ?? text;
      return args ? fill(out, args) : out;
    };
  }

  /** 한글 문구 → 그 문구가 어느 자리에서든 옮겨질 수 있는 영어들. 처음 쓸 때 만든다. */
  let translationsOf: Map<string, Set<string>> | null = null;
  function buildTranslationsOf(): Map<string, Set<string>> {
    const index = new Map<string, Set<string>>();
    const add = (strings: Record<string, string> | undefined) => {
      if (!strings) return;
      for (const [korean, english] of Object.entries(strings)) {
        const set = index.get(korean) ?? new Set<string>();
        set.add(english);
        index.set(korean, set);
      }
    };
    for (const [area, dictionary] of Object.entries(dictionaries)) {
      if (area === '_server') continue;
      add(dictionary.strings);
      for (const strings of Object.values(dictionary.files ?? {})) add(strings);
    }
    return index;
  }

  /** 값이 그 한글 문구이거나, 그 문구의 (어느 영역의) 영어 번역인가 */
  function same(value: unknown, korean: string): boolean {
    if (value === korean) return true;
    if (typeof value !== 'string') return false;
    translationsOf ??= buildTranslationsOf();
    return translationsOf.get(korean)?.has(value) ?? false;
  }

  let serverPatterns: Array<{ match: RegExp; slots: number[]; english: string }> | null = null;
  function buildServerPatterns() {
    return Object.entries(dictionaries._server?.patterns ?? {}).map(([korean, english]) => {
      const slots = [...korean.matchAll(/\{(\d+)\}/g)].map((found) => Number(found[1]));
      const source = korean
        .split(/\{\d+\}/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('(.+?)');
      return { match: new RegExp(`^${source}$`, 's'), slots, english };
    });
  }

  /** 서버가 준 한글 오류 문구 → 영어. 값이 낀 문구는 값을 뽑아 영어 문장에 끼운다. 없으면 받은 그대로. */
  function serverMessage(message: string): string {
    const exact = dictionaries._server?.strings?.[message];
    if (exact !== undefined) return exact;
    serverPatterns ??= buildServerPatterns();
    for (const pattern of serverPatterns) {
      const found = pattern.match.exec(message);
      if (!found) continue;
      const args: string[] = [];
      pattern.slots.forEach((slot, index) => {
        args[slot] = found[index + 1];
      });
      return fill(pattern.english, args);
    }
    return message;
  }

  return { translatorFor, same, serverMessage };
}
