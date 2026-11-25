import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * 날짜 칸의 기본 최댓값. 크롬(Electron)의 날짜 칸은 최댓값이 없으면 연도 칸이 여섯 자리까지
 * 받아서 "20261122"처럼 숫자로 이어 치면 연도에 202611이 들어가 날짜가 비어 버린다.
 * 네 자리 연도로 막아 두면 연도 네 자리 뒤에 월·일 칸으로 저절로 넘어간다.
 */
const DEFAULT_MAX_BY_TYPE: Partial<Record<string, string>> = {
  date: "9999-12-31",
  "datetime-local": "9999-12-31T23:59",
  month: "9999-12",
}

function Input({ className, type, max, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      max={max ?? (type ? DEFAULT_MAX_BY_TYPE[type] : undefined)}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
