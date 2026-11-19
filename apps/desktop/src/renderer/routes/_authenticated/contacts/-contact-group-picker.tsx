import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { contactCategorySummaryQuery } from './-contact-categories-panel';

/**
 * 사무소가 만든 그룹 가운데 이 사람이 들어갈 곳을 고른다. 한 사람이 여러 그룹에 들어갈 수 있다.
 * 그룹은 태그와 다른 것이라 태그 입력칸과 따로 둔다. 새 그룹은 연락처 목록의 왼쪽에서 만든다.
 */
export function ContactGroupPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const summary = useQuery(contactCategorySummaryQuery);
  const listed = (summary.data?.groups ?? []).map(({ name }) => name);
  // 목록을 아직 못 읽었거나 그 사이 지워진 그룹이어도, 이미 고른 것은 보여 줘야 뺄 수 있다.
  const names = [...listed, ...selected.filter((name) => !listed.includes(name))];

  if (names.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {summary.isLoading
          ? '그룹을 불러오는 중입니다.'
          : summary.isError
            ? '그룹을 불러오지 못했습니다.'
            : '만든 그룹이 없습니다. 연락처 목록 왼쪽에서 만들 수 있습니다.'}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => {
        const isSelected = selected.includes(name);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={isSelected}
            onClick={() =>
              onChange(
                isSelected
                  ? selected.filter((item) => item !== name)
                  : [...selected, name],
              )
            }
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              isSelected
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background text-foreground hover:bg-muted',
            )}
          >
            {isSelected && <Check className="size-3" aria-hidden />}
            {name}
          </button>
        );
      })}
    </div>
  );
}
