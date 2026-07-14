/**
 * 특약 및 메모 카드 — 특약 템플릿(clause-templates) 삽입/저장/삭제 연동.
 * 특약사항은 rich text HTML (레거시 Rider_Part) — TipTap 에디터로 편집하고,
 * 템플릿 content 는 plain text 로 저장해 다른 소비처와의 호환을 유지한다.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, ListPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  appendContractRichText,
  contractRichTextToPlainText,
} from '@estate-erp/shared';
import type { ContractClauseTemplate } from '@estate-erp/api-client';
import type { ContractForm } from './-contract-shared';
import { api } from '@/lib/api';
import { RichTextEditor } from '@/components/rich-text-editor';
import { ConfirmDialog } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

const CLAUSE_TEMPLATE_TYPE = 'special_terms_clause';

export function SpecialTermsCard({
  form,
  onFormChange,
  transactionType,
}: {
  form: ContractForm;
  onFormChange: (updater: (prev: ContractForm) => ContractForm) => void;
  transactionType: string;
}) {
  const queryClient = useQueryClient();
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ContractClauseTemplate | null>(null);

  const templatesQuery = useQuery({
    queryKey: ['contract-clause-templates'],
    queryFn: () => api.contracts.clauseTemplates({ type: CLAUSE_TEMPLATE_TYPE }),
  });

  const templates = templatesQuery.data ?? [];
  const matchingTemplates = templates.filter(
    (template) =>
      template.transactionTypes.length === 0 ||
      template.transactionTypes.includes(transactionType),
  );

  // 템플릿 content 는 plain text 로 저장 (HTML 특약은 텍스트 추출) —
  // 목록 미리보기·에디터 등 다른 소비처와의 호환 유지
  const specialTermsPlainText = contractRichTextToPlainText(form.specialTerms).trim();

  const createMutation = useMutation({
    mutationFn: () =>
      api.contracts.createClauseTemplate({
        type: CLAUSE_TEMPLATE_TYPE,
        title: newTitle.trim(),
        content: specialTermsPlainText,
        transactionTypes: [transactionType],
      }),
    onSuccess: () => {
      toast.success('특약 템플릿을 저장했습니다.');
      setNewTitle('');
      queryClient.invalidateQueries({ queryKey: ['contract-clause-templates'] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : '특약 템플릿을 저장하지 못했습니다.',
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) =>
      api.contracts.deleteClauseTemplate(templateId),
    onSuccess: () => {
      toast.success('특약 템플릿을 삭제했습니다.');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['contract-clause-templates'] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : '특약 템플릿을 삭제하지 못했습니다.',
      );
    },
  });

  function insertTemplate(template: ContractClauseTemplate) {
    // 특약은 rich text — 템플릿(plain text)을 문단 HTML 로 이어붙임
    onFormChange((prev) => ({
      ...prev,
      specialTerms: appendContractRichText(prev.specialTerms, template.content),
    }));
    toast.success(`'${template.title}' 특약을 삽입했습니다.`);
  }

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="text-base">특약 및 메모</CardTitle>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <ListPlus className="size-3.5" />
                  특약 템플릿 삽입
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 w-72 overflow-y-auto">
                <DropdownMenuLabel>특약 템플릿</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {templatesQuery.isLoading ? (
                  <DropdownMenuItem disabled>불러오는 중...</DropdownMenuItem>
                ) : matchingTemplates.length === 0 ? (
                  <DropdownMenuItem disabled>
                    저장된 특약 템플릿이 없습니다.
                  </DropdownMenuItem>
                ) : (
                  matchingTemplates.map((template) => (
                    <DropdownMenuItem
                      key={template.id}
                      onSelect={() => insertTemplate(template)}
                    >
                      <span className="truncate">{template.title}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => setIsManagerOpen(true)}>
              <BookmarkPlus className="size-3.5" />
              템플릿 관리
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 px-5">
        <div className="space-y-2">
          <Label>특약사항</Label>
          <RichTextEditor
            value={form.specialTerms}
            onChange={(html) =>
              onFormChange((prev) => ({ ...prev, specialTerms: html }))
            }
            placeholder="특약사항을 입력하세요"
          />
        </div>
        <div className="space-y-2">
          <Label>내부 메모</Label>
          <Textarea
            rows={4}
            value={form.memo}
            onChange={(event) =>
              onFormChange((prev) => ({ ...prev, memo: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>기타 첨부 URL</Label>
          <Textarea
            rows={4}
            value={form.attachmentsText}
            onChange={(event) =>
              onFormChange((prev) => ({ ...prev, attachmentsText: event.target.value }))
            }
            placeholder="https://...pdf"
          />
        </div>
      </CardContent>

      <Dialog open={isManagerOpen} onOpenChange={setIsManagerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>특약 템플릿 관리</DialogTitle>
            <DialogDescription>
              자주 쓰는 특약 문구를 저장해두고 계약서 작성 시 바로 삽입합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>현재 특약을 새 템플릿으로 저장</Label>
              <div className="flex gap-2">
                <Input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="템플릿 이름 (예: 전세 기본 특약)"
                />
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={
                    createMutation.isPending ||
                    !newTitle.trim() ||
                    !specialTermsPlainText
                  }
                >
                  저장
                </Button>
              </div>
              {!specialTermsPlainText ? (
                <p className="text-xs text-muted-foreground">
                  특약사항 입력란에 내용을 작성한 뒤 저장할 수 있습니다.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>저장된 템플릿 ({templates.length})</Label>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {templatesQuery.isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : templates.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
                    저장된 특약 템플릿이 없습니다.
                  </p>
                ) : (
                  templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{template.title}</p>
                        <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                          {template.content}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => insertTemplate(template)}
                        >
                          삽입
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(template)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManagerOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteTarget(null);
        }}
        title="특약 템플릿 삭제"
        description={
          deleteTarget ? `'${deleteTarget.title}' 템플릿을 삭제합니다.` : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </Card>
  );
}
