import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import catalogModule from '../../desktop/src/renderer/routes/_authenticated/contracts/-form-registration-catalog';
import { CONTRACT_DOCUMENT_KINDS } from '../../../packages/shared/src/enums';
import { getContractClauseLayout } from '../../../packages/shared/src/contract-clause-layouts';

const {
  ADD_FORM_MENU,
  ANNEX_FORM_MENU,
  CONFIRMATION_FORM_MENU,
  CONTRACT_FORM_MENU,
  REAL_ESTATE_SUBJECT_OPTIONS,
} =
  catalogModule as typeof import('../../desktop/src/renderer/routes/_authenticated/contracts/-form-registration-catalog');

describe('MySpider form registration catalog', () => {
  it('models the 11 property types and all 30 contract combinations', () => {
    assert.equal(CONTRACT_FORM_MENU.length, 11);
    assert.equal(
      CONTRACT_FORM_MENU.reduce((sum, group) => sum + group.items.length, 0),
      30,
    );

    const countByGroup = Object.fromEntries(
      CONTRACT_FORM_MENU.map((group) => [group.groupLabel, group.items.length]),
    );
    assert.deepEqual(countByGroup, {
      아파트: 4,
      오피스텔: 4,
      부동산: 6,
      분양권: 1,
      상가: 4,
      권리: 2,
      '상가 권리금': 2,
      '상가 표준': 2,
      '민간임대 표준': 2,
      '주택 표준': 2,
      '조합원 입주권': 1,
    });

    for (const groupName of ['아파트', '오피스텔', '상가']) {
      const group = CONTRACT_FORM_MENU.find(
        (item) => item.groupLabel === groupName,
      );
      assert.deepEqual(
        group?.items.map((item) => item.transactionType),
        ['sale', 'jeonse', 'monthly', 'yearly'],
      );
    }
    assert.deepEqual(
      CONTRACT_FORM_MENU.find(
        (item) => item.groupLabel === '부동산',
      )?.items.map((item) => item.transactionType),
      ['sale', 'jeonse', 'monthly', 'yearly', 'exchange', 'sublease'],
    );
  });

  it('resolves a structured clause layout for every one of the 30 contract combinations', () => {
    for (const spec of CONTRACT_FORM_MENU.flatMap((group) => group.items)) {
      const layout = getContractClauseLayout(spec.templateCode, spec.transactionType, {
        propertyClass: spec.propertyClass,
        cntrClsf: spec.cntrClsf,
        groupLabel: spec.groupLabel,
        contractSubject: spec.subjectDefault,
      });

      assert.ok(layout, `${spec.groupLabel}/${spec.transactionType} needs a clause layout`);
      assert.equal(layout[0]?.no, '제1조');
      assert.equal(layout[1]?.no, '제2조');
      assert.ok(
        layout.some((article) =>
          article.rows.some((row) =>
            row.segments.some(
              (segment) => segment.kind === 'field' && segment.fieldKey === 'bodyText',
            ),
          ),
        ),
        `${spec.groupLabel}/${spec.transactionType} needs the remaining body clauses`,
      );
    }
  });

  it('keeps the exact 22 generic real-estate subjects', () => {
    assert.equal(REAL_ESTATE_SUBJECT_OPTIONS.length, 22);
    assert.deepEqual(REAL_ESTATE_SUBJECT_OPTIONS, [
      '직접입력',
      '부동산',
      '건물',
      '고급주택',
      '공장',
      '농가주택',
      '다가구',
      '다세대',
      '단독주택',
      '독채',
      '빌딩',
      '빌라',
      '사무실',
      '상가주택',
      '아파트형공장',
      '연립',
      '원룸',
      '임야',
      '전원주택',
      '창고',
      '토지',
      '투룸',
    ]);
  });

  it('models four explanation types and the 22 active add-form entries', () => {
    assert.equal(CONFIRMATION_FORM_MENU.length, 4);
    assert.deepEqual(
      CONFIRMATION_FORM_MENU.map((item) => item.tradeLabel),
      ['주거용', '비주거용', '토지', '특수물건'],
    );

    assert.equal(ADD_FORM_MENU.length, 22);
    assert.deepEqual(
      ADD_FORM_MENU.map((item) => item.cntrClsf),
      [
        '11',
        '12',
        '13',
        '14',
        '15',
        '31',
        '32',
        '46',
        '34',
        '35',
        '36',
        '37',
        '38',
        '47',
        '41',
        '42',
        '43',
        '48',
        '49',
        '50',
        '52',
        '51',
      ],
    );
    assert.equal(ANNEX_FORM_MENU.length, 26);

    const inactiveLegacyCodes = new Set(['33', '39', '40', '44', '45']);
    assert.equal(
      ADD_FORM_MENU.some((item) => inactiveLegacyCodes.has(item.cntrClsf)),
      false,
    );
    assert.deepEqual(
      ADD_FORM_MENU.filter((item) => item.repeatable).map(
        (item) => item.cntrClsf,
      ),
      ['31'],
    );
  });

  it('preserves each active form table mapping and only uses supported kinds', () => {
    const expectedTables: Record<string, string> = {
      '11': 'TPCT20S',
      '12': 'TPCT19S',
      '13': 'TPCT18S',
      '14': 'TPCT12S',
      '15': 'TPCT32S',
      '31': 'TPCT24S',
      '32': 'TPCT23S',
      '46': 'TPCT22S',
      '34': 'TPCT26S',
      '35': 'TPCT25S',
      '36': 'TPCT21S',
      '37': 'TPCT17S',
      '38': 'TPCT29S',
      '47': 'TPCT33S',
      '41': 'TPCT15S',
      '42': 'TPCT11S',
      '43': 'TPCT16S',
      '48': 'TPCT35S',
      '49': 'TPCT36S',
      '50': 'TPCT37S',
      '52': 'TPCT39S',
      '51': 'TPCT38S',
    };
    const supportedKinds = new Set<string>(CONTRACT_DOCUMENT_KINDS);

    for (const item of ADD_FORM_MENU) {
      assert.equal(item.legacyTableName, expectedTables[item.cntrClsf]);
      assert.ok(item.mySpiderForm);
      assert.ok(item.mySpiderReport);
      assert.ok(supportedKinds.has(item.templateCode), item.templateCode);
    }
  });
});
