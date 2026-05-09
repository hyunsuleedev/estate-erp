import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  Match,
  Property,
  PropertyContact,
  Tenant,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { roleLabels } from '../utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property;
  propertyContacts: PropertyContact[];
  tenants: Tenant[];
  matches?: Match[];
  /** 다이얼로그를 열 때 미리 선택할 contactId (인물 카드의 "이 사람과 상담 추가") */
  preselectedContactId?: string;
}

export function AddConsultationDialog({
  open,
  onOpenChange,
  property,
  propertyContacts,
  tenants,
  matches = [],
  preselectedContactId,
}: Props) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>('phone');
  const [contactId, setContactId] = useState<string>('');
  const [content, setContent] = useState<string>('');

  const contactOptions = useMemo(() => {
    const list: Array<{ value: string; label: string }> = [];
    const seen = new Set<string>();
    for (const pc of propertyContacts) {
      if (pc.contact?.id && !seen.has(pc.contact.id)) {
        seen.add(pc.contact.id);
        const role = roleLabels[pc.role] ?? pc.role;
        list.push({
          value: pc.contact.id,
          label: `${pc.contact.name} · ${role}`,
        });
      }
    }
    for (const t of tenants) {
      if (t.contact?.id && !seen.has(t.contact.id)) {
        seen.add(t.contact.id);
        list.push({
          value: t.contact.id,
          label: `${t.contact.name} · 세입자`,
        });
      }
    }
    for (const m of matches) {
      const buyer = m.buyerRequirement?.contact;
      if (buyer?.id && !seen.has(buyer.id)) {
        seen.add(buyer.id);
        list.push({
          value: buyer.id,
          label: `${buyer.name ?? '이름 없음'} · 매수 고객`,
        });
      }
    }
    return list;
  }, [propertyContacts, tenants, matches]);

  // dialog 열릴 때 초기 contactId 자동 채움.
  // preselectedContactId가 들어오면 그 사람을 선택, 아니면 contactOptions 첫 번째 (보통 소유자)
  useEffect(() => {
    if (!open) return;
    setType('phone');
    setContent('');
    if (preselectedContactId && contactOptions.some((o) => o.value === preselectedContactId)) {
      setContactId(preselectedContactId);
    } else if (contactOptions.length > 0) {
      setContactId(contactOptions[0].value);
    } else {
      setContactId('');
    }
  }, [open, contactOptions, preselectedContactId]);

  const mutation = useMutation({
    mutationFn: () =>
      api.consultations.create({
        contactId,
        type,
        content: content.trim(),
        propertyId: property.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['consultations', 'property', property.id],
      });
      queryClient.invalidateQueries({ queryKey: ['consultations'] });
      toast.success('상담이 기록되었습니다.');
      onOpenChange(false);
    },
    onError: () => {
      toast.error('상담 기록에 실패했습니다.');
    },
  });

  const canSubmit =
    contactId.length > 0 && content.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>상담 기록 추가</DialogTitle>
          <DialogDescription>
            이 매물 관련 상담 내용을 기록합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="consultation-type">상담 유형</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="consultation-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">전화</SelectItem>
                <SelectItem value="visit">방문</SelectItem>
                <SelectItem value="online">온라인</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="consultation-contact">연락처</Label>
            {contactOptions.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                이 매물에 연결된 연락처가 없습니다. 관련인을 먼저 등록하세요.
              </div>
            ) : (
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger id="consultation-contact">
                  <SelectValue placeholder="연락처 선택" />
                </SelectTrigger>
                <SelectContent>
                  {contactOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="consultation-content">상담 내용</Label>
            <Textarea
              id="consultation-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="통화/방문 내용, 결정 사항, 다음 약속 등..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            취소
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
