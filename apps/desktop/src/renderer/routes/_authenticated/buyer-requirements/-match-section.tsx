import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Building2,
  Link2,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import type {
  BuyerRequirement,
  Listing,
  ListingsFilter,
} from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney, formatRent } from "@/lib/format";
import { EmptyState, StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getListingAvailability } from "@/lib/listing-status";
import { formatSupplyPyeong } from "./-buyer-utils";

/** 매칭 후보 탐색 범위 칩 — 희망단지 우선, 그다음 희망지역, 마지막 조건 전체 */
interface CandidateScope {
  key: string;
  label: string;
  params: Partial<ListingsFilter>;
}

/** 구매원장 조건 대비 후보 매물의 적합도 (0–100)와 충족한 조건 라벨 */
interface MatchFit {
  score: number;
  hits: string[];
}

function inRange(
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): boolean {
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

/**
 * 구매원장에 실제로 지정된 조건(희망단지·가격·면적·매물유형)만 채점 대상으로 삼아
 * 클라이언트 측 적합도를 계산한다. 서버에 매칭 점수 필드가 없으므로 파생 값이다.
 */
function computeMatchFit(
  listing: Listing,
  requirement: BuyerRequirement,
): MatchFit | null {
  const checks: Array<{ weight: number; hit: boolean; label: string }> = [];
  const property = listing.property;
  const areaRaw =
    property?.unit?.supplyAreaM2 ?? property?.unit?.siteUnitType?.supplyAreaM2;
  const area = areaRaw == null ? null : Number(areaRaw);

  const preferredSites = requirement.preferredSites ?? [];
  if (preferredSites.length > 0 && property?.siteId) {
    checks.push({
      weight: 35,
      hit: preferredSites.some((ps) => ps.siteId === property.siteId),
      label: "희망단지",
    });
  }

  if (requirement.transactionType === "monthly") {
    if (requirement.depositMin != null || requirement.depositMax != null) {
      checks.push({
        weight: 15,
        hit: inRange(
          listing.deposit,
          requirement.depositMin,
          requirement.depositMax,
        ),
        label: "보증금",
      });
    }
    if (
      requirement.monthlyRentMin != null ||
      requirement.monthlyRentMax != null
    ) {
      checks.push({
        weight: 15,
        hit: inRange(
          listing.monthlyRent,
          requirement.monthlyRentMin,
          requirement.monthlyRentMax,
        ),
        label: "월세",
      });
    }
  } else if (requirement.priceMin != null || requirement.priceMax != null) {
    checks.push({
      weight: 30,
      hit: inRange(listing.price, requirement.priceMin, requirement.priceMax),
      label: "희망가격",
    });
  }

  if (requirement.areaMin != null || requirement.areaMax != null) {
    checks.push({
      weight: 25,
      hit:
        area != null &&
        inRange(area, requirement.areaMin, requirement.areaMax),
      label: "희망면적",
    });
  }

  if (requirement.siteTypes.length > 0 && property?.site?.type) {
    checks.push({
      weight: 15,
      hit: requirement.siteTypes.includes(property.site.type),
      label: "매물유형",
    });
  }

  if (checks.length === 0) return null;
  const total = checks.reduce((sum, c) => sum + c.weight, 0);
  const gained = checks
    .filter((c) => c.hit)
    .reduce((sum, c) => sum + c.weight, 0);
  return {
    score: Math.round((gained / total) * 100),
    hits: checks.filter((c) => c.hit).map((c) => c.label),
  };
}

const FIT_TONE_CLASSES = {
  high: "bg-success-soft text-success",
  mid: "bg-warning-soft text-warning",
  low: "bg-neutral-soft text-muted-foreground",
} as const;

function FitBadge({ fit }: { fit: MatchFit }) {
  const tone = fit.score >= 80 ? "high" : fit.score >= 50 ? "mid" : "low";
  const grade = tone === "high" ? "높음" : tone === "mid" ? "보통" : "낮음";
  return (
    <span
      title={
        fit.hits.length > 0
          ? `충족 조건: ${fit.hits.join(", ")}`
          : "충족한 조건이 없습니다"
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        FIT_TONE_CLASSES[tone],
      )}
    >
      적합도 {fit.score}%
      <span className="font-normal opacity-80">{grade}</span>
    </span>
  );
}

