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

interface EditableCellProps {
  recordId: string;
  field: string;
  value: unknown;
  onSave: (recordId: string, field: string, value: unknown) => void;
  editType: 'text' | 'number' | 'select';
  selectOptions?: { label: string; value: string }[];
  children: React.ReactNode;
}

export function EditableCell({
  recordId,
  field,
  value,
  onSave,
  editType,
  selectOptions,
  children,
}: EditableCellProps) {
  const { editingCell, startEdit, stopEdit } = useCellEdit();
  const cellRef = useRef<HTMLDivElement>(null);
  const isEditing = editingCell?.recordId === recordId && editingCell?.field === field;

  return (
    <div
      ref={cellRef}
      className="relative min-h-[24px] cursor-default"
      onDoubleClick={() => startEdit(recordId, field)}
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
          onSave={(newValue) => {
            onSave(recordId, field, newValue);
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
  editType: 'text' | 'number' | 'select';
  selectOptions?: { label: string; value: string }[];
  onSave: (value: unknown) => void;
  onCancel: () => void;
}

function CellEditPortal({
  anchorEl,
  value,
  editType,
  selectOptions,
  onSave,
  onCancel,
}: CellEditPortalProps) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);
  const rect = anchorEl.getBoundingClientRect();

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!anchorEl.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorEl, onCancel]);

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
    <div
      className="fixed z-50 rounded-md border border-primary/40 bg-background shadow-lg"
      style={{
        top: rect.top - 1,
        left: rect.left - 1,
        width: rect.width + 2,
        minHeight: rect.height + 2,
      }}
    >
      {editType === 'select' && selectOptions ? (
        <Select
          value={draft}
          onValueChange={(v) => {
            onSave(v);
          }}
        >
          <SelectTrigger className="h-8 border-0 text-sm shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          ref={inputRef}
          type={editType === 'number' ? 'number' : 'text'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 border-0 text-sm shadow-none focus-visible:ring-0"
        />
      )}
    </div>
  );

  return createPortal(portalContent, document.body);
}
