import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildContractDocumentEngineDraft,
  getContractDocumentEngineDefaultBodyText,
  type ContractDocumentEngineContract,
  type ContractDocumentEngineTemplate,
} from '../src/contract-document-engine.js';

/**
 * 서식(kind)×거래유형별 기본 본문 조항 자동 주입 (레거시 DMSV001Q03 — Cntr_Part).
 * - 신규 문서(document 없음/저장된 엔진 필드 없음): defaultBody[transactionType] 주입
 * - 저장된 문서: 사용자 편집 보존 (절대 덮어쓰지 않음)
 */
describe('contract document engine — 거래유형별 기본 본문 조항 주입 (DMSV001Q03)', () => {
  const SALE_BODY = '제3조 (제한물권 등의 소멸) 매도인은 완전한 소유권을 이전한다.';
  const JEONSE_BODY = '제3조 (용도변경 및 전대 등) 임차인은 임대인의 동의 없이 전대하지 못한다.';
  const COMMON_BODY = '거래유형 공통 본문 (documentEngine.fields.bodyText)';

  function templateWithDefaultBody(
    overrides: Partial<ContractDocumentEngineTemplate> = {},
  ): ContractDocumentEngineTemplate {
    return {
      id: 'template-1',
      code: 'base_contract',
      title: '계약서',
      category: 'contract',
      metadata: {
        documentEngine: {
          fields: { bodyText: COMMON_BODY },
          defaultBody: {
            sale: SALE_BODY,
            jeonse: JEONSE_BODY,
          },
        },
      },
      ...overrides,
    };
  }

  function contract(
    overrides: Partial<ContractDocumentEngineContract> = {},
  ): ContractDocumentEngineContract {
    return {
      id: 'contract-1',
      transactionType: 'sale',
      totalPrice: 158000,
      ...overrides,
    };
  }

  it('injects the transaction-type body into a brand-new draft (no document)', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'sale' }),
      template: templateWithDefaultBody(),
    });

    assert.equal(draft.fields.bodyText, SALE_BODY);
  });

  it('picks the body matching the contract transaction type', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'jeonse' }),
      template: templateWithDefaultBody(),
    });

    assert.equal(draft.fields.bodyText, JEONSE_BODY);
  });

  it('treats a document without saved engine fields as new and injects', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'sale' }),
      template: templateWithDefaultBody(),
      document: { title: '새 문서', metadata: { someOtherKey: true } },
    });

    assert.equal(draft.fields.bodyText, SALE_BODY);
  });

  it('falls back to the template common body when no type matches (e.g. exchange)', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'exchange' }),
      template: templateWithDefaultBody(),
    });

    assert.equal(draft.fields.bodyText, COMMON_BODY);
  });

  it('never overwrites a saved document bodyText (user edits win)', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'sale' }),
      template: templateWithDefaultBody(),
      document: {
        metadata: {
          documentEngine: {
            version: 1,
            fields: { bodyText: '사용자가 직접 고친 본문 조항' },
          },
        },
      },
    });

    assert.equal(draft.fields.bodyText, '사용자가 직접 고친 본문 조항');
  });

  it('does not inject into a saved document even when bodyText key is absent', () => {
    // 저장된 엔진 필드가 하나라도 있으면 기존 문서로 취급한다 —
    // 기본 본문 주입은 신규 문서에만 적용 (사용자 편집/저장 상태 보존).
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'sale' }),
      template: templateWithDefaultBody(),
      document: {
        metadata: {
          documentEngine: {
            version: 1,
            fields: { specialTerms: '특약만 저장된 문서' },
          },
        },
      },
    });

    assert.equal(draft.fields.bodyText, COMMON_BODY);
  });

  it('keeps a user-cleared (empty string) bodyText on a saved document', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'sale' }),
      template: templateWithDefaultBody(),
      document: {
        metadata: {
          documentEngine: { version: 1, fields: { bodyText: '' } },
        },
      },
    });

    assert.equal(draft.fields.bodyText, '');
  });

  it('does not inherit body from the primary document — annex gets its own default', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'sale' }),
      template: templateWithDefaultBody(),
      primaryDocument: {
        metadata: {
          documentEngine: {
            version: 1,
            fields: { bodyText: '주 계약서 본문', propertyAddress: '서울시 서초구' },
          },
        },
      },
    });

    // bodyText 는 문서 고유 필드(PRIMARY_INHERIT_EXCLUDED) — 자기 서식의 기본 본문 주입
    assert.equal(draft.fields.bodyText, SALE_BODY);
    // 나머지 값 승계는 유지
    assert.equal(draft.fields.propertyAddress, '서울시 서초구');
  });

  it('ignores malformed defaultBody metadata without crashing', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'sale' }),
      template: templateWithDefaultBody({
        metadata: {
          documentEngine: {
            fields: { bodyText: COMMON_BODY },
            defaultBody: 'broken',
          },
        },
      }),
    });

    assert.equal(draft.fields.bodyText, COMMON_BODY);
  });

  it('exposes the lookup helper for direct use', () => {
    const template = templateWithDefaultBody();

    assert.equal(getContractDocumentEngineDefaultBodyText(template, 'sale'), SALE_BODY);
    assert.equal(getContractDocumentEngineDefaultBodyText(template, 'jeonse'), JEONSE_BODY);
    assert.equal(getContractDocumentEngineDefaultBodyText(template, 'monthly'), '');
    assert.equal(
      getContractDocumentEngineDefaultBodyText({ ...template, metadata: null }, 'sale'),
      '',
    );
  });
});
