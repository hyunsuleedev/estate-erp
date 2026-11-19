/**
 * 직원 정산. 한 달 동안 들어온 수수료에서 직원별 몫을 계산하고, 확정한 뒤 지급을 기록한다.
 *
 * 확정 전에는 서버가 입금 기록에서 그때그때 계산한 값을 보여 준다. 확정하면 그때의 금액과
 * 직원 조건이 굳어, 뒤에 직원 몫이나 정산 시점을 바꿔도 달라지지 않는다.
 *
 * 계산 규칙은 서버(settlement-calc.ts)에만 있다. 화면은 받은 숫자를 그대로 보여 준다.
 *   고정: 부가세를 빼고 나눈다 / 공동중개 상대 몫을 먼저 뺀다 / 돌려준 돈은 다음 정산에서 뺀다
 *   사무소가 고르는 것: 정산 시점 하나 (잔금이 끝난 뒤 / 돈이 들어온 달)
 *
 * 직원별 지급액이 드러나므로 대표만 본다 (급여와 배분율을 대표만 보는 것과 같은 기준).
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronDown, Download, Lock, Plus, Users as UsersIcon, X } from 'lucide-react';
import type {
  SettlementLine,
  SettlementTiming,
  SettlementView,
  SettlementWaitingItem,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { EmptyState } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toolbarGhostButtonClassName } from '@/routes/_authenticated/properties/-components/property-toolbar';
import {
  CashflowBand,
  CashflowError,
  CashflowFooter,
  CashflowLoading,
  CashflowPage,
  CashflowToolbar,
  FoldButton,
  MonthStepper,
} from './-cashflow-ui';
import { downloadCsv, shortDate } from './-cashflow-utils';

export const Route = createFileRoute('/_authenticated/cashflow/employee-settlements')({
  component: EmployeeSettlementsRoute,
});

function EmployeeSettlementsRoute() {
  const { user } = useAuth();
  if (user?.role !== 'owner') {
    return (
      <CashflowPage title="직원 정산">
        <EmptyState
          icon={Lock}
          title="대표만 볼 수 있는 화면입니다"
          description="직원별 지급액이 나오는 화면이라 대표에게만 열려 있습니다. 본인 정산은 내 수수료에서 확인할 수 있습니다."
          className="flex-1"
          action={
            <Button asChild variant="outline">
              <Link to="/cashflow/my-settlement">내 수수료로 이동</Link>
            </Button>
          }
        />
      </CashflowPage>
    );
  }
  return <EmployeeSettlementsPage />;
}

const TIMING_LABEL: Record<SettlementTiming, string> = {
  closed: '잔금이 끝난 뒤',
  received: '돈이 들어온 달',
};
const TIMING_HINT: Record<SettlementTiming, string> = {
  closed: '잔금까지 끝난 거래만 정산합니다.',
  received: '수수료가 들어온 달에 바로 정산합니다.',
};

const WAITING_LABEL: Record<SettlementWaitingItem['reason'], string> = {
  balance: '잔금이 끝나면 정산',
  participants: '담당이 정해지지 않음',
  ratio: '직원 몫이 정해지지 않음',
};

/** 금액은 원 단위다. 0은 흐린 줄표로 보인다. */
function won(value: number): string {
  return value.toLocaleString('ko-KR');
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '요청을 처리하지 못했습니다';
}

const isEmployee = (line: SettlementLine) => line.employmentType === 'employee';

