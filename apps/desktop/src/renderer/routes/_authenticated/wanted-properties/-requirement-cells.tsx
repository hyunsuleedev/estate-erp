/**
 * 고객별 표에서 희망 조건을 칸에서 바로 고치는 편집기.
 *
 * 매물관리 표를 따른다 (사용자 의견 2026-11-17: "매물관리 페이지 table을 참고"):
 * - 칸 전체가 누르는 곳이다. 누르면 편집기가 칸에 붙어서 뜨고, 표의 줄 높이는 바뀌지 않는다.
 * - 고르면 끝나는 값(상태 · 긴급도 · 달력의 날짜)은 고르는 즉시 저장한다.
 * - 입력하는 값은 Enter나 저장 버튼으로 저장하고, 고친 채로 바깥을 눌러도 저장한다
 *   (매물관리 가격 칸의 commitOnBlur). Esc와 취소는 버린다.
 * - 저장 중 · 실패는 편집기 안에서 알리고, 실패해도 입력은 남긴다.
 *
 * 편집기는 매물관리 광고 표의 날짜 칸(property-ad-editable-cell.tsx의 AdDateCell)처럼 Popover로 띄운다.
 * 공용 EditableCell은 값 하나(글 · 숫자 · 칩)만 다루는데, 이 표의 칸은 범위 · 여러 개 선택 · 검색이
 * 필요하고, 아래쪽 줄에서 위로 뒤집혀야 해서다. 누르는 버튼의 data-editable-cell-trigger는 같게 둔다.
 *
 * 값을 읽고 검증하는 일은 -requirement-edit.ts가 한다.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Search, X } from 'lucide-react';
import { ApiError, type BuyerRequirement } from '@estate-erp/api-client';
import { pyeongToSqm, TRANSACTION_TYPE_LABELS } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { parseManwon } from '@/lib/manwon';
import { cn } from '@/lib/utils';
import { getStatusMeta } from '@/lib/status-config';
import { formatMoney } from '@/lib/format';
import { parseCellNumber } from '@/components/data-table/cell-edit-state';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toDateInputValue } from '../buyer-requirements/-buyer-utils';
import {
  addPlaceRegion,
  addPlaceSite,
  buildAreaChange,
  buildBudgetChange,
  buildMemoChange,
  buildMoveInDateChange,
  buildPlacesChange,
  buildSiteTypesChange,
  buildStatusChange,
  buildUrgencyChange,
  currentStatus,
  findFieldsChangedBehind,
  getSiteTypeOptions,
  rebaseAreaDraft,
  rebaseBudgetDraft,
  rebaseMemo,
  rebaseMoveInDate,
  rebasePlacesDraft,
  rebaseSiteTypes,
  rebaseStatus,
  rebaseUrgency,
  removePlaceRegion,
  removePlaceSite,
  REQUIREMENT_STATUSES,
  REQUIREMENT_TRANSACTION_TYPES,
  REQUIREMENT_URGENCIES,
  toAreaDraft,
  toBudgetDraft,
  toPlacesDraft,
  type BudgetDraft,
  type PlaceRegion,
  type PlacesDraft,
  type RangeDraft,
  type RequirementChange,
} from './-requirement-edit';

/**
 * 희망 조건의 상태 · 긴급도 알약. 매물관리 표의 매물상태 칸(StatusIndicator)과 같은 모양과 색이다:
 * 둥근 알약 + 왼쪽 점, 옅은 바탕에 같은 계열의 진한 글씨. 낱말은 공용 상태 이름(lib/status-config)을 읽는다.
 * 표의 칸과 그 칸에서 여는 고르는 목록이 함께 쓴다 (목록에서 고른 모양이 칸에 그대로 남게).
 * 색은 값의 뜻(tone)으로 고른다: 활성 = 초록, 보류 = 노랑, 급함 = 빨강, 여유 = 파랑, 완료 · 보통 = 회색.
 */
const BUYER_PILL_PALETTE: Record<string, { dotClassName: string; pillClassName: string }> = {
  success: { dotClassName: 'bg-[#6c9b7a]', pillClassName: 'bg-[#eef3ed] text-[#44745a]' },
  warning: { dotClassName: 'bg-[#dfab01]', pillClassName: 'bg-[#fbf3db] text-[#9f6b00]' },
  destructive: { dotClassName: 'bg-[#e16259]', pillClassName: 'bg-[#fdebec] text-[#b0423a]' },
  info: { dotClassName: 'bg-[#529cca]', pillClassName: 'bg-[#e7f3f8] text-[#337ea9]' },
  gray: { dotClassName: 'bg-[#b4b4b1]', pillClassName: 'bg-[#f1f1ef] text-[#787774]' },
};

function BuyerPill({ kind, status }: { kind: 'buyerStatus' | 'buyerUrgency'; status: string }) {
  const meta = getStatusMeta(kind, status);
  const palette = BUYER_PILL_PALETTE[meta.tone] ?? BUYER_PILL_PALETTE.gray;
  return (
    <span
      data-buyer-pill={kind}
      className={cn(
        'inline-flex h-5 max-w-full items-center gap-[5px] rounded-full pl-[7px] pr-[9px] text-[14px] font-[450] leading-5',
        palette.pillClassName,
      )}
    >
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', palette.dotClassName)} />
      <span className="truncate">{meta.label}</span>
    </span>
  );
}

export function BuyerStatusPill({ status }: { status: string }) {
  return <BuyerPill kind="buyerStatus" status={status} />;
}

export function BuyerUrgencyPill({ status }: { status: string }) {
  return <BuyerPill kind="buyerUrgency" status={status} />;
}

/** 고친 값을 저장한다. 실패하면 던진다 (편집기가 받아서 알린다). */
export type RequirementEditHandler = (
  requirement: BuyerRequirement,
  change: RequirementChange,
) => Promise<void>;

