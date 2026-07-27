import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface MultiFilterOption {
  value: string;
  label: string;
}

export function MultiFilterDropdown({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: MultiFilterOption[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const isAll = values.length === 0;
  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);
  const trigger = (() => {
    if (isAll) return '전체';
    if (selectedLabels.length === 1) return selectedLabels[0];
    return `${selectedLabels[0]} 외 ${selectedLabels.length - 1}`;
  })();
  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);
  return (
    <DropdownMenu onOpenChange={(open) => !open && setQuery('')}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isAll ? 'ghost' : 'secondary'}
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          aria-label={`${label} 필터: ${trigger}`}
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="max-w-24 truncate">{trigger}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 p-0"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-border/60 p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
            <Input
              autoFocus
              placeholder={`${label} 검색`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 border-border/60 pl-6 pr-6 text-xs"
            />
            {query && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setQuery('')}
                aria-label={`${label} 검색어 지우기`}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
        <div className="p-2">
          <button
            type="button"
            className={cn(
              'mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors',
              isAll ? 'bg-accent font-medium' : 'hover:bg-accent/60',
            )}
            onClick={() => onChange([])}
          >
            <span
              className={cn(
                'flex size-3.5 items-center justify-center rounded-sm border',
                isAll ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}
            >
              {isAll && '✓'}
            </span>
            전체 {label}
          </button>
          <div className="max-h-64 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                검색 결과 없음
              </div>
            ) : (
              filteredOptions.map((option) => {
                const checked = values.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs tabular-nums hover:bg-accent/60"
                    onClick={() => toggle(option.value)}
                  >
                    <span
                      className={cn(
                        'flex size-3.5 items-center justify-center rounded-sm border text-[10px]',
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border',
                      )}
                    >
                      {checked && '✓'}
                    </span>
                    {option.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
