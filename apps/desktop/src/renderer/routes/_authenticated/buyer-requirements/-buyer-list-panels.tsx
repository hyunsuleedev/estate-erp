import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  CalendarClock,
  ChevronRight,
  GitBranch,
  Loader2,
  MessageCircle,
  Plus,
  Rows2,
  Rows3,
  Star,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import type { BuyerRequirement, Match } from "@estate-erp/api-client";
import { MatchStage } from "@estate-erp/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatDate, formatDday, formatPhone } from "@/lib/format";
import { normalizeBuyerStatus } from "@/lib/status-config";
import { ConfirmDialog, StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BuyerMatchBranchList } from "../matches/-match-groups";
import { MatchConvertDialog } from "../matches/-match-convert-dialog";
import {
  buildViewingCalendarEventPayload,
  getMatchStageBlockReason,
  getMatchStageLabel,
  getMatchTitle,
  getUpcomingViewingEvent,
  shouldMoveToViewingOnSchedule,
  toCalendarEventUpdatePayload,
  type MatchRowActions,
} from "../matches/-match-view-utils";
import {
  formatAreaRange,
  formatBudget,
  getFollowUpState,
  regionLabels,
  siteLabels,
} from "./-buyer-utils";

/* ══════════════ 목록 보기 상태 공유 스토어 (툴바 ↔ 각 컬럼 셀) ══════════════
 * 컬럼마다 셀이 따로 렌더링되므로 보기 밀도·펼침 상태를 props로 내릴 수 없다.
 * 작은 외부 스토어로 두고 useSyncExternalStore로 구독한다. */

type ListStoreListener = () => void;

interface ListStore<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: ListStoreListener) => () => void;
}

