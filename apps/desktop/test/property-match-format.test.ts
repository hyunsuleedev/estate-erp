import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MATCH_STAGE_ORDER, MatchStage } from '@estate-erp/shared';
import {
  formatDateOnly,
  formatEokInput,
  parseEokInput,
  parseManwonInput,
  toDateInputValue,
} from '../src/renderer/routes/_authenticated/properties/-components/property-match-format';

describe('agreed terms input', () => {
  it('reads an amount typed in 억 as 만원', () => {
    assert.equal(parseEokInput('31.5'), 315000);
    assert.equal(parseEokInput(' 32 '), 320000);
    assert.equal(parseEokInput('0.85'), 8500);
    assert.equal(parseEokInput('1,234.5'), 12345000);
  });

  it('treats an empty field as clearing and never guesses at unreadable text', () => {
    assert.equal(parseEokInput(''), null);
    assert.equal(parseEokInput('   '), null);
    for (const text of ['삼십억', '31,5', '31.5억', '-3', '0', '31..5', '3"1', '99999999']) {
      assert.ok(Number.isNaN(parseEokInput(text)), `${text} should be rejected`);
    }
  });

  it('reads 만원 amounts as whole numbers only', () => {
    assert.equal(parseManwonInput('5,000'), 5000);
    assert.equal(parseManwonInput('120'), 120);
    assert.equal(parseManwonInput('0'), 0);
    assert.equal(parseManwonInput(''), null);
    assert.ok(Number.isNaN(parseManwonInput('120.5')));
    assert.ok(Number.isNaN(parseManwonInput('50,00')));
  });

  it('shows a saved amount back in the unit it was typed in', () => {
    assert.equal(formatEokInput(315000), '31.5');
    assert.equal(formatEokInput(320000), '32');
    assert.equal(formatEokInput(null), '');
    assert.equal(parseEokInput(formatEokInput(123456)), 123456);
  });

  it('keeps the calendar day of a stored date regardless of time zone', () => {
    assert.equal(toDateInputValue('2027-02-20T00:00:00.000Z'), '2027-02-20');
    assert.equal(formatDateOnly('2027-02-20T00:00:00.000Z'), '2027. 2. 20.');
    assert.equal(formatDateOnly(null), '');
  });
});

