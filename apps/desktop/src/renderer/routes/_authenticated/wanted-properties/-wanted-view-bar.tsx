/**
 * 희망매물 목록의 위쪽: 거래유형 탭과 도구 줄.
 * 화면 이름은 앱 탭이 이미 알려 주므로 제목 · 설명 · 지표는 두지 않는다.
 *
 * - 거래유형(전체 · 매매 · 전세 · 월세): 매물관리와 같은 묶음 탭이다. 옅은 회색 트랙 하나에 담고
 *   고른 것만 검정으로 채운다 (ToolbarPillTabs의 "muted"). 낱개 탭으로 흩어 놓지 않는다 (사용자 의견 2026-11-17).
 * - 오른쪽 도구: 문서관리(contracts/-list-toolbar.tsx)와 같은 28px 아이콘 버튼(모서리 6px) —
 *   필터 줄 여닫기 · 검색, 그 뒤에 만들기 버튼. 보기는 고객별 하나라 전환 버튼이 없다 (사용자 의견 2026-11-17).
 * - 줄의 여백과 아래 선은 매물관리 1행과 같다(좌우 12px · 위아래 10px · 아래 선). 이 선이 아래 필터 줄과
 *   이 줄을 가른다 (사용자 의견 2026-11-17).
 * 색은 앱 토큰(app.css)만 쓴다.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ListFilter, Search, X } from 'lucide-react';
import { ToolbarPillTabs } from '../properties/-components/property-toolbar';
import { cn } from '@/lib/utils';


/** Notion 도구 줄 아이콘 버튼: 28px, 모서리 6px, 흐린 글자색 (문서관리와 같은 값) */
const toolButtonClassName =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[rgba(33,27,23,0.05)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&>svg]:size-4';

export function WantedViewBar({
  transactionType,
  transactionTypeTabs,
  onTransactionTypeChange,
  isFilterRowOpen,
  onToggleFilterRow,
  activeFilterCount,
  search,
  onSearchChange,
  searchFocusSignal,
  actions,
}: {
  /** '' = 전체 */
  transactionType: string;
  transactionTypeTabs: ReadonlyArray<{ value: string; label: string }>;
  onTransactionTypeChange: (value: string) => void;
  isFilterRowOpen: boolean;
  onToggleFilterRow: () => void;
  /** 값이 걸린 필터 수 (검색어 · 거래유형 탭 제외) */
  activeFilterCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  /** 값이 바뀌면 검색 칸을 열고 커서를 둔다 ('/' · Cmd/Ctrl+F) */
  searchFocusSignal: number;
  /** 오른쪽 끝 만들기 버튼 */
  actions: ReactNode;
}) {
  return (
    <div data-wanted-viewbar className="shrink-0 border-b border-border bg-white px-3 py-2.5">
      <div className="@container flex min-w-0 items-center gap-2">
        <ToolbarPillTabs
          shape="muted"
          ariaLabel="거래유형"
          value={transactionType}
          options={transactionTypeTabs}
          onChange={onTransactionTypeChange}
        />

        <div className="ml-auto flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={isFilterRowOpen ? '필터 줄 접기' : '필터 줄 펼치기'}
            aria-pressed={isFilterRowOpen}
            title="필터"
            onClick={onToggleFilterRow}
            className={cn(
              toolButtonClassName,
              // 접힌 채로 조건이 걸려 있으면 파랗게 알린다
              !isFilterRowOpen && activeFilterCount > 0 && 'w-auto gap-1 px-1.5 text-info hover:text-info',
            )}
          >
            <ListFilter />
            {!isFilterRowOpen && activeFilterCount > 0 && (
              <span className="text-[13px] font-medium tabular-nums">{activeFilterCount}</span>
            )}
          </button>

          <SearchTool value={search} onChange={onSearchChange} focusSignal={searchFocusSignal} />

          <div className="ml-2 shrink-0">{actions}</div>
        </div>
      </div>
    </div>
  );
}

/** Notion식 검색: 돋보기를 누르면 옆으로 펼쳐지고, 비운 채 벗어나면 다시 접힌다. */
function SearchTool({
  value,
  onChange,
  focusSignal,
}: {
  value: string;
  onChange: (value: string) => void;
  focusSignal: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const focusRequestRef = useRef(false);
  /** Esc로 접었으면 돋보기 버튼으로 포커스를 돌려준다 (키보드로 쓰던 자리를 잃지 않게) */
  const returnFocusRef = useRef(false);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const open = expanded || value !== '';

  useEffect(() => {
    if (open || !returnFocusRef.current) return;
    returnFocusRef.current = false;
    buttonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (focusSignal === 0) return;
    focusRequestRef.current = true;
    setExpanded(true);
  }, [focusSignal]);
  useEffect(() => {
    if (!open || !focusRequestRef.current) return;
    focusRequestRef.current = false;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open, focusSignal]);

  // 검색어가 밖에서 지워지면(초기화 버튼 등) 빈 검색 칸을 남겨 두지 않는다
  useEffect(() => {
    if (value === '' && document.activeElement !== inputRef.current) setExpanded(false);
  }, [value]);

  // 누르고 있는 동안인지 기억한다. 검색 칸을 접으면 왼쪽 도구가 그만큼 밀리므로,
  // 다른 곳을 눌러서 벗어난 경우에는 그 클릭이 끝난 뒤에 접어야 클릭이 빗나가지 않는다.
  const pointerDownRef = useRef(false);
  useEffect(() => {
    const down = () => {
      pointerDownRef.current = true;
    };
    const up = () => {
      pointerDownRef.current = false;
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);
  const collapseIfIdle = () => {
    if (valueRef.current !== '' || document.activeElement === inputRef.current) return;
    setExpanded(false);
  };
  const collapseAfterClick = () => {
    if (!pointerDownRef.current) {
      collapseIfIdle();
      return;
    }
    const later = () => {
      window.removeEventListener('pointerup', later, true);
      window.removeEventListener('pointercancel', later, true);
      // click은 pointerup 바로 뒤에 온다. 그 다음 차례에 접는다.
      window.setTimeout(collapseIfIdle, 0);
    };
    window.addEventListener('pointerup', later, true);
    window.addEventListener('pointercancel', later, true);
  };

  if (!open) {
    return (
      <button
        ref={buttonRef}
        type="button"
        className={toolButtonClassName}
        aria-label="검색"
        title="검색 (/)"
        onClick={() => {
          focusRequestRef.current = true;
          setExpanded(true);
        }}
      >
        <Search />
      </button>
    );
  }

  return (
    <div
      data-wanted-search
      className="flex h-7 min-w-0 items-center gap-1.5 rounded-md pl-1.5 pr-1 focus-within:bg-[rgba(33,27,23,0.04)]"
      onBlur={(event) => {
        // 검색 칸 밖으로 나가고 글이 비어 있으면 접는다
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (!value) collapseAfterClick();
      }}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          if (value) onChange('');
          else {
            returnFocusRef.current = true;
            setExpanded(false);
          }
        }}
        placeholder="고객, 연락처, 매물, 주소 검색"
        aria-label="희망매물 검색"
        className="h-7 w-[216px] min-w-0 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
      />
      {value && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-[rgba(33,27,23,0.08)] hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
