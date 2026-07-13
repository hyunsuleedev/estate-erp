import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Contact, Deal, Listing } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatMoney, formatRent } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/domain';
import { ContactPicker } from './-deal-shared';
import { ourSideLabels } from './-deal-view-utils';

const TX_TYPES = ['sale', 'jeonse', 'monthly'] as const;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청 처리에 실패했습니다.';
}

function listingTitle(listing: Listing) {
  const site = listing.property?.site?.name;
  const dong = listing.property?.unit?.dong?.isPlaceholder ? null : listing.property?.unit?.dong?.name;
  const unit = listing.property?.unit?.name;
  return [site, dong, unit].filter(Boolean).join(' ') || '매물';
}

function listingPriceText(listing: Listing) {
  if (listing.transactionType === 'monthly') return formatRent(listing.deposit, listing.monthlyRent);
  return formatMoney(listing.price ?? listing.deposit);
}

/** 거래 생성 다이얼로그 — 매물 검색 연결 또는 매물 없이 직접 입력 */
export function DealCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (deal: Deal) => void;
}) {
  const queryClient = useQueryClient();

  const [listingSearch, setListingSearch] = useState('');
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [transactionType, setTransactionType] = useState<string>('sale');
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [seller, setSeller] = useState<Contact | null>(null);
  const [buyer, setBuyer] = useState<Contact | null>(null);
  const [isJoint, setIsJoint] = useState(false);
  const [ourSide, setOurSide] = useState<'seller' | 'buyer' | 'both'>('both');
  const [partnerBrokerId, setPartnerBrokerId] = useState('');
  const [memo, setMemo] = useState('');

  const listingsQuery = useQuery({
    queryKey: ['deal-create-listings', listingSearch],
    queryFn: () => api.listings.findAll({ search: listingSearch || undefined, limit: 8 }),
    enabled: open && !selectedListing,
  });

  const partnersQuery = useQuery({
    queryKey: ['partner-brokers'],
    queryFn: () => api.partnerBrokers.list(),
    enabled: open && isJoint,
  });

  const reset = () => {
    setListingSearch('');
    setSelectedListing(null);
    setTransactionType('sale');
    setPrice('');
    setDeposit('');
    setMonthlyRent('');
    setSeller(null);
    setBuyer(null);
    setIsJoint(false);
    setOurSide('both');
    setPartnerBrokerId('');
    setMemo('');
  };

  const selectListing = (listing: Listing) => {
    setSelectedListing(listing);
    setTransactionType(listing.transactionType);
    setPrice(listing.price != null ? String(listing.price) : '');
    setDeposit(listing.deposit != null ? String(listing.deposit) : '');
    setMonthlyRent(listing.monthlyRent != null ? String(listing.monthlyRent) : '');
    // 매물 소유자(owner)가 연결돼 있으면 매도인으로 자동 제안
    const owner = listing.property?.propertyContacts?.find(
      (pc) => pc.role === 'owner' && pc.status === 'active',
    )?.contact;
    if (owner) {
      setSeller({ id: owner.id, name: owner.name, phone: owner.phone } as Contact);
    }
  };

  const mutation = useMutation({
    mutationFn: () =>
      api.deals.create({
        listingId: selectedListing?.id,
        transactionType,
        agreedPrice: price ? Number(price) : undefined,
        agreedDeposit: deposit ? Number(deposit) : undefined,
        agreedMonthlyRent: monthlyRent ? Number(monthlyRent) : undefined,
        buyerContactId: buyer?.id,
        sellerContactId: seller?.id,
        isJointBrokerage: isJoint,
        ourSide: isJoint ? ourSide : undefined,
        partnerBrokerId: isJoint && partnerBrokerId ? partnerBrokerId : undefined,
        memo: memo || undefined,
      }),
    onSuccess: (deal) => {
      void queryClient.invalidateQueries({ queryKey: ['deals'] });
      void queryClient.invalidateQueries({ queryKey: ['commission-payments'] });
      toast.success('거래가 생성되었습니다. 합의가가 있으면 수수료 청구가 자동 생성됩니다.');
      onOpenChange(false);
      reset();
      onCreated(deal);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const showPrice = transactionType !== 'monthly';
  const showDeposit = transactionType === 'monthly';
  const showMonthlyRent = transactionType === 'monthly';
  const priceLabel =
    transactionType === 'sale' ? '매매가 (만원)' : '전세금 (만원)';

  const listings = useMemo(() => listingsQuery.data?.items ?? [], [listingsQuery.data]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>새 거래 생성</DialogTitle>
          <DialogDescription>
            매물을 연결하거나, 매물 없이 거래유형만으로 생성할 수 있습니다. 금액은 만원 단위입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* 매물 연결 */}
          <div className="grid gap-1.5">
            <Label>매물 연결 (선택)</Label>
            {selectedListing ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <StatusBadge kind="transactionType" status={selectedListing.transactionType} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{listingTitle(selectedListing)}</p>
                  <p className="text-xs text-muted-foreground">호가 {listingPriceText(selectedListing)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="매물 연결 해제"
                  onClick={() => setSelectedListing(null)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <div className="rounded-md border">
                <div className="relative border-b">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={listingSearch}
                    onChange={(event) => setListingSearch(event.target.value)}
                    placeholder="단지명·주소로 매물 검색"
                    className="h-8 border-0 pl-8 shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto">
                  {listingsQuery.isLoading ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">검색 중...</p>
                  ) : listingsQuery.isError ? (
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                      <span>매물을 불러오지 못했습니다.</span>
                      <Button type="button" variant="outline" size="xs" onClick={() => void listingsQuery.refetch()}>
                        재시도
                      </Button>
                    </div>
                  ) : listings.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">
                      검색 결과가 없습니다. 매물 없이도 거래를 생성할 수 있습니다.
                    </p>
                  ) : (
                    listings.map((listing) => (
                      <button
                        key={listing.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                        onClick={() => selectListing(listing)}
                      >
                        <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm">{listingTitle(listing)}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {listingPriceText(listing)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 거래유형 + 금액 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>거래유형 *</Label>
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TX_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {getStatusMeta('transactionType', value).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showPrice ? (
              <div className="grid gap-1.5">
                <Label>{priceLabel}</Label>
                <Input type="number" min={0} value={price} onChange={(event) => setPrice(event.target.value)} />
              </div>
            ) : null}
            {showDeposit ? (
              <div className="grid gap-1.5">
                <Label>보증금 (만원)</Label>
                <Input type="number" min={0} value={deposit} onChange={(event) => setDeposit(event.target.value)} />
              </div>
            ) : null}
            {showMonthlyRent ? (
              <div className="grid gap-1.5">
                <Label>월세 (만원)</Label>
                <Input
                  type="number"
                  min={0}
                  value={monthlyRent}
                  onChange={(event) => setMonthlyRent(event.target.value)}
                />
              </div>
            ) : null}
          </div>

          {/* 당사자 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>매도인 (임대인)</Label>
              <ContactPicker value={seller} onChange={setSeller} />
            </div>
            <div className="grid gap-1.5">
              <Label>매수인 (임차인)</Label>
              <ContactPicker value={buyer} onChange={setBuyer} />
            </div>
          </div>

          {/* 공동중개 */}
          <div className="grid gap-2 rounded-md border bg-muted/30 px-3 py-2.5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isJoint} onCheckedChange={(checked) => setIsJoint(checked === true)} />
              공동중개 거래
            </label>
            {isJoint ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">우리 담당 측</Label>
                  <Select value={ourSide} onValueChange={(value) => setOurSide(value as typeof ourSide)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['seller', 'buyer', 'both'] as const).map((side) => (
                        <SelectItem key={side} value={side}>
                          {ourSideLabels[side]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">파트너 중개사</Label>
                  <Select value={partnerBrokerId} onValueChange={setPartnerBrokerId}>
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          partnersQuery.isLoading
                            ? '불러오는 중...'
                            : (partnersQuery.data ?? []).length === 0
                              ? '등록된 파트너 없음'
                              : '파트너 선택'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(partnersQuery.data ?? []).map((partner) => (
                        <SelectItem key={partner.id} value={partner.id}>
                          {partner.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
          </div>

          {/* 메모 */}
          <div className="grid gap-1.5">
            <Label>메모</Label>
            <Input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="예: 급매, 잔금 협의 필요" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || (!selectedListing && !transactionType)}
            onClick={() => mutation.mutate()}
          >
            <Check className={cn('size-4', mutation.isPending && 'animate-pulse')} />
            거래 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
