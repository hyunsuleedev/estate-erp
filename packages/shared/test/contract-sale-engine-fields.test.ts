import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createResidentialSaleAgreementDraft,
  mergeResidentialSaleAgreementMetadata,
  validateResidentialSaleAgreement,
} from '../src/contract-agreement.js';
import {
  applyEngineFieldsToResidentialSaleAgreement,
  convertResidentialSaleAgreementToEngineFields,
  validateBaseContractSaleEngineFields,
  CONTRACT_DOCUMENT_ENGINE_DEFAULT_PRINT_OPTIONS,
} from '../src/contract-document-engine.js';

function snapshotMetadata() {
  const agreement = createResidentialSaleAgreementDraft({
    actualAgreementAt: '2026-07-01',
    property: {
      roadAddress: '경기도 구리시 수택동 437',
      jibunAddress: '경기도 구리시 수택동 437-1',
      targetDescription: '수택센트럴파크 108동 1803호',
      landCategory: '대',
      landAreaM2: 35364.6,
      buildingStructure: '철근콘크리트구조',
      buildingUse: '아파트',
      buildingAreaM2: 59.959,
    },
    payment: {
      totalPriceManwon: 99000,
      depositManwon: 9900,
      interimManwon: 10000,
      interimDueAt: '2026-07-30',
      balanceDueAt: '2026-09-10',
    },
    transfer: {
      deliveryAt: '2026-09-10',
    },
    seller: {
      name: '김매도',
      identificationNoMasked: '800101-1******',
      address: '서울시 강동구',
      phone: '010-1111-2222',
    },
    buyer: {
      name: '박매수',
      address: '서울시 송파구',
      phone: '010-3333-4444',
    },
    brokerage: {
      officeName: '대림공인중개사',
      registrationNo: '11740-2026-00001',
      representativeName: '이대표',
      address: '서울시 강동구 고덕동',
      phone: '02-123-4567',
      associateName: '최소속',
    },
    specialTerms: '현 시설물 상태의 계약임.',
  });

  return mergeResidentialSaleAgreementMetadata({ existingKey: 1 }, agreement);
}

describe('매매초안(residentialSaleAgreement) → engineFields 변환', () => {
  it('returns null when metadata has no snapshot', () => {
    assert.equal(convertResidentialSaleAgreementToEngineFields(null), null);
    assert.equal(convertResidentialSaleAgreementToEngineFields({}), null);
    assert.equal(
      convertResidentialSaleAgreementToEngineFields({
        documentEngine: { fields: { salePrice: '99000' } },
      }),
      null,
    );
  });

  it('maps snapshot values onto catalog base_contract engineFields keys (전부 string)', () => {
    const fields = convertResidentialSaleAgreementToEngineFields(snapshotMetadata());

    assert.ok(fields);
    // 부동산 표시
    assert.equal(fields!.contractDate, '2026-07-01');
    assert.equal(fields!.propertyAddress, '경기도 구리시 수택동 437');
    assert.equal(fields!.propertyLabel, '수택센트럴파크 108동 1803호');
    assert.equal(fields!.landCategory, '대');
    assert.equal(fields!.landArea, '35364.6');
    assert.equal(fields!.buildingStructure, '철근콘크리트구조');
    assert.equal(fields!.buildingUse, '아파트');
    assert.equal(fields!.buildingArea, '59.959');

    // 금액 스케줄 — 만원 Int 문자열, 잔금은 스냅샷 파생값(99000-9900-10000)
    assert.equal(fields!.salePrice, '99000');
    assert.equal(fields!.downPayment, '9900');
    assert.equal(fields!.interimPayment, '10000');
    assert.equal(fields!.interimPaymentDate, '2026-07-30');
    assert.equal(fields!.balancePayment, '79100');
    assert.equal(fields!.balancePaymentDate, '2026-09-10');
    assert.equal(fields!.handoverDate, '2026-09-10');

    // 당사자/중개사무소/특약
    assert.equal(fields!.partyOneName, '김매도');
    assert.equal(fields!.partyOneIdNumber, '800101-1******');
    assert.equal(fields!.partyOneAddress, '서울시 강동구');
    assert.equal(fields!.partyOnePhone, '010-1111-2222');
    assert.equal(fields!.partyTwoName, '박매수');
    assert.equal(fields!.brokerOfficeName, '대림공인중개사');
    assert.equal(fields!.brokerOfficeRegNo, '11740-2026-00001');
    assert.equal(fields!.brokerCeoName, '이대표');
    assert.equal(fields!.brokerOfficeAddress, '서울시 강동구 고덕동');
    assert.equal(fields!.brokerAgentName, '최소속');
    assert.equal(fields!.specialTerms, '현 시설물 상태의 계약임.');

    // 전부 string 관례
    for (const [key, value] of Object.entries(fields!)) {
      assert.equal(typeof value, 'string', `${key} must be string`);
    }
  });

  it('omits empty values so contract-derived defaults are not clobbered', () => {
    const agreement = createResidentialSaleAgreementDraft({
      actualAgreementAt: '2026-07-01',
      payment: { totalPriceManwon: 50000 },
    });
    const fields = convertResidentialSaleAgreementToEngineFields(
      mergeResidentialSaleAgreementMetadata(null, agreement),
    )!;

    assert.equal(fields.salePrice, '50000');
    assert.ok(!('downPayment' in fields), 'empty 계약금 must not emit a key');
    assert.ok(!('propertyAddress' in fields));
    assert.ok(!('partyOneName' in fields));
  });

  it('validates cleanly on converted snapshot fields (이관 하위호환)', () => {
    const fields = convertResidentialSaleAgreementToEngineFields(snapshotMetadata())!;
    const validation = validateBaseContractSaleEngineFields(fields);

    assert.deepEqual(validation.errors, []);
    assert.equal(validation.isValid, true);
  });
});

