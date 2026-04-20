import { createFileRoute } from '@tanstack/react-router';
import { BookOpen } from 'lucide-react';
import { LedgerView } from './-ledger';

export const Route = createFileRoute('/_authenticated/cashflow/ledger')({
  component: LedgerPage,
});

function LedgerPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <BookOpen className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">수금 원장</h1>
          <p className="text-sm text-muted-foreground">
            거래별 청구 · 잔금일 · 수금 상태 · 세금계산서를 라인 단위로 관리합니다.
          </p>
        </div>
      </div>
      <LedgerView defaultViewMode="table" />
    </div>
  );
}
