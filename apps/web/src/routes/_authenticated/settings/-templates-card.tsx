/**
 * 계약서 템플릿 관리 카드 — 특약 템플릿(clause-templates) + 인쇄 서식(print-templates) CRUD.
 * 계약 페이지(-special-terms-card.tsx)와 동일한 queryKey 프리픽스를 invalidate해 양쪽 동기화.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Pencil, Plus, Printer, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ContractClauseTemplate,
  OfficePrintTemplate,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { ConfirmDialog, EmptyState } from '@/components/domain';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const CLAUSE_TYPE_LABELS: Record<string, string> = {
  special_terms_clause: '특약사항',
  contract_clause: '계약 조항',
  confirmation_clause: '확인설명 문구',
  office_notice: '사무소 안내',
};

const PRINT_TYPE_LABELS: Record<string, string> = {
  contract_cover: '계약서 표지',
  receipt: '영수증',
  ledger_print: '거래장부 출력',
  settlement: '정산서',
  office_notice: '사무소 안내문',
};

const TX_TYPE_OPTIONS = [
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly', label: '월세' },
];

const txTypeLabel = (value: string) =>
  TX_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;

export function ContractTemplatesCard({ canEdit }: { canEdit: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" />
          계약서 템플릿
        </CardTitle>
        <CardDescription>
          계약서 작성 시 불러오는 특약 문구와 인쇄 서식을 사무소 단위로 관리합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="clause">
          <TabsList>
            <TabsTrigger value="clause">특약 템플릿</TabsTrigger>
            <TabsTrigger value="print">인쇄 서식</TabsTrigger>
          </TabsList>
          <TabsContent value="clause" className="mt-3">
            <ClauseTemplateSection canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="print" className="mt-3">
            <PrintTemplateSection canEdit={canEdit} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 공통 소품
// ============================================================

function TxTypeChips({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (tx: string) => {
    onChange(
      value.includes(tx) ? value.filter((item) => item !== tx) : [...value, tx],
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TX_TYPE_OPTIONS.map((option) => {
        const active = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => toggle(option.value)}
            className={
              active
                ? 'rounded-full border border-primary bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary'
                : 'rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted'
            }
          >
            {option.label}
          </button>
        );
      })}
      <span className="text-[11px] text-muted-foreground">
        {value.length === 0 ? '미선택 시 전체 거래유형에 적용' : null}
      </span>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

function ListError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border/60 px-3 py-4">
      <p className="text-sm text-muted-foreground">목록을 불러오지 못했습니다.</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RotateCw className="size-3.5" />
        다시 시도
      </Button>
    </div>
  );
}

// ============================================================
// 특약 템플릿
// ============================================================

type ClauseFormState = {
  type: string;
  title: string;
  content: string;
  transactionTypes: string[];
};

const EMPTY_CLAUSE_FORM: ClauseFormState = {
  type: 'special_terms_clause',
  title: '',
  content: '',
  transactionTypes: [],
};

function ClauseTemplateSection({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContractClauseTemplate | null>(null);
  const [form, setForm] = useState<ClauseFormState>(EMPTY_CLAUSE_FORM);
  const [deleteTarget, setDeleteTarget] = useState<ContractClauseTemplate | null>(
    null,
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contract-clause-templates', 'all'],
    queryFn: () => api.contracts.clauseTemplates(),
  });

  const invalidate = () => {
    // 계약 페이지(['contract-clause-templates'])까지 프리픽스로 함께 갱신
    queryClient.invalidateQueries({ queryKey: ['contract-clause-templates'] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const dto = {
        type: form.type,
        title: form.title.trim(),
        content: form.content.trim(),
        transactionTypes: form.transactionTypes,
      };
      return editing
        ? api.contracts.updateClauseTemplate(editing.id, dto)
        : api.contracts.createClauseTemplate(dto);
    },
    onSuccess: () => {
      toast.success(
        editing ? '특약 템플릿을 수정했습니다.' : '특약 템플릿을 등록했습니다.',
      );
      setDialogOpen(false);
      invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : '특약 템플릿 저장에 실패했습니다.',
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) =>
      api.contracts.deleteClauseTemplate(templateId),
    onSuccess: () => {
      toast.success('특약 템플릿을 삭제했습니다.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : '특약 템플릿 삭제에 실패했습니다.',
      ),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_CLAUSE_FORM);
    setDialogOpen(true);
  };

  const openEdit = (template: ContractClauseTemplate) => {
    setEditing(template);
    setForm({
      type: template.type,
      title: template.title,
      content: template.content,
      transactionTypes: template.transactionTypes,
    });
    setDialogOpen(true);
  };

  const templates = data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          계약서 작성 화면의 특약 입력에서 바로 불러올 수 있습니다.
        </p>
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="size-3.5" />
            특약 추가
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ListError onRetry={() => refetch()} />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="등록된 특약 템플릿이 없습니다"
          description="자주 쓰는 특약 문구를 등록하면 계약서 작성 시 한 번에 삽입할 수 있습니다."
          action={
            canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-3.5" />
                특약 추가
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{template.title}</p>
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {CLAUSE_TYPE_LABELS[template.type] ?? template.type}
                  </Badge>
                  {template.transactionTypes.length > 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      {template.transactionTypes.map(txTypeLabel).join(' · ')}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">전체 거래유형</span>
                  )}
                </div>
                <p className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                  {template.content}
                </p>
              </div>
              {canEdit ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => openEdit(template)}
                    aria-label="특약 수정"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive"
                    onClick={() => setDeleteTarget(template)}
                    aria-label="특약 삭제"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? '특약 템플릿 수정' : '특약 템플릿 추가'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  제목 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="예: 반려동물 금지 특약"
                />
              </div>
              <div className="space-y-2">
                <Label>구분</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CLAUSE_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>
                내용 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={form.content}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, content: event.target.value }))
                }
                rows={5}
                placeholder="계약서에 삽입할 특약 문구를 입력하세요."
              />
            </div>
            <div className="space-y-2">
              <Label>적용 거래유형</Label>
              <TxTypeChips
                value={form.transactionTypes}
                onChange={(next) =>
                  setForm((prev) => ({ ...prev, transactionTypes: next }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending ||
                !form.title.trim() ||
                !form.content.trim()
              }
            >
              {saveMutation.isPending ? '저장 중…' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="특약 템플릿 삭제"
        description={
          deleteTarget
            ? `'${deleteTarget.title}' 템플릿을 삭제합니다. 이미 작성된 계약서에는 영향이 없습니다.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

// ============================================================
// 인쇄 서식
// ============================================================

type PrintFormState = {
  type: string;
  title: string;
  transactionTypes: string[];
  isDefault: boolean;
  isActive: boolean;
};

const EMPTY_PRINT_FORM: PrintFormState = {
  type: 'contract_cover',
  title: '',
  transactionTypes: [],
  isDefault: false,
  isActive: true,
};

function PrintTemplateSection({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OfficePrintTemplate | null>(null);
  const [form, setForm] = useState<PrintFormState>(EMPTY_PRINT_FORM);
  const [deleteTarget, setDeleteTarget] = useState<OfficePrintTemplate | null>(
    null,
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['office-print-templates'],
    queryFn: () => api.contracts.printTemplates(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['office-print-templates'] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const dto = {
        type: form.type,
        title: form.title.trim(),
        transactionTypes: form.transactionTypes,
        isDefault: form.isDefault,
        isActive: form.isActive,
      };
      return editing
        ? api.contracts.updatePrintTemplate(editing.id, dto)
        : api.contracts.createPrintTemplate(dto);
    },
    onSuccess: () => {
      toast.success(
        editing ? '인쇄 서식을 수정했습니다.' : '인쇄 서식을 등록했습니다.',
      );
      setDialogOpen(false);
      invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : '인쇄 서식 저장에 실패했습니다.',
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) =>
      api.contracts.deletePrintTemplate(templateId),
    onSuccess: () => {
      toast.success('인쇄 서식을 삭제했습니다.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : '인쇄 서식 삭제에 실패했습니다.',
      ),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_PRINT_FORM);
    setDialogOpen(true);
  };

  const openEdit = (template: OfficePrintTemplate) => {
    setEditing(template);
    setForm({
      type: template.type,
      title: template.title,
      transactionTypes: template.transactionTypes,
      isDefault: template.isDefault,
      isActive: template.isActive,
    });
    setDialogOpen(true);
  };

  const templates = data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          계약서 표지·영수증·정산서 등 인쇄물의 기본 서식을 지정합니다.
        </p>
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="size-3.5" />
            서식 추가
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ListError onRetry={() => refetch()} />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={Printer}
          title="등록된 인쇄 서식이 없습니다"
          description="서식을 등록하면 계약서 출력 시 기본값으로 사용됩니다."
          action={
            canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-3.5" />
                서식 추가
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{template.title}</p>
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {PRINT_TYPE_LABELS[template.type] ?? template.type}
                  </Badge>
                  {template.isDefault ? (
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      기본 서식
                    </Badge>
                  ) : null}
                  {!template.isActive ? (
                    <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                      비활성
                    </Badge>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {template.transactionTypes.length > 0
                    ? template.transactionTypes.map(txTypeLabel).join(' · ')
                    : '전체 거래유형'}
                </p>
              </div>
              {canEdit ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => openEdit(template)}
                    aria-label="서식 수정"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive"
                    onClick={() => setDeleteTarget(template)}
                    aria-label="서식 삭제"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? '인쇄 서식 수정' : '인쇄 서식 추가'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  서식 이름 <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="예: 기본 계약서 표지"
                />
              </div>
              <div className="space-y-2">
                <Label>서식 종류</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRINT_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>적용 거래유형</Label>
              <TxTypeChips
                value={form.transactionTypes}
                onChange={(next) =>
                  setForm((prev) => ({ ...prev, transactionTypes: next }))
                }
              />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.isDefault}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isDefault: checked }))
                  }
                />
                기본 서식으로 사용
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, isActive: checked }))
                  }
                />
                활성
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.title.trim()}
            >
              {saveMutation.isPending ? '저장 중…' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="인쇄 서식 삭제"
        description={
          deleteTarget ? `'${deleteTarget.title}' 서식을 삭제합니다.` : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
