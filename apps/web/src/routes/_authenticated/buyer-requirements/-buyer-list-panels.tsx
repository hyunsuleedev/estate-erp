import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  GitBranch,
  MessageCircle,
  Plus,
  Star,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import type { BuyerRequirement, Match } from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatDate, formatDday, formatMoney, formatPhone } from "@/lib/format";
import {
  getStatusMeta,
  PIPELINE_STEPS,
  STATUS_CONFIG,
} from "@/lib/status-config";
import { StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatAreaRange,
  formatBudget,
  getFollowUpState,
  regionLabels,
  siteLabels,
  SITE_TYPE_LABELS,
} from "./-buyer-utils";

/* ══════════════ 다음 액션 셀 (시안: D-n · 지연 배지 · "다음 액션 없음") ══════════════ */

export function NextActionCell({ r }: { r: BuyerRequirement }) {
  const v = r.nextContactDate;
  const state = getFollowUpState(v);

  if (state === "none") {
    // 활성 의뢰인데 다음 연락 계획이 없으면 방치 위험 — 시안의 노랑 경고 배지
    if (r.status === "active" || r.status === "matched") {
      return (
        <span className="inline-flex h-[18px] items-center rounded-[5px] bg-warning-soft px-[7px] text-[10px] font-bold text-warning-strong">
          다음 액션 없음
        </span>
      );
    }
    return <span className="text-[12px] text-muted-foreground">—</span>;
  }

  if (state === "overdue") {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="inline-flex h-[18px] shrink-0 items-center rounded-[5px] bg-destructive-soft px-[6px] text-[10px] font-bold text-destructive-strong">
          {formatDday(v!)} 지남
        </span>
        <span className="truncate text-[12px] tabular-nums text-destructive-strong">
          {formatDate(v!)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
        {state === "today" ? "오늘" : formatDday(v!)}
      </span>
      <span className="truncate text-[12px] tabular-nums text-foreground">
        {formatDate(v!)}
      </span>
    </div>
  );
}

/* ══════════════ 희망 조건 요약 칩 (클릭 → 인라인 펼침) ══════════════ */

export function wantSummary(r: BuyerRequirement): string {
  const parts = [
    ...siteLabels(r).slice(0, 2),
    ...regionLabels(r).slice(0, 2),
    ...(r.siteTypes ?? []).slice(0, 1).map((t) => SITE_TYPE_LABELS[t] ?? t),
  ];
  return parts.length ? parts.join(" · ") : "조건 미입력";
}

/* ══════════════ 인라인 펼침: 희망 조건 (시안 wOpen 패널) ══════════════ */

export function WantExpandPanel({ r }: { r: BuyerRequirement }) {
  const regions = regionLabels(r);
  const sites = r.preferredSites ?? [];
  const must = r.mustConditions ?? [];
  const prefer = r.preferConditions ?? [];
  const kinds = (r.siteTypes ?? [])
    .map((t) => SITE_TYPE_LABELS[t] ?? t)
    .join(", ");
  const area = formatAreaRange(r.areaMin, r.areaMax);
  const kindDisp =
    [kinds, area !== "—" ? area : null].filter(Boolean).join(" · ") || "—";

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
            <span className="text-[10.5px] text-slate-500">물건 · 면적</span>
            <span className="text-[12.5px] font-medium text-foreground">
              {kindDisp}
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
        {(must.length > 0 || prefer.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {must.map((label) => (
              <span
                key={`m-${label}`}
                className="inline-flex h-5 items-center rounded-md bg-destructive-soft px-2 text-[11px] font-semibold text-destructive-strong"
              >
                필수 · {label}
              </span>
            ))}
            {prefer.map((label) => (
              <span
                key={`p-${label}`}
                className="inline-flex h-5 items-center rounded-md bg-secondary px-2 text-[11px] text-slate-600"
              >
                선호 · {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════ 인라인 펼침: 매칭 후보 + 단계 스텝퍼 (시안 isOpen 패널) ══════════════ */

const MATCH_STEPS = PIPELINE_STEPS.matchStage ?? [];

function matchTitle(m: Match): string {
  const site =
    m.property?.site?.name ?? m.listing?.property?.site?.name ?? "매물";
  const dong = m.property?.unit?.dong?.name;
  const unit = m.property?.unit?.name;
  return [site, dong && dong !== "-" ? dong : null, unit]
    .filter(Boolean)
    .join(" ");
}

function matchPrice(m: Match): string {
  const l = m.listing;
  if (!l) return "—";
  if (l.transactionType === "monthly") {
    return `${l.deposit ? formatMoney(l.deposit) : "—"} / ${l.monthlyRent ? formatMoney(l.monthlyRent) : "—"}`;
  }
  const v = l.transactionType === "jeonse" ? l.deposit : l.price;
  return v ? formatMoney(v) : "—";
}

export function MatchExpandPanel({
  requirement,
}: {
  requirement: BuyerRequirement;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: matches, isLoading } = useQuery({
    queryKey: ["matches", "by-buyer", requirement.id],
    queryFn: () => api.matches.findAll({ buyerReqId: requirement.id }),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.matches.updateStage(id, { stage }),
    onSuccess: (_, { stage }) => {
      toast.success(
        `'${getStatusMeta("matchStage", stage).label}' 단계로 변경되었습니다.`,
      );
      void queryClient.invalidateQueries({
        queryKey: ["matches", "by-buyer", requirement.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] });
    },
    onError: () => toast.error("단계 변경에 실패했습니다."),
  });

  return (
    <div className="border-b border-[#ececea] bg-[#fbf8f4] py-3 pl-12 pr-4">
      <div className="mb-2.5 flex items-center gap-2">
        <GitBranch className="size-3.5 text-[#b06f3c]" aria-hidden="true" />
        <span className="text-[12px] font-semibold text-[#8a5a2b]">
          {requirement.contact?.name ?? "고객"} 님의 매칭 후보{" "}
          {matches?.length ?? 0}건
        </span>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 rounded-[7px] border-[#e3d3bb] bg-white px-2.5 text-[11.5px] font-semibold text-[#8a5a2b] hover:bg-[#faf5ec] hover:text-[#8a5a2b]"
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
        <Skeleton className="h-16 max-w-[860px] rounded-lg" />
      ) : !matches?.length ? (
        <p className="text-[12px] text-slate-600">
          아직 매칭이 없습니다. 매칭 생성에서 후보 매물을 연결해 보세요.
        </p>
      ) : (
        <div className="flex max-w-[900px] flex-col gap-1.5">
          {matches.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-[#efe7da] bg-white px-3 py-2.5 transition-colors hover:border-[#e3d3bb]"
            >
              <div className="mb-2 flex items-center gap-2.5">
                <Building2
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <Link
                  to="/matches"
                  className="truncate text-[13px] font-semibold text-foreground hover:underline"
                >
                  {matchTitle(m)}
                </Link>
                <span className="h-3 w-px shrink-0 bg-[#ececea]" />
                <span className="shrink-0 text-[11px] text-slate-500">
                  호가
                </span>
                <span className="shrink-0 text-[12px] font-medium tabular-nums text-foreground">
                  {matchPrice(m)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-y-1">
                {MATCH_STEPS.map((stage, index) => {
                  const currentIndex = MATCH_STEPS.indexOf(m.stage);
                  const isCurrent = stage === m.stage;
                  const isDone = currentIndex >= 0 && index < currentIndex;
                  return (
                    <div key={stage} className="flex items-center">
                      <button
                        type="button"
                        disabled={stageMutation.isPending || isCurrent}
                        onClick={() =>
                          stageMutation.mutate({ id: m.id, stage })
                        }
                        title={`${getStatusMeta("matchStage", stage).label} 단계로 이동`}
                        className={cn(
                          "inline-flex h-[26px] items-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-semibold transition-[filter] hover:brightness-[.97] disabled:cursor-default",
                          isCurrent
                            ? "border-transparent bg-foreground text-background"
                            : isDone
                              ? "border-transparent bg-success-soft text-success"
                              : "border-[#e3e2df] bg-white text-slate-600",
                        )}
                      >
                        {getStatusMeta("matchStage", stage).label}
                      </button>
                      {index < MATCH_STEPS.length - 1 && (
                        <span
                          className={cn(
                            "h-0.5 w-3",
                            isDone ? "bg-success-soft" : "bg-[#ececea]",
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
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

  const copyPhones = async () => {
    const phones = selected
      .map((r) => r.contact?.phone)
      .filter((p): p is string => !!p)
      .map((p) => formatPhone(p));
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
        void queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] });
      }
    } finally {
      setAssignPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 rounded-md px-2.5 text-[11.5px] font-medium text-slate-600"
        onClick={copyPhones}
      >
        <MessageCircle className="size-3" />
        단체 문자
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={assignPending}
            className="h-6 rounded-md px-2.5 text-[11.5px] font-medium text-slate-600"
          >
            <UserRound className="size-3" />
            담당 변경
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {employees
            .filter((e) => e.isActive)
            .map((e) => (
              <DropdownMenuItem
                key={e.id}
                onClick={() => assignTo(e.id, e.name)}
              >
                {e.name}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/* ══════════════ 파이프라인(칸반) 뷰 (시안 brIsPipe) ══════════════ */

const LANE_ORDER = ["active", "matched", "completed", "inactive"] as const;

export function BuyerPipelineView({
  items,
  onOpen,
}: {
  items: BuyerRequirement[];
  onOpen: (r: BuyerRequirement) => void;
}) {
  return (
    <div className="flex-1 overflow-auto rounded-xl border border-border bg-[#fcfbf9] p-4">
      <div className="flex min-w-[1060px] items-start gap-3">
        {LANE_ORDER.map((status) => {
          const meta = STATUS_CONFIG.buyerStatus[status];
          const cards = items.filter((r) => r.status === status);
          return (
            <div
              key={status}
              className="min-w-[240px] flex-1 rounded-xl border border-[#eeedeb] bg-[#f6f5f2] p-2.5"
            >
              <div className="flex items-center gap-2 px-1 pb-2.5 pt-0.5">
                <StatusBadge kind="buyerStatus" status={status} size="sm" />
                <span className="text-[11.5px] tabular-nums text-slate-500">
                  {cards.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {cards.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-[#e3e2df] px-3 py-5 text-center text-[11px] text-slate-500">
                    {meta?.label ?? status} 의뢰 없음
                  </div>
                ) : (
                  cards.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onOpen(r)}
                      className="flex flex-col gap-1.5 rounded-[10px] border border-[#e9e8e5] bg-white px-3 py-2.5 text-left transition-[border-color,box-shadow] hover:border-[#d6d3cd] hover:shadow-[0_2px_6px_rgba(55,53,47,.05)]"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 text-[13px] font-semibold text-foreground">
                          {r.contact?.name ?? "고객"}
                        </span>
                        <span className="min-w-0 truncate text-[10.5px] tabular-nums text-slate-500">
                          {r.contact?.phone ? formatPhone(r.contact.phone) : ""}
                        </span>
                        <div className="flex-1" />
                        {r.transactionType && (
                          <StatusBadge
                            kind="transactionType"
                            status={r.transactionType}
                            size="sm"
                          />
                        )}
                      </div>
                      <div className="text-[12px] font-semibold tabular-nums text-foreground">
                        {formatBudget(r)}
                      </div>
                      <div className="truncate text-[11.5px] text-slate-600">
                        {wantSummary(r)}
                      </div>
                      <div className="flex min-w-0 items-center">
                        <NextActionCell r={r} />
                      </div>
                      <div className="flex items-center gap-1.5 border-t border-[#f3f2f0] pt-1.5 text-[11px] text-slate-500">
                        <GitBranch className="size-3" aria-hidden="true" />
                        <span>매칭 {r._count?.matches ?? 0}</span>
                        <div className="flex-1" />
                        <span>{r.assignedTo?.name ?? "미지정"}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
