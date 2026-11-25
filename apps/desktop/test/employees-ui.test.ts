import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type {
  BuyerRequirement,
  Deal,
  Employee,
  EmployeeDealParticipant,
  EmployeeDetail,
  Task,
} from '@estate-erp/api-client';
import {
  avatarToneFor,
  buildEmployeeAttention,
  buildEmployeeTimeline,
  buildTeamAttentionQueue,
  buildTeamKpis,
  computeSplitRatio,
  filterAndSortEmployees,
  formatBuyerBudgetSummary,
  formatBuyerLocationSummary,
  formatDealNextSchedule,
  formatDealValueSummary,
  formatTaskContextLabel,
  formatWonAmount,
  paySummaryText,
  summarizeDealPipeline,
} from '../src/renderer/routes/_authenticated/employees/-employee-model';

const testDir = dirname(fileURLToPath(import.meta.url));
const routesDir = resolve(testDir, '../src/renderer/routes/_authenticated');
const read = (path: string) => readFileSync(resolve(routesDir, path), 'utf8');

const routeSource = read('employees/index.tsx');
const activitySource = read('employees/-activity-screen.tsx');
const railSource = read('employees/-employee-sidebar-rail.tsx');
const opsHubSource = read('employees/-employee-ops-hub.tsx');
const bentoSource = read('employees/-employee-bento-profile.tsx');
const workSource = read('employees/-employee-work-sections.tsx');
const dealsTabSource = read('employees/-employee-deals-tab.tsx');
const accountSource = read('employees/-employee-account-panel.tsx');
const wizardSource = read('employees/-employee-add-wizard.tsx');
const cssSource = read('employees/-employees.css');
const teamSource = read('settings/-team-settings.tsx');
const settingsSource = read('settings/index.tsx');

function sampleEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    officeId: 'office-1',
    loginId: 'emp1',
    email: 'emp1@office.kr',
    name: '김직원',
    phone: '01012345678',
    role: 'agent',
    isActive: true,
    licenseType: 'broker_associate',
    licenseNo: '2024-001',
    payVisible: true,
    payType: 'mixed',
    baseSalary: 250,
    commissionRate: 55,
    employmentType: 'freelancer',
    withholdTax: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
    counts: {
      activeTaskCount: 2,
      activeBuyerRequirementCount: 1,
      activeDealCount: 1,
      unsettledDealCount: 1,
      overdueTaskCount: 0,
      overdueBuyerCount: 0,
      unsettledCommissionTotal: 400,
      consultationCount: 10,
      commissionAmountTotal: 1200,
    },
    attentionItems: [],
    latestActivityAt: '2026-11-22T09:00:00.000Z',
    ...overrides,
  };
}

