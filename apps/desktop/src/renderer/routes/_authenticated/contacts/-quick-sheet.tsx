import { formatUnitName } from '@estate-erp/shared';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import { useInspectorFocus } from '@/hooks/use-inspector-focus';
import type {
  BuyerRequirement,
  Consultation,
  ContactDetail,
  ContactRelation,
  PropertyContact,
} from '@estate-erp/api-client';
import {
  Clock3,
  ExternalLink,
  ListTodo,
  Mail,
  MessageSquarePlus,
  Phone,
  Plus,
} from 'lucide-react';
import { api } from '@/lib/api';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { tabResourceKeys } from '@/features/tabs/lib/tabResource';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { formatPhone } from '@/lib/format';
import { ContactTagChip } from '@/components/contacts/contact-tag-chip';
import { useContactTagColors } from './-contact-tag-picker';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
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
  getContactRelationLabel,
  propertyRoleLabels,
  urgencyLabels,
} from './-detail-cards';
import {
  BuyerReqAddDialog,
  ConsultationAddDialog,
  PropertyLinkDialog,
  TaskAddDialog,
} from './-detail-action-dialogs';
import {
  EmptyText,
  PropertyInspectorToolbar,
  SectionTitle,
  TextAction,
} from '../properties/-components/property-inspector-view';

/**
 * 연락처 상세 패널 — 연락처 목록에서 행의 "열기"를 누르면 오른쪽에 열린다.
 * 매물관리의 상세 패널과 같은 방식·같은 틀이다: 화면을 덮지 않고 페이지 오른쪽에 붙고,
 * 위 막대의 확장 버튼으로 전체 화면(/contacts/$id)을 새 탭으로 연다.
 * 라벨/예산/면적 포맷은 ./-detail-cards.tsx 공유.
 */

const buyerStatusTones: Record<string, string> = {
  active: 'bg-[#eef3ed] text-[#44745a]',
  matched: 'bg-[#eef3ed] text-[#44745a]',
  hold: 'bg-[#fbf3db] text-[#8f6b1f]',
  inactive: 'bg-[#fbf3db] text-[#8f6b1f]',
  completed: 'bg-[#f1f1ef] text-[#5f5e5b]',
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

export const CONTACT_INSPECTOR_WIDTH = 584;

/** Esc가 패널이 아니라 떠 있는 대화상자·메뉴를 닫아야 하는 경우 */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

export function ContactInspector({
  contactId,
  closing,
  animate,
  onClose,
  onExited,
}: {
  contactId: string;
  /** 닫히는 중: 미끄러져 나간 뒤 onExited가 불린다 */
  closing: boolean;
  /** 미끄러지는 움직임을 쓸지 (키보드로 열고 닫을 때는 쓰지 않는다) */
  animate: boolean;
  onClose: (animate?: boolean) => void;
  onExited: () => void;
}) {
  const { data: contact, isLoading, isError, refetch } = useQuery({
    queryKey: ['contacts', 'quick-sheet', contactId],
    queryFn: () => api.contacts.findOne(contactId),
  });
  const openOrRevealResource = useTabStore((state) => state.openOrRevealResource);

  // 매물관리 패널과 같다: 전체 화면을 새 탭으로 열고(이미 열려 있으면 그 탭으로 가고) 패널은 닫는다.
  const openInNewTab = () => {
    const route = `/contacts/${contactId}`;
    const meta = getRouteMeta(route);
    openOrRevealResource({
      route,
      kind: meta.kind,
      title: contact?.name || meta.title,
      resourceKey: tabResourceKeys.entity('contact', contactId),
    });
    onClose(false);
  };

  const panelRef = useRef<HTMLElement>(null);
  // 키보드로 열었을 때(미끄러짐 없이 열림)만 포커스를 패널로 옮긴다
  useInspectorFocus(panelRef, !animate, contactId);

  useEffect(() => {
    if (!closing) return;
    // 숨은 탭이나 모션 줄이기 설정에서는 transitionend가 오지 않을 수 있다.
    const timer = window.setTimeout(
      onExited,
      !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240,
    );
    return () => window.clearTimeout(timer);
  }, [closing, animate, onExited]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      event.preventDefault();
      onClose(false);
    };
    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true);
  }, [onClose]);

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      id="contact-inspector"
      data-contact-inspector
      data-property-inspector
      data-state={closing ? 'closed' : 'open'}
      data-motion={animate ? 'slide' : 'none'}
      inert={closing}
      aria-hidden={closing || undefined}
      aria-label="연락처 상세 패널"
      className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col border-l border-border bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.03)] outline-none"
      style={{ width: CONTACT_INSPECTOR_WIDTH, maxWidth: '100%' }}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === 'transform') {
          onExited();
        }
      }}
    >
      <PropertyInspectorToolbar onClose={onClose} onOpenNewTab={openInNewTab} />
      {isLoading ? (
        <ContactSheetSkeleton />
      ) : isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-sm text-muted-foreground">연락처를 불러오지 못했습니다.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            다시 시도
          </Button>
        </div>
      ) : contact ? (
        <ContactSheetContent key={contact.id} contact={contact} />
      ) : (
        <div className="flex flex-1 items-center justify-center px-8 text-sm text-muted-foreground">
          연락처를 찾을 수 없습니다.
        </div>
      )}
    </aside>
  );
}

function ContactSheetSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 px-6 pb-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="space-y-5 border-t border-[#ecebe8] p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

const barButtonClassName =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground disabled:pointer-events-none disabled:opacity-50';

function ContactSheetContent({ contact }: { contact: ContactDetail }) {
  const [quickAction, setQuickAction] = useState<ContactQuickAction>(null);
  const phones = useMemo(() => collectContactPhones(contact), [contact]);
  const primaryPhone = phones[0]?.phone ?? null;
  const visibleTags = contact.tags ?? [];
  const tagColors = useContactTagColors();
  const propertyContacts = contact.propertyContacts ?? [];
  const buyerRequirements = contact.buyerRequirements ?? [];
  const consultations = contact.consultations ?? [];
  const relationships = useMemo(() => mergeContactRelationships(contact), [contact]);
  const notices = useMemo(() => getContactSheetNotices(contact), [contact]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {/* 머리 영역: 이름 → 연락 수단 → 그룹·태그 */}
      <div className="shrink-0 border-b border-[#ecebe8] px-6 pb-4">
        <h2 className="text-[23px] font-bold leading-[1.25] tracking-[-0.025em] text-[#2f2e2a]">
          {contact.name}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-foreground">
          {phones.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Phone className="size-3.5 shrink-0 text-[#a9a7a1]" />
              {formatPhone(primaryPhone)}
              {phones.length > 1 && (
                <span className="text-[#a9a7a1]">외 {phones.length - 1}건</span>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[#a9a7a1]">
              <Phone className="size-3.5" />
              전화번호 없음
            </span>
          )}
          {contact.email && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Mail className="size-3.5 shrink-0 text-[#a9a7a1]" />
              <span className="truncate">{contact.email}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Clock3 className="size-3.5 text-[#a9a7a1]" />
            등록 {formatDateShort(contact.createdAt)}
          </span>
        </div>

        {((contact.groups ?? []).length > 0 || visibleTags.length > 0) && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            {(contact.groups ?? []).map((name) => (
              <span key={`group-${name}`} className={cn(chipClassName, 'border border-border bg-transparent text-[#5f5e5b]')}>
                {name}
              </span>
            ))}
            {visibleTags.map((tag) => (
              <ContactTagChip key={`tag-${tag}`} name={tag} color={tagColors.get(tag)} />
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 pb-10 pt-5">
        <section>
          <SectionTitle count={notices.length || undefined}>지금 확인할 것</SectionTitle>
          {notices.length > 0 ? (
            <ul className="divide-y divide-[#f1f0ec]">
              {notices.map((notice) => (
                <li key={`${notice.title}-${notice.detail}`} className="flex items-start gap-2.5 py-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-[7px] size-1.5 shrink-0 rounded-full',
                      notice.tone === 'danger' && 'bg-[#e03e3e]',
                      notice.tone === 'warning' && 'bg-[#dfab01]',
                      notice.tone === 'neutral' && 'bg-[#9b9a97]',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[#2f2e2a]">{notice.title}</div>
                    <p className="mt-0.5 text-[12.5px] leading-[1.6] text-muted-foreground">
                      {notice.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyText>즉시 확인할 운영 이슈가 없습니다.</EmptyText>
          )}
        </section>

        {phones.length > 1 && (
          <section>
            <SectionTitle count={phones.length}>전화번호</SectionTitle>
            <div className="divide-y divide-[#f1f0ec]">
              {phones.map((phone, index) => (
                <ContactSheetPhoneRow key={phone.key} phone={phone} isFirst={index === 0} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionTitle
            count={propertyContacts.length || undefined}
            action={
              <TextAction
                icon={<Plus />}
                label="매물 연결"
                onClick={() => setQuickAction('propertyLink')}
              />
            }
          >
            연결 매물
          </SectionTitle>
          {propertyContacts.length > 0 ? (
            <div className="divide-y divide-[#f1f0ec]">
              {propertyContacts.map((propertyContact) => (
                <ContactSheetPropertyRow key={propertyContact.id} propertyContact={propertyContact} />
              ))}
            </div>
          ) : (
            <EmptyText>연결된 매물이 없습니다.</EmptyText>
          )}
        </section>

        <section>
          <SectionTitle
            count={buyerRequirements.length || undefined}
            action={
              <TextAction
                icon={<Plus />}
                label="희망조건 추가"
                onClick={() => setQuickAction('buyerReq')}
              />
            }
          >
            매수요건
          </SectionTitle>
          {buyerRequirements.length > 0 ? (
            <>
              <div className="divide-y divide-[#f1f0ec]">
                {buyerRequirements.map((requirement) => (
                  <ContactSheetBuyerReqCard key={requirement.id} requirement={requirement} />
                ))}
              </div>
              <Link to="/customers-table" className={moreLinkClassName}>
                고객 원장에서 보기
                <ExternalLink className="size-3" />
              </Link>
            </>
          ) : (
            <EmptyText>등록된 매수요건이 없습니다.</EmptyText>
          )}
        </section>

        <section>
          <SectionTitle
            count={consultations.length || undefined}
            action={
              <TextAction
                icon={<Plus />}
                label="상담 기록"
                onClick={() => setQuickAction('consultation')}
              />
            }
          >
            최근 상담
          </SectionTitle>
          {consultations.length > 0 ? (
            <>
              <div className="divide-y divide-[#f1f0ec]">
                {consultations.slice(0, 3).map((consultation) => (
                  <ContactSheetConsultationRow key={consultation.id} consultation={consultation} />
                ))}
              </div>
              <Link to="/consultations" className={moreLinkClassName}>
                상담분석에서 전체 보기
                <ExternalLink className="size-3" />
              </Link>
            </>
          ) : (
            <EmptyText>상담 기록이 없습니다.</EmptyText>
          )}
        </section>

        <section>
          <SectionTitle count={relationships.length || undefined}>관계</SectionTitle>
          {relationships.length > 0 ? (
            <div className="divide-y divide-[#f1f0ec]">
              {relationships.map((item) => (
                <ContactSheetRelationRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyText>등록된 관계가 없습니다.</EmptyText>
          )}
        </section>

        <section>
          <SectionTitle>메모</SectionTitle>
          {contact.memo?.trim() ? (
            <p className="whitespace-pre-wrap text-[13px] leading-[1.6] text-[#2f2e2a]">
              {contact.memo.trim()}
            </p>
          ) : (
            <EmptyText>작성된 메모가 없습니다.</EmptyText>
          )}
        </section>
      </div>

      {/* 아래 막대: 이 사람에게 바로 하는 일 (매물 상세 패널의 아래 막대와 같은 자리) */}
      <div className="flex shrink-0 items-center gap-1 border-t border-[#ecebe8] px-6 py-3">
        {primaryPhone ? (
          <a href={`tel:${primaryPhone}`} className={barButtonClassName}>
            <Phone className="size-3.5" />
            전화
          </a>
        ) : (
          <button type="button" disabled className={barButtonClassName}>
            <Phone className="size-3.5" />
            전화번호 없음
          </button>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} className={barButtonClassName}>
            <Mail className="size-3.5" />
            메일
          </a>
        )}
        <button type="button" className={barButtonClassName} onClick={() => setQuickAction('task')}>
          <ListTodo className="size-3.5" />
          후속 업무
        </button>
        <button
          type="button"
          className={cn(
            barButtonClassName,
            'ml-auto bg-[#2f2e2a] px-4 font-medium text-white hover:bg-[#1f1e1b] hover:text-white',
          )}
          onClick={() => setQuickAction('consultation')}
        >
          <MessageSquarePlus className="size-3.5" />
          상담 기록
        </button>
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

/** 작은 꼬리표 (매물 상세 패널의 StatusChip과 같은 크기) */
const chipClassName =
  'inline-flex shrink-0 items-center whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5';

const moreLinkClassName =
  'mt-2 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground';

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
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'truncate text-[13px] tabular-nums',
              isFirst ? 'font-medium text-[#2f2e2a]' : 'text-[#2f2e2a]',
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
  const unitName = formatUnitName(propertyContact.property?.unit);
  const titleLine = unitName ? `${title} · ${unitName}` : title;
  const address =
    propertyContact.property?.site?.roadAddress ??
    propertyContact.property?.site?.jibunAddress ??
    null;

  return (
    <div className="py-2.5">
      {/* 1행: 매물명/호수 (링크 또는 텍스트) */}
      <div className="min-w-0">
        {propertyContact.property ? (
          <Link
            to="/properties/$id"
            params={{ id: propertyContact.propertyId }}
            className="block truncate text-sm font-medium text-[#2f2e2a] hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {titleLine}
          </Link>
        ) : (
          <span className="block truncate text-sm font-medium text-[#2f2e2a]">
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
        <p className="mt-1 truncate text-xs text-muted-foreground">{address}</p>
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
    <div className="py-3">
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
        <div className="shrink-0 text-right text-[11px] text-muted-foreground">
          등록 {formatDateShort(requirement.createdAt)}
          {requirement.nextContactDate && (
            <div className="text-[11px] text-muted-foreground">
              다음 연락 {formatDateShort(requirement.nextContactDate)}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 text-sm font-medium text-[#2f2e2a]">
        {formatBudgetSummary(requirement)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
        <span>{formatAreaSummary(requirement)}</span>
        {regions && <span className="truncate">· {regions}</span>}
      </div>
      {requirement.memo?.trim() && (
        <p className="mt-2 line-clamp-2 border-l-2 border-border pl-2.5 text-[12px] leading-5 text-muted-foreground">
          {requirement.memo.trim()}
        </p>
      )}
    </div>
  );
}

function ContactSheetConsultationRow({ consultation }: { consultation: Consultation }) {
  const siteName = consultation.property?.site?.name;
  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
          {consultationTypeLabels[consultation.type] ?? consultation.type}
        </span>
        <span className="text-[11px] text-muted-foreground">{formatDateTime(consultation.createdAt)}</span>
        {siteName && (
          <span className="text-[11px] text-muted-foreground">· {siteName}</span>
        )}
        {consultation.createdBy?.name && (
          <span className="text-[11px] text-muted-foreground">· {consultation.createdBy.name}</span>
        )}
      </div>
      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[#2f2e2a]">
        {consultation.content}
      </p>
    </div>
  );
}

interface SheetRelationItem {
  id: string;
  relation: ContactRelation;
  counterpartId: string | null;
  counterpartName: string;
  counterpartPhone: string | null;
}

function mergeContactRelationships(contact: ContactDetail): SheetRelationItem[] {
  return [
    ...contact.relationsAsMain.map<SheetRelationItem>((relation) => ({
      id: `main-${relation.id}`,
      relation,
      counterpartId: relation.relatedContact?.id ?? relation.relatedContactId ?? null,
      counterpartName: relation.relatedContact?.name ?? '이름 없음',
      counterpartPhone: relation.relatedContact?.phone ?? null,
    })),
    ...contact.relationsAsRelated.map<SheetRelationItem>((relation) => ({
      id: `related-${relation.id}`,
      relation,
      counterpartId: relation.contact?.id ?? relation.contactId ?? null,
      counterpartName: relation.contact?.name ?? '이름 없음',
      counterpartPhone: relation.contact?.phone ?? null,
    })),
  ];
}

function ContactSheetRelationRow({ item }: { item: SheetRelationItem }) {
  const relationLabel = getContactRelationLabel(item.relation);

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {item.counterpartId ? (
            <Link
              to="/contacts/$id"
              params={{ id: item.counterpartId }}
              className="truncate text-sm font-medium text-[#2f2e2a] hover:underline"
            >
              {item.counterpartName}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium text-[#2f2e2a]">
              {item.counterpartName}
            </span>
          )}
          <span className="rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[11px] text-[#5f5e5b]">
            {relationLabel}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
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
