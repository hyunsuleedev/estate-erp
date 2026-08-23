import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { UpdateBuyerRequirementDto } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { tabResourceKeys } from '@/features/tabs/lib/tabResource';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { BuyerRequirementForm, type BuyerFormSubmitDto } from './-buyer-form';

export const Route = createFileRoute('/_authenticated/buyer-requirements/$id_/edit')({
  component: EditBuyerRequirementPage,
});

function EditBuyerRequirementPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeTabId = useTabStore((state) => state.activeTabId);
  const clearTabFormDraft = useTabStore((state) => state.clearTabFormDraft);
  const replaceTabResource = useTabStore((state) => state.replaceTabResource);
  const ownerTabIdRef = useRef(activeTabId);

  const {
    data: requirement,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['buyer-requirements', 'detail', id],
    queryFn: () => api.buyerRequirements.findOne(id),
  });

  const updateMutation = useMutation({
    mutationFn: (dto: UpdateBuyerRequirementDto) => api.buyerRequirements.update(id, dto),
    onSuccess: async () => {
      toast.success('구매고객 조건이 수정되었습니다.');
      await queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] });
      const ownerTabId = ownerTabIdRef.current;
      if (!ownerTabId) return;
      clearTabFormDraft(ownerTabId);

      const route = `/buyer-requirements/${id}`;
      const meta = getRouteMeta(route);
      const updatedTabId = replaceTabResource(ownerTabId, {
        route,
        kind: meta.kind,
        title: meta.title,
        resourceKey: tabResourceKeys.entity('buyer-requirement', id),
      });
      // 저장 도중 사용자가 다른 탭을 보고 있다면 owner 탭만 갱신하고
      // 현재 화면/포커스는 건드리지 않는다.
      if (useTabStore.getState().activeTabId === updatedTabId) {
        navigate({ href: route, replace: true });
      }
    },
    onError: () => {
      toast.error('구매고객 조건 수정에 실패했습니다.');
    },
  });

  const handleSubmit = (dto: BuyerFormSubmitDto) => {
    const rest = { ...dto };
    delete rest.contactId;
    updateMutation.mutate(rest);
  };

  const handleCancel = () => {
    if (ownerTabIdRef.current) clearTabFormDraft(ownerTabIdRef.current);
    navigate({ to: '/buyer-requirements/$id', params: { id } });
  };
  const handleBackToList = () => {
    if (ownerTabIdRef.current) clearTabFormDraft(ownerTabIdRef.current);
    navigate({ to: '/customers' });
  };

  if (isLoading) {
    return (
      <div className="flex max-w-3xl flex-col gap-4 pt-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !requirement) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">구매고객 조건을 불러오지 못했습니다.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="size-3.5" />
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <div className="pt-4">
      <PageHeader
        showTitle
        title={`${requirement.contact?.name ?? '구매고객'} 조건 수정`}
        onBack={handleBackToList}
      />
      <BuyerRequirementForm
        mode="edit"
        initial={requirement}
        submitting={updateMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </div>
  );
}
