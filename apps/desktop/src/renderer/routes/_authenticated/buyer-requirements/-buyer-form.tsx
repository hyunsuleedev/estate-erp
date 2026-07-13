import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { TRANSACTION_TYPE_LABELS } from '@estate-erp/shared';
import type {
  BuyerRequirement,
  CreateBuyerRequirementDto,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatMoney, formatPhone } from '@/lib/format';
import { STATUS_CONFIG } from '@/lib/status-config';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SITE_TYPE_LABELS,
  toDateInputValue,
  toRegionSelections,
  toSiteSelections,
  type RegionSelection,
  type SiteSelection,
} from './-buyer-utils';

/* ─────────────────────────── 보조 입력 컴포넌트 ─────────────────────────── */

function MoneyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const n = Number(value);
  const hint = value.trim() !== '' && !Number.isNaN(n) && n > 0 ? formatMoney(n) : null;
  return (
    <div className="flex-1 space-y-0.5">
      <div className="relative">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 pr-10 text-sm tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
          만원
        </span>
      </div>
      <p className={cn('h-3.5 text-[11px] text-info', !hint && 'invisible')}>{hint ?? ' '}</p>
    </div>
  );
}

function AreaInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const n = Number(value);
  const hint =
    value.trim() !== '' && !Number.isNaN(n) && n > 0 ? `${(n * 0.3025).toFixed(1)}평` : null;
  return (
    <div className="flex-1 space-y-0.5">
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 pr-8 text-sm tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
          ㎡
        </span>
      </div>
      <p className={cn('h-3.5 text-[11px] text-info', !hint && 'invisible')}>{hint ?? ' '}</p>
    </div>
  );
}

