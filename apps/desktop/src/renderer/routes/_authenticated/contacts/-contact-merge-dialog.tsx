import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, Loader2, Search, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Contact } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiErrorMessage } from './-detail-cards';
import { isPlaceholderContactName } from './-contact-name';

interface MergeParty {
  id: string;
  name: string;
  phone: string | null;
}

function PartyLine({ label, party, tone }: { label: string; party: MergeParty; tone: 'keep' | 'drop' }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-2.5">
      <span
        className={
          tone === 'keep'
            ? 'w-14 shrink-0 text-[12px] font-medium text-foreground'
            : 'w-14 shrink-0 text-[12px] font-medium text-destructive'
        }
      >
        {label}
      </span>
      <span className="min-w-0 truncate text-sm font-medium">{party.name}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {party.phone ? formatPhone(party.phone) : '전화번호 없음'}
      </span>
    </div>
  );
}

/**
 * 같은 사람이 두 번 등록됐을 때 하나로 합친다. 지울 쪽의 상담 · 매물 · 의뢰 · 거래 · 전화번호 · 태그 · 그룹 · 메모가
 * 모두 남길 쪽으로 옮겨지고, 지울 쪽 연락처는 없어진다. 무엇이 몇 건 옮겨지는지 합치기 전에 보여 준다.
 */
