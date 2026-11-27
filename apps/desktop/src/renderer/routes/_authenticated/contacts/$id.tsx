import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import {
  ApiError,
  type Consultation,
  type ContactDetail,
  type Party,
  type PropertyContact,
} from '@estate-erp/api-client';
import {
  ContactKind,
  ConsultationScope,
  formatUnitName,
  PartyKind,
} from '@estate-erp/shared';
import {
  AlertCircle,
  BookUser,
  Building2,
  CalendarPlus,
  Clock3,
  Combine,
  EllipsisVertical,
  Globe,
  Home,
  Mail,
  MessageSquareText,
  NotebookPen,
  Pencil,
  Phone,
  Plus,
  Tag as TagIcon,
  Target,
  Trash2,
  UserSearch,
  Users,
  UsersRound,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useElementWidth } from '@/hooks/use-element-width';
import { useTabTitle } from '@/hooks/use-tab-title';
import { ConfirmDialog, EmptyState } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { CopyPhone } from '../properties/-detail/brief';
import { getTransactionTypeMeta } from '../properties/-detail/model';
import {
  DOC_WIDE_LAYOUT,
  DocProp,
  H2,
  nb,
  Tag,
} from '../properties/-detail/ui';
import { ConsultationFormDialog } from '../consultations/-consultation-form-dialog';
import {
  formatConsultationClock,
  formatConsultationDay,
  formatConsultationWhen,
  splitConsultationTag,
} from '../consultations/-consultation-list-model';
import { ContactDeleteDialog } from './-contact-delete-dialog';
import { ContactMergeDialog } from './-contact-merge-dialog';
import { ContactNameFill, isPlaceholderContactName } from './-contact-name';
import { ContactProjectsSection } from '../projects/-contact-projects';
import { TaskCreateDialog } from '../tasks/-task-create-dialog';
import { ConsultationComposer } from './-consultation-composer';
import { ContactJobsSection } from './-contact-jobs';
import {
  ContractsSection,
  OpenTasksSection,
  UpcomingEventsSection,
  soldPropertyIds,
} from './-contact-overview';
import {
  apiErrorMessage,
  placeLabelOf,
  consultationTypeLabels,
  contactKindLabels,
  propertyRoleLabels,
  type PartyDisplayItem,
} from './-detail-cards';
import {
  ContactEditDialog,
  ContactTagBadges,
  PartyAddDialog,
  PartyEditDialog,
  PartyInfoEditDialog,
  PartyMemberAddDialog,
  type PartyCreateTab,
} from './-detail-dialogs';
import {
  ConsultationAddDialog,
  PropertyLinkDialog,
} from './-detail-action-dialogs';
import { ContactPartySection } from './-party-section';
import { PartyStructureModal } from './-party-structure-modal';

/**
 * 연락처 상세.
 *
 * 이 화면의 물음: "이 사람은 누구이고, 우리와 무슨 일이 걸려 있고, 마지막에 무슨 이야기를 했나."
 *
 * 짜임은 프로젝트 상세와 같다(사용자 요청, 2026-11-22): Notion 문서의 읽는 순서 + 매물 상세의 부품.
 * 위에 얇은 줄(어디인지 + 자주 쓰는 작업), 본문 맨 위에 큰 이름과 속성을 한 줄씩(전화 · 이메일 · 그룹 ·
 * 태그 · 등록), 선, 메모. 그 아래 본문은 프로젝트 → 세대 · 법인 소속 → 걸린 일(거래와 찾는 집, 줄마다 단계 띠)
 * → 일정 · 업무 → 소유 매물 → 계약서 순서다(사용자 결정 2026-11-24: 프로젝트가 맨 앞, 일의 흐름이 띠로 보이게).
 * 오른쪽 열은 상담 기록(왼쪽 가장자리를 끌어 너비를 바꾼다)이고 화면이 좁으면 본문 맨 아래로 들어온다 — 읽는 동안 "마지막에 무슨 이야기를
 * 했나"가 늘 옆에 보인다. 단추 · 꼬리표 · 구역 제목은 매물 상세의 것(nb · Tag · H2)을 쓴다.
 *
 * 고치는 일은 예전과 같이 대화창에서 한다(이름 · 전화 · 그룹 · 태그 · 메모는 "수정" 창 하나에 묶여 있다).
 */
export const Route = createFileRoute('/_authenticated/contacts/$id')({
  component: ContactDetailPage,
});

type DialogKind =
  | 'edit'
  | 'relation'
  | 'consultation'
  | 'task'
  | 'propertyLink'
  | 'delete'
  | 'merge'
  | null;

function ContactDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = Route.useParams();
  const [openDialog, setOpenDialog] = useState<DialogKind>(null);
  const [editAddPhone, setEditAddPhone] = useState(false);
  const [partyCreateTab, setPartyCreateTab] = useState<PartyCreateTab | undefined>(undefined);
  const [structureModalOpen, setStructureModalOpen] = useState(false);
  const [structureInitialPartyId, setStructureInitialPartyId] = useState<string | null>(null);
  const [partyToEdit, setPartyToEdit] = useState<Party | null>(null);
  const [partyToDelete, setPartyToDelete] = useState<Party | null>(null);
  const [partyForAddMember, setPartyForAddMember] = useState<Party | null>(null);
  const [partyItemToEdit, setPartyItemToEdit] = useState<PartyDisplayItem | null>(null);
  const [partyItemToDelete, setPartyItemToDelete] = useState<PartyDisplayItem | null>(null);
  const [consultScope, setConsultScope] = useState<'self' | 'party'>('self');
  /** 합치기 창을 지우기에서 열었으면 고른 쪽을 남기는 것이 처음 값이다 */
  const [mergeKeep, setMergeKeep] = useState<'current' | 'other'>('current');

  const contactQuery = useQuery({
    queryKey: ['contacts', id],
    queryFn: () => api.contacts.findOne(id),
    // 없는 연락처(404)와 형식이 틀린 주소(400)는 다시 물어도 같다. 바로 "찾을 수 없습니다"를 보인다
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.statusCode === 404 || error.statusCode === 400)) return false;
      return failureCount < 2;
    },
  });
  const contact = contactQuery.data;
  // 링크로 연 탭은 처음에 "연락처 상세"로만 보인다. 불러온 뒤 손님 이름으로 바꾼다.
  useTabTitle(contact?.name);

  // 이 사람과 한 일: 거래 · 계약서 · 연결한 매물 · 다가오는 임장 · 열린 업무
  const overviewQuery = useQuery({
    queryKey: ['contacts', id, 'overview'],
    queryFn: () => api.contacts.getOverview(id),
    enabled: Boolean(contact),
  });
  const overview = overviewQuery.data;

  const { data: propertyContacts = [], isLoading: propertyContactsLoading } = useQuery({
    queryKey: ['contacts', id, 'property-contacts'],
    queryFn: () => api.contacts.getPropertyContacts(id),
    enabled: Boolean(contact),
  });

  const { data: buyerRequirements = [], isLoading: buyerRequirementsLoading } = useQuery({
    queryKey: ['contacts', id, 'buyer-requirements'],
    queryFn: () => api.contacts.getBuyerRequirements(id),
    enabled: Boolean(contact),
  });

  const { data: consultations = [], isLoading: consultationsLoading } = useQuery({
    queryKey: ['contacts', id, 'consultations', consultScope],
    queryFn: () => api.contacts.getConsultations(id, consultScope),
    enabled: Boolean(contact),
  });

  const parties = useMemo(() => {
    if (!contact) return [];
    const fromParties = contact.parties?.items ?? [];
    if (fromParties.length > 0) return fromParties;
    return contact.organizationParty ? [contact.organizationParty] : [];
  }, [contact]);

  const existingHousehold = contact?.parties?.household ?? null;
  const existingOrgParty =
    contact?.kind === ContactKind.ORGANIZATION
      ? (parties[0] ?? contact.organizationParty ?? null)
      : null;

  const finishDelete = async () => {
    setOpenDialog(null);
    toast.success('연락처를 지웠습니다.');
    // 화면을 먼저 떠난 뒤 목록을 새로 읽는다. 지운 사람의 상세 조회는 다시 읽으면 없는 연락처라 버린다.
    await navigate({ to: '/contacts' });
    queryClient.removeQueries({ queryKey: ['contacts', id] });
    void queryClient.invalidateQueries({ queryKey: ['contacts'] });
  };

  const removePartyMemberMutation = useMutation({
    mutationFn: (item: PartyDisplayItem) =>
      api.parties.removeMember(item.partyId, item.memberId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('소속 연결을 뺐습니다.');
      setPartyItemToDelete(null);
    },
    onError: (caught) => {
      toast.error(apiErrorMessage(caught, '소속 연결을 빼지 못했습니다. 잠시 뒤 다시 시도하세요.'));
    },
  });

  const deletePartyMutation = useMutation({
    mutationFn: (party: Party) => api.parties.deleteParty(party.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('파티를 삭제했습니다.');
      setPartyToDelete(null);
      if (parties.length <= 1) {
        setStructureModalOpen(false);
      }
    },
    onError: (caught) => {
      toast.error(apiErrorMessage(caught, '파티를 삭제하지 못했습니다. 잠시 뒤 다시 시도하세요.'));
    },
  });

  const [rootRef, rootWidth] = useElementWidth<HTMLDivElement>();
  const wide = rootWidth === 0 || rootWidth >= DOC_WIDE_LAYOUT;
  const backToList = () => void navigate({ to: '/contacts' });

  if (contactQuery.isLoading) {
    return (
      <PageShell onBack={backToList}>
        <div className="mx-auto w-full max-w-[900px] space-y-4 px-9 pt-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-36 w-full max-w-[520px]" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageShell>
    );
  }

  const isNotFound =
    contactQuery.error instanceof ApiError &&
    (contactQuery.error.statusCode === 404 || contactQuery.error.statusCode === 400);

  if (contactQuery.isError && !isNotFound) {
    return (
      <PageShell onBack={backToList}>
        <EmptyState
          icon={AlertCircle}
          title="연락처를 불러오지 못했습니다"
          description="네트워크 상태를 확인한 뒤 다시 시도하세요."
          className="flex-1"
          action={
            <Button variant="outline" onClick={() => void contactQuery.refetch()}>
              다시 시도
            </Button>
          }
        />
      </PageShell>
    );
  }

  if (isNotFound || !contact) {
    return (
      <PageShell onBack={backToList}>
        <EmptyState
          icon={UserSearch}
          title="연락처를 찾을 수 없습니다"
          description="지워졌거나 합쳐진 연락처, 또는 잘못된 주소입니다."
          className="flex-1"
          action={
            <Button variant="outline" asChild>
              <Link to="/contacts">연락처로 가기</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  // 이 사람이 매도인으로 잔금까지 끝낸 집 — 연결 매물 카드에 "판 집"으로 표시한다
  const soldIds = soldPropertyIds(overview?.deals ?? []);

  // 상담 기록에서 본인 외 소속 구성원(세대·법인) 상담에 붙일 역할 이름
  const partyMemberLabels = new Map<string, string>();
  for (const party of parties) {
    if (
      party.organizationContactId &&
      party.organizationContactId !== contact.id &&
      !partyMemberLabels.has(party.organizationContactId)
    ) {
      partyMemberLabels.set(party.organizationContactId, '법인');
    }
    for (const member of party.members) {
      if (member.contactId === contact.id) continue;
      if (!partyMemberLabels.has(member.contactId)) {
        partyMemberLabels.set(
          member.contactId,
          member.roleLabel || (party.kind === 'household' ? '세대원' : '법인'),
        );
      }
    }
  }

  const phones = collectDetailPhones(contact);
  const primaryPhone = phones[0] ?? null;
  const tags = contact.tags.filter((tag) => Boolean(tag));
  const groups = contact.groups ?? [];

  // 오른쪽 열(좁은 화면에서는 본문 맨 아래로): 상담 기록. 프로젝트는 본문 맨 앞에 둔다.
  const consultationRecords = (compact: boolean) => (
    <ConsultationRecords
      contactId={contact.id}
      contactName={contact.name}
      consultations={consultations}
      hasParties={parties.length > 0}
      scope={consultScope}
      onScopeChange={setConsultScope}
      partyMemberLabels={partyMemberLabels}
      loading={consultationsLoading}
      onAdd={() => setOpenDialog('consultation')}
      compact={compact}
    />
  );

  return (
    <>
      <div
        ref={rootRef}
        data-contact-detail
        className="-m-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-[#37352f]"
      >
        {/* 위 줄: 왼쪽은 어디인지(연락처 / 이 사람), 오른쪽은 자주 쓰는 작업 */}
        <header
          data-contact-detail-header
          className="flex h-[46px] shrink-0 items-center gap-2 border-b border-[#e9e9e7] bg-white pl-4 pr-5"
        >
          <nav aria-label="위치" className="flex min-w-0 flex-1 items-center gap-0.5 text-[14px]">
            <Link to="/contacts" className={nb.ghost}>
              <BookUser />
              연락처
            </Link>
            <span className="text-[#37352f]/25">/</span>
            <span className="min-w-0 truncate px-2 text-[#37352f]" title={contact.name}>
              {contact.name}
            </span>
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            {primaryPhone && (
              <a
                href={`tel:${primaryPhone.phone}`}
                className={nb.ghost}
                title={`${contact.name}에게 전화`}
              >
                <Phone />
                전화
              </a>
            )}
            <button type="button" className={nb.line} onClick={() => setOpenDialog('edit')}>
              <Pencil />
              수정
            </button>
            <button type="button" className={nb.solid} onClick={() => setOpenDialog('consultation')}>
              <NotebookPen />
              상담 적기
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={nb.icon} aria-label={`${contact.name} 작업 메뉴`}>
                  <EllipsisVertical />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => setOpenDialog('task')}>
                  <CalendarPlus className="size-3.5" />
                  업무 추가
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/buyer-requirements/new" search={{ contactId: contact.id, from: 'contact' }}>
                    <Target className="size-3.5" />
                    희망매물 만들기
                  </Link>
                </DropdownMenuItem>
                {/* 이 사람을 소유자로 채운 매물 등록 화면 (집주인이 집을 내놓을 때) */}
                <DropdownMenuItem asChild>
                  <Link to="/properties/new" search={{ ownerContactId: contact.id }}>
                    <Home className="size-3.5" />
                    매물 등록
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOpenDialog('propertyLink')}>
                  <Building2 className="size-3.5" />
                  소유 매물 연결
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOpenDialog('relation')}>
                  <Users className="size-3.5" />
                  {contact.kind === ContactKind.ORGANIZATION ? '법인 담당자 추가' : '세대 · 법인 추가'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    setMergeKeep('current');
                    setOpenDialog('merge');
                  }}
                >
                  <Combine className="size-3.5" />
                  다른 연락처와 합치기
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setOpenDialog('delete')}>
                  <Trash2 className="size-3.5" />
                  삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div data-contact-scroller className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[900px] px-9 pb-16 pt-2">
              {/* 문서의 머리: 이름, 그 아래 속성을 한 줄씩 */}
              {isPlaceholderContactName(contact.name) ? (
                // 이름을 모르는 손님: 임시 이름(번호 끝 네 자리)은 흐리게 두고 바로 이름을 넣게 한다
                <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="text-[32px] font-bold leading-[1.25] tracking-[-0.028em] text-[#37352f]/40">
                    {contact.name}
                  </h1>
                  <ContactNameFill contactId={contact.id} />
                  <span className="basis-full text-[13px] text-[#37352f]/45">
                    이름을 모르는 손님입니다. 번호 끝 네 자리로 저장해 두었습니다.
                  </span>
                </div>
              ) : (
                <div className="mt-5 flex flex-wrap items-center gap-2.5">
                  <h1 className="text-[32px] font-bold leading-[1.25] tracking-[-0.028em] text-[#37352f] [overflow-wrap:anywhere]">
                    {contact.name}
                  </h1>
                  {contact.kind === ContactKind.ORGANIZATION && (
                    <Tag tone="gray">{contactKindLabels.organization}</Tag>
                  )}
                </div>
              )}
              <dl data-contact-props className="mt-3">
                {contact.kind === ContactKind.ORGANIZATION && (
                  <DocProp icon={<Building2 />} label="사업자번호">
                    {contact.businessRegNo ? (
                      <span className="px-1.5 tabular-nums">{contact.businessRegNo}</span>
                    ) : (
                      <span className="px-1.5 text-[#37352f]/45">없음</span>
                    )}
                  </DocProp>
                )}
                <DocProp icon={<Phone />} label="전화" align="start">
                  <div className="flex flex-col gap-1 px-1.5">
                    {phones.length === 0 ? (
                      <span className="text-[#37352f]/45">전화번호 없음</span>
                    ) : (
                      phones.map((phone) => (
                        <span key={phone.key} className="flex min-w-0 items-center gap-1.5">
                          <CopyPhone phone={phone.phone} className="text-[#37352f]" />
                          {phone.label && (
                            <Tag className="text-[12px]">{phone.label}</Tag>
                          )}
                          {phone.isPrimary && phones.length > 1 && (
                            <Tag tone="blue" className="text-[12px]">주 번호</Tag>
                          )}
                        </span>
                      ))
                    )}
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-[#37352f]/60 hover:text-[#37352f] hover:underline"
                        onClick={() => {
                          setEditAddPhone(true);
                          setOpenDialog('edit');
                        }}
                      >
                        <Plus className="size-3" />
                        번호 추가
                      </button>
                      {phones.length > 0 && (
                        <button
                          type="button"
                          className="text-[12px] text-[#37352f]/50 hover:text-[#37352f] hover:underline"
                          onClick={() => {
                            setEditAddPhone(false);
                            setOpenDialog('edit');
                          }}
                        >
                          수정
                        </button>
                      )}
                    </div>
                  </div>
                </DocProp>
                <DocProp icon={<Mail />} label="이메일">
                  {contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      className="truncate px-1.5 underline-offset-2 hover:underline"
                    >
                      {contact.email}
                    </a>
                  ) : (
                    <span className="px-1.5 text-[#37352f]/45">없음</span>
                  )}
                </DocProp>
                <DocProp icon={<UsersRound />} label="그룹">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5 px-1.5">
                    <ContactTagBadges tags={[]} groups={groups} />
                    {groups.length === 0 && <span className="text-[#37352f]/45">속한 그룹 없음</span>}
                  </span>
                </DocProp>
                <DocProp icon={<TagIcon />} label="태그">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5 px-1.5">
                    <ContactTagBadges tags={tags} />
                    {tags.length === 0 && <span className="text-[#37352f]/45">태그 없음</span>}
                  </span>
                </DocProp>
                <DocProp icon={<Clock3 />} label="등록">
                  <span className="px-1.5 tabular-nums">
                    {formatDate(contact.createdAt)}
                    <span className="text-[#37352f]/45">
                      {' '}
                      · 마지막 수정 {formatConsultationWhen(contact.updatedAt)}
                    </span>
                  </span>
                </DocProp>
              </dl>

              {/* 속성과 본문 사이의 선. 그 아래 첫 글이 메모다. */}
              <div data-contact-memo className="mt-3 border-t border-[#e9e9e7] pt-3">
                {contact.memo ? (
                  <p className="whitespace-pre-wrap break-keep text-[15px] leading-[1.65] text-[#37352f] [overflow-wrap:anywhere]">
                    {contact.memo}
                  </p>
                ) : (
                  <button
                    type="button"
                    className="-mx-1.5 rounded px-1.5 py-1 text-[15px] text-[#37352f]/45 hover:bg-[#37352f]/[0.04]"
                    onClick={() => setOpenDialog('edit')}
                  >
                    메모 — 이 사람에 대해 알아 둘 것을 적어 두세요
                  </button>
                )}
              </div>

              <ContactProjectsSection contact={contact} />

              <ContactPartySection
                contact={contact}
                parties={parties}
                deletingMemberKey={
                  removePartyMemberMutation.isPending && partyItemToDelete
                    ? partyItemToDelete.id
                    : null
                }
                onOpenStructureModal={(partyId) => {
                  setStructureInitialPartyId(partyId ?? null);
                  setStructureModalOpen(true);
                }}
                onOpenCreateParty={(defaultTab) => {
                  setPartyCreateTab(defaultTab);
                  setOpenDialog('relation');
                }}
                onEditParty={(party) => setPartyToEdit(party)}
                onDeleteParty={(party) => setPartyToDelete(party)}
                onAddMember={(party) => setPartyForAddMember(party)}
                onEditMember={(item) => setPartyItemToEdit(item)}
                onRemoveMember={(item) => setPartyItemToDelete(item)}
              />

              {/* 걸린 일: 거래와 찾는 집을 한 구역에, 줄마다 단계 띠. 내용이 없으면 그리지 않는다 */}
              {overview && (
                <ContactJobsSection
                  contactId={contact.id}
                  contactName={contact.name}
                  deals={overview.deals}
                  ownerMatches={overview.matches.filter((match) => match.side === 'seller')}
                  requirements={buyerRequirements}
                  requirementsLoading={buyerRequirementsLoading}
                  newRequirementAction={
                    <Link
                      to="/buyer-requirements/new"
                      search={{ contactId: contact.id, from: 'contact' }}
                      className={nb.ghost}
                      data-contact-new-requirement
                    >
                      <Plus />
                      희망매물 만들기
                    </Link>
                  }
                />
              )}
              {overview && (
                <>
                  <UpcomingEventsSection events={overview.events} />
                  <OpenTasksSection tasks={overview.tasks} onAdd={() => setOpenDialog('task')} />
                </>
              )}
              {overviewQuery.isError && (
                <p className="mt-4 text-[13px] text-[rgb(203,107,31)]">
                  거래 · 계약서 · 임장 · 업무를 불러오지 못했습니다.{' '}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-[#37352f]"
                    onClick={() => void overviewQuery.refetch()}
                  >
                    다시 시도
                  </button>
                </p>
              )}

              {/* 처음 등록한 사람(찾는 집도, 연결한 매물도, 거래도 없음): 전화를 끊고 다음에 할 일을 이 자리에서 고르게 한다.
                  예전에는 희망매물 만들기가 ⋮ 메뉴 안에만 있어 처음 쓰는 사람이 찾지 못했다 (6차 검수). */}
              {!buyerRequirementsLoading &&
                !propertyContactsLoading &&
                overview &&
                buyerRequirements.length === 0 &&
                propertyContacts.length === 0 &&
                overview.deals.length === 0 &&
                overview.matches.length === 0 && (
                  <section data-contact-start className="mt-6">
                    <EmptyLine
                      text="찾는 집이 있으면 희망 조건을, 내놓는 집이 있으면 매물을 등록해 두세요."
                      action={
                        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                          <Link
                            to="/buyer-requirements/new"
                            search={{ contactId: contact.id, from: 'contact' }}
                            className={nb.line}
                            data-contact-start-requirement
                          >
                            <Target />
                            희망매물 만들기
                          </Link>
                          <Link
                            to="/properties/new"
                            search={{ ownerContactId: contact.id }}
                            className={nb.line}
                            data-contact-start-property
                          >
                            <Home />
                            매물 등록
                          </Link>
                          <button
                            type="button"
                            className={nb.line}
                            onClick={() => setOpenDialog('propertyLink')}
                          >
                            <Building2 />
                            소유 매물 연결
                          </button>
                        </span>
                      }
                    />
                  </section>
                )}

              {/* 소유자 · 대리인으로 연결된 매물. 없으면 구역을 숨긴다(사려는 손님에게 빈 칸이 결함처럼 보이지 않게).
                  연결은 위 작업 메뉴의 "소유 매물 연결"로 한다. ("매물 연결"은 손님에게 매물을 붙이는 매칭의 말이라 겹치지 않게 한다) */}
              {(propertyContactsLoading || propertyContacts.length > 0) && (
                <section data-contact-properties id="properties">
                  <H2
                    title="소유 · 관리 매물"
                    count={propertyContacts.length}
                    hint="소유자 · 대리인으로 연결된 매물"
                    action={
                      <button type="button" className={nb.ghost} onClick={() => setOpenDialog('propertyLink')}>
                        <Plus />
                        소유 매물 연결
                      </button>
                    }
                  />
                  {propertyContactsLoading ? (
                    <StackSkeleton rows={2} />
                  ) : (
                    <ul className="mt-2.5 grid gap-3">
                      {propertyContacts.map((propertyContact) => (
                        <PropertyLinkCard
                          key={propertyContact.id}
                          propertyContact={propertyContact}
                          sold={soldIds.has(propertyContact.propertyId)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {overview && <ContractsSection contracts={overview.contracts} />}

              {!wide && <div data-contact-rail="inline">{consultationRecords(false)}</div>}
            </div>
          </div>

          {wide && (
            <ResizableRail rootWidth={rootWidth}>
              <div className="px-[18px] pb-14">{consultationRecords(true)}</div>
            </ResizableRail>
          )}
        </div>
      </div>

      {/* 다이얼로그 */}
      <ContactEditDialog
        contact={contact}
        open={openDialog === 'edit'}
        initialAddPhone={editAddPhone}
        onOpenChange={(open) => {
          setOpenDialog(open ? 'edit' : null);
          if (!open) setEditAddPhone(false);
        }}
      />
      <PartyStructureModal
        open={structureModalOpen}
        onOpenChange={setStructureModalOpen}
        contact={contact}
        parties={parties}
        initialPartyId={structureInitialPartyId}
        onEditParty={(party) => setPartyToEdit(party)}
        onDeleteParty={(party) => setPartyToDelete(party)}
        onAddMember={(party) => setPartyForAddMember(party)}
        onEditMember={(item) => setPartyItemToEdit(item)}
        onRemoveMember={(item) => setPartyItemToDelete(item)}
      />
      <PartyAddDialog
        contactId={contact.id}
        contactKind={contact.kind ?? ContactKind.PERSON}
        contactName={contact.name}
        existingHousehold={existingHousehold}
        existingOrgParty={existingOrgParty}
        initialTab={partyCreateTab}
        open={openDialog === 'relation'}
        onOpenChange={(open) => {
          setOpenDialog(open ? 'relation' : null);
          if (!open) setPartyCreateTab(undefined);
        }}
        onSwitchToAddMember={(party) => setPartyForAddMember(party)}
      />
      <PartyInfoEditDialog
        party={partyToEdit}
        open={partyToEdit !== null}
        onOpenChange={(open) => {
          if (!open) setPartyToEdit(null);
        }}
      />
      <PartyMemberAddDialog
        party={partyForAddMember}
        open={partyForAddMember !== null}
        onOpenChange={(open) => {
          if (!open) setPartyForAddMember(null);
        }}
      />
      <PartyEditDialog
        item={partyItemToEdit}
        open={partyItemToEdit !== null}
        onOpenChange={(open) => {
          if (!open) setPartyItemToEdit(null);
        }}
      />
      <ConsultationAddDialog
        contactId={contact.id}
        contactName={contact.name}
        open={openDialog === 'consultation'}
        onOpenChange={(open) => setOpenDialog(open ? 'consultation' : null)}
      />
      <TaskCreateDialog
        open={openDialog === 'task'}
        onOpenChange={(open) => setOpenDialog(open ? 'task' : null)}
        contactId={contact.id}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: ['contacts', id, 'overview'] })}
      />
      <PropertyLinkDialog
        contactId={contact.id}
        contactName={contact.name}
        open={openDialog === 'propertyLink'}
        onOpenChange={(open) => setOpenDialog(open ? 'propertyLink' : null)}
      />
      {/* 지우기: 서버에 물어 걸린 기록이 있으면 막고, 없으면 무엇이 지워지고 남는지 말한다 */}
      <ContactDeleteDialog
        contactId={contact.id}
        contactName={contact.name}
        open={openDialog === 'delete'}
        onOpenChange={(open) => setOpenDialog(open ? 'delete' : null)}
        onDeleted={finishDelete}
        mergeAction={
          <Button
            variant="outline"
            onClick={() => {
              setMergeKeep('other');
              setOpenDialog('merge');
            }}
          >
            다른 연락처로 합치기
          </Button>
        }
      />
      <ContactMergeDialog
        contact={{ id: contact.id, name: contact.name, phone: primaryPhone?.phone ?? null }}
        open={openDialog === 'merge'}
        onOpenChange={(open) => setOpenDialog(open ? 'merge' : null)}
        defaultKeep={mergeKeep}
        onMerged={(keptId) => {
          setOpenDialog(null);
          toast.success('연락처를 하나로 합쳤습니다.');
          if (keptId !== contact.id) {
            void navigate({ to: '/contacts/$id', params: { id: keptId }, replace: true });
          }
        }}
      />

      {/* 소속 연결 삭제 확인 */}
      <ConfirmDialog
        open={partyItemToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPartyItemToDelete(null);
        }}
        title="소속 연결을 뺄까요?"
        description={
          partyItemToDelete
            ? `${partyItemToDelete.contactName} 님과의 ${
                partyItemToDelete.partyKind === 'household' ? '세대' : '법인'
              } 소속 연결을 뺍니다. 연락처 자체는 유지됩니다.`
            : undefined
        }
        confirmLabel="연결 빼기"
        destructive
        loading={removePartyMemberMutation.isPending}
        onConfirm={() => {
          if (partyItemToDelete) {
            removePartyMemberMutation.mutate(partyItemToDelete);
          }
        }}
      />

      {/* 파티 삭제 확인 */}
      <ConfirmDialog
        open={partyToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPartyToDelete(null);
        }}
        title="파티를 삭제할까요?"
        description={
          partyToDelete
            ? `${
                partyToDelete.organizationContact?.name ??
                partyToDelete.name ??
                (partyToDelete.kind === PartyKind.ORGANIZATION ? '법인' : '세대')
              } 파티와 소속 연결을 모두 삭제합니다. 각 연락처 정보는 그대로 유지됩니다.`
            : undefined
        }
        confirmLabel="파티 삭제"
        destructive
        loading={deletePartyMutation.isPending}
        onConfirm={() => {
          if (partyToDelete) {
            deletePartyMutation.mutate(partyToDelete);
          }
        }}
      />
    </>
  );
}

// ── 보조 컴포넌트 ─────────────────────────────────────────────

/** 불러오는 중 · 없음 · 연결 실패일 때의 틀. 위 줄의 높이와 선은 상세 화면과 같다. */
function PageShell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div
      data-contact-detail
      className="-m-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-[#37352f]"
    >
      <div className="flex h-[46px] shrink-0 items-center border-b border-[#e9e9e7] pl-4 pr-5">
        <button type="button" onClick={onBack} className={nb.ghost}>
          <BookUser />
          연락처
        </button>
      </div>
      {children}
    </div>
  );
}

