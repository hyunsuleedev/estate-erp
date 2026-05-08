import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PropertyListing } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { transactionTypeLabels } from '../utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: PropertyListing | null;
  propertyId: string;
}

export function EditListingPriceDialog({
  open,
  onOpenChange,
  listing,
  propertyId,
}: Props) {
  const queryClient = useQueryClient();
  const [price, setPrice] = useState<string>('');
  const [deposit, setDeposit] = useState<string>('');
  const [monthlyRent, setMonthlyRent] = useState<string>('');

  useEffect(() => {
    if (!open || !listing) return;
    setPrice(listing.price?.toString() ?? '');
    setDeposit(listing.deposit?.toString() ?? '');
    setMonthlyRent(listing.monthlyRent?.toString() ?? '');
  }, [open, listing]);

  const mutation = useMutation({
    mutationFn: (id: string) => {
      const payload: {
        price?: number;
        deposit?: number;
        monthlyRent?: number;
      } = {};
      if (listing?.transactionType === 'sale') {
        payload.price = price ? Number(price) : 0;
      } else if (listing?.transactionType === 'jeonse') {
        payload.price = price ? Number(price) : 0;
      } else if (listing?.transactionType === 'monthly') {
        payload.deposit = deposit ? Number(deposit) : 0;
        payload.monthlyRent = monthlyRent ? Number(monthlyRent) : 0;
      }
      return api.listings.update(id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      toast.success('가격이 수정되었습니다.');
      onOpenChange(false);
    },
    onError: () => {
      toast.error('가격 수정에 실패했습니다.');
    },
  });

  if (!listing) return null;

  const txLabel =
    transactionTypeLabels[listing.transactionType] ?? listing.transactionType;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>가격 수정 · {txLabel}</DialogTitle>
          <DialogDescription>
            가격을 수정하면 변경 이력이 자동으로 기록됩니다. 단위는 만원입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(listing.transactionType === 'sale' ||
            listing.transactionType === 'jeonse') && (
            <div className="space-y-1.5">
              <Label htmlFor="listing-price">
                {listing.transactionType === 'sale' ? '매매가' : '전세가'} (만원)
              </Label>
              <Input
                id="listing-price"
                type="number"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="예: 158000"
              />
            </div>
          )}
          {listing.transactionType === 'monthly' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="listing-deposit">보증금 (만원)</Label>
                <Input
                  id="listing-deposit"
                  type="number"
                  inputMode="numeric"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  placeholder="예: 5000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="listing-monthly">월세 (만원)</Label>
                <Input
                  id="listing-monthly"
                  type="number"
                  inputMode="numeric"
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  placeholder="예: 80"
                />
              </div>
            </>
          )}
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
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(listing.id)}
          >
            {mutation.isPending ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
