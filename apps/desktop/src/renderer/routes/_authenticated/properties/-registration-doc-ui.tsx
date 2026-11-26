import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * 매물 등록 문서의 부품. 등록 화면은 "새 문서"처럼 생겼다:
 * 제목 줄에서 단지·동·호를 글로 쳐서 고르고, 나머지는 카드 안의 속성 한 줄씩이다.
 * 칸은 평소 글처럼 보이다가 올리면 옅게, 들어가면 파란 테두리가 생긴다.
 */

/** 구역 카드: 흰 바탕 그대로, 테두리와 옅은 그림자로만 띄운다 */
export const docCardClassName =
  'rounded-[10px] border border-[rgba(42,28,0,0.11)] bg-background shadow-[0_1px_2px_rgba(25,20,10,0.05),0_3px_10px_rgba(25,20,10,0.04)] transition-[border-color,box-shadow] focus-within:border-[rgba(42,28,0,0.2)] focus-within:shadow-[0_1px_2px_rgba(25,20,10,0.06),0_6px_18px_rgba(25,20,10,0.07)]';

/** 그 자리에서 적는 칸 */
export const docCellClassName =
  'h-[30px] min-w-0 rounded-[4px] border-0 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 hover:bg-foreground/[0.055] focus:bg-background focus:shadow-[inset_0_0_0_2px_var(--color-ring)] aria-invalid:shadow-[inset_0_0_0_1px_var(--color-destructive)] aria-invalid:focus:shadow-[inset_0_0_0_2px_var(--color-ring)] disabled:opacity-60';

/** 제목 줄의 칸(단지·동·호). 글 길이만큼만 자리를 차지한다 */
export const docTitleTokenClassName =
  'max-w-full min-w-[1.5em] rounded-[6px] border-0 bg-transparent px-1.5 font-semibold tracking-[-0.02em] text-foreground outline-none [field-sizing:content] placeholder:text-foreground/25 hover:bg-foreground/[0.055] focus:bg-background focus:shadow-[inset_0_0_0_2px_var(--color-ring)] data-[empty=true]:shadow-[inset_0_-2px_0_var(--color-input)] data-[empty=true]:focus:shadow-[inset_0_0_0_2px_var(--color-ring)] disabled:opacity-60';

export function DocCard({
  title,
  help,
  children,
  className,
}: {
  title: string;
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(docCardClassName, 'px-[18px] pb-3 pt-3.5', className)}>
      <h2 className="mb-2.5 flex items-baseline gap-2 text-sm font-semibold">
        {title}
        {help && <small className="text-xs font-normal text-muted-foreground/80">{help}</small>}
      </h2>
      {children}
    </section>
  );
}

/** 속성 한 줄: 왼쪽 이름표, 오른쪽 값 */
export function DocProps({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[132px_minmax(0,1fr)] items-start gap-y-0.5 @[640px]/doc:grid-cols-[148px_minmax(0,1fr)]', className)}>
      {children}
    </div>
  );
}

export function DocProp({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex h-[34px] items-center gap-2 pl-0.5 text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground/70">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex min-h-[34px] min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">{children}</div>
    </>
  );
}

/** 칸 옆에 붙는 읽은 값·안내 */
export function DocRead({ children, invalid, className }: { children?: ReactNode; invalid?: boolean; className?: string }) {
  if (!children) return null;
  return (
    <span
      aria-live="polite"
      className={cn('ml-1 text-xs tabular-nums', invalid ? 'text-destructive-strong' : 'text-muted-foreground', className)}
    >
      {children}
    </span>
  );
}

// ── 글을 쳐서 고르는 칸 ─────────────────────────────────────────

