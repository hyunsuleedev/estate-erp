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
  Trash2,
} from "lucide-react";
import type {
  BrokerageCase,
  BrokerageCasePlan,
  BrokerageCaseStep,
} from "@estate-erp/api-client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { getStatusMeta } from "@/lib/status-config";
import { ConfirmDialog, StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "./-brokerage-case-plan-order";
import {
  closeBrokerageCasePlan,
  openBrokerageCasePlan,
  useBrokerageCasePlanTarget,
} from "./-brokerage-case-plan-store";

const planQueryKey = (id: string) => ["brokerage-cases", "plan", id] as const;

const STEP_KIND_LABEL: Record<BrokerageCaseStep["kind"], string> = {
  listing_intake: "매물 의뢰",
  buyer_intake: "구매 의뢰",
  deal: "거래",
  manual: "직접 추가",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * 진행 계획 창이 뜨는, 화면에 하나뿐인 자리.
 *
 * 창을 여는 메뉴는 고객 원장의 줄마다 있지만 창은 여기 하나다. 원장이 다시
 * 불러와져 줄이 새로 그려지거나 목록에서 빠져도 창과 입력 중인 글이 남는다.
 *
 * 건이 없는 줄에서 열면 그 줄의 의뢰들을 한 건으로 묶을지 묻고(서버가 알아서 묶지
 * 않는다), 건이 있으면 진행 계획을 보여 준다. 순서와 단계는 사람이 정하고, 각 단계의
 * 진행 상태와 잔금일은 의뢰·거래에서 읽어 옆에 보여 줄 뿐이다.
 */
export function BrokerageCasePlanHost() {
  const queryClient = useQueryClient();
  const target = useBrokerageCasePlanTarget();
  // 이 화면을 떠났다가 돌아왔을 때 예전 창이 다시 뜨지 않게 한다.
  useEffect(() => closeBrokerageCasePlan, []);

  const close = () => {
    // 창 안에서 바꾼 것은 닫을 때 한 번에 원장과 건 목록에 반영한다.
    void queryClient.invalidateQueries({
      queryKey: ["brokerage-cases", "ledger"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["brokerage-cases", "list"],
    });
    closeBrokerageCasePlan();
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
            key={target.caseId}
            caseId={target.caseId}
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
            onCreated={(caseId) =>
              // 묶은 뒤에는 그 건의 진행 계획으로 바로 넘어간다.
              openBrokerageCasePlan({
                kind: "case",
                caseId,
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
 * 중개 건 목록. 고객 원장은 진행 중인 의뢰만 보여 주므로, 의뢰가 모두 종료된 건이나
 * 거래·직접 추가 단계만 있는 건은 원장에 줄이 없다. 그런 건의 진행 계획도 여기서 연다.
 */
export function BrokerageCaseListButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const listQuery = useQuery({
    queryKey: ["brokerage-cases", "list"],
    queryFn: () => api.brokerageCases.findAll(),
  });
  const cases = listQuery.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={className}
          aria-label={`중개 건 ${cases.length}개`}
        >
          <ListOrdered className="size-3.5" />
          중개 건
          {cases.length > 0 && (
            <span className="tabular-nums text-muted-foreground">
              {cases.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">
          직접 묶은 건입니다. 의뢰가 모두 끝난 건도 여기서 엽니다.
        </p>
        {listQuery.isLoading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">불러오는 중</p>
        ) : listQuery.isError ? (
          <p className="px-3 py-4 text-sm text-destructive" role="alert">
            {errorMessage(listQuery.error, "중개 건을 불러오지 못했습니다.")}
          </p>
        ) : cases.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            아직 묶은 건이 없습니다. 고객 원장의 줄 메뉴에서 "건으로 묶기"를
            누르세요.
          </p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {cases.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
                  onClick={() => {
                    setOpen(false);
                    openBrokerageCasePlan({
                      kind: "case",
                      caseId: item.id,
                      customerName: item.customerName,
                    });
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {item.title ??
                      (item.customerName
                        ? `${item.customerName}님 건`
                        : (item.firstStepTitle ?? "이름 없는 건"))}
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
  ledgerRow: BrokerageCase;
  customerName: string;
  onCancel: () => void;
  onCreated: (caseId: string) => void;
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

  const create = useMutation({
    mutationFn: () =>
      api.brokerageCases.create({
        title: title.trim() || null,
        listingIntakeIds: listingIntakes.map((line) => line.listingIntakeId),
        buyerIntakeIds: buyerIntakes.map((line) => line.buyerIntakeId),
      }),
    onSuccess: (plan) => {
      queryClient.setQueryData(planQueryKey(plan.id), plan);
      onCreated(plan.id);
    },
    onError: (error) =>
      toast.error(errorMessage(error, "건으로 묶지 못했습니다.")),
  });

  return (
    <>
      <DialogHeader className="border-b px-6 py-4">
        <DialogTitle>건으로 묶기</DialogTitle>
        <DialogDescription>
          {customerName}님의 의뢰 {intakeCount}개를 한 건으로 묶고 진행 순서를
          정합니다. 의뢰와 거래는 그대로이고, 언제든 다시 풀 수 있습니다.
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
          <Label htmlFor="brokerage-case-title">건 이름 (선택)</Label>
          <Input
            id="brokerage-case-title"
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
          onClick={() => create.mutate()}
          disabled={create.isPending || intakeCount === 0}
        >
          {create.isPending && <Loader2 className="size-4 animate-spin" />}
          묶기
        </Button>
      </DialogFooter>
    </>
  );
}

function PlanView({
  caseId,
  customerName,
  onClose,
  onRemoved,
}: {
  caseId: string;
  customerName: string | null;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState("");

  const planQuery = useQuery({
    queryKey: planQueryKey(caseId),
    queryFn: () => api.brokerageCases.findOne(caseId),
  });
  const candidatesQuery = useQuery({
    queryKey: [...planQueryKey(caseId), "candidates"],
    queryFn: () => api.brokerageCases.candidates(caseId),
  });

  const applyPlan = (plan: BrokerageCasePlan) => {
    queryClient.setQueryData(planQueryKey(caseId), plan);
    void queryClient.invalidateQueries({
      queryKey: [...planQueryKey(caseId), "candidates"],
    });
  };
  const change = useMutation({
    // 저장을 하나씩 차례로 보낸다. 빠르게 이어서 고쳐도 늦게 온 앞 응답이 화면을
    // 예전 상태로 되돌리지 않는다.
    scope: { id: `brokerage-case-plan-${caseId}` },
    mutationFn: (run: () => Promise<BrokerageCasePlan>) => run(),
    onSuccess: applyPlan,
    onError: (error) => {
      toast.error(errorMessage(error, "저장하지 못했습니다."));
      // 다른 곳에서 바뀐 계획일 수 있으니 다시 불러온다.
      void queryClient.invalidateQueries({ queryKey: planQueryKey(caseId) });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.brokerageCases.remove(caseId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: planQueryKey(caseId) });
      toast.success("묶음을 풀었습니다. 의뢰와 거래는 그대로 있습니다.");
      onRemoved();
    },
    onError: (error) =>
      toast.error(errorMessage(error, "묶음을 풀지 못했습니다.")),
  });

  const plan = planQuery.data;
  const order = plan ? planStepOrder(plan.steps) : [];
  const saveOrder = (next: ReturnType<typeof planStepOrder>) =>
    change.mutate(() =>
      api.brokerageCases.reorderSteps(
        caseId,
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
          {customerName ? `${customerName}님 건의` : "이 건의"} 단계와 순서를
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
                ariaLabel="건 이름"
                value={plan.title ?? ""}
                placeholder="건 이름 (선택)"
                maxLength={100}
                className="h-8 w-full text-[15px] font-medium"
                onSave={(title) =>
                  change.mutate(() =>
                    api.brokerageCases.update(caseId, { title: title || null }),
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
                        api.brokerageCases.updateStep(caseId, step.id, dto),
                      )
                    }
                    onRemove={() =>
                      change.mutate(() =>
                        api.brokerageCases.removeStep(caseId, step.id),
                      )
                    }
                  />
                );
              })}
              {plan.steps.length === 0 && (
                <li className="px-6 py-6 text-sm text-muted-foreground">
                  아직 단계가 없습니다. 아래에서 단계를 추가하세요.
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
                  () => api.brokerageCases.createStep(caseId, { title }),
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

            {hasCandidates && candidates && (
              <section
                aria-label="건에 담을 수 있는 것"
                className="border-t px-6 py-3"
              >
                <h3 className="text-xs font-medium text-muted-foreground">
                  같은 고객의 다른 의뢰·거래
                </h3>
                <ul className="mt-1 divide-y text-sm">
                  {candidates.listingIntakes.map((item) => (
                    <CandidateRow
                      key={`listing-${item.id}`}
                      kind="매물 의뢰"
                      label={
                        item.lifecycleStatus === "closed"
                          ? `${item.label} (종료된 의뢰)`
                          : item.label
                      }
                      disabled={busy}
                      onAdd={() =>
                        change.mutate(() =>
                          api.brokerageCases.addIntake(caseId, {
                            kind: "listing",
                            intakeId: item.id,
                          }),
                        )
                      }
                    />
                  ))}
                  {candidates.buyerIntakes.map((item) => (
                    <CandidateRow
                      key={`buyer-${item.id}`}
                      kind="구매 의뢰"
                      label={`${item.label} 구매 의뢰${item.lifecycleStatus === "closed" ? " (종료된 의뢰)" : ""}`}
                      disabled={busy}
                      onAdd={() =>
                        change.mutate(() =>
                          api.brokerageCases.addIntake(caseId, {
                            kind: "buyer",
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
                          api.brokerageCases.createStep(caseId, {
                            dealId: deal.id,
                          }),
                        )
                      }
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <DialogFooter className="border-t px-6 py-3 sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setConfirmRemove(true)}
          disabled={busy || !plan}
        >
          묶음 풀기
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          닫기
        </Button>
      </DialogFooter>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="묶음을 풀까요?"
        description="건과 진행 계획만 없어집니다. 의뢰와 거래는 그대로 남습니다."
        confirmLabel="묶음 풀기"
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
  step: BrokerageCaseStep;
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
          title={linksIntake ? "건에서 빼기" : "단계 지우기"}
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
        title="이 의뢰를 건에서 뺄까요?"
        description="의뢰와 거래는 그대로 남고, 이 건의 진행 계획에서만 빠집니다."
        confirmLabel="건에서 빼기"
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
function StepFlow({ step }: { step: BrokerageCaseStep }) {
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

function CandidateRow({
  kind,
  label,
  disabled,
  onAdd,
}: {
  kind: string;
  label: string;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">
        {kind}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
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
function SavedInput({
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
  // 저장에 실패하면 쓴 글은 칸에 남지만 서버에는 없다. 저장된 것처럼 보이지 않게
  // 표시하고, 칸에 들어갔다 나오면 다시 저장을 시도한다.
  const unsaved = !focused && !saving && draft.trim() !== value.trim();
  // 서버 값이 바뀌어도(앞서 보낸 저장의 응답, 다른 칸의 저장) 이 칸을 고치는 중이면
  // 쓰던 글을 덮어쓰지 않는다. 포커스가 나갈 때 저장하고, 그 응답이 오면 맞춰진다.
  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    setDraft(value);
  }, [value]);

  const commit = (input: HTMLInputElement) => {
    // 날짜 칸을 덜 채우고 나가면 브라우저가 빈 값을 준다. 그걸 "지움"으로 받으면
    // 저장돼 있던 목표일이 사라지므로 원래 값으로 되돌린다.
    if (input.validity.badInput) {
      setDraft(value);
      return;
    }
    const next = draft.trim();
    if (next === value.trim()) return;
    if (required && !next) {
      setDraft(value);
      return;
    }
    onSave(next);
  };

  return (
    <input
      {...props}
      ref={inputRef}
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        setFocused(false);
        commit(event.currentTarget);
      }}
      data-unsaved={unsaved || undefined}
      title={unsaved ? "저장되지 않았습니다. 다시 눌러 저장하세요." : undefined}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
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
