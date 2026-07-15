/**
 * 계약 문서 편집기 — 마이스파이더 서식 코드 매핑 기반 입력폼 + 출력 미리보기 + 인쇄.
 *
 * - 입력폼은 template.metadata.documentEngine.fieldGroups 구동
 *   (getContractDocumentEngineFieldGroups(template, { transactionType }) 오버로드,
 *   appliesTo 거래유형 필터 적용). metadata 가 없으면 category 공통 그룹 fallback.
 * - inputType 별 컨트롤: amount(만원 + 만/천/원 단위 토글 + 한글 병기),
 *   number(+unit), date(+N개월 편의 버튼), select, checkbox, textarea, text.
 * - 특약사항(specialTerms)은 rich text HTML — TipTap 에디터로 편집하고,
 *   미리보기/인쇄는 반드시 새니타이즈 후 렌더한다.
 * - 부속 서식은 주 계약서 문서(primaryDocument)의 입력값을 기본 승계한다.
 * - 조항 임베디드 편집 (plan §4.2/§4.4): CLAUSE_LAYOUTS 에 레이아웃이 있는 서식
 *   (base_contract × sale)은 제네릭 그리드 대신 조항 에디터(-base-contract-clause-editor)
 *   로 렌더한다. 값은 engineFields 단일 진실 — 조항 에디터로 저장된 적 없는 문서
 *   (printOptions 마커 부재)에 residentialSaleAgreement 스냅샷이 있으면 열 때
 *   스냅샷을 engineFields 로 변환해 초기값으로 쓰고, 저장 시에는 스냅샷을
 *   engineFields 기준으로 역반영(재생성)해 서버 완료 검증·MCP 와의 분기를 막는다.
 *   -residential-sale-editor 경로는 dormant 로 유지한다(회귀 방지).
 */
import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookMarked,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Printer,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  Contract,
  ContractClauseTemplate,
  ContractDocument,
  ContractDocumentTemplate,
} from '@estate-erp/api-client';
import {
  appendContractRichText,
  contractRichTextToPlainText,
  formatContractAmountWithWon,
  formatPrice,
  validateResidentialSaleAgreement,
  type ResidentialSaleAgreementDraft,
} from '@estate-erp/shared';
import {
  buildContractDocumentEngineDraft,
  buildResidentialSaleAgreement,
  convertResidentialSaleAgreementToEngineFields,
  getContractClauseLayout,
  getContractDocumentEngineFieldGroups,
  getContractDocumentEnginePrintOptions,
  getContractDocumentEngineSections,
  hasContractDocumentEnginePrintOptions,
  parseContractManwonText,
  validateBaseContractSaleEngineFields,
  CONTRACT_DOCUMENT_ENGINE_DEFAULT_PRINT_OPTIONS,
  type ContractDocumentEngineFieldDefinition,
  type ContractDocumentEngineFieldGroup,
  type ContractDocumentEngineFields,
  type ContractDocumentEngineParty,
  type ContractDocumentEnginePrintOptions,
  type ContractDocumentEngineWorkflow,
} from './-document-engine';
import {
  BaseContractClauseEditor,
  BaseContractClausePreview,
} from './-base-contract-clause-editor';
import {
  ResidentialSaleAgreementEditor,
  ResidentialSaleAgreementPreview,
} from './-residential-sale-editor';
import {
  documentCategoryLabels,
  documentStatusMeta,
  findPrimaryContractDocument,
} from './-contract-shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  CONTRACT_RICH_TEXT_VIEW_CLASS,
  sanitizeContractHtml,
} from '@/lib/contract-rich-text';
import { RichTextEditor } from '@/components/rich-text-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

export type DocumentEditorForm = {
  documentId?: string;
  templateId?: string;
  type: string;
  category: string;
  title: string;
  status: string;
  fileUrl: string;
  signedAt: string;
  submittedAt: string;
  memo: string;
  metadata: Record<string, unknown>;
  workflow: ContractDocumentEngineWorkflow;
  engineFields: ContractDocumentEngineFields;
  /**
   * 문서 단위 표기/인쇄 옵션 (metadata.documentEngine.printOptions) —
   * 금액단위(만원/천원/원)·금액인쇄형식(한글/漢字)·공란인쇄·행 토글.
   * 조항 에디터 서식에서만 저장 페이로드에 포함한다.
   */
  printOptions: ContractDocumentEnginePrintOptions;
  saleAgreement: ResidentialSaleAgreementDraft | null;
  /** 서식 코드 (레거시 Cntr_Clsf) — 신규 문서는 template.code 에서 유도 */
  kind: string | null;
  /** 묶음 내 탭 순서 / 동일 서식 반복 순번 — 기존 문서 수정 시 보존 */
  sortOrder?: number;
  kindOrder?: number;
  /** metadata.documentEngine.fieldGroups 구동 + appliesTo 필터 적용된 그룹 */
  fieldGroups: ContractDocumentEngineFieldGroup[];
  /** 프리뷰 당사자 반복 렌더용 (contract.parties) */
  parties: ContractDocumentEngineParty[];
  /** 계약 거래유형 — 특약 템플릿 필터 등 편의 기능용 */
  transactionType: string;
};

export function emptyDocumentEditorForm(): DocumentEditorForm {
  return {
    type: 'generated',
    category: 'contract',
    title: '',
    status: 'draft',
    fileUrl: '',
    signedAt: '',
    submittedAt: '',
    memo: '',
    metadata: {},
    workflow: emptyDocumentEngineWorkflow(),
    engineFields: emptyDocumentEngineFields(),
    printOptions: { ...CONTRACT_DOCUMENT_ENGINE_DEFAULT_PRINT_OPTIONS },
    saleAgreement: null,
    kind: null,
    sortOrder: undefined,
    kindOrder: undefined,
    fieldGroups: [],
    parties: [],
    transactionType: '',
  };
}

