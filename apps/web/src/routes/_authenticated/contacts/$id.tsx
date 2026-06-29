import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ApiError, type ContactDetail } from '@estate-erp/api-client';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarPlus,
  Clock3,
  FileText,
  Mail,
  MessageSquarePlus,
  Pencil,
  Phone,
  Plus,
  Target,
  Trash2,
  UserRound,
  UserSearch,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime, formatPhone } from '@/lib/format';
import { splitContactTags } from '@/lib/contacts';
import { cn } from '@/lib/utils';
import { ConfirmDialog, EmptyState } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BuyerRequirementCard,
  ConsultationCard,
  PropertyContactCard,
  RelationCard,
  relationTypeLabels,
  type RelationItem,
} from './-detail-cards';
import { ContactEditDialog, ContactTagBadges, RelationAddDialog } from './-detail-dialogs';
import {
  BuyerReqAddDialog,
  ConsultationAddDialog,
  PropertyLinkDialog,
  TaskAddDialog,
} from './-detail-action-dialogs';

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
        direction: '연결함',
        relation,
        counterpartId: relation.relatedContact?.id ?? relation.relatedContactId ?? null,
        counterpartName: relation.relatedContact?.name ?? '이름 없음',
        counterpartPhone: relation.relatedContact?.phone ?? null,
      })),
      ...contact.relationsAsRelated.map<RelationItem>((relation) => ({
        id: `related-${relation.id}`,
        relationId: relation.id,
        direction: '연결됨',
        relation,
        counterpartId: relation.contact?.id ?? relation.contactId ?? null,
        counterpartName: relation.contact?.name ?? '이름 없음',
        counterpartPhone: relation.contact?.phone ?? null,
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

  if (contactQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  const isNotFound =
    contactQuery.error instanceof ApiError && contactQuery.error.statusCode === 404;

  if (contactQuery.isError && !isNotFound) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="연락처를 불러오지 못했습니다"
        description="네트워크 상태를 확인한 뒤 다시 시도하세요."
        action={
          <Button variant="outline" onClick={() => void contactQuery.refetch()}>
            다시 시도
          </Button>
        }
      />
    );
  }

  if (isNotFound || !contact) {
    return (
      <EmptyState
        icon={UserSearch}
        title="연락처를 찾을 수 없습니다"
        description="삭제되었거나 존재하지 않는 연락처입니다."
        action={
          <Button variant="outline" asChild>
            <Link to="/contacts">목록으로 돌아가기</Link>
          </Button>
        }
      />
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

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* 헤더 — 이름/태그/연락 정보 + 후속 액션 CTA */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="ghost" size="icon" className="mt-0.5 size-7" asChild>
              <Link to="/contacts">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">{contact.name}</h1>
                <ContactTagBadges tags={contact.tags} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {phones.length > 0 ? (
                  phones.map((phone) => (
                    <a
                      key={phone.key}
                      href={`tel:${phone.phone}`}
                      className="inline-flex items-center gap-1.5 tabular-nums hover:text-foreground hover:underline"
                    >
                      <Phone className="size-3.5" />
                      {formatPhone(phone.phone)}
                      {phone.label && <span className="text-xs text-muted-foreground/70">({phone.label})</span>}
                    </a>
                  ))
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5" />
                    전화번호 없음
                  </span>
                )}
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline"
                  >
                    <Mail className="size-3.5" />
                    {contact.email}
                  </a>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-3.5" />
                  {formatDateTime(contact.createdAt)} 등록
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpenDialog('edit')}>
              <Pencil className="size-4" />
              수정
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={removeMutation.isPending}
              onClick={() => setOpenDialog(hasLinkedEntities ? 'deleteBlocked' : 'deleteConfirm')}
            >
              <Trash2 className="size-4" />
              삭제
            </Button>
          </div>
        </div>

        {/* 후속 액션 CTA (PRD 9장: 저장 후 후속 액션 / 12장: 연결 화면) */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpenDialog('consultation')}>
            <MessageSquarePlus className="size-4" />
            상담 기록
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpenDialog('buyerReq')}>
            <Target className="size-4" />
            매수요건 추가
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpenDialog('propertyLink')}>
            <Building2 className="size-4" />
            매물 연결
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpenDialog('task')}>
            <CalendarPlus className="size-4" />
            할 일 추가
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpenDialog('relation')}>
            <Users className="size-4" />
            관계 추가
          </Button>
        </div>

        {/* PRD 5장 — 좌 2/3 정보 영역 + 우 1/3 상담내역 고정 스크롤 패널 */}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
          <div className="min-w-0 space-y-4">
            {/* 기본 프로필 + 메모 */}
            <DetailSection
              icon={UserRound}
              title="기본 정보"
              description="연락 정보, 그룹·태그, 메모"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <InfoField label="이름" value={contact.name} icon={UserRound} />
                <InfoField label="이메일" value={contact.email ?? '—'} icon={Mail} />
                {phones.map((phone, index) => (
                  <InfoField
                    key={phone.key}
                    label={phone.label || (index === 0 ? '전화번호' : `전화번호 ${index + 1}`)}
                    value={`${formatPhone(phone.phone)}${phone.isPrimary ? ' (주)' : ''}`}
                    icon={Phone}
                    mono
                  />
                ))}
                <InfoField label="등록일" value={formatDateTime(contact.createdAt)} icon={Clock3} />
                <InfoField label="수정일" value={formatDateTime(contact.updatedAt)} icon={Clock3} />
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-xs font-medium text-muted-foreground">그룹 / 태그</p>
                  <div className="flex flex-wrap gap-1.5">
                    <ContactTagBadges tags={contact.tags} />
                    {contact.tags.filter((tag) => Boolean(tag)).length === 0 && (
                      <p className="text-sm text-muted-foreground">지정된 그룹/태그가 없습니다.</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-xs font-medium text-muted-foreground">메모</p>
                  {contact.memo ? (
                    <p className="whitespace-pre-wrap rounded-md border bg-muted/30 px-4 py-3 text-sm leading-relaxed">
                      {contact.memo}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">작성된 메모가 없습니다.</p>
                  )}
                </div>
              </div>
            </DetailSection>

            {/* 연결된 연락처(관계) */}
            <DetailSection
              icon={Users}
              title={`연결된 연락처 (관계) ${relationshipItems.length}`}
              description="가족, 공동 명의, 전문가 관계"
              action={
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setOpenDialog('relation')}>
                  <Plus className="size-3.5" />
                  추가
                </Button>
              }
            >
              {relationshipItems.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="등록된 관계가 없습니다"
                  description="가족·법무사 등 관련 인물을 연결해 두면 상담 맥락 파악이 빨라집니다."
                  className="py-8"
                  action={
                    <Button variant="outline" size="sm" onClick={() => setOpenDialog('relation')}>
                      <Plus className="size-3.5" />
                      관계 추가
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {relationshipItems.map((item) => (
                    <RelationCard
                      key={item.id}
                      item={item}
                      deleting={
                        removeRelationMutation.isPending &&
                        relationToDelete?.relationId === item.relationId
                      }
                      onDelete={() => setRelationToDelete(item)}
                    />
                  ))}
                </div>
              )}
            </DetailSection>

            {/* 소유물건 / 연결 매물 */}
            <DetailSection
              icon={Building2}
              title={`연결 매물 ${propertyContacts.length}`}
              description="소유주, 대리인 등 매물과의 연결"
              action={
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setOpenDialog('propertyLink')}>
                  <Plus className="size-3.5" />
                  연결
                </Button>
              }
            >
              {propertyContactsLoading ? (
                <StackSkeleton rows={2} />
              ) : propertyContacts.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title="연결된 매물이 없습니다"
                  className="py-8"
                  action={
                    <Button variant="outline" size="sm" onClick={() => setOpenDialog('propertyLink')}>
                      <Plus className="size-3.5" />
                      매물 연결
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {propertyContacts.map((propertyContact) => (
                    <PropertyContactCard key={propertyContact.id} propertyContact={propertyContact} />
                  ))}
                </div>
              )}
            </DetailSection>

            {/* 구매요구조건 */}
            <DetailSection
              icon={Target}
              title={`매수요건 ${buyerRequirements.length}`}
              description="희망 조건과 추적 상태"
              action={
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
                    <Link to="/buyer-requirements">구매고객 페이지</Link>
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setOpenDialog('buyerReq')}>
                    <Plus className="size-3.5" />
                    추가
                  </Button>
                </div>
              }
            >
              {buyerRequirementsLoading ? (
                <StackSkeleton rows={2} />
              ) : buyerRequirements.length === 0 ? (
                <EmptyState
                  icon={Target}
                  title="등록된 매수요건이 없습니다"
                  className="py-8"
                  action={
                    <Button variant="outline" size="sm" onClick={() => setOpenDialog('buyerReq')}>
                      <Plus className="size-3.5" />
                      매수요건 추가
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {buyerRequirements.map((requirement) => (
                    <BuyerRequirementCard key={requirement.id} requirement={requirement} />
                  ))}
                </div>
              )}
            </DetailSection>
          </div>

          {/* 우측 1/3 — 상담내역 전용 패널 (독립 스크롤, 여러 줄 내용 그대로) */}
          <aside className="min-w-0 rounded-lg border border-border/60 bg-background xl:sticky xl:top-4">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <p className="truncate text-sm font-semibold">상담내역 {consultations.length}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
                  <Link to="/consultations">전체 보기</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setOpenDialog('consultation')}
                >
                  <Plus className="size-3.5" />
                  기록
                </Button>
              </div>
            </div>
            <div className="space-y-3 overflow-y-auto p-4 xl:max-h-[calc(100vh-11rem)]">
              {consultationsLoading ? (
                <StackSkeleton rows={3} />
              ) : consultations.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="상담 이력이 없습니다"
                  className="py-8"
                  action={
                    <Button variant="outline" size="sm" onClick={() => setOpenDialog('consultation')}>
                      <Plus className="size-3.5" />
                      상담 기록
                    </Button>
                  }
                />
              ) : (
                consultations.map((consultation) => (
                  <ConsultationCard key={consultation.id} consultation={consultation} />
                ))
              )}
            </div>
          </aside>
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
            ? `${relationToDelete.counterpartName} 님과의 "${
                relationToDelete.relation.label ||
                relationTypeLabels[relationToDelete.relation.relationType] ||
                relationToDelete.relation.relationType
              }" 관계만 삭제됩니다. 상대 연락처는 유지됩니다.`
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

function DetailSection({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-background">
      <div className="flex items-start justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function InfoField({
  label,
  value,
  icon: Icon,
  mono = false,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className={cn('text-sm font-medium', mono && 'tabular-nums')}>{value}</p>
    </div>
  );
}

function StackSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-md" />
      ))}
    </div>
  );
}
