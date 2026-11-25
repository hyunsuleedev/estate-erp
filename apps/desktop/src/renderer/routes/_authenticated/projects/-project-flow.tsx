import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Consultation, ProjectComment, ProjectPerson } from "@estate-erp/api-client";
import { Check, ChevronDown, Footprints, Mic, MessageCircle, Phone, User } from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatRelativeDayTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { CONSULTATION_TYPE_LABELS } from "../buyer-requirements/-buyer-utils";
import { RailSection } from "../properties/-detail/rail";
import { Kbd, nb } from "../properties/-detail/ui";
import { commentsQueryKey, isProjectRemoved } from "./-project-hooks";
import {
  commentPermissions,
  CommentRow,
  PROJECT_FLOW_CONSULT_CLASS,
  useCommentActions,
  useIsSavingComment,
} from "./-project-inspector";
import {
  mergeProjectFlow,
  PROJECT_FLOW_FILTERS,
  PROJECT_PERSON_ROLE_LABELS,
  type CommentDraftStore,
  type CommentSaveRequest,
  type ProjectFlowFilter,
} from "./-project-model";

/**
 * 상담 · 코멘트 한 흐름 (상세 오른쪽 열, 업무 아래).
 *
 * 규칙: 상담은 사람에, 코멘트는 일에 적는다(AGENTS.md). 그래서 둘은 저장되는 곳이 다르다 —
 * 상담은 그 사람의 상담 기록(기존 상담 적기 API), 코멘트는 이 프로젝트의 코멘트. 이 화면은 둘을 한 줄로
 * 이어 보여 주고(최근 것부터), 맨 위의 적는 칸에서 어느 쪽으로 적을지 고른다.
 *
 * - 상담: 이 프로젝트 사람들의 상담을 사람마다 읽어 온다(예전 "최근 상담"과 같은 조회). 같은 손님과의 다른
 *   이야기도 섞여 있을 수 있다 — 상담은 프로젝트가 아니라 사람에 달린 기록이다.
 * - 코멘트: 예전 본문의 코멘트와 같은 목록(쪽을 넘겨 끝까지 본다). 고치기 · 지우기도 그대로.
 * - 녹음이 붙은 상담은 표시만 하고 상담분석 화면에서 연다. 통화 분석 제안은 여기서 다루지 않는다.
 */

/** 상담을 읽어 올 사람 수. 프로젝트의 사람은 대개 한둘이다. */
const CONSULTATION_PEOPLE = 4;
/** 사람마다 처음 읽는 상담 수와 "더 보기"마다 늘리는 수 */
const CONSULTATIONS_FIRST = 10;
const CONSULTATIONS_STEP = 10;
const MAX_COMMENT_LENGTH = 5000;
const MAX_CONSULTATION_LENGTH = 5000;

export type ProjectComposerMode = "consultation" | "comment";

/** 바깥(머리의 "코멘트" 단추 · 빈 프로젝트 안내)에서 적는 칸을 열어 달라는 요청. nonce가 바뀔 때마다 한 번. */
export interface ProjectComposerRequest {
  mode: ProjectComposerMode;
  nonce: number;
}

const CONSULTATION_TYPES = ["phone", "visit", "online"] as const;
const CONSULTATION_TYPE_ICON = {
  phone: Phone,
  visit: Footprints,
  online: MessageCircle,
} as const;

