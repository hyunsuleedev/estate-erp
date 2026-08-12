import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildContractDocumentEngineDraft,
  getContractDocumentEngineFieldGroups,
  getContractDocumentEngineSections,
  getContractPartySideLabels,
  mergeContractDocumentEngineMetadata,
  parseContractManwonText,
  type ContractDocumentEngineContract,
  type ContractDocumentEngineParty,
  type ContractDocumentEngineTemplate,
} from '../src/contract-document-engine.js';

describe('contract document engine — metadata-driven field groups', () => {
  it('keeps the category-based fallback for the legacy string signature', () => {
    const groups = getContractDocumentEngineFieldGroups('receipt');

    assert.equal(groups[0]?.title, '문서 기본');
    assert.ok(groups.some((group) => group.title === '영수증'));
  });

  it('uses template.metadata.documentEngine.fieldGroups when present', () => {
    const groups = getContractDocumentEngineFieldGroups(
      template({ metadata: metadataWithFieldGroups() }),
      { transactionType: 'sale' },
    );

    assert.deepEqual(
      groups.map((group) => group.title),
      ['계약내용 (금액 스케줄)', '특약사항'],
    );

    const payment = groups[0]!;
    assert.equal(payment.key, 'paymentTerms');

    const salePrice = payment.fields.find((field) => field.key === 'salePrice');
    assert.ok(salePrice, 'salePrice should be visible for sale');
    assert.equal(salePrice?.inputType, 'amount');
    assert.equal(salePrice?.unit, '만원');
    assert.equal(salePrice?.label, '매매대금 (만원)');
    assert.equal(salePrice?.multiline, undefined);

    // appliesTo: ['jeonse','monthly'] — sale 계약에서는 숨김
    assert.ok(!payment.fields.some((field) => field.key === 'deposit'));

    const loanHandling = payment.fields.find(
      (field) => field.key === 'loanHandling',
    );
    assert.equal(loanHandling?.inputType, 'select');
    assert.deepEqual(loanHandling?.options, ['승계', '말소']);

    const specialTerms = groups[1]!.fields.find(
      (field) => field.key === 'specialTerms',
    );
    assert.equal(specialTerms?.inputType, 'textarea');
    assert.equal(specialTerms?.multiline, true);
  });

  it('shows appliesTo-restricted fields when no transactionType is given', () => {
    const groups = getContractDocumentEngineFieldGroups(
      template({ metadata: metadataWithFieldGroups() }),
    );

    assert.ok(groups[0]!.fields.some((field) => field.key === 'deposit'));
  });

  it('drops groups that become empty after transactionType filtering', () => {
    const groups = getContractDocumentEngineFieldGroups(
      template({
        metadata: {
          documentEngine: {
            fieldGroups: [
              {
                key: 'leaseOnly',
                title: '임대차 전용',
                fields: [
                  {
                    key: 'deposit',
                    label: '보증금',
                    type: 'amount',
                    appliesTo: ['jeonse'],
                  },
                ],
              },
              {
                key: 'common',
                title: '공통',
                fields: [
                  { key: 'contractDate', label: '계약 체결일', type: 'date' },
                ],
              },
            ],
          },
        },
      }),
      { transactionType: 'sale' },
    );

    assert.deepEqual(
      groups.map((group) => group.key),
      ['common'],
    );
  });

  it('falls back to category groups when metadata has no usable fieldGroups', () => {
    const groups = getContractDocumentEngineFieldGroups(
      template({ metadata: { documentEngine: { fieldGroups: 'broken' } } }),
    );

    assert.equal(groups[0]?.title, '문서 기본');
  });

  it('prefills known metadata-driven contract fields and initializes unknown keys', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract(),
      template: template({ metadata: metadataWithFieldGroups() }),
    });

    assert.equal(draft.fields.salePrice, '158000');
    assert.equal(draft.fields.loanHandling, '');
    // 기존 기본 필드는 유지
    assert.equal(draft.fields.specialTerms, '현 시설물 상태에서 계약한다.');
  });
});

