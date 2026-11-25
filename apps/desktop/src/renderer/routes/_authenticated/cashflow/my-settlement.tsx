/**
 * 내 수수료. 대표가 확정한 달마다 내 정산이 한 줄로 나온다. 펼치면 어느 거래에서 얼마가 나왔는지 보인다.
 * 확정 전의 정산은 여기에 나오지 않는다 (금액이 아직 바뀔 수 있어서다).
 * 계산은 서버에만 있고, 이 화면은 본인 것만 받아 그대로 보여 준다.
 */
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { Handshake } from 'lucide-react';
import type { MySettlementLine, SettlementDetailItem } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/domain';
import {
  CashflowError,
  CashflowFooter,
  CashflowLoading,
  CashflowPage,
  FoldButton,
} from './-cashflow-ui';
import { dayLabel } from './-cashflow-utils';

export const Route = createFileRoute('/_authenticated/cashflow/my-settlement')({
  component: MySettlementPage,
});

function won(value: number): string {
  return value.toLocaleString('ko-KR');
}

function monthLabel(month: string): string {
  const [year, index] = month.split('-');
  return `${year}년 ${Number(index)}월`;
}

/** 계산 근거의 날짜·금액. 공동중개 받은 몫은 꼬리표를 붙이고 부가세 별도 금액 그대로 나눈다. */
function DetailMoney({ item }: { item: SettlementDetailItem }) {
  if (item.source === 'partner_share') {
    return (
      <>
        <span className="rounded-md bg-neutral-soft px-1.5 py-px text-[11px] leading-[18px] font-medium">공동중개 받은 몫</span>
        {dayLabel(item.receivedAt, false)} {item.kind === 'refund' ? '받음 기록 되돌림' : '받음'}{' '}
        <b className="font-medium text-foreground tabular-nums">{won(Math.abs(item.supplyWon))}원</b>
        <span>(부가세 별도)</span>
      </>
    );
  }
  return (
    <>
      {dayLabel(item.receivedAt, false)} {item.kind === 'refund' ? '돌려줌' : '입금'}{' '}
      <span className="tabular-nums">{won(Math.abs(item.amountWon))}원</span>
      <span>→ 부가세 빼고</span>
      <b className="font-medium text-foreground tabular-nums">{won(Math.abs(item.supplyWon))}원</b>
    </>
  );
}

function Dash() {
  return <span className="text-muted-foreground/50">—</span>;
}

function statusText(line: MySettlementLine): string {
  const employee = line.employmentType === 'employee';
  if (line.netWon <= 0) return '받을 돈 없음';
  if (line.paidAt) return `${dayLabel(line.paidAt, false)} ${employee ? '급여에 반영' : '지급'}`;
  return employee ? '급여 반영을 기다리는 중' : '지급을 기다리는 중';
}

