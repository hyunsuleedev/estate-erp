/**
 * 조항 임베디드 편집 프리미티브 5종 + 금액 표기 옵션 바.
 *
 * 레거시 MySpider ContractInputForm 의 "제N조 문장 안에 컨트롤이 임베디드된"
 * 편집면을 웹으로 이식한 표현 컴포넌트 (document-hub-editor-plan.md §4.2).
 * - 로직 없는 self-contained 표현 계층 — 조항 데이터(CLAUSE_LAYOUTS)와 값 라우팅은
 *   shared(contract-clause-layouts.ts)와 -clause-editor.tsx 책임.
 * - 모든 컴포넌트는 readOnly 모드를 지원한다 — 같은 레이아웃을 프리뷰(A4)가
 *   읽기 전용으로 렌더해 "편집면 = 인쇄면" 정합을 구조적으로 보장 (plan §4.2).
 * - 금액 저장값은 항상 만원 Int 문자열. printOptions.amountUnit 은 입력 해석/표시
 *   단위일 뿐이다 (레거시 Cost_Unit 라디오 동일).
 * - apps/desktop 미러를 위해 route 로컬 의존만 사용한다.
 */
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { formatContractAmountWithWon } from '@estate-erp/shared';
import type {
  ContractAmountNotation,
  ContractDocumentEngineAmountUnit,
  ContractDocumentEnginePrintOptions,
} from './-document-engine';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// 공통 헬퍼 — 금액 단위 해석 (저장은 항상 만원 Int 문자열)
// ---------------------------------------------------------------------------

const AMOUNT_UNIT_LABELS: Record<ContractDocumentEngineAmountUnit, string> = {
  manwon: '만원',
  chun: '천원',
  won: '원',
};

/** 만원 → 선택 단위 배수 (만원=1, 천원=10, 원=10000) */
const AMOUNT_UNIT_MULTIPLIERS: Record<ContractDocumentEngineAmountUnit, number> = {
  manwon: 1,
  chun: 10,
  won: 10000,
};

/** 숫자 문자열에 3자리 콤마 삽입 */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 저장값(만원 Int 문자열) 파싱 — 숫자가 아니거나 음수/소수면 null */
function parseStoredManwon(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  if (!Number.isInteger(parsed) || parsed < 0 || !Number.isSafeInteger(parsed)) {
    return null;
  }
  return parsed;
}

