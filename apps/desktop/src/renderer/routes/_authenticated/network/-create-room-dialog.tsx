import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { NetworkRoom, NetworkRoomType } from '@estate-erp/api-client';

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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage, networkKeys } from './-network-shared';

export interface CreateRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 생성 성공 시 새 방 선택 등 후속 처리 */
  onCreated?: (room: NetworkRoom) => void;
}

/** 중개방 생성 다이얼로그 — name 필수, 기본 type은 private. */
export function CreateRoomDialog({ open, onOpenChange, onCreated }: CreateRoomDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<NetworkRoomType>('private');
  const [region, setRegion] = useState('');
  const [description, setDescription] = useState('');
  const [maxMembers, setMaxMembers] = useState('');

  const reset = () => {
    setName('');
    setType('private');
    setRegion('');
    setDescription('');
    setMaxMembers('');
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.network.createRoom({
        name: name.trim(),
        type,
        region: region.trim() || undefined,
        description: description.trim() || undefined,
        maxMembers: maxMembers ? Number(maxMembers) : undefined,
      }),
    onSuccess: (room) => {
      toast.success('중개방을 만들었습니다');
      void queryClient.invalidateQueries({ queryKey: networkKeys.allRooms });
      onOpenChange(false);
      reset();
      onCreated?.(room);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const submit = () => {
    if (!name.trim()) {
      toast.error('방 이름을 입력하세요');
      return;
    }
    if (maxMembers && (!Number.isInteger(Number(maxMembers)) || Number(maxMembers) < 1)) {
      toast.error('최대 사무소 수는 1 이상의 숫자여야 합니다');
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !createMutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>중개방 만들기</DialogTitle>
          <DialogDescription>
            사무소 간 매물을 공유하고 공동중개를 진행할 방을 만듭니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="room-name">
              방 이름 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 강동구 공동중개"
              maxLength={50}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>공개 유형</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as NetworkRoomType)}
              className="gap-2"
            >
              <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm has-[[data-state=checked]]:border-primary">
                <RadioGroupItem value="private" className="mt-0.5" />
                <span>
                  <span className="font-medium">비공개방</span>
                  <span className="block text-xs text-muted-foreground">
                    방 이름 검색으로만 발견됩니다. 아는 사무소끼리 운영할 때 적합합니다.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm has-[[data-state=checked]]:border-primary">
                <RadioGroupItem value="public" className="mt-0.5" />
                <span>
                  <span className="font-medium">공개방</span>
                  <span className="block text-xs text-muted-foreground">
                    공개방 디렉토리에 노출되어 누구나 참여 신청할 수 있습니다.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="room-region">지역 태그</Label>
              <Input
                id="room-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="예: 강동구"
                maxLength={20}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="room-max">최대 사무소 수</Label>
              <Input
                id="room-max"
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="비우면 무제한"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="room-desc">방 설명</Label>
            <Textarea
              id="room-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="방 운영 방식, 공유 규칙 등을 적어주세요"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            취소
          </Button>
          <Button onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending ? '만드는 중…' : '방 만들기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
