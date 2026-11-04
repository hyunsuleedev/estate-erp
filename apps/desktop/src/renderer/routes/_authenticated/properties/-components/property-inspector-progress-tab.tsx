import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowUpRight, Check, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { ApiError, type CalendarEvent, type Deal, type Match } from "@estate-erp/api-client";
import {
  DealStage,
  formatPrice,
  MATCH_CLOSED_REASON_LABELS,
  MatchStage,
  normalizeDealStage,
  normalizeMatchStage,
  type MatchClosedReason,
} from "@estate-erp/shared";
import { StatusBadge } from "@/components/domain";
import { api } from "@/lib/api";
import { formatPhoneNumber } from "@/lib/contacts";
import { cn } from "@/lib/utils";
import { MatchCreateDialog } from "../../wanted-properties/-match-create-dialog";
import { MatchConvertDialog } from "../../wanted-properties/-match-convert-dialog";
import {
  MatchProgressTrack,
  type MatchProgressActions,
} from "../../wanted-properties/-match-board";
import {
  buildViewingCalendarEventPayload,
  formatRequirementSummary,
  formatViewingEventTime,
  getActiveDealLink,
  getBuyerRequirementSummaryParts,
  getDealStageLabel,
  getMatchKpis,
  getMatchStageBlockReason,
  getMatchStageLabel,
  getUpcomingViewingEvent,
  matchStageOrder,
  shouldMoveToViewingOnSchedule,
  toCalendarEventUpdatePayload,
} from "../../wanted-properties/-match-view-utils";
import {
  formatPaymentKind,
  getDaysUntil,
  getDealPipelineHealth,
  getDealStageAgeDays,
  type DealPayment,
} from "../../deals/-deal-view-utils";
import {
  EmptyText,
  InlineMemoField,
  RetryNote,
  SectionTitle,
  TextAction,
} from "./property-inspector-view";
import { saveViewingSchedule, ViewingStageMoveError } from "./inspector-viewing-schedule";

/*
 * 매물 상세 패널 "매칭·거래" 탭.
 * - 매칭: 희망매물 페이지와 같은 진행 트랙(MatchProgressTrack)으로 단계 변경·방문 일정을
 *   바로 처리하고, 매칭 메모도 그 자리에서 고친다.
 * - 거래: 거래 단계와 돈이 오가는 시점(가계약금·계약금·중도금·잔금)을 한 흐름으로 보여준다.
 *   거래 단계 변경은 거래관리(/deals)가 소유하므로 여기서는 읽기 전용이고 이동만 연결한다.
 */

type TypeMeta = (transactionType: string) => { label: string; className: string };

