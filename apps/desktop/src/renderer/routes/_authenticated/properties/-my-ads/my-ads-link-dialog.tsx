import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import type { Listing, ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PropertyTableTransactionBadge } from "./my-ads-cells";
import {
  advertisementPriceLabel,
  cpChannelLabel,
  getErrorMessage,
} from "./my-ads-format";
import {
  ADVERTISEMENT_LINK_DETAILS,
  advertisementLinkLevel,
  advertisementPlace,
  advertisementRawLocationLabel,
  advertisementSite,
  advertisementTransactionType,
} from "./my-ads-link";
import {
  listingMatchesSearchTokens,
  MANUAL_AD_RECENT_LIMIT,
  MANUAL_AD_SEARCH_LIMIT,
  manualAdListingLocationParts,
  manualAdListingPriceLabel,
  manualAdListingStatusLabel,
  pickServerSearchToken,
  splitSearchTokens,
} from "./my-ads-manual-ad-state";

const SEARCH_DEBOUNCE_MS = 250;

/**
 * 매물과 이어지지 않은 광고를 등록된 매물에 잇는다.
 * 위에는 CP가 적은 그대로를, 아래에는 우리 매물을 놓고 사람이 같은 집인지 보고 고른다.
 * 층과 가격이 비슷하다는 이유로 대신 골라 주지 않는다.
 */
