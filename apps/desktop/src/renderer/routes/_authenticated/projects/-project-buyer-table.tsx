import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import type { BuyerRequirement, Match, ProjectStep } from "@estate-erp/api-client";
import { MatchStage, normalizeMatchStage } from "@estate-erp/shared";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  MapPin,
  Phone,
  Plus,
  Ruler,
  Siren,
  Tag,
  User,
} from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatDate, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConfirmDialog, ContactNameChip, WonCircleIcon } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BuyerMatchBranchList } from "../wanted-properties/-match-groups";
import { BuyerStatusPill, BuyerUrgencyPill } from "../wanted-properties/-requirement-cells";
import { MatchConvertDialog } from "../wanted-properties/-match-convert-dialog";
import { MatchCreateDialog } from "../wanted-properties/-match-create-dialog";
import { MatchDetailDialog } from "../wanted-properties/-match-detail-dialog";
import {
  buildViewingCalendarEventPayload,
  getBuyerRequirementSummaryParts,
  getMatchStageBlockReason,
  getMatchStageLabel,
  getMatchTitle,
  getUpcomingViewingEvent,
  shouldMoveToViewingOnSchedule,
  toCalendarEventUpdatePayload,
  type MatchRowActions,
} from "../wanted-properties/-match-view-utils";
import {
  BUYER_STEP_COLUMNS,
  isDefaultBuyerStepTitle,
  pickStepTableColumns,
  type BuyerStepColumnId,
} from "./-project-model";
import { RefreshFailedNote } from "./-project-notes";
import { useElementWidth, usePanelState } from "./-project-panel-state";
import { DealFlowBlock } from "./-project-step-body";
import { FRESH_ON_RETURN } from "./-project-step-detail";
import { TableHeaderLabel } from "./-project-table-parts";

/*
 * 구매 의뢰 단계 = 희망매물 표의 한 줄(희망 조건마다) + 그 아래 희망매물 화면과 같은 매칭 묶음(사용자 요청 2026-11-24:
 * "희망매물 부분은 희망매물 페이지 참고해서"). 매칭 묶음(매물 카드 · 단계 띠 · 거래/종료/메모 줄 · "+ 매물 연결")과
 * 그것이 여는 창(매칭 상세 · 매물 연결 · 거래 전환 · 삭제 확인)은 희망매물 화면의 것을 그대로 쓴다.
 *
 * 희망매물 표의 줄(BuyerMatchGroup)은 선택 칸이 붙은 1128px 고정 격자라 카드 안에 그대로 넣으면 가로로 굴러간다.
 * 그래서 줄의 칸만 같은 글자 · 선 · 알약으로 옮기고(선택 칸은 뺀다), 카드 폭에 맞춰 덜 중요한 칸부터 뺀다.
 * 칸에서 바로 고치기(EditableRequirementCell)는 희망매물 화면의 저장 흐름(목록 캐시 덮기 · 되돌리기 알림)에 묶여 있어
 * 여기서는 보이기만 하고, 고치는 길은 예산을 눌러 여는 희망 조건 화면이다.
 */

/** 희망매물 표의 칸(-match-groups.tsx BUYER_TABLE_CELL)과 같은 선 · 여백 */
const BUYER_CELL = "flex min-w-0 items-center border-r border-border px-2.5";
const BUYER_VALUE = "min-w-0 text-[14px] font-[450] leading-[21px]";

const BUYER_HEADERS: Record<Exclude<BuyerStepColumnId, "toggle">, { label: string; icon: ReactNode }> = {
  urgency: { label: "긴급도", icon: <Siren /> },
  customer: { label: "고객", icon: <User /> },
  phone: { label: "연락처", icon: <Phone /> },
  status: { label: "상태", icon: <CircleDashed /> },
  siteTypes: { label: "매물 유형", icon: <Tag /> },
  area: { label: "희망 평형", icon: <Ruler /> },
  budget: { label: "예산", icon: <WonCircleIcon /> },
  places: { label: "희망 지역·단지", icon: <MapPin /> },
  moveIn: { label: "입주 희망일", icon: <CalendarDays /> },
};

