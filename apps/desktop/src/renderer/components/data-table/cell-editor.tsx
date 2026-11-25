import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  createContext,
  useContext,
  useId,
} from 'react';
import { createPortal } from 'react-dom';
import type { DateRange } from 'react-day-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Check, Loader2 } from 'lucide-react';
import {
  CellDraftStore,
  parseCellNumber,
  type CellNavigation,
  type CellSaveResult,
} from './cell-edit-state';
import { useCellTableNavigation } from './cell-navigation';
import { describeManwon, MANWON_INPUT_HINT } from '@/lib/manwon';

// ── Cell Edit Context (Twenty-inspired draft pattern) ───────────
// Portal-based editing prevents table reflow.
// Draft value is separate from persisted value.

interface CellEditContextType {
  drafts: CellDraftStore;
  getEditingCell: () => { recordId: string; field: string } | null;
  subscribe: (listener: () => void) => () => void;
  startEdit: (recordId: string, field: string) => void;
  stopEdit: () => void;
}

const CellEditContext = createContext<CellEditContextType>({
  drafts: new CellDraftStore(),
  getEditingCell: () => null,
  subscribe: () => () => undefined,
  startEdit: () => undefined,
  stopEdit: () => undefined,
});

/** 가상화 스크롤아웃으로 포털이 언마운트돼도 입력 중이던 초안을 보존한다 (web 과 동일 설계) */
/** 셀 편집 중간 상태 전체 — 텍스트 초안 + 칩 날짜 피커 진행 상태 */
const cellDraftKey = (recordId: string, field: string) =>
  `${recordId}:${field}`;

