import type { SortingState } from '@tanstack/react-table';
import { useRef, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Columns3, EyeOff, ListFilter, Pin, PinOff, RotateCcw, WrapText, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export const propertyTableColumns = [
  { field: 'info', label: '거래' },
  { field: 'site', label: '단지' },
  { field: 'dong', label: '동' },
  { field: 'unit', label: '호' },
  { field: 'supplyArea', label: '공급' },
  { field: 'unitType', label: '타입' },
  { field: 'matching', label: '매칭' },
  { field: 'advertisement', label: '광고' },
  { field: 'confirmationAt', label: '확인' },
  { field: 'listingAvailability', label: '매물상태' },
  { field: 'price', label: '가격/보증금' },
  { field: 'monthlyRent', label: '월세' },
  { field: 'loanAmount', label: '융자금' },
  { field: 'moveInAvailable', label: '입주가능일' },
  { field: 'memo', label: '의뢰 메모' },
  { field: 'updatedAt', label: '수정' },
];

export const propertyDetailColumnIds = ['unitType', 'matching', 'advertisement', 'confirmationAt'];

export function PropertyColumnMenu({
  id, children, sorted, onSort, onFilter, pinned, onPin, onUnpin, onHide, wrapped, onWrap,
}: {
  id: string;
  children: ReactNode;
  sorted: false | 'asc' | 'desc';
  onSort?: (direction: 'asc' | 'desc' | null) => void;
  onFilter?: () => void;
  pinned: boolean;
  onPin: () => void;
  onUnpin: () => void;
  onHide?: () => void;
  wrapped?: boolean;
  onWrap?: () => void;
}) {
  const pendingFilter = useRef<(() => void) | null>(null);
  const label = propertyTableColumns.find(({ field }) => field === id)?.label ?? id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label} 열 메뉴`}
          // 머리글 칸 전체가 버튼이다. 칸(th)이 relative라서 칸을 가득 채운다.
          className="absolute inset-0 flex min-w-0 items-center gap-1 px-2.5 text-left outline-none transition-colors hover:bg-[#f6f5f3] hover:text-[#2c2c2b] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2383e2]/50 data-[state=open]:bg-[#f6f5f3] data-[state=open]:text-[#2c2c2b]"
        >
          {children}
          {sorted && (sorted === 'asc' ? <ArrowUp aria-hidden="true" className="size-3 shrink-0 text-[#2383e2]" /> : <ArrowDown aria-hidden="true" className="size-3 shrink-0 text-[#2383e2]" />)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56"
        onCloseAutoFocus={(event) => {
          if (!pendingFilter.current) return;
          event.preventDefault();
          const openFilter = pendingFilter.current;
          pendingFilter.current = null;
          openFilter();
        }}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
        {onSort && <>
          <DropdownMenuItem onSelect={() => onSort('asc')}><ArrowUp />오름차순 정렬{sorted === 'asc' && <Check className="ml-auto size-3.5" />}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSort('desc')}><ArrowDown />내림차순 정렬{sorted === 'desc' && <Check className="ml-auto size-3.5" />}</DropdownMenuItem>
          {sorted && <DropdownMenuItem onSelect={() => onSort(null)}><X />정렬 해제</DropdownMenuItem>}
        </>}
        {onFilter && <DropdownMenuItem onSelect={() => { pendingFilter.current = onFilter; }}><ListFilter />필터</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onPin}><Pin />이 열까지 고정</DropdownMenuItem>
        {pinned && <DropdownMenuItem onSelect={onUnpin}><PinOff />모든 열 고정 해제</DropdownMenuItem>}
        {onWrap && <DropdownMenuCheckboxItem checked={wrapped} onCheckedChange={onWrap}><WrapText />내용 줄바꿈</DropdownMenuCheckboxItem>}
        {onHide && <DropdownMenuItem onSelect={onHide}><EyeOff />열 숨기기</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PropertyColumnSettings({
  isVisible,
  onVisibilityChange,
  onReset,
}: {
  isVisible: (id: string) => boolean;
  onVisibilityChange: (id: string, visible: boolean) => void;
  onReset: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="컬럼 설정"
          title="컬럼 설정"
          className="-ml-2 inline-flex size-[30px] shrink-0 items-center justify-center rounded-full text-[#6f6c66] hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 data-[state=open]:bg-[rgba(60,52,40,0.06)]"
        >
          <Columns3 className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">표에 표시할 열</DropdownMenuLabel>
        {propertyTableColumns.map(({ field, label }) => (
          <DropdownMenuCheckboxItem
            key={field}
            checked={isVisible(field)}
            disabled={field === 'site'}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => onVisibilityChange(field, checked === true)}
            className="py-1 text-[13px]"
          >
            {label}
            {field === 'site' && <span className="ml-auto text-xs text-muted-foreground">기준 열</span>}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onReset}><RotateCcw />기본 표시로 되돌리기</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PropertySortControl({ sorting, onChange }: {
  sorting: SortingState;
  onChange: (sorting: SortingState) => void;
}) {
  const active = sorting[0];
  const label = propertyTableColumns.find(({ field }) => field === active?.id)?.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={active ? `정렬: ${label} ${active.desc ? '내림차순' : '오름차순'}` : '정렬 설정'}
          title="정렬 설정"
          className={cn(
            '-ml-2 inline-flex size-[30px] shrink-0 items-center justify-center rounded-md hover:bg-[rgba(55,53,47,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35',
            active ? 'bg-[#edf5fc] text-[#2383e2]' : 'text-[#6f6c66]',
          )}
        >
          {active ? (active.desc ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />) : <ArrowUpDown className="size-3.5" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">정렬</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>정렬 기준<span className="ml-auto text-xs text-muted-foreground">{label ?? '선택'}</span></DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-96 overflow-y-auto">
            {propertyTableColumns.map(({ field, label: fieldLabel }) => (
              <DropdownMenuItem key={field} onSelect={() => onChange([{ id: field, desc: active?.desc ?? false }])}>
                <span className="flex-1">{fieldLabel}</span>{active?.id === field && <Check className="size-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={active.desc ? 'desc' : 'asc'} onValueChange={(direction) => onChange([{ id: active.id, desc: direction === 'desc' }])}>
              <DropdownMenuRadioItem value="asc"><ArrowUp />오름차순</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc"><ArrowDown />내림차순</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}><X />정렬 해제</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
