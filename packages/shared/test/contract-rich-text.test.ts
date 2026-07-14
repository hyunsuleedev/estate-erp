import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  appendContractRichText,
  contractPlainTextToRichText,
  contractRichTextToPlainText,
  ensureContractRichTextHtml,
  escapeContractHtmlText,
  isContractRichTextHtml,
  sanitizeContractRichText,
  sanitizeContractRichTextValue,
} from '../src/contract-rich-text.js';
import { getContractDocumentEngineSections } from '../src/contract-document-engine.js';
import type { ContractDocumentEngineFields } from '../src/contract-document-engine.js';

describe('sanitizeContractRichText — XSS 제거', () => {
  it('removes <script> tags including their content', () => {
    assert.equal(
      sanitizeContractRichText('<p>안전</p><script>alert(1)</script><p>유지</p>'),
      '<p>안전</p><p>유지</p>',
    );
  });

  it('removes <script> without closing tag (rest of input dropped)', () => {
    assert.equal(
      sanitizeContractRichText('<p>앞</p><script>alert(1)'),
      '<p>앞</p>',
    );
  });

  it('removes event handler attributes (onerror 등 — 속성 전체 제거)', () => {
    const result = sanitizeContractRichText(
      '<p onmouseover="steal()">특약</p><img src=x onerror="alert(1)">',
    );
    assert.equal(result, '<p>특약</p>');
    assert.ok(!/onerror/i.test(result));
    assert.ok(!/onmouseover/i.test(result));
  });

  it('removes javascript: links (a 태그 자체가 비허용 — 텍스트만 보존)', () => {
    const result = sanitizeContractRichText(
      '<p><a href="javascript:alert(1)">클릭</a></p>',
    );
    assert.equal(result, '<p>클릭</p>');
    assert.ok(!/javascript:/i.test(result));
  });

  it('removes iframe/object/embed/style with content', () => {
    assert.equal(
      sanitizeContractRichText(
        '<iframe src="https://evil"></iframe><object data="x">o</object>' +
          '<embed src="x"><style>p{display:none}</style><p>본문</p>',
      ),
      '<p>본문</p>',
    );
  });

  it('strips all attributes from allowed tags', () => {
    assert.equal(
      sanitizeContractRichText(
        '<p style="color:red" class="x" data-y="1">문단</p><span style="font-size:99px">텍스트</span>',
      ),
      '<p>문단</p><span>텍스트</span>',
    );
  });

  it('handles attribute values containing angle brackets safely', () => {
    // "<p title="</p><script>...">" 류 파서 차분 공격 — 속성 문자열을 통째로 스킵
    const result = sanitizeContractRichText(
      '<p title="</p><script>alert(1)</script>">내용</p>',
    );
    assert.ok(!/script/i.test(result));
    assert.ok(result.includes('내용'));
  });

  it('removes HTML comments (조건부 주석 포함)', () => {
    assert.equal(
      sanitizeContractRichText('<p>a</p><!--[if IE]><script>x()</script><![endif]--><p>b</p>'),
      '<p>a</p><p>b</p>',
    );
  });

  it('escapes stray < that is not a tag', () => {
    assert.equal(
      sanitizeContractRichText('<p>보증금 < 1억, 월세 <= 100</p>'),
      '<p>보증금 &lt; 1억, 월세 &lt;= 100</p>',
    );
  });

  it('preserves the allowed tag whitelist', () => {
    const html =
      '<p>특약 <strong>강조</strong> <em>기울임</em> <u>밑줄</u> <s>취소</s></p>' +
      '<ul><li>항목1</li><li>항목2</li></ul>' +
      '<ol><li>첫째</li></ol>' +
      '<p>줄<br>바꿈 <span>스팬</span></p>';
    assert.equal(sanitizeContractRichText(html), html);
  });

  it('drops unknown tags but keeps their text content', () => {
    assert.equal(
      sanitizeContractRichText('<div><h1>제목</h1><p>본문 <font color="red">빨강</font></p></div>'),
      '제목<p>본문 빨강</p>',
    );
  });

  it('balances unclosed tags', () => {
    assert.equal(
      sanitizeContractRichText('<p><strong>미종료'),
      '<p><strong>미종료</strong></p>',
    );
  });

  it('drops orphan closing tags', () => {
    assert.equal(sanitizeContractRichText('</p></strong><p>정상</p>'), '<p>정상</p>');
  });
});

describe('sanitizeContractRichTextValue — plain text 하위호환', () => {
  it('keeps legacy plain text untouched', () => {
    const legacy = '1. 현 시설물 상태의 계약임.\n2. 잔금일에 소유권 이전한다.';
    assert.equal(sanitizeContractRichTextValue(legacy), legacy);
  });

  it('sanitizes html values', () => {
    assert.equal(
      sanitizeContractRichTextValue('<p>특약</p><script>x()</script>'),
      '<p>특약</p>',
    );
  });

  it('passes through null/undefined', () => {
    assert.equal(sanitizeContractRichTextValue(null), null);
    assert.equal(sanitizeContractRichTextValue(undefined), undefined);
  });
});

