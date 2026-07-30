import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type {
  BuyerRequirement,
  Consultation,
  ContactDetail,
  ContactRelation,
  PropertyContact,
} from '@estate-erp/api-client';
import {
  AlertCircle,
  Building2,
  Clock3,
  ExternalLink,
  ListTodo,
  Mail,
  MessageSquarePlus,
  Phone,
  Target,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { splitContactTags } from '@/lib/contacts';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SheetSection,
  SheetEmptyState,
  SheetNoticeRow,
  formatDateShort,
  formatDateTime,
  getDaysSince,
  getDaysUntil,
  type QuickSheetNotice,
} from '@/components/quick-sheet';
import {
  buyerStatusLabels,
  consultationTypeLabels,
  formatAreaSummary,
  formatBudgetSummary,
  formatRegionSummary,
  propertyRoleLabels,
  relationTypeLabels,
  urgencyLabels,
} from './-detail-cards';
import {
  BuyerReqAddDialog,
  ConsultationAddDialog,
  PropertyLinkDialog,
  TaskAddDialog,
} from './-detail-action-dialogs';

/**
 * ContactQuickSheet — 연락처 목록 행 클릭 시 우측에서 열리는 빠른 확인 패널.
 * 매물 페이지의 PropertyQuickSheet와 같은 모양. 라벨/예산/면적 포맷은 ./-detail-cards.tsx 공유.
 * 톤 클래스(hex pill)는 DataTable notion variant와 맞춘 시트 전용 스타일.
 */

const buyerStatusTones: Record<string, string> = {
  active: 'bg-[#eef3ed] text-[#44745a]',
  matched: 'bg-[#e7f3f8] text-[#337ea9]',
  completed: 'bg-[#f1f1ef] text-[#5f5e5b]',
  inactive: 'bg-[#f1f1ef] text-[#9b9a97]',
};

const urgencyTones: Record<string, string> = {
  urgent: 'bg-[#fbe4e4] text-[#9f5555]',
  normal: 'bg-[#f1f1ef] text-[#5f5e5b]',
  flexible: 'bg-[#e7f3f8] text-[#337ea9]',
};

