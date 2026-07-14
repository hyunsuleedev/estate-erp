import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONTRACT_DOCUMENT_ENGINE_DEFAULT_PRINT_OPTIONS,
  getContractDocumentEnginePrintOptions,
  hasContractDocumentEnginePrintOptions,
  mergeContractDocumentEngineMetadata,
  mergeContractDocumentEnginePrintOptions,
} from '../src/contract-document-engine.js';

describe('contract document engine — printOptions 읽기', () => {
  it('returns defaults (manwon/hangul) when metadata has no printOptions', () => {
    assert.deepEqual(getContractDocumentEnginePrintOptions(null), {
      amountUnit: 'manwon',
      amountNotation: 'hangul',
    });
    assert.deepEqual(getContractDocumentEnginePrintOptions({}), {
      amountUnit: 'manwon',
      amountNotation: 'hangul',
    });
    assert.deepEqual(
      getContractDocumentEnginePrintOptions({ documentEngine: { version: 1, fields: {} } }),
      CONTRACT_DOCUMENT_ENGINE_DEFAULT_PRINT_OPTIONS,
    );
  });

  it('merges stored options over defaults', () => {
    const metadata = {
      documentEngine: {
        version: 1,
        fields: { salePrice: '99000' },
        printOptions: {
          amountNotation: 'hanja',
          includeTenantDeposit: true,
          interim2BlankPrint: false,
        },
      },
    };

    assert.deepEqual(getContractDocumentEnginePrintOptions(metadata), {
      amountUnit: 'manwon',
      amountNotation: 'hanja',
      includeTenantDeposit: true,
      interim2BlankPrint: false,
    });
  });

  it('drops malformed values and unknown keys silently', () => {
    const metadata = {
      documentEngine: {
        printOptions: {
          amountUnit: 'dollar',
          amountNotation: 42,
          includeTenantDeposit: 'yes',
          directClause2: true,
          rogueKey: 'x',
        },
      },
    };

    assert.deepEqual(getContractDocumentEnginePrintOptions(metadata), {
      amountUnit: 'manwon',
      amountNotation: 'hangul',
      directClause2: true,
    });
  });
});

describe('contract document engine — printOptions 병합', () => {
  it('mergeContractDocumentEngineMetadata keeps stored printOptions when the arg is omitted', () => {
    const metadata = {
      keepMe: true,
      documentEngine: {
        version: 1,
        fields: { salePrice: '90000' },
        printOptions: { amountNotation: 'hanja', financeLoanBlankPrint: true },
      },
    };

    const merged = mergeContractDocumentEngineMetadata(metadata, { salePrice: '99000' });
    const documentEngine = merged.documentEngine as Record<string, unknown>;

    assert.equal(merged.keepMe, true);
    assert.deepEqual(documentEngine.fields, { salePrice: '99000' });
    assert.deepEqual(documentEngine.printOptions, {
      amountNotation: 'hanja',
      financeLoanBlankPrint: true,
    });
  });

  it('mergeContractDocumentEngineMetadata merges the printOptions arg over stored values', () => {
    const metadata = {
      documentEngine: {
        printOptions: { amountNotation: 'hanja', includeTenantDeposit: true },
      },
    };

    const merged = mergeContractDocumentEngineMetadata(
      metadata,
      { salePrice: '99000' },
      { amountUnit: 'won', includeTenantDeposit: false },
    );
    const documentEngine = merged.documentEngine as Record<string, unknown>;

    assert.deepEqual(documentEngine.printOptions, {
      amountNotation: 'hanja',
      amountUnit: 'won',
      includeTenantDeposit: false,
    });
  });

  it('mergeContractDocumentEngineMetadata omits printOptions entirely when nothing is set (하위호환)', () => {
    const merged = mergeContractDocumentEngineMetadata(null, { salePrice: '99000' });
    const documentEngine = merged.documentEngine as Record<string, unknown>;

    assert.ok(!('printOptions' in documentEngine));
    assert.deepEqual(documentEngine.fields, { salePrice: '99000' });
    assert.equal(documentEngine.version, 1);
  });

  it('mergeContractDocumentEnginePrintOptions updates options while preserving fields', () => {
    const metadata = {
      contractAgreement: { schemaId: 'kr-residential-sale-agreement' },
      documentEngine: {
        version: 1,
        fields: { salePrice: '99000', bodyText: '제3조 …' },
        printOptions: { amountUnit: 'chun' },
      },
    };

    const merged = mergeContractDocumentEnginePrintOptions(metadata, {
      amountNotation: 'hanja',
      directClause2: true,
    });
    const documentEngine = merged.documentEngine as Record<string, unknown>;

    assert.deepEqual(documentEngine.fields, { salePrice: '99000', bodyText: '제3조 …' });
    assert.deepEqual(documentEngine.printOptions, {
      amountUnit: 'chun',
      amountNotation: 'hanja',
      directClause2: true,
    });
    assert.equal(documentEngine.version, 1);
    assert.ok(merged.contractAgreement, 'documentEngine 밖 metadata 는 보존');
  });

  it('sanitizes the incoming partial (malformed values are not persisted)', () => {
    const merged = mergeContractDocumentEnginePrintOptions(null, {
      amountUnit: 'dollar' as never,
      includeTenantDeposit: true,
    });
    const documentEngine = merged.documentEngine as Record<string, unknown>;

    assert.deepEqual(documentEngine.printOptions, { includeTenantDeposit: true });
  });
});

describe('hasContractDocumentEnginePrintOptions — 조항 에디터 세대 마커', () => {
  it('is false without stored printOptions — documentEngine.fields 만으로는 마커가 아니다', () => {
    // 구 편집기(-residential-sale-editor) 저장 경로도 fields 는 항상 기록했으므로
    // fields 존재 여부는 매매초안 이관 판별에 쓸 수 없다 (plan §4.4 회귀 방지).
    assert.equal(hasContractDocumentEnginePrintOptions(null), false);
    assert.equal(hasContractDocumentEnginePrintOptions({}), false);
    assert.equal(
      hasContractDocumentEnginePrintOptions({
        documentEngine: { version: 1, fields: { salePrice: '99000' } },
      }),
      false,
    );
  });

  it('is true once a clause-editor save recorded printOptions', () => {
    const merged = mergeContractDocumentEngineMetadata(
      null,
      { salePrice: '99000' },
      CONTRACT_DOCUMENT_ENGINE_DEFAULT_PRINT_OPTIONS,
    );

    assert.equal(hasContractDocumentEnginePrintOptions(merged), true);
  });

  it('ignores malformed printOptions objects (유효 키가 없으면 마커 아님)', () => {
    assert.equal(
      hasContractDocumentEnginePrintOptions({
        documentEngine: { printOptions: { rogueKey: 'x', amountUnit: 'dollar' } },
      }),
      false,
    );
  });
});
