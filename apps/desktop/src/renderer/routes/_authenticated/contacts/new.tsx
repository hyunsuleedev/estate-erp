import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, Phone } from 'lucide-react';
import type { Contact } from '@estate-erp/api-client';
import { ContactKind } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { normalizePhone } from '@/lib/contacts';
import { ContactGroupPicker } from './-contact-group-picker';
import { apiErrorMessage, findPhoneProblem } from './-detail-cards';
import { ContactTagsField } from './-contact-tag-picker';
import {
  ContactPhonesEditor,
  createEmptyPhone,
  firstPhoneValue,
  toPhoneInputs,
  type EditablePhone,
} from '@/components/contacts/contact-phones-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { tabResourceKeys } from '@/features/tabs/lib/tabResource';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { useTabScopedState } from '@/features/tabs/hooks/useTabScopedState';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Route = createFileRoute('/_authenticated/contacts/new')({
  // ?phone=01012345678 — 통화 이력의 모르는 번호에서 열면 그 번호를 채워 둔다 (같은 번호를 다시 치지 않게)
  validateSearch: (search: Record<string, unknown>): { phone?: string } => {
    const raw = typeof search.phone === 'string' || typeof search.phone === 'number' ? String(search.phone) : '';
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 12 ? { phone: digits } : {};
  },
  component: NewContactPage,
});