const transactionTypeTones: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-[#fdebec] text-[#8f4b46]' },
  jeonse: { label: '전세', className: 'bg-[#e7f3f8] text-[#337ea9]' },
  monthly: { label: '월세', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
};

type ContactQuickAction = 'consultation' | 'task' | 'buyerReq' | 'propertyLink' | null;

export function ContactQuickSheet({
  contactId,
  onClose,
  onNavigateToDetail,
}: {
  contactId: string | null;
  onClose: () => void;
  onNavigateToDetail: (id: string) => void;
}) {
  const { data: contact, isLoading, isError, refetch } = useQuery({
    queryKey: ['contacts', 'quick-sheet', contactId],
    queryFn: () => api.contacts.findOne(contactId as string),
    enabled: Boolean(contactId),
  });

  return (
    <Sheet open={Boolean(contactId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="!w-full !max-w-full !gap-0 overflow-hidden p-0 sm:!max-w-[720px]"
      >
        {contactId && isLoading && <ContactSheetSkeleton />}
        {contactId && !isLoading && isError && (
          <div className="flex h-full flex-col">
            <SheetHeader className="sr-only">
              <SheetTitle>연락처를 불러오지 못했습니다</SheetTitle>
              <SheetDescription>연락처 조회 중 오류가 발생했습니다.</SheetDescription>
            </SheetHeader>
            <EmptyState
              icon={AlertCircle}
              title="연락처를 불러오지 못했습니다"
              description="네트워크 상태를 확인한 뒤 다시 시도하세요."
              className="flex-1"
              action={
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  다시 시도
                </Button>
              }
            />
          </div>
        )}
        {contactId && !isLoading && !isError && contact && (
          <ContactSheetContent contact={contact} onNavigateToDetail={onNavigateToDetail} />
        )}
        {contactId && !isLoading && !isError && !contact && (
          <div className="flex h-full flex-col">
            <SheetHeader className="sr-only">
              <SheetTitle>연락처를 찾을 수 없습니다</SheetTitle>
              <SheetDescription>요청한 연락처가 존재하지 않습니다.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              연락처를 찾을 수 없습니다.
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ContactSheetSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="sr-only">
        <SheetTitle>연락처 빠른 확인</SheetTitle>
        <SheetDescription>연락처 정보를 불러오는 중입니다.</SheetDescription>
      </SheetHeader>
      <div className="space-y-3 border-b px-6 py-5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="space-y-5 p-6">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  );
}

function ContactSheetContent({
  contact,
  onNavigateToDetail,
}: {
  contact: ContactDetail;
  onNavigateToDetail: (id: string) => void;
}) {
  const [quickAction, setQuickAction] = useState<ContactQuickAction>(null);
  const phones = useMemo(() => collectContactPhones(contact), [contact]);
  const primaryPhone = phones[0]?.phone ?? null;
  const { groupTags, customTags } = useMemo(
    () => splitContactTags(contact.tags ?? []),
    [contact.tags],
  );
  const propertyContacts = contact.propertyContacts ?? [];
  const buyerRequirements = contact.buyerRequirements ?? [];
  const consultations = contact.consultations ?? [];
  const relationships = useMemo(() => mergeContactRelationships(contact), [contact]);
  const notices = useMemo(() => getContactSheetNotices(contact), [contact]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <SheetHeader className="space-y-5 border-b border-border px-8 pb-6 pt-5">
        <div className="flex items-center justify-between gap-3 pr-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            빠른 확인
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[12px] text-muted-foreground hover:text-foreground"
            onClick={() => onNavigateToDetail(contact.id)}
          >
            전체 페이지로 열기
            <ExternalLink className="size-3.5" />
          </Button>
        </div>

        <div className="space-y-3">
          <SheetTitle className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-[28px] font-bold leading-tight tracking-[-0.02em] text-foreground">
            <span>{contact.name}</span>
          </SheetTitle>

          {(groupTags.length > 0 || customTags.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {groupTags.map((tag) => (
                <span
                  key={`group-${tag}`}
                  className="rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] font-medium text-[#337ea9]"
                >
                  {tag}
                </span>
              ))}
              {customTags.map((tag) => (
                <span
                  key={`tag-${tag}`}
                  className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <SheetDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {phones.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Phone className="size-3.5 shrink-0" />
                {formatPhone(primaryPhone)}
                {phones.length > 1 && (
                  <span className="text-slate-400">· 외 {phones.length - 1}건</span>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <Phone className="size-3.5" />
                전화번호 없음
              </span>
            )}
            {contact.email && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Mail className="size-3.5 shrink-0" />
                <span className="truncate">{contact.email}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-3.5" />
              등록 {formatDateShort(contact.createdAt)}
            </span>
          </SheetDescription>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-3 text-[13px] font-medium"
            disabled={!primaryPhone}
            asChild={Boolean(primaryPhone)}
          >
            {primaryPhone ? (
              <a href={`tel:${primaryPhone}`}>
                <Phone className="size-3.5" />
                {contact.name} 전화
              </a>
            ) : (
              <span>
                <Phone className="size-3.5" />
                전화번호 없음
              </span>
            )}
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 px-3 text-[13px] font-medium"
            onClick={() => setQuickAction('consultation')}
          >
            <MessageSquarePlus className="size-3.5" />
            상담 기록
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-3 text-[13px] font-medium"
            onClick={() => setQuickAction('task')}
          >
            <ListTodo className="size-3.5" />
            후속 업무
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-3 text-[13px] font-medium"
            onClick={() => setQuickAction('buyerReq')}
          >
            <Target className="size-3.5" />
            구매 희망조건
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-3 text-[13px] font-medium"
            onClick={() => setQuickAction('propertyLink')}
          >
            <Building2 className="size-3.5" />
            매물 연결
          </Button>
          {contact.email && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-3 text-[13px] font-medium"
              asChild
            >
              <a href={`mailto:${contact.email}`}>
                <Mail className="size-3.5" />
                메일 보내기
              </a>
            </Button>
          )}
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
        <SheetSection title="지금 확인할 것">
          {notices.length > 0 ? (
            <div className="space-y-2">
              {notices.map((notice) => (
                <SheetNoticeRow key={`${notice.title}-${notice.detail}`} notice={notice} />
              ))}
            </div>
          ) : (
            <SheetEmptyState text="즉시 확인할 운영 이슈가 없습니다." compact />
          )}
        </SheetSection>

        {phones.length > 1 && (
          <SheetSection title={`전화번호 ${phones.length}`}>
            <div className="divide-y divide-[#eeeeec] rounded-md border border-[#eeeeec]">
              {phones.map((phone, index) => (
                <ContactSheetPhoneRow
                  key={phone.key}
                  phone={phone}
                  isFirst={index === 0}
                />
              ))}
            </div>
          </SheetSection>
        )}

        <SheetSection title={`연결 매물 ${propertyContacts.length}`}>
          {propertyContacts.length > 0 ? (
            <div className="divide-y divide-[#eeeeec] rounded-md border border-[#eeeeec]">
              {propertyContacts.map((propertyContact) => (
                <ContactSheetPropertyRow
                  key={propertyContact.id}
                  propertyContact={propertyContact}
                />
              ))}
            </div>
          ) : (
            <SheetEmptyState text="연결된 매물이 없습니다." compact />
          )}
        </SheetSection>

        <SheetSection title={`매수요건 ${buyerRequirements.length}`}>
          {buyerRequirements.length > 0 ? (
            <div className="grid gap-2">
              {buyerRequirements.map((requirement) => (
                <ContactSheetBuyerReqCard key={requirement.id} requirement={requirement} />
              ))}
              <Link
                to="/buyer-requirements"
                className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-800 hover:underline"
              >
                구매고객 페이지에서 보기
                <ExternalLink className="size-3" />
              </Link>
            </div>
          ) : (
            <SheetEmptyState text="등록된 매수요건이 없습니다." compact />
          )}
        </SheetSection>

        <SheetSection title={`최근 상담 ${consultations.length}`}>
          {consultations.length > 0 ? (
            <div className="space-y-2">
              {consultations.slice(0, 3).map((consultation) => (
                <ContactSheetConsultationRow
                  key={consultation.id}
                  consultation={consultation}
                />
              ))}
              <Link
                to="/consultations"
                className="inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-800 hover:underline"
              >
                상담기록 전체 보기
                <ExternalLink className="size-3" />
              </Link>
            </div>
          ) : (
            <SheetEmptyState text="상담 기록이 없습니다." compact />
          )}
        </SheetSection>

        <SheetSection title={`관계 ${relationships.length}`}>
          {relationships.length > 0 ? (
            <div className="divide-y divide-[#eeeeec] rounded-md border border-[#eeeeec]">
              {relationships.map((item) => (
                <ContactSheetRelationRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <SheetEmptyState text="등록된 관계가 없습니다." compact />
          )}
        </SheetSection>

        <SheetSection title="메모">
          {contact.memo?.trim() ? (
            <div className="rounded-md border border-[#eeeeec] bg-slate-50/60 p-3">
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {contact.memo.trim()}
              </p>
            </div>
          ) : (
            <SheetEmptyState text="작성된 메모가 없습니다." compact />
          )}
        </SheetSection>
      </div>

      <ConsultationAddDialog
        contactId={contact.id}
        contactName={contact.name}
        open={quickAction === 'consultation'}
        onOpenChange={(open) => setQuickAction(open ? 'consultation' : null)}
      />
      <TaskAddDialog
        contactId={contact.id}
        contactName={contact.name}
        open={quickAction === 'task'}
        onOpenChange={(open) => setQuickAction(open ? 'task' : null)}
      />
      <BuyerReqAddDialog
        contactId={contact.id}
        contactName={contact.name}
        open={quickAction === 'buyerReq'}
        onOpenChange={(open) => setQuickAction(open ? 'buyerReq' : null)}
      />
      <PropertyLinkDialog
        contactId={contact.id}
        contactName={contact.name}
        open={quickAction === 'propertyLink'}
        onOpenChange={(open) => setQuickAction(open ? 'propertyLink' : null)}
      />
    </div>
  );
}

interface SheetPhone {
  key: string;
  phone: string;
  label: string | null;
  isPrimary: boolean;
}

function collectContactPhones(contact: ContactDetail): SheetPhone[] {
  const fromPhones = (contact.phones ?? [])
    .filter((phone) => phone.phone)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map((phone) => ({
      key: phone.id,
      phone: phone.phone,
      label: phone.label && phone.label !== 'mobile' ? phone.label : null,
      isPrimary: phone.isPrimary,
    }));

  if (fromPhones.length > 0) return fromPhones;
  if (contact.phone) {
    return [
      {
        key: `legacy-${contact.id}`,
        phone: contact.phone,
        label: null,
        isPrimary: true,
      },
    ];
  }
  return [];
}

function ContactSheetPhoneRow({ phone, isFirst }: { phone: SheetPhone; isFirst: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'truncate text-[13px] tabular-nums',
              isFirst ? 'font-medium text-slate-900' : 'text-slate-700',
            )}
          >
            {formatPhone(phone.phone)}
          </span>
          {phone.isPrimary && (
            <span className="rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] text-[#337ea9]">
              주 연락처
            </span>
          )}
          {phone.label && (
            <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
              {phone.label}
            </span>
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" asChild>
        <a href={`tel:${phone.phone}`} aria-label={`${phone.label ?? '전화'} ${phone.phone}`}>
          <Phone className="size-3.5" />
        </a>
      </Button>
    </div>
  );
}

function ContactSheetPropertyRow({
  propertyContact,
}: {
  propertyContact: PropertyContact;
}) {
  const title = propertyContact.property?.site?.name ?? '연결 매물';
  const unitName = propertyContact.property?.unit?.name;
  const titleLine = unitName ? `${title} · ${unitName}` : title;
  const address =
    propertyContact.property?.site?.roadAddress ??
    propertyContact.property?.site?.jibunAddress ??
    null;

  return (
    <div className="px-3 py-3">
      {/* 1행: 매물명/호수 (링크 또는 텍스트) */}
      <div className="min-w-0">
        {propertyContact.property ? (
          <Link
            to="/properties/$id"
            params={{ id: propertyContact.propertyId }}
            className="block truncate text-sm font-medium text-slate-900 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {titleLine}
          </Link>
        ) : (
          <span className="block truncate text-sm font-medium text-slate-900">
            {titleLine}
          </span>
        )}
      </div>
      {/* 2행: 역할/상태 배지 */}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
          {propertyRoleLabels[propertyContact.role] ?? propertyContact.role}
        </span>
        {propertyContact.isPrimary && (
          <span className="rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] text-[#337ea9]">
            주 연락처
          </span>
        )}
        {propertyContact.isResident && (
          <span className="rounded-[4px] bg-[#eef3ed] px-1.5 py-0.5 text-[11px] text-[#44745a]">
            거주중
          </span>
        )}
      </div>
      {/* 3행: 주소 (있을 때) */}
      {address && (
        <p className="mt-1 truncate text-xs text-slate-500">{address}</p>
      )}
    </div>
  );
}

function ContactSheetBuyerReqCard({ requirement }: { requirement: BuyerRequirement }) {
  const transaction = requirement.transactionType
    ? transactionTypeTones[requirement.transactionType]
    : null;
  const statusClassName =
    buyerStatusTones[requirement.status] ?? 'bg-[#f1f1ef] text-[#5f5e5b]';
  const urgencyClassName =
    urgencyTones[requirement.urgency] ?? 'bg-[#f1f1ef] text-[#5f5e5b]';
  const regions = formatRegionSummary(requirement);

  return (
    <div className="rounded-md border border-border bg-white p-3 transition-colors hover:bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5',
              statusClassName,
            )}
          >
            {buyerStatusLabels[requirement.status] ?? requirement.status}
          </span>
          <span
            className={cn(
              'rounded-[4px] px-1.5 py-0.5 text-[11px] leading-5',
              urgencyClassName,
            )}
          >
            {urgencyLabels[requirement.urgency] ?? requirement.urgency}
          </span>
          {transaction && (
            <span
              className={cn(
                'rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5',
                transaction.className,
              )}
            >
              {transaction.label}
            </span>
          )}
        </div>
        <div className="shrink-0 text-right text-[11px] text-slate-500">
          등록 {formatDateShort(requirement.createdAt)}
          {requirement.nextContactDate && (
            <div className="text-[11px] text-slate-500">
              다음 연락 {formatDateShort(requirement.nextContactDate)}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 text-sm font-medium text-slate-900">
        {formatBudgetSummary(requirement)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-slate-500">
        <span>{formatAreaSummary(requirement)}</span>
        {regions && <span className="truncate">· {regions}</span>}
      </div>
      {requirement.memo?.trim() && (
        <p className="mt-2 line-clamp-2 border-l-2 border-border pl-2.5 text-[12px] leading-5 text-slate-500">
          {requirement.memo.trim()}
        </p>
      )}
    </div>
  );
}

function ContactSheetConsultationRow({ consultation }: { consultation: Consultation }) {
  const siteName = consultation.property?.site?.name;
  return (
    <div className="rounded-md border border-[#eeeeec] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
          {consultationTypeLabels[consultation.type] ?? consultation.type}
        </span>
        <span className="text-[11px] text-slate-500">{formatDateTime(consultation.createdAt)}</span>
        {siteName && (
          <span className="text-[11px] text-slate-500">· {siteName}</span>
        )}
        {consultation.createdBy?.name && (
          <span className="text-[11px] text-slate-500">· {consultation.createdBy.name}</span>
        )}
      </div>
      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
        {consultation.content}
      </p>
    </div>
  );
}

interface SheetRelationItem {
  id: string;
  direction: '연결함' | '연결됨';
  relation: ContactRelation;
  counterpartId: string | null;
  counterpartName: string;
  counterpartPhone: string | null;
}

function mergeContactRelationships(contact: ContactDetail): SheetRelationItem[] {
  return [
    ...contact.relationsAsMain.map<SheetRelationItem>((relation) => ({
      id: `main-${relation.id}`,
      direction: '연결함',
      relation,
      counterpartId: relation.relatedContact?.id ?? relation.relatedContactId ?? null,
      counterpartName: relation.relatedContact?.name ?? '이름 없음',
      counterpartPhone: relation.relatedContact?.phone ?? null,
    })),
    ...contact.relationsAsRelated.map<SheetRelationItem>((relation) => ({
      id: `related-${relation.id}`,
      direction: '연결됨',
      relation,
      counterpartId: relation.contact?.id ?? relation.contactId ?? null,
      counterpartName: relation.contact?.name ?? '이름 없음',
      counterpartPhone: relation.contact?.phone ?? null,
    })),
  ];
}

function ContactSheetRelationRow({ item }: { item: SheetRelationItem }) {
  const relationLabel =
    item.relation.label ||
    relationTypeLabels[item.relation.relationType] ||
    item.relation.relationType;

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {item.counterpartId ? (
            <Link
              to="/contacts/$id"
              params={{ id: item.counterpartId }}
              className="truncate text-sm font-medium text-slate-900 hover:underline"
            >
              {item.counterpartName}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium text-slate-900">
              {item.counterpartName}
            </span>
          )}
          <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
            {relationLabel}
          </span>
          <span className="rounded-[4px] bg-transparent px-1 py-0.5 text-[11px] text-slate-400">
            {item.direction}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {item.counterpartPhone ? formatPhone(item.counterpartPhone) : '연락처 없음'}
          {item.relation.memo ? ` · ${item.relation.memo}` : ''}
        </p>
      </div>
      {item.counterpartId && (
        <Button variant="ghost" size="icon-sm" asChild>
          <Link
            to="/contacts/$id"
            params={{ id: item.counterpartId }}
            aria-label={`${item.counterpartName} 상세 보기`}
          >
            <ExternalLink className="size-3.5" />
          </Link>
        </Button>
      )}
    </div>
  );
}

/**
 * "지금 확인할 것" 섹션의 알림 생성.
 * 룰:
 *  - 활성 BuyerRequirement 중 nextContactDate가 지났으면 danger
 *  - nextContactDate가 7일 이내면 warning
 *  - 활성 BuyerRequirement가 있는데 최근 30일 내 상담이 0이면 warning
 *  - 모든 상담이 60일 이상 지났으면 neutral
 *  - 활성 매수요건이 있는데 PropertyContact가 0이면 neutral
 */
function getContactSheetNotices(contact: ContactDetail): QuickSheetNotice[] {
  const notices: QuickSheetNotice[] = [];
  const buyerRequirements = contact.buyerRequirements ?? [];
  const consultations = contact.consultations ?? [];
  const propertyContacts = contact.propertyContacts ?? [];
  const activeBuyerReqs = buyerRequirements.filter((req) => req.status === 'active');

  // 1) 연락 지연
  const overdueReqs = activeBuyerReqs.filter((req) => {
    if (!req.nextContactDate) return false;
    return getDaysUntil(req.nextContactDate) < 0;
  });
  if (overdueReqs.length > 0) {
    const oldest = overdueReqs.reduce((acc, req) => {
      const accDays = getDaysUntil(acc.nextContactDate);
      const reqDays = getDaysUntil(req.nextContactDate);
      return reqDays < accDays ? req : acc;
    });
    const daysAgo = Math.abs(getDaysUntil(oldest.nextContactDate));
    notices.push({
      title: '다음 연락 예정일 지남',
      detail: `매수요건 ${overdueReqs.length}건 중 ${daysAgo}일 지난 건이 있습니다.`,
      tone: 'danger',
    });
  }

  // 2) 연락 임박 (overdue가 아닌 활성건 중 7일 이내)
  const upcomingReqs = activeBuyerReqs.filter((req) => {
    if (!req.nextContactDate) return false;
    const days = getDaysUntil(req.nextContactDate);
    return days >= 0 && days <= 7;
  });
  if (upcomingReqs.length > 0 && overdueReqs.length === 0) {
    notices.push({
      title: '다음 연락 임박',
      detail: `매수요건 ${upcomingReqs.length}건이 7일 이내 연락 예정입니다.`,
      tone: 'warning',
    });
  }

  // 3) 활성 매수요건 있는데 최근 상담 없음
  if (activeBuyerReqs.length > 0) {
    const recentConsultation = consultations[0];
    const daysSinceLastConsult = recentConsultation
      ? getDaysSince(recentConsultation.createdAt)
      : null;
    if (daysSinceLastConsult === null || daysSinceLastConsult > 30) {
      notices.push({
        title: '최근 상담 없음',
        detail:
          recentConsultation === undefined
            ? `활성 매수요건 ${activeBuyerReqs.length}건이 있지만 상담 기록이 없습니다.`
            : `마지막 상담이 ${daysSinceLastConsult}일 전입니다.`,
        tone: 'warning',
      });
    }
  }

  // 4) 활성 매수요건 있는데 연결 매물 없음
  if (activeBuyerReqs.length > 0 && propertyContacts.length === 0) {
    notices.push({
      title: '연결된 매물 없음',
      detail: `활성 매수요건 ${activeBuyerReqs.length}건이 있는데 연결된 매물이 없어 추적이 어렵습니다.`,
      tone: 'neutral',
    });
  }

  // 5) 상담이 모두 60일+ 경과 (활성 매수요건 없는 경우만, 중복 회피)
  if (activeBuyerReqs.length === 0 && consultations.length > 0) {
    const latest = consultations[0];
    const days = getDaysSince(latest.createdAt);
    if (days !== null && days >= 60) {
      notices.push({
        title: '오랜 미접촉 연락처',
        detail: `마지막 상담이 ${days}일 전입니다. 후속 연락이 필요한지 확인해 보세요.`,
        tone: 'neutral',
      });
    }
  }

  return notices.slice(0, 5);
}
