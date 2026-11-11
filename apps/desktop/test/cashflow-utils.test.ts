import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LedgerDealGroup, LedgerPayment } from '@estate-erp/api-client';
import {
  adjustmentProblem,
  billableAmount,
  buildTodayQueue,
  buildTrendBars,
  checkReceivedAmount,
  collectPercent,
  countsAsBilled,
  currentShares,
  dealLocation,
  displayStatus,
  effectiveDueDate,
  isDistributionEditable,
  isFullyCollected,
  isOpenPayment,
  isPaymentOverdue,
  monthContracts,
  monthlyExpenseAmount,
  monthlyOwed,
  nextCollectedTotal,
  ourRatioFrom,
  participantSettlement,
  partnerBalance,
  partnerIdOf,
  paymentOfAdjustment,
  paymentRemaining,
  paymentWithAdjustment,
  planDealDistribution,
  receivedAmount,
  relativeDueLabel,
  rollupPayments,
  shareRowAmounts,
  shareTotals,
  splitAmount,
  stepMonth,
  toCsv,
  worstStatus,
} from '../src/renderer/routes/_authenticated/cashflow/-cashflow-utils';

const NOW = new Date(2026, 10, 4, 15, 0);
const day = (m: number, d: number, y = 2026) => new Date(y, m - 1, d).toISOString();

function payment(overrides: Partial<LedgerPayment> = {}): LedgerPayment {
  return {
    id: 'p1',
    code: 'CP-1',
    clientSide: 'seller',
    collectedByOffice: 'us',
    baseAmount: null,
    rate: null,
    expectedAmount: 470,
    actualAmount: null,
    dueDate: day(11, 12),
    paidAt: null,
    agreedRemainingDate: null,
    status: 'pending',
    method: null,
    note: null,
    taxInvoiceStatus: 'none',
    taxInvoiceNo: null,
    distributions: [],
    pendingAdjustments: 0,
    ...overrides,
  };
}

function group(
  payments: LedgerPayment[],
  deal: Partial<LedgerDealGroup['deal']> = {},
): LedgerDealGroup {
  return {
    deal: {
      id: 'd1',
      transactionType: 'sale',
      stage: 'settling',
      stageChangedAt: day(11, 2),
      isCancelled: false,
      agreedPrice: null,
      agreedDeposit: null,
      agreedMonthlyRent: null,
      balanceDueDate: null,
      siteName: '고덕그라시움',
      dongName: '105동',
      unitName: '1203호',
      buyerContactName: null,
      sellerContactName: null,
      partnerBroker: null,
      summary: { billed: 0, ourShare: 0, partnerShare: 0, collected: 0 },
      participants: [],
      ...deal,
    },
    payments,
  };
}