describe('contract document engine — 거래유형 라벨/당사자 역할 (§2.1 e)', () => {
  it('labels extended transaction types via shared enum labels', () => {
    const sublease = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'sublease' }),
      template: template({}),
    });

    assert.equal(sublease.fields.transactionTypeText, '전대');
    assert.match(sublease.subtitle, /^전대 · /);

    const exchange = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'exchange' }),
      template: template({}),
    });
    assert.equal(exchange.fields.transactionTypeText, '교환');

    // 미지의 유형은 원문 유지 (기존 fallback 동작)
    const unknown = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'barter' }),
      template: template({}),
    });
    assert.equal(unknown.fields.transactionTypeText, 'barter');
  });

  it('maps party side labels per the legacy role table', () => {
    assert.deepEqual(getContractPartySideLabels('sale'), {
      one: '매도인',
      two: '매수인',
    });
    assert.deepEqual(getContractPartySideLabels('jeonse'), {
      one: '임대인',
      two: '임차인',
    });
    assert.deepEqual(getContractPartySideLabels('monthly'), {
      one: '임대인',
      two: '임차인',
    });
    assert.deepEqual(getContractPartySideLabels('exchange'), {
      one: '갑',
      two: '을',
    });
    assert.deepEqual(getContractPartySideLabels('sublease'), {
      one: '전대인',
      two: '전차인',
    });
    assert.deepEqual(getContractPartySideLabels('transfer'), {
      one: '양도인',
      two: '양수인',
    });
    assert.deepEqual(getContractPartySideLabels('succession'), {
      one: '양도인',
      two: '양수인',
    });
  });

  it('applies the role table to default party fields in the draft', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'sublease' }),
      template: template({}),
    });

    assert.equal(draft.fields.partyOneRole, '전대인');
    assert.equal(draft.fields.partyTwoRole, '전차인');
  });
});

describe('contract document engine — metadata fieldGroups 섹션 렌더', () => {
  it('renders filled template metadata fields as group sections', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract(),
      template: template({ metadata: metadataWithFieldGroups() }),
      document: {
        metadata: {
          documentEngine: {
            fields: {
              salePrice: '85000',
              loanHandling: '말소',
              balancePaymentDate: '2026-06-30',
              includePrivacyClause: 'true',
            },
          },
        },
      },
    });

    const payment = draft.sections.find(
      (section) => section.title === '계약내용 (금액 스케줄)',
    );
    assert.ok(payment, 'metadata group section should be rendered');
    assert.deepEqual(
      payment?.rows.map((row) => row.label),
      ['융자금 처리', '잔금 지급일'],
    );
    // salePrice 는 공통 '거래 조건' 행으로 미러되는 주 금액 필드 — 중복 제외
    assert.ok(!payment?.rows.some((row) => row.label === '매매대금 (만원)'));

    const special = draft.sections.find(
      (section) => section.title === '특약사항',
    );
    assert.equal(
      special?.rows.find((row) => row.label === '개인정보 동의 문구 삽입')
        ?.value,
      '예',
    );
    // specialTerms 키는 공통 '5. 특약 및 확인사항' 섹션이 렌더 — 중복 제외
    assert.ok(!special?.rows.some((row) => row.label === '특약사항'));
  });

  it('derives hangul notation for non-mirrored amount fields', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract(),
      template: template({}),
    });

    const sections = getContractDocumentEngineSections(
      'contract',
      { ...draft.fields, loanAmount: '5000' },
      {
        fieldGroups: [
          {
            key: 'loan',
            title: '융자',
            fields: [
              {
                key: 'loanAmount',
                label: '융자금 (만원)',
                inputType: 'amount',
              },
            ],
          },
        ],
      },
    );

    const loanRow = sections
      .find((section) => section.title === '융자')
      ?.rows.find((row) => row.label === '융자금 (만원)');
    assert.equal(loanRow?.value, '5000 — 일금 오천만원정 (₩50,000,000)');
  });

  it('skips empty values and renders contract-prefilled metadata groups', () => {
    const withMetadata = buildContractDocumentEngineDraft({
      contract: contract(),
      template: template({ metadata: metadataWithFieldGroups() }),
    });
    // 계약 스냅샷에서 매매대금/잔금일을 채우므로 해당 그룹은 바로 미리보기에 표시된다.
    assert.ok(
      withMetadata.sections.some(
        (section) => section.title === '계약내용 (금액 스케줄)',
      ),
    );

    const fallback = buildContractDocumentEngineDraft({
      contract: contract(),
      template: template({}),
    });
    // category fallback 그룹은 전부 공통 키 — 기존 섹션 구성 그대로
    assert.deepEqual(
      fallback.sections.map((section) => section.title),
      [
        '1. 부동산의 표시',
        '2. 계약 당사자',
        '3. 거래 조건',
        '4. 서식 본문',
        '5. 특약 및 확인사항',
      ],
    );
  });
});

