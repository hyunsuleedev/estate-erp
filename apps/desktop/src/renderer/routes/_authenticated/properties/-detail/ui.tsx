import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * 매물 상세 2판의 작은 부품. 글자 rgb(55,53,47) · 선 rgb(233,233,231) · 모서리 4px (Notion 값).
 */

const nbBase =
  'inline-flex h-7 shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded px-2 text-[14px] text-[#37352f]/65 transition-colors hover:bg-[#37352f]/[0.06] hover:text-[#37352f] active:bg-[#37352f]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/40 disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-[#37352f]/[0.06] data-[state=open]:text-[#37352f] [&_svg]:size-[15px] [&_svg]:shrink-0';

export const nb = {
  ghost: nbBase,
  line: cn(nbBase, 'text-[#37352f] shadow-[inset_0_0_0_1px_rgba(55,53,47,0.16)]'),
  solid: cn(
    nbBase,
    'bg-[#2383e2] px-2.5 font-medium text-white hover:bg-[#0570de] hover:text-white active:bg-[#0565c8]',
  ),
  icon: cn(nbBase, 'w-7 px-0'),
};

export type TagTone = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'red';

export const tagToneClass: Record<TagTone, string> = {
  gray: 'bg-[rgba(227,226,224,0.6)] text-[rgb(50,48,44)]',
  brown: 'bg-[rgb(238,224,218)] text-[rgb(68,42,30)]',
  orange: 'bg-[rgb(250,222,201)] text-[rgb(73,41,14)]',
  yellow: 'bg-[rgb(253,236,200)] text-[rgb(64,44,27)]',
  green: 'bg-[rgb(219,237,219)] text-[rgb(28,56,41)]',
  blue: 'bg-[rgb(211,229,239)] text-[rgb(24,51,71)]',
  red: 'bg-[rgb(255,226,221)] text-[rgb(93,23,21)]',
};

export function Tag({
  tone = 'gray',
  dot = false,
  className,
  children,
}: {
  tone?: TagTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-[5px] whitespace-nowrap rounded-[3px] px-1.5 text-[13px] leading-5',
        tagToneClass[tone],
        className,
      )}
    >
      {dot && <span className="size-[7px] rounded-full bg-current opacity-60" />}
      {children}
    </span>
  );
}

/** 구역 제목 (Notion 제목 2) */
export function H2({
  title,
  count,
  hint,
  action,
  id,
}: {
  title: string;
  count?: number;
  hint?: string | null;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-2 mt-8 flex min-h-8 items-center gap-2" id={id}>
      <h2 className="text-[19px] font-semibold leading-[1.3] tracking-[-0.01em] text-[#37352f]">{title}</h2>
      {count !== undefined && count > 0 && (
        <span className="text-[15px] font-medium tabular-nums text-[#37352f]/45">{count}</span>
      )}
      {hint && <span className="text-[13px] text-[#37352f]/65">{hint}</span>}
      {action && <div className="ml-auto flex items-center gap-0.5">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-[#f1f0ec] font-semibold text-[#6f6e69]',
        size === 'sm' ? 'size-5 text-[10px]' : 'size-7 text-[12px]',
      )}
      aria-hidden
    >
      {name.trim().slice(0, 1) || '?'}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('ml-0.5 font-sans text-[11px] text-current opacity-60', className)}>{children}</kbd>;
}

/**
 * 문서형 상세(프로젝트 · 연락처)의 속성 한 줄. Notion 문서의 속성 줄처럼 왼쪽에 아이콘과 이름, 오른쪽에 값.
 * 고칠 수 있는 값은 값 자리가 곧 고르는 단추다.
 */
export function DocProp({
  icon,
  label,
  children,
  align = 'center',
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  /** 값이 여러 줄이면 start: 이름을 첫 줄에 맞춘다 */
  align?: 'center' | 'start';
}) {
  return (
    <div
      className={cn(
        'grid min-h-[34px] grid-cols-[150px_minmax(0,1fr)]',
        align === 'start' ? 'items-start' : 'items-center',
      )}
    >
      <dt
        className={cn(
          'flex items-center gap-2 text-[14px] text-[#37352f]/65 [&_svg]:size-[15px] [&_svg]:shrink-0 [&_svg]:text-[#37352f]/45',
          align === 'start' && 'h-[34px]',
        )}
      >
        {icon}
        {label}
      </dt>
      <dd
        className={cn(
          '-ml-1.5 flex min-w-0 gap-1.5 text-[14px] leading-[22px] text-[#37352f]',
          align === 'start' ? 'flex-col py-1.5' : 'items-center',
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** 문서형 상세에서 화면이 이보다 넓으면 옆 열을 둔다 (매물 상세와 같은 기준). */
export const DOC_WIDE_LAYOUT = 1080;