describe('청구 금액과 기한', () => {
  it('부분수금 잔액은 받은 돈을 뺀 금액이고, 수금완료와 면제는 0이다', () => {
    assert.equal(
      paymentRemaining(payment({ status: 'partial', actualAmount: 100 })),
      370,
    );
    assert.equal(
      paymentRemaining(payment({ status: 'collected', actualAmount: 470 })),
      0,
    );
    assert.equal(paymentRemaining(payment({ status: 'waived' })), 0);
  });

  it('서버가 금액을 덮어쓰므로 이어 받은 돈은 누적액으로 보낸다', () => {
    assert.equal(nextCollectedTotal(payment({ actualAmount: 500 }), 290), 790);
    assert.equal(nextCollectedTotal(payment(), 470), 470);
  });

  it('받은 금액은 남은 금액을 넘거나 만원 단위 정수가 아니면 받지 않는다', () => {
    assert.equal(checkReceivedAmount(290, 290), null);
    assert.equal(checkReceivedAmount(790, 290), 'over');
    assert.equal(checkReceivedAmount(10.5, 290), 'fraction');
    assert.equal(checkReceivedAmount(0, 290), 'empty');
    assert.equal(checkReceivedAmount(Number.NaN, 290), 'empty');
  });

  it('할인으로 남은 돈이 없어지면 부분수금이어도 다 받은 것으로 본다', () => {
    const paid = payment({
      status: 'partial',
      actualAmount: 500,
      expectedAmount: 500,
      dueDate: day(10, 1),
    });
    assert.equal(isOpenPayment(paid), false);
    assert.equal(isPaymentOverdue(paid, null, NOW), false);
    assert.equal(displayStatus(paid, null, NOW), 'collected');
    assert.equal(paymentRemaining(paid), 0);
    // 이미 받은 돈보다 청구가 더 줄어도 잔액은 0이다.
    assert.equal(
      paymentRemaining(
        payment({ status: 'partial', actualAmount: 500, expectedAmount: 400 }),
      ),
      0,
    );
    assert.equal(
      buildTodayQueue([group([paid])], NOW).overdue.length,
      0,
    );
  });

  it('수금률은 100%를 넘지 않고 청구가 없으면 0이다', () => {
    assert.equal(collectPercent(130, 100), 100);
    assert.equal(collectPercent(50, 100), 50);
    assert.equal(collectPercent(10, 0), 0);
  });

  it('부분수금은 약속일, 나머지는 예정일, 없으면 잔금일을 기한으로 본다', () => {
    const agreed = day(11, 16);
    assert.equal(
      effectiveDueDate(payment({ status: 'partial', agreedRemainingDate: agreed })),
      agreed,
    );
    const balance = day(11, 20);
    assert.equal(effectiveDueDate(payment({ dueDate: null }), balance), balance);
  });

  it('기한이 지난 수금대기와 약속일이 지난 부분수금은 연체로 보여 준다', () => {
    const past = payment({ dueDate: day(10, 28) });
    assert.equal(isPaymentOverdue(past, null, NOW), true);
    assert.equal(displayStatus(past, null, NOW), 'overdue');
    assert.equal(
      displayStatus(
        payment({ status: 'partial', agreedRemainingDate: day(11, 1) }),
        null,
        NOW,
      ),
      'overdue',
    );
    // 오늘이 기한이면 아직 연체가 아니다.
    assert.equal(isPaymentOverdue(payment({ dueDate: day(11, 4) }), null, NOW), false);
    assert.equal(
      displayStatus(payment({ status: 'collected', dueDate: day(10, 1) }), null, NOW),
      'collected',
    );
  });

  it('기한 표기는 오늘, D-n, n일 경과로 쓴다', () => {
    assert.equal(relativeDueLabel(day(11, 4), NOW), '오늘');
    assert.equal(relativeDueLabel(day(11, 12), NOW), 'D-8');
    assert.equal(relativeDueLabel(day(10, 28), NOW), '7일 경과');
  });
});

describe('거래 합계', () => {
  it('면제와 취소는 합계에서 빼고, 수금은 실제 받은 금액을 더한다', () => {
    assert.deepEqual(
      rollupPayments([
        payment({ status: 'collected', actualAmount: 470 }),
        payment({ status: 'partial', actualAmount: 100 }),
        payment({ status: 'waived' }),
      ]),
      { billed: 940, collected: 570, remaining: 370 },
    );
  });

  it('연체가 하나라도 있으면 거래 전체를 연체로 표시한다', () => {
    assert.equal(
      worstStatus(
        group([
          payment({ status: 'collected', actualAmount: 470 }),
          payment({ dueDate: day(10, 1) }),
        ]),
        NOW,
      ),
      'overdue',
    );
    assert.equal(
      worstStatus(group([payment({ status: 'collected', actualAmount: 470 })]), NOW),
      'collected',
    );
  });

  it('전부 면제된 거래는 수금완료가 아니라 면제로 표시하고, 더 받을 돈이 없다', () => {
    const waived = group([payment({ status: 'waived' })]);
    assert.equal(worstStatus(waived, NOW), 'waived');
    assert.equal(isFullyCollected(waived), true);
    assert.equal(
      worstStatus(
        group([
          payment({ status: 'waived' }),
          payment({ status: 'collected', actualAmount: 470 }),
        ]),
        NOW,
      ),
      'collected',
    );
  });

  it('할인으로 다 받은 부분수금만 남은 거래는 수금완료다', () => {
    assert.equal(
      worstStatus(
        group([
          payment({ status: 'partial', actualAmount: 500, expectedAmount: 500 }),
        ]),
        NOW,
      ),
      'collected',
    );
  });
});