/**
 * 저장 직전에 그 조건의 지금 값을 서버에서 받아 온다. 지워졌으면 던진다.
 * 매물관리 표는 서버가 "그 사이 누가 고쳤는지"를 검사해 주지만(expectedUpdatedAt) 구매 조건 수정에는 그 검사가 없다.
 * 그래서 편집기가 저장 직전에 직접 확인한다: 화면이 아직 받지 못한 변경 위에 예전 값을 덮거나,
 * 매매가로 넣은 금액을 그 사이 전세가 된 조건에 저장하지 않게.
 */
export type RequirementRefreshHandler = (
  requirement: BuyerRequirement,
) => Promise<BuyerRequirement>;

export type RequirementField =
  | 'siteTypes'
  | 'area'
  | 'budget'
  | 'places'
  | 'moveInDate'
  | 'memo'
  | 'status'
  | 'urgency';

interface EditorApi<Draft> {
  draft: Draft;
  setDraft: (next: Draft) => void;
  saving: boolean;
  /** 초안(값을 넘기면 그 값)을 저장하고 닫는다. 바뀐 것이 없으면 닫기만 한다. */
  save: (draft?: Draft) => void;
  cancel: () => void;
}

const SAVE_ERROR = '저장하지 못했습니다. 입력은 유지됩니다. 다시 시도해 주세요.';
/** 편집기를 열어 둔 사이 다른 곳에서 지워진 조건. 다시 시도해도 저장되지 않으므로 그렇게 알린다. */
const DELETED_ERROR = '다른 곳에서 지워진 조건이라 저장할 수 없습니다.';
/** 고치려는 칸이 화면 모르게 바뀌어 있었다. 지금 값은 이미 화면에 와 있으니, 보고 다시 하게 한다. */
const CHANGED_BEHIND_ERROR =
  '그 사이 다른 곳에서 이 값이 바뀌었습니다. 지금 값을 확인하고 다시 저장해 주세요.';
/** 고르면 저장하는 칸에는 저장 버튼이 없다 */
const CHANGED_BEHIND_PICK_ERROR =
  '그 사이 다른 곳에서 이 값이 바뀌었습니다. 지금 값을 확인하고 다시 골라 주세요.';

/**
 * 칸 전체를 차지하는 버튼. 좌우 여백은 다른 칸과 같은 10px.
 * 열려 있는 칸은 매물관리의 편집 중인 칸처럼 파란 테두리로 알린다.
 */
const CELL_TRIGGER_CLASS =
  'flex min-w-0 flex-1 cursor-pointer items-center px-2.5 text-left transition-colors hover:bg-[rgba(55,53,47,0.04)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-white data-[state=open]:outline-2 data-[state=open]:-outline-offset-2 data-[state=open]:outline-info';

/** 바깥을 눌러 저장할 때 그 누름을 받아 주는 막. 저장이 끝나기 전에 다른 것이 눌리지 않게 한다. */
const GUARD_ATTRIBUTE = 'data-requirement-edit-guard';

function findCellTriggerAt(x: number, y: number): HTMLElement | null {
  const top = document
    .elementsFromPoint(x, y)
    .find((element) => !element.hasAttribute(GUARD_ATTRIBUTE));
  return top?.closest<HTMLElement>('[data-editable-cell-trigger]') ?? null;
}

