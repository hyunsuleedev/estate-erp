import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  confirmToneForDays,
  getConfirmCellModel,
} from '../src/renderer/routes/_authenticated/properties/-components/property-confirm-cell-state';

// 기준 시각: 2026-11-18 정오(한국 시간).
const NOW = new Date('2026-11-18T12:00:00+09:00').getTime();
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

type Intake = Parameters<typeof getConfirmCellModel>[0];
const intake = (patch: Partial<Intake>): Intake => ({
  lifecycleStatus: 'open',
  lastCheckedAt: null,
  lastVerifiedAt: null,
  lastCheckResult: null,
  ...patch,
});

describe('property confirm cell', () => {
  it('colours the cell by how long ago the listing was verified', () => {
    assert.equal(confirmToneForDays(null), 'none');
    assert.equal(confirmToneForDays(0), 'fresh');
    assert.equal(confirmToneForDays(7), 'fresh');
    assert.equal(confirmToneForDays(8), 'aging');
    assert.equal(confirmToneForDays(30), 'aging');
    assert.equal(confirmToneForDays(31), 'stale');
  });

  it('shows the verified date and how long ago it was', () => {
    const today = getConfirmCellModel(
      intake({ lastCheckedAt: daysAgo(0), lastVerifiedAt: daysAgo(0), lastCheckResult: 'alive' }),
      NOW,
    );
    assert.deepEqual(
      { tone: today.tone, date: today.date, relative: today.relative },
      { tone: 'fresh', date: '11. 18.', relative: '오늘' },
    );

    const old = getConfirmCellModel(
      intake({ lastCheckedAt: daysAgo(8), lastVerifiedAt: daysAgo(8), lastCheckResult: 'price_changed' }),
      NOW,
    );
    assert.deepEqual(
      { tone: old.tone, date: old.date, relative: old.relative },
      { tone: 'aging', date: '11. 10.', relative: '8일 전' },
    );
  });

  it('answers only "when was this last verified" — a later unanswered call is not shown', () => {
    // 확인은 "살아 있음"을 찍는 것 하나다. 예전 기록에 부재중 · 답변대기가 남아 있어도 칸은 확인된 날만 말한다.
    const noAnswer = getConfirmCellModel(
      intake({ lastCheckedAt: daysAgo(0), lastVerifiedAt: daysAgo(8), lastCheckResult: 'no_answer' }),
      NOW,
    );
    assert.deepEqual(
      { tone: noAnswer.tone, date: noAnswer.date, relative: noAnswer.relative },
      { tone: 'aging', date: '11. 10.', relative: '8일 전' },
    );
    assert.equal(noAnswer.title, '확인된 날 11. 10.');

    const pending = getConfirmCellModel(
      intake({ lastCheckedAt: daysAgo(3), lastVerifiedAt: daysAgo(41), lastCheckResult: 'pending' }),
      NOW,
    );
    assert.deepEqual(
      { tone: pending.tone, date: pending.date, relative: pending.relative },
      { tone: 'stale', date: '10. 8.', relative: '41일 전' },
    );
  });

  it('shows a dash for a listing that was never verified', () => {
    // 걸어 봤지만 안 받은 매물도 확인된 적 없는 매물이다
    const tried = getConfirmCellModel(
      intake({ lastCheckedAt: daysAgo(0), lastCheckResult: 'no_answer' }),
      NOW,
    );
    assert.deepEqual(
      { tone: tried.tone, date: tried.date, relative: tried.relative },
      { tone: 'none', date: '-', relative: '' },
    );

    const untouched = getConfirmCellModel(intake({}), NOW);
    assert.deepEqual(
      { tone: untouched.tone, date: untouched.date, relative: untouched.relative, closed: untouched.closed },
      { tone: 'none', date: '-', relative: '', closed: false },
    );
    assert.equal(untouched.title, '확인된 적 없음');
  });

  it('reads an old record that has only a checked date as verified when the result was valid', () => {
    const model = getConfirmCellModel(
      intake({ lastCheckedAt: daysAgo(4), lastVerifiedAt: null, lastCheckResult: 'alive' }),
      NOW,
    );
    assert.deepEqual(
      { tone: model.tone, date: model.date, relative: model.relative },
      { tone: 'fresh', date: '11. 14.', relative: '4일 전' },
    );
  });

  it('takes the colour off a closed intake and offers no confirm button', () => {
    const model = getConfirmCellModel(
      intake({
        lifecycleStatus: 'closed',
        lastCheckedAt: daysAgo(41),
        lastVerifiedAt: daysAgo(41),
        lastCheckResult: 'alive',
      }),
      NOW,
    );
    // 종료는 옆의 매물 상태가 보여 준다. 확인 칸은 마지막으로 확인된 날만 남긴다("의뢰 종료 · 오늘"을 적지 않는다)
    assert.deepEqual(
      { tone: model.tone, date: model.date, relative: model.relative, closed: model.closed },
      { tone: 'none', date: '10. 8.', relative: '', closed: true },
    );
  });

  it('ignores dates it cannot read', () => {
    const model = getConfirmCellModel(
      intake({ lastCheckedAt: 'not a date', lastVerifiedAt: 'nope', lastCheckResult: 'no_answer' }),
      NOW,
    );
    assert.deepEqual({ date: model.date, relative: model.relative }, { date: '-', relative: '' });
  });
});
