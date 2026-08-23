import {
  CircleDollarSign,
  Handshake,
  MessageSquare,
  Phone,
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
  onEditListing: () => void;
  onCreateDeal: () => void;
}

interface ActionItem {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary';
}

export function QuickActionsPanel({
  ownerPhone,
  onCallOwner,
  onAddConsultation,
  onCreateMatch,
  onEditListing,
  onCreateDeal,
}: Props) {
  const actions: ActionItem[] = [
    {
      icon: Phone,
      label: '소유주에게 전화',
      onClick: onCallOwner,
      disabled: !ownerPhone,
    },
    {
      icon: MessageSquare,
      label: '상담 기록 추가',
      onClick: onAddConsultation,
      tone: 'primary',
    },
    {
      icon: Users,
      label: '매칭 생성',
      onClick: onCreateMatch,
    },
    {
      icon: Handshake,
      label: '거래 생성',
      onClick: onCreateDeal,
    },
    {
      icon: CircleDollarSign,
      label: '가격·조건 수정',
      onClick: onEditListing,
    },
  ];

  return (
    <SideCard title="바로 하기">
      <div className="-mx-1 flex flex-col gap-0.5">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={cn(
              'flex h-8 items-center gap-2 rounded px-2 text-left text-[12px] transition-colors',
              action.disabled
                ? 'cursor-not-allowed text-muted-foreground/45'
                : action.tone === 'primary'
                  ? 'bg-foreground text-background hover:bg-foreground/90'
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