/** 선택 단위 입력값 → 만원 Int (만원 정수로 환산 불가/소수/음수는 null) */
function parseUnitInputToManwon(
  raw: string,
  unit: ContractDocumentEngineAmountUnit,
): number | null {
  const digits = raw.trim().replace(/,/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const parsed = Number(digits);
  if (!Number.isSafeInteger(parsed)) return null;
  const divisor = AMOUNT_UNIT_MULTIPLIERS[unit];
  return parsed % divisor === 0 ? parsed / divisor : null;
}

/** 저장값(만원 Int) → 선택 단위 콤마 표시 문자열 */
function formatManwonInUnit(
  manwon: number,
  unit: ContractDocumentEngineAmountUnit,
): string {
  return groupThousands(String(manwon * AMOUNT_UNIT_MULTIPLIERS[unit]));
}

/**
 * 접미 문구("만원정은")를 표시 단위에 맞게 치환 — 천원 입력 모드에서
 * "990,000 만원정은"처럼 단위와 접미가 모순되지 않도록 (표시 전용, 저장 불변).
 */
function unitAwareSuffix(
  suffix: string | undefined,
  unit: ContractDocumentEngineAmountUnit,
): string | undefined {
  if (!suffix || unit === 'manwon' || !suffix.startsWith('만원')) return suffix;
  return `${AMOUNT_UNIT_LABELS[unit]}${suffix.slice('만원'.length)}`;
}

/** 프리뷰 공란 표시 — P5 공란인쇄(≠) 반영 전까지의 시각적 빈 칸 */
function BlankSlot({ width = 'w-24' }: { width?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block border-b border-slate-400 align-baseline', width)}
    >
      {' '}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 1. ClauseArticleFrame — 제N조 컨테이너 (번호 밴드 + 도입문 + 행)
// ---------------------------------------------------------------------------

export function ClauseArticleFrame({
  no,
  title,
  intro,
  introTrailing,
  readOnly,
  children,
}: {
  no: string;
  title?: string;
  /** 도입문 (필드 슬롯 없는 순수 문장) */
  intro?: string;
  /** 도입문 우측 정렬 슬롯 (레거시 '현 임차보증금 입력란 추가' 토글 위치) */
  introTrailing?: ReactNode;
  readOnly?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-sm border',
        readOnly ? 'border-slate-300' : 'border-border',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-sm font-semibold',
          readOnly ? 'bg-slate-100 text-slate-900' : 'bg-muted',
        )}
      >
        <span>{no}</span>
        {title ? (
          <span className={cn('font-medium', readOnly ? 'text-slate-600' : 'text-muted-foreground')}>
            {title}
          </span>
        ) : null}
      </div>
      {intro || introTrailing ? (
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-3 py-2 text-sm leading-6',
            readOnly ? 'border-slate-200' : 'border-border/60',
          )}
        >
          <span>{intro}</span>
          {introTrailing ? <span className="shrink-0">{introTrailing}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * 조항 행 셸 — 라벨 셀(매매대금/융자금…) + 문장 흐름 셀.
 * 라벨이 없으면 문장 전폭 행 (토글/본문 조항 행).
 */
export function ClauseRowFrame({
  label,
  readOnly,
  children,
}: {
  label?: string;
  readOnly?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-stretch border-t text-sm',
        readOnly ? 'border-slate-200' : 'border-border/60',
      )}
    >
      {label ? (
        <div
          className={cn(
            'flex w-[104px] shrink-0 items-center px-3 py-2 font-medium',
            readOnly ? 'bg-slate-50 text-slate-700' : 'bg-muted/60',
          )}
        >
          {label}
        </div>
      ) : null}
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 py-1.5 pl-3 pr-3 leading-7',
          readOnly ? 'gap-y-0.5' : 'gap-y-1',
        )}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. ClauseAmountInput — "金 [입력] 만원정" 인라인 금액 + 실시간 한글/漢字 병기
// ---------------------------------------------------------------------------

export function ClauseAmountInput({
  value,
  onChange,
  amountUnit,
  amountNotation,
  suffix,
  readOnly,
}: {
  /** 저장값 — 만원 Int 문자열 ('' 허용) */
  value: string;
  onChange?: (manwonText: string) => void;
  /** printOptions.amountUnit — 입력 해석/표시 단위 (저장은 항상 만원) */
  amountUnit: ContractDocumentEngineAmountUnit;
  /** printOptions.amountNotation — 병기 표기 (한글/漢字) */
  amountNotation: ContractAmountNotation;
  /** "만원정(은)" 등 접미 문구 — 표시 단위에 맞게 치환됨 */
  suffix?: string;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const lastUnitRef = useRef(amountUnit);

  // 단위 라디오 전환 시 입력 중이던 draft 를 버리고 저장값(만원) 기준으로 재표시
  if (lastUnitRef.current !== amountUnit) {
    lastUnitRef.current = amountUnit;
    if (draft !== null) setDraft(null);
  }

  const manwon = parseStoredManwon(value);
  const korean =
    manwon !== null && manwon > 0
      ? formatContractAmountWithWon(manwon, amountNotation)
      : '';

  if (readOnly) {
    // 프리뷰는 저장 단위(만원) 기준으로 인쇄한다 — amountUnit 은 입력 편의 전용
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
        <span>金</span>
        {manwon !== null && manwon > 0 ? (
          <span className="font-medium tabular-nums">{groupThousands(String(manwon))}</span>
        ) : (
          <BlankSlot />
        )}
        {suffix ? <span>{suffix}</span> : null}
        {korean ? <span className="text-[11px] text-slate-500">{korean}</span> : null}
      </span>
    );
  }

  const displayValue =
    draft ?? (manwon !== null ? formatManwonInUnit(manwon, amountUnit) : value);
  const isDraftInvalid =
    draft !== null &&
    draft.trim() !== '' &&
    parseUnitInputToManwon(draft, amountUnit) === null;

  function handleChange(raw: string) {
    setDraft(raw);
    if (!raw.trim()) {
      onChange?.('');
      return;
    }
    const parsed = parseUnitInputToManwon(raw, amountUnit);
    onChange?.(parsed !== null ? String(parsed) : '');
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span>金</span>
      <Input
        inputMode="numeric"
        value={displayValue}
        onChange={(event) => handleChange(event.target.value)}
        // 단위 라디오 전환 시 저장값(만원) 기준으로 표시를 재계산한다
        onBlur={() => setDraft(null)}
        className={cn(
          'h-7 w-32 px-2 text-right text-sm tabular-nums',
          isDraftInvalid && 'border-destructive focus-visible:ring-destructive/30',
        )}
        title={
          isDraftInvalid
            ? `만원 단위 정수로 환산되는 ${AMOUNT_UNIT_LABELS[amountUnit]} 금액을 입력해주세요.`
            : undefined
        }
      />
      {suffix ? <span>{unitAwareSuffix(suffix, amountUnit)}</span> : null}
      {korean ? (
        <span className="text-[11px] text-muted-foreground">{korean}</span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 3. ClauseInlineDate — 문장 안 "[YYYY]년 [MM]월 [DD]일" (저장은 ISO)
// ---------------------------------------------------------------------------

type DateParts = { year: string; month: string; day: string };

function isoToParts(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return { year: '', month: '', day: '' };
  return { year: match[1], month: match[2], day: match[3] };
}

/** 세 칸이 모두 유효하면 ISO, 모두 비면 '', 그 외(입력 중)는 null */
function partsToIso(parts: DateParts): string | null {
  const { year, month, day } = parts;
  if (!year && !month && !day) return '';
  if (!/^\d{4}$/.test(year)) return null;
  const monthNum = Number(month);
  const dayNum = Number(day);
  if (!month || !day || !Number.isInteger(monthNum) || !Number.isInteger(dayNum)) {
    return null;
  }
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
  return `${year}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
}

export function ClauseInlineDate({
  value,
  onChange,
  suffix,
  readOnly,
}: {
  /** 저장값 — ISO 'YYYY-MM-DD' 또는 '' */
  value: string;
  onChange?: (isoDate: string) => void;
  /** 날짜 뒤 문구 ("에 지불하며," 등) */
  suffix?: string;
  readOnly?: boolean;
}) {
  const [parts, setParts] = useState<DateParts>(() => isoToParts(value));
  const lastEmittedRef = useRef<string>(value);

  // 외부에서 value 가 바뀌면(문서 전환/초안 변환) 표시 칸을 재동기화
  if (value !== lastEmittedRef.current) {
    lastEmittedRef.current = value;
    const next = isoToParts(value);
    if (next.year !== parts.year || next.month !== parts.month || next.day !== parts.day) {
      setParts(next);
    }
  }

  if (readOnly) {
    const display = isoToParts(value);
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-1">
        {display.year ? (
          <span className="tabular-nums">
            {display.year}년 {display.month}월 {display.day}일
          </span>
        ) : (
          <span className="inline-flex items-baseline gap-x-1">
            <BlankSlot width="w-10" />년 <BlankSlot width="w-7" />월 <BlankSlot width="w-7" />일
          </span>
        )}
        {suffix ? <span>{suffix}</span> : null}
      </span>
    );
  }

  function updatePart(part: keyof DateParts, raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, part === 'year' ? 4 : 2);
    const next = { ...parts, [part]: digits };
    setParts(next);
    const iso = partsToIso(next);
    // 입력 중(부분 입력)은 빈 값으로 저장 — 완성되면 ISO 로 기록
    const emit = iso === null ? '' : iso;
    lastEmittedRef.current = emit;
    onChange?.(emit);
  }

  const partInputClass = 'h-7 px-1.5 text-center text-sm tabular-nums';

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <Input
        inputMode="numeric"
        value={parts.year}
        onChange={(event) => updatePart('year', event.target.value)}
        className={cn(partInputClass, 'w-14')}
        placeholder="YYYY"
        aria-label="년"
      />
      <span>년</span>
      <Input
        inputMode="numeric"
        value={parts.month}
        onChange={(event) => updatePart('month', event.target.value)}
        className={cn(partInputClass, 'w-10')}
        placeholder="MM"
        aria-label="월"
      />
      <span>월</span>
      <Input
        inputMode="numeric"
        value={parts.day}
        onChange={(event) => updatePart('day', event.target.value)}
        className={cn(partInputClass, 'w-10')}
        placeholder="DD"
        aria-label="일"
      />
      <span>일</span>
      {suffix ? <span>{suffix}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 4. ClauseInlineSelect — 문장 폭 소형 드롭다운 (융자금 처리 3지 등)
// ---------------------------------------------------------------------------

export function ClauseInlineSelect({
  value,
  onChange,
  options,
  readOnly,
  placeholder = '선택',
}: {
  value: string;
  onChange?: (value: string) => void;
  options: string[];
  readOnly?: boolean;
  placeholder?: string;
}) {
  if (readOnly) {
    return value ? <span>{value}</span> : <BlankSlot width="w-32" />;
  }

  return (
    <Select value={value || undefined} onValueChange={(next) => onChange?.(next)}>
      <SelectTrigger size="sm" className="h-7 w-auto min-w-32 gap-1 px-2 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// 5. ClauseInlineCheck — "☐공란인쇄" 등 인라인 체크
// ---------------------------------------------------------------------------

export function ClauseInlineCheck({
  id,
  checked,
  onCheckedChange,
  label,
  readOnly,
}: {
  id: string;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label: string;
  readOnly?: boolean;
}) {
  // 프리뷰(인쇄면)에는 편집용 체크 컨트롤을 표시하지 않는다 — 렌더러가
  // readOnly 에서 check 슬롯을 건너뛰지만, 방어적으로 여기서도 처리한다.
  if (readOnly) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange?.(next === true)}
        className="size-3.5"
      />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
      </Label>
    </span>
  );
}

// ---------------------------------------------------------------------------
// 영수증 placeholder 버튼 — P1 은 배치만 (비활성)
// TODO(P5): 영수증 즉석 발행 (OfficePrintTemplate receipt 렌더러 연동)
// ---------------------------------------------------------------------------

export function ClauseReceiptButton({ label }: { label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled
      className="h-6 px-2 text-[11px]"
      title="영수증 발행은 추후 지원됩니다."
    >
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// AmountNotationBar — 금액단위(만원/천원/원) + 금액인쇄형식(한글/漢字) 옵션 바
// 레거시 priceUnitRadioGroup / pricePrintTypeRadioGroup 대응. printOptions 바인딩.
// ---------------------------------------------------------------------------

const AMOUNT_UNIT_OPTIONS: Array<{ value: ContractDocumentEngineAmountUnit; label: string }> = [
  { value: 'manwon', label: '만원' },
  { value: 'chun', label: '천원' },
  { value: 'won', label: '원' },
];

const AMOUNT_NOTATION_OPTIONS: Array<{ value: ContractAmountNotation; label: string }> = [
  { value: 'hangul', label: '한글' },
  { value: 'hanja', label: '漢字' },
];

export function AmountNotationBar({
  printOptions,
  onChange,
}: {
  printOptions: ContractDocumentEnginePrintOptions;
  onChange: (partial: Partial<ContractDocumentEnginePrintOptions>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-sm border border-border/60 bg-muted/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium">금액단위 :</span>
        <RadioGroup
          value={printOptions.amountUnit}
          onValueChange={(value) =>
            onChange({ amountUnit: value as ContractDocumentEngineAmountUnit })
          }
          className="flex flex-row items-center gap-3"
        >
          {AMOUNT_UNIT_OPTIONS.map((option) => (
            <span key={option.value} className="inline-flex items-center gap-1.5">
              <RadioGroupItem value={option.value} id={`amount-unit-${option.value}`} />
              <Label
                htmlFor={`amount-unit-${option.value}`}
                className="cursor-pointer text-sm font-normal"
              >
                {option.label}
              </Label>
            </span>
          ))}
        </RadioGroup>
        <span className="text-xs text-destructive">[금액은 숫자로 입력]</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium">금액인쇄형식 :</span>
        <RadioGroup
          value={printOptions.amountNotation}
          onValueChange={(value) =>
            onChange({ amountNotation: value as ContractAmountNotation })
          }
          className="flex flex-row items-center gap-3"
        >
          {AMOUNT_NOTATION_OPTIONS.map((option) => (
            <span key={option.value} className="inline-flex items-center gap-1.5">
              <RadioGroupItem value={option.value} id={`amount-notation-${option.value}`} />
              <Label
                htmlFor={`amount-notation-${option.value}`}
                className="cursor-pointer text-sm font-normal"
              >
                {option.label}
              </Label>
            </span>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
