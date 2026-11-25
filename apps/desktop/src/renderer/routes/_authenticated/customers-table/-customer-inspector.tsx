import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useIsMutating, useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CustomerLedgerRow,
  CustomerLedgerDemandIntent,
  CustomerLedgerParticipant,
  ProjectStep,
  Consultation,
} from "@estate-erp/api-client";
import {
  Clock3,
  Link2,
  ListOrdered,
  ListTodo,
  MessageSquarePlus,
  Phone,
  Plus,
  UserCheck,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDateShortYear, formatPhone, formatPyeong } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInspectorFocus } from "@/hooks/use-inspector-focus";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { tabResourceKeys } from "@/features/tabs/lib/tabResource";
import { useTabStore } from "@/features/tabs/store/useTabStore";
import { CONSULTATION_TYPE_LABELS } from "../buyer-requirements/-buyer-utils";
import { TaskAddDialog } from "../contacts/-detail-action-dialogs";
import { CustomerCaseActionMenu } from "../customers/-customer-case-action-menu";
import { openProjectPlan } from "../customers/-project-plan-store";
import {
  EmptyText,
  PropertyInspectorToolbar,
  SectionTitle,
  TextAction,
} from "../properties/-components/property-inspector-view";
import {
  LedgerLifecycleChip,
  LedgerSideTag,
  LedgerSideTags,
  LedgerStatusChip,
  ledgerChipClassName,
} from "./-ledger-chips";
import {
  describeDemandIntent,
  describeListingPrice,
  CONSULTATION_SAVE_MUTATION_KEY,
  DEFAULT_CONSULTATION_TYPE,
  carryConsultationDraft,
  describeParticipantRoles,
  getLedgerAssignees,
  getLedgerCustomerName,
  getLedgerCustomerPhone,
  getLedgerHeading,
  getLedgerParties,
  groupListingIntents,
  hasConsultationDraft,
  mergeConsultationPages,
  orderConsultationSources,
  rememberConsultationDraft,
  transactionLabel,
  type ConsultationDraftStore,
  type ConsultationSaveRequest,
  type LedgerListingGroup,
} from "./-ledger-model";
import { useInspectorOutsideClose } from "@/hooks/use-inspector-outside-close";

/**
 * 고객 원장 상세 패널 — 표의 줄에서 "열기"를 누르면 오른쪽에 열린다.
 * 연락처·매물관리의 상세 패널과 같은 방식·같은 틀이다: 화면을 덮지 않고 페이지 오른쪽에 붙고,
 * 위 막대의 확장 버튼으로 그 고객의 전체 화면(/contacts/$id)을 새 탭으로 연다.
 *
 * 이 패널이 보여 주는 것은 한 사람이 아니라 원장의 그 줄(CustomerLedgerRow)이다. 한 줄에는 손님이 여럿일 수
 * 있다(공동명의 부부 등). 그래서 머리에는 그 줄의 손님들을 함께 적고, 상담과 메모도 그 손님들 것을 모두
 * 모아 보여 준다. 대표 연락 고객 한 사람의 연락처 패널이 아니다 — 그것은 연락처 화면에 있다.
 */

export const CUSTOMER_INSPECTOR_ID = "customer-ledger-inspector";
export const CUSTOMER_INSPECTOR_WIDTH = 584;
const CONSULTATIONS_SHOWN = 3;
/** 상담 이력을 한 번에 받아 오는 건수 */
const CONSULTATIONS_PAGE_SIZE = 20;

/** 지금 이 손님의 상담을 저장하는 중인지 (저장은 화면이 쥐고 있고, 패널은 이 값만 본다) */
function useIsSavingConsultation(contactId: string | null) {
  return (
    useIsMutating({
      mutationKey: CONSULTATION_SAVE_MUTATION_KEY,
      predicate: (mutation) =>
        contactId !== null &&
        (mutation.state.variables as ConsultationSaveRequest | undefined)?.contactId === contactId,
    }) > 0
  );
}

const CONSULTATION_TYPES = ["phone", "visit", "online"] as const;

/** Esc가 패널이 아니라 떠 있는 대화상자·메뉴를 닫아야 하는 경우 */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

const barButtonClassName =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

const rowLinkClassName =
  "block truncate text-sm font-medium text-[#2f2e2a] underline-offset-2 hover:underline";

const moreLinkClassName =
  "mt-1.5 inline-flex items-center gap-1 rounded-sm text-[12px] text-muted-foreground hover:text-foreground";

/** 올해는 "11.04", 다른 해는 "25.12.28" (표의 최근 상담 칸과 같은 표기) */
export function formatLedgerDate(value: string) {
  const short = formatDateShortYear(value);
  return new Date(value).getFullYear() === new Date().getFullYear()
    ? short.slice(3)
    : short;
}

