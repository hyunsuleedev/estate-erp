import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ListOrdered,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type {
  CustomerLedgerRow,
  ProjectPlan,
  ProjectStep,
} from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/providers/auth-provider";
import { announceProjectChange } from "@/lib/project-sync";
import { cn } from "@/lib/utils";
import { formatDate, formatPhone } from "@/lib/format";
import { getStatusMeta } from "@/lib/status-config";
import { ConfirmDialog, StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  moveStep,
  planStepOrder,
  toggleWithPrevious,
} from "./-project-plan-order";
import {
  canRemoveProject,
  decideTextCommit,
  describeProjectRemoval,
  getProjectTitle,
} from "../projects/-project-model";
import { isProjectRemoved, markProjectRemoved } from "../projects/-project-hooks";
import { ProjectNewIntakeButtons } from "../projects/-project-new-intake";
import {
  closeProjectPlan,
  openProjectPlan,
  useProjectPlanTarget,
} from "./-project-plan-store";

const planQueryKey = (id: string) => ["projects", "plan", id] as const;

const STEP_KIND_LABEL: Record<ProjectStep["kind"], string> = {
  listing_intake: "매물 의뢰",
  buyer_intake: "구매 의뢰",
  deal: "거래",
  manual: "직접 추가",
};

/** 토스트 · 오류 줄의 문구. 서버가 준 사람용 문구가 없으면 fallback (공용 apiErrorMessage). */
function errorMessage(error: unknown, fallback: string) {
  return apiErrorMessage(error, fallback);
}

/**
 * 진행 계획 창이 뜨는, 화면에 하나뿐인 자리.
 *
 * 창을 여는 메뉴는 고객 원장의 줄마다 있지만 창은 여기 하나다. 원장이 다시
 * 불러와져 줄이 새로 그려지거나 목록에서 빠져도 창과 입력 중인 글이 남는다.
 *
 * 프로젝트가 없는 줄에서 열면 그 줄의 의뢰들을 한 프로젝트로 묶을지 묻고(서버가 알아서 묶지
 * 않는다), 프로젝트가 있으면 진행 계획을 보여 준다. 순서와 단계는 사람이 정하고, 각 단계의
 * 진행 상태와 잔금일은 의뢰·거래에서 읽어 옆에 보여 줄 뿐이다.
 */
