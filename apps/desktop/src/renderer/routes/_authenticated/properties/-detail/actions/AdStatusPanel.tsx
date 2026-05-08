import { Megaphone } from 'lucide-react';
import { SideCard } from '../cards/SideCard';
import { cn } from '@/lib/utils';

/**
 * 광고 송출 상태 패널.
 * Phase 1: placeholder. ListingPublication 모델 도입 후 wiring.
 */
export function AdStatusPanel() {
  // 향후 ListingPublication에서 받을 데이터 형태
  const platforms: Array<{
    key: string;
    label: string;
    status: 'pending' | 'published' | 'paused' | 'rejected' | null;
  }> = [
    { key: 'naver', label: '네이버', status: null },
    { key: 'kb', label: 'KB부동산', status: null },
    { key: 'daum', label: '다음', status: null },
    { key: 'hanbang', label: '한방', status: null },
  ];

  return (
    <SideCard title="광고 송출">
      <div className="space-y-1">
        {platforms.map((p) => (
          <div
            key={p.key}
            className="flex items-center justify-between text-[12px]"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Megaphone className="size-3" />
              {p.label}
            </span>
            <StatusBadge status={p.status} />
          </div>
        ))}
      </div>
      <p className="mt-2 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
        광고 송출 모델 도입 예정
      </p>
    </SideCard>
  );
}

function StatusBadge({
  status,
}: {
  status: 'pending' | 'published' | 'paused' | 'rejected' | null;
}) {
  if (!status) {
    return (
      <span className="text-[11px] text-muted-foreground/60">미게재</span>
    );
  }
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: '대기', cls: 'bg-amber-50 text-amber-700' },
    published: { label: '게재중', cls: 'bg-emerald-50 text-emerald-700' },
    paused: { label: '내림', cls: 'bg-gray-100 text-gray-500' },
    rejected: { label: '반려', cls: 'bg-rose-50 text-rose-700' },
  };
  const v = map[status];
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px]', v.cls)}>
      {v.label}
    </span>
  );
}
