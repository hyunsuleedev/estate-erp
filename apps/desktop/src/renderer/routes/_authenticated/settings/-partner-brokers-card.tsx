import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PartnerBroker } from '@estate-erp/api-client';
import { ChevronRight, CirclePlus, Pencil, RotateCw } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/domain/confirm-dialog';
import { CreateDialog, EditDialog } from '../partner-brokers/-broker-dialogs';

/**
 * 설정 › 공동중개 파트너.
 * 파트너 중개사 목록은 거래 만들기·수금 원장(공동중개 수수료)·매물 등록이 함께 읽는다. 그 화면들에는
 * 파트너를 추가하는 곳이 없고 파트너 화면(/partner-brokers)은 메뉴에 없어서, 사무소 설정 안에
 * 주소록을 관리하는 자리를 둔다. 연결 거래·수수료까지 보는 전체 화면은 아래 줄로 연다.
 */
export function PartnerBrokersSettingsCard() {
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerBroker | null>(null);
  const [toggleTarget, setToggleTarget] = useState<PartnerBroker | null>(null);

  const listQuery = useQuery({
    queryKey: ['partner-brokers', { includeInactive: true }],
    queryFn: () => api.partnerBrokers.list(true),
  });
  const all = listQuery.data ?? [];
  const active = all.filter((broker) => broker.isActive);
  const inactiveCount = all.length - active.length;
  const visible = showInactive ? all : active;

  const toggleMutation = useMutation({
    mutationFn: (broker: PartnerBroker) =>
      broker.isActive
        ? api.partnerBrokers.remove(broker.id)
        : api.partnerBrokers.update(broker.id, { isActive: true }),
    onSuccess: (_result, broker) => {
      toast.success(
        broker.isActive
          ? `${broker.name}을(를) 파트너 목록에서 내렸습니다.`
          : `${broker.name}을(를) 파트너 목록에 다시 올렸습니다.`,
      );
      void queryClient.invalidateQueries({ queryKey: ['partner-brokers'] });
      setToggleTarget(null);
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, '파트너 목록을 바꾸지 못했습니다. 다시 시도해 주세요.')),
  });

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">파트너 사무소</h3>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            여기 올린 사무소를 거래를 만들 때 공동중개 상대로 고르고, 수수료를 나눌 때 받을 곳으로 씁니다.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <CirclePlus className="size-3.5" />
          파트너 추가
        </Button>
      </div>

      <section className="border-y border-border/70">
        {listQuery.isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        ) : listQuery.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 py-4" role="alert">
            <p className="text-sm">파트너 목록을 불러오지 못했습니다.</p>
            <Button size="sm" variant="outline" onClick={() => void listQuery.refetch()}>
              <RotateCw className="size-3.5" />
              다시 시도
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">아직 올린 파트너 사무소가 없습니다</p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              자주 공동중개하는 사무소를 올려 두면 거래를 만들 때 바로 고를 수 있습니다.
            </p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => setCreateOpen(true)}>
              <CirclePlus className="size-3.5" />
              첫 파트너 추가
            </Button>
          </div>
        ) : (
          <ul aria-label="파트너 사무소 목록">
            {visible.map((broker) => {
              const phone = broker.phone || broker.ceoPhone;
              return (
                <li
                  key={broker.id}
                  className="flex items-center gap-3 border-b border-border/70 py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-[13px] font-medium', !broker.isActive && 'text-muted-foreground')}>
                      {broker.name}
                      {!broker.isActive ? (
                        <span className="ml-2 text-[11px] font-normal text-muted-foreground">목록에서 내림</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
                      {[broker.ceoName ? `대표 ${broker.ceoName}` : null, phone ? formatPhone(phone) : null]
                        .filter(Boolean)
                        .join(' · ') || '연락처 없음'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    aria-label={`${broker.name} 정보 고치기`}
                    onClick={() => setEditing(broker)}
                  >
                    <Pencil className="size-3.5" />
                    고치기
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => setToggleTarget(broker)}
                  >
                    {broker.isActive ? '목록에서 내리기' : '다시 올리기'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {inactiveCount > 0 ? (
          <label className="flex cursor-pointer items-center gap-2 border-t border-border/70 py-2.5 text-xs text-muted-foreground">
            <Switch size="sm" checked={showInactive} onCheckedChange={setShowInactive} />
            목록에서 내린 사무소 {inactiveCount}곳도 보기
          </label>
        ) : null}
      </section>

      <section className="border-y border-border/70">
        <Link
          to="/partner-brokers"
          className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-4 outline-none hover:bg-muted/45 focus-visible:bg-muted/45 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/35"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">파트너별 거래와 수수료</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              사무소마다 함께한 거래, 주고받은 수수료, 메모를 표로 봅니다.
            </p>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:block">전체 목록 열기</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      </section>

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditDialog broker={editing} onOpenChange={(open) => !open && setEditing(null)} />
      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={
          toggleTarget
            ? toggleTarget.isActive
              ? `${toggleTarget.name}을(를) 목록에서 내릴까요?`
              : `${toggleTarget.name}을(를) 다시 올릴까요?`
            : ''
        }
        description={
          toggleTarget?.isActive
            ? '거래를 만들 때 고르는 목록에서만 빠집니다. 이미 연결된 거래와 수수료 기록은 그대로 남습니다.'
            : '거래를 만들 때 공동중개 상대로 다시 고를 수 있습니다.'
        }
        confirmLabel={toggleTarget?.isActive ? '내리기' : '다시 올리기'}
        loading={toggleMutation.isPending}
        onConfirm={() => {
          if (toggleTarget) toggleMutation.mutate(toggleTarget);
        }}
      />
    </div>
  );
}
