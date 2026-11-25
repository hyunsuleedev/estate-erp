/**
 * 호수 추가 — 직접 등록한 건물에 호실(또는 층 단위 공간)을 넣는다.
 *
 * 빌라·다가구는 호실을 한꺼번에 넣는 일이 많아 "101, 102, 201"처럼 여러 호를 한 번에 받는다.
 * 상가처럼 호 없이 층을 통째로 쓰는 공간은 호를 비우고 층만 적는다.
 */
import { formatUnitLabel, parseFloorInput } from '@estate-erp/shared';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Dong, Unit } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { formatPyeong } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Skeleton } from '@/components/ui/skeleton';

/** 한 번에 넣을 수 있는 호 수. 실수로 긴 글을 붙여 넣었을 때 수백 번 요청하지 않게 한다 */
const MAX_UNITS_PER_ADD = 60;

/** "301호" → "301". 공공 데이터의 호 이름(숫자만)과 같은 모양으로 저장해야 중복 확인이 맞는다 */
function normalizeUnitName(raw: string): string {
  const name = raw.trim();
  return /^\d+호$/.test(name) ? name.slice(0, -1) : name;
}

/** 쉼표·띄어쓰기·줄바꿈으로 나눈 호 이름들. 같은 이름은 한 번만 */
export function parseUnitNames(text: string): string[] {
  return Array.from(
    new Set(text.split(/[,\s]+/).map(normalizeUnitName).filter(Boolean)),
  );
}

interface AddUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string | undefined;
  siteName: string;
  /** 동 목록을 받았는지 — 받기 전에는 '동 없음'으로 판단하지 않는다(있는 건물에 본동을 또 만들게 된다) */
  isSiteReady: boolean;
  isSiteError: boolean;
  onRetrySite: () => void;
  dongs: Dong[];
  /** 처음 고를 동(지금 보고 있는 동이 하나면 그 동) */
  defaultDongId?: string;
  onAdded: (units: Unit[]) => void;
}

