import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { UpdateBuyerRequirementDto } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BuyerRequirementForm, type BuyerFormSubmitDto } from './-buyer-form';

export const Route = createFileRoute('/_authenticated/buyer-requirements/$id_/edit')({
  component: EditBuyerRequirementPage,
});

function EditBuyerRequirementPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
      navigate({ to: '/buyer-requirements/$id', params: { id } });
    },
    onError: () => {
      toast.error('구매고객 조건 수정에 실패했습니다.');
    },
  });

  const handleSubmit = (dto: BuyerFormSubmitDto) => {
    const { contactId: _ignored, ...rest } = dto;
    updateMutation.mutate(rest);
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
        backTo="/buyer-requirements"
      />
      <BuyerRequirementForm
        mode="edit"
        initial={requirement}
        submitting={updateMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={() => navigate({ to: '/buyer-requirements/$id', params: { id } })}
      />
    </div>
  );
}