export function ProjectFlow({
  projectId,
  people,
  drafts,
  onSaveComment,
  request,
  boundedList = false,
}: {
  projectId: string;
  people: ProjectPerson[];
  drafts: CommentDraftStore;
  onSaveComment: (request: CommentSaveRequest) => void;
  request: ProjectComposerRequest | null;
  /**
   * 목록을 정해진 높이 안에서 굴린다. 좁은 창에서 본문 아래로 내려왔을 때 쓴다 — 옆 칸(업무)은 짧은데
   * 기록이 수십 건이면 화면이 끝없이 길어진다.
   */
  boundedList?: boolean;
}) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<ProjectFlowFilter>("all");

  // ── 상담: 사람마다 최근 것부터 ──
  const targets = people.slice(0, CONSULTATION_PEOPLE);
  const [consultationLimit, setConsultationLimit] = useState(CONSULTATIONS_FIRST);
  const consultationQueries = useQueries({
    queries: targets.map((person) => ({
      queryKey: ["consultations", "project-person", person.contactId, consultationLimit],
      queryFn: () =>
        api.consultations.findAll({ contactId: person.contactId, page: 1, limit: consultationLimit }),
      // "더 보기"로 수를 늘리는 동안 읽어 둔 것을 그대로 보여 준다(같은 사람의 것일 때만).
      placeholderData: (
        previous: Awaited<ReturnType<typeof api.consultations.findAll>> | undefined,
        previousQuery: { queryKey: readonly unknown[] } | undefined,
      ) => (previousQuery?.queryKey[2] === person.contactId ? previous : undefined),
      // 상담은 다른 화면(연락처 · 상담분석 · 전화)에서도 적힌다. 돌아올 때 다시 읽는다.
      staleTime: 0,
      refetchOnWindowFocus: true,
    })),
  });
  const consultationsPending = consultationQueries.some((query) => query.isPending);
  const consultationsFailed = consultationQueries.filter((query) => query.isError);
  const consultationTotal = consultationQueries.reduce(
    (sum, query) => sum + (query.data?.pagination.total ?? 0),
    0,
  );

  // ── 코멘트: 옆 패널의 코멘트 목록과 같은 이름표(받아 둔 것을 함께 쓴다) ──
  const commentsQuery = useInfiniteQuery({
    queryKey: commentsQueryKey(projectId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.projects.comments(projectId, { before: pageParam ?? undefined }),
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
    enabled: !isProjectRemoved(projectId),
  });
  const comments = useMemo(
    () => (commentsQuery.data?.pages ?? []).flatMap((page) => page.items),
    [commentsQuery.data?.pages],
  );
  const commentTotal = commentsQuery.data?.pages[0]?.total ?? 0;

  const flow = mergeProjectFlow<ProjectPerson, Consultation, ProjectComment>({
    consultations: targets.map((person, index) => {
      const data = consultationQueries[index]?.data;
      return {
        person,
        items: data?.items ?? [],
        hasMore: data ? data.pagination.total > data.items.length : false,
      };
    }),
    comments: { items: comments, hasMore: Boolean(commentsQuery.hasNextPage) },
    filter,
  });

  const loadingMore =
    commentsQuery.isFetchingNextPage || consultationQueries.some((query) => query.isPlaceholderData);
  const loadMore = () => {
    if (filter !== "consultation" && commentsQuery.hasNextPage) void commentsQuery.fetchNextPage();
    const consultationsHaveMore = consultationQueries.some(
      (query) => query.data && query.data.pagination.total > query.data.items.length,
    );
    if (filter !== "comment" && consultationsHaveMore) {
      setConsultationLimit((limit) => limit + CONSULTATIONS_STEP);
    }
  };

  const { refresh, requestRemove, removeDialog } = useCommentActions(projectId);
  const isPending =
    (filter !== "comment" && consultationsPending) || (filter !== "consultation" && commentsQuery.isPending);

  return (
    <RailSection
      title="상담 · 코멘트"
      action={
        <div role="tablist" aria-label="상담 · 코멘트 거르기" className="inline-flex rounded-md bg-[#37352f]/[0.06] p-0.5">
          {PROJECT_FLOW_FILTERS.map((option) => {
            const count =
              option.value === "consultation"
                ? consultationTotal
                : option.value === "comment"
                  ? commentTotal
                  : 0;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  "inline-flex h-[22px] items-center gap-1 rounded px-2 text-[12.5px] font-normal text-[#37352f]/65",
                  filter === option.value && "bg-white text-[#37352f] shadow-[0_1px_2px_rgba(15,15,15,0.1)]",
                )}
              >
                {option.label}
                {count > 0 && <span className="tabular-nums text-[#37352f]/45">{count}</span>}
              </button>
            );
          })}
        </div>
      }
    >
      <div data-project-flow>
        <FlowComposer
          projectId={projectId}
          people={people}
          drafts={drafts}
          onSaveComment={onSaveComment}
          request={request}
        />

        {isPending ? (
          <Skeleton className="mt-3 h-24 w-full" />
        ) : flow.items.length === 0 && !flow.hasMore ? (
          <p className="mt-3 break-keep text-[13px] leading-5 text-[#37352f]/45">
            {filter === "comment"
              ? "아직 적은 코멘트가 없습니다. 진행하며 알게 된 것, 다음에 할 일을 적어 두세요."
              : filter === "consultation"
                ? people.length === 0
                  ? "대표 고객을 정하거나 의뢰를 담으면 그 사람들과의 상담이 여기에 나옵니다."
                  : "이 사람들과 남긴 상담 기록이 없습니다."
                : "아직 남긴 상담이나 코멘트가 없습니다. 위 칸에서 바로 적으세요."}
          </p>
        ) : (
          <ol
            data-project-flow-list
            className={cn("mt-2.5 space-y-2", boundedList && "max-h-[560px] overflow-y-auto overscroll-contain pr-1")}
          >
            {flow.items.map((item) =>
              item.kind === "consultation" ? (
                <ConsultationLine key={item.id} person={item.person} consultation={item.consultation} />
              ) : (
                <CommentRow
                  key={item.id}
                  projectId={projectId}
                  comment={item.comment}
                  variant="flow"
                  dateHeading={null}
                  {...commentPermissions(item.comment, user)}
                  onRemove={() => requestRemove(item.comment)}
                  onChanged={refresh}
                />
              ),
            )}
          </ol>
        )}

        {flow.hasMore && !isPending && (
          <button
            type="button"
            data-project-flow-more
            disabled={loadingMore}
            onClick={loadMore}
            className="mt-1 rounded-sm text-[12.5px] text-[#37352f]/65 underline-offset-2 hover:text-[#37352f] hover:underline disabled:pointer-events-none disabled:opacity-60"
          >
            {loadingMore ? "불러오는 중" : "이전 기록 더 보기"}
          </button>
        )}
        {(consultationsFailed.length > 0 || (commentsQuery.isError && !commentsQuery.isFetchNextPageError)) && (
          <p role="status" className="mt-1.5 text-[12.5px] leading-5 text-[rgb(203,107,31)]">
            {consultationsFailed.length > 0 ? "일부 상담을" : "코멘트를"} 불러오지 못했습니다.{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-[#37352f]"
              onClick={() => {
                consultationsFailed.forEach((query) => void query.refetch());
                if (commentsQuery.isError) void commentsQuery.refetch();
              }}
            >
              다시 시도
            </button>
          </p>
        )}
        {commentsQuery.isFetchNextPageError && (
          <p role="status" className="mt-1.5 text-[12.5px] text-[rgb(203,107,31)]">
            이전 코멘트를 불러오지 못했습니다. "이전 기록 더 보기"를 다시 눌러 주세요.
          </p>
        )}
        {people.length > CONSULTATION_PEOPLE && filter !== "comment" && (
          <p className="mt-1.5 break-keep text-[12px] leading-[18px] text-[#37352f]/45">
            상담은 앞의 {CONSULTATION_PEOPLE}명 것만 보입니다. 다른 사람의 상담은 그 사람의 연락처에서 봅니다.
          </p>
        )}
      </div>
      {removeDialog}
    </RailSection>
  );
}

