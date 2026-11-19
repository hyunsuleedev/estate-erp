import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface InspectorTabItem<T extends string> {
  value: T;
  label: string;
  /** 0이나 undefined면 숫자를 보이지 않는다 */
  count?: number;
}

/** 탭과 탭 내용이 서로를 가리키는 id. 탭 내용 쪽에서 같은 규칙으로 쓴다. */
export function inspectorTabIds(idPrefix: string, value: string) {
  return { tab: `${idPrefix}-tab-${value}`, panel: `${idPrefix}-panel-${value}` };
}

/**
 * 상세 패널의 밑줄 탭 (매물 상세 패널의 탭과 같은 모양).
 * 키보드: 탭 목록에는 고른 탭 하나만 Tab으로 들어오고, ←/→·Home·End로 옮기면 바로 그 탭이 열린다.
 */
export function InspectorTabs<T extends string>({
  idPrefix,
  ariaLabel,
  tabs,
  value,
  onChange,
}: {
  idPrefix: string;
  ariaLabel: string;
  tabs: ReadonlyArray<InspectorTabItem<T>>;
  value: T;
  onChange: (value: T) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((item) => item.value === value);
    const nextIndex =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    onChange(next.value);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(inspectorTabIds(idPrefix, next.value).tab)}`)
      ?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className="flex shrink-0 gap-5 border-b border-[#ecebe8] px-6"
      onKeyDown={handleKeyDown}
    >
      {tabs.map((item) => {
        const selected = value === item.value;
        const ids = inspectorTabIds(idPrefix, item.value);
        return (
          <button
            key={item.value}
            id={ids.tab}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={ids.panel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative h-10 whitespace-nowrap rounded-[4px] text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected
                ? 'text-[#2f2e2a] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
            {item.count ? (
              <span className="ml-1 text-[11.5px] font-medium text-[#a9a7a1]">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