function RequirementCellEditor<Draft>({
  requirement,
  field,
  ariaLabel,
  popoverLabel,
  onEdit,
  onRefresh,
  onEditingChange,
  blockedReason,
  createDraft,
  rebaseDraft,
  toChange,
  renderEditor,
  contentClassName,
  triggerClassName,
  children,
}: {
  requirement: BuyerRequirement;
  field: RequirementField;
  /** 누르는 버튼의 이름. 누구의 어느 칸이고 지금 값이 무엇인지 담는다. */
  ariaLabel: string;
  popoverLabel: string;
  onEdit: RequirementEditHandler;
  /** 넘기면 저장 직전에 지금 값을 받아, 그 위에 초안을 다시 얹고 무엇을 보낼지 다시 정한다 */
  onRefresh?: RequirementRefreshHandler;
  /** 편집기가 열리고 닫힐 때 알린다. 표가 열려 있는 동안 이 줄을 남겨 두는 데 쓴다. */
  onEditingChange?: (editing: boolean) => void;
  /**
   * 넘기면 이 칸에서는 저장하지 않고 이 이유를 보인다 (입력은 그대로 둔다).
   * 표가 남겨 둔 줄 — 목록에서 빠진 조건 — 에 쓴다: 지금 값을 알 수 없는 조건에 저장하면 안 된다.
   */
  blockedReason?: string;
  createDraft: (requirement: BuyerRequirement) => Draft;
  /**
   * 편집기를 열어 둔 사이 조건이 새로 왔을 때, 초안을 지금 값 위에 다시 얹는다:
   * 사용자가 손댄 값만 남기고 나머지는 지금 값을 따른다 (-requirement-edit.ts의 rebase…).
   */
  rebaseDraft: (base: BuyerRequirement, live: BuyerRequirement, draft: Draft) => Draft;
  /**
   * 초안을 그 조건(live)에 저장할 변경으로 바꾼다. 바뀐 것이 없으면 null, 받을 수 없는 입력이면 던진다.
   * 화면의 지금 값으로도, 저장 직전에 받아 온 값으로도 부른다.
   */
  toChange: (live: BuyerRequirement, draft: Draft) => RequirementChange | null;
  renderEditor: (editor: EditorApi<Draft>) => ReactNode;
  contentClassName?: string;
  /** 표의 칸이 아닌 자리(여러 줄 메모)에서 버튼 모양을 덧붙인다 */
  triggerClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // 초안과, 그 초안을 만들 때(또는 마지막으로 고칠 때) 보고 있던 조건.
  const [session, setSession] = useState<{
    base: BuyerRequirement;
    draft: Draft;
  } | null>(null);
  // 열어 둔 사이 목록이 새로 오면(다른 사람의 수정 · 다시 받아 오기) 손대지 않은 값은 예전 값이 된다.
  // 그대로 지금 값과 견주면 "고친 값"으로 읽혀, 바깥을 누르기만 해도 예전 값이 새 값을 덮는다.
  // 그래서 늘 지금 조건 위에 다시 얹은 초안을 쓴다: 보이는 것 · 고쳤는지 판단 · 저장이 모두 같은 값을 본다.
  const draft =
    session === null
      ? null
      : session.base === requirement
        ? session.draft
        : rebaseDraft(session.base, requirement, session.draft);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // 저장하는 동안 꺼 둔 입력칸은 포커스를 잃는다. 저장에 실패하면 다시 켜진 뒤에 돌려주어,
  // 고쳐 쓰거나 Enter로 바로 다시 시도할 수 있게 한다.
  const refocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (saving) return;
    const target = refocusRef.current;
    refocusRef.current = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, [saving]);

  // 편집기가 열려 있는 동안 표가 이 줄을 남겨 두게 한다. 목록이 새로 와서 줄이 필터에서 벗어나거나
  // 목록에서 빠지면 편집기도 함께 사라지고, 고치던 입력을 잃는다. 어떻게 닫히든(저장 · 취소 · 줄이 사라짐) 알린다.
  const onEditingChangeRef = useRef(onEditingChange);
  useEffect(() => {
    onEditingChangeRef.current = onEditingChange;
  });
  useEffect(() => {
    if (!open) return;
    onEditingChangeRef.current?.(true);
    return () => onEditingChangeRef.current?.(false);
  }, [open]);

  const isChanged = (value: Draft | null) => {
    if (value === null) return false;
    try {
      return toChange(requirement, value) !== null;
    } catch {
      // 받을 수 없는 입력도 사용자가 손댄 것이다. 조용히 버리지 않는다.
      return true;
    }
  };
  const dirty = open && isChanged(draft);

  // 닫을 때 포커스를 이 칸으로 되돌리지 않아야 하는 경우: 사용자가 이미 다른 곳으로 옮겨 갔을 때.
  // 되돌리면 방금 옮겨 간 곳(다른 칸의 편집기 · 검색 칸)이 포커스를 빼앗긴다.
  const keepFocusElsewhereRef = useRef(false);

  /**
   * picked: 사용자가 방금 고른 값 (상태 · 긴급도의 선택지, 달력의 날짜). 없으면 편집기의 초안을 저장한다.
   */
  const save = async (
    picked: Draft | undefined,
    leaving?: { nextTrigger: HTMLElement | null; focusMoved: boolean },
  ) => {
    const value = picked !== undefined ? picked : draft;
    if (savingRef.current || value === null) return;
    let change: RequirementChange | null;
    try {
      change = toChange(requirement, value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '입력값을 확인해 주세요.');
      return;
    }
    if (!change) {
      setOpen(false);
      return;
    }
    if (blockedReason) {
      // 이유는 편집기에 이미 보인다. 닫지도 저장하지도 않는다 — 입력을 조용히 버리지 않는다.
      return;
    }
    const focused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      let target = requirement;
      if (onRefresh) {
        // 저장 직전에 이 조건의 지금 값을 받아, 그 위에 초안을 다시 얹고 무엇을 보낼지 다시 정한다.
        // 목록이 그 사이 새로 온 경우와 똑같이 다룬다: 손대지 않은 값은 지금 값을 따르고,
        // 금액을 고치는 사이 거래유형이 바뀌었으면 저장하지 않고 다시 고르게 한다.
        const latest = await onRefresh(requirement);
        const rebased =
          picked !== undefined || session === null
            ? // 방금 고른 값은 "고를 때 화면에 보이던 값"에서 바꾼 것이다. 편집기를 열 때의 값을 기준으로 삼으면,
              // 그 값과 같은 것을 고른 경우(그 사이 다른 곳에서 바뀐 값을 되돌리려고) 손대지 않은 것으로 읽혀
              // 저장 없이 닫힌다.
              rebaseDraft(requirement, latest, value)
            : // 초안은 얹기 전 원본으로 다시 얹는다 (화면이 곧 그리게 될 것과 같은 계산)
              rebaseDraft(session.base, latest, session.draft);
        try {
          change = toChange(latest, rebased);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : '입력값을 확인해 주세요.');
          refocusRef.current = focused;
          return;
        }
        // 고치려는 바로 그 칸이 화면 모르게 바뀌어 있었으면, 본 적 없는 값을 덮지 않는다.
        // 받아 온 값은 화면에 반영되므로 다시 저장을 누르면 그때는 보고 고친 것이 된다.
        if (change && findFieldsChangedBehind(requirement, latest, change).length > 0) {
          setError(picked !== undefined ? CHANGED_BEHIND_PICK_ERROR : CHANGED_BEHIND_ERROR);
          refocusRef.current = focused;
          return;
        }
        target = latest;
      }
      // 받아 온 값 위에서 보니 보낼 것이 없으면(다른 곳에서 이미 같은 값이 됐다) 저장 없이 닫는다
      if (change) await onEdit(target, change);
      const nextTrigger = leaving?.nextTrigger ?? null;
      keepFocusElsewhereRef.current = Boolean(nextTrigger || leaving?.focusMoved);
      setOpen(false);
      // 다른 칸을 눌러서 벗어났다면 저장한 뒤에 그 칸을 연다 (한 번 눌러서 저장하고 넘어간다)
      if (nextTrigger) {
        requestAnimationFrame(() => {
          if (nextTrigger.isConnected) nextTrigger.click();
        });
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.statusCode === 404 ? DELETED_ERROR : SAVE_ERROR,
      );
      refocusRef.current = focused;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (savingRef.current) return;
        if (next) {
          setSession({ base: requirement, draft: createDraft(requirement) });
          setError('');
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          data-editable-cell-trigger
          data-cell-record-id={requirement.id}
          data-cell-field={field}
          aria-label={ariaLabel}
          className={cn(CELL_TRIGGER_CLASS, triggerClassName)}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        data-requirement-cell-editor={field}
        aria-label={popoverLabel}
        aria-busy={saving}
        className={cn('p-0', contentClassName)}
        onInteractOutside={(event) => {
          if (savingRef.current) {
            event.preventDefault();
            return;
          }
          // 고친 것이 없으면 그냥 닫는다. 고친 것이 있으면 닫지 않고 저장부터 한다.
          if (!isChanged(draft)) return;
          event.preventDefault();
          const original = event.detail.originalEvent;
          const byPointer = 'clientX' in original;
          const nextTrigger = byPointer
            ? findCellTriggerAt(original.clientX, original.clientY)
            : null;
          void save(undefined, {
            nextTrigger: nextTrigger === triggerRef.current ? null : nextTrigger,
            // 누른 것은 막이 받았으므로 포커스가 옮겨 가지 않았다. 키보드 · 단축키로 벗어났으면 옮겨 간 것이다.
            focusMoved: !byPointer,
          });
        }}
        onCloseAutoFocus={(event) => {
          if (!keepFocusElsewhereRef.current) return;
          keepFocusElsewhereRef.current = false;
          event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (savingRef.current) event.preventDefault();
        }}
      >
        {draft !== null &&
          renderEditor({
            draft,
            setDraft: (next) => {
              // next는 지금 조건 위에 얹은 초안에서 나왔으므로, 기준도 지금 조건으로 옮긴다
              setSession({ base: requirement, draft: next });
              setError('');
            },
            saving,
            save: (value) => void save(value),
            cancel: () => {
              if (!savingRef.current) setOpen(false);
            },
          })}
        {(saving || blockedReason || error) && (
          <p
            role={saving ? 'status' : 'alert'}
            className={cn(
              'flex items-start gap-1.5 border-t border-border px-3 py-1.5 text-[11px] leading-4',
              saving ? 'text-muted-foreground' : 'text-destructive',
            )}
          >
            {saving && (
              <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin motion-reduce:animate-none" />
            )}
            {/* 저장을 막은 이유는 저장을 눌러 보기 전부터 보인다 */}
            {saving ? '저장 중…' : (blockedReason ?? error)}
          </p>
        )}
      </PopoverContent>
      {dirty &&
        createPortal(
          <div {...{ [GUARD_ATTRIBUTE]: '' }} className="fixed inset-0 z-40" />,
          document.body,
        )}
    </Popover>
  );
}

