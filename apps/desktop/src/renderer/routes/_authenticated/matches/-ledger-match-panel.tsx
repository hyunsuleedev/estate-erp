import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { GitBranch, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Match } from "@estate-erp/api-client";
import { MatchStage } from "@estate-erp/shared";
import { ConfirmDialog } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { MatchCreateDialog } from "./-match-create-dialog";
import { MatchConvertDialog } from "./-match-convert-dialog";
import { BuyerMatchBranchList } from "./-match-groups";
import {
  buildViewingCalendarEventPayload,
  getMatchKpis,
  getMatchStageBlockReason,
  getMatchStageLabel,
  getMatchTitle,
  getUpcomingViewingEvent,
  shouldMoveToViewingOnSchedule,
  toCalendarEventUpdatePayload,
  type MatchRowActions,
} from "./-match-view-utils";

export type LedgerMatchPanelSource =
  | { kind: "demand"; requirementId: string }
  | {
      kind: "listing";
      intakeId: string;
      listingIds: string[];
    };

export interface LedgerMatchPanelProps {
  panelId: string;
  label: string;
  initialCount: number;
  source: LedgerMatchPanelSource;
}

function uniqueListingIds(listingIds: string[]) {
  return Array.from(new Set(listingIds)).sort();
}

async function fetchLedgerMatches(source: LedgerMatchPanelSource) {
  if (source.kind === "demand") {
    return api.matches.findAll({ buyerReqId: source.requirementId });
  }

  const results = await Promise.all(
    uniqueListingIds(source.listingIds).map((listingId) =>
      api.matches.findAll({ listingId }),
    ),
  );

  return Array.from(
    new Map(results.flat().map((match) => [match.id, match])).values(),
  );
}

function getLedgerMatchSourceKey(source: LedgerMatchPanelSource) {
  return source.kind === "demand"
    ? `demand:${source.requirementId}`
    : `listing:${source.intakeId}:${uniqueListingIds(source.listingIds).join(",")}`;
}