export function ContactMergeDialog({
  contact,
  open,
  onOpenChange,
  defaultKeep = 'current',
  onMerged,
}: {
  contact: MergeParty;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 처음에 어느 쪽을 남길지. 지우려다 온 경우에는 고른 쪽(other)을 남긴다 */
  defaultKeep?: 'current' | 'other';
  onMerged: (keptId: string, droppedId: string) => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [other, setOther] = useState<MergeParty | null>(null);
  const [keep, setKeep] = useState<'current' | 'other'>(defaultKeep);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setOther(null);
    setKeep(defaultKeep);
    setError('');
  }, [open, defaultKeep]);

  const trimmed = search.trim();
  const candidates = useQuery({
    queryKey: ['contacts', 'merge-candidates', trimmed],
    queryFn: () => api.contacts.findAll({ search: trimmed, limit: 6 }),
    enabled: open && trimmed.length >= 2,
  });
  const candidateItems = (candidates.data?.items ?? []).filter((item) => item.id !== contact.id);

  const kept = other ? (keep === 'current' ? contact : other) : null;
  const dropped = other ? (keep === 'current' ? other : contact) : null;

  // 합치기 전 미리보기: 합칠 수 없는 이유 · 옮겨지는 것 · 겹쳐서 버려지는 것 (서버가 센다)
  const preview = useQuery({
    queryKey: ['contacts', dropped?.id, 'merge-check', kept?.id],
    queryFn: () => api.contacts.getMergeCheck(dropped!.id, kept!.id),
    enabled: open && Boolean(dropped && kept),
    staleTime: 0,
    gcTime: 0,
  });
  const conflicts = preview.data?.conflicts ?? [];
  const moving = preview.data?.moved ?? [];
  const droppedItems = preview.data?.dropped ?? [];

  const merge = useMutation({
    mutationFn: () => api.contacts.merge(dropped!.id, kept!.id),
    onSuccess: async () => {
      const droppedId = dropped!.id;
      // 지운 쪽 화면을 먼저 떠난 뒤 새로 읽는다 (떠나기 전에 읽으면 없는 연락처를 다시 부른다)
      await onMerged(kept!.id, droppedId);
      window.setTimeout(() => {
        queryClient.removeQueries({ queryKey: ['contacts', droppedId] });
        for (const queryKey of [['contacts'], ['consultations'], ['projects'], ['deals'], ['tasks'], ['buyer-requirements']]) {
          void queryClient.invalidateQueries({ queryKey });
        }
      }, 0);
    },
    onError: (caught) =>
      setError(apiErrorMessage(caught, '합치지 못했습니다. 아무것도 바뀌지 않았습니다. 잠시 뒤 다시 시도하세요.')),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !merge.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg" data-contact-merge-dialog>
        <DialogHeader>
          <DialogTitle>다른 연락처와 합치기</DialogTitle>
          <DialogDescription>
            같은 사람이 두 번 등록됐을 때 하나로 정리합니다. 지울 연락처의 기록은 모두 남길 연락처로 옮겨집니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {!other ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`${contact.name} 님과 같은 사람을 이름이나 번호로 찾기`}
                  autoFocus
                />
              </div>
              {trimmed.length < 2 ? (
                <p className="text-xs text-muted-foreground">두 글자 이상 적으면 찾습니다.</p>
              ) : candidates.isLoading ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-9 w-full rounded-md" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ) : candidateItems.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  찾는 연락처가 없습니다.
                </p>
              ) : (
                <div className="divide-y rounded-md border">
                  {candidateItems.map((item: Contact) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setOther({ id: item.id, name: item.name, phone: item.phone });
                        // 번호만 저장해 둔 임시 이름("미확인 5678") 쪽을 지우는 쪽으로 둔다 — 손님 이름이 남게
                        const currentIsTemp = isPlaceholderContactName(contact.name);
                        const otherIsTemp = isPlaceholderContactName(item.name);
                        setKeep(
                          currentIsTemp && !otherIsTemp ? 'other' : otherIsTemp && !currentIsTemp ? 'current' : defaultKeep,
                        );
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{item.name}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {item.phone ? formatPhone(item.phone) : '전화번호 없음'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="divide-y rounded-md border">
                <PartyLine label="남길 쪽" party={kept!} tone="keep" />
                <PartyLine label="지울 쪽" party={dropped!} tone="drop" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setKeep((value) => (value === 'current' ? 'other' : 'current'))}
                >
                  <ArrowDownUp className="size-3.5" />
                  남길 쪽 바꾸기
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOther(null)}>
                  다른 사람 고르기
                </Button>
              </div>
              <div className="space-y-2 text-[13px] leading-[1.6] text-muted-foreground" data-merge-preview>
                {preview.isLoading ? (
                  <p className="flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    옮겨질 기록을 세는 중입니다.
                  </p>
                ) : preview.isError ? (
                  <p className="text-destructive">
                    {apiErrorMessage(preview.error, '옮겨질 기록을 확인하지 못했습니다. 다시 시도하세요.')}
                  </p>
                ) : conflicts.length > 0 ? (
                  <div
                    role="alert"
                    className="space-y-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive"
                  >
                    <p className="font-medium">합칠 수 없습니다</p>
                    {conflicts.map((conflict) => (
                      <p key={conflict.key}>{conflict.message}</p>
                    ))}
                  </div>
                ) : (
                  <>
                    {preview.data?.resultName && preview.data.resultName !== kept!.name && (
                      <p>
                        <span className="font-medium text-foreground">이름</span> — 남길 쪽이 임시 이름이라 합친 뒤
                        이름은 &lsquo;{preview.data.resultName}&rsquo;(으)로 남습니다.
                      </p>
                    )}
                    <p>
                      <span className="font-medium text-foreground">옮겨지는 것</span> —{' '}
                      {moving.length > 0
                        ? `${moving.map((item) => `${item.label} ${item.count}건`).join(', ')}이 '${kept!.name}' 님에게로 옮겨집니다.`
                        : '옮길 기록이 없습니다.'}{' '}
                      태그 · 그룹도 옮겨지고, 메모는 이어 붙습니다.
                    </p>
                    {droppedItems.length > 0 && (
                      <p>
                        <span className="font-medium text-foreground">버려지는 것</span> —{' '}
                        {droppedItems.map((item) => `${item.label} ${item.count}건`).join(', ')}.
                        &lsquo;{kept!.name}&rsquo; 님에게 같은 것이 이미 있어 하나만 남기고, 비어 있던 칸(지분 · 거주 여부
                        · 호칭 · 메모)은 지울 쪽 값으로 채웁니다.
                      </p>
                    )}
                  </>
                )}
                {conflicts.length === 0 && (
                  <p className="text-destructive">
                    &lsquo;{dropped!.name}&rsquo; 연락처는 없어지며 되돌릴 수 없습니다. 누가 합쳤는지는 변경 기록에 남습니다.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={merge.isPending} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!other || merge.isPending || preview.isLoading || preview.isError || conflicts.length > 0}
            onClick={() => {
              setError('');
              merge.mutate();
            }}
          >
            {merge.isPending && <Loader2 className="size-3.5 animate-spin" />}
            합치기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