// ── 편집기 공용 조각 ─────────────────────────────────────────────

/** 목록 안에서 ↑↓ · Home · End로 옮겨 다닌다 */
function moveFocusInList(event: KeyboardEvent<HTMLElement>) {
  const step =
    event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : null;
  if (step === null && event.key !== 'Home' && event.key !== 'End') return;
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[data-list-item]:not(:disabled)'),
  );
  if (items.length === 0) return;
  event.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (current + (step ?? 0) + items.length) % items.length;
  items[next]?.focus();
}

const LIST_ITEM_CLASS =
  'flex shrink-0 items-center rounded-sm px-2 py-1.5 text-left text-[13px] outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-60';

function EditorFooter({
  saving,
  canSave = true,
  onCancel,
  leading,
}: {
  saving: boolean;
  canSave?: boolean;
  onCancel: () => void;
  /** 왼쪽 끝에 둘 것 (입주 희망일의 "날짜 지우기" 등) */
  leading?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5 border-t border-border px-2 py-1.5">
      {leading && <div className="mr-auto flex items-center">{leading}</div>}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2.5 text-[12px]"
        disabled={saving}
        onClick={onCancel}
      >
        취소
      </Button>
      <Button
        type="submit"
        size="sm"
        className="h-7 px-2.5 text-[12px]"
        disabled={saving || !canSave}
      >
        저장
      </Button>
    </div>
  );
}

// ── 상태 · 긴급도: 고르면 저장 ───────────────────────────────────

