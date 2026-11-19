import { useMemo } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDealActions } from './-deal-actions';
import { DealDetailPanel } from './-deal-detail';
import type { DealRowActions } from './-deal-view-utils';

export const Route = createFileRoute('/_authenticated/deals/$id')({
  component: DealDetailPage,
});

/**
 * 거래 전체 화면. 거래관리의 상세 패널에서 "새 탭으로 확장"을 누르면 열린다.
 * 패널과 같은 내용을 같은 컴포넌트로 그리고, 단계 변경·취소·삭제도 같은 확인 흐름을 쓴다.
 */
function DealDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const referenceDate = useMemo(() => new Date(), []);

  const dealsQuery = useQuery({
    queryKey: ['deals', 'detail', id],
    queryFn: () => api.deals.findOne(id),
  });
  const contractsQuery = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api.contracts.findAll(),
  });
  const deal = dealsQuery.data ?? null;
  const contractByDealId = useMemo(
    () =>
      new Map(
        (contractsQuery.data ?? [])
          .filter((contract) => contract.dealId !== null)
          .map((contract) => [contract.dealId as string, contract]),
      ),
    [contractsQuery.data],
  );

  const goToList = () => void navigate({ to: '/deals' });
  const { actions: dealActions, dialogs } = useDealActions({
    contractByDealId,
    // 이미 이 거래를 보고 있으므로 따로 열 것이 없다
    onOpenDeal: () => undefined,
    onDeleted: goToList,
  });
  const actions: DealRowActions = { onSelect: () => undefined, ...dealActions };

  return (
    <div data-deals-page className="-m-4 flex min-h-0 flex-1 flex-col bg-white">
      {dealsQuery.isLoading ? (
        <div className="mx-auto w-full max-w-[860px] space-y-3 px-6 py-8">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : dealsQuery.isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">거래를 불러오지 못했습니다.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void dealsQuery.refetch()}>
            <RotateCcw className="size-4" />
            재시도
          </Button>
        </div>
      ) : deal ? (
        <div className="mx-auto flex min-h-0 w-full max-w-[860px] flex-1 flex-col">
          <DealDetailPanel
            key={deal.id}
            deal={deal}
            contract={contractByDealId.get(deal.id) ?? null}
            referenceDate={referenceDate}
            actions={actions}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">거래를 찾을 수 없습니다.</p>
          <Button type="button" variant="outline" size="sm" onClick={goToList}>
            거래관리로
          </Button>
        </div>
      )}
      {dialogs}
    </div>
  );
}
