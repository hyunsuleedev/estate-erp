import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, CalendarClock } from 'lucide-react';
import type { EmployeeDetail } from '@estate-erp/api-client';
import { formatDate, formatMoney, formatRelativeDay } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { cn } from '@/lib/utils';
import { PARTICIPANT_ROLE_LABELS } from './-employee-shared';
import {
  daysUntilDate,
  formatDealNextSchedule,
  formatDealPlace,
  formatDealValueSummary,
  formatWonAmount,
  summarizeDealPipeline,
} from './-employee-model';
import { toneToEmpPill } from './-employee-work-sections';

type DealFilter = 'all' | 'active' | 'unsettled' | 'settled';

/** 직원 상세 2번째 탭 — 거래 참여 내역과 (열람 권한이 있을 때) 월별 확정 정산 이력. */
export function EmployeeDealsSettlementsTab({
  detail,
  actorRole,
}: {
  detail: EmployeeDetail;
  actorRole: string;
}) {
  const [filter, setFilter] = useState<DealFilter>('all');
  const deals = detail.dealParticipants;
  const summary = useMemo(() => summarizeDealPipeline(deals), [deals]);

  const filteredDeals = useMemo(
    () =>
      deals.filter((participant) => {
        if (filter === 'active') return participant.deal.stage !== 'closed';
        if (filter === 'unsettled') return participant.settlementStatus !== 'settled';
        if (filter === 'settled') return participant.settlementStatus === 'settled';
        return true;
      }),
    [deals, filter],
  );

  const showSettlementHistory = Boolean(
    detail.payVisible && detail.role !== 'owner',
  );
  const settlementLines = detail.recentSettlementLines ?? [];
  const settlementDest =
    actorRole === 'owner'
      ? '/cashflow/employee-settlements'
      : '/cashflow/my-settlement';
  const hideAmountsForOtherAgent =
    actorRole === 'agent' && !detail.payVisible;

  return (
    <div data-employee-deals className="flex flex-col gap-4">
      {/* 3-타일 거래 요약 스트립 */}
      <div className="emp-deals-summary-grid">
        <div className="emp-hero-metric">
          <div className="emp-hm-lbl">진행 중 거래</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={cn(
                'emp-hm-val emp-num',
                summary.active === 0 && 'is-zero',
              )}
            >
              {summary.active}건
            </span>
            <span className="emp-num text-xs text-[var(--emp-ink-3)]">
              전체 {summary.total}건
            </span>
          </div>
        </div>

        <div className="emp-hero-metric">
          <div className="emp-hm-lbl">미정산 거래</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={cn(
                'emp-hm-val emp-num',
                summary.unsettled > 0 ? 'is-warn' : 'is-zero',
              )}
            >
              {summary.unsettled}건
            </span>
            <span className="emp-num text-xs text-[var(--emp-ink-3)]">
              {hideAmountsForOtherAgent
                ? '비공개'
                : summary.unsettledCommission > 0
                  ? formatMoney(summary.unsettledCommission)
                  : '미정산 0원'}
            </span>
          </div>
        </div>

        <div className="emp-hero-metric">
          <div className="emp-hm-lbl">누적 참여 수수료</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={cn(
                'emp-hm-val emp-num',
                (hideAmountsForOtherAgent || summary.totalCommission === 0) &&
                  'is-zero',
              )}
            >
              {hideAmountsForOtherAgent
                ? '—'
                : summary.totalCommission > 0
                  ? formatMoney(summary.totalCommission)
                  : '0원'}
            </span>
            <span className="emp-num text-xs text-[var(--emp-ink-3)]">
              성사 {summary.closed}건
            </span>
          </div>
        </div>
      </div>

      {/* 거래 참여 내역 카드 */}
      <section className="emp-card-block" aria-labelledby="emp-deals-tab-heading">
        <div className="emp-card-block-head flex-wrap">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 id="emp-deals-tab-heading" className="emp-card-block-title">
              거래 참여 내역
              <span className="emp-num ml-1.5 font-medium text-[var(--emp-ink-3)]">
                {filteredDeals.length}
              </span>
            </h3>
            <div className="emp-seg-track" role="group" aria-label="거래 상태 필터">
              <DealFilterBtn
                active={filter === 'all'}
                count={summary.total}
                onClick={() => setFilter('all')}
              >
                전체
              </DealFilterBtn>
              <DealFilterBtn
                active={filter === 'active'}
                count={summary.active}
                onClick={() => setFilter('active')}
              >
                진행 중
              </DealFilterBtn>
              <DealFilterBtn
                active={filter === 'unsettled'}
                count={summary.unsettled}
                onClick={() => setFilter('unsettled')}
              >
                미정산
              </DealFilterBtn>
              <DealFilterBtn
                active={filter === 'settled'}
                count={summary.settled}
                onClick={() => setFilter('settled')}
              >
                정산 완료
              </DealFilterBtn>
            </div>
          </div>

          <Link
            to="/deals"
            className="emp-btn-subtle"
            style={{ height: 26, fontSize: 12 }}
          >
            거래관리
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="emp-card-block-body">
          {filteredDeals.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-[var(--emp-ink-3)]">
              {deals.length === 0
                ? '참여 중인 거래가 없습니다.'
                : '선택한 조건에 맞는 거래가 없습니다.'}
            </p>
          ) : (
            <div className="emp-item-list">
              {filteredDeals.map((participant) => {
                const settled = participant.settlementStatus === 'settled';
                const stageMeta = getStatusMeta(
                  'dealStage',
                  participant.deal.stage,
                );
                const schedule = formatDealNextSchedule(participant.deal);
                const scheduleDays = schedule
                  ? daysUntilDate(schedule.date)
                  : null;
                const isSale = participant.deal.transactionType === 'sale';
                const parties = [
                  participant.deal.sellerContact?.name
                    ? `${isSale ? '매도인' : '임대인'} ${participant.deal.sellerContact.name}`
                    : null,
                  participant.deal.buyerContact?.name
                    ? `${isSale ? '매수인' : '임차인'} ${participant.deal.buyerContact.name}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' ↔ ');
                const roleText =
                  PARTICIPANT_ROLE_LABELS[participant.role] ?? participant.role;

                return (
                  <Link
                    key={participant.id}
                    to="/deals"
                    search={{ dealId: participant.deal.id }}
                    className="emp-crm-row"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="emp-trunc text-[13.5px] font-semibold text-[var(--emp-ink)]">
                          {formatDealPlace(participant)}
                        </span>
                        <span
                          className={cn(
                            'emp-pill',
                            toneToEmpPill(stageMeta.tone),
                          )}
                        >
                          {stageMeta.label}
                        </span>
                        {schedule ? (
                          <span
                            className={cn(
                              'emp-pill emp-num',
                              scheduleDays != null && scheduleDays < 0
                                ? 'emp-pill-red'
                                : scheduleDays != null && scheduleDays <= 7
                                  ? 'emp-pill-amber'
                                  : 'emp-pill-gray',
                            )}
                          >
                            <CalendarClock className="size-3" aria-hidden="true" />
                            {schedule.label}{' '}
                            {formatRelativeDay(schedule.date, new Date(), {
                              withWeekday: false,
                            })}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--emp-ink-3)]">
                        <span className="emp-num font-medium text-[var(--emp-ink-2)]">
                          {formatDealValueSummary(participant.deal)}
                        </span>
                        {parties ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{parties}</span>
                          </>
                        ) : null}
                        <span aria-hidden="true">·</span>
                        <span>
                          {roleText}
                          {participant.sharePercent != null
                            ? ` (${participant.sharePercent}% 비중)`
                            : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'emp-pill',
                            settled ? 'emp-pill-emerald' : 'emp-pill-amber',
                          )}
                        >
                          {settled ? '정산 완료' : '미정산'}
                        </span>
                        <span className="emp-num min-w-[72px] text-right text-[13.5px] font-bold text-[var(--emp-ink)]">
                          {hideAmountsForOtherAgent
                            ? '—'
                            : participant.commissionAmount
                              ? formatMoney(participant.commissionAmount)
                              : '—'}
                        </span>
                      </div>
                      {participant.settlementDate ? (
                        <span className="emp-num text-[11px] text-[var(--emp-ink-3)]">
                          정산일 {formatDate(participant.settlementDate)}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 월별 확정 정산 이력 (대표 및 본인 전용, 대표 계정 제외) */}
      {showSettlementHistory ? (
        <section
          className="emp-card-block"
          aria-labelledby="emp-settlement-history-heading"
        >
          <div className="emp-card-block-head">
            <div>
              <h3
                id="emp-settlement-history-heading"
                className="emp-card-block-title"
              >
                월별 확정 정산 이력
              </h3>
            </div>
            <Link
              to={settlementDest}
              className="emp-btn-subtle"
              style={{ height: 26, fontSize: 12 }}
            >
              정산 화면으로
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="emp-card-block-body">
            {settlementLines.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-[var(--emp-ink-3)]">
                확정된 월별 정산 기록이 아직 없습니다.
              </p>
            ) : (
              <>
                <div className="emp-clean-table-wrap">
                  <table className="emp-settlement-table">
                    <thead>
                      <tr>
                        <th>정산월</th>
                        <th>구분</th>
                        <th className="text-right">거래 몫</th>
                        <th className="text-right">기본급·조정</th>
                        <th className="text-right">3.3% 공제</th>
                        <th className="text-right">실지급액 / 성과급</th>
                        <th className="text-right">지급 상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlementLines.map((line) => {
                        const adjustment =
                          line.baseWon + line.adjustWon - line.carryInWon;
                        return (
                          <tr key={line.id}>
                            <td>
                              <div className="emp-num font-semibold text-[var(--emp-ink)]">
                                {line.month}
                              </div>
                              <div className="text-[11px] text-[var(--emp-ink-3)]">
                                {line.timing === 'closed'
                                  ? '잔금 기준'
                                  : '입금 기준'}
                              </div>
                            </td>
                            <td>
                              <span className="emp-pill emp-pill-gray">
                                {line.employmentType === 'employee'
                                  ? '근로자'
                                  : '프리랜서'}
                              </span>
                            </td>
                            <td className="emp-num text-right text-[var(--emp-ink)]">
                              {formatWonAmount(line.shareWon)}
                            </td>
                            <td className="emp-num text-right text-[var(--emp-ink-2)]">
                              {adjustment === 0
                                ? '—'
                                : formatWonAmount(adjustment)}
                            </td>
                            <td className="emp-num text-right text-[var(--emp-ink-2)]">
                              {line.withholdingWon > 0
                                ? `-${formatWonAmount(line.withholdingWon)}`
                                : '—'}
                            </td>
                            <td className="emp-num text-right font-bold text-[var(--emp-ink)]">
                              {formatWonAmount(line.netWon)}
                            </td>
                            <td className="text-right">
                              {line.paidAt ? (
                                <div className="inline-flex flex-col items-end gap-0.5">
                                  <span className="emp-pill emp-pill-emerald">
                                    지급 완료
                                  </span>
                                  <span className="emp-num text-[11px] text-[var(--emp-ink-3)]">
                                    {formatDate(line.paidAt)}
                                  </span>
                                </div>
                              ) : (
                                <span className="emp-pill emp-pill-amber">
                                  지급 대기
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2.5 text-[11.5px] text-[var(--emp-ink-3)]">
                  금액 단위 원 · 프리랜서는 실지급액, 근로자는 세금 떼기 전
                  성과급입니다.
                </p>
              </>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DealFilterBtn({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="emp-seg-btn"
    >
      {children}
      <span className="emp-seg-count emp-num">{count}</span>
    </button>
  );
}
