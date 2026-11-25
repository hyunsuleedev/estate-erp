/**
 * 공동중개 수수료. 파트너별로 묶고 펼치면 거래가 보인다.
 * 받을 몫·줄 몫은 들어온 돈 기준의 금액이다. 상대와 실제로 주고받으면 거래 줄에서 '보냄·받음 기록'을 남긴다
 * (분배 줄마다 정산 완료로 바뀌고, 그 금액은 받을 몫·줄 몫에서 빠진다).
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useMemo, useState } from 'react';
import { Handshake } from 'lucide-react';
import { toast } from 'sonner';
import type { CommissionPayment, DealWithCommissions as Deal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatDate, formatMoney, formatPhone } from '@/lib/format';
import { ConfirmDialog, EmptyState, StatusBadge } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  partnerBalance,
  partnerSettleRows,
  rollupPayments,
  shareTotals,
  dayLabel,
  toDayKey,
  type PartnerSettleRow,
} from './-cashflow-utils';
import { dealLocationOf } from './-settlement-labels';
import { NoticeError, apiErrorMessage } from './-payment-dialogs';

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
  settle: PartnerSettleRow[];
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
    settle: partnerSettleRows(payments),
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
    queryKey: ['deals', 'joint-commissions'],
    queryFn: () => api.deals.findJointWithCommissions(),
  });

  const [year, setYear] = useState('all');
  const [search, setSearch] = useState('');
  const [balanceOnly, setBalanceOnly] = useState(false);
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  // 처음 열 때 주고받을 돈이 있던 파트너. 정산을 기록해도 방금 손댄 줄이 접혀 사라지지 않게 처음 값을 기억한다.
  const [startOpenKeys, setStartOpenKeys] = useState<Set<string> | null>(null);
  const [settling, setSettling] = useState<{ row: DealRow; partnerName: string } | null>(null);
  const [undoing, setUndoing] = useState<DealRow | null>(null);
  const qc = useQueryClient();
  const unsettle = useMutation({
    mutationFn: async (row: DealRow) => {
      for (const item of row.settle.filter((s) => s.settledAt !== null)) {
        await api.finance.commissionPayments.unsettleDistribution(item.distributionId);
      }
    },
    onSuccess: () => {
      toast.success('정산 기록을 되돌렸습니다.');
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      setUndoing(null);
    },
    onError: (error) => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.error(apiErrorMessage(error, '정산 기록을 되돌리지 못했습니다.'));
      setUndoing(null);
    },
  });

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

  if (startOpenKeys === null && deals) {
    setStartOpenKeys(
      new Set(
        aggregateByPartner(deals)
          .filter((partner) => partner.receivable + partner.payable > 0)
          .map((partner) => partner.key),
      ),
    );
  }

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
                <col style={{ width: 132 }} />
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
                  <th>정산</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((partner) => {
                  // 주고받을 돈이 있는 파트너는 펼쳐서 시작한다.
                  const startOpen = startOpenKeys?.has(partner.key) ?? false;
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
                        <td />
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
                            <td onClick={(e) => e.stopPropagation()}>
                              <SettleCell
                                row={row}
                                onSettle={() => setSettling({ row, partnerName: partner.name })}
                                onUndo={() => setUndoing(row)}
                              />
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
            <span>
              파트너 {partners.length}곳 · 공동중개 거래 {totals.dealCount}건 표시
            </span>
            <span>금액 단위 만원 · 부가세 별도</span>
          </CashflowFooter>
        </>
      )}
      {settling && (
        <SettleDialog
          row={settling.row}
          partnerName={settling.partnerName}
          onClose={() => setSettling(null)}
        />
      )}
      <ConfirmDialog
        open={undoing !== null}
        onOpenChange={(open) => !open && setUndoing(null)}
        title="정산 기록 되돌리기"
        description={
          undoing
            ? `${undoing.location}의 공동중개 정산 기록을 지웁니다. 받을 몫·줄 몫에 다시 나옵니다.`
            : undefined
        }
        confirmLabel="되돌리기"
        loading={unsettle.isPending}
        onConfirm={() => {
          if (undoing) unsettle.mutate(undoing);
        }}
      />
    </CashflowPage>
  );
}

/** 거래 줄의 정산 칸: 주고받을 돈이 있으면 기록 단추, 기록했으면 날짜 */
function SettleCell({
  row,
  onSettle,
  onUndo,
}: {
  row: DealRow;
  onSettle: () => void;
  onUndo: () => void;
}) {
  const open = row.settle.filter((s) => s.settledAt === null);
  const done = row.settle.filter((s) => s.settledAt !== null);
  if (open.length > 0) {
    if (!open.some((s) => s.ready)) {
      return <span className="text-xs text-muted-foreground">다 받은 뒤 정산</span>;
    }
    const pays = open.some((s) => s.direction === 'pay');
    const receives = open.some((s) => s.direction === 'receive');
    return (
      <Button type="button" size="xs" variant="outline" className="h-[26px] px-2 font-normal" onClick={onSettle}>
        {pays && receives ? '정산 기록' : pays ? '보냄 기록' : '받음 기록'}
      </Button>
    );
  }
  if (done.length > 0) {
    const last = done
      .map((s) => s.settledAt as string)
      .sort()
      .at(-1);
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {dayLabel(last, false)} 정산함
        <button
          type="button"
          className="underline decoration-[#d8d6d0] underline-offset-2 hover:text-foreground"
          onClick={onUndo}
        >
          되돌리기
        </button>
      </span>
    );
  }
  return null;
}