function MySettlementPage() {
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const mine = useQuery({ queryKey: ['settlement', 'mine'], queryFn: () => api.finance.settlements.mine() });
  const toggle = (lineId: string) =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  const lines = mine.data ?? [];
  // 아직 확정하지 않은 다음 정산의 내 몫 (정산 화면과 같은 계산). 대표가 확정하면 위 목록의 그 달로 들어간다.
  const preview = useQuery({
    queryKey: ['settlement', 'mine', 'preview'],
    queryFn: () => api.finance.settlements.minePreview(),
  });
  const draft = preview.data?.line ? { month: preview.data.month, line: preview.data.line } : null;
  const [draftOpen, setDraftOpen] = useState(false);

  return (
    <CashflowPage title="내 수수료">
      <div className="min-h-0 flex-1 overflow-auto">
        {mine.isPending ? (
          <CashflowLoading />
        ) : mine.isError ? (
          <CashflowError icon={Handshake} title="내 수수료를 불러오지 못했습니다" onRetry={() => void mine.refetch()} />
        ) : lines.length === 0 && !draft ? (
          <EmptyState
            icon={Handshake}
            title="아직 확정된 정산이 없습니다"
            description="대표가 그 달의 정산을 확정하면 여기에 나옵니다."
            className="py-14"
          />
        ) : (
          <table className="cf-table" style={{ '--cf-table-min': '860px' } as React.CSSProperties}>
            <colgroup>
              <col />
              <col style={{ width: 120 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 136 }} />
              <col style={{ width: 190 }} />
            </colgroup>
            <thead>
              <tr>
                <th>정산한 달</th>
                <th className="cf-num" title="거래에서 나온 내 몫">
                  내 몫
                </th>
                <th className="cf-num">기본급</th>
                <th className="cf-num" title="돌려준 돈과 지난달에서 넘어온 돈">
                  조정
                </th>
                <th className="cf-num" title="줄 돈에서 미리 떼어 세무서에 내는 세금">
                  3.3% 공제
                </th>
                <th className="cf-num">받는 금액</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {draft && (
                <Fragment key="draft">
                  <tr data-row="group" className="opacity-70" title="아직 확정 전이라 입금·담당·직원 조건에 따라 바뀔 수 있습니다">
                    <td>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FoldButton open={draftOpen} onToggle={() => setDraftOpen((v) => !v)} />
                        <span className="truncate">{monthLabel(draft.month)}</span>
                        <span className="cf-plain shrink-0 text-xs text-warning-strong">아직 확정 전 · 바뀔 수 있음</span>
                      </span>
                    </td>
                    <td className="cf-num cf-plain">{won(draft.line.shareWon)}</td>
                    <td className="cf-num cf-plain">{draft.line.baseWon > 0 ? won(draft.line.baseWon) : <Dash />}</td>
                    <td className={cn('cf-num cf-plain', draft.line.adjustWon - draft.line.carryInWon < 0 && 'text-destructive-strong')}>
                      {draft.line.adjustWon - draft.line.carryInWon !== 0 ? (
                        `−${won(Math.abs(draft.line.adjustWon - draft.line.carryInWon))}`
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="cf-num cf-plain">
                      {draft.line.employmentType === 'employee' ? (
                        <span className="text-xs text-muted-foreground">급여에서 계산</span>
                      ) : !draft.line.withholdTax ? (
                        <span className="text-xs text-muted-foreground">공제 안 함</span>
                      ) : draft.line.withholdingWon > 0 ? (
                        `−${won(draft.line.withholdingWon)}`
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="cf-num">
                      <span className="block leading-tight">{won(draft.line.netWon)}</span>
                      {draft.line.carryOutWon > 0 && (
                        <span className="cf-plain block text-[11px] leading-tight text-destructive-strong">
                          다음 달로 넘김 {won(draft.line.carryOutWon)}
                        </span>
                      )}
                    </td>
                    <td className="cf-plain text-muted-foreground">대표가 확정하면 정해집니다</td>
                  </tr>
                  {draftOpen &&
                    draft.line.detail.map((item) => (
                      <tr key={`draft-${item.receiptId}`} className="opacity-70">
                        <td className="!whitespace-normal">
                          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 py-1 pl-6 text-[12.5px] text-muted-foreground">
                            <b className="font-medium text-foreground">{item.dealTitle}</b>
                            <DetailMoney item={item} />
                            {item.ourRatio < 100 && <span>→ 우리 사무소 {item.ourRatio}%</span>}
                            {item.sharePercent < 100 && <span>→ 내 배분 {item.sharePercent}%</span>}
                            <span>× 몫 {item.ratio}%</span>
                          </span>
                        </td>
                        <td className="cf-num text-muted-foreground">{item.kind === 'receipt' ? won(item.shareWon) : ''}</td>
                        <td />
                        <td className="cf-num text-destructive-strong">
                          {item.kind === 'refund' ? `−${won(Math.abs(item.shareWon))}` : ''}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    ))}
                </Fragment>
              )}
              {lines.map((line) => {
                const isOpen = opened.has(line.lineId);
                const employee = line.employmentType === 'employee';
                const adjust = line.adjustWon - line.carryInWon;
                return (
                  <Fragment key={line.lineId}>
                    <tr data-row="group">
                      <td>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <FoldButton open={isOpen} onToggle={() => toggle(line.lineId)} />
                          <span className="truncate">{monthLabel(line.month)}</span>
                          <span className="cf-plain shrink-0 text-xs text-muted-foreground">
                            {dayLabel(line.confirmedAt, false)} 확정
                          </span>
                        </span>
                      </td>
                      <td className="cf-num cf-plain">{won(line.shareWon)}</td>
                      <td className="cf-num cf-plain">{line.baseWon > 0 ? won(line.baseWon) : <Dash />}</td>
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
                          <span className="cf-plain block text-[11px] leading-tight text-muted-foreground">
                            세금 떼기 전 성과급
                          </span>
                        )}
                        {line.carryOutWon > 0 && (
                          <span className="cf-plain block text-[11px] leading-tight text-destructive-strong">
                            다음 달로 넘김 {won(line.carryOutWon)}
                          </span>
                        )}
                      </td>
                      <td className="cf-plain text-muted-foreground">{statusText(line)}</td>
                    </tr>
                    {isOpen &&
                      line.detail.map((item) => (
                        <tr key={`${line.lineId}-${item.receiptId}`}>
                          <td className="!whitespace-normal">
                            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 py-1 pl-6 text-[12.5px] text-muted-foreground">
                              <b className="font-medium text-foreground">{item.dealTitle}</b>
                              <DetailMoney item={item} />
                              {item.ourRatio < 100 && <span>→ 우리 사무소 {item.ourRatio}%</span>}
                              {item.sharePercent < 100 && <span>→ 내 배분 {item.sharePercent}%</span>}
                              <span>× 몫 {item.ratio}%</span>
                            </span>
                          </td>
                          <td className="cf-num text-muted-foreground">
                            {item.kind === 'receipt' ? won(item.shareWon) : ''}
                          </td>
                          <td />
                          <td className="cf-num text-destructive-strong">
                            {item.kind === 'refund' ? `−${won(Math.abs(item.shareWon))}` : ''}
                          </td>
                          <td colSpan={3} />
                        </tr>
                      ))}
                    {isOpen && line.carryInWon > 0 && (
                      <tr>
                        <td colSpan={3}>
                          <span className="pl-6 text-[12.5px] text-muted-foreground">
                            지난 정산에서 다 못 빼고 넘어온 돈
                          </span>
                        </td>
                        <td className="cf-num text-destructive-strong">−{won(line.carryInWon)}</td>
                        <td colSpan={3} />
                      </tr>
                    )}
                    {isOpen && line.detail.length === 0 && line.carryInWon === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <span className="pl-6 text-[12.5px] text-muted-foreground">
                            이 달에는 거래에서 나온 몫이 없습니다.
                          </span>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <CashflowFooter>
        <span>금액 단위 원 · 정산은 대표가 확정합니다</span>
        <span className="tabular-nums">{lines.length > 0 ? `${lines.length}개월` : ''}</span>
      </CashflowFooter>
    </CashflowPage>
  );
}
