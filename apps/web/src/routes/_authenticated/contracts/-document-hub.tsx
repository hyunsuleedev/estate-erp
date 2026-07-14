/**
 * 문서 허브 — 작성된 문서 목록(sortOrder→kindOrder 정렬, 동일 서식 'N부' 표시,
 * 수정/사본/삭제 액션) + 거래유형별 필수/선택 문서 체크리스트 + 거래신고(report)
 * D-day 표시.
 */
import {
  ClipboardList,
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
import { formatDate, formatDday } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
  const documents = sortContractDocuments(contract.documents ?? []);
  const rows = templates.map((template) => ({
    template,
    document: findDocumentByTemplate(contract.documents ?? [], template.id),
  }));
  const requiredRows = rows.filter(({ template }) => template.isRequired);
  const optionalRows = rows.filter(({ template }) => !template.isRequired);

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="size-4" />
              문서 허브
            </CardTitle>
            <CardDescription>
              필수 문서 {requiredRows.length}건 · 누락 {contract.missingDocumentCount ?? 0}건
            </CardDescription>
          </div>
          <Badge variant={(contract.missingDocumentCount ?? 0) > 0 ? 'outline' : 'secondary'}>
            {(contract.missingDocumentCount ?? 0) > 0 ? '확인 필요' : '준비 완료'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 px-5">
        <ContractDocumentListTable
          documents={documents}
          templates={templates}
          onOpenDocument={onOpenDocument}
          onCopyDocument={onCopyDocument}
          isCopyingDocument={isCopyingDocument}
          onDeleteDocument={onDeleteDocument}
          isDeletingDocument={isDeletingDocument}
        />
        <DocumentRowsTable
          title="필수 문서"
          rows={requiredRows}
          emptyText={isLoading ? '문서 템플릿을 불러오는 중입니다.' : '필수 문서가 없습니다.'}
          reportDeadline={reportDeadline}
          onOpenDocument={onOpenDocument}
        />
        <DocumentRowsTable
          title="선택 문서"
          rows={optionalRows}
          emptyText={isLoading ? '문서 템플릿을 불러오는 중입니다.' : '선택 문서가 없습니다.'}
          reportDeadline={reportDeadline}
          onOpenDocument={onOpenDocument}
        />
      </CardContent>
    </Card>
  );
}

/**
 * 작성된 문서 목록 — sortOrder(묶음 내 탭 순서) → kindOrder(동일 서식 반복 순번)
 * 정렬 표시. "사본"은 같은 서식의 다음 kindOrder 를 자동 부여한다 (위임장 2장 케이스).
 */
function ContractDocumentListTable({
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
  onOpenDocument: (
    template: ContractDocumentTemplate,
    document?: ContractDocument,
  ) => void;
  onCopyDocument: (documentId: string) => void;
  isCopyingDocument: boolean;
  onDeleteDocument: (documentId: string) => void;
  isDeletingDocument: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">작성된 문서</p>
        <span className="text-xs text-muted-foreground">{documents.length}건</span>
      </div>
      <div className="overflow-hidden rounded-md border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">순서</TableHead>
              <TableHead>문서</TableHead>
              <TableHead className="w-24">분류</TableHead>
              <TableHead className="w-24">상태</TableHead>
              <TableHead className="w-52 text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((document) => (
              <TableRow key={document.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {document.sortOrder + 1}
                  {document.kindOrder > 1 ? ` · ${document.kindOrder}부` : ''}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-5">
                      {document.title}
                      {document.kindOrder > 1 ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({document.kindOrder})
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {document.kind ?? document.template?.code ?? '-'}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">
                    {documentCategoryLabels[document.category] ?? document.category}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn('border-0', documentStatusMeta[document.status]?.className)}
                  >
                    {documentStatusMeta[document.status]?.label ?? document.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onOpenDocument(resolveDocumentTemplate(document, templates), document)
                      }
                    >
                      <FilePenLine className="size-3.5" />
                      수정
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isCopyingDocument}
                      onClick={() => onCopyDocument(document.id)}
                    >
                      <Copy className="size-3.5" />
                      사본
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive/80"
                      disabled={isDeletingDocument}
                      onClick={() => onDeleteDocument(document.id)}
                    >
                      <Trash2 className="size-3.5" />
                      삭제
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                  아직 작성된 문서가 없습니다. 아래 서식 목록에서 작성하세요.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DocumentRowsTable({
  title,
  rows,
  emptyText,
  reportDeadline,
  onOpenDocument,
}: {
  title: string;
  rows: Array<{
    template: ContractDocumentTemplate;
    document?: ContractDocument;
  }>;
  emptyText: string;
  reportDeadline: Date | null;
  onOpenDocument: (
    template: ContractDocumentTemplate,
    document?: ContractDocument,
  ) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <span className="text-xs text-muted-foreground">{rows.length}건</span>
      </div>
      <div className="overflow-hidden rounded-md border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>문서</TableHead>
              <TableHead className="w-32">상태</TableHead>
              <TableHead className="w-20 text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ template, document }) => {
              const isReport = template.category === 'report';
              const isReportPending = isReport && !document?.submittedAt;

              return (
                <TableRow key={template.id}>
                  <TableCell className="whitespace-normal">
                    <div className="flex min-w-0 items-start gap-2">
                      {document ? (
                        <FileCheck2 className="mt-0.5 size-4 shrink-0 text-success" />
                      ) : (
                        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-5">{template.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {template.code}
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
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {document
                          ? documentStatusMeta[document.status]?.label ?? document.status
                          : '대기'}
                      </Badge>
                      {isReport && reportDeadline ? (
                        isReportPending ? (
                          <Badge className="border-0 bg-destructive-soft text-destructive">
                            신고 {formatDday(reportDeadline)}
                          </Badge>
                        ) : document?.submittedAt ? (
                          <span className="text-xs text-muted-foreground">
                            제출 {formatDate(document.submittedAt)}
                          </span>
                        ) : null
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={document ? 'outline' : 'default'}
                      onClick={() => onOpenDocument(template, document)}
                    >
                      <FilePenLine className="size-3.5" />
                      {document ? '수정' : '작성'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-20 text-center text-sm text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
