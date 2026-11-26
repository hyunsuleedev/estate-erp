import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkItem,
  dealProblem,
  moneyProblem,
} from '../src/renderer/routes/_authenticated/properties/-registration-check.ts';

const deal = {
  transactionTypes: ['sale'] as Array<'sale' | 'jeonse' | 'monthly'>,
  salePrice: '',
  jeonsePrice: '',
  monthlyDeposit: '',
  monthlyRent: '',
  conflictLabels: [] as string[],
};

describe('매물 등록 — 등록 전 확인', () => {
  it('고른 거래유형의 금액만 본다', () => {
    assert.deepEqual(dealProblem(deal), { field: 'sale-price', kind: 'missing', text: '매매가를 적으세요' });
    assert.equal(dealProblem({ ...deal, salePrice: '15억 8천' }), null);
    // 고르지 않은 전세·월세 칸에 읽을 수 없는 글이 남아 있어도 막지 않는다
    assert.equal(dealProblem({ ...deal, salePrice: '15억', jeonsePrice: 'abc', monthlyRent: 'x' }), null);
  });

  it('읽을 수 없는 금액과 빈 금액을 가려 알린다', () => {
    assert.equal(dealProblem({ ...deal, salePrice: '15억 abc' })?.text, '매매가를 읽을 수 없습니다');
    assert.deepEqual(
      dealProblem({ ...deal, transactionTypes: ['jeonse'], jeonsePrice: '' }),
      { field: 'jeonse-price', kind: 'missing', text: '전세가를 적으세요' },
    );
  });

  it('월세는 보증금이 비어도 되고 월세는 꼭 있어야 한다', () => {
    const monthly = { ...deal, transactionTypes: ['monthly'] as Array<'sale' | 'jeonse' | 'monthly'> };
    assert.deepEqual(dealProblem(monthly), { field: 'monthly-rent', kind: 'missing', text: '월세를 적으세요' });
    assert.equal(dealProblem({ ...monthly, monthlyRent: '80' }), null);
    assert.equal(dealProblem({ ...monthly, monthlyDeposit: '삼천', monthlyRent: '80' })?.field, 'monthly-deposit');
    assert.equal(dealProblem({ ...monthly, monthlyDeposit: '3천', monthlyRent: '팔십' })?.field, 'monthly-rent');
  });

  it('같은 호실에 이미 있는 거래유형이 가장 먼저다', () => {
    assert.deepEqual(
      dealProblem({ ...deal, salePrice: '15억', conflictLabels: ['전세', '월세'] }),
      { field: 'deal-type', kind: 'conflict', text: '이 호실에 이미 전세, 월세 조건이 있습니다' },
    );
  });

  it('숨은 금액 칸은 검사하지 않는다', () => {
    const fields = [
      { field: 'maintenance-fee', label: '관리비', value: '32', shown: true },
      { field: 'premium', label: '권리금', value: '없음', shown: false },
    ];
    assert.equal(moneyProblem(fields), null);
    assert.deepEqual(
      moneyProblem([{ ...fields[1], shown: true }]),
      { field: 'premium', kind: 'invalid', text: '권리금 금액을 읽을 수 없습니다' },
    );
  });

  it('꼭 채울 줄은 저장을 눌러 보기 전에는 빨갛게 하지 않는다', () => {
    const base = {
      key: 'deal' as const, title: '거래 조건과 금액', required: true, summary: '',
      problem: { field: 'sale-price', kind: 'missing' as const, text: '매매가를 적으세요' }, idle: '금액을 적으세요', field: 'sale-price',
    };
    assert.equal(checkItem({ ...base, attempted: false }).state, 'todo');
    assert.equal(checkItem({ ...base, attempted: true }).state, 'problem');
    // 이미 틀린 값은 누르기 전에도 알린다
    assert.equal(checkItem({ ...base, attempted: false, problem: { field: 'sale-price', kind: 'invalid', text: '매매가를 읽을 수 없습니다' } }).state, 'problem');
    assert.equal(checkItem({ ...base, attempted: false }).field, 'sale-price');
  });

  it('채워진 줄과 비워 둔 선택 줄', () => {
    assert.deepEqual(
      checkItem({ key: 'place', title: '단지 · 거래 공간', required: true, summary: '고덕그라시움 102동 2203호', problem: null, idle: '단지를 고르세요', field: 'site', attempted: false }),
      { key: 'place', title: '단지 · 거래 공간', required: true, state: 'done', detail: '고덕그라시움 102동 2203호', field: 'site' },
    );
    const owner = { key: 'owner' as const, title: '소유자', required: false, summary: '', idle: '나중에 추가해도 됩니다', field: 'owner-name', attempted: false };
    assert.equal(checkItem({ ...owner, problem: null }).state, 'optional');
    // 선택 줄이라도 적다 만 값이 틀리면 바로 알린다
    assert.equal(checkItem({ ...owner, problem: { field: 'owner-name', kind: 'missing', text: '소유자 이름을 적으세요' } }).state, 'problem');
  });
});