function NewContactPage() {
  const queryClient = useQueryClient();
  const { phone: prefillPhone } = Route.useSearch();
  const activeTabId = useTabStore((state) => state.activeTabId);
  const replaceTabResource = useTabStore((state) => state.replaceTabResource);
  const openOrRevealResource = useTabStore((state) => state.openOrRevealResource);
  const openModule = useTabStore((state) => state.openModule);
  const closeTab = useTabStore((state) => state.closeTab);
  const ownerTabIdRef = useRef(activeTabId);
  const [form, setForm] = useTabScopedState('contact-new:form:v3', {
    kind: ContactKind.PERSON as ContactKind,
    name: '',
    businessRegNo: '',
    email: '',
    memo: '',
  });
  const [selectedTags, setSelectedTags] = useTabScopedState<string[]>(
    'contact-new:tags:v2',
    [],
  );
  const [phones, setPhones] = useTabScopedState<EditablePhone[]>(
    'contact-new:phones:v1',
    () => [{ ...createEmptyPhone(true), phone: prefillPhone ? formatPhone(prefillPhone) : '' }],
  );
  const [selectedGroups, setSelectedGroups] = useTabScopedState<string[]>(
    'contact-new:groups:v2',
    [],
  );
  const [error, setError] = useState('');
  // Enter를 빠르게 두 번 눌러도 한 번만 등록한다 (화면이 "등록 중"으로 바뀌기 전의 두 번째 누름을 막는다)
  const submittingRef = useRef(false);

  // 같은 사무소에서는 한 번호를 한 사람에게만 저장할 수 있다(서버가 막는다). 그래서 "그래도 새로 등록"은 없다:
  // 적은 번호마다 이미 있는 사람을 찾아 보여 주고, 그 사람을 열게 한다.
  const deferredPhones = useDeferredValue(phones);
  const canonicalPhones = useMemo(
    () =>
      Array.from(
        new Set(
          deferredPhones
            .map((row) => normalizePhone(row.phone))
            .filter((digits) => digits.length >= 7),
        ),
      ),
    [deferredPhones],
  );
  const duplicateQueries = useQueries({
    queries: canonicalPhones.map((digits) => ({
      queryKey: ['contacts', 'search-by-phone', digits],
      queryFn: () => api.contacts.findByPhone(digits),
    })),
  });
  const duplicateMap = new Map<string, Contact>();
  for (const query of duplicateQueries) {
    for (const contact of query.data ?? []) duplicateMap.set(contact.id, contact);
  }
  const duplicates = Array.from(duplicateMap.values());
  const hasDuplicates = duplicates.length > 0;
  const isCheckingDuplicates = duplicateQueries.some((query) => query.isLoading);
  const duplicateCheckFailed = duplicateQueries.some((query) => query.isError);

  const mutation = useMutation({
    mutationFn: async () => {
      const phoneInputs = toPhoneInputs(phones);
      const created = await api.contacts.create({
        kind: form.kind,
        name: form.name.trim(),
        businessRegNo: form.kind === ContactKind.ORGANIZATION ? form.businessRegNo.trim() || null : null,
        phone: firstPhoneValue(phones) || undefined,
        phones: phoneInputs.length > 0 ? phoneInputs : undefined,
        email: form.email.trim() || undefined,
        // 없는 이름은 서버가 태그로 만들고 색을 붙인다.
        tags: selectedTags,
        memo: form.memo.trim() || undefined,
      });
      // 그룹은 연락처와 따로 저장된다. 연락처는 이미 만들어졌으므로 실패한 그룹만 알려 준다.
      const results = await Promise.allSettled(
        selectedGroups.map((name) => api.contacts.addGroupMembers(name, [created.id])),
      );
      return {
        created,
        groupFailures: results.filter(({ status }) => status === 'rejected').length,
      };
    },
    onSuccess: async ({ created, groupFailures }) => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      if (groupFailures > 0) {
        toast.warning('연락처는 등록했지만 그룹에 넣지 못한 것이 있습니다.');
      } else {
        toast.success('연락처가 등록되었습니다.');
      }
      const route = `/contacts/${created.id}`;
      const meta = getRouteMeta(route);
      const resourceKey = tabResourceKeys.entity('contact', created.id);
      if (ownerTabIdRef.current) {
        replaceTabResource(ownerTabIdRef.current, {
          route,
          kind: meta.kind,
          title: created.name || meta.title,
          resourceKey,
        });
      } else {
        openOrRevealResource({
          route,
          kind: meta.kind,
          title: created.name || meta.title,
          resourceKey,
        });
      }
    },
    onError: (caught) => {
      // 적은 내용은 그대로 두고 이유만 알린다
      const message = apiErrorMessage(caught, '연락처를 등록하지 못했습니다. 잠시 뒤 다시 시도하세요.');
      setError(message);
      toast.error(message);
    },
  });

  const handleCancel = () => {
    if (ownerTabIdRef.current) {
      closeTab(ownerTabIdRef.current);
      return;
    }
    const meta = getRouteMeta('/contacts');
    openModule({ route: '/contacts', kind: meta.kind, title: meta.title });
  };

  // 적다 만 것이 있는지 (통화 이력에서 미리 채운 번호는 세지 않는다). 있으면 탭을 닫을 때 셸이 한 번 묻는다
  // (features/tabs/lib/unsavedWork.ts의 data-native-tab-dirty 표식 — 업무 창과 같은 방식).
  const hasUnsaved =
    Boolean(form.name.trim() || form.email.trim() || form.memo.trim()) ||
    selectedTags.length > 0 ||
    selectedGroups.length > 0 ||
    phones.some((row) => {
      const digits = normalizePhone(row.phone);
      return digits.length > 0 && digits !== (prefillPhone ?? '');
    }) ||
    phones.length > 1;

  return (
    <div className="flex flex-col gap-4">
      {hasUnsaved && !mutation.isPending && (
        <span hidden data-native-tab-discard-blocker="true" data-native-tab-dirty="true" />
      )}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={handleCancel}
          aria-label="연락처 목록으로 돌아가기"
        >
          <ArrowLeft className="size-4" />
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <div className="rounded-xl border border-border/60 bg-background">
          <div className="border-b border-border/60 px-5 py-4">
            <p className="text-sm font-semibold">신규 연락처 등록</p>
            <p className="mt-1 text-sm text-muted-foreground">
              전화번호 중복은 우측에서 바로 확인할 수 있습니다.
            </p>
          </div>
          <div className="px-5 py-5">
            <form
              onSubmit={(event) => {
                event.preventDefault();

                // 이름을 모르면 비워 둘 수 있다 — 서버가 번호 끝 네 자리로 임시 이름을 붙인다. 둘 다 없으면 안 된다.
                if (!form.name.trim() && toPhoneInputs(phones).length === 0) {
                  setError('이름이나 전화번호 중 하나는 입력하세요.');
                  return;
                }
                if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
                  setError('이메일 형식이 올바르지 않습니다.');
                  return;
                }
                const phoneProblem = findPhoneProblem(phones.map((row) => row.phone));
                if (phoneProblem) {
                  setError(phoneProblem);
                  return;
                }
                if (hasDuplicates) {
                  setError('이미 등록된 번호가 있습니다. 오른쪽에서 기존 연락처를 열어 확인하세요.');
                  return;
                }

                setError('');
                if (submittingRef.current) return;
                submittingRef.current = true;
                mutation.mutate(undefined, {
                  onSettled: () => {
                    submittingRef.current = false;
                  },
                });
              }}
              className="space-y-4"
            >
              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
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
                      onClick={() => setForm((previous) => ({ ...previous, kind: option.value }))}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        form.kind === option.value
                          ? 'border-transparent bg-info-soft text-info'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </FormField>

              <FormField label={form.kind === ContactKind.ORGANIZATION ? '법인·단체명' : '이름'}>
                <Input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                  aria-describedby="name-hint"
                />
                <p id="name-hint" className="text-[12px] text-muted-foreground">
                  이름을 모르면 비워 두세요. 번호 끝자리로 저장됩니다.
                </p>
              </FormField>

              {form.kind === ContactKind.ORGANIZATION && (
                <FormField label="사업자등록번호">
                  <Input
                    id="businessRegNo"
                    type="text"
                    value={form.businessRegNo}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, businessRegNo: event.target.value }))
                    }
                    placeholder="123-45-67890"
                  />
                </FormField>
              )}

              <FormField label="전화번호">
                <ContactPhonesEditor phones={phones} onChange={setPhones} />
              </FormField>

              <FormField label="이메일">
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
                  placeholder="name@example.com"
                />
              </FormField>

              <FormField label="그룹">
                <ContactGroupPicker selected={selectedGroups} onChange={setSelectedGroups} />
              </FormField>

              <FormField label="태그">
                <ContactTagsField value={selectedTags} onChange={setSelectedTags} />
              </FormField>

              <FormField label="메모">
                <Textarea
                  id="memo"
                  value={form.memo}
                  onChange={(event) => setForm((previous) => ({ ...previous, memo: event.target.value }))}
                  rows={5}
                  placeholder="고객 성향, 유입 경로, 참고 메모"
                />
              </FormField>

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  취소
                </Button>
                <Button type="submit" disabled={mutation.isPending || hasDuplicates}>
                  {mutation.isPending ? '등록 중...' : '등록 후 상세 보기'}
                </Button>
              </div>
            </form>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-background">
          <div className="border-b border-border/60 px-5 py-4">
            <p className="text-sm font-semibold">전화번호 확인</p>
            <p className="mt-1 text-sm text-muted-foreground">
              적은 번호가 이미 다른 연락처에 있으면 여기에 보입니다.
            </p>
          </div>
          <div className="space-y-3 px-5 py-5">
            {canonicalPhones.length === 0 ? (
              <StatusNotice
                icon={Phone}
                title="번호 입력 대기"
                description="번호를 7자리 이상 적으면 이미 등록된 사람인지 바로 확인합니다."
              />
            ) : isCheckingDuplicates ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : hasDuplicates ? (
              <>
                <StatusNotice
                  icon={AlertTriangle}
                  title="이미 등록된 번호입니다"
                  description="같은 번호로 새 연락처를 만들 수 없습니다. 아래 연락처를 열어 확인하세요. 번호 주인이 바뀌었다면 그 연락처에서 번호를 먼저 지우면 됩니다."
                  tone="warning"
                />
                <div className="space-y-3">
                  {duplicates.map((contact) => (
                    <div key={contact.id} className="rounded-xl border bg-card px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-medium">{contact.name}</p>
                          <p className="text-sm text-muted-foreground tabular-nums">
                            {formatPhone(contact.phone)}
                            {(() => {
                              const secondary = (contact.phones ?? []).find(
                                (phone) => !phone.isPrimary && phone.phone,
                              )?.phone;
                              return secondary ? ` · ${formatPhone(secondary)}` : '';
                            })()}
                          </p>
                          {contact.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {contact.tags.slice(0, 3).map((tag) => (
                                <Badge key={tag} variant="secondary">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button asChild size="sm" variant="outline" className="shrink-0">
                          <Link to="/contacts/$id" params={{ id: contact.id }}>
                            열기
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : duplicateCheckFailed ? (
              <StatusNotice
                icon={AlertTriangle}
                title="중복 확인 실패"
                description="이미 있는 번호인지 확인하지 못했습니다. 그대로 등록해도 같은 번호는 서버가 막아 줍니다."
                tone="warning"
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => duplicateQueries.forEach((query) => void query.refetch())}
                  >
                    다시 시도
                  </Button>
                }
              />
            ) : (
              <StatusNotice
                icon={CheckCircle2}
                title="새 번호입니다"
                description={`${canonicalPhones.map((digits) => formatPhone(digits)).join(', ')} — 등록된 연락처가 없습니다.`}
                tone="success"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
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

function StatusNotice({
  icon: Icon,
  title,
  description,
  tone = 'default',
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tone?: 'default' | 'warning' | 'success';
  action?: ReactNode;
}) {
  return (
    <div
      className={[
        'rounded-xl border px-4 py-3',
        tone === 'warning' && 'border-warning/30 bg-warning-soft/50',
        tone === 'success' && 'border-success/30 bg-success-soft/50',
        tone === 'default' && 'border-border bg-muted/30',
      ].filter(Boolean).join(' ')}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
          {action && <div className="pt-1">{action}</div>}
        </div>
      </div>
    </div>
  );
}
