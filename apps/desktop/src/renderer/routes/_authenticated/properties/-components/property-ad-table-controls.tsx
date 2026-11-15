import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, RotateCcw, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { PropertyPanelColumnHeader, panelTableMenuClass } from './property-panel-table-controls';
import { adTableColumns, adSortLabels, clampAdColumnWidth, MAX_AD_COLUMN_WIDTH, type AdTableControls, type AdTableSort } from './property-ad-table-state';

export function AdTableColumnHeader({ column, icon, ...controls }: Omit<AdTableControls, 'preferences' | 'selection'> & {
  column: (typeof adTableColumns)[number]; icon: ReactNode; sort: AdTableSort;
}) {
  return <PropertyPanelColumnHeader
    {...controls} column={column} icon={icon} columns={adTableColumns} table="ad"
    clampWidth={clampAdColumnWidth} maxWidth={MAX_AD_COLUMN_WIDTH}
    sortOptions={[{ column: column.id, label: column.label }]}
  />;
}

export function AdTableSortControl({ sort, onSort, onResetWidths }: {
  sort: AdTableSort; onSort: (sort: AdTableSort) => void; onResetWidths: () => void;
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label="광고 정렬 설정" className={cn(
        'inline-flex h-[26px] items-center gap-1 rounded-full px-2 text-xs outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring',
        sort ? 'bg-info-soft/50 text-info-strong' : 'text-muted-foreground',
      )}>
        {sort ? sort.direction === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3" />}
        {sort ? adSortLabels[sort.column] : '정렬'}<ChevronDown className="size-3" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className={panelTableMenuClass} onKeyDown={e => e.stopPropagation()}>
      <DropdownMenuLabel className="text-xs text-muted-foreground">광고 정렬</DropdownMenuLabel>
      {sort && <DropdownMenuLabel className="text-xs">{adSortLabels[sort.column]} · {sort.direction === 'asc' ? '오름차순' : '내림차순'}</DropdownMenuLabel>}
      <DropdownMenuItem onSelect={() => onSort({ column: 'startedAt', direction: 'desc' })}>
        <ArrowDown />최근 등록순{sort?.column === 'startedAt' && sort.direction === 'desc' && <Check className="ml-auto size-3.5" />}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onSort({ column: 'price', direction: 'asc' })}>
        <ArrowUp />낮은 가격순{sort?.column === 'price' && sort.direction === 'asc' && <Check className="ml-auto size-3.5" />}
      </DropdownMenuItem>
      {sort && <DropdownMenuItem onSelect={() => onSort(null)}><X />정렬 해제</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onResetWidths}><RotateCcw />모든 열 기본 너비</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