// ── 오른쪽 열 너비 ───────────────────────────────────────────────────────────
const RAIL_DEFAULT_WIDTH = 360;
const RAIL_MIN_WIDTH = 300;
const RAIL_MAX_WIDTH = 760;
/**
 * 오른쪽 열을 넓혀도 본문에 남겨 둘 너비. 본문의 "걸린 일"에 들어가는 매칭 단계 띠가 일곱 칸(최소 560px)에
 * 가지 들여쓰기와 본문 여백을 더해 약 690px이 필요하다 — 이보다 좁히면 띠의 마지막 칸("거래 전환")이 잘린다.
 */
const RAIL_BODY_MIN_WIDTH = 760;
const RAIL_WIDTH_STORAGE_KEY = 'contact-detail:rail-width';

function readRailWidth() {
  try {
    const stored = Number(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : RAIL_DEFAULT_WIDTH;
  } catch {
    return RAIL_DEFAULT_WIDTH;
  }
}

/**
 * 오른쪽 열(상담 기록). 너비는 끌어서 바꾸고 이 기기에 기억한다. 본문이 너무 좁아지지 않는 데까지만 넓어진다.
 * 너비 상태를 이 안에 두어, 끄는 동안 화면 전체가 아니라 이 열의 틀만 다시 그린다(안의 내용은 그대로다).
 */
function ResizableRail({ rootWidth, children }: { rootWidth: number; children: ReactNode }) {
  const [savedWidth, setSavedWidth] = useState(readRailWidth);
  const maxWidth = Math.max(
    RAIL_MIN_WIDTH,
    Math.min(RAIL_MAX_WIDTH, (rootWidth || Number.POSITIVE_INFINITY) - RAIL_BODY_MIN_WIDTH),
  );
  const width = Math.min(Math.max(savedWidth, RAIL_MIN_WIDTH), maxWidth);
  const resize = (next: number) => {
    const clamped = Math.round(Math.min(Math.max(next, RAIL_MIN_WIDTH), maxWidth));
    setSavedWidth(clamped);
    try {
      window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      // 저장하지 못해도 이번 화면에서는 바뀐 너비로 쓴다
    }
  };

  return (
    <div className="relative flex shrink-0" style={{ width }}>
      <RailResizeHandle
        width={width}
        min={RAIL_MIN_WIDTH}
        max={maxWidth}
        onResize={resize}
        onReset={() => resize(RAIL_DEFAULT_WIDTH)}
      />
      <aside
        data-contact-rail="side"
        aria-label="상담 기록"
        className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden border-l border-[#e9e9e7] bg-white"
      >
        {children}
      </aside>
    </div>
  );
}

/**
 * 오른쪽 열의 왼쪽 가장자리에 놓는 손잡이. 끌면 열이 넓어지고 좁아진다(거래 상세의 옆 패널과 같은 방식).
 * 키보드로는 ← → 로 24px씩, 두 번 누르면 처음 너비로 돌아간다.
 */
function RailResizeHandle({
  width,
  min,
  max,
  onResize,
  onReset,
}: {
  width: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      onResize(startWidth + startX - pointerEvent.clientX);
    };
    const stopResizing = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      cleanupRef.current = null;
      setDragging(false);
    };
    cleanupRef.current?.();
    cleanupRef.current = stopResizing;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    setDragging(true);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);
  };

  return (
    <div
      role="separator"
      data-contact-rail-resizer
      aria-label="상담 기록 너비 조절"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      tabIndex={0}
      title="끌어서 너비 조절 · 두 번 눌러 처음 너비로"
      className="group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none outline-none"
      onPointerDown={handlePointerDown}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onResize(width + 24);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onResize(width - 24);
        }
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-[3px] w-0.5 bg-[#2383e2] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
          dragging && 'opacity-100',
        )}
      />
    </div>
  );
}

