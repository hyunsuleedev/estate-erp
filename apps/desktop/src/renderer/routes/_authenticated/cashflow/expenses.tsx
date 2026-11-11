/**
 * 고정비 설정. 왼쪽 표에서 항목을 관리하고, 오른쪽에서 분류별 금액과 이번 달 결제 일정을 본다.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  EllipsisVertical,
  Pencil,
  Plus,
  Receipt,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { OfficeExpenseTemplate } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { ConfirmDialog, EmptyState } from '@/components/domain';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  ToolbarPillSearch,
  ToolbarPillTabs,
} from '@/routes/_authenticated/properties/-components/property-toolbar';
import {
  CashflowError,
  CashflowFooter,
  CashflowLoading,
  CashflowPage,
  CashflowToolbar,
  ManagerOnly,
  PaneHeader,
  SortHead,
  SummaryStat,
  SummaryStrip,
} from './-cashflow-ui';
import { monthlyExpenseAmount } from './-cashflow-utils';

export const Route = createFileRoute('/_authenticated/cashflow/expenses')({
  component: ExpensesRoute,
});

function ExpensesRoute() {
  return (
    <ManagerOnly title="고정비 설정">
      <ExpensesPage />
    </ManagerOnly>
  );
}

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

type Tab = 'all' | 'on' | 'off';
type SortKey = 'amount' | 'day';

function ExpensesPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['office-expenses'],
    queryFn: () => api.finance.expenses.list(),
  });

  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'amount',
    dir: 'desc',
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
        t.isActive
          ? `${t.title}을 껐습니다. 순이익 계산에서 빠집니다.`
          : `${t.title}을 사용합니다.`,
      );
      invalidate();
    },
    onError: () => toast.error('상태를 바꾸지 못했습니다.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.finance.expenses.remove(id),
    onSuccess: () => {
      toast.success('고정비를 삭제했습니다.');
      invalidate();
      setDeleting(null);
    },
    onError: () => toast.error('삭제하지 못했습니다.'),
  });

  const currentMonth = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  };
  const cashflow = useQuery({
    queryKey: ['cashflow', currentMonth.year, currentMonth.month],
    queryFn: () =>
      api.finance.cashflow.summary(currentMonth.year, currentMonth.month),
  });
  const net = cashflow.data?.monthlyTrend.at(-1)?.net ?? 0;

  const all = useMemo(() => data ?? [], [data]);
  const active = useMemo(() => all.filter((e) => e.isActive), [all]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const direction = sort.dir === 'asc' ? 1 : -1;
    return all
      .filter((e) => {
        if (tab === 'on' && !e.isActive) return false;
        if (tab === 'off' && e.isActive) return false;
        if (!query) return true;
        return [e.title, categoryLabel(e.category), e.note]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) =>
        sort.key === 'day'
          ? ((a.dayOfMonth ?? 99) - (b.dayOfMonth ?? 99)) * direction
          : (monthlyExpenseAmount(a) - monthlyExpenseAmount(b)) * direction,
      );
  }, [all, tab, search, sort]);

  const monthlyOf = (list: OfficeExpenseTemplate[]) =>
    list.reduce((sum, e) => sum + monthlyExpenseAmount(e), 0);
  const everyMonth = active.filter((e) => e.frequency === 'monthly');
  const periodic = active.filter((e) => e.frequency !== 'monthly');
  const deductible = active.filter((e) => e.taxDeductible);
  const visibleActiveTotal = monthlyOf(visible.filter((e) => e.isActive));

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <CashflowPage title="고정비 설정">
      <CashflowToolbar label="고정비 범위와 검색" withLine>
        <ToolbarPillTabs
          ariaLabel="사용 여부"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: '전체', count: all.length },
            { value: 'on', label: '사용 중', count: active.length },
            { value: 'off', label: '꺼짐', count: all.length - active.length },
          ]}
        />
        <div className="max-w-[460px] min-w-[150px] flex-1">
          <ToolbarPillSearch
            value={search}
            onChange={setSearch}
            placeholder="항목, 분류, 메모"
            ariaLabel="고정비 검색"
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="ml-auto h-[30px] shrink-0 rounded-full px-3.5"
          onClick={openCreate}
        >
          <Plus className="size-3.5" />
          고정비 등록
        </Button>
      </CashflowToolbar>

      <SummaryStrip>
        <SummaryStat
          label="월 고정비"
          value={formatMoney(monthlyOf(active))}
          hint={`사용 중 ${active.length}건을 월로 환산`}
        />
        <SummaryStat
          label="매월 나가는 돈"
          value={formatMoney(monthlyOf(everyMonth))}
          hint={`${everyMonth.length}건`}
        />
        <SummaryStat
          label="분기·연간 월 환산"
          value={formatMoney(monthlyOf(periodic))}
          hint={`${periodic.length}건`}
        />
        <SummaryStat
          label="세금 공제 가능"
          value={formatMoney(monthlyOf(deductible))}
          hint={`월 환산 ${deductible.length}건`}
        />
        <SummaryStat
          label={`${currentMonth.month}월 순이익`}
          value={formatMoney(net)}
          valueClassName={net < 0 ? 'text-destructive-strong' : undefined}
          hint={
            <Link
              to="/cashflow"
              className="underline decoration-[#d8d6d0] underline-offset-2 hover:decoration-current"
            >
              수금 − 월 고정비
            </Link>
          }
        />
      </SummaryStrip>

      {isLoading ? (
        <CashflowLoading />
      ) : isError ? (
        <CashflowError
          icon={Receipt}
          title="고정비 목록을 불러오지 못했습니다"
          onRetry={() => refetch()}
        />
      ) : (
        <div className="cf-expense-layout flex min-h-0 flex-1 flex-col">
          <div className="cf-expense-grid grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_296px]">
            <div className="min-w-0 overflow-auto">
              {visible.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title={
                    all.length === 0
                      ? '등록된 고정비가 없습니다'
                      : '조건에 맞는 고정비가 없습니다'
                  }
                  description={
                    all.length === 0
                      ? '임대료, 광고비 같은 고정비를 등록하면 순이익이 자동으로 계산됩니다.'
                      : '범위나 검색어를 바꿔 보세요.'
                  }
                  action={
                    all.length === 0 ? (
                      <Button onClick={openCreate}>
                        <Plus className="size-4" />
                        고정비 등록
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <table
                  className="cf-table"
                  style={{ '--cf-table-min': '716px' } as React.CSSProperties}
                >
                  <colgroup>
                    <col style={{ minWidth: 150 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 56 }} />
                    <col style={{ width: 76 }} />
                    <col style={{ width: 72 }} />
                    <col style={{ width: 66 }} />
                    <col style={{ width: 48 }} />
                    <col />
                    <col style={{ width: 54 }} />
                    <col style={{ width: 34 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>항목</th>
                      <th>분류</th>
                      <th>주기</th>
                      <th className="cf-num">금액</th>
                      <SortHead
                        sortKey="amount"
                        active={sort.key}
                        direction={sort.dir}
                        align="right"
                        onSort={(key) =>
                          setSort((c) =>
                            c.key === key
                              ? { key, dir: c.dir === 'asc' ? 'desc' : 'asc' }
                              : { key, dir: 'desc' },
                          )
                        }
                      >
                        월 환산
                      </SortHead>
                      <SortHead
                        sortKey="day"
                        active={sort.key}
                        direction={sort.dir}
                        onSort={(key) =>
                          setSort((c) =>
                            c.key === key
                              ? { key, dir: c.dir === 'asc' ? 'desc' : 'asc' }
                              : { key, dir: 'asc' },
                          )
                        }
                      >
                        결제일
                      </SortHead>
                      <th>공제</th>
                      <th>메모</th>
                      <th className="text-center">사용</th>
                      <th>
                        <span className="sr-only">작업</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((expense) => {
                      const off = !expense.isActive;
                      const faded = off ? 'text-[#a5a39f]' : 'text-muted-foreground';
                      return (
                        <tr
                          key={expense.id}
                          data-clickable
                          onClick={() => {
                            setEditing(expense);
                            setFormOpen(true);
                          }}
                        >
                          <td
                            className={cn('font-medium', off && 'text-[#a5a39f]')}
                            title={expense.title}
                          >
                            {expense.title}
                          </td>
                          <td className={faded}>{categoryLabel(expense.category)}</td>
                          <td className={faded}>{frequencyLabel(expense.frequency)}</td>
                          <td className={cn('cf-num', off && 'text-[#a5a39f]')}>
                            {formatMoney(expense.amount)}
                          </td>
                          <td
                            className={cn(
                              'cf-num',
                              off
                                ? 'text-[#a5a39f]'
                                : expense.frequency === 'monthly' &&
                                    'text-muted-foreground',
                            )}
                          >
                            {formatMoney(monthlyExpenseAmount(expense))}
                          </td>
                          <td className={cn('tabular-nums', off && 'text-[#a5a39f]')}>
                            {expense.dayOfMonth ? (
                              `${expense.dayOfMonth}일`
                            ) : (
                              <span className="text-[#a5a39f]">—</span>
                            )}
                          </td>
                          <td className={cn(off && 'text-[#a5a39f]')}>
                            {expense.taxDeductible ? (
                              '가능'
                            ) : (
                              <span className="text-[#a5a39f]">—</span>
                            )}
                          </td>
                          <td className={faded} title={expense.note ?? undefined}>
                            {expense.note}
                          </td>
                          <td
                            className="text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Switch
                              size="sm"
                              aria-label={`${expense.title} 사용`}
                              checked={expense.isActive}
                              disabled={toggleActive.isPending}
                              onCheckedChange={() => toggleActive.mutate(expense)}
                            />
                          </td>
                          <td
                            className="!px-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="size-[26px] text-muted-foreground"
                                  aria-label={`${expense.title} 더보기`}
                                >
                                  <EllipsisVertical className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setEditing(expense);
                                    setFormOpen(true);
                                  }}
                                >
                                  <Pencil className="size-3.5" />
                                  수정
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => setDeleting(expense)}
                                >
                                  <Trash2 className="size-3.5" />
                                  삭제
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="[&_td]:sticky [&_td]:bottom-0 [&_td]:z-[4] [&_td]:h-9 [&_td]:border-t [&_td]:border-b-0 [&_td]:border-t-[#d8d6d0] [&_td]:bg-[#f7f7f5] [&_td]:font-semibold">
                      <td colSpan={4}>
                        월 고정비 합계{' '}
                        <span className="font-normal text-muted-foreground">
                          사용 중만
                        </span>
                      </td>
                      <td className="cf-num">{formatMoney(visibleActiveTotal)}</td>
                      <td colSpan={5} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
            <aside
              aria-label="고정비 요약"
              className="cf-expense-side min-w-0 overflow-y-auto border-l border-border"
            >
              <CategoryBreakdown active={active} />
              <PaymentSchedule active={active} />
            </aside>
          </div>
          <CashflowFooter>고정비 {visible.length}건 표시</CashflowFooter>
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
            ? `"${deleting.title}" 항목을 삭제합니다. 삭제하면 순이익 계산에서 빠집니다. 잠시 빼려면 사용 스위치를 끄세요.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </CashflowPage>
  );
}

function CategoryBreakdown({ active }: { active: OfficeExpenseTemplate[] }) {
  const total = active.reduce((sum, e) => sum + monthlyExpenseAmount(e), 0);
  const rows = Object.entries(
    active.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + monthlyExpenseAmount(e);
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const top = rows[0]?.[1] ?? 1;

  return (
    <section aria-label="분류별 월 고정비">
      <PaneHeader className="static">분류별 월 고정비</PaneHeader>
      {rows.length === 0 ? (
        <p className="px-6 py-6 text-center text-[13px] text-muted-foreground">
          사용 중인 고정비가 없습니다.
        </p>
      ) : (
        <ul className="px-3 pt-2.5 pb-3">
          {rows.map(([category, amount]) => (
            <li
              key={category}
              title={`${Math.round((amount / total) * 100)}%`}
              className="grid h-[26px] grid-cols-[62px_minmax(0,1fr)_54px] items-center gap-2 text-[13px]"
            >
              <span className="truncate">{categoryLabel(category)}</span>
              <span className="block h-1 overflow-hidden rounded-full bg-neutral-soft">
                <i
                  className="block h-full rounded-full bg-muted-foreground"
                  style={{ width: `${Math.max(3, (amount / top) * 100)}%` }}
                />
              </span>
              <span className="text-right tabular-nums">{formatMoney(amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PaymentSchedule({ active }: { active: OfficeExpenseTemplate[] }) {
  const now = new Date();
  const today = now.getDate();
  const scheduled = active
    .filter((e) => e.frequency === 'monthly' && e.dayOfMonth)
    .sort((a, b) => (a.dayOfMonth ?? 0) - (b.dayOfMonth ?? 0));
  const nextId = scheduled.find((e) => (e.dayOfMonth ?? 0) >= today)?.id;
  const noDay = active.filter((e) => e.frequency === 'monthly' && !e.dayOfMonth).length;
  const periodic = active.filter((e) => e.frequency !== 'monthly').length;
  const skipped = [
    noDay > 0 ? `결제일 없는 ${noDay}건` : null,
    periodic > 0 ? `분기·연간 ${periodic}건` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <section aria-label={`${now.getMonth() + 1}월 결제 일정`}>
      <PaneHeader className="static">{now.getMonth() + 1}월 결제 일정</PaneHeader>
      <ul>
        {scheduled.map((expense) => {
          const past = (expense.dayOfMonth ?? 0) < today;
          const next = expense.id === nextId;
          return (
            <li
              key={expense.id}
              className={cn(
                'grid min-h-[34px] grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[#eeeeec] px-3 text-[13px]',
                past && 'text-[#a5a39f]',
              )}
            >
              <span
                className={cn(
                  'text-[12.5px] tabular-nums',
                  past ? 'text-[#a5a39f]' : 'text-muted-foreground',
                  next && 'font-semibold text-foreground',
                )}
              >
                {expense.dayOfMonth}일
              </span>
              <span className="truncate" title={expense.title}>
                {expense.title}
              </span>
              <span className="tabular-nums">{formatMoney(expense.amount)}</span>
            </li>
          );
        })}
      </ul>
      {skipped && (
        <p className="px-3 py-2.5 text-xs leading-normal text-muted-foreground">
          {skipped}은 일정에서 뺐습니다.
        </p>
      )}
    </section>
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
      toast.error(isEdit ? '수정하지 못했습니다.' : '등록하지 못했습니다.'),
  });

  const amountValue = Number(amount);
  const day = dayOfMonth ? Number(dayOfMonth) : null;
  const dayValid = day === null || (day >= 1 && day <= 31);
  const valid = title.trim().length > 0 && amountValue > 0 && dayValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? '고정비 수정' : '고정비 등록'}</DialogTitle>
          <DialogDescription>
            분기·연간 항목은 월로 환산해 순이익 계산에 넣습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="expense-title">항목명</Label>
            <Input
              id="expense-title"
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
              <Label htmlFor="expense-amount">금액 (만원)</Label>
              <Input
                id="expense-amount"
                type="number"
                min={1}
                className="tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="예) 250"
              />
              {amountValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  = {formatMoney(amountValue)}원
                  {frequency !== 'monthly' &&
                    ` · 월 ${formatMoney(monthlyExpenseAmount({ amount: amountValue, frequency }))}`}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="expense-day">결제일 (선택)</Label>
              <Input
                id="expense-day"
                type="number"
                min={1}
                max={31}
                className="tabular-nums"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                placeholder="예) 25"
              />
              {!dayValid && (
                <p className="text-xs text-destructive-strong">
                  1일에서 31일 사이로 입력해 주세요.
                </p>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13.5px]">
            <Checkbox
              checked={taxDeductible}
              onCheckedChange={(v) => setTaxDeductible(!!v)}
              className="size-3.5"
            />
            세금 공제 가능 항목
          </label>
          <div className="grid gap-1.5">
            <Label htmlFor="expense-note">메모 (선택)</Label>
            <Input
              id="expense-note"
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
          <Button
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending}
          >
            {mutation.isPending ? '저장 중…' : isEdit ? '수정 저장' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
