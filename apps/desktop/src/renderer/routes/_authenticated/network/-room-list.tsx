import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Inbox, Lock, Plus, RotateCw, Search, X } from 'lucide-react';
import type { NetworkRoom } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { networkKeys } from './-network-shared';

type RoomScope = 'mine' | 'discover';

const SCOPES: Array<{ value: RoomScope; label: string }> = [
  { value: 'mine', label: '내 방' },
  { value: 'discover', label: '찾기' },
];

export interface RoomListPanelProps {
  selectedRoomId: string | null;
  inquiriesSelected: boolean;
  /** 받은 문의 중 응답을 기다리는 건수 */
  pendingInquiryCount: number;
  onSelect: (roomId: string) => void;
  onOpenInquiries: () => void;
  onCreateRoom: () => void;
}

/** 왼쪽 목록 — 문의함 한 줄, 그 아래 내 방 또는 공개방 찾기. */
export function RoomListPanel({
  selectedRoomId,
  inquiriesSelected,
  pendingInquiryCount,
  onSelect,
  onOpenInquiries,
  onCreateRoom,
}: RoomListPanelProps) {
  const [scope, setScope] = useState<RoomScope>('mine');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());

  const roomsQuery = useQuery({
    queryKey: networkKeys.rooms({ scope, search: deferredSearch || undefined }),
    queryFn: () => api.network.listRooms({ scope, search: deferredSearch || undefined }),
  });
  const rooms = roomsQuery.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <label className="flex h-[30px] cursor-text items-center gap-2 rounded-[8px] bg-white pl-2.5 pr-1.5 shadow-[inset_0_0_0_1px_rgba(42,28,0,0.1)] focus-within:shadow-[inset_0_0_0_1px_rgba(55,53,47,0.45)]">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && search) setSearch('');
            }}
            placeholder={scope === 'mine' ? '내 방 검색' : '방 이름으로 찾기'}
            aria-label="중개방 검색"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          {search ? (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={() => setSearch('')}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </label>

        <div className="mt-2.5 flex items-center justify-between gap-2 px-0.5">
          <div role="group" aria-label="방 범위" className="flex items-center gap-0.5">
            {SCOPES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={scope === option.value}
                onClick={() => setScope(option.value)}
                className={cn(
                  'h-6 rounded-[5px] px-1.5 text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/45',
                  scope === option.value
                    ? 'bg-[rgba(55,53,47,0.08)] font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onCreateRoom}
            className="inline-flex h-6 items-center gap-1 rounded-[5px] px-1.5 text-[12px] text-muted-foreground outline-none transition-colors hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            방 만들기
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/70 px-1.5 py-1.5">
        {/* 문의함: 방과 같은 자리에 두되 방은 아니다 */}
        <button
          type="button"
          aria-current={inquiriesSelected ? 'true' : undefined}
          onClick={onOpenInquiries}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/45',
            inquiriesSelected
              ? 'bg-white font-medium text-foreground shadow-[0_0_0_1px_rgba(42,28,0,0.1),0_1px_2px_rgba(25,25,25,0.04)]'
              : 'text-foreground hover:bg-[rgba(55,53,47,0.045)]',
          )}
        >
          <Inbox className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">문의함</span>
          {pendingInquiryCount > 0 ? (
            <span
              className="shrink-0 rounded-full bg-warning-soft px-1.5 text-[11.5px] font-medium tabular-nums text-warning-strong"
              aria-label={`응답 대기 ${pendingInquiryCount}건`}
            >
              {pendingInquiryCount}
            </span>
          ) : null}
        </button>

        <p className="mt-3 px-2.5 pb-1 text-[11.5px] font-medium text-muted-foreground">
          {scope === 'mine' ? '내 방' : deferredSearch ? '찾은 방' : '공개방'}
        </p>

        {roomsQuery.isLoading ? (
          <div className="space-y-1 px-1">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[52px] w-full rounded-md" />
            ))}
          </div>
        ) : roomsQuery.isError ? (
          <div className="px-3 py-6 text-center">
            <p className="text-[12.5px] text-muted-foreground">방 목록을 불러오지 못했습니다.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void roomsQuery.refetch()}
            >
              <RotateCw className="size-3.5" aria-hidden="true" />
              다시 시도
            </Button>
          </div>
        ) : rooms.length === 0 ? (
          <div className="px-2.5 py-2 text-[12.5px] leading-[1.6] text-muted-foreground">
            {deferredSearch ? (
              '찾는 방이 없습니다.'
            ) : scope === 'mine' ? (
              <>
                참여 중인 방이 없습니다.{' '}
                <button
                  type="button"
                  className="text-foreground underline underline-offset-2"
                  onClick={() => setScope('discover')}
                >
                  공개방 찾기
                </button>
              </>
            ) : (
              '아직 공개방이 없습니다.'
            )}
          </div>
        ) : (
          <ul>
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

        {scope === 'discover' ? (
          <p className="mt-2 px-2.5 text-[11.5px] leading-[1.6] text-muted-foreground">
            비공개방은 이름으로 검색해야 나옵니다.
          </p>
        ) : null}
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
  const status = room.myMembership?.status;
  // 참여 중이 아닐 때만 상태를 적는다
  const statusText =
    status === 'pending' ? '승인 대기' : status === 'rejected' ? '거절됨' : !status ? '미참여' : null;

  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
        className={cn(
          'flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/45',
          selected
            ? 'bg-white shadow-[0_0_0_1px_rgba(42,28,0,0.1),0_1px_2px_rgba(25,25,25,0.04)]'
            : 'hover:bg-[rgba(55,53,47,0.045)]',
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">
            {room.name}
          </span>
          {room.type === 'private' ? (
            <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="비공개방" />
          ) : null}
          {statusText ? (
            <span
              className={cn(
                'shrink-0 text-[11.5px]',
                status === 'pending' ? 'text-warning-strong' : 'text-muted-foreground',
              )}
            >
              {statusText}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
          {room.region ? <span className="shrink-0">{room.region}</span> : null}
          {room.region ? <span aria-hidden="true" className="text-[#c9c7c1]">·</span> : null}
          <span className="shrink-0 tabular-nums">
            {room.memberCount}
            {room.maxMembers != null ? `/${room.maxMembers}` : ''}곳
          </span>
          {room.description ? (
            <>
              <span aria-hidden="true" className="text-[#c9c7c1]">·</span>
              <span className="truncate">{room.description}</span>
            </>
          ) : null}
        </span>
      </button>
    </li>
  );
}
