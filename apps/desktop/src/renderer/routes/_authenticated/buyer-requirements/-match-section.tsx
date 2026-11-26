import { formatPlaceLabel, MatchStage, normalizeMatchStage } from "@estate-erp/shared";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateMatchData } from "@/queries/matches";
import { ArrowUpRight, Link2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import type {
  BuyerRequirement,
  Listing,
  ListingsFilter,
} from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney, formatPhone } from "@/lib/format";
import { StatusBadge } from "@/components/domain";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSupplyPyeong } from "./-buyer-utils";
import { getListingUnavailableLabel, getListingWardCode } from "../wanted-properties/-listing-fit";
import { getMatchClosedReasonText } from "../wanted-properties/-match-view-utils";
import { H2, nb, Tag } from "../properties/-detail/ui";

/** 월세 "1억 / 250만" — 보증금 / 월세, 둘 다 단위를 붙인다 (화면 낱말 기준) */
function formatDepositRent(
  deposit: number | null | undefined,
  monthlyRent: number | null | undefined,
): string {
  return `${formatMoney(deposit)} / ${formatMoney(monthlyRent)}`;
}

/** "고덕그라시움 101동 3301호" — 앱 공용 표기(formatPlaceLabel). 손으로 이어 붙이지 않는다 */
function homeTitle(
  siteName: string | null | undefined,
  unit:
    | {
        name: string | null;
        floor?: number | null;
        dong?: { name: string; isPlaceholder?: boolean } | null;
      }
    | null
    | undefined,
): string {
  return (
    formatPlaceLabel({
      siteName,
      dongName: unit?.dong?.name,
      dongIsPlaceholder: unit?.dong?.isPlaceholder,
      unit,
    }) || "매물"
  );
}

