import type { Task } from '@estate-erp/api-client';

function withSuffix(value: string, suffix: string) {
  return value.endsWith(suffix) ? value : `${value}${suffix}`;
}

export function getPropertyLabel(task: Task): string {
  const siteName = task.property?.site?.name?.trim();
  const unit = task.property?.unit;
  const dongName = unit?.dong?.name?.trim();
  const dongLabel =
    dongName && dongName !== '-' && !unit?.dong?.isPlaceholder
      ? withSuffix(dongName, '동')
      : null;
  const unitName = unit?.name?.trim();
  const unitLabel = unitName && unitName !== '-' ? withSuffix(unitName, '호') : null;

  return [siteName, dongLabel, unitLabel].filter(Boolean).join(' ') || '매물';
}
