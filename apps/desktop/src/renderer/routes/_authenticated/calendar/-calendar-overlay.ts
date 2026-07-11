import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CommissionPayment, Contract } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { getLocalDateKey } from './-calendar-view-utils';

export type OverlayKind = 'contractDate' | 'interimDate' | 'balanceDate' | 'commissionDue';

export type OverlayMeta = {
  label: string;
  color: string;
  /** 클릭 시 이동할 페이지 */
  link: '/contracts' | '/cashflow';
};

/** 계약/수금에서 자동 도출되는 일정 — 시맨틱 토큰 색상 사용 (info/violet/orange/success) */
export const OVERLAY_META: Record<OverlayKind, OverlayMeta> = {
  contractDate: { label: '계약일', color: '#2383e2', link: '/contracts' },
  interimDate: { label: '중도금일', color: '#6940a5', link: '/contracts' },
  balanceDate: { label: '잔금일', color: '#d9730d', link: '/contracts' },
  commissionDue: { label: '수금예정', color: '#0f7b6c', link: '/cashflow' },
};

export interface OverlayItem {
  id: string;
  kind: OverlayKind;
  dateKey: string;
  title: string;
  sublabel: string | null;
}

function contractPlaceLabel(contract: Contract) {
  const property = contract.deal?.listing?.property;
  const site = property?.site?.name ?? null;
  const unit = property?.unit?.name ?? null;
  if (site) return unit ? `${site} ${unit}` : site;

  const buyer = contract.buyerContact?.name;
  const seller = contract.sellerContact?.name;
  if (buyer || seller) return [seller, buyer].filter(Boolean).join(' ↔ ');
  return '계약';
}

function pushContractItem(
  items: OverlayItem[],
  contract: Contract,
  kind: OverlayKind,
  date: string | null,
  amount: number | null,
) {
  if (!date) return;
  items.push({
    id: `${contract.id}-${kind}`,
    kind,
    dateKey: getLocalDateKey(new Date(date)),
    title: `${OVERLAY_META[kind].label} · ${contractPlaceLabel(contract)}`,
    sublabel: amount ? formatMoney(amount) : null,
  });
}

export function buildOverlayItems(
  contracts: Contract[],
  payments: CommissionPayment[],
): OverlayItem[] {
  const items: OverlayItem[] = [];

  for (const contract of contracts) {
    if (contract.status === 'cancelled') continue;
    pushContractItem(items, contract, 'contractDate', contract.contractDate, contract.totalPrice);
    pushContractItem(items, contract, 'interimDate', contract.statedInterimDate, contract.statedInterimPayment);
    pushContractItem(items, contract, 'balanceDate', contract.statedBalanceDate, contract.statedBalance);
  }

  for (const payment of payments) {
    if (!payment.dueDate) continue;
    if (!['draft', 'pending', 'partial', 'overdue'].includes(payment.status)) continue;
    items.push({
      id: `${payment.id}-commissionDue`,
      kind: 'commissionDue',
      dateKey: getLocalDateKey(new Date(payment.dueDate)),
      title: `수금예정 · ${payment.payerContact?.name ?? (payment.clientSide === 'seller' ? '매도측' : '매수측')}`,
      sublabel: formatMoney(payment.expectedAmount),
    });
  }

  return items;
}

export function groupOverlaysByDate(items: OverlayItem[]) {
  const grouped = new Map<string, OverlayItem[]>();
  for (const item of items) {
    const dayItems = grouped.get(item.dateKey) ?? [];
    dayItems.push(item);
    grouped.set(item.dateKey, dayItems);
  }
  return grouped;
}

/**
 * 계약일·중도금일·잔금일(Contract) + 수금예정일(CommissionPayment)을
 * 캘린더 오버레이로 변환. 전용 범위 API가 없어 전체 목록을 받아 클라이언트에서 날짜 매핑.
 */
export function useCalendarOverlays(enabled: boolean) {
  const contractsQuery = useQuery({
    queryKey: ['contracts', 'calendar-overlay'],
    queryFn: () => api.contracts.findAll(),
    enabled,
    staleTime: 60_000,
  });

  const paymentsQuery = useQuery({
    queryKey: ['commission-payments', 'calendar-overlay'],
    queryFn: () => api.finance.commissionPayments.list(),
    enabled,
    staleTime: 60_000,
  });

  const overlaysByDate = useMemo(
    () =>
      groupOverlaysByDate(
        buildOverlayItems(contractsQuery.data ?? [], paymentsQuery.data ?? []),
      ),
    [contractsQuery.data, paymentsQuery.data],
  );

  return {
    overlaysByDate,
    isLoading: enabled && (contractsQuery.isLoading || paymentsQuery.isLoading),
    isError: contractsQuery.isError || paymentsQuery.isError,
  };
}
