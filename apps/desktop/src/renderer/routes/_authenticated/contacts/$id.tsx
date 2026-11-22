import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ApiError,
  type BuyerRequirement,
  type Consultation,
  type ContactDetail,
  type PropertyContact,
} from '@estate-erp/api-client';
import { formatUnitName } from '@estate-erp/shared';
import {
  AlertCircle,
  BookUser,
  Building2,
  CalendarPlus,
  Clock3,
  EllipsisVertical,
  Globe,
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
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useElementWidth } from '@/hooks/use-element-width';
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
import { RailSection } from '../properties/-detail/rail';
import {
  Avatar,
  DOC_WIDE_LAYOUT,
  DocProp,
  H2,
  nb,
  Tag,
  type TagTone,
} from '../properties/-detail/ui';
import {
  buyerStatusLabels,
  consultationTypeLabels,
  formatAreaSummary,
  formatBudgetSummary,
  formatRegionSummary,
  getContactRelationLabel,
  propertyRoleLabels,
  urgencyLabels,
  type RelationItem,
} from './-detail-cards';
import {
  ContactEditDialog,
  ContactTagBadges,
  RelationAddDialog,
  RelationEditDialog,
} from './-detail-dialogs';
import {
  BuyerReqAddDialog,
  ConsultationAddDialog,
  PropertyLinkDialog,
  TaskAddDialog,
} from './-detail-action-dialogs';

