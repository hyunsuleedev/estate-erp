import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Ban, ChevronsUpDown, MoreVertical, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Contact, Deal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/format';
import {
  formatPhoneWhileTyping,
  phoneDigits,
  phoneInputProblem,
  useExistingContactByPhone,
} from '@/lib/phone';
import { useAuth } from '@/providers/auth-provider';
import { describeManwon, formatManwonEcho, MANWON_INPUT_HINT, parseManwon } from '@/lib/manwon';
import { getStatusMeta } from '@/lib/status-config';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  dealPipelineStages,
  getDealDisplayGroupKey,
  type DealDisplayGroupKey,
  type DealRowActions,
} from './-deal-view-utils';

/**
 * 단계별 색. Notion 색 체계를 그대로 따른다 (Notion 앱 번들의 색 눈금에서 확인).
 * 색마다 눈금이 있고 자리마다 쓰는 단계가 정해져 있다:
 *   열 바탕 = 반투명 10 · 추가 버튼 선 = 반투명 20 · 건수 = 불투명 80
 * 단계 칩의 색은 여기가 아니라 아래 DEAL_STAGE_CHIP이 정한다.
 * 열 위에서 버튼에 올렸을 때의 바탕은 열 바탕을 5% 어둡게 한 값이다.
 */
export const DEAL_GROUP_TONE: Record<
  DealDisplayGroupKey,
  { surface: string; count: string; line: string }
> = {
  // 회색
  preparing: {
    surface: 'bg-[rgba(66,35,3,0.031)]',
    line: 'shadow-[0_0_0_1px_rgba(42,28,0,0.07)]',
    count: 'text-[#5f5e59]',
  },
  // 파랑
  preContract: {
    surface: 'bg-[rgba(0,128,213,0.047)]',
    line: 'shadow-[0_0_0_1px_rgba(0,124,215,0.094)]',
    count: 'text-[#2783de]',
  },
  // 보라
  contracted: {
    surface: 'bg-[rgba(98,3,161,0.031)]',
    line: 'shadow-[0_0_0_1px_rgba(102,0,178,0.078)]',
    count: 'text-[#b577d6]',
  },
  // 주황
  settling: {
    surface: 'bg-[rgba(186,72,3,0.043)]',
    line: 'shadow-[0_0_0_1px_rgba(224,101,1,0.129)]',
    count: 'text-[#d5803b]',
  },
  // 초록
  completed: {
    surface: 'bg-[rgba(3,87,31,0.035)]',
    line: 'shadow-[0_0_0_1px_rgba(0,100,45,0.09)]',
    count: 'text-[#46a171]',
  },
  closed: {
    surface: 'bg-[rgba(66,35,3,0.031)]',
    line: 'shadow-[0_0_0_1px_rgba(42,28,0,0.07)]',
    count: 'text-[#5f5e59]',
  },
};

/**
 * 단계 칩 색. 매물관리 표의 매물상태 칩(listingAvailabilityMeta)과 같은 팔레트다:
 * 옅은 불투명 바탕 + 같은 계열의 글자 + 점. 보라·주황은 그 팔레트에 없어 같은 농도로 맞췄다.
 */
const DEAL_STAGE_CHIP: Record<DealDisplayGroupKey, { pill: string; dot: string }> = {
  preparing: { pill: 'bg-[#f1f1ef] text-[#787774]', dot: 'bg-[#b4b4b1]' },
  preContract: { pill: 'bg-[#e7f3f8] text-[#337ea9]', dot: 'bg-[#529cca]' },
  contracted: { pill: 'bg-[#f3eef8] text-[#7a5a9e]', dot: 'bg-[#9a6dd7]' },
  // 노랑은 매물관리에서 '보류'라 쓰지 않는다. 보드 열 바탕(주황)과도 맞춘다.
  settling: { pill: 'bg-[#faebdd] text-[#b5621b]', dot: 'bg-[#d9730d]' },
  completed: { pill: 'bg-[#eef3ed] text-[#44745a]', dot: 'bg-[#6c9b7a]' },
  closed: { pill: 'bg-[#f1f1ef] text-[#787774]', dot: 'bg-[#b4b4b1]' },
};

