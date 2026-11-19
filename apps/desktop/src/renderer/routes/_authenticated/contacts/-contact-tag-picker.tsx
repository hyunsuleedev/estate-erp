import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Ellipsis, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@estate-erp/api-client';
import {
  CONTACT_TAG_COLORS,
  CONTACT_TAG_COLOR_LABELS,
  type ContactTagColor,
} from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ContactTagChip, contactTagColorStyle } from '@/components/contacts/contact-tag-chip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  buildContactTagChoices,
  validateContactTagName,
  type ContactTagOption,
} from './-contact-tags';

/** 태그 목록(색 · 붙은 수). 연락처가 바뀌면 ['contacts'] 무효화로 함께 갱신된다. */
export const contactTagsQuery = {
  queryKey: ['contacts', 'tags'],
  queryFn: () => api.contacts.getTags(),
  staleTime: 30_000,
};

/** 태그 이름으로 색을 찾는다. 목록에 아직 없는 새 태그는 회색으로 보인다. */
export function useContactTagColors() {
  const { data } = useQuery(contactTagsQuery);
  return useMemo(() => new Map((data ?? []).map((tag) => [tag.name, tag.color])), [data]);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/** Notion 선택 창의 겉모습: 너비 300 · 모서리 6 · 흰 바탕 · 세 겹 그림자(맨 아래가 1px 테두리 역할). */
export const contactTagPopoverClassName =
  'w-[300px] overflow-hidden rounded-[6px] border-0 bg-white p-0 shadow-[0_20px_24px_0_rgba(25,25,25,0.05),0_5px_8px_0_rgba(25,25,25,0.027),0_0_0_1px_rgba(42,28,0,0.07)]';

/**
 * 태그를 고르는 창 (Notion 다중 선택 창과 같은 구성).
 * 맨 위: 붙은 태그와 입력칸 · 그 아래: 안내 글자 · 목록(한 줄 28px, 오른쪽 ⋯에서 이름 · 색 · 삭제).
 * 글자를 치면 목록이 걸러지고, 같은 이름이 없으면 "생성" 줄이 나온다.
 * 이 창은 고른 결과를 알려 주기만 한다. 저장은 부르는 쪽이 한다.
 */
export function ContactTagPicker({
  selected,
  onAdd,
  onRemove,
  onRenamed,
  onDeleted,
}: {
  selected: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  /** 목록에서 태그 이름을 바꿨다. 고른 이름을 들고 있는 쪽은 함께 바꿔야 한다. */
  onRenamed?: (name: string, newName: string) => void;
  onDeleted?: (name: string) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const tags = useQuery(contactTagsQuery);
  const options: ContactTagOption[] = useMemo(() => tags.data ?? [], [tags.data]);
  const colors = useMemo(() => new Map(options.map((tag) => [tag.name, tag.color])), [options]);
  const { matches, createName } = buildContactTagChoices(options, selected, query);
  const rowCount = matches.length + (createName ? 1 : 0);
  const active = Math.min(activeIndex, Math.max(rowCount - 1, 0));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const toggle = (name: string) => {
    if (selected.includes(name)) onRemove(name);
    else onAdd(name);
    setQuery('');
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 한글 조합 중의 Enter는 글자 확정이다.
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(rowCount === 0 ? 0 : (active + 1) % rowCount);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(rowCount === 0 ? 0 : (active - 1 + rowCount) % rowCount);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (rowCount === 0) return;
      if (active < matches.length) toggle(matches[active].name);
      else if (createName) toggle(createName);
    } else if (event.key === 'Backspace' && query === '' && selected.length > 0) {
      onRemove(selected[selected.length - 1]);
    }
  };

  const invalidName = query.trim() !== '' && !createName && matches.length === 0
    ? validateContactTagName(query)
    : null;

  return (
    <div className="text-[14px] text-foreground">
      <div
        role="combobox"
        aria-expanded
        aria-haspopup="listbox"
        aria-controls={listId}
        className="flex min-h-7 cursor-text items-start bg-[rgba(242,241,238,0.6)] p-1"
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex min-w-0 grow flex-wrap gap-1.5 px-2 py-[5.25px]">
          {selected.map((name) => (
            <ContactTagChip
              key={name}
              name={name}
              color={colors.get(name)}
              onRemove={() => {
                onRemove(name);
                inputRef.current?.focus();
              }}
            />
          ))}
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            aria-label="태그 찾기 또는 만들기"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={rowCount > 0 ? `${listId}-${active}` : undefined}
            className="h-5 min-w-[60px] flex-1 border-0 bg-transparent p-0 text-[14px] leading-5 outline-none placeholder:text-muted-foreground"
            placeholder={selected.length === 0 ? '태그 검색' : undefined}
          />
        </div>
      </div>

      <div className="px-3.5 pb-1 pt-2 text-[12px] font-medium leading-[14.4px] text-[#7d7a75]">
        옵션 선택 또는 생성
      </div>

      <div id={listId} role="listbox" aria-label="태그" aria-multiselectable className="max-h-[240px] overflow-y-auto px-1 pb-1">
        {matches.map((option, index) => (
          <TagOptionRow
            key={option.name}
            id={`${listId}-${index}`}
            option={option}
            selected={selected.includes(option.name)}
            active={index === active}
            onHover={() => setActiveIndex(index)}
            onToggle={() => toggle(option.name)}
            onRenamed={onRenamed}
            onDeleted={onDeleted}
          />
        ))}
        {createName && (
          <OptionShell
            id={`${listId}-${matches.length}`}
            selected={false}
            active={matches.length === active}
            onHover={() => setActiveIndex(matches.length)}
            onToggle={() => toggle(createName)}
          >
            <span className="shrink-0 text-[14px] text-foreground">생성</span>
            <ContactTagChip name={createName} />
          </OptionShell>
        )}
        {rowCount === 0 && (
          <p className="px-2.5 py-1.5 text-[13px] text-muted-foreground">
            {tags.isLoading
              ? '태그를 불러오는 중입니다.'
              : tags.isError
                ? '태그를 불러오지 못했습니다.'
                : (invalidName ?? '만든 태그가 없습니다. 이름을 입력해 만드세요.')}
          </p>
        )}
      </div>
    </div>
  );
}

/** 목록의 한 줄: 높이 28 · 모서리 6 · 올리면 옅은 바탕. */
function OptionShell({
  id,
  selected,
  active,
  onHover,
  onToggle,
  children,
  trailing,
}: {
  id: string;
  selected: boolean;
  active: boolean;
  onHover: () => void;
  onToggle: () => void;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      onMouseEnter={onHover}
      // 입력칸의 포커스를 뺏지 않는다. 뺏으면 누를 때마다 커서가 사라진다.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
      className={cn(
        'group/option flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5',
        active && 'bg-[rgba(55,53,47,0.06)]',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
      {selected && <Check className="size-3.5 shrink-0 text-[#7d7a75]" aria-hidden />}
      {trailing}
    </div>
  );
}

function TagOptionRow({
  id,
  option,
  selected,
  active,
  onHover,
  onToggle,
  onRenamed,
  onDeleted,
}: {
  id: string;
  option: ContactTagOption;
  selected: boolean;
  active: boolean;
  onHover: () => void;
  onToggle: () => void;
  onRenamed?: (name: string, newName: string) => void;
  onDeleted?: (name: string) => void;
}) {
  return (
    <OptionShell
      id={id}
      selected={selected}
      active={active}
      onHover={onHover}
      onToggle={onToggle}
      trailing={<TagOptionMenu option={option} onRenamed={onRenamed} onDeleted={onDeleted} />}
    >
      <ContactTagChip name={option.name} color={option.color} />
    </OptionShell>
  );
}

/** 태그 하나의 이름 · 색 · 삭제. 목록 줄 오른쪽의 ⋯에서 연다. */
function TagOptionMenu({
  option,
  onRenamed,
  onDeleted,
}: {
  option: ContactTagOption;
  onRenamed?: (name: string, newName: string) => void;
  onDeleted?: (name: string) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(option.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Enter로 저장하면 입력칸이 잠기면서 blur가 따라온다. 그 blur가 같은 이름 변경을 한 번 더 보내지 않게 한다
  // (두 번째 요청은 이미 바뀐 옛 이름을 찾지 못해 실패 알림을 띄운다).
  const renaming = useRef(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['contacts'] });

  const update = useMutation({
    mutationFn: (changes: { newName?: string; color?: ContactTagColor }) =>
      api.contacts.updateTag(option.name, changes),
    onSuccess: async ({ name }) => {
      if (name !== option.name) onRenamed?.(option.name, name);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error, '태그를 바꾸지 못했습니다.')),
    onSettled: () => {
      renaming.current = false;
    },
  });
  const remove = useMutation({
    mutationFn: () => api.contacts.deleteTag(option.name),
    onSuccess: async () => {
      onDeleted?.(option.name);
      setOpen(false);
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error, '태그를 지우지 못했습니다.')),
  });

  const commitName = () => {
    if (renaming.current) return;
    const problem = validateContactTagName(draft);
    if (problem) {
      toast.error(problem);
      return;
    }
    const next = draft.trim().replace(/\s+/g, ' ');
    if (next === option.name) return;
    renaming.current = true;
    update.mutate({ newName: next });
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft(option.name);
          setConfirmingDelete(false);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${option.name} 태그 설정`}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-[4px] text-[#7d7a75] opacity-0 outline-none hover:bg-black/10 focus-visible:opacity-100 group-hover/option:opacity-100 data-[state=open]:bg-black/10 data-[state=open]:opacity-100"
        >
          <Ellipsis className="size-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52"
        // 메뉴는 화면에서는 따로 떠 있어도 React에서는 목록 줄의 자식이다. 여기서 막지 않으면
        // 줄의 mousedown 처리(포커스를 입력칸에 남겨 두는 preventDefault)와 click 처리(붙이기 · 떼기)가
        // 메뉴 안에서 누른 것에도 걸려, 이름 입력칸을 눌러도 커서가 들어가지 않는다.
        // pointerdown은 막지 않는다 — 메뉴가 "안쪽을 눌렀는지"를 그 이벤트로 판단해서,
        // 막으면 바깥을 눌러도 한 번에 닫히지 않는다.
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="p-1">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // 메뉴의 글자 찾기가 입력을 가로채지 않게 한다.
              event.stopPropagation();
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                commitName();
              }
            }}
            onBlur={commitName}
            aria-label="태그 이름"
            disabled={update.isPending}
            className="h-7 w-full rounded-[4px] border border-border bg-[rgba(242,241,238,0.6)] px-2 text-[14px] outline-none focus:border-[#2383e2]"
          />
        </div>
        <DropdownMenuItem
          variant="destructive"
          disabled={remove.isPending}
          onSelect={(event) => {
            event.preventDefault();
            if (confirmingDelete) remove.mutate();
            else setConfirmingDelete(true);
          }}
        >
          <Trash2 />
          {confirmingDelete
            ? `한 번 더 누르면 삭제 (${option.count.toLocaleString()}명에게서 떼어짐)`
            : '삭제'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">색</DropdownMenuLabel>
        {CONTACT_TAG_COLORS.map((color) => (
          <DropdownMenuItem
            key={color}
            disabled={update.isPending}
            onSelect={(event) => {
              event.preventDefault();
              if (color !== option.color) update.mutate({ color });
            }}
          >
            <span
              aria-hidden
              style={contactTagColorStyle(color)}
              className="size-[18px] shrink-0 rounded-[4px] shadow-[inset_0_0_0_1px_rgba(42,28,0,0.07)]"
            />
            {CONTACT_TAG_COLOR_LABELS[color]}
            {color === option.color && <Check className="ml-auto size-3.5" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 등록 · 수정 폼의 태그 칸. 붙은 태그를 꼬리표로 보여 주고, 누르면 같은 고르는 창이 열린다.
 * 값은 태그 이름 배열이다. 새로 만든 이름은 저장할 때 서버가 태그로 만든다.
 */
export function ContactTagsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const colors = useContactTagColors();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="태그 고르기"
          className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {value.length === 0 ? (
            <span className="text-muted-foreground">태그 없음</span>
          ) : (
            value.map((name) => <ContactTagChip key={name} name={name} color={colors.get(name)} />)
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className={contactTagPopoverClassName}>
        <ContactTagPicker
          selected={value}
          onAdd={(name) => onChange([...value, name])}
          onRemove={(name) => onChange(value.filter((item) => item !== name))}
          onRenamed={(name, newName) =>
            onChange(value.map((item) => (item === name ? newName : item)))
          }
          onDeleted={(name) => onChange(value.filter((item) => item !== name))}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * 연락처 표의 태그 칸. 꼬리표를 보여 주고, 누르면 칸 위에 고르는 창이 열려 그 자리에서 붙이고 뗀다.
 * 고를 때마다 바로 저장한다(Notion과 같다). 저장은 "이 태그 하나를 붙인다 · 뗀다"로 보내므로
 * 그 사이 다른 직원이 붙인 태그를 덮어쓰지 않는다.
 */
export function ContactTagsCell({
  contactId,
  contactName,
  tags,
}: {
  contactId: string;
  contactName: string;
  tags: string[];
}) {
  const queryClient = useQueryClient();
  const colors = useContactTagColors();
  const [open, setOpen] = useState(false);
  // 저장이 끝나고 목록이 새로 올 때까지는 화면의 값을 쓴다. 그 뒤에는 서버 값으로 돌아간다.
  const [override, setOverride] = useState<string[] | null>(null);
  const pending = useRef(0);
  // 요청은 누른 순서대로 하나씩 보낸다. 나란히 보내면 "붙이기 → 떼기"를 빠르게 눌렀을 때
  // 떼기가 먼저 끝나고 붙이기가 나중에 끝나, 마지막에 뗀 태그가 붙은 채로 남는다.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const shown = override ?? tags;

  const run = async (next: string[], request: () => Promise<unknown>, fallback: string) => {
    setOverride(next);
    pending.current += 1;
    const turn = queue.current.then(request);
    // 앞의 요청이 실패해도 뒤의 요청은 이어서 보낸다.
    queue.current = turn.catch(() => undefined);
    try {
      await turn;
    } catch (error) {
      toast.error(errorMessage(error, fallback));
    } finally {
      pending.current -= 1;
      // 성공이든 실패든 서버 값을 다시 읽어 맞춘다. 연달아 누른 것이 남아 있으면 마지막에 한 번만 푼다.
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      if (pending.current === 0) setOverride(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${contactName} 태그 고치기`}
          className="flex h-full w-full min-w-0 cursor-pointer items-center gap-2 overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2383e2]/60 data-[state=open]:ring-2 data-[state=open]:ring-inset data-[state=open]:ring-[#2383e2]"
          title={shown.join(' · ') || undefined}
        >
          {shown.map((name) => (
            <ContactTagChip key={name} name={name} color={colors.get(name)} />
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        // 창이 칸을 덮으며 열린다: 칸 높이만큼 위로, 칸의 좌우 여백만큼 왼쪽으로.
        sideOffset={-36}
        alignOffset={-8}
        className={contactTagPopoverClassName}
      >
        <ContactTagPicker
          selected={shown}
          onAdd={(name) =>
            void run(
              [...shown, name],
              () => api.contacts.assignTag(name, [contactId]),
              '태그를 붙이지 못했습니다.',
            )
          }
          onRemove={(name) =>
            void run(
              shown.filter((item) => item !== name),
              () => api.contacts.unassignTag(name, [contactId]),
              '태그를 떼지 못했습니다.',
            )
          }
          // 이름 변경 · 삭제는 태그 자체를 바꾼 것이라 목록을 다시 읽으면 반영된다.
          onRenamed={(name, newName) =>
            setOverride((current) => current?.map((item) => (item === name ? newName : item)) ?? null)
          }
          onDeleted={(name) =>
            setOverride((current) => current?.filter((item) => item !== name) ?? null)
          }
        />
      </PopoverContent>
    </Popover>
  );
}
