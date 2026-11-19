import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const routesDir = resolve(testDir, '../src/renderer/routes/_authenticated');
const read = (path: string) => readFileSync(resolve(routesDir, path), 'utf8');

const routeSource = read('employees/index.tsx');
const activitySource = read('employees/-activity-screen.tsx');
const teamSource = read('settings/-team-settings.tsx');
const settingsSource = read('settings/index.tsx');

describe('직원관리: 업무와 활동을 추적하는 화면', () => {
  it('is a read-only view of who is doing what', () => {
    assert.match(routeSource, /component: EmployeeActivityScreen/);
    // 계정을 만들거나 고치는 호출은 이 화면에 없다
    assert.doesNotMatch(activitySource, /useMutation/);
    assert.doesNotMatch(
      activitySource,
      /api\.employees\.(create|update|updateRole|updateStatus|resetPassword)/,
    );
    // 급여 설정은 여기서 보이지 않는다
    assert.doesNotMatch(activitySource, /baseSalary|commissionRate|payType/);
    // 예전의 한 파일짜리 화면은 없앴다
    assert.equal(existsSync(resolve(routesDir, 'employees/-employee-management.tsx')), false);
  });

  it('keeps the people list and one person’s work on the same screen', () => {
    assert.match(activitySource, /data-employees-page/);
    assert.match(activitySource, /data-employee-roster/);
    assert.match(activitySource, /data-employee-row/);
    assert.match(activitySource, /data-employee-activity/);
    assert.match(activitySource, /aria-current=\{selected \? 'true' : undefined\}/);
    // 고른 사람이 없으면 본인 → 첫 활성 직원
    assert.match(
      activitySource,
      /visible\.find\(\(employee\) => employee\.id === pickedId\) \?\?\s*visible\.find\(\(employee\) => employee\.id === user\?\.id\) \?\?\s*visible\.find\(\(employee\) => employee\.isActive\)/,
    );
    for (const title of ['담당 업무', '담당 고객', '거래 참여와 정산']) {
      assert.match(activitySource, new RegExp(`title="${title}"`), title);
    }
    for (const label of ['진행 업무', '담당 고객', '진행 거래', '미정산', '누적 상담', '참여 수수료']) {
      assert.match(activitySource, new RegExp(`label="${label}"`), label);
    }
  });

  it('compares workload in the list and puts what needs attention first', () => {
    // 목록의 막대는 팀에서 가장 많이 맡은 사람을 기준으로 그린다
    assert.match(activitySource, /const maxWorkload = Math\.max\(1, \.\.\.visible\.map\(workloadOf\)\);/);
    assert.match(activitySource, /width: `\$\{\(parts\[segment\.key\] \/ maxWorkload\) \* 100\}%`/);
    // 한동안 활동이 없는 활성 직원을 목록에서 알린다
    assert.match(activitySource, /employee\.isActive && \(quiet === null \|\| quiet >= QUIET_DAYS\)/);
    // 지금 챙길 것: 기한 지난·임박 업무, 연락할 고객, 미정산
    assert.match(activitySource, /function buildAttention/);
    assert.match(activitySource, /지금 챙길 것/);
    const attention = activitySource.slice(
      activitySource.indexOf('function buildAttention'),
      activitySource.indexOf('function WorkColumn'),
    );
    assert.match(attention, /if \(days > 1\) continue;/);
    assert.match(attention, /requirement\.status !== 'active'\) continue;/);
    assert.match(attention, /settlementStatus !== 'settled'/);
  });

  it('merges consultations and activity logs into one timeline by day', () => {
    assert.match(activitySource, /function buildTimeline/);
    assert.match(activitySource, /aria-label="활동 타임라인"/);
    const timeline = activitySource.slice(
      activitySource.indexOf('function buildTimeline'),
      activitySource.indexOf('function Timeline('),
    );
    assert.match(timeline, /detail\.recentConsultations\.map/);
    assert.match(timeline, /detail\.recentActivities\.map/);
    assert.match(timeline, /dayHeading\(entry\.at\)/);
    // 앱에서 직접 한 일은 출처를 적지 않는다
    assert.match(timeline, /activity\.source === 'web' \? undefined : describeActivitySource/);
  });

  it('shows the whole team only to the owner and managers', () => {
    assert.match(activitySource, /const canSeeTeam = user\?\.role === 'owner' \|\| user\?\.role === 'manager';/);
    assert.match(
      activitySource,
      /canSeeTeam \? employees : employees\.filter\(\(employee\) => employee\.id === user\?\.id\)/,
    );
    // 목록과 설정으로 가는 길은 팀을 보는 사람에게만
    assert.match(activitySource, /\{canSeeTeam \? \(\s*<aside\s+data-employee-roster/);
    assert.match(activitySource, /canOpenSettings=\{canSeeTeam\}/);
    assert.match(activitySource, /to="\/settings"\s+search=\{\{ section: 'team' \}\}/);
  });

  it('keeps search reachable from the keyboard and keeps inactive people out of the way', () => {
    assert.match(activitySource, /aria-label="직원 검색"/);
    assert.match(activitySource, /event\.key !== '\/'/);
    assert.match(activitySource, /aria-expanded=\{showInactive\}/);
    // 검색 중에는 비활성 직원도 접지 않는다
    assert.match(activitySource, /showInactive \|\| search\.trim\(\)/);
  });
});

describe('설정 › 직원 및 권한: 계정 설정', () => {
  it('lives in settings and is hidden from agents', () => {
    assert.match(settingsSource, /id: 'team'[\s\S]{0,120}label: '직원 및 권한'/);
    assert.match(settingsSource, /activeSection === 'team' && canManageTeam \? \(\s*<TeamSettings \/>/);
    assert.match(settingsSource, /section\.id === 'team' && !canManageTeam\) return false/);
    assert.match(settingsSource, /activeSection === 'team' && user && !canManageTeam\) setActiveSection\('account'\)/);
    // 다른 화면에서 이 항목으로 바로 올 수 있다
    assert.match(settingsSource, /validateSearch:/);
  });

  it('keeps every account operation', () => {
    assert.match(teamSource, /api\.employees\.create/);
    assert.match(teamSource, /api\.employees\.update\(/);
    assert.match(teamSource, /api\.employees\.updateRole/);
    assert.match(teamSource, /api\.employees\.updateStatus/);
    assert.match(teamSource, /api\.employees\.resetPassword/);
    assert.match(teamSource, /직원 계정 슬롯 사용량/);
    assert.match(teamSource, /title="역할 변경"/);
    assert.match(teamSource, /destructive=\{employee\.isActive\}/);
  });

  it('lets only the owner set pay, and shows it only when the server sent it', () => {
    // 서버가 가린 응답(payVisible false)과 대표 계정에는 급여 구역을 그리지 않는다
    assert.match(
      teamSource,
      /const showPay = Boolean\(employee && employee\.payVisible && employee\.role !== 'owner'\);/,
    );
    assert.match(teamSource, /const canEditPay = actorRole === 'owner';/);
    assert.match(teamSource, /\{showPay \? \([\s\S]{0,200}title="급여와 배분"/);
    const paySection = teamSource.slice(
      teamSource.indexOf('title="급여와 배분"'),
      teamSource.indexOf('<SaveBar'),
    );
    assert.match(paySection, /disabled=\{!canEditPay\}/);
    assert.doesNotMatch(paySection, /disabled=\{!canEdit\}/);
    // 매니저가 저장할 때는 급여 값을 보내지 않는다 (서버도 막는다)
    assert.match(teamSource, /\.\.\.\(canEditPay && showPay\s*\? \{\s*payType: values\.payType,/);
  });

  it('lets a manager change only agent accounts and never roles', () => {
    assert.match(
      teamSource,
      /actorRole === 'owner' \|\| \(actorRole === 'manager' && employee\.role === 'agent'\)/,
    );
    assert.match(teamSource, /const canChangeRole = actorRole === 'owner' && employee\.id !== actorId;/);
    assert.match(teamSource, /actorRole === 'owner' \? \['agent', 'manager'\] : \['agent'\]/);
  });
});
