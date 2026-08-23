import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import type { CreateBuyerRequirementDto } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/domain';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { tabResourceKeys } from '@/features/tabs/lib/tabResource';
import { useTabStore } from '@/features/tabs/store/useTabStore';
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
  const queryClient = useQueryClient();
  const { contactId } = Route.useSearch();
  const activeTabId = useTabStore((state) => state.activeTabId);
  const replaceTabResource = useTabStore((state) => state.replaceTabResource);
  const openOrRevealResource = useTabStore((state) => state.openOrRevealResource);
  const openModule = useTabStore((state) => state.openModule);
  const closeTab = useTabStore((state) => state.closeTab);
  const ownerTabIdRef = useRef(activeTabId);

  const createMutation = useMutation({
    mutationFn: (dto: CreateBuyerRequirementDto) =>
      api.buyerRequirements.create({ ...dto, createNewIntake: true }),
    onSuccess: async (created) => {
      toast.success('구함 의뢰가 등록되었습니다.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['buyer-intakes'] }),
        queryClient.invalidateQueries({ queryKey: ['brokerage-cases'] }),
      ]);
      const route = `/buyer-requirements/${created.id}`;
      const meta = getRouteMeta(route);
      const resourceKey = tabResourceKeys.entity('buyer-requirement', created.id);
      if (ownerTabIdRef.current) {
        replaceTabResource(ownerTabIdRef.current, {
          route,
          kind: meta.kind,
          title: meta.title,
          resourceKey,
        });
      } else {
        openOrRevealResource({
          route,
          kind: meta.kind,
          title: meta.title,
          resourceKey,
        });
      }
    },
    onError: () => {
      toast.error('구함 의뢰 등록에 실패했습니다.');
    },
  });

  const handleSubmit = (dto: BuyerFormSubmitDto) => {
    if (!dto.contactId) {
      toast.error('고객을 먼저 선택해주세요.');
      return;
    }
    createMutation.mutate(dto as CreateBuyerRequirementDto);
  };

  const handleCancel = () => {
    if (ownerTabIdRef.current) {
      closeTab(ownerTabIdRef.current);
    }
    const meta = getRouteMeta('/customers');
    openModule({
      route: '/customers',
      kind: meta.kind,
      title: meta.title,
    });
  };

  return (
    <div className="pt-4">
      <PageHeader
        title="구함 의뢰 추가"
        description="고객과 구매·임차 희망 조건을 입력해 새 구함 의뢰를 접수합니다."
        onBack={handleCancel}
      />
      <BuyerRequirementForm
        mode="create"
        prefillContactId={contactId}
        submitting={createMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </div>
  );
}