describe('contract document engine — 한글 금액 병기 (GetHangulFromNum)', () => {
  it('renders the 거래 금액 row with hangul + won notation', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ totalPrice: 158000 }),
      template: template({}),
    });

    assert.equal(
      draft.fields.totalPriceHangulText,
      '일금 일십오억팔천만원정 (₩1,580,000,000)',
    );

    const conditions = draft.sections.find(
      (section) => section.title === '3. 거래 조건',
    );
    const priceRow = conditions?.rows.find((row) => row.label === '거래 금액');
    assert.equal(
      priceRow?.value,
      '15억 8,000만 — 일금 일십오억팔천만원정 (₩1,580,000,000)',
    );
  });

  it('renders 월 차임 with hangul when set and "-" when missing', () => {
    const monthly = buildContractDocumentEngineDraft({
      contract: contract({
        transactionType: 'monthly',
        totalPrice: 5000,
        monthlyRent: 120,
      }),
      template: template({}),
    });

    const monthlyRow = monthly.sections
      .find((section) => section.title === '3. 거래 조건')
      ?.rows.find((row) => row.label === '월 차임');
    assert.equal(monthlyRow?.value, '120만 — 일금 일백이십만원정 (₩1,200,000)');

    const sale = buildContractDocumentEngineDraft({
      contract: contract({ monthlyRent: null }),
      template: template({}),
    });
    const emptyRow = sale.sections
      .find((section) => section.title === '3. 거래 조건')
      ?.rows.find((row) => row.label === '월 차임');
    assert.equal(emptyRow?.value, '-');
  });

  it('silently skips hangul notation for non-integer amounts', () => {
    const fields = buildContractDocumentEngineDraft({
      contract: contract({ totalPrice: 1580.5 }),
      template: template({}),
    }).fields;

    assert.equal(fields.totalPriceHangulText, '');
  });

  it('derives the 거래 금액 병기 from the edited amount text at render time', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ totalPrice: 35000 }),
      template: template({}),
    });

    // 사용자가 '거래 금액' 텍스트를 4억으로 편집 — 저장된 HangulText 스냅샷은
    // 3.5억 기준이지만 병기는 현재 값에서 파생되어야 한다 (stale 방지)
    const edited = { ...draft.fields, totalPriceText: '4억' };
    const priceRow = getContractDocumentEngineSections('contract', edited)
      .find((section) => section.title === '3. 거래 조건')
      ?.rows.find((row) => row.label === '거래 금액');

    assert.equal(priceRow?.value, '4억 — 일금 사억원정 (₩400,000,000)');
  });

  it('omits the hangul notation when the amount text is not parseable', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ totalPrice: 35000 }),
      template: template({}),
    });

    const edited = { ...draft.fields, totalPriceText: '사억 상당' };
    const priceRow = getContractDocumentEngineSections('contract', edited)
      .find((section) => section.title === '3. 거래 조건')
      ?.rows.find((row) => row.label === '거래 금액');

    // 상반된 두 금액이 인쇄되지 않도록 병기를 생략하고 입력 텍스트만 출력
    assert.equal(priceRow?.value, '사억 상당');
  });

  it('recomputes *HangulText derived fields at merge (save) time', () => {
    const metadata = mergeContractDocumentEngineMetadata(
      {},
      {
        totalPriceText: '4억',
        totalPriceHangulText: '일금 삼억오천만원정 (₩350,000,000)', // stale 스냅샷
        salePrice: '20000',
        salePriceHangulText: '',
      },
    );

    const fields = (
      metadata.documentEngine as { fields: Record<string, string> }
    ).fields;
    assert.equal(fields.totalPriceHangulText, '일금 사억원정 (₩400,000,000)');
    assert.equal(fields.salePriceHangulText, '일금 이억원정 (₩200,000,000)');
  });

  it('parses formatted Korean amount text into 만원 정수', () => {
    assert.equal(parseContractManwonText('35000'), 35000);
    assert.equal(parseContractManwonText('35,000'), 35000);
    assert.equal(parseContractManwonText('3억 5,000만'), 35000);
    assert.equal(parseContractManwonText('4억'), 40000);
    assert.equal(parseContractManwonText('5000만원'), 5000);
    assert.equal(parseContractManwonText('사억'), null);
    assert.equal(parseContractManwonText('-3'), null);
    assert.equal(parseContractManwonText(''), null);
  });
});

