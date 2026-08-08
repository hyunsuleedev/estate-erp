import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildContractDocumentEngineDraft,
  buildResidentialSaleAgreement,
  mergeContractDocumentEngineMetadata,
  type ContractDocumentEngineContract,
  type ContractDocumentEngineTemplate,
} from '../src/routes/_authenticated/contracts/-document-engine';
import { mergeResidentialSaleAgreementMetadata } from '@estate-erp/shared';

describe('contract document engine', () => {
  it('builds a sale contract draft from contract, deal, and party data', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract(),
      template: template({ title: '매매 계약서', category: 'contract' }),
      baseDate: new Date('2026-05-03T00:00:00.000Z'),
    });

    assert.equal(draft.title, '매매 계약서');
    assert.equal(draft.fields.documentTitle, '매매 계약서');
    assert.equal(draft.fields.writtenDate, '2026.05.03');
    assert.equal(draft.fields.partyOneRole, '매도인');
    assert.equal(draft.fields.partyOneName, '김매도');
    assert.equal(draft.fields.partyTwoRole, '매수인');
    assert.equal(draft.fields.partyTwoName, '이매수');
    assert.equal(draft.fields.propertyLabel, '반포자이 101동 1001호');
    assert.equal(draft.fields.totalPriceText, '15억 8,000만');
    assert.match(draft.fields.paymentSchedule, /계약금 1억/);
    assert.match(draft.fields.paymentSchedule, /잔금 14억 8,000만/);
  });

  it('selects MySpider-style input forms and report classes by document code', () => {
    const standardLease = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'monthly' }),
      template: template({
        code: 'standard_lease_contract',
        title: '표준임대차계약서',
        category: 'contract',
      }),
    });

    assert.equal(standardLease.workflow.inputFormName, 'StandardLeaseContractInputForm');
    assert.equal(standardLease.workflow.reportName, 'StandardLeaseContractReport');

    const explanation = buildContractDocumentEngineDraft({
      contract: contract(),
      template: template({
        code: 'broker_explanation_residential',
        title: '중개대상물 확인설명서 주거용',
        category: 'explanation',
      }),
    });

    assert.equal(explanation.workflow.inputFormName, 'ConfirmExplanationInputForm1');
    assert.equal(explanation.workflow.reportName, 'MediationTargetConfrimExplanation1Report');
  });

  it('lets stored document engine fields override generated defaults', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract(),
      template: template({
        title: '중개대상물 확인설명서',
        category: 'explanation',
      }),
      document: {
        title: '저장된 확인설명서',
        metadata: {
          source: 'legacy-import',
          documentEngine: {
            version: 1,
            fields: {
              officeNotice: '계약 전 등기부등본을 다시 확인하세요.',
              confirmationMemo: '근저당 말소 특약 확인 필요',
            },
          },
        },
      },
      baseDate: new Date('2026-05-03T00:00:00.000Z'),
    });

    assert.equal(draft.title, '저장된 확인설명서');
    assert.equal(draft.fields.officeNotice, '계약 전 등기부등본을 다시 확인하세요.');
    assert.equal(draft.fields.confirmationMemo, '근저당 말소 특약 확인 필요');
  });

  it('renders stored template body and source guidance as editable document fields', () => {
    const draft = buildContractDocumentEngineDraft({
      contract: contract({ transactionType: 'monthly' }),
      template: template({
        code: 'standard_lease_contract',
        title: '표준임대차계약서',
        category: 'contract',
        metadata: {
          documentEngine: {
            version: 1,
            fields: {
              bodyText: '제1조 임대인은 목적물을 임차인에게 인도하고 임차인은 차임을 지급한다.',
              legalBasisText: '법무부 주택임대차표준계약서 공개 서식을 기준으로 검토한다.',
              sourceNotice: '테스트 템플릿이며 계약 전 최신 공식 서식을 확인한다.',
            },
          },
        },
      }),
    });

    assert.equal(draft.fields.bodyText, '제1조 임대인은 목적물을 임차인에게 인도하고 임차인은 차임을 지급한다.');
    assert.equal(draft.fields.sourceNotice, '테스트 템플릿이며 계약 전 최신 공식 서식을 확인한다.');
    assert.ok(draft.fieldGroups.some((group) => group.fields.some((field) => field.key === 'bodyText')));
    assert.ok(
      draft.sections.some((section) => section.rows.some((row) => row.value.includes('제1조 임대인은 목적물을'))),
    );
  });

  it('merges edited engine fields into existing metadata without dropping unrelated data', () => {
    assert.deepEqual(
      mergeContractDocumentEngineMetadata(
        {
          source: 'legacy-import',
          documentEngine: {
            version: 1,
            fields: {
              officeNotice: 'old',
            },
          },
        },
        {
          documentTitle: '표준임대차 계약서',
          officeNotice: '새 안내 문구',
        },
      ),
      {
        source: 'legacy-import',
        documentEngine: {
          version: 1,
          fields: {
            documentTitle: '표준임대차 계약서',
            officeNotice: '새 안내 문구',
          },
        },
      },
    );
  });

  it('builds the residential sale agreement from the contract snapshot', () => {
    const agreement = buildResidentialSaleAgreement(
      contract({
        office: {
          name: '우리동네 중개사무소',
          licenseNo: '11680-2026-00123',
          ceoName: '박중개',
          address: '서울시 강남구 테헤란로 1',
          phone: '02-1234-5678',
        },
        sellerContact: {
          id: 'seller-1',
          name: '김매도',
          phone: '010-0000-0000',
          address: '서울시 강남구',
          phones: [
            {
              phone: '010-1111-2222',
              isPrimary: true,
            },
          ],
        },
      }),
      template({ code: 'base_contract' }),
    );

    assert.ok(agreement);
    assert.equal(agreement.actualAgreementAt, '2026-05-02');
    assert.equal(agreement.property.roadAddress, '서울시 서초구 반포대로 1');
    assert.equal(agreement.property.targetDescription, '반포자이 101동 1001호');
    assert.equal(agreement.property.buildingAreaM2, 84.95);
    assert.equal(agreement.payment.totalPriceManwon, 158000);
    assert.equal(agreement.sellers[0]?.phone, '010-1111-2222');
    assert.equal(agreement.brokerage.officeName, '우리동네 중개사무소');
    assert.equal(agreement.brokerage.registrationNo, '11680-2026-00123');
    assert.equal(agreement.specialTerms, '현 시설물 상태에서 계약한다.');
  });

  it('restores a stored sale agreement and keeps unrelated engine metadata', () => {
    const initial = buildResidentialSaleAgreement(contract(), template({ code: 'base_contract' }));
    assert.ok(initial);

    const metadata = mergeResidentialSaleAgreementMetadata(
      {
        source: 'legacy-import',
        documentEngine: { version: 1, fields: { documentTitle: '매매계약서' } },
      },
      { ...initial, specialTerms: '저장된 특약' },
    );
    const restored = buildResidentialSaleAgreement(
      contract({ specialTerms: '계약 기본 특약' }),
      template({ code: 'base_contract' }),
      { metadata },
    );

    assert.equal(restored?.specialTerms, '저장된 특약');
    assert.equal(metadata.source, 'legacy-import');
    assert.deepEqual(metadata.documentEngine, {
      version: 1,
      fields: { documentTitle: '매매계약서' },
    });
  });

  it('only enables the dedicated agreement for the base sale contract', () => {
    assert.equal(
      buildResidentialSaleAgreement(contract({ transactionType: 'monthly' }), template({ code: 'base_contract' })),
      null,
    );
    assert.equal(buildResidentialSaleAgreement(contract(), template({ code: 'broker_explanation' })), null);
  });
});

function template(overrides: Partial<ContractDocumentEngineTemplate> = {}): ContractDocumentEngineTemplate {
  return {
    id: 'template-1',
    code: 'sale-contract',
    title: '계약서',
    category: 'contract',
    metadata: {},
    ...overrides,
  };
}

function contract(overrides: Partial<ContractDocumentEngineContract> = {}): ContractDocumentEngineContract {
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
