/**
 * 관리호수 추가 — 단지에 이미 있는 호실을 골라 우리 사무소의 관리호수(Property)로 등록한다.
 *
 * 호실 자체를 새로 만드는 것은 '호수 추가'(-add-unit-dialog)의 일이다. 여기서는 동을 고르고
 * 그 동의 호 목록에서 한 호를 골라 등록한다(호를 손으로 적지 않고, 한 번에 한 호만 — 사용자 결정 2026-11-25).
 */
import { formatUnitLabel } from '@estate-erp/shared';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Dong, Unit } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { formatPyeong } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isManagedUnit, isPilotiUnit } from './-site-helpers';

interface AddManagedUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string | undefined;
  siteName: string;
  dongs: Dong[];
  /** 처음 고를 동(지금 보고 있는 동이 하나면 그 동) */
  defaultDongId?: string;
  /** 직접 등록한 건물이면 없는 호를 '호수 추가'로 넣을 수 있다고 알려 준다 */
  canAddUnits: boolean;
  /** 새로 관리호수가 된 호실 */
  onAdded: (unit: Unit) => void;
}

export function AddManagedUnitDialog(props: AddManagedUnitDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* 본문이 창과 함께 사라지므로 다시 열면 입력이 비어 있다 */}
        <AddManagedUnitDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function AddManagedUnitDialogBody({
  onOpenChange,
  siteId,
  siteName,
  dongs,
  defaultDongId,
  canAddUnits,
  onAdded,
}: AddManagedUnitDialogProps) {
  const id = useId();
  const queryClient = useQueryClient();
  const hasRealDongs = dongs.some((dong) => !dong.isPlaceholder);
  const needsDongChoice = dongs.length > 1;
  const [dongId, setDongId] = useState(() => {
    if (defaultDongId && dongs.some((dong) => dong.id === defaultDongId)) return defaultDongId;
    return dongs.length === 1 ? dongs[0].id : '';
  });
  const [unitId, setUnitId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const {
    data: dongUnits,
    isLoading: isLoadingUnits,
    isError: isUnitsError,
    refetch: refetchUnits,
  } = useQuery({
    // ['sites', siteId]로 시작해 호실·관리호수가 바뀌면 함께 다시 받는다
    queryKey: ['sites', siteId, 'units', 'managed-unit-picker', dongId],
    queryFn: () => {
      if (!siteId) throw new Error('단지가 선택되지 않았습니다');
      return api.units.findAll({ siteId, dongIds: [dongId] });
    },
    enabled: !!siteId && !!dongId,
  });

  // 호 번호 순서로. 필로티는 호실이 아니라 뺀다
  const options = useMemo(
    () =>
      (dongUnits ?? [])
        .filter((unit) => !isPilotiUnit(unit))
        .map((unit) => ({ unit, label: formatUnitLabel(unit) }))
        .sort((left, right) => left.label.localeCompare(right.label, 'ko', { numeric: true })),
    [dongUnits],
  );
  const selectedUnit = options.find((option) => option.unit.id === unitId)?.unit ?? null;
  // 고른 뒤 다른 직원이 먼저 등록했으면 다시 고르게 한다
  const target = selectedUnit && !isManagedUnit(selectedUnit) ? selectedUnit : null;

  const register = useMutation({
    mutationFn: async (unit: Unit) => {
      if (!siteId) throw new Error('단지가 선택되지 않았습니다');
      // ensure: 그 사이 다른 직원이 등록했어도 두 번 만들지 않는다
      await api.properties.ensure({ siteId, unitId: unit.id });
      return unit;
    },
    onSuccess: (unit) => {
      void queryClient.invalidateQueries({ queryKey: ['sites', siteId] });
      void queryClient.invalidateQueries({ queryKey: ['properties'] });
      // 관리단지 사이드바의 단지별 관리호수 수(office-sites 집계)도 함께 갱신
      void queryClient.invalidateQueries({ queryKey: ['office-sites'] });
      void queryClient.invalidateQueries({ queryKey: ['units'] });
      toast.success('관리호수로 등록했습니다');
      onAdded(unit);
      onOpenChange(false);
    },
    onError: (cause) => {
      setError(apiErrorMessage(cause, '관리호수로 등록하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const canSubmit = !!target && !register.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (target && canSubmit) register.mutate(target);
  };

  return (
    <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
      <DialogHeader>
        <DialogTitle>관리호수 추가</DialogTitle>
        <DialogDescription>{siteName}</DialogDescription>
      </DialogHeader>

      {hasRealDongs && (
        <div className="space-y-1.5">
          <Label className="text-sm" id={`${id}-dong`}>
            동 {needsDongChoice && <span className="text-destructive">*</span>}
          </Label>
          <Select
            value={dongId}
            onValueChange={(value) => {
              setDongId(value);
              setUnitId('');
              setError(null);
            }}
          >
            <SelectTrigger aria-labelledby={`${id}-dong`}>
              <SelectValue placeholder="동 선택" />
            </SelectTrigger>
            <SelectContent>
              {dongs.map((dong) => (
                <SelectItem key={dong.id} value={dong.id}>
                  {dong.isPlaceholder ? '동 구분 없음' : dong.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-sm" id={`${id}-unit`}>
          호
        </Label>
        {!dongId ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            동을 먼저 고르세요.
          </p>
        ) : isUnitsError ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-xs"
          >
            <span className="min-w-0">호수를 불러오지 못했습니다</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={() => refetchUnits()}
            >
              다시 시도
            </Button>
          </div>
        ) : (
          // 동을 바꾸면 찾던 글과 강조된 줄을 비운다
          <Command
            key={dongId}
            className="rounded-md border border-border bg-transparent"
            // 적은 숫자가 그대로 들어 있는 호만 남긴다 — cmdk 기본 찾기는 "3302"에 "302"·"3304"도 낸다
            filter={(_value, search, keywords) =>
              (keywords?.[0] ?? '').includes(search.trim()) ? 1 : 0
            }
          >
            <CommandInput placeholder="호 찾기 · ↑↓ 이동 · Enter 선택" autoFocus />
            <CommandList className="max-h-[240px]" aria-labelledby={`${id}-unit`}>
              <CommandEmpty>
                {isLoadingUnits
                  ? '불러오는 중...'
                  : options.length === 0
                    ? canAddUnits
                      ? '이 동에 호수가 없습니다. 먼저 ‘호수 추가’로 넣으세요.'
                      : '이 동에 호수가 없습니다.'
                    : '결과 없음'}
              </CommandEmpty>
              <CommandGroup>
                {options.map(({ unit, label }) => {
                  const managed = isManagedUnit(unit);
                  const isSelected = unit.id === unitId;
                  return (
                    <CommandItem
                      key={unit.id}
                      // 같은 이름의 호가 둘이어도 줄이 서로 겹치지 않게 id를 붙인다
                      value={`${label} ${unit.id}`}
                      keywords={[label]}
                      disabled={managed}
                      onSelect={() => {
                        setUnitId(unit.id);
                        setError(null);
                      }}
                      className="gap-2.5 py-1.5"
                    >
                      <Check
                        className={cn('size-3.5 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')}
                        strokeWidth={2.5}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{label}</span>
                      <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                        {managed
                          ? '관리호수'
                          : [
                              unit.siteUnitType?.name,
                              unit.exclusiveAreaM2 != null
                                ? formatPyeong(Number(unit.exclusiveAreaM2))
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <DialogFooter className="items-center">
        {/* 찾는 글을 바꿔 고른 줄이 목록에서 사라져도 무엇을 등록하는지 늘 보이게 한다 */}
        {target && (
          <p className="mr-auto min-w-0 truncate text-xs text-muted-foreground" aria-live="polite">
            {`선택한 호: ${formatUnitLabel(target)}`}
          </p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {register.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          등록
        </Button>
      </DialogFooter>
    </form>
  );
}