function createListStore<T>(initial: T, storageKey?: string): ListStore<T> {
  let value = initial;
  if (storageKey && typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) value = JSON.parse(raw) as T;
    } catch {
      // 저장값이 깨져 있으면 기본값으로 동작한다
    }
  }
  const listeners = new Set<ListStoreListener>();
  return {
    get: () => value,
    set: (next) => {
      value =
        typeof next === "function" ? (next as (prev: T) => T)(value) : next;
      if (storageKey && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(value));
        } catch {
          // 저장 실패 시 보기 상태가 다음 실행에서 초기화될 뿐이므로 무시한다
        }
      }
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function useListStore<T>(store: ListStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/* ══════════════ 행 밀도 (상세/간결) — localStorage에 유지 ══════════════ */

export type BuyerListDensity = "detailed" | "compact";

/** 요건 라인 높이 — 간결 모드는 선호 조건 줄을 숨기고 한 줄만 보여준다 */
export const BUYER_INTENT_LINE_HEIGHT: Record<BuyerListDensity, number> = {
  detailed: 36,
  compact: 28,
};

const buyerDensityStore = createListStore<BuyerListDensity>(
  "detailed",
  "buyer-list-density",
);

export function useBuyerListDensity(): [
  BuyerListDensity,
  (density: BuyerListDensity) => void,
] {
  return [useListStore(buyerDensityStore), buyerDensityStore.set];
}

const DENSITY_OPTIONS: {
  value: BuyerListDensity;
  label: string;
  icon: typeof Rows3;
  hint: string;
}[] = [
  {
    value: "detailed",
    label: "상세",
    icon: Rows3,
    hint: "요건별 선호 조건까지 두 줄로 표시",
  },
  {
    value: "compact",
    label: "간결",
    icon: Rows2,
    hint: "요건을 한 줄씩 촘촘하게 표시",
  },
];

export function BuyerDensityToggle() {
  const [density, setDensity] = useBuyerListDensity();
  return (
    <div
      role="group"
      aria-label="행 밀도"
      className="flex items-center rounded-md border border-border/80 bg-[#f5f4f1] p-0.5"
    >
      {DENSITY_OPTIONS.map((option) => {
        const isActive = density === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            title={option.hint}
            onClick={() => setDensity(option.value)}
            className={cn(
              "flex h-6 items-center gap-1 rounded px-2 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-slate-800",
              isActive &&
                "border border-[#d9d9d6] bg-white text-slate-950 shadow-sm hover:text-slate-950",
            )}
          >
            <Icon className="size-3" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════ 요건 라인 펼침/접힘 (의뢰 그룹별, 세션 동안 유지) ══════════════ */

const buyerLinesOpenStore = createListStore<ReadonlySet<string>>(new Set());

export function useBuyerGroupLinesOpen(groupId: string): [boolean, () => void] {
  const open = useListStore(buyerLinesOpenStore).has(groupId);
  const toggle = useCallback(() => {
    buyerLinesOpenStore.set((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, [groupId]);
  return [open, toggle];
}

/** 부모 라인의 디스클로저 — 숨겨진 자식 요건이 있을 때만 표시된다 */
export function BuyerLinesToggle({
  groupId,
  hiddenCount,
}: {
  groupId: string;
  hiddenCount: number;
}) {
  const [open, toggle] = useBuyerGroupLinesOpen(groupId);
  if (hiddenCount <= 0) return null;
  const label = open
    ? "나머지 희망조건 접기"
    : `나머지 희망조건 ${hiddenCount}개 펼치기`;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        toggle();
      }}
      className="mr-1 flex h-5 min-w-5 shrink-0 items-center justify-center gap-0.5 rounded px-0.5 text-slate-400 transition-colors hover:bg-[#eef1f3] hover:text-slate-700"
    >
      <ChevronRight
        className={cn(
          "size-3 shrink-0 transition-transform duration-200",
          open && "rotate-90",
        )}
        aria-hidden="true"
      />
      {!open && (
        <span className="text-[10px] font-semibold tabular-nums">
          +{hiddenCount}
        </span>
      )}
    </button>
  );
}

/**
 * 자식 라인 펼침 애니메이션 — grid-rows 전환으로 열 때와 닫을 때 모두 부드럽다.
 * 닫힌 상태에서도 DOM은 유지되므로 모든 컬럼의 높이가 동기화된다.
 */
export function BuyerCollapsibleLine({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div
        className={cn(
          "min-h-0 overflow-hidden transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* ══════════════ 다음 액션 셀 (D-n · 지연 · "다음 액션 없음" 경고) ══════════════ */

/** 상태 설명 툴팁 — 배지가 무엇을 의미하는지 hover/focus로 알려준다 */
function FollowUpHint({
  tooltip,
  children,
}: {
  tooltip: string;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex min-w-0 cursor-help">{children}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px]">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function NextActionCell({ r }: { r: BuyerRequirement }) {
  const v = r.nextContactDate;
  const state = getFollowUpState(v);

  if (state === "none") {
    // 활성 의뢰인데 다음 연락 계획이 없으면 방치 위험 — 노랑 경고 배지
    if (normalizeBuyerStatus(r.status) === "active") {
      return (
        <FollowUpHint tooltip="진행 중인 의뢰인데 다음 연락 계획이 없습니다. 방치되지 않도록 연락함 기록에서 다음 연락일을 지정하세요.">
          <span className="inline-flex h-6 items-center rounded-md bg-warning-soft px-2 text-[11px] font-medium gap-1 text-warning-strong">
            <TriangleAlert className="size-3" aria-hidden="true" />
            다음 액션 없음
          </span>
        </FollowUpHint>
      );
    }
    return <span className="text-[12px] text-muted-foreground">—</span>;
  }

  if (state === "overdue") {
    return (
      <FollowUpHint
        tooltip={`다음 연락일이 ${formatDday(v!)} 지났습니다. 오늘 바로 연락하거나 다음 연락일을 다시 지정하세요.`}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-destructive-soft px-2 text-[11px] font-medium gap-1 text-destructive-strong">
            <AlarmClock className="size-3" aria-hidden="true" />
            {formatDday(v!)} 지남
          </span>
          <span className="truncate text-[12px] tabular-nums text-destructive-strong">
            {formatDate(v!)}
          </span>
        </div>
      </FollowUpHint>
    );
  }

  const isToday = state === "today";
  return (
    <FollowUpHint
      tooltip={
        isToday
          ? "오늘이 다음 연락 예정일입니다. 잊지 말고 연락하세요."
          : `다음 연락 예정일까지 ${formatDday(v!)} 남았습니다.`
      }
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium tabular-nums",
            isToday
              ? "bg-info-soft font-semibold text-info"
              : "bg-neutral-soft text-neutral-strong",
          )}
        >
          {isToday && <CalendarClock className="size-3" aria-hidden="true" />}
          {isToday ? "오늘" : formatDday(v!)}
        </span>
        <span
          className={cn(
            "truncate text-[12px] tabular-nums",
            isToday ? "font-medium text-foreground" : "text-foreground",
          )}
        >
          {formatDate(v!)}
        </span>
      </div>
    </FollowUpHint>
  );
}

/* ══════════════ 희망 조건 요약 칩 (클릭 → 인라인 펼침) ══════════════ */

export function wantSummary(r: BuyerRequirement): string {
  const parts = [...siteLabels(r).slice(0, 2), ...regionLabels(r).slice(0, 2)];
  return parts.length ? parts.join(" · ") : "지역·단지 미입력";
}

/* ══════════════ 인라인 펼침: 희망 조건 (시안 wOpen 패널) ══════════════ */

export function WantExpandPanel({ r }: { r: BuyerRequirement }) {
  const regions = regionLabels(r);
  const sites = r.preferredSites ?? [];
  const area = formatAreaRange(r.areaMin, r.areaMax);

  return (
    <div className="border-b border-[#ececea] bg-[#fbf8f4] py-3 pl-12 pr-4">
      <div className="mb-2.5 flex items-center gap-2">
        <UserRound className="size-3.5 text-[#b06f3c]" aria-hidden="true" />
        <span className="text-[12px] font-semibold text-[#8a5a2b]">
          {r.contact?.name ?? "고객"} 님의 희망 조건
        </span>
      </div>
      <div className="max-w-[820px] rounded-lg border border-[#efe7da] bg-white px-3.5 py-3">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
          <div className="flex min-w-[70px] flex-col gap-1">
            <span className="text-[10.5px] text-slate-500">거래</span>
            {r.transactionType ? (
              <StatusBadge
                kind="transactionType"
                status={r.transactionType}
                size="sm"
              />
            ) : (
              <span className="text-[12.5px] text-muted-foreground">—</span>
            )}
          </div>
          <div className="flex min-w-[150px] flex-col gap-1">
            <span className="text-[10.5px] text-slate-500">예산</span>
            <span className="text-[12.5px] font-medium tabular-nums text-foreground">
              {formatBudget(r)}
            </span>
          </div>
          <div className="flex min-w-[150px] flex-col gap-1">
            <span className="text-[10.5px] text-slate-500">공급평형</span>
            <span className="text-[12.5px] font-medium text-foreground">
              {area}
            </span>
          </div>
          <div className="flex min-w-[120px] flex-col gap-1">
            <span className="text-[10.5px] text-slate-500">입주 시기</span>
            <span className="text-[12.5px] font-medium text-foreground">
              {r.moveInDate ? formatDate(r.moveInDate) : "무관"}
            </span>
          </div>
        </div>
        {(regions.length > 0 || sites.length > 0) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#f3f2f0] pt-2.5">
            {regions.length > 0 && (
              <>
                <span className="mr-0.5 text-[10.5px] text-slate-500">
                  지역
                </span>
                {regions.map((label) => (
                  <span
                    key={`rg-${label}`}
                    className="inline-flex h-5 items-center rounded-md border border-[#e3e2df] bg-white px-2 text-[11px] font-medium text-foreground"
                  >
                    {label}
                  </span>
                ))}
              </>
            )}
            {sites.length > 0 && (
              <>
                <span className="mx-0.5 ml-2.5 text-[10.5px] text-slate-500">
                  단지
                </span>
                {sites.map((ps) => (
                  <span
                    key={`st-${ps.siteId}`}
                    className="inline-flex h-5 items-center gap-1 rounded-md border border-[#e3e2df] bg-white px-2 text-[11px] font-medium text-foreground"
                  >
                    {ps.priority === 1 && (
                      <Star
                        className="size-2.5 fill-[#e0a53d] text-[#e0a53d]"
                        aria-hidden="true"
                      />
                    )}
                    {ps.site?.name ?? "단지"}
                  </span>
                ))}
              </>
            )}
          </div>
        )}
        {r.memo?.trim() && (
          <div className="mt-2 flex items-start gap-2 border-t border-[#f3f2f0] pt-2.5">
            <span className="shrink-0 text-[10.5px] text-slate-500">메모</span>
            <p className="line-clamp-2 whitespace-pre-wrap text-[11.5px] text-slate-600">
              {r.memo}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════ 인라인 펼침: 매칭 페이지와 같은 브랜치 + 진행 트랙 ══════════════ */

export function MatchExpandPanel({
  requirement,
}: {
  requirement: BuyerRequirement;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [convertMatchId, setConvertMatchId] = useState<string | null>(null);
  const [deleteMatchId, setDeleteMatchId] = useState<string | null>(null);
  const {
    data: matches = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["matches", "by-buyer", requirement.id],
    queryFn: () => api.matches.findAll({ buyerReqId: requirement.id }),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.matches.updateStage(id, { stage }),
    onSuccess: (_, { stage }) => {
      toast.success(`${getMatchStageLabel(stage)} 단계로 변경했습니다.`);
      void queryClient.invalidateQueries({ queryKey: ["matches"] });
      void queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] });
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
      void queryClient.invalidateQueries({ queryKey: ["matches"] });
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
        await api.matches.updateStage(match.id, {
          stage: MatchStage.VIEWING,
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["matches"] });
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
      void queryClient.invalidateQueries({ queryKey: ["matches"] });
      void queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] });
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

  return (
    <div
      id={`buyer-match-panel-${requirement.id}`}
      role="region"
      aria-label={`${requirement.contact?.name ?? "고객"} 매칭`}
      className="border-b border-border bg-[#fbfbfa] py-3 pl-[60px] pr-4"
    >
      <div className="max-w-[1320px]">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
              <GitBranch className="size-3.5" aria-hidden="true" />
            </span>
            <span className="text-[12.5px] font-semibold text-foreground">
              {requirement.contact?.name ?? "고객"} 매칭
            </span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-[10.5px] font-semibold tabular-nums text-muted-foreground">
              {isLoading ? (requirement._count?.matches ?? 0) : matches.length}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 border-border bg-white px-2.5 text-[11.5px] font-semibold text-foreground shadow-none hover:bg-muted"
            onClick={() =>
              navigate({
                to: "/buyer-requirements/$id",
                params: { id: requirement.id },
              })
            }
          >
            <Plus className="size-3" />
            매칭 생성
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="ml-8 h-20 rounded-lg" />
        ) : isError ? (
          <div className="ml-8 flex h-20 items-center justify-between rounded-lg border border-destructive/20 bg-white px-3.5">
            <p className="text-xs text-destructive">
              매칭을 불러오지 못했습니다.
            </p>
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
            아직 연결된 매칭이 없습니다.
          </div>
        ) : (
          <BuyerMatchBranchList
            matches={matches}
            actions={actions}
            className="mb-0 ml-8 mr-0 mt-1.5"
          />
        )}
      </div>

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
            ? `${getMatchTitle(deleteMatch)} 매칭이 삭제됩니다. 진행 이력이 함께 사라지므로 종료 처리를 권장합니다.`
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

/* ══════════════ 일괄 액션 (DataTable 내장 선택 바에 주입) ══════════════ */

export function BuyerBulkActions({
  selected,
}: {
  selected: BuyerRequirement[];
}) {
  const queryClient = useQueryClient();
  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.employees.findAll(),
  });

  const [assignPending, setAssignPending] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const phones = useMemo(
    () =>
      selected
        .map((r) => r.contact?.phone)
        .filter((p): p is string => !!p)
        .map((p) => formatPhone(p)),
    [selected],
  );

  // 확인 다이얼로그에 보여줄 대상 미리보기 (최대 3명 + 외 N명)
  const assignPreview = useMemo(() => {
    const names = selected.map((r) => r.contact?.name ?? "이름 없음");
    const head = names.slice(0, 3).join(", ");
    return names.length > 3 ? `${head} 외 ${names.length - 3}명` : head;
  }, [selected]);

  const copyPhones = async () => {
    if (!phones.length) {
      toast.error("선택한 고객에 전화번호가 없습니다.");
      return;
    }
    await navigator.clipboard.writeText(phones.join(", "));
    toast.success(
      `전화번호 ${phones.length}건을 복사했습니다. 문자 앱에 붙여넣으세요.`,
    );
  };

  const assignTo = async (userId: string, name: string) => {
    setAssignPending(true);
    try {
      // 부분 실패를 삼키지 않도록 allSettled — 성공/실패 건수를 그대로 보고한다
      const results = await Promise.allSettled(
        selected.map((r) =>
          api.buyerRequirements.update(r.id, { assignedToId: userId }),
        ),
      );
      const failed = results.filter((res) => res.status === "rejected").length;
      const succeeded = results.length - failed;
      if (failed === 0) {
        toast.success(`${succeeded}명의 담당자를 ${name}님으로 변경했습니다.`);
      } else if (succeeded === 0) {
        toast.error("담당 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      } else {
        toast.warning(
          `${succeeded}명 변경 완료, ${failed}명 실패했습니다. 목록을 확인하고 실패분을 다시 시도해 주세요.`,
        );
      }
      if (succeeded > 0) {
        void queryClient.invalidateQueries({
          queryKey: ["buyer-requirements"],
        });
      }
    } finally {
      setAssignPending(false);
      setAssignTarget(null);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!phones.length}
        title={
          phones.length
            ? `전화번호 ${phones.length}건을 복사해 문자 앱에 붙여넣습니다`
            : "선택한 고객에 전화번호가 없습니다"
        }
        className="h-6 rounded-md px-2.5 text-[11.5px] font-medium text-slate-600"
        onClick={copyPhones}
      >
        <MessageCircle className="size-3" />
        단체 문자
        <span className="rounded bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {phones.length}
        </span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={assignPending || selected.length === 0}
            title={`선택한 요건 ${selected.length}건의 담당자를 변경합니다`}
            className="h-6 rounded-md px-2.5 text-[11.5px] font-medium text-slate-600"
          >
            {assignPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <UserRound className="size-3" />
            )}
            담당 변경
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {employees
            .filter((e) => e.isActive)
            .map((e) => (
              <DropdownMenuItem
                key={e.id}
                disabled={assignPending}
                onClick={() => setAssignTarget({ id: e.id, name: e.name })}
              >
                {e.name}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={assignTarget !== null}
        onOpenChange={(open) => {
          if (!open && !assignPending) setAssignTarget(null);
        }}
        title="담당자를 변경하시겠습니까?"
        description={
          assignTarget
            ? `${assignPreview} — 선택한 구함 요건 ${selected.length}건의 담당자가 ${assignTarget.name}님으로 변경됩니다.`
            : undefined
        }
        confirmLabel="담당 변경"
        loading={assignPending}
        onConfirm={() => {
          if (assignTarget) void assignTo(assignTarget.id, assignTarget.name);
        }}
      />
    </>
  );
}
