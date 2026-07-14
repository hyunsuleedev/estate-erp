import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import catalogModule from '../../../prisma/contract-template-catalog';

const {
  CONTRACT_TEMPLATE_BODY_CLAUSES,
  CONTRACT_TEMPLATE_BODY_SEEDS,
  CONTRACT_TEMPLATE_DEFINITION_SEEDS,
  CONTRACT_TEMPLATE_FIELD_GROUPS,
  MYSPIDER_REFERENCED_TEMPLATE_CODES,
} = catalogModule as typeof import('../../../prisma/contract-template-catalog');

const EXISTING_MIGRATION_CODES = new Set([
  'base_contract',
  'purchase_right_contract',
  'union_member_right_contract',
  'commercial_premium_contract',
  'right_transfer_contract',
  'right_succession_contract',
  'standard_lease_contract',
  'commercial_standard_lease_contract',
  'house_lease_contract',
  'sublease_contract',
  'sublease_agreement',
  'identity',
  'broker_explanation',
  'broker_explanation_residential',
  'broker_explanation_non_residential',
  'broker_explanation_land',
  'broker_explanation_special',
  'registry_document',
  'real_estate_transaction_report',
  'real_estate_transaction_cancel_report',
  'house_transaction_report',
  'lease_declaration',
  'lease_change_declaration',
  'renewal_confirmation',
  'guarantee_non_enrollment_agreement',
  'guarantee_partial_enrollment_agreement',
  'jeonse_registration_not_requested',
  'cash_receipt_document',
  'privacy_agreement',
  'broker_fee_receipt',
]);

// 마이그레이션 SQL(20260502170000)이 이미 사용 중인 sortOrder — 신규 정의와 충돌하면 안 됨
const EXISTING_SORT_ORDERS = new Set([
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 30, 40, 41, 42, 43, 44, 50, 60, 61, 62, 63, 64,
  70, 71, 72, 73, 80, 81, 90,
]);