export function MyAdsLinkDialog({
  advertisement,
  open,
  onOpenChange,
}: {
  /** 닫히는 동안에도 내용이 비지 않게 마지막 광고를 들고 있는다 */
  advertisement: ListingAdvertisementWithListing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(84svh,calc(100svh-2rem))] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-xl">
        {advertisement && (
          <LinkDialogBody
            // 다른 광고로 열면 검색어와 고른 줄을 처음부터 시작한다
            key={advertisement.id}
            advertisement={advertisement}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LinkDialogBody({
  advertisement,
  onDone,
}: {
  advertisement: ListingAdvertisementWithListing;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const site = advertisementSite(advertisement);
  const level = advertisementLinkLevel(advertisement);
  const transactionType = advertisementTransactionType(advertisement);
  /** 광고가 이미 찾은 호실. 다른 호실의 매물에 이으면 그 연결이 바뀐다는 것을 줄마다 알린다 */
  const foundPropertyId = advertisementPlace(advertisement)?.id ?? null;
  const rawLocation = advertisementRawLocationLabel(advertisement);
  const rawAddress =
    advertisement.rawRoadAddress?.trim() ||
    advertisement.rawJibunAddress?.trim() ||
    null;

  // 건물까지 찾은 광고는 그 건물 이름으로, 아니면 CP가 적은 단지 이름으로 먼저 찾아 둔다
  const [query, setQuery] = useState(
    () => site?.name ?? advertisement.rawSiteName?.trim() ?? "",
  );
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const tokens = useMemo(() => splitSearchTokens(query), [query]);
  const serverToken = pickServerSearchToken(splitSearchTokens(debouncedQuery));
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["listings", "my-ads-link-picker", serverToken ?? ""],
    queryFn: () =>
      api.listings.findAll(
        serverToken
          ? { search: serverToken, limit: MANUAL_AD_SEARCH_LIMIT }
          : {
              limit: MANUAL_AD_RECENT_LIMIT,
              sortBy: "updatedAt",
              sortOrder: "desc",
            },
      ),
    placeholderData: keepPreviousData,
  });
  const listings = useMemo(
    () =>
      (data?.items ?? []).filter((listing) =>
        listingMatchesSearchTokens(listing, tokens),
      ),
    [data, tokens],
  );

  // 이 창이 닫히거나 다른 광고로 바뀐 뒤에 끝난 요청이 지금 열려 있는 창을 닫지 않게 한다
  const isCurrentRef = useRef(true);
  useEffect(() => {
    isCurrentRef.current = true;
    return () => {
      isCurrentRef.current = false;
    };
  }, []);

  const [linkingId, setLinkingId] = useState<string | null>(null);
  const linkMutation = useMutation({
    mutationFn: (listing: Listing) =>
      api.listingAdvertisements.link(advertisement.id, { listingId: listing.id }),
    onMutate: (listing) => setLinkingId(listing.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listing-advertisements"] });
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
      toast.success("광고를 매물에 연결했습니다.");
      if (isCurrentRef.current) onDone();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => {
      if (isCurrentRef.current) setLinkingId(null);
    },
  });

  return (
    <>
      <DialogHeader className="border-b px-5 py-4">
        <DialogTitle className="text-[15px]">매물 연결</DialogTitle>
        <DialogDescription className="mt-1 text-xs">
          {ADVERTISEMENT_LINK_DETAILS[level]} 같은 집의 매물을 골라 주세요.
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-b px-5 py-3 text-[13px]">
        <dt className="text-muted-foreground">CP 표기</dt>
        <dd className="min-w-0 break-words">
          {rawLocation || <span className="text-muted-foreground">위치 글 없음</span>}
          {rawAddress && (
            <span className="block text-xs text-muted-foreground">{rawAddress}</span>
          )}
        </dd>
        <dt className="text-muted-foreground">광고</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {transactionType && (
            <PropertyTableTransactionBadge transactionType={transactionType} />
          )}
          <span className="tabular-nums">{advertisementPriceLabel(advertisement)}</span>
          <span className="text-muted-foreground">
            {cpChannelLabel(advertisement.channel)}
          </span>
        </dd>
      </dl>

      <div className="flex min-h-0 flex-col">
        <div className="relative border-b px-5 py-2.5">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-7 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="단지명, 동, 호로 매물 찾기"
            aria-label="연결할 매물 찾기"
            className="h-8 pl-7 text-[13px]"
          />
          {isFetching && (
            <Loader2
              aria-hidden="true"
              className="absolute right-7 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
        </div>
        <div className="min-h-[180px] flex-1 overflow-y-auto">
          {isError ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-[13px] text-muted-foreground">
              매물을 불러오지 못했습니다.
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                다시 시도
              </Button>
            </div>
          ) : isLoading ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">
              불러오는 중…
            </p>
          ) : listings.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
              맞는 매물이 없습니다. 매물관리에서 먼저 등록한 뒤 연결해 주세요.
            </p>
          ) : (
            <ul>
              {listings.map((listing) => {
                const { site: siteName, unit } = manualAdListingLocationParts(listing);
                const status = manualAdListingStatusLabel(listing);
                // 매물은 거래 조건 하나다. 거래유형이 다르면 같은 집이어도 이 광고의 매물이 아니다
                // (이으면 광고의 거래유형이 매물을 따라 바뀐다). 서버도 거절한다.
                const differentProperty =
                  foundPropertyId != null &&
                  listing.property?.id != null &&
                  listing.property.id !== foundPropertyId;
                const differentTrade =
                  transactionType != null &&
                  listing.transactionType !== transactionType;
                return (
                  <li
                    key={listing.id}
                    className="flex items-center gap-3 border-b px-5 py-2 last:border-b-0 hover:bg-[#f7f7f5]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
                        <span className="truncate font-medium">{siteName ?? "매물"}</span>
                        {unit && <span className="shrink-0">{unit}</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <PropertyTableTransactionBadge
                          transactionType={listing.transactionType}
                        />
                        <span className="tabular-nums text-foreground">
                          {manualAdListingPriceLabel(listing)}
                        </span>
                        {status && <span>{status}</span>}
                        {differentTrade && (
                          <span className="text-warning">광고와 거래유형이 달라 연결할 수 없음</span>
                        )}
                        {!differentTrade && differentProperty && (
                          <span className="text-warning">
                            광고가 찾은 호실과 다름 · 연결하면 호실도 바뀜
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 px-2.5 text-xs"
                      disabled={linkMutation.isPending || differentTrade}
                      onClick={() => linkMutation.mutate(listing)}
                    >
                      {linkingId === listing.id && (
                        <Loader2 className="size-3 animate-spin" />
                      )}
                      연결
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
        연결해도 광고 값은 바뀌지 않습니다.
      </p>
    </>
  );
}
