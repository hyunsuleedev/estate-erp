import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Ban, ChevronsUpDown, MoreVertical, Trash2, X } from 'lucide-react';
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
import { dealPipelineStages, type DealRowActions } from './-deal-view-utils';

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
        <DropdownMenuLabel className="text-xs text-muted-foreground">단계 변경</DropdownMenuLabel>
        {dealPipelineStages.map((stage) => (
          <DropdownMenuItem
            key={stage}
            disabled={stage === deal.stage}
            onSelect={() => actions.onRequestStage(deal, stage)}
            className={cn(stage === deal.stage && 'font-medium text-foreground')}
          >
            {getStatusMeta('dealStage', stage).label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={deal.stage === 'closed'}
          onSelect={() => actions.onRequestStage(deal, 'closed')}
        >
          <Archive className="size-4" />
          정산종료 처리
        </DropdownMenuItem>
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
    <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
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