export function MatchSection({
  requirement,
}: {
  requirement: BuyerRequirement;
}) {
  const queryClient = useQueryClient();
  const matches = requirement.matches ?? [];
  const matchedListingIds = useMemo(
    () => new Set(matches.map((m) => m.listingId)),
    [matches],
  );

  const scopes = useMemo<CandidateScope[]>(() => {
    const list: CandidateScope[] = [];
    for (const ps of requirement.preferredSites ?? []) {
      if (ps.site) {
        list.push({
          key: `site:${ps.siteId}`,
          label: ps.site.name,
          params: { siteId: ps.siteId },
        });
      }
    }
    for (const pr of requirement.preferredRegions ?? []) {
      if (pr.ward?.name) {
        list.push({
          key: `ward:${pr.ward.code}`,
          label: pr.ward.name,
          params: { eupmyeondong: pr.ward.name },
        });
      } else if (pr.district?.name) {
        list.push({
          key: `district:${pr.district.code}`,
          label: pr.district.name,
          params: { sigungu: pr.district.name },
        });
      }
    }
    list.push({ key: "all", label: "조건 전체", params: {} });
    return list;
  }, [requirement]);

  const [scopeKey, setScopeKey] = useState<string>(scopes[0]?.key ?? "all");
  const activeScope =
    scopes.find((s) => s.key === scopeKey) ?? scopes[scopes.length - 1];

  const candidateParams = useMemo<ListingsFilter>(() => {
    const params: ListingsFilter = {
      limit: 8,
      sortBy: "createdAt",
      sortOrder: "desc",
    };
    if (requirement.transactionType)
      params.transactionType = requirement.transactionType;
    if (requirement.transactionType === "monthly") {
      if (requirement.depositMin != null)
        params.depositMin = requirement.depositMin;
      if (requirement.depositMax != null)
        params.depositMax = requirement.depositMax;
      if (requirement.monthlyRentMin != null)
        params.monthlyRentMin = requirement.monthlyRentMin;
      if (requirement.monthlyRentMax != null)
        params.monthlyRentMax = requirement.monthlyRentMax;
    } else {
      if (requirement.priceMin != null) params.priceMin = requirement.priceMin;
      if (requirement.priceMax != null) params.priceMax = requirement.priceMax;
    }
    if (requirement.areaMin != null) params.areaMin = requirement.areaMin;
    if (requirement.areaMax != null) params.areaMax = requirement.areaMax;
    return { ...params, ...activeScope?.params };
  }, [requirement, activeScope]);

  const {
    data: candidatesData,
    isLoading: candidatesLoading,
    isError: candidatesError,
    refetch: refetchCandidates,
  } = useQuery({
    queryKey: [
      "buyer-requirements",
      "candidates",
      requirement.id,
      candidateParams,
    ],
    queryFn: () => api.listings.findAll(candidateParams),
  });

  const candidates = useMemo(
    () =>
      (candidatesData?.items ?? [])
        .filter((listing) => !matchedListingIds.has(listing.id))
        .map((listing) => ({
          listing,
          fit: computeMatchFit(listing, requirement),
        }))
        .sort((a, b) => (b.fit?.score ?? -1) - (a.fit?.score ?? -1)),
    [candidatesData, matchedListingIds, requirement],
  );

  const [creatingId, setCreatingId] = useState<string | null>(null);
  const createMatchMutation = useMutation({
    mutationFn: (listingId: string) =>
      api.matches.create({ listingId, buyerReqId: requirement.id }),
    onSuccess: async () => {
      toast.success("매칭이 생성되었습니다.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] }),
        queryClient.invalidateQueries({ queryKey: ["matches"] }),
      ]);
    },
    onError: () => {
      toast.error(
        "매칭 생성에 실패했습니다. 이미 같은 매칭이 있는지 확인해주세요.",
      );
    },
    onSettled: () => setCreatingId(null),
  });

  return (
    <section className="space-y-4">
      {/* ── 연결 매칭 ── */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold">
            연결 매칭{" "}
            <span className="font-normal text-muted-foreground">
              {matches.length}건
            </span>
          </h3>
          <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
            <Link to="/matches">
              매칭 화면으로 이동
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </div>
        {matches.length === 0 ? (
          <div className="px-4 py-2">
            <EmptyState
              icon={Link2}
              title="연결된 매칭이 없습니다"
              description="아래 매칭 후보 카드에서 '매칭 생성'을 눌러 고객에게 제안할 매물을 연결해보세요."
            />
          </div>
        ) : (
          <ul className="divide-y">
            {matches.map((m) => {
              const site = m.listing?.property?.site;
              const listing = m.listing;
              const address = site?.roadAddress ?? site?.jibunAddress;
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {site?.name ?? "매물"}
                      </span>
                      {listing && (
                        <StatusBadge
                          kind="transactionType"
                          status={listing.transactionType}
                          size="sm"
                        />
                      )}
                    </div>
                    <p className="truncate text-xs tabular-nums text-muted-foreground">
                      <span className="font-medium text-foreground/80">
                        {listing?.transactionType === "monthly"
                          ? formatRent(listing?.deposit, listing?.monthlyRent)
                          : formatMoney(listing?.price)}
                      </span>
                      {address && (
                        <>
                          <span className="mx-1.5 text-border">·</span>
                          {address}
                        </>
                      )}
                      <span className="mx-1.5 text-border">·</span>
                      {formatDate(m.createdAt)} 연결
                    </p>
                  </div>
                  <StatusBadge kind="matchStage" status={m.stage} size="sm" />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── 매칭 후보 ── */}
      <div className="rounded-lg border">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold">매칭 후보</h3>
          <div className="flex flex-wrap gap-1">
            {scopes.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setScopeKey(s.key)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs transition-colors",
                  s.key === activeScope?.key
                    ? "border-primary/40 bg-primary/10 font-medium text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {candidatesLoading ? (
          <div className="grid gap-3 p-4 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : candidatesError ? (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              매칭 후보를 불러오지 못했습니다.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchCandidates()}
            >
              <RefreshCw className="size-3.5" />
              다시 시도
            </Button>
          </div>
        ) : candidates.length === 0 ? (
          <div className="px-4 py-2">
            <EmptyState
              icon={Building2}
              title="조건에 맞는 후보 매물이 없습니다"
              description="위 탐색 범위 칩을 '조건 전체'로 넓히거나, 구매원장의 희망 가격·면적 조건을 조정해보세요."
            />
          </div>
        ) : (
          <ul className="grid items-stretch gap-3 p-4 xl:grid-cols-2">
            {candidates.map(({ listing: l, fit }) => {
              const site = l.property?.site;
              const unit = l.property?.unit;
              const dongName =
                unit?.dong && !unit.dong.isPlaceholder ? unit.dong.name : null;
              const area =
                unit?.supplyAreaM2 ?? unit?.siteUnitType?.supplyAreaM2;
              const address = site?.roadAddress ?? site?.jibunAddress;
              const isCreating =
                creatingId === l.id && createMatchMutation.isPending;
              return (
                <li
                  key={l.id}
                  className="flex flex-col gap-2 rounded-lg border bg-card p-3.5 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {site?.name ?? "매물"}
                        {dongName ? ` ${dongName}` : ""}
                        {unit?.name ? ` ${unit.name}` : ""}
                      </p>
                      {address && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="size-3 shrink-0" />
                          {address}
                        </p>
                      )}
                    </div>
                    {fit && <FitBadge fit={fit} />}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-bold tabular-nums">
                      {l.transactionType === "monthly"
                        ? formatRent(l.deposit, l.monthlyRent)
                        : formatMoney(l.price)}
                    </span>
                    <StatusBadge
                      kind="transactionType"
                      status={l.transactionType}
                      size="sm"
                    />
                    <StatusBadge
                      kind="listingAvailability"
                      status={getListingAvailability(l)}
                      size="sm"
                    />
                  </div>

                  <p className="text-xs tabular-nums text-muted-foreground">
                    {area != null && <>공급 {formatSupplyPyeong(area)}</>}
                    {fit && fit.hits.length > 0 && (
                      <>
                        {area != null && (
                          <span className="mx-1.5 text-border">·</span>
                        )}
                        조건 충족: {fit.hits.join(" · ")}
                      </>
                    )}
                  </p>

                  <Button
                    size="sm"
                    className="mt-auto h-8 w-full"
                    disabled={createMatchMutation.isPending}
                    onClick={() => {
                      setCreatingId(l.id);
                      createMatchMutation.mutate(l.id);
                    }}
                  >
                    <Link2 className="size-3.5" />
                    {isCreating ? "매칭 생성 중…" : "매칭 생성"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