export interface ComboItem {
  key: string;
  label: string;
  /** 오른쪽에 옅게 붙는 설명 */
  sub?: string;
  /** 묶음 이름. 앞 항목과 달라질 때 머리글로 한 번 보인다 */
  group?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * 글을 쳐서 목록에서 고르는 칸.
 * - 고르는 칸(free 아님): 들어가면 전체 목록이 열리고, 벗어나면 고른 값의 글로 돌아간다.
 * - 자유롭게 적는 칸(free): 적은 글이 그대로 값이고, 목록은 맞는 것이 있을 때 권하는 용도다.
 * ↑↓로 옮기고 Enter로 고른다. 고르지 않은 Enter는 폼이 받아 다음 칸으로 넘긴다.
 */
export function InlineCombo({
  value,
  items,
  onQueryChange,
  onPick,
  free = false,
  onFreeChange,
  loading = false,
  emptyText,
  footer,
  contentClassName,
  className,
  placeholder,
  ariaLabel,
  field,
  invalid,
  disabled,
  inputMode,
}: {
  /** 지금 값의 글 */
  value: string;
  items: ComboItem[];
  onQueryChange?: (query: string) => void;
  onPick: (item: ComboItem) => void;
  free?: boolean;
  onFreeChange?: (text: string) => void;
  loading?: boolean;
  emptyText?: string;
  footer?: ReactNode;
  contentClassName?: string;
  className?: string;
  placeholder?: string;
  ariaLabel: string;
  /** 폼이 이 칸을 찾을 때 쓰는 이름(data-reg-field) */
  field?: string;
  invalid?: boolean;
  disabled?: boolean;
  inputMode?: 'text' | 'numeric' | 'tel';
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // 고르는 칸에서 치고 있는 글. null이면 고른 값의 글을 보인다.
  const [draft, setDraft] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  // 적는 칸에서 사용자가 목록을 직접 가리켰는지(화살표·마우스)
  const pointed = useRef(false);
  const shown = free ? value : draft ?? value;
  const enabledIndexes = items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0);
  const activeIndex = enabledIndexes.includes(active) ? active : enabledIndexes[0] ?? -1;
  const showList = open && !disabled && (items.length > 0 || loading || Boolean(emptyText) || Boolean(footer));

  const close = () => {
    setOpen(false);
    setDraft(null);
  };
  const pick = (item: ComboItem) => {
    if (item.disabled) return;
    close();
    onPick(item);
  };
  const move = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const at = enabledIndexes.indexOf(activeIndex);
    const next = enabledIndexes[(at + direction + enabledIndexes.length) % enabledIndexes.length];
    setActive(next);
    document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        if (!free) onQueryChange?.('');
      } else move(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      const item = showList ? items[activeIndex] : undefined;
      // 고르는 칸은 열려 있으면 가리킨 것을 고른다. 적는 칸은 화살표로 가리킨 뒤에만 고른다
      // (이름을 다 적고 누른 Enter가 엉뚱한 사람을 고르지 않게).
      if (item && (!free || pointed.current)) {
        event.preventDefault();
        event.stopPropagation();
        pointed.current = false;
        pick(item);
        return;
      }
      close();
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Tab' && open && !free && draft?.trim() && enabledIndexes.length === 1) {
      // 글을 치다가 Tab: 하나로 좁혀졌으면 그것을 고른다
      pick(items[enabledIndexes[0]]);
    }
  };

  let lastGroup: string | undefined;
  return (
    <Popover open={showList} onOpenChange={(next) => { if (!next) close(); }}>
      <PopoverAnchor asChild>
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          data-reg-field={field}
          data-nav=""
          data-empty={!shown}
          autoComplete="off"
          spellCheck={false}
          inputMode={inputMode}
          disabled={disabled}
          placeholder={placeholder}
          className={className}
          value={shown}
          onFocus={(event) => {
            if (free) {
              if (value.trim()) setOpen(true);
              return;
            }
            event.currentTarget.select();
            setActive(0);
            onQueryChange?.('');
            setOpen(true);
          }}
          onPointerUp={() => {
            if (!open && (!free || value.trim())) setOpen(true);
          }}
          onChange={(event) => {
            const text = event.target.value;
            pointed.current = false;
            setActive(0);
            if (free) {
              onFreeChange?.(text);
              setOpen(Boolean(text.trim()));
            } else {
              setDraft(text);
              setOpen(true);
            }
            onQueryChange?.(text);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') pointed.current = true;
            onKeyDown(event);
          }}
          onBlur={close}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        // 목록이 열려도 포커스는 칸에 남는다
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onFocusOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          if (event.target === inputRef.current) event.preventDefault();
        }}
        // 목록 안을 눌러도 칸의 포커스가 빠지지 않게 한다
        onPointerDown={(event) => event.preventDefault()}
        className={cn('max-h-[300px] w-[320px] overflow-y-auto rounded-lg p-1', contentClassName)}
      >
        <div id={listId} role="listbox" aria-label={ariaLabel}>
          {items.map((item, index) => {
            const heading = item.group && item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {heading && <div className="px-2 pb-0.5 pt-1.5 text-xs text-muted-foreground">{heading}</div>}
                <div
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-disabled={item.disabled || undefined}
                  onPointerMove={() => {
                    if (!item.disabled && index !== activeIndex) setActive(index);
                    pointed.current = true;
                  }}
                  onClick={() => pick(item)}
                  className={cn(
                    'flex min-h-[30px] cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1 text-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
                    index === activeIndex && 'bg-foreground/[0.09]',
                    item.disabled && 'cursor-default text-muted-foreground/70',
                  )}
                >
                  {item.icon}
                  <span className="min-w-0 truncate">{item.label}</span>
                  {item.sub && <span className="ml-auto shrink-0 pl-4 text-xs text-muted-foreground">{item.sub}</span>}
                </div>
              </div>
            );
          })}
          {items.length === 0 && (loading || emptyText) && (
            <div className="px-2 py-2 text-xs text-muted-foreground">{loading ? '찾는 중…' : emptyText}</div>
          )}
        </div>
        {footer && <div className="mt-1 border-t border-border pt-1">{footer}</div>}
      </PopoverContent>
    </Popover>
  );
}

