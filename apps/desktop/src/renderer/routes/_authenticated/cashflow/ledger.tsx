import { createFileRoute } from '@tanstack/react-router';
import { LedgerView, type LedgerViewMode } from './-ledger';
import { ManagerOnly } from './-cashflow-ui';

export interface LedgerSearch {
  /** 상세 Sheet를 열 거래 id. 거래 화면의 "수수료/정산에서 보기"는 dealId 로 보낸다(같은 뜻). */
  deal?: string;
  dealId?: string;
  /** 상세 Sheet에서 하이라이트할 청구 id */
  payment?: string;
  /** 초기 뷰 모드 */
  view?: LedgerViewMode;
}

export const Route = createFileRoute('/_authenticated/cashflow/ledger')({
  validateSearch: (search: Record<string, unknown>): LedgerSearch => ({
    deal: typeof search.deal === 'string' ? search.deal : undefined,
    dealId: typeof search.dealId === 'string' ? search.dealId : undefined,
    payment: typeof search.payment === 'string' ? search.payment : undefined,
    view:
      search.view === 'table' || search.view === 'calendar' || search.view === 'kanban'
        ? search.view
        : undefined,
  }),
  component: LedgerPage,
});

function LedgerPage() {
  const { deal, dealId, payment, view } = Route.useSearch();
  return (
    <ManagerOnly title="수금 원장">
      <LedgerView
        defaultViewMode={view ?? 'table'}
        initialDealId={dealId ?? deal}
        initialPaymentId={payment}
      />
    </ManagerOnly>
  );
}
