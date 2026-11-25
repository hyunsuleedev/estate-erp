import { createFileRoute, redirect } from '@tanstack/react-router';

// 고정비 기능은 2026-11-25에 제거했다. 이전에 열어 둔 탭이 있으면 캐시플로우로 보낸다.
export const Route = createFileRoute('/_authenticated/cashflow/expenses')({
  beforeLoad: () => {
    throw redirect({ to: '/cashflow', replace: true });
  },
  component: () => null,
});