/** 상대 사무소와 몫을 주고받았다고 기록한다. 다 받은 청구의 몫만 기록한다. */
function SettleDialog({
  row,
  partnerName,
  onClose,
}: {
  row: DealRow;
  partnerName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const targets = row.settle.filter((s) => s.settledAt === null && s.ready);
  const waiting = row.settle.filter((s) => s.settledAt === null && !s.ready);
  const pay = targets.filter((s) => s.direction === 'pay').reduce((sum, s) => sum + s.amount, 0);
  const receive = targets.filter((s) => s.direction === 'receive').reduce((sum, s) => sum + s.amount, 0);
  const today = toDayKey(new Date()) ?? '';
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      let done = 0;
      try {
        for (const item of targets) {
          await api.finance.commissionPayments.settleDistribution(item.distributionId, {
            settledAt: date,
            memo: memo.trim() || undefined,
          });
          done += 1;
        }
      } catch (cause) {
        if (done === 0) throw cause;
        throw new NoticeError(`${targets.length}건 가운데 ${done}건만 기록했습니다. ${apiErrorMessage(cause, '')}`.trim());
      }
    },
    onSuccess: () => {
      toast.success('공동중개 정산을 기록했습니다.');
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['finance', 'ledger'] });
      onClose();
    },
    onError: (error) => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.error(apiErrorMessage(error, '공동중개 정산을 기록하지 못했습니다.'));
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>공동중개 정산 기록</DialogTitle>
          <DialogDescription>
            {row.location} · {partnerName}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-[13px]">
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-2 gap-y-1 [&_dd]:text-right [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
            {pay > 0 && (
              <>
                <dt>보낸 돈</dt>
                <dd className="font-semibold">{formatMoney(pay)}</dd>
              </>
            )}
            {receive > 0 && (
              <>
                <dt>받은 돈</dt>
                <dd className="font-semibold">{formatMoney(receive)}</dd>
              </>
            )}
          </dl>
          <p className="text-xs leading-normal text-muted-foreground">
            {pay > 0 && receive > 0
              ? `${partnerName}에 상대 몫을 보내고 우리 몫을 받은 것으로 기록합니다.`
              : pay > 0
                ? `우리가 받은 수수료에서 ${partnerName} 몫을 보낸 것으로 기록합니다.`
                : `상대 사무소가 받은 수수료에서 우리 몫을 받은 것으로 기록합니다.`}{' '}
            금액은 부가세 별도입니다.
            {waiting.length > 0 && ' 아직 다 받지 않은 청구의 몫은 다 받은 뒤에 기록해 주세요.'}
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="settle-date">{pay > 0 && receive === 0 ? '보낸 날' : receive > 0 && pay === 0 ? '받은 날' : '정산한 날'}</Label>
            <Input
              id="settle-date"
              type="date"
              max={today}
              className="tabular-nums"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="settle-memo">메모 (선택)</Label>
            <Input
              id="settle-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예) 국민은행 이체"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            취소
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || targets.length === 0 || !date || date > today}
          >
            {save.isPending ? '기록 중…' : '기록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