describe('property match detail', () => {
  const read = (path: string) =>
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), path), 'utf8');
  const panelSource = read(
    '../src/renderer/routes/_authenticated/properties/-components/property-match-panel.tsx',
  );
  const utilsSource = read(
    '../src/renderer/routes/_authenticated/wanted-properties/-match-view-utils.ts',
  );
  const dialogSource = read(
    '../src/renderer/routes/_authenticated/wanted-properties/-match-convert-dialog.tsx',
  );
  const statusConfigSource = read('../src/renderer/lib/status-config.ts');

  it('does not force the stage order, so a match can skip viewing', () => {
    assert.doesNotMatch(utilsSource, /단계를 먼저 완료해 주세요|임장 조율을 먼저 완료해 주세요/);
    // 확인되지 않은 매물을 고객에게 제안하지 못하게 하는 검사는 남는다
    assert.match(utilsSource, /매물 확인을 완료한 뒤 고객 관심 단계로 이동할 수 있습니다/);
  });

  it('marks a skipped stage as skipped instead of done, only when the history is complete', () => {
    assert.match(panelSource, /Boolean\(history\?\.complete\) &&\s*!history\?\.enteredAt\[candidate\]/);
    assert.match(panelSource, /\? '건너뜀'/);
    assert.match(panelSource, /done=\{state === 'completed' && !isSkipped\}/);
    // 지나온 단계는 회색이 아니라 한 가지 색(초록)
    assert.match(panelSource, /'bg-success-soft\/60 text-success'/);
  });

  it('puts the confirm button under the guide and drops the history list', () => {
    assert.match(panelSource, /actionCopy\?\.confirmLabel/);
    assert.match(utilsSource, /confirmLabel: '고객 관심 확정'/);
    assert.doesNotMatch(panelSource, /전체 이력/);
    assert.match(panelSource, /<BuyerConditionCard match=\{match\} fit=\{fit\} \/>/);
  });

  it('asks for the visit time once, at viewing coordination', () => {
    // 임장 조율: 날짜를 정하는 것이 곧 확정 — 일정을 저장하며 임장으로 넘어간다
    assert.match(panelSource, /isArrangingViewing \? \([\s\S]*?actions\.onScheduleViewing\(match, viewingStart\)/);
    // 정해진 방문이 없으면 비워 둔다 — 고르지 않은 날짜를 미리 넣어 두지 않는다
    assert.doesNotMatch(panelSource, /getDefaultViewingStartDate/);
    assert.match(panelSource, /upcomingViewing \? toDateTimeLocalInputValue\(new Date\(upcomingViewing\.start\)\) : ''/);
    assert.match(panelSource, /title=\{!viewingStart \? '임장 일시를 먼저 정해 주세요' : undefined\}/);
    // 브라우저 기본 날짜 입력칸이 아니라 앱의 달력 팝오버로 고른다
    assert.doesNotMatch(panelSource, /type="datetime-local"/);
    assert.match(panelSource, /<Calendar\s+mode="single"/);
    assert.match(panelSource, /value \? formatDateTime\(value\) : <EmptyValue \/>/);
    // 임장 단계의 값은 늘 저장된 일정이다 — 저장이 실패해도 같은 값으로 다시 시도할 수 있다
    assert.match(panelSource, /value=\{savedViewingStart\(\)\}\s*disabled=\{disabled\}\s*onChange=\{\(next\) => \{\s*if \(next\) actions\.onScheduleViewing\(match, next\);/);
    // 날짜와 시간을 둘 다 고르고, 지난 시각이 아닐 때만 적용된다
    assert.match(panelSource, /disabled=\{!picked \|\| isPast \|\| picked === value\}/);
  });

  it('separates the visit from the buyer weighing several homes afterwards', () => {
    // 임장은 다녀오면 끝나고, 고객의 반응은 다음 단계(고객 검토)에서 받는다
    // 집을 보러 가는 것은 "임장"이다 (화면 낱말 기준 2026-11-22. "방문"은 손님이 사무소에 온 상담 방식)
    assert.match(utilsSource, /\[MatchStage\.VIEWING\]: \{[\s\S]*?confirmLabel: '임장 완료',[\s\S]*?closeLabel: '임장 취소 · 종료'/);
    assert.match(utilsSource, /\[MatchStage\.BUYER_REVIEWING\]: \{[\s\S]*?confirmLabel: '검토 후 관심 있음 · 협상으로',[\s\S]*?closeLabel: '검토 후 관심 없음 · 종료'/);
    // 임장 다음, 협상 앞
    const order = [...MATCH_STAGE_ORDER];
    assert.equal(order.indexOf(MatchStage.BUYER_REVIEWING), order.indexOf(MatchStage.VIEWING) + 1);
    assert.equal(order.indexOf(MatchStage.NEGOTIATING), order.indexOf(MatchStage.BUYER_REVIEWING) + 1);
    assert.match(statusConfigSource, /buyerReviewing: \{ label: '고객 검토'/);
    // 고객이 함께 보고 있는 다른 매물을 같은 희망조건으로 찾는다
    assert.match(panelSource, /isReviewing && \(\s*<PropertyRow icon=\{<GitBranch \/>\} label="다른 매물">\s*<BuyerOtherMatches match=\{match\} \/>/);
    assert.match(panelSource, /buyerReqId: match\.buyerReqId,\s*stage: COMPARED_STAGES\.join\(','\)/);
    assert.match(panelSource, /filter\(\(other\) => other\.id !== match\.id\)/);
  });

  it('keeps agreed terms on the match while negotiating and hands them to the deal', () => {
    assert.match(panelSource, /api\.matches\.updateAgreedTerms\(match\.id, terms\)/);
    assert.match(panelSource, /stage === MatchStage\.NEGOTIATING && \(\s*<AgreedTermsFields/);
    // 안내는 문장이 아니라 "다음 할 일" 속성 한 줄이고, 두 카드가 같은 틀을 쓴다
    assert.match(panelSource, /<PropertyRow icon=\{<CircleDashed \/>\} label="다음 할 일">/);
    assert.match(panelSource, /<DetailCard\s+label="진행"/);
    assert.match(panelSource, /<DetailCard\s+label="고객 조건"/);
    // 읽을 수 없는 금액이 남아 있으면 거래전환을 막는다
    assert.match(panelSource, /stage === MatchStage\.NEGOTIATING && !areTermsValid/);
    // 저장이 실패하면 입력칸을 서버 값으로 다시 그린다
    assert.match(panelSource, /setAgreedTermsResetKey\(\(key\) => key \+ 1\)/);
    assert.match(dialogSource, /match\.agreedPrice != null\s*\? String\(match\.agreedPrice\)/);
    assert.match(dialogSource, /agreedMoveInDate: moveInInput \|\| undefined/);
  });
});