describe('validateBaseContractSaleEngineFields — 금액 합계·필수 일자', () => {
  const validFields = {
    salePrice: '99000',
    downPayment: '9900',
    interimPayment: '10000',
    interimPaymentDate: '2026-07-30',
    balancePayment: '79100',
    balancePaymentDate: '2026-09-10',
    contractDate: '2026-07-01',
    handoverDate: '2026-09-10',
    propertyAddress: '경기도 구리시 수택동 437',
    partyOneName: '김매도',
    partyTwoName: '박매수',
  };

  it('passes a consistent payment schedule', () => {
    const validation = validateBaseContractSaleEngineFields(validFields);
    assert.deepEqual(validation.errors, []);
    assert.deepEqual(validation.warnings, []);
    assert.equal(validation.isValid, true);
  });

  it('accepts 콤마/억 표기 amounts (parseContractManwonText 관용 파싱)', () => {
    const validation = validateBaseContractSaleEngineFields({
      ...validFields,
      salePrice: '9억 9000만',
      downPayment: '9,900',
    });
    assert.deepEqual(validation.errors, []);
  });

  it('flags 계약금+중도금+잔금 합계 ≠ 매매대금', () => {
    const validation = validateBaseContractSaleEngineFields({
      ...validFields,
      balancePayment: '70000',
    });

    assert.equal(validation.isValid, false);
    assert.ok(validation.errors.some((issue) => issue.path === 'payment'));
  });

  it('includes 2차 중도금 in the payment sum', () => {
    const validation = validateBaseContractSaleEngineFields({
      ...validFields,
      interimPayment2: '5000',
      interimPayment2Date: '2026-08-15',
      balancePayment: '74100',
    });
    assert.deepEqual(validation.errors, []);
  });

  it('requires 매매대금 and the 필수 일자 (계약일/잔금일/인도일)', () => {
    const validation = validateBaseContractSaleEngineFields({});
    const paths = validation.errors.map((issue) => issue.path);

    assert.ok(paths.includes('salePrice'));
    assert.ok(paths.includes('contractDate'));
    assert.ok(paths.includes('balancePaymentDate'));
    assert.ok(paths.includes('handoverDate'));
    assert.equal(validation.isValid, false);
  });

  it('requires 중도금 지급일 when 중도금 금액이 있다 (1차·2차)', () => {
    const validation = validateBaseContractSaleEngineFields({
      ...validFields,
      interimPaymentDate: '',
      interimPayment2: '5000',
      balancePayment: '74100',
    });
    const paths = validation.errors.map((issue) => issue.path);

    assert.ok(paths.includes('interimPaymentDate'));
    assert.ok(paths.includes('interimPayment2Date'));
  });

  it('rejects unparseable amount text (모순 인쇄 방지)', () => {
    const validation = validateBaseContractSaleEngineFields({
      ...validFields,
      interimPayment: '만원 어치',
    });

    assert.ok(validation.errors.some((issue) => issue.path === 'interimPayment'));
  });

  it('warns on missing 소재지/당사자 성명 (경고 — 저장은 차단하지 않음)', () => {
    const validation = validateBaseContractSaleEngineFields({
      ...validFields,
      propertyAddress: '',
      partyOneName: '',
      partyTwoName: '',
    });

    assert.equal(validation.errors.length, 0);
    assert.deepEqual(
      validation.warnings.map((issue) => issue.path).sort(),
      ['partyOneName', 'partyTwoName', 'propertyAddress'],
    );
  });

  it('skips handoverDate requirement when directClause2 (계약사항2조 직접입력 — 입력이 숨겨짐)', () => {
    const validation = validateBaseContractSaleEngineFields(
      { ...validFields, handoverDate: '' },
      {
        ...CONTRACT_DOCUMENT_ENGINE_DEFAULT_PRINT_OPTIONS,
        directClause2: true,
      },
    );

    assert.ok(!validation.errors.some((issue) => issue.path === 'handoverDate'));
    assert.equal(validation.isValid, true);
  });

  it('still requires handoverDate without directClause2 (printOptions 를 넘겨도 동일)', () => {
    const validation = validateBaseContractSaleEngineFields(
      { ...validFields, handoverDate: '' },
      { ...CONTRACT_DOCUMENT_ENGINE_DEFAULT_PRINT_OPTIONS },
    );

    assert.ok(validation.errors.some((issue) => issue.path === 'handoverDate'));
  });
});

