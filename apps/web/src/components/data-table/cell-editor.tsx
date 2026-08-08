import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
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
  editingCell: { recordId: string; field: string } | null;
  startEdit: (recordId: string, field: string) => void;
  stopEdit: () => void;
}

const CellEditContext = createContext<CellEditContextType>({
  editingCell: null,
  startEdit: () => {},
  stopEdit: () => {},
});

// 가상화 테이블에서 편집 중인 행이 화면 밖으로 나가 포털이 언마운트돼도
// 입력 초안을 보존하는 저장소. 불변식: "현재 편집 중인 셀"의 초안만 보유한다 —
// 편집 세션이 끝나면(다른 셀 편집 시작/종료) 즉시 비워 stale 복원을 막는다.
/** 셀 편집 중간 상태 전체 — 텍스트 초안 + 칩 날짜 피커 진행 상태 */
type CellDraft = {
  text?: string;
  /** 열려 있던 날짜/기간 피커의 ChipOption.value */
  chipOptionValue?: string;
  /** 고르던 기간 (ISO) */
  range?: { from?: string; to?: string };
  /** 달력에서 넘겨보던 표시 월 (ISO) — 날짜를 안 찍었어도 보존 */
  month?: string;
};
const cellDraftStore = new Map<string, CellDraft>();
const cellDraftKey = (recordId: string, field: string) =>
  `${recordId}:${field}`;

