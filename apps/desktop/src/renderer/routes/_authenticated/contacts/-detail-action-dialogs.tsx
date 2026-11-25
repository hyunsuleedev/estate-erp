import { formatUnitName } from '@estate-erp/shared';
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
import { apiErrorMessage, placeLabelOf, propertyRoleLabels } from './-detail-cards';
import { useAuth } from '@/providers/auth-provider';
import { TaskCreateDialog } from '../tasks/-task-create-dialog';
import { FormField } from './-detail-dialogs';
import {
  ConsultationTypeButtons,
  toLocalDateTimeInput,
} from '../consultations/-consultation-form-dialog';

/**
 * 연락처 상세 — 후속 액션 다이얼로그 (상담 기록 / 할 일 / 매물 연결 / 매수요건).
 * PRD 9장 "저장 후 후속 액션", 12장 "연결 엔터티와 화면" 대응.
 */

// ── 1. 상담 기록 작성 ──

/**
 * 전화를 받으며, 또는 방문 손님이 간 뒤에 바로 적는 창.
 * 방식은 단추 하나로 고르고, 상담한 때는 지금으로 채워 두되 지난 일이면 바꾼다.
 * "다음 할 일"을 적으면 이 상담에 이어진 할 일이 함께 생긴다 (적지 않으면 상담만 남는다).
 */
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
  const { user } = useAuth();
  const [type, setType] = useState('phone');
  const [content, setContent] = useState('');
  const [consultedAt, setConsultedAt] = useState('');
  const [openedAt, setOpenedAt] = useState('');
  const [nextTitle, setNextTitle] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const now = toLocalDateTimeInput();
    setType('phone');
    setContent('');
    setConsultedAt(now);
    setOpenedAt(now);
    setNextTitle('');
    setNextDue('');
    setError('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      // 상담한 때를 바꿨을 때만 보낸다. 그대로면 서버가 저장하는 순간을 상담 시각으로 적는다.
      const consultedAtIso =
        consultedAt && consultedAt !== openedAt ? new Date(consultedAt).toISOString() : undefined;
      const consultation = await api.consultations.create({
        contactId,
        type,
        content: content.trim(),
        consultedAt: consultedAtIso,
      });
      if (!nextTitle.trim()) return { taskFailed: false };
      try {
        await api.tasks.create({
          title: nextTitle.trim(),
          dueDate: nextDue ? new Date(`${nextDue}T09:00:00`).toISOString() : undefined,
          contactId,
          consultationId: consultation.id,
          category: 'consultation',
          source: 'manual',
          // 담당은 적은 사람이다 (비워 두면 '내 업무'에서 사라진 것처럼 보인다)
          ...(user?.id ? { assignedToId: user.id } : {}),
        });
        return { taskFailed: false };
      } catch {
        // 상담은 이미 저장됐다. 할 일만 못 만든 것을 알린다.
        return { taskFailed: true };
      }
    },
    onSuccess: async ({ taskFailed }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['consultations'] }),
        ...(nextTitle.trim() ? [queryClient.invalidateQueries({ queryKey: ['tasks'] })] : []),
      ]);
      if (taskFailed) {
        toast.warning('상담은 적었지만 다음 업무는 만들지 못했습니다. 업무 화면에서 다시 만들어 주세요.');
      } else {
        toast.success(nextTitle.trim() ? '상담을 적고 다음 업무를 만들었습니다.' : '상담을 적었습니다.');
      }
      onOpenChange(false);
    },
    onError: (caught) => {
      // 창은 열어 둔 채로 이유를 보인다. 적은 내용은 그대로 남는다.
      setError(apiErrorMessage(caught, '상담을 기록하지 못했습니다. 잠시 뒤 다시 시도하세요.'));
    },
  });

  const isFuture =
    Boolean(consultedAt) &&
    consultedAt !== openedAt &&
    new Date(consultedAt).getTime() > Date.now() + 10 * 60 * 1000;

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent
        className="sm:max-w-md"
        // 전화를 받으며 적다가 창 밖을 잘못 눌러도 적은 내용이 말없이 사라지지 않게 한다 (닫기는 취소 · Esc)
        onInteractOutside={(event) => {
          if (content.trim() || nextTitle.trim()) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>상담 적기</DialogTitle>
          <DialogDescription>{contactName} 님과 나눈 이야기를 남깁니다.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (mutation.isPending) return;
            if (!content.trim()) {
              setError('상담 내용을 입력하세요.');
              return;
            }
            if (isFuture) {
              setError('앞으로의 날짜로는 상담을 적을 수 없습니다. 약속은 다음 업무로 남기세요.');
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

          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
            <FormField label="방식" required>
              <ConsultationTypeButtons value={type} onChange={setType} />
            </FormField>
            <FormField label="상담한 때">
              <Input
                type="datetime-local"
                aria-label="상담한 때"
                value={consultedAt}
                max={toLocalDateTimeInput()}
                onChange={(event) => setConsultedAt(event.target.value)}
                className="h-8 text-sm"
              />
            </FormField>
          </div>

          <FormField label="상담 내용" required>
            <Textarea
              rows={6}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="무슨 이야기를 했는지 적어 두세요. (원하는 조건, 가격, 약속한 것)"
              autoFocus
            />
          </FormField>

          <FormField label="다음 업무 (선택)">
            <div className="flex items-center gap-2">
              <Input
                value={nextTitle}
                onChange={(event) => setNextTitle(event.target.value)}
                placeholder="예: 토요일 임장 일정 다시 확인"
                className="min-w-0 flex-1"
              />
              <Input
                type="date"
                aria-label="다음 업무 날짜"
                value={nextDue}
                onChange={(event) => setNextDue(event.target.value)}
                className="w-[150px] shrink-0"
                disabled={!nextTitle.trim()}
              />
            </div>
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
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

// ── 2. 업무 추가 ──

/**
 * 예전 이름을 남겨 둔 것. 업무 창은 업무 영역의 TaskCreateDialog 하나를 쓴다(담당 기본값 = 만든 사람,
 * 제목 · 내용 · 날짜 · 분류 · 담당을 모두 넣는 같은 창). 다른 화면(고객 원장)이 아직 이 이름으로 부른다.
 */
export function TaskAddDialog({
  contactId,
  open,
  onOpenChange,
}: {
  contactId: string;
  contactName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return <TaskCreateDialog open={open} onOpenChange={onOpenChange} contactId={contactId} />;
}

// ── 3. 매물 연결 (PropertyContact 생성) ──

function propertyLabel(property: Property) {
  return placeLabelOf(property) || '매물';
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
    onError: (caught) => {
      const message = apiErrorMessage(caught, '매물을 연결하지 못했습니다. 잠시 뒤 다시 시도하세요.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>소유 매물 연결</DialogTitle>
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
              {mutation.isPending ? '연결 중...' : '연결'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
