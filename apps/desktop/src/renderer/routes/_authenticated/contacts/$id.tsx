import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import type { BuyerRequirement, ContactDetail, ContactRelation, PropertyContact } from '@estate-erp/api-client';
import { formatPrice, sqmToPyeong } from '@estate-erp/shared';
import {
  ArrowLeft,
  Building2,
  Clock3,
  Link2,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Target,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhoneNumber, mergeContactTags, splitContactTags, stringifyContactTags } from '@/lib/contacts';
import { cn } from '@/lib/utils';
import { ContactGroupSelector } from '@/components/contacts/contact-group-selector';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

const consultationTypeColors: Record<string, string> = {
  phone: 'bg-blue-50 text-blue-700',
  visit: 'bg-emerald-50 text-emerald-700',
  online: 'bg-violet-50 text-violet-700',
};

const buyerStatusLabels: Record<string, string> = {
  active: '활성',
  matched: '매칭됨',
  completed: '완료',
  inactive: '비활성',
};

const buyerStatusColors: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  matched: 'bg-blue-50 text-blue-700',
  completed: 'bg-gray-100 text-gray-600',
  inactive: 'bg-gray-50 text-gray-400',
};

const urgencyLabels: Record<string, string> = {
  urgent: '급',
  normal: '보통',
  flexible: '여유',
};

const urgencyColors: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700',
  normal: 'bg-gray-100 text-gray-700',
  flexible: 'bg-sky-50 text-sky-700',
};

const transactionTypeLabels: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

const roleLabels: Record<string, string> = {
  owner: '소유자',
  co_owner: '공동소유',
  representative: '대리인',
  lawyer: '법무사',
  tax_agent: '세무사',
};

type ContactEditForm = {
  name: string;
  phone: string;
  extraPhones: Array<{ phone: string; label: string; isActive: boolean }>;
  email: string;
  groupTags: string[];
  customTagsInput: string;
  memo: string;
};

export const Route = createFileRoute('/_authenticated/contacts/$id')({
  component: ContactDetailPage,
});

function ContactDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = Route.useParams();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editError, setEditError] = useState('');
  const [pageError, setPageError] = useState('');
  const [editForm, setEditForm] = useState<ContactEditForm>({
    name: '',
    phone: '',
    extraPhones: [],
    email: '',
    groupTags: [],
    customTagsInput: '',
    memo: '',
  });

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contacts', id],
    queryFn: () => api.contacts.findOne(id),
  });

  const { data: propertyContacts = [], isLoading: propertyContactsLoading } = useQuery({
    queryKey: ['contacts', id, 'property-contacts'],
    queryFn: () => api.contacts.getPropertyContacts(id),
  });

  const { data: buyerRequirements = [], isLoading: buyerRequirementsLoading } = useQuery({
    queryKey: ['contacts', id, 'buyer-requirements'],
    queryFn: () => api.contacts.getBuyerRequirements(id),
  });

  const { data: consultations = [], isLoading: consultationsLoading } = useQuery({
    queryKey: ['contacts', id, 'consultations'],
    queryFn: () => api.contacts.getConsultations(id),
  });

  const relationshipItems = useMemo(() => {
    if (!contact) return [];

    return [
      ...contact.relationsAsMain.map((relation) => ({
        id: `main-${relation.id}`,
        direction: '연결함',
        relation,
        counterpartName: relation.relatedContact?.name ?? '이름 없음',
        counterpartPhone: relation.relatedContact?.phone ?? null,
      })),
      ...contact.relationsAsRelated.map((relation) => ({
        id: `related-${relation.id}`,
        direction: '연결됨',
        relation,
        counterpartName: relation.contact?.name ?? '이름 없음',
        counterpartPhone: relation.contact?.phone ?? null,
      })),
    ];
  }, [contact]);

  const { groupTags, customTags } = useMemo(
    () => splitContactTags(contact?.tags ?? []),
    [contact?.tags],
  );

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.contacts.update>[1]) =>
      api.contacts.update(id, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
        queryClient.invalidateQueries({ queryKey: ['contacts', id] }),
      ]);
      setEditError('');
      setPageError('');
      setIsEditOpen(false);
    },
    onError: () => {
      setEditError('연락처 수정에 실패했습니다.');
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => api.contacts.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      navigate({ to: '/contacts' });
    },
    onError: () => {
      setPageError('연락처 삭제에 실패했습니다.');
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!contact) {
    return <div className="py-12 text-center text-sm text-muted-foreground">연락처를 찾을 수 없습니다.</div>;
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" className="mt-0.5 size-7" asChild>
              <Link to="/contacts">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">{contact.name}</h1>
                {contact.tags.map((tag) => (
                  <Badge key={tag} variant={groupTags.includes(tag) ? 'default' : 'secondary'}>
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" />
                  {formatPhoneNumber(contact.phone)}
                </span>
                {contact.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-3.5" />
                    {contact.email}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-3.5" />
                  {formatDate(contact.createdAt)} 등록
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditForm(toEditForm(contact));
                setEditError('');
                setIsEditOpen(true);
              }}
            >
              <Pencil className="size-4" />
              수정
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={removeMutation.isPending}
              onClick={() => {
                const confirmed = window.confirm(`"${contact.name}" 연락처를 삭제할까요?`);
                if (confirmed) {
                  setPageError('');
                  removeMutation.mutate();
                }
              }}
            >
              <Trash2 className="size-4" />
              삭제
            </Button>
          </div>
        </div>

        {pageError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {pageError}
          </div>
        )}

        <Tabs defaultValue="overview" className="flex flex-col gap-4">
          <TabsList className="w-fit">
            <TabsTrigger value="overview">기본 정보</TabsTrigger>
            <TabsTrigger value="properties">연결 매물 ({propertyContacts.length})</TabsTrigger>
            <TabsTrigger value="buyers">매수요건 ({buyerRequirements.length})</TabsTrigger>
            <TabsTrigger value="consultations">상담 ({consultations.length})</TabsTrigger>
            <TabsTrigger value="relations">관계 ({relationshipItems.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="rounded-xl border border-border/60 bg-background">
              <div className="grid gap-0 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <div className="border-b border-border/60 px-5 py-4 xl:border-r xl:border-b-0">
                  <SectionHeading
                    title="연락처 프로필"
                    description="기본 연락 정보와 그룹, 추가 태그를 확인합니다."
                  />
                </div>
                <div className="px-5 py-4">
                  <SectionHeading
                    title="메모"
                    description="연락처와 관련된 메모와 참고사항입니다."
                  />
                </div>

                <div className="border-b border-border/60 px-5 py-5 xl:border-r xl:border-b-0">
                  <div className="grid gap-5 sm:grid-cols-2">
                  <InfoField label="이름" value={contact.name} icon={UserRound} />
                  <InfoField label="전화번호" value={formatContactPhones(contact)} icon={Phone} mono />
                  <InfoField label="이메일" value={contact.email ?? '-'} icon={Mail} />
                  <InfoField label="등록일" value={formatDateTime(contact.createdAt)} icon={Clock3} />
                  <InfoField label="수정일" value={formatDateTime(contact.updatedAt)} icon={Clock3} />

                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground">그룹</p>
                    {groupTags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {groupTags.map((tag) => (
                          <Badge key={tag}>
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">지정된 그룹이 없습니다.</p>
                    )}
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground">추가 태그</p>
                    {customTags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {customTags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">추가 태그가 없습니다.</p>
                    )}
                  </div>
                  </div>
                </div>

                <div className="px-5 py-5">
                  {contact.memo ? (
                    <p className="whitespace-pre-wrap rounded-lg border bg-muted/30 px-4 py-3 text-sm leading-relaxed">
                      {contact.memo}
                    </p>
                  ) : (
                    <EmptyState message="작성된 메모가 없습니다." />
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="properties">
            <SectionPanel
              title="연결된 매물"
              description="소유주, 대리인 등 매물과의 연결 관계를 확인합니다."
            >
                {propertyContactsLoading ? (
                  <StackSkeleton rows={3} />
                ) : propertyContacts.length === 0 ? (
                  <EmptyState message="연결된 매물이 없습니다." />
                ) : (
                  <div className="space-y-3">
                    {propertyContacts.map((propertyContact) => (
                      <PropertyContactCard key={propertyContact.id} propertyContact={propertyContact} />
                    ))}
                  </div>
                )}
            </SectionPanel>
          </TabsContent>

          <TabsContent value="buyers">
            <SectionPanel
              title="매수요건"
              description="현재 연락처가 등록한 희망 조건과 추적 상태입니다."
            >
                {buyerRequirementsLoading ? (
                  <StackSkeleton rows={3} />
                ) : buyerRequirements.length === 0 ? (
                  <EmptyState message="등록된 매수요건이 없습니다." />
                ) : (
                  <div className="space-y-3">
                    {buyerRequirements.map((requirement) => (
                      <BuyerRequirementCard key={requirement.id} requirement={requirement} />
                    ))}
                  </div>
                )}
            </SectionPanel>
          </TabsContent>

          <TabsContent value="consultations">
            <SectionPanel
              title="상담 이력"
              description="연락처와의 최근 상담 기록과 연계 매물을 봅니다."
            >
                {consultationsLoading ? (
                  <StackSkeleton rows={3} />
                ) : consultations.length === 0 ? (
                  <EmptyState message="상담 이력이 없습니다." />
                ) : (
                  <div className="space-y-3">
                    {consultations.map((consultation) => (
                      <ConsultationCard key={consultation.id} consultation={consultation} />
                    ))}
                  </div>
                )}
            </SectionPanel>
          </TabsContent>

          <TabsContent value="relations">
            <SectionPanel
              title="연락처 관계"
              description="가족, 공동 명의, 참조 관계 등 연락처 간 연결입니다."
            >
                {relationshipItems.length === 0 ? (
                  <EmptyState message="등록된 관계가 없습니다." />
                ) : (
                  <div className="space-y-3">
                    {relationshipItems.map((item) => (
                      <RelationCard
                        key={item.id}
                        direction={item.direction}
                        relation={item.relation}
                        counterpartName={item.counterpartName}
                        counterpartPhone={item.counterpartPhone}
                      />
                    ))}
                  </div>
                )}
            </SectionPanel>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>연락처 수정</DialogTitle>
            <DialogDescription>연락처 정보와 태그, 메모를 즉시 수정합니다.</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();

              const name = editForm.name.trim();
              if (!name) {
                setEditError('이름은 필수입니다.');
                return;
              }

              setEditError('');
              updateMutation.mutate({
                name,
                phone: editForm.phone.trim() || undefined,
                phones: [
                  ...(editForm.phone.trim()
                    ? [{ phone: editForm.phone.trim(), label: 'mobile', isPrimary: true, isActive: true }]
                    : []),
                  ...editForm.extraPhones
                    .filter((item) => item.phone.trim())
                    .map((item) => ({
                      phone: item.phone.trim(),
                      label: item.label,
                      isPrimary: false,
                      isActive: item.isActive,
                    })),
                ],
                email: editForm.email.trim() || undefined,
                tags: mergeContactTags(editForm.groupTags, editForm.customTagsInput),
                memo: editForm.memo.trim() || undefined,
              });
            }}
          >
            {editError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {editError}
              </div>
            )}

            <FormField label="이름">
              <Input
                value={editForm.name}
                onChange={(event) => setEditForm((previous) => ({ ...previous, name: event.target.value }))}
                required
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="전화번호">
                <Input
                  type="tel"
                  value={editForm.phone}
                  onChange={(event) => setEditForm((previous) => ({ ...previous, phone: event.target.value }))}
                />
              </FormField>

              <FormField label="추가 번호">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    setEditForm((previous) => ({
                      ...previous,
                      extraPhones: [...previous.extraPhones, { phone: '', label: 'home', isActive: true }],
                    }))
                  }
                >
                  <Plus className="mr-2 size-4" />
                  번호 추가
                </Button>
              </FormField>
            </div>

            {editForm.extraPhones.length > 0 && (
              <div className="space-y-2">
                {editForm.extraPhones.map((item, index) => (
                  <div key={index} className="grid grid-cols-[112px_minmax(0,1fr)_84px_36px] gap-2">
                    <select
                      value={item.label}
                      onChange={(event) =>
                        setEditForm((previous) => ({
                          ...previous,
                          extraPhones: previous.extraPhones.map((phone, phoneIndex) =>
                            phoneIndex === index ? { ...phone, label: event.target.value } : phone,
                          ),
                        }))
                      }
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="home">집전화</option>
                      <option value="work">업무폰</option>
                      <option value="office">회사</option>
                      <option value="fax">팩스</option>
                      <option value="old">예전번호</option>
                      <option value="other">기타</option>
                    </select>
                    <Input
                      type="tel"
                      value={item.phone}
                      onChange={(event) =>
                        setEditForm((previous) => ({
                          ...previous,
                          extraPhones: previous.extraPhones.map((phone, phoneIndex) =>
                            phoneIndex === index ? { ...phone, phone: event.target.value } : phone,
                          ),
                        }))
                      }
                    />
                    <Button
                      type="button"
                      variant={item.isActive ? 'outline' : 'secondary'}
                      onClick={() =>
                        setEditForm((previous) => ({
                          ...previous,
                          extraPhones: previous.extraPhones.map((phone, phoneIndex) =>
                            phoneIndex === index ? { ...phone, isActive: !phone.isActive } : phone,
                          ),
                        }))
                      }
                    >
                      {item.isActive ? '활성' : '비활성'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setEditForm((previous) => ({
                          ...previous,
                          extraPhones: previous.extraPhones.filter((_, phoneIndex) => phoneIndex !== index),
                        }))
                      }
                      aria-label="번호 삭제"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <FormField label="이메일">
              <Input
                type="email"
                value={editForm.email}
                onChange={(event) => setEditForm((previous) => ({ ...previous, email: event.target.value }))}
              />
            </FormField>

            <FormField label="그룹 / 태그">
              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">그룹</p>
                  <ContactGroupSelector
                    selectedTags={editForm.groupTags}
                    onToggle={(tag) => {
                      setEditForm((previous) => ({
                        ...previous,
                        groupTags: previous.groupTags.includes(tag)
                          ? previous.groupTags.filter((item) => item !== tag)
                          : [...previous.groupTags, tag],
                      }));
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">추가 태그</p>
                  <Input
                    value={editForm.customTagsInput}
                    onChange={(event) => setEditForm((previous) => ({ ...previous, customTagsInput: event.target.value }))}
                    placeholder="예: VIP, 소개, 재연락"
                  />
                </div>
              </div>
            </FormField>

            <FormField label="메모">
              <Textarea
                rows={4}
                value={editForm.memo}
                onChange={(event) => setEditForm((previous) => ({ ...previous, memo: event.target.value }))}
              />
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? '저장 중...' : '저장'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PropertyContactCard({ propertyContact }: { propertyContact: PropertyContact }) {
  const title = propertyContact.property?.site?.name ?? '연결 매물';
  const subtitle = [propertyContact.property?.unit?.name, propertyContact.property?.site?.roadAddress || propertyContact.property?.site?.jibunAddress]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          {propertyContact.property ? (
            <Link
              to="/properties/$id"
              params={{ id: propertyContact.propertyId }}
              className="text-sm font-medium hover:text-primary hover:underline"
            >
              {title}
            </Link>
          ) : (
            <p className="text-sm font-medium">{title}</p>
          )}
          <p className="text-sm text-muted-foreground">{subtitle || '위치 정보 없음'}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge variant="secondary">{roleLabels[propertyContact.role] ?? propertyContact.role}</Badge>
          {propertyContact.isPrimary && <Badge>주 연락처</Badge>}
          {propertyContact.isResident && <Badge variant="outline">거주중</Badge>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {propertyContact.shareRatio !== null && <span>지분 {propertyContact.shareRatio}%</span>}
        <span>상태 {propertyContact.status}</span>
      </div>

      {propertyContact.memo && (
        <p className="mt-3 rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {propertyContact.memo}
        </p>
      )}
    </div>
  );
}

function BuyerRequirementCard({ requirement }: { requirement: BuyerRequirement }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={cn('border-transparent', buyerStatusColors[requirement.status] ?? 'bg-gray-100 text-gray-700')}>
              {buyerStatusLabels[requirement.status] ?? requirement.status}
            </Badge>
            <Badge className={cn('border-transparent', urgencyColors[requirement.urgency] ?? 'bg-gray-100 text-gray-700')}>
              {urgencyLabels[requirement.urgency] ?? requirement.urgency}
            </Badge>
            {requirement.transactionType && (
              <Badge variant="outline">
                {transactionTypeLabels[requirement.transactionType] ?? requirement.transactionType}
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium">{formatBudgetSummary(requirement)}</p>
          <p className="text-sm text-muted-foreground">
            {formatAreaSummary(requirement)}
            {(() => {
              const regions = (requirement.preferredRegions ?? [])
                .map((r) => r.ward?.name ?? r.district?.name ?? r.province?.name ?? '')
                .filter(Boolean);
              return regions.length > 0 ? ` · ${regions.join(', ')}` : '';
            })()}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>등록 {formatDate(requirement.createdAt)}</p>
          {requirement.nextContactDate && <p>다음 연락 {formatDate(requirement.nextContactDate)}</p>}
        </div>
      </div>

      {requirement.memo && (
        <p className="mt-3 rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {requirement.memo}
        </p>
      )}
    </div>
  );
}

function ConsultationCard({ consultation }: { consultation: ContactDetail['consultations'][number] }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={cn('border-transparent', consultationTypeColors[consultation.type] ?? 'bg-gray-100 text-gray-700')}>
              {consultationTypeLabels[consultation.type] ?? consultation.type}
            </Badge>
            {consultation.contact?.name && (
              <Badge variant="secondary">{consultation.contact.name}</Badge>
            )}
            {consultation.property?.site?.name && (
              <Badge variant="outline">{consultation.property.site.name}</Badge>
            )}
            {consultation.listing?.transactionType && (
              <Badge variant="outline">
                {transactionTypeLabels[consultation.listing.transactionType] ?? consultation.listing.transactionType}
                {consultation.listing.price ? ` · ${formatPrice(consultation.listing.price)}` : ''}
              </Badge>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{consultation.content}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>{formatDateTime(consultation.createdAt)}</p>
          {consultation.createdBy?.name && <p>{consultation.createdBy.name}</p>}
        </div>
      </div>
    </div>
  );
}

function RelationCard({
  direction,
  relation,
  counterpartName,
  counterpartPhone,
}: {
  direction: string;
  relation: ContactRelation;
  counterpartName: string;
  counterpartPhone: string | null;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline">{direction}</Badge>
            <Badge variant="secondary">{relation.label || relation.relationType}</Badge>
          </div>
          <p className="text-sm font-medium">{counterpartName}</p>
          <p className="text-sm text-muted-foreground">{formatPhoneNumber(counterpartPhone)}</p>
        </div>
        <Link2 className="mt-1 size-4 text-muted-foreground" />
      </div>

      {relation.memo && (
        <p className="mt-3 rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {relation.memo}
        </p>
      )}
    </div>
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
      <p className={cn('whitespace-pre-line text-sm font-medium', mono && 'tabular-nums')}>{value}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function StackSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function SectionPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background">
      <div className="border-b border-border/60 px-5 py-4">
        <SectionHeading title={title} description={description} />
      </div>
      <div className="px-5 py-5">
        {children}
      </div>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function toEditForm(contact: ContactDetail): ContactEditForm {
  const { groupTags, customTags } = splitContactTags(contact.tags);
  const phones = contact.phones ?? [];
  const primaryPhone = phones.find((phone) => phone.isPrimary)?.phone ?? contact.phone ?? '';
  const extraPhones = phones
    .filter((phone) => phone.phone !== primaryPhone)
    .map((phone) => ({
      phone: phone.phone,
      label: phone.label,
      isActive: phone.isActive,
    }));

  return {
    name: contact.name,
    phone: primaryPhone,
    extraPhones,
    email: contact.email ?? '',
    groupTags,
    customTagsInput: stringifyContactTags(customTags),
    memo: contact.memo ?? '',
  };
}

function formatContactPhones(contact: ContactDetail) {
  const phones = contact.phones?.length
    ? contact.phones.map((item) => item.phone)
    : contact.phone
      ? [contact.phone]
      : [];

  return phones.length > 0
    ? phones.map((phone) => formatPhoneNumber(phone)).join('\n')
    : '-';
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBudgetSummary(requirement: BuyerRequirement) {
  if (requirement.transactionType === 'monthly') {
    const deposit = formatRange(requirement.depositMin, requirement.depositMax);
    const monthly = requirement.monthlyRentMax ? `${formatPrice(requirement.monthlyRentMax)} 이하` : '협의';
    return `보증금 ${deposit} · 월세 ${monthly}`;
  }

  if (requirement.transactionType === 'jeonse') {
    return `전세 ${formatRange(requirement.depositMin, requirement.depositMax)}`;
  }

  return `매매 ${formatRange(requirement.priceMin, requirement.priceMax)}`;
}

function formatRange(min: number | null, max: number | null) {
  if (min && max) return `${formatPrice(min)} ~ ${formatPrice(max)}`;
  if (min) return `${formatPrice(min)} 이상`;
  if (max) return `${formatPrice(max)} 이하`;
  return '협의';
}

function formatAreaSummary(requirement: BuyerRequirement) {
  if (!requirement.areaMin && !requirement.areaMax) return '면적 조건 없음';
  if (requirement.areaMin && requirement.areaMax) {
    return `${sqmToPyeong(requirement.areaMin)}평 ~ ${sqmToPyeong(requirement.areaMax)}평`;
  }
  if (requirement.areaMin) return `${sqmToPyeong(requirement.areaMin)}평 이상`;
  return `${sqmToPyeong(requirement.areaMax ?? 0)}평 이하`;
}