describe('engineFields → residentialSaleAgreement 역반영 (조항 에디터 저장 시 스냅샷 재생성)', () => {
  it('returns null when metadata has no snapshot — 신규 조항 문서는 스냅샷을 만들지 않음', () => {
    assert.equal(applyEngineFieldsToResidentialSaleAgreement(null, { salePrice: '99000' }), null);
    assert.equal(
      applyEngineFieldsToResidentialSaleAgreement(
        { documentEngine: { fields: { salePrice: '99000' } } },
        { salePrice: '99000' },
      ),
      null,
    );
  });

  it('overlays edited engineFields; snapshot-only fields 는 보존한다', () => {
    const agreement = applyEngineFieldsToResidentialSaleAgreement(snapshotMetadata(), {
      contractDate: '2026-07-05',
      propertyAddress: '경기도 구리시 수택동 437',
      propertyLabel: '수택센트럴파크 108동 1803호',
      salePrice: '100000',
      downPayment: '10000',
      interimPayment: '10000',
      interimPaymentDate: '2026-08-01',
      balancePayment: '80000',
      balancePaymentDate: '2026-09-20',
      handoverDate: '2026-09-20',
      partyOneName: '김매도',
      partyTwoName: '박매수',
      brokerOfficeName: '대림공인중개사',
      brokerOfficeRegNo: '11740-2026-00001',
      brokerCeoName: '이대표',
      brokerOfficeAddress: '서울시 강동구 고덕동',
      brokerAgentName: '최소속',
      specialTerms: '변경된 특약',
    })!;

    assert.ok(agreement);
    // 편집값 반영
    assert.equal(agreement.actualAgreementAt, '2026-07-05');
    assert.equal(agreement.payment.totalPriceManwon, 100000);
    assert.equal(agreement.payment.depositManwon, 10000);
    assert.equal(agreement.payment.balanceManwon, 80000);
    assert.equal(agreement.payment.balanceDueAt, '2026-09-20');
    assert.equal(agreement.transfer.deliveryAt, '2026-09-20');
    assert.equal(agreement.specialTerms, '변경된 특약');
    // engineFields 에 대응 키가 없는 스냅샷 필드는 보존
    assert.equal(agreement.writtenAt, '2026-07-01');
    assert.equal(agreement.payment.depositDueAt, '2026-07-01');
    assert.equal(agreement.brokerage.phone, '02-123-4567');
    assert.equal(agreement.property.jibunAddress, '경기도 구리시 수택동 437-1');
    // 도로명주소 왕복 안정성 (propertyAddress = roadAddress 케이스)
    assert.equal(agreement.property.roadAddress, '경기도 구리시 수택동 437');
    // 대표 당사자 식별정보(스냅샷 마스킹 값) 보존 — engineFields 미제공 시 빈 값으로 지워짐이
    // 아니라 overlay 는 항상 세팅하므로, 이 테스트에선 partyOneIdNumber 미제공 → '' 반영
    assert.equal(agreement.sellers[0].identificationNoMasked, '');
  });

  it('sums 2차 중도금 into interimManwon (v1 스키마 합계 검증 정합)', () => {
    const agreement = applyEngineFieldsToResidentialSaleAgreement(snapshotMetadata(), {
      contractDate: '2026-07-01',
      salePrice: '99000',
      downPayment: '9900',
      interimPayment: '5000',
      interimPaymentDate: '2026-07-30',
      interimPayment2: '5000',
      interimPayment2Date: '2026-08-30',
      balancePayment: '79100',
      balancePaymentDate: '2026-09-10',
      handoverDate: '2026-09-10',
    })!;

    assert.equal(agreement.payment.interimManwon, 10000);
    assert.equal(agreement.payment.interimDueAt, '2026-07-30');
    // 합계 = 매매대금 — 스냅샷 검증에서 payment 오류가 나지 않아야 한다
    const validation = validateResidentialSaleAgreement(agreement);
    assert.ok(!validation.errors.some((issue) => issue.path === 'payment'));
  });

  it('clears amounts the user removed (빈 값이 stale 스냅샷 값을 유지하지 않음)', () => {
    const agreement = applyEngineFieldsToResidentialSaleAgreement(snapshotMetadata(), {
      salePrice: '99000',
      downPayment: '',
      interimPayment: '',
      balancePayment: '',
    })!;

    assert.equal(agreement.payment.depositManwon, null);
    assert.equal(agreement.payment.interimManwon, null);
    // 잔금은 스키마 생성기가 매매대금 기준으로 파생 (기존 create 동작 유지)
    assert.equal(agreement.payment.balanceManwon, 99000);
  });

  it('preserves stored 인도일 when directClause2 hides the input (빈 값 삭제 방지)', () => {
    const preserved = applyEngineFieldsToResidentialSaleAgreement(
      snapshotMetadata(),
      { handoverDate: '' },
      { ...CONTRACT_DOCUMENT_ENGINE_DEFAULT_PRINT_OPTIONS, directClause2: true },
    )!;
    assert.equal(preserved.transfer.deliveryAt, '2026-09-10');

    // directClause2 가 아니면 빈 값은 사용자가 지운 것 — 스냅샷에서도 지운다
    const cleared = applyEngineFieldsToResidentialSaleAgreement(snapshotMetadata(), {
      handoverDate: '',
    })!;
    assert.equal(cleared.transfer.deliveryAt, '');
  });

  it('convert → apply 왕복이 스냅샷 검증을 통과한다 (이관 후 즉시 저장 시나리오)', () => {
    const metadata = snapshotMetadata();
    const fields = convertResidentialSaleAgreementToEngineFields(metadata)!;
    const agreement = applyEngineFieldsToResidentialSaleAgreement(metadata, fields)!;

    assert.equal(agreement.payment.totalPriceManwon, 99000);
    assert.equal(agreement.payment.depositManwon, 9900);
    assert.equal(agreement.payment.interimManwon, 10000);
    assert.equal(agreement.payment.balanceManwon, 79100);
    assert.equal(agreement.transfer.deliveryAt, '2026-09-10');
    assert.equal(agreement.sellers[0].name, '김매도');
    assert.equal(agreement.sellers[0].identificationNoMasked, '800101-1******');
    assert.equal(agreement.buyers[0].name, '박매수');
    assert.equal(agreement.brokerage.officeName, '대림공인중개사');
    const validation = validateResidentialSaleAgreement(agreement);
    assert.ok(!validation.errors.some((issue) => issue.path === 'payment'));
  });
});
