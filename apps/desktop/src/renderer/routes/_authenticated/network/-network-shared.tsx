import { ApiError } from '@estate-erp/api-client';

import { cn } from '@/lib/utils';

// ── 네트워크 전용 상태 메타 (StatusKind에 없는 네트워크 상태는 로컬 정의) ──

export interface NetStatusMeta {
  label: string;
  className: string;
}

export const MEMBER_STATUS_META: Record<string, NetStatusMeta> = {
  pending: { label: '승인 대기', className: 'bg-warning-soft text-warning' },
  approved: { label: '참여 중', className: 'bg-success-soft text-success' },
  rejected: { label: '거절됨', className: 'bg-destructive-soft text-destructive' },
  left: { label: '나감', className: 'bg-neutral-soft text-muted-foreground' },
};

export const INQUIRY_STATUS_META: Record<string, NetStatusMeta> = {
  pending: { label: '응답 대기', className: 'bg-warning-soft text-warning' },
  accepted: { label: '수락됨', className: 'bg-success-soft text-success' },
  rejected: { label: '거절됨', className: 'bg-destructive-soft text-destructive' },
  expired: { label: '만료됨', className: 'bg-neutral-soft text-muted-foreground' },
};

export const ROOM_TYPE_META: Record<string, NetStatusMeta> = {
  public: { label: '공개방', className: 'bg-info-soft text-info' },
  private: { label: '비공개방', className: 'bg-neutral-soft text-neutral-strong' },
};

export const MEMBER_ROLE_META: Record<string, NetStatusMeta> = {
  admin: { label: '방장', className: 'bg-violet-soft text-violet' },
  member: { label: '멤버', className: 'bg-neutral-soft text-muted-foreground' },
};

/** 네트워크 로컬 상태 뱃지 — StatusBadge와 동일한 시각 규칙(연한 배경 + 진한 글자). */
export function NetBadge({
  meta,
  size = 'default',
  className,
}: {
  meta: NetStatusMeta | undefined;
  size?: 'sm' | 'default';
  className?: string;
}) {
  if (!meta) return null;
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center rounded-md font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-px text-[11px]' : 'px-2 py-0.5 text-xs',
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return '요청을 처리하지 못했습니다';
}

// ── queryKey 모음 (도메인 prefix 'network') ──

export const networkKeys = {
  rooms: (filter?: Record<string, string | undefined>) =>
    ['network', 'rooms', filter ?? {}] as const,
  allRooms: ['network', 'rooms'] as const,
  room: (id: string) => ['network', 'room', id] as const,
  shared: (roomId: string) => ['network', 'shared', roomId] as const,
  messages: (roomId: string) => ['network', 'messages', roomId] as const,
  inquiries: (filter?: Record<string, string | undefined>) =>
    ['network', 'inquiries', filter ?? {}] as const,
  allInquiries: ['network', 'inquiries'] as const,
};

/** 마스킹 토글 8종 정의 — ShareListingDto의 show* 키와 1:1. */
export const MASK_FLAG_DEFS = [
  { key: 'showSiteName', label: '단지명', hint: '끄면 "강동구 아파트"처럼 지역으로만 표시' },
  { key: 'showDong', label: '동', hint: '동 이름 (101동 등)' },
  { key: 'showUnit', label: '호수', hint: '호수 공개 시 매물 추적 위험에 주의' },
  { key: 'showFloor', label: '층수', hint: '층 정보' },
  { key: 'showPrice', label: '가격', hint: '매매가/보증금/월세' },
  { key: 'showArea', label: '면적', hint: '전용/공급 면적과 평형' },
  { key: 'showMemo', label: '메모', hint: '매물 공개 메모 (내부 전용 메모는 항상 제외)' },
  { key: 'showPhotos', label: '사진', hint: '매물 사진' },
] as const;

export type MaskFlagKey = (typeof MASK_FLAG_DEFS)[number]['key'];

export type MaskFlags = Record<MaskFlagKey, boolean>;

/** 서버 기본값과 동일: 단지명/가격/면적만 공개. */
export const DEFAULT_MASK_FLAGS: MaskFlags = {
  showSiteName: true,
  showDong: false,
  showUnit: false,
  showFloor: false,
  showPrice: true,
  showArea: true,
  showMemo: false,
  showPhotos: false,
};

export const SITE_TYPE_LABELS: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  house: '단독주택',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박시설',
};
