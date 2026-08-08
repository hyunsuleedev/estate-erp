import { Lock } from 'lucide-react';
import { MAINTENANCE_FEE_INCLUDE_LABELS } from '@estate-erp/shared';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// ── 폼 레이아웃 (new.tsx 공용) ──────────────────────────────────

export function Section({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <header className="mb-4 flex items-baseline gap-2">
        <span className="flex size-5 shrink-0 translate-y-0.5 items-center justify-center rounded-sm bg-muted text-[11px] font-medium tabular-nums text-muted-foreground">
          {step}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function FieldRow({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs font-medium text-muted-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
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
        <FieldRow
          label="관리비 (만원/월)"
          hint={value.maintenanceFee ? formatMoney(Number(value.maintenanceFee)) : undefined}
        >
          <Input
            type="number"
            inputMode="numeric"
            value={value.maintenanceFee}
            onChange={(event) => onChange('maintenanceFee', event.target.value)}
            placeholder="15"
          />
        </FieldRow>
        <FieldRow
          label="융자금 / 근저당 (만원)"
          hint={value.loanAmount ? formatMoney(Number(value.loanAmount)) : undefined}
        >
          <Input
            type="number"
            inputMode="numeric"
            value={value.loanAmount}
            onChange={(event) => onChange('loanAmount', event.target.value)}
            placeholder="0"
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
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs transition-colors',
                  active
                    ? 'border-primary/60 bg-primary/10 font-medium text-primary'
                    : 'border-input bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </FieldRow>

      {showPremium && (
        <FieldRow
          label="권리금 (만원)"
          hint={value.premium ? formatMoney(Number(value.premium)) : '상가 매물 전용'}
        >
          <Input
            type="number"
            inputMode="numeric"
            value={value.premium}
            onChange={(event) => onChange('premium', event.target.value)}
            placeholder="5000"
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
        <Label className="text-xs font-medium text-muted-foreground">내부 전용 메모</Label>
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
