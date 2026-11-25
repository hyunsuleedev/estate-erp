/**
 * 화면 빌드에 끼우는 자동 번역 플러그인. 하는 일은 core.mjs에 있다.
 * React 플러그인보다 먼저 돈다(enforce: 'pre') — 원래 소스(TSX)를 보고 바꿔야 한다.
 */
import { scopeOf, transform } from './core.mjs';

export function autoI18n() {
  return {
    name: 'estate-auto-i18n',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('/node_modules/')) return null;
      const where = scopeOf(id);
      if (!where) return null;
      const out = transform(code, { fileName: id.replace(/\?.*$/, ''), scope: where.scope, area: where.area });
      // 줄 번호가 그대로라 소스맵을 따로 만들지 않는다(열만 달라진다).
      return out ? { code: out, map: null } : null;
    },
  };
}