describe('contract template catalog', () => {
  it('provides safe test body text for every MySpider-referenced document template', () => {
    const seededCodes = new Set(CONTRACT_TEMPLATE_BODY_SEEDS.map((seed) => seed.code));

    for (const code of MYSPIDER_REFERENCED_TEMPLATE_CODES) {
      assert.ok(seededCodes.has(code), `${code} should have template body seed`);
    }
  });

  it('marks imported bodies as non-verbatim test content', () => {
    for (const seed of CONTRACT_TEMPLATE_BODY_SEEDS) {
      assert.equal(seed.copiedVerbatimFromMySpider, false);
      assert.ok(seed.fields.bodyText.length > 0, `${seed.code} should have body text`);
      assert.ok(seed.fields.sourceNotice.length > 0, `${seed.code} should have source notice`);
    }
  });

  it('defines the legacy gap templates (documents-form-catalog.md §5.2)', () => {
    const definitionCodes = new Set(CONTRACT_TEMPLATE_DEFINITION_SEEDS.map((d) => d.code));

    for (const code of [
      'transaction_power_of_attorney',
      'exclusive_brokerage_contract',
      'house_funds_and_occupancy_plan',
      'exchange_contract',
      'fact_confirmation',
      'trade_agreement',
      'private_rental_standard_lease_contract',
      'balance_settlement_sheet',
      'management_fee_settlement_sheet',
    ]) {
      assert.ok(definitionCodes.has(code), `${code} should have a definition seed`);
    }

    // 구서식 3종은 마이그레이션 대상이 아님 (§5: 33 구서식/39/40)
    for (const code of definitionCodes) {
      assert.ok(!/_old$|_legacy$/.test(code), `${code} should not be a legacy-only form`);
    }
  });

  it('keeps new definitions additive: no collision with migration-seeded codes/sortOrders', () => {
    const seenSortOrders = new Set<number>();

    for (const definition of CONTRACT_TEMPLATE_DEFINITION_SEEDS) {
      assert.ok(
        !EXISTING_MIGRATION_CODES.has(definition.code),
        `${definition.code} must not redefine a migration-seeded template`,
      );
      assert.ok(
        !EXISTING_SORT_ORDERS.has(definition.sortOrder),
        `${definition.code} sortOrder ${definition.sortOrder} collides with migration seed`,
      );
      assert.ok(
        !seenSortOrders.has(definition.sortOrder),
        `${definition.code} sortOrder ${definition.sortOrder} duplicated in definition seeds`,
      );
      seenSortOrders.add(definition.sortOrder);
      assert.ok(definition.title.length > 0);
      assert.ok(definition.category.length > 0);
      assert.ok(Array.isArray(definition.transactionTypes));
    }
  });

  it('has a body seed and a MySpider reference entry for every new definition', () => {
    const bodyCodes = new Set(CONTRACT_TEMPLATE_BODY_SEEDS.map((seed) => seed.code));
    const referencedCodes = new Set<string>(MYSPIDER_REFERENCED_TEMPLATE_CODES);

    for (const definition of CONTRACT_TEMPLATE_DEFINITION_SEEDS) {
      assert.ok(bodyCodes.has(definition.code), `${definition.code} should have body seed`);
      assert.ok(
        referencedCodes.has(definition.code),
        `${definition.code} should be listed as MySpider-referenced`,
      );
    }
  });

  it('provides fieldGroups schemas for the 10 core documents and all new codes', () => {
    const coreCodes = [
      'base_contract',
      'standard_lease_contract',
      'commercial_standard_lease_contract',
      'broker_explanation_residential',
      'broker_explanation_non_residential',
      'real_estate_transaction_report',
      'lease_declaration',
      'broker_fee_receipt',
      'privacy_agreement',
      'cash_receipt_document',
    ];
    const newCodes = CONTRACT_TEMPLATE_DEFINITION_SEEDS.map((d) => d.code);

    for (const code of [...coreCodes, ...newCodes]) {
      const groups = CONTRACT_TEMPLATE_FIELD_GROUPS[code];
      assert.ok(groups && groups.length > 0, `${code} should define fieldGroups`);

      for (const group of groups) {
        assert.ok(group.key.length > 0, `${code} group key`);
        assert.ok(group.title.length > 0, `${code} group title`);
        assert.ok(group.fields.length > 0, `${code}/${group.key} should have fields`);

        for (const fieldDef of group.fields) {
          assert.ok(fieldDef.key.length > 0, `${code}/${group.key} field key`);
          assert.ok(fieldDef.label.length > 0, `${code}/${group.key}/${fieldDef.key} label`);
          assert.ok(
            ['text', 'number', 'amount', 'date', 'select', 'textarea', 'checkbox'].includes(
              fieldDef.type,
            ),
            `${code}/${group.key}/${fieldDef.key} type ${fieldDef.type}`,
          );
          if (fieldDef.type === 'select') {
            assert.ok(
              Array.isArray(fieldDef.options) && fieldDef.options.length > 0,
              `${code}/${group.key}/${fieldDef.key} select should have options`,
            );
          }
          if (fieldDef.type === 'amount') {
            assert.equal(
              fieldDef.unit,
              '만원',
              `${code}/${group.key}/${fieldDef.key} amount field must use 만원 단위`,
            );
          }
        }
      }

      // 그룹 key / 필드 key는 그룹 내에서 유일해야 함
      const groupKeys = groups.map((group) => group.key);
      assert.equal(new Set(groupKeys).size, groupKeys.length, `${code} duplicate group keys`);
      for (const group of groups) {
        const fieldKeys = group.fields.map((fieldDef) => fieldDef.key);
        assert.equal(
          new Set(fieldKeys).size,
          fieldKeys.length,
          `${code}/${group.key} duplicate field keys`,
        );
      }
    }
  });

  it('writes multi-clause bodies for the new templates (no one-line placeholders)', () => {
    const newCodes = new Set(CONTRACT_TEMPLATE_DEFINITION_SEEDS.map((d) => d.code));

    for (const seed of CONTRACT_TEMPLATE_BODY_SEEDS) {
      if (!newCodes.has(seed.code)) continue;
      const lines = seed.fields.bodyText.split('\n').filter((line) => line.trim().length > 0);
      assert.ok(lines.length >= 3, `${seed.code} body should have at least 3 clauses/lines`);
    }
  });
});

