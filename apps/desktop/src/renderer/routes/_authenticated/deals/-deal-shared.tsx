import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Ban, ChevronDown, ChevronsUpDown, MoreVertical, Trash2, X } from 'lucide-react';
import type { Contact, Deal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/format';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
          className="inline-flex h-7 max-w-full items-center gap-1 rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          onClick={(event) => event.stopPropagation()}
        >
          <DealStagePill stage={deal.stage} />
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44" onClick={(event) => event.stopPropagation()}>
        <DealStageMenuItems deal={deal} actions={actions} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DealStageMenuItems({ deal, actions }: { deal: Deal; actions: DealRowActions }) {
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
        정산종료 처리
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
        <DropdownMenuSeparator />
        {!deal.isCancelled ? (
          <DropdownMenuItem variant="destructive" onSelect={() => actions.onRequestCancel(deal)}>
            <Ban className="size-4" />
            거래 취소
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

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', { search, limit: 8 }],
    queryFn: () => api.contacts.findAll({ search: search || undefined, limit: 8 }),
    enabled: open,
  });

  const contacts = data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
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
        </Command>
      </PopoverContent>
    </Popover>
  );
}
