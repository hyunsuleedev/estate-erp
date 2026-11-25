import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  pyeongToSqm,
  sqmToPyeong,
  TRANSACTION_TYPE_LABELS,
} from "@estate-erp/shared";
import {
  ApiError,
  type BuyerRequirement,
  type CreateBuyerRequirementDto,
} from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney, formatPhone } from "@/lib/format";
import { STATUS_CONFIG } from "@/lib/status-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTabScopedState } from "@/features/tabs/hooks/useTabScopedState";
import { describeManwon, MANWON_INPUT_HINT, parseManwon } from "@/lib/manwon";
import {
  formatPhoneWhileTyping,
  phoneInputProblem,
  useExistingContactByPhone,
} from "@/lib/phone";
import { useAuth } from "@/providers/auth-provider";
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

/**
 * 만원 금액 칸. 전화로 들은 대로 "8억" · "8억 5천" · "85000"을 받는다(앱 공용 규칙 lib/manwon.ts).
 * 읽은 값을 바로 아래에 되비춘다("= 8억 5,000만"). 못 읽으면 그렇다고 알린다.
 */
function MoneyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const echo = describeManwon(value);
  return (
    <div className="flex-1 space-y-0.5">
      <div className="relative">
        <Input
          type="text"
          inputMode="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={echo.invalid || undefined}
          title={MANWON_INPUT_HINT}
          className="h-9 pr-10 text-sm tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
          만원
        </span>
      </div>
      <p
        className={cn(
          "h-4 text-xs",
          echo.invalid ? "text-destructive" : "text-info",
          !echo.text && "invisible",
        )}
      >
        {echo.text ?? " "}
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
          className="h-9 pr-8 text-sm tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
          평
        </span>
      </div>
      <p className={cn("h-4 text-xs text-info", !hint && "invisible")}>
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
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-md border px-3 text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        selected
          ? "border-primary bg-primary font-medium text-primary-foreground"
          : "border-input bg-background text-foreground/80 hover:bg-muted",
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
    <div className="flex flex-wrap items-center gap-1" aria-label="빠른 입력">
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onSelect(p)}
          className="h-6 rounded-full bg-muted/70 px-2.5 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** 매매가 프리셋 (만원) */
const PRICE_PRESETS: RangePreset[] = [
  { label: "~5억", min: "", max: "50000" },
  { label: "5~10억", min: "50000", max: "100000" },
  { label: "10~15억", min: "100000", max: "150000" },
  { label: "15~20억", min: "150000", max: "200000" },
  { label: "20억~", min: "200000", max: "" },
];

/** 전세 보증금 프리셋 (만원) */
const JEONSE_PRESETS: RangePreset[] = [
  { label: "~3억", min: "", max: "30000" },
  { label: "3~5억", min: "30000", max: "50000" },
  { label: "5~8억", min: "50000", max: "80000" },
  { label: "8~10억", min: "80000", max: "100000" },
  { label: "10억~", min: "100000", max: "" },
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
  title,
  required,
  description,
}: {
  title: string;
  required?: boolean;
  description?: string;
}) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">
        {title} {required && <span className="text-destructive">*</span>}
      </h3>
      {description && (
        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

/** 오른쪽 요약 열의 한 줄 */
function SummaryLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 whitespace-pre-line break-keep", !value && "text-muted-foreground/70")}>{value ?? "—"}</dd>
    </div>
  );
}

/** "5억 ~ 10억" · "5억 이상" · "10억 이하". 둘 다 비었거나 읽지 못하면 null */
function rangeSummary(minText: string | null, maxText: string | null): string | null {
  if (minText && maxText) return `${minText} ~ ${maxText}`;
  if (minText) return `${minText} 이상`;
  if (maxText) return `${maxText} 이하`;
  return null;
}

function moneyText(raw: string): string | null {
  const parsed = parseManwon(raw);
  return parsed.valid && parsed.value != null ? formatMoney(parsed.value) : null;
}

function pyeongText(raw: string): string | null {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isFinite(n) && n > 0 ? `${n}평` : null;
}

function toPyeongInput(areaM2: number | null | undefined): string {
  if (areaM2 == null) return "";
  const value = Number(areaM2);
  return Number.isFinite(value) && value > 0 ? String(sqmToPyeong(value)) : "";
}

/* ─────────────────────────────── 화면 틀 ─────────────────────────────── */

