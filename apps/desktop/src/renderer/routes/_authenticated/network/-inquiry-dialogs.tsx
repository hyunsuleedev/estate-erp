import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { NetworkInquiry, NetworkSharedPropertyView } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage, networkKeys } from './-network-shared';
import { SharedPropertyCard } from './-shared-property-card';

function viewFlags(view: NetworkSharedPropertyView) {
  return {
    showSiteName: view.showSiteName,
    showDong: view.showDong,
    showUnit: view.showUnit,
    showFloor: view.showFloor,
    showPrice: view.showPrice,
    showArea: view.showArea,
    showMemo: view.showMemo,
    showPhotos: view.showPhotos,
  };
}

// ── 문의 보내기 ─────────────────────────────────────────────

export interface InquiryCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: NetworkSharedPropertyView | null;
}

/** 공유 매물에 대한 공식 문의 생성 다이얼로그. */
export function InquiryCreateDialog({ open, onOpenChange, target }: InquiryCreateDialogProps) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open) setMessage('');
  }, [open]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.network.createInquiry(target!.id, {
        message: message.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('문의를 보냈습니다. 응답이 오면 문의함에서 확인할 수 있습니다');
      void queryClient.invalidateQueries({ queryKey: networkKeys.allInquiries });
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!target) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !createMutation.isPending && onOpenChange(next)}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>매물 문의 보내기</DialogTitle>
          <DialogDescription>
            {target.office?.name ?? '상대 사무소'}에 공동중개 문의를 보냅니다.
          </DialogDescription>
        </DialogHeader>

        <SharedPropertyCard
          flags={viewFlags(target)}
          listing={target.listing}
          isMine={false}
          officeName={target.office?.name}
          contactName={target.contactName}
          contactPhone={target.contactPhone}
          description={target.description}
          compact
        />

        <div className="grid gap-1.5">
          <Label htmlFor="inquiry-message">문의 내용</Label>
          <Textarea
            id="inquiry-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="예: 매수 고객이 있어 연락드립니다. 호실 확인 가능할까요?"
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            취소
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? '보내는 중…' : '문의 보내기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 받은 문의 응답 (수락/거절) ───────────────────────────────

export interface InquiryRespondDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiry: NetworkInquiry | null;
}

/** 받은 문의에 수락/거절로 응답하는 다이얼로그. */
export function InquiryRespondDialog({ open, onOpenChange, inquiry }: InquiryRespondDialogProps) {
  const queryClient = useQueryClient();
  const [response, setResponse] = useState('');

  useEffect(() => {
    if (open) setResponse('');
  }, [open]);

  const respondMutation = useMutation({
    mutationFn: (status: 'accepted' | 'rejected') =>
      api.network.respondInquiry(inquiry!.id, {
        status,
        response: response.trim() || undefined,
      }),
    onSuccess: (updated) => {
      toast.success(updated.status === 'accepted' ? '문의를 수락했습니다' : '문의를 거절했습니다');
      void queryClient.invalidateQueries({ queryKey: networkKeys.allInquiries });
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!inquiry) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !respondMutation.isPending && onOpenChange(next)}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>문의 응답</DialogTitle>
          <DialogDescription>
            {inquiry.fromOffice?.name ?? '상대 사무소'}
            {inquiry.fromUser?.name ? ` · ${inquiry.fromUser.name}` : ''} ·{' '}
            {formatDateTime(inquiry.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
          {inquiry.message?.trim() || '메시지 없이 문의가 도착했습니다.'}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="inquiry-response">응답 메시지</Label>
          <Textarea
            id="inquiry-response"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="예: 가능합니다. 010-0000-0000으로 연락주세요"
            rows={3}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={respondMutation.isPending}
          >
            닫기
          </Button>
          <Button
            variant="destructive"
            onClick={() => respondMutation.mutate('rejected')}
            disabled={respondMutation.isPending}
          >
            거절
          </Button>
          <Button
            onClick={() => respondMutation.mutate('accepted')}
            disabled={respondMutation.isPending}
          >
            {respondMutation.isPending ? '처리 중…' : '수락'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
