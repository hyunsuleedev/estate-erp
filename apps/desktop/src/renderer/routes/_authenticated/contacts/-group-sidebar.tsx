import { useQueries } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import {
  BriefcaseBusiness,
  Home,
  MessageSquareText,
  Target,
  Users,
  UsersRound,
} from 'lucide-react';
import { api } from '@/lib/api';
import { CONTACT_GROUPS } from '@/lib/contacts';
import { cn } from '@/lib/utils';

/**
 * 연락처 그룹 사이드바 — 전체 연락처 + 고정 그룹 5종 + 그룹별 개수.
 * 그룹별 카운트 전용 API가 없어 그룹마다 limit=1 목록 조회로 pagination.total을 사용한다.
 * (PRD 15장: 그룹 카운트는 별도 조회 캐시 허용)
 */

const groupIcons: Record<string, ComponentType<{ className?: string }>> = {
  '매수/투자': Target,
  임차: Home,
  매물상담: MessageSquareText,
  소유자: Users,
  거래처: BriefcaseBusiness,
};

const GROUP_COUNT_STALE_TIME = 60_000;

export function ContactGroupSidebar({
  selectedGroupTag,
  onSelect,
}: {
  /** null = 전체 연락처 */
  selectedGroupTag: string | null;
  onSelect: (tag: string | null) => void;
}) {
  const countQueries = useQueries({
    queries: [
      {
        queryKey: ['contacts', 'group-count', 'all'],
        queryFn: () => api.contacts.findAll({ limit: 1 }),
        staleTime: GROUP_COUNT_STALE_TIME,
      },
      ...CONTACT_GROUPS.map((group) => ({
        queryKey: ['contacts', 'group-count', group.tag],
        queryFn: () => api.contacts.findAll({ tags: group.tag, limit: 1 }),
        staleTime: GROUP_COUNT_STALE_TIME,
      })),
    ],
  });

  const totalCount = countQueries[0]?.data?.pagination.total;

  return (
    <nav
      aria-label="연락처 그룹"
      className="hidden w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-muted/30 px-2 py-3 md:flex"
    >
      <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        그룹
      </p>

      <GroupRow
        icon={UsersRound}
        label="전체 연락처"
        count={totalCount}
        selected={selectedGroupTag === null}
        onClick={() => onSelect(null)}
      />

      {CONTACT_GROUPS.map((group, index) => (
        <GroupRow
          key={group.id}
          icon={groupIcons[group.tag] ?? Target}
          label={group.label}
          count={countQueries[index + 1]?.data?.pagination.total}
          selected={selectedGroupTag === group.tag}
          onClick={() => onSelect(selectedGroupTag === group.tag ? null : group.tag)}
        />
      ))}
    </nav>
  );
}

function GroupRow({
  icon: Icon,
  label,
  count,
  selected,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  count: number | undefined;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
        selected
          ? 'bg-[#e7f3f8] font-medium text-[#337ea9]'
          : 'text-slate-700 hover:bg-muted',
      )}
    >
      <Icon className={cn('size-3.5 shrink-0', selected ? 'text-[#337ea9]' : 'text-slate-400')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        className={cn(
          'shrink-0 text-[11px] tabular-nums',
          selected ? 'text-[#337ea9]' : 'text-slate-400',
        )}
      >
        {count != null ? count.toLocaleString() : '·'}
      </span>
    </button>
  );
}
