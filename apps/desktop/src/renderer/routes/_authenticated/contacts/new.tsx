import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/_authenticated/contacts/new')({
  component: NewContactPage,
});

function NewContactPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', phone: '', email: '', memo: '' });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.contacts.create({
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        memo: form.memo || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      navigate({ to: '/contacts' });
    },
    onError: () => setError('연락처 등록에 실패했습니다.'),
  });

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-7" asChild>
          <Link to="/contacts">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">연락처 추가</h1>
      </div>

      {/* Form */}
      <div className="max-w-lg rounded-xl bg-muted/50 p-5">
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-4"
        >
          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          )}
          <FormField label="이름">
            <Input id="name" type="text" value={form.name} onChange={update('name')} required className="h-9" />
          </FormField>
          <FormField label="전화번호">
            <Input id="phone" type="tel" value={form.phone} onChange={update('phone')} className="h-9" />
          </FormField>
          <FormField label="이메일">
            <Input id="email" type="email" value={form.email} onChange={update('email')} className="h-9" />
          </FormField>
          <FormField label="메모">
            <Textarea id="memo" value={form.memo} onChange={update('memo')} rows={3} />
          </FormField>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? '등록 중...' : '등록'}
          </Button>
        </form>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
