import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
  createContext,
  useContext,
} from 'react';
import { createPortal } from 'react-dom';
import type { DateRange } from 'react-day-picker';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';


// ── Cell Edit Context (Twenty-inspired draft pattern) ───────────
// Portal-based editing prevents table reflow.
// Draft value is separate from persisted value.

interface CellEditContextType {
  getEditingCell: () => { recordId: string; field: string } | null;
  subscribe: (listener: () => void) => () => void;
  startEdit: (recordId: string, field: string) => void;
  stopEdit: () => void;
}

const CellEditContext = createContext<CellEditContextType>({
  getEditingCell: () => null,
  subscribe: () => () => undefined,
  startEdit: () => undefined,
  stopEdit: () => undefined,
});

export function CellEditProvider({ children }: { children: React.ReactNode }) {
  const editingCellRef = useRef<{ recordId: string; field: string } | null>(null);
  const listenersRef = useRef(new Set<() => void>());

  const notify = useCallback(() => {
    for (const listener of listenersRef.current) {
      listener();
    }
  }, []);

  const startEdit = useCallback((recordId: string, field: string) => {
    const current = editingCellRef.current;
    if (current?.recordId === recordId && current.field === field) return;
    editingCellRef.current = { recordId, field };
    notify();
  }, [notify]);

  const stopEdit = useCallback(() => {
    if (editingCellRef.current === null) return;
    editingCellRef.current = null;
    notify();
  }, [notify]);

  const value = useMemo<CellEditContextType>(
    () => ({
      getEditingCell: () => editingCellRef.current,
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      startEdit,
      stopEdit,
    }),
    [startEdit, stopEdit],
  );

  return (
    <CellEditContext.Provider value={value}>
      {children}
    </CellEditContext.Provider>
  );
}

export function useCellEdit() {
  return useContext(CellEditContext);
}

// ── Editable Cell Wrapper ───────────────────────────────────────
// Wraps a display component. Double-click to enter edit mode.
// Edit UI renders in a portal overlay (Twenty pattern).

export interface ChipOption {
  label: string;
  value: string;
  className?: string;
  /** When set, picking this option transitions the popover into a date picker.
   *  - 'date'  → single date, saved into `fromField`
   *  - 'range' → date range, saved into `fromField` + `toField` */
  picker?: 'date' | 'range';
  /** Date field name (single-date or range start). */
  fromField?: string;
  /** Range end field name. Required when picker='range'. */
  toField?: string;
  /** Optional preselect callback. Receives the cell's full record value
   *  (when callers pass it via `value`); returns the date(s) to preselect. */
  getPreselect?: (rowValue: unknown) =>
    | Date
    | undefined
    | { from?: Date; to?: Date };
}

export interface DateWrite {
  field: string;
  value: string;
}

export interface ChipSavePayload {
  type: string;
  dateWrites?: DateWrite[];
}

interface EditableCellProps {
  recordId: string;
  field: string;
  value: unknown;
  onSave: (recordId: string, field: string, value: unknown) => void;
  /** Optional richer save callback for select-chip cells that may also save dates. */
  onChipSave?: (recordId: string, payload: ChipSavePayload) => void;
  editType: 'text' | 'number' | 'select' | 'select-chip';
  selectOptions?: { label: string; value: string }[];
  chipOptions?: ChipOption[];
  /** For select-chip: extracts the currently-selected option value from the cell's `value`.
   *  Useful when `value` is the full record (so chip pickers can preselect dates). */
  chipValueOf?: (value: unknown) => string | undefined;
  activation?: 'click' | 'doubleClick';
  portalAnchor?: 'self' | 'tableCell';
  hoverHighlight?: boolean;
  children: React.ReactNode;
}

