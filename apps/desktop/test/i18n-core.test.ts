import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// @ts-expect-error 빌드 도구(.mjs)라 타입 선언이 없다
import { analyze, areaOf, scopeOf, transform } from '../scripts/i18n/core.mjs';

const run = (code: string): string => transform(code, { fileName: 'x.tsx', scope: 'routes/x.tsx', area: 'x' }) ?? code;
/** 머리에 붙는 import 한 줄을 뗀 본문 */
const body = (code: string): string => run(code).replace(/^import \{[^}]+\} from "@\/i18n\/auto"; const __t = __i18n\$\("routes\/x\.tsx", "x"\); /, '');

describe('auto i18n transform', () => {
  it('wraps visible Korean text: JSX text, JSX attributes, strings, templates', () => {
    assert.equal(body('const a = <b>저장</b>;'), 'const a = <b>{__t("저장")}</b>;');
    assert.equal(body('const a = <input placeholder="이름" />;'), 'const a = <input placeholder={__t("이름")} />;');
    assert.equal(body("toast.success('저장했습니다');"), 'toast.success(__t("저장했습니다"));');
    assert.equal(body('const a = `${n}건 선택`;'), 'const a = __t("{0}건 선택", [n]);');
    assert.equal(body('const a = `${a}평 (${b}㎡)`;'), 'const a = __t("{0}평 ({1}㎡)", [a, b]);');
    // 끼워 넣은 값 안의 문구도 따로 바꾼다
    assert.equal(body("const a = `${ok ? '완료' : '대기'} 상태`;"), 'const a = __t("{0} 상태", [ok ? __t("완료") : __t("대기")]);');
  });

  it('keeps the spaces JSX would keep around a fragment', () => {
    assert.equal(body('const a = <p>오늘 일정은 <b>{n}</b>건입니다.</p>;'), 'const a = <p>{__t("오늘 일정은") + " "}<b>{n}</b>{__t("건입니다.")}</p>;');
  });

  it('never changes the number of lines', () => {
    const code = ['const a = (', '  <p>', '    여러 줄', '    문구', '  </p>', ');', 'const b = `첫 줄 ${x}', '둘째 줄`;'].join('\n');
    const out = run(code);
    assert.equal(out.split('\n').length, code.split('\n').length);
    assert.match(out, /\{__t\("여러 줄 문구"\)\}/);
    assert.match(out, /__t\("첫 줄 \{0\}\\n둘째 줄", \[\s*x\s*\]\)/);
  });

  it('leaves text that is compared or used as a value in Korean', () => {
    for (const code of [
      "switch (kind) { case '전세': break; }",
      "const ok = text.includes('억');",
      "const ok = ['매매', '전세'].includes(kind);",
      "const set = new Set(['매매', '전세']);",
      "const item = { keywords: '검색 낱말' };",
      "const x = labels['매매'];",
      "const map = { '매매': 1 };",
      "type Kind = '매매' | '전세';",
      "const re = new RegExp('만원');",
      "console.log('확인');",
      'const a = <Tab value="전체" />;',
      "const a = '저장'; // i18n-ignore",
      // 글자 수·자리를 세는 글: 번역하면 수가 달라져 잘라 낸 결과가 틀린다
      "const rest = suffix.slice('만원'.length);",
      "const first = ('가나다')[0];",
      "const at = '가나다'.indexOf(ch);",
      'const n = `${a}원`.length;',
    ]) {
      assert.equal(run(code), code, code);
    }
  });

  it('still translates a string whose method returns the text itself', () => {
    assert.equal(body('const a = `기간 ${from}`.trim();'), 'const a = __t("기간 {0}", [from]).trim();');
  });

  it('keeps a length taken from Korean text the same in English (contract amount suffix)', () => {
    // contracts/-clause-primitives.tsx의 unitAwareSuffix와 같은 모양
    const code = "function f(suffix) { return suffix.startsWith('만원') ? `천원${suffix.slice('만원'.length)}` : suffix; }";
    // 영어 사전을 흉내 낸 번역 함수: "만원"이 "₩10K"(4글자)로 바뀌어도 잘라 내는 자리는 한글 2글자여야 한다
    const translate = (text: string, args: unknown[] = []) =>
      (text === '만원' ? '₩10K' : text === '천원{0}' ? '₩1K{0}' : text).replace(/\{(\d+)\}/g, (_, index: string) => String(args[Number(index)]));
    const english = new Function('__t', `${body(code)}; return f;`)(translate) as (suffix: string) => string;
    assert.equal(english('만원정은'), '₩1K정은');
  });

  it('turns equality checks into __same so they hold for both the Korean value and its translation', () => {
    assert.equal(body("if (kind === '매매') go();"), 'if (__same(kind, "매매")) go();');
    assert.equal(body("if (kind !== '매매') go();"), 'if (!__same(kind, "매매")) go();');
    assert.equal(body("const a = '전체' === label;"), 'const a = __same("전체", label);');
    assert.equal(body("const a = x || unit === '만원' ? 1 : 2;"), 'const a = x || __same(unit, "만원") ? 1 : 2;');
    // 견주는 상대 안에 든 문구도 따로 바꾼다
    assert.equal(body("const a = (ok ? '완료' : other) === '완료';"), 'const a = __same((ok ? __t("완료") : other), "완료");');
    assert.equal(body("const a = `${n}건` === '0건';"), 'const a = __same(__t("{0}건", [n]), "0건");');
  });

  it('passes the context written next to a string, so one file can translate the same word two ways', () => {
    assert.equal(body("const a = '확인'; // i18n: dialog"), 'const a = __t("확인", undefined, "dialog"); // i18n: dialog');
    assert.equal(body("// i18n: ad\nconst a = { label: '종료' };"), '// i18n: ad\nconst a = { label: __t("종료", undefined, "ad") };');
    assert.equal(body('const a = `${n}건 종료`; // i18n: ad'), 'const a = __t("{0}건 종료", [n], "ad"); // i18n: ad');
    assert.equal(
      body('const a = (\n  <b>\n    {/* i18n: dialog */}\n    확인\n  </b>\n);'),
      'const a = (\n  <b>\n    {/* i18n: dialog */}{__t("확인", undefined, "dialog")}\n\n</b>\n);',
    );
    const { sites } = analyze("const a = '확인'; // i18n: dialog\n", 'x.ts');
    assert.equal(sites[0].text, '확인 ⟦dialog⟧');
  });

  it('skips a file marked i18n-ignore-file and files without Korean', () => {
    assert.equal(transform("/* i18n-ignore-file */ const a = '저장';", { scope: 's', area: 'a' }), null);
    assert.equal(transform("const a = 'save';", { scope: 's', area: 'a' }), null);
  });

  it('switches the date and number locale', () => {
    assert.equal(body("date.toLocaleDateString('ko-KR', { month: 'long' });"), "date.toLocaleDateString(__locale(), { month: 'long' });");
  });

  it('decodes the entities JSX would decode, and leaves unknown ones alone', () => {
    assert.equal(body('const a = <p>이름&nbsp;없음</p>;'), 'const a = <p>{__t("이름\\u00a0없음")}</p>;'.replace('\\u00a0', ' '));
    assert.equal(run('const a = <p>이름&unknownentity;없음</p>;'), 'const a = <p>이름&unknownentity;없음</p>;');
  });

  it('reports where each string is, with the reason when it is left alone', () => {
    const { sites } = analyze("const a = '저장';\nif (b.includes('억')) {}\n", 'x.ts');
    assert.deepEqual(
      sites.map((site: { text: string; line: number; excluded: string | null }) => [site.text, site.line, site.excluded]),
      [
        ['저장', 1, null],
        ['억', 2, 'method:includes'],
      ],
    );
  });

  it('maps a file to its dictionary area', () => {
    assert.equal(areaOf('routes/_authenticated/properties/-list.tsx'), 'properties');
    assert.equal(areaOf('routes/_authenticated/-dashboard-scene.tsx'), 'dashboard');
    assert.equal(areaOf('routes/_authenticated/dashboard.tsx'), 'dashboard');
    assert.equal(areaOf('components/layout/app-sidebar.tsx'), 'c-layout');
    assert.equal(areaOf('lib/format.ts'), 'app');
    assert.deepEqual(scopeOf('/repo/packages/shared/src/enums.ts'), { scope: '@shared/enums.ts', area: 'shared' });
    assert.equal(scopeOf('/repo/apps/desktop/src/renderer/i18n/auto.ts'), null);
    assert.equal(scopeOf('/repo/apps/desktop/src/renderer/routeTree.gen.ts'), null);
  });
});
