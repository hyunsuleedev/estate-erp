import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Check,
  Search,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import type { BuyerRequirement, Listing, Match } from "@estate-erp/api-client";
import {
  formatListingPrice,
  formatRequirementSummaryFromBuyerRequirement,
  getListingAddress,
  getListingTitle,
  isDuplicateMatch,
} from "./-match-view-utils";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/format";
import { StatusBadge } from "@/components/domain";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export type MatchCreateDialogScope =
  | { kind: "demand"; requirementId: string }
  | { kind: "listing"; listingIds: string[] };

export function MatchCreateDialog({
  open,
  onOpenChange,
  matches,
  scope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 중복 매칭(같은 매물 + 같은 구매조건) 사전 차단용 현재 목록 */
  matches: Match[];
  /** 원장 행에서 열 때 현재 구함 또는 내놓음 문맥을 벗어나지 않도록 한쪽을 고정 */
  scope?: MatchCreateDialogScope;
}) {
  const queryClient = useQueryClient();
  const [listingQuery, setListingQuery] = useState("");
  const [buyerQuery, setBuyerQuery] = useState("");
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedBuyerReq, setSelectedBuyerReq] =
    useState<BuyerRequirement | null>(null);
  const [memo, setMemo] = useState("");
  const fixedRequirementId =
    scope?.kind === "demand" ? scope.requirementId : null;
  const fixedListingIds = scope?.kind === "listing" ? scope.listingIds : [];
  const fixedListingKey = fixedListingIds.join(",");

  useEffect(() => {
    if (!open) {
      setListingQuery("");
      setBuyerQuery("");
      setSelectedListing(null);
      setSelectedBuyerReq(null);
      setMemo("");
    }
  }, [open]);

  const listingsSearch = useQuery({
    queryKey: ["listings", "match-create-search", listingQuery],
    queryFn: () =>
      api.listings.findAll({
        search: listingQuery.trim() || undefined,
        limit: 8,
      }),
    enabled: open && scope?.kind !== "listing",
  });

  const buyerReqSearch = useQuery({
    queryKey: ["buyer-requirements", "match-create-search", buyerQuery],
    queryFn: () =>
      api.buyerRequirements.findAll({
        search: buyerQuery.trim() || undefined,
        status: "active",
        limit: 8,
      }),
    enabled: open && scope?.kind !== "demand",
  });

  const fixedRequirementQuery = useQuery({
    queryKey: ["buyer-requirements", "match-create-fixed", fixedRequirementId],
    queryFn: () => {
      if (!fixedRequirementId) {
        throw new Error("고정할 구매조건이 없습니다.");
      }
      return api.buyerRequirements.findOne(fixedRequirementId);
    },
    enabled: open && fixedRequirementId !== null,
  });

  const fixedListingsQuery = useQuery({
    queryKey: ["listings", "match-create-fixed", fixedListingKey],
    queryFn: () =>
      Promise.all(
        fixedListingIds.map((listingId) => api.listings.findOne(listingId)),
      ),
    enabled: open && scope?.kind === "listing" && fixedListingIds.length > 0,
  });

  useEffect(() => {
    if (!open || !fixedRequirementId || !fixedRequirementQuery.data) return;
    setSelectedBuyerReq(fixedRequirementQuery.data);
  }, [fixedRequirementId, fixedRequirementQuery.data, open]);

  useEffect(() => {
    if (!open || scope?.kind !== "listing" || !fixedListingsQuery.data) return;
    setSelectedListing((current) => {
      if (
        current &&
        fixedListingsQuery.data.some((listing) => listing.id === current.id)
      ) {
        return current;
      }
      return fixedListingsQuery.data.length === 1
        ? fixedListingsQuery.data[0]
        : null;
    });
  }, [fixedListingKey, fixedListingsQuery.data, open, scope?.kind]);

  const listingItems =
    scope?.kind === "listing"
      ? (fixedListingsQuery.data ?? [])
      : (listingsSearch.data?.items ?? []);
  const listingsLoading =
    scope?.kind === "listing"
      ? fixedListingsQuery.isLoading
      : listingsSearch.isLoading;
  const listingsError =
    scope?.kind === "listing"
      ? fixedListingsQuery.isError
      : listingsSearch.isError;
  const buyerRequirementItems =
    scope?.kind === "demand"
      ? fixedRequirementQuery.data
        ? [fixedRequirementQuery.data]
        : []
      : (buyerReqSearch.data?.items ?? []);
  const buyerRequirementsLoading =
    scope?.kind === "demand"
      ? fixedRequirementQuery.isLoading
      : buyerReqSearch.isLoading;
  const buyerRequirementsError =
    scope?.kind === "demand"
      ? fixedRequirementQuery.isError
      : buyerReqSearch.isError;

  const isDuplicate = useMemo(
    () => isDuplicateMatch(matches, selectedListing?.id, selectedBuyerReq?.id),
    [matches, selectedListing?.id, selectedBuyerReq?.id],
  );

  const createMutation = useMutation({
    mutationFn: () => {
      if (!selectedListing || !selectedBuyerReq) {
        throw new Error("매물과 구매조건을 선택해주세요.");
      }
      return api.matches.create({
        listingId: selectedListing.id,
        buyerReqId: selectedBuyerReq.id,
        memo: memo.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
      queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] });
      queryClient.invalidateQueries({ queryKey: ["brokerage-cases"] });
      toast.success("매칭이 생성되었습니다");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(`매칭 생성에 실패했습니다: ${error.message}`);
    },
  });

  const canSubmit =
    selectedListing !== null &&
    selectedBuyerReq !== null &&
    !isDuplicate &&
    !createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>매칭 생성</DialogTitle>
          <DialogDescription>
            매물과 구매조건을 연결해 매칭 파이프라인에 올립니다. 생성 후에는
            ‘내부 후보’로 시작합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          {/* 매물 선택 */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Building2 className="size-4 text-muted-foreground" />
              매물 선택 <span className="text-destructive">*</span>
            </h3>
            {scope?.kind === "listing" ? (
              <p className="rounded-md bg-success-soft px-2.5 py-2 text-xs text-success-strong">
                현재 내놓음에 등록된 거래 옵션만 선택할 수 있습니다.
              </p>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={listingQuery}
                  onChange={(event) => setListingQuery(event.target.value)}
                  placeholder="단지명, 주소로 검색"
                  className="h-8 pl-8 text-sm"
                />
              </div>
            )}
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border/60 p-1">
              {listingsLoading ? (
                <div className="space-y-1 p-1">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : listingsError ? (
                <div className="flex items-center justify-between px-2 py-3 text-xs text-muted-foreground">
                  <span>매물을 불러오지 못했습니다.</span>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      scope?.kind === "listing"
                        ? fixedListingsQuery.refetch()
                        : listingsSearch.refetch()
                    }
                  >
                    재시도
                  </Button>
                </div>
              ) : listingItems.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  검색 결과가 없습니다.
                </p>
              ) : (
                listingItems.map((listing) => {
                  const selected = selectedListing?.id === listing.id;
                  const locked =
                    scope?.kind === "listing" && listingItems.length === 1;
                  return (
                    <button
                      key={listing.id}
                      type="button"
                      aria-pressed={selected}
                      className={cn(
                        "flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/40",
                        selected && "bg-info-soft/60 hover:bg-info-soft/60",
                        locked && "cursor-default",
                      )}
                      onClick={() => {
                        if (!locked)
                          setSelectedListing(selected ? null : listing);
                      }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium">
                            {getListingTitle(listing)}
                          </p>
                          <StatusBadge
                            kind="transactionType"
                            status={listing.transactionType}
                            size="sm"
                          />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {getListingAddress(listing)}
                        </p>
                        <p className="mt-0.5 text-xs font-medium tabular-nums">
                          {formatListingPrice(listing)}
                        </p>
                      </div>
                      {selected && (
                        <Check className="mt-1 size-4 shrink-0 text-info" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* 구매조건 선택 */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <UserRound className="size-4 text-muted-foreground" />
              구매조건 선택 <span className="text-destructive">*</span>
            </h3>
            {scope?.kind === "demand" ? (
              <p className="rounded-md bg-info-soft px-2.5 py-2 text-xs text-info-strong">
                현재 구함 조건의 고객으로 고정됩니다.
              </p>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={buyerQuery}
                  onChange={(event) => setBuyerQuery(event.target.value)}
                  placeholder="고객명, 연락처로 검색"
                  className="h-8 pl-8 text-sm"
                />
              </div>
            )}
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border/60 p-1">
              {buyerRequirementsLoading ? (
                <div className="space-y-1 p-1">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : buyerRequirementsError ? (
                <div className="flex items-center justify-between px-2 py-3 text-xs text-muted-foreground">
                  <span>구매조건을 불러오지 못했습니다.</span>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      scope?.kind === "demand"
                        ? fixedRequirementQuery.refetch()
                        : buyerReqSearch.refetch()
                    }
                  >
                    재시도
                  </Button>
                </div>
              ) : buyerRequirementItems.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  검색 결과가 없습니다.
                </p>
              ) : (
                buyerRequirementItems.map((requirement) => {
                  const selected = selectedBuyerReq?.id === requirement.id;
                  const locked = scope?.kind === "demand";
                  return (
                    <button
                      key={requirement.id}
                      type="button"
                      aria-pressed={selected}
                      className={cn(
                        "flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/40",
                        selected && "bg-info-soft/60 hover:bg-info-soft/60",
                        locked && "cursor-default",
                      )}
                      onClick={() => {
                        if (!locked)
                          setSelectedBuyerReq(selected ? null : requirement);
                      }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {requirement.contact?.name ?? "미지정"}
                          {requirement.contact?.phone && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              {formatPhone(requirement.contact.phone)}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {formatRequirementSummaryFromBuyerRequirement(
                            requirement,
                          )}
                        </p>
                      </div>
                      {selected && (
                        <Check className="mt-1 size-4 shrink-0 text-info" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold" htmlFor="match-create-memo">
            초기 메모
          </label>
          <Textarea
            id="match-create-memo"
            placeholder="추천 사유 등 초기 메모 (선택)"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            className="min-h-16"
          />
        </div>

        {isDuplicate && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              이미 같은 매물과 구매조건으로 진행 중인 매칭이 있습니다.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
          >
            매칭 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
