import {
  CircleDollarSign,
  MessageSquare,
  Phone,
  Share2,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SideCard } from '../cards/SideCard';

interface Props {
  ownerPhone: string | null;
  onCallOwner: () => void;
  onAddConsultation: () => void;
  onCreateMatch: () => void;
  onEditPrice: () => void;
  onShareNetwork: () => void;
}

interface ActionItem {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary';
}

export function QuickActionsPanel({
  ownerPhone,
  onCallOwner,
  onAddConsultation,
  onCreateMatch,
  onEditPrice,
  onShareNetwork,
}: Props) {
  const actions: ActionItem[] = [
    {
      icon: Phone,
      label: '소유자에 전화',
      onClick: onCallOwner,
      disabled: !ownerPhone,
    },
    {
      icon: MessageSquare,
      label: '상담 기록 추가',
      onClick: onAddConsultation,
    },
    {
      icon: Users,
      label: '매칭 생성',
      onClick: onCreateMatch,
      tone: 'primary',
    },
    {
      icon: CircleDollarSign,
      label: '가격 수정',
      onClick: onEditPrice,
    },
    {
      icon: Share2,
      label: '공동중개망 공유',
      onClick: onShareNetwork,
      disabled: true,
    },
  ];

  return (
    <SideCard title="빠른 액션">
      <div className="-mx-1 flex flex-col">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={cn(
              'flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] transition-colors',
              action.disabled
                ? 'cursor-not-allowed text-muted-foreground/50'
                : action.tone === 'primary'
                  ? 'text-foreground hover:bg-foreground hover:text-background'
                  : 'text-foreground hover:bg-muted',
            )}
          >
            <action.icon className="size-3.5 shrink-0" />
            <span className="flex-1 truncate">{action.label}</span>
          </button>
        ))}
      </div>
    </SideCard>
  );
}