export function toDocumentEditorForm(
  contract: Contract,
  template: ContractDocumentTemplate,
  document?: ContractDocument,
): DocumentEditorForm {
  // 부속 서식(계약서 이외 category)은 주 계약서 문서의 입력값(소재지·금액
  // 스케줄 등)을 기본값으로 승계한다 (레거시 getMainContractInfo)
  const primaryDocument =
    template.category !== 'contract'
      ? findPrimaryContractDocument(contract.documents ?? [], document?.id)
      : null;

  const draft = buildContractDocumentEngineDraft({
    contract,
    template,
    document,
    primaryDocument,
  });

  // 조항 임베디드 에디터 대상 서식 (현재 base_contract × sale, P2 에서 임대차 확장)
  const clauseLayout = getContractClauseLayout(template.code, contract.transactionType);

  // 매매초안 이관 (plan §4.4): 조항 에디터로 저장된 적 없는 문서(printOptions 마커
  // 부재)에 residentialSaleAgreement 스냅샷이 있으면 열 때 스냅샷 값을 engineFields
  // 위에 덮어 초기값으로 쓴다. 구 편집기(-residential-sale-editor)는 engineFields 를
  // 편집할 UI 가 없었고 저장 경로가 draft 기본값 engineFields 를 항상 함께 기록했으므로
  // — documentEngine.fields 존재 여부로 판별하면 이관이 스킵돼 스냅샷의 사용자
  // 편집값(금액/일정/당사자)이 유실된다 — 스냅샷이 항상 최신 사용자 입력이다.
  // 조항 에디터 저장은 printOptions 를 항상 기록하므로 마커 이후에는 재이관하지
  // 않는다 (engineFields 가 단일 진실, 스냅샷은 저장 시 역반영으로 동기화).
  let engineFields = draft.fields;
  if (clauseLayout && !hasContractDocumentEnginePrintOptions(document?.metadata)) {
    const converted = convertResidentialSaleAgreementToEngineFields(document?.metadata);
    if (converted) {
      engineFields = { ...draft.fields, ...converted };
    }
  }

  return {
    documentId: document?.id,
    templateId: template.id || document?.templateId || undefined,
    type: document?.type ?? 'generated',
    category: document?.category ?? template.category,
    title: draft.title,
    status: document?.status ?? 'draft',
    fileUrl: document?.fileUrl ?? '',
    signedAt: document?.signedAt ?? '',
    submittedAt: document?.submittedAt ?? '',
    memo: document?.memo ?? '',
    metadata: document?.metadata ?? template.metadata ?? {},
    workflow: draft.workflow,
    engineFields,
    // 표기 옵션은 문서 metadata 에서만 읽는다 (신규 문서는 기본값 만원/한글)
    printOptions: getContractDocumentEnginePrintOptions(document?.metadata),
    // 조항 에디터 서식은 engineFields 가 단일 진실 — 매매초안 전용 폼은 dormant.
    saleAgreement: clauseLayout
      ? null
      : buildResidentialSaleAgreement(contract, template, document),
    // 신규 문서는 template.code 를 kind 로 전달 (서버가 sortOrder/kindOrder 자동 부여).
    // 템플릿 없는 문서(uploaded/external)는 합성 code 가 '' 이므로 null 유지
    // — category 등 자유 문자열이 kind 로 저장되지 않도록 (서버 400 방지).
    kind: document?.kind ?? (template.code || null),
    sortOrder: document?.sortOrder,
    kindOrder: document?.kindOrder,
    // metadata 구동 필드그룹 (appliesTo 는 contract.transactionType 기준 필터 적용됨)
    fieldGroups: draft.fieldGroups,
    parties: contract.parties ?? [],
    transactionType: contract.transactionType,
  };
}

function emptyDocumentEngineWorkflow(): ContractDocumentEngineWorkflow {
  return {
    inputFormName: 'ContractInputForm',
    reportName: 'AnnexedReport',
    formTitle: '계약 문서 입력',
    previewTitle: '계약 문서 출력 미리보기',
  };
}

function emptyDocumentEngineFields(): ContractDocumentEngineFields {
  return {
    documentTitle: '',
    writtenDate: '',
    contractDateText: '',
    propertyLabel: '',
    propertyAddress: '',
    propertyAreaText: '',
    partyOneRole: '',
    partyOneName: '',
    partyOneAddress: '',
    partyOnePhone: '',
    partyTwoRole: '',
    partyTwoName: '',
    partyTwoAddress: '',
    partyTwoPhone: '',
    transactionTypeText: '',
    totalPriceText: '',
    monthlyRentText: '',
    paymentSchedule: '',
    leasePeriod: '',
    moveInDateText: '',
    bodyText: '',
    legalBasisText: '',
    sourceNotice: '',
    specialTerms: '',
    officeNotice: '',
    confirmationMemo: '',
    receiptMemo: '',
    ledgerMemo: '',
    settlementMemo: '',
  };
}

// ---------------------------------------------------------------------------
// 파생값 헬퍼 — 금액 한글 병기 / 임대차 기간
// ---------------------------------------------------------------------------

/**
 * 주 금액 필드 → 프리뷰 공통 '거래 조건' 행 동기화 매핑.
 * metadata fieldGroups 서식(base_contract 등)에서 salePrice/deposit/monthlyRent 를
 * 편집하면 출력 미리보기의 거래 금액/월 차임 행도 함께 갱신한다.
 */
const PRIMARY_AMOUNT_MIRRORS: Record<string, 'totalPriceText' | 'monthlyRentText'> = {
  salePrice: 'totalPriceText',
  deposit: 'totalPriceText',
  monthlyRent: 'monthlyRentText',
};

