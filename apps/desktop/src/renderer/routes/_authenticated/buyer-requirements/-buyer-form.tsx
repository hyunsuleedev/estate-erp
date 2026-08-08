import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  pyeongToSqm,
  sqmToPyeong,
  TRANSACTION_TYPE_LABELS,
} from "@estate-erp/shared";
import type {
  BuyerRequirement,
  CreateBuyerRequirementDto,
} from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatMoney, formatPhone } from "@/lib/format";
import { STATUS_CONFIG } from "@/lib/status-config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SITE_TYPE_LABELS,
  toDateInputValue,
  toRegionSelections,
  toSiteSelections,
  type RegionSelection,
  type SiteSelection,
} from "./-buyer-utils";

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
  const hint =
    value.trim() !== "" && !Number.isNaN(n) && n > 0 ? formatMoney(n) : null;
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
      <p className={cn("h-3.5 text-[11px] text-info", !hint && "invisible")}>
        {hint ?? " "}
      </p>
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
    value.trim() !== "" && !Number.isNaN(n) && n > 0
      ? `${pyeongToSqm(n)}㎡`
      : null;
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
          평
        </span>
      </div>
      <p className={cn("h-3.5 text-[11px] text-info", !hint && "invisible")}>
        {hint ?? " "}
      </p>
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
        "rounded-md border px-2.5 py-1 text-xs transition-colors",
        selected
          ? "border-primary/40 bg-primary/10 font-medium text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

/* ─────────────────────── 범위 프리셋 (예산/면적) ─────────────────────── */

interface RangePreset {
  label: string;
  min: string;
  max: string;
}

