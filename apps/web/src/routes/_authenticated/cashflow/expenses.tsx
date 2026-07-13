import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CirclePlus, Pencil, Power, Receipt, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { OfficeExpenseTemplate } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { ConfirmDialog, EmptyState, PageHeader } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { RequireRole } from '@/components/layout/require-role';

export const Route = createFileRoute('/_authenticated/cashflow/expenses')({
  component: () => (
    <RequireRole roles={['owner', 'manager']} fallback="/cashflow/my-settlement">
      <ExpensesPage />
    </RequireRole>
  ),
});

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'rent', label: '임대료' },
  { value: 'ad', label: '광고비' },
  { value: 'telecom', label: '통신비' },
  { value: 'insurance', label: '보험료' },
  { value: 'association', label: '협회비' },
  { value: 'supplies', label: '소모품' },
  { value: 'vehicle', label: '차량/교통' },
  { value: 'other', label: '기타' },
];

const FREQUENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'monthly', label: '매월' },
  { value: 'quarterly', label: '분기' },
  { value: 'yearly', label: '연간' },
];

const categoryLabel = (v: string) =>
  CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? v;
const frequencyLabel = (v: string) =>
  FREQUENCY_OPTIONS.find((o) => o.value === v)?.label ?? v;

function monthlyAmount(t: OfficeExpenseTemplate): number {
  if (t.frequency === 'quarterly') return Math.round(t.amount / 3);
  if (t.frequency === 'yearly') return Math.round(t.amount / 12);
  return t.amount;
}

function ExpensesPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['office-expenses'],
    queryFn: () => api.finance.expenses.list(),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OfficeExpenseTemplate | null>(null);
  const [deleting, setDeleting] = useState<OfficeExpenseTemplate | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['office-expenses'] });
    qc.invalidateQueries({ queryKey: ['cashflow'] });
  };

  const toggleActive = useMutation({
    mutationFn: (t: OfficeExpenseTemplate) =>
      api.finance.expenses.update(t.id, { isActive: !t.isActive }),
    onSuccess: (_data, t) => {
      toast.success(
        t.isActive ? '고정비를 비활성화했습니다.' : '고정비를 활성화했습니다.',
      );
      invalidate();
    },
    onError: () => toast.error('상태 변경에 실패했습니다.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.finance.expenses.remove(id),
    onSuccess: () => {
      toast.success('고정비를 삭제했습니다.');
      invalidate();
      setDeleting(null);
    },
    onError: () => toast.error('삭제에 실패했습니다.'),
  });

  const monthlyTotal =
    data?.reduce(
      (sum, t) => (t.isActive ? sum + monthlyAmount(t) : sum),
      0,
    ) ?? 0;
  const activeCount = data?.filter((t) => t.isActive).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="고정비 설정"
        description="사무소 운영 고정비를 한번 등록하면 매월 캐시플로우 순이익에 자동 반영됩니다."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <CirclePlus className="size-4" />
            고정비 등록
          </Button>
        }
      />

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-md bg-muted/50 p-4">
        <div>
          <span className="text-sm text-muted-foreground">월 고정비 합계 </span>
          <span className="text-lg font-bold tabular-nums">
            {monthlyTotal > 0 ? `${formatMoney(monthlyTotal)}원` : '0원'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          활성 {activeCount}건 · 분기/연간 항목은 월 환산으로 합산
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={Receipt}
          title="고정비 목록을 불러오지 못했습니다"
          description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
          action={
            <Button variant="outline" onClick={() => refetch()}>
              <RotateCw className="size-4" />
              다시 시도
            </Button>
          }
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="등록된 고정비가 없습니다"
          description="임대료, 광고비 등 사무소 고정비를 등록하면 순이익이 자동 계산됩니다."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <CirclePlus className="size-4" />
              고정비 등록
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {data.map((expense) => (
            <Card
              key={expense.id}
              className={expense.isActive ? 'py-0' : 'py-0 opacity-60'}
            >
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{expense.title}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {categoryLabel(expense.category)}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {frequencyLabel(expense.frequency)}
                    </Badge>
                    {expense.taxDeductible && (
                      <Badge variant="secondary" className="text-[10px]">
                        공제 가능
                      </Badge>
                    )}
                    {!expense.isActive && (
                      <Badge variant="destructive" className="text-[10px]">
                        비활성
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {expense.dayOfMonth ? `매월 ${expense.dayOfMonth}일 결제` : '결제일 미지정'}
                    {expense.frequency !== 'monthly' &&
                      ` · 월 환산 ${formatMoney(monthlyAmount(expense))}`}
                    {expense.note && ` · ${expense.note}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatMoney(expense.amount)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-8 p-0"
                      title="수정"
                      onClick={() => {
                        setEditing(expense);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-8 p-0"
                      title={expense.isActive ? '비활성화' : '활성화'}
                      disabled={toggleActive.isPending}
                      onClick={() => toggleActive.mutate(expense)}
                    >
                      <Power className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-8 p-0 text-destructive hover:text-destructive"
                      title="삭제"
                      onClick={() => setDeleting(expense)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditing(null);
        }}
        editing={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="고정비 삭제"
        description={
          deleting
            ? `"${deleting.title}" 항목을 삭제합니다. 삭제하면 순이익 계산에서 제외됩니다.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </div>
  );
}

function ExpenseFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: OfficeExpenseTemplate | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!editing;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('rent');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('');
  const [taxDeductible, setTaxDeductible] = useState(false);
  const [note, setNote] = useState('');

  // 다이얼로그가 열릴 때 편집 대상 값으로 초기화
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const initKey = open ? (editing?.id ?? 'new') : null;
  if (initKey !== initializedFor) {
    setInitializedFor(initKey);
    if (initKey !== null) {
      setTitle(editing?.title ?? '');
      setCategory(editing?.category ?? 'rent');
      setAmount(editing ? String(editing.amount) : '');
      setFrequency(editing?.frequency ?? 'monthly');
      setDayOfMonth(editing?.dayOfMonth ? String(editing.dayOfMonth) : '');
      setTaxDeductible(editing?.taxDeductible ?? false);
      setNote(editing?.note ?? '');
    }
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: title.trim(),
        category,
        amount: Number(amount),
        frequency,
        dayOfMonth: dayOfMonth ? Number(dayOfMonth) : undefined,
        taxDeductible,
        note: note.trim() || undefined,
      };
      return isEdit
        ? api.finance.expenses.update(editing.id, payload)
        : api.finance.expenses.create(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? '고정비를 수정했습니다.' : '고정비를 등록했습니다.');
      qc.invalidateQueries({ queryKey: ['office-expenses'] });
      qc.invalidateQueries({ queryKey: ['cashflow'] });
      onOpenChange(false);
    },
    onError: () =>
      toast.error(isEdit ? '수정에 실패했습니다.' : '등록에 실패했습니다.'),
  });

  const valid = title.trim().length > 0 && Number(amount) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? '고정비 수정' : '고정비 등록'}</DialogTitle>
          <DialogDescription>
            분기/연간 항목은 월 환산 금액으로 순이익 계산에 반영됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>
              항목명 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예) 사무실 임대료"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>분류</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>주기</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>
                금액 (만원) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="예) 250"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>결제일 (선택)</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                placeholder="예) 25"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={taxDeductible}
              onChange={(e) => setTaxDeductible(e.target.checked)}
              className="size-3.5 cursor-pointer rounded border-muted-foreground/30"
            />
            세금 공제 가능 항목
          </label>
          <div className="grid gap-1.5">
            <Label>메모 (선택)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예) 2층 사무실, 보증금 별도"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            취소
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? '저장 중…' : isEdit ? '수정 저장' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
