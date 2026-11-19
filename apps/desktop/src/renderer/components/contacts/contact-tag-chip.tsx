import type { CSSProperties } from 'react';
import { X } from 'lucide-react';
import { CONTACT_TAG_COLORS, type ContactTagColor } from '@estate-erp/shared';
import { cn } from '@/lib/utils';

/** 모르는 색 이름이나 아직 저장되지 않은 새 태그는 회색으로 보여 준다. */
export function toContactTagColor(color: string | undefined): ContactTagColor {
  return CONTACT_TAG_COLORS.includes(color as ContactTagColor)
    ? (color as ContactTagColor)
    : 'gray';
}

/** 색 토큰은 app.css의 --contact-tag-*. 글자색과 반투명 배경이 한 쌍이다. */
export function contactTagColorStyle(color: string | undefined): CSSProperties {
  const name = toContactTagColor(color);
  return {
    color: `var(--contact-tag-${name}-text)`,
    background: `var(--contact-tag-${name}-bg)`,
  };
}

/**
 * 연락처 태그 꼬리표. Notion 다중 선택 꼬리표에서 잰 치수 그대로다:
 * 높이 20 · 모서리 4 · 좌우 6 · 글자 14/20 · 테두리 없음. 떼기 버튼이 붙으면 오른쪽 여백이 0이 되고
 * 20px 버튼이 좌우 2px 간격으로 붙는다.
 */
export function ContactTagChip({
  name,
  color,
  onRemove,
  className,
}: {
  name: string;
  color?: string;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      style={contactTagColorStyle(color)}
      className={cn(
        'inline-flex h-5 min-w-0 max-w-full shrink-0 items-center overflow-hidden rounded-[4px] pl-1.5 text-[14px] font-normal leading-5 whitespace-nowrap',
        onRemove ? 'pr-0' : 'pr-1.5',
        className,
      )}
    >
      <span className="min-w-0 truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`${name} 태그 떼기`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="mx-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-[3px] opacity-60 outline-none hover:bg-black/10 hover:opacity-100 focus-visible:bg-black/10 focus-visible:opacity-100"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}
