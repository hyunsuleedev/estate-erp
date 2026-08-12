import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BASE_CONTRACT_DOWN_PAYMENT_PAY_TIME_OPTIONS,
  BASE_CONTRACT_LOAN_HANDLING_OPTIONS,
  BASE_CONTRACT_SALE_CLAUSES,
  BASE_CONTRACT_TENANT_DEPOSIT_HANDLING_OPTIONS,
  CONTRACT_CLAUSE_LAYOUTS,
  CONTRACT_PRINT_OPTION_FIELD_KEYS,
  collectContractClauseFieldKeys,
  getClauseFieldValue,
  getContractClauseLayout,
  isClauseRowVisible,
  isContractPrintOptionFieldKey,
  type ClauseSegment,
} from '../src/contract-clause-layouts.js';
import { getContractDocumentEnginePrintOptions } from '../src/contract-document-engine.js';

// 카탈로그(fieldGroups 시드)와의 무결성 검증 — web test 와 동일하게 상대 경로 import
import catalogModule from '../../../prisma/contract-template-catalog';

const { CONTRACT_TEMPLATE_FIELD_GROUPS } =
  catalogModule as typeof import('../../../prisma/contract-template-catalog');

type CatalogField = {
  key: string;
  label: string;
  type: string;
  options?: string[];
  appliesTo?: string[];
};

function catalogBaseContractFields(): Map<string, CatalogField> {
  const groups = CONTRACT_TEMPLATE_FIELD_GROUPS.base_contract!;
  const map = new Map<string, CatalogField>();
  for (const group of groups) {
    for (const field of group.fields) {
      map.set(field.key, field);
    }
  }
  return map;
}

function fieldSegments(): Array<Extract<ClauseSegment, { kind: 'field' }>> {
  const segments: Array<Extract<ClauseSegment, { kind: 'field' }>> = [];
  for (const article of BASE_CONTRACT_SALE_CLAUSES) {
    for (const row of article.rows) {
      for (const segment of row.segments) {
        if (segment.kind === 'field') segments.push(segment);
      }
    }
  }
  return segments;
}

describe('contract clause layouts — base_contract × sale 무결성', () => {
  it('resolves every fieldKey to a catalog base_contract key or a printOptions key', () => {
    const catalogFields = catalogBaseContractFields();

    for (const key of collectContractClauseFieldKeys(BASE_CONTRACT_SALE_CLAUSES)) {
      assert.ok(
        catalogFields.has(key) || isContractPrintOptionFieldKey(key),
        `clause fieldKey ${key} must exist in catalog base_contract fieldGroups or printOptions`,
      );
    }
  });

  it('keeps every used catalog field visible for sale (appliesTo)', () => {
    const catalogFields = catalogBaseContractFields();

    for (const key of collectContractClauseFieldKeys(BASE_CONTRACT_SALE_CLAUSES)) {
      const field = catalogFields.get(key);
      if (!field) continue; // printOptions 키
      assert.ok(
        !field.appliesTo || field.appliesTo.includes('sale'),
        `${key} must apply to sale transactions`,
      );
    }
  });

  it('matches segment controls to catalog field types', () => {
    const catalogFields = catalogBaseContractFields();
    const expectedTypesByControl: Record<string, string[]> = {
      amount: ['amount'],
      date: ['date'],
      select: ['select'],
      check: ['checkbox'],
      text: ['text', 'textarea'],
      // receipt 슬롯의 fieldKey 는 "어느 금액의 영수증인지"를 가리키는 amount 키
      receipt: ['amount'],
    };

    for (const segment of fieldSegments()) {
      if (isContractPrintOptionFieldKey(segment.fieldKey)) {
        // printOptions boolean 은 check 컨트롤로만 쓴다
        assert.equal(
          segment.control,
          'check',
          `printOptions key ${segment.fieldKey} must use check control`,
        );
        continue;
      }

      const field = catalogFields.get(segment.fieldKey);
      assert.ok(field, `catalog field for ${segment.fieldKey}`);
      assert.ok(
        expectedTypesByControl[segment.control]!.includes(field!.type),
        `${segment.fieldKey}: control ${segment.control} incompatible with catalog type ${field!.type}`,
      );
    }
  });

  it('keeps select options in sync with catalog options (단일 소스)', () => {
    const catalogFields = catalogBaseContractFields();

    for (const segment of fieldSegments()) {
      if (segment.control !== 'select') continue;
      const field = catalogFields.get(segment.fieldKey);
      assert.ok(field, `catalog field for select ${segment.fieldKey}`);
      assert.deepEqual(
        segment.options,
        field!.options,
        `${segment.fieldKey} select options must match catalog`,
      );
    }

    assert.deepEqual(catalogFields.get('loanHandling')!.options, [
      ...BASE_CONTRACT_LOAN_HANDLING_OPTIONS,
    ]);
    assert.deepEqual(catalogFields.get('currentTenantDepositHandling')!.options, [
      ...BASE_CONTRACT_TENANT_DEPOSIT_HANDLING_OPTIONS,
    ]);
    assert.deepEqual(catalogFields.get('downPaymentPayTime')!.options, [
      ...BASE_CONTRACT_DOWN_PAYMENT_PAY_TIME_OPTIONS,
    ]);
  });

  it('covers the legacy 제1조 rows (매매대금/융자금/현임대보증금/계약금/중도금×2/잔금)', () => {
    const article1 = BASE_CONTRACT_SALE_CLAUSES[0]!;
    assert.equal(article1.no, '제1조');
    assert.ok(article1.intro && article1.intro.includes('매매대금'));

    const rowKeys = article1.rows.map((row) => row.key);
    for (const expected of [
      'tenantDepositToggle',
      'salePrice',
      'loan',
      'currentTenantDeposit',
      'downPayment',
      'interimPayment',
      'interimPayment2',
      'balancePayment',
      'directClause2Toggle',
    ]) {
      assert.ok(rowKeys.includes(expected), `제1조 should include row ${expected}`);
    }

    // 행 key 는 조항 내 유일
    for (const article of BASE_CONTRACT_SALE_CLAUSES) {
      const keys = article.rows.map((row) => row.key);
      assert.equal(new Set(keys).size, keys.length, `${article.no} duplicate row keys`);
    }
  });

  it('places receipt placeholders for 계약금/중도금/잔금 (P5 — placeholder only)', () => {
    const receipts = fieldSegments().filter((segment) => segment.control === 'receipt');
    assert.deepEqual(
      receipts.map((segment) => segment.fieldKey),
      ['downPayment', 'interimPayment', 'interimPayment2', 'balancePayment'],
    );
    for (const receipt of receipts) {
      assert.ok(receipt.suffix && receipt.suffix.includes('영수증'));
    }
  });

  it('uses bodyText for 제3조~ (조항 원문 복제 금지 — 기존 시드 사용)', () => {
    const bodyArticle = BASE_CONTRACT_SALE_CLAUSES.at(-1)!;
    assert.equal(bodyArticle.no, '제3조~');
    const segment = bodyArticle.rows[0]!.segments[0]!;
    assert.equal(segment.kind, 'field');
    assert.equal((segment as { fieldKey: string }).fieldKey, 'bodyText');
  });

  it('exposes the layout via CONTRACT_CLAUSE_LAYOUTS / getContractClauseLayout', () => {
    assert.equal(getContractClauseLayout('base_contract', 'sale'), BASE_CONTRACT_SALE_CLAUSES);
    assert.equal(CONTRACT_CLAUSE_LAYOUTS.base_contract!.sale, BASE_CONTRACT_SALE_CLAUSES);
    assert.equal(
      getContractClauseLayout('base_contract', 'jeonse'),
      CONTRACT_CLAUSE_LAYOUTS.base_contract!.jeonse,
    );
    assert.ok(getContractClauseLayout('base_contract', 'monthly'));
    assert.ok(getContractClauseLayout('base_contract', 'yearly'));
    assert.ok(getContractClauseLayout('commercial_standard_lease_contract', 'monthly'));
    assert.equal(getContractClauseLayout('standard_lease_contract', 'sale'), null);
  });

  it('applies the registered property type to base-contract article wording', () => {
    const apartment = getContractClauseLayout('base_contract', 'sale', {
      propertyClass: 'apartment',
      cntrClsf: '01',
    })!;
    const officetel = getContractClauseLayout('base_contract', 'jeonse', {
      propertyClass: 'officetel',
      cntrClsf: '02',
    })!;

    assert.ok(apartment[0]!.intro!.includes('위 아파트'));
    assert.ok(
      officetel[1]!.rows[0]!.segments.some(
        (segment) => segment.kind === 'text' && segment.text.includes('위 오피스텔'),
      ),
    );
    // 공유 상수는 치환 과정에서 오염되지 않는다.
    assert.ok(BASE_CONTRACT_SALE_CLAUSES[0]!.intro!.includes('위 부동산'));
  });
});

