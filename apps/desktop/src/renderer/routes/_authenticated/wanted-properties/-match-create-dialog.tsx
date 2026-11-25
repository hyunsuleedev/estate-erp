import { useEffect, useMemo, useRef, useState } from "react";
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
import { MatchStage, normalizeMatchStage } from "@estate-erp/shared";
import {
  formatListingPrice,
  formatRequirementSummaryFromBuyerRequirement,
  getListingAddress,
  getListingTitle,
  isDuplicateMatch,
} from "./-match-view-utils";
import {
  buildRecommendationFilter,
  computeListingFit,
  describeFit,
  getListingUnavailableLabel,
  hasSiblingOccupyingDeal,
  scoreListingFit,
} from "./-listing-fit";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/format";
import { getListingAvailability } from "@/lib/listing-status";
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

/** 창을 연 곳에 맞춘 이름. 고객 줄에서 열면 "매물 연결", 매물에서 열면 "고객 연결"이다. */
const DIALOG_COPY = {
  demand: {
    title: "매물 연결",
    description:
      "이 고객에게 제안할 매물을 고릅니다. 연결하면 '내부 후보' 단계에서 시작합니다.",
    submit: "연결",
    success: "매물을 연결했습니다",
  },
  listing: {
    title: "고객 연결",
    description:
      "이 매물을 제안할 고객을 고릅니다. 연결하면 '내부 후보' 단계에서 시작합니다.",
    submit: "연결",
    success: "고객을 연결했습니다",
  },
  none: {
    title: "매칭 생성",
    description:
      "매물과 고객의 희망 조건을 연결합니다. 연결하면 '내부 후보' 단계에서 시작합니다.",
    submit: "매칭 생성",
    success: "매칭을 만들었습니다",
  },
} as const;

