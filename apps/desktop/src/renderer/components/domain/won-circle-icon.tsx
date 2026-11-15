import type { SVGProps } from 'react';

/**
 * 가격 · 보증금 · 금액 아이콘. lucide에 원화 기호가 없어 매물관리 필터 줄과 같은 모양을 그린다.
 * 매물관리 · 내광고관리는 아직 같은 그림을 각자 갖고 있다. 고칠 때는 이 부품으로 모은다.
 */
export function WonCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 9l1.5 6L12 10l2.5 5L16 9" />
    </svg>
  );
}
