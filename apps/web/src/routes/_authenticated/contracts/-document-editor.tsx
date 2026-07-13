/**
 * 계약 문서 편집기 — 마이스파이더 서식 코드 매핑 기반 입력폼 + 출력 미리보기 + 인쇄.
 */
import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { FileText, Printer } from 'lucide-react';
import type { Contract, ContractDocument, ContractDocumentTemplate } from '@estate-erp/api-client';
import {
  validateResidentialSaleAgreement,
  type ResidentialSaleAgreementDraft,
} from '@estate-erp/shared';
import {
  buildContractDocumentEngineDraft,
  buildResidentialSaleAgreement,
  getContractDocumentEngineFieldGroups,
  getContractDocumentEngineSections,
  type ContractDocumentEngineFieldDefinition,
  type ContractDocumentEngineFields,
  type ContractDocumentEngineWorkflow,
} from './-document-engine';
import {
  ResidentialSaleAgreementEditor,
  ResidentialSaleAgreementPreview,
} from './-residential-sale-editor';
import { SummaryRow, documentCategoryLabels, documentStatusMeta } from './-contract-shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  saleAgreement: ResidentialSaleAgreementDraft | null;
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
    saleAgreement: null,
  };
}

export function toDocumentEditorForm(
  contract: Contract,
  template: ContractDocumentTemplate,
  document?: ContractDocument,
): DocumentEditorForm {
  const draft = buildContractDocumentEngineDraft({
    contract,
    template,
    document,
  });

  return {
    documentId: document?.id,
    templateId: template.id,
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
    engineFields: draft.fields,
    saleAgreement: buildResidentialSaleAgreement(contract, template, document),
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

export function DocumentEditorSheet({
  open,
  form,
  error,
  isSaving,
  onOpenChange,
  onFormChange,
  onSave,
}: {
  open: boolean;
  form: DocumentEditorForm;
  error: string | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: Dispatch<SetStateAction<DocumentEditorForm>>;
  onSave: () => void;
}) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const fieldGroups = getContractDocumentEngineFieldGroups(form.category);
  const sections = getContractDocumentEngineSections(form.category, form.engineFields);
  const documentTitle = form.engineFields.documentTitle || form.title || '계약 문서';
  const saleAgreementValidation = form.saleAgreement
    ? validateResidentialSaleAgreement(form.saleAgreement)
    : null;

  // Ctrl/Cmd+S 저장, Ctrl/Cmd+P 미리보기 (PRD 키보드 단축키)
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === 's') {
        event.preventDefault();
        onSave();
      }
      if (event.key === 'p') {
        event.preventDefault();
        setIsPreviewOpen(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onSave]);

  function updateEngineField(key: string, value: string) {
    onFormChange((prev) => ({
      ...prev,
      engineFields: {
        ...prev.engineFields,
        [key]: value,
      },
    }));
  }

  function updateSaleAgreement(
    updater: (agreement: ResidentialSaleAgreementDraft) => ResidentialSaleAgreementDraft,
  ) {
    onFormChange((prev) => ({
      ...prev,
      saleAgreement: prev.saleAgreement ? updater(prev.saleAgreement) : null,
    }));
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-[calc(100vw-24px)] gap-0 overflow-hidden p-0 sm:max-w-none xl:w-[calc(100vw-64px)]"
        >
          <SheetHeader className="border-b px-6 py-5">
            <div className="flex items-start justify-between gap-6 pr-8">
              <div className="space-y-1">
                <SheetTitle>{form.workflow.formTitle}</SheetTitle>
                <SheetDescription>
                  {form.workflow.inputFormName} · {form.workflow.reportName}
                </SheetDescription>
              </div>
              <Badge className={cn('border-0', documentStatusMeta[form.status]?.className)}>
                {documentStatusMeta[form.status]?.label ?? form.status}
              </Badge>
            </div>
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="grid min-h-full gap-5 bg-muted/40 p-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
              <main className="min-w-0 space-y-4">
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

                {form.saleAgreement && saleAgreementValidation ? (
                  <ResidentialSaleAgreementEditor
                    agreement={form.saleAgreement}
                    validation={saleAgreementValidation}
                    onChange={updateSaleAgreement}
                  />
                ) : (
                  fieldGroups.map((group) => (
                    <DocumentInputFormSection
                      key={group.title}
                      title={group.title}
                      fields={group.fields}
                      values={form.engineFields}
                      onFieldChange={updateEngineField}
                    />
                  ))
                )}
              </main>

              <aside className="space-y-4">
                <section className="rounded-md border border-border/60 bg-background p-4">
                  <p className="text-sm font-medium">출력 리포트</p>
                  <div className="mt-3 space-y-2">
                    <SummaryRow label="입력폼" value={form.workflow.inputFormName} />
                    <SummaryRow label="리포트" value={form.workflow.reportName} />
                    <SummaryRow
                      label="분류"
                      value={documentCategoryLabels[form.category] ?? form.category}
                    />
                    <SummaryRow
                      label="상태"
                      value={documentStatusMeta[form.status]?.label ?? form.status}
                    />
                  </div>
                  <Button
                    type="button"
                    className="mt-4 w-full"
                    onClick={() => setIsPreviewOpen(true)}
                  >
                    <FileText data-icon="inline-start" />
                    출력 미리보기
                  </Button>
                </section>

                {saleAgreementValidation ? (
                  <section className="rounded-md border border-border/60 bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">작성 점검</p>
                      <Badge
                        variant={
                          saleAgreementValidation.isReadyForGeneration ? 'secondary' : 'destructive'
                        }
                      >
                        {saleAgreementValidation.isReadyForGeneration
                          ? '출력 준비'
                          : `오류 ${saleAgreementValidation.errors.length}건`}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {saleAgreementValidation.errors.map((issue) => (
                        <p
                          key={`${issue.path}-${issue.message}`}
                          className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
                        >
                          {issue.message}
                        </p>
                      ))}
                      {saleAgreementValidation.warnings.map((issue) => (
                        <p
                          key={`${issue.path}-${issue.message}`}
                          className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
                        >
                          확인: {issue.message}
                        </p>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="rounded-md border border-border/60 bg-background p-4">
                  <p className="text-sm font-medium">문서 설정</p>
                  <div className="mt-4 grid gap-4">
                    <div className="space-y-2">
                      <Label>문서 상태</Label>
                      <Select
                        value={form.status}
                        onValueChange={(value) =>
                          onFormChange((prev) => ({ ...prev, status: value }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="상태 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {Object.entries(documentStatusMeta).map(([key, meta]) => (
                              <SelectItem key={key} value={key}>
                                {meta.label}
                              </SelectItem>
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
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="유형 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="generated">작성</SelectItem>
                            <SelectItem value="uploaded">첨부</SelectItem>
                            <SelectItem value="external">외부 제출</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>파일 URL</Label>
                      <Input
                        value={form.fileUrl}
                        onChange={(event) =>
                          onFormChange((prev) => ({
                            ...prev,
                            fileUrl: event.target.value,
                          }))
                        }
                        placeholder="https://...pdf"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>내부 메모</Label>
                      <Textarea
                        rows={4}
                        value={form.memo}
                        onChange={(event) =>
                          onFormChange((prev) => ({
                            ...prev,
                            memo: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </section>

                {error ? (
                  <p className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
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
              <Button onClick={onSave} disabled={isSaving || !documentTitle || !form.category}>
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
              {form.saleAgreement ? (
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

function DocumentInputFormSection({
  title,
  fields,
  values,
  onFieldChange,
}: {
  title: string;
  fields: ContractDocumentEngineFieldDefinition[];
  values: ContractDocumentEngineFields;
  onFieldChange: (key: string, value: string) => void;
}) {
  return (
    <section className="rounded-md border border-border/60 bg-background p-5">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <div key={field.key} className={field.multiline ? 'md:col-span-2 xl:col-span-3' : ''}>
            <DocumentEngineFieldControl
              field={field}
              value={values[field.key] ?? ''}
              onChange={(value) => onFieldChange(field.key, value)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function DocumentEngineFieldControl({
  field,
  value,
  onChange,
}: {
  field: ContractDocumentEngineFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      {field.multiline ? (
        <Textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
      )}
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
              {section.rows.map((row) => (
                <DocumentPreviewRow
                  key={`${section.title}-${row.label}`}
                  label={row.label}
                  value={row.value}
                  multiline={row.multiline}
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
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] border-b border-slate-200 last:border-b-0">
      <div className="bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">{label}</div>
      <div
        className={cn(
          'min-h-9 px-3 py-2 text-sm leading-6',
          multiline ? 'whitespace-pre-wrap' : 'truncate',
        )}
      >
        {value || ' '}
      </div>
    </div>
  );
}

function SignatureBlock({ role, name }: { role: string; name: string }) {
  return (
    <div className="rounded-md border border-slate-300 p-4">
      <p className="text-xs text-slate-500">{role}</p>
      <div className="mt-6 flex items-end justify-between gap-3">
        <span className="text-base font-medium">{name || ' '}</span>
        <span className="text-sm text-slate-500">(인)</span>
      </div>
    </div>
  );
}
