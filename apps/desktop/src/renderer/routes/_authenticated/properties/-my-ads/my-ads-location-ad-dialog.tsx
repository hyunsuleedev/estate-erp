import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { formatUnitLabel } from "@estate-erp/shared";
import type { Listing, Site } from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { naverCpChannels } from "@/lib/advertisement-channels";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PropertyTableTransactionBadge } from "./my-ads-cells";
import { sanitizeManwonInput } from "./my-ads-drafts";
import { getErrorMessage } from "./my-ads-format";
import { manualAdListingPriceLabel } from "./my-ads-manual-ad-state";

/**
 * 매물 없이 광고 넣기. 매물 대신 위치(단지 → 동 → 호)를 고른다.
 *
 * 단지는 꼭 골라야 한다 — 사람이 넣는 광고는 적어도 건물까지는 우리 데이터에 이어진다.
 * 호까지 고르면 공공 호실에 직접 걸지 않고 우리 사무소의 관리 공간을 만들어(없으면) 거기에 건다.
 * 그 호에 같은 거래유형의 매물이 이미 있으면 보여 주고, 그대로 두면 그 매물의 광고로 저장한다.
 */

const NONE = "__none__";
const TRANSACTION_OPTIONS = [
  { value: "sale", label: "매매" },
  { value: "jeonse", label: "전세" },
  { value: "monthly", label: "월세" },
];
const MAX_SITE_RESULTS = 8;

type Draft = {
  dongId: string;
  unitId: string;
  transactionType: string;
  channel: string;
  price: string;
  deposit: string;
  monthlyRent: string;
  externalAdId: string;
  naverArticleNo: string;
};

const emptyDraft: Draft = {
  dongId: NONE,
  unitId: NONE,
  transactionType: "sale",
  channel: "",
  price: "",
  deposit: "",
  monthlyRent: "",
  externalAdId: "",
  naverArticleNo: "",
};

