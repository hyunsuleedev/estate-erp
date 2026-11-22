import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
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

/**
 * 중개방 — 왼쪽에 방 목록, 오른쪽에 고른 방(공유 매물 · 대화 · 멤버) 또는 문의함.
 * 다른 목록 화면처럼 제목 줄 없이 바로 시작한다.
 */
function NetworkPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { roomId: selectedRoomId = null, view } = Route.useSearch();
  const [createOpen, setCreateOpen] = useState(false);

  const showInquiries = view === 'inquiries';

  // 받은 문의 중 응답 대기 건수 — 목록의 문의함 줄에 표시
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
  const openInquiries = () => {
    void navigate({
      search: { roomId: selectedRoomId ?? undefined, view: 'inquiries' },
      replace: true,
    });
  };

  return (
    <div data-network-page className="-m-4 flex min-h-0 min-w-0 flex-1 bg-white">
      <aside
        aria-label="중개방 목록"
        className="flex w-[280px] shrink-0 flex-col border-r border-border bg-[#fbfbfa]"
      >
        <RoomListPanel
          selectedRoomId={showInquiries ? null : selectedRoomId}
          inquiriesSelected={showInquiries}
          pendingInquiryCount={pendingCount}
          onSelect={selectRoom}
          onOpenInquiries={openInquiries}
          onCreateRoom={() => setCreateOpen(true)}
        />
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {showInquiries ? (
          <InquiryBox />
        ) : selectedRoomId ? (
          <RoomDetail key={selectedRoomId} roomId={selectedRoomId} onLeft={clearRoom} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-8 text-center">
            <p className="text-[14px] font-medium text-foreground">중개방을 선택하세요</p>
            <p className="max-w-[360px] text-[13px] leading-[1.6] text-muted-foreground">
              왼쪽에서 방을 고르면 그 방에 공유된 매물과 대화가 열립니다. 찾기에서 공개방에
              참여하거나 새 방을 만들 수 있습니다.
            </p>
          </div>
        )}
      </main>

      <CreateRoomDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(room) => selectRoom(room.id)}
      />
    </div>
  );
}