/** 희망매물 등록 · 수정 화면의 틀: 큰 제목과 선, 그 아래 폼 (매물 등록 화면과 같은 폭) */
export function BuyerFormPage({
  title,
  description,
  onBack,
  children,
}: {
  title: string;
  description?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1016px] pt-6">
      <header className="mb-8 flex items-start gap-1.5 border-b border-border/70 pb-6">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-ml-1.5 mt-0.5 shrink-0"
          onClick={onBack}
          aria-label="뒤로가기"
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-[24px] font-semibold leading-8 tracking-[-0.02em]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}

/* ─────────────────────────────── 메인 폼 ─────────────────────────────── */

export interface BuyerFormSubmitDto extends Omit<
  CreateBuyerRequirementDto,
  | "contactId"
  | "transactionType"
  | "moveInDate"
  | "assignedToId"
  | "nextContactDate"
  | "memo"
> {
  contactId?: string;
  /** 수정에서는 null = 비우기 */
  transactionType?: string | null;
  moveInDate?: string | null;
  assignedToId?: string | null;
  nextContactDate?: string | null;
  memo?: string | null;
  /**
   * 등록에서 "함께 알아보는 거래"를 고르면 그 거래유형마다 조건이 하나씩 더 생긴다
   * (매매와 전세를 같이 알아보는 손님). 지역 · 평형 · 일정은 같고 거래유형과 예산만 다르다.
   */
  extras?: BuyerFormSubmitDto[];
}

/** 함께 알아보는 거래의 예산 입력. 월세는 min/max가 보증금이고 rent가 월세다. */
interface ExtraBudget {
  min: string;
  max: string;
  rentMin: string;
  rentMax: string;
}