export function EditableCell({
  recordId,
  field,
  value,
  onSave,
  onChipSave,
  editType,
  selectOptions,
  chipOptions,
  chipValueOf,
  activation = 'click',
  portalAnchor = 'self',
  hoverHighlight = true,
  children,
}: EditableCellProps) {
  const { getEditingCell, subscribe, startEdit, stopEdit } = useCellEdit();
  const cellRef = useRef<HTMLDivElement>(null);
  const isEditing = useSyncExternalStore(
    subscribe,
    () => {
      const editingCell = getEditingCell();
      return editingCell?.recordId === recordId && editingCell?.field === field;
    },
    () => false,
  );
  const anchorEl =
    portalAnchor === 'tableCell'
      ? cellRef.current?.closest<HTMLElement>('td') ?? cellRef.current
      : cellRef.current;

  return (
    <div
      ref={cellRef}
      className={cn(
        'relative flex h-full min-h-[24px] w-full cursor-text items-center rounded-sm transition-colors',
        hoverHighlight && !isEditing && 'hover:bg-muted/50',
        isEditing && editType !== 'select-chip' && 'bg-white',
      )}
      onClick={(event) => {
        event.stopPropagation();
        if (activation !== 'click' || isEditing) return;
        startEdit(recordId, field);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (activation !== 'doubleClick' || isEditing) return;
        startEdit(recordId, field);
      }}
    >
      {/* Display mode */}
      {children}

      {/* Edit mode — portal overlay */}
      {isEditing && anchorEl && (
        <CellEditPortal
          anchorEl={anchorEl}
          value={value}
          chipValueOf={chipValueOf}
          editType={editType}
          selectOptions={selectOptions}
          chipOptions={chipOptions}
          onSave={(newValue) => {
            onSave(recordId, field, newValue);
            stopEdit();
          }}
          onChipSave={(payload) => {
            if (onChipSave) {
              onChipSave(recordId, payload);
            } else {
              onSave(recordId, field, payload.type);
            }
            stopEdit();
          }}
          onCancel={stopEdit}
        />
      )}
    </div>
  );
}

// ── Cell Edit Portal ────────────────────────────────────────────
// Renders the edit input as a portal positioned over the cell.
// Prevents table layout reflow (Twenty pattern).

interface CellEditPortalProps {
  anchorEl: HTMLElement;
  value: unknown;
  chipValueOf?: (value: unknown) => string | undefined;
  editType: 'text' | 'number' | 'select' | 'select-chip';
  selectOptions?: { label: string; value: string }[];
  chipOptions?: ChipOption[];
  onSave: (value: unknown) => void;
  onChipSave?: (payload: ChipSavePayload) => void;
  onCancel: () => void;
}

