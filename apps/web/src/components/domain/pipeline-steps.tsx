import { cn } from '@/lib/utils';
import { getStatusMeta, PIPELINE_STEPS, type StatusKind } from '@/lib/status-config';

export interface PipelineStepsProps {
  /** 파이프라인 종류 (PIPELINE_STEPS에 순서가 정의된 kind만 렌더링됨) */
  kind: StatusKind;
  /** 현재 단계 값 (예: 'contracted') */
  current: string | null | undefined;
  /** 취소된 파이프라인이면 전체 흐림 + "취소됨" 표시 */
  cancelled?: boolean;
  className?: string;
}

/**
 * 상세 화면 상단 가로 스텝퍼.
 * 완료 = 채운 점(primary), 현재 = info 점 + ring, 미래 = 빈 점.
 */
export function PipelineSteps({ kind, current, cancelled = false, className }: PipelineStepsProps) {
  const steps = PIPELINE_STEPS[kind];
  if (!steps || steps.length === 0) return null;

  const currentIndex = current ? steps.indexOf(current) : -1;

  return (
    <div
      data-slot="pipeline-steps"
      className={cn('flex items-start', cancelled && 'opacity-50', className)}
    >
      {steps.map((step, index) => {
        const isDone = currentIndex >= 0 && index < currentIndex;
        const isCurrent = index === currentIndex;
        const label = getStatusMeta(kind, step).label;
        return (
          <div key={step} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              {/* 왼쪽 연결선 */}
              <div
                className={cn(
                  'h-px flex-1',
                  index === 0 ? 'bg-transparent' : isDone || isCurrent ? 'bg-primary' : 'bg-border',
                )}
              />
              <div
                className={cn(
                  'size-2.5 shrink-0 rounded-full',
                  isDone && 'bg-primary',
                  isCurrent && 'bg-info ring-4 ring-info/20',
                  !isDone && !isCurrent && 'border border-border bg-background',
                )}
              />
              {/* 오른쪽 연결선 */}
              <div
                className={cn(
                  'h-px flex-1',
                  index === steps.length - 1 ? 'bg-transparent' : isDone ? 'bg-primary' : 'bg-border',
                )}
              />
            </div>
            <span
              className={cn(
                'text-xs whitespace-nowrap',
                isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
      {cancelled && (
        <span className="ml-2 mt-0.5 shrink-0 rounded-md bg-destructive-soft px-2 py-0.5 text-xs font-medium text-destructive">
          취소됨
        </span>
      )}
    </div>
  );
}
