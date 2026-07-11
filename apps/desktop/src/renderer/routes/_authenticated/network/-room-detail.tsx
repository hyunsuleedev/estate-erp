import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2Icon,
  DoorOpenIcon,
  GlobeIcon,
  LockIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Share2Icon,
  Undo2Icon,
  UsersIcon,
} from 'lucide-react';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog, EmptyState } from '@/components/domain';
import {
  MEMBER_ROLE_META,
  MEMBER_STATUS_META,
  NetBadge,
  ROOM_TYPE_META,
  getErrorMessage,
  networkKeys,
} from './-network-shared';
import { SharedPropertyCard } from './-shared-property-card';
import { ShareListingDialog } from './-share-dialog';
import { InquiryCreateDialog } from './-inquiry-dialogs';
import { ChatPanel } from './-chat-panel';

function viewFlags(view: NetworkSharedPropertyView) {
  return {
    showSiteName: view.showSiteName,
    showDong: view.showDong,
    showUnit: view.showUnit,
    showFloor: view.showFloor,
    showPrice: view.showPrice,
    showArea: view.showArea,
    showMemo: view.showMemo,
    showPhotos: view.showPhotos,
  };
}

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

  if (roomQuery.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (roomQuery.isError || !room) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        중개방 정보를 불러오지 못했습니다
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={() => void roomQuery.refetch()}>
            재시도
          </Button>
        </div>
      </div>
    );
  }

  const pendingMembers = room.members.filter((m) => m.status === 'pending');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── 방 헤더 ── */}
      <div className="flex flex-wrap items-start gap-2 border-b p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {room.type === 'public' ? (
              <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <LockIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <h2 className="truncate text-base font-semibold">{room.name}</h2>
            <NetBadge meta={ROOM_TYPE_META[room.type]} size="sm" />
            {room.region && (
              <span className="rounded-sm bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                {room.region}
              </span>
            )}
            {membership && membership.status !== 'approved' && (
              <NetBadge meta={MEMBER_STATUS_META[membership.status]} size="sm" />
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <UsersIcon className="size-3" />
              {room.memberCount}개 사무소
              {room.maxMembers != null && ` / 최대 ${room.maxMembers}`}
            </span>
            {room.createdByOffice && <span>개설 {room.createdByOffice.name}</span>}
            <span>{formatDate(room.createdAt)} 개설</span>
          </p>
          {room.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{room.description}</p>
          )}
        </div>

        {isApproved && (
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={() => setShareOpen(true)}>
              <Share2Icon className="size-4" /> 매물 공유
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="방 메뉴">
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setLeaveOpen(true)}
                >
                  <DoorOpenIcon className="size-4" /> 방 나가기
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* ── 본문 ── */}
      {!isApproved ? (
        <NonMemberBody
          room={room}
          membershipStatus={membership?.status ?? null}
          onJoin={() => joinMutation.mutate()}
          joining={joinMutation.isPending}
        />
      ) : (
        <Tabs defaultValue="shared" className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="border-b px-3 pt-2">
            <TabsList>
              <TabsTrigger value="shared">공유 매물</TabsTrigger>
              <TabsTrigger value="chat">채팅</TabsTrigger>
              <TabsTrigger value="members">
                멤버
                {isAdmin && pendingMembers.length > 0 && (
                  <span className="ml-1 rounded-full bg-warning-soft px-1.5 text-[11px] font-medium text-warning">
                    {pendingMembers.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 공유 매물 피드 */}
          <TabsContent value="shared" className="min-h-0 flex-1 overflow-y-auto p-3">
            {sharedQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : sharedQuery.isError ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                공유 매물을 불러오지 못했습니다
                <div className="mt-2">
                  <Button variant="outline" size="sm" onClick={() => void sharedQuery.refetch()}>
                    재시도
                  </Button>
                </div>
              </div>
            ) : (sharedQuery.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={Building2Icon}
                title="아직 공유된 매물이 없습니다"
                description="내 매물장의 매물을 이 방에 공유해 공동중개를 시작해보세요."
                action={
                  <Button size="sm" onClick={() => setShareOpen(true)}>
                    <Share2Icon className="size-4" /> 매물 공유
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {sharedQuery.data!.map((shared) => (
                  <SharedPropertyCard
                    key={shared.id}
                    flags={viewFlags(shared)}
                    listing={shared.listing}
                    isMine={shared.isMine}
                    officeName={shared.office?.name}
                    sharedByName={shared.sharedByUser?.name}
                    contactName={shared.contactName}
                    contactPhone={shared.contactPhone}
                    description={shared.description}
                    createdAt={shared.createdAt}
                    inactive={!shared.isActive}
                    actions={
                      shared.isMine ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditTarget(shared)}
                          >
                            <PencilIcon className="size-3.5" /> 공유 설정
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRecallTarget(shared)}
                          >
                            <Undo2Icon className="size-3.5" /> 회수
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setInquiryTarget(shared);
                            setInquiryOpen(true);
                          }}
                        >
                          문의하기
                        </Button>
                      )
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* 채팅 */}
          <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
            <ChatPanel
              roomId={roomId}
              myOfficeId={myOfficeId}
              attachables={sharedQuery.data ?? []}
            />
          </TabsContent>

          {/* 멤버 */}
          <TabsContent value="members" className="min-h-0 flex-1 overflow-y-auto p-3">
            <MembersPanel
              room={room}
              isAdmin={isAdmin}
              onDecide={(memberId, status) => memberMutation.mutate({ memberId, status })}
              deciding={memberMutation.isPending}
            />
          </TabsContent>
        </Tabs>
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
        sharedListingIds={(sharedQuery.data ?? [])
          .filter((shared) => shared.isMine && shared.isActive)
          .map((shared) => shared.listingId)}
      />
      <InquiryCreateDialog
        open={inquiryOpen}
        onOpenChange={setInquiryOpen}
        target={inquiryTarget}
      />
      <ConfirmDialog
        open={!!recallTarget}
        onOpenChange={(next) => !next && setRecallTarget(null)}
        title="공유를 회수할까요?"
        description="회수하면 이 방의 피드에서 매물이 내려갑니다. 이미 진행 중인 문의 기록은 유지됩니다."
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
        description="나가면 이 방의 공유 매물과 채팅을 더 이상 볼 수 없습니다."
        confirmLabel="나가기"
        destructive
        loading={leaveMutation.isPending}
        onConfirm={() => leaveMutation.mutate()}
      />
    </div>
  );
}

// ── 미참여 사무소용 본문 ──────────────────────────────────────

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
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <UsersIcon className="mx-auto size-10 text-muted-foreground/50" />
        {membershipStatus === 'pending' ? (
          <>
            <p className="mt-3 text-sm font-medium">참여 승인을 기다리는 중입니다</p>
            <p className="mt-1 text-sm text-muted-foreground">
              방장이 승인하면 공유 매물과 채팅을 볼 수 있습니다.
            </p>
          </>
        ) : membershipStatus === 'rejected' ? (
          <>
            <p className="mt-3 text-sm font-medium">참여가 거절된 방입니다</p>
            <p className="mt-1 text-sm text-muted-foreground">
              필요하면 다시 참여 신청을 보낼 수 있습니다.
            </p>
            <Button className="mt-3" size="sm" onClick={onJoin} disabled={joining}>
              {joining ? '신청 중…' : '다시 참여 신청'}
            </Button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm font-medium">아직 참여하지 않은 중개방입니다</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {room.memberCount}개 사무소가 참여 중입니다. 참여를 신청하면 방장 승인 후 공유
              매물과 채팅에 접근할 수 있습니다.
            </p>
            <Button className="mt-3" size="sm" onClick={onJoin} disabled={joining}>
              {joining ? '신청 중…' : '참여 신청'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── 멤버 패널 ────────────────────────────────────────────────

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
  // 승인 대기 우선, 그다음 참여 중 → 기타
  const order: Record<string, number> = { pending: 0, approved: 1, rejected: 2, left: 3 };
  const members = room.members
    .slice()
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  if (members.length === 0) {
    return (
      <EmptyState
        icon={UsersIcon}
        title="멤버 정보가 없습니다"
        description="방에 참여한 사무소가 여기에 표시됩니다."
      />
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {members.map((member) => (
        <li key={member.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <Building2Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {member.office?.name ?? '사무소 미상'}
          </span>
          <NetBadge meta={MEMBER_ROLE_META[member.role]} size="sm" />
          <NetBadge meta={MEMBER_STATUS_META[member.status]} size="sm" />
          {member.joinedAt && (
            <span className="text-xs text-muted-foreground">{formatDate(member.joinedAt)} 참여</span>
          )}
          {isAdmin && member.status === 'pending' && (
            <span className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={deciding}
                onClick={() => onDecide(member.id, 'approved')}
              >
                승인
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={deciding}
                onClick={() => onDecide(member.id, 'rejected')}
              >
                거절
              </Button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
