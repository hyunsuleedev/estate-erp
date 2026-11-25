/**
 * 내광고관리 옆 상세 패널.
 * 매물관리 · 희망매물 · 문서관리의 상세 패널과 같은 방식으로 열린다: 표 위에 오른쪽에서 미끄러져 나오고,
 * 맨 위 줄은 같은 도구 줄(닫기 » · 새 탭으로 확장 ⤢)이다. 광고에는 전용 전체 화면이 없어, 확장은
 * 그 광고의 매물(관리 공간) 화면을 연다. 이어진 곳이 없는 광고는 확장 버튼이 없다. Esc로 닫는다.
 *
 * 목록의 한 줄로는 보이지 않는 것을 여기서 본다: 광고가 어디까지 이어졌는지, 걸어 둔 요청,
 * 그리고 흐름(가격 · 게재/종료 · 재광고 · 그때그때의 네이버 순위).
 */
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type {
  ListingAdvertisementTimeline,
  ListingAdvertisementWithListing,
} from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  formatDateTime,
  formatMoney,
  formatRelativeDay,
  formatRelativeDayTime,
  formatRent,
} from "@/lib/format";
import { PropertyInspectorToolbar } from "../-components/property-inspector-view";
import { PropertyTableTransactionBadge } from "./my-ads-cells";
import {
  ADVERTISEMENT_LINK_DETAILS,
  ADVERTISEMENT_LINK_LABELS,
  CHANGE_REQUEST_STATUS_LABELS,
  advertisementLinkLevel,
  advertisementPlace,
  advertisementRawLocationLabel,
  advertisementSite,
  advertisementTransactionType,
  changeRequestSummary,
  pendingChangeRequests,
} from "./my-ads-link";
import {
  advertisementPriceLabel,
  advertisementSyncState,
  cpChannelLabel,
  resolvedNaverUrl,
} from "./my-ads-format";
import { MY_ADS_INSPECTOR_ID, advertisementLocationLabel } from "./my-ads-location";
import {
  PROPERTY_TABLE_PILL_TONES,
  PROPERTY_TABLE_STATUS_DOT_CLASS_NAME,
  PROPERTY_TABLE_STATUS_PILL_CLASS_NAME,
} from "./my-ads-pill";
import { useInspectorOutsideClose } from "@/hooks/use-inspector-outside-close";

/** 다른 상세 패널의 Esc 규칙과 같다: 떠 있는 창 · 메뉴가 있으면 그쪽이 먼저 닫힌다 */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

export const MY_ADS_INSPECTOR_WIDTH = 480;

const empty = <span className="text-muted-foreground">비어 있음</span>;

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[34px] grid-cols-[104px_minmax(0,1fr)] items-start gap-2 py-[6.5px]">
      <dt className="text-[14px] leading-[21px] text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] leading-[21px] text-foreground">
        {children}
      </dd>
    </div>
  );
}

const CHANGE_LABELS: Record<string, string> = {
  cheaper_appeared: "더 싼 광고가 생김",
  cheaper_gone: "더 싼 광고가 없어짐",
  own_hidden: "내 광고가 네이버에서 안 보임",
  own_restored: "내 광고가 다시 보임",
  floor_disadvantage: "경쟁 광고가 정확한 층을 공개",
  rank_changed: "순위가 바뀜",
};

type TimelineEntry = {
  id: string;
  at: string;
  title: string;
  detail: string | null;
  /** 눈여겨볼 변화(알림으로도 나가는 것)는 색을 준다 */
  tone: "plain" | "warn";
};

function termsLabel(
  transactionType: string | null,
  row: {
    advertisedPrice: number | null;
    advertisedDeposit: number | null;
    advertisedMonthlyRent: number | null;
  },
): string {
  if (transactionType === "monthly") {
    return formatRent(row.advertisedDeposit, row.advertisedMonthlyRent);
  }
  return formatMoney(
    transactionType === "jeonse"
      ? (row.advertisedDeposit ?? row.advertisedPrice)
      : row.advertisedPrice,
  );
}

/**
 * 광고 이력 · 비교 기록 · 변경 요청을 한 줄기로 엮는다. 최근 것이 위에 온다.
 */
