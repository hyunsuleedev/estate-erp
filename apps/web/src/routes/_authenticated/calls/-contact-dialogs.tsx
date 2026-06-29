import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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

/** 미등록 번호 → 새 연락처 등록 + 통화 기록에 연결 */
export function RegisterContactDialog({
  open,
  onOpenChange,
  recordingId,
  phoneNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordingId: string;
  phoneNumber: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const contact = await api.contacts.create({
        name: name.trim(),
        phone: phoneNumber || undefined,
      });
      await api.callRecordings.update(recordingId, { contactId: contact.id });
      return contact;
    },
    onSuccess: () => {
      toast.success('연락처를 등록하고 통화 기록에 연결했습니다');
      void queryClient.invalidateQueries({ queryKey: ['call-recordings'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      onOpenChange(false);
    },
    onError: () => toast.error('연락처 등록에 실패했습니다'),
  });

  const canSubmit = name.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-base">연락처로 등록</DialogTitle>
          <DialogDescription className="text-xs">
            이 번호를 새 연락처로 등록하고 통화 기록에 연결합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              이름 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 김매수 / 고덕동 집주인"
              className="h-9"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) mutation.mutate();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">전화번호</Label>
            <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm">
              {formatPhone(phoneNumber)}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button size="sm" disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            등록하고 연결
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 미등록 번호 → 기존 연락처 검색 후 연결 */
export function LinkContactDialog({
  open,
  onOpenChange,
  recordingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordingId: string;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: ['call-link-contacts', query],
    queryFn: () =>
      api.contacts.findAll({
        search: query || undefined,
        limit: 8,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
    enabled: open,
  });
  const contacts = data?.items ?? [];

  const mutation = useMutation({
    mutationFn: (contactId: string) =>
      api.callRecordings.update(recordingId, { contactId }),
    onSuccess: () => {
      toast.success('통화 기록을 연락처에 연결했습니다');
      void queryClient.invalidateQueries({ queryKey: ['call-recordings'] });
      onOpenChange(false);
    },
    onError: () => toast.error('연락처 연결에 실패했습니다'),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base">기존 연락처 연결</DialogTitle>
          <DialogDescription className="text-xs">
            이 통화 기록을 연결할 연락처를 검색해서 선택합니다.
          </DialogDescription>
        </DialogHeader>

        <Command className="rounded-md border" shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="이름, 전화번호로 검색"
          />
          <CommandList className="max-h-56">
            <CommandEmpty>
              {isLoading ? '검색 중...' : '연락처가 없습니다.'}
            </CommandEmpty>
            <CommandGroup>
              {contacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={contact.id}
                  disabled={mutation.isPending}
                  onSelect={() => mutation.mutate(contact.id)}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{contact.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {contact.phone ? formatPhone(contact.phone) : '전화번호 없음'}
                    </div>
                  </div>
                  {mutation.isPending && mutation.variables === contact.id && (
                    <Loader2 className="ml-auto size-3.5 animate-spin" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