const EMPTY_EXTRA_BUDGET: ExtraBudget = { min: "", max: "", rentMin: "", rentMax: "" };

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
  const [contactQuery, setContactQuery] = useTabScopedState("buyer-form:contact-query:v1", "");
  const [prefillDismissed, setPrefillDismissed] = useTabScopedState(
    "buyer-form:prefill-dismissed:v1",
    false,
  );
  const [selectedContact, setSelectedContact] = useTabScopedState<{
    id: string;
    name: string;
    phone: string | null;
  } | null>("buyer-form:selected-contact:v1", initial?.contact ?? null);

  const { data: contactResults, isFetching: contactSearching } = useQuery({
    queryKey: ["contacts", "buyer-form-search", contactQuery.trim()],
    queryFn: () =>
      api.contacts.findAll({ search: contactQuery.trim(), limit: 8 }),
    enabled: mode === "create" && contactQuery.trim().length >= 1,
  });

  // ── 새 고객 등록 (전화를 받으며 처음 온 손님을 바로 적는다) ─────────
  // 연락처 화면에 다녀오지 않고 이름 · 전화번호만으로 만든다. 같은 번호의 고객이 있으면 그 고객을 고르게 한다.
  const queryClient = useQueryClient();
  const [newContactOpen, setNewContactOpen] = useTabScopedState(
    "buyer-form:new-contact-open:v1",
    false,
  );
  const [newContactName, setNewContactName] = useTabScopedState(
    "buyer-form:new-contact-name:v1",
    "",
  );
  const [newContactPhone, setNewContactPhone] = useTabScopedState(
    "buyer-form:new-contact-phone:v1",
    "",
  );
  const [existingContact, setExistingContact] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // 적는 동안 이미 있는 번호인지 미리 본다 (연락처 추가 · 프로젝트 열기와 같은 확인)
  const { contact: phoneOwnerContact } = useExistingContactByPhone(newContactPhone, {
    enabled: newContactOpen,
  });
  const phoneOwner = phoneOwnerContact
    ? { id: phoneOwnerContact.id, name: phoneOwnerContact.name }
    : null;
  // 서버가 409로 알려 준 고객이 먼저, 없으면 미리 찾은 고객
  const duplicateContact = existingContact ?? phoneOwner;
  const openNewContact = () => {
    const typed = contactQuery.trim();
    // 검색어가 번호처럼 보이면 번호 칸에, 아니면 이름 칸에 넣어 둔다
    if (/^[\d\s-]+$/.test(typed)) {
      setNewContactPhone(typed);
    } else if (typed) {
      setNewContactName(typed);
    }
    setExistingContact(null);
    setNewContactOpen(true);
  };
  const createContactMutation = useMutation({
    mutationFn: () =>
      api.contacts.create({
        name: newContactName.trim(),
        phone: newContactPhone.trim() || undefined,
      }),
    onSuccess: (contact) => {
      setSelectedContact({ id: contact.id, name: contact.name, phone: contact.phone });
      setNewContactOpen(false);
      setNewContactName("");
      setNewContactPhone("");
      setContactQuery("");
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(`${contact.name} 고객을 연락처에 등록했습니다.`);
    },
    onError: (error: Error) => {
      // 같은 번호의 고객이 이미 있다 — 새로 만들지 않고 그 고객을 고르게 한다
      if (error instanceof ApiError && error.statusCode === 409) {
        const body = error.body as { contactId?: string; contactName?: string };
        if (body?.contactId) {
          setExistingContact({ id: body.contactId, name: body.contactName ?? "기존 고객" });
          return;
        }
      }
      toast.error(apiErrorMessage(error, "고객을 등록하지 못했습니다. 다시 시도해 주세요."));
    },
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
  const [transactionType, setTransactionType] = useTabScopedState<string>(
    "buyer-form:transaction-type:v1",
    initial?.transactionType ?? "",
  );
  // 함께 알아보는 거래 (등록에서만). 거래유형마다 조건이 하나씩 따로 생긴다.
  const [extraTypes, setExtraTypes] = useTabScopedState<string[]>(
    "buyer-form:extra-types:v1",
    [],
  );
  const [extraBudgets, setExtraBudgets] = useTabScopedState<Record<string, ExtraBudget>>(
    "buyer-form:extra-budgets:v1",
    {},
  );
  const visibleExtraTypes = extraTypes.filter((type) => type !== transactionType);
  const updateExtraBudget = (type: string, patch: Partial<ExtraBudget>) =>
    setExtraBudgets({
      ...extraBudgets,
      [type]: { ...EMPTY_EXTRA_BUDGET, ...extraBudgets[type], ...patch },
    });
  const [priceMin, setPriceMin] = useTabScopedState(
    "buyer-form:price-min:v1",
    initial?.priceMin?.toString() ?? "",
  );
  const [priceMax, setPriceMax] = useTabScopedState(
    "buyer-form:price-max:v1",
    initial?.priceMax?.toString() ?? "",
  );
  const [depositMin, setDepositMin] = useTabScopedState(
    "buyer-form:deposit-min:v1",
    initial?.depositMin?.toString() ?? "",
  );
  const [depositMax, setDepositMax] = useTabScopedState(
    "buyer-form:deposit-max:v1",
    initial?.depositMax?.toString() ?? "",
  );
  const [monthlyRentMin, setMonthlyRentMin] = useTabScopedState(
    "buyer-form:monthly-rent-min:v1",
    initial?.monthlyRentMin?.toString() ?? "",
  );
  const [monthlyRentMax, setMonthlyRentMax] = useTabScopedState(
    "buyer-form:monthly-rent-max:v1",
    initial?.monthlyRentMax?.toString() ?? "",
  );
  const [areaMinPyeong, setAreaMinPyeong] = useTabScopedState(
    "buyer-form:area-min-pyeong:v1",
    toPyeongInput(initial?.areaMin),
  );
  const [areaMaxPyeong, setAreaMaxPyeong] = useTabScopedState(
    "buyer-form:area-max-pyeong:v1",
    toPyeongInput(initial?.areaMax),
  );
  const [siteTypes, setSiteTypes] = useTabScopedState<string[]>(
    "buyer-form:site-types:v1",
    initial?.siteTypes ?? [],
  );
  const [moveInDate, setMoveInDate] = useTabScopedState(
    "buyer-form:move-in-date:v1",
    toDateInputValue(initial?.moveInDate),
  );
  const [urgency, setUrgency] = useTabScopedState(
    "buyer-form:urgency:v1",
    initial?.urgency ?? "normal",
  );
  // 새로 적는 손님은 적는 사람이 맡는 일이 대부분이라 담당을 나로 둔다(바꿀 수 있다).
  // 비워 두면 담당자 필터 · "내 손님"에서 빠져 놓치기 쉽다.
  const { user: currentUser } = useAuth();
  const [assignedToId, setAssignedToId] = useTabScopedState(
    "buyer-form:assigned-to-id:v1",
    mode === "create" ? (currentUser?.id ?? "") : (initial?.assignedToId ?? ""),
  );
  const [nextContactDate, setNextContactDate] = useTabScopedState(
    "buyer-form:next-contact-date:v1",
    toDateInputValue(initial?.nextContactDate),
  );
  const [memo, setMemo] = useTabScopedState(
    "buyer-form:memo:v1",
    initial?.memo ?? "",
  );

  // ── 희망 지역 ──────────────────────────────────────────────
  const [regionQuery, setRegionQuery] = useTabScopedState("buyer-form:region-query:v1", "");
  const [regions, setRegions] = useTabScopedState<RegionSelection[]>(
    "buyer-form:regions:v1",
    initial ? toRegionSelections(initial) : [],
  );
  const { data: regionResults = [] } = useQuery({
    queryKey: ["regions", "search", regionQuery.trim()],
    queryFn: () => api.regions.search(regionQuery.trim(), 10),
    enabled: regionQuery.trim().length >= 1,
  });

  // 시/도 → 시군구 → 읍면동 단계별 선택
  const [cascadeProvince, setCascadeProvince] = useTabScopedState(
    "buyer-form:cascade-province:v1",
    "",
  );
  const [cascadeDistrict, setCascadeDistrict] = useTabScopedState(
    "buyer-form:cascade-district:v1",
    "",
  );
  const [cascadeWard, setCascadeWard] = useTabScopedState(
    "buyer-form:cascade-ward:v1",
    "",
  );
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
  const [siteQuery, setSiteQuery] = useTabScopedState("buyer-form:site-query:v1", "");
  const [sites, setSites] = useTabScopedState<SiteSelection[]>(
    "buyer-form:sites:v1",
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
  // 입주 희망일이 지난 날이면 잘못 고른 것일 수 있다 (막지는 않는다 — 이미 입주를 원하던 손님일 수도 있다)
  const moveInInPast = useMemo(() => {
    if (!moveInDate) return false;
    return new Date(`${moveInDate}T23:59:59`).getTime() < Date.now();
  }, [moveInDate]);

  const isMonthly = transactionType === "monthly";

  // ── 섹션 입력 완료 상태 (진행 표시용) ──────────────────────
  // ── 제출 ──────────────────────────────────────────────────
  const handleSubmit = () => {
    if (mode === "create" && !effectiveContact) {
      toast.error("고객을 먼저 선택해주세요.");
      return;
    }
    // 숫자 변환: 빈값은 edit이면 null(값 비움), create면 undefined.
    // 읽을 수 없는 값 · 음수는 조용히 버리지 않고 알린다 (예전에는 말없이 빠져 "저장했는데 예산이 없다"가 됐다).
    let invalidNumber = false;
    const num = (s: string): number | null | undefined => {
      const t = s.trim();
      if (t === "") return mode === "edit" ? null : undefined;
      const n = Number(t);
      if (Number.isNaN(n) || n < 0) {
        invalidNumber = true;
        return undefined;
      }
      return n;
    };
    // 금액은 "8억"처럼 적어도 읽는다(앱 공용 규칙). 못 읽으면 저장하지 않고 알린다
    const money = (s: string): number | null | undefined => {
      const parsed = parseManwon(s);
      if (!parsed.valid) {
        invalidNumber = true;
        return undefined;
      }
      if (parsed.value === null) return mode === "edit" ? null : undefined;
      return parsed.value;
    };
    const pMin = money(priceMin);
    const pMax = money(priceMax);
    const dMin = money(depositMin);
    const dMax = money(depositMax);
    const rMin = money(monthlyRentMin);
    const rMax = money(monthlyRentMax);
    const aMinPyeong = num(areaMinPyeong);
    const aMaxPyeong = num(areaMaxPyeong);
    if (invalidNumber) {
      toast.error("금액은 '8억'·'85000'처럼, 평형은 0 이상의 숫자로 입력해 주세요.");
      return;
    }
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

    // 함께 알아보는 거래: 거래유형과 예산만 다른 조건을 더 만든다
    const extras: BuyerFormSubmitDto[] = [];
    if (mode === "create") {
      if (visibleExtraTypes.length > 0 && !transactionType) {
        toast.error("먼저 주된 거래유형을 골라 주세요.");
        return;
      }
      for (const type of visibleExtraTypes) {
        const budget = { ...EMPTY_EXTRA_BUDGET, ...extraBudgets[type] };
        const min = money(budget.min);
        const max = money(budget.max);
        const rentMin = type === "monthly" ? money(budget.rentMin) : undefined;
        const rentMax = type === "monthly" ? money(budget.rentMax) : undefined;
        const typeLabel =
          TRANSACTION_TYPE_LABELS[type as keyof typeof TRANSACTION_TYPE_LABELS] ?? type;
        if (invalidNumber) {
          toast.error(`${typeLabel} 예산을 읽을 수 없습니다. '8억'·'85000'처럼 입력해 주세요.`);
          return;
        }
        if ((min != null && max != null && min > max) || (rentMin != null && rentMax != null && rentMin > rentMax)) {
          toast.error(`${typeLabel} 예산 범위가 올바르지 않습니다. (최소값 ≤ 최대값)`);
          return;
        }
        extras.push({
          transactionType: type,
          ...(type === "monthly"
            ? { depositMin: min, depositMax: max, monthlyRentMin: rentMin, monthlyRentMax: rentMax }
            : { priceMin: min, priceMax: max }),
        });
      }
    }

    // 수정에서 비운 칸은 null로 보내 지운다 (undefined는 "고치지 않음")
    const cleared = mode === "edit" ? null : undefined;
    const dto: BuyerFormSubmitDto = {
      contactId: effectiveContact?.id,
      transactionType: transactionType || cleared,
      siteTypes,
      priceMin: isMonthly ? (mode === "edit" ? null : undefined) : pMin,
      priceMax: isMonthly ? (mode === "edit" ? null : undefined) : pMax,
      depositMin: isMonthly ? dMin : mode === "edit" ? null : undefined,
      depositMax: isMonthly ? dMax : mode === "edit" ? null : undefined,
      monthlyRentMin: isMonthly ? rMin : mode === "edit" ? null : undefined,
      monthlyRentMax: isMonthly ? rMax : mode === "edit" ? null : undefined,
      areaMin,
      areaMax,
      moveInDate: moveInDate || cleared,
      urgency,
      assignedToId: assignedToId || cleared,
      nextContactDate: nextContactDate || cleared,
      memo: memo.trim() || cleared,
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
      ...(extras.length > 0 ? { extras } : {}),
    };
    onSubmit(dto);
  };

  // 오른쪽 요약 열에 보일 값 (저장하는 값이 아니라 적은 것을 되비추는 글)
  // 예산은 거래유형마다 따로 적으므로 요약도 거래유형마다 보인다.
  // 월세는 보증금과 월세 두 범위다. 거래유형이 하나면 이름을 붙이지 않는다.
  const budgetText = (
    type: string,
    budget: { min: string; max: string; rentMin: string; rentMax: string },
  ): string | null =>
    type === "monthly"
      ? [
          rangeSummary(moneyText(budget.min), moneyText(budget.max)),
          rangeSummary(moneyText(budget.rentMin), moneyText(budget.rentMax)),
        ]
          .map((text, index) => (text ? `${index === 0 ? "보증금" : "월세"} ${text}` : null))
          .filter(Boolean)
          .join(" / ") || null
      : rangeSummary(moneyText(budget.min), moneyText(budget.max));
  const primaryBudgetText = budgetText(
    transactionType,
    isMonthly
      ? { min: depositMin, max: depositMax, rentMin: monthlyRentMin, rentMax: monthlyRentMax }
      : { min: priceMin, max: priceMax, rentMin: "", rentMax: "" },
  );
  const summaryExtraTypes = mode === "create" && transactionType ? visibleExtraTypes : [];
  const typeName = (type: string) =>
    TRANSACTION_TYPE_LABELS[type as keyof typeof TRANSACTION_TYPE_LABELS] ?? type;
  const summaryTypes =
    [transactionType, ...summaryExtraTypes].filter(Boolean).map(typeName).join(", ") || null;
  const summaryBudget =
    summaryExtraTypes.length === 0
      ? primaryBudgetText
      : [
          `${typeName(transactionType)} ${primaryBudgetText ?? "—"}`,
          ...summaryExtraTypes.map(
            (type) =>
              `${typeName(type)} ${budgetText(type, { ...EMPTY_EXTRA_BUDGET, ...extraBudgets[type] }) ?? "—"}`,
          ),
        ].join("\n");

  const priceLabel =
    transactionType === "jeonse" ? "전세가 범위" : "매매가 범위";
  const pricePresets = transactionType === "jeonse" ? JEONSE_PRESETS : PRICE_PRESETS;

  // 새로 적는 중인 조건이 있는지 (미리 채운 고객은 세지 않는다). 있으면 탭을 닫을 때 셸이 한 번 묻는다
  // (features/tabs/lib/unsavedWork.ts의 data-native-tab-dirty 표식 — 업무 창과 같은 방식).
  const hasUnsavedCreate =
    mode === "create" &&
    Boolean(
      transactionType ||
        extraTypes.length > 0 ||
        priceMin ||
        priceMax ||
        depositMin ||
        depositMax ||
        monthlyRentMin ||
        monthlyRentMax ||
        areaMinPyeong ||
        areaMaxPyeong ||
        siteTypes.length > 0 ||
        moveInDate ||
        memo.trim() ||
        regions.length > 0 ||
        sites.length > 0 ||
        newContactName.trim() ||
        newContactPhone.trim(),
    );

  return (
    // 등록 문서: 가운데 한 단 + 오른쪽 요약·저장 열 (매물 등록 화면과 같은 짜임)
    <div className="grid grid-cols-1 gap-x-12 gap-y-8 pb-10 lg:grid-cols-[minmax(0,1fr)_288px]">
      {hasUnsavedCreate && !submitting && (
        <span hidden data-native-tab-discard-blocker="true" data-native-tab-dirty="true" />
      )}
      <div className="min-w-0 space-y-7">
      {/* ── 고객 ── */}
      <section className="space-y-3">
        <SectionHeader title="고객" required />
        {effectiveContact ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 rounded-md bg-muted px-3 text-sm">
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
        ) : newContactOpen ? (
          // 처음 온 손님: 이름 · 전화번호만 적어 연락처를 만들고 바로 이 조건의 고객으로 쓴다
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newContactName.trim()) {
                toast.error("고객 이름을 입력해 주세요.");
                return;
              }
              const phoneProblem = phoneInputProblem(newContactPhone);
              if (phoneProblem) {
                toast.error(phoneProblem);
                return;
              }
              // 이미 있는 번호면 새로 만들지 않고 그 고객을 고르게 한다 (서버의 409를 기다리지 않는다)
              if (phoneOwner) {
                setExistingContact({ id: phoneOwner.id, name: phoneOwner.name });
                return;
              }
              if (!createContactMutation.isPending) createContactMutation.mutate();
            }}
          >
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                autoFocus
                value={newContactName}
                onChange={(e) => {
                  setNewContactName(e.target.value);
                  setExistingContact(null);
                }}
                placeholder="이름 (필수)"
                aria-label="새 고객 이름"
                className="h-9 text-sm"
              />
              <Input
                value={newContactPhone}
                onChange={(e) => {
                  // 치는 동안 하이픈을 넣고 숫자 아닌 글자는 받지 않는다 (앱 공용 전화 칸 규칙)
                  setNewContactPhone(formatPhoneWhileTyping(e.target.value));
                  setExistingContact(null);
                }}
                placeholder="010-1234-5678"
                inputMode="tel"
                aria-label="새 고객 전화번호"
                className="h-9 text-sm tabular-nums"
              />
              <div className="flex gap-1.5">
                <Button
                  type="submit"
                  size="sm"
                  className="h-9"
                  disabled={createContactMutation.isPending}
                >
                  {createContactMutation.isPending ? "등록 중…" : "고객 등록"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 text-muted-foreground"
                  disabled={createContactMutation.isPending}
                  onClick={() => {
                    setNewContactOpen(false);
                    setExistingContact(null);
                  }}
                >
                  취소
                </Button>
              </div>
            </div>
            {duplicateContact && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning-strong"
              >
                <span>
                  이 번호는 이미 {duplicateContact.name} 님의 연락처에 있습니다.
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setSelectedContact({
                      id: duplicateContact.id,
                      name: duplicateContact.name,
                      phone: newContactPhone.trim() || null,
                    });
                    setNewContactOpen(false);
                    setExistingContact(null);
                    setContactQuery("");
                  }}
                >
                  {duplicateContact.name} 님으로 선택
                </Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              연락처에도 함께 등록됩니다. 나머지 정보는 연락처 화면에서 더 적을 수 있습니다.
            </p>
          </form>
        ) : (
          <div className="relative">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  placeholder="고객명 또는 전화번호 검색"
                  className="h-9 pl-8 text-sm"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                onClick={openNewContact}
              >
                <Plus className="size-3.5" />
                새 고객
              </Button>
            </div>
            {contactQuery.trim().length >= 1 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-sm">
                {(contactResults?.items ?? []).length === 0 ? (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
                    <span>{contactSearching ? "찾는 중…" : "검색 결과가 없습니다"}</span>
                    {!contactSearching && (
                      <button
                        type="button"
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                        onClick={openNewContact}
                      >
                        ‘{contactQuery.trim()}’ 새 고객으로 등록
                      </button>
                    )}
                  </div>
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
      <section className="space-y-4 border-t border-border/70 pt-7">
        <SectionHeader
          title="거래 조건"
          description="예산과 면적은 범위로 적습니다. 한쪽만 적어도 됩니다."
        />
        <div className="space-y-1.5">
          <Label className="text-[13px] font-normal text-muted-foreground">거래유형</Label>
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
        <div className="space-y-2">
          {isMonthly ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-normal text-muted-foreground">
                  보증금 범위
                </Label>
                <div className="flex items-start gap-1.5">
                  <MoneyInput
                    value={depositMin}
                    onChange={setDepositMin}
                    placeholder="최소"
                  />
                  <span className="mt-2 text-xs text-muted-foreground">~</span>
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
                <Label className="text-[13px] font-normal text-muted-foreground">월세 범위</Label>
                <div className="flex items-start gap-1.5">
                  <MoneyInput
                    value={monthlyRentMin}
                    onChange={setMonthlyRentMin}
                    placeholder="최소"
                  />
                  <span className="mt-2 text-xs text-muted-foreground">~</span>
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
              <Label className="text-[13px] font-normal text-muted-foreground">
                {priceLabel}
              </Label>
              <div className="flex items-start gap-1.5">
                <MoneyInput
                  value={priceMin}
                  onChange={setPriceMin}
                  placeholder="최소"
                />
                <span className="mt-2 text-xs text-muted-foreground">~</span>
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

        {/* 함께 알아보는 거래 (등록에서만): 매매와 전세를 같이 보는 손님. 거래유형마다 조건이 하나씩 생긴다 */}
        {mode === "create" && transactionType && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[13px] text-muted-foreground">함께 알아보는 거래</span>
              {Object.entries(TRANSACTION_TYPE_LABELS)
                .filter(([value]) => value !== transactionType)
                .map(([value, label]) => {
                  const selected = visibleExtraTypes.includes(value);
                  return (
                    <ChipToggle
                      key={value}
                      selected={selected}
                      label={selected ? label : `+ ${label}`}
                      onClick={() =>
                        setExtraTypes(
                          selected
                            ? extraTypes.filter((type) => type !== value)
                            : [...visibleExtraTypes, value],
                        )
                      }
                    />
                  );
                })}
            </div>
            {visibleExtraTypes.map((type) => {
              const label =
                TRANSACTION_TYPE_LABELS[type as keyof typeof TRANSACTION_TYPE_LABELS] ?? type;
              const budget = { ...EMPTY_EXTRA_BUDGET, ...extraBudgets[type] };
              return (
                <div key={type} className="space-y-1.5 border-l-2 border-border pl-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {label} 예산 · 따로 한 건으로 저장됩니다
                    </p>
                    <button
                      type="button"
                      aria-label={`${label} 빼기`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setExtraTypes(extraTypes.filter((item) => item !== type))}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <div className={cn("grid gap-3", type === "monthly" && "sm:grid-cols-2")}>
                    <div className="max-w-md space-y-1.5">
                      <Label className="text-[13px] font-normal text-muted-foreground">
                        {type === "monthly" ? "보증금 범위" : type === "jeonse" ? "전세가 범위" : "매매가 범위"}
                      </Label>
                      <div className="flex items-start gap-1.5">
                        <MoneyInput
                          value={budget.min}
                          onChange={(min) => updateExtraBudget(type, { min })}
                          placeholder="최소"
                        />
                        <span className="mt-2 text-xs text-muted-foreground">~</span>
                        <MoneyInput
                          value={budget.max}
                          onChange={(max) => updateExtraBudget(type, { max })}
                          placeholder="최대"
                        />
                      </div>
                    </div>
                    {type === "monthly" && (
                      <div className="space-y-1.5">
                        <Label className="text-[13px] font-normal text-muted-foreground">월세 범위</Label>
                        <div className="flex items-start gap-1.5">
                          <MoneyInput
                            value={budget.rentMin}
                            onChange={(rentMin) => updateExtraBudget(type, { rentMin })}
                            placeholder="최소"
                          />
                          <span className="mt-2 text-xs text-muted-foreground">~</span>
                          <MoneyInput
                            value={budget.rentMax}
                            onChange={(rentMax) => updateExtraBudget(type, { rentMax })}
                            placeholder="최대"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 면적 */}
        <div className="space-y-2">
          <div className="max-w-md space-y-1.5">
            <Label className="text-[13px] font-normal text-muted-foreground">공급평형</Label>
            <div className="flex items-start gap-1.5">
              <AreaInput
                value={areaMinPyeong}
                onChange={setAreaMinPyeong}
                placeholder="최소"
              />
              <span className="mt-2 text-xs text-muted-foreground">~</span>
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
          <Label className="text-[13px] font-normal text-muted-foreground">매물 유형</Label>
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
      <section className="space-y-4 border-t border-border/70 pt-7">
        <SectionHeader
          title="희망 지역 · 단지"
          description="지역은 이름으로 찾거나 시/도부터 차례로 고릅니다."
        />
        <div className="space-y-2">
          <Label className="text-[13px] font-normal text-muted-foreground">희망 지역</Label>
          <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Select
              value={cascadeProvince}
              onValueChange={(v) => {
                setCascadeProvince(v);
                setCascadeDistrict("");
                setCascadeWard("");
              }}
            >
              <SelectTrigger className="h-9 w-full text-sm">
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
              <SelectTrigger className="h-9 w-full text-sm">
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
              <SelectTrigger className="h-9 w-full text-sm">
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
              className="h-9"
              disabled={!cascadeProvince}
              onClick={addCascadeRegion}
            >
              <Plus className="size-3.5" />
              추가
            </Button>
          </div>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={regionQuery}
                onChange={(e) => setRegionQuery(e.target.value)}
                placeholder="구/동 이름으로 찾기 (예: 강동구, 고덕동)"
                className="h-9 pl-8 text-sm"
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
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-muted px-2 text-[13px]"
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
          <Label className="text-[13px] font-normal text-muted-foreground">희망 단지</Label>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={siteQuery}
                onChange={(e) => setSiteQuery(e.target.value)}
                placeholder="단지명 검색 (관리단지가 아니어도 선택 가능)"
                className="h-9 pl-8 text-sm"
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
              <span className="mr-1 text-xs text-muted-foreground">관리단지</span>
              {quickPickSites.map((s) => (
                <button
                  key={s.siteId}
                  type="button"
                  onClick={() => setSites([...sites, s])}
                  className="h-6 rounded-full bg-muted/70 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-muted px-2 text-[13px]"
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
          <p role="status" className="text-xs leading-5 text-warning-strong">지역·단지·매물 유형이 모두 비어 있습니다. 저장은 되지만 조건에 맞는 매물을 찾기 어려워집니다.</p>
        )}
      </section>

      {/* ── 일정 / 담당 ── */}
      <section className="space-y-4 border-t border-border/70 pt-7">
        <SectionHeader title="일정 · 담당" />
        <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-normal text-muted-foreground">입주 희망일</Label>
            <Input
              type="date"
              value={moveInDate}
              onChange={(e) => setMoveInDate(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] font-normal text-muted-foreground">긴급도</Label>
            <div className="flex gap-1.5">
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
            <Label className="text-[13px] font-normal text-muted-foreground">담당자</Label>
            <Select
              value={assignedToId || "none"}
              onValueChange={(v) => setAssignedToId(v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-9 w-full text-sm">
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
            <Label className="text-[13px] font-normal text-muted-foreground">다음 연락일</Label>
            <Input
              type="date"
              value={nextContactDate}
              onChange={(e) => setNextContactDate(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </div>
        {nextContactInPast && (
          <p role="status" className="text-xs leading-5 text-warning-strong">다음 연락일이 지난 날짜입니다. 저장하면 연락이 밀린 고객으로 표시됩니다.</p>
        )}
        {moveInInPast && (
          <p role="status" className="text-xs leading-5 text-warning-strong">입주 희망일이 지난 날짜입니다. 날짜를 확인해 주세요.</p>
        )}
        <div className="space-y-1.5">
          <Label className="text-[13px] font-normal text-muted-foreground">고객 메모</Label>
          <Textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="남향 필수, 고층 선호 등 추가 조건과 상담 배경"
            className="min-h-24 text-sm"
          />
        </div>
      </section>

      </div>

      {/* ── 요약 · 저장 ── */}
      <aside className="min-w-0 lg:border-l lg:border-border/70 lg:pl-8">
        <div className="sticky top-6 space-y-5">
          <h2 className="text-[13px] font-medium text-muted-foreground">
            {mode === "create" ? "등록 요약" : "조건 요약"}
          </h2>
          <dl className="space-y-2.5 text-[13px]">
            <SummaryLine label="고객" value={effectiveContact?.name ?? null} />
            <SummaryLine label="거래" value={summaryTypes} />
            <SummaryLine label="예산" value={summaryBudget} />
            <SummaryLine
              label="면적"
              value={rangeSummary(pyeongText(areaMinPyeong), pyeongText(areaMaxPyeong))}
            />
            <SummaryLine
              label="유형"
              value={
                siteTypes.length > 0
                  ? siteTypes
                      .map((type) => (SITE_TYPE_LABELS as Record<string, string>)[type] ?? type)
                      .join(", ")
                  : null
              }
            />
            <SummaryLine
              label="지역"
              value={regions.length > 0 ? regions.map((r) => r.label).join(", ") : null}
            />
            <SummaryLine
              label="단지"
              value={sites.length > 0 ? sites.map((site) => site.name).join(", ") : null}
            />
            <SummaryLine label="입주" value={moveInDate ? formatDate(moveInDate) : null} />
          </dl>
          {summaryExtraTypes.length > 0 ? (
            <p className="border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
              거래유형마다 한 건씩, 모두 {1 + summaryExtraTypes.length}건이 만들어집니다.
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? "저장 중…"
                : mode === "create"
                  ? "희망매물 생성"
                  : "조건 저장"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
              취소
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
