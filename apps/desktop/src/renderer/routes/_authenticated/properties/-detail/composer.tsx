import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Loader2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, Kbd, nb } from './ui';

/*
 * 아래에 붙은 상담 입력칸. 누구와(연락처) · 어떻게(전화·방문·문자) · 무슨 이야기를 했는지 바로 남긴다.
 * 소유자 쪽 사람과 한 상담은 "매물 확인"으로도 남길 수 있다(확인 기록이 상담을 함께 만든다).
 */

export type ComposerSide = 'owner' | 'other' | 'tenant' | 'buyer';
export type ComposerType = 'phone' | 'visit' | 'online';

export interface ComposerWho {
  key: string;
  contactId: string;
  name: string;
  role: string;
  side: ComposerSide;
  matchId?: string;
  listingId?: string;
}

export interface ComposerSubmit {
  who: ComposerWho;
  type: ComposerType;
  text: string;
  alsoConfirm: boolean;
}

const typeOptions: Array<[ComposerType, string]> = [
  ['phone', '전화'],
  ['visit', '방문'],
  ['online', '문자'],
];

const sideLabel: Record<ComposerSide, string> = {
  owner: '소유자 쪽',
  other: '관련인',
  tenant: '세입자',
  buyer: '매수·임차 손님',
};

export function ComposerDock({
  options,
  canConfirm,
  nextConfirmText,
  openSignal,
  onSubmit,
  onFallback,
}: {
  options: ComposerWho[];
  /** 진행 중인 의뢰가 있어야 확인으로 남길 수 있다 */
  canConfirm: boolean;
  nextConfirmText: string | null;
  /** 값이 바뀌면 입력칸을 열고 커서를 둔다 */
  openSignal: number;
  onSubmit: (input: ComposerSubmit) => Promise<void>;
  /** 고를 연락처가 없을 때: 연락처를 고르는 상담 기록 창을 연다 */
  onFallback: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [whoKey, setWhoKey] = useState<string | null>(null);
  const [type, setType] = useState<ComposerType>('phone');
  const [text, setText] = useState('');
  const [alsoConfirm, setAlsoConfirm] = useState(true);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const who = options.find((option) => option.key === whoKey) ?? options[0] ?? null;
  const confirmable = canConfirm && who?.side === 'owner';

  // 열기를 요청받으면 입력칸이 그려진 뒤 커서를 글 끝에 둔다.
  const focusRequestRef = useRef(false);
  useEffect(() => {
    if (openSignal === 0) return;
    focusRequestRef.current = true;
    setOpen(true);
  }, [openSignal]);
  useEffect(() => {
    if (!open || !focusRequestRef.current) return;
    const node = textareaRef.current;
    if (!node) return;
    focusRequestRef.current = false;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, [open, openSignal]);

  const submit = async () => {
    const content = text.trim();
    if (!who || !content || saving) return;
    setSaving(true);
    try {
      await onSubmit({ who, type, text: content, alsoConfirm: confirmable && alsoConfirm });
      setText('');
      setOpen(false);
    } catch {
      // 오류 알림은 부르는 쪽이 띄운다. 쓴 글은 그대로 둔다.
    } finally {
      setSaving(false);
    }
  };

  if (options.length === 0) {
    return (
      <Dock>
        <div className="flex h-[34px] items-center gap-2 px-1 text-[13px] text-[#37352f]/45">
          <span className="flex-1 truncate">이 매물에 연결된 연락처가 없습니다.</span>
          <button type="button" className={nb.line} onClick={onFallback}>
            다른 연락처로 상담 기록…
          </button>
        </div>
      </Dock>
    );
  }

  if (!open) {
    return (
      <Dock>
        <button
          type="button"
          data-composer-placeholder
          onClick={() => {
            focusRequestRef.current = true;
            setOpen(true);
          }}
          className="flex h-[34px] w-full items-center gap-2.5 rounded px-1 text-left text-[14px] text-[#37352f]/45 hover:bg-[#37352f]/[0.04]"
        >
          <Avatar name="나" />
          <span className="flex-1 truncate">{text ? text : '상담 적기… 누구와 무슨 이야기를 했나요?'}</span>
          <Kbd className="text-[12px]">R</Kbd>
        </button>
      </Dock>
    );
  }

  const grouped = (['owner', 'other', 'tenant', 'buyer'] as const)
    .map((side) => ({ side, items: options.filter((option) => option.side === side) }))
    .filter((group) => group.items.length > 0);

  return (
    <Dock>
      <div className="py-1" data-composer>
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-[26px] items-center gap-1.5 rounded bg-[#2383e2]/[0.08] pl-1 pr-1.5 text-[13px] text-[rgb(29,109,191)] hover:bg-[#2383e2]/[0.14]">
              <User className="size-[13px]" />
              {who?.name}
              <small className="text-[rgb(29,109,191)]/70">{who?.role}</small>
              <ChevronDown className="size-[13px]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {grouped.map((group, index) => (
                <div key={group.side}>
                  {index > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-[11px] font-normal text-[#8a8983]">
                    {sideLabel[group.side]}
                  </DropdownMenuLabel>
                  {group.items.map((option) => (
                    <DropdownMenuItem key={option.key} onSelect={() => setWhoKey(option.key)}>
                      <span className="flex-1 truncate">{option.name}</span>
                      <span className="text-[12px] text-[#8a8983]">{option.role}</span>
                      {option.key === who?.key && <Check className="size-3.5" />}
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div role="radiogroup" aria-label="상담 방법" className="inline-flex rounded-md bg-[#37352f]/[0.06] p-0.5">
            {typeOptions.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={type === value}
                onClick={() => setType(value)}
                className={cn(
                  'h-[22px] rounded px-[9px] text-[13px] text-[#37352f]/65',
                  type === value && 'bg-white text-[#37352f] shadow-[0_1px_2px_rgba(15,15,15,0.1)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              return;
            }
            // 한글 조합 중 Enter는 글자 확정이다. 조합이 끝난 Enter만 기록한다.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="이야기한 내용을 적으세요. Enter로 기록, Shift+Enter로 줄바꿈, Esc로 닫기"
          aria-label="상담 내용"
          className="block max-h-[200px] min-h-[52px] w-full resize-none border-0 bg-transparent py-1.5 text-[14px] leading-[1.6] text-[#37352f] outline-none [field-sizing:content] placeholder:text-[#37352f]/45"
        />
        <div className="mt-1 flex items-center gap-2">
          {confirmable ? (
            <label className="inline-flex cursor-default select-none items-center gap-[7px] text-[13px] text-[#37352f]/65 hover:text-[#37352f]">
              <input
                type="checkbox"
                checked={alsoConfirm}
                onChange={(event) => setAlsoConfirm(event.target.checked)}
                className="size-3.5 accent-[#2383e2]"
              />
              매물 확인으로도 남기기
              {nextConfirmText && <span className="text-[#37352f]/45">· {nextConfirmText}</span>}
            </label>
          ) : (
            <span className="text-[13px] text-[#37352f]/45">
              {who?.side === 'owner' ? '진행 중인 의뢰가 없어 상담으로만 남습니다' : '소유자·대리인과 한 상담만 매물 확인으로 남길 수 있습니다'}
            </span>
          )}
          <span className="flex-1" />
          <button type="button" className={nb.ghost} onClick={() => setOpen(false)}>
            취소
          </button>
          <button type="button" className={nb.solid} disabled={!text.trim() || saving} onClick={() => void submit()}>
            {saving && <Loader2 className="animate-spin" />}
            기록
          </button>
        </div>
      </div>
    </Dock>
  );
}

function Dock({ children }: { children: ReactNode }) {
  return (
    <div
      data-composer-dock
      className="pointer-events-none sticky bottom-0 z-[5] bg-gradient-to-b from-white/0 via-white via-40% to-white px-9 pb-3.5 pt-[18px]"
    >
      <div className="pointer-events-auto mx-auto max-w-[828px] rounded-[10px] bg-white px-3 py-1.5 shadow-[0_0_0_1px_rgba(15,15,15,0.08),0_6px_18px_rgba(15,15,15,0.08)]">
        {children}
      </div>
    </div>
  );
}
