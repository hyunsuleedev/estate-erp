/**
 * 표 행의 "열기" 버튼 — 행에 마우스를 올리거나 포커스가 가면 칸 오른쪽에 뜨고,
 * 누르면 옆 상세 패널을 연다. 그 행의 패널이 열려 있으면 "닫기"가 된다.
 *
 * 매물관리 · 거래관리 표의 열기 버튼과 같은 모양 · 자리다 (Notion 표의 "열기"를 잰 값).
 * 두 화면은 아직 같은 마크업을 각자 갖고 있다. 고칠 때는 이 부품으로 모은다.
 *
 * 쓰는 쪽 조건: 행에 `group`, 버튼이 놓일 칸에 `relative`(또는 sticky)가 있어야 한다.
 */
export interface RowOpenButtonProps {
  /** 읽어 줄 대상 이름. "… 상세 열기 / 닫기"로 읽힌다 */
  label: string;
  /** 이 행의 패널이 지금 열려 있는지 */
  current: boolean;
  /** 열려 있을 때 가리키는 패널의 id */
  controls?: string;
  /** 풍선 글. 기본은 옆 상세 패널을 여는 화면의 글이다 */
  openTitle?: string;
  closeTitle?: string;
  onToggle: () => void;
}

export function RowOpenButton({
  label,
  current,
  controls,
  openTitle = '사이드 보기에서 열기',
  closeTitle = '사이드 보기 닫기',
  onToggle,
}: RowOpenButtonProps) {
  const action = current ? '닫기' : '열기';
  return (
    <span
      data-row-open
      className="pointer-events-none absolute right-1 top-1/2 z-[2] -translate-y-1/2 rounded-[6px] bg-white p-0.5 opacity-0 shadow-[0_8px_12px_rgba(25,25,25,0.027),0_2px_6px_rgba(25,25,25,0.027),0_0_0_1px_rgba(42,28,0,0.07)] group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
    >
      <button
        type="button"
        aria-label={`${label} 상세 ${action}`}
        aria-expanded={current}
        aria-controls={current ? controls : undefined}
        title={current ? closeTitle : openTitle}
        className="flex h-5 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-1 text-[12px] font-medium leading-[18px] tracking-[0.5px] text-[#7d7a75] transition-[background-color] duration-[20ms] ease-in hover:bg-[rgba(33,27,23,0.051)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35"
        style={{ fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <svg aria-hidden="true" viewBox="0 0 16 20" className="h-5 w-[15.25px] shrink-0 text-[#8e8b86]" fill="none">
          <rect x="1" y="4.75" width="14" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
          <rect x="7.75" y="6.125" width="5.5" height="7.75" rx="0.5" fill="currentColor" />
        </svg>
        {action}
      </button>
    </span>
  );
}
