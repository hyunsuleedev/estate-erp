import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createResidentialSaleAgreementDraft,
  mergeResidentialSaleAgreementMetadata,
  readResidentialSaleAgreement,
  validateResidentialSaleAgreement,
} from '../src/contract-agreement.ts';

describe('residential sale agreement', () => {
  it('derives the balance and builds party snapshots', () => {
    const draft = createResidentialSaleAgreementDraft({
      actualAgreementAt: '2026-07-13T08:00:00.000Z',
      property: {
        roadAddress: '서울특별시 서초구 반포대로 1',
        targetDescription: '101동 1001호',
      },
      payment: {
        totalPriceManwon: 158000,
        depositManwon: 10000,
        interimManwon: 48000,
      },
      seller: { name: '김매도' },
      buyer: { name: '이매수' },
    });

    assert.equal(draft.actualAgreementAt, '2026-07-13');
    assert.equal(draft.writtenAt, '2026-07-13');
    assert.equal(draft.payment.balanceManwon, 100000);
    assert.equal(draft.sellers[0]?.name, '김매도');
    assert.equal(draft.buyers[0]?.name, '이매수');
  });

  it('reports legal-field and payment-total errors before generation', () => {
    const draft = createResidentialSaleAgreementDraft({
      actualAgreementAt: '2026-07-13',
      property: {
        roadAddress: '서울특별시 서초구 반포대로 1',
        targetDescription: '101동 1001호',
      },
      payment: {
        totalPriceManwon: 100000,
        depositManwon: 10000,
        balanceManwon: 80000,
        balanceDueAt: '2026-08-31',
      },
      seller: { name: '김매도', address: '서울시 강남구' },
      buyer: { name: '이매수', address: '서울시 서초구' },
      brokerage: {
        officeName: '우리동네공인중개사사무소',
        registrationNo: '11650-2026-00001',
        representativeName: '박중개',
      },
      transfer: {
        deliveryAt: '2026-08-31',
        ownershipTransferAt: '2026-08-31',
        rightsTransferDetails: '잔금과 동시에 소유권이전등기 서류를 교부한다.',
        explanationDeliveredAt: '2026-07-13',
      },
    });

    const validation = validateResidentialSaleAgreement(draft);

    assert.equal(validation.isReadyForGeneration, false);
    assert.ok(
      validation.errors.some((issue) => issue.path === 'payment'),
      'payment sum mismatch must block generation',
    );
  });

  it('round-trips the versioned agreement without dropping other metadata', () => {
    const draft = createResidentialSaleAgreementDraft({
      actualAgreementAt: '2026-07-13',
      seller: { name: '김매도' },
      buyer: { name: '이매수' },
    });
    const metadata = mergeResidentialSaleAgreementMetadata({ source: 'mcp:Codex' }, draft);

    assert.equal(metadata.source, 'mcp:Codex');
    assert.deepEqual(readResidentialSaleAgreement(metadata), draft);
  });
});
