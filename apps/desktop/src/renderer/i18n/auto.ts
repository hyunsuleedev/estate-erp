/**
 * 자동 번역의 실행 쪽. 빌드할 때 화면 코드의 한글 문구가 `__t("한글")`로 바뀌고(scripts/i18n/core.mjs),
 * 여기의 `__i18n`이 그 `__t`를 만들어 준다.
 *
 * - 한국어: 받은 글을 그대로 돌려준다. 화면 동작이 바뀌지 않는다.
 * - 영어: 사전(./en/*.json)에서 찾는다. 찾는 순서는 그 파일만의 번역 → 그 영역의 번역 → 공통 번역.
 *   사전에 없으면 한글이 그대로 나온다(빠진 번역은 `pnpm --filter @estate-erp/desktop i18n:check`로 본다).
 *
 * 언어는 앱을 불러올 때 한 번 정한다. 화면 밖(모듈 맨 위)에 적힌 문구는 불러올 때 한 번만 읽히므로,
 * 언어를 바꾸면 화면을 다시 불러와야 한다(i18n/index.ts의 changeLocale).
 *
 * 사전 파일의 모양:
 *   { "strings": { "한글": "English" }, "files": { "<파일 자리>": { "한글": "그 파일에서만 쓰는 English" } } }
 * 값이 끼는 문구는 자리 표시를 쓴다: "{0}건 선택" → "{0} selected". 영어에서 순서를 바꿔도 된다.
 * 한글 그대로 두려는 문구는 같은 글을 번역으로 적는다("홍길동": "홍길동").
 */
import { createLookup, passthrough, type AreaDictionary, type Translate } from './auto-core';

export type AutoLocale = 'ko' | 'en';

export const LOCALE_STORAGE_KEY = 'estate-erp:locale';

function readLocale(): AutoLocale {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(LOCALE_STORAGE_KEY) === 'en' ? 'en' : 'ko';
  } catch {
    return 'ko';
  }
}

/** 지금 화면의 언어. 고르지 않았으면 한국어다(기기 언어를 따라가지 않는다). */
export const autoLocale: AutoLocale = readLocale();
export const isEnglish = autoLocale === 'en';

function loadDictionaries(): Record<string, AreaDictionary> {
  let modules: Record<string, AreaDictionary> = {};
  try {
    // Vite가 빌드할 때 사전 파일들로 바꿔 넣는다. 테스트(node)에서는 이 함수가 없어 빈 사전으로 둔다.
    modules = import.meta.glob<AreaDictionary>('./en/*.json', { eager: true, import: 'default' });
  } catch {
    return {};
  }
  const byArea: Record<string, AreaDictionary> = {};
  for (const [file, dictionary] of Object.entries(modules)) {
    byArea[file.replace(/^\.\/en\//, '').replace(/\.json$/, '')] = dictionary;
  }
  return byArea;
}

/** 개발 중 확인용: 영어 화면에서 사전에 없어 한글로 나온 문구 (콘솔에서 __i18nMissing) */
const missing = new Set<string>();
if (isEnglish && typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as unknown as { __i18nMissing?: Set<string> }).__i18nMissing = missing;
}

const lookup = isEnglish ? createLookup(loadDictionaries(), (area, text) => missing.add(`${area}\t${text}`)) : null;

export type { Translate };

/** 그 파일에서 쓸 번역 함수를 만든다. scope는 파일 자리, area는 사전 파일 이름이다. */
export function __i18n(scope: string, area: string): Translate {
  return lookup ? lookup.translatorFor(scope, area) : passthrough;
}

/**
 * 값이 그 한글 문구와 같은가. 빌드가 `label === '전체'`를 `__same(label, "전체")`로 바꾼다.
 * 견주는 값이 번역된 이름표일 수도, 서버가 준 한글일 수도 있어서 한글 그대로와도, 그 한글의 영어 번역과도 같다고 본다.
 * (그 한글이 영역마다 다르게 번역돼 있어도 된다 — 어느 번역이든 같다고 본다.)
 */
export function __same(value: unknown, korean: string): boolean {
  return lookup ? lookup.same(value, korean) : value === korean;
}

/**
 * 서버가 오류로 돌려준 한글 문구를 영어 화면에서 영어로 바꾼다(lib/api-error.ts가 부른다).
 * 사전에 없으면 받은 한글을 그대로 돌려준다.
 */
export function translateServerMessage(message: string): string {
  return lookup ? lookup.serverMessage(message) : message;
}

/** 날짜·숫자를 적을 때 쓰는 로캘 */
export function __locale(): string {
  return isEnglish ? 'en-US' : 'ko-KR';
}