export function buildAdvertisementTimeline(
  timeline: ListingAdvertisementTimeline,
  transactionType: string | null,
): TimelineEntry[] {
  const entries: Array<TimelineEntry & { createdAtMs: number }> = [];
  timeline.histories.forEach((row, index) => {
    const previous = index > 0 ? timeline.histories[index - 1] : null;
    const terms = termsLabel(transactionType, row);
    const changes: string[] = [];
    if (!previous) {
      changes.push(row.status === "ended" ? "종료된 광고로 처음 기록" : "처음 기록");
    } else {
      if (previous.status !== row.status) {
        changes.push(row.status === "ended" ? "종료" : "다시 게재");
      }
      if (
        previous.naverArticleNo !== row.naverArticleNo &&
        row.naverArticleNo
      ) {
        changes.push(previous.naverArticleNo ? "재광고" : "네이버 번호 확인");
      }
      const previousTerms = termsLabel(transactionType, previous);
      if (previousTerms !== terms) changes.push(`가격 ${previousTerms} → ${terms}`);
    }
    if (changes.length === 0) return;
    entries.push({
      id: `h-${row.id}`,
      at: row.observedAt,
      createdAtMs: new Date(row.createdAt).getTime(),
      title: changes.join(" · "),
      detail:
        [
          !previous || changes.every((change) => !change.startsWith("가격"))
            ? terms
            : null,
          row.naverArticleNo && changes.some((c) => c === "재광고" || c === "네이버 번호 확인")
            ? `네이버 ${row.naverArticleNo}`
            : null,
          row.source === "manual" ? "직접 기록" : row.source === "cp_sync" ? "CP 수집" : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      tone: "plain",
    });
  });
  for (const record of timeline.comparisonRecords) {
    const rank = record.ownVisible
      ? record.ownRanking != null
        ? `${record.ownRanking}위 / ${record.totalCount}건`
        : `순위 미확인 / ${record.totalCount}건`
      : "네이버 미노출";
    const noted = record.changes.filter((change) => change !== "rank_changed");
    entries.push({
      id: `r-${record.id}`,
      at: record.observedAt,
      createdAtMs: new Date(record.observedAt).getTime(),
      title: noted.length
        ? noted.map((change) => CHANGE_LABELS[change] ?? change).join(" · ")
        : `네이버 비교 ${rank}`,
      detail:
        [
          noted.length ? rank : null,
          record.lowerPricedCount > 0 ? `더 싼 광고 ${record.lowerPricedCount}건` : null,
          record.lowestCompetitorAmount != null
            ? `경쟁 최저 ${formatMoney(record.lowestCompetitorAmount)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      tone: noted.some((change) =>
        ["cheaper_appeared", "own_hidden", "floor_disadvantage"].includes(change),
      )
        ? "warn"
        : "plain",
    });
  }
  for (const request of timeline.changeRequests ?? []) {
    const statusLabel = CHANGE_REQUEST_STATUS_LABELS[request.status] ?? request.status;
    entries.push({
      id: `cr-${request.id}`,
      at: request.verifiedAt ?? request.executedAt ?? request.createdAt,
      createdAtMs: new Date(request.createdAt).getTime(),
      title: `${changeRequestSummary(request as never)} · ${statusLabel}`,
      detail:
        [
          request.failureReason ? `사유: ${request.failureReason}` : null,
          request.assignedTo?.name ? `담당 ${request.assignedTo.name}` : null,
          request.memo?.trim() || null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      tone: request.status === "failed" ? "warn" : "plain",
    });
  }
  return entries
    .sort((left, right) => {
      const diff = new Date(right.at).getTime() - new Date(left.at).getTime();
      if (diff !== 0) return diff;
      return right.createdAtMs - left.createdAtMs;
    })
    .map(({ createdAtMs: _c, ...entry }) => entry);
}

export function MyAdsPeek({
  advertisement,
  closing,
  animate,
  onClose,
  onExited,
  onOpenProperty,
  onOpenLink,
}: {
  advertisement: ListingAdvertisementWithListing;
  /** 닫히는 중: 미끄러져 나간 뒤 onExited가 불린다 */
  closing: boolean;
  /** 미끄러지는 움직임을 쓸지 (키보드로 열고 닫을 때는 쓰지 않는다) */
  animate: boolean;
  onClose: (animate?: boolean) => void;
  onExited: () => void;
  /** 그 광고의 매물(관리 공간) 화면을 새 탭으로 연다 */
  onOpenProperty: (propertyId: string) => void;
  /** 매물과 이어지지 않은 광고의 연결 창을 연다 */
  onOpenLink: (advertisement: ListingAdvertisementWithListing) => void;
}) {
  const place = advertisementPlace(advertisement);
  const level = advertisementLinkLevel(advertisement);
  const transactionType = advertisementTransactionType(advertisement);
  const rawLocation = advertisementRawLocationLabel(advertisement);
  const requests = pendingChangeRequests(advertisement);
  const comparison = advertisement.comparison ?? null;
  const title = advertisementLocationLabel(advertisement);

  const timelineQuery = useQuery({
    // 광고가 고쳐지면(목록이 새로 오면) 흐름도 다시 받는다
    queryKey: ["listing-advertisements", "timeline", advertisement.id, advertisement.updatedAt],
    queryFn: () => api.listingAdvertisements.timeline(advertisement.id),
  });
  const entries = useMemo(
    () =>
      timelineQuery.data
        ? buildAdvertisementTimeline(timelineQuery.data, transactionType)
        : [],
    [timelineQuery.data, transactionType],
  );

  const expand = place
    ? () => {
        onOpenProperty(place.id);
        onClose(false);
      }
    : undefined;

  useEffect(() => {
    if (!closing) return;
    // 숨은 탭이나 모션 줄이기 설정에서는 transitionend가 오지 않을 수 있다.
    const timer = window.setTimeout(
      onExited,
      !animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240,
    );
    return () => window.clearTimeout(timer);
  }, [closing, animate, onExited]);

  // 패널 밖을 누르면 닫는다 (떠 있는 창 · 줄의 열기 단추는 밖이 아니다)
  useInspectorOutsideClose(() => onClose());

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      event.preventDefault();
      onClose(false);
    };
    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () => window.removeEventListener("keydown", handleWindowKeyDown, true);
  }, [onClose]);

  return (
    <aside
      id={MY_ADS_INSPECTOR_ID}
      data-my-ads-peek
      data-property-inspector
      data-state={closing ? "closed" : "open"}
      data-motion={animate ? "slide" : "none"}
      inert={closing}
      aria-hidden={closing || undefined}
      aria-label="광고 상세 패널"
      className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col border-l border-border bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.03)]"
      style={{ width: MY_ADS_INSPECTOR_WIDTH, maxWidth: "100%" }}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === "transform") {
          onExited();
        }
      }}
    >
      <PropertyInspectorToolbar
        onClose={onClose}
        onOpenNewTab={expand}
        showExpand={Boolean(expand)}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-3">
        <p className="text-[13px] leading-5 text-muted-foreground">
          {cpChannelLabel(advertisement.channel)} 광고
        </p>
        <h2 className="mt-0.5 break-keep text-[22px] font-bold leading-[1.3] tracking-[-0.01em] text-foreground">
          {title}
        </h2>

        <dl className="mt-4">
          <Property label="연결">
            <span
              className={cn(
                PROPERTY_TABLE_STATUS_PILL_CLASS_NAME,
                level === "listing"
                  ? PROPERTY_TABLE_PILL_TONES.success
                  : level === "property"
                    ? PROPERTY_TABLE_PILL_TONES.warning
                    : PROPERTY_TABLE_PILL_TONES.danger,
              )}
            >
              <span className={PROPERTY_TABLE_STATUS_DOT_CLASS_NAME} />
              {ADVERTISEMENT_LINK_LABELS[level]}
            </span>
            {level === "listing" && place ? (
              <Link
                to="/properties/$id"
                params={{ id: place.id }}
                className="text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                매물 열기
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onOpenLink(advertisement)}
                className="rounded-sm text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                매물 연결
              </button>
            )}
            {level !== "listing" && (
              <span className="basis-full text-[13px] text-muted-foreground">
                {ADVERTISEMENT_LINK_DETAILS[level]}
              </span>
            )}
          </Property>
          {rawLocation && (
            <Property label="CP 표기">
              <span className="text-muted-foreground">{rawLocation}</span>
            </Property>
          )}
          <Property label="거래">
            {transactionType ? (
              <PropertyTableTransactionBadge transactionType={transactionType} />
            ) : (
              empty
            )}
          </Property>
          <Property label="광고가">
            <span className="font-medium tabular-nums">
              {advertisementPriceLabel(advertisement)}
            </span>
          </Property>
          <Property label="게재">
            {advertisement.status === "ended" ? (
              <>
                종료
                {advertisement.endedAt && (
                  <span className="tabular-nums text-muted-foreground">
                    {formatRelativeDay(advertisement.endedAt)}
                  </span>
                )}
              </>
            ) : (
              <>
                게재 중
                {advertisement.startedAt && (
                  <span className="tabular-nums text-muted-foreground">
                    {formatRelativeDay(advertisement.startedAt)}부터
                  </span>
                )}
              </>
            )}
          </Property>
          <Property label="동기화">
            {(() => {
              const syncState = advertisementSyncState(advertisement);
              if (syncState === "manual") {
                return (
                  <>
                    직접 기록
                    <span className="text-[13px] text-muted-foreground">
                      아직 CP 스냅샷과 연동되지 않았습니다
                    </span>
                  </>
                );
              }
              if (syncState === "manual_override") {
                return (
                  <>
                    직접 수정됨
                    <span className="text-[13px] text-muted-foreground">
                      최근 동기화 이후 직접 수정했습니다
                    </span>
                  </>
                );
              }
              return "CP 연동";
            })()}
          </Property>
          {advertisement.cpAccount && (
            <Property label="CP 계정">
              <span>
                {advertisement.cpAccount.accountName
                  ? `${advertisement.cpAccount.accountName} (${advertisement.cpAccount.accountKey})`
                  : advertisement.cpAccount.accountKey}
              </span>
            </Property>
          )}
          <Property label="CP 광고번호">
            {advertisement.externalAdId ? (
              <span className="tabular-nums">{advertisement.externalAdId}</span>
            ) : (
              empty
            )}
          </Property>
          <Property label="네이버 번호">
            {(() => {
              const naverUrl = resolvedNaverUrl(advertisement);
              if (!advertisement.naverArticleNo) return empty;
              return naverUrl ? (
                <a
                  href={naverUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tabular-nums underline-offset-2 hover:underline"
                >
                  {advertisement.naverArticleNo}
                </a>
              ) : (
                <span className="tabular-nums">{advertisement.naverArticleNo}</span>
              );
            })()}
          </Property>
          <Property label="네이버 비교">
            {comparison?.ownAdvertisement ? (
              <>
                <span className="tabular-nums">
                  {comparison.ownAdvertisement.isActive
                    ? comparison.ownAdvertisement.ranking != null
                      ? `${comparison.ownAdvertisement.ranking}위`
                      : "순위 미확인"
                    : "미노출"}
                  {" / "}
                  {comparison.advertisements.filter((row) => row.isActive).length}건
                </span>
                {comparison.observedAt && (
                  <span className="text-[13px] tabular-nums text-muted-foreground">
                    {formatRelativeDayTime(comparison.observedAt)} 읽음
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">아직 읽지 않음</span>
            )}
          </Property>
          <Property label="요청">
            {requests.length === 0 ? (
              <span className="text-muted-foreground">걸어 둔 요청 없음</span>
            ) : (
              <ul className="min-w-0">
                {requests.map((request) => (
                  <li key={request.id} className="tabular-nums">
                    {changeRequestSummary(request)}
                    <span className="ml-1.5 text-[12px] text-muted-foreground">
                      {CHANGE_REQUEST_STATUS_LABELS[request.status] ?? request.status}
                    </span>
                    {request.fulfilled === true && (
                      <span className="ml-1.5 text-[13px] text-success">반영됨</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Property>
        </dl>

        <section className="mt-5 border-t border-border pt-4">
          <h3 className="text-[14px] font-semibold text-foreground">메모</h3>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-[21px] text-foreground">
            {advertisement.memo?.trim() || empty}
          </p>
        </section>

        <section className="mt-5 border-t border-border pt-4" data-my-ads-timeline>
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
            흐름
            {entries.length > 0 && (
              <span className="font-normal tabular-nums text-muted-foreground">
                {entries.length}
              </span>
            )}
          </h3>
          {timelineQuery.isLoading ? (
            <p className="mt-1.5 text-[14px] text-muted-foreground">불러오는 중…</p>
          ) : timelineQuery.isError ? (
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              흐름을 불러오지 못했습니다.{" "}
              <button
                type="button"
                onClick={() => void timelineQuery.refetch()}
                className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                다시 시도
              </button>
            </p>
          ) : entries.length === 0 ? (
            <p className="mt-1.5 text-[14px] text-muted-foreground">기록이 없습니다.</p>
          ) : (
            <ol className="mt-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="grid grid-cols-[86px_minmax(0,1fr)] gap-2 border-b border-border/60 py-1.5 last:border-b-0"
                >
                  <time
                    dateTime={entry.at}
                    title={formatDateTime(entry.at)}
                    className="pt-px text-[13px] tabular-nums leading-[21px] text-muted-foreground"
                  >
                    {formatRelativeDay(entry.at)}
                  </time>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-[14px] leading-[21px]",
                        entry.tone === "warn" ? "font-medium text-warning" : "text-foreground",
                      )}
                    >
                      {entry.title}
                    </p>
                    {entry.detail && (
                      <p className="text-[13px] tabular-nums leading-5 text-muted-foreground">
                        {entry.detail}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </aside>
  );
}
