import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getConsultationPurposeMeta } from './-consultation-view-utils';
import { splitConsultationTag } from './-consultation-list-model';

export const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '문자·온라인',
};

const typeColors: Record<string, string> = {
  phone: 'bg-blue-50 text-blue-700',
  visit: 'bg-emerald-50 text-emerald-700',
  online: 'bg-violet-50 text-violet-700',
};

const typeDots: Record<string, string> = {
  phone: 'bg-blue-500',
  visit: 'bg-emerald-500',
  online: 'bg-violet-500',
};

export function TypeBadge({ type }: { type: string }) {
  return (
    <Badge className={cn('rounded-md px-1.5 text-[10px]', typeColors[type] ?? 'bg-slate-100 text-slate-700')}>
      <span className={cn('size-1.5 rounded-full', typeDots[type] ?? 'bg-slate-400')} />
      {consultationTypeLabels[type] ?? type}
    </Badge>
  );
}

/** purpose(목적) 뱃지 — general은 노이즈라 기본적으로 숨김 */
export function PurposeBadge({
  purpose,
  showGeneral = false,
}: {
  purpose: string | null | undefined;
  showGeneral?: boolean;
}) {
  if (!purpose || (!showGeneral && purpose === 'general')) return null;
  const meta = getConsultationPurposeMeta(purpose);
  return <Badge className={cn('rounded-md px-1.5 text-[10px]', meta.className)}>{meta.label}</Badge>;
}

export function getInitial(name: string | null | undefined) {
  return name?.trim().charAt(0) || '?';
}

/**
 * 상담 본문. "[매물확인] 살아있음" 같은 꼬리표는 작은 표로 떼어 보이고 나머지만 글로 보인다
 * (저장된 글은 그대로 두고 보일 때만 나눈다).
 */
export function ConsultationContent({ content, className }: { content: string | null | undefined; className?: string }) {
  const { tag, body, tone } = splitConsultationTag(content);
  return (
    <>
      {tag && (
        <span
          data-consultation-tag
          className={cn(
            'mb-1 inline-flex h-5 items-center rounded-[4px] px-1.5 text-[12px]',
            tone === 'good'
              ? 'bg-success-soft text-success'
              : tone === 'attention'
                ? 'bg-warning-soft text-warning-strong'
                : 'bg-neutral-soft text-muted-foreground',
          )}
        >
          {tag}
        </span>
      )}
      {body && <p className={cn('whitespace-pre-wrap', className)}>{body}</p>}
    </>
  );
}