/** 'YYYY-MM-DD' input[type=date] 값 파싱 (로컬 기준) */
function parseDateInputValue(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** N개월 더하기 — 말일 초과 시 해당 월 말일로 보정 (1/31 +1개월 → 2/28) */
function addMonthsToDate(date: Date, months: number): Date {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

/** 시작일 + N개월 = 종료일이 정확히 성립하는 N (아니면 null) */
function diffWholeMonths(start: Date, end: Date): number | null {
  if (end.getTime() <= start.getTime()) return null;
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  if (months <= 0) return null;
  return toDateInputValue(addMonthsToDate(start, months)) === toDateInputValue(end)
    ? months
    : null;
}

/**
 * 임대차 개월수 ↔ 만기일 양방향 파생 (레거시 setRentMonth 대응).
 * - leaseMonths / leaseStartDate 편집 → leaseEndDate = 시작일 + N개월
 * - leaseEndDate 편집 → 온전한 개월수면 leaseMonths 갱신, 아니면 비움
 */
function applyLeasePeriodDerivation(
  fields: ContractDocumentEngineFields,
  key: string,
  value: string,
) {
  if (key === 'leaseMonths' || key === 'leaseStartDate') {
    const months = Number(
      (key === 'leaseMonths' ? value : (fields.leaseMonths ?? '')).trim(),
    );
    const start = parseDateInputValue(
      key === 'leaseStartDate' ? value : fields.leaseStartDate,
    );
    if (
      start &&
      Number.isInteger(months) &&
      months > 0 &&
      fields.leaseEndDate !== undefined
    ) {
      fields.leaseEndDate = toDateInputValue(addMonthsToDate(start, months));
    }
    return;
  }

  if (key === 'leaseEndDate') {
    const start = parseDateInputValue(fields.leaseStartDate);
    const end = parseDateInputValue(value);
    if (start && end && fields.leaseMonths !== undefined) {
      const months = diffWholeMonths(start, end);
      fields.leaseMonths = months !== null ? String(months) : '';
    }
  }
}

// ---------------------------------------------------------------------------
// 편집 시트
// ---------------------------------------------------------------------------

export function DocumentEditorSheet({
  open,
  form,
  error,
  isSaving,
  isDirty,
  onOpenChange,
  onFormChange,
  onSave,
  onSaveAsNew,
}: {
  open: boolean;
  form: DocumentEditorForm;
  error: string | null;
  isSaving: boolean;
  isDirty: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: Dispatch<SetStateAction<DocumentEditorForm>>;
  onSave: () => void;
  onSaveAsNew: () => void;
}) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<'preview' | 'check'>('preview');
  const [activeSection, setActiveSection] = useState('content');
  // metadata.documentEngine.fieldGroups 구동 (draft 빌드 시 appliesTo 필터 적용됨).
  // 없으면 기존 category 공통 그룹 fallback.
  const fieldGroups =
    form.fieldGroups.length > 0
      ? form.fieldGroups
      : getContractDocumentEngineFieldGroups(form.category);
  // 문서 제목은 에디터 셸(사이드바)에 고정 배치하므로 그룹에서는 제외
  const visibleFieldGroups = fieldGroups
    .map((group) => ({
      ...group,
      fields: group.fields.filter((field) => field.key !== 'documentTitle'),
    }))
    .filter((group) => group.fields.length > 0);
  // 당사자 반복 렌더 (공동 N명 + 대리인 중첩 + 사무소/공동중개 행)
  // + metadata fieldGroups 서식별 필드도 그룹 섹션으로 함께 출력
  const sections = getContractDocumentEngineSections(form.category, form.engineFields, {
    parties: form.parties.length > 0 ? form.parties : undefined,
    fieldGroups,
  });
  const documentTitle = form.engineFields.documentTitle || form.title || '계약 문서';
  // 조항 임베디드 에디터 대상 서식 (CLAUSE_LAYOUTS — 현재 base_contract × sale)
  const clauseArticles = form.kind
    ? getContractClauseLayout(form.kind, form.transactionType)
    : null;
  const saleAgreementValidation = form.saleAgreement
    ? validateResidentialSaleAgreement(form.saleAgreement)
    : null;
  // 조항 에디터 검증 — 매매초안 validate 의 금액합계·필수일자 검사를 engineFields 로 이식.
  // printOptions 를 함께 넘긴다 — directClause2(2조 직접입력) 시 인도일 입력이
  // 숨겨지므로 필수 검사를 생략해야 해소 불가능한 오류가 남지 않는다.
  const baseContractValidation =
    clauseArticles && form.kind === 'base_contract' && form.transactionType === 'sale'
      ? validateBaseContractSaleEngineFields(form.engineFields, form.printOptions)
      : null;
  // 작성 점검 사이드바 공용 형태 (기존 "오류 N건" UX 유지)
  const editorValidation = baseContractValidation
    ? {
        isReady: baseContractValidation.isValid,
        errors: baseContractValidation.errors,
        warnings: baseContractValidation.warnings,
      }
    : saleAgreementValidation
      ? {
          isReady: saleAgreementValidation.isReadyForGeneration,
          errors: saleAgreementValidation.errors,
          warnings: saleAgreementValidation.warnings,
        }
      : null;
  // 기존 문서 수정은 변경이 있어야 저장 활성화. 신규 문서는 기본값 그대로도
  // 저장(생성) 가능해야 하므로 dirty 를 요구하지 않는다.
  const isSaveDisabled =
    isSaving ||
    !documentTitle ||
    !form.category ||
    (Boolean(form.documentId) && !isDirty);

  useEffect(() => {
    if (!open) return;
    setRightPanel('preview');
    setActiveSection('content');
  }, [open, form.documentId, form.templateId]);

  // Ctrl/Cmd+S 저장, Ctrl/Cmd+P 미리보기 (PRD 키보드 단축키)
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === 's') {
        event.preventDefault();
        // 저장 버튼과 동일한 비활성 조건(dirty 등)을 따른다
        if (!isSaveDisabled) onSave();
      }
      if (event.key === 'p') {
        event.preventDefault();
        setIsPreviewOpen(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onSave, isSaveDisabled]);

  function updateEngineField(
    key: string,
    value: string,
    field?: ContractDocumentEngineFieldDefinition,
  ) {
    onFormChange((prev) => {
      const nextFields: ContractDocumentEngineFields = {
        ...prev.engineFields,
        [key]: value,
      };

      // 한글 병기 파생값 동기화 ("일금 삼억오천만원정 (₩350,000,000)").
      // amount 필드뿐 아니라 공통(fallback) 그룹의 금액 텍스트 필드
      // (totalPriceText/monthlyRentText)도 병기 시블링이 있으면 함께 갱신한다.
      const manwon = parseContractManwonText(value);
      const hangul =
        manwon !== null && manwon > 0 ? formatContractAmountWithWon(manwon) : '';

      if (field?.inputType === 'amount') {
        nextFields[`${key}HangulText`] = hangul;

        // 주 금액 필드(salePrice/deposit/monthlyRent)는 프리뷰 공통
        // '거래 조건' 행(totalPriceText/monthlyRentText)에도 반영한다.
        const mirrorKey = PRIMARY_AMOUNT_MIRRORS[key];
        if (mirrorKey && prev.engineFields[mirrorKey] !== undefined) {
          nextFields[mirrorKey] = manwon !== null && manwon > 0 ? formatPrice(manwon) : '';
          nextFields[`${mirrorKey.slice(0, -'Text'.length)}HangulText`] = hangul;
        }
      } else {
        const hangulKey = key.endsWith('Text')
          ? `${key.slice(0, -'Text'.length)}HangulText`
          : `${key}HangulText`;
        if (prev.engineFields[hangulKey] !== undefined) {
          nextFields[hangulKey] = hangul;
        }
      }

      // 임대차 개월수 ↔ 만기일 양방향 파생 (레거시 setRentMonth)
      applyLeasePeriodDerivation(nextFields, key, value);

      return { ...prev, engineFields: nextFields };
    });
  }

  function updateSaleAgreement(
    updater: (agreement: ResidentialSaleAgreementDraft) => ResidentialSaleAgreementDraft,
  ) {
    onFormChange((prev) => ({
      ...prev,
      saleAgreement: prev.saleAgreement ? updater(prev.saleAgreement) : null,
    }));
  }

  /** 표기/인쇄 옵션 갱신 (AmountNotationBar·공란인쇄·행 토글 → printOptions) */
  function updatePrintOptions(partial: Partial<ContractDocumentEnginePrintOptions>) {
    onFormChange((prev) => ({
      ...prev,
      printOptions: { ...prev.printOptions, ...partial },
    }));
  }

  const navigationSections = clauseArticles || form.saleAgreement
    ? [{ id: 'content', label: '계약 내용' }]
    : visibleFieldGroups.map((group, index) => ({
        id: `group-${index}`,
        label: group.title,
      }));

  function scrollToEditorSection(sectionId: string) {
    setActiveSection(sectionId);
    document
      .getElementById(`document-editor-${sectionId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-[calc(100vw-24px)] gap-0 overflow-hidden p-0 sm:max-w-none xl:w-[calc(100vw-64px)]"
        >
          <SheetHeader className="border-b px-5 py-3.5">
            <div className="flex items-center justify-between gap-6 pr-8">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="truncate">{documentTitle}</SheetTitle>
                  <Badge className={cn('border-0', documentStatusMeta[form.status]?.className)}>
                    {documentStatusMeta[form.status]?.label ?? form.status}
                  </Badge>
                  <Badge variant="outline">
                    {documentCategoryLabels[form.category] ?? form.category}
                  </Badge>
                </div>
                <SheetDescription className="truncate">
                  {form.workflow.inputFormName} · {form.workflow.reportName}
                </SheetDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsPreviewOpen(true)}>
                  <Printer className="size-3.5" />
                  출력 미리보기
                </Button>
                <Button size="sm" onClick={onSave} disabled={isSaveDisabled}>
                  저장
                </Button>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="grid min-h-full bg-muted/30 lg:grid-cols-[164px_minmax(400px,1fr)_minmax(390px,0.95fr)]">
              <nav className="sticky top-0 hidden h-[calc(100vh-132px)] flex-col border-r bg-background/95 p-3 lg:flex">
                <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  섹션
                </p>
                <div className="space-y-1">
                  {navigationSections.map((section, index) => (
                    <button
                      key={section.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted',
                        (activeSection === section.id || (activeSection === 'content' && index === 0)) &&
                          'bg-muted font-medium text-foreground',
                      )}
                      onClick={() => scrollToEditorSection(section.id)}
                    >
                      <FileText className="size-3.5 shrink-0" />
                      <span className="truncate">{section.label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted',
                      activeSection === 'settings' && 'bg-muted font-medium text-foreground',
                    )}
                    onClick={() => scrollToEditorSection('settings')}
                  >
                    <Settings2 className="size-3.5 shrink-0" />
                    문서 설정
                  </button>
                  {!form.saleAgreement ? (
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-muted',
                        activeSection === 'clauses' && 'bg-muted font-medium text-foreground',
                      )}
                      onClick={() => scrollToEditorSection('clauses')}
                    >
                      <BookMarked className="size-3.5 shrink-0" />
                      특약 문구
                    </button>
                  ) : null}
                </div>
                <div className="mt-auto rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-medium">작성 팁</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    왼쪽 섹션을 이동하며 입력하고 오른쪽에서 출력 결과를 바로 확인하세요.
                  </p>
                </div>
              </nav>
              <main className="min-w-0 space-y-4 p-4">
                <section className="rounded-md border border-border/60 bg-background p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold tracking-tight">문서별 입력폼</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        값을 입력한 뒤 출력 미리보기에서 리포트 형태를 확인합니다.
                      </p>
                    </div>
                    <Badge variant="outline">{form.workflow.inputFormName}</Badge>
                  </div>
                </section>

                {clauseArticles ? (
                  <div id="document-editor-content" className="scroll-mt-4">
                    <BaseContractClauseEditor
                      // 문서 전환 시 인라인 컨트롤(금액 draft/날짜 칸)의 로컬 상태 리셋
                      key={`clause:${form.documentId ?? 'new'}`}
                      articles={clauseArticles}
                      fields={form.engineFields}
                      printOptions={form.printOptions}
                      fieldGroups={fieldGroups}
                      onFieldChange={updateEngineField}
                      onPrintOptionsChange={updatePrintOptions}
                    />
                  </div>
                ) : form.saleAgreement && saleAgreementValidation ? (
                  <div id="document-editor-content" className="scroll-mt-4">
                    <ResidentialSaleAgreementEditor
                      agreement={form.saleAgreement}
                      validation={saleAgreementValidation}
                      onChange={updateSaleAgreement}
                    />
                  </div>
                ) : (
                  visibleFieldGroups.map((group, index) => (
                    <div
                      id={`document-editor-group-${index}`}
                      key={`${form.documentId ?? 'new'}:${group.key ?? group.title}`}
                      className="scroll-mt-4"
                    >
                      <DocumentInputFormSection
                        title={group.title}
                        fields={group.fields}
                        values={form.engineFields}
                        onFieldChange={updateEngineField}
                      />
                    </div>
                  ))
                )}

                <section
                  id="document-editor-settings"
                  className="scroll-mt-4 rounded-md border border-border/60 bg-background p-5"
                >
                  <div>
                    <p className="text-sm font-semibold">문서 설정</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      문서 제목, 상태와 보관 정보를 관리합니다.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label>문서 제목</Label>
                      <Input
                        value={form.engineFields.documentTitle ?? ''}
                        onChange={(event) => updateEngineField('documentTitle', event.target.value)}
                        placeholder="비우면 서식명이 사용됩니다"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>문서 상태</Label>
                      <Select
                        value={form.status}
                        onValueChange={(value) =>
                          onFormChange((prev) => ({ ...prev, status: value }))
                        }
                      >
                        <SelectTrigger className="w-full"><SelectValue placeholder="상태 선택" /></SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {Object.entries(documentStatusMeta).map(([key, meta]) => (
                              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>작업 유형</Label>
                      <Select
                        value={form.type}
                        onValueChange={(value) =>
                          onFormChange((prev) => ({ ...prev, type: value }))
                        }
                      >
                        <SelectTrigger className="w-full"><SelectValue placeholder="유형 선택" /></SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="generated">작성</SelectItem>
                            <SelectItem value="uploaded">첨부</SelectItem>
                            <SelectItem value="external">외부 제출</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>파일 URL</Label>
                      <Input
                        value={form.fileUrl}
                        onChange={(event) => onFormChange((prev) => ({ ...prev, fileUrl: event.target.value }))}
                        placeholder="https://...pdf"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>내부 메모</Label>
                      <Textarea
                        rows={3}
                        value={form.memo}
                        onChange={(event) => onFormChange((prev) => ({ ...prev, memo: event.target.value }))}
                      />
                    </div>
                  </div>
                </section>

                {!form.saleAgreement ? (
                  <div id="document-editor-clauses" className="scroll-mt-4">
                    <ClauseTemplateToolsSection
                      contractKind={form.kind}
                      transactionType={form.transactionType}
                      specialTerms={form.engineFields.specialTerms ?? ''}
                      onInsert={(content) =>
                        updateEngineField(
                          'specialTerms',
                          appendContractRichText(form.engineFields.specialTerms, content),
                        )
                      }
                    />
                  </div>
                ) : null}

                {error ? (
                  <p className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </main>

              <aside className="sticky top-0 hidden h-[calc(100vh-132px)] min-w-0 flex-col border-l bg-background lg:flex">
                <div className="flex h-11 shrink-0 items-center gap-5 border-b px-4">
                  <button
                    type="button"
                    className={cn(
                      'h-11 border-b-2 border-transparent text-xs font-medium text-muted-foreground',
                      rightPanel === 'preview' && 'border-foreground text-foreground',
                    )}
                    onClick={() => setRightPanel('preview')}
                  >
                    미리보기
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex h-11 items-center gap-1.5 border-b-2 border-transparent text-xs font-medium text-muted-foreground',
                      rightPanel === 'check' && 'border-foreground text-foreground',
                    )}
                    onClick={() => setRightPanel('check')}
                  >
                    작성 점검
                    {editorValidation && !editorValidation.isReady ? (
                      <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[9px]">
                        {editorValidation.errors.length}
                      </Badge>
                    ) : null}
                  </button>
                </div>
                <ScrollArea className="min-h-0 flex-1 bg-muted/30">
                  {rightPanel === 'preview' ? (
                    <div className="p-4">
                      {clauseArticles ? (
                        <BaseContractClausePreview
                          title={documentTitle}
                          status={documentStatusMeta[form.status]?.label ?? form.status}
                          reportName={form.workflow.reportName}
                          articles={clauseArticles}
                          fields={form.engineFields}
                          printOptions={form.printOptions}
                          fieldGroups={fieldGroups}
                        />
                      ) : form.saleAgreement ? (
                        <ResidentialSaleAgreementPreview
                          agreement={form.saleAgreement}
                          status={documentStatusMeta[form.status]?.label ?? form.status}
                        />
                      ) : (
                        <ContractDocumentPage
                          title={documentTitle}
                          templateCode={form.workflow.reportName}
                          status={documentStatusMeta[form.status]?.label ?? form.status}
                          fields={form.engineFields}
                          sections={sections}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4 p-4">
                      <section className="rounded-lg border bg-background p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <ClipboardCheck className="size-4" />
                            <p className="text-sm font-medium">문서 작성 점검</p>
                          </div>
                          <Badge variant={editorValidation?.isReady === false ? 'destructive' : 'secondary'}>
                            {editorValidation?.isReady === false
                              ? `오류 ${editorValidation.errors.length}건`
                              : '저장 가능'}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          저장 전에 필수 입력과 금액·일정 정합성을 확인합니다.
                        </p>
                      </section>
                      {editorValidation?.errors.map((issue) => (
                        <div key={`${issue.path}-${issue.message}`} className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/[0.035] p-3 text-xs text-destructive">
                          <FileText className="mt-0.5 size-3.5 shrink-0" />
                          <span className="leading-5">{issue.message}</span>
                        </div>
                      ))}
                      {editorValidation?.warnings.map((issue) => (
                        <div key={`${issue.path}-${issue.message}`} className="rounded-lg border bg-background p-3 text-xs leading-5 text-muted-foreground">
                          확인: {issue.message}
                        </div>
                      ))}
                      {!editorValidation || editorValidation.isReady ? (
                        <div className="flex items-start gap-2 rounded-lg border border-success/25 bg-success-soft p-3 text-xs text-success">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                          <span className="leading-5">필수 입력과 문서 정합성 점검을 통과했습니다.</span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </ScrollArea>
              </aside>

            </div>
          </ScrollArea>

          <SheetFooter className="border-t px-6 py-4">
            <div className="flex flex-row justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                닫기
              </Button>
              <Button variant="outline" onClick={() => setIsPreviewOpen(true)}>
                출력 미리보기
              </Button>
              {form.documentId ? (
                <Button
                  variant="outline"
                  onClick={onSaveAsNew}
                  disabled={isSaving || !documentTitle || !form.category}
                >
                  다른 이름으로 저장
                </Button>
              ) : null}
              <Button onClick={onSave} disabled={isSaveDisabled}>
                저장
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none xl:w-[1040px]">
          <div className="border-b px-6 py-5">
            <DialogHeader>
              <DialogTitle>{form.workflow.previewTitle}</DialogTitle>
              <DialogDescription>{form.workflow.reportName}</DialogDescription>
            </DialogHeader>
          </div>
          <ScrollArea className="min-h-0 flex-1 bg-muted/40">
            <div className="p-6">
              {clauseArticles ? (
                // 같은 CLAUSE_LAYOUTS 를 읽기 전용으로 렌더 — 편집면 = 인쇄면
                <BaseContractClausePreview
                  title={documentTitle}
                  status={documentStatusMeta[form.status]?.label ?? form.status}
                  reportName={form.workflow.reportName}
                  articles={clauseArticles}
                  fields={form.engineFields}
                  printOptions={form.printOptions}
                  fieldGroups={fieldGroups}
                />
              ) : form.saleAgreement ? (
                <ResidentialSaleAgreementPreview
                  agreement={form.saleAgreement}
                  status={documentStatusMeta[form.status]?.label ?? form.status}
                />
              ) : (
                <ContractDocumentPage
                  title={documentTitle}
                  templateCode={form.workflow.reportName}
                  status={documentStatusMeta[form.status]?.label ?? form.status}
                  fields={form.engineFields}
                  sections={sections}
                />
              )}
            </div>
          </ScrollArea>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
              닫기
            </Button>
            <Button onClick={() => window.print()}>
              <Printer data-icon="inline-start" />
              인쇄
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 특약/조항 도구 (레거시 특약 가져오기/등록 대응).
 * 사무소 ContractClauseTemplate(special_terms_clause)을 특약사항에 삽입하고,
 * 현재 특약을 템플릿으로 등록한다.
 */
function ClauseTemplateToolsSection({
  contractKind,
  transactionType,
  specialTerms,
  onInsert,
}: {
  contractKind: string | null;
  transactionType: string;
  specialTerms: string;
  onInsert: (content: string) => void;
}) {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState('');

  const { data: clauseTemplates = [], isLoading } = useQuery({
    queryKey: ['contract-clause-templates', 'special_terms_clause'],
    queryFn: () => api.contracts.clauseTemplates({ type: 'special_terms_clause' }),
  });

  // 현재 서식(kind)/거래유형과 맞는 템플릿을 앞에 정렬 (무관 템플릿도 뒤에 노출)
  const sortedTemplates = useMemo(() => {
    function rank(template: ContractClauseTemplate) {
      const kindMatch =
        !template.contractKind || template.contractKind === contractKind;
      const typeMatch =
        template.transactionTypes.length === 0 ||
        (transactionType !== '' &&
          template.transactionTypes.includes(transactionType));
      return (kindMatch ? 0 : 2) + (typeMatch ? 0 : 1);
    }

    return [...clauseTemplates].sort(
      (left, right) => rank(left) - rank(right) || left.sortOrder - right.sortOrder,
    );
  }, [clauseTemplates, contractKind, transactionType]);

  // 템플릿 content 는 plain text 로 저장 (HTML 특약은 텍스트 추출) —
  // 계약 정보 탭 특약 카드 등 다른 소비처와의 호환 유지
  const specialTermsPlainText = contractRichTextToPlainText(specialTerms).trim();

  const registerMutation = useMutation({
    mutationFn: () =>
      api.contracts.createClauseTemplate({
        type: 'special_terms_clause',
        contractKind: contractKind ?? null,
        transactionTypes: transactionType ? [transactionType] : [],
        title: newTitle.trim(),
        content: specialTermsPlainText,
      }),
    onSuccess: () => {
      toast.success('특약 템플릿을 등록했습니다.');
      setNewTitle('');
      queryClient.invalidateQueries({ queryKey: ['contract-clause-templates'] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : '특약 템플릿을 등록하지 못했습니다.',
      );
    },
  });

  return (
    <section className="rounded-md border border-border/60 bg-background p-4">
      <p className="text-sm font-medium">특약 문구</p>
      <p className="mt-1 text-xs text-muted-foreground">
        사무소 특약 템플릿을 특약사항에 삽입하거나, 현재 특약을 템플릿으로 등록합니다.
      </p>
      <div className="mt-3 space-y-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              <BookMarked className="size-3.5" />
              특약 가져오기
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-2" align="end">
            {isLoading ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">불러오는 중...</p>
            ) : sortedTemplates.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                등록된 특약 템플릿이 없습니다.
              </p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {sortedTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
                    onClick={() => onInsert(template.content)}
                  >
                    <span className="block text-sm font-medium">{template.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {template.content}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
        <div className="flex gap-2">
          <Input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="템플릿 이름"
            className="h-8"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={
              !newTitle.trim() || !specialTermsPlainText || registerMutation.isPending
            }
            onClick={() => registerMutation.mutate()}
          >
            등록
          </Button>
        </div>
      </div>
    </section>
  );
}

function DocumentInputFormSection({
  title,
  fields,
  values,
  onFieldChange,
}: {
  title: string;
  fields: ContractDocumentEngineFieldDefinition[];
  values: ContractDocumentEngineFields;
  onFieldChange: (
    key: string,
    value: string,
    field?: ContractDocumentEngineFieldDefinition,
  ) => void;
}) {
  return (
    <section className="rounded-md border border-border/60 bg-background p-5">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <div
            key={field.key}
            className={
              field.multiline || field.inputType === 'textarea'
                ? 'md:col-span-2 xl:col-span-3'
                : ''
            }
          >
            <DocumentEngineFieldControl
              field={field}
              value={values[field.key] ?? ''}
              onChange={(value) => onFieldChange(field.key, value, field)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/** 만원 단위 정수 파싱 — 숫자가 아니거나 음수/소수면 null */
function parseManwonInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  if (!Number.isInteger(parsed) || parsed < 0 || !Number.isSafeInteger(parsed)) {
    return null;
  }
  return parsed;
}

/** 엔진이 라벨에 붙인 단위 접미("매매대금 (만원)")를 입력 접미와 중복되지 않게 제거 */
function stripUnitSuffix(label: string, unit: string | undefined): string {
  if (!unit) return label;
  const suffix = ` (${unit})`;
  return label.endsWith(suffix) ? label.slice(0, -suffix.length) : label;
}

/**
 * 서식 필드 타입별 입력 컨트롤 (template.metadata fieldGroups 의 inputType 구동).
 * - amount: 만원 숫자 입력 + 만/천/원 단위 토글 + 실시간 한글 병기 미리보기
 * - number: 숫자 입력 (+unit 접미)
 * - date: 날짜 입력 + N개월 편의 버튼 / select / checkbox / textarea / text
 * - specialTerms: rich text (레거시 Rider_Part HTML) — TipTap 에디터
 * checkbox 는 엔진 필드가 전부 string 이므로 'true'/'' 관례를 따른다.
 */
function DocumentEngineFieldControl({
  field,
  value,
  onChange,
}: {
  field: ContractDocumentEngineFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputType = field.inputType ?? (field.multiline ? 'textarea' : 'text');

  if (inputType === 'checkbox') {
    return (
      <div className="flex h-full min-h-9 items-center gap-2 pt-5">
        <Checkbox
          id={`engine-field-${field.key}`}
          checked={value === 'true'}
          onCheckedChange={(checked) => onChange(checked === true ? 'true' : '')}
        />
        <Label htmlFor={`engine-field-${field.key}`} className="cursor-pointer">
          {field.label}
        </Label>
      </div>
    );
  }

  if (inputType === 'select') {
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <Select value={value || undefined} onValueChange={(next) => onChange(next)}>
          <SelectTrigger className="w-full">
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
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <Input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {/* 날짜 편의 버튼 — 레거시 인도일 +1/+2/+3월 대응 (기준: 입력값, 없으면 오늘) */}
        <div className="flex gap-1">
          {[1, 2, 3].map((months) => (
            <Button
              key={months}
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                const base = parseDateInputValue(value) ?? new Date();
                onChange(toDateInputValue(addMonthsToDate(base, months)));
              }}
            >
              +{months}개월
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (inputType === 'amount') {
    return <AmountEngineFieldControl field={field} value={value} onChange={onChange} />;
  }

  if (inputType === 'number') {
    return (
      <div className="space-y-2">
        <Label>{stripUnitSuffix(field.label, field.unit)}</Label>
        <div className="relative">
          <Input
            inputMode="numeric"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={field.unit ? 'pr-14' : undefined}
          />
          {field.unit ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {field.unit}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  // 특약사항은 rich text (레거시 Rider_Part HTML) — TipTap 에디터로 편집
  if (field.key === 'specialTerms') {
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <RichTextEditor value={value} onChange={onChange} />
      </div>
    );
  }

  if (inputType === 'textarea' || field.multiline) {
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <Textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

type AmountInputUnit = 'man' | 'cheon' | 'won';

const AMOUNT_UNIT_LABELS: Record<AmountInputUnit, string> = {
  man: '만원',
  cheon: '천원',
  won: '원',
};

/** 선택 단위 입력값 → 만원 정수 (만원 정수로 환산 불가/소수/음수는 null) */
function parseUnitToManwon(raw: string, unit: AmountInputUnit): number | null {
  const digits = raw.trim().replace(/,/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const parsed = Number(digits);
  if (!Number.isSafeInteger(parsed)) return null;
  if (unit === 'man') return parsed;
  const divisor = unit === 'cheon' ? 10 : 10000;
  return parsed % divisor === 0 ? parsed / divisor : null;
}

/** 저장값(만원 정수) → 선택 단위 표시 문자열 */
function formatManwonInUnit(manwon: number, unit: AmountInputUnit): string {
  if (unit === 'man') return String(manwon);
  return String(manwon * (unit === 'cheon' ? 10 : 10000));
}

/**
 * 금액 입력 컨트롤 — 만/천/원 단위 토글 (레거시 Cost_Unit 라디오 대응).
 * 저장값은 항상 만원 단위 정수 문자열이며, 토글은 입력 해석/표시만 바꾼다.
 */
function AmountEngineFieldControl({
  field,
  value,
  onChange,
}: {
  field: ContractDocumentEngineFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  const [unit, setUnit] = useState<AmountInputUnit>('man');
  const [draft, setDraft] = useState<string | null>(null);

  const manwon = parseManwonInt(value);
  const displayValue =
    draft ?? (manwon !== null ? formatManwonInUnit(manwon, unit) : value);
  const isDraftInvalid =
    draft !== null && draft.trim() !== '' && parseUnitToManwon(draft, unit) === null;

  function handleChange(raw: string) {
    setDraft(raw);
    if (!raw.trim()) {
      onChange('');
      return;
    }
    const parsed = parseUnitToManwon(raw, unit);
    onChange(parsed !== null ? String(parsed) : '');
  }

  function handleUnitChange(next: AmountInputUnit) {
    setUnit(next);
    setDraft(null); // 저장값(만원) 기준으로 표시 재계산
  }

  return (
    <div className="space-y-2">
      <Label>{stripUnitSuffix(field.label, field.unit)}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            inputMode="numeric"
            value={displayValue}
            onChange={(event) => handleChange(event.target.value)}
            className="pr-11"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {AMOUNT_UNIT_LABELS[unit]}
          </span>
        </div>
        <Select
          value={unit}
          onValueChange={(next) => handleUnitChange(next as AmountInputUnit)}
        >
          <SelectTrigger className="w-20 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(AMOUNT_UNIT_LABELS) as AmountInputUnit[]).map((option) => (
              <SelectItem key={option} value={option}>
                {AMOUNT_UNIT_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {manwon !== null && manwon > 0 ? (
        <p className="text-xs text-muted-foreground">
          {formatContractAmountWithWon(manwon)}
        </p>
      ) : isDraftInvalid || (draft === null && value.trim()) ? (
        <p className="text-xs text-destructive">
          만원 단위 정수로 환산되는 금액을 입력해주세요.
        </p>
      ) : null}
    </div>
  );
}

function ContractDocumentPage({
  title,
  templateCode,
  status,
  fields,
  sections,
}: {
  title: string;
  templateCode: string;
  status: string;
  fields: ContractDocumentEngineFields;
  sections: ReturnType<typeof getContractDocumentEngineSections>;
}) {
  return (
    <div className="mx-auto min-h-[1123px] w-full max-w-[794px] border border-slate-200 bg-white px-14 py-12 text-slate-950 shadow-sm print:shadow-none">
      <div className="flex items-start justify-between gap-4 text-[11px] text-slate-500">
        <span>{templateCode || 'contract-document'}</span>
        <span>{status}</span>
      </div>

      <header className="mt-10 text-center">
        <h2 className="text-2xl font-semibold tracking-normal">{title}</h2>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          본 문서는 계약 정보와 문서별 입력값을 기준으로 작성되었습니다.
        </p>
      </header>

      <div className="mt-10 rounded-md border border-slate-300">
        <DocumentPreviewRow label="작성일" value={fields.writtenDate} />
        <DocumentPreviewRow label="거래유형" value={fields.transactionTypeText} />
        <DocumentPreviewRow label="대상물" value={fields.propertyLabel} />
      </div>

      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.title} className="break-inside-avoid">
            <h3 className="border-b border-slate-900 pb-2 text-sm font-semibold">
              {section.title}
            </h3>
            <div className="mt-3 rounded-md border border-slate-300">
              {section.rows.map((row, rowIndex) => (
                <DocumentPreviewRow
                  // 당사자 반복 행은 라벨이 중복될 수 있어 index 를 key 에 포함
                  key={`${section.title}-${rowIndex}-${row.label}`}
                  label={row.label}
                  value={row.value}
                  multiline={row.multiline}
                  html={row.html}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-14 grid gap-6 text-sm sm:grid-cols-2">
        <SignatureBlock role={fields.partyOneRole} name={fields.partyOneName} />
        <SignatureBlock role={fields.partyTwoRole} name={fields.partyTwoName} />
      </div>
    </div>
  );
}

function DocumentPreviewRow({
  label,
  value,
  multiline,
  html,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  /** value 가 특약 rich text HTML — DOMPurify 새니타이즈 후 HTML 렌더 */
  html?: boolean;
}) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] border-b border-slate-200 last:border-b-0">
      <div className="bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">{label}</div>
      {html ? (
        <div
          className={cn(
            'min-h-9 px-3 py-2 text-sm leading-6',
            CONTRACT_RICH_TEXT_VIEW_CLASS,
          )}
          // 반드시 새니타이즈를 거친다 — 특약 HTML XSS 방어
          dangerouslySetInnerHTML={{ __html: sanitizeContractHtml(value) }}
        />
      ) : (
        <div
          className={cn(
            'min-h-9 px-3 py-2 text-sm leading-6',
            multiline ? 'whitespace-pre-wrap' : 'truncate',
          )}
        >
          {value || ' '}
        </div>
      )}
    </div>
  );
}

function SignatureBlock({ role, name }: { role: string; name: string }) {
  return (
    <div className="rounded-md border border-slate-300 p-4">
      <p className="text-xs text-slate-500">{role}</p>
      <div className="mt-6 flex items-end justify-between gap-3">
        <span className="text-base font-medium">{name || ' '}</span>
        <span className="text-sm text-slate-500">(인)</span>
      </div>
    </div>
  );
}
