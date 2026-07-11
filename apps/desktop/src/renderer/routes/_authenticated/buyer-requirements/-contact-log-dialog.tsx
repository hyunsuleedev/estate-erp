import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import { toDateInputValue } from './-buyer-utils';

interface ContactLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 연락함을 기록할 BuyerRequirement id */
  requirementId: string | null;
  /** 기존 다음 연락일 (초기값) */
  defaultNextContactDate?: string | null;
  /** 고객명 — 다이얼로그 설명에 표시 */
  contactName?: string | null;
}

/**
 * '연락함 기록' 다이얼로그 — 최근 연락일을 오늘로 갱신하고 다음 연락일을 설정한다.
 * 목록 행 빠른 액션과 상세 화면 양쪽에서 사용.
 */
export function ContactLogDialog({
  open,
  onOpenChange,
  requirementId,
  defaultNextContactDate,
  contactName,
}: ContactLogDialogProps) {
  const queryClient = useQueryClient();
  const [nextDateDraft, setNextDateDraft] = useState('');

  // 열릴 때마다 기존 다음 연락일로 초기화
  useEffect(() => {
    if (open) setNextDateDraft(toDateInputValue(defaultNextContactDate));
  }, [open, defaultNextContactDate]);

  const mutation = useMutation({
    mutationFn: () =>
      api.buyerRequirements.update(requirementId!, {
        lastContactDate: new Date().toISOString(),
        nextContactDate: nextDateDraft || undefined,
      }),
    onSuccess: async () => {
      toast.success('연락 기록이 저장되었습니다.');
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] });
    },
    onError: () => toast.error('연락 기록 저장에 실패했습니다.'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>연락함 기록</DialogTitle>
          <DialogDescription>
            {contactName ? `${contactName} 고객의 ` : ''}최근 연락일을 오늘로 갱신하고, 다음
            연락일을 설정합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">다음 연락일 (선택, 비우면 유지)</Label>
          <Input
            type="date"
            value={nextDateDraft}
            onChange={(e) => setNextDateDraft(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            size="sm"
            disabled={mutation.isPending || !requirementId}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? '저장 중…' : '기록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