export function MatchCreateDialog({
  open,
  onOpenChange,
  matches,
  scope,
  initialListingMode = "fit",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 중복 매칭(같은 매물 + 같은 구매조건) 사전 차단용 현재 목록 */
  matches: Match[];
  /** 원장 행에서 열 때 현재 구함 또는 내놓음 문맥을 벗어나지 않도록 한쪽을 고정 */
  scope?: MatchCreateDialogScope;
  /** 열 때 매물 목록을 무엇으로 보일지. 희망 조건 상세의 "전체 매물에서 찾기"는 'all'로 연다 */
  initialListingMode?: "fit" | "all";
}) {
  const queryClient = useQueryClient();
  const [listingQuery, setListingQuery] = useState("");
  const [buyerQuery, setBuyerQuery] = useState("");
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedBuyerReq, setSelectedBuyerReq] =
    useState<BuyerRequirement | null>(null);
  const [memo, setMemo] = useState("");
  // 고객 줄에서 열면(희망 조건이 정해져 있으면) 먼저 그 조건에 맞는 매물을 보여 준다.
  // "전체 매물"로 바꾸면 조건과 상관없이 단지명 · 주소로 찾는다(조건 밖의 매물을 권할 때).
  const [listingMode, setListingMode] = useState<"fit" | "all">("fit");
  const fixedRequirementId =
    scope?.kind === "demand" ? scope.requirementId : null;
  const fixedListingIds = scope?.kind === "listing" ? scope.listingIds : [];
  const fixedListingKey = fixedListingIds.join(",");
  const copy = DIALOG_COPY[scope?.kind ?? "none"];

  useEffect(() => {
    if (!open) {
      setListingQuery("");
      setBuyerQuery("");
      setSelectedListing(null);
      setSelectedBuyerReq(null);
      setMemo("");
      setListingMode("fit");
    } else {
      setListingMode(initialListingMode);
    }
  }, [open, initialListingMode]);

  const fixedRequirementQuery = useQuery({
    queryKey: ["buyer-requirements", "match-create-fixed", fixedRequirementId],
    queryFn: () => {
      if (!fixedRequirementId) {
        throw new Error("고객의 희망 조건을 찾을 수 없습니다.");
      }
      return api.buyerRequirements.findOne(fixedRequirementId);
    },
    enabled: open && fixedRequirementId !== null,
  });
  const fixedRequirement =
    scope?.kind === "demand" ? (fixedRequirementQuery.data ?? null) : null;
  const recommending = scope?.kind === "demand" && listingMode === "fit";

  const listingsSearch = useQuery({
    queryKey: [
      "listings",
      "match-create-search",
      listingQuery,
      recommending ? (fixedRequirement?.id ?? null) : "all",
      recommending ? (fixedRequirement?.updatedAt ?? null) : null,
    ],
    queryFn: () =>
      api.listings.findAll({
        ...(recommending && fixedRequirement
          ? buildRecommendationFilter(fixedRequirement)
          : { limit: 20 }),
        search: listingQuery.trim() || undefined,
      }),
    enabled: open && scope?.kind !== "listing" && (!recommending || fixedRequirement !== null),
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

  // 진행 중인 매칭만 중복으로 본다. 종료한 매칭의 매물은 다시 연결할 수 있다(서버도 같다).
  const openMatches = useMemo(
    () =>
      matches.filter(
        (match) => normalizeMatchStage(match.stage) !== MatchStage.CLOSED,
      ),
    [matches],
  );

  const listingItems = useMemo(() => {
    const items =
      scope?.kind === "listing"
        ? (fixedListingsQuery.data ?? [])
        : (listingsSearch.data?.items ?? []);
    // 희망 조건이 있으면 맞는 조건이 많은 매물부터 (서버 순서는 같은 점수 안에서 유지)
    const requirement = selectedBuyerReq;
    if (!requirement || scope?.kind === "listing") {
      return items.map((listing) => ({ listing, fit: null }));
    }
    return items
      .map((listing, index) => {
        const checks = computeListingFit(listing, requirement);
        // 거래 중 · 보류 · 종료인 매물은 조건이 다 맞아도 맨 아래로 (지금 권해도 거래로 넘길 수 없다)
        const unavailable = getListingUnavailableLabel(listing) !== null;
        return { listing, fit: checks, score: scoreListingFit(checks), index, unavailable };
      })
      .sort(
        (left, right) =>
          Number(left.unavailable) - Number(right.unavailable) ||
          right.score - left.score ||
          left.index - right.index,
      )
      .map(({ listing, fit }) => ({ listing, fit }));
  }, [fixedListingsQuery.data, listingsSearch.data, scope?.kind, selectedBuyerReq]);
  const listingsLoading =
    scope?.kind === "listing"
      ? fixedListingsQuery.isLoading
      : listingsSearch.isLoading ||
        (recommending && fixedRequirementQuery.isLoading);
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
    () => isDuplicateMatch(openMatches, selectedListing?.id, selectedBuyerReq?.id),
    [openMatches, selectedListing?.id, selectedBuyerReq?.id],
  );
  const linkedListingIds = useMemo(
    () =>
      new Set(
        selectedBuyerReq
          ? openMatches
              .filter((match) => match.buyerReqId === selectedBuyerReq.id)
              .map((match) => match.listingId)
          : [],
      ),
    [openMatches, selectedBuyerReq],
  );

  // 단추를 빠르게 두 번 눌러도 한 번만 연결한다 (isPending은 다음 그리기에서야 바뀐다)
  const submittingRef = useRef(false);
  const createMutation = useMutation({
    onSettled: () => {
      submittingRef.current = false;
    },
    mutationFn: () => {
      if (!selectedListing || !selectedBuyerReq) {
        throw new Error("매물과 고객을 골라 주세요.");
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
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(copy.success);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error, "연결하지 못했습니다. 다시 시도해 주세요."));
    },
  });

  const canSubmit =
    selectedListing !== null &&
    selectedBuyerReq !== null &&
    !isDuplicate &&
    !createMutation.isPending;

  const emptyListingText = recommending
    ? listingQuery.trim()
      ? "희망 조건에 맞는 매물 중 검색 결과가 없습니다."
      : "희망 조건에 맞는 매물이 없습니다. '전체 매물'에서 찾아 보세요."
    : "검색 결과가 없습니다.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          {/* 매물 선택 */}
          <section className="min-w-0 space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Building2 className="size-4 text-muted-foreground" />
              매물 선택 <span className="text-destructive">*</span>
            </h3>
            {scope?.kind === "listing" ? (
              <p className="rounded-md bg-success-soft px-2.5 py-2 text-xs text-success-strong">
                이 매물에 등록된 거래 조건 중에서 고릅니다.
              </p>
            ) : (
              <>
                {scope?.kind === "demand" && (
                  <div
                    role="tablist"
                    aria-label="매물 찾는 범위"
                    className="flex h-[30px] w-fit items-center gap-px rounded-full bg-[rgba(55,53,47,0.08)] p-0.5"
                  >
                    {(
                      [
                        ["fit", "조건에 맞는 매물"],
                        ["all", "전체 매물"],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={listingMode === mode}
                        onClick={() => setListingMode(mode)}
                        className={cn(
                          "inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                          listingMode === mode
                            ? "bg-foreground font-medium text-white"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={listingQuery}
                    onChange={(event) => setListingQuery(event.target.value)}
                    placeholder="단지명, 동·호, 주소로 검색"
                    className="h-8 pl-8 text-sm"
                  />
                </div>
              </>
            )}
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border/60 p-1">
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
                    다시 시도
                  </Button>
                </div>
              ) : listingItems.length === 0 ? (
                <p className="break-keep px-2 py-3 text-center text-xs text-muted-foreground">
                  {emptyListingText}
                </p>
              ) : (
                listingItems.map(({ listing, fit }) => {
                  const selected = selectedListing?.id === listing.id;
                  const locked =
                    scope?.kind === "listing" && listingItems.length === 1;
                  const linked = linkedListingIds.has(listing.id);
                  const availability = getListingAvailability(listing);
                  const unavailableLabel = getListingUnavailableLabel(listing);
                  const fitParts = fit ? describeFit(fit) : [];
                  return (
                    <button
                      key={listing.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={linked}
                      title={linked ? "이미 이 고객에게 연결한 매물입니다" : undefined}
                      className={cn(
                        "flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent",
                        selected && "bg-info-soft/60 hover:bg-info-soft/60",
                        locked && "cursor-default",
                        unavailableLabel && !selected && "opacity-60",
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
                          {availability !== "available" ? (
                            <StatusBadge
                              kind="listingAvailability"
                              status={availability}
                              size="sm"
                            />
                          ) : (
                            hasSiblingOccupyingDeal(listing) && (
                              <span
                                title="같은 집의 다른 거래 조건이 거래 중이라 이 매물로는 거래를 만들 수 없습니다"
                                className="inline-flex shrink-0 items-center rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning-strong"
                              >
                                같은 집 거래 중
                              </span>
                            )
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {getListingAddress(listing)}
                        </p>
                        <p className="mt-0.5 text-xs font-medium tabular-nums">
                          {formatListingPrice(listing)}
                        </p>
                        {linked ? (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            이미 연결한 매물
                          </p>
                        ) : (
                          fitParts.length > 0 && (
                            <p className="mt-0.5 text-[11px] leading-4">
                              {unavailableLabel && (
                                <span className="text-muted-foreground">
                                  {unavailableLabel}
                                  {unavailableLabel === "거래 중" ? "이라" : "라"} 지금은 거래로 넘길 수 없습니다 ·{" "}
                                </span>
                              )}
                              {fitParts.map((part, index) => (
                                <span key={part.key}>
                                  {index > 0 && (
                                    <span className="text-muted-foreground"> · </span>
                                  )}
                                  <span
                                    className={
                                      part.ok === false
                                        ? "text-warning-strong"
                                        : "text-muted-foreground"
                                    }
                                  >
                                    {part.text}
                                  </span>
                                </span>
                              ))}
                            </p>
                          )
                        )}
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

          {/* 고객(희망 조건) 선택 */}
          <section className="min-w-0 space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <UserRound className="size-4 text-muted-foreground" />
              고객 <span className="text-destructive">*</span>
            </h3>
            {scope?.kind === "demand" ? (
              <p className="rounded-md bg-info-soft px-2.5 py-2 text-xs text-info-strong">
                이 고객의 희망 조건으로 연결합니다.
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
                  <span>고객을 불러오지 못했습니다.</span>
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
                    다시 시도
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
            메모
          </label>
          <Textarea
            id="match-create-memo"
            placeholder="추천 이유 등 (선택)"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            className="min-h-16"
          />
        </div>

        {isDuplicate && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              이미 이 고객에게 연결해 진행 중인 매물입니다.
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
            onClick={() => {
              if (submittingRef.current || !canSubmit) return;
              submittingRef.current = true;
              createMutation.mutate();
            }}
            disabled={!canSubmit}
          >
            {createMutation.isPending ? "연결 중…" : copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
