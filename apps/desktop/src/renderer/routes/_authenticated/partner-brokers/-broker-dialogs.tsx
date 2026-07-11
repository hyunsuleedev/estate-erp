import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CirclePlus } from 'lucide-react';
import type {
  CreatePartnerBrokerDto,
  PartnerBroker,
  UpdatePartnerBrokerDto,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
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
import { Textarea } from '@/components/ui/textarea';

/** 입력 중 자동 하이픈 포맷팅 — 02 지역번호 / 휴대폰 / 1588 대표번호 패턴 지원 */
export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';

  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
    }
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  if (/^1[568]\d{2}/.test(digits) && digits.length <= 8) {
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function CreateDialog({
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
    onSuccess: (created) => {
      toast.success(`${created.name} 파트너를 등록했습니다.`);
      void qc.invalidateQueries({ queryKey: ['partner-brokers'] });
      onOpenChange(false);
      setForm({ name: '' });
    },
    onError: () => toast.error('파트너 등록에 실패했습니다. 다시 시도해 주세요.'),
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
            disabled={mutation.isPending || !form.name?.trim()}
          >
            <CirclePlus className="size-3.5" />
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditDialog({
  broker,
  onOpenChange,
}: {
  broker: PartnerBroker | null;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<UpdatePartnerBrokerDto>({});

  const open = !!broker;

  useEffect(() => {
    if (!broker) {
      setForm({});
      return;
    }

    setForm({
      name: broker.name,
      phone: broker.phone ?? undefined,
      ceoName: broker.ceoName ?? undefined,
      ceoPhone: broker.ceoPhone ?? undefined,
      licenseNo: broker.licenseNo ?? undefined,
      email: broker.email ?? undefined,
      address: broker.address ?? undefined,
      memo: broker.memo ?? undefined,
    });
  }, [broker]);

  const handleOpenChange = (v: boolean) => {
    if (!v) setForm({});
    onOpenChange(v);
  };

  const mutation = useMutation({
    mutationFn: () => api.partnerBrokers.update(broker!.id, form),
    onSuccess: (updated) => {
      toast.success(`${updated.name} 파트너 정보를 저장했습니다.`);
      void qc.invalidateQueries({ queryKey: ['partner-brokers'] });
      handleOpenChange(false);
    },
    onError: () => toast.error('파트너 수정에 실패했습니다. 다시 시도해 주세요.'),
  });

  if (!broker) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>파트너 사무소 수정</DialogTitle>
          <DialogDescription>
            이 파트너의 이름/연락처 정보를 업데이트합니다.
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
            disabled={mutation.isPending || !form.name?.trim()}
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
          value={form.name ?? ''}
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
        <Label>대표폰</Label>
        <Input
          value={form.ceoPhone ?? ''}
          inputMode="tel"
          onChange={(e) => set('ceoPhone', formatPhoneInput(e.target.value))}
          placeholder="010-0000-0000"
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
          inputMode="tel"
          onChange={(e) => set('phone', formatPhoneInput(e.target.value))}
          placeholder="02-555-1234"
        />
      </div>
      <div className="grid gap-1.5 md:col-span-2">
        <Label>이메일</Label>
        <Input
          type="email"
          value={form.email ?? ''}
          onChange={(e) => set('email', e.target.value)}
          placeholder="partner@example.com"
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
