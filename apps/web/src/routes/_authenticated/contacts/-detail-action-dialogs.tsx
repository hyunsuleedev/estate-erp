import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Property } from '@estate-erp/api-client';
import { Building2, Search } from 'lucide-react';
import { api } from '@/lib/api';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { propertyRoleLabels } from './-detail-cards';
import { FormField } from './-detail-dialogs';

/**
 * 연락처 상세 — 후속 액션 다이얼로그 (상담 기록 / 할 일 / 매물 연결 / 매수요건).
 * PRD 9장 "저장 후 후속 액션", 12장 "연결 엔터티와 화면" 대응.
 */

// ── 1. 상담 기록 작성 ──

export function ConsultationAddDialog({
  contactId,
  contactName,
  open,
  onOpenChange,
}: {
  contactId: string;
  contactName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState('phone');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!open) return;
    setType('phone');
    setContent('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      api.consultations.create({
        contactId,
        type,
        content: content.trim(),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['consultations'] }),
      ]);
      toast.success('상담 기록이 저장되었습니다.');
      onOpenChange(false);
    },
    onError: () => {
      toast.error('상담 기록 저장에 실패했습니다.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>상담 기록</DialogTitle>
          <DialogDescription>{contactName} 님과의 상담 내용을 기록합니다.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!content.trim()) {
              toast.error('상담 내용을 입력하세요.');
              return;
            }
            mutation.mutate();
          }}
        >
          <FormField label="상담 유형" required>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">전화</SelectItem>
                <SelectItem value="visit">방문</SelectItem>
                <SelectItem value="online">온라인</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="상담 내용" required>
            <Textarea
              rows={6}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="누구와 무슨 이야기를 했는지 기록하세요."
              required
            />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── 2. 할 일 추가 ──