export function PropertyInspectorProgressTab({
  listingIds,
  matches,
  matchesStatus,
  onRetryMatches,
  onOpenMatch,
  onOpenDeal,
  typeMeta,
}: {
  /** 이 의뢰의 거래 조건(Listing) id */
  listingIds: string[];
  /** 이 의뢰의 거래 조건에 연결된 매칭 */
  matches: Match[];
  matchesStatus: "loading" | "error" | "ready";
  onRetryMatches: () => void;
  onOpenMatch: (matchId: string) => void;
  onOpenDeal: (dealId: string) => void;
  typeMeta: TypeMeta;
}) {
  // 거래관리 페이지와 같은 쿼리(캐시 공유). 지급 일정(payments)까지 담겨 있다.
  const dealsQuery = useQuery({
    queryKey: ["deals"],
    queryFn: () => api.deals.findAll(),
  });
  const listingIdSet = new Set(listingIds);
  const deals = (dealsQuery.data ?? [])
    .filter((deal) => deal.listingId && listingIdSet.has(deal.listingId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  // 본계약 전(계약 준비·가계약) 거래: 그 거래 조건의 다른 손님 매칭에 "거래 진행 중"을 알린다.
  const preContractDealByListing = new Map<string, Deal>();
  for (const deal of deals) {
    const stage = normalizeDealStage(deal.stage);
    if (
      !deal.isCancelled &&
      deal.listingId &&
      (stage === DealStage.PREPARING || stage === DealStage.PRE_CONTRACT)
    ) {
      preContractDealByListing.set(deal.listingId, deal);
    }
  }

  return (
    <div className="space-y-8">
      <MatchSection
        listingIds={listingIds}
        matches={matches}
        status={matchesStatus}
        onRetry={onRetryMatches}
        onOpenMatch={onOpenMatch}
        preContractDealByListing={preContractDealByListing}
      />
      <DealSection
        deals={deals}
        isLoading={dealsQuery.isLoading}
        isError={dealsQuery.isError}
        onRetry={() => void dealsQuery.refetch()}
        onOpenDeal={onOpenDeal}
        typeMeta={typeMeta}
      />
    </div>
  );
}

// ── 매칭 ────────────────────────────────────────────────────────────────

function getMatchStageRank(stage: string) {
  return matchStageOrder.indexOf(
    normalizeMatchStage(stage) as (typeof matchStageOrder)[number],
  );
}

function MatchSection({
  listingIds,
  matches,
  status,
  onRetry,
  onOpenMatch,
  preContractDealByListing,
}: {
  listingIds: string[];
  matches: Match[];
  status: "loading" | "error" | "ready";
  onRetry: () => void;
  onOpenMatch: (matchId: string) => void;
  preContractDealByListing: Map<string, Deal>;
}) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [convertMatchId, setConvertMatchId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  // 이 화면에서 저장한 방문 일정 (매칭 id → 일정 id). 캐시가 덮어써져도 다시 시도할 때 같은 일정을 고친다.
  const savedViewingEventIds = useRef(new Map<string, string>());

  // 매칭 목록을 다시 받을 때까지 기다린다. 기다리지 않으면 저장 직후 예전 값이 잠깐 다시 보이고,
  // 바로 이어 고칠 때 오래된 updatedAt으로 충돌(409)하며, 방문 일정을 다시 잡을 때
  // 이미 만든 일정을 못 보고 또 만든다. 부수 목록은 기다리지 않는다.
  const refreshRelated = async () => {
    for (const key of ["listing-intakes", "buyer-requirements", "brokerage-cases"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
    await queryClient.invalidateQueries({ queryKey: ["matches"] });
  };

  /** 매칭 목록 캐시(배열 형태)의 해당 매칭에 방문 일정을 넣거나 같은 id면 바꾼다 (화면 표시용). */
  const putViewingEventInCache = async (matchId: string, event: CalendarEvent) => {
    // 진행 중이던 이전 조회 응답이 방금 넣은 일정을 덮어쓰지 않게 먼저 취소한다.
    await queryClient.cancelQueries({ queryKey: ["matches"] });
    queryClient.setQueriesData({ queryKey: ["matches"] }, (data: unknown) => {
      if (!Array.isArray(data)) return data;
      return (data as Match[]).map((item) =>
        item?.id === matchId
          ? {
              ...item,
              calendarEvents: [
                ...(item.calendarEvents ?? []).filter((existing) => existing.id !== event.id),
                event,
              ],
            }
          : item,
      );
    });
  };

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.matches.updateStage(id, { stage }),
    onSuccess: async (_, { stage }) => {
      toast.success(
        stage === MatchStage.CLOSED
          ? "매칭을 종료했습니다."
          : `${getMatchStageLabel(stage)} 단계로 변경했습니다.`,
      );
      await refreshRelated();
    },
    onError: (error: Error) => toast.error(error.message || "단계 변경에 실패했습니다."),
  });

  const memoMutation = useMutation({
    mutationFn: ({ match, memo }: { match: Match; memo: string | null }) =>
      api.matches.updateMemo(match.id, { memo, expectedUpdatedAt: match.updatedAt }),
    // 저장 응답만으로 끝내지 않고 목록을 다시 받은 뒤 끝낸다(메모 칸은 그때 저장 중 표시를 푼다).
    onSuccess: () => refreshRelated(),
    onError: async (error: Error) => {
      toast.error(error.message || "매칭 메모 저장에 실패했습니다.");
      // 충돌이면 최신 updatedAt을 받아 둬야 다시 저장할 수 있다.
      await refreshRelated();
    },
  });

  const viewingMutation = useMutation({
    mutationFn: async ({ match, startLocalValue }: { match: Match; startLocalValue: string }) => {
      const blockReason = getMatchStageBlockReason(match, MatchStage.VIEWING);
      if (blockReason) throw new Error(blockReason);
      const payload = buildViewingCalendarEventPayload(match, startLocalValue);
      let savedEvent: CalendarEvent | null = null;
      try {
        await saveViewingSchedule({
          matchId: match.id,
          upcomingEventId: getUpcomingViewingEvent(match)?.id ?? null,
          savedEventIds: savedViewingEventIds.current,
          create: () => api.calendarEvents.create(payload),
          update: (eventId) =>
            api.calendarEvents.update(eventId, toCalendarEventUpdatePayload(payload)),
          isNotFound: (error) => error instanceof ApiError && error.statusCode === 404,
          onSaved: (event) => {
            savedEvent = event;
          },
          moveStage: shouldMoveToViewingOnSchedule(match.stage)
            ? () => api.matches.updateStage(match.id, { stage: MatchStage.VIEWING })
            : null,
        });
      } finally {
        if (savedEvent) await putViewingEventInCache(match.id, savedEvent);
      }
    },
    onSuccess: () => toast.success("방문 일정을 저장했습니다."),
    onError: (error: Error) =>
      toast.error(
        error instanceof ViewingStageMoveError
          ? error.message
          : `방문 일정 저장에 실패했습니다: ${error.message}`,
      ),
    // 성공·실패 모두 다시 받는다: 일정만 저장되고 단계 변경이 실패해도 새 일정이 매칭에 반영돼야
    // 다시 시도할 때 기존 일정을 고친다. 다시 받는 동안은 진행 트랙이 잠겨 있다(isScheduling).
    onSettled: async () => {
      void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      await refreshRelated();
    },
  });

  const actions: MatchProgressActions = {
    isUpdating: stageMutation.isPending,
    isScheduling: viewingMutation.isPending,
    onStageChange: (id, stage) => {
      const match = matches.find((candidate) => candidate.id === id);
      const blockReason = match ? getMatchStageBlockReason(match, stage) : null;
      if (blockReason) {
        toast.error("단계 이동 전 확인이 필요합니다.", { description: blockReason });
        return;
      }
      // 거래 전환은 거래 생성 대화상자를 거친다 (희망매물 페이지와 같은 흐름).
      if (stage === MatchStage.DEAL_CREATED) {
        setConvertMatchId(id);
        return;
      }
      stageMutation.mutate({ id, stage });
    },
    onScheduleViewing: (match, startLocalValue) =>
      viewingMutation.mutate({ match, startLocalValue }),
  };

  // 진행 중(뒤 단계일수록 위) → 거래 전환 → 종료 순. 종료는 접어 둔다.
  const sorted = matches
    .slice()
    .sort((a, b) => getMatchStageRank(b.stage) - getMatchStageRank(a.stage));
  const isClosed = (match: Match) => normalizeMatchStage(match.stage) === MatchStage.CLOSED;
  const openMatches = sorted.filter((match) => !isClosed(match));
  const closedMatches = sorted.filter(isClosed);
  const kpis = getMatchKpis(matches);
  const summary = [
    kpis.active > 0 ? `진행 ${kpis.active}` : null,
    kpis.converted > 0 ? `거래 전환 ${kpis.converted}` : null,
    kpis.closed > 0 ? `종료 ${kpis.closed}` : null,
  ].filter(Boolean);
  const convertMatch = matches.find((match) => match.id === convertMatchId) ?? null;

  const renderCard = (match: Match) => (
    <MatchCard
      key={match.id}
      match={match}
      pendingDeal={preContractDealByListing.get(match.listingId) ?? null}
      actions={actions}
      onOpen={() => onOpenMatch(match.id)}
      onSaveMemo={async (memo) => {
        await memoMutation.mutateAsync({ match, memo: memo || null });
      }}
    />
  );

  return (
    <section>
      <SectionTitle
        action={<TextAction icon={<Plus />} label="매칭 추가" onClick={() => setCreateOpen(true)} />}
      >
        매칭
        {matches.length > 0 && <span className="font-medium text-[#a9a7a1]">{matches.length}</span>}
        {summary.length > 0 && (
          <span className="text-[12px] font-normal text-muted-foreground">· {summary.join(" · ")}</span>
        )}
      </SectionTitle>

      {status === "error" && <RetryNote onRetry={onRetry}>매칭을 불러오지 못했습니다.</RetryNote>}
      {status === "loading" && matches.length === 0 ? (
        <EmptyText>매칭을 불러오는 중…</EmptyText>
      ) : status === "ready" && matches.length === 0 ? (
        <EmptyText>이 매물에 매칭된 손님이 없습니다. 조건이 맞는 손님을 매칭해 보세요.</EmptyText>
      ) : (
        <>
          <div className="divide-y divide-[#f1f0ec]">{openMatches.map(renderCard)}</div>
          {closedMatches.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                aria-expanded={showClosed}
                onClick={() => setShowClosed((value) => !value)}
                className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", showClosed && "rotate-180")} />
                종료된 매칭 {closedMatches.length}건 {showClosed ? "접기" : "보기"}
              </button>
              {showClosed && (
                <div className="divide-y divide-[#f1f0ec] opacity-70">{closedMatches.map(renderCard)}</div>
              )}
            </div>
          )}
        </>
      )}

      <MatchCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        matches={matches}
        scope={{ kind: "listing", listingIds }}
      />
      <MatchConvertDialog
        match={convertMatch}
        open={convertMatchId !== null}
        onOpenChange={(open) => {
          if (!open) setConvertMatchId(null);
        }}
      />
    </section>
  );
}

function MatchCard({
  match,
  pendingDeal,
  actions,
  onOpen,
  onSaveMemo,
}: {
  match: Match;
  /** 이 거래 조건에서 본계약 전인 다른 손님 거래 */
  pendingDeal: Deal | null;
  actions: MatchProgressActions;
  onOpen: () => void;
  onSaveMemo: (memo: string) => Promise<void>;
}) {
  const buyer = match.buyerRequirement;
  const name = buyer?.contact?.name ?? "구매자 미상";
  const phone = buyer?.contact?.phone ?? null;
  const upcoming = getUpcomingViewingEvent(match);
  const areaText = buyer ? getBuyerRequirementSummaryParts(buyer).areaText : null;
  const stage = normalizeMatchStage(match.stage);
  // 거래로 넘어간 매칭은 거래 단계가 아래 "거래" 흐름에 이미 있으므로 한 줄로 줄인다.
  const convertedDeal = stage === MatchStage.DEAL_CREATED ? getActiveDealLink(match) : null;
  const closedReasonLabel =
    stage === MatchStage.CLOSED && match.closedReason
      ? (MATCH_CLOSED_REASON_LABELS[match.closedReason as MatchClosedReason] ?? null)
      : null;
  // 다른 손님과 계약 준비·가계약 중이면 알린다 (본계약하면 이 매칭은 자동 종료된다).
  const waitingBehindDeal =
    pendingDeal &&
    pendingDeal.matchId !== match.id &&
    stage !== MatchStage.CLOSED &&
    stage !== MatchStage.DEAL_CREATED
      ? pendingDeal
      : null;
  const conditions = [
    formatRequirementSummary(match),
    areaText && areaText !== "—" ? areaText : null,
    buyer?.moveInDate ? `입주 ${formatMonthDay(buyer.moveInDate)}` : null,
  ].filter(Boolean);

  return (
    <article className="py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#f1f0ec] text-[12px] font-semibold text-muted-foreground">
          {name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-[#2f2e2a]">{name}</span>
            {buyer?.urgency && <StatusBadge kind="buyerUrgency" status={buyer.urgency} size="sm" />}
            {phone && (
              <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                {formatPhoneNumber(phone)}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{conditions.join(" · ")}</div>
        </div>
        {closedReasonLabel ? (
          <span className="shrink-0 pt-0.5 text-[12px] text-muted-foreground">종료 · {closedReasonLabel}</span>
        ) : upcoming ? (
          <span className="shrink-0 pt-0.5 text-[12px] font-medium tabular-nums text-[#4b3f72]">
            방문 {formatViewingEventTime(upcoming)}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${name} 매칭 상세 열기`}
          title="희망매물 페이지에서 열기"
          className="inline-grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
        >
          <ArrowUpRight className="size-3.5" />
        </button>
      </div>
      {waitingBehindDeal && (
        <div
          data-inspector-match-waiting
          className="mt-2 flex items-center gap-1.5 rounded-md bg-[#fbf6ea] px-2.5 py-1.5 text-[12px] text-[#8a5a12]"
        >
          <AlertCircle className="size-3.5 shrink-0" />
          <span className="truncate">
            {waitingBehindDeal.buyerContact?.name ?? "다른 손님"}님과 거래 진행 중 · 본계약하면 이 매칭은 자동 종료됩니다
          </span>
        </div>
      )}
      {convertedDeal ? (
        <div className="mt-2.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#e9f2ec] px-1.5 py-0.5 font-medium leading-5 text-[#3f7a57]">
            <Check className="size-3" />
            매칭 완료
          </span>
          → 거래 진행 중 · {getDealStageLabel(convertedDeal.stage)}
        </div>
      ) : (
        /* 희망매물 페이지와 같은 진행 트랙: 단계를 눌러 바꾸고 방문 일정을 잡는다 */
        <div data-inspector-match-track className="mt-2.5 overflow-x-auto pb-0.5">
          <MatchProgressTrack match={match} actions={actions} />
        </div>
      )}
      <div className="-mx-2 mt-1">
        <InlineMemoField
          label={`${name} 매칭`}
          value={match.memo?.trim() || null}
          emptyText="매칭 메모 추가"
          onSave={onSaveMemo}
        />
      </div>
    </article>
  );
}

// ── 거래 흐름 ────────────────────────────────────────────────────────────

function formatMonthDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function formatDealPrice(deal: Deal) {
  if (deal.transactionType === "monthly") {
    return `${deal.agreedDeposit != null ? formatPrice(deal.agreedDeposit) : "-"} / ${
      deal.agreedMonthlyRent != null ? formatPrice(deal.agreedMonthlyRent) : "-"
    }`;
  }
  const price = deal.agreedPrice ?? deal.agreedDeposit;
  return price != null ? formatPrice(price) : "가격 미정";
}

const PAYMENT_KIND_ORDER = ["pre_contract", "contract", "interim", "balance"];

/** 돈이 오가는 시점을 거래 단계에 붙인다: 가계약금 → 가계약, 계약금 → 본계약, 중도금·잔금 → 중도금/잔금 */
function getPaymentStage(kind: string) {
  if (kind === "pre_contract") return DealStage.PRE_CONTRACT;
  if (kind === "contract") return DealStage.CONTRACTED;
  return DealStage.SETTLING;
}

function DealSection({
  deals,
  isLoading,
  isError,
  onRetry,
  onOpenDeal,
  typeMeta,
}: {
  /** 이 의뢰 거래 조건들의 거래 (최근 순) */
  deals: Deal[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpenDeal: (dealId: string) => void;
  typeMeta: TypeMeta;
}) {
  const [showCancelled, setShowCancelled] = useState(false);
  const activeDeals = deals.filter((deal) => !deal.isCancelled);
  const cancelledDeals = deals.filter((deal) => deal.isCancelled);

  return (
    <section>
      <SectionTitle count={deals.length || undefined}>거래</SectionTitle>
      {isError && <RetryNote onRetry={onRetry}>거래를 불러오지 못했습니다.</RetryNote>}
      {isLoading ? (
        <EmptyText>거래를 불러오는 중…</EmptyText>
      ) : !isError && deals.length === 0 ? (
        <EmptyText>진행 중인 거래가 없습니다. 매칭에서 거래로 전환하면 여기에 거래 흐름이 표시됩니다.</EmptyText>
      ) : (
        <>
          <div className="space-y-3">
            {activeDeals.map((deal) => (
              <DealFlowCard key={deal.id} deal={deal} typeMeta={typeMeta} onOpen={() => onOpenDeal(deal.id)} />
            ))}
          </div>
          {cancelledDeals.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                aria-expanded={showCancelled}
                onClick={() => setShowCancelled((value) => !value)}
                className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", showCancelled && "rotate-180")} />
                취소된 거래 {cancelledDeals.length}건 {showCancelled ? "접기" : "보기"}
              </button>
              {showCancelled && (
                <div className="mt-1 space-y-3 opacity-70">
                  {cancelledDeals.map((deal) => (
                    <DealFlowCard key={deal.id} deal={deal} typeMeta={typeMeta} onOpen={() => onOpenDeal(deal.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DealFlowCard({ deal, typeMeta, onOpen }: { deal: Deal; typeMeta: TypeMeta; onOpen: () => void }) {
  const now = new Date();
  const stage = normalizeDealStage(deal.stage);
  // 서버는 kind를 알파벳순으로 준다(balance가 먼저). 돈이 오가는 순서로 다시 정렬한다.
  const payments = (deal.payments ?? [])
    .filter((payment) => payment.status !== "cancelled" && payment.kind !== "refund")
    .sort(
      (a, b) =>
        PAYMENT_KIND_ORDER.indexOf(a.kind) - PAYMENT_KIND_ORDER.indexOf(b.kind) ||
        a.sequence - b.sequence,
    );
  // 가계약은 선택 단계: 지금 가계약이거나 가계약금 기록이 있을 때만 흐름에 넣는다.
  const hasPreContract =
    stage === DealStage.PRE_CONTRACT || payments.some((payment) => payment.kind === "pre_contract");
  const stages = [
    DealStage.PREPARING,
    ...(hasPreContract ? [DealStage.PRE_CONTRACT] : []),
    DealStage.CONTRACTED,
    DealStage.SETTLING,
    DealStage.COMPLETED,
    DealStage.CLOSED,
  ];
  const currentIndex = stages.indexOf(stage as (typeof stages)[number]);
  const health =
    !deal.isCancelled && stage !== DealStage.CLOSED ? getDealPipelineHealth(deal, now) : null;
  const meta = typeMeta(deal.transactionType);
  const parties = [
    deal.buyerContact?.name ? `매수 ${deal.buyerContact.name}` : null,
    deal.sellerContact?.name ? `매도 ${deal.sellerContact.name}` : null,
    deal.isJointBrokerage ? `공동중개${deal.partnerBroker?.name ? ` ${deal.partnerBroker.name}` : ""}` : null,
  ].filter(Boolean);

  return (
    <article className="rounded-lg px-3 py-3 shadow-[inset_0_0_0_1px_#ecebe8]">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11.5px] font-semibold", meta.className)}>
          {meta.label}
        </span>
        <span className="truncate text-[15px] font-bold tabular-nums tracking-[-0.02em] text-[#2f2e2a]">
          {formatDealPrice(deal)}
        </span>
        {deal.isCancelled ? (
          <span className="shrink-0 rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[12px] font-medium leading-5 text-[#787774]">
            취소
          </span>
        ) : (
          <StatusBadge kind="dealStage" status={stage} size="sm" />
        )}
        <button
          type="button"
          onClick={onOpen}
          className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[12px] text-muted-foreground hover:text-foreground"
        >
          거래 보기
          <ArrowUpRight className="size-3" />
        </button>
      </div>
      {parties.length > 0 && (
        <div className="mt-1 truncate text-[12px] text-muted-foreground">{parties.join(" · ")}</div>
      )}

      {deal.isCancelled ? (
        <p className="mt-2 text-[12px] text-muted-foreground">
          {deal.cancelledAt ? `${formatMonthDay(deal.cancelledAt)} 취소` : "취소된 거래"}
          {deal.cancelReason ? ` · ${deal.cancelReason}` : ""}
        </p>
      ) : (
        <>
          {health?.isAtRisk && (
            <div
              role="status"
              className={cn(
                "mt-2.5 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px]",
                health.state === "overdue"
                  ? "bg-[#fbe9e6] text-[#8a3b33]"
                  : "bg-[#fbf3e2] text-[#8a5a12]",
              )}
            >
              <AlertCircle className="size-3.5 shrink-0" />
              <span className="font-semibold">{health.label}</span>
              <span className="truncate">{health.description}</span>
            </div>
          )}
          <ol aria-label="거래 흐름" className="mt-3">
            {stages.map((stageKey, index) => {
              const state =
                index < currentIndex ? "done" : index === currentIndex ? "current" : "pending";
              const stagePayments = payments.filter(
                (payment) => getPaymentStage(payment.kind) === stageKey,
              );
              return (
                <DealFlowStep
                  key={stageKey}
                  label={getDealStageLabel(stageKey)}
                  state={state}
                  isLast={index === stages.length - 1}
                  note={
                    state === "current"
                      ? `${formatMonthDay(deal.stageChangedAt)}부터 · ${getDealStageAgeDays(deal, now)}일째`
                      : null
                  }
                  payments={stagePayments}
                  now={now}
                />
              );
            })}
          </ol>
        </>
      )}
    </article>
  );
}

function DealFlowStep({
  label,
  state,
  isLast,
  note,
  payments,
  now,
}: {
  label: string;
  state: "done" | "current" | "pending";
  isLast: boolean;
  note: string | null;
  payments: DealPayment[];
  now: Date;
}) {
  return (
    <li className={cn("relative grid grid-cols-[18px_minmax(0,1fr)] gap-x-2.5", !isLast && "pb-2.5")}>
      {/* 연결선: 점 중심(9px)에서 다음 점까지 */}
      {!isLast && (
        <span
          aria-hidden
          className={cn(
            "absolute bottom-0 left-[calc(9px-0.5px)] top-[18px] w-px",
            state === "done" ? "bg-[#b9d3c2]" : "bg-[#e3e2de]",
          )}
        />
      )}
      <span
        className={cn(
          "relative grid size-[18px] place-items-center rounded-full",
          state === "done" && "bg-[#e9f2ec] text-[#3f7a57]",
          state === "current" && "bg-[#2f2e2a] text-white",
          state === "pending" && "bg-white shadow-[inset_0_0_0_1px_#dddcd8]",
        )}
      >
        {state === "done" ? (
          <Check className="size-3" />
        ) : state === "current" ? (
          <span className="size-1.5 rounded-full bg-white" />
        ) : null}
      </span>
      <div className="min-w-0 pt-px">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              "text-[13px] leading-[18px]",
              state === "current" ? "font-semibold text-[#2f2e2a]" : state === "done" ? "text-[#5f5e5a]" : "text-[#a9a7a1]",
            )}
          >
            {label}
          </span>
          {note && <span className="truncate text-[12px] text-muted-foreground">{note}</span>}
        </div>
        {payments.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {payments.map((payment) => (
              <PaymentLine key={payment.id} payment={payment} now={now} />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function PaymentLine({ payment, now }: { payment: DealPayment; now: Date }) {
  const label = formatPaymentKind(payment.kind, payment.sequence);
  const amount = formatPrice(payment.scheduledAmount);
  const paid = payment.status === "paid";
  const daysUntil = payment.scheduledDate ? getDaysUntil(new Date(payment.scheduledDate), now) : null;
  const overdue = !paid && (payment.status === "overdue" || (daysUntil !== null && daysUntil < 0));

  let when: string;
  if (paid) {
    when = payment.paidAt ? `${formatMonthDay(payment.paidAt)} 입금` : "입금 완료";
  } else if (payment.status === "partial") {
    when = `${payment.paidAmount != null ? `${formatPrice(payment.paidAmount)} 입금` : "일부 입금"}${
      payment.scheduledDate ? ` · ${formatMonthDay(payment.scheduledDate)} 예정` : ""
    }`;
  } else if (payment.scheduledDate && daysUntil !== null) {
    when = `${formatMonthDay(payment.scheduledDate)} 예정 · ${
      daysUntil === 0 ? "오늘" : daysUntil > 0 ? `D-${daysUntil}` : `${Math.abs(daysUntil)}일 지남`
    }`;
  } else {
    when = "일정 미정";
  }

  return (
    <li className="flex min-w-0 items-center gap-1.5 text-[12px] tabular-nums">
      {paid ? (
        <Check className="size-3 shrink-0 text-[#3f7a57]" />
      ) : (
        <span
          className={cn(
            "mx-[3px] size-1.5 shrink-0 rounded-full",
            overdue ? "bg-[#c4554d]" : "bg-[#c9c7c1]",
          )}
        />
      )}
      <span className={cn("shrink-0", paid ? "text-muted-foreground" : "text-[#37352f]")}>{label}</span>
      <span className={cn("shrink-0 font-medium", paid ? "text-muted-foreground" : "text-[#2f2e2a]")}>
        {amount}
      </span>
      <span className={cn("truncate", overdue ? "font-medium text-[#b4423a]" : "text-muted-foreground")}>
        · {when}
      </span>
    </li>
  );
}
