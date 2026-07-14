/**
 * base_contract(아파트/오피스텔/부동산/상가 계약서) 조항 임베디드 에디터 + A4 프리뷰.
 *
 * 레거시 MySpider ContractInputForm 의 편집면 구성 이식 (document-hub-editor-plan.md §4.2):
 *   1. 부동산의 표시 (문서형 표) → 2. 계약내용 (AmountNotationBar + 제1조~제3조 조항
 *   임베디드) → 기타 계약 조건(부가세·계약 일자 등 조항 밖 필드) → 특약(rich text)
 *   → 당사자 요약(당사자 탭에서 편집 — 중복 편집 금지) → 중개사무소.
 *
 * - 값은 전부 기존 engineFields 카탈로그 키(단일 진실), 표기 옵션은 printOptions.
 * - 프리뷰는 같은 CLAUSE_LAYOUTS 를 읽기 전용으로 렌더해 편집면=인쇄면 정합 보장.
 *   금액 병기는 printOptions.amountNotation(한글/漢字)을 따른다.
 * - 특약 HTML 은 반드시 새니타이즈 후 렌더 (DOMPurify — lib/contract-rich-text).
 */
import { useMemo } from 'react';
import { formatContractAmountWithWon, isContractRichTextHtml } from '@estate-erp/shared';
import {
  collectContractClauseFieldKeys,
  parseContractManwonText,
  type ClauseArticle,
  type ContractDocumentEngineFieldDefinition,
  type ContractDocumentEngineFieldGroup,
  type ContractDocumentEngineFields,
  type ContractDocumentEnginePrintOptions,
} from './-document-engine';
import { AmountNotationBar } from './-clause-primitives';
import { ContractClauseEditor, type ClauseFieldChangeHandler } from './-clause-editor';
import { cn } from '@/lib/utils';
import {
  CONTRACT_RICH_TEXT_VIEW_CLASS,
  sanitizeContractHtml,
} from '@/lib/contract-rich-text';
import { RichTextEditor } from '@/components/rich-text-editor';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// 필드그룹 분해 — 조항 레이아웃이 흡수한 키를 제외한 나머지를 배치한다
// ---------------------------------------------------------------------------

/**
 * 조항 에디터에서 렌더하지 않는 카탈로그 필드.
 * - secondClauseUsed: printOptions.directClause2(계약사항2조 직접입력)로 대체 —
 *   같은 개념의 이중 입력원을 만들지 않는다.
 * - specialTerms: 특약 rich text 섹션이 별도 렌더.
 */
const EXCLUDED_LEFTOVER_KEYS: ReadonlySet<string> = new Set([
  'secondClauseUsed',
  'specialTerms',
]);

/** 조항 밖 필드로 남길 그룹 (카탈로그 key 기준) */
const LEFTOVER_GROUP_KEYS: ReadonlySet<string> = new Set([
  'paymentTerms',
  'schedule',
  'clauses',
]);

type GroupSplit = {
  propertyIndication: ContractDocumentEngineFieldGroup | null;
  leftoverGroups: ContractDocumentEngineFieldGroup[];
  specialTermsExtras: ContractDocumentEngineFieldDefinition[];
  brokerOffice: ContractDocumentEngineFieldGroup | null;
};

function splitFieldGroups(
  fieldGroups: ContractDocumentEngineFieldGroup[],
  articles: ClauseArticle[],
): GroupSplit {
  const coveredKeys = new Set(collectContractClauseFieldKeys(articles));
  const result: GroupSplit = {
    propertyIndication: null,
    leftoverGroups: [],
    specialTermsExtras: [],
    brokerOffice: null,
  };

  for (const group of fieldGroups) {
    if (group.key === 'propertyIndication') {
      result.propertyIndication = group;
      continue;
    }
    if (group.key === 'specialTerms') {
      result.specialTermsExtras = group.fields.filter(
        (field) => !EXCLUDED_LEFTOVER_KEYS.has(field.key),
      );
      continue;
    }
    if (group.key === 'brokerOffice') {
      result.brokerOffice = group;
      continue;
    }
    if (group.key && LEFTOVER_GROUP_KEYS.has(group.key)) {
      const leftover = group.fields.filter(
        (field) => !coveredKeys.has(field.key) && !EXCLUDED_LEFTOVER_KEYS.has(field.key),
      );
      if (leftover.length > 0) {
        result.leftoverGroups.push({ ...group, fields: leftover });
      }
    }
    // parties 그룹은 당사자 요약(읽기 전용)으로 대체 — 당사자 탭이 단일 편집원
  }

  return result;
}

