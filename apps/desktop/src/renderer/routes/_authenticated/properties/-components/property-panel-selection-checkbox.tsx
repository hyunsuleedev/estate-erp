import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// The row supplies its hover group. The header intentionally has no group,
// so select-all appears only over its own gutter, when checked or keyboard focused.
export function PropertyPanelSelectionCheckbox({
  kind = 'match',
  label,
  checked,
  onCheckedChange,
}: {
  kind?: 'match' | 'ad';
  label: string;
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      data-match-selection-control={kind === 'match' ? '' : undefined}
      data-ad-selection-control={kind === 'ad' ? '' : undefined}
      className={cn(
        'absolute inset-y-0 left-0 flex w-9 cursor-pointer items-center justify-center transition-opacity duration-200 ease-in-out motion-reduce:transition-none',
        checked !== false
          ? 'opacity-100'
          : cn(
            'opacity-0 hover:!opacity-100 has-[:focus-visible]:!opacity-100 [@media(hover:none)]:opacity-100',
            kind === 'match' ? 'group-hover/match-selection:opacity-70' : 'group-hover/ad-selection:opacity-70',
          ),
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <Checkbox
        aria-label={label}
        onKeyDown={(event) => event.stopPropagation()}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        onClick={(event) => event.stopPropagation()}
        className="cursor-pointer rounded-[3px] shadow-none data-[state=unchecked]:!border-muted-foreground/50 data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
      />
    </label>
  );
}