describe('contract document engine — 주 서식 → 부속 서식 값 승계 (§3.3-3)', () => {
  it('inherits primary contract document fields into annex drafts', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract(),
      template: template({
        code: 'transaction_power_of_attorney',
        title: '부동산거래위임장',
        category: 'power_of_attorney',
      }),
      primaryDocument: {
        title: '아파트 매매 계약서',
        metadata: {
          documentEngine: {
            fields: {
              propertyAddress: '서울시 강동구 고덕동 123-4',
              salePrice: '85000',
              documentTitle: '아파트 매매 계약서',
              bodyText: '매매 본문 조항',
            },
          },
        },
      },
    });

    // 주 서식 입력값(소재지/금액)이 부속 서식 기본값으로 승계된다
    assert.equal(draft.fields.propertyAddress, '서울시 강동구 고덕동 123-4');
    assert.equal(draft.fields.salePrice, '85000');
    // 문서 고유 필드(제목/본문)는 승계하지 않는다
    assert.equal(draft.fields.documentTitle, '부동산거래위임장');
    assert.notEqual(draft.fields.bodyText, '매매 본문 조항');
  });

  it('keeps the annex document own saved fields over inherited primary values', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract(),
      template: template({
        code: 'transaction_power_of_attorney',
        title: '부동산거래위임장',
        category: 'power_of_attorney',
      }),
      document: {
        title: '부동산거래위임장',
        metadata: {
          documentEngine: {
            fields: { propertyAddress: '위임장에 별도 기재한 주소' },
          },
        },
      },
      primaryDocument: {
        title: '아파트 매매 계약서',
        metadata: {
          documentEngine: {
            fields: { propertyAddress: '서울시 강동구 고덕동 123-4' },
          },
        },
      },
    });

    assert.equal(draft.fields.propertyAddress, '위임장에 별도 기재한 주소');
  });
});

