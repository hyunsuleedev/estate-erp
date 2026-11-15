import { createContext, useContext, type ComponentProps } from 'react';
import { useCellTableNavigation } from '@/components/data-table/cell-navigation';
import { cn } from '@/lib/utils';

const ListingCellContext = createContext<{
  rowId: string;
  columnId: string;
  rowIndex: number;
  columnIndex: number;
  selectedListingId?: string;
} | null>(null);

export const PropertyListingCellProvider = ListingCellContext.Provider;

/** Full-width selection surface, including non-editable placeholders such as rent "-". */
export function PropertyListingCell({
  listingId,
  className,
  children,
  ...props
}: ComponentProps<'div'> & { listingId: string }) {
  const cell = useContext(ListingCellContext);
  const navigation = useCellTableNavigation();
  const selected = cell?.selectedListingId === listingId;
  return (
    <div
      {...props}
      data-listing-cell-id={listingId}
      data-property-row-id={cell?.rowId}
      data-column-id={cell?.columnId}
      data-table-row={cell?.rowIndex}
      data-table-col={cell?.columnIndex}
      data-cell-selected={selected || undefined}
      className={cn(className, 'relative', selected && 'bg-blue-50/40 outline outline-2 -outline-offset-2 outline-[#2383e2]')}
      onClick={(event) => {
        event.stopPropagation();
        navigation?.select(event.currentTarget, true);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
