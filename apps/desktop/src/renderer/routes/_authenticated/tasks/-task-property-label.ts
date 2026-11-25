import { formatPlaceLabel } from '@estate-erp/shared';
import type { Task } from '@estate-erp/api-client';

/** "고덕그라시움 102동 3401호" — 화면 전체의 주소 기준(formatPlaceLabel). 매물이 없으면 "매물". */
export function getPropertyLabel(task: Task): string {
  const unit = task.property?.unit;
  return (
    formatPlaceLabel({
      siteName: task.property?.site?.name,
      dongName: unit?.dong?.name,
      dongIsPlaceholder: unit?.dong?.isPlaceholder,
      unit,
    }) || '매물'
  );
}