describe('캐시플로우', () => {
  const groups = [
    group([
      payment({ id: 'overdue', dueDate: day(10, 20), expectedAmount: 400 }),
      payment({ id: 'soon', dueDate: day(11, 9), expectedAmount: 300 }),
      payment({ id: 'later', dueDate: day(12, 18), expectedAmount: 200 }),
      payment({
        id: 'partial',
        status: 'partial',
        actualAmount: 500,
        expectedAmount: 790,
        paidAt: day(11, 2),
        agreedRemainingDate: day(11, 16),
      }),
    ]),
  ];

  it('받을 돈은 부분수금 잔액까지 넣고, 연체는 이번 달에 모은다', () => {
    assert.deepEqual(monthlyOwed(groups, 2026, 11, NOW), {
      pending: 300 + 290,
      overdue: 400,
      dueSoon: 300,
    });
    assert.deepEqual(monthlyOwed(groups, 2026, 12, NOW), {
      pending: 200,
      overdue: 0,
      dueSoon: 300,
    });
  });

  it('지난달 연체도 오늘 처리할 일에 나온다', () => {
    const queue = buildTodayQueue(groups, NOW);
    assert.deepEqual(queue.overdue.map((i) => i.payment.id), ['overdue']);
    assert.deepEqual(queue.dueSoon.map((i) => i.payment.id), ['soon']);
    assert.deepEqual(queue.taxInvoice.map((i) => i.payment.id), ['partial']);
  });

  it('세금계산서 할 일은 우리가 받은 최근 30일 건만 넣는다', () => {
    const queue = buildTodayQueue(
      [
        group([
          payment({
            id: 'old',
            status: 'collected',
            actualAmount: 1,
            paidAt: day(9, 1),
          }),
          payment({
            id: 'partner',
            status: 'collected',
            actualAmount: 1,
            paidAt: day(11, 1),
            collectedByOffice: 'partner',
          }),
          payment({
            id: 'issued',
            status: 'collected',
            actualAmount: 1,
            paidAt: day(11, 1),
            taxInvoiceStatus: 'issued',
          }),
        ]),
      ],
      NOW,
    );
    assert.equal(queue.taxInvoice.length, 0);
  });

  it('월별 막대는 지난달까지 수금만, 이번 달부터 예정을 쌓는다', () => {
    const trend = [
      { month: '2026-10', collected: 1466, expense: 560, net: 906 },
      { month: '2026-11', collected: 1470, expense: 560, net: 910 },
    ];
    const bars = buildTrendBars(trend, groups, NOW, 2);
    assert.deepEqual(
      bars.map((b) => [b.key, b.collected, b.forecast]),
      [
        ['2026-10', 1466, 0],
        ['2026-11', 1470, 400 + 300 + 290],
        ['2026-12', 0, 200],
        ['2027-01', 0, 0],
      ],
    );
    assert.equal(bars[3].label, "'27.1월");
    assert.equal(bars[2].net, -560);
  });

  it('그달 계약은 계약 이후 단계이면서 그달에 단계가 바뀐 거래다', () => {
    const list = [
      group([payment()], { id: 'a', stage: 'contracted', stageChangedAt: day(11, 2) }),
      group([payment()], { id: 'b', stage: 'preContract', stageChangedAt: day(11, 3) }),
      group([payment()], { id: 'c', stage: 'settling', stageChangedAt: day(10, 3) }),
    ];
    assert.deepEqual(
      monthContracts(list, 2026, 11).map((g) => g.deal.id),
      ['a'],
    );
  });

  it('월 이동은 연도를 넘나든다', () => {
    assert.deepEqual(stepMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
    assert.deepEqual(stepMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
  });
});

describe('공동중개 몫', () => {
  // 응답의 shareRatio는 Decimal 문자열로 온다.
  const distributions = [
    { recipientType: 'our_office', shareRatio: '60', shareAmount: 282, status: 'pending' },
    { recipientType: 'partner_broker', shareRatio: '40', shareAmount: 188, status: 'pending' },
  ];
  const balance = (over: Record<string, unknown>) => ({
    status: 'partial',
    expectedAmount: 470,
    actualAmount: 100,
    collectedByOffice: 'us',
    distributions,
    ...over,
  });

  it('우리가 받은 돈은 파트너 몫, 파트너가 받은 돈은 우리 몫을 잡는다', () => {
    assert.deepEqual(partnerBalance([balance({})]), { receivable: 0, payable: 40 });
    assert.deepEqual(
      partnerBalance([balance({ collectedByOffice: 'partner' })]),
      { receivable: 60, payable: 0 },
    );
  });

  it('전액 수금이면 서버가 저장한 몫과 같다', () => {
    assert.deepEqual(
      partnerBalance([balance({ status: 'collected', actualAmount: 470 })]),
      { receivable: 0, payable: 188 },
    );
  });

  it('할인 후에는 저장된 몫이 아니라 지금 청구액으로 계산한다', () => {
    // 서버는 할인을 승인해도 shareAmount를 그대로 둔다 (558의 50% = 279).
    const stale = [
      { recipientType: 'our_office', shareRatio: '50', shareAmount: 279, status: 'pending' },
      { recipientType: 'partner_broker', shareRatio: '50', shareAmount: 279, status: 'pending' },
    ];
    assert.deepEqual(
      partnerBalance([
        balance({ status: 'collected', expectedAmount: 500, actualAmount: 500, distributions: stale }),
      ]),
      { receivable: 0, payable: 250 },
    );
    assert.deepEqual(
      shareTotals([{ status: 'pending', expectedAmount: 500, distributions: stale }]),
      { our: 250, partner: 250 },
    );
  });

  it('아직 안 받았거나 정산 완료, 받은 돈 없는 면제, 취소면 잡지 않는다', () => {
    assert.deepEqual(
      partnerBalance([
        balance({ status: 'pending', actualAmount: null }),
        balance({
          distributions: distributions.map((d) => ({ ...d, status: 'settled' })),
        }),
        balance({ status: 'waived', actualAmount: null }),
        balance({ status: 'cancelled' }),
      ]),
      { receivable: 0, payable: 0 },
    );
  });

  it('일부 받은 뒤 대손 처리해도 받은 돈의 파트너 몫은 남는다', () => {
    assert.deepEqual(
      partnerBalance([balance({ status: 'waived', actualAmount: 300 })]),
      { receivable: 0, payable: 120 },
    );
    assert.deepEqual(
      partnerBalance([
        balance({ status: 'waived', actualAmount: 300, collectedByOffice: 'partner' }),
      ]),
      { receivable: 180, payable: 0 },
    );
    assert.deepEqual(
      shareTotals([{ status: 'waived', expectedAmount: 470, actualAmount: 300, distributions }]),
      { our: 180, partner: 120 },
    );
  });

  it('금액 없이 수금완료된 청구는 서버 원장처럼 청구액을 받은 것으로 본다', () => {
    assert.deepEqual(
      partnerBalance([balance({ status: 'collected', actualAmount: null })]),
      { receivable: 0, payable: 188 },
    );
  });

  it('분배 금액은 서버처럼 파트너를 내림하고 나머지를 우리 몫으로 한다', () => {
    assert.deepEqual(splitAmount(165, 50), { our: 83, partner: 82 });
    assert.deepEqual(splitAmount(470, 40), { our: 282, partner: 188 });
    assert.deepEqual(splitAmount(100, 0), { our: 100, partner: 0 });
    assert.deepEqual(splitAmount(100, 100), { our: 0, partner: 100 });
  });

  it('청구별로 내림해 더하므로 합계도 서버 결과와 같다', () => {
    const rows = [
      { recipientType: 'our_office', shareRatio: '50', shareAmount: 83, status: 'pending' },
      { recipientType: 'partner_broker', shareRatio: '50', shareAmount: 82, status: 'pending' },
    ];
    const payments = [
      { status: 'pending', expectedAmount: 165, distributions: rows },
      { status: 'pending', expectedAmount: 165, distributions: rows },
      { status: 'waived', expectedAmount: 999, distributions: rows },
    ];
    assert.deepEqual(shareTotals(payments), { our: 166, partner: 164 });
  });

  it('소수 비율에서도 우리 비율에 부동소수점 오차가 없다', () => {
    assert.equal(ourRatioFrom(70.1), 29.9);
    assert.equal(ourRatioFrom(40), 60);
  });

  it('분배가 없는 청구는 전부 우리 몫이다', () => {
    assert.deepEqual(currentShares({ expectedAmount: 300 }), { our: 300, partner: 0 });
  });

  it('할인으로 청구액이 받은 돈보다 작아지면 청구액까지만 나눈다', () => {
    const half = [
      { recipientType: 'our_office', shareRatio: '50', shareAmount: 250, status: 'pending' },
      { recipientType: 'partner_broker', shareRatio: '50', shareAmount: 250, status: 'pending' },
    ];
    assert.deepEqual(
      partnerBalance([
        balance({ expectedAmount: 400, actualAmount: 500, distributions: half }),
      ]),
      { receivable: 0, payable: 200 },
    );
    assert.deepEqual(
      partnerBalance([
        balance({
          expectedAmount: 400,
          actualAmount: 500,
          collectedByOffice: 'partner',
          distributions: half,
        }),
      ]),
      { receivable: 200, payable: 0 },
    );
  });

  it('이미 정산한 분배는 할인 뒤에도 실제로 준 금액을 유지한다', () => {
    assert.deepEqual(
      currentShares({
        expectedAmount: 500,
        distributions: [
          { recipientType: 'our_office', shareRatio: '50', shareAmount: 279, status: 'pending' },
          { recipientType: 'partner_broker', shareRatio: '50', shareAmount: 279, status: 'settled' },
        ],
      }),
      { our: 221, partner: 279 },
    );
  });

  it('파트너가 여럿이면 행마다 내림해 서버와 같게 나눈다', () => {
    const rows = [
      { recipientType: 'partner_broker', shareRatio: '30', shareAmount: 49, status: 'pending' },
      { recipientType: 'partner_broker', shareRatio: '30', shareAmount: 49, status: 'pending' },
      { recipientType: 'our_office', shareRatio: '40', shareAmount: 67, status: 'pending' },
    ];
    assert.deepEqual(shareRowAmounts(165, rows), [49, 49, 67]);
    assert.deepEqual(currentShares({ expectedAmount: 165, distributions: rows }), {
      our: 67,
      partner: 98,
    });
  });

  it('우리 몫이 없으면 나머지는 서버처럼 첫 행에 준다', () => {
    assert.deepEqual(
      shareRowAmounts(165, [
        { recipientType: 'partner_broker', shareRatio: '50', shareAmount: 83, status: 'pending' },
        { recipientType: 'partner_broker', shareRatio: '50', shareAmount: 82, status: 'pending' },
      ]),
      [83, 82],
    );
  });

  it('파트너 여럿 중 한 곳만 정산했으면 나머지 몫은 남는다', () => {
    assert.deepEqual(
      partnerBalance([
        balance({
          status: 'collected',
          expectedAmount: 165,
          actualAmount: 165,
          distributions: [
            { recipientType: 'partner_broker', shareRatio: '30', shareAmount: 49, status: 'settled' },
            { recipientType: 'partner_broker', shareRatio: '30', shareAmount: 49, status: 'pending' },
            { recipientType: 'our_office', shareRatio: '40', shareAmount: 67, status: 'pending' },
          ],
        }),
      ]),
      { receivable: 0, payable: 49 },
    );
  });
});

describe('직원 정산 상태', () => {
  const payments = [
    { clientSide: 'seller', status: 'collected', expectedAmount: 790, actualAmount: 790 },
    { clientSide: 'buyer', status: 'partial', expectedAmount: 790, actualAmount: 500 },
  ];

  it('그 직원 쪽 청구가 다 들어오면 정산 가능이다', () => {
    assert.deepEqual(
      participantSettlement({ side: 'seller', settlementStatus: 'unsettled' }, payments),
      { state: 'ready', billed: 790, collected: 790, percent: 100 },
    );
  });

  it('한쪽이라도 덜 들어오면 양측 담당은 수금 대기다', () => {
    assert.deepEqual(
      participantSettlement({ side: 'both', settlementStatus: 'unsettled' }, payments),
      { state: 'waiting', billed: 1580, collected: 1290, percent: 82 },
    );
  });

  it('할인으로 다 받은 쪽도 정산 가능이고, 수금률은 100%를 넘지 않는다', () => {
    assert.deepEqual(
      participantSettlement({ side: 'seller', settlementStatus: 'unsettled' }, [
        { clientSide: 'seller', status: 'partial', expectedAmount: 400, actualAmount: 500 },
      ]),
      { state: 'ready', billed: 400, collected: 500, percent: 100 },
    );
  });

  it('정산 완료 표시가 수금 상태보다 앞선다', () => {
    assert.equal(
      participantSettlement({ side: 'buyer', settlementStatus: 'settled' }, payments).state,
      'settled',
    );
  });

  it('청구가 아직 없으면 수금 대기다', () => {
    assert.equal(
      participantSettlement({ side: 'both', settlementStatus: 'unsettled' }, []).state,
      'waiting',
    );
  });
});

describe('기타', () => {
  it('단일 동 건물의 placeholder 동은 주소에 넣지 않는다', () => {
    assert.equal(
      dealLocation({ siteName: '고덕빌라', dongName: '-', unitName: '301호' }),
      '고덕빌라 301호',
    );
    assert.equal(
      dealLocation({ siteName: '고덕그라시움', dongName: '105동', unitName: '1203호' }),
      '고덕그라시움 105동 1203호',
    );
    assert.equal(
      dealLocation({ siteName: null, dongName: null, unitName: null }),
      '매물 미지정',
    );
  });

  it('고정비 월 환산', () => {
    assert.equal(monthlyExpenseAmount({ amount: 280, frequency: 'monthly' }), 280);
    assert.equal(monthlyExpenseAmount({ amount: 18, frequency: 'quarterly' }), 6);
    assert.equal(monthlyExpenseAmount({ amount: 60, frequency: 'yearly' }), 5);
  });

  it('CSV는 BOM을 붙이고 따옴표를 이스케이프한다', () => {
    assert.equal(toCsv([['a"b', 1, null]]), '﻿"a""b","1",""');
  });
});

describe('받은 돈과 청구로 남는 금액', () => {
  it('받은 돈은 상태에 따라 읽는다', () => {
    assert.equal(receivedAmount(payment({ status: 'collected', actualAmount: null })), 470);
    assert.equal(receivedAmount(payment({ status: 'collected', actualAmount: 400 })), 400);
    assert.equal(receivedAmount(payment({ status: 'partial', actualAmount: 100 })), 100);
    assert.equal(receivedAmount(payment({ status: 'waived', actualAmount: 300 })), 300);
    assert.equal(receivedAmount(payment({ status: 'waived' })), 0);
    assert.equal(receivedAmount(payment({ status: 'cancelled', actualAmount: 300 })), 0);
  });

  it('면제·대손은 받은 돈까지만 청구로 남고 취소는 없던 일이다', () => {
    assert.equal(billableAmount(payment()), 470);
    assert.equal(billableAmount(payment({ status: 'waived', actualAmount: 300 })), 300);
    assert.equal(billableAmount(payment({ status: 'waived' })), 0);
    assert.equal(billableAmount(payment({ status: 'cancelled', actualAmount: 300 })), 0);
  });

  it('받은 돈 없이 면제·취소된 청구만 건수와 합계에서 뺀다', () => {
    assert.equal(countsAsBilled(payment()), true);
    assert.equal(countsAsBilled(payment({ status: 'waived', actualAmount: 300 })), true);
    assert.equal(countsAsBilled(payment({ status: 'waived' })), false);
    assert.equal(countsAsBilled(payment({ status: 'cancelled', actualAmount: 300 })), false);
  });

  it('거래 합계에 대손 전에 받은 돈이 남고 미수는 없다', () => {
    assert.deepEqual(
      rollupPayments([payment({ status: 'waived', actualAmount: 300 })]),
      { billed: 300, collected: 300, remaining: 0 },
    );
    assert.deepEqual(
      rollupPayments([payment({ status: 'collected', actualAmount: null })]),
      { billed: 470, collected: 470, remaining: 0 },
    );
  });

  it('대손 전에 받은 돈은 담당자 정산에도 잡힌다', () => {
    assert.deepEqual(
      participantSettlement({ side: 'seller', settlementStatus: 'unsettled' }, [
        payment({ status: 'waived', actualAmount: 300 }),
      ]),
      { state: 'ready', billed: 300, collected: 300, percent: 100 },
    );
    assert.equal(
      participantSettlement({ side: 'seller', settlementStatus: 'unsettled' }, [
        payment({ status: 'waived' }),
      ]).state,
      'waiting',
    );
  });
});

describe('거래 전체 분배 변경 대상', () => {
  const row = (recipientType: string, shareRatio: number, extra = {}) => ({
    id: `${recipientType}-${shareRatio}`,
    recipientType,
    partnerBrokerId: recipientType === 'partner_broker' ? 'b1' : null,
    partnerBrokerName: null,
    shareRatio,
    shareAmount: 0,
    status: 'pending',
    ...extra,
  });
  const ids = (list: Array<{ id: string }>) => list.map((p) => p.id);
  const finished = payment({ id: 'done', status: 'partial', expectedAmount: 400, actualAmount: 400 });
  const open = payment({ id: 'open' });
  const draft = payment({ id: 'draft', status: 'draft' });

  it('서버와 대상이 같으면 일괄 API를 쓴다', () => {
    const plan = planDealDistribution([
      open,
      draft,
      payment({ id: 'c', status: 'collected', actualAmount: 470 }),
      payment({ id: 'w', status: 'waived' }),
      payment({ id: 's', distributions: [row('our_office', 100, { status: 'settled' })] }),
    ]);
    assert.equal(plan.useServerBulk, true);
    assert.deepEqual(ids(plan.targets), ['open', 'draft']);
    assert.deepEqual(ids(plan.skipped), ['c', 'w', 's']);
  });

  it('다 받은 부분수금이 있으면 건별로 바꾸고 초안은 대상에 넣는다', () => {
    const plan = planDealDistribution([finished, open, draft]);
    assert.equal(plan.useServerBulk, false);
    assert.deepEqual(ids(plan.targets), ['open', 'draft']);
    assert.deepEqual(ids(plan.skipped), ['done']);
  });

  it('파트너가 둘인 청구는 하나로 합치지 않도록 대상에서 뺀다', () => {
    const multi = payment({
      id: 'multi',
      distributions: [
        row('our_office', 50),
        row('partner_broker', 30),
        { ...row('partner_broker', 20), partnerBrokerId: 'b2' },
      ],
    });
    assert.equal(isDistributionEditable(multi), false);
    const plan = planDealDistribution([multi, open]);
    assert.equal(plan.useServerBulk, false);
    assert.deepEqual(ids(plan.targets), ['open']);
    assert.deepEqual(ids(plan.skipped), ['multi']);
  });

  it('분배에 저장된 파트너를 읽는다', () => {
    assert.equal(partnerIdOf([row('our_office', 60), row('partner_broker', 40)]), 'b1');
    assert.equal(partnerIdOf([row('our_office', 100)]), null);
  });
});

describe('수수료 조정 승인', () => {
  const discount = (amount: number) => ({ type: 'discount', amount: -amount });

  it('남은 금액까지의 할인은 승인할 수 있다', () => {
    assert.equal(adjustmentProblem(discount(470), payment()), null);
    assert.equal(
      adjustmentProblem(discount(170), payment({ status: 'partial', actualAmount: 300 })),
      null,
    );
  });

  it('요청 뒤 돈이 들어와 남은 금액을 넘으면 막는다', () => {
    assert.equal(
      adjustmentProblem(discount(200), payment({ status: 'partial', actualAmount: 400 })),
      'over-remaining',
    );
  });

  it('더 받을 돈이 없으면 할인도 면제도 막는다', () => {
    const done = payment({ status: 'collected', actualAmount: 470 });
    assert.equal(adjustmentProblem(discount(70), done), 'nothing-left');
    assert.equal(adjustmentProblem({ type: 'waive', amount: -470 }, done), 'nothing-left');
    assert.equal(
      adjustmentProblem(discount(70), payment({ status: 'waived', actualAmount: 300 })),
      'nothing-left',
    );
  });

  it('남은 돈이 있으면 면제·대손은 금액과 상관없이 승인할 수 있다', () => {
    assert.equal(
      adjustmentProblem(
        { type: 'bad_debt', amount: -470 },
        payment({ status: 'partial', actualAmount: 300 }),
      ),
      null,
    );
  });

  it('조정 ID로 찾아 청구번호가 비었거나 겹쳐도 오인하지 않는다', () => {
    const open = { id: 'open', code: null, adjustments: [] };
    const target = { id: 'target', code: null, adjustments: [{ id: 'a1' }] };
    assert.equal(paymentWithAdjustment([open, target], 'a1')?.id, 'target');
    assert.equal(
      paymentWithAdjustment(
        [{ ...open, code: 'CP-1' }, { ...target, code: 'CP-1' }],
        'a1',
      )?.id,
      'target',
    );
    assert.equal(paymentWithAdjustment([open, target], 'none'), null);
    assert.equal(paymentWithAdjustment([{ id: 'x' }], 'a1'), null);
  });

  it('목록 힌트는 거래와 청구번호, 승인 대기 건수로 찾는다', () => {
    const groups = [
      group([
        payment({ id: 'other', code: 'CP-1' }),
        payment({ id: 'target', code: 'CP-1', pendingAdjustments: 1 }),
      ]),
    ];
    const dealId = groups[0].deal.id;
    assert.equal(paymentOfAdjustment(groups, { dealId, paymentCode: 'CP-1' })?.id, 'target');
    assert.equal(paymentOfAdjustment(groups, { dealId, paymentCode: 'CP-2' }), null);
    assert.equal(paymentOfAdjustment(groups, { dealId, paymentCode: null }), null);
    assert.equal(paymentOfAdjustment(groups, { dealId: 'other', paymentCode: 'CP-1' }), null);
  });
});