describe('contract document engine — ContractParty 반영', () => {
  it('prefers parties over buyer/seller contacts for party defaults', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ parties: parties() }),
      template: template({}),
    });

    assert.equal(draft.fields.partyOneName, '박임대');
    assert.equal(draft.fields.partyOneRole, '매도인');
    assert.equal(draft.fields.partyOnePhone, '010-9999-0000'); // mobilePhone 우선
    assert.equal(draft.fields.partyTwoName, '최매수');
  });

  it('renders repeated principals, nested agents, and office rows in sections', () => {
    const sections = getContractDocumentEngineSections(
      'contract',
      buildContractDocumentEngineDraft({
        contract: contract({ parties: parties() }),
        template: template({}),
      }).fields,
      { parties: parties() },
    );

    const partySection = sections.find(
      (section) => section.title === '2. 계약 당사자',
    );
    assert.ok(partySection);
    assert.deepEqual(
      partySection?.rows.map((row) => row.label),
      [
        '매도인 1',
        '매도인 1 대리인',
        '매도인 2',
        '매수인',
        '개업공인중개사',
        '공동중개 1',
      ],
    );

    const principal = partySection!.rows[0]!;
    assert.match(principal.value, /박임대/);
    // 마스킹된 idNumber 는 받은 그대로 표시
    assert.match(principal.value, /750101-1\*{6}/);
    assert.match(principal.value, /지분 2분의 1/);

    const agentRow = partySection!.rows[1]!;
    assert.match(agentRow.value, /김대리/);

    const officeRow = partySection!.rows[4]!;
    assert.match(officeRow.value, /행복공인중개사/);
    assert.match(officeRow.value, /등록번호 11740-2026-001/);
  });

  it('keeps the fields-based two-row fallback when parties are absent', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract(),
      template: template({}),
    });

    const partySection = draft.sections.find(
      (section) => section.title === '2. 계약 당사자',
    );
    assert.deepEqual(
      partySection?.rows.map((row) => row.label),
      ['매도인', '매수인'],
    );
    assert.match(partySection!.rows[0]!.value, /김매도/);
  });
});

describe('contract document engine — MySpider 등록 메타데이터와 연세', () => {
  it('prefers the recorded WebForm/report and applies the selected property subtype', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'yearly', monthlyRent: 2400 }),
      template: template({
        metadata: {
          mySpiderForm: ['ContractInputForm', 'ContractWebForm'],
          mySpiderReport: ['ApartmentTradeContractReport'],
          documentEngine: {
            fieldGroups: [
              {
                key: 'classification',
                title: '계약 종류',
                fields: [
                  { key: 'propertyClass', label: '타입', type: 'text' },
                  {
                    key: 'contractSubject',
                    label: '목적물 종별',
                    type: 'text',
                  },
                ],
              },
              {
                key: 'rent',
                title: '차임',
                fields: [
                  {
                    key: 'monthlyRent',
                    label: '월 차임',
                    type: 'amount',
                    appliesTo: ['monthly'],
                  },
                  {
                    key: 'annualRent',
                    label: '연 차임',
                    type: 'amount',
                    appliesTo: ['yearly'],
                  },
                ],
              },
            ],
          },
        },
      }),
      document: {
        title: '아파트 연세 계약서',
        metadata: {
          formRegistration: {
            groupLabel: '아파트',
            subjectDefault: '아파트',
            cntrClsf: '01',
            legacyTableName: 'TPCT01M',
          },
        },
      },
    });

    assert.equal(draft.workflow.inputFormName, 'ContractWebForm');
    assert.equal(draft.workflow.reportName, 'ApartmentTradeContractReport');
    assert.equal(draft.fields.propertyClass, '아파트');
    assert.equal(draft.fields.contractSubject, '아파트');
    assert.equal(draft.fields.annualRent, '2400');
    assert.ok(
      draft.fieldGroups.some((group) =>
        group.fields.some((field) => field.key === 'annualRent'),
      ),
    );
    assert.equal(
      draft.fieldGroups.some((group) =>
        group.fields.some((field) => field.key === 'monthlyRent'),
      ),
      false,
    );
    assert.equal(
      draft.sections.find((section) => section.title === '3. 거래 조건')
        ?.rows[3]?.label,
      '연 차임',
    );
  });
});

