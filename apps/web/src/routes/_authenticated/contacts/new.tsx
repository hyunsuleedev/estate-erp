import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhoneNumber, mergeContactTags, normalizePhone, parseContactTags } from '@/lib/contacts';
import { ContactGroupSelector } from '@/components/contacts/contact-group-selector';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/_authenticated/contacts/new')({
  component: NewContactPage,
});

function NewContactPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    phone2: '',
    email: '',
    customTagsInput: '',
    memo: '',
  });
  const [selectedGroupTags, setSelectedGroupTags] = useState<string[]>([]);
  const [error, setError] = useState('');
  const deferredPhone = useDeferredValue(form.phone);
  const normalizedPhone = normalizePhone(deferredPhone);

  const duplicateContactsQuery = useQuery({
    queryKey: ['contacts', 'search-by-phone', normalizedPhone],
    queryFn: () => api.contacts.findByPhone(normalizedPhone),
    enabled: normalizedPhone.length >= 7,
  });

  const parsedTags = useMemo(() => parseContactTags(form.customTagsInput), [form.customTagsInput]);

  const mutation = useMutation({
    mutationFn: () =>
      api.contacts.create({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        phone2: form.phone2.trim() || undefined,
        email: form.email.trim() || undefined,
        tags: mergeContactTags(selectedGroupTags, form.customTagsInput),
        memo: form.memo.trim() || undefined,
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      navigate({
        to: '/contacts/$id',
        params: { id: created.id },
      });
    },
    onError: () => setError('연락처 등록에 실패했습니다.'),
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

              <FormField label="이름">
                <Input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                  required
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="전화번호">
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))}
                    placeholder="010-1234-5678"
                  />
                </FormField>

                <FormField label="보조 전화">
                  <Input
                    id="phone2"
                    type="tel"
                    value={form.phone2}
                    onChange={(event) => setForm((previous) => ({ ...previous, phone2: event.target.value }))}
                    placeholder="02-123-4567"
                  />
                </FormField>
              </div>

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

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" asChild>
                  <Link to="/contacts">취소</Link>
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
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
            ) : duplicateContactsQuery.data && duplicateContactsQuery.data.length > 0 ? (
              <>
                <StatusNotice
                  icon={AlertTriangle}
                  title="기존 연락처 발견"
                  description="중복 등록 전 기존 연락처를 먼저 확인하는 편이 안전합니다."
                  tone="warning"
                />
                <div className="space-y-3">
                  {duplicateContactsQuery.data.map((contact) => (
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
                          <p className="text-sm text-muted-foreground">
                            {formatPhoneNumber(contact.phone)}
                            {contact.phone2 ? ` · ${formatPhoneNumber(contact.phone2)}` : ''}
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
                description={`현재 입력 번호 ${formatPhoneNumber(form.phone)} 와 일치하는 연락처가 없습니다.`}
                tone="success"
              />
            )}
          </div>
        </div>
      </div>
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

function StatusNotice({
  icon: Icon,
  title,
  description,
  tone = 'default',
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tone?: 'default' | 'warning' | 'success';
}) {
  return (
    <div
      className={[
        'rounded-xl border px-4 py-3',
        tone === 'warning' && 'border-amber-200 bg-amber-50/70',
        tone === 'success' && 'border-emerald-200 bg-emerald-50/70',
        tone === 'default' && 'border-border bg-muted/30',
      ].filter(Boolean).join(' ')}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
