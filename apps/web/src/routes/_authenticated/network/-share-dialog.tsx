import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LockIcon, SearchIcon } from 'lucide-react';
import type {
  Listing,
  NetworkSharedPropertyView,
  SharedPropertyListingView,
} from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatMoney, formatRent } from '@/lib/format';
import { getListingAvailability } from '@/lib/listing-status';
import { useAuth } from '@/providers/auth-provider';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/domain';
import {
  DEFAULT_MASK_FLAGS,
  MASK_FLAG_DEFS,
  SITE_TYPE_LABELS,
  getErrorMessage,
  networkKeys,
  type MaskFlags,
} from './-network-shared';
import { SharedPropertyCard } from './-shared-property-card';

export interface ShareListingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomName: string;
  /** 지정 시 수정 모드 — 매물 변경 불가, 마스킹/코멘트만 수정 */
  editTarget?: NetworkSharedPropertyView | null;
  /** 이 방에 이미 활성 공유된 내 Listing id — 중복 공유 방지 표시 */
  sharedListingIds?: string[];
}

/** Listing → 미리보기용 마스킹 뷰 변환. privateMemo는 어떤 경우에도 포함하지 않는다. */
function listingToPreview(listing: Listing): SharedPropertyListingView {
  const site = listing.property?.site;
  const unit = listing.property?.unit;
  const dong = unit?.dong;
  const unitType = unit?.siteUnitType;
  const address = site?.jibunAddress ?? site?.roadAddress ?? '';
  const district = address.split(/\s+/)[1] ?? '';
  const typeLabel = SITE_TYPE_LABELS[site?.type ?? ''] ?? '부동산';
  return {
    id: listing.id,
    transactionType: listing.transactionType,
    availability: getListingAvailability(listing),
    siteType: site?.type ?? 'apartment',
    regionLabel: district ? `${district} ${typeLabel}` : typeLabel,
    siteName: site?.name,
    dongName: dong && !dong.isPlaceholder ? dong.name : null,
    unitName: unit?.name ?? null,
    floor: unit?.floor ?? null,
    price: listing.price,
    deposit: listing.deposit,
    monthlyRent: listing.monthlyRent,
    exclusiveAreaM2: unit?.exclusiveAreaM2 ?? unitType?.exclusiveAreaM2 ?? null,
    supplyAreaM2: unit?.supplyAreaM2 ?? unitType?.supplyAreaM2 ?? null,
    unitTypeName: unitType?.name ?? null,
    // 공개 메모만 — privateMemo(내부 전용)는 미리보기/전송 모두 제외
    memo: listing.memo,
  };
}

function listingRowLabel(listing: Listing): string {
  const site = listing.property?.site?.name ?? '단지 미상';
  const dong = listing.property?.unit?.dong;
  const dongName = dong && !dong.isPlaceholder ? `${dong.name} ` : '';
  const unitName = listing.property?.unit?.name ?? '';
  return `${site} ${dongName}${unitName}`.trim();
}

function listingPriceLabel(listing: Listing): string {
  return listing.transactionType === 'monthly'
    ? formatRent(listing.deposit, listing.monthlyRent)
    : formatMoney(listing.price);
}