function ChipSelectEditor({
  kind,
  label,
  options,
  value,
  editor,
  confirm,
}: {
  kind: 'buyerStatus' | 'buyerUrgency';
  label: string;
  options: readonly string[];
  /** 지금 저장된 값 */
  value: string;
  editor: EditorApi<string>;
  /** 이 값을 고르면 바로 저장하지 않고 한 번 묻는다 (완료하면 연결한 매물의 진행도 끝나는 경우) */
  confirm?: { value: string; message: string; confirmLabel: string };
}) {
  const hasCurrent = options.includes(value);
  const [asking, setAsking] = useState(false);
  if (asking && confirm) {
    return (
      <div role="alertdialog" aria-label={`${label} 확인`} className="space-y-2 p-2.5">
        <p className="break-keep text-[12.5px] leading-[18px] text-foreground">{confirm.message}</p>
        <div className="flex justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-[12px]"
            disabled={editor.saving}
            onClick={() => setAsking(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            autoFocus
            className="h-7 px-2.5 text-[12px]"
            disabled={editor.saving}
            onClick={() => editor.save(confirm.value)}
          >
            {confirm.confirmLabel}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div
      role="listbox"
      aria-label={`${label} 선택`}
      className="flex flex-col gap-0.5 p-1"
      onKeyDown={moveFocusInList}
    >
      {options.map((option, index) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="option"
            data-list-item
            aria-selected={selected}
            disabled={editor.saving}
            autoFocus={selected || (!hasCurrent && index === 0)}
            onClick={() =>
              confirm && option === confirm.value && option !== value
                ? setAsking(true)
                : editor.save(option)
            }
            className={cn(LIST_ITEM_CLASS, 'justify-between')}
          >
            {/* 표의 칸과 같은 꼬리표라 고르기 전에 결과가 그대로 보인다 */}
            {kind === 'buyerStatus' ? (
              <BuyerStatusPill status={option} />
            ) : (
              <BuyerUrgencyPill status={option} />
            )}
            {selected && (
              <Check aria-label="현재 값" className="ml-2 size-3.5 text-muted-foreground" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── 매물 유형: 여러 개 고르기 ────────────────────────────────────

function SiteTypesEditor({
  options,
  editor,
}: {
  options: { value: string; label: string }[];
  editor: EditorApi<string[]>;
}) {
  const { draft, setDraft, saving } = editor;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        editor.save();
      }}
    >
      <div
        role="group"
        aria-label="매물 유형"
        className="flex flex-col gap-0.5 p-1"
        onKeyDown={moveFocusInList}
      >
        {options.map((option, index) => {
          const checked = draft.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              data-list-item
              aria-checked={checked}
              disabled={saving}
              autoFocus={index === 0}
              onClick={() =>
                setDraft(
                  checked
                    ? draft.filter((type) => type !== option.value)
                    : [...draft, option.value],
                )
              }
              className={cn(LIST_ITEM_CLASS, 'gap-2.5')}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                  checked
                    ? 'border-foreground bg-foreground text-white'
                    : 'border-[#d6d5d0] bg-white',
                )}
              >
                {checked && <Check className="size-3" strokeWidth={2.5} />}
              </span>
              {option.label}
            </button>
          );
        })}
      </div>
      <EditorFooter saving={saving} onCancel={editor.cancel} />
    </form>
  );
}

// ── 범위 입력: 희망 평형 · 예산 ──────────────────────────────────

/**
 * 입력한 수를 읽기 쉬운 말로 되비춘다 (9억, 109.09㎡). 읽을 수 없는 입력에는 비운다.
 * 금액은 "8억"처럼 적은 글도 읽는다(앱 공용 규칙 lib/manwon.ts), 평형은 숫자만.
 */
function readHint(raw: string, format: (value: number) => string, money = false): string {
  if (money) {
    const parsed = parseManwon(raw);
    return parsed.valid && parsed.value ? format(parsed.value) : '';
  }
  const parsed = parseCellNumber(raw, 0);
  return parsed.valid && parsed.value ? format(parsed.value) : '';
}

function AmountField({
  label,
  placeholder,
  unit,
  value,
  onChange,
  formatHint,
  inputMode,
  disabled,
  autoFocus,
}: {
  label: string;
  placeholder: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  formatHint: (value: number) => string;
  inputMode: 'numeric' | 'decimal';
  disabled: boolean;
  autoFocus?: boolean;
}) {
  const hint = readHint(value, formatHint, unit === '만원');
  return (
    <div className="min-w-0">
      <div className="relative">
        <Input
          type="text"
          inputMode={inputMode}
          aria-label={`${label} (${unit})`}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          className="h-8 pl-2.5 pr-9 text-[13px] tabular-nums md:text-[13px]"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] text-muted-foreground">
          {unit}
        </span>
      </div>
      <p
        className={cn(
          'mt-0.5 h-4 truncate text-[11px] leading-4 text-info',
          !hint && 'invisible',
        )}
      >
        {hint || '-'}
      </p>
    </div>
  );
}

function RangeFields({
  legend,
  unit,
  value,
  onChange,
  formatHint,
  inputMode,
  disabled,
  autoFocus,
}: {
  legend: string;
  unit: string;
  value: RangeDraft;
  onChange: (value: RangeDraft) => void;
  formatHint: (value: number) => string;
  inputMode: 'numeric' | 'decimal';
  disabled: boolean;
  autoFocus?: boolean;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[11px] font-medium text-muted-foreground">
        {legend}
      </legend>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5">
        <AmountField
          label={`최소 ${legend}`}
          placeholder="최소"
          unit={unit}
          value={value.min}
          onChange={(min) => onChange({ ...value, min })}
          formatHint={formatHint}
          inputMode={inputMode}
          disabled={disabled}
          autoFocus={autoFocus}
        />
        <span aria-hidden="true" className="pt-1.5 text-xs text-muted-foreground">
          ~
        </span>
        <AmountField
          label={`최대 ${legend}`}
          placeholder="최대"
          unit={unit}
          value={value.max}
          onChange={(max) => onChange({ ...value, max })}
          formatHint={formatHint}
          inputMode={inputMode}
          disabled={disabled}
        />
      </div>
    </fieldset>
  );
}

function AreaEditor({ editor }: { editor: EditorApi<RangeDraft> }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        editor.save();
      }}
    >
      <div className="px-3 pb-1 pt-3">
        <RangeFields
          legend="희망 평형"
          unit="평"
          value={editor.draft}
          onChange={editor.setDraft}
          formatHint={(pyeong) => `${pyeongToSqm(pyeong)}㎡`}
          inputMode="decimal"
          disabled={editor.saving}
          autoFocus
        />
        <p className="text-[11px] leading-4 text-muted-foreground">
          공급면적 기준 · 비워 두면 제한이 없습니다
        </p>
      </div>
      <EditorFooter saving={editor.saving} onCancel={editor.cancel} />
    </form>
  );
}

const BUDGET_LEGEND: Record<string, string> = {
  '': '금액',
  sale: '매매가',
  jeonse: '전세가',
};

