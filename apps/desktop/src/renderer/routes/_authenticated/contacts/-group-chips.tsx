import { useQueries } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CONTACT_GROUPS } from '@/lib/contacts';
import { cn } from '@/lib/utils';

/**
 * 연락처 그룹 필터 칩 — 전체 연락처 + 고정 그룹 5종 + 그룹별 개수.
 * (기존 좌측 사이드바를 디자인 시안의 상단 칩 행으로 재배치한 것)
 * 그룹별 카운트 전용 API가 없어 그룹마다 limit=1 목록 조회로 pagination.total을 사용한다.
 * (PRD 15장: 그룹 카운트는 별도 조회 캐시 허용)
 */

const GROUP_COUNT_STALE_TIME = 60_000;

export function ContactGroupChips({
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

  return (
    <div aria-label="연락처 그룹" className="flex flex-wrap items-center gap-1.5">
      <GroupChip
        label="전체"
        count={countQueries[0]?.data?.pagination.total}
        selected={selectedGroupTag === null}
        onClick={() => onSelect(null)}
      />

      {CONTACT_GROUPS.map((group, index) => (
        <GroupChip
          key={group.id}
          label={group.label}
          count={countQueries[index + 1]?.data?.pagination.total}
          selected={selectedGroupTag === group.tag}
          onClick={() => onSelect(selectedGroupTag === group.tag ? null : group.tag)}
        />
      ))}
    </div>
  );
}

function GroupChip({
  label,
  count,
  selected,
  onClick,
}: {
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
        'flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium transition-colors',
        selected
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
      <span
        className={cn(
          'inline-flex h-4 min-w-[17px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums',
          selected ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground',
        )}
      >
        {count != null ? count.toLocaleString() : '·'}
      </span>
    </button>
  );
}
