import { formatUnitName } from '@estate-erp/shared';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buyerRequirementQueries } from '@/queries/buyer-requirements';
import { toast } from 'sonner';
import { Building2, Link2, Loader2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Consultation } from '@estate-erp/api-client';
import { formatDate, formatPhone, formatRent } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getInitial } from './-consultation-badges';
import {
  apiErrorMessage,
  CONSULTATION_TYPE_CHOICES,
  placeLabelOf,
} from '../contacts/-detail-cards';
import {
  consultationPurposeOptions,
  formatIntakeState,
  formatListingLabel,
  matchStageLabels,
  transactionTypeLabels,
} from './-consultation-view-utils';

/** datetime-local 칸의 값 ("2026-11-22T14:05", 이 컴퓨터 시간) */
export function toLocalDateTimeInput(value: Date | string = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 상담 방식 고르기: 전화를 받으며 한 번에 누르도록 펼쳐 둔다 (목록 상자 대신 단추 셋). */
export function ConsultationTypeButtons({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="상담 방식" className="flex flex-wrap gap-1.5">
      {CONSULTATION_TYPE_CHOICES.map((choice) => {
        const selected = value === choice.value;
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(choice.value)}
            className={
              selected
                ? 'h-8 rounded-md border border-transparent bg-foreground px-3 text-[13px] font-medium text-background'
                : 'h-8 rounded-md border border-border bg-background px-3 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground'
            }
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

/** 희망 조건의 상태를 사람 말로 (영어 상태 값이 그대로 보이지 않게) */
const BUYER_STATUS_TEXT: Record<string, string> = {
  active: '진행 중',
  matched: '진행 중',
  hold: '보류',
  inactive: '보류',
  completed: '끝남',
};

interface PickedEntity {
  id: string;
  label: string;
  sublabel?: string;
}

export function ConsultationFormDialog({
  open,
  onOpenChange,
  consultation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 있으면 수정 모드 — 서버 제약상 상담유형/내용만 수정 가능 */
  consultation?: Consultation | null;
}) {
  const isEdit = Boolean(consultation);
  const queryClient = useQueryClient();

  const [contact, setContact] = useState<PickedEntity | null>(null);
  const [type, setType] = useState('phone');
  const [purpose, setPurpose] = useState('general');
  const [content, setContent] = useState('');
  /** 상담한 때 (datetime-local). 처음 값과 같으면 보내지 않는다 */
  const [consultedAt, setConsultedAt] = useState('');
  const [initialConsultedAt, setInitialConsultedAt] = useState('');
  const [property, setProperty] = useState<PickedEntity | null>(null);
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [listingId, setListingId] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [buyerReqId, setBuyerReqId] = useState<string | null>(null);

  // 열릴 때 폼 초기화
  useEffect(() => {
    if (!open) return;
    if (consultation) {
      setContact(
        consultation.contact
          ? {
              id: consultation.contact.id,
              label: consultation.contact.name,
              sublabel: consultation.contact.phone ? formatPhone(consultation.contact.phone) : undefined,
            }
          : { id: consultation.contactId, label: '연결된 고객' },
      );
      setType(consultation.type);
      setPurpose(consultation.purpose ?? 'general');
      setContent(consultation.content);
      const when = toLocalDateTimeInput(consultation.createdAt);
      setConsultedAt(when);
      setInitialConsultedAt(when);
    } else {
      setContact(null);
      setType('phone');
      setPurpose('general');
      setContent('');
      const now = toLocalDateTimeInput();
      setConsultedAt(now);
      setInitialConsultedAt(now);
      setProperty(null);
      setIntakeId(null);
      setListingId(null);
      setMatchId(null);
      setBuyerReqId(null);
    }
  }, [open, consultation]);

  // 상담한 때를 바꿨을 때만 보낸다 (그대로면 서버가 지금 시각으로 적는다)
  const consultedAtChanged = Boolean(consultedAt) && consultedAt !== initialConsultedAt;
  const consultedAtIso = consultedAtChanged ? new Date(consultedAt).toISOString() : undefined;
  const isFutureConsultedAt =
    consultedAtChanged && new Date(consultedAt).getTime() > Date.now() + 10 * 60 * 1000;

  // 적은 상담은 연락처(상세 · 목록의 최근 상담)와 프로젝트에도 보인다. 모두 새로 읽게 한다.
  const refreshEverywhere = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['consultations'] }),
      queryClient.invalidateQueries({ queryKey: ['contacts'] }),
    ]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.consultations.create({
        contactId: contact!.id,
        type,
        purpose,
        content: content.trim(),
        consultedAt: consultedAtIso,
        propertyId: property?.id || undefined,
        listingIntakeId: intakeId || undefined,
        listingId: listingId || undefined,
        matchId: matchId || undefined,
        buyerReqId: buyerReqId || undefined,
      }),
    onSuccess: () => {
      toast.success('상담을 기록했습니다.');
      void refreshEverywhere();
      onOpenChange(false);
    },
    onError: (caught) => toast.error(apiErrorMessage(caught, '상담을 기록하지 못했습니다. 잠시 뒤 다시 시도하세요.')),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.consultations.update(consultation!.id, {
        type,
        content: content.trim(),
        consultedAt: consultedAtIso,
      }),
    onSuccess: () => {
      toast.success('상담을 고쳤습니다.');
      void refreshEverywhere();
      void queryClient.invalidateQueries({ queryKey: ['consultation', consultation!.id] });
      onOpenChange(false);
    },
    onError: (caught) => toast.error(apiErrorMessage(caught, '상담을 고치지 못했습니다. 잠시 뒤 다시 시도하세요.')),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSubmit = isEdit
    ? content.trim().length > 0 && !isPending && !isFutureConsultedAt
    : Boolean(contact) && content.trim().length > 0 && !isPending && !isFutureConsultedAt;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent
        className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-[560px]"
        // 전화를 받으며 적다가 창 밖을 잘못 눌러도 적은 내용이 말없이 사라지지 않게 한다 (닫기는 취소 · Esc)
        onInteractOutside={(event) => {
          if (content.trim() && content !== (consultation?.content ?? '')) event.preventDefault();
        }}
      >
        <DialogHeader className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <DialogTitle className="text-base">{isEdit ? '상담 고치기' : '상담 적기'}</DialogTitle>
          <DialogDescription className="text-xs">
            {isEdit
              ? '방식 · 상담한 때 · 내용을 고칩니다. 목적과 연결 항목은 바꿀 수 없습니다.'
              : '고객과 나눈 대화를 기록하고 매물·의뢰·매칭·희망 조건에 연결합니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
          {/* 고객 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              고객 {!isEdit && <span className="text-destructive">*</span>}
            </Label>
            {isEdit ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                {contact?.label}
                {contact?.sublabel && <span className="ml-2 text-xs text-muted-foreground">{contact.sublabel}</span>}
              </div>
            ) : contact ? (
              <SelectedChip label={contact.label} sublabel={contact.sublabel} onClear={() => { setContact(null); setBuyerReqId(null); setMatchId(null); }} />
            ) : (
              <ContactSearchField onSelect={setContact} />
            )}
          </div>

          {/* 방식 / 상담한 때 */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                방식 <span className="text-destructive">*</span>
              </Label>
              <ConsultationTypeButtons value={type} onChange={setType} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="consultation-when" className="text-xs font-semibold text-slate-700">
                상담한 때
              </Label>
              <Input
                id="consultation-when"
                type="datetime-local"
                value={consultedAt}
                max={toLocalDateTimeInput()}
                onChange={(event) => setConsultedAt(event.target.value)}
                className="h-8 text-sm"
              />
              {isFutureConsultedAt && (
                <p className="text-[11.5px] text-destructive">앞으로의 날짜는 업무나 일정으로 남기세요.</p>
              )}
            </div>
          </div>

          {/* 목적 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">목적</Label>
              <Select value={purpose} onValueChange={setPurpose} disabled={isEdit}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {consultationPurposeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 내용 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              상담 내용 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="누구와 어떤 이야기를 했는지 기록합니다. (가격 협의, 방문 일정, 요청 사항 등)"
              className="min-h-28 text-sm"
            />
          </div>

          {/* 컨텍스트 연결 — 생성 모드에서만 */}
          {!isEdit && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Link2 className="size-3.5" />
                컨텍스트 연결 (선택)
              </div>

              {/* 매물(Property) */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-muted-foreground">매물 (호실/장소)</Label>
                {property ? (
                  <SelectedChip
                    label={property.label}
                    sublabel={property.sublabel}
                    onClear={() => {
                      setProperty(null);
                      setIntakeId(null);
                      setListingId(null);
                      setMatchId(null);
                    }}
                  />
                ) : (
                  <PropertySearchField onSelect={setProperty} />
                )}
              </div>

              {property && (
                <>
                  <IntakeSelect propertyId={property.id} value={intakeId} onChange={setIntakeId} />
                  <ListingSelect propertyId={property.id} value={listingId} onChange={setListingId} />
                  <MatchSelect propertyId={property.id} value={matchId} onChange={setMatchId} />
                </>
              )}

              {contact && <BuyerReqSelect contactId={contact.id} value={buyerReqId} onChange={setBuyerReqId} />}

              {!property && !contact && (
                <p className="text-[11px] leading-5 text-muted-foreground">
                  고객을 선택하면 희망 조건을, 매물을 선택하면 의뢰·매물·매칭을 연결할 수 있습니다.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-200 px-5 py-3">
          <Button variant="outline" size="sm" disabled={isPending} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------
// 검색/선택 필드
// ----------------------------------------------------------------

function SelectedChip({
  label,
  sublabel,
  onClear,
}: {
  label: string;
  sublabel?: string;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-background px-2.5 py-1.5">
      <div className="min-w-0">
        <span className="truncate text-sm font-medium text-slate-950">{label}</span>
        {sublabel && <span className="ml-2 text-xs text-muted-foreground">{sublabel}</span>}
      </div>
      <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={onClear}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function ContactSearchField({ onSelect }: { onSelect: (contact: PickedEntity) => void }) {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['consultation-form-contacts', query],
    queryFn: () =>
      api.contacts.findAll({ search: query || undefined, limit: 8, sortBy: 'updatedAt', sortOrder: 'desc' }),
  });
  const contacts = data?.items ?? [];

  return (
    <Command className="rounded-md border border-slate-200 bg-background" shouldFilter={false}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="이름, 전화번호로 고객 검색" />
      <CommandList className="max-h-40">
        <CommandEmpty>{isLoading ? '검색 중...' : '고객이 없습니다.'}</CommandEmpty>
        <CommandGroup>
          {contacts.map((item) => (
            <CommandItem
              key={item.id}
              value={item.id}
              onSelect={() =>
                onSelect({ id: item.id, label: item.name, sublabel: item.phone ? formatPhone(item.phone) : undefined })
              }
              className="items-start"
            >
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium">
                {getInitial(item.name)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{item.name}</div>
                <div className="truncate text-xs tabular-nums text-muted-foreground">
                  {item.phone ? formatPhone(item.phone) : '전화번호 없음'}
                </div>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function PropertySearchField({ onSelect }: { onSelect: (property: PickedEntity) => void }) {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['consultation-form-properties', query],
    queryFn: () => api.properties.findAll({ search: query || undefined, limit: 6 }),
  });
  const properties = data?.items ?? [];

  return (
    <Command className="rounded-md border border-slate-200 bg-background" shouldFilter={false}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="단지명, 주소로 매물 검색" />
      <CommandList className="max-h-40">
        <CommandEmpty>{isLoading ? '검색 중...' : '매물이 없습니다.'}</CommandEmpty>
        <CommandGroup>
          {properties.map((item) => {
            const label = placeLabelOf(item) || '이름 없는 매물';
            return (
              <CommandItem key={item.id} value={item.id} onSelect={() => onSelect({ id: item.id, label })} className="items-start">
                <Building2 className="mt-0.5 size-4 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{label}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.site?.roadAddress ?? item.site?.jibunAddress ?? item.site?.type ?? ''}
                  </div>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function ContextSelect({
  label,
  value,
  onChange,
  options,
  emptyText,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: Array<{ value: string; label: string }>;
  emptyText: string;
}) {
  if (options.length === 0) {
    return (
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
        <p className="rounded-md border border-dashed border-slate-200 bg-background px-2 py-1.5 text-[11px] text-muted-foreground">
          {emptyText}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <Select value={value ?? 'none'} onValueChange={(next) => onChange(next === 'none' ? null : next)}>
        <SelectTrigger size="sm" className="w-full bg-background">
          <SelectValue placeholder="연결 안 함" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">연결 안 함</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function IntakeSelect({
  propertyId,
  value,
  onChange,
}: {
  propertyId: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { data } = useQuery({
    queryKey: ['consultation-form-intakes', propertyId],
    queryFn: () => api.listingIntakes.findAll({ propertyId, includeClosed: true, limit: 20 }),
  });
  const options = (data?.items ?? []).map((intake) => ({
    value: intake.id,
    label: `의뢰 ${formatIntakeState(intake)} · 접수 ${formatDate(intake.receivedAt)}`,
  }));

  return <ContextSelect label="의뢰" value={value} onChange={onChange} options={options} emptyText="이 매물에 등록된 의뢰가 없습니다." />;
}

function ListingSelect({
  propertyId,
  value,
  onChange,
}: {
  propertyId: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { data } = useQuery({
    queryKey: ['consultation-form-listings', propertyId],
    queryFn: () => api.listings.findAll({ propertyId, limit: 20 }),
  });
  const options = (data?.items ?? []).map((listing) => ({
    value: listing.id,
    label:
      listing.transactionType === 'monthly'
        ? `월세 ${formatRent(listing.deposit, listing.monthlyRent)}`
        : formatListingLabel(listing.transactionType, listing.price),
  }));

  return <ContextSelect label="매물 (거래)" value={value} onChange={onChange} options={options} emptyText="이 매물에 등록된 거래 매물이 없습니다." />;
}

function MatchSelect({
  propertyId,
  value,
  onChange,
}: {
  propertyId: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { data: matches = [] } = useQuery({
    queryKey: ['consultation-form-matches', propertyId],
    queryFn: () => api.matches.findAll({ propertyId }),
  });
  const options = matches.map((match) => {
    const stage = matchStageLabels[match.stage] ?? match.stage;
    const buyerName = match.buyerRequirement?.contact?.name;
    return {
      value: match.id,
      label: buyerName ? `${stage} · ${buyerName}` : `매칭 ${stage}`,
    };
  });

  return <ContextSelect label="매칭" value={value} onChange={onChange} options={options} emptyText="이 매물에 연결된 매칭이 없습니다." />;
}

function BuyerReqSelect({
  contactId,
  value,
  onChange,
}: {
  contactId: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { data } = useQuery({
    ...buyerRequirementQueries.list({ contactId, limit: 20 }),
  });
  const options = (data?.items ?? []).map((req) => {
    const type = req.transactionType ? (transactionTypeLabels[req.transactionType] ?? req.transactionType) : '유형 미정';
    return {
      value: req.id,
      label: `${type} · ${req.status === 'active' ? '진행 중' : (BUYER_STATUS_TEXT[req.status] ?? req.status)}`,
    };
  });

  return <ContextSelect label="희망 조건" value={value} onChange={onChange} options={options} emptyText="이 고객의 희망 조건이 없습니다." />;
}