function parseManwon(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function MyAdsLocationAdDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(88svh,calc(100svh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-lg">
        {/* 닫았다 다시 열면 처음부터 시작한다 */}
        {open && <LocationAdForm onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function LocationAdForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [siteQuery, setSiteQuery] = useState("");
  const [site, setSite] = useState<Site | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  /** 그 호에 이미 있는 매물에 잇지 않겠다고 고른 경우 */
  const [skipListing, setSkipListing] = useState(false);
  const patch = (next: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...next }));

  const debouncedSiteQuery = useDebouncedValue(siteQuery.trim(), 250);
  const officeSitesQuery = useQuery({
    queryKey: ["office-sites"],
    queryFn: () => api.officeSites.findAll(),
    staleTime: 60_000,
  });
  const centralSitesQuery = useQuery({
    queryKey: ["office-sites", "central", debouncedSiteQuery],
    queryFn: () => api.officeSites.searchCentral(debouncedSiteQuery),
    enabled: debouncedSiteQuery.length >= 2,
    staleTime: 60_000,
  });
  const siteResults = useMemo(() => {
    const token = siteQuery.replace(/\s+/g, "").toLocaleLowerCase("ko");
    if (!token) return [];
    const seen = new Set<string>();
    const combined: Site[] = [];
    for (const entry of officeSitesQuery.data ?? []) {
      const item = entry.site ?? (entry as unknown as Site);
      if (item?.id && !seen.has(item.id)) {
        seen.add(item.id);
        combined.push(item);
      }
    }
    for (const item of centralSitesQuery.data ?? []) {
      if (item?.id && !seen.has(item.id)) {
        seen.add(item.id);
        combined.push(item);
      }
    }
    return combined
      .filter((item) =>
        [item.name, item.roadAddress, item.jibunAddress]
          .filter(Boolean)
          .join("")
          .replace(/\s+/g, "")
          .toLocaleLowerCase("ko")
          .includes(token),
      )
      .slice(0, MAX_SITE_RESULTS);
  }, [centralSitesQuery.data, officeSitesQuery.data, siteQuery]);

  const dongsQuery = useQuery({
    queryKey: ["dongs", site?.id],
    queryFn: () => api.dongs.findAll(site!.id),
    enabled: Boolean(site),
  });
  const dongs = dongsQuery.data ?? [];
  // 동 구분이 없는 건물은 자리표시 동 하나뿐이다. 고르게 하지 않고 그 동을 쓴다.
  const visibleDongs = dongs.filter((dong) => !dong.isPlaceholder);
  const placeholderDong = dongs.find((dong) => dong.isPlaceholder) ?? null;
  const effectiveDongId =
    draft.dongId !== NONE
      ? draft.dongId
      : visibleDongs.length === 0
        ? (placeholderDong?.id ?? null)
        : null;

  const unitsQuery = useQuery({
    queryKey: ["units", site?.id, effectiveDongId],
    queryFn: () => api.units.findAll({ siteId: site!.id, dongId: effectiveDongId! }),
    enabled: Boolean(site && effectiveDongId),
  });
  const units = unitsQuery.data ?? [];
  const unitId = draft.unitId !== NONE ? draft.unitId : null;

  // 그 호에 같은 거래유형의 매물이 이미 있으면 그 매물의 광고다
  const listingsQuery = useQuery({
    queryKey: ["listings", "my-ads-location", site?.id],
    queryFn: () => api.listings.findAll({ siteId: site!.id, limit: 100 }),
    enabled: Boolean(site && unitId),
  });
  const matchingListing: Listing | null = useMemo(
    () =>
      unitId
        ? ((listingsQuery.data?.items ?? []).find(
            (listing) =>
              listing.property?.unitId === unitId &&
              listing.transactionType === draft.transactionType,
          ) ?? null)
        : null,
    [draft.transactionType, listingsQuery.data, unitId],
  );
  const linkedListing = skipListing ? null : matchingListing;

  const isMonthly = draft.transactionType === "monthly";
  const isSale = draft.transactionType === "sale";
  const amountError = (() => {
    if (isSale) {
      const price = parseManwon(draft.price);
      return price && price > 0 ? null : "매매가를 입력해 주세요.";
    }
    const deposit = parseManwon(draft.deposit);
    if (isMonthly) {
      const rent = parseManwon(draft.monthlyRent);
      return deposit != null && rent && rent > 0
        ? null
        : "보증금과 월세를 입력해 주세요.";
    }
    return deposit && deposit > 0 ? null : "전세가를 입력해 주세요.";
  })();
  const problem = !site
    ? "단지를 골라 주세요."
    : !draft.channel
      ? "CP사를 골라 주세요."
      : amountError;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!site) throw new Error("단지를 골라 주세요.");
      // 호까지 골랐으면 우리 사무소의 관리 공간에 건다 (공공 호실에 직접 걸지 않는다)
      const property =
        !linkedListing && unitId
          ? await api.properties.ensure({ siteId: site.id, unitId })
          : null;
      return api.listingAdvertisements.create({
        ...(linkedListing
          ? { listingId: linkedListing.id }
          : property
            ? { propertyId: property.id }
            : { siteId: site.id }),
        transactionType: draft.transactionType,
        channel: draft.channel,
        status: "active",
        advertisedPrice: isSale ? parseManwon(draft.price) : null,
        advertisedDeposit: isSale ? null : parseManwon(draft.deposit),
        advertisedMonthlyRent: isMonthly ? parseManwon(draft.monthlyRent) : null,
        externalAdId: draft.externalAdId.trim() || null,
        naverArticleNo: draft.naverArticleNo.trim() || null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listing-advertisements"] });
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
      void queryClient.invalidateQueries({ queryKey: ["properties"] });
      toast.success(
        linkedListing
          ? "광고를 등록하고 매물에 연결했습니다."
          : "광고를 등록했습니다. 매물은 나중에 연결할 수 있습니다.",
      );
      onClose();
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, "광고를 등록하지 못했습니다. 다시 시도해 주세요.")),
  });

  const money = (key: "price" | "deposit" | "monthlyRent", label: string) => (
    <Row label={label}>
      <div className="relative w-40">
        <Input
          inputMode="numeric"
          value={draft[key]}
          aria-label={label}
          onChange={(event) => {
            const next = sanitizeManwonInput(event.target.value);
            if (next !== null) patch({ [key]: next });
          }}
          className="h-8 pr-10 text-right text-[13px] tabular-nums"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          만원
        </span>
      </div>
    </Row>
  );

  return (
    <>
      <DialogHeader className="border-b px-5 py-4">
        <DialogTitle className="text-[15px]">매물 없이 광고 등록</DialogTitle>
        <DialogDescription className="mt-1 text-xs">
          매물 대신 위치를 고릅니다. 단지는 꼭 고르고, 동 · 호는 아는 만큼만 고르세요.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 overflow-y-auto px-5 py-3">
        <dl className="grid gap-y-1.5">
          <Row label="단지">
            {site ? (
              <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{site.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {site.roadAddress ?? site.jibunAddress ?? ""}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label="단지 다시 고르기"
                  onClick={() => {
                    setSite(null);
                    setSkipListing(false);
                    patch({ dongId: NONE, unitId: NONE });
                  }}
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </span>
            ) : (
              <div className="min-w-0 flex-1">
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    autoFocus
                    value={siteQuery}
                    onChange={(event) => setSiteQuery(event.target.value)}
                    placeholder="단지명 또는 주소"
                    aria-label="단지 찾기"
                    className="h-8 pl-8 text-[13px]"
                  />
                </div>
                {siteQuery.trim() && (
                  <ul className="mt-1 max-h-52 overflow-y-auto rounded-md border">
                    {officeSitesQuery.isLoading || centralSitesQuery.isFetching ? (
                      <li className="px-2.5 py-2 text-xs text-muted-foreground">
                        불러오는 중…
                      </li>
                    ) : siteResults.length === 0 ? (
                      <li className="px-2.5 py-2 text-xs text-muted-foreground">
                        맞는 단지가 없습니다. 관리단지에서 먼저 등록해 주세요.
                      </li>
                    ) : (
                      siteResults.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSite(item);
                              setSiteQuery("");
                            }}
                            className="block w-full px-2.5 py-1.5 text-left hover:bg-[#f7f7f5] focus-visible:bg-[#f7f7f5] focus-visible:outline-none"
                          >
                            <span className="block truncate text-[13px] font-medium">
                              {item.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.roadAddress ?? item.jibunAddress ?? ""}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            )}
          </Row>

          {site && visibleDongs.length > 0 && (
            <Row label="동">
              <Select
                value={draft.dongId}
                onValueChange={(value) => {
                  setSkipListing(false);
                  patch({ dongId: value, unitId: NONE });
                }}
              >
                <SelectTrigger className="h-8 w-40 text-[13px]" aria-label="동">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>모름</SelectItem>
                  {visibleDongs.map((dong) => (
                    <SelectItem key={dong.id} value={dong.id}>
                      {dong.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          )}

          {site && effectiveDongId && (
            <Row label="호 · 층">
              <Select
                value={draft.unitId}
                onValueChange={(value) => {
                  setSkipListing(false);
                  patch({ unitId: value });
                }}
              >
                <SelectTrigger className="h-8 w-40 text-[13px]" aria-label="호 또는 층">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>모름</SelectItem>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {formatUnitLabel(unit) || "이름 없음"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {unitsQuery.isFetching && (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              )}
            </Row>
          )}

          <Row label="거래">
            <div className="flex gap-1">
              {TRANSACTION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={draft.transactionType === option.value}
                  onClick={() => {
                    setSkipListing(false);
                    patch({ transactionType: option.value });
                  }}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    draft.transactionType === option.value
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-foreground/[0.05]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Row>

          {matchingListing && (
            <Row label="매물">
              <button
                type="button"
                aria-pressed={!skipListing}
                onClick={() => setSkipListing((current) => !current)}
                className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[13px] hover:bg-[#f7f7f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                    !skipListing && "border-foreground bg-foreground text-background",
                  )}
                >
                  {!skipListing && <Check aria-hidden="true" className="size-3" />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <PropertyTableTransactionBadge
                      transactionType={matchingListing.transactionType}
                    />
                    <span className="tabular-nums">
                      {manualAdListingPriceLabel(matchingListing)}
                    </span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    이 호에 등록된 매물입니다. 이 매물의 광고로 저장합니다.
                  </span>
                </span>
              </button>
            </Row>
          )}

          <Row label="CP사">
            <Select
              value={draft.channel || undefined}
              onValueChange={(value) => patch({ channel: value })}
            >
              <SelectTrigger className="h-8 w-40 text-[13px]" aria-label="CP사">
                <SelectValue placeholder="고르기" />
              </SelectTrigger>
              <SelectContent>
                {naverCpChannels.map((channel) => (
                  <SelectItem key={channel.value} value={channel.value}>
                    {channel.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          {isSale ? money("price", "매매가") : money("deposit", isMonthly ? "보증금" : "전세가")}
          {isMonthly && money("monthlyRent", "월세")}

          <Row label="CP 광고번호">
            <Input
              value={draft.externalAdId}
              onChange={(event) => patch({ externalAdId: event.target.value })}
              aria-label="CP 광고번호"
              className="h-8 w-40 text-[13px] tabular-nums"
            />
          </Row>
          <Row label="네이버 번호">
            <Input
              value={draft.naverArticleNo}
              onChange={(event) => patch({ naverArticleNo: event.target.value })}
              aria-label="네이버 매물번호"
              placeholder="적어 두면 비교를 읽을 수 있음"
              className="h-8 w-56 text-[13px] tabular-nums"
            />
          </Row>
        </dl>
      </div>

      <DialogFooter className="items-center border-t px-5 py-3 sm:justify-between">
        <p className="min-w-0 text-xs text-muted-foreground">
          {problem ??
            (linkedListing
              ? "매물까지 연결됩니다."
              : unitId
                ? "호실까지 연결됩니다. 매물은 나중에 이을 수 있습니다."
                : "건물까지만 연결됩니다.")}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saveMutation.isPending}
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={Boolean(problem) || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            등록
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start">
      <dt className="flex min-h-8 items-center text-[13px] text-muted-foreground">
        {label}
      </dt>
      <dd className="flex min-h-8 min-w-0 items-center gap-2">{children}</dd>
    </div>
  );
}
