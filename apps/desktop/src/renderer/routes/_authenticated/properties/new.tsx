import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/_authenticated/properties/new')({
  component: NewPropertyPage,
});

function NewPropertyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    siteId: '',
    unitId: '',
    transactionType: 'sale',
    price: '',
    deposit: '',
    monthlyRent: '',
    memo: '',
  });
  const [error, setError] = useState('');

  const { data: officeSites } = useQuery({
    queryKey: ['office-sites'],
    queryFn: () => api.officeSites.findAll(),
  });

  const { data: units } = useQuery({
    queryKey: ['units', form.siteId],
    queryFn: () => api.units.findAll({ siteId: form.siteId }),
    enabled: !!form.siteId,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.properties.create({
        siteId: form.siteId,
        unitId: form.unitId || undefined,
        transactionType: form.transactionType,
        price: form.price ? Number(form.price) : undefined,
        deposit: form.deposit ? Number(form.deposit) : undefined,
        monthlyRent: form.monthlyRent ? Number(form.monthlyRent) : undefined,
        memo: form.memo || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      navigate({ to: '/properties' });
    },
    onError: () => {
      setError('매물 등록에 실패했습니다.');
    },
  });

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-7" asChild>
          <Link to="/properties">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">매물 등록</h1>
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

          <FormField label="관리 단지">
            <select
              value={form.siteId}
              onChange={update('siteId')}
              required
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">선택하세요</option>
              {officeSites?.map((os) => (
                <option key={os.siteId} value={os.siteId}>
                  {os.site?.name ?? os.siteId}
                </option>
              ))}
            </select>
          </FormField>

          {units && units.length > 0 && (
            <FormField label="호실">
              <select
                value={form.unitId}
                onChange={update('unitId')}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">선택 안 함</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.floor ? `(${u.floor}층)` : ''}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <FormField label="거래유형">
            <select
              value={form.transactionType}
              onChange={update('transactionType')}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="sale">매매</option>
              <option value="jeonse">전세</option>
              <option value="monthly">월세</option>
            </select>
          </FormField>

          {(form.transactionType === 'sale' || form.transactionType === 'jeonse') && (
            <FormField label={`${form.transactionType === 'sale' ? '매매가' : '전세가'} (만원)`}>
              <Input
                type="number"
                value={form.price}
                onChange={update('price')}
                placeholder="예: 158000 (15.8억)"
                className="h-9"
              />
            </FormField>
          )}

          {form.transactionType === 'monthly' && (
            <>
              <FormField label="보증금 (만원)">
                <Input type="number" value={form.deposit} onChange={update('deposit')} className="h-9" />
              </FormField>
              <FormField label="월세 (만원)">
                <Input type="number" value={form.monthlyRent} onChange={update('monthlyRent')} className="h-9" />
              </FormField>
            </>
          )}

          <FormField label="메모">
            <Textarea value={form.memo} onChange={update('memo')} rows={3} />
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