// ── 눌러서 고르는 단추 ─────────────────────────────────────────

export interface PickOption<T extends string> {
  value: T;
  label: string;
  sub?: string;
  disabled?: boolean;
  /** 이 항목 앞에 선을 긋는다 */
  separated?: boolean;
}

export function PickMenu<T extends string>({
  heading,
  options,
  onPick,
  children,
  ariaLabel,
  field,
  className,
  disabled,
  contentClassName,
  showChevron = true,
  nav = true,
}: {
  heading?: string;
  options: PickOption<T>[];
  onPick: (value: T) => void;
  children: ReactNode;
  ariaLabel: string;
  field?: string;
  className?: string;
  disabled?: boolean;
  contentClassName?: string;
  showChevron?: boolean;
  /** Enter로 칸을 넘길 때 이 단추에 서는가. Tab으로는 늘 닿는다 */
  nav?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  // 고른 뒤에는 폼이 다음 칸으로 포커스를 옮긴다. 메뉴는 닫히는 동안 포커스를 제 쪽으로
  // 다시 가져가므로(항목에서 포인터가 빠질 때), 고른 뒤 메뉴 밖에서 포커스를 받은 칸을 기억해
  // 두었다가 다 닫힌 뒤 그 칸으로 돌려준다.
  const picked = useRef<{ target: HTMLElement | null; stop: () => void } | null>(null);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          data-reg-field={field}
          data-nav={nav ? '' : undefined}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1.5 text-left outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-ring)]',
            className,
          )}
        >
          {children}
          {showChevron && <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground/70" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={cn('min-w-[200px]', contentClassName)}
        onCloseAutoFocus={(event) => {
          const pick = picked.current;
          if (!pick) return;
          picked.current = null;
          pick.stop();
          event.preventDefault();
          // 폼이 옮긴 곳이 없으면 단추에 남는다
          if (pick.target?.isConnected) pick.target.focus();
          else triggerRef.current?.focus();
        }}
      >
        {heading && <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{heading}</DropdownMenuLabel>}
        {options.map((option) => (
          <div key={option.value}>
            {option.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={option.disabled}
              onSelect={() => {
                picked.current?.stop();
                const pick: { target: HTMLElement | null; stop: () => void } = { target: null, stop: () => undefined };
                const onFocusIn = (event: FocusEvent) => {
                  const element = event.target;
                  if (element instanceof HTMLElement && !element.closest('[role="menu"]')) pick.target = element;
                };
                document.addEventListener('focusin', onFocusIn, true);
                pick.stop = () => document.removeEventListener('focusin', onFocusIn, true);
                picked.current = pick;
                onPick(option.value);
              }}
            >
              <span>{option.label}</span>
              {option.sub && <span className="ml-auto pl-4 text-xs text-muted-foreground">{option.sub}</span>}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