function BudgetEditor({ editor }: { editor: EditorApi<BudgetDraft> }) {
  const { draft, setDraft, saving } = editor;
  // 금액을 고치는 사이 거래유형이 다른 곳에서 바뀌었다. 입력은 보던 유형 그대로 두고,
  // 어느 유형으로 저장할지 사용자가 고를 때까지 저장을 막는다 (rebaseBudgetDraft).
  const typeConflict = draft.typeConflict;
  const awaitingType = typeConflict !== undefined;
  const money = {
    unit: '만원',
    formatHint: formatMoney,
    inputMode: 'numeric' as const,
    disabled: saving,
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        editor.save();
      }}
    >
      <div className="space-y-2.5 px-3 pb-1 pt-3">
        {awaitingType && (
          <p
            role="alert"
            data-budget-type-conflict
            className="rounded-md bg-warning-soft px-2 py-1.5 text-[12px] leading-[18px] text-warning-strong"
          >
            {typeConflict
              ? `그 사이 거래유형이 ${TRANSACTION_TYPE_LABELS[typeConflict]}로 바뀌었습니다.`
              : '그 사이 거래유형이 지워졌습니다.'}{' '}
            입력한 금액을 어느 유형으로 저장할지 골라 주세요.
          </p>
        )}
        {/* 위쪽 거래유형 탭과 같은 묶음 모양. 여기서는 고르는 값이라 radio로 읽힌다 */}
        <div
          role="radiogroup"
          aria-label="거래유형"
          className="flex h-[30px] w-fit items-center gap-px rounded-full bg-[rgba(55,53,47,0.08)] p-0.5"
        >
          {REQUIREMENT_TRANSACTION_TYPES.map((type) => {
            // 유형을 다시 골라야 하는 동안에는 아무것도 고른 것으로 보이지 않는다
            const selected = !awaitingType && draft.transactionType === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={saving}
                onClick={() =>
                  setDraft({ ...draft, transactionType: type, typeConflict: undefined })
                }
                className={cn(
                  'inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20',
                  selected
                    ? 'bg-foreground font-medium text-white'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {TRANSACTION_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>

        {draft.transactionType === 'monthly' ? (
          <>
            <RangeFields
              {...money}
              legend="보증금"
              value={draft.deposit}
              onChange={(deposit) => setDraft({ ...draft, deposit })}
              autoFocus
            />
            <RangeFields
              {...money}
              legend="월세"
              value={draft.monthlyRent}
              onChange={(monthlyRent) => setDraft({ ...draft, monthlyRent })}
            />
          </>
        ) : (
          <RangeFields
            {...money}
            legend={BUDGET_LEGEND[draft.transactionType] ?? '금액'}
            value={draft.price}
            onChange={(price) => setDraft({ ...draft, price })}
            autoFocus
          />
        )}
      </div>
      <EditorFooter saving={saving} canSave={!awaitingType} onCancel={editor.cancel} />
    </form>
  );
}

// ── 입주 희망일 ──────────────────────────────────────────────────

function toDateInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 낮 12시로 읽어 시간대 때문에 하루가 밀리지 않게 한다 */
function fromDateInput(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function MoveInDateEditor({
  editor,
  hasSavedDate,
}: {
  editor: EditorApi<string>;
  /** 저장된 입주 희망일이 있는지. 있으면 "날짜 지우기"를 보인다. */
  hasSavedDate: boolean;
}) {
  const { draft, setDraft, saving } = editor;
  const selected = fromDateInput(draft);
  // 달력이 보여 주는 달. 날짜가 밖에서 바뀌면(열어 둔 사이 목록이 새로 옴) 그 날짜의 달로 따라간다.
  const [view, setView] = useState(() => ({ month: selected ?? new Date(), shownFor: draft }));
  const month = view.shownFor === draft ? view.month : (selected ?? view.month);
  const setMonth = (next: Date, shownFor = draft) => setView({ month: next, shownFor });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        editor.save();
      }}
    >
      <div className="border-b border-border p-2">
        <Input
          type="date"
          aria-label="입주 희망일 입력"
          value={draft}
          disabled={saving}
          onChange={(event) => {
            setDraft(event.target.value);
            const typed = fromDateInput(event.target.value);
            setMonth(typed ?? month, event.target.value);
          }}
          className="h-8 text-[13px] tabular-nums md:text-[13px]"
        />
      </div>
      <Calendar
        mode="single"
        required
        selected={selected}
        month={month}
        onMonthChange={(next) => setMonth(next)}
        disabled={saving}
        onSelect={(date) => {
          if (!date) return;
          const next = toDateInput(date);
          setDraft(next);
          editor.save(next);
        }}
      />
      <EditorFooter
        saving={saving}
        onCancel={editor.cancel}
        leading={
          // 손님이 "날짜는 아직 몰라요"로 바꾸면 비운다. 빈 칸으로 저장해도 같다.
          hasSavedDate ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px] text-muted-foreground"
              disabled={saving}
              onClick={() => {
                setDraft('');
                editor.save('');
              }}
            >
              날짜 지우기
            </Button>
          ) : undefined
        }
      />
    </form>
  );
}

// ── 고객 메모 ────────────────────────────────────────────────────

function MemoEditor({ editor }: { editor: EditorApi<string> }) {
  const { draft, setDraft, saving } = editor;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        editor.save();
      }}
    >
      <div className="p-2">
        <textarea
          autoFocus
          aria-label="고객 메모 입력"
          value={draft}
          disabled={saving}
          rows={4}
          placeholder="고객 메모"
          className="block max-h-[240px] min-h-[84px] w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-2 text-[13px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => {
            // 열면 글 끝에서 이어 쓴다
            const end = event.currentTarget.value.length;
            event.currentTarget.setSelectionRange(end, end);
          }}
          onKeyDown={(event) => {
            // 매물관리 메모와 같다: Enter 저장, Shift+Enter 줄바꿈. 한글 조합 중의 Enter는 넘긴다.
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              editor.save();
            }
          }}
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Enter 저장 · Shift+Enter 줄바꿈
        </p>
      </div>
      <EditorFooter saving={saving} onCancel={editor.cancel} />
    </form>
  );
}

// ── 희망 지역 · 단지 ─────────────────────────────────────────────

const REGION_LEVEL_LABEL: Record<PlaceRegion['level'], string> = {
  province: '시도',
  district: '시군구',
  ward: '읍면동',
};

