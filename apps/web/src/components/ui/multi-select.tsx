import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface MultiSelectOption {
  value: string
  label: string
  icon?: React.ReactNode
  description?: string
  meta?: React.ReactNode
  disabled?: boolean
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  ariaLabel?: string
  placeholder?: string
  className?: string
  badgeClassName?: string
  popoverClassName?: string
  maxCount?: number
  searchPlaceholder?: string
  emptyText?: string
  isLoading?: boolean
}

function MultiSelect({
  options,
  selected,
  onChange,
  ariaLabel,
  placeholder = "선택...",
  className,
  badgeClassName,
  popoverClassName,
  maxCount = 3,
  searchPlaceholder = "검색...",
  emptyText = "결과 없음",
  isLoading = false,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  const handleSelect = (value: string) => {
    if (options.find((option) => option.value === value)?.disabled) return

    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange([])
  }

  const handleRemove = (e: React.MouseEvent, value: string) => {
    e.stopPropagation()
    onChange(selected.filter((v) => v !== value))
  }

  const selectedOptions = options.filter((o) => selected.includes(o.value))
  const hasSelection = selected.length > 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={
            ariaLabel
              ? `${ariaLabel}: ${hasSelection ? `${selected.length}개 선택됨` : placeholder}`
              : hasSelection
                ? `${selected.length}개 선택됨`
                : placeholder
          }
          className={cn(
            "h-9 min-w-0 justify-between bg-background text-sm font-normal hover:bg-background",
            hasSelection ? "px-2" : "px-3",
            className,
          )}
        >
          {hasSelection ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              {selectedOptions.slice(0, maxCount).map((option) => (
                <Badge
                  key={option.value}
                  variant="secondary"
                  className={cn(
                    "min-w-0 max-w-full shrink rounded-md px-2 py-0.5 text-xs font-normal",
                    badgeClassName,
                  )}
                >
                  {option.icon && <span className="mr-1">{option.icon}</span>}
                  <span className="truncate">{option.label}</span>
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`${option.label} 선택 해제`}
                    className="ml-1.5 rounded-full outline-none hover:bg-foreground/20"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => handleRemove(e, option.value)}
                  >
                    <X className="size-3" />
                  </span>
                </Badge>
              ))}
              {selected.length > maxCount && (
                <Badge
                  variant="secondary"
                  className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs font-normal", badgeClassName)}
                >
                  +{selected.length - maxCount}
                </Badge>
              )}
            </div>
          ) : (
            <span className="truncate text-muted-foreground">{isLoading ? "불러오는 중..." : placeholder}</span>
          )}
          <div className="ml-1 flex shrink-0 items-center gap-1">
            {hasSelection && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="선택 모두 해제"
                className="rounded-full p-0.5 hover:bg-foreground/20"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClear}
              >
                <X className="size-3" />
              </span>
            )}
            <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[220px] p-0", popoverClassName)} align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{isLoading ? "불러오는 중..." : emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => handleSelect(option.value)}
                    disabled={option.disabled}
                    className="items-start gap-2 py-2"
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30 bg-transparent",
                      )}
                    >
                      {isSelected && <Check className="size-3" />}
                    </div>
                    {option.icon}
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="truncate">{option.label}</span>
                        {option.meta && (
                          <span className="shrink-0 text-[11px] text-muted-foreground">{option.meta}</span>
                        )}
                      </span>
                      {option.description && (
                        <span className="block truncate text-[11px] text-muted-foreground">{option.description}</span>
                      )}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => onChange([])}
                    className="justify-center text-center text-xs text-muted-foreground"
                  >
                    필터 초기화
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { MultiSelect }
