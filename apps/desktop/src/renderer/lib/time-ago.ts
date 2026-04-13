/**
 * 한국어 상대 시간 포맷터.
 * - 1분 미만 → "방금 전"
 * - 1시간 미만 → "N분 전"
 * - 24시간 미만 → "N시간 전"
 * - 7일 미만 → "N일 전"
 * - 그 이상 → "YYYY-MM-DD"
 *
 * 제안 카드에서 "3시간 전 생성" 같은 표기에 사용.
 */
export function timeAgo(value: string | Date, now: Date = new Date()): string {
  const then = typeof value === 'string' ? new Date(value) : value;
  const diffMs = now.getTime() - then.getTime();

  if (Number.isNaN(diffMs)) return '알 수 없음';
  if (diffMs < 0) return '방금 전';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;

  // 일주일 이상이면 ISO 날짜만
  return then.toISOString().slice(0, 10);
}

/**
 * 만료까지 남은 시간 포맷. 과거면 "만료됨".
 */
export function timeUntil(value: string | Date, now: Date = new Date()): string {
  const target = typeof value === 'string' ? new Date(value) : value;
  const diffMs = target.getTime() - now.getTime();

  if (Number.isNaN(diffMs)) return '';
  if (diffMs <= 0) return '만료됨';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}분 남음`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 남음`;

  const days = Math.floor(hours / 24);
  return `${days}일 남음`;
}
