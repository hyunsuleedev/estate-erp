import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildContractDocumentEngineDraft } from '../src/contract-document-engine.js';

const base = {
  id: 'c',
  transactionType: 'sale',
  totalPrice: 156000,
  contractDate: '2026-11-25',
  sellerContact: { id: 's', name: '김집주', phone: '01055501001' },
  buyerContact: { id: 'b', name: '박손님', phones: [{ phone: '0244446666', isPrimary: true }] },
  office: { name: '테스트 공인중개사사무소' },
};
const template = { id: 't', title: '아파트 매매 계약서', code: 'apt_sale' };
const parties = [
  { side: 'one', role: 'seller', name: '김집주', mobilePhone: '01055501001' },
  { side: 'two', role: 'buyer', name: '박손님', phone: '0244446666' },
  { side: 'office', role: null, name: '대표', officeName: '테스트', phone: '0212345678' },
];

function draft(extra: Record<string, unknown>) {
  // 엔진의 입력 타입은 서버 응답 전체를 받는다 — 여기서는 호칭 · 전화 표기에 필요한 칸만 준다
  return buildContractDocumentEngineDraft({
    contract: { ...base, ...extra } as never,
    template: template as never,
    baseDate: new Date('2026-11-25T00:00:00+09:00'),
  }) as unknown as { fields?: Record<string, string>; engineFields?: Record<string, string> } & Record<string, unknown>;
}

describe('contract party titles and phones as printed', () => {
  it('prints 매도인 / 매수인 instead of the role codes, and hyphenated phones', () => {
    const d = draft({ parties });
    const text = JSON.stringify(d);
    assert.ok(!/"seller"|"buyer"|seller |buyer /.test(text.replace(/sellerContact|buyerContact/g, '')), 'role codes must not be printed');
    assert.match(text, /매도인/);
    assert.match(text, /매수인/);
    assert.match(text, /010-5550-1001/);
    assert.match(text, /02-4444-6666/);
    assert.ok(!text.includes('01055501001'), 'raw digits must not be printed');
  });

  it('fixes the values an older saved document carries when it is opened', () => {
    const d = buildContractDocumentEngineDraft({
      contract: { ...base, parties } as never,
      template: template as never,
      document: { metadata: { documentEngine: { fields: { partyOneRole: 'seller', partyTwoRole: 'buyer', partyOnePhone: '01055501001', partyTwoPhone: '0244446666', partyOneName: '직접 고친 이름' } } } } as never,
      baseDate: new Date('2026-11-25T00:00:00+09:00'),
    }) as unknown as { fields: Record<string, string> };
    assert.equal(d.fields.partyOneRole, '매도인');
    assert.equal(d.fields.partyTwoRole, '매수인');
    assert.equal(d.fields.partyOnePhone, '010-5550-1001');
    assert.equal(d.fields.partyTwoPhone, '02-4444-6666');
    assert.equal(d.fields.partyOneName, '직접 고친 이름');
  });

  it('keeps a title the user chose when the saved document is opened again', () => {
    const open = (fields: Record<string, string>) =>
      (buildContractDocumentEngineDraft({
        contract: { ...base, parties } as never,
        template: template as never,
        document: { metadata: { documentEngine: { fields } } } as never,
        baseDate: new Date('2026-11-25T00:00:00+09:00'),
      }) as unknown as { fields: Record<string, string> }).fields;
    // 영문 · 한 글자 · 회사 이름이 붙은 호칭은 사람이 정한 것이다
    for (const custom of ['Seller', 'Lessor Ltd', 'A', '갑', '위임인', 'SELLER']) {
      assert.equal(open({ partyOneRole: custom, partyTwoRole: '을' }).partyOneRole, custom);
    }
    assert.equal(open({ partyOneRole: '갑', partyTwoRole: '을' }).partyTwoRole, '을');
    // 사람이 비워 둔 호칭도 그대로 비어 있다
    assert.equal(open({ partyOneRole: '', partyTwoRole: '매수인', partyOneName: 'x' }).partyOneRole, '');
  });

  it('keeps a custom title on a party record and still replaces the bare codes', () => {
    const text = JSON.stringify(draft({ parties: [{ side: 'one', role: 'Seller', name: '김집주' }, { side: 'two', role: 'buyer', name: '박손님' }] }));
    assert.match(text, /Seller/);
    assert.match(text, /매수인/);
  });

  it('falls back to the contacts with the same formatting when there are no party records', () => {
    const text = JSON.stringify(draft({ parties: [] }));
    assert.match(text, /010-5550-1001/);
    assert.match(text, /02-4444-6666/);
  });
});
