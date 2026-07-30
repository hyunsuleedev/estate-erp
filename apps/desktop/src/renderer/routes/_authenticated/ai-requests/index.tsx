import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Bot,
  Check,
  CheckCircle2,
  CircleOff,
  Clock3,
  ExternalLink,
  Eye,
  FileCheck2,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError, type AgentActionRequest } from "@estate-erp/api-client";

import { api } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { timeAgo, timeUntil } from "@/lib/time-ago";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { EmptyState, FilterSearch, PageHeader } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AGENT_ACTION_INBOX_VIEWS,
  canUserDecideAgentAction,
  getAgentActionArticleNo,
  getAgentActionCapabilityLabel,
  getAgentActionDiff,
  getAgentActionFloorExposure,
  getAgentActionHashFingerprint,
  getAgentActionInboxView,
  getAgentActionNaverRanking,
  getAgentActionObservedStatus,
  getAgentActionSourceLocation,
  getAgentActionSourceUrl,
  getAgentActionStatusMeta,
  isAgentActionEvidenceExpired,
  requestMatchesAgentActionSearch,
  type AgentActionInboxView,
  type AgentActionTone,
} from "./-agent-action-view";

interface AiRequestsSearch {
  requestId?: string;
  origin?: "my-ads";
}

type DecisionKind = "approve" | "reject";

interface DecisionVariables {
  kind: DecisionKind;
  request: AgentActionRequest;
  note: string;
}

const LIST_QUERY_KEY = ["agent-action-requests"] as const;

export const Route = createFileRoute("/_authenticated/ai-requests/")({
  validateSearch: (search: Record<string, unknown>): AiRequestsSearch => ({
    requestId:
      typeof search.requestId === "string" ? search.requestId : undefined,
    origin: search.origin === "my-ads" ? "my-ads" : undefined,
  }),
  component: AiRequestsPage,
});

function AiRequestsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { requestId, origin } = Route.useSearch();
  const [view, setView] = useState<AgentActionInboxView>("review");
  const [searchText, setSearchText] = useState("");
  const deferredSearch = useDeferredValue(searchText);
  const [decisionKind, setDecisionKind] = useState<DecisionKind | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /**
   * 확인 창을 연 순간의 일괄 결정 대상을 그대로 고정한다. 목록은 30초마다
   * 다시 읽히므로, 살아있는 파생값을 그대로 쓰면 사용자가 확인 창에서 본
   * 목록과 실제로 승인되는 대상(그리고 각 건의 version)이 어긋날 수 있다.
   */
  const [pendingBulk, setPendingBulk] = useState<AgentActionRequest[] | null>(
    null,
  );
  const routedRequestIdRef = useRef<string | undefined>(undefined);

  const requestsQuery = useQuery({
    queryKey: LIST_QUERY_KEY,
    queryFn: () => api.agentActionRequests.list({ limit: 200 }),
    refetchInterval: 30_000,
  });
  const requests = requestsQuery.data ?? [];

  const selectedFromList = useMemo(
    () => requests.find((request) => request.id === requestId) ?? null,
    [requestId, requests],
  );
  const selectedQuery = useQuery({
    queryKey: ["agent-action-request", requestId],
    queryFn: () => {
      if (!requestId) throw new Error("AI 요청 ID가 없습니다.");
      return api.agentActionRequests.get(requestId);
    },
    enabled: Boolean(requestId) && !selectedFromList,
  });
  const selectedRequest =
    selectedFromList ??
    (selectedQuery.data?.id === requestId
      ? (selectedQuery.data ?? null)
      : null);

  const counts = useMemo(() => {
    const initial: Record<AgentActionInboxView, number> = {
      review: 0,
      ready: 0,
      attention: 0,
      archive: 0,
    };
    for (const request of requests) {
      initial[getAgentActionInboxView(request)] += 1;
    }
    return initial;
  }, [requests]);

  const visibleRequests = useMemo(
    () =>
      requests.filter(
        (request) =>
          getAgentActionInboxView(request) === view &&
          requestMatchesAgentActionSearch(request, deferredSearch),
      ),
    [deferredSearch, requests, view],
  );

  useEffect(() => {
    if (requestId || requestsQuery.isLoading || visibleRequests.length === 0) {
      return;
    }
    void navigate({
      search: { requestId: visibleRequests[0].id, origin },
      replace: true,
    });
  }, [navigate, origin, requestId, requestsQuery.isLoading, visibleRequests]);

  useEffect(() => {
    if (
      !requestId ||
      !selectedRequest ||
      routedRequestIdRef.current === requestId
    ) {
      return;
    }
    routedRequestIdRef.current = requestId;
    setView(getAgentActionInboxView(selectedRequest));
  }, [requestId, selectedRequest]);

  const selectRequest = (id: string) => {
    void navigate({ search: { requestId: id, origin }, replace: true });
  };

  const selectView = (nextView: AgentActionInboxView) => {
    setView(nextView);
    const first = requests.find(
      (request) =>
        getAgentActionInboxView(request) === nextView &&
        requestMatchesAgentActionSearch(request, deferredSearch),
    );
    void navigate({
      search: first ? { requestId: first.id, origin } : { origin },
      replace: true,
    });
  };

  const decisionMutation = useMutation({
    mutationFn: ({ kind, request, note }: DecisionVariables) =>
      kind === "approve"
        ? api.agentActionRequests.approve(request.id, {
            contentHash: request.contentHash,
            version: request.version,
            note: note.trim() || null,
          })
        : api.agentActionRequests.reject(request.id, {
            contentHash: request.contentHash,
            version: request.version,
            reason: note.trim(),
          }),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(["agent-action-request", updated.id], updated);
      queryClient.setQueryData<AgentActionRequest[]>(
        LIST_QUERY_KEY,
        (current) =>
          current?.map((item) => (item.id === updated.id ? updated : item)),
      );
      void queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY });
      setDecisionKind(null);
      setDecisionNote("");
      setPendingBulk(null);
      toast.success(
        variables.kind === "approve"
          ? "변경안을 승인했습니다"
          : "변경안을 반려했습니다",
      );
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  /**
   * 일괄 결정도 건별 승인 계약을 그대로 지킨다 — 요청마다 자기
   * contentHash/version 으로 검증되므로 서버 배치 엔드포인트를 두지 않고
   * 건별 호출을 병렬로 보낸다. 일부만 실패해도 성공분은 그대로 반영하고
   * 실패 건수와 사유를 사용자에게 그대로 보고한다.
   */
  const bulkDecisionMutation = useMutation({
    mutationFn: async ({
      kind,
      requests,
      note,
    }: {
      kind: DecisionKind;
      requests: AgentActionRequest[];
      note: string;
    }) => {
      const settled = await Promise.allSettled(
        requests.map((request) =>
          kind === "approve"
            ? api.agentActionRequests.approve(request.id, {
                contentHash: request.contentHash,
                version: request.version,
                note: note.trim() || null,
              })
            : api.agentActionRequests.reject(request.id, {
                contentHash: request.contentHash,
                version: request.version,
                reason: note.trim(),
              }),
        ),
      );
      const succeeded: AgentActionRequest[] = [];
      const failed: Array<{ request: AgentActionRequest; message: string }> = [];
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          succeeded.push(result.value);
        } else {
          failed.push({
            request: requests[index],
            message: getErrorMessage(result.reason),
          });
        }
      });
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }, variables) => {
      for (const updated of succeeded) {
        queryClient.setQueryData(["agent-action-request", updated.id], updated);
      }
      queryClient.setQueryData<AgentActionRequest[]>(
        LIST_QUERY_KEY,
        (current) =>
          current?.map((item) => {
            const updated = succeeded.find((entry) => entry.id === item.id);
            return updated ?? item;
          }),
      );
      void queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY });
      setDecisionKind(null);
      setDecisionNote("");
      setPendingBulk(null);
      // 성공분만 선택 해제 — 실패 건은 남겨 사용자가 바로 재시도할 수 있게 한다.
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const updated of succeeded) next.delete(updated.id);
        return next;
      });

      const verb = variables.kind === "approve" ? "승인" : "반려";
      if (failed.length === 0) {
        toast.success(`${succeeded.length}건을 ${verb}했습니다`);
        return;
      }
      toast.error(
        `${succeeded.length}건 ${verb}, ${failed.length}건 실패 · ${failed[0].message}`,
      );
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const openDecision = (kind: DecisionKind) => {
    setDecisionNote("");
    // 확인 창을 여는 시점의 대상을 고정한다 (아래 submitDecision 이 이 값만 쓴다).
    setPendingBulk(selectedRequests.length > 0 ? [...selectedRequests] : null);
    setDecisionKind(kind);
  };

  const closeDecision = () => {
    setDecisionKind(null);
    setDecisionNote("");
    setPendingBulk(null);
  };

  /** 지금 화면에서 일괄 결정이 가능한 요청 (pending + 권한 + 근거 유효) */
  const decidableRequests = useMemo(
    () =>
      visibleRequests.filter(
        (request) =>
          request.reviewStatus === "pending" &&
          canUserDecideAgentAction(request, user) &&
          !isAgentActionEvidenceExpired(request),
      ),
    [user, visibleRequests],
  );

  const selectedRequests = useMemo(
    () => decidableRequests.filter((request) => selectedIds.has(request.id)),
    [decidableRequests, selectedIds],
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      const allSelected = decidableRequests.every((request) =>
        current.has(request.id),
      );
      if (allSelected) return new Set();
      return new Set(decidableRequests.map((request) => request.id));
    });
  };

  // 목록(뷰/검색)이 바뀌면 화면에 없는 선택은 버린다 — 보이지 않는 요청이
  // 일괄 결정에 딸려 들어가지 않게 한다.
  useEffect(() => {
    setSelectedIds((current) => {
      if (current.size === 0) return current;
      const allowed = new Set(decidableRequests.map((request) => request.id));
      const next = new Set(
        [...current].filter((id) => allowed.has(id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [decidableRequests]);

  const submitDecision = () => {
    if (!decisionKind) return;
    if (decisionKind === "reject" && !decisionNote.trim()) {
      toast.error("반려 사유를 입력해 주세요");
      return;
    }
    if (pendingBulk && pendingBulk.length > 0) {
      bulkDecisionMutation.mutate({
        kind: decisionKind,
        requests: pendingBulk,
        note: decisionNote,
      });
      return;
    }
    if (!selectedRequest) return;
    decisionMutation.mutate({
      kind: decisionKind,
      request: selectedRequest,
      note: decisionNote,
    });
  };

  return (
    <div
      data-ai-requests-page
      data-advertisement-approval-screen={
        origin === "my-ads" ? "true" : undefined
      }
      className="flex h-[calc(100svh-5.5rem)] min-h-0 flex-col pt-4"
    >
      <PageHeader
        backTo={origin === "my-ads" ? "/properties/naver-my-ads" : undefined}
        title={
          <span className="inline-flex items-center gap-2">
            {origin === "my-ads" ? "광고 수정안 검토" : "AI 요청함"}
            {counts.review > 0 && (
              <span className="rounded-md bg-info-soft px-1.5 py-0.5 text-xs font-semibold text-info tabular-nums">
                {counts.review}
              </span>
            )}
          </span>
        }
        description={
          origin === "my-ads"
            ? "광고 자동화가 만든 수정안을 네이버 관측 근거와 함께 검토합니다."
            : "일반 업무와 분리된 광고 변경안을 근거와 함께 검토하고 승인합니다."
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void requestsQuery.refetch()}
            disabled={requestsQuery.isFetching}
          >
            <RefreshCw
              className={cn(
                "size-3.5",
                requestsQuery.isFetching && "animate-spin",
              )}
            />
            새로고침
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
        <aside className="flex w-[360px] shrink-0 flex-col border-r xl:w-[400px]">
          <div className="space-y-2.5 border-b bg-muted/20 p-3">
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
              {AGENT_ACTION_INBOX_VIEWS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectView(option.value)}
                  aria-pressed={view === option.value}
                  className={cn(
                    "flex h-9 items-center justify-between rounded-sm px-2.5 text-xs font-medium transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    view === option.value
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                  )}
                >
                  <span>{option.label}</span>
                  <span className="text-[11px] tabular-nums">
                    {counts[option.value]}
                  </span>
                </button>
              ))}
            </div>
            <FilterSearch
              value={searchText}
              onChange={setSearchText}
              placeholder="단지, 광고번호, 담당자 검색"
              className="w-full"
            />
          </div>

          <ScrollArea className="min-h-0 flex-1">
            {requestsQuery.isLoading ? (
              <RequestListSkeleton />
            ) : requestsQuery.isError ? (
              <EmptyState
                icon={AlertTriangle}
                title="요청을 불러오지 못했습니다"
                description={getErrorMessage(requestsQuery.error)}
                className="px-5"
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void requestsQuery.refetch()}
                  >
                    다시 시도
                  </Button>
                }
              />
            ) : visibleRequests.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title={
                  searchText.trim()
                    ? "검색 결과가 없습니다"
                    : getEmptyViewTitle(view)
                }
                description={
                  searchText.trim()
                    ? "다른 단지명이나 광고번호로 검색해 보세요."
                    : getEmptyViewDescription(view)
                }
                className="px-5"
              />
            ) : (
              <div role="list" aria-label="AI 광고 변경 요청">
                {decidableRequests.length > 0 && (
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-muted/60 px-3.5 py-2 backdrop-blur">
                    <Checkbox
                      id="ai-requests-select-all"
                      checked={
                        selectedRequests.length === decidableRequests.length
                          ? true
                          : selectedRequests.length > 0
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="검토 가능한 요청 전체 선택"
                    />
                    <Label
                      htmlFor="ai-requests-select-all"
                      className="cursor-pointer text-[11.5px] text-muted-foreground"
                    >
                      {selectedRequests.length > 0
                        ? `${selectedRequests.length}건 선택됨`
                        : `검토 가능 ${decidableRequests.length}건`}
                    </Label>
                    {selectedRequests.length > 0 && (
                      <div className="ml-auto flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11.5px]"
                          disabled={bulkDecisionMutation.isPending}
                          onClick={() => openDecision("reject")}
                        >
                          <X className="size-3" />
                          반려
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 px-2 text-[11.5px]"
                          disabled={bulkDecisionMutation.isPending}
                          onClick={() => openDecision("approve")}
                        >
                          {bulkDecisionMutation.isPending ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Check className="size-3" />
                          )}
                          {selectedRequests.length}건 승인
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {visibleRequests.map((request) => (
                  <RequestListItem
                    key={request.id}
                    request={request}
                    selected={request.id === requestId}
                    onSelect={() => selectRequest(request.id)}
                    selectable={decidableRequests.some(
                      (entry) => entry.id === request.id,
                    )}
                    checked={selectedIds.has(request.id)}
                    onToggleChecked={() => toggleSelected(request.id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selectedQuery.isLoading && !selectedFromList ? (
            <RequestDetailSkeleton />
          ) : selectedQuery.isError && !selectedFromList ? (
            <EmptyState
              icon={AlertTriangle}
              title="요청 상세를 불러오지 못했습니다"
              description={getErrorMessage(selectedQuery.error)}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void selectedQuery.refetch()}
                >
                  다시 시도
                </Button>
              }
            />
          ) : selectedRequest ? (
            <RequestDetail
              request={selectedRequest}
              user={user}
              onApprove={() => openDecision("approve")}
              onReject={() => openDecision("reject")}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={Bot}
                title="검토할 요청을 선택하세요"
                description="왼쪽 요청을 선택하면 네이버 관측 근거와 정확한 변경 전후가 표시됩니다."
              />
            </div>
          )}
        </main>
      </div>

      <DecisionDialog
        kind={decisionKind}
        request={pendingBulk ? null : selectedRequest}
        bulkRequests={pendingBulk}
        note={decisionNote}
        onNoteChange={setDecisionNote}
        onOpenChange={(open) => {
          if (
            !open &&
            !decisionMutation.isPending &&
            !bulkDecisionMutation.isPending
          ) {
            closeDecision();
          }
        }}
        onSubmit={submitDecision}
        pending={decisionMutation.isPending || bulkDecisionMutation.isPending}
      />
    </div>
  );
}

function RequestListItem({
  request,
  selected,
  onSelect,
  selectable,
  checked,
  onToggleChecked,
}: {
  request: AgentActionRequest;
  selected: boolean;
  onSelect: () => void;
  selectable: boolean;
  checked: boolean;
  onToggleChecked: () => void;
}) {
  const status = getAgentActionStatusMeta(request);
  const Icon =
    request.capability === "advertisement.takedown"
      ? CircleOff
      : BadgeDollarSign;

  return (
    <div
      role="listitem"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group flex min-h-[116px] w-full cursor-pointer gap-3 border-b border-l-2 px-3.5 py-3 text-left transition-[background-color,border-color] focus-within:relative focus-within:z-10",
        selected
          ? "border-l-info bg-info-soft/35"
          : "border-l-transparent hover:bg-muted/45",
      )}
    >
      {selectable ? (
        <span
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={checked}
            onCheckedChange={onToggleChecked}
            aria-label={`${request.title} 일괄 결정에 포함`}
          />
        </span>
      ) : (
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background",
            selected ? "border-info/25 text-info" : "text-muted-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={onSelect}
            className="truncate text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {request.title}
          </button>
          <ActionStatusBadge meta={status} compact />
        </span>
        <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {request.summary}
        </span>
        <span className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/85">
          <span className="truncate">
            {getAgentActionSourceLocation(request)}
          </span>
          <span aria-hidden>·</span>
          <span className="shrink-0 tabular-nums">
            {timeAgo(request.createdAt)}
          </span>
        </span>
      </span>
    </div>
  );
}

function RequestDetail({
  request,
  user,
  onApprove,
  onReject,
}: {
  request: AgentActionRequest;
  user: { id: string; role: string } | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  const status = getAgentActionStatusMeta(request);
  const canDecide = canUserDecideAgentAction(request, user);
  const evidenceExpired = isAgentActionEvidenceExpired(request);
  const sourceUrl = getAgentActionSourceUrl(request);
  const articleNo = getAgentActionArticleNo(request);
  const sourceLocation = getAgentActionSourceLocation(request);
  const waitingForExecution =
    request.reviewStatus === "approved" &&
    request.executionStatus === "awaiting_manual";

  return (
    <article
      data-advertisement-approval-detail
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="border-b px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <ActionStatusBadge meta={status} />
              <span className="rounded-md bg-neutral-soft px-2 py-0.5 text-xs font-medium text-neutral-strong">
                {getAgentActionCapabilityLabel(request.capability)}
              </span>
              <span className="rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-strong">
                중요 변경
              </span>
            </div>
            <h2 className="text-xl font-semibold tracking-[-0.025em] text-balance">
              {request.title}
            </h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground text-pretty">
              {request.summary}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
              검토 담당
            </p>
            <p className="mt-1 text-sm font-semibold">
              {request.reviewer?.name ?? "담당자"}
            </p>
          </div>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-4xl space-y-6 p-5">
          {evidenceExpired && request.reviewStatus === "pending" && (
            <Notice
              tone="warning"
              icon={Clock3}
              title="관측 근거가 만료되었습니다"
            >
              이 요청은 승인할 수 없습니다. 내 광고 전체 비교를 다시 실행한 뒤
              새 변경안을 만들어 주세요.
            </Notice>
          )}

          {waitingForExecution && (
            <Notice
              tone="success"
              icon={CheckCircle2}
              title="직원 승인이 완료되었습니다"
            >
              승인된 내용은 변경되지 않습니다. 이실장 computer-use 연결 전까지
              실행 대기 상태로 보관됩니다.
            </Notice>
          )}

          {request.escalationTask && (
            <Notice
              tone="warning"
              icon={AlertTriangle}
              title="일반 업무로 예외가 승격되었습니다"
              action={
                <Button asChild variant="outline" size="sm">
                  <Link to="/tasks">
                    업무 열기
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              }
            >
              {request.escalationTask.title}
            </Notice>
          )}

          {request.lastError &&
            request.executionStatus !== "needs_input" &&
            request.verificationStatus !== "mismatch" && (
              <Notice tone="destructive" icon={AlertTriangle} title="처리 기록">
                {request.lastError}
              </Notice>
            )}

          <section aria-labelledby="agent-action-diff-title">
            <SectionHeading
              id="agent-action-diff-title"
              icon={FileCheck2}
              title="승인할 변경"
              description="아래 변경 전후가 이번 승인에 고정됩니다."
            />
            <ActionDiff request={request} />
          </section>

          <section aria-labelledby="agent-action-evidence-title">
            <SectionHeading
              id="agent-action-evidence-title"
              icon={Eye}
              title="네이버 관측 근거"
              description="내 광고 관리에서 저장한 네이버 비교 결과입니다."
            />
            <div className="overflow-hidden rounded-md border">
              <div className="flex items-start justify-between gap-4 bg-muted/35 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {sourceLocation}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    네이버 광고번호{" "}
                    <span className="font-mono text-foreground tabular-nums">
                      {articleNo}
                    </span>
                  </p>
                </div>
                {sourceUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      원문 열기
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 divide-x border-t md:grid-cols-3 xl:grid-cols-6">
                <EvidenceCell
                  label="관측 시각"
                  value={formatDateTime(request.observedAt)}
                />
                <EvidenceCell
                  label="근거 유효시간"
                  value={timeUntil(request.expiresAt)}
                  tone={evidenceExpired ? "warning" : "default"}
                />
                <EvidenceCell
                  label="수집 스킬"
                  value={request.sourceSkillKey ?? "직원 입력"}
                />
                <EvidenceCell
                  label="광고 상태"
                  value={
                    getAgentActionObservedStatus(request) === true
                      ? "게재중"
                      : getAgentActionObservedStatus(request) === false
                        ? "종료"
                      : "확인 불가"
                  }
                />
                <EvidenceCell
                  label="노출 순위"
                  value={getAgentActionNaverRanking(request)}
                />
                <EvidenceCell
                  label="층 노출"
                  value={getAgentActionFloorExposure(request)}
                />
              </div>
            </div>
          </section>

          <section aria-labelledby="agent-action-rationale-title">
            <SectionHeading
              id="agent-action-rationale-title"
              icon={Bot}
              title="제안 이유"
            />
            <div className="rounded-md bg-muted/45 px-4 py-3 text-sm leading-6 text-foreground/90 text-pretty">
              {request.rationale}
            </div>
          </section>

          <section aria-labelledby="agent-action-contract-title">
            <SectionHeading
              id="agent-action-contract-title"
              icon={ShieldCheck}
              title="승인 계약"
              description="승인 후 payload와 근거는 수정할 수 없습니다."
            />
            <details className="group rounded-md border bg-background">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span>내용 지문과 버전 보기</span>
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  {getAgentActionHashFingerprint(request.contentHash)} · v
                  {request.version}
                </span>
              </summary>
              <div className="space-y-3 border-t bg-muted/25 px-4 py-3">
                <ContractField
                  label="Content hash"
                  value={request.contentHash}
                  mono
                />
                <ContractField
                  label="관측 상태 hash"
                  value={request.baseStateHash}
                  mono
                />
                <ContractField
                  label="실행 스킬"
                  value={`${request.executorSkillKey} · ${request.executorSkillVersion}`}
                />
                <ContractField label="요청 ID" value={request.id} mono />
              </div>
            </details>
          </section>

          {(request.decidedAt || request.executedAt) && (
            <section aria-labelledby="agent-action-history-title">
              <SectionHeading
                id="agent-action-history-title"
                icon={Clock3}
                title="처리 기록"
              />
              <div className="space-y-2 rounded-md border px-4 py-3">
                {request.decidedAt && (
                  <HistoryRow
                    label={
                      request.reviewStatus === "rejected" ? "반려" : "승인"
                    }
                    actor={request.decidedBy?.name ?? "직원"}
                    at={request.decidedAt}
                    note={request.decisionNote}
                  />
                )}
                {request.executedAt && (
                  <HistoryRow
                    label="실행 확인"
                    actor={request.executedBy?.name ?? request.createdBy}
                    at={request.executedAt}
                  />
                )}
              </div>
            </section>
          )}
        </div>
      </ScrollArea>

      <footer className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-t bg-muted/25 px-5 py-3">
        <div className="min-w-0">
          {request.reviewStatus === "pending" ? (
            <>
              <p className="text-sm font-medium">
                {canDecide
                  ? "변경 전후와 관측 근거를 확인해 주세요."
                  : "지정 검토자 또는 관리자만 결정할 수 있습니다."}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                승인 시 이 요청은 일반 업무가 아니라 실행 대기함으로 이동합니다.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">{status.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {getCompletedStatusDescription(request)}
              </p>
            </>
          )}
        </div>
        {request.reviewStatus === "pending" && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              onClick={onReject}
              disabled={!canDecide || evidenceExpired}
            >
              <X className="size-4" />
              반려
            </Button>
            <Button
              onClick={onApprove}
              disabled={!canDecide || evidenceExpired}
            >
              <Check className="size-4" />
              변경안 승인
            </Button>
          </div>
        )}
      </footer>
    </article>
  );
}

function ActionDiff({ request }: { request: AgentActionRequest }) {
  const rows = getAgentActionDiff(request);

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid grid-cols-[96px_minmax(0,1fr)_28px_minmax(0,1fr)] items-center bg-muted/35 px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground">
        <span>항목</span>
        <span>관측값</span>
        <span aria-hidden />
        <span>변경 후</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid min-h-14 grid-cols-[96px_minmax(0,1fr)_28px_minmax(0,1fr)] items-center border-t px-4 text-sm"
        >
          <span className="font-medium text-muted-foreground">{row.label}</span>
          <span
            className={cn(
              "min-w-0 truncate tabular-nums",
              !row.changed && "text-muted-foreground",
            )}
          >
            {formatDiffValue(row.kind, row.before)}
          </span>
          <ArrowRight
            className="size-3.5 text-muted-foreground/60"
            aria-hidden
          />
          <span
            className={cn(
              "min-w-0 truncate font-semibold tabular-nums",
              row.changed ? "text-success" : "text-muted-foreground",
            )}
          >
            {formatDiffValue(row.kind, row.after)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ActionStatusBadge({
  meta,
  compact = false,
}: {
  meta: { label: string; tone: AgentActionTone };
  compact?: boolean;
}) {
  const classes: Record<AgentActionTone, string> = {
    neutral: "bg-neutral-soft text-neutral-strong",
    info: "bg-info-soft text-info-strong",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning-strong",
    destructive: "bg-destructive-soft text-destructive-strong",
  };

  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-md font-medium whitespace-nowrap",
        compact ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs",
        classes[meta.tone],
      )}
    >
      {meta.label}
    </span>
  );
}

function SectionHeading({
  id,
  icon: Icon,
  title,
  description,
}: {
  id: string;
  icon: typeof Eye;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-2.5 flex items-start gap-2">
      <Icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
      <div>
        <h3 id={id} className="text-sm font-semibold">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

function Notice({
  tone,
  icon: Icon,
  title,
  children,
  action,
}: {
  tone: "success" | "warning" | "destructive";
  icon: typeof AlertTriangle;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const classes = {
    success: "border-success/20 bg-success-soft/55 text-success",
    warning: "border-warning/25 bg-warning-soft/55 text-warning-strong",
    destructive:
      "border-destructive/20 bg-destructive-soft/55 text-destructive-strong",
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border px-4 py-3",
        classes[tone],
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <div className="mt-0.5 text-xs leading-5 text-foreground/70">
          {children}
        </div>
      </div>
      {action}
    </div>
  );
}

function EvidenceCell({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="min-w-0 px-3 py-3">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-sm font-semibold tabular-nums",
          tone === "warning" && "text-warning-strong",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ContractField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 break-all text-foreground",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function HistoryRow({
  label,
  actor,
  at,
  note,
}: {
  label: string;
  actor: string;
  at: string;
  note?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
      <div className="min-w-0 flex-1">
        <p>
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground"> · {actor}</span>
        </p>
        {note && (
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {note}
          </p>
        )}
      </div>
      <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatDateTime(at)}
      </time>
    </div>
  );
}

function DecisionDialog({
  kind,
  request,
  bulkRequests,
  note,
  onNoteChange,
  onOpenChange,
  onSubmit,
  pending,
}: {
  kind: DecisionKind | null;
  request: AgentActionRequest | null;
  bulkRequests: AgentActionRequest[] | null;
  note: string;
  onNoteChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  const approving = kind === "approve";
  const bulkCount = bulkRequests?.length ?? 0;
  const isBulk = bulkCount > 0;

  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isBulk
              ? approving
                ? `${bulkCount}건을 승인할까요?`
                : `${bulkCount}건을 반려할까요?`
              : approving
                ? "이 변경안을 승인할까요?"
                : "이 변경안을 반려할까요?"}
          </DialogTitle>
          <DialogDescription>
            {approving
              ? "승인하면 각 요청의 content hash가 그대로 고정되고 이실장 실행 대기 상태로 이동합니다."
              : "반려한 요청은 실행되지 않으며 일반 업무를 만들지 않습니다."}
          </DialogDescription>
        </DialogHeader>

        {isBulk ? (
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md bg-muted/50 px-3 py-2.5">
            {bulkRequests?.map((entry) => (
              <div
                key={entry.id}
                className="flex items-baseline justify-between gap-2"
              >
                <p className="truncate text-[12.5px] font-medium">
                  {entry.title}
                </p>
                <p className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                  {getAgentActionHashFingerprint(entry.contentHash)} · v
                  {entry.version}
                </p>
              </div>
            ))}
          </div>
        ) : (
          request && (
            <div className="rounded-md bg-muted/50 px-3 py-2.5">
              <p className="truncate text-sm font-medium">{request.title}</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {getAgentActionHashFingerprint(request.contentHash)} · v
                {request.version}
              </p>
            </div>
          )
        )}

        <div className="space-y-2">
          <Label htmlFor="agent-action-decision-note">
            {approving ? "승인 메모 (선택)" : "반려 사유"}
          </Label>
          <Textarea
            id="agent-action-decision-note"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={
              approving
                ? "직원이 참고할 메모를 남길 수 있습니다."
                : "수정이 필요한 이유를 구체적으로 적어 주세요."
            }
            maxLength={2_000}
            rows={4}
            autoFocus
          />
          <p className="text-right text-[11px] text-muted-foreground tabular-nums">
            {note.length.toLocaleString()} / 2,000
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            취소
          </Button>
          <Button
            variant={approving ? "default" : "destructive"}
            onClick={onSubmit}
            disabled={pending || (!approving && !note.trim())}
          >
            {pending ? (
              <Loader2 className="animate-spin" />
            ) : approving ? (
              <Check />
            ) : (
              <X />
            )}
            {approving ? "승인하고 실행 대기로" : "반려 확정"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestListSkeleton() {
  return (
    <div aria-label="AI 요청 목록 불러오는 중">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-[116px] gap-3 border-b px-3.5 py-3"
        >
          <Skeleton className="size-8 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RequestDetailSkeleton() {
  return (
    <div className="flex-1 space-y-6 p-5" aria-label="AI 요청 상세 불러오는 중">
      <div className="space-y-3 border-b pb-5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function getEmptyViewTitle(view: AgentActionInboxView): string {
  switch (view) {
    case "review":
      return "검토할 변경안이 없습니다";
    case "ready":
      return "실행을 기다리는 요청이 없습니다";
    case "attention":
      return "직원 확인이 필요한 예외가 없습니다";
    case "archive":
      return "보관된 요청이 없습니다";
  }
}

function getEmptyViewDescription(view: AgentActionInboxView): string {
  switch (view) {
    case "review":
      return "네이버 읽기 스킬이 변경안을 제안하면 여기에 표시됩니다.";
    case "ready":
      return "승인한 변경안은 실제 실행 전까지 여기에 보관됩니다.";
    case "attention":
      return "실행 차단이나 결과 불일치가 생기면 일반 업무와 연결됩니다.";
    case "archive":
      return "완료·반려·철회·만료된 요청을 확인할 수 있습니다.";
  }
}

function getCompletedStatusDescription(request: AgentActionRequest): string {
  if (request.executionStatus === "succeeded") {
    return "이실장에 저장된 값과 승인된 변경안이 일치합니다.";
  }
  if (request.executionStatus === "needs_input") {
    return "직원이 처리할 예외 업무가 연결되었습니다.";
  }
  if (request.executionStatus === "failed") {
    return "저장 결과가 승인한 내용과 일치하지 않아 확인이 필요합니다.";
  }
  if (request.reviewStatus === "approved") {
    return "이실장 computer-use 실행을 기다리고 있습니다.";
  }
  if (request.reviewStatus === "rejected") {
    return "반려된 요청은 실행되지 않습니다.";
  }
  return "이 요청은 실행 대상이 아닙니다.";
}

function formatDiffValue(
  kind: "money" | "status",
  value: number | string | null,
): string {
  if (kind === "money") {
    return formatMoney(typeof value === "number" ? value : null);
  }
  return typeof value === "string" ? value : "—";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "요청을 처리하지 못했습니다.";
}
