/**
 * 매물 상세($id) 페이지 전용 다이얼로그 모음.
 * - ListingFormDialog: 매물(Listing) 등록/수정 — 가격·확인상태·관리비·융자금·권리금·내부메모
 * - PropertyContactAddDialog: 관련인 추가 (기존 연락처 검색 / 신규 생성)
 * - ConsultationAddDialog: 상담 기록 추가 (propertyId 자동 연결)
 * - TenantAddDialog: 임차인 추가
 * - DealAddDialog: 거래(Deal) 생성 (listingId 연결)
 * - MatchCreateDialog: 매칭 생성 (listingId + buyerReqId)
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Lock, Search, UserPlus, Users } from 'lucide-react';
import type { Contact, Listing } from '@estate-erp/api-client';
import {
  MAINTENANCE_FEE_INCLUDE_LABELS,
  TRANSACTION_TYPE_LABELS,
} from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatMoney, formatPhone, formatRent } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { StatusBadge } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── 공통 헬퍼 ──────────────────────────────────────────────────────

function parseManwon(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

const CHECK_STATUS_VALUES = ['unverified', 'verified', 'in_contract', 'hold', 'done'] as const;

const ROLE_OPTIONS = [
  { value: 'owner', label: '소유자' },
  { value: 'co_owner', label: '공동소유' },
  { value: 'representative', label: '대리인' },
  { value: 'lawyer', label: '법무사' },
  { value: 'tax_agent', label: '세무사' },
];

const CONSULTATION_TYPE_OPTIONS = [
  { value: 'phone', label: '전화' },
  { value: 'visit', label: '방문' },
  { value: 'online', label: '온라인' },
];

function listingPriceText(listing: Listing): string {
  if (listing.transactionType === 'monthly') {
    return formatRent(listing.deposit, listing.monthlyRent);
  }
  return formatMoney(listing.price ?? listing.deposit);
}

// ── 연락처 선택기 (기존 검색 / 신규 입력) ─────────────────────────────

export type ContactSelection =
  | { mode: 'existing'; contact: { id: string; name: string; phone: string | null } }
  | { mode: 'new'; name: string; phone: string };

/** 신규 선택이면 Contact를 먼저 생성하고 id를 반환한다. */
export async function resolveContactId(selection: ContactSelection): Promise<string> {
  if (selection.mode === 'existing') return selection.contact.id;
  const created = await api.contacts.create({
    name: selection.name.trim(),
    phone: selection.phone.trim() || undefined,
  });
  return created.id;
}

export function isContactSelectionValid(selection: ContactSelection | null): boolean {
  if (!selection) return false;
  if (selection.mode === 'existing') return !!selection.contact.id;
  return selection.name.trim().length > 0;
}

