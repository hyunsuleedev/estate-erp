import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { TRANSACTION_TYPE_LABELS } from '@estate-erp/shared';
import type { CreateBuyerRequirementDto } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { tabResourceKeys } from '@/features/tabs/lib/tabResource';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { BuyerFormPage, BuyerRequirementForm, type BuyerFormSubmitDto } from './-buyer-form';

interface NewBuyerRequirementSearch {
  contactId?: string;
  /** 이 화면을 연 곳. 취소하면 그곳으로 돌아간다 (없으면 고객 원장). contact는 contactId의 연락처 상세, contacts는 연락처 목록. */
  from?: 'wanted-properties' | 'project' | 'contact' | 'contacts';
  /** from=project일 때 돌아갈 프로젝트 */
  projectId?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute('/_authenticated/buyer-requirements/new')({
  validateSearch: (search: Record<string, unknown>): NewBuyerRequirementSearch => ({
    contactId: typeof search.contactId === 'string' ? search.contactId : undefined,
    from:
      search.from === 'wanted-properties' ||
      search.from === 'project' ||
      search.from === 'contact' ||
      search.from === 'contacts'
        ? search.from
        : undefined,
    projectId:
      typeof search.projectId === 'string' && UUID_PATTERN.test(search.projectId)
        ? search.projectId
        : undefined,
  }),
  component: NewBuyerRequirementPage,
});

function typeLabel(type: string | null | undefined) {
  return type
    ? (TRANSACTION_TYPE_LABELS[type as keyof typeof TRANSACTION_TYPE_LABELS] ?? type)
    : '';
}

function NewBuyerRequirementPage() {
  const queryClient = useQueryClient();
  const { contactId, from, projectId } = Route.useSearch();
  // 취소하면 돌아갈 화면. 프로젝트에서 열었으면 그 프로젝트로, 희망매물에서 열었으면 희망매물로, 그 밖에는 고객 원장으로.
  const returnRoute =
    from === 'project' && projectId
      ? `/projects/${projectId}`
      : from === 'wanted-properties'
        ? '/wanted-properties'
        : from === 'contacts' ? '/contacts' : '/customers-table';
  const activeTabId = useTabStore((state) => state.activeTabId);
  const replaceTabResource = useTabStore((state) => state.replaceTabResource);
  const openOrRevealResource = useTabStore((state) => state.openOrRevealResource);
  const openModule = useTabStore((state) => state.openModule);
  const closeTab = useTabStore((state) => state.closeTab);
  const ownerTabIdRef = useRef(activeTabId);
  // 저장 단추를 빠르게 두 번 눌러도 한 번만 만든다 (isPending은 다음 그리기에서야 바뀐다)
  const submittingRef = useRef(false);

  const createMutation = useMutation({
    mutationFn: async (dto: BuyerFormSubmitDto) => {
      const { extras = [], ...primary } = dto;
      const created = await api.buyerRequirements.create({
        ...(primary as CreateBuyerRequirementDto),
        createNewIntake: true,
      });
      // 함께 알아보는 거래: 같은 구매 의뢰 안에 조건을 하나씩 더 만든다. 지역 · 평형 · 일정은 같다.
      const failed: string[] = [];
      for (const extra of extras) {
        try {
          await api.buyerRequirements.create({
            ...(primary as CreateBuyerRequirementDto),
            priceMin: undefined,
            priceMax: undefined,
            depositMin: undefined,
            depositMax: undefined,
            monthlyRentMin: undefined,
            monthlyRentMax: undefined,
            ...(extra as CreateBuyerRequirementDto),
            contactId: undefined,
            buyerIntakeId: created.buyerIntakeId,
          });
        } catch {
          failed.push(typeLabel(extra.transactionType));
        }
      }
      return { created, count: 1 + extras.length - failed.length, failed };
    },
    onSuccess: async ({ created, count, failed }) => {
      if (failed.length > 0) {
        toast.error(`${failed.join(' · ')} 조건은 저장하지 못했습니다. 희망매물 목록에서 다시 추가해 주세요.`);
      }
      toast.success(
        count > 1 ? `희망매물 ${count}건을 생성했습니다.` : '희망매물을 생성했습니다.',
      );
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
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error, '희망매물을 생성하지 못했습니다. 다시 시도해 주세요.'));
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  const handleSubmit = (dto: BuyerFormSubmitDto) => {
    if (!dto.contactId) {
      toast.error('고객을 먼저 선택해주세요.');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    createMutation.mutate(dto);
  };

  const handleCancel = () => {
    // 돌아갈 화면을 먼저 열고, 그다음에 이 탭을 닫는다. 순서가 바뀌면 안 된다:
    // 실제 앱에서 탭 목록의 주인은 창의 셸이고, 셸은 이미 닫힌 탭이 보낸 요청을 무시한다
    // (main/tabs/tabRegistry.ts의 applyTabAction). 닫기를 먼저 보내면 "열어 달라"는 요청이 버려져,
    // 닫힌 자리의 옆 탭이 뜬다 — 이 화면은 맨 끝에 새 탭으로 열리므로 그때의 마지막 탭이다.
    if (from === 'contact' && contactId) {
      // 연락처 상세에서 열었으면 그 연락처로 돌아간다 (이미 열린 탭이 있으면 그 탭을 보인다).
      // 예전에는 메뉴에서 뺀 고객 원장 표로 가서 하던 일의 자리를 잃었다.
      const contactRoute = `/contacts/${contactId}`;
      const contactMeta = getRouteMeta(contactRoute);
      openOrRevealResource({
        route: contactRoute,
        kind: contactMeta.kind,
        title: contactMeta.title,
        resourceKey: tabResourceKeys.entity('contact', contactId),
      });
    } else {
      const meta = getRouteMeta(returnRoute);
      openModule({
        route: returnRoute,
        kind: meta.kind,
        title: meta.title,
      });
    }
    if (ownerTabIdRef.current) {
      closeTab(ownerTabIdRef.current);
    }
  };

  return (
    <BuyerFormPage
      title="희망매물 생성"
      description="고객과 찾는 집의 조건(거래유형 · 예산 · 지역 · 평형 · 입주 시기)을 적습니다."
      onBack={handleCancel}
    >
      <BuyerRequirementForm
        mode="create"
        prefillContactId={contactId}
        submitting={createMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </BuyerFormPage>
  );
}
