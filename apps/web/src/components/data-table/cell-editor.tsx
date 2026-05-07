import { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
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
  editingCell: { recordId: string; field: string } | null;
  startEdit: (recordId: string, field: string) => void;
  stopEdit: () => void;
}

const CellEditContext = createContext<CellEditContextType>({
  editingCell: null,
  startEdit: () => {},
  stopEdit: () => {},
});

export function CellEditProvider({ children }: { children: React.ReactNode }) {
  const [editingCell, setEditingCell] = useState<{ recordId: string; field: string } | null>(null);

  const startEdit = useCallback((recordId: string, field: string) => {
    setEditingCell({ recordId, field });
  }, []);

  const stopEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  return (
    <CellEditContext.Provider value={{ editingCell, startEdit, stopEdit }}>
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
  /** When true, picking this option transitions the popover into a date picker. */
  requiresDate?: boolean;
  /** Field name used when saving the date for this option. Defaults to undefined (no date). */
  dateField?: string;
}

export type ChipSavePayload =
  | { type: string }
  | { type: string; dateField: string; date: string };

interface EditableCellProps {
  recordId: string;
  field: string;
  value: unknown;
  onSave: (recordId: string, field: string, value: unknown) => void;
  /** Optional richer save callback for select-chip cells that may also save a date. */
  onChipSave?: (recordId: string, payload: ChipSavePayload) => void;
  editType: 'text' | 'number' | 'select' | 'select-chip';
  selectOptions?: { label: string; value: string }[];
  chipOptions?: ChipOption[];
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
  children,
}: EditableCellProps) {
  const { editingCell, startEdit, stopEdit } = useCellEdit();
  const cellRef = useRef<HTMLDivElement>(null);
  const isEditing = editingCell?.recordId === recordId && editingCell?.field === field;

  return (
    <div
      ref={cellRef}
      className={cn(
        'relative flex h-full min-h-[24px] w-full cursor-text items-center rounded-sm transition-colors',
        !isEditing && 'hover:bg-muted/50',
        isEditing && editType !== 'select-chip' && 'bg-white',
      )}
      onClick={(event) => {
        if (isEditing) return;
        event.stopPropagation();
        startEdit(recordId, field);
      }}
    >
      {/* Display mode */}
      {children}

      {/* Edit mode — portal overlay */}
      {isEditing && cellRef.current && (
        <CellEditPortal
          anchorEl={cellRef.current}
          value={value}
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
  editType: 'text' | 'number' | 'select' | 'select-chip';
  selectOptions?: { label: string; value: string }[];
  chipOptions?: ChipOption[];
  onSave: (value: unknown) => void;
  onChipSave?: (payload: ChipSavePayload) => void;
  onCancel: () => void;
}

function CellEditPortal({
  anchorEl,
  value,
  editType,
  selectOptions,
  chipOptions,
  onSave,
  onChipSave,
  onCancel,
}: CellEditPortalProps) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const [pendingDateOption, setPendingDateOption] = useState<ChipOption | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rect = anchorEl.getBoundingClientRect();

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const finalValue = editType === 'number' ? Number(draft) : draft;
      onSave(finalValue);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const finalValue = editType === 'number' ? Number(draft) : draft;
      onSave(finalValue);
      // TODO: move to next cell
    }
  };

  const portalContent = (
    <>
      {editType !== 'select-chip' && (
        <div
          className="fixed z-50 overflow-hidden rounded-sm bg-background outline outline-2 -outline-offset-1 outline-[#2383e2]"
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
                  if (opt.requiresDate && opt.dateField && onChipSave) {
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
              onClick={() => setPendingDateOption(null)}
            >
              ← 옵션
            </button>
            <span className="ml-auto text-[12px] text-muted-foreground">
              {pendingDateOption.label}
            </span>
          </div>
          <Calendar
            mode="single"
            onSelect={(date) => {
              if (!date || !pendingDateOption.dateField) return;
              const iso = date.toISOString().slice(0, 10);
              onChipSave?.({
                type: pendingDateOption.value,
                dateField: pendingDateOption.dateField,
                date: iso,
              });
            }}
          />
        </div>
      )}
    </>
  );

  return createPortal(portalContent, document.body);
}

