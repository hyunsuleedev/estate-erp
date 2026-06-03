import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PropertyListing } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  formatListingPrice,
  transactionTypeLabels,
} from '../utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: PropertyListing[];
  propertyId: string;
}

export function CreateMatchDialog({
  open,
  onOpenChange,
  listings,
  propertyId,
}: Props) {
  const queryClient = useQueryClient();
  const [listingId, setListingId] = useState<string>('');
  const [buyerReqId, setBuyerReqId] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [search, setSearch] = useState<string>('');

  const eligibleListings = listings.filter((l) => l.checkStatus !== 'done');

  // dialog 열릴 때 첫 listing 자동 선택
  useEffect(() => {
    if (!open) return;
    setListingId(eligibleListings[0]?.id ?? '');
    setBuyerReqId('');
    setMemo('');
    setSearch('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedListing = listings.find((l) => l.id === listingId);

  const { data: buyerReqsResponse } = useQuery({
    queryKey: [
      'buyer-requirements',
      'for-match',
      selectedListing?.transactionType,
    ],
    queryFn: () =>
      api.buyerRequirements.findAll({
        status: 'active',
        transactionType: selectedListing?.transactionType,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
    enabled: open,
  });

  const buyerOptions = useMemo(() => {
    const items = buyerReqsResponse?.items ?? [];
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((b) => {
      const name = b.contact?.name?.toLowerCase() ?? '';
      const phone = b.contact?.phone ?? '';
      return name.includes(q) || phone.includes(search);
    });
  }, [buyerReqsResponse, search]);

  const mutation = useMutation({
    mutationFn: () =>
      api.matches.create({
        listingId,
        buyerReqId,
        memo: memo.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['properties', propertyId] });
      toast.success('매칭이 생성되었습니다.');
      onOpenChange(false);
    },
    onError: () => {
      toast.error('매칭 생성에 실패했습니다.');
    },
  });

  const canSubmit =
    listingId.length > 0 && buyerReqId.length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>매칭 생성</DialogTitle>
          <DialogDescription>
            이 매물과 매수 고객을 연결합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="match-listing">매물</Label>
            {eligibleListings.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                매칭 가능한 거래 매물이 없습니다.
              </div>
            ) : (
              <Select value={listingId} onValueChange={setListingId}>
                <SelectTrigger id="match-listing">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eligibleListings.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {transactionTypeLabels[l.transactionType] ??
                        l.transactionType}{' '}
                      · {formatListingPrice(l)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="match-buyer">매수 고객</Label>
            <Input
              placeholder="이름 또는 연락처로 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={buyerReqId} onValueChange={setBuyerReqId}>
              <SelectTrigger id="match-buyer">
                <SelectValue
                  placeholder={
                    buyerOptions.length === 0
                      ? '활성 매수 고객 없음'
                      : '매수 고객 선택'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {buyerOptions.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.contact?.name ?? '이름 없음'}
                    {b.contact?.phone ? ` · ${b.contact.phone}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="match-memo">메모 (선택)</Label>
            <Input
              id="match-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="이 매칭에 대한 짧은 메모"
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
          <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending ? '생성 중...' : '매칭 생성'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