function EmployeeSettlementsPage() {
  const queryClient = useQueryClient();
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<SettlementWaitingItem | null>(null);
  const month = monthKey(cursor.year, cursor.month);
  const queryKey = ['settlement', month];

  const settlement = useQuery({ queryKey, queryFn: () => api.finance.settlements.get(month) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['settlement'] });
  // 서버가 돌려준 정산으로 바로 바꿔 끼운다. 다시 불러오는 사이에 예전 숫자가 보이지 않게 한다.
  const apply = (view: SettlementView) => {
    queryClient.setQueryData(['settlement', view.month], view);
    void refresh();
  };
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const confirm = useMutation({
    mutationFn: () => api.finance.settlements.confirm(month),
    onSuccess: (view) => {
      apply(view);
      toast.success(`${cursor.month}월 정산을 확정했습니다`, { description: '이제 이 달의 금액은 바뀌지 않습니다.' });
    },
    onError,
  });
  const unconfirm = useMutation({
    mutationFn: () => api.finance.settlements.unconfirm(month),
    onSuccess: (view) => {
      apply(view);
      toast.success('확정을 취소했습니다');
    },
    onError,
  });
  const pay = useMutation({
    mutationFn: (line: SettlementLine) => api.finance.settlements.markPaid(line.lineId as string),
    onSuccess: (view, line) => {
      apply(view);
      toast.success(
        isEmployee(line) ? `${line.name} 님의 성과급을 급여에 넘긴 것으로 기록했습니다` : `${line.name} 님에게 지급한 것으로 기록했습니다`,
      );
    },
    onError,
  });
  const unpay = useMutation({
    mutationFn: (line: SettlementLine) => api.finance.settlements.unmarkPaid(line.lineId as string),
    onSuccess: (view) => {
      apply(view);
      toast.success('지급 기록을 취소했습니다');
    },
    onError,
  });
  const setTiming = useMutation({
    mutationFn: (timing: SettlementTiming) => api.finance.settlements.updateSettings({ timing }),
    onSuccess: (_result, timing) => {
      void refresh();
      toast.success(`정산 시점을 '${TIMING_LABEL[timing]}'로 바꿨습니다`, {
        description: '이미 확정한 달은 바뀌지 않습니다.',
      });
    },
    onError,
  });

  const step = (delta: number) =>
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() + 1 };
    });
  const toggle = (userId: string) =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const view = settlement.data;
  const confirmed = view?.status === 'confirmed';
  const lines = view?.lines ?? [];
  const total = lines.reduce(
    (sum, line) => ({
      target: sum.target + line.targetWon,
      share: sum.share + line.shareWon,
      base: sum.base + line.baseWon,
      adjust: sum.adjust + line.adjustWon - line.carryInWon,
      withholding: sum.withholding + line.withholdingWon,
      net: sum.net + line.netWon,
    }),
    { target: 0, share: 0, base: 0, adjust: 0, withholding: 0, net: 0 },
  );
  const payable = lines.filter((line) => line.netWon > 0);
  const paidCount = payable.filter((line) => line.paidAt).length;

  const exportCsv = () => {
    if (!view) return;
    downloadCsv(`${month}-직원정산.csv`, [
      ['이름', '구분', '직원 몫', '기본급', '조정', '3.3% 공제', '지급액', '비고'],
      ...lines.map((line) => [
        line.name,
        isEmployee(line) ? '근로자' : '프리랜서',
        line.shareWon,
        line.baseWon,
        line.adjustWon - line.carryInWon,
        line.withholdingWon,
        line.netWon,
        isEmployee(line) ? '세금 떼기 전 성과급 · 급여에 합산' : line.withholdTax ? '' : '공제 안 함',
      ]),
    ]);
  };

  return (
    <CashflowPage title="직원 정산">
      <CashflowToolbar label="직원 정산 도구" withLine>
        <MonthStepper year={cursor.year} month={cursor.month} onStep={step} />
        {view && (
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
            <span
              className={cn(
                'shrink-0 rounded-md px-1.5 py-px text-[11.5px] leading-[18px] font-medium',
                confirmed ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning-strong',
              )}
            >
              {confirmed ? '확정' : '작성 중'}
            </span>
            {confirmed
              ? `${shortDate(view.confirmedAt)} 확정${payable.length > 0 ? ` · 지급 ${paidCount}/${payable.length}명` : ''}`
              : '확정하기 전에는 입금과 직원 조건에 따라 다시 계산됩니다'}
          </span>
        )}
        <span className="flex-1" />
        <button type="button" className={toolbarGhostButtonClassName} onClick={exportCsv} disabled={!view || lines.length === 0}>
          <Download className="size-3.5" />
          세무사용 목록
        </button>
        {view && confirmed && view.canUnconfirm && (
          <Button variant="outline" size="sm" onClick={() => unconfirm.mutate()} disabled={unconfirm.isPending}>
            확정 취소
          </Button>
        )}
        {view && !confirmed && (
          <Button
            size="sm"
            onClick={() => confirm.mutate()}
            disabled={confirm.isPending || view.blockedReason !== null}
            title={view.blockedReason ?? undefined}
          >
            <Check className="size-3.5" />
            {cursor.month}월 정산 확정
          </Button>
        )}
      </CashflowToolbar>

      {view && (
        <CashflowBand>
          <span className="inline-flex items-center gap-1.5">
            정산 시점
            {confirmed ? (
              <b className="font-semibold text-foreground">{TIMING_LABEL[view.timing]}</b>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={setTiming.isPending}
                    className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-semibold text-foreground transition-colors hover:bg-[rgba(55,53,47,0.08)] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {TIMING_LABEL[view.timing]}
                    <ChevronDown className="size-3 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  {(Object.keys(TIMING_LABEL) as SettlementTiming[]).map((timing) => (
                    <DropdownMenuItem
                      key={timing}
                      onClick={() => timing !== view.timing && setTiming.mutate(timing)}
                      className="flex-col items-start gap-0.5"
                    >
                      <span className="flex w-full items-center font-medium">
                        {TIMING_LABEL[timing]}
                        {timing === view.timing && <Check className="ml-auto size-3.5" />}
                      </span>
                      <span className="text-xs text-muted-foreground">{TIMING_HINT[timing]}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </span>
          <span>부가세를 빼고 나눔</span>
          <span>공동중개 상대 몫을 먼저 뺌</span>
          <span>돌려준 돈은 다음 정산에서 뺌</span>
          {!confirmed && view.blockedReason && lines.length > 0 && (
            <span className="ml-auto text-warning-strong">{view.blockedReason}</span>
          )}
        </CashflowBand>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {settlement.isPending ? (
          <CashflowLoading />
        ) : settlement.isError || !view ? (
          <CashflowError icon={UsersIcon} title="직원 정산을 불러오지 못했습니다" onRetry={() => void settlement.refetch()} />
        ) : (
          <>
            {lines.length === 0 ? (
              <EmptyState
                icon={UsersIcon}
                title={`${cursor.month}월에 정산할 내용이 없습니다`}
                description={
                  view.waiting.length > 0
                    ? '들어온 수수료는 있지만 아직 정산에 넣을 수 없습니다. 아래에서 이유를 확인해 주세요.'
                    : '이 달에 들어온 수수료가 없습니다. 수금 원장에서 수금을 기록하면 여기에 나옵니다.'
                }
                className="py-14"
              />
            ) : (
              <table className="cf-table" style={{ '--cf-table-min': '1080px' } as React.CSSProperties}>
                <colgroup>
                  <col />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 52 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 116 }} />
                  <col style={{ width: 108 }} />
                  <col style={{ width: 112 }} />
                  <col style={{ width: 112 }} />
                  <col style={{ width: 136 }} />
                  <col style={{ width: 176 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>직원</th>
                    <th>구분</th>
                    <th className="cf-num">건</th>
                    <th className="cf-num" title="직원 몫을 곱하기 전 금액">
                      정산 대상
                    </th>
                    <th className="cf-num" title="거래에서 나온 직원 몫">
                      직원 몫
                    </th>
                    <th className="cf-num">기본급</th>
                    <th className="cf-num" title="돌려준 돈과 지난달에서 넘어온 돈">
                      조정
                    </th>
                    <th className="cf-num" title="프리랜서에게 줄 돈에서 미리 떼어 세무서에 내는 세금">
                      3.3% 공제
                    </th>
                    <th className="cf-num">지급액</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const isOpen = opened.has(line.userId);
                    const employee = isEmployee(line);
                    const adjust = line.adjustWon - line.carryInWon;
                    const receiptCount = line.detail.filter((item) => item.kind === 'receipt').length;
                    const busy = (pay.isPending && pay.variables?.userId === line.userId) || (unpay.isPending && unpay.variables?.userId === line.userId);
                    return (
                      <Fragment key={line.userId}>
                        <tr data-row="group">
                          <td>
                            <span className="flex min-w-0 items-center gap-1.5">
                              <FoldButton open={isOpen} onToggle={() => toggle(line.userId)} />
                              <span className="truncate">{line.name}</span>
                            </span>
                          </td>
                          <td className="cf-plain">
                            <span
                              className={cn(
                                'rounded-md px-1.5 py-px text-[11.5px] leading-[18px] font-medium',
                                employee ? 'bg-info-soft text-info' : 'bg-neutral-soft text-muted-foreground',
                              )}
                            >
                              {employee ? '근로자' : '프리랜서'}
                            </span>
                          </td>
                          <td className="cf-num cf-plain">{receiptCount}</td>
                          <td className="cf-num cf-plain">{won(line.targetWon)}</td>
                          <td className="cf-num cf-plain">{won(line.shareWon)}</td>
                          <td className="cf-num cf-plain">
                            {line.baseWon > 0 ? won(line.baseWon) : <Dash />}
                          </td>
                          <td className={cn('cf-num cf-plain', adjust < 0 && 'text-destructive-strong')}>
                            {adjust !== 0 ? `−${won(Math.abs(adjust))}` : <Dash />}
                          </td>
                          <td className="cf-num cf-plain">
                            {employee ? (
                              <span className="text-xs text-muted-foreground">급여에서 계산</span>
                            ) : !line.withholdTax ? (
                              <span className="text-xs text-muted-foreground">공제 안 함</span>
                            ) : line.withholdingWon > 0 ? (
                              `−${won(line.withholdingWon)}`
                            ) : (
                              <Dash />
                            )}
                          </td>
                          <td className="cf-num">
                            <span className="block leading-tight">{won(line.netWon)}</span>
                            {employee && (
                              <span className="cf-plain block text-[11px] leading-tight text-muted-foreground">세금 떼기 전 성과급</span>
                            )}
                            {line.carryOutWon > 0 && (
                              <span className="cf-plain block text-[11px] leading-tight text-destructive-strong">
                                다음 달로 넘김 {won(line.carryOutWon)}
                              </span>
                            )}
                          </td>
                          <td className="cf-plain">
                            <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                              {!confirmed ? (
                                employee ? '확정 뒤 급여에 넘김' : '확정 뒤 지급'
                              ) : line.netWon <= 0 ? (
                                '지급할 돈 없음'
                              ) : line.paidAt ? (
                                <>
                                  {shortDate(line.paidAt)} {employee ? '급여에 넘김' : '지급함'}
                                  <Button variant="outline" size="xs" disabled={busy} onClick={() => unpay.mutate(line)}>
                                    취소
                                  </Button>
                                </>
                              ) : (
                                <Button size="xs" disabled={busy} onClick={() => pay.mutate(line)}>
                                  {employee ? '급여에 넘김' : '지급 기록'}
                                </Button>
                              )}
                            </span>
                          </td>
                        </tr>
                        {isOpen &&
                          line.detail.map((item) => (
                            <tr key={`${line.userId}-${item.receiptId}`}>
                              <td colSpan={4} className="!whitespace-normal">
                                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 py-1 pl-6 text-[12.5px] text-muted-foreground">
                                  <b className="font-medium text-foreground">{item.dealTitle}</b>
                                  {shortDate(item.receivedAt)} {item.kind === 'refund' ? '돌려줌' : '입금'}{' '}
                                  <span className="tabular-nums">{won(Math.abs(item.amountWon))}원</span>
                                  <span>→ 부가세 빼고</span>
                                  <b className="font-medium text-foreground tabular-nums">{won(Math.abs(item.supplyWon))}원</b>
                                  {item.ourRatio < 100 && <span>→ 우리 사무소 {item.ourRatio}%</span>}
                                  {item.sharePercent < 100 && <span>→ 내 배분 {item.sharePercent}%</span>}
                                  <span>× 몫 {item.ratio}%</span>
                                </span>
                              </td>
                              <td className={cn('cf-num', item.kind === 'refund' ? 'text-muted-foreground' : 'text-muted-foreground')}>
                                {item.kind === 'receipt' ? won(item.shareWon) : ''}
                              </td>
                              <td />
                              <td className={cn('cf-num', item.kind === 'refund' && 'text-destructive-strong')}>
                                {item.kind === 'refund' ? `−${won(Math.abs(item.shareWon))}` : ''}
                              </td>
                              <td colSpan={3} />
                            </tr>
                          ))}
                        {isOpen && line.carryInWon > 0 && (
                          <tr>
                            <td colSpan={6}>
                              <span className="pl-6 text-[12.5px] text-muted-foreground">지난 정산에서 다 못 빼고 넘어온 돈</span>
                            </td>
                            <td className="cf-num text-destructive-strong">−{won(line.carryInWon)}</td>
                            <td colSpan={3} />
                          </tr>
                        )}
                        {isOpen && line.detail.length === 0 && line.carryInWon === 0 && (
                          <tr>
                            <td colSpan={10}>
                              <span className="pl-6 text-[12.5px] text-muted-foreground">이번 달 정산에 들어온 거래가 없습니다.</span>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  <tr data-row="group">
                    <td>합계</td>
                    <td />
                    <td />
                    <td className="cf-num">{won(total.target)}</td>
                    <td className="cf-num">{won(total.share)}</td>
                    <td className="cf-num">{total.base > 0 ? won(total.base) : ''}</td>
                    <td className={cn('cf-num', total.adjust < 0 && 'text-destructive-strong')}>
                      {total.adjust !== 0 ? `−${won(Math.abs(total.adjust))}` : ''}
                    </td>
                    <td className="cf-num">{total.withholding > 0 ? `−${won(total.withholding)}` : ''}</td>
                    <td className="cf-num">{won(total.net)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}

            {view.waiting.length > 0 && (
              <section aria-label="정산에 들어가지 않은 입금">
                <h2 className="flex items-baseline gap-2 px-3 pt-5 pb-2 text-[13px] font-semibold">
                  이 달 정산에 들어가지 않은 입금
                  <span className="text-[12.5px] font-normal text-muted-foreground tabular-nums">
                    {view.waiting.length}건 · {won(view.waiting.reduce((sum, item) => sum + item.amountWon, 0))}원
                  </span>
                </h2>
                <table className="cf-table" style={{ '--cf-table-min': '760px' } as React.CSSProperties}>
                  <colgroup>
                    <col />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 176 }} />
                  </colgroup>
                  <tbody>
                    {view.waiting.map((item) => (
                      <tr key={item.receiptId}>
                        <td>{item.dealTitle}</td>
                        <td className="text-muted-foreground">{shortDate(item.receivedAt)} 입금</td>
                        <td className="cf-num">{won(item.amountWon)}</td>
                        <td className={cn(item.reason === 'balance' ? 'text-muted-foreground' : 'text-warning-strong')}>
                          {WAITING_LABEL[item.reason]}
                        </td>
                        <td>
                          <span className="flex justify-end">
                            {item.reason === 'ratio' ? (
                              <Button asChild variant="outline" size="xs">
                                <Link to="/settings">직원 몫 정하기</Link>
                              </Button>
                            ) : (
                              <Button variant="outline" size="xs" onClick={() => setAssigning(item)}>
                                {item.reason === 'participants' ? '담당 정하기' : '담당 보기'}
                              </Button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </div>

      <CashflowFooter>
        <span>금액 단위 원 · 지급액은 프리랜서에게 이체할 금액, 근로자는 세금 떼기 전 성과급입니다</span>
        <span className="tabular-nums">{view ? `${lines.length}명` : ''}</span>
      </CashflowFooter>

      {assigning && (
        <ParticipantsDialog
          dealId={assigning.dealId}
          dealTitle={assigning.dealTitle}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            void refresh();
          }}
        />
      )}
    </CashflowPage>
  );
}

function Dash() {
  return <span className="text-muted-foreground/50">—</span>;
}

/* ─────────────────────────── 거래 담당 정하기 ─────────────────────────── */

interface ShareRow {
  key: number;
  userId: string;
  percent: string;
}

/**
 * 이 거래를 누가 얼마나 맡았는지 정한다. 비중의 합이 100이어야 저장된다.
 * 이미 확정한 정산은 바뀌지 않고, 아직 정산하지 않은 입금부터 이 배분으로 계산한다.
 */
function ParticipantsDialog({
  dealId,
  dealTitle,
  onClose,
  onSaved,
}: {
  dealId: string;
  dealTitle: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const employees = useQuery({ queryKey: ['employees'], queryFn: () => api.employees.findAll() });
  const current = useQuery({
    queryKey: ['deal-participants', dealId],
    queryFn: () => api.finance.settlements.getParticipants(dealId),
  });
  // 서버 값을 받은 뒤 한 번만 양식에 옮긴다. 그 뒤에는 사용자가 적은 것을 덮지 않는다.
  const [rows, setRows] = useState<ShareRow[] | null>(null);
  const [nextKey, setNextKey] = useState(1);
  if (rows === null && current.data) {
    setRows(
      current.data.length > 0
        ? current.data.map((item, index) => ({ key: -index - 1, userId: item.userId, percent: String(item.sharePercent) }))
        : [{ key: 0, userId: '', percent: '100' }],
    );
  }

  const staff = (employees.data ?? []).filter((employee) => employee.isActive);
  const list = rows ?? [];
  const sum = list.reduce((total, row) => total + (Number(row.percent) || 0), 0);
  const problem = (() => {
    if (list.some((row) => !row.userId)) return '직원을 골라 주세요.';
    if (new Set(list.map((row) => row.userId)).size !== list.length) return '같은 직원이 두 번 들어 있습니다.';
    if (list.some((row) => !/^\d+$/.test(row.percent.trim()) || Number(row.percent) < 1 || Number(row.percent) > 100)) {
      return '비중은 1부터 100 사이의 숫자로 적어 주세요.';
    }
    if (sum !== 100) return `비중의 합이 100이어야 합니다. 지금은 ${sum}입니다.`;
    return null;
  })();

  const save = useMutation({
    mutationFn: () =>
      api.finance.settlements.setParticipants(
        dealId,
        list.map((row) => ({ userId: row.userId, sharePercent: Number(row.percent) })),
      ),
    onSuccess: () => {
      toast.success('담당을 정했습니다', { description: dealTitle });
      onSaved();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const update = (key: number, patch: Partial<ShareRow>) =>
    setRows((prev) => (prev ?? []).map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>담당 정하기</DialogTitle>
          <DialogDescription>
            {dealTitle} · 이 거래의 사무소 몫을 누가 얼마나 맡았는지 정합니다. 각자의 직원 몫(%)은 여기에 곱해집니다.
          </DialogDescription>
        </DialogHeader>
        {current.isPending || employees.isPending ? (
          <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중입니다.</p>
        ) : current.isError || employees.isError ? (
          <p className="py-6 text-center text-sm text-destructive-strong">담당 정보를 불러오지 못했습니다.</p>
        ) : (
          <div className="grid gap-2">
            {list.map((row, index) => (
              <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_96px_32px] items-center gap-2">
                <Select value={row.userId} onValueChange={(value) => update(row.key, { userId: value })}>
                  <SelectTrigger aria-label={`담당 ${index + 1}`}>
                    <SelectValue placeholder="직원 고르기" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Input
                    inputMode="numeric"
                    aria-label={`담당 ${index + 1}의 비중`}
                    className="text-right tabular-nums"
                    value={row.percent}
                    onChange={(event) => update(row.key, { percent: event.target.value })}
                  />
                  %
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`담당 ${index + 1} 빼기`}
                  disabled={list.length === 1}
                  onClick={() => setRows((prev) => (prev ?? []).filter((item) => item.key !== row.key))}
                >
                  <X />
                </Button>
              </div>
            ))}
            <button
              type="button"
              className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.045] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              onClick={() => {
                setRows((prev) => [...(prev ?? []), { key: nextKey, userId: '', percent: '' }]);
                setNextKey((key) => key + 1);
              }}
            >
              <Plus className="size-3.5" />
              담당 추가
            </button>
            <p className={cn('text-[12.5px]', problem ? 'text-warning-strong' : 'text-muted-foreground')} role="status">
              {problem ?? '합이 100입니다. 이미 확정한 정산은 바뀌지 않습니다.'}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            취소
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || problem !== null || rows === null}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