export function TaskAddDialog({
  contactId,
  contactName,
  open,
  onOpenChange,
}: {
  contactId: string;
  contactName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setContent('');
    setDueDate('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      api.tasks.create({
        title: title.trim(),
        content: content.trim() || undefined,
        dueDate: dueDate ? new Date(`${dueDate}T09:00:00`).toISOString() : undefined,
        contactId,
        source: 'manual',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('할 일이 등록되었습니다.');
      onOpenChange(false);
    },
    onError: () => {
      toast.error('할 일 등록에 실패했습니다.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>할 일 추가</DialogTitle>
          <DialogDescription>{contactName} 님 관련 후속 업무를 등록합니다.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) {
              toast.error('할 일 제목을 입력하세요.');
              return;
            }
            mutation.mutate();
          }}
        >
          <FormField label="제목" required>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 매물 조건 재확인 연락"
              required
            />
          </FormField>

          <FormField label="내용">
            <Textarea rows={3} value={content} onChange={(event) => setContent(event.target.value)} />
          </FormField>

          <FormField label="마감일">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '등록 중...' : '등록'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── 3. 매물 연결 (PropertyContact 생성) ──

function propertyLabel(property: Property) {
  const dong = property.unit?.dong && !property.unit.dong.isPlaceholder ? property.unit.dong.name : null;
  return [property.site?.name ?? '매물', dong, property.unit?.name].filter(Boolean).join(' ');
}

export function PropertyLinkDialog({
  contactId,
  contactName,
  open,
  onOpenChange,
}: {
  contactId: string;
  contactName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Property | null>(null);
  const [role, setRole] = useState('owner');
  const [isPrimary, setIsPrimary] = useState(false);
  const [isResident, setIsResident] = useState(false);
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearchQuery('');
    setSelected(null);
    setRole('owner');
    setIsPrimary(false);
    setIsResident(false);
    setMemo('');
    setError('');
  }, [open]);

  const trimmedQuery = searchQuery.trim();
  const propertiesQuery = useQuery({
    queryKey: ['properties', 'link-candidates', trimmedQuery],
    queryFn: () => api.properties.findAll({ search: trimmedQuery, limit: 8 }),
    enabled: open && trimmedQuery.length >= 2,
  });
  const properties = propertiesQuery.data?.items ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      api.propertyContacts.create({
        contactId,
        propertyId: (selected as Property).id,
        role,
        isPrimary,
        isResident,
        memo: memo.trim() || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['properties'] }),
      ]);
      toast.success('매물이 연결되었습니다.');
      onOpenChange(false);
    },
    onError: () => {
      toast.error('매물 연결에 실패했습니다.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>매물 연결</DialogTitle>
          <DialogDescription>
            {contactName} 님을 매물의 소유자·대리인 등으로 연결합니다.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selected) {
              setError('연결할 매물을 검색해 선택하세요.');
              return;
            }
            setError('');
            mutation.mutate();
          }}
        >
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <FormField label="매물 검색" required>
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setSelected(null);
                  }}
                  placeholder="단지명, 주소로 검색 (2자 이상)"
                />
              </div>

              {selected ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-info/30 bg-info-soft/40 px-3 py-2">
                  <span className="inline-flex min-w-0 items-center gap-2 text-sm">
                    <Building2 className="size-3.5 shrink-0 text-info" />
                    <span className="truncate font-medium">{propertyLabel(selected)}</span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSelected(null)}>
                    해제
                  </Button>
                </div>
              ) : trimmedQuery.length >= 2 ? (
                propertiesQuery.isLoading ? (
                  <div className="space-y-1.5">
                    <Skeleton className="h-9 w-full rounded-md" />
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                ) : properties.length > 0 ? (
                  <div className="max-h-52 divide-y overflow-y-auto rounded-md border">
                    {properties.map((property) => (
                      <button
                        key={property.id}
                        type="button"
                        onClick={() => setSelected(property)}
                        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                      >
                        <span className="truncate font-medium">{propertyLabel(property)}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {property.site?.roadAddress ?? property.site?.jibunAddress ?? '주소 없음'}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    검색 결과가 없습니다. 매물장에서 먼저 등록하세요.
                  </p>
                )
              ) : null}
            </div>
          </FormField>

          <FormField label="역할" required>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(propertyRoleLabels).map(([value, roleLabel]) => (
                  <SelectItem key={value} value={value}>
                    {roleLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isPrimary} onCheckedChange={(checked) => setIsPrimary(checked === true)} />
              주 연락처
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isResident} onCheckedChange={(checked) => setIsResident(checked === true)} />
              실거주
            </label>
          </div>

          <FormField label="메모">
            <Input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="참고 메모" />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '연결 중...' : '매물 연결'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── 4. 매수요건 추가 (간단 등록 — 상세 조건은 구매고객 페이지에서 보완) ──

export function BuyerReqAddDialog({
  contactId,
  contactName,
  open,
  onOpenChange,
}: {
  contactId: string;
  contactName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [transactionType, setTransactionType] = useState('sale');
  const [urgency, setUrgency] = useState('normal');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [monthlyRentMax, setMonthlyRentMax] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (!open) return;
    setTransactionType('sale');
    setUrgency('normal');
    setBudgetMin('');
    setBudgetMax('');
    setMonthlyRentMax('');
    setMemo('');
  }, [open]);

  const budgetLabel = transactionType === 'sale' ? '매매 예산 (만원)' : '보증금 (만원)';

  const parsedMin = budgetMin ? Number(budgetMin) : undefined;
  const parsedMax = budgetMax ? Number(budgetMax) : undefined;

  const mutation = useMutation({
    mutationFn: () =>
      api.buyerRequirements.create({
        contactId,
        transactionType,
        urgency,
        priceMin: transactionType === 'sale' ? parsedMin : undefined,
        priceMax: transactionType === 'sale' ? parsedMax : undefined,
        depositMin: transactionType !== 'sale' ? parsedMin : undefined,
        depositMax: transactionType !== 'sale' ? parsedMax : undefined,
        monthlyRentMax:
          transactionType === 'monthly' && monthlyRentMax ? Number(monthlyRentMax) : undefined,
        memo: memo.trim() || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] }),
      ]);
      toast.success('매수요건이 등록되었습니다. 상세 조건은 구매고객 페이지에서 보완하세요.');
      onOpenChange(false);
    },
    onError: () => {
      toast.error('매수요건 등록에 실패했습니다.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>매수요건 추가</DialogTitle>
          <DialogDescription>
            {contactName} 님의 희망 조건을 간단히 등록합니다. 지역·면적 등 상세 조건은 구매고객
            페이지에서 이어서 입력할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="거래유형" required>
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">매매</SelectItem>
                  <SelectItem value="jeonse">전세</SelectItem>
                  <SelectItem value="monthly">월세</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="긴급도">
              <Select value={urgency} onValueChange={setUrgency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">급함</SelectItem>
                  <SelectItem value="normal">보통</SelectItem>
                  <SelectItem value="flexible">여유</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField label={budgetLabel}>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={budgetMin}
                onChange={(event) => setBudgetMin(event.target.value)}
                placeholder="최소"
              />
              <span className="text-sm text-muted-foreground">~</span>
              <Input
                type="number"
                min={0}
                value={budgetMax}
                onChange={(event) => setBudgetMax(event.target.value)}
                placeholder="최대"
              />
            </div>
          </FormField>

          {transactionType === 'monthly' && (
            <FormField label="월세 상한 (만원)">
              <Input
                type="number"
                min={0}
                value={monthlyRentMax}
                onChange={(event) => setMonthlyRentMax(event.target.value)}
                placeholder="예: 120"
              />
            </FormField>
          )}

          <FormField label="메모">
            <Textarea rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '등록 중...' : '등록'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