export function AddUnitDialog(props: AddUnitDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* 본문이 창과 함께 사라지므로 다시 열면 입력이 비어 있다 */}
        <AddUnitDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function AddUnitDialogBody({
  onOpenChange,
  siteId,
  siteName,
  isSiteReady,
  isSiteError,
  onRetrySite,
  dongs,
  defaultDongId,
  onAdded,
}: AddUnitDialogProps) {
  const id = useId();
  const queryClient = useQueryClient();
  const realDongs = useMemo(() => dongs.filter((dong) => !dong.isPlaceholder), [dongs]);
  // 동이 둘 이상이면 고르게 한다 — 첫 동에 말없이 넣으면 엉뚱한 동에 호실이 생긴다
  const needsDongChoice = dongs.length > 1;
  const [dongId, setDongId] = useState(() => {
    if (defaultDongId && dongs.some((dong) => dong.id === defaultDongId)) return defaultDongId;
    return dongs.length === 1 ? dongs[0].id : '';
  });
  const [namesText, setNamesText] = useState('');
  const [floorText, setFloorText] = useState('');
  const [area, setArea] = useState('');
  const [roomCount, setRoomCount] = useState('');
  const [bathRoomCount, setBathRoomCount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const names = parseUnitNames(namesText);
  const floor = parseFloorInput(floorText);
  const isFloorInvalid = floorText.trim() !== '' && floor === null;
  const areaNumber = area.trim() ? Number(area) : undefined;
  const isAreaInvalid = areaNumber !== undefined && (!Number.isFinite(areaNumber) || areaNumber <= 0);

  const addUnits = useMutation({
    mutationFn: async () => {
      if (!siteId) throw new Error('단지가 선택되지 않았습니다');
      let targetDongId = dongId || (dongs.length === 1 ? dongs[0].id : '');
      if (!targetDongId) {
        if (dongs.length > 1) throw new Error('동을 고르세요.');
        // 동이 하나도 없는 건물(예전에 등록한 단독·다가구)은 본동을 먼저 만든다
        const created = await api.dongs.create({ siteId, name: '본동' });
        targetDongId = created.id;
      }
      const common = {
        siteId,
        dongId: targetDongId,
        floor: floor ?? undefined,
        exclusiveAreaM2: areaNumber,
        roomCount: roomCount ? Number(roomCount) : null,
        bathRoomCount: bathRoomCount ? Number(bathRoomCount) : null,
      };
      const targets: Array<string | null> = names.length > 0 ? names : [null];
      const created: Unit[] = [];
      const failed: Array<{ label: string; message: string }> = [];
      // 차례로 넣는다: 같은 건물의 중복 확인이 서로 엇갈리지 않게
      for (const name of targets) {
        try {
          created.push(await api.units.create({ ...common, name }));
        } catch (cause) {
          failed.push({
            label: name ?? formatUnitLabel({ name: null, floor: floor ?? null }),
            message: apiErrorMessage(cause, '추가하지 못했습니다'),
          });
        }
      }
      return { created, failed };
    },
    onSuccess: ({ created, failed }) => {
      if (created.length > 0) {
        void queryClient.invalidateQueries({ queryKey: ['sites', siteId] });
        void queryClient.invalidateQueries({ queryKey: ['office-sites'] });
        void queryClient.invalidateQueries({ queryKey: ['units'] });
        void queryClient.invalidateQueries({ queryKey: ['dongs', siteId] });
      }
      if (failed.length === 0) {
        toast.success(
          created.length > 1 ? `호수 ${created.length}개를 추가했습니다` : '호수를 추가했습니다',
        );
        onAdded(created);
        onOpenChange(false);
        return;
      }
      // 실패한 호만 칸에 남겨 고치거나 다시 누르게 한다
      if (created.length > 0) toast.success(`호수 ${created.length}개를 추가했습니다`);
      setNamesText(failed.map((item) => item.label).join(', '));
      setError(
        failed.length === 1
          ? `${failed[0].label}: ${failed[0].message}`
          : `${failed.length}개를 추가하지 못했습니다 — ${failed
              .slice(0, 3)
              .map((item) => `${item.label}(${item.message})`)
              .join(', ')}${failed.length > 3 ? ' 외' : ''}`,
      );
      if (created.length > 0) onAdded(created);
    },
    onError: (cause) => {
      setError(apiErrorMessage(cause, '호수를 추가하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const validationMessage = !isSiteReady
    ? '단지 정보를 불러오는 중입니다'
    : needsDongChoice && !dongId
      ? '동을 고르세요.'
      : names.length === 0 && floor === null
        ? isFloorInvalid
          ? '층을 확인하세요. 예: 2층, B1'
          : '호를 입력하세요. 호 없이 층 전체를 쓰면 층만 적습니다.'
        : isFloorInvalid
          ? '층을 확인하세요. 예: 2층, B1'
          : isAreaInvalid
            ? '전용면적은 0보다 큰 수로 입력하세요.'
            : names.length > MAX_UNITS_PER_ADD
              ? `한 번에 ${MAX_UNITS_PER_ADD}개까지 추가할 수 있습니다.`
              : null;
  const canSubmit = !validationMessage && !addUnits.isPending;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (canSubmit) addUnits.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="min-w-0 space-y-4">
      <DialogHeader>
        <DialogTitle>호수 추가</DialogTitle>
        <DialogDescription>{siteName}</DialogDescription>
      </DialogHeader>

      {!isSiteReady ? (
        isSiteError ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-xs"
          >
            <span className="min-w-0">단지 정보를 불러오지 못했습니다</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={onRetrySite}
            >
              다시 시도
            </Button>
          </div>
        ) : (
          <Skeleton className="h-9 w-full rounded-md" />
        )
      ) : realDongs.length > 0 ? (
        <div className="space-y-1.5">
          <Label className="text-sm" id={`${id}-dong`}>
            동 {needsDongChoice && <span className="text-destructive">*</span>}
          </Label>
          <Select value={dongId} onValueChange={setDongId}>
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
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-names`} className="text-sm">
          호
        </Label>
        <Input
          id={`${id}-names`}
          placeholder="예: 301   여러 호는 101, 102, 201"
          value={namesText}
          autoComplete="off"
          autoFocus
          onChange={(event) => {
            setNamesText(event.target.value);
            setError(null);
          }}
        />
        {names.length > 1 && (
          <p className="text-[12px] text-muted-foreground">
            {names.length}개 호: {names.slice(0, 8).join(', ')}
            {names.length > 8 ? ' …' : ''}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-floor`} className="text-sm">
          층
        </Label>
        <Input
          id={`${id}-floor`}
          placeholder="예: 2층, B1 — 호 없이 층 전체를 쓸 때"
          value={floorText}
          autoComplete="off"
          aria-invalid={isFloorInvalid}
          onChange={(event) => {
            setFloorText(event.target.value);
            setError(null);
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-area`} className="text-sm">
          전용면적 (m²)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={`${id}-area`}
            type="number"
            min={0}
            step="any"
            placeholder="예: 59.9"
            value={area}
            aria-invalid={isAreaInvalid}
            onChange={(event) => setArea(event.target.value)}
          />
          {areaNumber !== undefined && !isAreaInvalid && (
            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
              {formatPyeong(areaNumber)}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-rooms`} className="text-sm">
            방 수
          </Label>
          <Input
            id={`${id}-rooms`}
            type="number"
            min={0}
            step={1}
            placeholder="예: 2"
            value={roomCount}
            onChange={(event) => setRoomCount(event.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-baths`} className="text-sm">
            욕실 수
          </Label>
          <Input
            id={`${id}-baths`}
            type="number"
            min={0}
            step={1}
            placeholder="예: 1"
            value={bathRoomCount}
            onChange={(event) => setBathRoomCount(event.target.value.replace(/\D/g, ''))}
          />
        </div>
      </div>
      {names.length > 1 && (
        <p className="-mt-2 text-[12px] text-muted-foreground">
          층·면적·방 수는 적은 호 모두에 같이 들어갑니다.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <DialogFooter className="items-center">
        {validationMessage && isSiteReady && (namesText || floorText || area) ? (
          <p className="mr-auto text-xs text-muted-foreground">{validationMessage}</p>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {addUnits.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {names.length > 1 ? `${names.length}개 추가` : '추가'}
        </Button>
      </DialogFooter>
    </form>
  );
}
