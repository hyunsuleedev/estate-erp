/**
 * 직원 정산. 고객 수금이 끝난 건을 정산 가능으로 나눠 지금 줄 수 있는 돈을 먼저 보여 준다.
 * 직원마다 조회하지 않고 거래 목록 응답 하나로 집계한다.
 * 정산 상태를 바꾸는 API가 아직 없어 이 화면은 조회와 내보내기만 한다.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useMemo, useState } from 'react';
import { Download, Users as UsersIcon } from 'lucide-react';
import type { Deal, Employee } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { EmptyState, StatusBadge } from '@/components/domain';
import {
  ToolbarPillSearch,
  ToolbarPillTabs,
  toolbarGhostButtonClassName,
} from '@/routes/_authenticated/properties/-components/property-toolbar';
import {
  BandItem,
  CashflowBand,
  CashflowError,
  CashflowFooter,
  CashflowLoading,
  CashflowPage,
  CashflowToolbar,
  FoldButton,
  ManagerOnly,
  SummaryStat,
  SummaryStrip,
} from './-cashflow-ui';
import {
  downloadCsv,
  monthKeyOf,
  participantSettlement,
  shortDate,
  toDayKey,
  type SettlementState,
} from './-cashflow-utils';
import {
  PARTICIPANT_ROLE_LABEL,
  dealLocationOf,
} from './-settlement-labels';

export const Route = createFileRoute('/_authenticated/cashflow/employee-settlements')({
  component: EmployeeSettlementsRoute,
});

function EmployeeSettlementsRoute() {
  return (
    <ManagerOnly title="직원 정산">
      <EmployeeSettlementsPage />
    </ManagerOnly>
  );
}

const ROLE_LABEL: Record<string, string> = {
  owner: '대표',
  manager: '매니저',
  agent: '중개사',
};

const PAY_TYPE_LABEL: Record<string, string> = {
  fixed: '고정급',
  mixed: '혼합',
  commission_only: '수수료제',
};

const STATE_ORDER: Record<SettlementState, number> = {
  ready: 0,
  waiting: 1,
  settled: 2,
};

type Tab = 'all' | 'ready' | 'unsettled';

interface ParticipantRow {
  id: string;
  deal: Deal;
  location: string;
  role: string;
  rate: number | null;
  amount: number;
  settlementDate: string | null;
  state: SettlementState;
  percent: number;
}

interface EmployeeRow {
  employee: Employee;
  rows: ParticipantRow[];
  ready: number;
  readyCount: number;
  waiting: number;
  settled: number;
  settledThisMonth: number;
  total: number;
  unsettledCount: number;
}

function buildRows(employees: Employee[], deals: Deal[]): EmployeeRow[] {
  const thisMonth = monthKeyOf(new Date().getFullYear(), new Date().getMonth() + 1);
  const byUser = new Map<string, ParticipantRow[]>();
  for (const deal of deals) {
    if (deal.isCancelled) continue;
    for (const p of deal.participants ?? []) {
      const { state, percent } = participantSettlement(
        p,
        deal.commissionPayments ?? [],
      );
      const list = byUser.get(p.userId) ?? [];
      list.push({
        id: p.id,
        deal,
        location: dealLocationOf(deal),
        role: p.role,
        rate: p.commissionRate != null ? Number(p.commissionRate) : null,
        amount: p.commissionAmount ?? 0,
        settlementDate: p.settlementDate ?? null,
        state,
        percent,
      });
      byUser.set(p.userId, list);
    }
  }
  return employees
    .map((employee) => {
      const rows = (byUser.get(employee.id) ?? []).sort(
        (a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state],
      );
      const sumOf = (test: (row: ParticipantRow) => boolean) =>
        rows.filter(test).reduce((sum, row) => sum + row.amount, 0);
      return {
        employee,
        rows,
        ready: sumOf((r) => r.state === 'ready'),
        readyCount: rows.filter((r) => r.state === 'ready').length,
        waiting: sumOf((r) => r.state === 'waiting'),
        settled: sumOf((r) => r.state === 'settled'),
        settledThisMonth: sumOf(
          (r) =>
            r.state === 'settled' &&
            Boolean(toDayKey(r.settlementDate)?.startsWith(thisMonth)),
        ),
        total: sumOf(() => true),
        unsettledCount: rows.filter((r) => r.state !== 'settled').length,
      };
    })
    .filter((row) => row.employee.isActive || row.rows.length > 0)
    .sort(
      (a, b) => b.ready - a.ready || b.waiting - a.waiting || b.total - a.total,
    );
}

function EmployeeSettlementsPage() {
  const navigate = useNavigate();
  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
  });
  const dealsQuery = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const allRows = useMemo(
    () => buildRows(employeesQuery.data ?? [], dealsQuery.data ?? []),
    [employeesQuery.data, dealsQuery.data],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (tab === 'ready' && row.ready === 0) return false;
      if (tab === 'unsettled' && row.unsettledCount === 0) return false;
      if (!query) return true;
      return [
        row.employee.name,
        row.employee.phone,
        ...row.rows.map((r) => r.location),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [allRows, tab, search]);

  const totals = allRows.reduce(
    (acc, row) => {
      acc.ready += row.ready;
      acc.readyCount += row.readyCount;
      acc.waiting += row.waiting;
      acc.waitingCount += row.unsettledCount - row.readyCount;
      acc.settledThisMonth += row.settledThisMonth;
      acc.settled += row.settled;
      acc.total += row.total;
      return acc;
    },
    {
      ready: 0,
      readyCount: 0,
      waiting: 0,
      waitingCount: 0,
      settledThisMonth: 0,
      settled: 0,
      total: 0,
    },
  );
  const activeCount = visible.filter((r) => r.employee.isActive).length;
  const unsettledCount = visible.reduce((sum, r) => sum + r.unsettledCount, 0);
  const participationCount = visible.reduce((sum, r) => sum + r.rows.length, 0);

  const exportCsv = () =>
    downloadCsv(`직원정산_${toDayKey(new Date())}.csv`, [
      ['직원', '거래', '역할', '배분률(%)', '배분액(만원)', '상태', '정산일'],
      ...visible.flatMap((row) =>
        row.rows.map((r) => [
          row.employee.name,
          r.location,
          PARTICIPANT_ROLE_LABEL[r.role] ?? r.role,
          r.rate,
          r.amount,
          r.state === 'settled'
            ? '정산 완료'
            : r.state === 'ready'
              ? '정산 가능'
              : '수금 대기',
          toDayKey(r.settlementDate),
        ]),
      ),
    ]);

  const toggle = (id: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isLoading = employeesQuery.isLoading || dealsQuery.isLoading;
  const isError = employeesQuery.isError || dealsQuery.isError;

  return (
    <CashflowPage title="직원 정산">
      <CashflowToolbar label="직원 정산 범위와 검색" withLine>
        <ToolbarPillTabs
          ariaLabel="직원 범위"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: '전체', count: allRows.length },
            {
              value: 'ready',
              label: '정산 가능',
              count: allRows.filter((r) => r.ready > 0).length,
            },
            {
              value: 'unsettled',
              label: '미정산',
              count: allRows.filter((r) => r.unsettledCount > 0).length,
            },
          ]}
        />
        <div className="max-w-[460px] min-w-[150px] flex-1">
          <ToolbarPillSearch
            value={search}
            onChange={setSearch}
            placeholder="직원, 전화번호, 호수"
            ariaLabel="직원 정산 검색"
          />
        </div>
        <button
          type="button"
          className={`${toolbarGhostButtonClassName} ml-auto`}
          disabled={participationCount === 0}
          onClick={exportCsv}
        >
          <Download className="size-3.5" />
          내보내기
        </button>
      </CashflowToolbar>

      <SummaryStrip>
        <SummaryStat
          label="정산 가능"
          value={formatMoney(totals.ready)}
          hint={`고객 수금 끝난 ${totals.readyCount}건`}
        />
        <SummaryStat
          label="고객 수금 대기"
          value={formatMoney(totals.waiting)}
          hint={`${totals.waitingCount}건`}
        />
        <SummaryStat
          label="이번 달 정산 완료"
          value={formatMoney(totals.settledThisMonth)}
          hint={`${new Date().getMonth() + 1}월 기준`}
        />
        <SummaryStat
          label="누적 배분"
          value={formatMoney(totals.total)}
          hint={`정산 완료 ${formatMoney(totals.settled)}`}
        />
      </SummaryStrip>

      {isLoading ? (
        <CashflowLoading />
      ) : isError ? (
        <CashflowError
          icon={UsersIcon}
          title="직원 정산 현황을 불러오지 못했습니다"
          onRetry={() => {
            void employeesQuery.refetch();
            void dealsQuery.refetch();
          }}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          className="flex-1"
          title={
            allRows.length === 0
              ? '등록된 직원이 없습니다'
              : '조건에 맞는 직원이 없습니다'
          }
          description={
            allRows.length === 0
              ? '직원관리에서 직원을 추가하면 배분 수수료가 이곳에 모입니다.'
              : '범위나 검색어를 바꿔 보세요.'
          }
        />
      ) : (
        <>
          <CashflowBand>
            <BandItem label="활성 직원" value={`${activeCount}명`} />
            <BandItem label="미정산" value={`${unsettledCount}건`} />
          </CashflowBand>
          <div className="min-h-0 flex-1 overflow-auto">
            <table
              className="cf-table"
              style={{ '--cf-table-min': '940px' } as React.CSSProperties}
            >
              <colgroup>
                <col />
                <col style={{ width: 178 }} />
                <col style={{ width: 68 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="cf-pin-left cf-pin-edge left-0">직원 · 거래</th>
                  <th>급여 · 역할</th>
                  <th className="cf-num">배분률</th>
                  <th className="cf-num">정산 가능</th>
                  <th className="cf-num">수금 대기</th>
                  <th className="cf-num">정산 완료</th>
                  <th className="cf-num">누적 · 상태</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const { employee } = row;
                  // 정산 가능한 건이 있는 직원은 펼쳐서 시작한다.
                  const startOpen = row.ready > 0 || search.trim() !== '';
                  const open = startOpen !== toggled.has(employee.id);
                  const pay = [
                    PAY_TYPE_LABEL[employee.payType] ?? employee.payType,
                    employee.baseSalary
                      ? `기본급 ${formatMoney(employee.baseSalary)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <Fragment key={employee.id}>
                      <tr
                        data-row="group"
                        data-clickable
                        onClick={() => toggle(employee.id)}
                      >
                        <td className="cf-pin-left cf-pin-edge left-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <FoldButton open={open} onToggle={() => toggle(employee.id)} />
                            <span className="min-w-0 truncate">{employee.name}</span>
                            <span className="cf-plain shrink-0 text-xs text-muted-foreground">
                              {ROLE_LABEL[employee.role] ?? employee.role}
                            </span>
                            {!employee.isActive && (
                              <span className="cf-plain shrink-0 rounded-md bg-neutral-soft px-1.5 py-px text-[11px] text-muted-foreground">
                                비활성
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="cf-plain" title={pay}>
                          {pay}
                        </td>
                        <td className="cf-num cf-plain">
                          {employee.commissionRate != null
                            ? `${employee.commissionRate}%`
                            : '—'}
                        </td>
                        <td className="cf-num">{formatMoney(row.ready)}</td>
                        <td className="cf-num">{formatMoney(row.waiting)}</td>
                        <td className="cf-num">{formatMoney(row.settled)}</td>
                        <td className="cf-num">{formatMoney(row.total)}</td>
                      </tr>
                      {open &&
                        row.rows.map((r) => (
                          <tr
                            key={r.id}
                            data-clickable
                            onClick={() =>
                              navigate({
                                to: '/cashflow/ledger',
                                search: { deal: r.deal.id },
                              })
                            }
                          >
                            <td className="cf-pin-left cf-pin-edge left-0">
                              <div className="flex min-w-0 items-center gap-1.5 pl-[22px]">
                                <span className="min-w-0 truncate" title={r.location}>
                                  {r.location}
                                </span>
                                <StatusBadge
                                  kind="transactionType"
                                  status={r.deal.transactionType}
                                  size="sm"
                                />
                              </div>
                            </td>
                            <td className="text-muted-foreground">
                              {PARTICIPANT_ROLE_LABEL[r.role] ?? r.role} ·{' '}
                              {getStatusMeta('dealStage', r.deal.stage).label}
                            </td>
                            <td className="cf-num text-muted-foreground">
                              {r.rate != null ? `${r.rate}%` : '—'}
                            </td>
                            <td className="cf-num">
                              {r.state === 'ready' ? formatMoney(r.amount) : ''}
                            </td>
                            <td className="cf-num">
                              {r.state === 'waiting' ? formatMoney(r.amount) : ''}
                            </td>
                            <td
                              className="cf-num"
                              title={
                                r.settlementDate
                                  ? `${formatDate(r.settlementDate)} 정산`
                                  : undefined
                              }
                            >
                              {r.state === 'settled' ? formatMoney(r.amount) : ''}
                            </td>
                            <td className="cf-num text-muted-foreground">
                              {r.state === 'settled'
                                ? `${shortDate(r.settlementDate)} 정산`
                                : `수금 ${r.percent}%`}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <CashflowFooter>
            직원 {visible.length}명 · 거래 참여 {participationCount}건 표시
          </CashflowFooter>
        </>
      )}
    </CashflowPage>
  );
}
