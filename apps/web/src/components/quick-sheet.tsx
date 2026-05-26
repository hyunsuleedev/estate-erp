import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * 빠른 확인 시트의 공통 프리미티브 + 날짜 헬퍼.
 * Properties / Contacts 등 여러 리스트 페이지에서 동일한 노션 스타일 sheet를 띄울 때 재사용한다.
 */

export type QuickSheetNoticeTone = 'danger' | 'warning' | 'neutral';

export interface QuickSheetNotice {
  title: string;
  detail: string;
  tone: QuickSheetNoticeTone;
}

/** 시트 본문 섹션. 작은 회색 uppercase 제목 + 자식 콘텐츠. */
export function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** 섹션에 데이터가 없을 때 표시하는 점선 빈 상태. */
export function SheetEmptyState({
  text,
  compact = false,
}: {
  text: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-dashed border-[#e3e2df] px-3 text-center text-sm text-slate-500',
        compact ? 'py-4' : 'py-8',
      )}
    >
      {text}
    </div>
  );
}

/** "지금 확인할 것" 섹션의 알림 1건. tone에 따라 좌측 도트 색이 달라진다. */
export function SheetNoticeRow({ notice }: { notice: QuickSheetNotice }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5">
      <span
        className={cn(
          'mt-1.5 size-1.5 shrink-0 rounded-full',
          notice.tone === 'danger' && 'bg-[#e03e3e]',
          notice.tone === 'warning' && 'bg-[#dfab01]',
          notice.tone === 'neutral' && 'bg-[#9b9a97]',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-foreground">{notice.title}</div>
        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{notice.detail}</p>
      </div>
    </div>
  );
}

/** "3/25" 짧은 한국어 날짜 포맷. 잘못된 값이면 "-". */
export function formatDateShort(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

/** "3/25 오후 2:30" 한국어 일시 포맷. */
export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 주어진 시간으로부터 지금까지 며칠 경과했는지. 미래/잘못된 값이면 null. */
export function getDaysSince(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

/** 지금부터 주어진 시간까지 며칠 남았는지. 음수면 이미 지난 것. */
export function getDaysUntil(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

/** "오늘", "3일 전" 등 상대 표시. */
export function formatDaysAgo(value?: string | null) {
  const days = getDaysSince(value);
  if (days === null) return '-';
  if (days === 0) return '오늘';
  return `${days}일 전`;
}