function PlaceChip({
  label,
  removeLabel,
  disabled,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-0.5 rounded-[4px] bg-neutral-soft pl-1.5 pr-0.5 text-[12px] text-foreground">
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={removeLabel}
        disabled={disabled}
        onClick={onRemove}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-[3px] text-muted-foreground hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function PlaceOption({
  label,
  detail,
  selected,
  disabled,
  onToggle,
}: {
  label: string;
  detail: string;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      data-list-item
      aria-selected={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cn(LIST_ITEM_CLASS, 'w-full gap-2')}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="max-w-[55%] shrink-0 truncate text-[11.5px] text-muted-foreground">
        {detail}
      </span>
      <Check
        aria-hidden="true"
        className={cn('size-3.5 shrink-0 text-muted-foreground', !selected && 'invisible')}
      />
    </button>
  );
}

function PlaceOptionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="pb-1 last:pb-0">
      <p
        aria-hidden="true"
        className="px-2 pb-0.5 pt-1 text-[11px] font-medium text-muted-foreground"
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function PlacesEditor({ editor }: { editor: EditorApi<PlacesDraft> }) {
  const { draft, setDraft, saving } = editor;
  const [query, setQuery] = useState('');
  const term = useDebouncedValue(query.trim(), 200);
  const searching = term.length > 0;
  const listRef = useRef<HTMLDivElement>(null);

  // 조건 등록 화면과 같은 조회라 캐시를 함께 쓴다
  // 다음 결과가 올 때까지 앞선 결과를 남겨 두어 글자를 칠 때마다 목록이 비었다 차지 않게 한다
  const regionQuery = useQuery({
    queryKey: ['regions', 'search', term],
    queryFn: () => api.regions.search(term, 10),
    enabled: searching,
    placeholderData: (previous) => previous,
  });
  const siteQuery = useQuery({
    queryKey: ['sites', 'central-search', term],
    queryFn: () => api.officeSites.searchCentral(term),
    enabled: searching,
    placeholderData: (previous) => previous,
  });
  const officeSiteQuery = useQuery({
    queryKey: ['office-sites'],
    queryFn: () => api.officeSites.findAll(),
  });

  const regions = regionQuery.data ?? [];
  const sites = (siteQuery.data ?? []).slice(0, 12);
  const managedSites = (officeSiteQuery.data ?? []).flatMap((item) =>
    item.site ? [item.site] : [],
  );
  const isLoading = searching && (regionQuery.isLoading || siteQuery.isLoading);
  const isFailed = searching && (regionQuery.isError || siteQuery.isError);

  const hasRegion = (region: { level: string; code: string }) =>
    draft.regions.some((item) => item.level === region.level && item.code === region.code);
  const hasSite = (siteId: string) => draft.sites.some((item) => item.siteId === siteId);
  const toggleSite = (site: { id: string; name: string }) =>
    setDraft(
      hasSite(site.id)
        ? removePlaceSite(draft, site.id)
        : addPlaceSite(draft, { siteId: site.id, name: site.name }),
    );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        editor.save();
      }}
    >
      {/* 고른 것. 높이를 고정해 두어, 고르는 동안 아래 목록이 밀리지 않는다 */}
      <div
        data-places-selected
        aria-label="고른 지역과 단지"
        className="flex h-[66px] flex-wrap content-start gap-1 overflow-y-auto border-b border-border p-2"
      >
        {draft.regions.length === 0 && draft.sites.length === 0 && (
          <p className="text-[12px] leading-6 text-muted-foreground">
            고른 지역 · 단지가 없습니다
          </p>
        )}
        {draft.regions.map((region) => (
          <PlaceChip
            key={`${region.level}:${region.code}`}
            label={region.label}
            removeLabel={`${region.label} 빼기`}
            disabled={saving}
            onRemove={() => setDraft(removePlaceRegion(draft, region))}
          />
        ))}
        {draft.sites.map((site) => (
          <PlaceChip
            key={site.siteId}
            label={site.name}
            removeLabel={`${site.name} 빼기`}
            disabled={saving}
            onRemove={() => setDraft(removePlaceSite(draft, site.siteId))}
          />
        ))}
      </div>

      <div className="flex h-9 items-center gap-2 border-b border-border px-2.5">
        <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={query}
          autoFocus
          disabled={saving}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter는 찾는 동안 저장으로 넘어가지 않게 하고, ↓는 결과로 내려간다
            if (event.key === 'Enter') event.preventDefault();
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              listRef.current?.querySelector<HTMLElement>('[data-list-item]')?.focus();
            }
          }}
          placeholder="지역이나 단지 이름으로 찾기"
          aria-label="지역 · 단지 검색"
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div
        ref={listRef}
        role="listbox"
        aria-label={searching ? '검색 결과' : '관리단지'}
        aria-multiselectable="true"
        className="h-[208px] overflow-y-auto p-1"
        onKeyDown={moveFocusInList}
      >
        {!searching ? (
          managedSites.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] leading-5 text-muted-foreground">
              이름을 입력하면 지역과 단지를 찾아 줍니다.
            </p>
          ) : (
            <PlaceOptionGroup title="관리단지">
              {managedSites.map((site) => (
                <PlaceOption
                  key={site.id}
                  label={site.name}
                  detail={site.jibunAddress ?? site.roadAddress ?? ''}
                  selected={hasSite(site.id)}
                  disabled={saving}
                  onToggle={() => toggleSite(site)}
                />
              ))}
            </PlaceOptionGroup>
          )
        ) : isLoading ? (
          <p className="px-2 py-1.5 text-[12px] leading-5 text-muted-foreground">찾는 중…</p>
        ) : isFailed ? (
          <p role="alert" className="px-2 py-1.5 text-[12px] leading-5 text-destructive">
            찾지 못했습니다. 잠시 뒤 다시 입력해 주세요.
          </p>
        ) : regions.length === 0 && sites.length === 0 ? (
          <p className="px-2 py-1.5 text-[12px] leading-5 text-muted-foreground">
            일치하는 지역 · 단지가 없습니다.
          </p>
        ) : (
          <>
            {regions.length > 0 && (
              <PlaceOptionGroup title="지역">
                {regions.map((region) => (
                  <PlaceOption
                    key={`${region.level}:${region.code}`}
                    label={region.fullName}
                    detail={REGION_LEVEL_LABEL[region.level]}
                    selected={hasRegion(region)}
                    disabled={saving}
                    onToggle={() => {
                      const place = {
                        level: region.level,
                        code: region.code,
                        label: region.name,
                      };
                      setDraft(
                        hasRegion(region)
                          ? removePlaceRegion(draft, place)
                          : addPlaceRegion(draft, place),
                      );
                    }}
                  />
                ))}
              </PlaceOptionGroup>
            )}
            {sites.length > 0 && (
              <PlaceOptionGroup title="단지">
                {sites.map((site) => (
                  <PlaceOption
                    key={site.id}
                    label={site.name}
                    detail={site.jibunAddress ?? site.roadAddress ?? ''}
                    selected={hasSite(site.id)}
                    disabled={saving}
                    onToggle={() => toggleSite(site)}
                  />
                ))}
              </PlaceOptionGroup>
            )}
          </>
        )}
      </div>
      <EditorFooter saving={saving} onCancel={editor.cancel} />
    </form>
  );
}

