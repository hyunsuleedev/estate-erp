import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DoorOpen, Lock, MoreHorizontal, Plus, RotateCw } from 'lucide-react';
import type {
  NetworkRoomDetail,
  NetworkSharedPropertyView,
} from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/domain';
import { cn } from '@/lib/utils';
import { ToolbarPillSearch, ToolbarPillTabs } from '../properties/-components/property-toolbar';
import { MEMBER_STATUS_META, getErrorMessage, networkKeys } from './-network-shared';
import { SharedListingTable } from './-shared-listing-table';
import { ShareListingDialog } from './-share-dialog';
import { InquiryCreateDialog } from './-inquiry-dialogs';
import { ChatPanel, EMPTY_CHAT_DRAFT, type ChatDraft } from './-chat-panel';

export interface RoomDetailProps {
  roomId: string;
  /** 방을 나가거나 접근이 사라졌을 때 선택 해제 */
  onLeft: () => void;
}

/** 선택한 중개방의 작업공간 — 공유 매물 피드 / 채팅 / 멤버 관리. */
export function RoomDetail({ roomId, onLeft }: RoomDetailProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const myOfficeId = user?.office?.id ?? '';

  const [shareOpen, setShareOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<NetworkSharedPropertyView | null>(null);
  const [inquiryTarget, setInquiryTarget] = useState<NetworkSharedPropertyView | null>(null);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [recallTarget, setRecallTarget] = useState<NetworkSharedPropertyView | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const roomQuery = useQuery({
    queryKey: networkKeys.room(roomId),
    queryFn: () => api.network.getRoom(roomId),
  });

  const room = roomQuery.data;
  const membership = room?.myMembership ?? null;
  const isApproved = membership?.status === 'approved';
  const isAdmin = isApproved && membership?.role === 'admin';

  const sharedQuery = useQuery({
    queryKey: networkKeys.shared(roomId),
    queryFn: () => api.network.listSharedProperties(roomId),
    enabled: isApproved,
  });

  const invalidateRoom = () => {
    void queryClient.invalidateQueries({ queryKey: networkKeys.room(roomId) });
    void queryClient.invalidateQueries({ queryKey: networkKeys.allRooms });
  };

  const joinMutation = useMutation({
    mutationFn: () => api.network.joinRoom(roomId),
    onSuccess: () => {
      toast.success('참여 신청을 보냈습니다. 방장 승인 후 입장할 수 있습니다');
      invalidateRoom();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const memberMutation = useMutation({
    mutationFn: ({ memberId, status }: { memberId: string; status: 'approved' | 'rejected' }) =>
      api.network.updateMember(roomId, memberId, { status }),
    onSuccess: (_, variables) => {
      toast.success(variables.status === 'approved' ? '참여를 승인했습니다' : '참여를 거절했습니다');
      invalidateRoom();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const leaveMutation = useMutation({
    mutationFn: () => api.network.leaveRoom(roomId),
    onSuccess: () => {
      toast.success('중개방에서 나갔습니다');
      setLeaveOpen(false);
      invalidateRoom();
      onLeft();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const recallMutation = useMutation({
    mutationFn: (id: string) => api.network.removeSharedProperty(id),
    onSuccess: () => {
      toast.success('공유를 회수했습니다');
      setRecallTarget(null);
      void queryClient.invalidateQueries({ queryKey: networkKeys.shared(roomId) });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  // 방 영역이 표와 대화를 나란히 둘 만큼 넓으면 대화를 오른쪽에 늘 띄워 두고, 좁으면 탭으로 넣는다.
  // 앱 사이드바와 방 목록이 차지하는 폭이 있어 창 너비가 아니라 이 영역의 너비로 정한다.
  const [paneNode, setPaneNode] = useState<HTMLDivElement | null>(null);
  const isWide = useElementWidth(paneNode) >= SIDE_CHAT_MIN_WIDTH;
  const [tab, setTab] = useState<RoomTab>('shared');
  // 대화 칸은 폭에 따라 옆 칸과 탭 사이를 옮겨 다니며 다시 그려지므로, 쓰던 말은 여기에 둔다
  const [chatDraft, setChatDraft] = useState<ChatDraft>(EMPTY_CHAT_DRAFT);
  const [typeFilter, setTypeFilter] = useState('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [keyword, setKeyword] = useState('');

  const shared = useMemo(() => sharedQuery.data ?? [], [sharedQuery.data]);
  const filtered = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return shared.filter((view) => {
      if (typeFilter !== 'all' && view.listing.transactionType !== typeFilter) return false;
      if (mineOnly && !view.isMine) return false;
      if (!query) return true;
      return [
        view.listing.siteName,
        view.listing.regionLabel,
        view.office?.name,
        view.description,
        view.contactName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [keyword, mineOnly, shared, typeFilter]);

  if (roomQuery.isLoading) {
    return (
      <div className="space-y-3 px-6 py-6">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (roomQuery.isError || !room) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-[13px] text-muted-foreground">중개방 정보를 불러오지 못했습니다.</p>
        <Button variant="outline" size="sm" onClick={() => void roomQuery.refetch()}>
          <RotateCw className="size-3.5" aria-hidden="true" />
          다시 시도
        </Button>
      </div>
    );
  }

  const pendingMembers = room.members.filter((member) => member.status === 'pending');
  const approvedCount = room.members.filter((member) => member.status === 'approved').length;
  const activeTab: RoomTab = isWide && tab === 'chat' ? 'shared' : tab;
  const tabs: Array<{ value: RoomTab; label: string; count?: number; alert?: boolean }> = [
    { value: 'shared', label: '공유 매물', count: shared.length },
    ...(isWide ? [] : [{ value: 'chat' as const, label: '대화' }]),
    {
      value: 'members',
      label: '멤버',
      count: isAdmin && pendingMembers.length > 0 ? pendingMembers.length : approvedCount,
      alert: isAdmin && pendingMembers.length > 0,
    },
  ];
  const typeCounts = (type: string) =>
    shared.filter((view) => view.listing.transactionType === type).length;

  const chat = (
    <ChatPanel
      roomId={roomId}
      myOfficeId={myOfficeId}
      attachables={shared}
      draft={chatDraft}
      onDraftChange={setChatDraft}
    />
  );

  return (
    <div ref={setPaneNode} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* ── 방 머리 ── */}
      <header className="shrink-0 px-6 pb-3 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-[22px] font-bold leading-[1.25] tracking-[-0.025em] text-foreground">
                {room.name}
              </h1>
              {room.type === 'private' ? (
                <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="비공개방" />
              ) : null}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-muted-foreground">
              <span>{room.type === 'public' ? '공개방' : '비공개방'}</span>
              {room.region ? (
                <>
                  <Dot />
                  <span>{room.region}</span>
                </>
              ) : null}
              <Dot />
              <span className="tabular-nums">
                사무소 {room.memberCount}곳
                {room.maxMembers != null ? ` / 최대 ${room.maxMembers}` : ''}
              </span>
              {room.createdByOffice ? (
                <>
                  <Dot />
                  <span>
                    {room.createdByOffice.name} 개설 {formatDate(room.createdAt)}
                  </span>
                </>
              ) : null}
            </p>
            {room.description ? (
              <p className="mt-1.5 line-clamp-2 max-w-[720px] text-[13px] leading-[1.6] text-foreground">
                {room.description}
              </p>
            ) : null}
          </div>

          {isApproved ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                className="h-[30px] rounded-[8px] px-3"
                onClick={() => setShareOpen(true)}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                매물 공유
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="방 메뉴"
                    className="inline-grid size-[30px] place-items-center rounded-md text-muted-foreground outline-none hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onClick={() => setLeaveOpen(true)}>
                    <DoorOpen className="size-4" /> 방 나가기
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
      </header>

      {/* ── 본문 ── */}
      {!isApproved ? (
        <NonMemberBody
          room={room}
          membershipStatus={membership?.status ?? null}
          onJoin={() => joinMutation.mutate()}
          joining={joinMutation.isPending}
        />
      ) : (
        <div className="flex min-h-0 flex-1 border-t border-border">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              role="tablist"
              aria-label="중개방 구역"
              className="flex shrink-0 gap-5 border-b border-border px-6"
            >
              {tabs.map((item) => {
                const selected = activeTab === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    id={`room-tab-${item.value}`}
                    aria-selected={selected}
                    aria-controls="room-tabpanel"
                    onClick={() => setTab(item.value)}
                    className={cn(
                      'relative h-10 whitespace-nowrap rounded-[4px] text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      selected
                        ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {item.label}
                    {item.count ? (
                      <span
                        className={cn(
                          'ml-1 text-[11.5px] font-medium tabular-nums',
                          item.alert ? 'text-warning-strong' : 'text-[#a9a7a1]',
                        )}
                      >
                        {item.alert ? `신청 ${item.count}` : item.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div
              role="tabpanel"
              id="room-tabpanel"
              aria-labelledby={`room-tab-${activeTab}`}
              className="flex min-h-0 flex-1 flex-col"
            >
              {activeTab === 'shared' ? (
                <>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 px-6 py-2.5">
                    <ToolbarPillTabs
                      shape="muted"
                      ariaLabel="거래유형"
                      value={typeFilter}
                      onChange={setTypeFilter}
                      options={[
                        { value: 'all', label: '전체', count: shared.length },
                        { value: 'sale', label: '매매', count: typeCounts('sale') },
                        { value: 'jeonse', label: '전세', count: typeCounts('jeonse') },
                        { value: 'monthly', label: '월세', count: typeCounts('monthly') },
                      ]}
                    />
                    <div className="flex min-w-[160px] max-w-[280px] flex-1">
                      <ToolbarPillSearch
                        value={keyword}
                        onChange={setKeyword}
                        placeholder="단지, 사무소"
                        ariaLabel="공유 매물 검색"
                      />
                    </div>
                    <button
                      type="button"
                      aria-pressed={mineOnly}
                      onClick={() => setMineOnly((value) => !value)}
                      className={cn(
                        'inline-flex h-7 items-center rounded-full px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/45',
                        mineOnly
                          ? 'bg-[rgba(35,131,226,0.1)] font-medium text-[#2383e2]'
                          : 'text-[#6f6c66] hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground',
                      )}
                    >
                      내 매물만
                    </button>
                    <span className="ml-auto text-[12.5px] tabular-nums text-muted-foreground">
                      {filtered.length}건
                    </span>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto">
                    {sharedQuery.isLoading ? (
                      <div className="space-y-2 px-6 py-3">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <Skeleton key={index} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : sharedQuery.isError ? (
                      <div className="flex flex-col items-center gap-3 py-12 text-center">
                        <p className="text-[13px] text-muted-foreground">
                          공유 매물을 불러오지 못했습니다.
                        </p>
                        <Button variant="outline" size="sm" onClick={() => void sharedQuery.refetch()}>
                          <RotateCw className="size-3.5" aria-hidden="true" />
                          다시 시도
                        </Button>
                      </div>
                    ) : shared.length === 0 ? (
                      <div className="flex flex-col items-center gap-1.5 px-8 py-14 text-center">
                        <p className="text-[14px] font-medium text-foreground">
                          아직 공유된 매물이 없습니다
                        </p>
                        <p className="max-w-[340px] text-[13px] leading-[1.6] text-muted-foreground">
                          내 매물을 이 방에 올리면 다른 사무소가 보고 문의할 수 있습니다. 어떤 항목을
                          보여 줄지는 올릴 때 정합니다.
                        </p>
                        <Button size="sm" className="mt-2" onClick={() => setShareOpen(true)}>
                          <Plus className="size-3.5" aria-hidden="true" />
                          매물 공유
                        </Button>
                      </div>
                    ) : filtered.length === 0 ? (
                      <p className="px-6 py-12 text-center text-[13px] text-muted-foreground">
                        조건에 맞는 공유 매물이 없습니다.
                      </p>
                    ) : (
                      <SharedListingTable
                        items={filtered}
                        renderActions={(view) =>
                          view.isMine ? (
                            <>
                              <RowAction onClick={() => setEditTarget(view)}>공유 설정</RowAction>
                              <RowAction tone="danger" onClick={() => setRecallTarget(view)}>
                                회수
                              </RowAction>
                            </>
                          ) : (
                            <RowAction
                              tone="primary"
                              onClick={() => {
                                setInquiryTarget(view);
                                setInquiryOpen(true);
                              }}
                            >
                              문의하기
                            </RowAction>
                          )
                        }
                      />
                    )}
                  </div>
                </>
              ) : activeTab === 'chat' ? (
                chat
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5">
                  <MembersPanel
                    room={room}
                    isAdmin={isAdmin}
                    onDecide={(memberId, status) => memberMutation.mutate({ memberId, status })}
                    deciding={memberMutation.isPending}
                  />
                </div>
              )}
            </div>
          </div>

          {isWide ? (
            <aside
              aria-label="방 대화"
              className="flex min-h-0 w-[372px] shrink-0 flex-col border-l border-border bg-[#fbfbfa]"
            >
              <p className="flex h-10 shrink-0 items-center border-b border-border px-5 text-[13px] font-medium text-foreground">
                대화
              </p>
              {chat}
            </aside>
          ) : null}
        </div>
      )}

      {/* ── 다이얼로그 ── */}
      <ShareListingDialog
        open={shareOpen || !!editTarget}
        onOpenChange={(next) => {
          if (!next) {
            setShareOpen(false);
            setEditTarget(null);
          }
        }}
        roomId={roomId}
        roomName={room.name}
        editTarget={editTarget}
        sharedListingIds={shared
          .filter((view) => view.isMine && view.isActive)
          .map((view) => view.listingId)}
      />
      <InquiryCreateDialog open={inquiryOpen} onOpenChange={setInquiryOpen} target={inquiryTarget} />
      <ConfirmDialog
        open={!!recallTarget}
        onOpenChange={(next) => !next && setRecallTarget(null)}
        title="공유를 회수할까요?"
        description="회수하면 이 방에서 매물이 내려갑니다. 이미 진행 중인 문의 기록은 유지됩니다."
        confirmLabel="회수"
        destructive
        loading={recallMutation.isPending}
        onConfirm={() => {
          if (recallTarget) recallMutation.mutate(recallTarget.id);
        }}
      />
      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="중개방에서 나갈까요?"
        description="나가면 이 방의 공유 매물과 대화를 더 이상 볼 수 없습니다."
        confirmLabel="나가기"
        destructive
        loading={leaveMutation.isPending}
        onConfirm={() => leaveMutation.mutate()}
      />
    </div>
  );
}

type RoomTab = 'shared' | 'chat' | 'members';

/** 공유 매물 표(884px)와 대화 칸(372px)이 함께 들어가는 너비 */
const SIDE_CHAT_MIN_WIDTH = 1260;

function useElementWidth(node: HTMLElement | null) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return width;
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-[#c9c7c1]">
      ·
    </span>
  );
}

/** 표의 줄 끝에 놓는 글자 버튼 */
function RowAction({
  tone,
  onClick,
  children,
}: {
  tone?: 'primary' | 'danger';
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center whitespace-nowrap rounded-md px-2 text-[12.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/45',
        tone === 'primary'
          ? 'font-medium text-foreground shadow-[inset_0_0_0_1px_rgba(42,28,0,0.14)] hover:bg-[rgba(55,53,47,0.06)]'
          : tone === 'danger'
            ? 'text-muted-foreground hover:bg-destructive-soft/50 hover:text-destructive'
            : 'text-muted-foreground hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

// ── 아직 참여하지 않은 사무소가 보는 본문 ─────────────────────

function NonMemberBody({
  room,
  membershipStatus,
  onJoin,
  joining,
}: {
  room: NetworkRoomDetail;
  membershipStatus: string | null;
  onJoin: () => void;
  joining: boolean;
}) {
  const copy =
    membershipStatus === 'pending'
      ? {
          title: '참여 승인을 기다리는 중입니다',
          body: '방장이 승인하면 공유 매물과 대화를 볼 수 있습니다.',
          action: null,
        }
      : membershipStatus === 'rejected'
        ? {
            title: '참여가 거절된 방입니다',
            body: '필요하면 다시 참여 신청을 보낼 수 있습니다.',
            action: '다시 참여 신청',
          }
        : {
            title: '아직 참여하지 않은 중개방입니다',
            body: `사무소 ${room.memberCount}곳이 참여 중입니다. 신청하면 방장 승인 뒤에 공유 매물과 대화를 볼 수 있습니다.`,
            action: '참여 신청',
          };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 border-t border-border px-8 text-center">
      <p className="text-[14px] font-medium text-foreground">{copy.title}</p>
      <p className="max-w-[360px] text-[13px] leading-[1.6] text-muted-foreground">{copy.body}</p>
      {copy.action ? (
        <Button className="mt-2" size="sm" onClick={onJoin} disabled={joining}>
          {joining ? '신청 중…' : copy.action}
        </Button>
      ) : null}
    </div>
  );
}

// ── 멤버 ────────────────────────────────────────────────────

function MembersPanel({
  room,
  isAdmin,
  onDecide,
  deciding,
}: {
  room: NetworkRoomDetail;
  isAdmin: boolean;
  onDecide: (memberId: string, status: 'approved' | 'rejected') => void;
  deciding: boolean;
}) {
  const pending = room.members.filter((member) => member.status === 'pending');
  const approved = room.members.filter((member) => member.status === 'approved');
  const others = room.members.filter(
    (member) => member.status !== 'pending' && member.status !== 'approved',
  );

  return (
    <div className="max-w-[720px] space-y-7">
      {pending.length > 0 ? (
        <section>
          <h2 className="mb-1.5 text-[13px] font-semibold text-foreground">
            참여 신청 <span className="font-normal tabular-nums text-warning-strong">{pending.length}</span>
          </h2>
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {pending.map((member) => (
              <li key={member.id} className="flex min-h-11 items-center gap-3 py-2 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {member.office?.name ?? '사무소 미상'}
                </span>
                <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
                  {formatDate(member.createdAt)} 신청
                </span>
                {isAdmin ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      className="h-7 px-2.5"
                      disabled={deciding}
                      onClick={() => onDecide(member.id, 'approved')}
                    >
                      승인
                    </Button>
                    <RowAction tone="danger" onClick={() => !deciding && onDecide(member.id, 'rejected')}>
                      거절
                    </RowAction>
                  </span>
                ) : (
                  <span className="shrink-0 text-[12.5px] text-muted-foreground">방장 승인 대기</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-1.5 text-[13px] font-semibold text-foreground">
          참여 사무소 <span className="font-normal tabular-nums text-muted-foreground">{approved.length}</span>
        </h2>
        {approved.length === 0 ? (
          <p className="py-3 text-[12.5px] text-muted-foreground">참여 중인 사무소가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {approved.map((member) => (
              <li key={member.id} className="flex min-h-10 items-center gap-3 py-2 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {member.office?.name ?? '사무소 미상'}
                </span>
                {member.role === 'admin' ? (
                  <span className="shrink-0 rounded-[4px] bg-[#f1f1ef] px-1.5 text-[12px] leading-5 text-[#5f5e5b]">
                    방장
                  </span>
                ) : null}
                <span className="w-[112px] shrink-0 text-right text-[12.5px] tabular-nums text-muted-foreground">
                  {member.joinedAt ? `${formatDate(member.joinedAt)} 참여` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 ? (
        <section>
          <h2 className="mb-1.5 text-[13px] font-semibold text-foreground">
            나갔거나 거절된 사무소{' '}
            <span className="font-normal tabular-nums text-muted-foreground">{others.length}</span>
          </h2>
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {others.map((member) => (
              <li key={member.id} className="flex min-h-10 items-center gap-3 py-2 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {member.office?.name ?? '사무소 미상'}
                </span>
                <span className="shrink-0 text-[12.5px] text-muted-foreground">
                  {MEMBER_STATUS_META[member.status]?.label ?? member.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