export function isBuyerTitleMerged(step: ProjectStep) {
  return isDefaultBuyerStepTitle(step.title);
}

/**
 * 매칭 묶음의 동작(희망매물 화면의 actions와 같은 흐름): 단계 바꾸기(거래 전환은 확인 창), 메모, 임장 일정, 삭제(확인 창),
 * 매칭 상세(두 번 누르기 · 제목), 매물 연결 창. 연락처 상세의 "찾는 집"도 이 동작을 쓴다.
 */
export function useBuyerMatchActions(matches: readonly Match[]) {
  const queryClient = useQueryClient();
  const [convertMatchId, setConvertMatchId] = useState<string | null>(null);
  const [detailMatchId, setDetailMatchId] = useState<string | null>(null);
  const [deleteMatchId, setDeleteMatchId] = useState<string | null>(null);
  const [createRequirementId, setCreateRequirementId] = useState<string | null>(null);

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => api.matches.updateStage(id, { stage }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["matches"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(
        variables.stage === MatchStage.CLOSED
          ? "매칭을 종료했습니다"
          : `${getMatchStageLabel(variables.stage)} 단계로 변경했습니다`,
      );
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error, "단계를 바꾸지 못했습니다. 다시 시도해 주세요."));
    },
  });

  const memoMutation = useMutation({
    mutationFn: ({ match, memo }: { match: Match; memo: string | null }) =>
      api.matches.updateMemo(match.id, { memo, expectedUpdatedAt: match.updatedAt }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["matches"] });
      toast.success("메모를 저장했습니다");
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error, "메모를 저장하지 못했습니다. 다시 시도해 주세요."));
    },
  });

  const viewingScheduleMutation = useMutation({
    mutationFn: async ({ match, startLocalValue }: { match: Match; startLocalValue: string }) => {
      const blockReason = getMatchStageBlockReason(match, MatchStage.VIEWING);
      if (blockReason) throw new Error(blockReason);
      const payload = buildViewingCalendarEventPayload(match, startLocalValue);
      const upcoming = getUpcomingViewingEvent(match);
      if (upcoming) await api.calendarEvents.update(upcoming.id, toCalendarEventUpdatePayload(payload));
      else await api.calendarEvents.create(payload);
      if (shouldMoveToViewingOnSchedule(match.stage)) {
        await api.matches.updateStage(match.id, { stage: MatchStage.VIEWING });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["matches"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("임장 일정을 저장했습니다");
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error, "임장 일정을 저장하지 못했습니다. 다시 시도해 주세요."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.matches.remove(id),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["matches"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDeleteMatchId(null);
      if (detailMatchId === id) setDetailMatchId(null);
      toast.success("매칭을 삭제했습니다");
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error, "매칭을 삭제하지 못했습니다. 다시 시도해 주세요."));
    },
  });

  // 거래 전환은 늘 거래 생성 확인 창을 거친다
  const handleStageChange = (id: string, stage: string) => {
    if (stageMutation.isPending || viewingScheduleMutation.isPending) return;
    const match = matches.find((candidate) => candidate.id === id);
    if (match) {
      if (normalizeMatchStage(match.stage) === normalizeMatchStage(stage)) return;
      const blockReason = getMatchStageBlockReason(match, stage);
      if (blockReason) {
        toast.error("단계 이동 전 확인이 필요합니다", { description: blockReason });
        return;
      }
    }
    if (stage === MatchStage.DEAL_CREATED) {
      setConvertMatchId(id);
      return;
    }
    stageMutation.mutate({ id, stage });
  };

  const actions: MatchRowActions = {
    isUpdating: stageMutation.isPending,
    isScheduling: viewingScheduleMutation.isPending,
    savingMemoId: memoMutation.isPending ? (memoMutation.variables?.match.id ?? null) : null,
    onStageChange: handleStageChange,
    onSaveMemo: async (match, memo) => {
      await memoMutation.mutateAsync({ match, memo });
    },
    onRequestDelete: setDeleteMatchId,
    onOpenDetail: setDetailMatchId,
    onScheduleViewing: (match, startLocalValue) => viewingScheduleMutation.mutate({ match, startLocalValue }),
  };

  const detailMatch = matches.find((match) => match.id === detailMatchId) ?? null;
  const convertMatch = matches.find((match) => match.id === convertMatchId) ?? null;
  const deleteMatch = matches.find((match) => match.id === deleteMatchId) ?? null;

  const dialogs = (
    <>
      <MatchDetailDialog
        match={detailMatch}
        open={detailMatchId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailMatchId(null);
        }}
        actions={actions}
      />
      <MatchCreateDialog
        open={createRequirementId !== null}
        onOpenChange={(open) => {
          if (!open) setCreateRequirementId(null);
        }}
        matches={[...matches]}
        scope={createRequirementId ? { kind: "demand", requirementId: createRequirementId } : undefined}
      />
      <MatchConvertDialog
        match={convertMatch}
        open={convertMatchId !== null}
        onOpenChange={(open) => {
          if (!open) setConvertMatchId(null);
        }}
      />
      <ConfirmDialog
        open={deleteMatchId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteMatchId(null);
        }}
        title="매칭을 삭제하시겠습니까?"
        description={
          deleteMatch
            ? `${deleteMatch.buyerRequirement?.contact?.name ?? "미지정"} · ${getMatchTitle(deleteMatch)} 매칭이 삭제됩니다. 진행 이력이 함께 사라지므로 종료 처리를 권장합니다.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteMatchId) deleteMutation.mutate(deleteMatchId);
        }}
      />
    </>
  );

  return { actions, dialogs, openCreate: setCreateRequirementId };
}

export function BuyerStepTable({
  step,
  controls,
  onOpenDeals,
}: {
  step: ProjectStep;
  /** 머리 줄 오른쪽 끝에 얹을 단계의 단추(이름을 따로 보이지 않을 때) */
  controls?: ReactNode;
  onOpenDeals: () => void;
}) {
  const requirements = step.buyerIntake?.requirements ?? [];
  const [ref, width] = useElementWidth<HTMLDivElement>();
  // 희망 조건 화면 · 매물·매칭 탭과 같은 이름표(읽어 둔 것을 함께 쓴다)
  const detailQueries = useQueries({
    queries: requirements.map((requirement) => ({
      queryKey: ["buyer-requirements", "detail", requirement.id],
      queryFn: () => api.buyerRequirements.findOne(requirement.id),
      ...FRESH_ON_RETURN,
    })),
  });
  const matchQueries = useQueries({
    queries: requirements.map((requirement) => ({
      queryKey: ["matches", "by-requirement", requirement.id],
      queryFn: () => api.matches.findAll({ buyerReqId: requirement.id }),
      ...FRESH_ON_RETURN,
    })),
  });
  const allMatches = matchQueries.flatMap((query) => query.data ?? []);
  const { actions, dialogs, openCreate } = useBuyerMatchActions(allMatches);

  const fit = pickStepTableColumns(BUYER_STEP_COLUMNS, Math.max(0, width));
  const template = [...fit.visible.map((id) => `${fit.widths[id]}px`), "minmax(0,1fr)"].join(" ");
  const gridStyle = { gridTemplateColumns: template } as CSSProperties;
  // 카드가 좁으면 매칭 한 건을 [매물 카드 | 단계 띠] 대신 위아래로 둔다(희망매물 화면의 좁은 창과 같은 모양).
  // 단계 띠는 최소 560px이라, 옆에 두면 카드 안에서 띠가 가로로 굴러간다.
  const stackLanes = width > 0 && width < 980;

  return (
    <div ref={ref} data-project-buyer-table className={cn("min-w-0", fit.overflow && "overflow-x-auto")}>
      <div
        role="row"
        data-project-table-header
        className="relative grid h-9 border-b border-border bg-white"
        style={gridStyle}
      >
        {fit.visible.map((id) =>
          id === "toggle" ? (
            <div key={id} aria-hidden="true" className="border-r border-border" />
          ) : (
            <div key={id} role="columnheader" className={BUYER_CELL}>
              <TableHeaderLabel icon={BUYER_HEADERS[id].icon} label={BUYER_HEADERS[id].label} />
            </div>
          ),
        )}
        <div aria-hidden="true" />
        {controls}
      </div>
      {requirements.length === 0 && (
        <p className="flex h-10 items-center border-b border-border px-2.5 text-[13px] text-muted-foreground">
          희망 조건 없음
        </p>
      )}
      {requirements.map((requirement, index) => {
        const detailQuery = detailQueries[index];
        const matchesQuery = matchQueries[index];
        return (
          <RequirementTableGroup
            key={requirement.id}
            stepId={step.id}
            requirementId={requirement.id}
            requirement={detailQuery?.data ?? null}
            requirementPending={detailQuery?.isPending ?? true}
            requirementRefreshFailed={Boolean(detailQuery?.data && detailQuery.isError)}
            onRetryRequirement={() => void detailQuery?.refetch()}
            matches={matchesQuery?.data ?? null}
            matchesPending={matchesQuery?.isPending ?? true}
            matchesRefreshFailed={Boolean(matchesQuery?.data && matchesQuery.isError)}
            onRetryMatches={() => void matchesQuery?.refetch()}
            visible={fit.visible}
            gridStyle={gridStyle}
            stackLanes={stackLanes}
            actions={actions}
            onCreateMatch={() => openCreate(requirement.id)}
          />
        );
      })}
      <DealFlowBlock step={step} onOpenDeals={onOpenDeals} variant="table" />
      {dialogs}
    </div>
  );
}

/** 희망 조건 한 줄 + 그 아래 매칭 묶음(희망매물 화면의 BuyerMatchGroup에서 선택 칸을 뺀 모양) */
function RequirementTableGroup({
  stepId,
  requirementId,
  requirement,
  requirementPending,
  requirementRefreshFailed,
  onRetryRequirement,
  matches,
  matchesPending,
  matchesRefreshFailed,
  onRetryMatches,
  visible,
  gridStyle,
  stackLanes,
  actions,
  onCreateMatch,
}: {
  stepId: string;
  requirementId: string;
  requirement: BuyerRequirement | null;
  requirementPending: boolean;
  /** 읽어 둔 희망 조건이 있는데 다시 읽기에 실패했다(보이는 조건이 예전 것일 수 있다) */
  requirementRefreshFailed: boolean;
  onRetryRequirement: () => void;
  matches: Match[] | null;
  matchesPending: boolean;
  matchesRefreshFailed: boolean;
  onRetryMatches: () => void;
  visible: BuyerStepColumnId[];
  gridStyle: CSSProperties;
  stackLanes: boolean;
  actions: MatchRowActions;
  onCreateMatch: () => void;
}) {
  const list = matches ?? [];
  const activeCount = list.filter((match) => normalizeMatchStage(match.stage) !== MatchStage.CLOSED).length;
  // 진행 중인 매칭이 있으면 처음부터 펼쳐 둔다. 접고 펼친 것은 이 화면에 머무는 동안 남는다.
  const [savedExpanded, setExpanded] = usePanelState<boolean>(`buyer-matches:${stepId}:${requirementId}`);
  const expanded = savedExpanded ?? activeCount > 0;
  const hasDetails = list.length > 0 || Boolean(requirement?.memo);

  if (!requirement) {
    return (
      <div className="flex h-10 items-center border-b border-border px-2.5 text-[13px] text-muted-foreground">
        {requirementPending ? (
          <Skeleton className="h-5 w-full max-w-[420px]" />
        ) : (
          <>
            희망 조건을 불러오지 못했습니다&nbsp;·&nbsp;
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={onRetryRequirement}>
              다시 시도
            </button>
          </>
        )}
      </div>
    );
  }

  const buyerRequirement = requirement as unknown as NonNullable<Match["buyerRequirement"]>;
  const buyerName = requirement.contact?.name ?? "미지정";
  const summary = getBuyerRequirementSummaryParts(buyerRequirement);
  const phone = requirement.contact?.phone ? formatPhone(requirement.contact.phone) : "연락처 없음";
  // 펼침 칸 · 첫 값 칸의 여백: 매칭 가지와 메모를 첫 값 칸의 글자에 맞춘다(희망매물 화면의 78px = 선택 40 + 펼침 28 + 여백 10)
  const branchIndent = 38;

  const value = (id: BuyerStepColumnId): ReactNode => {
    switch (id) {
      case "toggle":
        return (
          <div key={id} className="flex items-center justify-center border-r border-border">
            {hasDetails && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`${buyerName} 매칭 ${expanded ? "접기" : "펼치기"}`}
                aria-expanded={expanded}
                className="shrink-0 text-muted-foreground"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </Button>
            )}
          </div>
        );
      case "urgency":
        return (
          <div key={id} className={BUYER_CELL}>
            <span className={cn(BUYER_VALUE, "flex items-center")}>
              <BuyerUrgencyPill status={requirement.urgency} />
            </span>
          </div>
        );
      case "customer":
        return (
          <div key={id} className={cn(BUYER_CELL, "relative gap-1.5")}>
            {requirement.contact?.id ? (
              <span className="flex min-w-0 text-[14px] leading-[21px] text-foreground">
                <ContactNameChip contactId={requirement.contact.id} name={buyerName} />
              </span>
            ) : (
              <p title={buyerName} className="min-w-0 truncate text-[13px] font-semibold">
                {buyerName}
              </p>
            )}
          </div>
        );
      case "phone":
        return (
          <div key={id} className={BUYER_CELL}>
            <span title={phone} className={cn(BUYER_VALUE, "truncate tabular-nums text-foreground")}>
              {phone}
            </span>
          </div>
        );
      case "status":
        return (
          <div key={id} className={BUYER_CELL}>
            <span className={cn(BUYER_VALUE, "flex items-center")}>
              <BuyerStatusPill status={requirement.status} />
            </span>
          </div>
        );
      case "siteTypes":
        return (
          <div key={id} className={BUYER_CELL}>
            <span title={summary.siteTypeText} className={cn(BUYER_VALUE, "truncate text-foreground")}>
              {summary.siteTypeText}
            </span>
          </div>
        );
      case "area":
        return (
          <div key={id} className={BUYER_CELL}>
            <span title={summary.areaText} className={cn(BUYER_VALUE, "truncate tabular-nums text-foreground")}>
              {summary.areaText}
            </span>
          </div>
        );
      case "budget":
        return (
          <div key={id} className={BUYER_CELL}>
            {/*
              희망 조건 상세로 가는 길. 표 모양으로 바꾸면서 이 링크가 빠져, 구매 의뢰 카드에서는 희망 조건을
              열 방법이 없었다(매물 의뢰는 ↗로 매물 화면에 간다). 조건이 여럿이면 줄마다 자기 조건을 연다.
            */}
            <Link
              to="/buyer-requirements/$id"
              params={{ id: requirementId }}
              title={`${summary.budgetText} — 희망 조건을 엽니다`}
              data-project-requirement-open
              className={cn(
                BUYER_VALUE,
                "truncate tabular-nums text-foreground underline-offset-2 hover:text-info hover:underline focus-visible:text-info focus-visible:underline focus-visible:outline-none",
              )}
            >
              {summary.budgetText}
            </Link>
          </div>
        );
      case "places":
        return (
          <div key={id} className={BUYER_CELL}>
            {/* 지역과 단지는 매칭 판단의 핵심이라 자르지 않고 줄을 바꾼다 */}
            <span title={summary.placeText} className={cn(BUYER_VALUE, "break-words break-keep py-2 text-foreground")}>
              {summary.placeText}
            </span>
          </div>
        );
      case "moveIn":
        return (
          <div key={id} className={cn(BUYER_CELL, "border-r-0")}>
            <span
              className={cn(
                BUYER_VALUE,
                "truncate tabular-nums",
                requirement.moveInDate ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {formatDate(requirement.moveInDate)}
            </span>
          </div>
        );
    }
  };

  return (
    <section data-buyer-match-group data-project-requirement={requirementId} aria-label={`${buyerName} 매칭 그룹`} className="border-b border-border bg-white">
      <header data-buyer-summary-header className={cn(expanded && list.length > 0 && "border-b border-border")}>
        <div data-buyer-summary-row className="grid min-h-10" style={gridStyle}>
          {visible.map((id) => value(id))}
          <div aria-hidden="true" />
        </div>
        {expanded && requirement.memo?.trim() && (
          <dl
            data-buyer-requirement-details
            className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-2 border-t border-border py-1.5 pr-3 text-xs leading-5"
            style={{ paddingLeft: branchIndent }}
          >
            <dt className="text-muted-foreground">고객 메모</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words text-foreground/80">{requirement.memo}</dd>
          </dl>
        )}
      </header>

      {matchesPending ? (
        <div className="flex h-8 items-center border-t border-border" style={{ paddingLeft: branchIndent }}>
          <Skeleton className="h-4 w-40" />
        </div>
      ) : !matches ? (
        <p className="flex h-8 items-center border-t border-border text-xs text-muted-foreground" style={{ paddingLeft: branchIndent }}>
          매칭을 불러오지 못했습니다&nbsp;·&nbsp;
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={onRetryMatches}>
            다시 시도
          </button>
        </p>
      ) : list.length === 0 ? (
        // 희망매물 화면과 같은 "매칭 없음 · + 매물 연결" 한 줄
        <div data-buyer-no-match className="flex h-8 items-center gap-1.5 border-t border-border text-xs" style={{ paddingLeft: branchIndent }}>
          <span className="text-muted-foreground">매칭 없음</span>
          <button
            type="button"
            aria-label={`${buyerName} 매칭 생성`}
            onClick={onCreateMatch}
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Plus className="size-3.5" />
            매물 연결
          </button>
        </div>
      ) : !expanded && activeCount === 0 ? (
        // 끝난 매칭만 있어 접어 둔 줄: 새 매물을 붙이는 길과 끝난 매칭을 펼쳐 보는 길을 한 줄에 둔다
        <div data-buyer-no-match className="flex h-8 items-center gap-1.5 border-t border-border text-xs" style={{ paddingLeft: branchIndent }}>
          <span className="text-muted-foreground">진행 중인 매칭 없음</span>
          <button
            type="button"
            aria-label={`${buyerName} 매칭 생성`}
            onClick={onCreateMatch}
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Plus className="size-3.5" />
            매물 연결
          </button>
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setExpanded(true)}
            className="ml-1 inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ChevronRight className="size-3" />
            종료 {list.length}건
          </button>
        </div>
      ) : (
        expanded && (
          <div
            data-project-match-lanes={stackLanes ? "stack" : "side"}
            className={cn(
              // 좁은 카드에서는 매칭 한 건을 위아래로(희망매물 화면의 좁은 창과 같은 모양). 오른쪽 숨 쉴 자리(28px)도 카드 안에서는 뺀다.
              stackLanes && "[&_[data-match-branch]]:grid-cols-1! [&_[data-match-branch]]:pr-0!",
            )}
          >
            <BuyerMatchBranchList
              matches={list}
              actions={actions}
              className="ml-[38px] mr-0"
              addLabel={`${buyerName}에게 매물 더 연결`}
              onAdd={onCreateMatch}
            />
          </div>
        )
      )}
      {matchesRefreshFailed && (
        <div className="pb-1.5" style={{ paddingLeft: branchIndent }}>
          <RefreshFailedNote what="최신 매칭을" onRetry={onRetryMatches} />
        </div>
      )}
      {requirementRefreshFailed && (
        <div className="pb-1.5" style={{ paddingLeft: branchIndent }}>
          <RefreshFailedNote what="최신 희망조건을" onRetry={onRetryRequirement} />
        </div>
      )}
    </section>
  );
}
