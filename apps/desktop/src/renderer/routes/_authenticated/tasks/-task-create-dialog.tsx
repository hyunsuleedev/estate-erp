/**
 * 다른 화면(연락처·매물·거래 상세)이 그 자리에서 띄우는 '업무 추가' 창.
 * 업무 화면의 창(TaskFormModal)과 같은 부품이고, 저장·목록 다시 읽기·알림까지 여기서 한다.
 *
 *   <TaskCreateDialog open={open} onOpenChange={setOpen} contactId={contact.id} />
 *
 * 주소로 열 때는 `/tasks?new=1&contactId=…`(propertyId·dealId·listingId도 받는다)를 쓴다.
 */
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CreateTaskDto, Task } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuth } from '@/providers/auth-provider';
import { TaskFormModal } from './-task-form';

export interface TaskCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId?: string | null;
  propertyId?: string | null;
  dealId?: string | null;
  listingId?: string | null;
  /** 제목 초안 (예: "김민준 매도인 확인 전화") */
  defaultTitle?: string | null;
  /** 기본 담당자 (직원 상세에서 업무 배정 시 사용) */
  defaultAssigneeId?: string | null;
  onCreated?: (task: Task) => void;
}

export function TaskCreateDialog({
  open,
  onOpenChange,
  contactId,
  propertyId,
  dealId,
  listingId,
  defaultTitle,
  defaultAssigneeId,
  onCreated,
}: TaskCreateDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // 추가를 두 번 눌러도 한 건만 만든다 (isPending은 다음 그리기에야 바뀐다)
  const creatingRef = useRef(false);
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
    enabled: open,
    staleTime: 60_000,
  });
  const activeEmployees = employees.filter((employee) => employee.isActive);

  const create = useMutation({
    mutationFn: (dto: CreateTaskDto) => api.tasks.create(dto),
    onSuccess: (created) => {
      const mine = !created.assignedToId || created.assignedToId === user?.id;
      toast.success(
        '업무를 추가했습니다',
        !mine && created.assignedTo?.name
          ? { description: `${created.assignedTo.name}님에게 맡겼습니다. 업무 화면의 '내가 요청'에서 볼 수 있습니다.` }
          : { description: created.title },
      );
      onCreated?.(created);
      onOpenChange(false);
    },
    onError: (error) => toast.error(apiErrorMessage(error, '업무를 추가하지 못했습니다. 다시 시도해 주세요.')),
    onSettled: () => {
      creatingRef.current = false;
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  return (
    <TaskFormModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      task={null}
      employeeOptions={activeEmployees}
      currentUserId={defaultAssigneeId ?? user?.id ?? null}
      presetLinks={{ contactId, propertyId, dealId, listingId }}
      defaultTitle={defaultTitle}
      isLoading={create.isPending}
      onSubmit={(data) => {
        if (creatingRef.current) return;
        creatingRef.current = true;
        create.mutate(data as CreateTaskDto);
      }}
    />
  );
}
