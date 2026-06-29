import type { ReactNode } from 'react';
import { SearchIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** 목록 페이지 필터 영역 컨테이너 — 검색 input + Select 필터들 + 결과 카운트를 한 줄로. */
export function FilterBar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      data-slot="filter-bar"
      className={cn('flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2', className)}
    >
      {children}
    </div>
  );
}

export interface FilterSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/** 필터바용 검색 인풋 (Search 아이콘 포함, 기본 w-56). */
export function FilterSearch({ value, onChange, placeholder = '검색', className }: FilterSearchProps) {
  return (
    <div className={cn('relative w-56', className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 bg-background pl-8"
      />
    </div>
  );
}

/** Radix Select는 빈 문자열 value를 허용하지 않으므로 "전체"는 sentinel 값으로 처리. */
const ALL_VALUE = '__all__';

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  /** 트리거에 표시할 필터 이름 (예: "상태") */
  label: string;
  /** 현재 값. '' 또는 null이면 "전체" */
  value: string | null | undefined;
  /** 선택 변경. "전체" 선택 시 '' 전달 */
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  /** "전체" 항목 라벨 (기본: "전체") */
  allLabel?: string;
  className?: string;
}

/** 필터바용 단일 선택 필터. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = '전체',
  className,
}: FilterSelectProps) {
  const selectValue = value ? value : ALL_VALUE;
  return (
    <Select
      value={selectValue}
      onValueChange={(next) => onChange(next === ALL_VALUE ? '' : next)}
    >
      <SelectTrigger size="sm" className={cn('gap-1.5 bg-background', className)}>
        <span className="text-muted-foreground">{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface FilterCountProps {
  n: number;
  /** 단위 (기본: "건") */
  unit?: string;
  className?: string;
}

/** 필터 결과 카운트 — 기본적으로 우측 정렬(ml-auto). "12건" */
export function FilterCount({ n, unit = '건', className }: FilterCountProps) {
  return (
    <span
      data-slot="filter-count"
      className={cn('ml-auto px-1 text-sm whitespace-nowrap text-muted-foreground tabular-nums', className)}
    >
      {n.toLocaleString()}
      {unit}
    </span>
  );
}
