import { useMemo } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw, SearchX } from 'lucide-react';
import { ApiError } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDealActions } from './-deal-actions';
import { DealDetailPanel } from './-deal-detail';
import { getDealTabTitle, type DealRowActions } from './-deal-view-utils';
import { useTabTitle } from '@/hooks/use-tab-title';

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
  const deal = dealsQuery.data ?? null;
  // 탭 제목: "고덕그라시움 102동 2203호 매매" (매물 없는 거래는 당사자 이름)
  useTabTitle(deal ? getDealTabTitle(deal) : null);

  const goToList = () => void navigate({ to: '/deals' });
  const { actions: dealActions, dialogs } = useDealActions({
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
      ) : dealsQuery.isError &&
        dealsQuery.error instanceof ApiError &&
        (dealsQuery.error.statusCode === 404 || dealsQuery.error.statusCode === 400) ? (
        // 지워졌거나 없는 거래(형식이 틀린 주소 포함): 다시 시도해도 소용없으니 거래관리로 보낸다
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">거래를 찾을 수 없습니다</p>
          <p className="text-sm text-muted-foreground">지워졌거나 없는 거래입니다.</p>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/deals">거래관리로 돌아가기</Link>
          </Button>
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
            contract={deal.contract ?? null}
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