export function CellEditProvider({ children }: { children: React.ReactNode }) {
  const [editingCell, setEditingCell] = useState<{
    recordId: string;
    field: string;
  } | null>(null);

  const startEdit = useCallback((recordId: string, field: string) => {
    // startEdit는 항상 새 편집 세션의 시작이다 — 가상화 스크롤아웃 복원 경로는
    // startEdit를 다시 호출하지 않으므로(editingCell 유지, 포털만 재마운트),
    // 여기서 무조건 비워도 정당한 초안은 지워지지 않는다. Provider/라우트가
    // 재마운트돼 모듈 저장소에 남은 stale 초안도 이 시점에 함께 폐기된다.
    cellDraftStore.clear();
    setEditingCell({ recordId, field });
  }, []);

  const stopEdit = useCallback(() => {
    cellDraftStore.clear();
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
  getPreselect?: (
    rowValue: unknown,
  ) => Date | undefined | { from?: Date; to?: Date };
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
  /** Elevated editor chrome used by dense ledger tables. */
  editorChrome?: 'cell' | 'floating';
  hoverHighlight?: boolean;
  children: React.ReactNode;
}

/**
 * 가장 가까운 스크롤 컨테이너. 편집 오버레이를 fixed(뷰포트 고정)가 아니라
 * 이 컨테이너 안에 absolute 로 심는다 — 오버레이가 콘텐츠의 일부가 되어
 * 네이티브 스크롤(컴포지터)을 그대로 타므로, 가상 스크롤 리렌더를 기다리며
 * 한 박자 늦게 따라오는 문제가 구조적으로 사라진다.
 */
function getScrollParent(el: HTMLElement): HTMLElement {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY + style.overflowX)) {
      return node;
    }
    node = node.parentElement;
  }
  return document.body;
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
  editorChrome = 'cell',
  hoverHighlight = true,
  children,
}: EditableCellProps) {
  const { editingCell, startEdit, stopEdit } = useCellEdit();
  const cellRef = useRef<HTMLDivElement>(null);
  const isEditing =
    editingCell?.recordId === recordId && editingCell?.field === field;
  const anchorEl =
    portalAnchor === 'tableCell'
      ? (cellRef.current?.closest<HTMLElement>('td') ?? cellRef.current)
      : cellRef.current;

  return (
    <div
      ref={cellRef}
      data-editing={isEditing || undefined}
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
          recordId={recordId}
          field={field}
          value={value}
          chipValueOf={chipValueOf}
          editType={editType}
          selectOptions={selectOptions}
          chipOptions={chipOptions}
          editorChrome={editorChrome}
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
  recordId: string;
  field: string;
  value: unknown;
  chipValueOf?: (value: unknown) => string | undefined;
  editType: 'text' | 'number' | 'select' | 'select-chip';
  selectOptions?: { label: string; value: string }[];
  chipOptions?: ChipOption[];
  editorChrome: 'cell' | 'floating';
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
  recordId,
  field,
  value,
  chipValueOf,
  editType,
  selectOptions,
  chipOptions,
  editorChrome,
  onSave,
  onChipSave,
  onCancel,
}: CellEditPortalProps) {
  const initialDraft =
    editType === 'select-chip'
      ? (chipValueOf?.(value) ?? '')
      : String(value ?? '');
  // 언마운트(가상화 스크롤아웃) 후 재마운트 시 보존된 초안을 복원
  const draftKey = cellDraftKey(recordId, field);
  const storedDraft = cellDraftStore.get(draftKey);
  const patchStore = (patch: Partial<CellDraft>) => {
    cellDraftStore.set(draftKey, { ...cellDraftStore.get(draftKey), ...patch });
  };
  const [draft, setDraftState] = useState(
    () => storedDraft?.text ?? initialDraft,
  );
  const setDraft = (next: string) => {
    patchStore({ text: next });
    setDraftState(next);
  };
  const clearDraft = () => cellDraftStore.delete(cellDraftKey(recordId, field));
  // 저장/취소 시 보존 초안 제거 — 언마운트(스크롤아웃)만으로는 지우지 않는다
  const commit = (next: unknown) => {
    clearDraft();
    onSave(next);
  };
  const cancel = () => {
    clearDraft();
    onCancel();
  };
  // 언마운트(가상화 스크롤아웃) 후 재마운트 시 열려 있던 피커까지 복원
  const [pendingDateOption, setPendingDateOptionState] =
    useState<ChipOption | null>(() => {
      const v = storedDraft?.chipOptionValue;
      return v ? (chipOptions?.find((o) => o.value === v) ?? null) : null;
    });
  const setPendingDateOption = (opt: ChipOption | null) => {
    patchStore({ chipOptionValue: opt?.value });
    setPendingDateOptionState(opt);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  // 스크롤 컨테이너 기준 콘텐츠 좌표 (absolute 배치용)
  const scrollParent = useMemo(() => getScrollParent(anchorEl), [anchorEl]);
  useLayoutEffect(() => {
    // absolute 의 기준이 되도록 컨테이너에 포지션 컨텍스트 보장
    if (getComputedStyle(scrollParent).position === 'static') {
      scrollParent.style.position = 'relative';
    }
  }, [scrollParent]);
  const rect = (() => {
    const a = anchorEl.getBoundingClientRect();
    const p = scrollParent.getBoundingClientRect();
    const top = a.top - p.top - scrollParent.clientTop + scrollParent.scrollTop;
    const left =
      a.left - p.left - scrollParent.clientLeft + scrollParent.scrollLeft;
    return {
      top,
      left,
      width: a.width,
      height: a.height,
      bottom: top + a.height,
    };
  })();
  /** 팝오버가 컨테이너 오른쪽 밖으로 나가지 않게 하는 left 한계 */
  const clampLeft = (popoverWidth: number) =>
    Math.min(
      rect.left,
      scrollParent.scrollLeft + scrollParent.clientWidth - popoverWidth - 12,
    );
  const isFloatingEditor =
    editorChrome === 'floating' && editType !== 'select-chip';
  const floatingWidth = Math.max(
    rect.width + 12,
    editType === 'number' ? 132 : rect.width,
  );
  const floatingViewportLeft = scrollParent.scrollLeft + 8;
  const floatingViewportRight =
    scrollParent.scrollLeft + scrollParent.clientWidth - floatingWidth - 8;
  const floatingLeft = Math.max(
    floatingViewportLeft,
    Math.min(rect.left - 6, floatingViewportRight),
  );
  const floatingHeight = 40;
  const floatingTop = rect.top + (rect.height - floatingHeight) / 2;

  // Preselect for date/range pickers, derived from the cell's value via getPreselect.
  const preselect = pendingDateOption?.getPreselect?.(value);
  const pendingSingleDate =
    pendingDateOption?.picker === 'date' && preselect instanceof Date
      ? preselect
      : undefined;
  const initialRange: DateRange | undefined =
    pendingDateOption?.picker === 'range' &&
    preselect &&
    !(preselect instanceof Date) &&
    preselect.from
      ? { from: preselect.from, to: preselect.to }
      : undefined;
  const [pendingRange, setPendingRangeState] = useState<DateRange | undefined>(
    () => {
      const r = storedDraft?.range;
      if (r?.from) {
        return {
          from: new Date(r.from),
          to: r.to ? new Date(r.to) : undefined,
        };
      }
      return initialRange;
    },
  );
  const setPendingRange = (range: DateRange | undefined) => {
    patchStore({
      range: range?.from
        ? { from: range.from.toISOString(), to: range.to?.toISOString() }
        : undefined,
    });
    setPendingRangeState(range);
  };
  // 날짜를 아직 선택하지 않고 달만 넘겨본 상태도 재마운트에서 살린다
  const [pickerMonth, setPickerMonthState] = useState<Date | undefined>(() => {
    const m = storedDraft?.month;
    return m ? new Date(m) : undefined;
  });
  const setPickerMonth = (month: Date) => {
    patchStore({ month: month.toISOString() });
    setPickerMonthState(month);
  };
  // 표시 월은 지금 고르고 있는(복원 초안 포함) 기간을 우선한다 —
  // 스크롤아웃 복원 시 달력이 사용자가 찍어둔 날짜의 달로 열리도록.
  const pendingRangeDefaultMonth =
    pendingRange?.from ?? initialRange?.from ?? new Date();

  // Auto-focus on mount (skip for select/chip — has its own focus management)
  useEffect(() => {
    if (editType === 'select' || editType === 'select-chip') return;
    inputRef.current?.focus();
  }, [editType]);

  // Close on click outside (consider portal popover too)
  const popoverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorEl.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      cancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorEl, onCancel]);

  // Close on Escape (handles select-chip where input isn't focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const finalValue = editType === 'number' ? Number(draft) : draft;
      commit(finalValue);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const finalValue = editType === 'number' ? Number(draft) : draft;
      commit(finalValue);
      // TODO: move to next cell
    }
  };

  const portalContent = (
    <>
      {editType !== 'select-chip' && (
        <div
          ref={popoverRef}
          data-cell-edit-popup={isFloatingEditor ? 'true' : undefined}
          className={cn(
            'absolute z-50 overflow-hidden bg-background',
            isFloatingEditor
              ? 'rounded-md border border-border p-1 shadow-[0_12px_28px_rgba(15,23,42,0.2)] focus-within:border-ring'
              : 'rounded-none outline outline-2 -outline-offset-1 outline-info',
          )}
          style={{
            top: isFloatingEditor ? floatingTop : rect.top,
            left: isFloatingEditor ? floatingLeft : rect.left,
            width: isFloatingEditor ? floatingWidth : rect.width,
            minHeight: isFloatingEditor ? floatingHeight : rect.height,
          }}
        >
          {editType === 'select' && selectOptions ? (
            <Select
              value={draft}
              onValueChange={(v) => {
                commit(v);
              }}
            >
              <SelectTrigger className="h-full w-full rounded-none border-0 px-2.5 text-[13px] shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectOptions.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="text-[13px]"
                  >
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
              aria-label={`${field} 편집`}
              className={cn(
                'w-full bg-transparent text-[13px] font-medium tabular-nums tracking-tight text-foreground outline-none placeholder:text-muted-foreground',
                isFloatingEditor ? 'h-8 px-2' : 'h-full px-2.5',
                editType === 'number' && 'text-right',
              )}
              style={isFloatingEditor ? undefined : { height: rect.height }}
            />
          )}
        </div>
      )}
      {editType === 'select-chip' && chipOptions && !pendingDateOption && (
        <div
          ref={popoverRef}
          className="absolute z-50 w-[220px] rounded-md border border-border bg-popover p-1 shadow-lg"
          style={{
            top: rect.bottom + 4,
            left: clampLeft(220),
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
                    if (
                      opt.picker === 'range' &&
                      pre &&
                      !(pre instanceof Date) &&
                      pre.from
                    ) {
                      setPendingRange({ from: pre.from, to: pre.to });
                    } else {
                      setPendingRange(undefined);
                    }
                    setPendingDateOption(opt);
                    return;
                  }
                  commit(opt.value);
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
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    선택됨
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      {editType === 'select-chip' && pendingDateOption && (
        <div
          ref={popoverRef}
          className="absolute z-50 w-[280px] rounded-md border border-border bg-popover shadow-lg"
          style={{
            top: rect.bottom + 4,
            left: clampLeft(280),
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
              month={pickerMonth ?? pendingRangeDefaultMonth}
              onMonthChange={setPickerMonth}
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
                clearDraft();
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
              month={pickerMonth ?? pendingSingleDate}
              onMonthChange={setPickerMonth}
              selected={pendingSingleDate}
              onSelect={(date) => {
                if (!date) return;
                const fromField = pendingDateOption.fromField;
                if (!fromField) return;
                clearDraft();
                onChipSave?.({
                  type: pendingDateOption.value,
                  dateWrites: [
                    { field: fromField, value: formatLocalDate(date) },
                  ],
                });
              }}
            />
          )}
        </div>
      )}
    </>
  );

  return createPortal(portalContent, scrollParent);
}