interface DetailPhone {
  key: string;
  phone: string;
  label: string | null;
  isPrimary: boolean;
}

/** phones[] primary 우선 정렬 + legacy contact.phone 폴백 */
function collectDetailPhones(contact: ContactDetail): DetailPhone[] {
  const fromPhones = (contact.phones ?? [])
    .filter((phone) => phone.phone)
    .slice()
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .map((phone) => ({
      key: phone.id,
      phone: phone.phone,
      label: phone.label && phone.label !== 'mobile' ? phone.label : null,
      isPrimary: phone.isPrimary,
    }));

  if (fromPhones.length > 0) return fromPhones;
  if (contact.phone) {
    return [{ key: `legacy-${contact.id}`, phone: contact.phone, label: null, isPrimary: true }];
  }
  return [];
}

/** 거래유형 꼬리표. 매물 상세의 가격 칩과 같은 색이다. */
function TypeChip({ type }: { type: string }) {
  const meta = getTransactionTypeMeta(type);
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-[3px] px-1.5 text-[13px]',
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

const cardClassName = 'rounded-md bg-white px-4 py-3 shadow-[0_0_0_1px_#e9e9e7]';

/** 비어 있는 구역: 무엇이 없는지와 바로 채우는 단추 한 줄 (매물 상세의 빈 브리핑과 같은 모양). */
function EmptyLine({ text, action }: { text: string; action: ReactNode }) {
  return (
    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-md px-4 py-3.5 text-[13px] text-[#37352f]/65 shadow-[0_0_0_1px_#e9e9e7]">
      <span>{text}</span>
      {action}
    </div>
  );
}

const propertyContactStatusLabels: Record<string, string> = {
  active: '연결 중',
  transferred: '이전됨',
  archived: '보관됨',
};

/** 연결 매물 한 건: 단지 · 호(매물 화면으로), 주소, 역할 · 주 연락처 · 거주중, 지분 · 상태, 메모. */
function PropertyLinkCard({
  propertyContact,
  sold = false,
}: {
  propertyContact: PropertyContact;
  /** 이 사람이 매도인으로 잔금까지 끝낸 집 (팔고 난 뒤에도 "소유자"로만 보이지 않게) */
  sold?: boolean;
}) {
  const title = placeLabelOf(propertyContact.property) || '연결 매물';
  const address =
    propertyContact.property?.site?.roadAddress || propertyContact.property?.site?.jibunAddress;
  const facts = [
    address || '위치 정보 없음',
    propertyContact.shareRatio !== null ? `지분 ${propertyContact.shareRatio}%` : null,
  ].filter(Boolean);

  return (
    <li>
      <article data-contact-property className={cardClassName}>
        <div className="flex flex-wrap items-center gap-1.5">
          {propertyContact.property ? (
            <Link
              to="/properties/$id"
              params={{ id: propertyContact.propertyId }}
              className="text-[15px] font-semibold text-[#37352f] underline-offset-2 hover:underline"
            >
              {title}
            </Link>
          ) : (
            <span className="text-[15px] font-semibold">{title}</span>
          )}
          <Tag tone="brown">{propertyRoleLabels[propertyContact.role] ?? propertyContact.role}</Tag>
          {sold && <Tag tone="gray">판 집 · 잔금 완료</Tag>}
          {propertyContact.isPrimary && <Tag className="text-[12px]">주 연락처</Tag>}
          {propertyContact.isResident && <Tag tone="yellow">거주중</Tag>}
          <span className="flex-1" />
          {propertyContact.status !== 'active' && (
            <Tag>{propertyContactStatusLabels[propertyContact.status] ?? propertyContact.status}</Tag>
          )}
        </div>
        <p className="mt-0.5 text-[13.5px] leading-5 text-[#37352f]/65">{facts.join(' · ')}</p>
        {propertyContact.memo && (
          <p className="mt-2 whitespace-pre-wrap break-keep border-t border-[#e9e9e7] pt-2 text-[13.5px] leading-[1.6] text-[#37352f]/90 [overflow-wrap:anywhere]">
            {propertyContact.memo}
          </p>
        )}
      </article>
    </li>
  );
}

const consultationIcon: Record<string, ReactNode> = {
  phone: <Phone />,
  visit: <Building2 />,
  online: <Globe />,
};

const consultationIconClassName: Record<string, string> = {
  phone: 'bg-[rgb(231,243,248)] text-[rgb(51,126,169)]',
  visit: 'bg-[rgb(237,243,236)] text-[rgb(68,131,97)]',
  online: 'bg-[rgb(244,240,247)] text-[rgb(144,101,176)]',
};

const CONSULTATION_PAGE = 20;

/** 날짜("오늘" · "어제" · "11.19 (목)")로 묶는다 */
function groupConsultationsByDay(items: Consultation[]) {
  const groups: Array<{ dateText: string; items: Consultation[] }> = [];
  for (const consultation of items) {
    const dateText = formatConsultationDay(consultation.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.dateText === dateText) last.items.push(consultation);
    else groups.push({ dateText, items: [consultation] });
  }
  return groups;
}

/**
 * 상담 기록. 매물 상세의 "기록"과 같은 줄 모양: 날짜로 묶고, 종류 아이콘 · 종류와 적은 사람 · 시각은 오른쪽 ·
 * 걸린 매물 · 본문. 여러 줄 내용은 줄이지 않고 그대로 보여 준다. 20개씩 더 본다. 맨 위에 그 자리에서 적는 칸이 있다.
 *
 * 기본으로 이 사람의 상담만 보인다. 가족의 상담은 "가족의 상담 N건" 한 줄로 접어 둔다 —
 * 가족이어도 예산과 뜻이 다르고, 바쁠 때 가족의 말을 이 사람의 요청으로 읽기 쉽기 때문이다.
 * 펼친 가족의 상담에는 누구와 나눈 상담인지 붙어 있고, 고치기 · 지우기 확인에도 그 이름이 나온다.
 */
function ConsultationRecords({
  contactId,
  contactName,
  consultations,
  hasParties,
  scope,
  onScopeChange,
  partyMemberLabels,
  loading,
  onAdd,
  compact = false,
}: {
  contactId: string;
  contactName: string;
  consultations: Consultation[];
  hasParties: boolean;
  scope: 'self' | 'party';
  onScopeChange: (scope: 'self' | 'party') => void;
  partyMemberLabels: ReadonlyMap<string, string>;
  loading: boolean;
  onAdd: () => void;
  /** 오른쪽 열(360px)에 둘 때: 머리의 보기 범위 · 상담분석 링크를 제목 아래 줄로 내리고, 줄 머리는 넘치면 꺾는다 */
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(CONSULTATION_PAGE);
  const [editing, setEditing] = useState<Consultation | null>(null);
  const [deleting, setDeleting] = useState<Consultation | null>(null);
  const shown = consultations.slice(0, limit);

  const whoseLabel = (consultation: Consultation) => {
    if (consultation.contactId === contactId) return null;
    const name = consultation.contact?.name ?? '구성원';
    const role = partyMemberLabels.get(consultation.contactId);
    return role ? `${role} ${name}` : name;
  };

  const removeConsultation = useMutation({
    mutationFn: (consultation: Consultation) => api.consultations.remove(consultation.id),
    onSuccess: async (_, consultation) => {
      queryClient.removeQueries({ queryKey: ['consultation', consultation.id] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['consultations'] }),
      ]);
      toast.success('상담 기록을 지웠습니다.');
      setDeleting(null);
    },
    onError: (caught) =>
      toast.error(apiErrorMessage(caught, '상담 기록을 지우지 못했습니다. 잠시 뒤 다시 시도하세요.')),
  });

  const renderGroups = (items: Consultation[]) =>
    groupConsultationsByDay(items).map((group) => (
      <div key={group.dateText} className="mt-3.5 first:mt-1">
        <div className="py-1 text-[12px] font-semibold tabular-nums text-[#37352f]/65">{group.dateText}</div>
        <ol>
          {group.items.map((consultation) => {
            const place = consultation.property ? placeLabelOf(consultation.property) || '매물' : null;
            const whose = whoseLabel(consultation);
            return (
              <li
                key={consultation.id}
                data-contact-consultation
                data-consultation-whose={whose ? 'family' : 'own'}
                className="group/consult -mx-1.5 flex gap-2.5 rounded px-1.5 py-2 hover:bg-[#37352f]/[0.03]"
              >
                <span
                  className={cn(
                    'grid size-[26px] shrink-0 place-items-center rounded-full [&_svg]:size-3.5',
                    consultationIconClassName[consultation.type] ?? 'bg-[rgb(241,240,236)] text-[rgb(120,117,110)]',
                  )}
                >
                  {consultationIcon[consultation.type] ?? <MessageSquareText />}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'flex min-w-0 items-center gap-1.5 text-[14px] leading-[22px]',
                      compact && 'flex-wrap gap-y-0.5',
                    )}
                  >
                    <span className="shrink-0 font-semibold text-[#37352f]">
                      {consultationTypeLabels[consultation.type] ?? consultation.type}
                    </span>
                    {consultation.createdBy?.name && (
                      <span className="truncate text-[#37352f]/65">{consultation.createdBy.name}</span>
                    )}
                    {whose && (
                      <Link
                        to="/contacts/$id"
                        params={{ id: consultation.contactId }}
                        data-consultation-relative
                        className="min-w-0 shrink-0 truncate rounded-[3px] bg-[rgba(227,226,224,0.6)] px-1.5 text-[13px] leading-5 text-[rgb(50,48,44)] hover:underline"
                        title={`${consultation.contact?.name ?? '가족'} 님과의 상담`}
                      >
                        {whose} 님과
                      </Link>
                    )}
                    {place && consultation.property && (
                      <Link
                        to="/properties/$id"
                        params={{ id: consultation.property.id }}
                        className="min-w-0 truncate rounded-[3px] bg-[rgba(227,226,224,0.6)] px-1.5 text-[13px] leading-5 text-[rgb(50,48,44)] hover:underline"
                      >
                        {place}
                      </Link>
                    )}
                    {consultation.deal?.transactionType && (
                      <TypeChip type={consultation.deal.transactionType} />
                    )}
                    <span className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
                      <span className="flex items-center opacity-0 transition-opacity group-focus-within/consult:opacity-100 group-hover/consult:opacity-100 [@media(hover:none)]:opacity-100">
                        <button
                          type="button"
                          className={cn(nb.icon, 'size-6')}
                          aria-label={whose ? `${whose} 님과의 상담 고치기` : '상담 고치기'}
                          title="고치기"
                          onClick={() => setEditing(consultation)}
                        >
                          <Pencil />
                        </button>
                        <button
                          type="button"
                          className={cn(nb.icon, 'size-6')}
                          aria-label={whose ? `${whose} 님과의 상담 지우기` : '상담 지우기'}
                          title="지우기"
                          onClick={() => setDeleting(consultation)}
                        >
                          <Trash2 />
                        </button>
                      </span>
                      <span className="text-[12px] tabular-nums text-[#37352f]/45">
                        {formatConsultationClock(consultation.createdAt)}
                      </span>
                    </span>
                  </div>
                  {(() => {
                    // "[매물확인] 살아있음" 같은 꼬리표는 작은 표로, 나머지만 본문으로 (저장된 글은 그대로)
                    const { tag, body, tone } = splitConsultationTag(consultation.content);
                    return (
                      <>
                        {tag && (
                          <span data-consultation-tag className="mt-0.5 inline-flex">
                            <Tag tone={tone === 'good' ? 'green' : tone === 'attention' ? 'yellow' : 'gray'}>{tag}</Tag>
                          </span>
                        )}
                        {body && (
                          <p className="mt-0.5 whitespace-pre-wrap break-keep text-[14px] leading-[1.65] text-[#37352f]/90 [overflow-wrap:anywhere]">
                            {body}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    ));

  return (
    <section data-contact-consultations id="consultations">
      {(() => {
        const scopeToggle = hasParties && (
          <div
            role="group"
            aria-label="상담 보기 범위"
            className="inline-flex items-center rounded border border-[#e9e9e7] bg-[#f7f6f3] p-0.5 text-[12px]"
          >
            {[
              { value: ConsultationScope.SELF, label: '본인만' },
              { value: ConsultationScope.PARTY, label: '세대·법인 전체' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onScopeChange(option.value)}
                className={cn(
                  'rounded-[3px] px-2 py-0.5 font-medium transition-colors',
                  scope === option.value
                    ? 'bg-white text-[#37352f] shadow-xs'
                    : 'text-[#37352f]/60 hover:text-[#37352f]',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        );
        const analysisLink = (
          <Link to="/consultations" search={{ contactId }} className={nb.ghost}>
            상담분석에서 보기
          </Link>
        );
        const addButton = (
          <button type="button" className={nb.ghost} onClick={onAdd}>
            <Plus />
            상담 적기
          </button>
        );
        if (!compact) {
          return (
            <H2
              title="상담 기록"
              count={consultations.length}
              action={
                <>
                  {scopeToggle}
                  {analysisLink}
                  {addButton}
                </>
              }
            />
          );
        }
        // 오른쪽 열: 제목 줄에는 "상담 적기"만, 보기 범위와 상담분석 링크는 그 아래 줄
        return (
          <>
            <div className="[&>div]:mt-3">
              <H2 title="상담 기록" count={consultations.length} action={addButton} />
            </div>
            <div className="mb-1.5 mt-0.5 flex flex-wrap items-center justify-between gap-2">
              {scopeToggle}
              <span className={cn(!hasParties && '-ml-2')}>{analysisLink}</span>
            </div>
          </>
        );
      })()}
      {/* 그 자리에서 바로 적는 칸. 상담한 때 · 다음 업무까지 적을 때는 머리의 "상담 적기" 창 */}
      <ConsultationComposer contactId={contactId} contactName={contactName} />
      {loading ? (
        <StackSkeleton rows={3} />
      ) : consultations.length === 0 ? (
        <p data-contact-no-consultation className="px-0.5 py-2 text-[13px] text-[#37352f]/65">
          {scope === ConsultationScope.PARTY
            ? '이 세대·법인에 남긴 상담이 없습니다.'
            : '이 사람과 남긴 상담이 없습니다.'}
        </p>
      ) : (
        renderGroups(shown)
      )}
      {consultations.length > shown.length && (
        <button
          type="button"
          onClick={() => setLimit((value) => value + CONSULTATION_PAGE)}
          className={cn(nb.line, 'mt-3 w-full')}
        >
          이전 상담 {Math.min(CONSULTATION_PAGE, consultations.length - shown.length)}개 더 보기
        </button>
      )}

      <ConsultationFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        consultation={editing}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="상담 기록을 지울까요?"
        description={
          deleting
            ? `${deleting.contact?.name ?? '이 사람'} 님과의 ${formatConsultationWhen(deleting.createdAt)} ${
                consultationTypeLabels[deleting.type] ?? deleting.type
              } 상담을 지웁니다. 붙어 있던 녹음은 지워지지 않고 상담분석의 연결 대기로 남습니다. 지운 상담은 되살릴 수 없습니다.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={removeConsultation.isPending}
        onConfirm={() => {
          if (deleting) removeConsultation.mutate(deleting);
        }}
      />
    </section>
  );
}

function StackSkeleton({ rows }: { rows: number }) {
  return (
    <div className="mt-2.5 space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-[72px] w-full rounded-md" />
      ))}
    </div>
  );
}