function ContactSelector({
  value,
  onChange,
  suggested = [],
}: {
  value: ContactSelection | null;
  onChange: (value: ContactSelection | null) => void;
  /** 이 매물의 관련인 등 빠른 선택 후보 */
  suggested?: Array<{ id: string; name: string; phone: string | null; label?: string }>;
}) {
  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [search, setSearch] = useState('');

  const { data: searchResult, isFetching } = useQuery({
    queryKey: ['contacts', 'picker', search],
    queryFn: () => api.contacts.findAll({ search: search.trim() || undefined, limit: 8 }),
    enabled: tab === 'existing',
  });

  const results: Contact[] = searchResult?.items ?? [];
  const selectedId = value?.mode === 'existing' ? value.contact.id : null;

  const switchTab = (next: 'existing' | 'new') => {
    setTab(next);
    onChange(next === 'new' ? { mode: 'new', name: '', phone: '' } : null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
        <button
          type="button"
          onClick={() => switchTab('existing')}
          className={cn(
            'h-7 flex-1 rounded-[5px] text-xs font-medium transition-colors',
            tab === 'existing' ? 'bg-background shadow-xs' : 'text-muted-foreground',
          )}
        >
          기존 연락처
        </button>
        <button
          type="button"
          onClick={() => switchTab('new')}
          className={cn(
            'h-7 flex-1 rounded-[5px] text-xs font-medium transition-colors',
            tab === 'new' ? 'bg-background shadow-xs' : 'text-muted-foreground',
          )}
        >
          <span className="inline-flex items-center gap-1">
            <UserPlus className="size-3.5" />
            신규 등록
          </span>
        </button>
      </div>

      {tab === 'existing' ? (
        <div className="space-y-2">
          {suggested.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggested.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    onChange({ mode: 'existing', contact: { id: s.id, name: s.name, phone: s.phone } })
                  }
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted',
                    selectedId === s.id && 'border-foreground bg-muted font-medium',
                  )}
                >
                  {s.name}
                  {s.label ? <span className="ml-1 text-muted-foreground">{s.label}</span> : null}
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름·전화번호 검색"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <div className="max-h-44 overflow-y-auto rounded-md border">
            {isFetching && results.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">검색 중...</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                검색 결과가 없습니다. 신규 등록 탭에서 추가하세요.
              </p>
            ) : (
              results.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      mode: 'existing',
                      contact: { id: contact.id, name: contact.name, phone: contact.phone },
                    })
                  }
                  className={cn(
                    'flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/60',
                    selectedId === contact.id && 'bg-muted',
                  )}
                >
                  <span className="font-medium">{contact.name}</span>
                  <span className="text-xs text-muted-foreground">{formatPhone(contact.phone)}</span>
                </button>
              ))
            )}
          </div>
          {value?.mode === 'existing' && (
            <p className="text-xs text-muted-foreground">
              선택됨: <b className="text-foreground">{value.contact.name}</b>{' '}
              {formatPhone(value.contact.phone)}
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">이름 *</Label>
            <Input
              value={value?.mode === 'new' ? value.name : ''}
              onChange={(e) =>
                onChange({ mode: 'new', name: e.target.value, phone: value?.mode === 'new' ? value.phone : '' })
              }
              placeholder="홍길동"
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">전화번호</Label>
            <Input
              value={value?.mode === 'new' ? value.phone : ''}
              onChange={(e) =>
                onChange({ mode: 'new', name: value?.mode === 'new' ? value.name : '', phone: e.target.value })
              }
              placeholder="010-0000-0000"
              className="mt-1 h-8 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── 1. 매물(Listing) 등록/수정 다이얼로그 ──────────────────────────────

interface ListingFormState {
  transactionType: string;
  price: string;
  deposit: string;
  monthlyRent: string;
  checkStatus: string;
  maintenanceFee: string;
  maintenanceFeeIncludes: string[];
  loanAmount: string;
  premium: string;
  privateMemo: string;
  memo: string;
}

function initListingForm(listing: Listing | null): ListingFormState {
  return {
    transactionType: listing?.transactionType ?? 'sale',
    price: listing?.price != null ? String(listing.price) : '',
    deposit: listing?.deposit != null ? String(listing.deposit) : '',
    monthlyRent: listing?.monthlyRent != null ? String(listing.monthlyRent) : '',
    checkStatus: listing?.checkStatus ?? 'unverified',
    maintenanceFee: listing?.maintenanceFee != null ? String(listing.maintenanceFee) : '',
    maintenanceFeeIncludes: listing?.maintenanceFeeIncludes ?? [],
    loanAmount: listing?.loanAmount != null ? String(listing.loanAmount) : '',
    premium: listing?.premium != null ? String(listing.premium) : '',
    privateMemo: listing?.privateMemo ?? '',
    memo: listing?.memo ?? '',
  };
}

export function ListingFormDialog({
  open,
  onOpenChange,
  propertyId,
  siteType,
  listing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  siteType?: string | null;
  /** null이면 신규 등록, 있으면 수정 */
  listing: Listing | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!listing;
  const [form, setForm] = useState<ListingFormState>(() => initListingForm(listing));

  useEffect(() => {
    if (open) setForm(initListingForm(listing));
  }, [open, listing]);

  const set = (patch: Partial<ListingFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const isMonthly = form.transactionType === 'monthly';
  const isCommercial = siteType === 'commercial';

  const mutation = useMutation({
    mutationFn: () => {
      const common = {
        price: isMonthly ? null : parseManwon(form.price),
        deposit: isMonthly ? parseManwon(form.deposit) : null,
        monthlyRent: isMonthly ? parseManwon(form.monthlyRent) : null,
        maintenanceFee: parseManwon(form.maintenanceFee),
        maintenanceFeeIncludes: form.maintenanceFeeIncludes,
        loanAmount: parseManwon(form.loanAmount),
        premium: isCommercial ? parseManwon(form.premium) : null,
        privateMemo: form.privateMemo.trim() || null,
      };
      if (isEdit) {
        return api.listings.update(listing.id, {
          ...common,
          checkStatus: form.checkStatus,
          memo: form.memo.trim() || undefined,
        });
      }
      return api.listings.create({
        propertyId,
        transactionType: form.transactionType,
        ...common,
        memo: form.memo.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? '매물 정보가 수정되었습니다.' : '매물이 등록되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['properties', propertyId] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(getErrorMessage(err, '매물 저장에 실패했습니다.')),
  });

  const priceLabel =
    form.transactionType === 'sale' ? '매매가 (만원) *' : '전세가 (만원) *';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? '매물 수정' : '매물 추가'}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">거래유형 {isEdit ? '' : '*'}</Label>
              {isEdit ? (
                <div className="mt-1.5">
                  <StatusBadge kind="transactionType" status={listing.transactionType} />
                </div>
              ) : (
                <Select
                  value={form.transactionType}
                  onValueChange={(v) => set({ transactionType: v })}
                >
                  <SelectTrigger className="mt-1 h-8 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {isEdit && (
              <div>
                <Label className="text-xs">확인 상태</Label>
                <Select value={form.checkStatus} onValueChange={(v) => set({ checkStatus: v })}>
                  <SelectTrigger className="mt-1 h-8 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHECK_STATUS_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {getStatusMeta('checkStatus', value).label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {isMonthly ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">보증금 (만원) *</Label>
                <Input
                  type="number"
                  value={form.deposit}
                  onChange={(e) => set({ deposit: e.target.value })}
                  placeholder="예: 10000"
                  className="mt-1 h-8 text-sm tabular-nums"
                />
              </div>
              <div>
                <Label className="text-xs">월세 (만원) *</Label>
                <Input
                  type="number"
                  value={form.monthlyRent}
                  onChange={(e) => set({ monthlyRent: e.target.value })}
                  placeholder="예: 120"
                  className="mt-1 h-8 text-sm tabular-nums"
                />
              </div>
            </div>
          ) : (
            <div>
              <Label className="text-xs">{priceLabel}</Label>
              <Input
                type="number"
                value={form.price}
                onChange={(e) => set({ price: e.target.value })}
                placeholder="예: 158000 (15억 8,000)"
                className="mt-1 h-8 text-sm tabular-nums"
              />
              {parseManwon(form.price) != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  = {formatMoney(parseManwon(form.price))}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">관리비 (만원)</Label>
              <Input
                type="number"
                value={form.maintenanceFee}
                onChange={(e) => set({ maintenanceFee: e.target.value })}
                placeholder="예: 15"
                className="mt-1 h-8 text-sm tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs">융자금/근저당 (만원)</Label>
              <Input
                type="number"
                value={form.loanAmount}
                onChange={(e) => set({ loanAmount: e.target.value })}
                placeholder="예: 30000"
                className="mt-1 h-8 text-sm tabular-nums"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">관리비 포함 항목</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {Object.entries(MAINTENANCE_FEE_INCLUDE_LABELS).map(([slug, label]) => {
                const active = form.maintenanceFeeIncludes.includes(slug);
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() =>
                      set({
                        maintenanceFeeIncludes: active
                          ? form.maintenanceFeeIncludes.filter((s) => s !== slug)
                          : [...form.maintenanceFeeIncludes, slug],
                      })
                    }
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-info bg-info-soft font-medium text-info'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {isCommercial && (
            <div>
              <Label className="text-xs">권리금 (만원)</Label>
              <Input
                type="number"
                value={form.premium}
                onChange={(e) => set({ premium: e.target.value })}
                placeholder="예: 5000"
                className="mt-1 h-8 text-sm tabular-nums"
              />
            </div>
          )}

          <div>
            <Label className="flex items-center gap-1 text-xs">
              <Lock className="size-3 text-muted-foreground" />
              내부 전용 메모
            </Label>
            <Textarea
              rows={2}
              value={form.privateMemo}
              onChange={(e) => set({ privateMemo: e.target.value })}
              placeholder="네트워크 공유·외부에 절대 노출되지 않는 메모"
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs">메모</Label>
            <Textarea
              rows={2}
              value={form.memo}
              onChange={(e) => set({ memo: e.target.value })}
              placeholder="일반 메모"
              className="mt-1 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            취소
          </Button>
          <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            {isEdit ? '저장' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 2. 관련인 추가 다이얼로그 ────────────────────────────────────────

export function PropertyContactAddDialog({
  open,
  onOpenChange,
  propertyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
}) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState('owner');
  const [selection, setSelection] = useState<ContactSelection | null>(null);
  const [shareRatio, setShareRatio] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (open) {
      setRole('owner');
      setSelection(null);
      setShareRatio('');
      setIsPrimary(false);
      setMemo('');
    }
  }, [open]);

  const showShareRatio = role === 'owner' || role === 'co_owner';

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selection) throw new Error('연락처를 선택하세요.');
      const ratio = shareRatio.trim() ? Number(shareRatio) : undefined;
      if (selection.mode === 'new') {
        return api.propertyContacts.createWithNewContact({
          propertyId,
          role,
          name: selection.name.trim(),
          phone: selection.phone.trim() || undefined,
          shareRatio: showShareRatio ? ratio : undefined,
          isPrimary,
          memo: memo.trim() || undefined,
        });
      }
      return api.propertyContacts.create({
        propertyId,
        contactId: selection.contact.id,
        role,
        shareRatio: showShareRatio ? ratio : undefined,
        isPrimary,
        memo: memo.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('관련인이 추가되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['property-contacts', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['properties', propertyId] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(getErrorMessage(err, '관련인 추가에 실패했습니다.')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>관련인 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">역할 *</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="mt-1 h-8 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showShareRatio && (
              <div>
                <Label className="text-xs">지분 비율 (%)</Label>
                <Input
                  type="number"
                  value={shareRatio}
                  onChange={(e) => setShareRatio(e.target.value)}
                  placeholder="예: 50"
                  className="mt-1 h-8 text-sm tabular-nums"
                />
              </div>
            )}
          </div>

          <ContactSelector value={selection} onChange={setSelection} />

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={isPrimary} onCheckedChange={(v) => setIsPrimary(v === true)} />
            주 연락처로 지정
          </label>

          <div>
            <Label className="text-xs">메모</Label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 실거주, 연락은 저녁에"
              className="mt-1 h-8 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={!isContactSelectionValid(selection) || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 3. 상담 추가 다이얼로그 ──────────────────────────────────────────

export function ConsultationAddDialog({
  open,
  onOpenChange,
  propertyId,
  suggestedContacts = [],
  defaultContact = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  suggestedContacts?: Array<{ id: string; name: string; phone: string | null; label?: string }>;
  defaultContact?: { id: string; name: string; phone: string | null } | null;
}) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<ContactSelection | null>(null);
  const [type, setType] = useState('phone');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (open) {
      setSelection(defaultContact ? { mode: 'existing', contact: defaultContact } : null);
      setType('phone');
      setContent('');
    }
  }, [open, defaultContact]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selection) throw new Error('상담 상대를 선택하세요.');
      const contactId = await resolveContactId(selection);
      return api.consultations.create({
        contactId,
        type,
        content: content.trim(),
        propertyId,
      });
    },
    onSuccess: () => {
      toast.success('상담 기록이 추가되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['consultations'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(getErrorMessage(err, '상담 기록 추가에 실패했습니다.')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>상담 기록 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ContactSelector value={selection} onChange={setSelection} suggested={suggestedContacts} />
          <div>
            <Label className="text-xs">상담 유형</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1 h-8 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONSULTATION_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">상담 내용 *</Label>
            <Textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="무슨 이야기를 나눴는지 기록하세요"
              className="mt-1 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={!isContactSelectionValid(selection) || !content.trim() || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 4. 임차인 추가 다이얼로그 ────────────────────────────────────────

export function TenantAddDialog({
  open,
  onOpenChange,
  propertyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
}) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<ContactSelection | null>(null);
  const [deposit, setDeposit] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [contractStart, setContractStart] = useState('');
  const [contractEnd, setContractEnd] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (open) {
      setSelection(null);
      setDeposit('');
      setMonthlyRent('');
      setContractStart('');
      setContractEnd('');
      setMemo('');
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selection) throw new Error('임차인 연락처를 선택하세요.');
      const common = {
        propertyId,
        deposit: parseManwon(deposit) ?? undefined,
        monthlyRent: parseManwon(monthlyRent) ?? undefined,
        contractStart: contractStart || undefined,
        contractEnd: contractEnd || undefined,
        memo: memo.trim() || undefined,
      };
      if (selection.mode === 'new') {
        return api.tenants.createWithNewContact({
          ...common,
          name: selection.name.trim(),
          phone: selection.phone.trim() || undefined,
        });
      }
      return api.tenants.create({ ...common, contactId: selection.contact.id });
    },
    onSuccess: () => {
      toast.success('임차인이 추가되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['tenants', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['properties', propertyId] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(getErrorMessage(err, '임차인 추가에 실패했습니다.')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>임차인 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ContactSelector value={selection} onChange={setSelection} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">보증금 (만원)</Label>
              <Input
                type="number"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder="예: 10000"
                className="mt-1 h-8 text-sm tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs">월세 (만원)</Label>
              <Input
                type="number"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                placeholder="예: 120"
                className="mt-1 h-8 text-sm tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs">계약 시작일</Label>
              <Input
                type="date"
                value={contractStart}
                onChange={(e) => setContractStart(e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">계약 만료일</Label>
              <Input
                type="date"
                value={contractEnd}
                onChange={(e) => setContractEnd(e.target.value)}
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">메모</Label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 만기 3개월 전 연락"
              className="mt-1 h-8 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={!isContactSelectionValid(selection) || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 5. 거래(Deal) 추가 다이얼로그 ────────────────────────────────────

export function DealAddDialog({
  open,
  onOpenChange,
  propertyId,
  listings,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  listings: Listing[];
  onCreated?: () => void;
}) {
  const queryClient = useQueryClient();
  const [listingId, setListingId] = useState('');
  const [agreedPrice, setAgreedPrice] = useState('');
  const [agreedDeposit, setAgreedDeposit] = useState('');
  const [agreedMonthlyRent, setAgreedMonthlyRent] = useState('');
  const [buyer, setBuyer] = useState<ContactSelection | null>(null);
  const [memo, setMemo] = useState('');

  const selectedListing = useMemo(
    () => listings.find((l) => l.id === listingId) ?? null,
    [listings, listingId],
  );

  useEffect(() => {
    if (open) {
      const first = listings[0] ?? null;
      setListingId(first?.id ?? '');
      setAgreedPrice(first?.price != null ? String(first.price) : '');
      setAgreedDeposit(first?.deposit != null ? String(first.deposit) : '');
      setAgreedMonthlyRent(first?.monthlyRent != null ? String(first.monthlyRent) : '');
      setBuyer(null);
      setMemo('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleListingChange = (id: string) => {
    setListingId(id);
    const listing = listings.find((l) => l.id === id);
    setAgreedPrice(listing?.price != null ? String(listing.price) : '');
    setAgreedDeposit(listing?.deposit != null ? String(listing.deposit) : '');
    setAgreedMonthlyRent(listing?.monthlyRent != null ? String(listing.monthlyRent) : '');
  };

  const isMonthly = selectedListing?.transactionType === 'monthly';

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedListing) throw new Error('거래할 매물을 선택하세요.');
      const buyerContactId = buyer && isContactSelectionValid(buyer) ? await resolveContactId(buyer) : undefined;
      return api.deals.create({
        propertyId,
        listingId: selectedListing.id,
        transactionType: selectedListing.transactionType,
        agreedPrice: parseManwon(agreedPrice) ?? undefined,
        agreedDeposit: parseManwon(agreedDeposit) ?? undefined,
        agreedMonthlyRent: parseManwon(agreedMonthlyRent) ?? undefined,
        buyerContactId,
        memo: memo.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('거래가 생성되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      onCreated?.();
      onOpenChange(false);
    },
    onError: (err) => toast.error(getErrorMessage(err, '거래 생성에 실패했습니다.')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>거래 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">대상 매물 *</Label>
            <Select value={listingId} onValueChange={handleListingChange}>
              <SelectTrigger className="mt-1 h-8 w-full text-sm">
                <SelectValue placeholder="매물 선택" />
              </SelectTrigger>
              <SelectContent>
                {listings.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {(TRANSACTION_TYPE_LABELS as Record<string, string>)[l.transactionType] ??
                      l.transactionType}{' '}
                    · {listingPriceText(l)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isMonthly ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">합의 보증금 (만원)</Label>
                <Input
                  type="number"
                  value={agreedDeposit}
                  onChange={(e) => setAgreedDeposit(e.target.value)}
                  className="mt-1 h-8 text-sm tabular-nums"
                />
              </div>
              <div>
                <Label className="text-xs">합의 월세 (만원)</Label>
                <Input
                  type="number"
                  value={agreedMonthlyRent}
                  onChange={(e) => setAgreedMonthlyRent(e.target.value)}
                  className="mt-1 h-8 text-sm tabular-nums"
                />
              </div>
            </div>
          ) : (
            <div>
              <Label className="text-xs">합의 가격 (만원)</Label>
              <Input
                type="number"
                value={agreedPrice}
                onChange={(e) => setAgreedPrice(e.target.value)}
                className="mt-1 h-8 text-sm tabular-nums"
              />
              {parseManwon(agreedPrice) != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  = {formatMoney(parseManwon(agreedPrice))}
                </p>
              )}
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs">매수/임차 고객 (선택)</Label>
            <ContactSelector value={buyer} onChange={setBuyer} />
          </div>

          <div>
            <Label className="text-xs">메모</Label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 잔금일 협의 중"
              className="mt-1 h-8 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            취소
          </Button>
          <Button size="sm" onClick={() => mutation.mutate()} disabled={!selectedListing || mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            거래 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 6. 매칭 생성 다이얼로그 ──────────────────────────────────────────

export function MatchCreateDialog({
  open,
  onOpenChange,
  listings,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: Listing[];
  onCreated?: () => void;
}) {
  const queryClient = useQueryClient();
  const [listingId, setListingId] = useState('');
  const [buyerSearch, setBuyerSearch] = useState('');
  const [buyerReqId, setBuyerReqId] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (open) {
      setListingId(listings[0]?.id ?? '');
      setBuyerSearch('');
      setBuyerReqId('');
      setMemo('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: buyerData, isFetching } = useQuery({
    queryKey: ['buyer-requirements', 'picker', buyerSearch],
    queryFn: () =>
      api.buyerRequirements.findAll({
        search: buyerSearch.trim() || undefined,
        status: 'active',
        limit: 8,
      }),
    enabled: open,
  });

  const buyerReqs = buyerData?.items ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      api.matches.create({
        listingId,
        buyerReqId,
        memo: memo.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('매칭이 생성되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      onCreated?.();
      onOpenChange(false);
    },
    onError: (err) => toast.error(getErrorMessage(err, '매칭 생성에 실패했습니다.')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>매칭 생성</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">대상 매물 *</Label>
            <Select value={listingId} onValueChange={setListingId}>
              <SelectTrigger className="mt-1 h-8 w-full text-sm">
                <SelectValue placeholder="매물 선택" />
              </SelectTrigger>
              <SelectContent>
                {listings.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {(TRANSACTION_TYPE_LABELS as Record<string, string>)[l.transactionType] ??
                      l.transactionType}{' '}
                    · {listingPriceText(l)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">구매 고객 *</Label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={buyerSearch}
                onChange={(e) => setBuyerSearch(e.target.value)}
                placeholder="고객명 검색"
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-md border">
              {isFetching && buyerReqs.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">검색 중...</p>
              ) : buyerReqs.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <Users className="mx-auto size-5 text-muted-foreground/50" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    활성 구매 고객 조건이 없습니다.
                  </p>
                </div>
              ) : (
                buyerReqs.map((req) => {
                  const budget =
                    req.priceMax != null
                      ? `예산 ${req.priceMin != null ? `${formatMoney(req.priceMin)}~` : '~'}${formatMoney(req.priceMax)}`
                      : req.priceMin != null
                        ? `예산 ${formatMoney(req.priceMin)} 이상`
                        : '예산 미등록';
                  return (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => setBuyerReqId(req.id)}
                      className={cn(
                        'flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/60',
                        buyerReqId === req.id && 'bg-muted',
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{req.contact?.name ?? '고객'}</span>
                        {req.transactionType && (
                          <StatusBadge kind="transactionType" status={req.transactionType} size="sm" />
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">{budget}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs">메모</Label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 평형·가격 조건 부합"
              className="mt-1 h-8 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={!listingId || !buyerReqId || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            매칭 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
