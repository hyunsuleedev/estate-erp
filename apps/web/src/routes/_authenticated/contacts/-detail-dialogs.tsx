import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { Contact, ContactDetail } from '@estate-erp/api-client';
import { Check, Search, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { mergeContactTags, normalizePhone, splitContactTags, stringifyContactTags } from '@/lib/contacts';
import { cn } from '@/lib/utils';
import { ContactGroupSelector } from '@/components/contacts/contact-group-selector';
import {
  ContactPhonesEditor,
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
import { relationTypeLabels } from './-detail-cards';

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
}: {
  contact: ContactDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [phones, setPhones] = useState<EditablePhone[]>([]);
  const [email, setEmail] = useState('');
  const [groupTags, setGroupTags] = useState<string[]>([]);
  const [customTagsInput, setCustomTagsInput] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const { groupTags: groups, customTags } = splitContactTags(contact.tags);
    setName(contact.name);
    setPhones(toEditablePhones(contact));
    setEmail(contact.email ?? '');
    setGroupTags(groups);
    setCustomTagsInput(stringifyContactTags(customTags));
    setMemo(contact.memo ?? '');
    setError('');
  }, [open, contact]);

  const mutation = useMutation({
    mutationFn: () => {
      const phoneInputs = toPhoneInputs(phones);
      return api.contacts.update(contact.id, {
        name: name.trim(),
        phone: firstPhoneValue(phones) || undefined,
        phones: phoneInputs,
        // 빈 입력은 null로 보내 기존 값을 지운다 (undefined는 "변경 없음"으로 처리됨)
        email: email.trim() || null,
        tags: mergeContactTags(groupTags, customTagsInput),
        memo: memo.trim() || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('연락처가 수정되었습니다.');
      onOpenChange(false);
    },
    onError: () => {
      toast.error('연락처 수정에 실패했습니다.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
            if (!name.trim()) {
              setError('이름은 필수입니다.');
              return;
            }
            if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
              setError('이메일 형식이 올바르지 않습니다.');
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

          <FormField label="이름" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </FormField>

          <FormField label="전화번호">
            <ContactPhonesEditor phones={phones} onChange={setPhones} />
          </FormField>

          <FormField label="이메일">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </FormField>

          <FormField label="그룹 / 태그">
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">그룹</p>
                <ContactGroupSelector
                  selectedTags={groupTags}
                  onToggle={(tag) => {
                    setGroupTags((previous) =>
                      previous.includes(tag)
                        ? previous.filter((item) => item !== tag)
                        : [...previous, tag],
                    );
                  }}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">추가 태그</p>
                <Input
                  value={customTagsInput}
                  onChange={(event) => setCustomTagsInput(event.target.value)}
                  placeholder="예: VIP, 소개, 재연락"
                />
              </div>
            </div>
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

// ── 2. 관계 추가 (기존 연락처 연결 또는 전화번호로 신규 Contact 즉석 생성) ──

export function RelationAddDialog({
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
  const [relationType, setRelationType] = useState('parent');
  const [label, setLabel] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRelationType('parent');
    setLabel('');
    setSearchQuery('');
    setSelected(null);
    setNewPhone('');
    setNewName('');
    setMemo('');
    setError('');
  }, [open]);

  const trimmedQuery = searchQuery.trim();
  const candidatesQuery = useQuery({
    queryKey: ['contacts', 'relation-candidates', trimmedQuery],
    queryFn: () => api.contacts.findAll({ search: trimmedQuery, limit: 5 }),
    enabled: open && trimmedQuery.length >= 2,
  });
  const candidates = (candidatesQuery.data?.items ?? []).filter(
    (candidate) => candidate.id !== contactId,
  );

  const mutation = useMutation({
    mutationFn: () => {
      if (selected) {
        return api.contactRelations.create({
          contactId,
          relatedContactId: selected.id,
          relationType,
          label: label.trim() || undefined,
          memo: memo.trim() || undefined,
        });
      }
      return api.contactRelations.createWithNewContact({
        contactId,
        relationType,
        label: label.trim() || undefined,
        phone: newPhone.trim(),
        name: newName.trim() || undefined,
        memo: memo.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('관계가 등록되었습니다.');
      onOpenChange(false);
    },
    onError: () => {
      toast.error('관계 등록에 실패했습니다.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>관계 추가</DialogTitle>
          <DialogDescription>
            {contactName} 님과 연결할 가족·전문가 관계를 등록합니다. 기존 연락처를 검색해 연결하거나,
            전화번호만으로 새 연락처를 만들 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selected && normalizePhone(newPhone).length < 7) {
              setError('기존 연락처를 선택하거나, 새 연락처의 전화번호(7자리 이상)를 입력하세요.');
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

          <FormField label="관계 유형" required>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(relationTypeLabels).map(([value, typeLabel]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRelationType(value)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    relationType === value
                      ? 'border-transparent bg-info-soft text-info'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {typeLabel}
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="보충 설명">
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder='예: "큰어머니", "담당 법무사"'
            />
          </FormField>

          <FormField label="상대 연락처" required>
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
                  placeholder="이름 또는 전화번호로 기존 연락처 검색"
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
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSelected(null)}>
                    해제
                  </Button>
                </div>
              ) : trimmedQuery.length >= 2 ? (
                candidatesQuery.isLoading ? (
                  <div className="space-y-1.5">
                    <Skeleton className="h-9 w-full rounded-md" />
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                ) : candidates.length > 0 ? (
                  <div className="divide-y rounded-md border">
                    {candidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => setSelected(candidate)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
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
                    일치하는 연락처가 없습니다. 아래에서 새 연락처로 등록하세요.
                  </p>
                )
              ) : null}

              {!selected && (
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    또는 새 연락처 만들기 — 이름을 모르면 관계명으로 자동 생성됩니다.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      type="tel"
                      value={newPhone}
                      onChange={(event) => setNewPhone(event.target.value)}
                      placeholder="전화번호 (필수)"
                    />
                    <Input
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="이름 (선택)"
                    />
                  </div>
                </div>
              )}
            </div>
          </FormField>

          <FormField label="메모">
            <Input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="참고 메모" />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '등록 중...' : '관계 등록'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 그룹/태그 뱃지 묶음 (상세 헤더용) */
export function ContactTagBadges({ tags }: { tags: string[] }) {
  const { groupTags, customTags } = splitContactTags(tags);
  if (groupTags.length === 0 && customTags.length === 0) return null;
  return (
    <>
      {groupTags.map((tag) => (
        <Badge key={`group-${tag}`}>{tag}</Badge>
      ))}
      {customTags.map((tag) => (
        <Badge key={`tag-${tag}`} variant="secondary">
          {tag}
        </Badge>
      ))}
    </>
  );
}
