/**
 * 공동중개 수수료. 파트너별로 묶고 펼치면 거래가 보인다.
 * 분배를 정산 완료로 바꾸는 API가 아직 없어, 받을 몫·줄 몫은 들어온 돈 기준의 금액으로만 보여 준다.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useMemo, useState } from 'react';
import { Handshake } from 'lucide-react';
import type { CommissionPayment, Deal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatDate, formatMoney, formatPhone } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/domain';
import {
  ToolbarPillSearch,
  ToolbarPillTabs,
  ToolbarToggleChip,
} from '@/routes/_authenticated/properties/-components/property-toolbar';
import {
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
import { partnerBalance, rollupPayments, shareTotals } from './-cashflow-utils';
import { dealLocationOf } from './-settlement-labels';

export const Route = createFileRoute('/_authenticated/cashflow/partner-commissions')({
  component: PartnerCommissionsRoute,
});

function PartnerCommissionsRoute() {
  return (
    <ManagerOnly title="공동중개 수수료">
      <PartnerCommissionsPage />
    </ManagerOnly>
  );
}

interface DealRow {
  deal: Deal;
  location: string;
  billed: number;
  collected: number;
  ourShare: number;
  partnerShare: number;
  receivable: number;
  payable: number;
}

interface PartnerRow {
  key: string;
  name: string;
  phone: string | null;
  deals: DealRow[];
  billed: number;
  collected: number;
  ourShare: number;
  partnerShare: number;
  receivable: number;
  payable: number;
  lastDealAt: string;
}

function toDealRow(deal: Deal): DealRow {
  const payments: CommissionPayment[] = deal.commissionPayments ?? [];
  const { billed, collected } = rollupPayments(payments);
  const { receivable, payable } = partnerBalance(payments);
  const shares = shareTotals(payments);
  return {
    deal,
    location: dealLocationOf(deal),
    billed,
    collected,
    ourShare: shares.our,
    partnerShare: shares.partner,
    receivable,
    payable,
  };
}

function aggregateByPartner(deals: Deal[]): PartnerRow[] {
  const map = new Map<string, PartnerRow>();
  for (const deal of deals) {
    if (!deal.isJointBrokerage || deal.isCancelled) continue;
    const key = deal.partnerBrokerId ?? `unlinked:${deal.partnerBroker?.name ?? ''}`;
    const row = toDealRow(deal);
    const partner = map.get(key) ?? {
      key,
      name: deal.partnerBroker?.name ?? '미지정 파트너',
      phone: deal.partnerBroker?.phone ?? null,
      deals: [],
      billed: 0,
      collected: 0,
      ourShare: 0,
      partnerShare: 0,
      receivable: 0,
      payable: 0,
      lastDealAt: deal.stageChangedAt,
    };
    partner.deals.push(row);
    partner.billed += row.billed;
    partner.collected += row.collected;
    partner.ourShare += row.ourShare;
    partner.partnerShare += row.partnerShare;
    partner.receivable += row.receivable;
    partner.payable += row.payable;
    if (deal.stageChangedAt > partner.lastDealAt) {
      partner.lastDealAt = deal.stageChangedAt;
    }
    map.set(key, partner);
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      b.receivable + b.payable - (a.receivable + a.payable) ||
      b.ourShare - a.ourShare,
  );
}

function PartnerCommissionsPage() {
  const navigate = useNavigate();
  const { data: deals, isLoading, isError, refetch } = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  const [year, setYear] = useState('all');
  const [search, setSearch] = useState('');
  const [balanceOnly, setBalanceOnly] = useState(false);
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const d of deals ?? []) {
      if (d.isJointBrokerage) years.add(new Date(d.stageChangedAt).getFullYear());
    }
    return [
      { value: 'all', label: '전체 기간' },
      ...Array.from(years)
        .sort((a, b) => b - a)
        .map((y) => ({ value: String(y), label: `${y}년` })),
    ];
  }, [deals]);

  const partners = useMemo(() => {
    const scoped = (deals ?? []).filter(
      (d) =>
        year === 'all' ||
        new Date(d.stageChangedAt).getFullYear() === Number(year),
    );
    const query = search.trim().toLowerCase();
    return aggregateByPartner(scoped).filter((partner) => {
      if (balanceOnly && partner.receivable + partner.payable === 0) return false;
      if (!query) return true;
      return [partner.name, partner.phone, ...partner.deals.map((d) => d.location)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [deals, year, search, balanceOnly]);

  const totals = partners.reduce(
    (acc, p) => {
      acc.receivable += p.receivable;
      acc.payable += p.payable;
      acc.ourShare += p.ourShare;
      acc.partnerShare += p.partnerShare;
      acc.dealCount += p.deals.length;
      return acc;
    },
    { receivable: 0, payable: 0, ourShare: 0, partnerShare: 0, dealCount: 0 },
  );

  const toggle = (key: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <CashflowPage title="공동중개 수수료">
      <CashflowToolbar label="공동중개 수수료 기간과 검색" withLine>
        <ToolbarPillTabs
          ariaLabel="기간"
          value={year}
          options={yearOptions}
          onChange={setYear}
        />
        <div className="max-w-[460px] min-w-[150px] flex-1">
          <ToolbarPillSearch
            value={search}
            onChange={setSearch}
            placeholder="사무소, 전화번호, 호수"
            ariaLabel="공동중개 수수료 검색"
          />
        </div>
        <ToolbarToggleChip
          label="주고받을 돈 있는 곳만"
          active={balanceOnly}
          onToggle={() => setBalanceOnly((v) => !v)}
        />
      </CashflowToolbar>

      <SummaryStrip>
        <SummaryStat
          label="파트너가 받은 우리 몫"
          value={formatMoney(totals.receivable)}
          hint="수금액 기준"
        />
        <SummaryStat
          label="우리가 받은 파트너 몫"
          value={formatMoney(totals.payable)}
          hint="수금액 기준"
        />
        <SummaryStat
          label="우리 몫 누적"
          value={formatMoney(totals.ourShare)}
          hint={`거래 ${totals.dealCount}건`}
        />
        <SummaryStat
          label="파트너 몫 누적"
          value={formatMoney(totals.partnerShare)}
          hint={`사무소 ${partners.length}곳`}
        />
      </SummaryStrip>

      {isLoading ? (
        <CashflowLoading />
      ) : isError ? (
        <CashflowError
          icon={Handshake}
          title="공동중개 현황을 불러오지 못했습니다"
          onRetry={() => refetch()}
        />
      ) : partners.length === 0 ? (
        <EmptyState
          icon={Handshake}
          className="flex-1"
          title={
            search || balanceOnly
              ? '조건에 맞는 파트너가 없습니다'
              : '공동중개 거래가 아직 없습니다'
          }
          description={
            search || balanceOnly
              ? '검색어나 필터를 바꿔 보세요.'
              : '거래를 만들 때 공동중개로 표시하면 파트너별로 모입니다.'
          }
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-auto">
            <table
              className="cf-table"
              style={{ '--cf-table-min': '1000px' } as React.CSSProperties}
            >
              <colgroup>
                <col />
                <col style={{ width: 92 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="cf-pin-left cf-pin-edge left-0">
                    파트너 사무소 · 거래
                  </th>
                  <th>건수 · 단계</th>
                  <th className="cf-num">청구액</th>
                  <th className="cf-num">우리 몫</th>
                  <th className="cf-num">파트너 몫</th>
                  <th className="cf-num">수금</th>
                  <th className="cf-num" title="파트너가 받은 돈 중 우리 몫">
                    받을 몫
                  </th>
                  <th className="cf-num" title="우리가 받은 돈 중 파트너 몫">
                    줄 몫
                  </th>
                  <th>최근 거래</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((partner) => {
                  // 주고받을 돈이 있는 파트너는 펼쳐서 시작한다.
                  const startOpen = partner.receivable + partner.payable > 0;
                  const open = startOpen !== toggled.has(partner.key);
                  return (
                    <Fragment key={partner.key}>
                      <tr
                        data-row="group"
                        data-clickable
                        onClick={() => toggle(partner.key)}
                      >
                        <td className="cf-pin-left cf-pin-edge left-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <FoldButton open={open} onToggle={() => toggle(partner.key)} />
                            <span className="min-w-0 truncate">{partner.name}</span>
                            {partner.phone && (
                              <span className="cf-plain shrink-0 text-xs text-muted-foreground tabular-nums">
                                {formatPhone(partner.phone)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="tabular-nums">{partner.deals.length}건</td>
                        <td className="cf-num">{formatMoney(partner.billed)}</td>
                        <td className="cf-num">{formatMoney(partner.ourShare)}</td>
                        <td className="cf-num">{formatMoney(partner.partnerShare)}</td>
                        <td className="cf-num">{formatMoney(partner.collected)}</td>
                        <td className="cf-num">{formatMoney(partner.receivable)}</td>
                        <td className="cf-num">{formatMoney(partner.payable)}</td>
                        <td className="cf-plain tabular-nums">
                          {formatDate(partner.lastDealAt)}
                        </td>
                      </tr>
                      {open &&
                        partner.deals.map((row) => (
                          <tr
                            key={row.deal.id}
                            data-clickable
                            onClick={() =>
                              navigate({
                                to: '/cashflow/ledger',
                                search: { deal: row.deal.id },
                              })
                            }
                          >
                            <td className="cf-pin-left cf-pin-edge left-0">
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
                            <td className="cf-num">{formatMoney(row.billed)}</td>
                            <td className="cf-num">{formatMoney(row.ourShare)}</td>
                            <td className="cf-num">{formatMoney(row.partnerShare)}</td>
                            <td className="cf-num">{formatMoney(row.collected)}</td>
                            <td className="cf-num">{formatMoney(row.receivable)}</td>
                            <td className="cf-num">{formatMoney(row.payable)}</td>
                            <td className="text-muted-foreground tabular-nums">
                              {formatDate(row.deal.stageChangedAt)}
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
            파트너 {partners.length}곳 · 공동중개 거래 {totals.dealCount}건 표시
          </CashflowFooter>
        </>
      )}
    </CashflowPage>
  );
}
