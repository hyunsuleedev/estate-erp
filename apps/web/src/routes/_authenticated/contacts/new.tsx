import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { mergeContactTags, normalizePhone, parseContactTags } from '@/lib/contacts';
import { ContactGroupSelector } from '@/components/contacts/contact-group-selector';
import {
  ContactPhonesEditor,
  createEmptyPhone,
  firstPhoneValue,
  toPhoneInputs,
  type EditablePhone,
} from '@/components/contacts/contact-phones-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Route = createFileRoute('/_authenticated/contacts/new')({
  component: NewContactPage,
});

function NewContactPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    email: '',
    customTagsInput: '',
    memo: '',
  });
  const [phones, setPhones] = useState<EditablePhone[]>(() => [createEmptyPhone(true)]);
  const [selectedGroupTags, setSelectedGroupTags] = useState<string[]>([]);
  const [error, setError] = useState('');
  /** 중복 후보가 있어도 생성은 가능하지만, 사용자가 명시적으로 확인해야 한다 (PRD 9장) */
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);

  const primaryPhoneValue = firstPhoneValue(phones);
  const deferredPhone = useDeferredValue(primaryPhoneValue);
  const normalizedPhone = normalizePhone(deferredPhone);

  const duplicateContactsQuery = useQuery({
    queryKey: ['contacts', 'search-by-phone', normalizedPhone],
    queryFn: () => api.contacts.findByPhone(normalizedPhone),
    enabled: normalizedPhone.length >= 7,
  });
  const duplicates = normalizedPhone.length >= 7 ? duplicateContactsQuery.data ?? [] : [];
  const hasDuplicates = duplicates.length > 0;

  const parsedTags = useMemo(() => parseContactTags(form.customTagsInput), [form.customTagsInput]);

  const mutation = useMutation({
    mutationFn: () => {
      const phoneInputs = toPhoneInputs(phones);
      return api.contacts.create({
        name: form.name.trim(),
        phone: firstPhoneValue(phones) || undefined,
        phones: phoneInputs.length > 0 ? phoneInputs : undefined,
        email: form.email.trim() || undefined,
        tags: mergeContactTags(selectedGroupTags, form.customTagsInput),
        memo: form.memo.trim() || undefined,
      });
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('연락처가 등록되었습니다.');
      void navigate({
        to: '/contacts/$id',
        params: { id: created.id },
      });
    },
    onError: () => {
      setError('연락처 등록에 실패했습니다.');
      toast.error('연락처 등록에 실패했습니다.');
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-7" asChild>
          <Link to="/contacts">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">연락처 추가</h1>
          <p className="text-sm text-muted-foreground">기본 연락 정보와 태그, 메모를 함께 등록합니다.</p>
        </div>
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

                if (!form.name.trim()) {
                  setError('이름은 필수입니다.');
                  return;
                }
                if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
                  setError('이메일 형식이 올바르지 않습니다.');
                  return;
                }
                if (hasDuplicates && !duplicateAcknowledged) {
                  setError('동일 번호의 기존 연락처가 있습니다. 우측에서 확인 후 "중복 확인" 체크박스를 선택해야 등록할 수 있습니다.');
                  return;
                }

                setError('');
                mutation.mutate();
              }}
              className="space-y-4"
            >
              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <FormField label="이름" required>
                <Input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                  required
                />
              </FormField>

              <FormField label="전화번호">
                <ContactPhonesEditor
                  phones={phones}
                  onChange={(next) => {
                    setPhones(next);
                    setDuplicateAcknowledged(false);
                  }}
                />
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

              <FormField label="그룹 / 태그">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">그룹</p>
                    <ContactGroupSelector
                      selectedTags={selectedGroupTags}
                      onToggle={(tag) => {
                        setSelectedGroupTags((previous) =>
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
                      id="tags"
                      type="text"
                      value={form.customTagsInput}
                      onChange={(event) => setForm((previous) => ({ ...previous, customTagsInput: event.target.value }))}
                      placeholder="쉼표로 구분: VIP, 소개, 재연락"
                    />
                  </div>
                </div>
                {(selectedGroupTags.length > 0 || parsedTags.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedGroupTags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                    {parsedTags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
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

              {hasDuplicates && (
                <label className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft/40 px-3 py-2.5 text-sm">
                  <Checkbox
                    checked={duplicateAcknowledged}
                    onCheckedChange={(checked) => setDuplicateAcknowledged(checked === true)}
                    className="mt-0.5"
                  />
                  <span>
                    동일 번호의 기존 연락처 {duplicates.length}건을 확인했으며, 중복이 아닌 새 연락처로
                    등록합니다.
                  </span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" asChild>
                  <Link to="/contacts">취소</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={mutation.isPending || (hasDuplicates && !duplicateAcknowledged)}
                >
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
              동일하거나 일부 일치하는 번호가 있으면 미리 보여줍니다.
            </p>
          </div>
          <div className="space-y-3 px-5 py-5">
            {normalizedPhone.length < 7 ? (
              <StatusNotice
                icon={Phone}
                title="번호 입력 대기"
                description="중복 확인은 전화번호 7자리 이상 입력 시 시작됩니다."
              />
            ) : duplicateContactsQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : duplicateContactsQuery.isError ? (
              <StatusNotice
                icon={AlertTriangle}
                title="중복 확인 실패"
                description="중복 후보 조회에 실패했습니다. 네트워크 확인 후 다시 시도하세요."
                tone="warning"
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void duplicateContactsQuery.refetch()}
                  >
                    다시 시도
                  </Button>
                }
              />
            ) : hasDuplicates ? (
              <>
                <StatusNotice
                  icon={AlertTriangle}
                  title="기존 연락처 발견"
                  description="중복 등록 전 기존 연락처를 먼저 확인하는 편이 안전합니다. 신규 등록하려면 좌측의 중복 확인 체크가 필요합니다."
                  tone="warning"
                />
                <div className="space-y-3">
                  {duplicates.map((contact) => (
                    <div key={contact.id} className="rounded-xl border bg-card px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <Link
                            to="/contacts/$id"
                            params={{ id: contact.id }}
                            className="text-sm font-medium hover:text-primary hover:underline"
                          >
                            {contact.name}
                          </Link>
                          <p className="text-sm text-muted-foreground tabular-nums">
                            {formatPhone(contact.phone)}
                            {(() => {
                              const secondary = (contact.phones ?? []).find(
                                (phone) => !phone.isPrimary && phone.phone,
                              )?.phone;
                              return secondary ? ` · ${formatPhone(secondary)}` : '';
                            })()}
                          </p>
                          {contact.email && <p className="text-sm text-muted-foreground">{contact.email}</p>}
                        </div>
                        {contact.tags.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-1">
                            {contact.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="secondary">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <StatusNotice
                icon={CheckCircle2}
                title="중복 연락처 없음"
                description={`현재 입력 번호 ${formatPhone(primaryPhoneValue)} 와 일치하는 연락처가 없습니다.`}
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