/** 프리셋 칩 — 클릭 시 min/max를 한 번에 채운다. */
function PresetChips({
  presets,
  onSelect,
}: {
  presets: RangePreset[];
  onSelect: (preset: RangePreset) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-muted-foreground">빠른 입력:</span>
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onSelect(p)}
          className="rounded-md border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** 매매가 프리셋 (만원) */
const PRICE_PRESETS: RangePreset[] = [
  { label: "~3억", min: "", max: "30000" },
  { label: "3~5억", min: "30000", max: "50000" },
  { label: "5~10억", min: "50000", max: "100000" },
  { label: "10~15억", min: "100000", max: "150000" },
  { label: "15억~", min: "150000", max: "" },
];

/** 전세 보증금 프리셋 (만원) */
const JEONSE_PRESETS: RangePreset[] = [
  { label: "~1억", min: "", max: "10000" },
  { label: "1~2억", min: "10000", max: "20000" },
  { label: "2~3억", min: "20000", max: "30000" },
  { label: "3~5억", min: "30000", max: "50000" },
  { label: "5억~", min: "50000", max: "" },
];

/** 월세 보증금 프리셋 (만원) */
const DEPOSIT_PRESETS: RangePreset[] = [
  { label: "~3천", min: "", max: "3000" },
  { label: "3천~5천", min: "3000", max: "5000" },
  { label: "5천~1억", min: "5000", max: "10000" },
  { label: "1억~", min: "10000", max: "" },
];

/** 월세 프리셋 (만원) */
const RENT_PRESETS: RangePreset[] = [
  { label: "~30", min: "", max: "30" },
  { label: "30~50", min: "30", max: "50" },
  { label: "50~100", min: "50", max: "100" },
  { label: "100~", min: "100", max: "" },
];

/** 공급평형 프리셋 (평) */
const AREA_PRESETS: RangePreset[] = [
  { label: "~20평", min: "", max: "20" },
  { label: "20평대", min: "20", max: "29" },
  { label: "30평대", min: "30", max: "39" },
  { label: "40평~", min: "40", max: "" },
];

/* ─────────────────────── 섹션 헤더 (단계 표시) ─────────────────────── */

function SectionHeader({
  step,
  title,
  required,
  complete,
  description,
}: {
  step: number;
  title: string;
  required?: boolean;
  complete: boolean;
  description?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
          complete
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {complete ? <Check className="size-3" /> : step}
      </span>
      <h3 className="text-sm font-semibold">
        {title} {required && <span className="text-destructive">*</span>}
      </h3>
      {description && (
        <span className="text-[11px] text-muted-foreground">{description}</span>
      )}
    </div>
  );
}

function toPyeongInput(areaM2: number | null | undefined): string {
  if (areaM2 == null) return "";
  const value = Number(areaM2);
  return Number.isFinite(value) && value > 0 ? String(sqmToPyeong(value)) : "";
}

/* ─────────────────────────────── 메인 폼 ─────────────────────────────── */

export interface BuyerFormSubmitDto extends Omit<
  CreateBuyerRequirementDto,
  "contactId"
> {
  contactId?: string;
}

interface BuyerRequirementFormProps {
  mode: "create" | "edit";
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
  const [contactQuery, setContactQuery] = useState("");
  const [prefillDismissed, setPrefillDismissed] = useState(false);
  const [selectedContact, setSelectedContact] = useState<{
    id: string;
    name: string;
    phone: string | null;
  } | null>(initial?.contact ?? null);

  const { data: contactResults } = useQuery({
    queryKey: ["contacts", "buyer-form-search", contactQuery.trim()],
    queryFn: () =>
      api.contacts.findAll({ search: contactQuery.trim(), limit: 8 }),
    enabled: mode === "create" && contactQuery.trim().length >= 1,
  });

  // contactId만 들고 진입한 경우 (연락처 상세 → 신규 등록)
  const { data: prefilledContact } = useQuery({
    queryKey: ["contacts", "detail", prefillContactId],
    queryFn: () => api.contacts.findOne(prefillContactId!),
    enabled:
      mode === "create" &&
      !!prefillContactId &&
      !selectedContact &&
      !prefillDismissed,
  });
  const effectiveContact =
    selectedContact ??
    (prefilledContact && !prefillDismissed
      ? {
          id: prefilledContact.id,
          name: prefilledContact.name,
          phone: prefilledContact.phone,
        }
      : null);

  // ── 조건 필드 ──────────────────────────────────────────────
  const [transactionType, setTransactionType] = useState<string>(
    initial?.transactionType ?? "",
  );
  const [priceMin, setPriceMin] = useState(initial?.priceMin?.toString() ?? "");
  const [priceMax, setPriceMax] = useState(initial?.priceMax?.toString() ?? "");
  const [depositMin, setDepositMin] = useState(
    initial?.depositMin?.toString() ?? "",
  );
  const [depositMax, setDepositMax] = useState(
    initial?.depositMax?.toString() ?? "",
  );
  const [monthlyRentMin, setMonthlyRentMin] = useState(
    initial?.monthlyRentMin?.toString() ?? "",
  );
  const [monthlyRentMax, setMonthlyRentMax] = useState(
    initial?.monthlyRentMax?.toString() ?? "",
  );
  const [areaMinPyeong, setAreaMinPyeong] = useState(
    toPyeongInput(initial?.areaMin),
  );
  const [areaMaxPyeong, setAreaMaxPyeong] = useState(
    toPyeongInput(initial?.areaMax),
  );
  const [siteTypes, setSiteTypes] = useState<string[]>(
    initial?.siteTypes ?? [],
  );
  const [moveInDate, setMoveInDate] = useState(
    toDateInputValue(initial?.moveInDate),
  );
  const [urgency, setUrgency] = useState(initial?.urgency ?? "normal");
  const [assignedToId, setAssignedToId] = useState(initial?.assignedToId ?? "");
  const [nextContactDate, setNextContactDate] = useState(
    toDateInputValue(initial?.nextContactDate),
  );
  const [memo, setMemo] = useState(initial?.memo ?? "");

  // ── 희망 지역 ──────────────────────────────────────────────
  const [regionQuery, setRegionQuery] = useState("");
  const [regions, setRegions] = useState<RegionSelection[]>(
    initial ? toRegionSelections(initial) : [],
  );
  const { data: regionResults = [] } = useQuery({
    queryKey: ["regions", "search", regionQuery.trim()],
    queryFn: () => api.regions.search(regionQuery.trim(), 10),
    enabled: regionQuery.trim().length >= 1,
  });

  // 시/도 → 시군구 → 읍면동 단계별 선택
  const [cascadeProvince, setCascadeProvince] = useState("");
  const [cascadeDistrict, setCascadeDistrict] = useState("");
  const [cascadeWard, setCascadeWard] = useState("");
  const { data: provinces = [] } = useQuery({
    queryKey: ["regions", "provinces"],
    queryFn: () => api.regions.findProvinces(),
    staleTime: Infinity,
  });
  const { data: cascadeDistricts = [] } = useQuery({
    queryKey: ["regions", "districts", cascadeProvince],
    queryFn: () => api.regions.findDistricts(cascadeProvince),
    enabled: !!cascadeProvince,
    staleTime: Infinity,
  });
  const { data: cascadeWards = [] } = useQuery({
    queryKey: ["regions", "wards", cascadeDistrict],
    queryFn: () => api.regions.findWards(cascadeDistrict),
    enabled: !!cascadeDistrict,
    staleTime: Infinity,
  });

  const addRegion = (selection: RegionSelection) => {
    if (
      !regions.some(
        (x) => x.level === selection.level && x.code === selection.code,
      )
    ) {
      setRegions([...regions, selection]);
    }
  };

  /** 단계별 선택에서 가장 깊은 레벨을 추가한다. */
  const addCascadeRegion = () => {
    const ward = cascadeWards.find((w) => w.code === cascadeWard);
    const district = cascadeDistricts.find((d) => d.code === cascadeDistrict);
    const province = provinces.find((p) => p.code === cascadeProvince);
    if (ward) {
      addRegion({ level: "ward", code: ward.code, label: ward.name });
      setCascadeWard("");
    } else if (district) {
      addRegion({ level: "district", code: district.code, label: district.name });
      setCascadeDistrict("");
      setCascadeWard("");
    } else if (province) {
      addRegion({ level: "province", code: province.code, label: province.name });
      setCascadeDistrict("");
      setCascadeWard("");
    }
  };

  // ── 희망 단지 ──────────────────────────────────────────────
  const [siteQuery, setSiteQuery] = useState("");
  const [sites, setSites] = useState<SiteSelection[]>(
    initial ? toSiteSelections(initial) : [],
  );
  const { data: siteResults = [] } = useQuery({
    queryKey: ["sites", "central-search", siteQuery.trim()],
    queryFn: () => api.officeSites.searchCentral(siteQuery.trim()),
    enabled: siteQuery.trim().length >= 1,
  });
  // 관리단지 quick pick (고정 단지 프리셋 저장소 부재 — 관리단지를 추천 소스로 사용)
  const { data: officeSites = [] } = useQuery({
    queryKey: ["office-sites"],
    queryFn: () => api.officeSites.findAll(),
  });
  const quickPickSites = useMemo(() => {
    const selectedIds = new Set(sites.map((s) => s.siteId));
    return officeSites
      .flatMap((os) =>
        os.site ? [{ siteId: os.site.id, name: os.site.name }] : [],
      )
      .filter((s) => !selectedIds.has(s.siteId))
      .slice(0, 8);
  }, [officeSites, sites]);

  // ── 담당자 ────────────────────────────────────────────────
  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.employees.findAll(),
  });

  // ── 경고 (비차단) ─────────────────────────────────────────
  const noScope =
    siteTypes.length === 0 && regions.length === 0 && sites.length === 0;
  const nextContactInPast = useMemo(() => {
    if (!nextContactDate) return false;
    const d = new Date(`${nextContactDate}T23:59:59`);
    return d.getTime() < Date.now();
  }, [nextContactDate]);

  const isMonthly = transactionType === "monthly";

  // ── 섹션 입력 완료 상태 (진행 표시용) ──────────────────────
  const hasBudgetInput =
    priceMin.trim() !== "" ||
    priceMax.trim() !== "" ||
    depositMin.trim() !== "" ||
    depositMax.trim() !== "" ||
    monthlyRentMin.trim() !== "" ||
    monthlyRentMax.trim() !== "" ||
    areaMinPyeong.trim() !== "" ||
    areaMaxPyeong.trim() !== "";
  const sectionComplete = [
    !!effectiveContact,
    transactionType !== "" || hasBudgetInput || siteTypes.length > 0,
    regions.length > 0 || sites.length > 0,
    moveInDate !== "" ||
      nextContactDate !== "" ||
      assignedToId !== "" ||
      memo.trim() !== "",
  ];
  const completedCount = sectionComplete.filter(Boolean).length;

  // ── 제출 ──────────────────────────────────────────────────
  const handleSubmit = () => {
    if (mode === "create" && !effectiveContact) {
      toast.error("고객을 먼저 선택해주세요.");
      return;
    }
    // 숫자 변환: 빈값은 edit이면 null(값 비움), create면 undefined
    const num = (s: string): number | null | undefined => {
      const t = s.trim();
      if (t === "") return mode === "edit" ? null : undefined;
      const n = Number(t);
      if (Number.isNaN(n) || n < 0) return mode === "edit" ? null : undefined;
      return n;
    };
    const pMin = num(priceMin);
    const pMax = num(priceMax);
    const dMin = num(depositMin);
    const dMax = num(depositMax);
    const rMin = num(monthlyRentMin);
    const rMax = num(monthlyRentMax);
    const aMinPyeong = num(areaMinPyeong);
    const aMaxPyeong = num(areaMaxPyeong);
    if (pMin != null && pMax != null && pMin > pMax) {
      toast.error("예산 범위가 올바르지 않습니다. (최소값 ≤ 최대값)");
      return;
    }
    if (dMin != null && dMax != null && dMin > dMax) {
      toast.error("보증금 범위가 올바르지 않습니다. (최소값 ≤ 최대값)");
      return;
    }
    if (rMin != null && rMax != null && rMin > rMax) {
      toast.error("월세 범위가 올바르지 않습니다. (최소값 ≤ 최대값)");
      return;
    }
    if (aMinPyeong != null && aMaxPyeong != null && aMinPyeong > aMaxPyeong) {
      toast.error("공급평형 범위가 올바르지 않습니다. (최소값 ≤ 최대값)");
      return;
    }

    const areaMin = aMinPyeong == null ? aMinPyeong : pyeongToSqm(aMinPyeong);
    const areaMax = aMaxPyeong == null ? aMaxPyeong : pyeongToSqm(aMaxPyeong);

    const dto: BuyerFormSubmitDto = {
      contactId: effectiveContact?.id,
      transactionType: transactionType || undefined,
      siteTypes,
      priceMin: isMonthly ? (mode === "edit" ? null : undefined) : pMin,
      priceMax: isMonthly ? (mode === "edit" ? null : undefined) : pMax,
      depositMin: isMonthly ? dMin : mode === "edit" ? null : undefined,
      depositMax: isMonthly ? dMax : mode === "edit" ? null : undefined,
      monthlyRentMin: isMonthly ? rMin : mode === "edit" ? null : undefined,
      monthlyRentMax: isMonthly ? rMax : mode === "edit" ? null : undefined,
      areaMin,
      areaMax,
      moveInDate: moveInDate || undefined,
      urgency,
      assignedToId: assignedToId || undefined,
      nextContactDate: nextContactDate || undefined,
      memo: memo.trim() || undefined,
      preferredSites: sites.map((s, i) => ({
        siteId: s.siteId,
        priority: i + 1,
      })),
      preferredRegions: regions.map((r) =>
        r.level === "ward"
          ? { wardCode: r.code }
          : r.level === "district"
            ? { districtCode: r.code }
            : { provinceCode: r.code },
      ),
    };
    onSubmit(dto);
  };

  const priceLabel =
    transactionType === "jeonse" ? "전세 보증금 범위" : "매매가 범위";
  const pricePresets = transactionType === "jeonse" ? JEONSE_PRESETS : PRICE_PRESETS;

  return (
    <div className="max-w-3xl space-y-5">
      {/* ── 진행 표시 ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>구매 조건 입력</span>
          <span className="tabular-nums">{completedCount}/4 섹션 입력됨</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${(completedCount / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* ── 고객 ── */}
      <section className="space-y-2 rounded-lg border p-4">
        <SectionHeader
          step={1}
          title="고객"
          required
          complete={sectionComplete[0]}
        />
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
            {mode === "create" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => {
                  setSelectedContact(null);
                  setPrefillDismissed(true);
                  setContactQuery("");
                }}
              >
                변경
              </Button>
            )}
            {mode === "edit" && (
              <span className="text-xs text-muted-foreground">
                고객은 변경할 수 없습니다
              </span>
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
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    검색 결과가 없습니다
                  </p>
                ) : (
                  (contactResults?.items ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setSelectedContact({
                          id: c.id,
                          name: c.name,
                          phone: c.phone,
                        });
                        setContactQuery("");
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
        <SectionHeader
          step={2}
          title="거래 조건"
          complete={sectionComplete[1]}
          description="예산과 면적은 범위로 입력"
        />
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">거래유형</Label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
              <ChipToggle
                key={value}
                selected={transactionType === value}
                label={label}
                onClick={() =>
                  setTransactionType(transactionType === value ? "" : value)
                }
              />
            ))}
          </div>
        </div>

        {/* 예산 */}
        <div className="space-y-2 rounded-md bg-muted/40 p-3">
          <p className="text-[11px] font-medium text-muted-foreground">예산</p>
          {isMonthly ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  보증금 범위
                </Label>
                <div className="flex items-start gap-1.5">
                  <MoneyInput
                    value={depositMin}
                    onChange={setDepositMin}
                    placeholder="최소"
                  />
                  <span className="mt-1.5 text-xs text-muted-foreground">~</span>
                  <MoneyInput
                    value={depositMax}
                    onChange={setDepositMax}
                    placeholder="최대"
                  />
                </div>
                <PresetChips
                  presets={DEPOSIT_PRESETS}
                  onSelect={(p) => {
                    setDepositMin(p.min);
                    setDepositMax(p.max);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">월세 범위</Label>
                <div className="flex items-start gap-1.5">
                  <MoneyInput
                    value={monthlyRentMin}
                    onChange={setMonthlyRentMin}
                    placeholder="최소"
                  />
                  <span className="mt-1.5 text-xs text-muted-foreground">~</span>
                  <MoneyInput
                    value={monthlyRentMax}
                    onChange={setMonthlyRentMax}
                    placeholder="최대"
                  />
                </div>
                <PresetChips
                  presets={RENT_PRESETS}
                  onSelect={(p) => {
                    setMonthlyRentMin(p.min);
                    setMonthlyRentMax(p.max);
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="max-w-md space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {priceLabel}
              </Label>
              <div className="flex items-start gap-1.5">
                <MoneyInput
                  value={priceMin}
                  onChange={setPriceMin}
                  placeholder="최소"
                />
                <span className="mt-1.5 text-xs text-muted-foreground">~</span>
                <MoneyInput
                  value={priceMax}
                  onChange={setPriceMax}
                  placeholder="최대"
                />
              </div>
              <PresetChips
                presets={pricePresets}
                onSelect={(p) => {
                  setPriceMin(p.min);
                  setPriceMax(p.max);
                }}
              />
            </div>
          )}
        </div>

        {/* 면적 */}
        <div className="space-y-2 rounded-md bg-muted/40 p-3">
          <p className="text-[11px] font-medium text-muted-foreground">면적</p>
          <div className="max-w-md space-y-1.5">
            <Label className="text-xs text-muted-foreground">공급평형</Label>
            <div className="flex items-start gap-1.5">
              <AreaInput
                value={areaMinPyeong}
                onChange={setAreaMinPyeong}
                placeholder="최소"
              />
              <span className="mt-1.5 text-xs text-muted-foreground">~</span>
              <AreaInput
                value={areaMaxPyeong}
                onChange={setAreaMaxPyeong}
                placeholder="최대"
              />
            </div>
            <PresetChips
              presets={AREA_PRESETS}
              onSelect={(p) => {
                setAreaMinPyeong(p.min);
                setAreaMaxPyeong(p.max);
              }}
            />
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
        <SectionHeader
          step={3}
          title="희망 지역 · 단지"
          complete={sectionComplete[2]}
          description="지역은 검색 또는 단계별 선택"
        />
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">희망 지역</Label>
          <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Select
              value={cascadeProvince}
              onValueChange={(v) => {
                setCascadeProvince(v);
                setCascadeDistrict("");
                setCascadeWard("");
              }}
            >
              <SelectTrigger className="h-8 w-full text-sm">
                <SelectValue placeholder="시/도" />
              </SelectTrigger>
              <SelectContent>
                {provinces.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={cascadeDistrict}
              onValueChange={(v) => {
                setCascadeDistrict(v);
                setCascadeWard("");
              }}
              disabled={!cascadeProvince}
            >
              <SelectTrigger className="h-8 w-full text-sm">
                <SelectValue placeholder="시/군/구" />
              </SelectTrigger>
              <SelectContent>
                {cascadeDistricts.map((d) => (
                  <SelectItem key={d.code} value={d.code}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={cascadeWard}
              onValueChange={setCascadeWard}
              disabled={!cascadeDistrict}
            >
              <SelectTrigger className="h-8 w-full text-sm">
                <SelectValue placeholder="읍/면/동" />
              </SelectTrigger>
              <SelectContent>
                {cascadeWards.map((w) => (
                  <SelectItem key={w.code} value={w.code}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={!cascadeProvince}
              onClick={addCascadeRegion}
            >
              <Plus className="size-3.5" />
              추가
            </Button>
          </div>
          <div className="relative max-w-md">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={regionQuery}
                onChange={(e) => setRegionQuery(e.target.value)}
                placeholder="또는 구/동 이름으로 검색 (예: 강동구, 고덕동)"
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
                      addRegion({ level: r.level, code: r.code, label: r.name });
                      setRegionQuery("");
                    }}
                  >
                    <span>{r.fullName}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {r.level === "ward"
                        ? "읍면동"
                        : r.level === "district"
                          ? "시군구"
                          : "시도"}
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
                      setRegions(
                        regions.filter(
                          (x) => !(x.level === r.level && x.code === r.code),
                        ),
                      )
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
          <Label className="text-xs text-muted-foreground">
            희망 단지 (전체 단지 검색)
          </Label>
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
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    검색 결과가 없습니다
                  </p>
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
                        setSiteQuery("");
                      }}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="ml-2 shrink-0 truncate text-[11px] text-muted-foreground">
                        {s.jibunAddress ?? s.roadAddress ?? ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {quickPickSites.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted-foreground">
                관리단지 빠른 선택:
              </span>
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
                    onClick={() =>
                      setSites(sites.filter((x) => x.siteId !== s.siteId))
                    }
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
              지역·단지·매물유형이 모두 비어 있습니다. 저장은 가능하지만 매칭
              후보 탐색이 어려워집니다.
            </AlertDescription>
          </Alert>
        )}
      </section>

      {/* ── 일정 / 담당 ── */}
      <section className="space-y-3 rounded-lg border p-4">
        <SectionHeader
          step={4}
          title="일정 · 담당"
          complete={sectionComplete[3]}
        />
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
              {Object.entries(STATUS_CONFIG.buyerUrgency).map(
                ([value, meta]) => (
                  <ChipToggle
                    key={value}
                    selected={urgency === value}
                    label={meta.label}
                    onClick={() => setUrgency(value)}
                  />
                ),
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">담당자</Label>
            <Select
              value={assignedToId || "none"}
              onValueChange={(v) => setAssignedToId(v === "none" ? "" : v)}
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
              다음 연락일이 과거 날짜입니다. 저장하면 다음 액션이 지연 상태로
              표시됩니다.
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">요건 메모</Label>
          <Textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="남향 필수, 고층 선호 등 추가 조건과 상담 배경"
            className="min-h-20 text-sm"
          />
        </div>
      </section>

      {/* ── 액션 ── */}
      <div className="flex items-center justify-end gap-2 pb-8">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          취소
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting
            ? "저장 중…"
            : mode === "create"
              ? "구매고객 등록"
              : "조건 저장"}
        </Button>
      </div>
    </div>
  );
}