/** 매칭 후보 탐색 범위 칩 — 희망단지 우선, 그다음 희망지역, 마지막 조건 전체 */
interface CandidateScope {
  key: string;
  label: string;
  params: Partial<ListingsFilter> & { wardCode?: string };
  /** 서버가 바로 거르지 못하는 범위(시군구)는 받아 온 뒤 화면에서 거른다 */
  keep?: (listing: Listing) => boolean;
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
      label: "희망 단지",
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
      label: "예산",
    });
  }

  if (requirement.areaMin != null || requirement.areaMax != null) {
    checks.push({
      weight: 25,
      hit:
        area != null &&
        inRange(area, requirement.areaMin, requirement.areaMax),
      label: "평형",
    });
  }

  if (requirement.siteTypes.length > 0 && property?.site?.type) {
    checks.push({
      weight: 15,
      hit: requirement.siteTypes.includes(property.site.type),
      label: "매물 유형",
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

/** 맞는 조건의 비율. 저장하지 않는 계산 값이다 (손님이 정한 조건만 견준다). */
function FitBadge({ fit }: { fit: MatchFit }) {
  const tone = fit.score >= 80 ? "green" : fit.score >= 50 ? "yellow" : "gray";
  return (
    <span
      title={
        fit.hits.length > 0 ? `맞는 조건: ${fit.hits.join(", ")}` : "맞는 조건이 없습니다"
      }
    >
      <Tag tone={tone} className="text-[12px]">
        조건 {fit.score}% 맞음
      </Tag>
    </span>
  );
}

export function MatchSection({
  requirement,
  onFindAll,
}: {
  requirement: BuyerRequirement;
  /** 추천 밖의 매물까지 찾아 연결하는 창을 연다 (희망매물 화면의 "매물 연결" 창, 전체 매물) */
  onFindAll?: () => void;
}) {
  const queryClient = useQueryClient();
  const matches = requirement.matches ?? [];
  // 진행 중인 매칭의 매물만 후보에서 뺀다. 종료한 매칭의 매물은 다시 권할 수 있다(서버도 같다).
  const matchedListingIds = useMemo(
    () =>
      new Set(
        matches
          .filter((m) => normalizeMatchStage(m.stage) !== MatchStage.CLOSED)
          .map((m) => m.listingId),
      ),
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
      // 예전에는 서버가 받지 않는 이름(sigungu · eupmyeondong)을 보내 지역을 골라도 모든 매물이 나왔다.
      // 동은 법정동 코드로 서버에서 거르고, 구는 코드 앞자리로 받아 온 뒤 거른다.
      if (pr.ward?.name && pr.wardCode) {
        const wardCode = pr.wardCode;
        list.push({
          key: `ward:${wardCode}`,
          label: pr.ward.name,
          params: { wardCode },
        });
      } else if (pr.district?.name && pr.districtCode) {
        const districtCode = pr.districtCode;
        list.push({
          key: `district:${districtCode}`,
          label: pr.district.name,
          params: { limit: 50 },
          keep: (listing) => getListingWardCode(listing)?.startsWith(districtCode) ?? false,
        });
      }
    }
    list.push({ key: "all", label: "지역 상관없이", params: {} });
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
        .filter((listing) => activeScope?.keep?.(listing) ?? true)
        .slice(0, 12)
        .map((listing) => ({
          listing,
          fit: computeMatchFit(listing, requirement),
          unavailable: getListingUnavailableLabel(listing),
        }))
        // 거래 중 · 보류 · 종료인 매물은 조건이 다 맞아도 맨 아래로 내리고 흐리게 보인다
        // (2026-11-22 관통 검수: 거래 중인 매물이 "조건 100% 맞음"으로 맨 위에 나왔다)
        .sort(
          (a, b) =>
            Number(a.unavailable !== null) - Number(b.unavailable !== null) ||
            (b.fit?.score ?? -1) - (a.fit?.score ?? -1),
        ),
    [activeScope, candidatesData, matchedListingIds, requirement],
  );

  const [creatingId, setCreatingId] = useState<string | null>(null);
  const createMatchMutation = useMutation({
    mutationFn: (listingId: string) =>
      api.matches.create({ listingId, buyerReqId: requirement.id }),
    onSuccess: async () => {
      toast.success("매물을 연결했습니다.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] }),
        invalidateMatchData(queryClient),
      ]);
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error, "연결하지 못했습니다. 다시 시도해 주세요."));
    },
    onSettled: () => setCreatingId(null),
  });

  return (
    <>
      {/* ── 연결한 매물: 진행은 희망매물 화면의 단계 띠에서 한다. 여기서는 어디까지 왔는지 읽는다 ── */}
      <section data-requirement-linked>
        <H2
          title="연결한 매물"
          count={matches.length}
          action={
            <Link
              to="/wanted-properties"
              // 목록 전체가 아니라 이 손님으로 거른 채 연다 (예전에는 목록에서 손님을 다시 찾아야 했다)
              search={{
                q: requirement.contact?.phone
                  ? formatPhone(requirement.contact.phone)
                  : (requirement.contact?.name ?? undefined),
              }}
              className={nb.ghost}
            >
              희망매물에서 진행
              <ArrowUpRight />
            </Link>
          }
        />
        {matches.length === 0 ? (
          <p className="py-1 text-[14px] text-[#37352f]/65">
            연결한 매물이 없습니다. 아래 추천 매물에서 &lsquo;연결&rsquo;을 눌러 손님에게 권할 매물을 붙이세요.
          </p>
        ) : (
          <ul className="border-t border-[#e9e9e7]">
            {matches.map((m) => {
              const site = m.listing?.property?.site;
              const listing = m.listing;
              const address = site?.roadAddress ?? site?.jibunAddress;
              const closedReason = getMatchClosedReasonText({
                stage: m.stage,
                closedFromStage: m.closedFromStage ?? null,
                closedReason: m.closedReason ?? null,
              });
              return (
                <li
                  key={m.id}
                  className="flex min-h-[46px] items-center gap-3 border-b border-[#e9e9e7] py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium">
                        {homeTitle(site?.name, m.listing?.property?.unit)}
                      </span>
                      {listing && (
                        <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
                      )}
                    </div>
                    <p className="truncate text-[13px] tabular-nums text-[#37352f]/65">
                      <span className="font-medium text-[#37352f]">
                        {listing?.transactionType === "monthly"
                          ? formatDepositRent(listing?.deposit, listing?.monthlyRent)
                          : formatMoney(listing?.price)}
                      </span>
                      {address && <> · {address}</>}
                      {" · "}
                      {formatDate(m.createdAt)} 연결
                      {closedReason && <> · {closedReason}</>}
                    </p>
                  </div>
                  <StatusBadge kind="matchStage" status={m.stage} size="sm" />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 추천 매물: 손님의 거래유형 · 금액 · 평형에 맞는 매물. 위 단추로 지역 · 단지를 좁힌다 ── */}
      <section data-requirement-recommend id="recommend">
        <H2
          title="추천 매물"
          hint="거래유형 · 금액 · 평형이 맞는 매물"
          action={
            onFindAll && (
              // 조건 밖의 매물(30평대 손님에게 25평)도 권할 수 있게: 전체 매물에서 찾아 연결한다
              <button type="button" className={nb.ghost} onClick={onFindAll} data-requirement-find-all>
                <Search />
                전체 매물에서 찾기
              </button>
            )
          }
        />
        <div className="mb-2 flex flex-wrap items-center gap-1" role="tablist" aria-label="추천 범위">
          {scopes.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={s.key === activeScope?.key}
              onClick={() => setScopeKey(s.key)}
              className={cn(
                "inline-flex h-7 items-center rounded-full border px-3 text-[13px] transition-colors",
                s.key === activeScope?.key
                  ? "border-transparent bg-[#ebeae6] font-semibold text-[#37352f]"
                  : "border-[#e3e2de] bg-white text-[#37352f]/65 hover:bg-[#37352f]/[0.04] hover:text-[#37352f]",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {candidatesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : candidatesError ? (
          <p className="flex items-center gap-2 py-2 text-[14px] text-[#37352f]/65">
            추천 매물을 불러오지 못했습니다.
            <button type="button" className={nb.line} onClick={() => refetchCandidates()}>
              <RefreshCw />
              다시 시도
            </button>
          </p>
        ) : candidates.length === 0 ? (
          <p className="py-1 text-[14px] text-[#37352f]/65">
            조건에 맞는 매물이 없습니다. 위에서 &lsquo;지역 상관없이&rsquo;를 고르거나, &lsquo;전체 매물에서 찾기&rsquo;로 조건 밖의 매물을 연결하세요.
          </p>
        ) : (
          <ul className="border-t border-[#e9e9e7]">
            {candidates.map(({ listing: l, fit, unavailable }) => {
              const site = l.property?.site;
              const unit = l.property?.unit;
              const area = unit?.supplyAreaM2 ?? unit?.siteUnitType?.supplyAreaM2;
              const address = site?.roadAddress ?? site?.jibunAddress;
              const isCreating = creatingId === l.id && createMatchMutation.isPending;
              return (
                <li
                  key={l.id}
                  className={cn(
                    "flex min-h-[52px] items-center gap-3 border-b border-[#e9e9e7] py-2",
                    unavailable && "opacity-60",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium">{homeTitle(site?.name, unit)}</span>
                      <StatusBadge kind="transactionType" status={l.transactionType} size="sm" />
                      {unavailable ? (
                        <span title="지금은 거래로 넘길 수 없는 매물입니다">
                          <Tag className="text-[12px]">{unavailable}</Tag>
                        </span>
                      ) : (
                        fit && <FitBadge fit={fit} />
                      )}
                    </div>
                    <p className="truncate text-[13px] tabular-nums text-[#37352f]/65">
                      <span className="font-medium text-[#37352f]">
                        {l.transactionType === "monthly"
                          ? formatDepositRent(l.deposit, l.monthlyRent)
                          : formatMoney(l.price)}
                      </span>
                      {area != null && <> · 공급 {formatSupplyPyeong(area)}</>}
                      {address && <> · {address}</>}
                      {fit && fit.hits.length > 0 && <> · 맞는 조건: {fit.hits.join(", ")}</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={nb.line}
                    disabled={createMatchMutation.isPending}
                    onClick={() => {
                      setCreatingId(l.id);
                      createMatchMutation.mutate(l.id);
                    }}
                  >
                    <Link2 />
                    {isCreating ? "연결 중…" : "연결"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