describe('직원관리: 통합 관제 허브와 벤토 프로필 워크스페이스', () => {
  it('mounts a unified workspace with an always-visible member sidebar and no floating drawer or legacy Notion files', () => {
    assert.match(routeSource, /component: EmployeeActivityScreen/);
    assert.equal(existsSync(resolve(routesDir, 'employees/-employee-management.tsx')), false);
    assert.equal(existsSync(resolve(routesDir, 'employees/-employee-profile-drawer.tsx')), false);
    assert.match(activitySource, /data-employees-page/);
    assert.match(activitySource, /useState<string \| null>\(null\)/);
    assert.match(activitySource, /<EmployeeSidebarRail/);
    assert.match(activitySource, /selectedEmployee \?\s*\(\s*<EmployeeBentoProfile[\s\S]*?\)\s*:\s*\(\s*<EmployeeOpsHub/);
    assert.match(activitySource, /<EmployeeAddWizard/);
    assert.doesNotMatch(railSource, /PanelLeftClose|구성원 목록 접기/);
    assert.doesNotMatch(opsHubSource, /PanelLeftOpen|구성원 목록 펼치기/);
    assert.doesNotMatch(bentoSource, /PanelLeftOpen|구성원 목록 펼치기/);
  });

  it('pins 팀 전체 관제 in the persistent rail alongside KPIs, Leaderboard, Queue, and 5-col Table', () => {
    assert.match(railSource, /data-employee-roster/);
    assert.match(railSource, /data-hub-nav/);
    assert.match(railSource, /팀 전체 관제/);
    assert.match(railSource, /data-employee-row/);
    assert.match(opsHubSource, /팀 성과 · 업무량 리더보드/);
    assert.match(opsHubSource, /지금 확인이 필요한 항목/);
    assert.match(opsHubSource, /구성원 비교 현황표/);
    assert.match(opsHubSource, /data-ops-row/);
    assert.match(bentoSource, /data-employee-activity/);
    assert.match(bentoSource, /팀 전체 관제/);
  });

  it('enforces team visibility and pay/role/security boundaries in integrated views', () => {
    assert.match(
      activitySource,
      /const canSeeTeam = actorRole === 'owner' \|\| actorRole === 'manager';/,
    );
    assert.match(
      activitySource,
      /canSeeTeam\s*\?\s*employees\s*:\s*employees\.filter\(\(employee\) => employee\.id === actorId\)/,
    );
    assert.match(
      activitySource,
      /if \(!canSeeTeam\) return visible\[0\] \?\? null;/,
    );
    // 급여·배분 노출과 수정 권한은 서버(payVisible)와 대표(owner) 기준으로만
    assert.match(
      accountSource,
      /const showPay = Boolean\(detail\.payVisible && detail\.role !== 'owner'\);/,
    );
    assert.match(accountSource, /const canEditPay = actorRole === 'owner';/);
    assert.match(
      accountSource,
      /const canChangeRole = actorRole === 'owner' && detail\.id !== actorId;/,
    );
    assert.match(
      accountSource,
      /\.\.\.\(canEditPay && showPay\s*\?\s*\{\s*payType: values\.payType,/,
    );
    assert.match(
      wizardSource,
      /const roleOptions = isOwner \? \['agent', 'manager'\] : \['agent'\];/,
    );
  });

  it('supports keyboard shortcuts and aligns CSS tokens with the app design system under data attributes', () => {
    assert.match(activitySource, /event\.key === '\/'/);
    assert.match(activitySource, /ArrowUp.*ArrowDown/);
    assert.match(activitySource, /data-slot="dialog-content"/);
    assert.match(activitySource, /data-slot="alert-dialog-content"/);
    assert.match(cssSource, /var\(--color-primary/);
    assert.match(cssSource, /var\(--color-sidebar/);
    assert.match(cssSource, /@layer components/);
    assert.match(cssSource, /\.emp-underline-tabs\b/);
    assert.match(cssSource, /\.emp-detail-grid\b/);
    assert.match(cssSource, /\.emp-pulse-chart\b/);
    assert.match(cssSource, /\.emp-settlement-table\b/);
    assert.doesNotMatch(cssSource, /\.is-collapsed\b/);
    assert.doesNotMatch(cssSource, /^\s*(\*|html|body)\s*\{/m);
  });

  it('structures employee detail as an asymmetric CRM record with 4 tabs, task assignment, projects, scorecard, and gated settlements', () => {
    assert.match(bentoSource, /업무 배정/);
    assert.match(bentoSource, /<TaskCreateDialog[\s\S]*defaultAssigneeId=\{employee\.id\}/);
    assert.match(bentoSource, /업무 현황/);
    assert.match(bentoSource, /거래 · 정산/);
    assert.match(bentoSource, /활동 타임라인/);
    assert.match(bentoSource, /인사 · 급여 · 보안/);
    assert.match(bentoSource, /className="emp-underline-tabs"/);
    assert.match(bentoSource, /className="emp-detail-grid"/);
    assert.match(bentoSource, /<EmployeeActivityScorecard/);
    assert.match(bentoSource, /<EmployeeInspectorCard/);
    assert.match(bentoSource, /<EmployeeProjectsCard/);
    assert.match(bentoSource, /<EmployeeDealsSettlementsTab/);
    assert.match(workSource, /최근 30일 활동/);
    assert.match(workSource, /인사 · 계정 정보/);
    assert.match(workSource, /담당 프로젝트/);
    assert.match(
      dealsTabSource,
      /const showSettlementHistory = Boolean\(\s*detail\.payVisible && detail\.role !== 'owner'/,
    );
    assert.match(dealsTabSource, /월별 확정 정산 이력/);
    assert.match(dealsTabSource, /매도인/);
    assert.match(dealsTabSource, /임대인/);
  });

  it('computes split ratios and pay summaries safely across permissions', () => {
    assert.deepEqual(computeSplitRatio('commission_only', '60', 50), {
      isFixed: false,
      agentPct: 60,
      officePct: 40,
      usingDefault: false,
    });
    assert.deepEqual(computeSplitRatio('mixed', '', 50), {
      isFixed: false,
      agentPct: 50,
      officePct: 50,
      usingDefault: true,
    });
    assert.deepEqual(computeSplitRatio('commission_only', '140', 50), {
      isFixed: false,
      agentPct: 100,
      officePct: 0,
      usingDefault: false,
    });
    assert.deepEqual(computeSplitRatio('fixed', '60', 50), {
      isFixed: true,
      agentPct: 0,
      officePct: 100,
      usingDefault: false,
    });

    assert.equal(paySummaryText(sampleEmployee({ payVisible: false })), null);
    assert.equal(paySummaryText(sampleEmployee({ role: 'owner', payVisible: true })), null);
    assert.equal(
      paySummaryText(sampleEmployee({ payType: 'fixed', baseSalary: 260, commissionRate: null })),
      '고정급 260만',
    );
    assert.equal(
      paySummaryText(sampleEmployee({ payType: 'mixed', baseSalary: 280, commissionRate: 45 })),
      '기본 280만 + 45%',
    );
    assert.equal(
      paySummaryText(sampleEmployee({ payType: 'commission_only', commissionRate: null }), 50),
      '수수료제 50%',
    );
  });

  it('aggregates team KPIs, attention queue order, filters/sorting, detail attention, timeline, and avatar tones', () => {
    const now = new Date('2026-11-22T06:00:00.000Z');
    const empLate = sampleEmployee({
      id: 'emp-late',
      name: '이준호',
      counts: {
        activeTaskCount: 4,
        activeBuyerRequirementCount: 2,
        activeDealCount: 1,
        unsettledDealCount: 1,
        overdueTaskCount: 1,
        overdueBuyerCount: 0,
        unsettledCommissionTotal: 540,
        consultationCount: 30,
        commissionAmountTotal: 2900,
      },
      attentionItems: [
        { kind: 'buyer', id: 'b-today', title: '박지영', dueDate: '2026-11-22T01:00:00.000Z' },
        { kind: 'task', id: 't-late', title: '가계약 계좌 확인', dueDate: '2026-11-20T01:00:00.000Z' },
        { kind: 'task', id: 't-future', title: '다음주 업무', dueDate: '2026-11-26T01:00:00.000Z' },
      ],
      latestActivityAt: '2026-11-22T04:00:00.000Z',
    });
    const empQuiet = sampleEmployee({
      id: 'emp-quiet',
      name: '최민석',
      role: 'manager',
      counts: {
        activeTaskCount: 1,
        activeBuyerRequirementCount: 0,
        activeDealCount: 0,
        unsettledDealCount: 0,
        overdueTaskCount: 0,
        overdueBuyerCount: 0,
        unsettledCommissionTotal: 0,
        consultationCount: 5,
        commissionAmountTotal: 420,
      },
      attentionItems: [],
      latestActivityAt: '2026-11-12T01:00:00.000Z',
    });
    const empInactive = sampleEmployee({
      id: 'emp-inactive',
      name: '윤아름',
      isActive: false,
      counts: {
        activeTaskCount: 10,
        activeBuyerRequirementCount: 0,
        activeDealCount: 0,
        unsettledDealCount: 2,
        unsettledCommissionTotal: 999,
      },
      latestActivityAt: null,
    });

    const team = [empQuiet, empLate, empInactive];
    const kpis = buildTeamKpis(team, now);
    assert.deepEqual(kpis, {
      activeCount: 2,
      inactiveCount: 1,
      totalCount: 3,
      tasks: 5,
      customers: 2,
      deals: 1,
      workload: 8,
      unsettledPeople: 1,
      unsettledDeals: 1,
      unsettledCommissionTotal: 540,
      attentionPeople: 2,
    });

    const queue = buildTeamAttentionQueue(team, now);
    assert.deepEqual(
      queue.map((q) => `${q.kind}:${q.badge}:${q.targetTab}`),
      [
        'task:2일 지연:overview',
        'buyer:오늘 연락:overview',
        'quiet:10일 무활동:timeline',
      ],
    );

    const byCommission = filterAndSortEmployees(
      team,
      { statusFilter: 'active', roleFilter: '', quickFilter: 'all', search: '', sort: 'commission' },
      now,
    );
    assert.deepEqual(byCommission.map((e) => e.id), ['emp-late', 'emp-quiet']);

    const attentionOnly = filterAndSortEmployees(
      team,
      { statusFilter: 'active', roleFilter: 'manager', quickFilter: 'attention', search: '', sort: 'name' },
      now,
    );
    assert.deepEqual(attentionOnly.map((e) => e.id), ['emp-quiet']);

    assert.equal(avatarToneFor(empInactive), 'slate');
    assert.equal(avatarToneFor(empQuiet), 'blue');
    assert.equal(avatarToneFor(sampleEmployee({ id: 'o', role: 'owner' })), 'indigo');

    const fakeDetail = {
      ...empLate,
      office: { id: 'office-1', name: '고덕', commissionConfig: null },
      assignedTasks: [
        { id: 't1', title: '연체 업무', status: 'pending', dueDate: '2026-11-20T01:00:00.000Z' },
        { id: 't2', title: '내일 업무', status: 'in_progress', dueDate: '2026-11-23T01:00:00.000Z' },
        { id: 't3', title: '먼 업무', status: 'pending', dueDate: '2026-11-27T01:00:00.000Z' },
      ],
      assignedBuyerRequirements: [
        {
          id: 'b1',
          status: 'active',
          nextContactDate: '2026-11-21T01:00:00.000Z',
          contact: { name: '김민수' },
        },
        {
          id: 'b2',
          status: 'hold',
          nextContactDate: '2026-11-20T01:00:00.000Z',
          contact: { name: '보류고객' },
        },
      ],
      dealParticipants: [
        {
          id: 'dp1',
          settlementStatus: 'unsettled',
          commissionAmount: 300,
          deal: { id: 'd1' },
        },
      ],
      recentConsultations: [
        {
          id: 'c1',
          type: 'phone',
          content: '가계약 상담 진행',
          createdAt: '2026-11-22T03:00:00.000Z',
          contact: { name: '김민수' },
        },
      ],
      recentActivities: [
        {
          id: 'a1',
          action: 'update',
          entityType: 'deal',
          entityId: 'd1',
          source: 'web',
          reason: '계약 준비',
          createdAt: '2026-11-22T02:00:00.000Z',
        },
        {
          id: 'a2',
          action: 'create',
          entityType: 'task',
          entityId: 't1',
          source: 'mcp',
          reason: null,
          createdAt: '2026-11-21T05:00:00.000Z',
        },
      ],
    } as unknown as EmployeeDetail;

    const detailAttention = buildEmployeeAttention(fakeDetail, 'agent', now);
    assert.deepEqual(
      detailAttention.map((item) => `${item.kind}:${item.tone}:${item.when}`),
      ['task:late:2일 지남', 'buyer:late:1일 지남', 'task:soon:내일', 'unsettled:soon:300만'],
    );
    assert.equal(detailAttention[3]?.settlementRoute, '/cashflow/my-settlement');

    const timeline = buildEmployeeTimeline(fakeDetail, now);
    assert.equal(timeline.length, 2);
    assert.equal(timeline[0]?.day, '오늘');
    assert.equal(timeline[0]?.entries[0]?.kind, 'consultation');
    assert.equal(timeline[0]?.entries[1]?.meta, undefined);
    assert.equal(timeline[1]?.day, '어제');
    assert.equal(timeline[1]?.entries[0]?.meta, 'AI 연결');
  });

  it('formats CRM record values, buyer budgets/locations, deal milestones, task contexts, and settlement amounts', () => {
    assert.equal(formatWonAmount(1672000), '1,672,000원');
    assert.equal(formatWonAmount(-120000), '-120,000원');
    assert.equal(formatWonAmount(0), '0원');
    assert.equal(formatWonAmount(null), '—');

    assert.equal(
      formatBuyerBudgetSummary({
        transactionType: 'sale',
        priceMin: 100000,
        priceMax: 120000,
      } as BuyerRequirement),
      '매매 10억 ~ 12억',
    );
    assert.equal(
      formatBuyerBudgetSummary({
        transactionType: 'monthly',
        depositMin: 10000,
        depositMax: 10000,
        monthlyRentMin: 200,
        monthlyRentMax: 250,
      } as BuyerRequirement),
      '월세 1억 / 200만 ~ 250만',
    );
    assert.equal(
      formatBuyerBudgetSummary({
        transactionType: null,
        priceMin: null,
        priceMax: null,
      } as BuyerRequirement),
      '조건 미입력',
    );

    assert.equal(
      formatBuyerLocationSummary({
        preferredSites: [
          { id: '1', siteId: 's1', priority: 1, memo: null, site: { id: 's1', name: '고덕그라시움', type: 'apartment' } },
          { id: '2', siteId: 's2', priority: 2, memo: null, site: { id: 's2', name: '고덕아르테온', type: 'apartment' } },
        ],
      } as BuyerRequirement),
      '고덕그라시움 외 1',
    );
    assert.equal(
      formatBuyerLocationSummary({
        preferredRegions: [
          {
            id: 'r1',
            provinceCode: '11',
            districtCode: '11740',
            wardCode: '1174010100',
            district: { code: '11740', name: '강동구' },
            ward: { code: '1174010100', name: '고덕동' },
          },
        ],
      } as BuyerRequirement),
      '강동구 고덕동',
    );
    assert.equal(formatBuyerLocationSummary({} as BuyerRequirement), null);

    assert.equal(
      formatDealValueSummary({
        transactionType: 'sale',
        agreedPrice: 198000,
      } as Deal),
      '매매 19억 8,000만',
    );
    assert.equal(
      formatDealValueSummary({
        transactionType: 'monthly',
        agreedDeposit: 10000,
        agreedMonthlyRent: 250,
      } as Deal),
      '월세 1억 / 250만',
    );
    assert.equal(
      formatDealValueSummary({ transactionType: 'jeonse' } as Deal),
      '전세 · 금액 미정',
    );

    assert.deepEqual(
      formatDealNextSchedule({
        payments: [
          { id: 'p1', kind: 'contract', sequence: 1, scheduledAmount: 5000, scheduledDate: '2026-11-01T00:00:00Z', status: 'paid' },
          { id: 'p2', kind: 'balance', sequence: 1, scheduledAmount: 50000, scheduledDate: '2026-12-10T00:00:00Z', status: 'pending' },
          { id: 'p3', kind: 'interim', sequence: 2, scheduledAmount: 10000, scheduledDate: '2026-11-28T00:00:00Z', status: 'pending' },
        ],
      } as unknown as Deal),
      { label: '2차 중도금', date: '2026-11-28T00:00:00Z' },
    );
    assert.deepEqual(
      formatDealNextSchedule({
        payments: [],
        contract: { statedBalanceDate: '2026-12-20T00:00:00Z' },
        agreedMoveInDate: '2026-12-22T00:00:00Z',
      } as unknown as Deal),
      { label: '잔금 예정', date: '2026-12-20T00:00:00Z' },
    );
    assert.deepEqual(
      formatDealNextSchedule({
        payments: [],
        agreedMoveInDate: '2026-12-22T00:00:00Z',
      } as unknown as Deal),
      { label: '입주 예정', date: '2026-12-22T00:00:00Z' },
    );

    assert.equal(
      formatTaskContextLabel({
        contact: { id: 'c1', name: '김민수', phone: null },
        property: {
          site: { name: '고덕그라시움' },
          unit: { name: '2203', dong: { name: '102', isPlaceholder: false } },
        },
      } as unknown as Task),
      '김민수 · 고덕그라시움 102동 2203호',
    );

    assert.deepEqual(
      summarizeDealPipeline([
        {
          settlementStatus: 'unsettled',
          commissionAmount: 350,
          deal: { stage: 'contracted' },
        },
        {
          settlementStatus: 'settled',
          commissionAmount: 500,
          deal: { stage: 'closed' },
        },
      ] as unknown as EmployeeDealParticipant[]),
      {
        total: 2,
        active: 1,
        closed: 1,
        settled: 1,
        unsettled: 1,
        totalCommission: 850,
        unsettledCommission: 350,
      },
    );
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