// ---------------------------------------------------------------------------
// 문서형 표 셀 — "1. 부동산의 표시" (레거시 소재지/지목/구조 표 배치)
// ---------------------------------------------------------------------------

function IndicationCell({
  field,
  value,
  onFieldChange,
  readOnly,
  className,
}: {
  field: ContractDocumentEngineFieldDefinition;
  value: string;
  onFieldChange?: ClauseFieldChangeHandler;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-stretch', className)}>
      <div
        className={cn(
          'flex w-[104px] shrink-0 items-center px-3 py-1.5 text-sm font-medium',
          readOnly ? 'bg-slate-50 text-slate-700' : 'bg-muted/60',
        )}
      >
        {stripUnitSuffix(field.label, field.unit)}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1">
        {readOnly ? (
          <span className="truncate text-sm leading-6">{value || ' '}</span>
        ) : (
          <Input
            value={value}
            onChange={(event) => onFieldChange?.(field.key, event.target.value, field)}
            inputMode={field.inputType === 'number' ? 'numeric' : undefined}
            className="h-7 px-2 text-sm"
          />
        )}
        {field.unit ? (
          <span
            className={cn(
              'shrink-0 text-xs',
              readOnly ? 'text-slate-500' : 'text-muted-foreground',
            )}
          >
            {field.unit === 'm2' ? 'm²' : field.unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PropertyIndicationTable({
  group,
  fields,
  onFieldChange,
  readOnly,
}: {
  group: ContractDocumentEngineFieldGroup;
  fields: ContractDocumentEngineFields;
  onFieldChange?: ClauseFieldChangeHandler;
  readOnly?: boolean;
}) {
  const fullWidthKeys = new Set(['propertyAddress']);
  const fullRows = group.fields.filter((field) => fullWidthKeys.has(field.key));
  const pairFields = group.fields.filter((field) => !fullWidthKeys.has(field.key));

  return (
    <div
      className={cn(
        'divide-y overflow-hidden rounded-sm border',
        readOnly ? 'divide-slate-200 border-slate-300' : 'divide-border/60 border-border',
      )}
    >
      {fullRows.map((field) => (
        <IndicationCell
          key={field.key}
          field={field}
          value={fields[field.key] ?? ''}
          onFieldChange={onFieldChange}
          readOnly={readOnly}
        />
      ))}
      <div
        className={cn(
          'grid grid-cols-1 md:grid-cols-2',
          readOnly ? 'divide-slate-200' : 'divide-border/60',
          'divide-y md:divide-y-0',
        )}
      >
        {pairFields.map((field, index) => (
          <IndicationCell
            key={field.key}
            field={field}
            value={fields[field.key] ?? ''}
            onFieldChange={onFieldChange}
            readOnly={readOnly}
            className={cn(
              index >= 2 && 'md:border-t',
              index % 2 === 1 && 'md:border-l',
              readOnly ? 'md:border-slate-200' : 'md:border-border/60',
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 조항 밖 필드 컴팩트 그리드 (부가세/계약 일자/중개사무소)
// ---------------------------------------------------------------------------

/** 엔진이 라벨에 붙인 단위 접미("토지 면적 (m2)") 제거 */
function stripUnitSuffix(label: string, unit: string | undefined): string {
  if (!unit) return label;
  const suffix = ` (${unit})`;
  return label.endsWith(suffix) ? label.slice(0, -suffix.length) : label;
}

function CompactFieldControl({
  field,
  value,
  notation,
  onFieldChange,
}: {
  field: ContractDocumentEngineFieldDefinition;
  value: string;
  notation: ContractDocumentEnginePrintOptions['amountNotation'];
  onFieldChange: ClauseFieldChangeHandler;
}) {
  const inputType = field.inputType ?? (field.multiline ? 'textarea' : 'text');
  const label = stripUnitSuffix(field.label, field.unit);

  if (inputType === 'checkbox') {
    return (
      <div className="flex min-h-8 items-center gap-2 pt-5">
        <Checkbox
          id={`clause-extra-${field.key}`}
          checked={value === 'true'}
          onCheckedChange={(checked) =>
            onFieldChange(field.key, checked === true ? 'true' : '', field)
          }
        />
        <Label htmlFor={`clause-extra-${field.key}`} className="cursor-pointer text-sm">
          {label}
        </Label>
      </div>
    );
  }

  if (inputType === 'select') {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Select
          value={value || undefined}
          onValueChange={(next) => onFieldChange(field.key, next, field)}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="선택" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (inputType === 'date') {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Input
          type="date"
          value={value}
          onChange={(event) => onFieldChange(field.key, event.target.value, field)}
          className="h-8"
        />
      </div>
    );
  }

  if (inputType === 'amount') {
    const manwon = parseContractManwonText(value);
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="relative">
          <Input
            inputMode="numeric"
            value={value}
            onChange={(event) => onFieldChange(field.key, event.target.value, field)}
            className="h-8 pr-11"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            만원
          </span>
        </div>
        {manwon !== null && manwon > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {formatContractAmountWithWon(manwon, notation)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          inputMode={inputType === 'number' ? 'numeric' : undefined}
          value={value}
          onChange={(event) => onFieldChange(field.key, event.target.value, field)}
          className={cn('h-8', field.unit && 'pr-11')}
        />
        {field.unit ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {field.unit === 'm2' ? 'm²' : field.unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CompactFieldGrid({
  title,
  fields,
  values,
  notation,
  onFieldChange,
}: {
  title: string;
  fields: ContractDocumentEngineFieldDefinition[];
  values: ContractDocumentEngineFields;
  notation: ContractDocumentEnginePrintOptions['amountNotation'];
  onFieldChange: ClauseFieldChangeHandler;
}) {
  if (fields.length === 0) return null;
  return (
    <section className="rounded-md border border-border/60 bg-background p-4">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <CompactFieldControl
            key={field.key}
            field={field}
            value={values[field.key] ?? ''}
            notation={notation}
            onFieldChange={onFieldChange}
          />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 당사자 요약 — 편집은 당사자 탭(ContractParty)에서, 여기는 인쇄값 확인만
// ---------------------------------------------------------------------------

function PartySummaryRow({
  role,
  name,
  address,
  phone,
}: {
  role: string;
  name: string;
  address: string;
  phone: string;
}) {
  return (
    <div className="flex items-stretch border-t border-border/60 text-sm first:border-t-0">
      <div className="flex w-[104px] shrink-0 items-center bg-muted/60 px-3 py-2 font-medium">
        {role || '-'}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-0.5 px-3 py-2">
        <span className="font-medium">{name || '-'}</span>
        <span className="text-muted-foreground">{address || '-'}</span>
        <span className="text-muted-foreground">{phone || '-'}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 편집기 본체
// ---------------------------------------------------------------------------

export function BaseContractClauseEditor({
  articles,
  fields,
  printOptions,
  fieldGroups,
  onFieldChange,
  onPrintOptionsChange,
}: {
  articles: ClauseArticle[];
  fields: ContractDocumentEngineFields;
  printOptions: ContractDocumentEnginePrintOptions;
  /** draft 빌드 시 appliesTo(거래유형) 필터가 적용된 카탈로그 그룹 */
  fieldGroups: ContractDocumentEngineFieldGroup[];
  onFieldChange: ClauseFieldChangeHandler;
  onPrintOptionsChange: (partial: Partial<ContractDocumentEnginePrintOptions>) => void;
}) {
  const split = useMemo(() => splitFieldGroups(fieldGroups, articles), [fieldGroups, articles]);

  return (
    <div className="space-y-4">
      {split.propertyIndication ? (
        <section className="rounded-md border border-border/60 bg-background p-4">
          <p className="text-sm font-semibold">1. 부동산의 표시</p>
          <div className="mt-3">
            <PropertyIndicationTable
              group={split.propertyIndication}
              fields={fields}
              onFieldChange={onFieldChange}
            />
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-border/60 bg-background p-4">
        <p className="text-sm font-semibold">2. 계약내용</p>
        <div className="mt-3 space-y-3">
          <AmountNotationBar printOptions={printOptions} onChange={onPrintOptionsChange} />
          <ContractClauseEditor
            articles={articles}
            fields={fields}
            printOptions={printOptions}
            onFieldChange={onFieldChange}
            onPrintOptionsChange={onPrintOptionsChange}
          />
        </div>
      </section>

      {split.leftoverGroups.map((group) => (
        <CompactFieldGrid
          key={group.key ?? group.title}
          title={group.title}
          fields={group.fields}
          values={fields}
          notation={printOptions.amountNotation}
          onFieldChange={onFieldChange}
        />
      ))}

      <section className="rounded-md border border-border/60 bg-background p-4">
        <p className="text-sm font-semibold">특약사항</p>
        <div className="mt-3 space-y-3">
          <RichTextEditor
            value={fields.specialTerms ?? ''}
            onChange={(html) => onFieldChange('specialTerms', html)}
          />
          {split.specialTermsExtras.length > 0 ? (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {split.specialTermsExtras.map((field) => (
                <span key={field.key} className="inline-flex items-center gap-1.5">
                  <Checkbox
                    id={`clause-special-${field.key}`}
                    checked={(fields[field.key] ?? '') === 'true'}
                    onCheckedChange={(checked) =>
                      onFieldChange(field.key, checked === true ? 'true' : '', field)
                    }
                    className="size-3.5"
                  />
                  <Label
                    htmlFor={`clause-special-${field.key}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {field.label}
                  </Label>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border border-border/60 bg-background p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">당사자</p>
          <p className="text-xs text-muted-foreground">
            당사자 정보는 계약 상세의 당사자 탭에서 관리합니다 — 아래는 인쇄 표시값입니다.
          </p>
        </div>
        <div className="mt-3 overflow-hidden rounded-sm border border-border">
          <PartySummaryRow
            role={fields.partyOneRole ?? ''}
            name={fields.partyOneName ?? ''}
            address={fields.partyOneAddress ?? ''}
            phone={fields.partyOnePhone ?? ''}
          />
          <PartySummaryRow
            role={fields.partyTwoRole ?? ''}
            name={fields.partyTwoName ?? ''}
            address={fields.partyTwoAddress ?? ''}
            phone={fields.partyTwoPhone ?? ''}
          />
        </div>
      </section>

      {split.brokerOffice ? (
        <CompactFieldGrid
          title={split.brokerOffice.title}
          fields={split.brokerOffice.fields}
          values={fields}
          notation={printOptions.amountNotation}
          onFieldChange={onFieldChange}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A4 프리뷰 — 같은 조항 레이아웃을 읽기 전용으로 렌더 (편집면 = 인쇄면)
// ---------------------------------------------------------------------------

function formatPreviewDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso || '-';
  return `${match[1]}년 ${match[2]}월 ${match[3]}일`;
}

function formatPreviewValue(
  field: ContractDocumentEngineFieldDefinition,
  value: string,
  notation: ContractDocumentEnginePrintOptions['amountNotation'],
): string {
  if (!value.trim()) return '';
  if (field.inputType === 'checkbox') return value === 'true' ? '예' : '';
  if (field.inputType === 'date') return formatPreviewDate(value);
  if (field.inputType === 'amount') {
    const manwon = parseContractManwonText(value);
    return manwon !== null && manwon > 0
      ? `${manwon.toLocaleString('ko-KR')}만원 · ${formatContractAmountWithWon(manwon, notation)}`
      : value;
  }
  if (field.unit) return `${value} ${field.unit === 'm2' ? 'm²' : field.unit}`;
  return value;
}

function PreviewLabelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] border-b border-slate-200 last:border-b-0">
      <div className="bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">{label}</div>
      <div className="px-3 py-1.5 text-sm leading-6">{value || ' '}</div>
    </div>
  );
}

function PreviewSignatureBlock({ role, name }: { role: string; name: string }) {
  return (
    <div className="rounded-sm border border-slate-300 p-4">
      <p className="text-xs text-slate-500">{role || '-'}</p>
      <div className="mt-6 flex items-end justify-between gap-3">
        <span className="text-base font-medium">{name || ' '}</span>
        <span className="text-sm text-slate-500">(인)</span>
      </div>
    </div>
  );
}

export function BaseContractClausePreview({
  title,
  status,
  reportName,
  articles,
  fields,
  printOptions,
  fieldGroups,
}: {
  title: string;
  status: string;
  reportName: string;
  articles: ClauseArticle[];
  fields: ContractDocumentEngineFields;
  printOptions: ContractDocumentEnginePrintOptions;
  fieldGroups: ContractDocumentEngineFieldGroup[];
}) {
  const split = useMemo(() => splitFieldGroups(fieldGroups, articles), [fieldGroups, articles]);

  const leftoverRows = split.leftoverGroups.flatMap((group) =>
    group.fields
      .map((field) => ({
        key: field.key,
        label: stripUnitSuffix(field.label, field.unit),
        value: formatPreviewValue(
          field,
          fields[field.key] ?? '',
          printOptions.amountNotation,
        ),
      }))
      .filter((row) => row.value !== ''),
  );

  const brokerRows = [
    { label: '사무소 명칭', value: fields.brokerOfficeName ?? '' },
    { label: '사무소 소재지', value: fields.brokerOfficeAddress ?? '' },
    { label: '개설등록번호', value: fields.brokerOfficeRegNo ?? '' },
    { label: '대표 성명', value: fields.brokerCeoName ?? '' },
    { label: '소속공인중개사', value: fields.brokerAgentName ?? '' },
  ].filter((row) => row.value.trim() !== '');

  return (
    <div className="mx-auto min-h-[1123px] w-full max-w-[794px] border border-slate-200 bg-white px-12 py-10 text-slate-950 shadow-sm print:border-0 print:shadow-none">
      <div className="flex items-start justify-between gap-4 text-[10px] text-slate-500">
        <span>{reportName || 'contract-document'}</span>
        <span>{status}</span>
      </div>

      <header className="mt-8 text-center">
        <h2 className="text-2xl font-semibold tracking-[0.12em]">{title}</h2>
      </header>

      {split.propertyIndication ? (
        <section className="mt-8 break-inside-avoid">
          <h3 className="border-b border-slate-900 pb-1.5 text-xs font-semibold">
            1. 부동산의 표시
          </h3>
          <div className="mt-2">
            <PropertyIndicationTable
              group={split.propertyIndication}
              fields={fields}
              readOnly
            />
          </div>
        </section>
      ) : null}

      <section className="mt-7 break-inside-avoid">
        <h3 className="border-b border-slate-900 pb-1.5 text-xs font-semibold">2. 계약내용</h3>
        <div className="mt-2">
          <ContractClauseEditor
            articles={articles}
            fields={fields}
            printOptions={printOptions}
            readOnly
            idPrefix="clause-preview"
          />
        </div>
      </section>

      {leftoverRows.length > 0 ? (
        <section className="mt-7 break-inside-avoid">
          <h3 className="border-b border-slate-900 pb-1.5 text-xs font-semibold">
            계약 일자 및 기타 조건
          </h3>
          <div className="mt-2 border border-slate-300">
            {leftoverRows.map((row) => (
              <PreviewLabelRow key={row.key} label={row.label} value={row.value} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-7 break-inside-avoid">
        <h3 className="border-b border-slate-900 pb-1.5 text-xs font-semibold">특약사항</h3>
        {fields.specialTerms?.trim() ? (
          isContractRichTextHtml(fields.specialTerms) ? (
            <div
              className={cn(
                'mt-2 border border-slate-300 px-3 py-2 text-sm leading-6',
                CONTRACT_RICH_TEXT_VIEW_CLASS,
              )}
              // 반드시 새니타이즈를 거친다 — 특약 HTML XSS 방어
              dangerouslySetInnerHTML={{ __html: sanitizeContractHtml(fields.specialTerms) }}
            />
          ) : (
            // 레거시/스냅샷 plain text 특약 — 줄바꿈 보존
            <div className="mt-2 whitespace-pre-wrap border border-slate-300 px-3 py-2 text-sm leading-6">
              {fields.specialTerms}
            </div>
          )
        ) : (
          <div className="mt-2 border border-slate-300 px-3 py-2 text-sm text-slate-400">-</div>
        )}
      </section>

      <section className="mt-7 break-inside-avoid">
        <h3 className="border-b border-slate-900 pb-1.5 text-xs font-semibold">당사자</h3>
        <div className="mt-2 border border-slate-300">
          <PreviewLabelRow
            label={fields.partyOneRole || '매도인'}
            value={[fields.partyOneName, fields.partyOneAddress, fields.partyOnePhone]
              .filter(Boolean)
              .join(' · ')}
          />
          <PreviewLabelRow
            label={fields.partyTwoRole || '매수인'}
            value={[fields.partyTwoName, fields.partyTwoAddress, fields.partyTwoPhone]
              .filter(Boolean)
              .join(' · ')}
          />
        </div>
      </section>

      {brokerRows.length > 0 ? (
        <section className="mt-7 break-inside-avoid">
          <h3 className="border-b border-slate-900 pb-1.5 text-xs font-semibold">
            개업공인중개사
          </h3>
          <div className="mt-2 border border-slate-300">
            {brokerRows.map((row) => (
              <PreviewLabelRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </section>
      ) : null}

      {fields.contractDate ? (
        <p className="mt-10 text-center text-sm">
          계약 체결일 {formatPreviewDate(fields.contractDate)}
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
        <PreviewSignatureBlock role={fields.partyOneRole || '매도인'} name={fields.partyOneName ?? ''} />
        <PreviewSignatureBlock role={fields.partyTwoRole || '매수인'} name={fields.partyTwoName ?? ''} />
      </div>
    </div>
  );
}