describe('contract clause layouts — printOptions 연동 가시성', () => {
  const defaults = getContractDocumentEnginePrintOptions(null);

  it('classifies printOptions field keys', () => {
    assert.deepEqual(
      [...CONTRACT_PRINT_OPTION_FIELD_KEYS],
      ['financeLoanBlankPrint', 'interim2BlankPrint', 'includeTenantDeposit', 'directClause2'],
    );
    assert.ok(isContractPrintOptionFieldKey('includeTenantDeposit'));
    assert.ok(!isContractPrintOptionFieldKey('salePrice'));
  });

  it('reads values from fields or printOptions with checkbox 관례 정규화', () => {
    const fields = { salePrice: '99000' };

    assert.equal(getClauseFieldValue('salePrice', fields, defaults), '99000');
    assert.equal(getClauseFieldValue('includeTenantDeposit', fields, defaults), '');
    assert.equal(
      getClauseFieldValue('includeTenantDeposit', fields, {
        ...defaults,
        includeTenantDeposit: true,
      }),
      'true',
    );
    // engineFields 에 같은 이름 키가 있어도 printOptions 가 우선한다
    assert.equal(
      getClauseFieldValue('includeTenantDeposit', { includeTenantDeposit: 'true' }, defaults),
      '',
    );
  });

  it('hides the 현 임대보증금 row until includeTenantDeposit is on', () => {
    const article1 = BASE_CONTRACT_SALE_CLAUSES[0]!;
    const row = article1.rows.find((candidate) => candidate.key === 'currentTenantDeposit')!;

    assert.ok(!isClauseRowVisible(row, {}, defaults));
    assert.ok(isClauseRowVisible(row, {}, { ...defaults, includeTenantDeposit: true }));
  });

  it('hides the 제2조 자동 문장 when directClause2 (계약사항2조 직접입력) is on', () => {
    const article2 = BASE_CONTRACT_SALE_CLAUSES[1]!;
    assert.equal(article2.no, '제2조');
    const row = article2.rows[0]!;

    assert.ok(isClauseRowVisible(row, {}, defaults));
    assert.ok(!isClauseRowVisible(row, {}, { ...defaults, directClause2: true }));
  });

  it('keeps rows without visibleWhen always visible', () => {
    const article1 = BASE_CONTRACT_SALE_CLAUSES[0]!;
    const salePriceRow = article1.rows.find((candidate) => candidate.key === 'salePrice')!;
    assert.ok(isClauseRowVisible(salePriceRow, {}, undefined));
  });
});
