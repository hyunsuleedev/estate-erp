import { Link } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from './-detail-cards';

type DeleteCheck = Awaited<ReturnType<typeof api.contacts.getDeleteCheck>>;
type DeleteCheckItem = DeleteCheck['blockers'][number];

/** 걸려 있는 기록마다 어디서 정리하는지 */
const BLOCKER_HINTS: Record<string, string> = {
  consultations: '상담분석에서 이 사람의 상담을 보고 지울 수 있습니다.',
  propertyContacts: '아래 "연결 매물"에서 매물을 열어 연결을 풉니다.',
  buyerIntakes: '희망매물에서 이 고객의 희망 조건을 정리하거나 고객을 뺍니다.',
  tenants: '매물의 세입자 기록에 이 사람이 있습니다.',
  deals: '거래관리에서 이 사람이 매수인·매도인인 거래입니다.',
  contracts: '계약서 관리에서 이 사람이 당사자인 계약서입니다.',
  projects: '이 사람이 대표 고객인 프로젝트입니다. 프로젝트의 대표 고객을 바꿉니다.',
  commissionPayments: '수수료/정산에서 이 사람이 낸 입금 기록입니다.',
};

function joinItems(items: DeleteCheckItem[]) {
  return items.map((item) => `${item.label} ${item.count}건`).join(', ');
}

/**
 * 연락처 지우기. 지우기 전에 서버에 물어 정직하게 말한다:
 * 걸려 있는 기록이 있으면 무엇이 몇 건인지와 어디서 정리하는지, 없으면 무엇이 함께 지워지고 무엇이 남는지.
 */
export function ContactDeleteDialog({
  contactId,
  contactName,
  open,
  onOpenChange,
  onDeleted,
  mergeAction,
}: {
  contactId: string;
  contactName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void | Promise<void>;
  /** 같은 사람이 두 번 등록된 경우 합치기로 정리하게 하는 단추 (있을 때만) */
  mergeAction?: ReactNode;
}) {
  const check = useQuery({
    queryKey: ['contacts', contactId, 'delete-check'],
    queryFn: () => api.contacts.getDeleteCheck(contactId),
    enabled: open,
    // 연 순간의 사실을 말한다 (다른 직원이 방금 상담을 붙였을 수 있다)
    staleTime: 0,
    gcTime: 0,
  });

  const remove = useMutation({
    mutationFn: () => api.contacts.remove(contactId),
    onSuccess: () => onDeleted(),
  });

  const data = check.data;
  const blocked = Boolean(data && data.blockers.length > 0);
  const errorMessage = remove.isError
    ? apiErrorMessage(remove.error, '연락처를 지우지 못했습니다. 잠시 뒤 다시 시도하세요.')
    : null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (remove.isPending) return;
        if (!next) remove.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent data-contact-delete-dialog>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {blocked ? '지울 수 없는 연락처입니다' : `"${contactName}" 연락처를 지울까요?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-[13.5px] leading-[1.6] text-muted-foreground">
              {check.isLoading ? (
                <p className="flex items-center gap-1.5">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  이 사람에게 걸린 기록을 확인하는 중입니다.
                </p>
              ) : check.isError ? (
                <p className="text-destructive">
                  걸린 기록을 확인하지 못했습니다. 다시 시도하세요.
                </p>
              ) : data && blocked ? (
                <>
                  <p>
                    {joinItems(data.blockers)}이 이 사람에게 걸려 있습니다. 지우면 그 기록이 누구의 일인지 알 수 없게
                    되므로 지우지 않습니다.
                  </p>
                  <ul className="space-y-1.5 border-l-2 border-border pl-3">
                    {data.blockers.map((item) => (
                      <li key={item.key}>
                        <span className="font-medium text-foreground">
                          {item.label} {item.count}건
                        </span>
                        {BLOCKER_HINTS[item.key] && <span> — {BLOCKER_HINTS[item.key]}</span>}
                        {item.key === 'consultations' && (
                          <>
                            {' '}
                            <Link
                              to="/consultations"
                              search={{ contactId }}
                              className="font-medium text-foreground underline underline-offset-2"
                              onClick={() => onOpenChange(false)}
                            >
                              상담 보기
                            </Link>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p>같은 사람이 두 번 등록된 것이라면, 지우는 대신 남길 연락처로 합치면 기록이 모두 옮겨집니다.</p>
                </>
              ) : data ? (
                <>
                  {data.removed.length > 0 && <p>{joinItems(data.removed)}도 함께 지워집니다.</p>}
                  {data.detached.length > 0 && (
                    <p>{joinItems(data.detached)}은 그대로 남고, 이 사람과의 연결만 풀립니다.</p>
                  )}
                  <p>전화번호 · 메모 · 태그 · 그룹 소속도 함께 지워지며, 지운 연락처는 되살릴 수 없습니다.</p>
                </>
              ) : null}
              {errorMessage && <p className="text-destructive">{errorMessage}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {check.isError ? (
            <>
              <AlertDialogCancel>닫기</AlertDialogCancel>
              <Button variant="outline" onClick={() => void check.refetch()}>
                다시 시도
              </Button>
            </>
          ) : blocked ? (
            <>
              <AlertDialogCancel>닫기</AlertDialogCancel>
              {mergeAction}
            </>
          ) : (
            <>
              <AlertDialogCancel disabled={remove.isPending}>취소</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={!data || remove.isPending}
                onClick={() => remove.mutate()}
              >
                {remove.isPending && <Loader2Icon className="animate-spin" />}
                삭제
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
