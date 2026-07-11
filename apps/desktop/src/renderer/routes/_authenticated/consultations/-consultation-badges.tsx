import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getConsultationPurposeMeta } from './-consultation-view-utils';

export const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
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
