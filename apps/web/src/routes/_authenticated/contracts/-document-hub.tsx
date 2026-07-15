/**
 * 계약 문서 허브 — 계약 단위의 문서 준비 상태를 먼저 보여주고,
 * 특정 문서를 선택하면 분할 문서 편집기로 전환한다.
 */
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileCheck2,
  FilePenLine,
  FileText,
  Trash2,
} from 'lucide-react';
import type {
  Contract,
  ContractDocument,
  ContractDocumentTemplate,
} from '@estate-erp/api-client';
import {
  documentCategoryLabels,
  documentStatusMeta,
  findDocumentByTemplate,
  resolveDocumentTemplate,
  sortContractDocuments,
} from './-contract-shared';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatDday, formatMoney } from '@/lib/format';
import { PipelineSteps } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type DocumentRow = {
  template: ContractDocumentTemplate;
  document?: ContractDocument;
};

export function DocumentHub({
  contract,
  templates,
  isLoading,
  reportDeadline,
  onOpenDocument,
  onCopyDocument,
  isCopyingDocument,
  onDeleteDocument,
  isDeletingDocument,
}: {
  contract: Contract;
  templates: ContractDocumentTemplate[];
  isLoading: boolean;
  reportDeadline: Date | null;
  onOpenDocument: (
    template: ContractDocumentTemplate,
    document?: ContractDocument,
  ) => void;
  onCopyDocument: (documentId: string) => void;
  isCopyingDocument: boolean;
  onDeleteDocument: (documentId: string) => void;
  isDeletingDocument: boolean;
}) {
  const documents = sortContractDocuments(contract.documents ?? []).filter(
    (document) => document.status !== 'cancelled',
  );
  const rows: DocumentRow[] = templates.map((template) => ({
    template,
    document: findDocumentByTemplate(documents, template.id),
  }));
  const requiredRows = rows.filter(({ template }) => template.isRequired);
  const optionalRows = rows.filter(({ template }) => !template.isRequired);
  const representedDocumentIds = new Set(
    rows.flatMap(({ document }) => (document ? [document.id] : [])),
  );
  const additionalDocuments = documents.filter(
    (document) => !representedDocumentIds.has(document.id),
  );
  const requiredCompleted = requiredRows.filter(({ document }) => !!document).length;
  const optionalCompleted = optionalRows.filter(({ document }) => !!document).length;
  const pendingReportRow = rows.find(
    ({ template, document }) => template.category === 'report' && !document?.submittedAt,
  );
  const nextRequiredRow = requiredRows.find(({ document }) => !document);
  const nextRow = pendingReportRow ?? nextRequiredRow;
  const missingCount = contract.missingDocumentCount ?? Math.max(0, requiredRows.length - requiredCompleted);

  return (
    <div className="space-y-5">
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(420px,1.35fr)_minmax(420px,1fr)] lg:items-center">
          <div className="min-w-0 border-b pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
            <PipelineSteps
              kind="contractStatus"
              current={contract.status}
              cancelled={contract.status === 'cancelled'}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DocumentMetric label="전체 문서" value={`${documents.length}건`} />
            <DocumentMetric label="필수 문서" value={`${requiredCompleted}/${requiredRows.length}`} />
            <DocumentMetric label="선택 문서" value={`${optionalCompleted}/${optionalRows.length}`} />
            <DocumentMetric
              label="미작성 필수"
              value={`${missingCount}건`}
              tone={missingCount > 0 ? 'danger' : 'success'}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <DocumentRowsTable
            title="필수 문서"
            completed={requiredCompleted}
            rows={requiredRows}
            emptyText={isLoading ? '문서 템플릿을 불러오는 중입니다.' : '필수 문서가 없습니다.'}
            reportDeadline={reportDeadline}
            onOpenDocument={onOpenDocument}
            onCopyDocument={onCopyDocument}
            isCopyingDocument={isCopyingDocument}
            onDeleteDocument={onDeleteDocument}
            isDeletingDocument={isDeletingDocument}
          />
          <DocumentRowsTable
            title="선택 문서"
            completed={optionalCompleted}
            rows={optionalRows}
            emptyText={isLoading ? '문서 템플릿을 불러오는 중입니다.' : '선택 문서가 없습니다.'}
            reportDeadline={reportDeadline}
            onOpenDocument={onOpenDocument}
            onCopyDocument={onCopyDocument}
            isCopyingDocument={isCopyingDocument}
            onDeleteDocument={onDeleteDocument}
            isDeletingDocument={isDeletingDocument}
          />
          {additionalDocuments.length > 0 ? (
            <AdditionalDocumentTable
              documents={additionalDocuments}
              templates={templates}
              onOpenDocument={onOpenDocument}
              onCopyDocument={onCopyDocument}
              isCopyingDocument={isCopyingDocument}
              onDeleteDocument={onDeleteDocument}
              isDeletingDocument={isDeletingDocument}
            />
          ) : null}
          <div
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm',
              missingCount > 0
                ? 'border-warning/30 bg-warning-soft text-warning-foreground'
                : 'border-success/30 bg-success-soft text-success',
            )}
          >
            {missingCount > 0 ? (
              <AlertTriangle className="size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0" />
            )}
            {missingCount > 0
              ? `필수 문서 ${missingCount}건을 작성하면 계약 문서가 준비됩니다.`
              : '필수 문서가 모두 준비되었습니다. 제출·신고 상태를 최종 확인해주세요.'}
          </div>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-0">
          {pendingReportRow && reportDeadline ? (
            <Card className="gap-3 border-destructive/30 bg-destructive/[0.025] py-4 shadow-none">
              <CardHeader className="gap-3 px-4">
                <div className="flex items-center justify-between gap-3 text-destructive">
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <AlertTriangle className="size-4" /> 긴급 신고 필요
                  </span>
                  <Badge variant="destructive">{formatDday(reportDeadline)}</Badge>
                </div>
                <CardTitle className="text-base">{pendingReportRow.template.title}</CardTitle>
                <p className="text-xs leading-5 text-muted-foreground">
                  계약일 기준 30일 이내 신고가 필요합니다.
                </p>
                <p className="text-xs font-semibold text-destructive">
                  신고 마감일 {formatDate(reportDeadline)} ({formatDday(reportDeadline)})
                </p>
              </CardHeader>
            </Card>
          ) : null}

          <Card className="gap-3 py-4 shadow-none">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">다음 할 일</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4">
              {nextRow ? (
                <>
                  <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <FilePenLine className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{nextRow.template.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {nextRow.document ? '문서를 확인하고 제출 상태를 완료하세요.' : '누락된 필수 문서를 작성하세요.'}
                      </p>
                    </div>
                  </div>
                  <Button className="w-full" onClick={() => onOpenDocument(nextRow.template, nextRow.document)}>
                    {nextRow.document ? '문서 확인' : '작성하기'}
                  </Button>
                </>
              ) : (
                <div className="flex items-start gap-3 text-success">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                  <p className="text-sm leading-5">지금 처리할 누락 문서가 없습니다.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="gap-3 py-4 shadow-none">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">계약 정보</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 px-4 text-xs">
              <ContractFact label="계약일" value={formatDate(contract.contractDate)} />
              <ContractFact label="잔금일" value={contract.statedBalanceDate ? formatDate(contract.statedBalanceDate) : '—'} />
              <ContractFact label="거래금액" value={formatMoney(contract.totalPrice)} />
              <ContractFact
                label="매도인 / 매수인"
                value={`${contract.sellerContact?.name ?? '—'} / ${contract.buyerContact?.name ?? '—'}`}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function DocumentMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'danger' | 'success';
}) {
  return (
    <div className="min-w-0 border-r border-border/60 px-3 text-center last:border-r-0">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-lg font-semibold tabular-nums tracking-tight',
          tone === 'danger' && 'text-destructive',
          tone === 'success' && 'text-success',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ContractFact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-40 truncate text-right font-medium">{value}</span>
    </>
  );
}

function DocumentRowsTable({
  title,
  completed,
  rows,
  emptyText,
  reportDeadline,
  onOpenDocument,
  onCopyDocument,
  isCopyingDocument,
  onDeleteDocument,
  isDeletingDocument,
}: {
  title: string;
  completed: number;
  rows: DocumentRow[];
  emptyText: string;
  reportDeadline: Date | null;
  onOpenDocument: (template: ContractDocumentTemplate, document?: ContractDocument) => void;
  onCopyDocument: (documentId: string) => void;
  isCopyingDocument: boolean;
  onDeleteDocument: (documentId: string) => void;
  isDeletingDocument: boolean;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <Badge variant="secondary" className="font-normal tabular-nums">
          {completed} / {rows.length}
        </Badge>
      </div>
      <div className="overflow-hidden rounded-lg border bg-background">
        <div className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead>문서명</TableHead>
                <TableHead className="w-40">상태</TableHead>
                <TableHead className="w-36">최종 업데이트</TableHead>
                <TableHead className="w-40 text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ template, document }) => {
                const isReport = template.category === 'report';
                const isReportPending = isReport && !document?.submittedAt;
                return (
                  <TableRow key={template.id} className="h-[68px]">
                    <TableCell className="whitespace-normal">
                      <div className="flex min-w-0 items-center gap-3">
                        {document ? (
                          <FileCheck2 className="size-5 shrink-0 text-success" />
                        ) : isReportPending ? (
                          <AlertTriangle className="size-5 shrink-0 text-destructive" />
                        ) : (
                          <FileText className="size-5 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{template.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {documentCategoryLabels[template.category] ?? template.category}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          className={cn(
                            'border-0',
                            document
                              ? documentStatusMeta[document.status]?.className
                              : isReportPending
                                ? 'bg-destructive-soft text-destructive'
                                : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {document
                            ? documentStatusMeta[document.status]?.label ?? document.status
                            : isReportPending
                              ? '미작성 · 긴급'
                              : '미작성'}
                        </Badge>
                        {isReport && reportDeadline ? (
                          document?.submittedAt ? (
                            <span className="text-[11px] text-muted-foreground">제출 {formatDate(document.submittedAt)}</span>
                          ) : (
                            <span className="text-[11px] font-medium text-destructive">{formatDday(reportDeadline)}</span>
                          )
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {document ? formatDateTime(document.updatedAt) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant={document ? 'outline' : 'default'}
                          onClick={() => onOpenDocument(template, document)}
                        >
                          <FilePenLine className="size-3.5" />
                          {document ? '수정' : '작성'}
                        </Button>
                        {document ? (
                          <>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`${document.title} 사본 만들기`}
                              disabled={isCopyingDocument}
                              onClick={() => onCopyDocument(document.id)}
                            >
                              <Copy className="size-3.5" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`${document.title} 삭제`}
                              className="text-destructive hover:text-destructive"
                              disabled={isDeletingDocument}
                              onClick={() => onDeleteDocument(document.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                    {emptyText}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}

function AdditionalDocumentTable({
  documents,
  templates,
  onOpenDocument,
  onCopyDocument,
  isCopyingDocument,
  onDeleteDocument,
  isDeletingDocument,
}: {
  documents: ContractDocument[];
  templates: ContractDocumentTemplate[];
  onOpenDocument: (template: ContractDocumentTemplate, document?: ContractDocument) => void;
  onCopyDocument: (documentId: string) => void;
  isCopyingDocument: boolean;
  onDeleteDocument: (documentId: string) => void;
  isDeletingDocument: boolean;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold tracking-tight">추가 문서</h3>
        <Badge variant="secondary" className="font-normal">{documents.length}</Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {documents.map((document) => (
          <Card key={document.id} className="gap-3 py-4 shadow-none">
            <CardContent className="flex items-center gap-3 px-4">
              <FileCheck2 className="size-5 shrink-0 text-success" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{document.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {document.kindOrder > 1 ? `${document.kindOrder}부 · ` : ''}{formatDateTime(document.updatedAt)}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label={`${document.title} 수정`} onClick={() => onOpenDocument(resolveDocumentTemplate(document, templates), document)}>
                <FilePenLine className="size-3.5" />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`${document.title} 사본 만들기`} disabled={isCopyingDocument} onClick={() => onCopyDocument(document.id)}>
                <Copy className="size-3.5" />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`${document.title} 삭제`} className="text-destructive hover:text-destructive" disabled={isDeletingDocument} onClick={() => onDeleteDocument(document.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