/** 단계 칩: 매물관리의 매물상태 칩과 같은 모양 (점 + 이름, 높이 20px, 둥근 알약). */
export function DealStagePill({
  stage,
  label,
  className,
}: {
  stage: string;
  /** 생략하면 단계 이름을 쓴다 */
  label?: string;
  className?: string;
}) {
  const chip = DEAL_STAGE_CHIP[getDealDisplayGroupKey(stage)];
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full shrink-0 items-center gap-[5px] rounded-full pl-[7px] pr-[9px] text-[14px] font-[450] leading-5',
        chip.pill,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', chip.dot)} />
      <span className="truncate">{label ?? getStatusMeta('dealStage', stage).label}</span>
    </span>
  );
}

/** 목록의 단계 셀에서도 기존 단계 변경 확인 흐름을 사용한다. */
export function DealStageMenu({ deal, actions, title }: {
  deal: Deal;
  actions: DealRowActions;
  title: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${title} 단계 변경`}
          disabled={actions.isUpdating}
          className="inline-flex h-7 max-w-full cursor-pointer items-center rounded-full hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          onClick={(event) => event.stopPropagation()}
        >
          <DealStagePill stage={deal.stage} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44" onClick={(event) => event.stopPropagation()}>
        <DealStageMenuItems deal={deal} actions={actions} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DealStageMenuItems({ deal, actions }: { deal: Deal; actions: DealRowActions }) {
  // 취소된 거래는 단계를 바꿀 수 없다 (서버도 막는다). 되살린 뒤에 바꾼다.
  if (deal.isCancelled) return null;
  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">단계 변경</DropdownMenuLabel>
      {dealPipelineStages.map((stage) => (
        <DropdownMenuItem
          key={stage}
          disabled={stage === deal.stage || actions.isUpdating}
          onSelect={() => actions.onRequestStage(deal, stage)}
        >
          <DealStagePill stage={stage} />
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={deal.stage === 'closed' || actions.isUpdating}
        onSelect={() => actions.onRequestStage(deal, 'closed')}
      >
        <Archive className="size-4" />
        정산 종료 처리
      </DropdownMenuItem>
    </>
  );
}

/**
 * 거래 행/카드 공용 액션 메뉴 — 단계 변경(확인 다이얼로그는 페이지 레벨에서),
 * 거래 종료 / 취소 / 삭제.
 */
export function DealActionsMenu({
  deal,
  actions,
}: {
  deal: Deal;
  actions: DealRowActions;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={actions.isUpdating}
          aria-label="거래 액션"
        >
          <MoreVertical className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DealStageMenuItems deal={deal} actions={actions} />
        {!deal.isCancelled ? <DropdownMenuSeparator /> : null}
        {!deal.isCancelled ? (
          <DropdownMenuItem variant="destructive" onSelect={() => actions.onRequestCancel(deal)}>
            <Ban className="size-4" />
            거래 취소
          </DropdownMenuItem>
        ) : actions.onRequestRestore ? (
          <DropdownMenuItem onSelect={() => actions.onRequestRestore?.(deal)}>
            <RotateCcw className="size-4" />
            거래 되살리기
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem variant="destructive" onSelect={() => actions.onRequestDelete(deal)}>
          <Trash2 className="size-4" />
          삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    // 상세 패널의 구역 제목과 같은 모양 (매물 상세 패널의 SectionTitle)
    <div className="text-[13px] font-semibold text-[#2f2e2a]">
      {children}
    </div>
  );
}

/**
 * 연락처 검색 선택 콤보박스 (서버 검색).
 * 거래 생성/계약서 생성 다이얼로그에서 매수·매도 당사자 선택에 사용.
 */
export function ContactPicker({
  value,
  onChange,
  placeholder = '이름·전화번호 검색',
}: {
  value: Contact | null;
  onChange: (contact: Contact | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // 찾는 사람이 아직 연락처에 없을 때: 창을 떠나지 않고 이 자리에서 등록한다
  // (예전에는 연락처 화면에 다녀와야 해서 거래·계약서 창에 적던 것이 사라졌다).
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const queryClient = useQueryClient();
  const existingByPhone = useExistingContactByPhone(newPhone, { enabled: adding });

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', { search, limit: 8 }],
    queryFn: () => api.contacts.findAll({ search: search || undefined, limit: 8 }),
    enabled: open,
  });

  const contacts = data?.items ?? [];
  const trimmedSearch = search.trim();
  const startAdding = () => {
    // 검색한 글이 번호면 번호 칸에, 아니면 이름 칸에 옮겨 둔다
    const digits = phoneDigits(trimmedSearch);
    const looksLikePhone = digits.length >= 7 && /^[\d\s\-()+]+$/.test(trimmedSearch);
    setNewName(looksLikePhone ? '' : trimmedSearch);
    setNewPhone(looksLikePhone ? formatPhoneWhileTyping(trimmedSearch) : '');
    setAdding(true);
  };
  const newPhoneProblem = phoneInputProblem(newPhone);
  const createMutation = useMutation({
    mutationFn: () =>
      api.contacts.create({ name: newName.trim(), phone: newPhone.trim() || undefined }),
    onSuccess: (contact) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      onChange(contact);
      setAdding(false);
      setOpen(false);
      setSearch('');
      toast.success(`${contact.name}님을 연락처에 등록했습니다.`);
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, '연락처를 등록하지 못했습니다. 다시 시도해 주세요.')),
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setAdding(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal"
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{value.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatPhone(value.phone)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <span className="flex shrink-0 items-center gap-0.5">
            {value ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="선택 해제"
                className="rounded p-0.5 hover:bg-muted"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.stopPropagation();
                    onChange(null);
                  }
                }}
              >
                <X className="size-3.5 text-muted-foreground" />
              </span>
            ) : null}
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
        {adding ? (
          <div className="grid gap-1.5 p-2.5">
            <p className="text-[12px] font-medium text-muted-foreground">새 고객 등록</p>
            <Input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="이름"
              aria-label="새 고객 이름"
            />
            <Input
              value={newPhone}
              onChange={(event) => setNewPhone(formatPhoneWhileTyping(event.target.value))}
              placeholder="전화번호 (선택)"
              aria-label="새 고객 전화번호"
              aria-invalid={Boolean(newPhoneProblem) || undefined}
              inputMode="tel"
            />
            {newPhoneProblem ? <p className="text-[12px] text-destructive">{newPhoneProblem}</p> : null}
            {existingByPhone.contact ? (
              <p className="text-[12px] text-warning">
                {existingByPhone.message}{' '}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => {
                    onChange(existingByPhone.contact);
                    setAdding(false);
                    setOpen(false);
                  }}
                >
                  그 고객으로 고르기
                </button>
              </p>
            ) : null}
            <div className="flex justify-end gap-1.5 pt-0.5">
              <Button type="button" variant="ghost" size="xs" onClick={() => setAdding(false)}>
                취소
              </Button>
              <Button
                type="button"
                size="xs"
                disabled={
                  !newName.trim() ||
                  Boolean(newPhoneProblem) ||
                  Boolean(existingByPhone.contact) ||
                  createMutation.isPending
                }
                onClick={() => {
                  if (!createMutation.isPending) createMutation.mutate();
                }}
              >
                등록
              </Button>
            </div>
          </div>
        ) : (
          <Command shouldFilter={false}>
            <CommandInput value={search} onValueChange={setSearch} placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>{isLoading ? '검색 중...' : '검색 결과가 없습니다.'}</CommandEmpty>
              {contacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={contact.id}
                  onSelect={() => {
                    onChange(contact);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{contact.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{formatPhone(contact.phone)}</span>
                </CommandItem>
              ))}
            </CommandList>
            {trimmedSearch && !isLoading ? (
              <button
                type="button"
                className="flex w-full items-center gap-1.5 border-t px-3 py-2 text-left text-[13px] hover:bg-muted"
                onClick={startAdding}
              >
                <Plus className="size-3.5 text-muted-foreground" />
                <span className="truncate">‘{trimmedSearch}’ 새 고객으로 등록</span>
              </button>
            ) : null}
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * 만원 금액 입력. "15억 8천"·"9억5천만"·"158,000"처럼 말하듯 적어도 받고(앱 공통 규칙 lib/manwon.ts),
 * 아래에 "= 15억 8,000만"으로 읽어 준다. 바깥에는 예전처럼 숫자만 든 글자(만원)를 넘긴다.
 * 읽을 수 없는 글이면 ""를 넘기고 "금액을 읽을 수 없습니다"를 보인다.
 */
export function ManwonInput({
  value,
  onChange,
  placeholder,
  invalid,
  id,
  ariaLabel,
}: {
  /** 숫자만 든 글자 (예: "198000"). 비면 "" */
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  invalid?: boolean;
  id?: string;
  ariaLabel?: string;
}) {
  const toText = (digits: string) => (digits ? Number(digits).toLocaleString('ko-KR') : '');
  const [text, setText] = useState(() => toText(value));
  // 바깥에서 값이 바뀌면(초기화·다른 거래 열기) 적힌 글을 맞춘다. 내가 넘긴 값이면 적은 글을 그대로 둔다.
  const parsed = parseManwon(text);
  const current = parsed.valid && parsed.value !== null ? String(parsed.value) : '';
  if (current !== value && !(value === '' && !parsed.valid)) {
    setText(toText(value));
  }
  const echo = describeManwon(text);
  const unreadable = echo.invalid;
  return (
    <div className="grid gap-1">
      <div className="relative">
        <Input
          id={id}
          aria-label={ariaLabel}
          autoComplete="off"
          aria-invalid={invalid || unreadable || undefined}
          value={text}
          placeholder={placeholder ?? MANWON_INPUT_HINT}
          className="pr-12 tabular-nums"
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const result = parseManwon(next);
            onChange(result.valid && result.value !== null ? String(result.value) : '');
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          만원
        </span>
      </div>
      {unreadable ? (
        <p className="text-xs text-destructive-strong">{echo.text} — {MANWON_INPUT_HINT}</p>
      ) : parsed.valid && parsed.value ? (
        <p className="text-xs tabular-nums text-muted-foreground">{formatManwonEcho(parsed.value)}</p>
      ) : null}
    </div>
  );
}

function toDateInput(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * 저장된 날짜(ISO)를 날짜 칸 값(YYYY-MM-DD)으로. 글자를 잘라 쓰면 UTC 날짜가 나와
 * 한국 시간 자정에 저장된 날짜가 하루 앞당겨 보이므로, 이 컴퓨터의 시간대로 읽는다.
 */
export function isoToDateInput(iso: string | null | undefined) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : toDateInput(date);
}

/** n개월 뒤 같은 날. 그 달에 같은 날이 없으면(1/31 → 2월) 그 달의 마지막 날. */
export function addMonthsInput(base: Date, months: number) {
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(base.getDate(), lastDay));
  return toDateInput(target);
}

/** 날짜 입력 + 자주 쓰는 날 단추 (오늘, 1·2·3개월 뒤). 기준일을 주면 그날부터 센다. */
export function DateQuickInput({
  value,
  onChange,
  baseDate,
  baseLabel,
  id,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  /** 개월 수를 셀 기준일 (예: 계약일). 없으면 오늘. */
  baseDate?: string | null;
  /** 기준일의 이름 (단추 설명에 쓴다) */
  baseLabel?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const base = baseDate ? new Date(`${isoToDateInput(baseDate) || baseDate.slice(0, 10)}T00:00:00`) : new Date();
  const validBase = Number.isNaN(base.getTime()) ? new Date() : base;
  const presets = [
    { label: '오늘', value: toDateInput(new Date()) },
    ...[1, 2, 3].map((months) => ({
      label: `${baseDate && baseLabel ? `${baseLabel} ` : ''}${months}개월 뒤`,
      value: addMonthsInput(validBase, months),
    })),
  ];
  return (
    <div className="grid gap-1.5">
      <Input id={id} aria-label={ariaLabel} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={cn(
              'h-6 rounded-full border px-2 text-[11.5px] text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground',
              value === preset.value && 'border-foreground/30 text-foreground',
            )}
            onClick={() => onChange(preset.value)}
          >
            {preset.label}
          </button>
        ))}
        {value ? (
          <button
            type="button"
            className="h-6 rounded-full px-2 text-[11.5px] text-muted-foreground hover:text-foreground"
            onClick={() => onChange('')}
          >
            비우기
          </button>
        ) : null}
      </div>
    </div>
  );
}

const NEW_PARTNER_VALUE = '__new_partner__';

/** 공동중개 상대 중개사 고르기. 목록에 없으면 이름·전화만 적어 바로 추가한다. */
export function PartnerBrokerSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (partnerBrokerId: string) => void;
}) {
  const queryClient = useQueryClient();
  const partnersQuery = useQuery({
    queryKey: ['partner-brokers'],
    queryFn: () => api.partnerBrokers.list(),
  });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const createMutation = useMutation({
    mutationFn: () =>
      api.partnerBrokers.create({ name: name.trim(), phone: phone.trim() || undefined }),
    onSuccess: (partner) => {
      queryClient.setQueryData<Array<typeof partner>>(['partner-brokers'], (previous) => [
        ...(previous ?? []).filter((item) => item.id !== partner.id),
        partner,
      ]);
      void queryClient.invalidateQueries({ queryKey: ['partner-brokers'] });
      onChange(partner.id);
      setAdding(false);
      setName('');
      setPhone('');
      toast.success(`'${partner.name}'을(를) 파트너 중개사로 추가했습니다.`);
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, '파트너를 추가하지 못했습니다. 다시 시도해 주세요.')),
  });

  const phoneProblem = phoneInputProblem(phone);
  const typedDigits = phoneDigits(phone);
  // 같은 번호의 파트너가 이미 있으면 새로 만들지 않고 고르게 한다
  const samePhonePartner =
    typedDigits.length >= 7
      ? (partnersQuery.data ?? []).find((partner) => phoneDigits(partner.phone ?? '') === typedDigits) ?? null
      : null;

  if (adding) {
    return (
      <div className="grid gap-1.5">
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="사무소 이름"
          aria-label="새 파트너 사무소 이름"
        />
        <Input
          value={phone}
          onChange={(event) => setPhone(formatPhoneWhileTyping(event.target.value))}
          placeholder="전화번호 (선택)"
          aria-label="새 파트너 전화번호"
          aria-invalid={Boolean(phoneProblem) || undefined}
          inputMode="tel"
        />
        {phoneProblem ? <p className="text-[12px] text-destructive">{phoneProblem}</p> : null}
        {samePhonePartner ? (
          <p className="text-[12px] text-warning">
            같은 번호의 파트너가 있습니다: {samePhonePartner.name}{' '}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                onChange(samePhonePartner.id);
                setAdding(false);
                setName('');
                setPhone('');
              }}
            >
              그 파트너로 고르기
            </button>
          </p>
        ) : null}
        <div className="flex justify-end gap-1.5">
          <Button type="button" variant="ghost" size="xs" onClick={() => setAdding(false)}>
            취소
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={!name.trim() || Boolean(phoneProblem) || createMutation.isPending}
            onClick={() => {
              if (!createMutation.isPending) createMutation.mutate();
            }}
          >
            추가
          </Button>
        </div>
      </div>
    );
  }

  const partners = partnersQuery.data ?? [];
  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => {
        if (next === NEW_PARTNER_VALUE) setAdding(true);
        else onChange(next);
      }}
    >
      <SelectTrigger className="w-full" aria-label="파트너 중개사">
        <SelectValue
          placeholder={
            partnersQuery.isLoading
              ? '불러오는 중...'
              : partners.length === 0
                ? '새 파트너 적기'
                : '파트너 선택'
          }
        />
      </SelectTrigger>
      <SelectContent>
        {partners.map((partner) => (
          <SelectItem key={partner.id} value={partner.id}>
            {partner.name}
          </SelectItem>
        ))}
        {partners.length > 0 ? <SelectSeparator /> : null}
        <SelectItem value={NEW_PARTNER_VALUE}>+ 새 파트너 적기</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * 거래 담당 고르기. 대표·매니저만 다른 직원을 고를 수 있고, 중개사에게는 "나"로 보인다.
 * 거래를 만들 때 비워 두면 서버가 만든 사람을 담당으로 넣는다.
 */
export function AssigneeSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const canChoose = user?.role === 'owner' || user?.role === 'manager';
  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
    enabled: canChoose,
  });
  if (!canChoose) {
    return (
      <p className="flex h-9 items-center text-sm text-muted-foreground">
        나 ({user?.name ?? '내 계정'})
      </p>
    );
  }
  const employees = (employeesQuery.data ?? []).filter((employee) => employee.isActive);
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full" aria-label="담당 직원">
        <SelectValue placeholder={employeesQuery.isLoading ? '불러오는 중...' : '담당 고르기'} />
      </SelectTrigger>
      <SelectContent>
        {employees.map((employee) => (
          <SelectItem key={employee.id} value={employee.id}>
            {employee.name}
            {employee.id === user?.id ? ' (나)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
