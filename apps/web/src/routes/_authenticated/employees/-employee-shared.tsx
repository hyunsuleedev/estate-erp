import type { ReactNode } from 'react';
import { ApiError } from '@estate-erp/api-client';
import { USER_LICENSE_TYPE_LABELS } from '@estate-erp/shared';
import { cn } from '@/lib/utils';

export const NONE_VALUE = '__none__';
export const ALL_VALUE = '__all__';

export const roleMeta: Record<string, { label: string; dot: string; soft: string; text: string }> = {
  owner: { label: '대표', dot: 'bg-violet', soft: 'bg-violet-soft', text: 'text-violet' },
  manager: { label: '매니저', dot: 'bg-info', soft: 'bg-info-soft', text: 'text-info' },
  agent: { label: '중개사', dot: 'bg-success', soft: 'bg-success-soft', text: 'text-success' },
};

export const LICENSE_TYPE_LABELS: Record<string, string> = USER_LICENSE_TYPE_LABELS;

export const payTypeLabels: Record<string, string> = {
  fixed: '고정급',
  mixed: '고정급+수수료',
  commission_only: '수수료제',
};

export const participantRoleLabels: Record<string, string> = {
  listing_agent: '매도측 담당',
  buying_agent: '매수측 담당',
  dual_agent: '단독중개',
  manager: '관리자',
  assistant: '보조',
  closer: '마감 담당',
};

export const participantSideLabels: Record<string, string> = {
  seller: '매도측',
  buyer: '매수측',
  both: '양측',
};

export const settlementLabels: Record<string, string> = {
  settled: '정산완료',
  unsettled: '미정산',
};

export const taskPriorityLabels: Record<string, string> = {
  urgent: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
};

export const buyerStatusLabels: Record<string, string> = {
  active: '진행중',
  matched: '매칭됨',
  completed: '완료',
  inactive: '중지',
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return '요청 처리에 실패했습니다.';
}

export function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getCommissionNumber(config: unknown, key: string, fallback: number) {
  if (typeof config !== 'object' || config === null) return fallback;
  const value = (config as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/* Notion 태그 팔레트에서 이름 기반으로 고정 색을 고른다 — 아바타가 항상 같은 색을 유지 */
const AVATAR_TONES = [
  'bg-violet-soft text-violet',
  'bg-info-soft text-info',
  'bg-success-soft text-success',
  'bg-warning-soft text-warning',
  'bg-pink-soft text-pink',
  'bg-orange-soft text-orange',
];

export function avatarTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export function PersonAvatar({
  name,
  className,
  muted,
}: {
  name: string;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 select-none items-center justify-center rounded-md text-xs font-semibold',
        muted ? 'bg-neutral-soft text-muted-foreground' : avatarTone(name),
        className,
      )}
    >
      {name.charAt(0)}
    </span>
  );
}

export function RoleLabel({ role, className }: { role: string; className?: string }) {
  const meta = roleMeta[role];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <span className={cn('size-2 shrink-0 rounded-full', meta?.dot ?? 'bg-muted-foreground/40')} />
      {meta?.label ?? role}
    </span>
  );
}

export function StatusLabel({ isActive, className }: { isActive: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          isActive ? 'bg-success' : 'bg-muted-foreground/35',
        )}
      />
      <span className={isActive ? undefined : 'text-muted-foreground'}>
        {isActive ? '활성' : '비활성'}
      </span>
    </span>
  );
}

/* Notion 태그 모양의 조용한 칩 */
export function TagChip({
  children,
  tone = 'bg-neutral-soft text-neutral-strong',
  className,
}: {
  children: ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center whitespace-nowrap rounded px-1.5 text-xs font-medium',
        tone,
        className,
      )}
    >
      {children}
    </span>
  );
}
