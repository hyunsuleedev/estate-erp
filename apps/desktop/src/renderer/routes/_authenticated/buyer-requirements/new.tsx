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
  /** 이 화면을 연 곳. 취소하면 그곳으로 돌아간다 (없으면 고객 원장). */
  from?: 'wanted-properties';
}

export const Route = createFileRoute('/_authenticated/buyer-requirements/new')({
  validateSearch: (search: Record<string, unknown>): NewBuyerRequirementSearch => ({
    contactId: typeof search.contactId === 'string' ? search.contactId : undefined,
    from: search.from === 'wanted-properties' ? 'wanted-properties' : undefined,
  }),
  component: NewBuyerRequirementPage,
});

function NewBuyerRequirementPage() {
  const queryClient = useQueryClient();
  const { contactId, from } = Route.useSearch();
  // 취소하면 돌아갈 화면. 희망매물에서 열었으면 희망매물로, 그 밖에는 고객 원장으로.
  const returnRoute = from === 'wanted-properties' ? '/wanted-properties' : '/customers-table';
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
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
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
    // 돌아갈 화면을 먼저 열고, 그다음에 이 탭을 닫는다. 순서가 바뀌면 안 된다:
    // 실제 앱에서 탭 목록의 주인은 창의 셸이고, 셸은 이미 닫힌 탭이 보낸 요청을 무시한다
    // (main/tabs/tabRegistry.ts의 applyTabAction). 닫기를 먼저 보내면 "열어 달라"는 요청이 버려져,
    // 닫힌 자리의 옆 탭이 뜬다 — 이 화면은 맨 끝에 새 탭으로 열리므로 그때의 마지막 탭이다.
    const meta = getRouteMeta(returnRoute);
    openModule({
      route: returnRoute,
      kind: meta.kind,
      title: meta.title,
    });
    if (ownerTabIdRef.current) {
      closeTab(ownerTabIdRef.current);
    }
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
