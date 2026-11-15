import type { Deal } from '@estate-erp/api-client';
import type { SortingState } from '@tanstack/react-table';
import {
  getDealAmountValue,
  getDealTransactionType,
  getNextDealPaymentSummary,
} from './-deal-view-utils';

function cellValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== '-' ? trimmed : null;
}

export function getDealPropertyCells(deal: Deal) {
  const dong = deal.property?.unit?.dong;
  return {
    site: cellValue(deal.property?.site?.name),
    dong: dong?.isPlaceholder ? null : cellValue(dong?.name),
    unit: cellValue(deal.property?.unit?.name),
  };
}

function sortValue(
  deal: Deal,
  column: string,
  referenceDate: Date,
): string | number | null {
  switch (column) {
    case 'site':
    case 'dong':
    case 'unit':
      return getDealPropertyCells(deal)[column];
    case 'transactionType':
      return getDealTransactionType(deal) ?? null;
    case 'seller':
      return cellValue(deal.sellerContact?.name);
    case 'buyer':
      return cellValue(deal.buyerContact?.name);
    case 'amount':
      return getDealAmountValue(deal);
    case 'nextPayment':
      return getNextDealPaymentSummary(deal, referenceDate)?.daysUntil ?? null;
    default:
      return null;
  }
}

/** 단계별 기본 업무 순서는 유지하고, 사용자가 고른 열만 각 묶음 안에서 정렬한다. */
export function sortDealTableRows(
  deals: Deal[],
  sorting: SortingState,
  referenceDate: Date,
): Deal[] {
  const active = sorting[0];
  if (!active) return deals;
  return [...deals].sort((left, right) => {
    const a = sortValue(left, active.id, referenceDate);
    const b = sortValue(right, active.id, referenceDate);
    // 미지정 값은 오름차순·내림차순 모두 뒤에 둔다.
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    const order =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), 'ko', { numeric: true });
    return active.desc ? -order : order;
  });
}
