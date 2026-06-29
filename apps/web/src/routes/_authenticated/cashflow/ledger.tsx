import { createFileRoute } from '@tanstack/react-router';
import { LedgerView, type LedgerViewMode } from './-ledger';

export interface LedgerSearch {
  /** 상세 Sheet를 열 거래 id */
  deal?: string;
  /** 상세 Sheet에서 하이라이트할 청구 id */
  payment?: string;
  /** 초기 뷰 모드 */
  view?: LedgerViewMode;
}

export const Route = createFileRoute('/_authenticated/cashflow/ledger')({
  validateSearch: (search: Record<string, unknown>): LedgerSearch => ({
    deal: typeof search.deal === 'string' ? search.deal : undefined,
    payment: typeof search.payment === 'string' ? search.payment : undefined,
    view:
      search.view === 'table' || search.view === 'calendar' || search.view === 'kanban'
        ? search.view
        : undefined,
  }),
  component: LedgerPage,
});

function LedgerPage() {
  const { deal, payment, view } = Route.useSearch();
  return (
    <LedgerView
      defaultViewMode={view ?? 'table'}
      initialDealId={deal}
      initialPaymentId={payment}
    />
  );
}