function formatLocalDate(d: Date): string {
  // Save as midnight UTC of the local Y-M-D the user picked.
  // Building from local Y/M/D avoids the timezone shift you'd get from d.toISOString()
  // when the user is east of UTC and picks late evening (which would roll back a day).
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

function CellEditPortal({
  anchorEl,
  value,
  chipValueOf,
  editType,
  selectOptions,
  chipOptions,
  onSave,
  onChipSave,
  onCancel,
}: CellEditPortalProps) {
  const initialDraft =
    editType === 'select-chip' ? (chipValueOf?.(value) ?? '') : String(value ?? '');
  const [draft, setDraft] = useState(initialDraft);
  const [pendingDateOption, setPendingDateOption] = useState<ChipOption | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState(() => {
    const initialRect = anchorEl.getBoundingClientRect();
    return {
      top: initialRect.top,
      bottom: initialRect.bottom,
      left: initialRect.left,
      width: initialRect.width,
      height: initialRect.height,
    };
  });

  useEffect(() => {
    let animationFrame: number | null = null;

    const readRect = () => {
      animationFrame = null;
      if (!anchorEl.isConnected) {
        onCancel();
        return;
      }

      const nextRect = anchorEl.getBoundingClientRect();
      setRect((current) => {
        if (
          current.top === nextRect.top &&
          current.bottom === nextRect.bottom &&
          current.left === nextRect.left &&
          current.width === nextRect.width &&
          current.height === nextRect.height
        ) {
          return current;
        }

        return {
          top: nextRect.top,
          bottom: nextRect.bottom,
          left: nextRect.left,
          width: nextRect.width,
          height: nextRect.height,
        };
      });
    };

    const scheduleRead = () => {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(readRect);
    };

    window.addEventListener('scroll', scheduleRead, true);
    window.addEventListener('resize', scheduleRead);

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener('scroll', scheduleRead, true);
      window.removeEventListener('resize', scheduleRead);
    };
  }, [anchorEl, onCancel]);

  // Preselect for date/range pickers, derived from the cell's value via getPreselect.
  const preselect = pendingDateOption?.getPreselect?.(value);
  const pendingSingleDate =
    pendingDateOption?.picker === 'date' && preselect instanceof Date ? preselect : undefined;
  const initialRange: DateRange | undefined =
    pendingDateOption?.picker === 'range' && preselect && !(preselect instanceof Date) && preselect.from
      ? { from: preselect.from, to: preselect.to }
      : undefined;
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(initialRange);
  const pendingRangeDefaultMonth = initialRange?.from ?? new Date();

  // Auto-focus on mount (skip for select/chip — has its own focus management)
  useEffect(() => {
    if (editType === 'select' || editType === 'select-chip') return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editType]);

  // Close on click outside (consider portal popover too)
  const popoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorEl.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorEl, onCancel]);

  // Close on Escape (handles select-chip where input isn't focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const commitDraft = () => {
    const finalValue = editType === 'number' ? Number(draft) : draft;
    onSave(finalValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;

    if (e.key === 'Enter' || e.key === 'NumpadEnter') {
      e.preventDefault();
      e.stopPropagation();
      commitDraft();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      commitDraft();
      // TODO: move to next cell
    }
  };

  const portalContent = (
    <>
      {editType !== 'select-chip' && (
        <div
          ref={popoverRef}
          className="fixed z-50 overflow-hidden rounded-none bg-background outline outline-2 -outline-offset-1 outline-[#2383e2]"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            minHeight: rect.height,
          }}
        >
          {editType === 'select' && selectOptions ? (
            <Select
              value={draft}
              onValueChange={(v) => {
                onSave(v);
              }}
            >
              <SelectTrigger className="h-full w-full rounded-none border-0 px-2.5 text-[13px] shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-[13px]">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <input
              ref={inputRef}
              type="text"
              inputMode={editType === 'number' ? 'numeric' : undefined}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-full w-full bg-transparent px-2.5 text-[13px] font-medium tabular-nums tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
              style={{ height: rect.height }}
            />
          )}
        </div>
      )}
      {editType === 'select-chip' && chipOptions && !pendingDateOption && (
        <div
          ref={popoverRef}
          className="fixed z-50 w-[220px] rounded-md border border-border bg-popover p-1 shadow-lg"
          style={{
            top: rect.bottom + 4,
            left: Math.min(rect.left, window.innerWidth - 220 - 12),
          }}
        >
          <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            옵션 선택
          </div>
          <div className="flex flex-col gap-0.5">
            {chipOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (opt.picker && onChipSave) {
                    const pre = opt.getPreselect?.(value);
                    if (opt.picker === 'range' && pre && !(pre instanceof Date) && pre.from) {
                      setPendingRange({ from: pre.from, to: pre.to });
                    } else {
                      setPendingRange(undefined);
                    }
                    setPendingDateOption(opt);
                    return;
                  }
                  onSave(opt.value);
                }}
                className={cn(
                  'flex items-center justify-between rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-muted',
                  draft === opt.value && 'bg-muted/60',
                )}
              >
                <span
                  className={cn(
                    'inline-flex max-w-full rounded-md px-1.5 py-0.5 text-[12px] font-medium leading-5',
                    opt.className ?? 'bg-[#f1f1ef] text-[#787774]',
                  )}
                >
                  {opt.label}
                </span>
                {draft === opt.value && (
                  <span className="ml-2 text-[11px] text-muted-foreground">선택됨</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      {editType === 'select-chip' && pendingDateOption && (
        <div
          ref={popoverRef}
          className="fixed z-50 w-[280px] rounded-md border border-border bg-popover shadow-lg"
          style={{
            top: rect.bottom + 4,
            left: Math.min(rect.left, window.innerWidth - 280 - 12),
          }}
        >
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <button
              type="button"
              className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground"
              onClick={() => {
                setPendingDateOption(null);
                setPendingRange(undefined);
              }}
            >
              ← 옵션
            </button>
            <span className="ml-auto text-[12px] text-muted-foreground">
              {pendingDateOption.label}
            </span>
          </div>
          {pendingDateOption.picker === 'range' ? (
            <Calendar
              mode="range"
              defaultMonth={pendingRangeDefaultMonth}
              selected={pendingRange}
              onSelect={(range) => {
                setPendingRange(range);
                // react-day-picker emits {from, to: from} on the first click in range mode.
                // Wait until the user clicks a second, distinct day so we save a real range.
                if (!range?.from || !range?.to) return;
                if (range.from.getTime() === range.to.getTime()) return;
                const fromField = pendingDateOption.fromField;
                const toField = pendingDateOption.toField;
                if (!fromField || !toField) return;
                const writes: DateWrite[] = [
                  { field: fromField, value: formatLocalDate(range.from) },
                  { field: toField, value: formatLocalDate(range.to) },
                ];
                onChipSave?.({
                  type: pendingDateOption.value,
                  dateWrites: writes,
                });
              }}
            />
          ) : (
            <Calendar
              mode="single"
              required
              defaultMonth={pendingSingleDate}
              selected={pendingSingleDate}
              onSelect={(date) => {
                if (!date) return;
                const fromField = pendingDateOption.fromField;
                if (!fromField) return;
                onChipSave?.({
                  type: pendingDateOption.value,
                  dateWrites: [{ field: fromField, value: formatLocalDate(date) }],
                });
              }}
            />
          )}
        </div>
      )}
    </>
  );

  return createPortal(portalContent, document.body);
}
