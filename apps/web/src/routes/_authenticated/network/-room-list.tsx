import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GlobeIcon, LockIcon, PlusIcon, SearchIcon, UsersIcon, UsersRoundIcon } from 'lucide-react';
import type { NetworkRoom } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/domain';
import { MEMBER_STATUS_META, NetBadge, networkKeys } from './-network-shared';

type RoomScope = 'mine' | 'discover';

export interface RoomListPanelProps {
  selectedRoomId: string | null;
  onSelect: (roomId: string) => void;
  onCreateRoom: () => void;
}

/** 좌측 중개방 목록 — 내 방 / 공개방 디렉토리 탭 (카톡방 메타포). */
export function RoomListPanel({ selectedRoomId, onSelect, onCreateRoom }: RoomListPanelProps) {
  const [scope, setScope] = useState<RoomScope>('mine');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());

  const roomsQuery = useQuery({
    queryKey: networkKeys.rooms({ scope, search: deferredSearch || undefined }),
    queryFn: () =>
      api.network.listRooms({ scope, search: deferredSearch || undefined }),
  });

  const rooms = roomsQuery.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 탭 + 검색 */}
      <div className="space-y-2 border-b p-2.5">
        <Tabs value={scope} onValueChange={(v) => setScope(v as RoomScope)}>
          <TabsList className="w-full">
            <TabsTrigger value="mine" className="flex-1">
              내 방
            </TabsTrigger>
            <TabsTrigger value="discover" className="flex-1">
              공개방 찾기
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={scope === 'mine' ? '내 방 검색' : '방 이름·지역 검색'}
            className="h-8 pl-8"
          />
        </div>
        {scope === 'discover' && (
          <p className="px-0.5 text-[11px] text-muted-foreground">
            비공개방은 방 이름을 정확히 검색해야 찾을 수 있습니다.
          </p>
        )}
      </div>

      {/* 방 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {roomsQuery.isLoading ? (
          <div className="space-y-1.5 p-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : roomsQuery.isError ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            방 목록을 불러오지 못했습니다
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={() => void roomsQuery.refetch()}>
                재시도
              </Button>
            </div>
          </div>
        ) : rooms.length === 0 ? (
          deferredSearch ? (
            <EmptyState
              icon={SearchIcon}
              title="검색 결과가 없습니다"
              description={
                scope === 'mine'
                  ? '다른 키워드로 검색하거나 공개방을 찾아보세요.'
                  : '방 이름을 다시 확인해보세요. 비공개방은 정확한 이름으로만 검색됩니다.'
              }
            />
          ) : scope === 'mine' ? (
            <EmptyState
              icon={UsersRoundIcon}
              title="첫 중개방을 만들어보세요"
              description="사무소 간 매물 공유와 공동중개는 중개방에서 시작됩니다. 공개방에 참여하거나 직접 방을 만들 수 있습니다."
              action={
                <div className="flex flex-col items-center gap-1.5">
                  <Button size="sm" onClick={onCreateRoom}>
                    <PlusIcon className="size-4" /> 방 만들기
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setScope('discover')}>
                    공개방 찾아보기
                  </Button>
                </div>
              }
            />
          ) : (
            <EmptyState
              icon={GlobeIcon}
              title="아직 공개방이 없습니다"
              description="첫 공개방을 만들어 주변 사무소를 초대해보세요."
              action={
                <Button size="sm" onClick={onCreateRoom}>
                  <PlusIcon className="size-4" /> 방 만들기
                </Button>
              }
            />
          )
        ) : (
          <ul className="space-y-0.5">
            {rooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                selected={room.id === selectedRoomId}
                onSelect={() => onSelect(room.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RoomRow({
  room,
  selected,
  onSelect,
}: {
  room: NetworkRoom;
  selected: boolean;
  onSelect: () => void;
}) {
  const membership = room.myMembership;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-muted/60',
          selected && 'bg-muted',
        )}
      >
        <span className="flex items-center gap-1.5">
          {room.type === 'public' ? (
            <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <LockIcon className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{room.name}</span>
          {membership && membership.status !== 'approved' && (
            <NetBadge meta={MEMBER_STATUS_META[membership.status]} size="sm" />
          )}
        </span>
        <span className="flex items-center gap-2 pl-5 text-[11px] text-muted-foreground">
          {room.region && (
            <span className="rounded-sm bg-muted px-1 py-px">{room.region}</span>
          )}
          <span className="inline-flex items-center gap-0.5">
            <UsersIcon className="size-3" />
            {room.memberCount}
            {room.maxMembers != null && `/${room.maxMembers}`}
          </span>
          {room.description && <span className="truncate">{room.description}</span>}
        </span>
      </button>
    </li>
  );
}