export function CustomerInspector({
  row,
  closing,
  animate,
  drafts,
  visibleComposers,
  onClose,
  onExited,
  onCreateDemandIntake,
  onSaveConsultation,
}: {
  row: CustomerLedgerRow;
  /** 닫히는 중: 미끄러져 나간 뒤 onExited가 불린다 */
  closing: boolean;
  /** 미끄러지는 움직임을 쓸지 (키보드로 열고 닫을 때는 쓰지 않는다) */
  animate: boolean;
  drafts: ConsultationDraftStore;
  /** 지금 화면에 적는 칸이 열려 있는 손님. 화면이 이것을 보고 알림을 띄울지 정한다. */
  visibleComposers: Set<string>;
  onClose: (animate?: boolean) => void;
  onExited: () => void;
  onCreateDemandIntake: () => void;
  onSaveConsultation: (request: ConsultationSaveRequest) => void;
}) {
  const customerName = getLedgerCustomerName(row);
  // 줄에 사람이 한 명일 때만 "새 탭으로 열기"가 그 사람의 연락처 화면을 연다. 여럿이면 패널 안에서 사람마다 연다.
  const contactId =
    row.participants.length <= 1 ? (row.primaryParticipant?.contact.id ?? null) : null;
  const openOrRevealResource = useTabStore((state) => state.openOrRevealResource);
  const [composing, setComposing] = useState(false);

  // 연락처·매물관리 패널과 같다: 전체 화면을 새 탭으로 열고(이미 열려 있으면 그 탭으로 가고) 패널은 닫는다.
  const openInNewTab = contactId
    ? () => {
        const route = `/contacts/${contactId}`;
        const meta = getRouteMeta(route);
        openOrRevealResource({
          route,
          kind: meta.kind,
          title: customerName || meta.title,
          resourceKey: tabResourceKeys.entity("contact", contactId),
        });
        onClose(false);
      }
    : undefined;

  const panelRef = useRef<HTMLElement>(null);
  // 키보드로 열었을 때(미끄러짐 없이 열림)만 포커스를 패널로 옮긴다
  useInspectorFocus(panelRef, !animate, row.id);

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
  // 상담을 적는 중에는 닫지 않는다: 닫으면 적던 글을 잃는다
  useInspectorOutsideClose(() => onClose(), !composing);

  // Esc는 안쪽부터 닫는다: 떠 있는 창·메뉴 → 상담 적는 칸 → 패널
  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      event.preventDefault();
      if (composing) {
        setComposing(false);
        return;
      }
      onClose(false);
    };
    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () => window.removeEventListener("keydown", handleWindowKeyDown, true);
  }, [composing, onClose]);

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      id={CUSTOMER_INSPECTOR_ID}
      data-customer-inspector
      data-property-inspector
      data-state={closing ? "closed" : "open"}
      data-motion={animate ? "slide" : "none"}
      inert={closing}
      aria-hidden={closing || undefined}
      aria-label="고객 상세 패널"
      className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col border-l border-border bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.03)] outline-none"
      style={{ width: CUSTOMER_INSPECTOR_WIDTH, maxWidth: "100%" }}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === "transform") {
          onExited();
        }
      }}
    >
      <PropertyInspectorToolbar
        onClose={onClose}
        onOpenNewTab={openInNewTab}
        showExpand={Boolean(openInNewTab)}
        headerActions={
          <CustomerCaseActionMenu project={row} customerName={customerName} />
        }
      />
      <CustomerInspectorContent
        row={row}
        customerName={customerName}
        drafts={drafts}
        visibleComposers={visibleComposers}
        composing={composing}
        onComposingChange={setComposing}
        onCreateDemandIntake={onCreateDemandIntake}
        onSaveConsultation={onSaveConsultation}
      />
    </aside>
  );
}