function ConsultationLine({ person, consultation }: { person: ProjectPerson; consultation: Consultation }) {
  const type = consultation.type as keyof typeof CONSULTATION_TYPE_ICON;
  const Icon = CONSULTATION_TYPE_ICON[type] ?? MessageCircle;
  const hasRecording = Boolean(consultation.callRecordingId || consultation.callRecording);
  return (
    <li data-flow-item="consultation" className={PROJECT_FLOW_CONSULT_CLASS}>
      <div className="flex min-h-[22px] min-w-0 items-center gap-1.5 text-[12.5px] leading-[18px] text-[#37352f]/65">
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-info" />
        <span className="shrink-0 font-semibold text-info">
          상담 · {CONSULTATION_TYPE_LABELS[consultation.type] ?? consultation.type}
        </span>
        <span className="text-[#37352f]/25">·</span>
        <Link
          to="/contacts/$id"
          params={{ id: person.contactId }}
          className="min-w-0 truncate font-medium text-[#37352f] underline-offset-2 hover:underline"
        >
          {person.name}
        </Link>
        <span className="flex-1" />
        <span className="shrink-0 pl-1 tabular-nums text-[#37352f]/45">
          {formatRelativeDayTime(consultation.createdAt)}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-keep text-[13.5px] leading-5 text-[#37352f]/90 [overflow-wrap:anywhere]">
        {consultation.content}
      </p>
      {(hasRecording || consultation.createdBy) && (
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] leading-[18px] text-[#37352f]/45">
          {consultation.createdBy && <span>{consultation.createdBy.name} 적음</span>}
          {hasRecording && consultation.createdBy && <span className="text-[#37352f]/25">·</span>}
          {hasRecording && (
            <Link
              to="/consultations"
              search={{ consultationId: consultation.id }}
              className="inline-flex items-center gap-1 text-[#37352f]/65 underline-offset-2 hover:text-[#37352f] hover:underline"
              title="녹음은 상담분석 화면에서 듣고 봅니다"
            >
              <Mic className="size-3" />
              녹음 있음 · 상담분석에서 열기
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * 흐름 맨 위의 적는 칸. "상담 적기"(그 사람의 상담 기록에 저장) / "코멘트"(이 프로젝트에 저장).
 * 두 모드는 글을 따로 들고 있다(모드를 바꿔도 적던 글이 다른 곳으로 저장되지 않는다).
 * 코멘트 저장은 화면이 쥔다(useCommentSave): 다른 프로젝트로 옮겨도 저장은 끝까지 가고, 실패하면 글이 남는다.
 */
function FlowComposer({
  projectId,
  people,
  drafts,
  onSaveComment,
  request,
}: {
  projectId: string;
  people: ProjectPerson[];
  drafts: CommentDraftStore;
  onSaveComment: (request: CommentSaveRequest) => void;
  request: ProjectComposerRequest | null;
}) {
  const queryClient = useQueryClient();
  const canConsult = people.length > 0;
  const [mode, setMode] = useState<ProjectComposerMode>(canConsult ? "consultation" : "comment");
  const activeMode: ProjectComposerMode = mode === "consultation" && !canConsult ? "comment" : mode;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 바깥에서 열어 달라고 하면 그 모드로 바꾸고 칸에 커서를 둔다. 이 칸이 새로 그려질 때(창 너비가 바뀌어
  // 오른쪽 열 ↔ 본문 아래로 옮겨 갈 때) 예전 요청으로 커서를 빼앗지 않게, 그려지기 전의 요청은 넘긴다.
  const handledRequest = useRef(request?.nonce ?? 0);
  useEffect(() => {
    if (!request || request.nonce === handledRequest.current) return;
    handledRequest.current = request.nonce;
    setMode(request.mode);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.scrollIntoView({ block: "nearest" });
      node.focus({ preventScroll: true });
    });
  }, [request]);

  // ── 상담 ──
  const defaultPerson = people.find((person) => person.role === "primary") ?? people[0] ?? null;
  const [personId, setPersonId] = useState<string | null>(null);
  const person = people.find((item) => item.contactId === personId) ?? defaultPerson;
  const [type, setType] = useState<(typeof CONSULTATION_TYPES)[number]>("phone");
  const [consultationText, setConsultationText] = useState("");
  const [consultationError, setConsultationError] = useState<string | null>(null);
  const savingConsultation = useRef(false);
  const saveConsultation = useMutation({
    mutationFn: (input: { contactId: string; type: string; content: string }) =>
      api.consultations.create(input),
    onSuccess: async (_consultation, input) => {
      setConsultationText((current) => (current.trim() === input.content ? "" : current));
      setConsultationError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["consultations"] }),
        queryClient.invalidateQueries({ queryKey: ["contacts"] }),
      ]);
    },
    onError: (error) => {
      setConsultationError(
        apiErrorMessage(error, "상담을 적지 못했습니다. 적은 글은 남아 있습니다. 다시 눌러 주세요."),
      );
    },
    onSettled: () => {
      savingConsultation.current = false;
    },
  });

  // ── 코멘트 (옆 패널 · 예전 본문의 적는 칸과 같은 저장 규칙) ──
  const [commentText, setCommentText] = useState(() => drafts.get(projectId) ?? "");
  const isSavingComment = useIsSavingComment(projectId);
  const [commentFailed, setCommentFailed] = useState(false);
  const wasSaving = useRef(isSavingComment);
  useEffect(() => {
    if (wasSaving.current && !isSavingComment) {
      if (drafts.has(projectId)) {
        setCommentFailed(true);
      } else {
        setCommentText("");
      }
    }
    wasSaving.current = isSavingComment;
  }, [drafts, isSavingComment, projectId]);

  const text = activeMode === "consultation" ? consultationText : commentText;
  const trimmed = text.trim();
  const saving = activeMode === "consultation" ? saveConsultation.isPending : isSavingComment;

  const change = (next: string) => {
    if (activeMode === "consultation") {
      setConsultationText(next);
      setConsultationError(null);
      return;
    }
    setCommentText(next);
    setCommentFailed(false);
    if (next.trim()) drafts.set(projectId, next);
    else drafts.delete(projectId);
  };

  const submit = () => {
    if (!trimmed || saving) return;
    if (activeMode === "consultation") {
      if (!person || savingConsultation.current) return;
      savingConsultation.current = true;
      saveConsultation.mutate({ contactId: person.contactId, type, content: trimmed });
      return;
    }
    setCommentFailed(false);
    // 보낸 글을 그대로 기억해 둔다. 저장이 끝나면 이것과 같을 때만 지운다.
    drafts.set(projectId, commentText);
    onSaveComment({ projectId, body: trimmed });
  };

  const error =
    activeMode === "consultation"
      ? consultationError
      : commentFailed
        ? "저장하지 못했습니다. 적은 글은 남아 있습니다. 다시 눌러 주세요."
        : null;

  return (
    <form
      data-project-flow-composer
      data-mode={activeMode}
      className="mt-1 rounded-lg bg-white px-2.5 pb-2 pt-2 ring-1 ring-[#dcdbd7] focus-within:ring-2 focus-within:ring-info/45"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="radiogroup" aria-label="무엇을 적을지" className="inline-flex gap-1">
          {(
            [
              ["consultation", "상담 적기"],
              ["comment", "코멘트"],
            ] as const
          ).map(([value, label]) => {
            const disabled = value === "consultation" && !canConsult;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={activeMode === value}
                disabled={disabled}
                title={disabled ? "대표 고객을 정하면 상담을 적을 수 있습니다" : undefined}
                onClick={() => setMode(value)}
                // 시안처럼 고른 모드는 채운 단추(상담 파랑 · 코멘트 호박색), 나머지는 테 단추.
                className={cn(
                  "h-7 rounded-md px-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                  activeMode === value
                    ? value === "consultation"
                      ? "bg-info text-white"
                      : "bg-warning text-white"
                    : "text-[#37352f]/70 shadow-[inset_0_0_0_1px_rgba(55,53,47,0.16)] hover:bg-[#37352f]/[0.04]",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {activeMode === "consultation" && person && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`상담한 사람 ${person.name}, 바꾸기`}
                className="inline-flex h-[26px] min-w-0 max-w-[150px] items-center gap-1 rounded pl-1 pr-1 text-[13px] text-[rgb(29,109,191)] hover:bg-[#2383e2]/[0.08]"
              >
                <User className="size-[13px] shrink-0" />
                <span className="truncate">{person.name}</span>
                <ChevronDown className="size-[13px] shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {people.map((option) => (
                  <DropdownMenuItem key={option.contactId} onSelect={() => setPersonId(option.contactId)}>
                    <span className="flex-1 truncate">{option.name}</span>
                    <span className="text-[12px] text-[#8a8983]">
                      {PROJECT_PERSON_ROLE_LABELS[option.role]}
                    </span>
                    {option.contactId === person.contactId && <Check className="size-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div role="radiogroup" aria-label="상담 방식" className="inline-flex rounded-md bg-[#37352f]/[0.06] p-0.5">
              {CONSULTATION_TYPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={type === value}
                  onClick={() => setType(value)}
                  className={cn(
                    "h-[22px] whitespace-nowrap rounded px-[7px] text-[12.5px] text-[#37352f]/65",
                    type === value && "bg-white text-[#37352f] shadow-[0_1px_2px_rgba(15,15,15,0.1)]",
                  )}
                >
                  {CONSULTATION_TYPE_LABELS[value]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <textarea
        ref={textareaRef}
        aria-label={activeMode === "consultation" ? "상담 내용" : "코멘트 적기"}
        value={text}
        rows={2}
        maxLength={activeMode === "consultation" ? MAX_CONSULTATION_LENGTH : MAX_COMMENT_LENGTH}
        // 저장하는 동안 더 적으면 보낸 글과 남은 글이 달라져 같은 내용이 두 번 들어갈 수 있다.
        readOnly={saving}
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            // 적던 글은 남기고 칸에서만 나온다.
            event.stopPropagation();
            event.currentTarget.blur();
          }
        }}
        placeholder={
          activeMode === "consultation"
            ? `${person?.name ?? "손님"}님과 나눈 이야기를 적으세요`
            : "직원끼리 남길 글 — 진행하며 알게 된 것, 다음에 할 일"
        }
        className={cn(
          "mt-1.5 block max-h-[200px] min-h-[44px] w-full resize-none border-0 bg-transparent text-[13.5px] leading-5 text-[#37352f] outline-none [field-sizing:content] placeholder:text-[#37352f]/45",
          saving && "opacity-70",
        )}
      />
      <div className="mt-1 flex items-center gap-2">
        <span
          role={error ? "alert" : undefined}
          className={cn(
            "min-w-0 flex-1 break-keep text-[12px] leading-[17px]",
            error ? "text-[rgb(212,76,71)]" : "text-[#37352f]/45",
          )}
        >
          {error ??
            (!canConsult
              ? "대표 고객을 정하면 상담을 적을 수 있습니다."
              : activeMode === "consultation"
                ? `${person?.name ?? ""}님의 상담 기록에 저장됩니다.`
                : "이 프로젝트에 저장됩니다.")}
        </span>
        <button type="submit" className={cn(nb.solid, "h-7")} disabled={!trimmed || saving}>
          {saving ? "적는 중" : "적기"}
          <Kbd>⌘↵</Kbd>
        </button>
      </div>
    </form>
  );
}
