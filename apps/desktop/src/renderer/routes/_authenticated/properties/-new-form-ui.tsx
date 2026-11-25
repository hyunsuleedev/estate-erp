import { Lock } from 'lucide-react';
import { MAINTENANCE_FEE_INCLUDE_LABELS } from '@estate-erp/shared';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { describeManwonText, parseManwonText } from './-manwon-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// ── 폼 레이아웃 (new.tsx 공용) ──────────────────────────────────

/**
 * 등록 문서의 한 구역. 상자·번호 딱지 없이 제목과 위쪽 선으로만 나눈다
 * (앱 톤: 상자와 띠보다 선과 여백). 첫 구역은 선을 긋지 않는다.
 */
export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-registration-section
      className="border-t border-border/70 pt-7 first:border-t-0 first:pt-0"
    >
      <header className="mb-4">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{subtitle}</p>
        )}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** 고르는 알약 (거래유형·포함 항목 등). 희망매물 등록 화면의 알약과 같은 모양이다. */
export const choiceChipClassName = (active: boolean) =>
  cn(
    'inline-flex h-8 items-center rounded-md border px-3 text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
    active
      ? 'border-primary bg-primary font-medium text-primary-foreground'
      : 'border-input bg-background text-foreground/80 hover:bg-muted',
  );

export function FieldRow({
  label,
  required,
  hint,
  hintInvalid,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  /** 입력을 읽지 못했을 때 힌트를 경고색으로 */
  hintInvalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-[13px] font-normal text-muted-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        {hint && (
          <span
            aria-live="polite"
            className={cn('text-xs tabular-nums', hintInvalid ? 'text-destructive-strong' : 'text-muted-foreground')}
          >
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * 만원 단위 금액 입력칸. "15억", "15억 8천", "158000" 어느 쪽으로 넣어도 되고,
 * 읽은 값은 FieldRow 힌트(describeManwonText)로 바로 보여 준다.
 */
export function ManwonInput({
  value,
  onChange,
  placeholder = '예: 15억 8천',
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const invalid = !parseManwonText(value).valid;
  return (
    <Input
      {...props}
      type="text"
      autoComplete="off"
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  );
}

export function manwonHint(value: string, empty?: string) {
  const described = describeManwonText(value, empty);
  return { hint: described.text, hintInvalid: described.invalid };
}

// ── 비용 정보 필드 (관리비/포함항목/융자금/권리금) ──────────────

export interface ListingCostFormValue {
  maintenanceFee: string;
  maintenanceFeeIncludes: string[];
  loanAmount: string;
  premium: string;
}

export function ListingCostFields({
  value,
  onChange,
  showPremium,
  isJeonse,
}: {
  value: ListingCostFormValue;
  onChange: <K extends keyof ListingCostFormValue>(
    key: K,
    fieldValue: ListingCostFormValue[K],
  ) => void;
  /** 상가(commercial) 단지를 선택한 경우에만 권리금 입력 노출 */
  showPremium: boolean;
  /** 전세 매물이면 융자금 경고 힌트 표시 */
  isJeonse: boolean;
}) {
  const toggleInclude = (slug: string) => {
    const next = value.maintenanceFeeIncludes.includes(slug)
      ? value.maintenanceFeeIncludes.filter((item) => item !== slug)
      : [...value.maintenanceFeeIncludes, slug];
    onChange('maintenanceFeeIncludes', next);
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="관리비 (만원/월)" {...manwonHint(value.maintenanceFee)}>
          <ManwonInput
            aria-label="관리비 만원"
            value={value.maintenanceFee}
            onChange={(next) => onChange('maintenanceFee', next)}
            placeholder="예: 25"
          />
        </FieldRow>
        <FieldRow label="융자금 / 근저당 (만원)" {...manwonHint(value.loanAmount)}>
          <ManwonInput
            aria-label="융자금 만원"
            value={value.loanAmount}
            onChange={(next) => onChange('loanAmount', next)}
            placeholder="없으면 비워 두세요"
          />
        </FieldRow>
      </div>

      {isJeonse && (
        <p className="text-xs text-warning-strong">
          전세 매물은 융자금(근저당) 확인이 중요합니다 — 보증금 보호(깡통 위험) 판단 기준이 됩니다.
        </p>
      )}

      <FieldRow label="관리비 포함 항목">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(MAINTENANCE_FEE_INCLUDE_LABELS).map(([slug, label]) => {
            const active = value.maintenanceFeeIncludes.includes(slug);
            return (
              <button
                key={slug}
                type="button"
                aria-pressed={active}
                onClick={() => toggleInclude(slug)}
                className={choiceChipClassName(active)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </FieldRow>

      {showPremium && (
        <FieldRow label="권리금 (만원)" {...manwonHint(value.premium, '상가 매물 전용')}>
          <ManwonInput
            aria-label="권리금 만원"
            value={value.premium}
            onChange={(next) => onChange('premium', next)}
            placeholder="예: 5천"
          />
        </FieldRow>
      )}
    </>
  );
}

// ── 내부 전용 메모 ──────────────────────────────────────────────

export function PrivateMemoField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Lock className="size-3.5 text-muted-foreground" />
        <Label className="text-[13px] font-normal text-muted-foreground">내부 전용 메모</Label>
        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          외부 비공개
        </span>
      </div>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        placeholder="예) 집주인 급한 사정으로 네고 여지 큼 — 외부에 절대 공개 금지"
      />
      <p className="text-[11px] text-muted-foreground">
        네트워크 공유·외부 연동(MCP)에서 자동으로 제외됩니다.
      </p>
    </div>
  );
}
