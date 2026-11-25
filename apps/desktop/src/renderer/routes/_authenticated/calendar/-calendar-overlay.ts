import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { buildOverlayItems, groupOverlaysByDate } from './-calendar-overlay-items';

export {
  OVERLAY_META,
  assignedDealIds,
  buildOverlayItems,
  groupOverlaysByDate,
  type DealPayment,
  type OverlayItem,
  type OverlayKind,
  type OverlayMeta,
} from './-calendar-overlay-items';

/**
 * 거래 대금 일정(DealPayment) + 계약일·중도금일·잔금일(Contract) + 수금예정일(CommissionPayment)을
 * 캘린더 오버레이로 변환. 계약은 목록(금액 · 날짜 · 이름 · 집)을 받아 화면에서 날짜에 놓는다.
 * 대시보드도 같은 것을 쓴다(오늘 일정·다가오는 일정·미니 달력 점).
 */
/**
 * @param assigneeId 이 직원이 담당인 거래의 날짜만 보인다 (대시보드 '내 담당'·캘린더 '내 일정만'·담당자 거르기).
 */
export function useCalendarOverlays(enabled: boolean, assigneeId?: string | null) {
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

  // 거래관리·대시보드와 같은 캐시. 대금 일정(payments)이 함께 온다.
  const dealsQuery = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
    enabled,
    staleTime: 60_000,
  });

  const overlaysByDate = useMemo(
    () =>
      groupOverlaysByDate(
        buildOverlayItems(contractsQuery.data ?? [], paymentsQuery.data ?? [], dealsQuery.data ?? [], {
          assigneeId,
        }),
      ),
    [contractsQuery.data, paymentsQuery.data, dealsQuery.data, assigneeId],
  );

  return {
    overlaysByDate,
    isLoading: enabled && (contractsQuery.isLoading || paymentsQuery.isLoading || dealsQuery.isLoading),
    isError: contractsQuery.isError || paymentsQuery.isError || dealsQuery.isError,
  };
}
