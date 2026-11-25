import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { Contact, ContactDetail, Party } from '@estate-erp/api-client';
import {
  ContactKind,
  HOUSEHOLD_ROLE_PRESETS,
  ORGANIZATION_ROLE_PRESETS,
  PartyKind,
} from '@estate-erp/shared';
import { Building2, Check, Home, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { formatPhoneWhileTyping } from '@/lib/phone';
import {
  normalizePhone,
} from '@/lib/contacts';
import { cn } from '@/lib/utils';
import {
  ContactPhonesEditor,
  createEmptyPhone,
  toEditablePhones,
  toPhoneInputs,
  firstPhoneValue,
  type EditablePhone,
} from '@/components/contacts/contact-phones-editor';
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  apiErrorMessage,
  findPhoneProblem,
  type PartyDisplayItem,
} from './-detail-cards';
import { diffContactGroups } from './-contact-categories';
import { ContactTagsField, useContactTagColors } from './-contact-tag-picker';
import { diffContactTags } from './-contact-tags';
import { ContactTagChip } from '@/components/contacts/contact-tag-chip';
import { ContactGroupPicker } from './-contact-group-picker';
import { isPlaceholderContactName } from './-contact-name';

/**
 * 연락처 상세 — 연락처 자체를 다루는 다이얼로그 (수정 / 관계 추가).
 * 상담·할 일·매물 연결·매수요건 다이얼로그는 ./-detail-action-dialogs.tsx 참고.
 * 모든 mutation은 toast.success/error + 관련 queryKey invalidate를 수행한다.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function FormField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ── 1. 연락처 수정 (ContactPhone[] 동적 행 편집 — 3개 이상 번호 보존) ──

export function ContactEditDialog({
  contact,
  open,
  onOpenChange,
  initialAddPhone = false,
}: {
  contact: ContactDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAddPhone?: boolean;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ContactKind>(ContactKind.PERSON);
  const [name, setName] = useState('');
  const [businessRegNo, setBusinessRegNo] = useState('');
  const [phones, setPhones] = useState<EditablePhone[]>([]);
  const [email, setEmail] = useState('');
  // 태그도 그룹처럼 창을 연 때의 값과 비교해 바꾼 것만 붙이고 뗀다.
  const [initialTags, setInitialTags] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  // 그룹은 창을 연 때의 소속과 비교해 바꾼 것만 보낸다. 창을 연 사이 다른 직원이 넣은 그룹을 빼지 않는다.
  const [initialGroups, setInitialGroups] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');

  // 이름을 모르는 손님(임시 이름)이면 이름 칸을 비워 두고 바로 적게 한다. 비운 채 저장하면 임시 이름이 그대로 남는다.
  const hasPlaceholderName = isPlaceholderContactName(contact.name);

  useEffect(() => {
    if (!open) return;
    setKind(contact.kind ?? ContactKind.PERSON);
    setName(isPlaceholderContactName(contact.name) ? '' : contact.name);
    setBusinessRegNo(contact.businessRegNo ?? '');
    const editable = toEditablePhones(contact);
    if (initialAddPhone && editable.some((row) => row.phone.trim().length > 0)) {
      editable.push(createEmptyPhone(false));
    }
    setPhones(editable);
    setEmail(contact.email ?? '');
    setInitialTags(contact.tags);
    setTags(contact.tags);
    setInitialGroups(contact.groups ?? []);
    setGroups(contact.groups ?? []);
    setMemo(contact.memo ?? '');
    setError('');
  }, [open, contact, initialAddPhone]);

  const mutation = useMutation({
    mutationFn: async () => {
      const phoneInputs = toPhoneInputs(phones);
      await api.contacts.update(contact.id, {
        kind,
        name: name.trim() || (hasPlaceholderName ? undefined : name.trim()),
        businessRegNo:
          kind === ContactKind.ORGANIZATION ? businessRegNo.trim() || null : null,
        phone: firstPhoneValue(phones) || undefined,
        phones: phoneInputs,
        // 빈 입력은 null로 보내 기존 값을 지운다 (undefined는 "변경 없음"으로 처리됨)
        email: email.trim() || null,
        memo: memo.trim() || null,
      });
      // 그룹과 태그는 연락처와 따로 저장된다. 연락처는 이미 저장됐으므로 실패한 것만 알려 준다.
      // 통째로 덮지 않고 바꾼 것만 붙이고 떼어, 창을 연 사이 다른 직원이 넣은 것을 지우지 않는다.
      const { added, removed } = diffContactGroups(initialGroups, groups);
      const tagChanges = diffContactTags(initialTags, tags);
      const results = await Promise.allSettled([
        ...added.map((name) => api.contacts.addGroupMembers(name, [contact.id])),
        ...removed.map((name) => api.contacts.removeGroupMembers(name, [contact.id])),
        ...tagChanges.added.map((name) => api.contacts.assignTag(name, [contact.id])),
        ...tagChanges.removed.map((name) => api.contacts.unassignTag(name, [contact.id])),
      ]);
      return { groupFailures: results.filter(({ status }) => status === 'rejected').length };
    },
    onSuccess: async ({ groupFailures }) => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      if (groupFailures > 0) {
        toast.warning('연락처는 수정했지만 그룹 · 태그 변경 일부가 저장되지 않았습니다.');
      } else {
        toast.success('연락처가 수정되었습니다.');
      }
      onOpenChange(false);
    },
    onError: (caught) => {
      // 창은 열어 둔 채로 이유를 보인다. 적은 내용은 그대로 남는다.
      const message = apiErrorMessage(caught, '연락처를 저장하지 못했습니다. 잠시 뒤 다시 시도하세요.');
      setError(message);
      toast.error(message);
    },
  });

  // 고친 것이 있는지. 창 밖을 잘못 눌러 적은 메모 · 번호가 말없이 사라지지 않게 할 때 쓴다 (닫기는 취소 · Esc)
  const isDirty =
    kind !== (contact.kind ?? ContactKind.PERSON) ||
    businessRegNo !== (contact.businessRegNo ?? '') ||
    name !== (hasPlaceholderName ? '' : contact.name) ||
    email !== (contact.email ?? '') ||
    memo !== (contact.memo ?? '') ||
    phones.map((row) => `${row.phone}:${row.label}:${row.isPrimary}`).join('|') !==
      toEditablePhones(contact)
        .map((row) => `${row.phone}:${row.label}:${row.isPrimary}`)
        .join('|') ||
    tags.join('|') !== initialTags.join('|') ||
    groups.join('|') !== initialGroups.join('|');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onInteractOutside={(event) => {
          if (isDirty) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>연락처 수정</DialogTitle>
          <DialogDescription>
            연락처 정보와 태그, 메모를 수정합니다. 전화번호는 라벨과 함께 여러 개 관리할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() && !hasPlaceholderName) {
              setError('이름은 필수입니다.');
              return;
            }
            if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
              setError('이메일 형식이 올바르지 않습니다.');
              return;
            }
            const phoneProblem = findPhoneProblem(phones.map((row) => row.phone));
            if (phoneProblem) {
              setError(phoneProblem);
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

          <FormField label="구분">
            <div className="flex gap-1.5">
              {[
                { value: ContactKind.PERSON, label: '개인' },
                { value: ContactKind.ORGANIZATION, label: '법인·단체' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setKind(option.value)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    kind === option.value
                      ? 'border-transparent bg-info-soft text-info'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </FormField>

          <FormField
            label={kind === ContactKind.ORGANIZATION ? '법인·단체명' : '이름'}
            required={!hasPlaceholderName}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required={!hasPlaceholderName}
              placeholder={hasPlaceholderName ? `지금은 "${contact.name}"(으)로 저장되어 있습니다` : undefined}
            />
          </FormField>

          {kind === ContactKind.ORGANIZATION && (
            <FormField label="사업자등록번호">
              <Input
                value={businessRegNo}
                onChange={(event) => setBusinessRegNo(event.target.value)}
                placeholder="123-45-67890"
              />
            </FormField>
          )}

          <FormField label="전화번호">
            <ContactPhonesEditor phones={phones} onChange={setPhones} />
          </FormField>

          <FormField label="이메일">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </FormField>

          <FormField label="그룹">
            <ContactGroupPicker selected={groups} onChange={setGroups} />
          </FormField>

          <FormField label="태그">
            <ContactTagsField value={tags} onChange={setTags} />
          </FormField>

          <FormField label="메모">
            <Textarea rows={4} value={memo} onChange={(event) => setMemo(event.target.value)} />
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

// ── 2. 새 파티 · 소속 만들기 (직접 파티 생성 또는 기존 파티 연결) ──

export type PartyCreateTab = 'new-household' | 'new-org' | 'join-existing';

interface InitialHouseholdMemberDraft {
  key: string;
  name: string;
  phone: string;
  roleLabel: string;
}

let draftMemberSeq = 0;

export function PartyAddDialog({
  contactId,
  contactKind,
  contactName,
  existingHousehold,
  existingOrgParty,
  initialTab,
  open,
  onOpenChange,
  onSwitchToAddMember,
}: {
  contactId: string;
  contactKind: ContactKind;
  contactName: string;
  existingHousehold?: Party | null;
  existingOrgParty?: Party | null;
  initialTab?: PartyCreateTab;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitchToAddMember?: (party: Party) => void;
}) {
  const queryClient = useQueryClient();
  const isOrganization = contactKind === ContactKind.ORGANIZATION;

  const [tab, setTab] = useState<PartyCreateTab>('new-household');
  const [error, setError] = useState('');

  // Tab 1: 새 세대 만들기
  const [hhName, setHhName] = useState('');
  const [hhPhone, setHhPhone] = useState('');
  const [hhMemo, setHhMemo] = useState('');
  const [hhSelfRole, setHhSelfRole] = useState('');
  const [hhSelfPrimary, setHhSelfPrimary] = useState(true);
  const [hhInitialMembers, setHhInitialMembers] = useState<InitialHouseholdMemberDraft[]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftRole, setDraftRole] = useState('');

  // Tab 2: 새 법인·단체 만들기
  const [orgName, setOrgName] = useState('');
  const [orgBizNo, setOrgBizNo] = useState('');
  const [orgPhone, setOrgPhone] = useState('');
  const [orgMemo, setOrgMemo] = useState('');
  const [orgSelfRole, setOrgSelfRole] = useState('');
  const [orgSelfPrimary, setOrgSelfPrimary] = useState(true);

  // Tab 3: 기존 파티에 연결
  const [partySearch, setPartySearch] = useState('');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [joinRole, setJoinRole] = useState('');
  const [joinPrimary, setJoinPrimary] = useState(false);
  const [joinMemo, setJoinMemo] = useState('');

  useEffect(() => {
    if (!open) return;
    const defaultTab: PartyCreateTab =
      initialTab ??
      (isOrganization
        ? 'new-org'
        : existingHousehold
          ? 'new-org'
          : 'new-household');
    setTab(defaultTab);
    setError('');

    setHhName(`${contactName} 님 세대`);
    setHhPhone('');
    setHhMemo('');
    setHhSelfRole('');
    setHhSelfPrimary(true);
    setHhInitialMembers([]);
    setDraftName('');
    setDraftPhone('');
    setDraftRole('');

    setOrgName(isOrganization ? contactName : '');
    setOrgBizNo('');
    setOrgPhone('');
    setOrgMemo('');
    setOrgSelfRole('');
    setOrgSelfPrimary(true);

    setPartySearch('');
    setSelectedParty(null);
    setJoinRole('');
    setJoinPrimary(false);
    setJoinMemo('');
  }, [open, initialTab, isOrganization, existingHousehold, contactName]);

  const partiesSearchQuery = useQuery({
    queryKey: ['parties', 'search', partySearch.trim()],
    queryFn: () =>
      api.parties.search({
        search: partySearch.trim() || undefined,
        limit: 12,
      }),
    enabled: open && tab === 'join-existing' && !isOrganization,
  });

  const joinableParties = (partiesSearchQuery.data?.items ?? []).filter((party) => {
    if (party.members.some((member) => member.contactId === contactId)) return false;
    if (party.kind === PartyKind.HOUSEHOLD && existingHousehold) return false;
    return true;
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (tab === 'new-household') {
        return api.parties.createParty({
          kind: PartyKind.HOUSEHOLD,
          contactId,
          name: hhName.trim() || `${contactName} 님 세대`,
          homePhone: hhPhone.trim() || undefined,
          memo: hhMemo.trim() || undefined,
          selfRoleLabel: hhSelfRole.trim() || undefined,
          selfIsPrimary: hhSelfPrimary,
          initialMembers: hhInitialMembers.map((item) => ({
            name: item.name.trim() || undefined,
            phone: item.phone.trim() || undefined,
            roleLabel: item.roleLabel.trim() || undefined,
          })),
        });
      }

      if (tab === 'new-org') {
        return api.parties.createParty({
          kind: PartyKind.ORGANIZATION,
          contactId,
          name: orgName.trim() || undefined,
          businessRegNo: orgBizNo.trim() || undefined,
          homePhone: orgPhone.trim() || undefined,
          memo: orgMemo.trim() || undefined,
          ...(!isOrganization
            ? {
                selfRoleLabel: orgSelfRole.trim() || undefined,
                selfIsPrimary: orgSelfPrimary,
              }
            : {}),
        });
      }

      if (!selectedParty) {
        throw new Error('연결할 기존 파티를 선택해 주세요.');
      }
      return api.parties.addMember(selectedParty.id, {
        memberContactId: contactId,
        roleLabel: joinRole.trim() || undefined,
        isPrimary: joinPrimary,
        memo: joinMemo.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(
        tab === 'join-existing'
          ? '기존 파티에 연결했습니다.'
          : '새 파티를 만들었습니다.',
      );
      onOpenChange(false);
    },
    onError: (caught) => {
      const message = apiErrorMessage(caught, '파티를 저장하지 못했습니다. 잠시 뒤 다시 시도하세요.');
      setError(message);
      toast.error(message);
    },
  });

  const appendDraftMember = () => {
    if (!draftName.trim() && normalizePhone(draftPhone).length < 7) {
      setError('추가할 가족 이름이나 전화번호(7자리 이상)를 입력하세요.');
      return;
    }
    setError('');
    draftMemberSeq += 1;
    setHhInitialMembers((prev) => [
      ...prev,
      {
        key: `draft-${draftMemberSeq}`,
        name: draftName.trim(),
        phone: draftPhone.trim(),
        roleLabel: draftRole.trim(),
      },
    ]);
    setDraftName('');
    setDraftPhone('');
    setDraftRole('');
  };

  const blockedNewHousehold =
    tab === 'new-household' && (isOrganization || Boolean(existingHousehold));
  const blockedNewOrg =
    tab === 'new-org' && isOrganization && Boolean(existingOrgParty);
  const blockedJoin =
    tab === 'join-existing' && (isOrganization || !selectedParty);
  const submitDisabled =
    createMutation.isPending || blockedNewHousehold || blockedNewOrg || blockedJoin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>새 파티 · 소속 만들기</DialogTitle>
          <DialogDescription>
            {isOrganization
              ? `${contactName} 법인의 담당자 구성을 담는 법인 파티를 생성합니다.`
              : `${contactName} 님 기준으로 새 세대·법인을 만들거나 기존 파티에 연결합니다.`}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (tab === 'new-household' && !hhName.trim()) {
              setError('세대 이름을 입력하세요.');
              return;
            }
            if (tab === 'new-org' && !isOrganization && !orgName.trim()) {
              setError('법인·단체명을 입력하세요.');
              return;
            }
            if (tab === 'join-existing' && !selectedParty) {
              setError('연결할 기존 파티를 선택하세요.');
              return;
            }
            setError('');
            createMutation.mutate();
          }}
        >
          <div className="grid grid-cols-3 gap-1 rounded-md border bg-muted/40 p-1">
            {[
              { value: 'new-household' as const, label: '새 세대 만들기' },
              { value: 'new-org' as const, label: '새 법인·단체' },
              { value: 'join-existing' as const, label: '기존 파티 연결' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setTab(option.value);
                  setError('');
                }}
                className={cn(
                  'rounded px-2 py-1.5 text-xs font-medium transition-colors',
                  tab === option.value
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {tab === 'new-household' && (
            isOrganization ? (
              <div className="rounded-md bg-[#fbf3db] px-3 py-2.5 text-xs leading-relaxed text-[#402c1b]">
                법인 연락처에는 세대·가족 파티를 만들 수 없습니다. &apos;새 법인·단체&apos; 탭에서 법인 파티를 생성하세요.
              </div>
            ) : existingHousehold ? (
              <div className="space-y-2 rounded-md bg-[#fbf3db] px-3 py-2.5 text-xs leading-relaxed text-[#402c1b]">
                <p>
                  {`${contactName} 님은 이미 ${existingHousehold.name ?? '세대'}에 속해 있습니다 (1인 1세대 원칙).`}
                </p>
                {onSwitchToAddMember && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 bg-white text-xs"
                    onClick={() => {
                      onOpenChange(false);
                      onSwitchToAddMember(existingHousehold);
                    }}
                  >
                    기존 세대에 구성원 추가하기
                  </Button>
                )}
              </div>
            ) : (
              <>
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  다른 사람을 먼저 찾지 않아도 1인 세대로 먼저 만든 뒤 나중에 가족을 추가할 수 있습니다.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="세대 이름" required>
                    <Input
                      value={hhName}
                      onChange={(event) => setHhName(event.target.value)}
                      placeholder="예: 김철수 님 세대"
                    />
                  </FormField>
                  <FormField label="집 전화 (선택)">
                    <Input
                      type="tel"
                      inputMode="tel"
                      value={hhPhone}
                      onChange={(event) => setHhPhone(formatPhoneWhileTyping(event.target.value))}
                      placeholder="02-415-8820"
                    />
                  </FormField>
                </div>

                <FormField label={`${contactName} 님의 세대 내 역할`}>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {HOUSEHOLD_ROLE_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setHhSelfRole(preset)}
                          className={cn(
                            'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                            hhSelfRole === preset
                              ? 'border-transparent bg-info-soft text-info'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted',
                          )}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <Input
                      value={hhSelfRole}
                      onChange={(event) => setHhSelfRole(event.target.value)}
                      placeholder="직접 입력 (선택)"
                    />
                  </div>
                </FormField>

                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={hhSelfPrimary}
                    onCheckedChange={(checked) => setHhSelfPrimary(checked === true)}
                  />
                  이 세대의 대표 연락자로 지정
                </label>

                <FormField label="함께 등록할 가족 (선택 · 0명 이상)">
                  <div className="space-y-2">
                    {hhInitialMembers.length > 0 && (
                      <div className="space-y-1.5">
                        {hhInitialMembers.map((item) => (
                          <div
                            key={item.key}
                            className="flex items-center justify-between rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs"
                          >
                            <span>
                              <strong>{item.name || '이름 미정'}</strong>
                              {item.roleLabel && ` · ${item.roleLabel}`}
                              {item.phone && ` · ${item.phone}`}
                            </span>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive"
                              aria-label="임시 가족 제외"
                              onClick={() =>
                                setHhInitialMembers((prev) =>
                                  prev.filter((row) => row.key !== item.key),
                                )
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_92px_auto]">
                      <Input
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        placeholder="이름"
                      />
                      <Input
                        type="tel"
                        inputMode="tel"
                        value={draftPhone}
                        onChange={(event) => setDraftPhone(formatPhoneWhileTyping(event.target.value))}
                        placeholder="휴대폰 (선택)"
                      />
                      <Input
                        value={draftRole}
                        onChange={(event) => setDraftRole(event.target.value)}
                        placeholder="역할 (예: 아내)"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={appendDraftMember}>
                        <Plus className="size-3.5" />
                        추가
                      </Button>
                    </div>
                  </div>
                </FormField>

                <FormField label="세대 메모 (선택)">
                  <Textarea
                    rows={2}
                    value={hhMemo}
                    onChange={(event) => setHhMemo(event.target.value)}
                    placeholder="예: 실거주 아파트 및 자녀 전세 동시 진행"
                  />
                </FormField>
              </>
            )
          )}

          {tab === 'new-org' && (
            isOrganization && existingOrgParty ? (
              <div className="space-y-2 rounded-md bg-[#fbf3db] px-3 py-2.5 text-xs leading-relaxed text-[#402c1b]">
                <p>
                  {`이 법인에는 이미 ${existingOrgParty.organizationContact?.name ?? contactName} 법인 파티가 생성되어 있습니다.`}
                </p>
                {onSwitchToAddMember && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 bg-white text-xs"
                    onClick={() => {
                      onOpenChange(false);
                      onSwitchToAddMember(existingOrgParty);
                    }}
                  >
                    법인 담당자 추가하기
                  </Button>
                )}
              </div>
            ) : (
              <>
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {isOrganization
                    ? `${contactName} 법인의 대표자·실무 담당자를 관리할 법인 파티를 생성합니다.`
                    : `새 법인·단체 연락처와 법인 파티를 함께 만들고 ${contactName} 님을 담당자로 연결합니다.`}
                </p>
                {!isOrganization && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="법인·단체명" required>
                      <Input
                        value={orgName}
                        onChange={(event) => setOrgName(event.target.value)}
                        placeholder="예: (주)한강개발"
                      />
                    </FormField>
                    <FormField label="사업자등록번호 (선택)">
                      <Input
                        value={orgBizNo}
                        onChange={(event) => setOrgBizNo(event.target.value)}
                        placeholder="123-45-67890"
                      />
                    </FormField>
                  </div>
                )}

                <FormField label="법인 대표번호 (선택)">
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={orgPhone}
                    onChange={(event) => setOrgPhone(formatPhoneWhileTyping(event.target.value))}
                    placeholder="02-554-8800"
                  />
                </FormField>

                {!isOrganization && (
                  <>
                    <FormField label={`${contactName} 님의 직책 · 역할`}>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {ORGANIZATION_ROLE_PRESETS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setOrgSelfRole(preset)}
                              className={cn(
                                'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                                orgSelfRole === preset
                                  ? 'border-transparent bg-info-soft text-info'
                                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
                              )}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                        <Input
                          value={orgSelfRole}
                          onChange={(event) => setOrgSelfRole(event.target.value)}
                          placeholder="직접 입력 (예: 대표이사, 실무 담당자)"
                        />
                      </div>
                    </FormField>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={orgSelfPrimary}
                        onCheckedChange={(checked) => setOrgSelfPrimary(checked === true)}
                      />
                      이 법인의 대표 연락 담당자로 지정
                    </label>
                  </>
                )}

                <FormField label="법인 메모 (선택)">
                  <Textarea
                    rows={2}
                    value={orgMemo}
                    onChange={(event) => setOrgMemo(event.target.value)}
                    placeholder="예: 매입 승인 및 정산 기준"
                  />
                </FormField>
              </>
            )
          )}

          {tab === 'join-existing' && (
            isOrganization ? (
              <div className="rounded-md bg-[#fbf3db] px-3 py-2.5 text-xs leading-relaxed text-[#402c1b]">
                법인 연락처는 다른 파티의 구성원으로 들어갈 수 없습니다. 담당자를 추가하려면 기존 법인 파티에서 &apos;+ 구성원&apos;을 눌러 주세요.
              </div>
            ) : (
              <>
                <FormField label="연결할 기존 파티 검색" required>
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-8"
                        value={partySearch}
                        onChange={(event) => {
                          setPartySearch(event.target.value);
                          setSelectedParty(null);
                        }}
                        placeholder="세대명 또는 법인명으로 검색"
                      />
                    </div>

                    {selectedParty ? (
                      <div className="flex items-center justify-between gap-2 rounded-md border border-info/30 bg-info-soft/40 px-3 py-2 text-sm">
                        <span className="inline-flex items-center gap-2 font-medium">
                          {selectedParty.kind === PartyKind.HOUSEHOLD ? (
                            <Home className="size-3.5 text-[#2b6e3f]" />
                          ) : (
                            <Building2 className="size-3.5 text-[#6940a5]" />
                          )}
                          <span>
                            {selectedParty.organizationContact?.name ?? selectedParty.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {`${selectedParty.members.length}명`}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setSelectedParty(null)}
                        >
                          해제
                        </Button>
                      </div>
                    ) : partiesSearchQuery.isLoading ? (
                      <Skeleton className="h-16 w-full rounded-md" />
                    ) : joinableParties.length > 0 ? (
                      <div className="max-h-40 divide-y overflow-y-auto rounded-md border">
                        {joinableParties.map((party) => {
                          const title =
                            party.organizationContact?.name ??
                            party.name ??
                            (party.kind === PartyKind.HOUSEHOLD ? '세대' : '법인');
                          return (
                            <button
                              key={party.id}
                              type="button"
                              onClick={() => setSelectedParty(party)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                              <span className="inline-flex min-w-0 items-center gap-2">
                                {party.kind === PartyKind.HOUSEHOLD ? (
                                  <Home className="size-3.5 shrink-0 text-[#2b6e3f]" />
                                ) : (
                                  <Building2 className="size-3.5 shrink-0 text-[#6940a5]" />
                                )}
                                <span className="truncate font-medium">{title}</span>
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {`${party.members.length}명`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                        연결할 수 있는 기존 세대·법인이 없습니다.
                      </p>
                    )}
                  </div>
                </FormField>

                {selectedParty && (
                  <>
                    <FormField
                      label={
                        selectedParty.kind === PartyKind.HOUSEHOLD
                          ? '세대 내 역할'
                          : '직책 · 역할'
                      }
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {(selectedParty.kind === PartyKind.HOUSEHOLD
                            ? HOUSEHOLD_ROLE_PRESETS
                            : ORGANIZATION_ROLE_PRESETS
                          ).map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setJoinRole(preset)}
                              className={cn(
                                'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                                joinRole === preset
                                  ? 'border-transparent bg-info-soft text-info'
                                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
                              )}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                        <Input
                          value={joinRole}
                          onChange={(event) => setJoinRole(event.target.value)}
                          placeholder="직접 입력"
                        />
                      </div>
                    </FormField>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={joinPrimary}
                        onCheckedChange={(checked) => setJoinPrimary(checked === true)}
                      />
                      대표 연락 담당자로 지정
                    </label>

                    <FormField label="메모">
                      <Input
                        value={joinMemo}
                        onChange={(event) => setJoinMemo(event.target.value)}
                        placeholder="참고 메모"
                      />
                    </FormField>
                  </>
                )}
              </>
            )
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {createMutation.isPending
                ? '저장 중...'
                : tab === 'join-existing'
                  ? '파티에 연결'
                  : '파티 만들기'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── 2-B. 특정 파티에 구성원 추가 (구성도/인라인 행에서 호출) ──

export function PartyMemberAddDialog({
  party,
  open,
  onOpenChange,
}: {
  party: Party | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !party) return;
    setSearchQuery('');
    setSelected(null);
    setNewPhone('');
    setNewName('');
    setRoleLabel('');
    setIsPrimary(party.members.length === 0);
    setMemo('');
    setError('');
  }, [open, party]);

  const trimmedQuery = searchQuery.trim();
  const candidatesQuery = useQuery({
    queryKey: ['contacts', 'party-member-candidates', trimmedQuery],
    queryFn: () =>
      api.contacts.findAll({
        search: trimmedQuery,
        kind: ContactKind.PERSON,
        limit: 6,
      }),
    enabled: open && trimmedQuery.length >= 2,
  });

  const existingIds = new Set((party?.members ?? []).map((member) => member.contactId));
  const candidates = (candidatesQuery.data?.items ?? []).filter(
    (candidate) => !existingIds.has(candidate.id),
  );

  const mutation = useMutation({
    mutationFn: () => {
      if (!party) throw new Error('파티 정보가 없습니다.');
      return api.parties.addMember(party.id, {
        ...(selected
          ? { memberContactId: selected.id }
          : {
              phone: newPhone.trim() || undefined,
              name: newName.trim() || undefined,
            }),
        roleLabel: roleLabel.trim() || undefined,
        isPrimary,
        memo: memo.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('구성원을 추가했습니다.');
      onOpenChange(false);
    },
    onError: (caught) => {
      const message = apiErrorMessage(caught, '구성원을 추가하지 못했습니다.');
      setError(message);
      toast.error(message);
    },
  });

  if (!party) return null;

  const isOrg = party.kind === PartyKind.ORGANIZATION;
  const partyTitle = party.organizationContact?.name ?? party.name ?? (isOrg ? '법인' : '세대');
  const presets = isOrg ? ORGANIZATION_ROLE_PRESETS : HOUSEHOLD_ROLE_PRESETS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{`${partyTitle} · 구성원 추가`}</DialogTitle>
          <DialogDescription>
            기존 개인 연락처를 찾거나 새 연락처를 만들어 이 파티에 연결합니다.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selected && !newName.trim() && normalizePhone(newPhone).length < 7) {
              setError('기존 연락처를 고르거나 이름·전화번호를 입력하세요.');
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

          <FormField label={isOrg ? '직책 · 역할' : '구성원 역할'}>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRoleLabel(preset)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                      roleLabel === preset
                        ? 'border-transparent bg-info-soft text-info'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <Input
                value={roleLabel}
                onChange={(event) => setRoleLabel(event.target.value)}
                placeholder={isOrg ? '예: 실무 담당자, 대표이사' : '예: 아내, 자녀'}
              />
            </div>
          </FormField>

          <FormField label="연락처" required>
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
                  placeholder="이름 또는 전화번호 2글자 이상"
                />
              </div>

              {selected ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-info/30 bg-info-soft/40 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <Check className="size-3.5 shrink-0 text-info" />
                    <span className="truncate font-medium">{selected.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatPhone(selected.phone)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setSelected(null)}
                  >
                    해제
                  </Button>
                </div>
              ) : trimmedQuery.length >= 2 ? (
                candidatesQuery.isLoading ? (
                  <Skeleton className="h-14 w-full rounded-md" />
                ) : candidates.length > 0 ? (
                  <div className="divide-y rounded-md border">
                    {candidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => setSelected(candidate)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">{candidate.name}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatPhone(candidate.phone)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    일치하는 연락처가 없습니다. 아래에서 바로 새로 등록하세요.
                  </p>
                )
              ) : null}

              {!selected && (
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    또는 새 개인 연락처 만들기
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      type="tel"
                      inputMode="tel"
                      value={newPhone}
                      onChange={(event) => setNewPhone(formatPhoneWhileTyping(event.target.value))}
                      placeholder="전화번호"
                    />
                    <Input
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="이름"
                    />
                  </div>
                </div>
              )}
            </div>
          </FormField>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={isPrimary}
              onCheckedChange={(checked) => setIsPrimary(checked === true)}
            />
            대표 연락 담당자로 지정
          </label>

          <FormField label="메모">
            <Input
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="참고 메모"
            />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '추가 중...' : '구성원 추가'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── 2-C. 파티 기본 정보 수정 ──

export function PartyInfoEditDialog({
  party,
  open,
  onOpenChange,
}: {
  party: Party | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [homePhone, setHomePhone] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (!open || !party) return;
    setName(party.organizationContact?.name ?? party.name ?? '');
    setHomePhone(party.homePhone ? formatPhone(party.homePhone) : '');
    setMemo(party.memo ?? '');
  }, [open, party]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!party) throw new Error('수정할 파티 정보가 없습니다.');
      return api.parties.updateParty(party.id, {
        ...(party.kind === PartyKind.HOUSEHOLD ? { name: name.trim() || null } : {}),
        homePhone: homePhone.trim() || null,
        memo: memo.trim() || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('파티 정보를 수정했습니다.');
      onOpenChange(false);
    },
    onError: (caught) => {
      toast.error(apiErrorMessage(caught, '파티 정보를 수정하지 못했습니다.'));
    },
  });

  if (!party) return null;

  const isOrg = party.kind === PartyKind.ORGANIZATION;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>파티 정보 수정</DialogTitle>
          <DialogDescription>
            {isOrg
              ? '법인 파티의 대표 전화와 메모를 수정합니다. 법인명은 법인 연락처 수정에서 바꿉니다.'
              : '세대 이름, 집 전화번호, 메모를 수정합니다.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          {!isOrg && (
            <FormField label="세대 이름">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="예: 김철수 님 세대"
              />
            </FormField>
          )}
          <FormField label={isOrg ? '대표 전화번호' : '집 전화번호'}>
            <Input
              type="tel"
              inputMode="tel"
              value={homePhone}
              onChange={(event) => setHomePhone(formatPhoneWhileTyping(event.target.value))}
              placeholder="02-415-8820"
            />
          </FormField>
          <FormField label="파티 메모">
            <Textarea
              rows={3}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="파티 공통 메모"
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

// ── 3. 소속 수정 ──

export function PartyEditDialog({
  item,
  open,
  onOpenChange,
}: {
  item: PartyDisplayItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [roleLabel, setRoleLabel] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (!open || !item) return;
    setRoleLabel(item.roleLabel ?? '');
    setIsPrimary(item.isPrimary);
    setMemo(item.memo ?? '');
  }, [open, item]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!item) throw new Error('수정할 소속 정보가 없습니다.');
      return api.parties.updateMember(item.partyId, item.memberId, {
        roleLabel: roleLabel.trim() || null,
        isPrimary,
        memo: memo.trim() || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('소속 정보를 수정했습니다.');
      onOpenChange(false);
    },
    onError: (caught) => {
      toast.error(apiErrorMessage(caught, '소속 정보를 수정하지 못했습니다. 잠시 뒤 다시 시도하세요.'));
    },
  });

  if (!item) return null;

  const presets =
    item.partyKind === PartyKind.HOUSEHOLD
      ? HOUSEHOLD_ROLE_PRESETS
      : ORGANIZATION_ROLE_PRESETS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>소속 정보 수정</DialogTitle>
          <DialogDescription>
            {item.contactName} 님의 역할과 대표 담당 여부를 수정합니다.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <FormField label={item.partyKind === PartyKind.HOUSEHOLD ? '구성원 역할' : '직책 · 역할'}>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRoleLabel(preset)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                      roleLabel === preset
                        ? 'border-transparent bg-info-soft text-info'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <Input
                value={roleLabel}
                onChange={(event) => setRoleLabel(event.target.value)}
                placeholder="역할을 비워 두면 기본 표시됩니다"
              />
            </div>
          </FormField>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={isPrimary}
              onCheckedChange={(checked) => setIsPrimary(checked === true)}
            />
            대표 연락 담당자로 지정
          </label>

          <FormField label="메모">
            <Textarea
              rows={3}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="관련 메모"
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

/** 그룹(테두리 꼬리표)과 태그(색 꼬리표) 묶음 (상세 헤더용) */
export function ContactTagBadges({
  tags,
  groups = [],
}: {
  tags: string[];
  groups?: string[];
}) {
  const colors = useContactTagColors();
  if (groups.length === 0 && tags.length === 0) return null;
  return (
    <>
      {groups.map((name) => (
        <Badge key={`group-${name}`} variant="outline">
          {name}
        </Badge>
      ))}
      {tags.map((tag) => (
        <ContactTagChip key={`tag-${tag}`} name={tag} color={colors.get(tag)} />
      ))}
    </>
  );
}