export function CellEditProvider({ children }: { children: React.ReactNode }) {
  const [drafts] = useState(() => new CellDraftStore());
  const editingCellRef = useRef<{ recordId: string; field: string } | null>(
    null,
  );
  const listenersRef = useRef(new Set<() => void>());

  const notify = useCallback(() => {
    for (const listener of listenersRef.current) {
      listener();
    }
  }, []);

  const startEdit = useCallback(
    (recordId: string, field: string) => {
      const current = editingCellRef.current;
      if (current?.recordId === recordId && current.field === field) return;
      if (
        current &&
        drafts.get(cellDraftKey(current.recordId, current.field))?.saving
      )
        return;
      editingCellRef.current = { recordId, field };
      notify();
    },
    [drafts, notify],
  );

  const stopEdit = useCallback(() => {
    const current = editingCellRef.current;
    if (!current) return;
    const key = cellDraftKey(current.recordId, current.field);
    if (drafts.get(key)?.saving) return;
    drafts.delete(key);
    editingCellRef.current = null;
    notify();
  }, [drafts, notify]);

  const value = useMemo<CellEditContextType>(
    () => ({
      drafts,
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
    [drafts, startEdit, stopEdit],
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
  /** Status options can repeat the dot shown in their display cell. */
  dotClassName?: string;
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
  /** Return false to keep the editor open when validation rejects a draft. */
  onSave: (recordId: string, field: string, value: unknown) => CellSaveResult;
  /** Optional richer save callback for select-chip cells that may also save dates. */
  onChipSave?: (recordId: string, payload: ChipSavePayload) => CellSaveResult;
  editType: 'text' | 'number' | 'select' | 'select-chip';
  selectOptions?: { label: string; value: string }[];
  chipOptions?: ChipOption[];
  /** For select-chip: extracts the currently-selected option value from the cell's `value`.
   *  Useful when `value` is the full record (so chip pickers can preselect dates). */
  chipValueOf?: (value: unknown) => string | undefined;
  activation?: 'click' | 'doubleClick';
  portalAnchor?: 'self' | 'tableCell';
  /** Nested scrollable tables can escape their clipped viewport. */
  portalContainer?: 'scrollParent' | 'body';
  /**
   * `floating` keeps the editor anchored to the cell without replacing its
   * layout, and adds the elevated popup chrome used by dense ledgers.
   */
  editorChrome?: 'cell' | 'floating';
  multiline?: boolean;
  commitOnBlur?: boolean;
  numberMinimum?: number;
  numberUnit?: string;
  hoverHighlight?: boolean;
  /** Accessible name for the edit trigger. Defaults to the field name. */
  ariaLabel?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * 가장 가까운 스크롤 컨테이너. 모든 편집 팝업을 이 컨테이너 안에 absolute로
 * 렌더하면 브라우저가 셀과 팝업을 같은 스크롤 레이어에서 함께 이동시킨다.
 * body 기준 좌표를 매 프레임 다시 계산하지 않으므로 스크롤 추적 지연이 없다.
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
  portalContainer = 'scrollParent',
  editorChrome = 'cell',
  multiline = false,
  commitOnBlur = false,
  numberMinimum,
  numberUnit,
  hoverHighlight = true,
  ariaLabel,
  className,
  children,
}: EditableCellProps) {
  const { getEditingCell, subscribe, startEdit, stopEdit } = useCellEdit();
  const navigation = useCellTableNavigation();
  const cellRef = useRef<HTMLButtonElement>(null);
  const [cellNode, setCellNode] = useState<HTMLButtonElement | null>(null);
  const mountCell = useCallback((node: HTMLButtonElement | null) => {
    cellRef.current = node;
    setCellNode(node);
  }, []);
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
      ? (cellNode?.closest<HTMLElement>('td, th') ?? cellNode)
      : cellNode;
  // A query refresh may replace the cell renderer while a save is pending.
  // The table cell survives that replacement and retains its navigation address.
  const navigationAnchor = cellNode?.closest<HTMLElement>('td, th') ?? cellNode;
  const finishEdit = (focusTarget: CellNavigation = 'current') => {
    const trigger = cellRef.current ?? cellNode;
    const current = getEditingCell();
    if (current?.recordId !== recordId || current.field !== field) return;
    stopEdit();
    if (focusTarget === 'none') {
      if (navigationAnchor) navigation?.clear(navigationAnchor, recordId);
      return;
    }
    requestAnimationFrame(() => {
      if (navigation && navigationAnchor) {
        navigation.finish(navigationAnchor, focusTarget, recordId);
        return;
      }
      if (!trigger) return;
      if (focusTarget === 'current') {
        trigger.focus({ preventScroll: true });
        return;
      }
      const triggers = Array.from(
        (
          trigger.closest('table') ?? document
        ).querySelectorAll<HTMLButtonElement>('[data-editable-cell-trigger]'),
      ).filter((candidate) => !candidate.disabled && candidate.offsetParent);
      const currentIndex = triggers.indexOf(trigger);
      const nextIndex =
        focusTarget === 'next' ? currentIndex + 1 : currentIndex - 1;
      (triggers[nextIndex] ?? trigger).focus({ preventScroll: true });
    });
  };

  return (
    <button
      type="button"
      ref={mountCell}
      data-editable-cell-trigger
      data-cell-record-id={recordId}
      data-cell-field={field}
      data-editing={isEditing || undefined}
      aria-label={ariaLabel ?? `${field} 편집`}
      onFocus={(event) => {
        if (!isEditing && event.target === event.currentTarget)
          navigation?.select(event.currentTarget);
      }}
      className={cn(
        'relative flex h-full min-h-[24px] w-full cursor-text items-center rounded-sm border-0 bg-transparent p-0 text-left font-inherit text-inherit transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        hoverHighlight && !isEditing && 'hover:bg-muted/50',
        isEditing && editType !== 'select-chip' && 'bg-white',
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        navigation?.select(
          event.currentTarget,
          activation === 'doubleClick' && !isEditing,
        );
        if (activation !== 'click' || isEditing) return;
        startEdit(recordId, field);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        navigation?.select(event.currentTarget);
        if (activation !== 'doubleClick' || isEditing) return;
        startEdit(recordId, field);
      }}
      onKeyDown={(event) => {
        if (isEditing) return;
        if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'F2') {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        navigation?.select(event.currentTarget);
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
          ariaLabel={ariaLabel}
          value={value}
          chipValueOf={chipValueOf}
          editType={editType}
          selectOptions={selectOptions}
          chipOptions={chipOptions}
          editorChrome={editorChrome}
          portalContainer={portalContainer}
          multiline={multiline}
          commitOnBlur={commitOnBlur}
          numberMinimum={numberMinimum}
          numberUnit={numberUnit}
          onSave={(newValue) => onSave(recordId, field, newValue)}
          onChipSave={(payload) => {
            if (onChipSave) {
              return onChipSave(recordId, payload);
            } else {
              return onSave(recordId, field, payload.type);
            }
          }}
          onFinish={finishEdit}
          onCancel={(restoreFocus) =>
            finishEdit(restoreFocus ? 'current' : 'none')
          }
        />
      )}
    </button>
  );
}

// ── Cell Edit Portal ────────────────────────────────────────────
// Renders the edit input as a portal positioned over the cell.
// Prevents table layout reflow (Twenty pattern).

interface CellEditPortalProps {
  anchorEl: HTMLElement;
  recordId: string;
  field: string;
  ariaLabel?: string;
  value: unknown;
  chipValueOf?: (value: unknown) => string | undefined;
  editType: 'text' | 'number' | 'select' | 'select-chip';
  selectOptions?: { label: string; value: string }[];
  chipOptions?: ChipOption[];
  editorChrome: 'cell' | 'floating';
  portalContainer: 'scrollParent' | 'body';
  multiline: boolean;
  commitOnBlur: boolean;
  numberMinimum?: number;
  numberUnit?: string;
  onSave: (value: unknown) => CellSaveResult;
  onChipSave?: (payload: ChipSavePayload) => CellSaveResult;
  onFinish: (navigation: CellNavigation) => void;
  onCancel: (restoreFocus: boolean) => void;
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
  ariaLabel,
  value,
  chipValueOf,
  editType,
  selectOptions,
  chipOptions,
  editorChrome,
  portalContainer,
  multiline,
  commitOnBlur,
  numberMinimum,
  numberUnit,
  onSave,
  onChipSave,
  onFinish,
  onCancel,
}: CellEditPortalProps) {
  const { drafts } = useCellEdit();
  const navigation = useCellTableNavigation();
  const helpId = useId();
  const initialDraft =
    editType === 'select-chip'
      ? (chipValueOf?.(value) ?? (typeof value === 'string' ? value : ''))
      : String(value ?? '');
  // 언마운트(가상화 스크롤아웃) 후 재마운트 시 보존된 초안을 복원
  const draftKey = cellDraftKey(recordId, field);
  const storedDraft = useSyncExternalStore(
    drafts.subscribe,
    () => drafts.get(draftKey),
    () => undefined,
  );
  const patchStore = (patch: Parameters<CellDraftStore['patch']>[1]) =>
    drafts.patch(draftKey, patch);
  const saving = storedDraft?.saving ?? false;
  const error = storedDraft?.error;
  const [draft, setDraftState] = useState(
    () => storedDraft?.text ?? initialDraft,
  );
  const setDraft = (next: string) => {
    patchStore({ text: next, error: undefined });
    setDraftState(next);
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
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  // 스크롤 컨테이너 기준 콘텐츠 좌표 (absolute 배치용)
  const scrollParent = useMemo(() => portalContainer === 'body' ? document.body : getScrollParent(anchorEl), [anchorEl, portalContainer]);
  const [, reposition] = useState(0);
  useLayoutEffect(() => {
    if (portalContainer !== 'body') return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => reposition(value => value + 1));
    };
    document.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [portalContainer]);
  const anchorStyle = portalContainer === 'body' ? getComputedStyle(anchorEl) : null;
  const portalTypography = anchorStyle ? {
    '--cell-editor-font-size': anchorStyle.fontSize,
    '--cell-editor-line-height': anchorStyle.lineHeight,
    '--cell-editor-font-weight': anchorStyle.fontWeight,
  } : {};
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
    return { top, left, width: a.width, height: a.height };
  })();
  const clampPopupLeft = (popupWidth: number) => {
    const viewportLeft = scrollParent.scrollLeft + 12;
    const viewportRight = Math.max(
      viewportLeft,
      scrollParent.scrollLeft + scrollParent.clientWidth - popupWidth - 12,
    );
    return Math.max(viewportLeft, Math.min(rect.left, viewportRight));
  };
  // Long option lists scroll inside the popup and open above cells near the bottom.
  const longChipMenu = (chipOptions?.length ?? 0) > 8;
  const chipMenuMaxHeight = Math.min(360, window.innerHeight - 24);
  const chipMenuTop = (() => {
    if (!longChipMenu) return rect.top + rect.height + 4;
    const anchor = anchorEl.getBoundingClientRect();
    const top = anchor.bottom + 4 + chipMenuMaxHeight <= window.innerHeight - 12
      ? anchor.bottom + 4 : Math.max(12, anchor.top - chipMenuMaxHeight - 4);
    return rect.top + top - anchor.top;
  })();
  const isFloatingEditor =
    editorChrome === 'floating' && editType !== 'select-chip';
  const floatingWidth = Math.max(
    rect.width + 2,
    editType === 'number' ? 132 : rect.width,
  );
  const floatingViewportLeft = scrollParent.scrollLeft + 8;
  const floatingViewportRight =
    scrollParent.scrollLeft + scrollParent.clientWidth - floatingWidth - 8;
  const floatingLeft = Math.max(
    floatingViewportLeft,
    Math.min(rect.left - 1, floatingViewportRight),
  );
  const floatingHeight = Math.max(32, rect.height + 2);
  const floatingTop = rect.top - 1;
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

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!(input instanceof HTMLTextAreaElement)) return;
    input.style.height = '0px';
    input.style.height = `${Math.min(240, Math.max(floatingHeight, input.scrollHeight))}px`;
  }, [draft, multiline, floatingHeight]);

  const saveValue = async (
    next: unknown,
    direction: CellNavigation = 'current',
  ) => {
    const accepted = await drafts.save(draftKey, () => onSave(next));
    if (accepted) onFinish(direction);
    else inputRef.current?.focus({ preventScroll: true });
    return accepted;
  };
  const saveChip = async (payload: ChipSavePayload) => {
    const accepted = await drafts.save(draftKey, () => onChipSave?.(payload));
    if (accepted) onFinish('current');
  };
  const commitDraft = async (direction: CellNavigation = 'current') => {
    if (drafts.get(draftKey)?.saving || composingRef.current) return false;
    if (draft === initialDraft && !error) {
      onFinish(direction);
      return true;
    }
    if (editType === 'number') {
      const parsed = parseCellNumber(draft, numberMinimum, numberUnit);
      if (!parsed.valid) {
        patchStore({ error: parsed.error });
        inputRef.current?.focus({ preventScroll: true });
        return false;
      }
      return saveValue(parsed.value, direction);
    }
    return saveValue(draft, direction);
  };

  // Close on click outside (consider portal popover too)
  const popoverRef = useRef<HTMLDivElement>(null);
  const selectContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorEl.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      // Only this editor's menu belongs to the cell, not unrelated toolbar popovers.
      if (selectContentRef.current?.contains(target)) return;
      if (drafts.get(draftKey)?.saving || composingRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (commitOnBlur && (editType === 'text' || editType === 'number')) {
        if (draft === initialDraft && !error) {
          onFinish('none');
          return;
        }
        // Complete this edit before the clicked control can unmount it.
        e.preventDefault();
        e.stopPropagation();
        const element =
          target instanceof HTMLElement ? target : target.parentElement;
        const tableCell = element?.closest<HTMLElement>('td, th');
        const control = element?.closest<HTMLElement>(
          'button, a, input, [role="button"]',
        );
        const recordId = control?.dataset.cellRecordId;
        const field = control?.dataset.cellField;
        void commitDraft('none').then((accepted) => {
          if (!accepted) return;
          requestAnimationFrame(() => {
            // Query refreshes may replace the clicked cell's contents during save.
            // Resolve the same control inside its surviving table cell.
            const replacement =
              recordId && field && tableCell?.isConnected
                ? Array.from(
                    tableCell.querySelectorAll<HTMLElement>(
                      '[data-editable-cell-trigger]',
                    ),
                  ).find(
                    (node) =>
                      node.dataset.cellRecordId === recordId &&
                      node.dataset.cellField === field,
                  )
                : undefined;
            const next = element?.isConnected
              ? element
              : control?.isConnected
                ? control
                : (replacement ??
                  (!control && tableCell?.isConnected ? tableCell : null));
            next?.focus({ preventScroll: true });
            next?.click();
          });
        });
        return;
      }
      onCancel(false);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  });

  // Close on Escape (handles select-chip where input isn't focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key !== 'Escape' ||
        e.isComposing ||
        composingRef.current ||
        e.defaultPrevented
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      if (!drafts.get(draftKey)?.saving) onCancel(true);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || composingRef.current || e.keyCode === 229)
      return;
    if (saving) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.key === 'Enter' || e.key === 'NumpadEnter') {
      if (multiline && e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      void commitDraft(navigation ? 'down' : 'current');
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel(true);
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      void commitDraft(e.shiftKey ? 'previous' : 'next');
    }
  };

  const [activeOption, setActiveOption] = useState(() =>
    Math.max(0, chipOptions?.findIndex((o) => o.value === initialDraft) ?? 0),
  );
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const handleOptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || saving) return;
    const count = chipOptions?.length ?? 0;
    if (!count) return;
    let next: number;
    if (e.key === 'ArrowDown') next = (activeOption + 1) % count;
    else if (e.key === 'ArrowUp') next = (activeOption - 1 + count) % count;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = count - 1;
    else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      onFinish(e.shiftKey ? 'previous' : 'next');
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
    setActiveOption(next);
    optionRefs.current[next]?.focus();
  };
  const feedback = (saving || error) && (
    <div
      id={helpId}
      role={error ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-1.5 px-2.5 py-1.5 text-[11px] leading-4',
        error ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {saving && (
        <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin motion-reduce:animate-none" />
      )}
      {saving ? '저장 중…' : error}
    </div>
  );
  const inputProps = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onKeyDown: handleKeyDown,
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onCompositionEnd: () => {
      composingRef.current = false;
    },
    readOnly: saving,
    'aria-label': ariaLabel ?? `${field} 편집`,
    'aria-invalid': Boolean(error),
    'aria-describedby':
      saving || error || multiline || numberUnit ? helpId : undefined,
    className: cn(
      'block w-full resize-none bg-transparent px-2.5 py-2 text-[13px] leading-4 text-foreground outline-none placeholder:text-muted-foreground',
      editType === 'number' && 'text-right font-medium tabular-nums',
    ),
    // The scroll container owns these optional tokens, so portals keep the
    // same typography as their table without changing other editors.
    style: {
      minHeight: floatingHeight,
      fontSize: 'var(--cell-editor-font-size, 13px)',
      lineHeight: 'var(--cell-editor-line-height, 16px)',
      fontWeight: `var(--cell-editor-font-weight, ${editType === 'number' ? 500 : 400})`,
    },
  };

  const portalContent = (
    <>
      {editType !== 'select-chip' && (
        <div
          ref={popoverRef}
          data-cell-edit-popup
          role="dialog"
          aria-label={ariaLabel ?? `${field} 편집`}
          aria-busy={saving}
          className={cn(
            'absolute z-50 overflow-hidden bg-background',
            isFloatingEditor
              ? 'rounded-md shadow-[0_8px_12px_rgba(25,25,25,0.04),0_2px_6px_rgba(25,25,25,0.03),0_0_0_1px_rgba(42,28,0,0.12)]'
              : 'rounded-none outline outline-2 -outline-offset-1 outline-info',
          )}
          style={{
            ...portalTypography,
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
                void saveValue(v);
              }}
              disabled={saving}
            >
              <SelectTrigger className="h-full w-full rounded-none border-0 px-2.5 text-[13px] shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent ref={selectContentRef}>
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
          ) : multiline ? (
            <textarea
              {...inputProps}
              rows={1}
              ref={(node) => {
                inputRef.current = node;
              }}
            />
          ) : (
            <input
              {...inputProps}
              ref={(node) => {
                inputRef.current = node;
              }}
              type="text"
              inputMode={editType === 'number' && numberUnit !== '만원' ? 'decimal' : undefined}
            />
          )}
          {feedback ||
            ((multiline || numberUnit) && (
              <div
                id={helpId}
                className="px-2.5 pb-1.5 text-[10px] leading-4 text-muted-foreground"
              >
                {numberUnit === '만원'
                  ? manwonHelpText(draft)
                  : numberUnit
                    ? `단위: ${numberUnit} · Enter 저장`
                    : 'Enter 저장 · Shift+Enter 줄바꿈'}
              </div>
            ))}
        </div>
      )}
      {editType === 'select-chip' && chipOptions && !pendingDateOption && (
        <div
          ref={popoverRef}
          data-cell-chip-popup
          role="dialog"
          aria-label={ariaLabel ?? `${field} 선택`}
          aria-busy={saving}
          className="absolute z-50 w-[220px] flex flex-col rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          style={{
            ...portalTypography,
            top: chipMenuTop,
            left: clampPopupLeft(220),
            maxHeight: longChipMenu ? chipMenuMaxHeight : undefined,
          }}
        >
          <div
            role="listbox"
            aria-label={ariaLabel ?? `${field} 선택`}
            className={cn('flex flex-col gap-0.5', longChipMenu && 'min-h-0 overflow-y-auto overscroll-contain')}
            onKeyDown={handleOptionKeyDown}
          >
            {chipOptions.map((opt, index) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={initialDraft === opt.value}
                disabled={saving}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                tabIndex={activeOption === index ? 0 : -1}
                autoFocus={activeOption === index}
                onFocus={() => setActiveOption(index)}
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
                  void saveValue(opt.value, 'current');
                }}
                className={cn(
                  'flex shrink-0 items-center justify-between rounded-sm px-2 py-1.5 text-left outline-none hover:bg-muted focus:bg-muted disabled:opacity-60',
                )}
              >
                <span
                  className={cn(
                    'inline-flex max-w-full items-center gap-[5px] rounded-[var(--cell-chip-radius,6px)] px-1.5 py-0.5 text-[12px] font-medium leading-5',
                    opt.className ?? 'bg-[#f1f1ef] text-[#787774]',
                  )}
                  style={{
                    fontSize: 'var(--cell-editor-font-size, 12px)',
                    fontWeight: 'var(--cell-editor-font-weight, 500)',
                    paddingBlock: 'var(--cell-chip-padding-y, 2px)',
                  }}
                >
                  {opt.dotClassName && (
                    <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', opt.dotClassName)} />
                  )}
                  {opt.label}
                </span>
                {initialDraft === opt.value && (
                  <Check
                    aria-label="현재 값"
                    className="ml-2 size-3.5 text-muted-foreground"
                  />
                )}
              </button>
            ))}
          </div>
          {feedback}
        </div>
      )}
      {editType === 'select-chip' && pendingDateOption && (
        <div
          ref={popoverRef}
          data-cell-chip-popup
          role="dialog"
          aria-label={`${pendingDateOption.label} 날짜 선택`}
          aria-busy={saving}
          className="absolute z-50 w-[280px] rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          style={{
            ...portalTypography,
            top: rect.top + rect.height + 4,
            left: clampPopupLeft(280),
          }}
        >
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <button
              type="button"
              disabled={saving}
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
              disabled={saving}
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
                void saveChip({
                  type: pendingDateOption.value,
                  dateWrites: writes,
                });
              }}
            />
          ) : (
            <Calendar
              mode="single"
              disabled={saving}
              required
              month={pickerMonth ?? pendingSingleDate}
              onMonthChange={setPickerMonth}
              selected={pendingSingleDate}
              onSelect={(date) => {
                if (!date) return;
                const fromField = pendingDateOption.fromField;
                if (!fromField) return;
                void saveChip({
                  type: pendingDateOption.value,
                  dateWrites: [
                    { field: fromField, value: formatLocalDate(date) },
                  ],
                });
              }}
            />
          )}
          {feedback}
        </div>
      )}
    </>
  );

  return createPortal(portalContent, scrollParent);
}

/** 만원 칸 아래 도움말: 적은 금액을 읽어 되비춘다("= 15억 8,000만 · Enter 저장"). */
function manwonHelpText(draft: string): string {
  const echo = describeManwon(draft);
  if (echo.invalid) return `금액을 읽을 수 없습니다 · ${MANWON_INPUT_HINT}`;
  return echo.text ? `${echo.text} · Enter 저장` : `단위: 만원 · ${MANWON_INPUT_HINT}`;
}
