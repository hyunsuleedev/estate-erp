import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CirclePlus, Handshake, Pencil, Phone, Trash2 } from 'lucide-react';
import type {
  CreatePartnerBrokerDto,
  PartnerBroker,
  UpdatePartnerBrokerDto,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

export const Route = createFileRoute('/_authenticated/partner-brokers/')({
  component: PartnerBrokersPage,
});

function PartnerBrokersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['partner-brokers'],
    queryFn: () => api.partnerBrokers.list(),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerBroker | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">공동중개 파트너</h1>
          <p className="text-sm text-muted-foreground">
            거래한 상대 사무소를 주소록에 저장해 두고 다음 거래에서 빠르게 연결합니다.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <CirclePlus className="size-4" />
          파트너 추가
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-60 rounded-xl" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data ?? []).map((b) => (
            <BrokerCard key={b.id} broker={b} onEdit={() => setEditing(b)} />
          ))}
        </div>
      )}

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditDialog
        broker={editing}
        onOpenChange={(v) => !v && setEditing(null)}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-10 text-center">
      <Handshake className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">아직 등록된 파트너가 없습니다</p>
      <p className="mt-1 text-xs text-muted-foreground">
        공동중개 거래를 진행한 상대 사무소를 등록해두면 거래 생성 시 바로 선택할 수 있습니다.
      </p>
      <Button className="mt-4" size="sm" onClick={onCreate}>
        <CirclePlus className="size-3.5" />
        첫 파트너 등록
      </Button>
    </div>
  );
}

function BrokerCard({
  broker,
  onEdit,
}: {
  broker: PartnerBroker;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.partnerBrokers.remove(broker.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-brokers'] }),
  });

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{broker.name}</CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              {broker.ceoName ? `${broker.ceoName} · ` : ''}
              {broker.licenseNo ?? '등록번호 미입력'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={onEdit}>
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                if (confirm(`${broker.name} 파트너를 비활성화할까요?`)) {
                  remove.mutate();
                }
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4 text-sm">
        {broker.phone && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="size-3.5" />
            <span>{broker.phone}</span>
          </div>
        )}
        {broker.address && (
          <div className="line-clamp-2 text-xs text-muted-foreground">
            {broker.address}
          </div>
        )}
        {broker.memo && (
          <div className="line-clamp-2 rounded-md bg-muted/40 p-2 text-xs">
            {broker.memo}
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <Badge variant="outline" className="text-[10px]">
            거래 {broker.dealCount}건
          </Badge>
          {broker.linkedOfficeId && (
            <Badge className="border-0 bg-emerald-50 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              Estate ERP 가입
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreatePartnerBrokerDto>({ name: '' });

  const mutation = useMutation({
    mutationFn: () => api.partnerBrokers.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-brokers'] });
      onOpenChange(false);
      setForm({ name: '' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>파트너 사무소 추가</DialogTitle>
          <DialogDescription>
            거래 시 공동중개 상대로 선택할 수 있도록 주소록에 저장합니다.
          </DialogDescription>
        </DialogHeader>

        <BrokerFormFields form={form} onChange={setForm} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name}
          >
            <CirclePlus className="size-3.5" />
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  broker,
  onOpenChange,
}: {
  broker: PartnerBroker | null;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<UpdatePartnerBrokerDto>({});

  // 다이얼로그 열릴 때 폼 초기화
  const open = !!broker;
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setForm({});
    } else if (broker) {
      setForm({
        name: broker.name,
        phone: broker.phone ?? undefined,
        ceoName: broker.ceoName ?? undefined,
        licenseNo: broker.licenseNo ?? undefined,
        email: broker.email ?? undefined,
        address: broker.address ?? undefined,
        memo: broker.memo ?? undefined,
      });
    }
    onOpenChange(v);
  };

  // broker 가 바뀌면 폼 동기화
  if (broker && !form.name) {
    setForm({
      name: broker.name,
      phone: broker.phone ?? undefined,
      ceoName: broker.ceoName ?? undefined,
      licenseNo: broker.licenseNo ?? undefined,
      email: broker.email ?? undefined,
      address: broker.address ?? undefined,
      memo: broker.memo ?? undefined,
    });
  }

  const mutation = useMutation({
    mutationFn: () => api.partnerBrokers.update(broker!.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-brokers'] });
      handleOpenChange(false);
    },
  });

  if (!broker) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>파트너 사무소 수정</DialogTitle>
          <DialogDescription>
            거래 {broker.dealCount}건 · 이 파트너의 이름/연락처를 업데이트합니다.
          </DialogDescription>
        </DialogHeader>

        <BrokerFormFields
          form={form as CreatePartnerBrokerDto}
          onChange={(f) => setForm(f)}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BrokerFormFields({
  form,
  onChange,
}: {
  form: CreatePartnerBrokerDto;
  onChange: (f: CreatePartnerBrokerDto) => void;
}) {
  const set = <K extends keyof CreatePartnerBrokerDto>(
    key: K,
    value: CreatePartnerBrokerDto[K],
  ) => onChange({ ...form, [key]: value });

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="grid gap-1.5 md:col-span-2">
        <Label>사무소명 *</Label>
        <Input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="예) 중앙부동산공인중개"
        />
      </div>
      <div className="grid gap-1.5">
        <Label>대표자</Label>
        <Input
          value={form.ceoName ?? ''}
          onChange={(e) => set('ceoName', e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>등록번호</Label>
        <Input
          value={form.licenseNo ?? ''}
          onChange={(e) => set('licenseNo', e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>전화번호</Label>
        <Input
          value={form.phone ?? ''}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="02-555-1234"
        />
      </div>
      <div className="grid gap-1.5">
        <Label>이메일</Label>
        <Input
          type="email"
          value={form.email ?? ''}
          onChange={(e) => set('email', e.target.value)}
        />
      </div>
      <div className="grid gap-1.5 md:col-span-2">
        <Label>주소</Label>
        <Input
          value={form.address ?? ''}
          onChange={(e) => set('address', e.target.value)}
        />
      </div>
      <div className="grid gap-1.5 md:col-span-2">
        <Label>메모</Label>
        <Textarea
          value={form.memo ?? ''}
          onChange={(e) => set('memo', e.target.value)}
          rows={3}
          placeholder="예) 김사장님 매도 매물 잘 맡김. 공동 50:50 선호."
        />
      </div>
    </div>
  );
}