function CustomerInspectorContent({
  row,
  customerName,
  drafts,
  visibleComposers,
  composing,
  onComposingChange,
  onCreateDemandIntake,
  onSaveConsultation,
}: {
  row: CustomerLedgerRow;
  customerName: string;
  drafts: ConsultationDraftStore;
  visibleComposers: Set<string>;
  composing: boolean;
  onComposingChange: (open: boolean) => void;
  onCreateDemandIntake: () => void;
  onSaveConsultation: (request: ConsultationSaveRequest) => void;
}) {
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [showAllConsultations, setShowAllConsultations] = useState(false);
  const phone = getLedgerCustomerPhone(row);
  const assignees = getLedgerAssignees(row);
  const listingGroups = useMemo(
    () => groupListingIntents(row.listingIntents),
    [row.listingIntents],
  );
  const intentCount = row.demandIntents.length + listingGroups.length;

  // 이 줄의 손님들 (대표 연락 고객이 맨 앞). 상담과 메모는 이 사람들 것을 모두 모은다.
  const parties = useMemo(() => getLedgerParties(row), [row]);
  const partyIds = useMemo(() => parties.map((party) => party.contact.id), [parties]);
  const partyNames = useMemo(
    () => new Map(parties.map((party) => [party.contact.id, party.contact.name])),
    [parties],
  );
  const hasParties = partyIds.length > 0;
  const isShared = parties.length > 1;

  // 메모는 손님마다 연락처에서 읽는다 (연락처 패널과 같은 캐시).
  const contactQueries = useQueries({
    queries: partyIds.map((id) => ({
      queryKey: ["contacts", "quick-sheet", id],
      queryFn: () => api.contacts.findOne(id),
    })),
  });
  const memos = parties
    .map((party, index) => ({
      id: party.contact.id,
      name: party.contact.name,
      memo: contactQueries[index]?.data?.memo?.trim() ?? "",
    }))
    .filter((entry) => entry.memo);
  const projectMemo = row.memo?.trim() ?? "";
  const isMemoPending = contactQueries.some((query) => query.isPending);
  const failedMemoQueries = contactQueries.filter((query) => query.isError);

  // 상담 이력은 상담 목록에서 손님마다 쪽 단위로 읽는다. 연락처 상세는 최근 10건만 주므로 그것으로는 이력이 빠진다.
  const consultationsQuery = useInfiniteQuery({
    queryKey: ["consultations", "by-contacts", partyIds],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => ({
      page: pageParam,
      // partyIds와 같은 순서다.
      results: await Promise.all(
        partyIds.map((contactId) =>
          api.consultations.findAll({
            contactId,
            page: pageParam,
            limit: CONSULTATIONS_PAGE_SIZE,
          }),
        ),
      ),
    }),
    getNextPageParam: (lastPage) =>
      lastPage.results.some(
        (result) => result.pagination.page < result.pagination.totalPages,
      )
        ? lastPage.page + 1
        : undefined,
    enabled: hasParties,
  });
  // 여러 손님의 상담을 최근 것부터 한 줄로 잇는다. 순서가 아직 확정되지 않은 아래쪽은 더 불러올 때까지 내놓지 않는다.
  const consultations = useMemo(() => {
    const pages = consultationsQuery.data?.pages ?? [];
    const lastPage = pages[pages.length - 1];
    return orderConsultationSources(
      partyIds.map((_, index) => ({
        items: mergeConsultationPages(pages.map((page) => page.results[index])),
        hasMore: lastPage
          ? lastPage.results[index].pagination.page <
            lastPage.results[index].pagination.totalPages
          : false,
      })),
    );
  }, [consultationsQuery.data?.pages, partyIds]);
  // 건수는 받아 온 만큼이 아니라 서버가 센 전체다 (손님마다 센 것을 더한다).
  const consultationTotal = Math.max(
    (consultationsQuery.data?.pages[0]?.results ?? []).reduce(
      (sum, result) => sum + result.pagination.total,
      0,
    ),
    consultations.length,
  );
  const shownConsultations = showAllConsultations
    ? consultations
    : consultations.slice(0, CONSULTATIONS_SHOWN);
  const remainingConsultations = consultationTotal - shownConsultations.length;

  // 상담을 적을 손님. 적다 만 글이 있는 사람이 있으면 그 사람, 없으면 대표 연락 고객이다.
  const [chosenTargetId, setChosenTargetId] = useState<string | null>(null);
  const draftedId = partyIds.find((id) => hasConsultationDraft(drafts, id)) ?? null;
  const targetId =
    (chosenTargetId && partyIds.includes(chosenTargetId) ? chosenTargetId : null) ??
    draftedId ??
    partyIds[0] ??
    null;
  const isSavingConsultation = useIsSavingConsultation(targetId);
  const hasDraft = draftedId !== null;
  const changeTarget = (nextId: string) => {
    // 적던 글은 사람을 바꿔도 따라간다. 다만 옮겨 갈 사람에게 이미 적던 글이 있으면 덮지 않고
    // 각자 제 글을 그대로 둔다 (바꾸면 그 사람의 글이 보인다).
    if (targetId) carryConsultationDraft(drafts, targetId, nextId);
    setChosenTargetId(nextId);
  };

  // 저장이 끝나면 알림 대신 패널이 결과를 보여 준다: 상담 구역을 맨 위로 올려 방금 적은 상담이 보이게 한다.
  const consultationSectionRef = useRef<HTMLElement>(null);
  const revealConsultations = () => {
    setShowAllConsultations(false);
    consultationSectionRef.current?.scrollIntoView({ block: "start" });
  };

  // 적는 칸이 닫히면(기록했거나 닫기·Esc) 포커스가 갈 곳을 잃는다. 그 자리에 다시 나오는 "상담 기록" 단추로 돌려준다.
  const contentRef = useRef<HTMLDivElement>(null);
  const wasComposing = useRef(composing);
  useEffect(() => {
    if (wasComposing.current && !composing) {
      contentRef.current
        ?.querySelector<HTMLElement>("[data-consultation-compose]")
        ?.focus({ preventScroll: true });
    }
    wasComposing.current = composing;
  }, [composing]);

  return (
    <div ref={contentRef} className="flex min-h-0 flex-1 flex-col bg-white">
      {/* 머리 영역: 이 줄의 손님들 → 대표 연락처·담당 → 상태와 구분 */}
      <div className="shrink-0 border-b border-[#ecebe8] px-6 pb-4">
        <h2 className="text-[23px] font-bold leading-[1.25] tracking-[-0.025em] text-[#2f2e2a]">
          {getLedgerHeading(row)}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-foreground">
          {phone ? (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Phone className="size-3.5 shrink-0 text-[#a9a7a1]" />
              {formatPhone(phone)}
              {isShared && <span className="text-[#a9a7a1]">대표 연락</span>}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[#a9a7a1]">
              <Phone className="size-3.5" />
              전화번호 없음
            </span>
          )}
          {assignees.length > 0 && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <UserCheck className="size-3.5 shrink-0 text-[#a9a7a1]" />
              <span className="truncate">{assignees.join(", ")}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Clock3 className="size-3.5 text-[#a9a7a1]" />
            접수 {formatLedgerDate(row.createdAt)}
          </span>
        </div>
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <LedgerStatusChip row={row} />
          <LedgerSideTags row={row} />
          {row.projectId && (
            <span className={cn(ledgerChipClassName, "bg-[#f1f1ef] text-[#5f5e5b]")}>프로젝트</span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 pb-10 pt-5">
        {/* 줄에 사람이 여럿이면 누가 묶여 있는지부터 보여 준다. 한 명이면 머리가 이미 말해 준다. */}
        {row.participants.length > 1 && (
          <section data-ledger-people>
            <SectionTitle count={row.participants.length}>고객</SectionTitle>
            <div className="divide-y divide-[#f1f0ec]">
              {row.participants.map((participant) => (
                <ParticipantRow key={participant.contact.id} participant={participant} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionTitle
            count={intentCount || undefined}
            action={
              <span className="flex items-center gap-3">
                <TextAction
                  icon={<ListOrdered />}
                  label={row.projectId ? "진행 계획" : "프로젝트 열기"}
                  onClick={() =>
                    openProjectPlan(
                      row.projectId
                        ? { kind: "case", projectId: row.projectId, customerName }
                        : { kind: "bundle", row, customerName },
                    )
                  }
                />
                <TextAction icon={<Plus />} label="구함 의뢰 추가" onClick={onCreateDemandIntake} />
              </span>
            }
          >
            의뢰
          </SectionTitle>
          {row.projectId && (
            <ProjectPlanSummary projectId={row.projectId} title={row.title} />
          )}
          {intentCount > 0 ? (
            <div className="divide-y divide-[#f1f0ec]">
              {row.demandIntents.map((intent) => (
                <DemandIntentRow key={intent.requirementId} intent={intent} />
              ))}
              {listingGroups.map((group) => (
                <ListingIntakeRow key={group.listingIntakeId} group={group} />
              ))}
            </div>
          ) : (
            <EmptyText>지금 조건에 맞는 의뢰가 없습니다.</EmptyText>
          )}
        </section>

        <section ref={consultationSectionRef} data-ledger-consultations className="scroll-mt-5">
          <SectionTitle count={consultationTotal || undefined}>상담</SectionTitle>
          {!hasParties ? (
            <EmptyText>연결된 연락처가 없어 상담을 볼 수 없습니다.</EmptyText>
          ) : consultationsQuery.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : consultationsQuery.isError && consultations.length === 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-[#fbfaf8] px-3 py-2.5 text-[12.5px] text-muted-foreground">
              상담 기록을 불러오지 못했습니다.
              <Button variant="outline" size="xs" onClick={() => void consultationsQuery.refetch()}>
                다시 시도
              </Button>
            </div>
          ) : consultations.length > 0 ? (
            <>
              <div className="divide-y divide-[#f1f0ec]">
                {shownConsultations.map((consultation) => (
                  <ConsultationRow
                    key={consultation.id}
                    consultation={consultation}
                    // 손님이 여럿이면 누구와의 상담인지 적는다.
                    personName={
                      isShared
                        ? (partyNames.get(consultation.contactId) ?? consultation.contact?.name)
                        : undefined
                    }
                  />
                ))}
              </div>
              {!showAllConsultations ? (
                remainingConsultations > 0 && (
                  <button
                    type="button"
                    className={moreLinkClassName}
                    onClick={() => setShowAllConsultations(true)}
                  >
                    이전 {remainingConsultations}건 더 보기
                  </button>
                )
              ) : (
                <div className="flex flex-wrap items-center gap-x-4">
                  {/* 받아 온 것을 다 보여 준 뒤에도 남은 상담은 이어서 불러온다. */}
                  {consultationsQuery.isFetchNextPageError ? (
                    <button
                      type="button"
                      className={moreLinkClassName}
                      onClick={() => void consultationsQuery.fetchNextPage()}
                    >
                      이전 상담을 불러오지 못했습니다 · 다시 시도
                    </button>
                  ) : consultationsQuery.hasNextPage ? (
                    <button
                      type="button"
                      className={moreLinkClassName}
                      disabled={consultationsQuery.isFetchingNextPage}
                      onClick={() => void consultationsQuery.fetchNextPage()}
                    >
                      {consultationsQuery.isFetchingNextPage
                        ? "불러오는 중..."
                        : `이전 ${remainingConsultations}건 더 불러오기`}
                    </button>
                  ) : null}
                  {consultations.length > CONSULTATIONS_SHOWN && (
                    <button
                      type="button"
                      className={moreLinkClassName}
                      onClick={() => setShowAllConsultations(false)}
                    >
                      최근 {CONSULTATIONS_SHOWN}건만 보기
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <EmptyText>상담 기록이 없습니다.</EmptyText>
          )}
        </section>

        <section>
          <SectionTitle
            action={
              !isShared && partyIds[0] ? (
                <Link
                  to="/contacts/$id"
                  params={{ id: partyIds[0] }}
                  className="inline-flex items-center gap-1 text-[12px] font-normal text-muted-foreground hover:text-foreground [&_svg]:size-3"
                >
                  <UserRound />
                  고객 정보 열기
                </Link>
              ) : undefined
            }
          >
            메모
          </SectionTitle>
          {projectMemo || memos.length > 0 ? (
            <div className="space-y-2">
              {projectMemo && (
                <p className="whitespace-pre-wrap text-[13px] leading-[1.6] text-[#2f2e2a]">
                  <span className="mr-2 text-[12px] text-muted-foreground">프로젝트</span>
                  {projectMemo}
                </p>
              )}
              {memos.map((entry) => (
                <p key={entry.id} className="whitespace-pre-wrap text-[13px] leading-[1.6] text-[#2f2e2a]">
                  {isShared && (
                    <span className="mr-2 text-[12px] text-muted-foreground">{entry.name}</span>
                  )}
                  {entry.memo}
                </p>
              ))}
            </div>
          ) : isMemoPending && hasParties ? (
            <Skeleton className="h-10 w-full" />
          ) : failedMemoQueries.length === 0 ? (
            <EmptyText>작성된 메모가 없습니다.</EmptyText>
          ) : null}
          {failedMemoQueries.length > 0 && (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-[#fbfaf8] px-3 py-2.5 text-[12.5px] text-muted-foreground">
              메모를 불러오지 못했습니다.
              <Button
                variant="outline"
                size="xs"
                onClick={() => failedMemoQueries.forEach((query) => void query.refetch())}
              >
                다시 시도
              </Button>
            </div>
          )}
        </section>
      </div>

      {/* 아래 막대: 이 손님에게 바로 하는 일. "상담 기록"을 누르면 이 자리가 적는 칸으로 바뀐다. */}
      <div className="shrink-0 border-t border-[#ecebe8] px-6 py-3">
        {composing && targetId ? (
          <ConsultationComposer
            // 사람을 바꾸면 그 사람의 글로 새로 연다 (적던 글은 changeTarget이 옮겨 두거나, 그 사람 글이 이미 있으면 그대로 둔다).
            key={targetId}
            contactId={targetId}
            people={parties.map((party) => ({ id: party.contact.id, name: party.contact.name }))}
            onContactChange={changeTarget}
            drafts={drafts}
            visibleComposers={visibleComposers}
            onSave={onSaveConsultation}
            onSaved={revealConsultations}
            onClose={() => onComposingChange(false)}
          />
        ) : (
          <div className="flex items-center gap-1">
            {phone ? (
              <a href={`tel:${phone}`} className={barButtonClassName}>
                <Phone className="size-3.5" />
                전화
              </a>
            ) : (
              <button type="button" disabled className={barButtonClassName}>
                <Phone className="size-3.5" />
                전화번호 없음
              </button>
            )}
            <button
              type="button"
              className={barButtonClassName}
              disabled={targetId === null}
              onClick={() => setIsTaskOpen(true)}
            >
              <ListTodo className="size-3.5" />
              후속 업무
            </button>
            <button
              type="button"
              data-consultation-compose
              disabled={targetId === null}
              className={cn(
                barButtonClassName,
                "ml-auto bg-[#2f2e2a] px-4 font-medium text-white hover:bg-[#1f1e1b] hover:text-white",
              )}
              onClick={() => onComposingChange(true)}
            >
              {hasDraft && !isSavingConsultation ? (
                <span aria-hidden="true" className="size-1.5 rounded-full bg-[#dfab01]" />
              ) : (
                <MessageSquarePlus className="size-3.5" />
              )}
              {isSavingConsultation ? "기록 중" : hasDraft ? "상담 이어 적기" : "상담 기록"}
            </button>
          </div>
        )}
      </div>

      {partyIds[0] && (
        <TaskAddDialog
          contactId={partyIds[0]}
          contactName={partyNames.get(partyIds[0]) ?? customerName}
          open={isTaskOpen}
          onOpenChange={setIsTaskOpen}
        />
      )}
    </div>
  );
}

/** 줄에 묶인 한 사람: 이름(연락처 화면으로) · 역할 · 전화 */
function ParticipantRow({ participant }: { participant: CustomerLedgerParticipant }) {
  const phone = participant.contact.phone;
  return (
    <div className="flex min-w-0 items-center gap-2 py-2">
      <Link
        to="/contacts/$id"
        params={{ id: participant.contact.id }}
        className={cn(rowLinkClassName, "min-w-0 shrink")}
      >
        {participant.contact.name}
      </Link>
      <span className="min-w-0 truncate text-[12px] text-muted-foreground">
        {describeParticipantRoles(participant.roles)}
      </span>
      {participant.isCommunicationPrimary && (
        <span className={cn(ledgerChipClassName, "bg-[#f1f1ef] font-normal text-[#5f5e5b]")}>
          대표 연락
        </span>
      )}
      {phone ? (
        <a
          href={`tel:${phone}`}
          className="ml-auto shrink-0 text-[13px] tabular-nums text-[#5f5e5b] underline-offset-2 hover:underline"
        >
          {formatPhone(phone)}
        </a>
      ) : (
        <span className="ml-auto shrink-0 text-[12px] text-[#a9a7a1]">전화번호 없음</span>
      )}
    </div>
  );
}

/** 사용자가 묶은 프로젝트의 진행 계획. 순서는 사람이 정한 그대로 보여 준다(같은 번호는 동시 진행). */
function ProjectPlanSummary({ projectId, title }: { projectId: string; title: string | null }) {
  const planQuery = useQuery({
    queryKey: ["projects", "plan", projectId],
    queryFn: () => api.projects.findOne(projectId),
  });
  const steps = useMemo(
    () => [...(planQuery.data?.steps ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [planQuery.data?.steps],
  );
  const orders = useMemo(() => [...new Set(steps.map((step) => step.sortOrder))], [steps]);

  return (
    <div className="mb-1 border-b border-[#f1f0ec] pb-2.5">
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#2f2e2a]">
        <Link2 className="size-3.5 shrink-0 text-[#8e8b86]" />
        {/* 프로젝트 화면(상세)으로 간다. 코멘트 · 단계마다 담긴 내용은 거기서 본다. */}
        <Link
          to="/projects/$id"
          params={{ id: projectId }}
          className="truncate underline-offset-2 hover:underline"
          title="프로젝트 화면에서 보기"
        >
          {title?.trim() || "프로젝트"}
        </Link>
        <span className="shrink-0 text-[12px] font-normal text-[#a9a7a1]">순서는 직접 정함</span>
      </div>
      {planQuery.isPending ? (
        <Skeleton className="mt-2 h-8 w-full" />
      ) : planQuery.isError ? (
        <p className="mt-1.5 text-[12px] text-muted-foreground">진행 계획을 불러오지 못했습니다.</p>
      ) : steps.length > 0 ? (
        <ol className="mt-1.5 space-y-1">
          {steps.map((step) => (
            <li key={step.id} className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className="grid size-[17px] shrink-0 place-items-center rounded-full text-[10px] tabular-nums text-muted-foreground shadow-[inset_0_0_0_1px_#dcdad6]">
                {orders.indexOf(step.sortOrder) + 1}
              </span>
              <span className={cn("min-w-0 flex-1 truncate", step.done && "text-muted-foreground")}>
                {step.title}
              </span>
              <ProjectStepState step={step} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1.5 text-[12px] text-muted-foreground">아직 정한 단계가 없습니다.</p>
      )}
    </div>
  );
}

export function ProjectStepState({ step }: { step: ProjectStep }) {
  if (step.deal) {
    return step.deal.isCancelled ? (
      <span className="shrink-0 text-[12px] text-muted-foreground">거래 취소</span>
    ) : (
      <StatusBadge kind="dealStage" status={step.deal.stage} size="sm" />
    );
  }
  const lifecycle = step.listingIntake?.lifecycleStatus ?? step.buyerIntake?.lifecycleStatus;
  if (lifecycle) return <LedgerLifecycleChip status={lifecycle} />;
  if (step.done) return <span className="shrink-0 text-[12px] text-muted-foreground">완료</span>;
  return step.targetDate ? (
    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
      {formatLedgerDate(step.targetDate)} 목표
    </span>
  ) : null;
}

function DemandIntentRow({ intent }: { intent: CustomerLedgerDemandIntent }) {
  return (
    <div className="py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <LedgerSideTag side="buy" />
        <Link
          to="/buyer-requirements/$id"
          params={{ id: intent.requirementId }}
          title={describeDemandIntent(intent)}
          className={cn(rowLinkClassName, "min-w-0 flex-1")}
        >
          <span className="mr-1.5 font-normal text-muted-foreground">
            {transactionLabel(intent.transactionType)}
          </span>
          {describeDemandIntent(intent)}
        </Link>
        <LedgerLifecycleChip status={intent.lifecycleStatus} />
      </div>
      <p className="mt-1 truncate text-[12px] leading-[18px] text-muted-foreground">
        {intent.matchCount > 0 ? `소개한 매물 ${intent.matchCount}` : "아직 소개한 매물 없음"}
        {intent.assignedTo ? ` · 담당 ${intent.assignedTo.name}` : ""}
        {intent.moveInDate ? ` · 입주 ${formatLedgerDate(intent.moveInDate)}` : ""}
      </p>
    </div>
  );
}

function ListingIntakeRow({ group }: { group: LedgerListingGroup }) {
  return (
    <div className="py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <LedgerSideTag side="sell" />
        <Link
          to="/properties/$id"
          params={{ id: group.propertyId }}
          title={group.contextLabel}
          className={cn(rowLinkClassName, "min-w-0 flex-1")}
        >
          {group.contextLabel}
          {group.area ? (
            <span className="ml-1.5 font-normal text-muted-foreground">{formatPyeong(group.area)}</span>
          ) : null}
        </Link>
        <LedgerLifecycleChip status={group.lifecycleStatus} />
      </div>
      <p className="mt-1 truncate text-[12px] leading-[18px] text-muted-foreground">
        {group.options
          .map(
            (option) =>
              `${transactionLabel(option.transactionType)} ${describeListingPrice(option)}${option.isPaused ? " (내림)" : ""}`,
          )
          .join(" · ")}
        {" · "}
        {group.matchCount > 0 ? `소개한 손님 ${group.matchCount}` : "아직 소개한 손님 없음"}
      </p>
    </div>
  );
}

function ConsultationRow({
  consultation,
  personName,
}: {
  consultation: Consultation;
  /** 줄에 손님이 여럿일 때만 준다: 누구와의 상담인지 */
  personName?: string;
}) {
  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <span className={cn(ledgerChipClassName, "bg-[#f1f1ef] font-normal text-[#5f5e5b]")}>
          {CONSULTATION_TYPE_LABELS[consultation.type] ?? consultation.type}
        </span>
        <span className="tabular-nums">{formatLedgerDate(consultation.createdAt)}</span>
        {personName && <span className="font-medium text-[#5f5e5b]">· {personName}</span>}
        {consultation.createdBy?.name && <span>· {consultation.createdBy.name}</span>}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-[22px] text-[#2f2e2a]">
        {consultation.content}
      </p>
    </div>
  );
}

/**
 * 아래 막대 자리에 열리는 상담 적는 칸. Enter로 기록하고 Shift+Enter로 줄을 바꾼다.
 *
 * 적던 글(drafts)과 저장은 이 칸이 아니라 화면이 쥐고 있다. 이 칸은 닫았다 열거나 손님을 바꾸면
 * 새로 그려지기 때문이다. 그래서
 *  - 적던 글은 닫았다 열거나 다른 손님을 보고 와도 남고,
 *  - 저장 중에는 어느 쪽에서 다시 열어도 고칠 수 없으며(같은 글을 두 번 보내거나, 저장이 끝나면서
 *    그 사이에 고쳐 적은 글이 지워지는 일이 없다),
 *  - 저장이 끝나 그 글이 지워졌을 때만 닫힌다. 실패하면 글은 그대로 남아 다시 누를 수 있다.
 */
function ConsultationComposer({
  contactId,
  people,
  onContactChange,
  drafts,
  visibleComposers,
  onSave,
  onSaved,
  onClose,
}: {
  contactId: string;
  /** 이 줄의 손님들. 여럿이면 누구와의 상담인지 고른다. */
  people: ReadonlyArray<{ id: string; name: string }>;
  onContactChange: (contactId: string) => void;
  drafts: ConsultationDraftStore;
  visibleComposers: Set<string>;
  onSave: (request: ConsultationSaveRequest) => void;
  /** 저장이 끝나 이 칸이 닫히기 직전 */
  onSaved: () => void;
  onClose: () => void;
}) {
  const saved = drafts.get(contactId);
  const [type, setType] = useState(saved?.type ?? DEFAULT_CONSULTATION_TYPE);
  const [content, setContent] = useState(saved?.content ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSaving = useIsSavingConsultation(contactId);

  // 열리면 바로 적을 수 있게 한다. 적던 글이 있으면 그 끝에서 이어 적는다.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  // 이 칸이 화면에 있는 동안에는 저장 결과를 알림이 아니라 이 칸이 보여 준다 (알림이 아래 막대의 단추를 가린다).
  useEffect(() => {
    visibleComposers.add(contactId);
    return () => {
      visibleComposers.delete(contactId);
    };
  }, [contactId, visibleComposers]);

  // 저장이 끝났을 때: 글이 지워졌으면(성공) 닫고, 남아 있으면(실패) 그 자리에서 알리고 다시 적을 수 있게 한다.
  const [failed, setFailed] = useState(false);
  const wasSaving = useRef(isSaving);
  useEffect(() => {
    if (wasSaving.current && !isSaving) {
      if (drafts.has(contactId)) {
        setFailed(true);
        textareaRef.current?.focus({ preventScroll: true });
      } else {
        onSaved();
        onClose();
      }
    }
    wasSaving.current = isSaving;
  }, [contactId, drafts, isSaving, onClose, onSaved]);

  const submit = () => {
    const trimmed = content.trim();
    if (!trimmed || isSaving) return;
    setFailed(false);
    // 보낸 글을 그대로 기억해 둔다. 저장이 끝나면 이것과 같을 때만 지운다.
    drafts.set(contactId, { type, content });
    onSave({ contactId, type, content: trimmed });
  };

  return (
    <form
      data-consultation-composer
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {people.length > 1 && (
        <div
          role="radiogroup"
          aria-label="누구와의 상담인지"
          className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground"
        >
          <span>누구와</span>
          {people.map((person) => (
            <button
              key={person.id}
              type="button"
              role="radio"
              aria-checked={person.id === contactId}
              disabled={isSaving}
              onClick={() => onContactChange(person.id)}
              className={cn(
                ledgerChipClassName,
                "transition-colors disabled:pointer-events-none",
                person.id === contactId
                  ? "bg-[#2f2e2a] text-white"
                  : "border border-border text-[#5f5e5b] hover:bg-[rgba(55,53,47,0.06)]",
              )}
            >
              {person.name}
              {/* 지금 보는 사람 말고도 적다 만 글이 있는 사람 */}
              {person.id !== contactId && hasConsultationDraft(drafts, person.id) && (
                <span
                  title="적다 만 글이 있습니다"
                  className="ml-1 size-1.5 rounded-full bg-[#dfab01]"
                />
              )}
            </button>
          ))}
        </div>
      )}
      <label className="sr-only" htmlFor="customer-inspector-consultation">
        상담 내용
      </label>
      <textarea
        ref={textareaRef}
        id="customer-inspector-consultation"
        value={content}
        rows={3}
        // disabled 대신 readOnly: 저장 중에도 포커스가 남아 Esc와 Tab이 그대로 듣는다.
        readOnly={isSaving}
        aria-busy={isSaving}
        placeholder="통화나 방문 내용을 적어 두세요"
        onChange={(event) => {
          if (isSaving) return;
          setFailed(false);
          setContent(event.target.value);
          rememberConsultationDraft(drafts, contactId, { type, content: event.target.value });
        }}
        onKeyDown={(event) => {
          // 한글을 조합하는 중의 Enter는 글자를 확정하는 것이지 기록이 아니다.
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          submit();
        }}
        className={cn(
          "block max-h-40 min-h-[66px] w-full resize-none rounded-lg border border-border bg-[#fbfaf8] px-2.5 py-2 text-sm leading-[22px] text-foreground outline-none placeholder:text-[#a9a7a1] focus:border-[rgba(55,53,47,0.3)] focus:bg-white",
          isSaving && "opacity-60",
        )}
      />
      <div className="mt-2 flex items-center gap-2">
        <div
          role="radiogroup"
          aria-label="상담 방법"
          className="flex shrink-0 items-center gap-0.5 rounded-[8px] bg-[#f6f5f3] p-0.5 shadow-[inset_0_0_0_1px_#f0efec]"
        >
          {CONSULTATION_TYPES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={type === value}
              disabled={isSaving}
              onClick={() => {
                setType(value);
                rememberConsultationDraft(drafts, contactId, { type: value, content });
              }}
              className={cn(
                "h-6 rounded-[6px] px-2.5 text-[12px] transition-colors disabled:pointer-events-none",
                type === value
                  ? "bg-white font-medium text-foreground shadow-[0_1px_2px_rgba(40,35,25,0.1)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {CONSULTATION_TYPE_LABELS[value]}
            </button>
          ))}
        </div>
        {failed ? (
          <span role="alert" className="min-w-0 truncate text-[12px] text-destructive-strong">
            저장하지 못했습니다. 다시 눌러 주세요.
          </span>
        ) : (
          <span className="min-w-0 truncate text-[12px] text-[#a9a7a1]">
            Enter로 기록 · Shift+Enter 줄바꿈
          </span>
        )}
        <button type="button" className={cn(barButtonClassName, "ml-auto")} onClick={onClose}>
          닫기
        </button>
        <button
          type="submit"
          disabled={!content.trim() || isSaving}
          className={cn(
            barButtonClassName,
            "bg-[#2f2e2a] px-4 font-medium text-white hover:bg-[#1f1e1b] hover:text-white",
          )}
        >
          {isSaving ? "기록 중" : "기록"}
        </button>
      </div>
    </form>
  );
}