export function LedgerMatchPanel({
  panelId,
  label,
  initialCount,
  source,
}: LedgerMatchPanelProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [convertMatchId, setConvertMatchId] = useState<string | null>(null);
  const [deleteMatchId, setDeleteMatchId] = useState<string | null>(null);
  const sourceKey = getLedgerMatchSourceKey(source);
  const {
    data: matches = [],
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["matches", "ledger-panel", sourceKey],
    queryFn: () => fetchLedgerMatches(source),
  });

  const summary = useMemo(() => getMatchKpis(matches), [matches]);

  const invalidateRelatedQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ["matches"] });
    void queryClient.invalidateQueries({ queryKey: ["brokerage-cases"] });
    void queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] });
    void queryClient.invalidateQueries({ queryKey: ["listing-intakes"] });
  };

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.matches.updateStage(id, { stage }),
    onSuccess: (_, { stage }) => {
      toast.success(`${getMatchStageLabel(stage)} 단계로 변경했습니다.`);
      invalidateRelatedQueries();
    },
    onError: (error: Error) =>
      toast.error(error.message || "단계 변경에 실패했습니다."),
  });

  const memoMutation = useMutation({
    mutationFn: ({ match, memo }: { match: Match; memo: string | null }) =>
      api.matches.updateMemo(match.id, {
        memo,
        expectedUpdatedAt: match.updatedAt,
      }),
    onSuccess: () => {
      invalidateRelatedQueries();
      toast.success("매칭 메모를 저장했습니다.");
    },
    onError: (error: Error) =>
      toast.error(error.message || "매칭 메모 저장에 실패했습니다."),
  });

  const viewingScheduleMutation = useMutation({
    mutationFn: async ({
      match,
      startLocalValue,
    }: {
      match: Match;
      startLocalValue: string;
    }) => {
      const blockReason = getMatchStageBlockReason(match, MatchStage.VIEWING);
      if (blockReason) throw new Error(blockReason);

      const payload = buildViewingCalendarEventPayload(match, startLocalValue);
      const upcomingViewingEvent = getUpcomingViewingEvent(match);

      if (upcomingViewingEvent) {
        await api.calendarEvents.update(
          upcomingViewingEvent.id,
          toCalendarEventUpdatePayload(payload),
        );
      } else {
        await api.calendarEvents.create(payload);
      }

      if (shouldMoveToViewingOnSchedule(match.stage)) {
        await api.matches.updateStage(match.id, { stage: MatchStage.VIEWING });
      }
    },
    onSuccess: () => {
      invalidateRelatedQueries();
      void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("방문 일정을 저장했습니다.");
    },
    onError: (error: Error) =>
      toast.error(`방문 일정 저장에 실패했습니다: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.matches.remove(id),
    onSuccess: () => {
      setDeleteMatchId(null);
      invalidateRelatedQueries();
      toast.success("매칭을 삭제했습니다.");
    },
    onError: (error: Error) =>
      toast.error(error.message || "매칭 삭제에 실패했습니다."),
  });

  const handleStageChange = (id: string, stage: string) => {
    const match = matches.find((candidate) => candidate.id === id);
    if (match) {
      const blockReason = getMatchStageBlockReason(match, stage);
      if (blockReason) {
        toast.error("단계 이동 전 확인이 필요합니다.", {
          description: blockReason,
        });
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
    savingMemoId: memoMutation.isPending
      ? (memoMutation.variables?.match.id ?? null)
      : null,
    onStageChange: handleStageChange,
    onSaveMemo: async (match, memo) => {
      await memoMutation.mutateAsync({ match, memo });
    },
    onRequestDelete: setDeleteMatchId,
    onOpenDetail: (id) => navigate({ to: "/matches", search: { matchId: id } }),
    onScheduleViewing: (match, startLocalValue) =>
      viewingScheduleMutation.mutate({ match, startLocalValue }),
  };

  const convertMatch =
    matches.find((match) => match.id === convertMatchId) ?? null;
  const deleteMatch =
    matches.find((match) => match.id === deleteMatchId) ?? null;
  const resultCount = isLoading ? Math.max(0, initialCount) : matches.length;
  const statusMessage = isLoading
    ? `${label}을 불러오는 중입니다.`
    : isFetching
      ? `${label}을 갱신하는 중입니다.`
      : `${label} ${matches.length}건을 불러왔습니다.`;

  return (
    <div
      id={panelId}
      role="region"
      aria-labelledby={`${panelId}-title`}
      aria-busy={isLoading || isFetching}
      className="border-t border-border bg-[#fbfbfa] py-3 pl-4 pr-4"
    >
      <span role="status" className="sr-only">
        {statusMessage}
      </span>

      <div className="max-w-[1320px]">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
              <GitBranch className="size-3.5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs tabular-nums">
              <span
                id={`${panelId}-title`}
                className="text-[12.5px] font-semibold text-foreground"
              >
                {label}
              </span>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-[10.5px] font-semibold text-muted-foreground">
                {resultCount}
              </span>
              {!isLoading && summary.active > 0 && (
                <span className="rounded-md border border-info/25 bg-info-soft px-1.5 py-0.5 font-medium text-info-strong">
                  진행 {summary.active}
                </span>
              )}
              {!isLoading && summary.converted > 0 && (
                <span className="rounded-md border border-success/25 bg-success-soft px-1.5 py-0.5 font-medium text-success">
                  거래 {summary.converted}
                </span>
              )}
              {!isLoading && summary.closed > 0 && (
                <span className="rounded-md border border-destructive/25 bg-destructive-soft px-1.5 py-0.5 font-medium text-destructive-strong">
                  종료 {summary.closed}
                </span>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 border-border bg-white px-2.5 text-[11.5px] font-semibold text-foreground shadow-none hover:bg-muted"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3" aria-hidden="true" />
            매칭 생성
          </Button>
        </div>

        {isLoading ? (
          <div className="ml-8 flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-white/70 text-xs text-muted-foreground">
            <Loader2
              className="mr-1.5 size-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            매칭을 불러오는 중...
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="ml-8 flex h-20 items-center justify-between rounded-lg border border-destructive/20 bg-white px-3.5"
          >
            <span className="text-xs text-destructive">
              매칭을 불러오지 못했습니다.
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void refetch()}
            >
              다시 시도
            </Button>
          </div>
        ) : matches.length === 0 ? (
          <div className="ml-8 flex h-20 items-center justify-center rounded-lg border border-dashed border-border bg-white/70 text-xs text-muted-foreground">
            연결된 매칭이 없습니다.
          </div>
        ) : (
          <BuyerMatchBranchList
            matches={matches}
            actions={actions}
            counterparty={source.kind === "listing" ? "buyer" : "listing"}
            className="mb-0 ml-8 mr-0 mt-1.5"
          />
        )}
      </div>

      <MatchCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        matches={matches}
        scope={source}
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
            ? `${deleteMatch.buyerRequirement?.contact?.name ?? "구매고객"} · ${getMatchTitle(deleteMatch)} 매칭이 삭제됩니다. 진행 이력이 함께 사라지므로 종료 처리를 권장합니다.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteMatchId) deleteMutation.mutate(deleteMatchId);
        }}
      />
    </div>
  );
}