describe('isContractRichTextHtml', () => {
  it('detects html', () => {
    assert.equal(isContractRichTextHtml('<p>특약</p>'), true);
    assert.equal(isContractRichTextHtml('앞텍스트<br>뒤텍스트'), true);
    assert.equal(isContractRichTextHtml('<strong>강조</strong>'), true);
  });

  it('treats legacy plain text as non-html', () => {
    assert.equal(isContractRichTextHtml('1. 현 시설물 상태의 계약임.'), false);
    assert.equal(isContractRichTextHtml('보증금 < 1억'), false);
    assert.equal(isContractRichTextHtml('<보증금> 조항 참고'), false);
    assert.equal(isContractRichTextHtml(''), false);
    assert.equal(isContractRichTextHtml(null), false);
    assert.equal(isContractRichTextHtml(undefined), false);
  });
});

describe('plain text ↔ rich text 변환', () => {
  it('converts plain text lines to paragraphs with escaping', () => {
    assert.equal(
      contractPlainTextToRichText('첫 줄\n둘째 줄 <급매>\n\n넷째 줄'),
      '<p>첫 줄</p><p>둘째 줄 &lt;급매&gt;</p><p></p><p>넷째 줄</p>',
    );
  });

  it('converts html back to plain text with line boundaries', () => {
    assert.equal(
      contractRichTextToPlainText('<p>첫 줄</p><p>둘째 <strong>강조</strong></p>'),
      '첫 줄\n둘째 강조',
    );
    assert.equal(
      contractRichTextToPlainText('<ul><li>항목1</li><li>항목2</li></ul>'),
      '- 항목1\n- 항목2',
    );
  });

  it('keeps plain text as-is in contractRichTextToPlainText', () => {
    assert.equal(contractRichTextToPlainText('그냥 텍스트'), '그냥 텍스트');
  });

  it('escapeContractHtmlText escapes special characters', () => {
    assert.equal(
      escapeContractHtmlText(`<a href="x">&'`),
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;',
    );
  });

  it('ensureContractRichTextHtml normalizes both shapes', () => {
    assert.equal(ensureContractRichTextHtml('plain 텍스트'), '<p>plain 텍스트</p>');
    assert.equal(
      ensureContractRichTextHtml('<p>이미 html</p><script>x()</script>'),
      '<p>이미 html</p>',
    );
    assert.equal(ensureContractRichTextHtml(''), '');
    assert.equal(ensureContractRichTextHtml(null), '');
  });
});

describe('appendContractRichText — 특약 템플릿 삽입', () => {
  it('appends a plain clause to existing html', () => {
    assert.equal(
      appendContractRichText('<p>기존 특약</p>', '추가 조항'),
      '<p>기존 특약</p><p>추가 조항</p>',
    );
  });

  it('converts legacy plain current value before appending', () => {
    assert.equal(
      appendContractRichText('기존 1\n기존 2', '추가'),
      '<p>기존 1</p><p>기존 2</p><p>추가</p>',
    );
  });

  it('handles empty current value', () => {
    assert.equal(appendContractRichText('', '조항'), '<p>조항</p>');
    assert.equal(appendContractRichText(undefined, '조항'), '<p>조항</p>');
  });

  it('sanitizes malicious additions', () => {
    assert.equal(
      appendContractRichText('<p>기존</p>', '<p>추가</p><script>x()</script>'),
      '<p>기존</p><p>추가</p>',
    );
  });
});

describe('engine sections — 특약 html 플래그', () => {
  function fields(specialTerms: string): ContractDocumentEngineFields {
    return { specialTerms } as unknown as ContractDocumentEngineFields;
  }

  it('marks the specialTerms row as html when the value is rich text', () => {
    const sections = getContractDocumentEngineSections(
      'contract',
      fields('<p>특약 <strong>HTML</strong></p>'),
    );
    const row = sections
      .flatMap((section) => section.rows)
      .find((candidate) => candidate.label === '특약사항');
    assert.equal(row?.html, true);
    // 엔진은 원문 유지 — 새니타이즈는 렌더러 책임
    assert.equal(row?.value, '<p>특약 <strong>HTML</strong></p>');
  });

  it('keeps legacy plain text rows as non-html', () => {
    const sections = getContractDocumentEngineSections(
      'contract',
      fields('1. 현 시설물 상태의 계약임.'),
    );
    const row = sections
      .flatMap((section) => section.rows)
      .find((candidate) => candidate.label === '특약사항');
    assert.equal(row?.html, undefined);
    assert.equal(row?.value, '1. 현 시설물 상태의 계약임.');
  });
});