export function ProjectPlanHost() {
  const queryClient = useQueryClient();
  const target = useProjectPlanTarget();
  // 이 화면을 떠났다가 돌아왔을 때 예전 창이 다시 뜨지 않게 한다.
  useEffect(() => closeProjectPlan, []);

  const close = () => {
    // 창 안에서 바꾼 것은 닫을 때 한 번에 원장과 프로젝트 목록에 반영한다.
    void queryClient.invalidateQueries({
      queryKey: ["projects", "ledger"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["projects", "list"],
    });
    closeProjectPlan();
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        className="flex max-h-[min(86vh,820px)] flex-col gap-0 p-0 sm:max-w-2xl"
        onClick={(event) => event.stopPropagation()}
        // 창이 열릴 때 첫 칸(프로젝트 이름)에 들어가 글 전체가 선택되면, 무심코 친 글자가 이름을 덮어쓴다.
        // 어느 칸에도 들어가지 않은 채로 연다.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          // 글을 고치는 중의 Esc는 그 칸만 되돌린다. 창까지 닫으면 다른 칸에 쓰던
          // 글도 함께 사라진다.
          const active = document.activeElement;
          if (
            active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement
          ) {
            event.preventDefault();
          }
        }}
      >
        {target?.kind === "case" && (
          <PlanView
            key={target.projectId}
            projectId={target.projectId}
            customerName={target.customerName}
            onClose={close}
            onRemoved={close}
          />
        )}
        {target?.kind === "bundle" && (
          <BundlePrompt
            ledgerRow={target.row}
            customerName={target.customerName}
            onCancel={close}
            onCreated={(projectId) =>
              // 묶은 뒤에는 그 프로젝트의 진행 계획으로 바로 넘어간다.
              openProjectPlan({
                kind: "case",
                projectId,
                customerName: target.customerName,
              })
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 프로젝트 목록. 고객 원장은 진행 중인 의뢰만 보여 주므로, 의뢰가 모두 종료된 프로젝트나
 * 거래·직접 추가 단계만 있는 프로젝트는 원장에 줄이 없다. 그런 프로젝트의 진행 계획도 여기서 연다.
 */
export function ProjectListButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const listQuery = useQuery({
    queryKey: ["projects", "list"],
    queryFn: () => api.projects.findAll(),
  });
  const projects = listQuery.data?.items ?? [];
  // 목록은 쪽 단위로 온다. 개수는 전체 수를 쓴다.
  const projectTotal = listQuery.data?.total ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={className}
          aria-label={`프로젝트 ${projectTotal}개`}
        >
          <ListOrdered className="size-3.5" />
          프로젝트
          {projectTotal > 0 && (
            <span className="tabular-nums text-muted-foreground">
              {projectTotal}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">
          직접 연 프로젝트입니다. 의뢰가 모두 끝난 프로젝트도 여기서 엽니다.
        </p>
        {listQuery.isLoading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">불러오는 중</p>
        ) : listQuery.isError ? (
          <p className="px-3 py-4 text-sm text-destructive" role="alert">
            {errorMessage(listQuery.error, "프로젝트를 불러오지 못했습니다.")}
          </p>
        ) : projects.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            아직 연 프로젝트가 없습니다. 고객 원장의 줄 메뉴에서 "프로젝트 열기"를
            누르세요.
          </p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {projects.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
                  onClick={() => {
                    setOpen(false);
                    openProjectPlan({
                      kind: "case",
                      projectId: item.id,
                      customerName: item.customerName,
                    });
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {getProjectTitle(item)}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {item.stepCount}단계
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function BundlePrompt({
  ledgerRow,
  customerName,
  onCancel,
  onCreated,
}: {
  ledgerRow: CustomerLedgerRow;
  customerName: string;
  onCancel: () => void;
  onCreated: (projectId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  // 화면에 보이는 줄이 아니라 이 고객의 진행 중 의뢰 전부를 묶는다. 필터에 걸러졌거나
  // 거래 조건이 아직 없는 의뢰도 빠지지 않는다. 이름은 보이는 줄에서 찾고, 없으면
  // 종류만 적는다.
  const listingLabels = new Map(
    ledgerRow.listingIntents.map((line) => [
      line.listingIntakeId,
      line.contextLabel,
    ]),
  );
  const buyerLabels = new Map(
    ledgerRow.demandIntents.map((line) => [
      line.buyerIntakeId,
      line.contextLabel,
    ]),
  );
  const listingIntakeIds = ledgerRow.listingIntakeIds ?? [
    ...listingLabels.keys(),
  ];
  const buyerIntakeIds = ledgerRow.buyerIntakeIds ?? [...buyerLabels.keys()];
  const listingIntakes = listingIntakeIds.map((id) => ({
    listingIntakeId: id,
    contextLabel: listingLabels.get(id) ?? "매물 의뢰",
  }));
  const buyerIntakes = buyerIntakeIds.map((id) => ({
    buyerIntakeId: id,
    contextLabel: buyerLabels.get(id) ?? "구매 의뢰",
  }));
  const intakeCount = listingIntakes.length + buyerIntakes.length;
  // 두 번 눌러도 한 번만 연다(isPending은 다음 그리기에야 바뀐다).
  const submitting = useRef(false);

  const create = useMutation({
    mutationFn: () =>
      api.projects.create({
        title: title.trim() || null,
        listingIntakeIds: listingIntakes.map((line) => line.listingIntakeId),
        buyerIntakeIds: buyerIntakes.map((line) => line.buyerIntakeId),
      }),
    onSuccess: (plan) => {
      queryClient.setQueryData(planQueryKey(plan.id), plan);
      announceProjectChange("changed", plan.id);
      onCreated(plan.id);
    },
    onError: (error) =>
      toast.error(errorMessage(error, "프로젝트를 열지 못했습니다.")),
    onSettled: () => {
      submitting.current = false;
    },
  });

  return (
    <>
      <DialogHeader className="border-b px-6 py-4">
        <DialogTitle>프로젝트 열기</DialogTitle>
        <DialogDescription>
          {customerName}님의 의뢰 {intakeCount}개를 프로젝트에 담고 진행 순서를
          정합니다. 의뢰와 거래는 그대로 남습니다.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 overflow-y-auto px-6 py-4">
        <ul className="divide-y text-sm">
          {listingIntakes.map((line) => (
            <li
              key={line.listingIntakeId}
              className="flex items-center gap-2 py-2"
            >
              <span className="w-16 shrink-0 text-xs text-muted-foreground">
                매물 의뢰
              </span>
              <span className="min-w-0 truncate">{line.contextLabel}</span>
            </li>
          ))}
          {buyerIntakes.map((line) => (
            <li
              key={line.buyerIntakeId}
              className="flex items-center gap-2 py-2"
            >
              <span className="w-16 shrink-0 text-xs text-muted-foreground">
                구매 의뢰
              </span>
              <span className="min-w-0 truncate">{line.contextLabel}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-2">
          <Label htmlFor="project-title">프로젝트 이름 (선택)</Label>
          <Input
            id="project-title"
            value={title}
            maxLength={100}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={`예: ${customerName} 갈아타기`}
            disabled={create.isPending}
          />
        </div>
      </div>
      <DialogFooter className="border-t px-6 py-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={create.isPending}
        >
          취소
        </Button>
        <Button
          type="button"
          onClick={() => {
            if (submitting.current) return;
            submitting.current = true;
            create.mutate();
          }}
          disabled={create.isPending || intakeCount === 0}
        >
          {create.isPending && <Loader2 className="size-4 animate-spin" />}
          프로젝트 열기
        </Button>
      </DialogFooter>
    </>
  );
}

function PlanView({
  projectId,
  customerName,
  onClose,
  onRemoved,
}: {
  projectId: string;
  customerName: string | null;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const queryClient = useQueryClient();
  const mayRemove = canRemoveProject(useAuth().user?.role);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState("");

  // 이 탭에서 푼 프로젝트는 창이 닫히는 동안 다시 읽지 않는다.
  const removed = isProjectRemoved(projectId);
  const planQuery = useQuery({
    queryKey: planQueryKey(projectId),
    queryFn: () => api.projects.findOne(projectId),
    enabled: !removed,
  });
  const candidatesQuery = useQuery({
    queryKey: [...planQueryKey(projectId), "candidates"],
    queryFn: () => api.projects.candidates(projectId),
    enabled: !removed,
    // 다른 탭에서 새 의뢰를 등록하고 돌아와 창을 다시 열면 그 의뢰가 바로 보이게 늘 새로 읽는다.
    staleTime: 0,
  });

  const applyPlan = (plan: ProjectPlan) => {
    queryClient.setQueryData(planQueryKey(projectId), plan);
    // 이 창에서 고친 것을 다른 탭(열어 둔 상세 · 목록)도 다시 읽게 한다.
    announceProjectChange("changed", projectId);
    void queryClient.invalidateQueries({
      queryKey: [...planQueryKey(projectId), "candidates"],
    });
  };
  const change = useMutation({
    // 저장을 하나씩 차례로 보낸다. 빠르게 이어서 고쳐도 늦게 온 앞 응답이 화면을
    // 예전 상태로 되돌리지 않는다.
    scope: { id: `project-plan-${projectId}` },
    mutationFn: (run: () => Promise<ProjectPlan>) => run(),
    onSuccess: applyPlan,
    onError: (error) => {
      toast.error(errorMessage(error, "저장하지 못했습니다."));
      // 다른 곳에서 바뀐 계획일 수 있으니 다시 불러온다.
      void queryClient.invalidateQueries({ queryKey: planQueryKey(projectId) });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.projects.remove(projectId),
    onSuccess: () => {
      markProjectRemoved(projectId);
      queryClient.removeQueries({ queryKey: planQueryKey(projectId) });
      queryClient.removeQueries({ queryKey: ["projects", "comments", projectId] });
      toast.success("프로젝트를 풀었습니다. 의뢰와 거래는 그대로 있습니다.");
      // 다른 탭에 열려 있는 이 프로젝트의 상세 · 목록도 알게 한다.
      announceProjectChange("removed", projectId);
      onRemoved();
    },
    onError: (error) =>
      toast.error(errorMessage(error, "프로젝트를 풀지 못했습니다.")),
  });

  const plan = planQuery.data;
  const order = plan ? planStepOrder(plan.steps) : [];
  const saveOrder = (next: ReturnType<typeof planStepOrder>) =>
    change.mutate(() =>
      api.projects.reorderSteps(
        projectId,
        next.map((item) => ({ id: item.id, sortOrder: item.sortOrder })),
      ),
    );
  const busy = change.isPending || remove.isPending;
  const candidates = candidatesQuery.data;
  const hasCandidates = Boolean(
    candidates &&
    candidates.listingIntakes.length +
      candidates.buyerIntakes.length +
      candidates.deals.length >
      0,
  );

  return (
    <>
      <DialogHeader className="border-b px-6 py-4">
        <DialogTitle>진행 계획</DialogTitle>
        <DialogDescription>
          {customerName ? `${customerName}님 프로젝트의` : "이 프로젝트의"} 단계와 순서를
          정합니다. 진행 상태와 잔금일은 각 의뢰와 거래에서 읽어 옵니다.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 이미 불러온 계획이 있으면 그대로 둔다. 배경에서 다시 불러오다 실패했다고
            오류 화면으로 바꾸면 고치던 칸이 모두 사라진다. */}
        {!plan ? (
          planQuery.isError ? (
            <div className="px-6 py-10 text-sm text-destructive" role="alert">
              {errorMessage(
                planQuery.error,
                "진행 계획을 불러오지 못했습니다.",
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-6 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 불러오는 중
            </div>
          )
        ) : (
          <>
            {planQuery.isError && (
              <p
                role="alert"
                className="border-b bg-destructive/5 px-6 py-2 text-xs text-destructive"
              >
                최신 내용을 다시 불러오지 못했습니다. 아래는 마지막으로 불러온
                내용입니다.
              </p>
            )}
            <div className="border-b px-6 py-3">
              <SavedInput
                key="case-title"
                saving={change.isPending}
                ariaLabel="프로젝트 이름"
                value={plan.title ?? ""}
                placeholder="프로젝트 이름 (선택)"
                maxLength={100}
                className="h-8 w-full text-[15px] font-medium"
                onSave={(title) =>
                  change.mutate(() =>
                    api.projects.update(projectId, { title: title || null }),
                  )
                }
              />
            </div>

            <ol aria-label="진행 계획 단계" className="divide-y">
              {plan.steps.map((step, index) => {
                const position = order[index];
                const previous = order[index - 1];
                return (
                  <StepRow
                    key={step.id}
                    step={step}
                    sortOrder={position?.sortOrder ?? step.sortOrder}
                    sharesOrderWithPrevious={Boolean(
                      previous &&
                      position &&
                      previous.sortOrder === position.sortOrder,
                    )}
                    isFirst={index === 0}
                    isLast={index === plan.steps.length - 1}
                    disabled={busy}
                    onMove={(direction) =>
                      saveOrder(moveStep(order, index, direction))
                    }
                    onToggleWithPrevious={() =>
                      saveOrder(toggleWithPrevious(order, index))
                    }
                    onUpdate={(dto) =>
                      change.mutate(() =>
                        api.projects.updateStep(projectId, step.id, dto),
                      )
                    }
                    onRemove={() =>
                      change.mutate(() =>
                        api.projects.removeStep(projectId, step.id),
                      )
                    }
                  />
                );
              })}
              {plan.steps.length === 0 && (
                <li className="px-6 py-6 text-sm text-muted-foreground">
                  아직 단계가 없습니다. 아래에서 이 손님의 의뢰를 담거나, 할 일을 단계로
                  적으세요(예: 대출 상담, 이사).
                </li>
              )}
            </ol>

            <form
              className="flex items-center gap-2 border-t px-6 py-3"
              onSubmit={(event) => {
                event.preventDefault();
                const title = newStepTitle.trim();
                if (!title) return;
                // 보내는 즉시 비운다. 저장이 끝난 뒤에 비우면 그사이 새로 친 글이 사라진다.
                setNewStepTitle("");
                change.mutate(
                  () => api.projects.createStep(projectId, { title }),
                  {
                    // 저장하지 못했으면 되돌려 준다. 그사이 다른 글을 쳤으면 그대로 둔다.
                    onError: () =>
                      setNewStepTitle((current) => current || title),
                  },
                );
              }}
            >
              <Input
                aria-label="추가할 단계 이름"
                value={newStepTitle}
                maxLength={100}
                onChange={(event) => setNewStepTitle(event.target.value)}
                placeholder="단계 추가 (예: 대출 실행, 이사)"
                className="h-8"
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                // 다른 저장이 진행 중이어도 막지 않는다. 막으면 Enter가 조용히 무시된다
                // (저장은 차례로 보내진다).
                disabled={!newStepTitle.trim()}
              >
                <Plus className="size-3.5" /> 추가
              </Button>
            </form>

            <section
              aria-label="프로젝트에 담을 수 있는 것"
              className="border-t px-6 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  담을 수 있는 의뢰·거래 (이 프로젝트 고객의 것)
                </h3>
                {/* 처음 받은 의뢰는 여기서 등록하러 간다. 만든 의뢰는 돌아와 아래 목록 맨 위에서 담는다. */}
                <ProjectNewIntakeButtons
                  projectId={projectId}
                  primaryContactId={plan.primaryContact?.id ?? null}
                  variant="line"
                  className="[&_button]:h-7 [&_button]:text-[12.5px]"
                  onOpen={onClose}
                />
              </div>
              {hasCandidates && candidates ? (
                <ul className="mt-1 divide-y text-sm">
                  {orderCandidateIntakes(candidates).map((item) => (
                    <CandidateRow
                      key={`${item.kind}-${item.id}`}
                      kind={item.kind === "listing" ? "매물 의뢰" : "구매 의뢰"}
                      label={
                        (item.kind === "listing" ? item.label : `${item.label} 구매 의뢰`) +
                        (item.lifecycleStatus === "closed" ? " (종료된 의뢰)" : "")
                      }
                      fresh={isFreshCandidate(item.createdAt)}
                      disabled={busy}
                      onAdd={() =>
                        change.mutate(() =>
                          api.projects.addIntake(projectId, {
                            kind: item.kind,
                            intakeId: item.id,
                          }),
                        )
                      }
                    />
                  ))}
                  {candidates.deals.map((deal) => (
                    <CandidateRow
                      key={`deal-${deal.id}`}
                      kind="거래"
                      label={
                        [
                          deal.propertyLabel,
                          getStatusMeta("dealStage", deal.stage).label,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "거래"
                      }
                      disabled={busy}
                      onAdd={() =>
                        change.mutate(() =>
                          api.projects.createStep(projectId, {
                            dealId: deal.id,
                          }),
                        )
                      }
                    />
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {candidatesQuery.isPending
                    ? "불러오는 중"
                    : "이 프로젝트 고객에게 더 담을 의뢰가 없습니다. 새로 받은 의뢰면 오른쪽 단추로 등록한 뒤 돌아와 여기서 담으세요."}
                </p>
              )}
            </section>

            <OtherCustomerCandidates
              projectId={projectId}
              disabled={busy}
              onAddIntake={(kind, intakeId) =>
                change.mutate(() => api.projects.addIntake(projectId, { kind, intakeId }))
              }
              onAddDeal={(dealId) =>
                change.mutate(() => api.projects.createStep(projectId, { dealId }))
              }
            />
          </>
        )}
      </div>

      <DialogFooter className="border-t px-6 py-3 sm:justify-between">
        {/* 풀기는 대표 · 매니저만(남이 적은 코멘트까지 지워진다). 중개사에게는 두지 않는다. */}
        {mayRemove ? (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmRemove(true)}
            disabled={busy || !plan}
          >
            프로젝트 풀기
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          닫기
        </Button>
      </DialogFooter>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="프로젝트를 풀까요?"
        description={describeProjectRemoval(plan?.commentCount ?? 0)}
        confirmLabel="풀기"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

function StepRow({
  step,
  sortOrder,
  sharesOrderWithPrevious,
  isFirst,
  isLast,
  disabled,
  onMove,
  onToggleWithPrevious,
  onUpdate,
  onRemove,
}: {
  step: ProjectStep;
  sortOrder: number;
  sharesOrderWithPrevious: boolean;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onMove: (direction: "up" | "down") => void;
  onToggleWithPrevious: () => void;
  onUpdate: (dto: {
    title?: string;
    targetDate?: string | null;
    memo?: string | null;
    done?: boolean;
  }) => void;
  onRemove: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const linksIntake =
    step.kind === "listing_intake" || step.kind === "buyer_intake";

  return (
    <li
      data-step-kind={step.kind}
      className={cn("flex gap-3 px-6 py-3", step.done && "bg-muted/30")}
    >
      <div
        className="w-6 shrink-0 pt-1.5 text-center text-sm tabular-nums text-muted-foreground"
        title={sharesOrderWithPrevious ? "앞 단계와 동시에 진행" : undefined}
      >
        {sharesOrderWithPrevious ? "〃" : sortOrder}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          {step.kind === "manual" && (
            <Checkbox
              aria-label={`${step.title} 완료`}
              checked={step.done}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onUpdate({ done: checked === true })
              }
            />
          )}
          <SavedInput
            key="title"
            saving={disabled}
            ariaLabel="단계 이름"
            value={step.title}
            maxLength={100}
            required
            className={cn(
              "h-7 w-full text-sm font-medium",
              step.done && "text-muted-foreground",
            )}
            onSave={(title) => onUpdate({ title })}
          />
        </div>

        <StepFlow step={step} />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            목표일
            <SavedInput
              key="target-date"
              saving={disabled}
              ariaLabel={`${step.title} 목표일`}
              type="date"
              value={step.targetDate ? step.targetDate.slice(0, 10) : ""}
              className="h-6 w-[8.25rem] text-xs text-foreground"
              onSave={(value) => onUpdate({ targetDate: value || null })}
            />
          </label>
          <SavedInput
            key="memo"
            saving={disabled}
            ariaLabel={`${step.title} 메모`}
            value={step.memo ?? ""}
            maxLength={2000}
            placeholder="메모 (금액, 조건 등)"
            className="h-6 min-w-40 flex-1 text-xs text-foreground"
            onSave={(memo) => onUpdate({ memo: memo || null })}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-start gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${step.title} 위로`}
          title="위로"
          disabled={disabled || isFirst}
          onClick={() => onMove("up")}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${step.title} 아래로`}
          title="아래로"
          disabled={disabled || isLast}
          onClick={() => onMove("down")}
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-pressed={sharesOrderWithPrevious}
          title="앞 단계와 동시에 진행"
          disabled={disabled || isFirst}
          className={cn(
            "px-1.5 text-xs",
            sharesOrderWithPrevious && "bg-muted text-foreground",
          )}
          onClick={onToggleWithPrevious}
        >
          동시
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${step.title} 단계 빼기`}
          title={linksIntake ? "프로젝트에서 빼기" : "단계 지우기"}
          disabled={disabled}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => (linksIntake ? setConfirmRemove(true) : onRemove())}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="이 의뢰를 프로젝트에서 뺄까요?"
        description="의뢰와 거래는 그대로 남고, 이 프로젝트의 진행 계획에서만 빠집니다."
        confirmLabel="프로젝트에서 빼기"
        destructive
        onConfirm={() => {
          setConfirmRemove(false);
          onRemove();
        }}
      />
    </li>
  );
}

/** 단계가 가리키는 의뢰·거래의 현재 상태를 한 줄로. 저장된 값이 아니라 읽어 온 값이다. */
export function StepFlow({ step }: { step: ProjectStep }) {
  if (step.kind === "manual") return null;

  const parts: ReactNode[] = [];
  if (step.listingIntake) {
    parts.push(
      <Link
        key="intake"
        to="/properties/$id"
        params={{ id: step.listingIntake.propertyId }}
        className="hover:underline"
      >
        {step.listingIntake.label ?? "매물"} · 의뢰{" "}
        {
          getStatusMeta("intakeLifecycle", step.listingIntake.lifecycleStatus)
            .label
        }
      </Link>,
      <span key="matches">매칭 {step.listingIntake.matchCount}건</span>,
    );
  }
  if (step.buyerIntake) {
    const requirementId = step.buyerIntake.requirements[0]?.id;
    const label = `${step.buyerIntake.label ?? "고객"} · 의뢰 ${
      getStatusMeta("intakeLifecycle", step.buyerIntake.lifecycleStatus).label
    }`;
    parts.push(
      requirementId ? (
        <Link
          key="intake"
          to="/buyer-requirements/$id"
          params={{ id: requirementId }}
          className="hover:underline"
        >
          {label}
        </Link>
      ) : (
        <span key="intake">{label}</span>
      ),
      <span key="matches">매칭 {step.buyerIntake.matchCount}건</span>,
    );
  }
  if (step.kind === "deal" && step.deal?.propertyLabel) {
    parts.push(<span key="deal-property">{step.deal.propertyLabel}</span>);
  }
  if (step.deal) {
    parts.push(
      <span key="deal" className="inline-flex items-center gap-1.5">
        거래 <StatusBadge kind="dealStage" status={step.deal.stage} size="sm" />
      </span>,
    );
    if (step.deal.balanceDate) {
      parts.push(
        <span key="balance" className="font-medium text-foreground">
          잔금 {formatDate(step.deal.balanceDate)}
          {step.deal.balancePaidAt ? " (입금)" : ""}
        </span>,
      );
    }
  } else {
    parts.push(
      <span key="no-deal" className="text-muted-foreground/70">
        거래 없음
      </span>,
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
      <span className="mr-1 rounded-sm border px-1 py-px text-[11px]">
        {STEP_KIND_LABEL[step.kind]}
      </span>
      {parts.map((part, index) => (
        <span key={index} className="inline-flex items-center gap-1">
          {index > 0 && (
            <ChevronRight className="size-3 opacity-50" aria-hidden="true" />
          )}
          {part}
        </span>
      ))}
    </p>
  );
}

/**
 * 이 프로젝트 사람이 아닌 손님의 의뢰를 찾아 담는다. 갈아타기에서 파는 집은 남편 명의, 사는 쪽은
 * 아내 이름으로 의뢰가 들어온 경우처럼 명의가 다른 의뢰도 한 프로젝트에 담을 수 있어야 한다.
 * 손님을 고르면 그 사람의 담을 수 있는 의뢰·거래를 보여 주고, 담는 것은 사용자가 한다.
 */
export function OtherCustomerCandidates({
  projectId,
  disabled,
  onAddIntake,
  onAddDeal,
}: {
  projectId: string;
  disabled: boolean;
  onAddIntake: (kind: "listing" | "buyer", intakeId: string) => void;
  onAddDeal: (dealId: string) => void;
}) {
  const [contact, setContact] = useState<{ id: string; name: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const contactsQuery = useQuery({
    queryKey: ["contacts", { search, limit: 8 }],
    queryFn: () => api.contacts.findAll({ search: search || undefined, limit: 8 }),
    enabled: pickerOpen,
  });
  const candidatesQuery = useQuery({
    queryKey: [...planQueryKey(projectId), "candidates", contact?.id ?? null],
    queryFn: () => api.projects.candidates(projectId, { contactId: contact!.id }),
    enabled: contact !== null,
  });
  const candidates = candidatesQuery.data;
  const count = candidates
    ? candidates.listingIntakes.length + candidates.buyerIntakes.length + candidates.deals.length
    : 0;

  return (
    <section aria-label="다른 고객의 의뢰 담기" className="border-t px-6 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          다른 고객 명의의 의뢰 담기
        </h3>
        <Popover
          open={pickerOpen}
          onOpenChange={(next) => {
            setPickerOpen(next);
            if (!next) setSearch("");
          }}
        >
          <PopoverTrigger asChild>
            <Button type="button" size="xs" variant="outline" aria-label="의뢰를 찾을 고객 고르기">
              <Search className="size-3" />
              {contact ? contact.name : "고객 찾기"}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[280px] p-0">
            <Command shouldFilter={false}>
              <CommandInput
                value={search}
                onValueChange={setSearch}
                placeholder="이름·전화번호 검색"
              />
              <CommandList>
                <CommandEmpty>
                  {contactsQuery.isLoading ? "찾는 중..." : "찾는 고객이 없습니다."}
                </CommandEmpty>
                {(contactsQuery.data?.items ?? []).map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      setContact({ id: item.id, name: item.name });
                      setPickerOpen(false);
                    }}
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatPhone(item.phone)}
                    </span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {!contact ? (
        <p className="mt-1 text-xs text-muted-foreground">
          배우자 · 공동명의처럼 이 프로젝트에 없는 사람 이름으로 들어온 의뢰를 찾아 담습니다.
        </p>
      ) : candidatesQuery.isPending ? (
        <p className="mt-1 text-xs text-muted-foreground">찾는 중</p>
      ) : candidatesQuery.isError ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {errorMessage(candidatesQuery.error, "의뢰를 불러오지 못했습니다.")}
        </p>
      ) : count === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {contact.name}님에게 담을 수 있는 의뢰나 거래가 없습니다. 이미 다른 진행 중 프로젝트에
          담긴 의뢰는 그 프로젝트에서 먼저 빼야 합니다.
        </p>
      ) : (
        candidates && (
          <ul className="mt-1 divide-y text-sm">
            {candidates.listingIntakes.map((item) => (
              <CandidateRow
                key={`listing-${item.id}`}
                kind="매물 의뢰"
                label={
                  item.lifecycleStatus === "closed" ? `${item.label} (종료된 의뢰)` : item.label
                }
                disabled={disabled}
                onAdd={() => onAddIntake("listing", item.id)}
              />
            ))}
            {candidates.buyerIntakes.map((item) => (
              <CandidateRow
                key={`buyer-${item.id}`}
                kind="구매 의뢰"
                label={`${item.label} 구매 의뢰${item.lifecycleStatus === "closed" ? " (종료된 의뢰)" : ""}`}
                disabled={disabled}
                onAdd={() => onAddIntake("buyer", item.id)}
              />
            ))}
            {candidates.deals.map((deal) => (
              <CandidateRow
                key={`deal-${deal.id}`}
                kind="거래"
                label={
                  [deal.propertyLabel, getStatusMeta("dealStage", deal.stage).label]
                    .filter(Boolean)
                    .join(" · ") || "거래"
                }
                disabled={disabled}
                onAdd={() => onAddDeal(deal.id)}
              />
            ))}
          </ul>
        )
      )}
    </section>
  );
}

/** 방금(1시간 안에) 등록한 의뢰. 프로젝트에서 등록하러 갔다 돌아왔을 때 맨 위에 표시한다. */
const FRESH_CANDIDATE_MS = 60 * 60 * 1000;
export function isFreshCandidate(createdAt: string | undefined, now: number = Date.now()) {
  if (!createdAt) return false;
  const at = new Date(createdAt).getTime();
  return Number.isFinite(at) && now - at >= 0 && now - at < FRESH_CANDIDATE_MS;
}

/** 담을 후보 의뢰를 매물 · 구매 구분 없이 최근에 등록한 것부터 한 줄로. */
export function orderCandidateIntakes(candidates: {
  listingIntakes: Array<{ id: string; label: string; lifecycleStatus: string; createdAt?: string }>;
  buyerIntakes: Array<{ id: string; label: string; lifecycleStatus: string; createdAt?: string }>;
}) {
  return [
    ...candidates.listingIntakes.map((item) => ({ ...item, kind: "listing" as const })),
    ...candidates.buyerIntakes.map((item) => ({ ...item, kind: "buyer" as const })),
  ].sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));
}

export function CandidateRow({
  kind,
  label,
  fresh = false,
  disabled,
  onAdd,
}: {
  kind: string;
  label: string;
  /** 방금 등록한 의뢰 */
  fresh?: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-center gap-2 py-1.5" data-fresh-candidate={fresh || undefined}>
      <span className="w-16 shrink-0 text-xs text-muted-foreground">
        {kind}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {fresh && (
        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
          방금 등록
        </span>
      )}
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={disabled}
        onClick={onAdd}
      >
        담기
      </Button>
    </li>
  );
}

/**
 * 줄 안에서 바로 고치는 입력. 상자를 그리지 않고, 올리거나 고칠 때만 바탕이 보인다.
 * 입력을 마쳤을 때(포커스가 나가거나 Enter) 값이 바뀌었으면 저장한다.
 * 다른 저장이 진행 중이어도 입력을 막지 않는다(막으면 치던 글자를 잃는다).
 */
export function SavedInput({
  value,
  onSave,
  ariaLabel,
  required = false,
  saving,
  className,
  ...props
}: {
  value: string;
  onSave: (value: string) => void;
  ariaLabel: string;
  required?: boolean;
  /** 저장이 진행 중인지. 끝났는데도 서버 값과 다르면 저장되지 않은 글로 표시한다. */
  saving: boolean;
} & Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "onBlur" | "disabled"
>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  // 이 칸이 딛고 선 값: 칸에 들어갈 때의 값이고, 내가 보낸 저장이 반영되면 그 값으로 옮긴다.
  // 벗어날 때 적은 글 · 이 값 · 지금 값을 견줘 저장할지 정한다.
  const base = useRef(value);
  // 내가 보내고 아직 결과를 보지 못한 글들(보낸 순서). 지금 값이 이 중 하나로 바뀌면
  // "다른 곳의 변경"이 아니라 내 저장의 결과다.
  const sent = useRef<string[]>([]);
  const previousValue = useRef(value);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // 이 칸에서도 바꾸고 다른 곳(다른 탭 · 다른 사람)에서도 바뀌었다. 알아서 덮지 않는다.
  const [conflict, setConflict] = useState(false);
  // 저장에 실패하면 쓴 글은 칸에 남지만 서버에는 없다. 저장된 것처럼 보이지 않게
  // 표시하고, 칸에 들어갔다 나오면 다시 저장을 시도한다.
  const unsaved = !focused && !saving && draft.trim() !== value.trim();
  // 서버 값이 바뀌어도(앞서 보낸 저장의 응답, 다른 칸의 저장) 이 칸을 고치는 중이면
  // 쓰던 글을 덮어쓰지 않는다. 포커스가 나갈 때 저장하고, 그 응답이 오면 맞춰진다.
  useEffect(() => {
    const previous = previousValue.current;
    previousValue.current = value;
    // 내가 보낸 저장이 반영된 것이면 딛고 선 값을 옮긴다. 저장 응답은 칸에 다시 들어와 있는 동안에도 온다.
    // 옮기지 않으면 그 뒤에 이어서 고친 글이 "양쪽에서 바뀜"으로, 원래대로 되돌린 글이 "손대지 않음"으로 오인된다.
    const sentIndex = sent.current.indexOf(value.trim());
    const own = sentIndex >= 0;
    if (own) {
      base.current = value;
      // 이 글과 그 앞에 보낸 것들의 결과는 이제 본 것이다. 뒤에 보낸 것은 아직 기다린다.
      sent.current = sent.current.slice(sentIndex + 1);
    }
    if (document.activeElement === inputRef.current) return;
    // 칸 밖에 있을 때: 칸의 글이 내 것이 아니면(앞 값 그대로이거나 방금 저장된 글) 새 값을 따라간다.
    const held = draftRef.current.trim();
    if (held === previous.trim() || held === value.trim()) {
      setConflict(false);
      setDraft(value);
    } else if (!own) {
      // 저장하지 못해 남아 있는 글은 다른 곳의 변경으로 지우지 않고, 양쪽에서 바뀐 것으로 표시해 둔다.
      setConflict(true);
    }
    // own인데 칸의 글이 다르면: 그 뒤에 보낸 더 새 글이 칸에 있다. 그대로 두고 그 응답을 기다린다.
  }, [value]);

  const commit = (input: HTMLInputElement) => {
    // 날짜 칸을 덜 채우고 나가면 브라우저가 빈 값을 준다. 그걸 "지움"으로 받으면
    // 저장돼 있던 목표일이 사라지므로 원래 값으로 되돌린다.
    if (input.validity.badInput) {
      setDraft(value);
      return;
    }
    // 손대지 않고 나왔는데 그 사이에 다른 곳에서 바뀌었으면 바뀐 값을 받아들인다.
    // "적은 글이 지금 값과 다르면 저장"으로 하면 새 값을 예전 글로 덮어쓴다.
    const decision = decideTextCommit({ draft, base: base.current, current: value });
    if (decision.kind === "conflict") {
      // 저장하지 않고 저장 안 된 글로 표시해 둔다. 다시 들어갔다 나오면 내 글로 저장하고, Esc는 바뀐 값으로 돌아간다.
      setConflict(true);
      return;
    }
    setConflict(false);
    if (decision.kind === "none") return;
    if (decision.kind === "adopt" || (required && !decision.value)) {
      setDraft(value);
      return;
    }
    sent.current = [...sent.current, decision.value];
    onSave(decision.value);
  };

  return (
    <input
      {...props}
      ref={inputRef}
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => {
        // 다시 들어오면 지금 값 위에서 고치는 것으로 본다.
        base.current = value;
        // 보낸 저장이 모두 끝난 뒤라면 그 결과는 이미 지금 값에 들어 있다(실패했으면 들어 있지 않다).
        if (!saving) sent.current = [];
        setFocused(true);
      }}
      onBlur={(event) => {
        setFocused(false);
        commit(event.currentTarget);
      }}
      data-unsaved={unsaved || undefined}
      title={
        unsaved
          ? conflict
            ? "다른 곳에서 이 칸이 바뀌어 저장하지 않았습니다. 다시 눌렀다 나오면 내 글로 저장하고, Esc를 누르면 바뀐 값으로 돌아갑니다."
            : "저장되지 않았습니다. 다시 눌러 저장하세요."
          : undefined
      }
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setConflict(false);
          setDraft(value);
        }
      }}
      className={cn(
        "-mx-1.5 min-w-0 rounded-sm bg-transparent px-1.5 outline-none transition-colors",
        "placeholder:text-muted-foreground/70 hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:ring-1 focus-visible:ring-ring",
        "data-[unsaved]:bg-destructive/10 data-[unsaved]:text-destructive data-[unsaved]:underline data-[unsaved]:decoration-dotted",
        className,
      )}
    />
  );
}
