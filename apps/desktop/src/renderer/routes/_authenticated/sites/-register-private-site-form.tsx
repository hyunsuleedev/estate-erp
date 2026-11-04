/**
 * 단지 직접 등록 — 검색되지 않는 단지(소규모 빌라 등)를 우리 사무소 전용으로 등록한다.
 *
 * 공개 여부는 입력받지도 보내지도 않는다. 서버가 항상 비공개로 저장한다.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Lock, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import type { OfficeSite } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { loadKakaoPostcode } from '@/lib/kakao-postcode';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { siteTypeLabels, toSiteAddress, type SiteAddress } from './-site-helpers';

const toOptionalNumber = (value: string) => (value ? Number(value) : undefined);
const onlyDigits = (value: string) => value.replace(/\D/g, '');

export function RegisterPrivateSiteForm({
  initialName,
  onBack,
  onRegistered,
}: {
  initialName: string;
  onBack: () => void;
  onRegistered: (officeSite: OfficeSite) => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [address, setAddress] = useState<SiteAddress | null>(null);
  const [isPickingAddress, setIsPickingAddress] = useState(false);
  const [name, setName] = useState(initialName);
  const [type, setType] = useState('');
  const [builtYear, setBuiltYear] = useState('');
  const [totalDongs, setTotalDongs] = useState('');
  const [totalUnits, setTotalUnits] = useState('');
  const isNameEdited = useRef(false);
  const shouldFocusName = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const trimmedName = name.trim();
  const isYearInvalid =
    builtYear !== '' && (Number(builtYear) < 1900 || Number(builtYear) > 2100);
  const isCountInvalid = [totalDongs, totalUnits].some(
    (value) => value !== '' && Number(value) < 1,
  );

  const register = useMutation({
    mutationFn: (selected: SiteAddress) =>
      api.officeSites.registerPrivateSite({
        name: trimmedName,
        type,
        wardCode: selected.wardCode,
        roadAddress: selected.roadAddress ?? undefined,
        jibunAddress: selected.jibunAddress ?? undefined,
        zipCode: selected.zipCode ?? undefined,
        builtYear: toOptionalNumber(builtYear),
        totalDongs: toOptionalNumber(totalDongs),
        totalUnits: toOptionalNumber(totalUnits),
      }),
    onSuccess: (officeSite) => {
      queryClient.invalidateQueries({ queryKey: ['office-sites'] });
      queryClient.invalidateQueries({ queryKey: ['office-sites-search'] });
      toast.success('단지를 등록했습니다');
      onRegistered(officeSite);
    },
  });

  const canSubmit =
    !!address &&
    !!trimmedName &&
    !!type &&
    !isYearInvalid &&
    !isCountInvalid &&
    !register.isPending;

  const handleAddressSelect = (selected: SiteAddress) => {
    setAddress(selected);
    setIsPickingAddress(false);
    // 사용자가 직접 고친 이름은 건드리지 않고, 검색어보다 정확한 건물명이 있으면 채운다
    if (selected.buildingName && !isNameEdited.current) setName(selected.buildingName);
    if (selected.isApartment) setType((current) => current || 'apartment');
    shouldFocusName.current = true;
  };

  // 주소 검색 결과는 React 이벤트 밖에서 오므로 폼이 다시 그려진 뒤에 초점을 옮긴다
  useEffect(() => {
    if (isPickingAddress || !shouldFocusName.current) return;
    shouldFocusName.current = false;
    nameRef.current?.focus();
  }, [isPickingAddress]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSubmit && address) register.mutate(address);
  };

  const header = (
    <DialogHeader>
      <DialogTitle>단지 직접 등록</DialogTitle>
      <DialogDescription className="flex items-center gap-1.5">
        <Lock className="size-3 shrink-0" aria-hidden="true" />
        우리 사무소에서만 보이는 비공개 단지로 등록됩니다
      </DialogDescription>
    </DialogHeader>
  );

  if (isPickingAddress) {
    return (
      <>
        {header}
        <SiteAddressSearch
          onSelect={handleAddressSelect}
          onCancel={() => setIsPickingAddress(false)}
        />
      </>
    );
  }

  const addressLines = address
    ? [address.roadAddress, address.jibunAddress].filter(Boolean)
    : [];

  return (
    <>
      {header}
      <form className="min-w-0 space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label className="text-sm">
            주소 <span className="text-destructive">*</span>
          </Label>
          {address ? (
            <div className="flex items-start gap-2 rounded-md bg-[#f7f6f3] px-3 py-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]" title={addressLines[0] ?? undefined}>
                  {addressLines[0]}
                </p>
                {addressLines[1] && (
                  <p className="truncate text-xs text-muted-foreground" title={addressLines[1]}>
                    {addressLines[1]}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => setIsPickingAddress(true)}
              >
                변경
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start font-normal text-muted-foreground"
              onClick={() => setIsPickingAddress(true)}
              autoFocus
            >
              <MapPin className="size-3.5" aria-hidden="true" />
              도로명, 지번, 건물명으로 주소 검색
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-name`} className="text-sm">
            단지명 <span className="text-destructive">*</span>
          </Label>
          <Input
            ref={nameRef}
            id={`${id}-name`}
            value={name}
            maxLength={100}
            autoComplete="off"
            placeholder="예: 고덕빌라"
            onChange={(event) => {
              isNameEdited.current = true;
              setName(event.target.value);
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm" id={`${id}-type`}>
            유형 <span className="text-destructive">*</span>
          </Label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${id}-type`}>
            {Object.entries(siteTypeLabels).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                onClick={() => setType(value)}
                className={cn(
                  'h-7 rounded-full border px-3 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70',
                  type === value
                    ? 'border-foreground bg-foreground font-medium text-background'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <OptionalNumberField
            label="준공년도"
            placeholder="2015"
            maxLength={4}
            value={builtYear}
            onChange={setBuiltYear}
            error={isYearInvalid ? '1900~2100' : undefined}
          />
          <OptionalNumberField
            label="동수"
            placeholder="1"
            maxLength={4}
            value={totalDongs}
            onChange={setTotalDongs}
            error={totalDongs !== '' && Number(totalDongs) < 1 ? '1 이상' : undefined}
          />
          <OptionalNumberField
            label="세대수"
            placeholder="24"
            maxLength={6}
            value={totalUnits}
            onChange={setTotalUnits}
            error={totalUnits !== '' && Number(totalUnits) < 1 ? '1 이상' : undefined}
          />
        </div>

        {register.isError && (
          <p role="alert" className="text-xs text-destructive">
            {register.error instanceof Error ? register.error.message : '단지를 등록하지 못했습니다'}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            검색으로
          </Button>
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {register.isPending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            등록
          </Button>
        </div>
      </form>
    </>
  );
}

function OptionalNumberField({
  label,
  placeholder,
  maxLength,
  value,
  onChange,
  error,
}: {
  label: string;
  placeholder: string;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {/* maxLength 속성은 숫자만 고르기 전에 잘라 "제2015년"을 망가뜨리므로 고른 뒤에 자른다 */}
      <Input
        id={id}
        value={value}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={!!error}
        onChange={(event) => onChange(onlyDigits(event.target.value).slice(0, maxLength))}
      />
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function SiteAddressSearch({
  onSelect,
  onCancel,
}: {
  onSelect: (address: SiteAddress) => void;
  onCancel: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    const timeout = window.setTimeout(() => {
      if (!active) return;
      setIsLoading(false);
      setError('주소 검색 연결이 지연되고 있습니다. 다시 시도해 주세요.');
    }, 15000);

    void loadKakaoPostcode()
      .then((Postcode) => {
        if (!active || !hostRef.current) return;
        hostRef.current.replaceChildren();
        new Postcode({
          width: '100%',
          height: '100%',
          autoMapping: false,
          onresize: () => {
            if (!active) return;
            clearTimeout(timeout);
            setIsLoading(false);
          },
          oncomplete: (result) => {
            if (!active) return;
            const selected = toSiteAddress(result);
            if (selected) onSelectRef.current(selected);
            else setError('이 주소의 법정동을 확인하지 못했습니다. 다른 검색 결과를 선택해주세요.');
          },
        }).embed(hostRef.current);
      })
      .catch((reason) => {
        clearTimeout(timeout);
        if (!active) return;
        setIsLoading(false);
        setError(reason instanceof Error ? reason.message : '주소 검색을 불러오지 못했습니다.');
      });

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [attempt]);

  return (
    <div className="min-w-0 space-y-3">
      {isLoading && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          주소 검색을 불러오는 중입니다
        </p>
      )}
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-md bg-muted p-3 text-sm">
          <p className="min-w-0">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setAttempt((current) => current + 1)}
          >
            다시 시도
          </Button>
        </div>
      )}
      <div
        ref={hostRef}
        className="h-[min(420px,55vh)] min-h-64 w-full overflow-hidden rounded-md border border-border"
        aria-busy={isLoading}
      />
      <div className="flex border-t border-border pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          주소 입력 취소
        </Button>
      </div>
    </div>
  );
}
