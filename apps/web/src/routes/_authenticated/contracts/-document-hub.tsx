/**
 * 문서 허브 — 거래유형별 필수/선택 문서 체크리스트 + 거래신고(report) D-day 표시.
 */
import {
  ClipboardList,
  FileCheck2,
  FilePenLine,
  FileText,
} from 'lucide-react';
import type {
  Contract,
  ContractDocument,
  ContractDocumentTemplate,
} from '@estate-erp/api-client';
import { documentStatusMeta, findDocumentByTemplate } from './-contract-shared';
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
}: {
  contract: Contract;
  templates: ContractDocumentTemplate[];
  isLoading: boolean;
  reportDeadline: Date | null;
  onOpenDocument: (
    template: ContractDocumentTemplate,
    document?: ContractDocument,
  ) => void;
}) {
  const documents = contract.documents ?? [];
  const rows = templates.map((template) => ({
    template,
    document: findDocumentByTemplate(documents, template.id),
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
