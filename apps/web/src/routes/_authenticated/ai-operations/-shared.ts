import { ApiError } from '@estate-erp/api-client';
import type { ProposalPriority, TrustTier } from '@estate-erp/api-client';

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '요청 처리 중 오류가 발생했습니다';
}

/** Proposal.type → 한국어 라벨 (규칙 이름과 1:1 — 규칙 displayName으로 보강 가능) */
export const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  ad_takedown: '광고 내림 감지',
  lease_expiry: '임대차 만기',
  new_external_listings: '신규 외부 매물',
  transaction_report_deadline: '거래신고 기한',
};

export const TRUST_TIER_LABELS: Record<TrustTier, string> = {
  auto: '자동 실행',
  approval_required: '승인 필요',
  inform_only: '알림용',
};

export const PRIORITY_META: Record<ProposalPriority, { label: string; dotClass: string }> = {
  urgent: { label: '긴급', dotClass: 'bg-destructive' },
  normal: { label: '보통', dotClass: 'bg-info' },
  low: { label: '낮음', dotClass: 'bg-muted-foreground/40' },
};

/**
 * 크론 표현식(6필드: 초 분 시 일 월 요일)을 사람이 읽는 한국어로 변환.
 * 패턴이 복잡하면 원문 그대로 반환한다.
 */
export function describeCron(cron: string | null | undefined): string | null {
  if (!cron) return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour] =
    parts.length >= 6 ? [parts[1], parts[2]] : [parts[0], parts[1]];

  const minEvery = /^\*\/(\d+)$/.exec(min);
  if (minEvery && hour === '*') return `${minEvery[1]}분마다`;

  const hourEvery = /^\*\/(\d+)$/.exec(hour);
  if (hourEvery && /^\d+$/.test(min)) return `${hourEvery[1]}시간마다`;

  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    return `매일 ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  return cron;
}

/** generatedBy("rule:ad_takedown:v1", "mcp:update_listing", "event:...") → 출처 라벨 */
export function describeGeneratedBy(generatedBy: string): string {
  if (generatedBy.startsWith('rule:')) {
    const name = generatedBy.split(':')[1] ?? '';
    return `규칙 · ${PROPOSAL_TYPE_LABELS[name] ?? name}`;
  }
  if (generatedBy.startsWith('mcp:')) return `MCP · ${generatedBy.slice(4)}`;
  if (generatedBy.startsWith('event:')) return `이벤트 · ${generatedBy.slice(6)}`;
  return generatedBy;
}