/** 칩 토글 (매물유형, 거래유형, 긴급도) */
function ChipToggle({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs transition-colors',
        selected
          ? 'border-primary/40 bg-primary/10 font-medium text-primary'
          : 'border-border bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  );
}

/** 태그 입력 (필수/선호 조건) */
function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={add}>
          <Plus className="size-3.5" />
          추가
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── 메인 폼 ─────────────────────────────── */

export interface BuyerFormSubmitDto extends Omit<CreateBuyerRequirementDto, 'contactId'> {
  contactId?: string;
}

interface BuyerRequirementFormProps {
  mode: 'create' | 'edit';
  /** edit 모드 초기값 */
  initial?: BuyerRequirement;
  /** create 모드에서 contact 사전 지정 (연락처 상세에서 진입 등) */
  prefillContactId?: string;
  submitting: boolean;
  onSubmit: (dto: BuyerFormSubmitDto) => void;
  onCancel: () => void;
}

export function BuyerRequirementForm({
  mode,
  initial,
  prefillContactId,
  submitting,
  onSubmit,
  onCancel,
}: BuyerRequirementFormProps) {
  // ── 고객 선택 ──────────────────────────────────────────────
  const [contactQuery, setContactQuery] = useState('');
  const [prefillDismissed, setPrefillDismissed] = useState(false);
  const [selectedContact, setSelectedContact] = useState<{
    id: string;
    name: string;
    phone: string | null;
  } | null>(initial?.contact ?? null);

  const { data: contactResults } = useQuery({
    queryKey: ['contacts', 'buyer-form-search', contactQuery.trim()],
    queryFn: () => api.contacts.findAll({ search: contactQuery.trim(), limit: 8 }),
    enabled: mode === 'create' && contactQuery.trim().length >= 1,
  });

  // contactId만 들고 진입한 경우 (연락처 상세 → 신규 등록)
  const { data: prefilledContact } = useQuery({
    queryKey: ['contacts', 'detail', prefillContactId],
    queryFn: () => api.contacts.findOne(prefillContactId!),
    enabled: mode === 'create' && !!prefillContactId && !selectedContact && !prefillDismissed,
  });
  const effectiveContact =
    selectedContact ??
    (prefilledContact && !prefillDismissed
      ? { id: prefilledContact.id, name: prefilledContact.name, phone: prefilledContact.phone }
      : null);

  // ── 조건 필드 ──────────────────────────────────────────────
  const [transactionType, setTransactionType] = useState<string>(
    initial?.transactionType ?? '',
  );
  const [priceMin, setPriceMin] = useState(initial?.priceMin?.toString() ?? '');
  const [priceMax, setPriceMax] = useState(initial?.priceMax?.toString() ?? '');
  const [depositMin, setDepositMin] = useState(initial?.depositMin?.toString() ?? '');
  const [depositMax, setDepositMax] = useState(initial?.depositMax?.toString() ?? '');
  const [monthlyRentMax, setMonthlyRentMax] = useState(
    initial?.monthlyRentMax?.toString() ?? '',
  );
  const [areaMin, setAreaMin] = useState(initial?.areaMin?.toString() ?? '');
  const [areaMax, setAreaMax] = useState(initial?.areaMax?.toString() ?? '');
  const [siteTypes, setSiteTypes] = useState<string[]>(initial?.siteTypes ?? []);
  const [mustConditions, setMustConditions] = useState<string[]>(
    initial?.mustConditions ?? [],
  );
  const [preferConditions, setPreferConditions] = useState<string[]>(
    initial?.preferConditions ?? [],
  );
  const [moveInDate, setMoveInDate] = useState(toDateInputValue(initial?.moveInDate));
  const [urgency, setUrgency] = useState(initial?.urgency ?? 'normal');
  const [assignedToId, setAssignedToId] = useState(initial?.assignedToId ?? '');
  const [nextContactDate, setNextContactDate] = useState(
    toDateInputValue(initial?.nextContactDate),
  );
  const [memo, setMemo] = useState(initial?.memo ?? '');

  // ── 희망 지역 ──────────────────────────────────────────────
  const [regionQuery, setRegionQuery] = useState('');
  const [regions, setRegions] = useState<RegionSelection[]>(
    initial ? toRegionSelections(initial) : [],
  );
  const { data: regionResults = [] } = useQuery({
    queryKey: ['regions', 'search', regionQuery.trim()],
    queryFn: () => api.regions.search(regionQuery.trim(), 10),
    enabled: regionQuery.trim().length >= 1,
  });

  // ── 희망 단지 ──────────────────────────────────────────────
  const [siteQuery, setSiteQuery] = useState('');
  const [sites, setSites] = useState<SiteSelection[]>(
    initial ? toSiteSelections(initial) : [],
  );
  const { data: siteResults = [] } = useQuery({
    queryKey: ['sites', 'central-search', siteQuery.trim()],
    queryFn: () => api.officeSites.searchCentral(siteQuery.trim()),
    enabled: siteQuery.trim().length >= 1,
  });
  // 관리단지 quick pick (고정 단지 프리셋 저장소 부재 — 관리단지를 추천 소스로 사용)
  const { data: officeSites = [] } = useQuery({
    queryKey: ['office-sites'],
    queryFn: () => api.officeSites.findAll(),
  });
  const quickPickSites = useMemo(() => {
    const selectedIds = new Set(sites.map((s) => s.siteId));
    return officeSites
      .flatMap((os) => (os.site ? [{ siteId: os.site.id, name: os.site.name }] : []))
      .filter((s) => !selectedIds.has(s.siteId))
      .slice(0, 8);
  }, [officeSites, sites]);

  // ── 담당자 ────────────────────────────────────────────────
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
  });

  // ── 경고 (비차단) ─────────────────────────────────────────
  const noScope = siteTypes.length === 0 && regions.length === 0 && sites.length === 0;
  const nextContactInPast = useMemo(() => {
    if (!nextContactDate) return false;
    const d = new Date(`${nextContactDate}T23:59:59`);
    return d.getTime() < Date.now();
  }, [nextContactDate]);

  const isMonthly = transactionType === 'monthly';

  // ── 제출 ──────────────────────────────────────────────────
  const handleSubmit = () => {
    if (mode === 'create' && !effectiveContact) {
      toast.error('고객을 먼저 선택해주세요.');
      return;
    }
    // 숫자 변환: 빈값은 edit이면 null(값 비움), create면 undefined
    const num = (s: string): number | null | undefined => {
      const t = s.trim();
      if (t === '') return mode === 'edit' ? null : undefined;
      const n = Number(t);
      if (Number.isNaN(n) || n < 0) return mode === 'edit' ? null : undefined;
      return n;
    };
    const pMin = num(priceMin);
    const pMax = num(priceMax);
    const dMin = num(depositMin);
    const dMax = num(depositMax);
    const aMin = num(areaMin);
    const aMax = num(areaMax);
    if (pMin != null && pMax != null && pMin > pMax) {
      toast.error('예산 범위가 올바르지 않습니다. (최소값 ≤ 최대값)');
      return;
    }
    if (dMin != null && dMax != null && dMin > dMax) {
      toast.error('보증금 범위가 올바르지 않습니다. (최소값 ≤ 최대값)');
      return;
    }
    if (aMin != null && aMax != null && aMin > aMax) {
      toast.error('면적 범위가 올바르지 않습니다. (최소값 ≤ 최대값)');
      return;
    }

    const dto: BuyerFormSubmitDto = {
      contactId: effectiveContact?.id,
      transactionType: transactionType || undefined,
      siteTypes,
      priceMin: isMonthly ? (mode === 'edit' ? null : undefined) : pMin,
      priceMax: isMonthly ? (mode === 'edit' ? null : undefined) : pMax,
      depositMin: isMonthly ? dMin : mode === 'edit' ? null : undefined,
      depositMax: isMonthly ? dMax : mode === 'edit' ? null : undefined,
      monthlyRentMax: isMonthly ? num(monthlyRentMax) : mode === 'edit' ? null : undefined,
      areaMin: aMin,
      areaMax: aMax,
      mustConditions,
      preferConditions,
      moveInDate: moveInDate || undefined,
      urgency,
      assignedToId: assignedToId || undefined,
      nextContactDate: nextContactDate || undefined,
      memo: memo.trim() || undefined,
      preferredSites: sites.map((s, i) => ({ siteId: s.siteId, priority: i + 1 })),
      preferredRegions: regions.map((r) =>
        r.level === 'ward'
          ? { wardCode: r.code }
          : r.level === 'district'
            ? { districtCode: r.code }
            : { provinceCode: r.code },
      ),
    };
    onSubmit(dto);
  };

  const priceLabel =
    transactionType === 'jeonse' ? '전세 보증금 범위' : '매매가 범위';

  return (
    <div className="max-w-3xl space-y-5">
      {/* ── 고객 ── */}
      <section className="space-y-2 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">
          고객 <span className="text-destructive">*</span>
        </h3>
        {effectiveContact ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/60 px-2.5 py-1 text-sm">
              <span className="font-medium">{effectiveContact.name}</span>
              {effectiveContact.phone && (
                <span className="tabular-nums text-xs text-muted-foreground">
                  {formatPhone(effectiveContact.phone)}
                </span>
              )}
            </span>
            {mode === 'create' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => {
                  setSelectedContact(null);
                  setPrefillDismissed(true);
                  setContactQuery('');
                }}
              >
                변경
              </Button>
            )}
            {mode === 'edit' && (
              <span className="text-xs text-muted-foreground">고객은 변경할 수 없습니다</span>
            )}
          </div>
        ) : (
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="고객명 또는 전화번호 검색"
                className="h-8 pl-8 text-sm"
              />
            </div>
            {contactQuery.trim().length >= 1 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-sm">
                {(contactResults?.items ?? []).length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">검색 결과가 없습니다</p>
                ) : (
                  (contactResults?.items ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setSelectedContact({ id: c.id, name: c.name, phone: c.phone });
                        setContactQuery('');
                      }}
                    >
                      <span>{c.name}</span>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {formatPhone(c.phone)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── 거래 조건 ── */}
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">거래 조건</h3>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">거래유형</Label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
              <ChipToggle
                key={value}
                selected={transactionType === value}
                label={label}
                onClick={() => setTransactionType(transactionType === value ? '' : value)}
              />
            ))}
          </div>
        </div>
        {isMonthly ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">보증금 범위</Label>
              <div className="flex items-start gap-1.5">
                <MoneyInput value={depositMin} onChange={setDepositMin} placeholder="최소" />
                <span className="mt-1.5 text-xs text-muted-foreground">~</span>
                <MoneyInput value={depositMax} onChange={setDepositMax} placeholder="최대" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">월세 상한</Label>
              <MoneyInput value={monthlyRentMax} onChange={setMonthlyRentMax} placeholder="월세 상한" />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{priceLabel}</Label>
            <div className="flex max-w-md items-start gap-1.5">
              <MoneyInput value={priceMin} onChange={setPriceMin} placeholder="최소" />
              <span className="mt-1.5 text-xs text-muted-foreground">~</span>
              <MoneyInput value={priceMax} onChange={setPriceMax} placeholder="최대" />
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">면적 범위 (전용)</Label>
          <div className="flex max-w-md items-start gap-1.5">
            <AreaInput value={areaMin} onChange={setAreaMin} placeholder="최소" />
            <span className="mt-1.5 text-xs text-muted-foreground">~</span>
            <AreaInput value={areaMax} onChange={setAreaMax} placeholder="최대" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">희망 매물유형</Label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(SITE_TYPE_LABELS).map(([value, label]) => (
              <ChipToggle
                key={value}
                selected={siteTypes.includes(value)}
                label={label}
                onClick={() =>
                  setSiteTypes(
                    siteTypes.includes(value)
                      ? siteTypes.filter((t) => t !== value)
                      : [...siteTypes, value],
                  )
                }
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── 희망 지역 / 단지 ── */}
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">희망 지역 · 단지</h3>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">희망 지역 (구/동 검색)</Label>
          <div className="relative max-w-md">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={regionQuery}
                onChange={(e) => setRegionQuery(e.target.value)}
                placeholder="예: 강동구, 고덕동"
                className="h-8 pl-8 text-sm"
              />
            </div>
            {regionQuery.trim().length >= 1 && regionResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-sm">
                {regionResults.map((r) => (
                  <button
                    key={`${r.level}:${r.code}`}
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      if (!regions.some((x) => x.level === r.level && x.code === r.code)) {
                        setRegions([...regions, { level: r.level, code: r.code, label: r.name }]);
                      }
                      setRegionQuery('');
                    }}
                  >
                    <span>{r.fullName}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {r.level === 'ward' ? '읍면동' : r.level === 'district' ? '시군구' : '시도'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {regions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {regions.map((r) => (
                <span
                  key={`${r.level}:${r.code}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted px-1.5 py-0.5 text-xs"
                >
                  {r.label}
                  <button
                    type="button"
                    onClick={() =>
                      setRegions(regions.filter((x) => !(x.level === r.level && x.code === r.code)))
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">희망 단지 (전체 단지 검색)</Label>
          <div className="relative max-w-md">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={siteQuery}
                onChange={(e) => setSiteQuery(e.target.value)}
                placeholder="단지명 검색 (관리단지가 아니어도 선택 가능)"
                className="h-8 pl-8 text-sm"
              />
            </div>
            {siteQuery.trim().length >= 1 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-sm">
                {siteResults.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">검색 결과가 없습니다</p>
                ) : (
                  siteResults.slice(0, 12).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        if (!sites.some((x) => x.siteId === s.id)) {
                          setSites([...sites, { siteId: s.id, name: s.name }]);
                        }
                        setSiteQuery('');
                      }}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="ml-2 shrink-0 truncate text-[11px] text-muted-foreground">
                        {s.jibunAddress ?? s.roadAddress ?? ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {quickPickSites.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted-foreground">관리단지 빠른 선택:</span>
              {quickPickSites.map((s) => (
                <button
                  key={s.siteId}
                  type="button"
                  onClick={() => setSites([...sites, s])}
                  className="rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
                >
                  + {s.name}
                </button>
              ))}
            </div>
          )}
          {sites.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sites.map((s) => (
                <span
                  key={s.siteId}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs text-primary"
                >
                  {s.name}
                  <button
                    type="button"
                    onClick={() => setSites(sites.filter((x) => x.siteId !== s.siteId))}
                    className="hover:opacity-70"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        {noScope && (
          <Alert>
            <AlertDescription className="text-xs">
              지역·단지·매물유형이 모두 비어 있습니다. 저장은 가능하지만 매칭 후보 탐색이
              어려워집니다.
            </AlertDescription>
          </Alert>
        )}
      </section>

      {/* ── 필수/선호 조건 ── */}
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">필수 · 선호 조건</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">필수 조건</Label>
            <TagInput
              values={mustConditions}
              onChange={setMustConditions}
              placeholder="예: 역세권, 남향 (Enter로 추가)"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">선호 조건</Label>
            <TagInput
              values={preferConditions}
              onChange={setPreferConditions}
              placeholder="예: 고층, 주차 2대"
            />
          </div>
        </div>
      </section>

      {/* ── 일정 / 담당 ── */}
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">일정 · 담당</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">입주 희망일</Label>
            <Input
              type="date"
              value={moveInDate}
              onChange={(e) => setMoveInDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">긴급도</Label>
            <div className="flex gap-1.5 pt-0.5">
              {Object.entries(STATUS_CONFIG.buyerUrgency).map(([value, meta]) => (
                <ChipToggle
                  key={value}
                  selected={urgency === value}
                  label={meta.label}
                  onClick={() => setUrgency(value)}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">담당자</Label>
            <Select
              value={assignedToId || 'none'}
              onValueChange={(v) => setAssignedToId(v === 'none' ? '' : v)}
            >
              <SelectTrigger className="h-8 w-full text-sm">
                <SelectValue placeholder="미지정" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">미지정</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">다음 연락일</Label>
            <Input
              type="date"
              value={nextContactDate}
              onChange={(e) => setNextContactDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
        {nextContactInPast && (
          <Alert>
            <AlertDescription className="text-xs">
              다음 연락일이 과거 날짜입니다. 저장하면 바로 '연락 필요' 목록에 표시됩니다.
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">메모</Label>
          <Textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="상담 배경, 특이사항 등"
            className="min-h-20 text-sm"
          />
        </div>
      </section>

      {/* ── 액션 ── */}
      <div className="flex items-center justify-end gap-2 pb-8">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          취소
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? '저장 중…' : mode === 'create' ? '구매고객 등록' : '조건 저장'}
        </Button>
      </div>
    </div>
  );
}
