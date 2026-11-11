/**
 * 내 수수료. "내 돈이 어디까지 왔나"에 답하도록 정산 받을 수 있음, 고객 수금 대기, 정산 완료로 묶는다.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Handshake } from 'lucide-react';
import type { Deal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { EmptyState, StatusBadge } from '@/components/domain';
import {
  ToolbarPillSearch,
  ToolbarPillTabs,
} from '@/routes/_authenticated/properties/-components/property-toolbar';
import {
  CashflowError,
  CashflowFooter,
  CashflowLoading,
  CashflowPage,
  CashflowToolbar,
  CollectMeter,
  SummaryStat,
  SummaryStrip,
} from './-cashflow-ui';
import {
  participantSettlement,
  type SettlementState,
} from './-cashflow-utils';
import {
  PARTICIPANT_ROLE_LABEL,
  dealLocationOf,
} from './-settlement-labels';

export const Route = createFileRoute('/_authenticated/cashflow/my-settlement')({
  component: MySettlementPage,
});

const PAY_TYPE_LABEL: Record<string, string> = {
  fixed: '고정급',
  mixed: '혼합',
  commission_only: '수수료제',
};

const GROUPS: Array<{
  state: SettlementState;
  label: string;
  hint?: string;
}> = [
  {
    state: 'ready',
    label: '정산 받을 수 있음',
    hint: '대표 정산을 기다리는 중입니다',
  },
  {
    state: 'waiting',
    label: '고객 수금 대기',
    hint: '고객이 수수료를 내면 정산할 수 있습니다',
  },
  { state: 'settled', label: '정산 완료' },
];

type Tab = 'all' | 'unsettled' | 'settled';

interface MyRow {
  id: string;
  deal: Deal;
  location: string;
  role: string;
  rate: number | null;
  amount: number;
  settlementDate: string | null;
  state: SettlementState;
  billed: number;
  collected: number;
  percent: number;
}

function MySettlementPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const myId = user?.id;

  const dealsQuery = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
    enabled: !!myId,
  });
  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
    enabled: !!myId,
  });

  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [closed, setClosed] = useState<Set<SettlementState>>(new Set());

  const me = employeesQuery.data?.find((e) => e.id === myId);

  const rows = useMemo<MyRow[]>(() => {
    const out: MyRow[] = [];
    for (const deal of dealsQuery.data ?? []) {
      if (deal.isCancelled) continue;
      for (const p of deal.participants ?? []) {
        if (p.userId !== myId) continue;
        const { state, billed, collected, percent } = participantSettlement(
          p,
          deal.commissionPayments ?? [],
        );
        out.push({
          id: p.id,
          deal,
          location: dealLocationOf(deal),
          role: p.role,
          rate: p.commissionRate != null ? Number(p.commissionRate) : null,
          amount: p.commissionAmount ?? 0,
          settlementDate: p.settlementDate ?? null,
          state,
          billed,
          collected,
          percent,
        });
      }
    }
    return out.sort(
      (a, b) =>
        new Date(b.deal.stageChangedAt).getTime() -
        new Date(a.deal.stageChangedAt).getTime(),
    );
  }, [dealsQuery.data, myId]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (tab === 'unsettled' && row.state === 'settled') return false;
      if (tab === 'settled' && row.state !== 'settled') return false;
      return !query || row.location.toLowerCase().includes(query);
    });
  }, [rows, tab, search]);

  const sumOf = (state: SettlementState, list = rows) =>
    list
      .filter((row) => row.state === state)
      .reduce((sum, row) => sum + row.amount, 0);
  const countOf = (state: SettlementState) =>
    rows.filter((row) => row.state === state).length;

  const toggle = (state: SettlementState) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });

  return (
    <CashflowPage title="내 수수료">
      <CashflowToolbar label="내 수수료 범위와 검색" withLine>
        <ToolbarPillTabs
          ariaLabel="정산 범위"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: '전체', count: rows.length },
            {
              value: 'unsettled',
              label: '미정산',
              count: rows.filter((r) => r.state !== 'settled').length,
            },
            { value: 'settled', label: '정산 완료', count: countOf('settled') },
          ]}
        />
        <div className="max-w-[460px] min-w-[150px] flex-1">
          <ToolbarPillSearch
            value={search}
            onChange={setSearch}
            placeholder="단지, 호수"
            ariaLabel="내 수수료 검색"
          />
        </div>
        <span className="ml-auto text-[12.5px] whitespace-nowrap text-muted-foreground">
          정산은 대표가 처리합니다
        </span>
      </CashflowToolbar>

      <SummaryStrip>
        <SummaryStat
          label="정산 받을 수 있는 돈"
          value={formatMoney(sumOf('ready'))}
          hint={`고객 수금 끝난 ${countOf('ready')}건`}
        />
        <SummaryStat
          label="고객 수금 대기"
          value={formatMoney(sumOf('waiting'))}
          hint={`${countOf('waiting')}건`}
        />
        <SummaryStat
          label="정산 완료"
          value={formatMoney(sumOf('settled'))}
          hint={`${countOf('settled')}건`}
        />
        <SummaryStat
          label="내 배분 조건"
          value={me?.commissionRate != null ? `${me.commissionRate}%` : '—'}
          hint={
            me
              ? [
                  me.baseSalary ? `기본급 ${formatMoney(me.baseSalary)}` : null,
                  PAY_TYPE_LABEL[me.payType] ?? me.payType,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : '—'
          }
        />
      </SummaryStrip>

      {dealsQuery.isLoading ? (
        <CashflowLoading />
      ) : dealsQuery.isError ? (
        <CashflowError
          icon={Handshake}
          title="정산 내역을 불러오지 못했습니다"
          onRetry={() => dealsQuery.refetch()}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Handshake}
          className="flex-1"
          title={
            rows.length === 0
              ? '아직 참여한 거래가 없습니다'
              : '조건에 맞는 거래가 없습니다'
          }
          description={
            rows.length === 0
              ? '거래에 참여하면 이 화면에 내 배분 수수료가 모입니다.'
              : '범위나 검색어를 바꿔 보세요.'
          }
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto">
            <table
              className="cf-table"
              style={{ '--cf-table-min': '860px' } as React.CSSProperties}
            >
              <colgroup>
                <col />
                <col style={{ width: 104 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 104 }} />
                <col style={{ width: 108 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>거래</th>
                  <th>거래 단계</th>
                  <th>내 역할</th>
                  <th className="cf-num">배분률</th>
                  <th>고객 수금</th>
                  <th>정산일</th>
                  <th className="cf-num">배분액</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map(({ state, label, hint }) => {
                  const items = visible.filter((row) => row.state === state);
                  if (items.length === 0) return null;
                  const isClosed = closed.has(state);
                  return (
                    <Fragment key={state}>
                      <tr
                        data-row="group"
                        data-clickable
                        aria-expanded={!isClosed}
                        onClick={() => toggle(state)}
                      >
                        <td colSpan={6}>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex text-muted-foreground">
                              {isClosed ? (
                                <ChevronRight className="size-3.5" />
                              ) : (
                                <ChevronDown className="size-3.5" />
                              )}
                            </span>
                            {label}
                            <span className="cf-plain text-[#a5a39f] tabular-nums">
                              {items.length}
                            </span>
                            {hint && (
                              <span className="cf-plain text-xs text-muted-foreground">
                                {hint}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="cf-num">{formatMoney(sumOf(state, items))}</td>
                      </tr>
                      {!isClosed &&
                        items.map((row) => (
                          <tr
                            key={row.id}
                            data-clickable
                            onClick={() =>
                              navigate({
                                to: '/deals',
                                search: { dealId: row.deal.id },
                              })
                            }
                          >
                            <td>
                              <div className="flex min-w-0 items-center gap-1.5 pl-[22px]">
                                <span className="min-w-0 truncate" title={row.location}>
                                  {row.location}
                                </span>
                                <StatusBadge
                                  kind="transactionType"
                                  status={row.deal.transactionType}
                                  size="sm"
                                />
                              </div>
                            </td>
                            <td>
                              <StatusBadge kind="dealStage" status={row.deal.stage} size="sm" />
                            </td>
                            <td>{PARTICIPANT_ROLE_LABEL[row.role] ?? row.role}</td>
                            <td className="cf-num text-muted-foreground">
                              {row.rate != null ? `${row.rate}%` : '—'}
                            </td>
                            <td>
                              <div
                                className="grid grid-cols-[46px_minmax(0,1fr)] items-center gap-2 text-[12.5px] text-muted-foreground tabular-nums"
                                title={`고객 수금 ${formatMoney(row.collected)} / ${formatMoney(row.billed)}`}
                              >
                                <span>{row.percent}%</span>
                                <CollectMeter percent={row.percent} />
                              </div>
                            </td>
                            <td className="tabular-nums">
                              {row.settlementDate ? (
                                formatDate(row.settlementDate)
                              ) : (
                                <span className="text-[#a5a39f]">—</span>
                              )}
                            </td>
                            <td className="cf-num font-semibold">
                              {formatMoney(row.amount)}
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
            {user?.name ? `${user.name} · ` : ''}참여 거래 {visible.length}건 표시
          </CashflowFooter>
        </>
      )}
    </CashflowPage>
  );
}
