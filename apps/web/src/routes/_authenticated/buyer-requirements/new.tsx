import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateBuyerRequirementDto } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/domain';
import { BuyerRequirementForm, type BuyerFormSubmitDto } from './-buyer-form';

interface NewBuyerRequirementSearch {
  contactId?: string;
}

export const Route = createFileRoute('/_authenticated/buyer-requirements/new')({
  validateSearch: (search: Record<string, unknown>): NewBuyerRequirementSearch => ({
    contactId: typeof search.contactId === 'string' ? search.contactId : undefined,
  }),
  component: NewBuyerRequirementPage,
});

function NewBuyerRequirementPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { contactId } = Route.useSearch();

  const createMutation = useMutation({
    mutationFn: (dto: CreateBuyerRequirementDto) => api.buyerRequirements.create(dto),
    onSuccess: async (created) => {
      toast.success('구매고객 조건이 등록되었습니다.');
      await queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] });
      navigate({ to: '/buyer-requirements/$id', params: { id: created.id } });
    },
    onError: () => {
      toast.error('구매고객 등록에 실패했습니다.');
    },
  });

  const handleSubmit = (dto: BuyerFormSubmitDto) => {
    if (!dto.contactId) {
      toast.error('고객을 먼저 선택해주세요.');
      return;
    }
    createMutation.mutate(dto as CreateBuyerRequirementDto);
  };

  return (
    <div className="pt-4">
      <PageHeader
        title="구매고객 등록"
        description="고객의 구매/임차 희망 조건을 구조화해서 저장합니다."
        backTo="/buyer-requirements"
      />
      <BuyerRequirementForm
        mode="create"
        prefillContactId={contactId}
        submitting={createMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={() => navigate({ to: '/buyer-requirements' })}
      />
    </div>
  );
}