describe('contract template default body clauses (레거시 DMSV001Q03 — kind×거래유형 기본 본문)', () => {
  const KNOWN_TRANSACTION_TYPES = new Set([
    'sale',
    'jeonse',
    'monthly',
    'yearly',
    'exchange',
    'sublease',
    'transfer',
    'succession',
  ]);

  // 계약서(contract category) 서식별 필수 거래유형 커버리지
  const REQUIRED_COVERAGE: Record<string, string[]> = {
    base_contract: ['sale', 'jeonse', 'monthly', 'yearly'],
    standard_lease_contract: ['jeonse', 'monthly'],
    private_rental_standard_lease_contract: ['jeonse', 'monthly'],
    commercial_standard_lease_contract: ['jeonse', 'monthly'],
    house_lease_contract: ['jeonse', 'monthly'],
    exchange_contract: ['exchange'],
    purchase_right_contract: ['sale'],
    union_member_right_contract: ['sale'],
    commercial_premium_contract: ['monthly'],
    right_transfer_contract: ['transfer'],
    right_succession_contract: ['succession'],
    sublease_contract: ['sublease'],
    sublease_agreement: ['sublease'],
    trade_agreement: ['sale'],
  };

  it('covers every contract-category template with its required transaction types', () => {
    for (const [code, requiredTypes] of Object.entries(REQUIRED_COVERAGE)) {
      const bodyMap = CONTRACT_TEMPLATE_BODY_CLAUSES[code];
      assert.ok(bodyMap, `${code} should have default body clauses`);

      for (const transactionType of requiredTypes) {
        assert.ok(
          typeof bodyMap[transactionType] === 'string' && bodyMap[transactionType].length > 0,
          `${code} should cover transactionType ${transactionType}`,
        );
      }
    }
  });

  it('uses only known transaction types as map keys', () => {
    for (const [code, bodyMap] of Object.entries(CONTRACT_TEMPLATE_BODY_CLAUSES)) {
      for (const transactionType of Object.keys(bodyMap)) {
        assert.ok(
          KNOWN_TRANSACTION_TYPES.has(transactionType),
          `${code} uses unknown transaction type ${transactionType}`,
        );
      }
    }
  });

  it('is seedable: every clause code has a body seed so metadata merge applies', () => {
    // seedContractTemplateBodies()는 CONTRACT_TEMPLATE_BODY_SEEDS 의 code 만 순회하므로
    // defaultBody 가 DB metadata 에 반영되려면 body seed 가 반드시 존재해야 한다.
    const bodySeedCodes = new Set(CONTRACT_TEMPLATE_BODY_SEEDS.map((seed) => seed.code));

    for (const code of Object.keys(CONTRACT_TEMPLATE_BODY_CLAUSES)) {
      assert.ok(bodySeedCodes.has(code), `${code} must also have a template body seed`);
    }
  });

  it('writes real multi-clause article text, not placeholders', () => {
    for (const [code, bodyMap] of Object.entries(CONTRACT_TEMPLATE_BODY_CLAUSES)) {
      for (const [transactionType, body] of Object.entries(bodyMap)) {
        const label = `${code}/${transactionType}`;
        const lines = body.split('\n').filter((line) => line.trim().length > 0);

        assert.ok(lines.length >= 3, `${label} should have at least 3 clauses`);
        assert.ok(body.length >= 200, `${label} should be substantial clause text`);
        assert.ok(
          /placeholder|TODO|lorem|본문 없음|____/i.test(body) === false,
          `${label} must not contain placeholder text`,
        );
        // 조항(제N조) 또는 번호 목록(N.) 형태의 실제 문구
        assert.ok(
          /제\d+조/.test(body) || /^\d+\.\s/.test(lines[0] ?? ''),
          `${label} should contain numbered articles`,
        );
      }
    }
  });

  it('differentiates sale vs lease bodies (거래유형별 차이 반영)', () => {
    const base = CONTRACT_TEMPLATE_BODY_CLAUSES.base_contract!;

    assert.notEqual(base.sale, base.jeonse);
    assert.notEqual(base.jeonse, base.monthly);
    assert.notEqual(base.monthly, base.yearly);

    // 매매: 소유권 이전 조항 / 임대차: 용도변경ㆍ전대 및 원상회복 조항
    assert.ok(base.sale!.includes('소유권'), 'sale body should cover 소유권 이전');
    assert.ok(!base.sale!.includes('임대차 목적'), 'sale body should not be a lease body');
    for (const type of ['jeonse', 'monthly', 'yearly'] as const) {
      assert.ok(base[type]!.includes('전대'), `${type} body should cover 용도변경 및 전대`);
      assert.ok(base[type]!.includes('원상'), `${type} body should cover 원상회복`);
    }

    // 차임 연체 해지(2기): 월세/연세에만 존재, 전세에는 없음
    assert.ok(!base.jeonse!.includes('2기'), 'jeonse body must not have 2기 차임 연체 해지');
    assert.ok(base.monthly!.includes('2기'), 'monthly body should have 2기 연체 해지');
    assert.ok(base.yearly!.includes('연세'), 'yearly body should reference 연세');

    // 상가 표준은 상가건물 임대차보호법의 3기 연체 기준
    const commercial = CONTRACT_TEMPLATE_BODY_CLAUSES.commercial_standard_lease_contract!;
    assert.ok(commercial.monthly!.includes('3기'), 'commercial monthly should use 3기 연체');
    assert.ok(
      commercial.monthly!.includes('권리금'),
      'commercial body should cover 권리금 회수기회 보호',
    );

    // 법무부 주택임대차표준: 갱신ㆍ비용정산ㆍ분쟁해결 조항 포함
    const standard = CONTRACT_TEMPLATE_BODY_CLAUSES.standard_lease_contract!;
    for (const keyword of ['갱신', '장기수선충당금', '분쟁']) {
      assert.ok(
        standard.jeonse!.includes(keyword) && standard.monthly!.includes(keyword),
        `standard lease body should cover ${keyword}`,
      );
    }

    // 민간임대: 임대의무기간ㆍ증액 제한(5%)ㆍ보증 가입
    const privateRental = CONTRACT_TEMPLATE_BODY_CLAUSES.private_rental_standard_lease_contract!;
    for (const keyword of ['임대의무기간', '5퍼센트', '보증']) {
      assert.ok(
        privateRental.jeonse!.includes(keyword) && privateRental.monthly!.includes(keyword),
        `private rental body should cover ${keyword}`,
      );
    }

    // 교환: 보충금 정산
    const exchange = CONTRACT_TEMPLATE_BODY_CLAUSES.exchange_contract!;
    assert.ok(exchange.exchange!.includes('보충금'), 'exchange body should cover 보충금');
  });
});