/**
 * 연락처 상세.
 *
 * 이 화면의 물음: "이 사람은 누구이고, 우리와 무슨 일이 걸려 있고, 마지막에 무슨 이야기를 했나."
 *
 * 짜임은 프로젝트 상세와 같다(사용자 요청, 2026-11-22): Notion 문서의 읽는 순서 + 매물 상세의 부품.
 * 위에 얇은 줄(어디인지 + 자주 쓰는 작업), 본문 맨 위에 큰 이름과 속성을 한 줄씩(전화 · 이메일 · 그룹 ·
 * 태그 · 등록), 선, 메모, 그리고 매수요건 → 연결 매물 → 상담 기록. 오른쪽 고정 열은 연결된 사람(관계)이고
 * 화면이 좁으면 본문 안으로 들어온다. 단추 · 꼬리표 · 구역 제목은 매물 상세의 것(nb · Tag · H2)을 쓴다.
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
  | 'buyerReq'
  | 'deleteBlocked'
  | 'deleteConfirm'
  | null;

function ContactDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = Route.useParams();
  const [openDialog, setOpenDialog] = useState<DialogKind>(null);
  const [relationToEdit, setRelationToEdit] = useState<RelationItem | null>(null);
  const [relationToDelete, setRelationToDelete] = useState<RelationItem | null>(null);

  const contactQuery = useQuery({
    queryKey: ['contacts', id],
    queryFn: () => api.contacts.findOne(id),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.statusCode === 404) return false;
      return failureCount < 2;
    },
  });
  const contact = contactQuery.data;

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
    queryKey: ['contacts', id, 'consultations'],
    queryFn: () => api.contacts.getConsultations(id),
    enabled: Boolean(contact),
  });

  const relationshipItems = useMemo<RelationItem[]>(() => {
    if (!contact) return [];
    return [
      ...contact.relationsAsMain.map<RelationItem>((relation) => ({
        id: `main-${relation.id}`,
        relationId: relation.id,
        relation,
        counterpartId: relation.relatedContact?.id ?? relation.relatedContactId ?? null,
        counterpartName: relation.relatedContact?.name ?? '이름 없음',
        counterpartPhone: relation.relatedContact?.phone ?? null,
        sourceName: contact.name,
        targetName: relation.relatedContact?.name ?? '이름 없음',
      })),
      ...contact.relationsAsRelated.map<RelationItem>((relation) => ({
        id: `related-${relation.id}`,
        relationId: relation.id,
        relation,
        counterpartId: relation.contact?.id ?? relation.contactId ?? null,
        counterpartName: relation.contact?.name ?? '이름 없음',
        counterpartPhone: relation.contact?.phone ?? null,
        sourceName: relation.contact?.name ?? '이름 없음',
        targetName: contact.name,
      })),
    ];
  }, [contact]);

  const removeMutation = useMutation({
    mutationFn: () => api.contacts.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('연락처가 삭제되었습니다.');
      setOpenDialog(null);
      void navigate({ to: '/contacts' });
    },
    onError: () => {
      toast.error('연락처 삭제에 실패했습니다.');
    },
  });

  const removeRelationMutation = useMutation({
    mutationFn: (relationId: string) => api.contactRelations.remove(relationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('관계가 삭제되었습니다.');
      setRelationToDelete(null);
    },
    onError: () => {
      toast.error('관계 삭제에 실패했습니다.');
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
    contactQuery.error instanceof ApiError && contactQuery.error.statusCode === 404;

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
          description="삭제되었거나 존재하지 않는 연락처입니다."
          className="flex-1"
          action={
            <Button variant="outline" asChild>
              <Link to="/contacts">목록으로 돌아가기</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  // 삭제 가드 — 연결 엔터티가 있으면 hard delete를 막고 사유를 안내한다 (PRD 11장).
  const linkedParts = [
    propertyContacts.length > 0 ? `연결 매물 ${propertyContacts.length}건` : null,
    buyerRequirements.length > 0 ? `매수요건 ${buyerRequirements.length}건` : null,
    consultations.length > 0 ? `상담 기록 ${consultations.length}건` : null,
    relationshipItems.length > 0 ? `관계 ${relationshipItems.length}건` : null,
  ].filter((part): part is string => part !== null);
  const hasLinkedEntities = linkedParts.length > 0;

  const phones = collectDetailPhones(contact);
  const primaryPhone = phones[0] ?? null;
  const tags = contact.tags.filter((tag) => Boolean(tag));
  const groups = contact.groups ?? [];

  // 오른쪽 열(좁은 화면에서는 본문 안으로): 연결된 사람
  const rail = (
    <RailSection
      title="연결된 연락처"
      count={relationshipItems.length}
      className="pt-0.5"
      action={
        <button
          type="button"
          className={cn(nb.ghost, 'h-6 px-1.5 text-[12.5px]')}
          onClick={() => setOpenDialog('relation')}
        >
          <Plus />
          관계 추가
        </button>
      }
    >
      <div data-contact-relations>
        {relationshipItems.length === 0 ? (
          <p className="break-keep rounded bg-[rgb(247,246,243)] px-2.5 py-2 text-[12.5px] leading-5 text-[#37352f]/65">
            배우자·부모·자녀 같은 가족을 연결해 두면 상담 맥락 파악이 빨라집니다.
          </p>
        ) : (
          <ul>
            {relationshipItems.map((item) => (
              <RelationLine
                key={item.id}
                item={item}
                deleting={
                  removeRelationMutation.isPending &&
                  relationToDelete?.relationId === item.relationId
                }
                onEdit={() => setRelationToEdit(item)}
                onDelete={() => setRelationToDelete(item)}
              />
            ))}
          </ul>
        )}
      </div>
    </RailSection>
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
              상담 기록
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
                  할 일 추가
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOpenDialog('buyerReq')}>
                  <Target className="size-3.5" />
                  매수요건 추가
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOpenDialog('propertyLink')}>
                  <Building2 className="size-3.5" />
                  매물 연결
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setOpenDialog('relation')}>
                  <Users className="size-3.5" />
                  관계 추가
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={removeMutation.isPending}
                  onSelect={() => setOpenDialog(hasLinkedEntities ? 'deleteBlocked' : 'deleteConfirm')}
                >
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
              <h1 className="mt-5 text-[32px] font-bold leading-[1.25] tracking-[-0.028em] text-[#37352f]">
                {contact.name}
              </h1>
              <dl data-contact-props className="mt-3">
                <DocProp icon={<Phone />} label="전화" align={phones.length > 1 ? 'start' : 'center'}>
                  {phones.length === 0 ? (
                    <span className="px-1.5 text-[#37352f]/45">전화번호 없음</span>
                  ) : (
                    phones.map((phone) => (
                      <span key={phone.key} className="flex min-w-0 items-center gap-1.5 px-1.5">
                        <CopyPhone phone={phone.phone} className="text-[#37352f]" />
                        {phone.label && (
                          <span className="text-[13px] text-[#37352f]/45">{phone.label}</span>
                        )}
                        {phone.isPrimary && phones.length > 1 && (
                          <Tag className="text-[12px]">주 번호</Tag>
                        )}
                      </span>
                    ))
                  )}
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
                    {formatDateTime(contact.createdAt)}
                    <span className="text-[#37352f]/45">
                      {' '}
                      · 수정 {formatDateTime(contact.updatedAt)}
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

              <section data-contact-requirements id="requirements">
                <H2
                  title="매수요건"
                  count={buyerRequirements.length}
                  hint="희망 조건과 추적 상태"
                  action={
                    <>
                      <Link to="/customers-table" className={nb.ghost}>
                        고객 원장
                      </Link>
                      <button type="button" className={nb.ghost} onClick={() => setOpenDialog('buyerReq')}>
                        <Plus />
                        추가
                      </button>
                    </>
                  }
                />
                {buyerRequirementsLoading ? (
                  <StackSkeleton rows={2} />
                ) : buyerRequirements.length === 0 ? (
                  <EmptyLine
                    text="등록된 매수요건이 없습니다."
                    action={
                      <button type="button" className={nb.line} onClick={() => setOpenDialog('buyerReq')}>
                        <Plus />
                        매수요건 추가
                      </button>
                    }
                  />
                ) : (
                  <ul className="mt-2.5 grid gap-3">
                    {buyerRequirements.map((requirement) => (
                      <RequirementCard key={requirement.id} requirement={requirement} />
                    ))}
                  </ul>
                )}
              </section>

              <section data-contact-properties id="properties">
                <H2
                  title="연결 매물"
                  count={propertyContacts.length}
                  hint="소유주, 대리인 등 매물과의 연결"
                  action={
                    <button type="button" className={nb.ghost} onClick={() => setOpenDialog('propertyLink')}>
                      <Plus />
                      연결
                    </button>
                  }
                />
                {propertyContactsLoading ? (
                  <StackSkeleton rows={2} />
                ) : propertyContacts.length === 0 ? (
                  <EmptyLine
                    text="연결된 매물이 없습니다."
                    action={
                      <button type="button" className={nb.line} onClick={() => setOpenDialog('propertyLink')}>
                        <Plus />
                        매물 연결
                      </button>
                    }
                  />
                ) : (
                  <ul className="mt-2.5 grid gap-3">
                    {propertyContacts.map((propertyContact) => (
                      <PropertyLinkCard key={propertyContact.id} propertyContact={propertyContact} />
                    ))}
                  </ul>
                )}
              </section>

              {!wide && (
                <div data-contact-rail="inline" className="mt-6">
                  {rail}
                </div>
              )}

              <ConsultationRecords
                consultations={consultations}
                loading={consultationsLoading}
                onAdd={() => setOpenDialog('consultation')}
              />
            </div>
          </div>

          {wide && (
            <aside
              data-contact-rail="side"
              aria-label="연결된 연락처"
              className="w-[344px] shrink-0 overflow-y-auto overflow-x-hidden border-l border-[#e9e9e7] bg-white"
            >
              <div className="px-[18px] pb-14 pt-3">{rail}</div>
            </aside>
          )}
        </div>
      </div>

      {/* 다이얼로그 */}
      <ContactEditDialog
        contact={contact}
        open={openDialog === 'edit'}
        onOpenChange={(open) => setOpenDialog(open ? 'edit' : null)}
      />
      <RelationAddDialog
        contactId={contact.id}
        contactName={contact.name}
        open={openDialog === 'relation'}
        onOpenChange={(open) => setOpenDialog(open ? 'relation' : null)}
      />
      <RelationEditDialog
        item={relationToEdit}
        open={relationToEdit !== null}
        onOpenChange={(open) => {
          if (!open) setRelationToEdit(null);
        }}
      />
      <ConsultationAddDialog
        contactId={contact.id}
        contactName={contact.name}
        open={openDialog === 'consultation'}
        onOpenChange={(open) => setOpenDialog(open ? 'consultation' : null)}
      />
      <TaskAddDialog
        contactId={contact.id}
        contactName={contact.name}
        open={openDialog === 'task'}
        onOpenChange={(open) => setOpenDialog(open ? 'task' : null)}
      />
      <PropertyLinkDialog
        contactId={contact.id}
        contactName={contact.name}
        open={openDialog === 'propertyLink'}
        onOpenChange={(open) => setOpenDialog(open ? 'propertyLink' : null)}
      />
      <BuyerReqAddDialog
        contactId={contact.id}
        contactName={contact.name}
        open={openDialog === 'buyerReq'}
        onOpenChange={(open) => setOpenDialog(open ? 'buyerReq' : null)}
      />

      {/* 삭제 차단 안내 — 연결 엔터티 존재 시 (PRD 11장 삭제 불가 조건) */}
      <ConfirmDialog
        open={openDialog === 'deleteBlocked'}
        onOpenChange={(open) => setOpenDialog(open ? 'deleteBlocked' : null)}
        title="삭제할 수 없는 연락처입니다"
        description={`${linkedParts.join(', ')}이(가) 이 연락처에 연결되어 있습니다. 연결된 데이터를 먼저 정리하거나 이관한 뒤 삭제하세요. 연결 이력이 있는 연락처는 보존하는 것을 권장합니다.`}
        confirmLabel="확인"
        onConfirm={() => setOpenDialog(null)}
      />

      {/* 삭제 확인 — 연결 엔터티 없는 경우만 */}
      <ConfirmDialog
        open={openDialog === 'deleteConfirm'}
        onOpenChange={(open) => setOpenDialog(open ? 'deleteConfirm' : null)}
        title={`"${contact.name}" 연락처를 삭제할까요?`}
        description="삭제한 연락처는 복구할 수 없습니다."
        confirmLabel="삭제"
        destructive
        loading={removeMutation.isPending}
        onConfirm={() => removeMutation.mutate()}
      />

      {/* 관계 삭제 확인 */}
      <ConfirmDialog
        open={relationToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setRelationToDelete(null);
        }}
        title="관계를 삭제할까요?"
        description={
          relationToDelete
            ? `${relationToDelete.counterpartName} 님과의 "${getContactRelationLabel(
                relationToDelete.relation,
              )}" 관계만 삭제됩니다. 상대 연락처는 유지됩니다.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={removeRelationMutation.isPending}
        onConfirm={() => {
          if (relationToDelete) {
            removeRelationMutation.mutate(relationToDelete.relationId);
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

const requirementStatusTone: Record<string, TagTone> = {
  active: 'green',
  matched: 'green',
  hold: 'yellow',
  inactive: 'yellow',
  completed: 'gray',
};

const urgencyTone: Record<string, TagTone> = {
  urgent: 'red',
  normal: 'gray',
  flexible: 'blue',
};

/** 매수요건 한 건: 상태 · 급한 정도 · 거래유형, 예산(희망조건 화면으로), 면적 · 지역, 날짜, 메모. */
function RequirementCard({ requirement }: { requirement: BuyerRequirement }) {
  const regions = formatRegionSummary(requirement);
  return (
    <li>
      <article data-contact-requirement className={cardClassName}>
        <div className="flex flex-wrap items-center gap-1.5">
          {requirement.transactionType && <TypeChip type={requirement.transactionType} />}
          <Tag tone={requirementStatusTone[requirement.status] ?? 'gray'} dot>
            {buyerStatusLabels[requirement.status] ?? requirement.status}
          </Tag>
          <Tag tone={urgencyTone[requirement.urgency] ?? 'gray'}>
            {urgencyLabels[requirement.urgency] ?? requirement.urgency}
          </Tag>
          <span className="flex-1" />
          <span className="text-[12.5px] tabular-nums text-[#37352f]/45">
            등록 {formatDate(requirement.createdAt)}
            {requirement.nextContactDate && ` · 다음 연락 ${formatDate(requirement.nextContactDate)}`}
          </span>
        </div>
        <Link
          to="/buyer-requirements/$id"
          params={{ id: requirement.id }}
          className="mt-1.5 block text-[17px] font-bold tabular-nums tracking-[-0.015em] text-[#37352f] underline-offset-2 hover:underline"
        >
          {formatBudgetSummary(requirement)}
        </Link>
        <p className="mt-0.5 text-[13.5px] leading-5 text-[#37352f]/65">
          {formatAreaSummary(requirement)}
          {regions ? ` · ${regions}` : ''}
        </p>
        {requirement.memo && (
          <p className="mt-2 whitespace-pre-wrap break-keep border-t border-[#e9e9e7] pt-2 text-[13.5px] leading-[1.6] text-[#37352f]/90 [overflow-wrap:anywhere]">
            {requirement.memo}
          </p>
        )}
      </article>
    </li>
  );
}

const propertyContactStatusLabels: Record<string, string> = {
  active: '연결 중',
  transferred: '이전됨',
  archived: '보관됨',
};

/** 연결 매물 한 건: 단지 · 호(매물 화면으로), 주소, 역할 · 주 연락처 · 거주중, 지분 · 상태, 메모. */
function PropertyLinkCard({ propertyContact }: { propertyContact: PropertyContact }) {
  const title = propertyContact.property?.site?.name ?? '연결 매물';
  const unitName = formatUnitName(propertyContact.property?.unit);
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
              {unitName && <span className="ml-1.5 tabular-nums">{unitName}</span>}
            </Link>
          ) : (
            <span className="text-[15px] font-semibold">{title}</span>
          )}
          <Tag tone="brown">{propertyRoleLabels[propertyContact.role] ?? propertyContact.role}</Tag>
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

/**
 * 상담 기록. 매물 상세의 "기록"과 같은 줄 모양: 날짜로 묶고, 종류 아이콘 · 종류와 적은 사람 · 시각은 오른쪽 ·
 * 걸린 매물 · 본문. 여러 줄 내용은 줄이지 않고 그대로 보여 준다. 20개씩 더 본다.
 */
function ConsultationRecords({
  consultations,
  loading,
  onAdd,
}: {
  consultations: Consultation[];
  loading: boolean;
  onAdd: () => void;
}) {
  const [limit, setLimit] = useState(CONSULTATION_PAGE);
  const shown = consultations.slice(0, limit);
  const groups: Array<{ dateText: string; items: Consultation[] }> = [];
  for (const consultation of shown) {
    const dateText = formatDate(consultation.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.dateText === dateText) last.items.push(consultation);
    else groups.push({ dateText, items: [consultation] });
  }

  return (
    <section data-contact-consultations id="consultations">
      <H2
        title="상담 기록"
        count={consultations.length}
        action={
          <>
            <Link to="/consultations" className={nb.ghost}>
              전체 보기
            </Link>
            <button type="button" className={nb.ghost} onClick={onAdd}>
              <Plus />
              상담 기록
            </button>
          </>
        }
      />
      {loading ? (
        <StackSkeleton rows={3} />
      ) : consultations.length === 0 ? (
        <EmptyLine
          text="상담 이력이 없습니다."
          action={
            <button type="button" className={nb.line} onClick={onAdd}>
              <Plus />
              상담 기록
            </button>
          }
        />
      ) : (
        groups.map((group) => (
          <div key={group.dateText} className="mt-3.5 first:mt-1">
            <div className="py-1 text-[12px] font-semibold tabular-nums text-[#37352f]/65">
              {group.dateText}
            </div>
            <ol>
              {group.items.map((consultation) => {
                const place = consultation.property
                  ? [
                      consultation.property.site?.name ?? '매물',
                      formatUnitName(consultation.property.unit),
                    ]
                      .filter(Boolean)
                      .join(' ')
                  : null;
                return (
                  <li
                    key={consultation.id}
                    data-contact-consultation
                    className="-mx-1.5 flex gap-2.5 rounded px-1.5 py-2 hover:bg-[#37352f]/[0.03]"
                  >
                    <span
                      className={cn(
                        'grid size-[26px] shrink-0 place-items-center rounded-full [&_svg]:size-3.5',
                        consultationIconClassName[consultation.type] ??
                          'bg-[rgb(241,240,236)] text-[rgb(120,117,110)]',
                      )}
                    >
                      {consultationIcon[consultation.type] ?? <MessageSquareText />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5 text-[14px] leading-[22px]">
                        <span className="shrink-0 font-semibold text-[#37352f]">
                          {consultationTypeLabels[consultation.type] ?? consultation.type}
                        </span>
                        {consultation.createdBy?.name && (
                          <span className="truncate text-[#37352f]/65">
                            {consultation.createdBy.name}
                          </span>
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
                        {consultation.listing?.transactionType && (
                          <TypeChip type={consultation.listing.transactionType} />
                        )}
                        <span className="ml-auto shrink-0 pl-2 text-[12px] tabular-nums text-[#37352f]/45">
                          {formatClock(consultation.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-keep text-[14px] leading-[1.65] text-[#37352f]/90 [overflow-wrap:anywhere]">
                        {consultation.content}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ))
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
    </section>
  );
}

/** "14:05" — 날짜 줄 아래에서는 시각만 적는다 */
function formatClock(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 연결된 사람 한 줄: 얼굴 · 이름(그 사람의 화면으로) · 관계 · 전화 · 메모. 올리면 고치기 · 지우기가 나온다. */
function RelationLine({
  item,
  deleting,
  onEdit,
  onDelete,
}: {
  item: RelationItem;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const relationLabel = getContactRelationLabel(item.relation);
  return (
    <li
      data-contact-relation
      className="group/relation -mx-1.5 flex items-start gap-2.5 rounded px-1.5 py-1.5 hover:bg-[#37352f]/[0.04]"
    >
      <span className="mt-0.5">
        <Avatar name={item.counterpartName} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-[14px] leading-[22px]">
          {item.counterpartId ? (
            <Link
              to="/contacts/$id"
              params={{ id: item.counterpartId }}
              className="truncate font-semibold text-[#37352f] underline-offset-2 hover:underline"
            >
              {item.counterpartName}
            </Link>
          ) : (
            <b className="truncate font-semibold">{item.counterpartName}</b>
          )}
          <Tag>{relationLabel}</Tag>
        </div>
        <div className="truncate text-[13px] leading-[19px] text-[#37352f]/65">
          {item.counterpartPhone ? <CopyPhone phone={item.counterpartPhone} /> : '전화번호 없음'}
        </div>
        {item.relation.memo && (
          <p className="mt-0.5 whitespace-pre-wrap break-keep text-[13px] leading-[19px] text-[#37352f]/65">
            {item.relation.memo}
          </p>
        )}
      </div>
      <span className="mt-0.5 flex shrink-0 items-center opacity-0 transition-opacity group-focus-within/relation:opacity-100 group-hover/relation:opacity-100 [@media(hover:none)]:opacity-100">
        <button type="button" className={nb.icon} aria-label="관계 수정" onClick={onEdit}>
          <Pencil />
        </button>
        <button
          type="button"
          className={nb.icon}
          aria-label="관계 삭제"
          disabled={deleting}
          onClick={onDelete}
        >
          <Trash2 />
        </button>
      </span>
      {item.counterpartPhone && (
        <a
          href={`tel:${item.counterpartPhone}`}
          aria-label={`${item.counterpartName}에게 전화`}
          className={cn(nb.icon, 'mt-0.5')}
        >
          <Phone />
        </a>
      )}
    </li>
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