function metadataWithFieldGroups(): Record<string, unknown> {
  return {
    documentEngine: {
      version: 1,
      amountUnit: 'manwon',
      fieldGroups: [
        {
          key: 'paymentTerms',
          title: '계약내용 (금액 스케줄)',
          fields: [
            {
              key: 'salePrice',
              label: '매매대금',
              type: 'amount',
              unit: '만원',
              appliesTo: ['sale'],
            },
            {
              key: 'deposit',
              label: '보증금',
              type: 'amount',
              unit: '만원',
              appliesTo: ['jeonse', 'monthly'],
            },
            {
              key: 'loanHandling',
              label: '융자금 처리',
              type: 'select',
              options: ['승계', '말소'],
              appliesTo: ['sale'],
            },
            { key: 'balancePaymentDate', label: '잔금 지급일', type: 'date' },
          ],
        },
        {
          key: 'specialTerms',
          title: '특약사항',
          fields: [
            { key: 'specialTerms', label: '특약사항', type: 'textarea' },
            {
              key: 'includePrivacyClause',
              label: '개인정보 동의 문구 삽입',
              type: 'checkbox',
            },
          ],
        },
      ],
    },
  };
}

function parties(): ContractDocumentEngineParty[] {
  return [
    {
      side: 'one',
      subId: 1,
      role: null,
      name: '박임대',
      idNumber: '750101-1******',
      address: '서울시 강동구 고덕동',
      phone: '02-123-4567',
      mobilePhone: '010-9999-0000',
      sharePercent: '2분의 1',
      parentId: null,
      agents: [
        {
          side: 'one',
          name: '김대리',
          agentLabel: '대리인',
          idNumber: '800505-2******',
          parentId: 'party-one-1',
        },
      ],
    },
    {
      side: 'one',
      subId: 2,
      name: '박공동',
      sharePercent: '2분의 1',
      parentId: null,
    },
    {
      side: 'two',
      subId: 1,
      name: '최매수',
      address: '서울시 송파구',
      phone: '010-2222-3333',
      parentId: null,
    },
    {
      side: 'office',
      subId: 1,
      name: '홍대표',
      officeName: '행복공인중개사',
      officeRegNo: '11740-2026-001',
      address: '서울시 강동구 상일동',
      phone: '02-444-5555',
      parentId: null,
    },
    {
      side: 'office',
      subId: 2,
      name: '이대표',
      officeName: '튼튼공인중개사',
      officeRegNo: '11710-2026-002',
      parentId: null,
    },
  ];
}

function template(
  overrides: Partial<ContractDocumentEngineTemplate> = {},
): ContractDocumentEngineTemplate {
  return {
    id: 'template-1',
    code: 'base_contract',
    title: '매매 계약서',
    category: 'contract',
    metadata: {},
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
    monthlyRent: null,
    contractDate: '2026-05-02T00:00:00.000Z',
    statedDeposit: 10000,
    statedInterimPayment: null,
    statedInterimDate: null,
    statedBalance: 148000,
    statedBalanceDate: '2026-06-30T00:00:00.000Z',
    moveInDate: '2026-06-30T00:00:00.000Z',
    leaseStartDate: null,
    leaseEndDate: null,
    specialTerms: '현 시설물 상태에서 계약한다.',
    memo: null,
    buyerContact: {
      name: '이매수',
      phone: '010-2222-3333',
      address: '서울시 서초구',
    },
    sellerContact: {
      name: '김매도',
      phone: '010-1111-2222',
      address: '서울시 강남구',
    },
    deal: {
      property: {
        site: {
          name: '반포자이',
          roadAddress: '서울시 서초구 반포대로 1',
          jibunAddress: '서울시 서초구 반포동 1',
        },
        unit: {
          name: '1001호',
          exclusiveAreaM2: 84.95,
          supplyAreaM2: 112.4,
          dong: {
            name: '101동',
          },
        },
      },
    },
    ...overrides,
  };
}
