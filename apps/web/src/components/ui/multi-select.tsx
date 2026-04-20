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
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  className?: string
  badgeClassName?: string
  maxCount?: number
}

function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "선택...",
  className,
  badgeClassName,
  maxCount = 3,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)

  const handleSelect = (value: string) => {
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
          className={cn(
            "h-9 justify-between bg-background text-sm font-normal hover:bg-background",
            hasSelection ? "px-2" : "px-3",
            className,
          )}
        >
          {hasSelection ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedOptions.slice(0, maxCount).map((option) => (
                <Badge
                  key={option.value}
                  variant="secondary"
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-normal",
                    badgeClassName,
                  )}
                >
                  {option.icon && <span className="mr-1">{option.icon}</span>}
                  {option.label}
                  <button
                    className="ml-1.5 rounded-full outline-none hover:bg-foreground/20"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => handleRemove(e, option.value)}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              {selected.length > maxCount && (
                <Badge variant="secondary" className={cn("rounded-md px-2 py-0.5 text-xs font-normal", badgeClassName)}>
                  +{selected.length - maxCount}
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <div className="flex items-center gap-1 ml-1">
            {hasSelection && (
              <button
                className="rounded-full p-0.5 hover:bg-foreground/20"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClear}
              >
                <X className="size-3" />
              </button>
            )}
            <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="검색..." />
          <CommandList>
            <CommandEmpty>결과 없음</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => handleSelect(option.value)}
                    className="gap-2"
                  >
                    <div
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30 bg-transparent",
                      )}
                    >
                      {isSelected && <Check className="size-3" />}
                    </div>
                    {option.icon}
                    <span>{option.label}</span>
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
