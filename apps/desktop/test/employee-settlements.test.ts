import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(testDir, '../src/renderer/routes/_authenticated', path), 'utf8');
const settleSource = read('cashflow/employee-settlements.tsx');
const mineSource = read('cashflow/my-settlement.tsx');
const teamSource = read('settings/-team-settings.tsx');
/** 주석을 뺀 실행 코드 */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('employee settlements', () => {
  it('shows the server calculation as is and never recomputes shares on the client', () => {
    assert.match(settleSource, /api\.finance\.settlements\.get\(month\)/);
    // 계산 규칙은 서버(settlement-calc.ts)에만 둔다. 화면이 몫이나 3.3%를 다시 계산하면 두 곳의 숫자가 갈린다.
    assert.doesNotMatch(code(settleSource), /0\.033|\* ?3\.3|\/ ?1\.1|participantSettlement/);
    assert.doesNotMatch(code(mineSource), /0\.033|\* ?3\.3|\/ ?1\.1|participantSettlement/);
  });

  it('is open to the owner only because it shows what every employee is paid', () => {
    assert.match(settleSource, /user\?\.role !== 'owner'/);
    assert.match(settleSource, /대표만 볼 수 있는 화면입니다/);
    // 직원 본인은 자기 정산만 받는다.
    assert.match(mineSource, /api\.finance\.settlements\.mine\(\)/);
    assert.doesNotMatch(code(mineSource), /deals\.findAll|employees\.findAll/);
  });

  it('confirms a month, then records payment per employee', () => {
    assert.match(settleSource, /api\.finance\.settlements\.confirm\(month\)/);
    assert.match(settleSource, /api\.finance\.settlements\.unconfirm\(month\)/);
    assert.match(settleSource, /api\.finance\.settlements\.markPaid\(line\.lineId as string\)/);
    // 확정할 수 없는 이유는 서버가 알려 준다.
    assert.match(settleSource, /disabled=\{confirm\.isPending \|\| view\.blockedReason !== null\}/);
    // 확정 취소는 서버가 된다고 할 때만 보인다 (가장 최근 정산이고 지급 기록이 없을 때).
    assert.match(settleSource, /confirmed && view\.canUnconfirm/);
    // 서버가 돌려준 정산으로 바로 바꿔 끼운다.
    assert.match(settleSource, /queryClient\.setQueryData\(\['settlement', view\.month\], view\)/);
  });

  it('treats an employee differently: pre-tax bonus handed to payroll, no base pay or 3.3%', () => {
    assert.match(settleSource, /세금 떼기 전 성과급/);
    assert.match(settleSource, /employee \? '급여에 넘김' : '지급 기록'/);
    assert.match(settleSource, /급여에서 계산/);
    assert.match(settleSource, /공제 안 함/);
  });

  it('lets the office choose only the settlement timing, and only before the month is confirmed', () => {
    assert.match(settleSource, /closed: '잔금이 끝난 뒤'/);
    assert.match(settleSource, /received: '돈이 들어온 달'/);
    assert.match(settleSource, /api\.finance\.settlements\.updateSettings\(\{ timing \}\)/);
    assert.match(settleSource, /\{confirmed \? \(\s*<b[^>]*>\{TIMING_LABEL\[view\.timing\]\}<\/b>/);
  });

  it('lists receipts that are left out and lets the owner assign who handled the deal', () => {
    assert.match(settleSource, /이 달 정산에 들어가지 않은 입금/);
    assert.match(settleSource, /participants: '담당이 정해지지 않음'/);
    assert.match(settleSource, /api\.finance\.settlements\.setParticipants\(/);
    // 비중의 합이 100이 아니면 저장하지 않는다.
    assert.match(settleSource, /if \(sum !== 100\) return/);
    assert.match(settleSource, /disabled=\{save\.isPending \|\| problem !== null \|\| rows === null\}/);
    // 그만둔 직원은 고를 수 없다.
    assert.match(settleSource, /\.filter\(\(employee\) => employee\.isActive\)/);
  });

  it('edits the settlement type and the 3.3% switch with the rest of the pay settings (owner only)', () => {
    assert.match(teamSource, /employmentType: employee\.employmentType \?\? 'freelancer'/);
    assert.match(teamSource, /withholdTax: employee\.withholdTax \?\? true/);
    // 급여 값과 같은 조건(대표가 저장할 때)에만 보낸다.
    assert.match(teamSource, /commissionRate\.trim\(\) === '' \? null : Number\(values\.commissionRate\),\s*employmentType: values\.employmentType,\s*withholdTax: values\.withholdTax,/);
    assert.match(teamSource, /id="employee-withhold-tax"/);
  });
});
