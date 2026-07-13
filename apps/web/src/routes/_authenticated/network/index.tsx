import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { MailQuestionIcon, PlusIcon, UsersRoundIcon } from 'lucide-react';

import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/domain';
import { networkKeys } from './-network-shared';
import { RoomListPanel } from './-room-list';
import { RoomDetail } from './-room-detail';
import { InquiryBox } from './-inquiry-box';
import { CreateRoomDialog } from './-create-room-dialog';

const PENDING_POLL_MS = 30_000;

export const Route = createFileRoute('/_authenticated/network/')({
  // 딥링크: ?roomId=… (알림 → 방 직행), ?view=inquiries (문의 알림 → 문의함)
  validateSearch: (search: Record<string, unknown>): { roomId?: string; view?: 'inquiries' } => ({
    roomId: typeof search.roomId === 'string' ? search.roomId : undefined,
    view: search.view === 'inquiries' ? 'inquiries' : undefined,
  }),
  component: NetworkPage,
});

function NetworkPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { roomId: selectedRoomId = null, view } = Route.useSearch();
  const [createOpen, setCreateOpen] = useState(false);

  const showInquiries = view === 'inquiries';

  // 받은 문의 중 응답 대기 건수 — 문의함 버튼 뱃지
  const pendingQuery = useQuery({
    queryKey: networkKeys.inquiries({ scope: 'received', status: 'pending' }),
    queryFn: () => api.network.listInquiries({ scope: 'received', status: 'pending' }),
    refetchInterval: PENDING_POLL_MS,
  });
  const pendingCount = pendingQuery.data?.length ?? 0;

  const selectRoom = (roomId: string) => {
    void navigate({ search: { roomId }, replace: true });
  };

  const clearRoom = () => {
    void navigate({ search: {}, replace: true });
  };

  const toggleInquiries = () => {
    void navigate({
      search: showInquiries
        ? selectedRoomId
          ? { roomId: selectedRoomId }
          : {}
        : { roomId: selectedRoomId ?? undefined, view: 'inquiries' },
      replace: true,
    });
  };

  return (
    <div className="flex h-[calc(100svh-4rem)] min-h-0 flex-col pt-4">
      <PageHeader
        title="중개방"
        description="사무소 간 매물 공유 · 문의 · 채팅으로 공동중개를 진행합니다."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={showInquiries ? 'secondary' : 'outline'}
              onClick={toggleInquiries}
            >
              <MailQuestionIcon className="size-4" />
              문의함
              {pendingCount > 0 && (
                <span className="rounded-full bg-warning-soft px-1.5 text-[11px] font-medium text-warning tabular-nums">
                  {pendingCount}
                </span>
              )}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              방 만들기
            </Button>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
        {/* 좌측: 방 목록 */}
        <aside className="flex w-64 shrink-0 flex-col border-r md:w-72">
          <RoomListPanel
            selectedRoomId={selectedRoomId}
            onSelect={selectRoom}
            onCreateRoom={() => setCreateOpen(true)}
          />
        </aside>

        {/* 우측: 방 작업공간 또는 문의함 */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {showInquiries ? (
            <InquiryBox />
          ) : selectedRoomId ? (
            <RoomDetail key={selectedRoomId} roomId={selectedRoomId} onLeft={clearRoom} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={UsersRoundIcon}
                title="중개방을 선택하세요"
                description="왼쪽 목록에서 방을 선택하면 공유 매물 피드와 채팅이 열립니다. 공개방 탭에서 새로운 방을 찾아 참여할 수도 있습니다."
                action={
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <PlusIcon className="size-4" /> 방 만들기
                  </Button>
                }
              />
            </div>
          )}
        </main>
      </div>

      <CreateRoomDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(room) => selectRoom(room.id)}
      />
    </div>
  );
}
