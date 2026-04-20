import { createFileRoute } from '@tanstack/react-router';
import { LedgerView } from './-ledger';

export const Route = createFileRoute('/_authenticated/cashflow/ledger')({
  component: LedgerPage,
});

function LedgerPage() {
  return <LedgerView defaultViewMode="table" />;
}
