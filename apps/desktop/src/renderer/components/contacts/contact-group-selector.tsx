import type { ComponentType } from 'react';
import { Building2, BriefcaseBusiness, Home, MessageSquareText, Target, Users } from 'lucide-react';
import { CONTACT_GROUPS } from '@/lib/contacts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const contactGroupIcons: Record<string, ComponentType<{ className?: string }>> = {
  '매수/투자': Target,
  임차: Home,
  매물상담: MessageSquareText,
  소유자: Users,
  거래처: BriefcaseBusiness,
  중개사무소: Building2,
};

export function ContactGroupSelector({
  selectedTags,
  onToggle,
}: {
  selectedTags: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {CONTACT_GROUPS.map((group) => {
        const Icon = contactGroupIcons[group.tag] ?? Target;
        const selected = selectedTags.includes(group.tag);

        return (
          <Button
            key={group.id}
            type="button"
            variant="outline"
            className={cn(
              'h-auto items-start justify-start gap-3 px-3 py-3 text-left',
              selected && 'border-primary bg-primary/5 text-primary',
            )}
            onClick={() => onToggle(group.tag)}
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
            <div className="space-y-1">
              <div className="text-sm font-medium">{group.label}</div>
              <div className="text-xs leading-relaxed text-muted-foreground">
                {group.description}
              </div>
            </div>
          </Button>
        );
      })}
    </div>
  );
}