// ── 칸 ───────────────────────────────────────────────────────────

/**
 * 표의 칸 하나. children은 칸에 보이는 값이고, 누르면 그 칸에 맞는 편집기가 뜬다.
 * owner는 고객 이름, valueText는 지금 보이는 값이다 (읽어 주는 이름에 쓴다).
 */
export function EditableRequirementCell({
  field,
  requirement,
  owner,
  label,
  valueText,
  onEdit,
  onRefresh,
  onEditingChange,
  blockedReason,
  triggerClassName,
  openMatchCount = 0,
  children,
}: {
  field: RequirementField;
  requirement: BuyerRequirement;
  owner: string;
  label: string;
  valueText: string;
  onEdit: RequirementEditHandler;
  onRefresh?: RequirementRefreshHandler;
  onEditingChange?: (editing: boolean) => void;
  blockedReason?: string;
  triggerClassName?: string;
  /** 이 조건에서 진행 중인 매칭 수. 완료로 바꾸면 함께 닫히므로 상태 칸이 먼저 묻는다. */
  openMatchCount?: number;
  children: ReactNode;
}) {
  const shared = {
    requirement,
    field,
    onEdit,
    onRefresh,
    onEditingChange,
    blockedReason,
    triggerClassName,
    ariaLabel: `${owner} ${label} ${valueText} 편집`,
    popoverLabel: `${owner} ${label} 편집`,
  };

  switch (field) {
    case 'status': {
      const value = currentStatus(requirement);
      return (
        <RequirementCellEditor
          {...shared}
          contentClassName="w-[168px]"
          createDraft={(source): string => currentStatus(source)}
          rebaseDraft={rebaseStatus}
          toChange={buildStatusChange}
          renderEditor={(editor) => (
            <ChipSelectEditor
              kind="buyerStatus"
              label={label}
              options={REQUIREMENT_STATUSES}
              value={value}
              editor={editor}
              confirm={
                openMatchCount > 0
                  ? {
                      value: 'completed',
                      message: `완료로 바꾸면 연결한 매물 ${openMatchCount}건의 진행도 함께 끝납니다. 다시 활성으로 바꿔도 끝난 진행은 저절로 다시 열리지 않습니다.`,
                      confirmLabel: '완료로 바꾸기',
                    }
                  : undefined
              }
            />
          )}
        >
          {children}
        </RequirementCellEditor>
      );
    }
    case 'urgency':
      return (
        <RequirementCellEditor
          {...shared}
          contentClassName="w-[168px]"
          createDraft={(source) => source.urgency}
          rebaseDraft={rebaseUrgency}
          toChange={buildUrgencyChange}
          renderEditor={(editor) => (
            <ChipSelectEditor
              kind="buyerUrgency"
              label={label}
              options={REQUIREMENT_URGENCIES}
              value={requirement.urgency}
              editor={editor}
            />
          )}
        >
          {children}
        </RequirementCellEditor>
      );
    case 'siteTypes':
      return (
        <RequirementCellEditor
          {...shared}
          contentClassName="w-[200px]"
          createDraft={(source) => [...(source.siteTypes ?? [])]}
          rebaseDraft={rebaseSiteTypes}
          toChange={buildSiteTypesChange}
          renderEditor={(editor) => (
            <SiteTypesEditor options={getSiteTypeOptions(requirement)} editor={editor} />
          )}
        >
          {children}
        </RequirementCellEditor>
      );
    case 'area':
      return (
        <RequirementCellEditor
          {...shared}
          contentClassName="w-[264px]"
          createDraft={toAreaDraft}
          rebaseDraft={rebaseAreaDraft}
          toChange={buildAreaChange}
          renderEditor={(editor) => <AreaEditor editor={editor} />}
        >
          {children}
        </RequirementCellEditor>
      );
    case 'budget':
      return (
        <RequirementCellEditor
          {...shared}
          contentClassName="w-[300px]"
          createDraft={toBudgetDraft}
          rebaseDraft={rebaseBudgetDraft}
          toChange={buildBudgetChange}
          renderEditor={(editor) => <BudgetEditor editor={editor} />}
        >
          {children}
        </RequirementCellEditor>
      );
    case 'places':
      return (
        <RequirementCellEditor
          {...shared}
          contentClassName="w-[340px]"
          createDraft={toPlacesDraft}
          rebaseDraft={rebasePlacesDraft}
          toChange={buildPlacesChange}
          renderEditor={(editor) => <PlacesEditor editor={editor} />}
        >
          {children}
        </RequirementCellEditor>
      );
    case 'moveInDate':
      return (
        <RequirementCellEditor
          {...shared}
          contentClassName="w-[280px]"
          createDraft={(source) => toDateInputValue(source.moveInDate)}
          rebaseDraft={rebaseMoveInDate}
          toChange={buildMoveInDateChange}
          renderEditor={(editor) => (
            <MoveInDateEditor editor={editor} hasSavedDate={Boolean(requirement.moveInDate)} />
          )}
        >
          {children}
        </RequirementCellEditor>
      );
    case 'memo':
      return (
        <RequirementCellEditor
          {...shared}
          contentClassName="w-[420px]"
          createDraft={(source) => source.memo ?? ''}
          rebaseDraft={rebaseMemo}
          toChange={buildMemoChange}
          renderEditor={(editor) => <MemoEditor editor={editor} />}
        >
          {children}
        </RequirementCellEditor>
      );
  }
}