/** 매물 공유/공유 설정 수정 다이얼로그 — 마스킹 토글 + 실시간 미리보기. */
export function ShareListingDialog({
  open,
  onOpenChange,
  roomId,
  roomName,
  editTarget,
  sharedListingIds = [],
}: ShareListingDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isEdit = !!editTarget;

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Listing | null>(null);
  const [flags, setFlags] = useState<MaskFlags>(DEFAULT_MASK_FLAGS);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [description, setDescription] = useState('');

  // 열릴 때 모드에 맞게 초기화
  useEffect(() => {
    if (!open) return;
    if (editTarget) {
      setFlags({
        showSiteName: editTarget.showSiteName,
        showDong: editTarget.showDong,
        showUnit: editTarget.showUnit,
        showFloor: editTarget.showFloor,
        showPrice: editTarget.showPrice,
        showArea: editTarget.showArea,
        showMemo: editTarget.showMemo,
        showPhotos: editTarget.showPhotos,
      });
      setContactName(editTarget.contactName ?? '');
      setContactPhone(editTarget.contactPhone ?? '');
      setDescription(editTarget.description ?? '');
    } else {
      setSearch('');
      setSelected(null);
      setFlags(DEFAULT_MASK_FLAGS);
      setContactName(user?.name ?? '');
      setContactPhone('');
      setDescription('');
    }
  }, [open, editTarget, user?.name]);

  const listingsQuery = useQuery({
    queryKey: ['network', 'shareable-listings', search],
    queryFn: () => api.listings.findAll({ search: search || undefined, limit: 10 }),
    enabled: open && !isEdit,
  });

  const shareMutation = useMutation({
    mutationFn: () =>
      api.network.shareListing(roomId, {
        listingId: selected!.id,
        ...flags,
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('매물을 공유했습니다');
      void queryClient.invalidateQueries({ queryKey: networkKeys.shared(roomId) });
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.network.updateSharedProperty(editTarget!.id, {
        ...flags,
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        description: description.trim() || null,
      }),
    onSuccess: () => {
      toast.success('공유 설정을 수정했습니다');
      void queryClient.invalidateQueries({ queryKey: networkKeys.shared(roomId) });
      void queryClient.invalidateQueries({ queryKey: networkKeys.allInquiries });
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const isPending = shareMutation.isPending || updateMutation.isPending;

  const previewListing: SharedPropertyListingView | null = useMemo(() => {
    if (isEdit) return editTarget!.listing;
    return selected ? listingToPreview(selected) : null;
  }, [isEdit, editTarget, selected]);

  const submit = () => {
    if (isEdit) {
      updateMutation.mutate();
      return;
    }
    if (!selected) {
      toast.error('공유할 매물을 선택하세요');
      return;
    }
    shareMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? '공유 설정 수정' : '매물 공유'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? '공개 범위와 코멘트를 수정합니다.'
              : `내 매물을 "${roomName}" 방에 공유합니다. 공개 범위는 필드별로 선택할 수 있습니다.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          {/* ── 좌측: 매물 선택 + 마스킹 설정 ── */}
          <div className="flex min-w-0 flex-col gap-4">
            {!isEdit && (
              <div className="grid gap-1.5">
                <Label>
                  공유할 매물 <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="단지명·메모로 검색"
                    className="h-8 pl-8"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto rounded-md border">
                  {listingsQuery.isLoading ? (
                    <div className="space-y-1.5 p-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : listingsQuery.isError ? (
                    <div className="p-3 text-center text-sm text-muted-foreground">
                      매물을 불러오지 못했습니다
                      <Button
                        variant="link"
                        size="sm"
                        className="px-1"
                        onClick={() => void listingsQuery.refetch()}
                      >
                        재시도
                      </Button>
                    </div>
                  ) : (listingsQuery.data?.items.length ?? 0) === 0 ? (
                    <p className="p-3 text-center text-sm text-muted-foreground">
                      검색 결과가 없습니다
                    </p>
                  ) : (
                    listingsQuery.data!.items.map((listing) => {
                      const alreadyShared = sharedListingIds.includes(listing.id);
                      return (
                        <button
                          key={listing.id}
                          type="button"
                          disabled={alreadyShared}
                          title={
                            alreadyShared
                              ? '이미 이 방에 공유된 매물입니다. 카드의 "공유 설정"에서 수정하세요.'
                              : undefined
                          }
                          onClick={() => setSelected(listing)}
                          className={cn(
                            'flex w-full items-center gap-2 border-b px-2.5 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50',
                            selected?.id === listing.id && 'bg-info-soft/60',
                            alreadyShared && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                          )}
                        >
                          <StatusBadge
                            kind="transactionType"
                            status={listing.transactionType}
                            size="sm"
                          />
                          <span className="min-w-0 flex-1 truncate">{listingRowLabel(listing)}</span>
                          {alreadyShared && (
                            <span className="shrink-0 rounded-sm bg-neutral-soft px-1.5 py-px text-[11px] text-muted-foreground">
                              공유중
                            </span>
                          )}
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {listingPriceLabel(listing)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label>공개 항목</Label>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border p-3">
                {MASK_FLAG_DEFS.map((def) => (
                  <label
                    key={def.key}
                    className="flex cursor-pointer items-center justify-between gap-2 text-sm"
                    title={def.hint}
                  >
                    <span>{def.label}</span>
                    <Switch
                      checked={flags[def.key]}
                      onCheckedChange={(checked) =>
                        setFlags((prev) => {
                          const next = { ...prev, [def.key]: checked };
                          // 호수를 공개하면 동도 함께 공개 (호수만으로는 위치 특정 불가)
                          if (def.key === 'showUnit' && checked) next.showDong = true;
                          // 동을 끄면 호수도 함께 비공개
                          if (def.key === 'showDong' && !checked) next.showUnit = false;
                          return next;
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <LockIcon className="size-3" />
                내부 전용 메모는 설정과 무관하게 절대 전송되지 않습니다.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="share-contact-name">담당자명</Label>
                <Input
                  id="share-contact-name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="담당자 이름"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="share-contact-phone">담당자 연락처</Label>
                <Input
                  id="share-contact-phone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  inputMode="tel"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="share-comment">공유 코멘트</Label>
              <Textarea
                id="share-comment"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='예: "급매, 이번 주 계약 가능"'
                rows={2}
              />
            </div>
          </div>

          {/* ── 우측: 실시간 미리보기 ── */}
          <div className="flex min-w-0 flex-col gap-2">
            <Label>미리보기</Label>
            <div className="rounded-md border border-dashed bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium text-info">
                상대 사무소에게 이렇게 보입니다
              </p>
              {previewListing ? (
                <SharedPropertyCard
                  flags={flags}
                  listing={previewListing}
                  isMine={false}
                  officeName={user?.office?.name}
                  contactName={contactName.trim() || null}
                  contactPhone={contactPhone.trim() || null}
                  description={description.trim() || null}
                />
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  매물을 선택하면 미리보기가 표시됩니다
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            취소
          </Button>
          <Button onClick={submit} disabled={isPending || (!isEdit && !selected)}>
            {isPending ? '저장 중…' : isEdit ? '수정 저장' : '이 설정으로 공유'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
