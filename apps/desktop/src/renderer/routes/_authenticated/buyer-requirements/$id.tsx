import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, type BuyerRequirementStatus, type Match } from "@estate-erp/api-client";
import {
  BUYER_INTAKE_CONTACT_ROLES,
  BUYER_INTAKE_CONTACT_ROLE_LABELS,
  MatchStage,
  normalizeMatchStage,
  type BuyerIntakeContactRole,
} from "@estate-erp/shared";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buyerRequirementQueries } from "@/queries/buyer-requirements";
import { invalidateMatchData } from "@/queries/matches";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CalendarDays,
  Clock,
  EllipsisVertical,
  Flag,
  MapPin,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  Ruler,
  Search,
  Siren,
  Star,
  Trash2,
  UserCheck,
  UserSearch,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { formatDate, formatDday } from "@/lib/format";
import {
  getStatusMeta,
  normalizeBuyerStatus,
} from "@/lib/status-config";
import { useElementWidth } from "@/hooks/use-element-width";
import { useTabTitle } from "@/hooks/use-tab-title";
import { navigateActiveTab } from "@/features/tabs/lib/navigateActiveTab";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { ConfirmDialog, EmptyState, WonCircleIcon } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonLine, RailSection } from "../properties/-detail/rail";
import {
  DOC_WIDE_LAYOUT,
  DocProp,
  nb,
  Tag,
  type TagTone,
} from "../properties/-detail/ui";
import {
  STATUS_TRANSITIONS,
  formatBudget,
  formatSupplyPyeong,
  getFollowUpState,
  regionLabels,
  siteLabels,
  siteTypeSummary,
} from "./-buyer-utils";
import { MatchSection } from "./-match-section";
import { ConsultationPanel } from "./-consultation-panel";
import { ContactLogDialog } from "./-contact-log-dialog";
import { MatchCreateDialog } from "../wanted-properties/-match-create-dialog";

/**
 * 희망 조건 상세 (손님 한 명이 찾는 집 하나).
 *
 * 이 화면의 물음: "이 손님은 무엇을 찾고, 지금 어떤 집을 권하고 있나."
 *
 * 짜임과 부품은 프로젝트 상세 · 연락처 상세와 같다(2026-11-22 검수, 지휘자 지시): 위 얇은 줄(어디인지 + 자주 쓰는 작업),
 * 가운데 900px 문서(큰 이름 → 속성 한 줄씩 → 메모 → 연결한 매물 · 추천 매물), 오른쪽 344px 열(손님 · 상담).
 * 부품은 매물 상세(properties/-detail)의 nb · Tag · H2 · DocProp · RailSection · PersonLine.
 * 조건을 고치는 일은 수정 화면에서, 매칭 단계를 옮기는 일은 희망매물 목록에서 한다(여기서는 읽고 붙인다).
 */
export const Route = createFileRoute("/_authenticated/buyer-requirements/$id")({
  component: BuyerRequirementDetailPage,
});

/** 상태를 바꾸는 단추 · 알림의 말 ("보류로 바꾸기", "활성으로 바꿨습니다") */
const STATUS_ACTION_LABEL: Record<string, string> = {
  active: "활성으로",
  hold: "보류로",
  completed: "완료로",
};

const STATUS_TONE: Record<string, TagTone> = {
  active: "green",
  hold: "yellow",
  completed: "gray",
};

const URGENCY_TONE: Record<string, TagTone> = {
  urgent: "red",
  normal: "gray",
  flexible: "blue",
};

interface BuyerIntakeParticipantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyerIntakeId: string;
  existingContactIds: string[];
}

function BuyerIntakeParticipantDialog({
  open,
  onOpenChange,
  buyerIntakeId,
  existingContactIds,
}: BuyerIntakeParticipantDialogProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<{
    id: string;
    name: string;
    phone: string | null;
  } | null>(null);
  const [role, setRole] = useState<BuyerIntakeContactRole>("co_buyer");
  const [isPrimary, setIsPrimary] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    setSelected(null);
    setRole("co_buyer");
    setIsPrimary(false);
  }, [open]);

  const trimmed = searchQuery.trim();
  const candidatesQuery = useQuery({
    queryKey: ["contacts", "buyer-participant-candidates", trimmed],
    queryFn: () => api.contacts.findAll({ search: trimmed, limit: 8 }),
    enabled: open && trimmed.length >= 1,
  });

  const existingSet = new Set(existingContactIds);
  const candidates = (candidatesQuery.data?.items ?? []).filter(
    (c) => !existingSet.has(c.id),
  );

  const addMutation = useMutation({
    mutationFn: () =>
      api.buyerIntakes.addContact(buyerIntakeId, {
        contactId: selected!.id,
        role,
        isPrimary,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] }),
        queryClient.invalidateQueries({ queryKey: ["buyer-intakes"] }),
      ]);
      toast.success("손님을 추가했습니다.");
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "손님을 추가하지 못했습니다."));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>참여 손님 추가</DialogTitle>
          <DialogDescription>
            함께 집을 보거나 의사결정에 참여하는 연락처를 연결합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">연락처 검색</Label>
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (selected) setSelected(null);
              }}
              placeholder="이름 또는 전화번호 1글자 이상"
              autoFocus
            />
          </div>

          {selected ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{selected.name}</span>
                {selected.phone && (
                  <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                    {selected.phone}
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setSelected(null)}
              >
                변경
              </Button>
            </div>
          ) : trimmed.length >= 1 ? (
            <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
              {candidatesQuery.isLoading ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">검색 중...</div>
              ) : candidates.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  추가할 수 있는 연락처가 없습니다.
                </div>
              ) : (
                candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelected({ id: c.id, name: c.name, phone: c.phone })}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {c.phone ?? "번호 없음"}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">역할</Label>
            <Select value={role} onValueChange={(v) => setRole(v as BuyerIntakeContactRole)}>
              <SelectTrigger className="h-8 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUYER_INTAKE_CONTACT_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {BUYER_INTAKE_CONTACT_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="rounded border-input"
            />
            <span>대표 손님으로 설정</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            disabled={!selected || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            {addMutation.isPending ? "추가 중..." : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const muted = <span className="text-[#37352f]/45">정하지 않음</span>;

/** "99.17㎡ (30평)" — 평은 목록 표기와 같게(정수로 떨어지면 정수) */
function formatAreaDetailed(value: number | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const m2 = Number(value);
  if (!Number.isFinite(m2) || m2 <= 0) return null;
  return `${Math.round(m2 * 100) / 100}㎡ (${formatSupplyPyeong(m2)})`;
}

function formatAreaRangeDetailed(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
): string | null {
  const minText = formatAreaDetailed(min);
  const maxText = formatAreaDetailed(max);
  if (minText && maxText) return `${minText} ~ ${maxText}`;
  if (minText) return `${minText} 이상`;
  if (maxText) return `${maxText} 이하`;
  return null;
}

function BuyerRequirementDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [rootRef, rootWidth] = useElementWidth<HTMLDivElement>();
  const wide = rootWidth === 0 || rootWidth >= DOC_WIDE_LAYOUT;

  const {
    data: requirement,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    ...buyerRequirementQueries.detail(id),
    // 없는 희망 조건(404)과 형식이 틀린 주소(400)는 다시 물어도 같다
    retry: (failureCount, caught) => !isMissingError(caught) && failureCount < 2,
  });
  const notFound = isMissingError(error);

  // 탭 제목: 손님 이름 + 거래유형 ("김민준 · 전세"). 링크로 열면 처음에는 화면 종류 이름이다.
  useTabTitle(
    requirement
      ? [
          requirement.contact?.name ?? "고객",
          requirement.transactionType
            ? getStatusMeta("transactionType", requirement.transactionType).label
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
  );

  const backToList = () => {
    const route = "/wanted-properties";
    const meta = getRouteMeta(route);
    void navigateActiveTab({ route, kind: meta.kind, title: meta.title });
  };

  // ── 상태 변경 ──────────────────────────────────────────────
  // 완료하면 서버가 이 조건의 진행 중 매칭도 함께 닫는다. 그래서 진행 중인 매칭이 있으면 먼저 묻는다.
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const statusMutation = useMutation({
    mutationFn: (status: BuyerRequirementStatus) =>
      api.buyerRequirements.updateStatus(id, status),
    onSuccess: async (saved, status) => {
      setConfirmCompleteOpen(false);
      toast.success(`상태를 ${STATUS_ACTION_LABEL[status] ?? status} 바꿨습니다.`, {
        description:
          saved.closedMatchCount > 0
            ? `연결한 매물 ${saved.closedMatchCount}건의 진행도 끝냈습니다.`
            : undefined,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] }),
        invalidateMatchData(queryClient),
      ]);
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, "상태를 바꾸지 못했습니다. 다시 시도해 주세요.")),
  });

  // ── 삭제 / 보류 유도 ──────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => api.buyerRequirements.remove(id),
    onSuccess: async () => {
      toast.success("희망 조건을 삭제했습니다.");
      setDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] });
      backToList();
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, "삭제하지 못했습니다. 다시 시도해 주세요.")),
  });
  const holdMutation = useMutation({
    mutationFn: () => api.buyerRequirements.updateStatus(id, "hold"),
    onSuccess: async () => {
      toast.success("보류로 바꿨습니다.");
      setDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, "상태를 바꾸지 못했습니다. 다시 시도해 주세요.")),
  });

  // ── 연락함 기록 ───────────────────────────────────────────
  const [contactLogOpen, setContactLogOpen] = useState(false);
  // ── 매물 연결 창 (null이면 닫힘) ───────────────────────────
  const [linkMode, setLinkMode] = useState<"fit" | "all" | null>(null);

  // 참여 손님(오른쪽 열)의 상태와 동작. 훅은 아래의 이른 return(불러오는 중 · 없음 · 오류)보다 앞에 둔다 —
  // 뒤에 두면 불러오기가 끝나는 순간 훅의 수가 늘어 화면이 통째로 죽는다("Rendered more hooks than during the previous render").
  const [participantDialogOpen, setParticipantDialogOpen] = useState(false);
  const setPrimaryParticipant = useMutation({
    mutationFn: (contactId: string) =>
      api.buyerIntakes.updateContact(requirement!.buyerIntake!.id, contactId, { isPrimary: true }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] }),
        queryClient.invalidateQueries({ queryKey: ["buyer-intakes"] }),
      ]);
      toast.success("대표 손님을 변경했습니다.");
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "대표 손님을 변경하지 못했습니다."));
    },
  });
  const removeParticipant = useMutation({
    mutationFn: (contactId: string) =>
      api.buyerIntakes.removeContact(requirement!.buyerIntake!.id, contactId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] }),
        queryClient.invalidateQueries({ queryKey: ["buyer-intakes"] }),
      ]);
      toast.success("참여 손님을 제외했습니다.");
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "참여 손님을 제외하지 못했습니다."));
    },
  });


  if (isLoading) {
    return (
      <PageShell onBack={backToList}>
        <div className="mx-auto w-full max-w-[1180px] space-y-4 px-10 pt-8">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-40 w-full max-w-[560px]" />
          <Skeleton className="h-56 w-full" />
        </div>
      </PageShell>
    );
  }

  if (notFound) {
    // 지워졌거나 잘못된 주소: "다시 시도"로는 풀리지 않으므로 희망매물로만 보낸다
    return (
      <PageShell onBack={backToList}>
        <EmptyState
          icon={UserSearch}
          title="희망 조건을 찾을 수 없습니다"
          description="지워졌거나 잘못된 주소입니다."
          className="flex-1"
          action={
            <Button variant="outline" onClick={backToList}>
              희망매물로 가기
            </Button>
          }
        />
      </PageShell>
    );
  }

  if (isError || !requirement) {
    return (
      <PageShell onBack={backToList}>
        <EmptyState
          icon={AlertCircle}
          title="희망 조건을 불러오지 못했습니다"
          description="네트워크 상태를 확인한 뒤 다시 시도하세요."
          className="flex-1"
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              다시 시도
            </Button>
          }
        />
      </PageShell>
    );
  }

  const r = requirement;
  const name = r.contact?.name ?? "고객";
  const phone = r.contact?.phone ?? null;
  const currentStatus = normalizeBuyerStatus(r.status) ?? r.status;
  const transitions = STATUS_TRANSITIONS[currentStatus as BuyerRequirementStatus] ?? [];
  const followUpState = getFollowUpState(r.nextContactDate);
  const regions = regionLabels(r);
  const sites = siteLabels(r);
  const matches = r.matches ?? [];
  const openMatchCount = matches.filter((match) => {
    const stage = normalizeMatchStage(match.stage);
    return stage !== MatchStage.CLOSED && stage !== MatchStage.DEAL_CREATED;
  }).length;
  const hasLinks = matches.length > 0 || (r.consultations?.length ?? 0) > 0;

  const changeStatus = (status: BuyerRequirementStatus) => {
    if (status === "completed" && openMatchCount > 0) {
      setConfirmCompleteOpen(true);
      return;
    }
    statusMutation.mutate(status);
  };
  // 매물 찾기: 희망매물 화면의 "매물 연결" 창을 그대로 쓴다. 처음에는 조건에 맞는 매물, "전체 매물"로 바꾸면
  // 조건 밖의 매물(30평대 손님에게 25평)도 찾아 연결한다 (예전에는 아래 추천 목록으로 스크롤만 했다).
  const openLinkDialog = (mode: "fit" | "all") => setLinkMode(mode);
  const openEdit = () => {
    const route = `/buyer-requirements/${id}/edit`;
    const meta = getRouteMeta(route);
    void navigateActiveTab({ route, kind: meta.kind, title: meta.title });
  };

  const people = (r.buyerIntake?.contacts ?? []).filter((person) => person.contact);
  // 사람의 역할은 거래유형으로 부른다: 매매는 매수인, 전세 · 월세는 임차인, 정하지 않았으면 고객 (화면 낱말 기준)
  const partyLabel =
    r.transactionType === "sale"
      ? "매수인"
      : r.transactionType === "jeonse" || r.transactionType === "monthly"
        ? "임차인"
        : "고객";
  const roleLabel = (role: string) => {
    if (role === "buyer") return partyLabel;
    if (role === "co_buyer") return partyLabel === "고객" ? "공동 고객" : `공동 ${partyLabel}`;
    return BUYER_INTAKE_CONTACT_ROLE_LABELS[role as BuyerIntakeContactRole] ?? role;
  };
  const rail = (
    <>
      <RailSection
        title="손님"
        count={people.length || undefined}
        className="pt-0.5"
        action={
          r.buyerIntake?.id ? (
            <button
              type="button"
              className={nb.ghost}
              onClick={() => setParticipantDialogOpen(true)}
            >
              <Plus className="size-3.5" />
              고객 추가
            </button>
          ) : undefined
        }
      >
        <ul data-requirement-people>
          {people.length > 0 ? (
            people.map((person) => (
              <PersonLine
                key={person.contactId}
                contactId={person.contactId}
                name={person.contact?.name ?? "이름 없음"}
                role={roleLabel(person.role)}
                roleTone={person.isPrimary ? "brown" : "gray"}
                badge={person.isPrimary ? "대표" : null}
                phone={person.contact?.phone ?? null}
                actions={
                  r.buyerIntake?.id ? (
                    <div className="mt-0.5 flex items-center gap-0.5">
                      {!person.isPrimary && (
                        <button
                          type="button"
                          title="대표 손님으로 설정"
                          aria-label={`${person.contact?.name ?? "손님"} 대표로 설정`}
                          disabled={setPrimaryParticipant.isPending}
                          onClick={() => setPrimaryParticipant.mutate(person.contactId)}
                          className={nb.icon}
                        >
                          <Star className="size-3.5" />
                        </button>
                      )}
                      {people.length > 1 && (
                        <button
                          type="button"
                          title="참여에서 제외"
                          aria-label={`${person.contact?.name ?? "손님"} 제외`}
                          disabled={removeParticipant.isPending}
                          onClick={() => removeParticipant.mutate(person.contactId)}
                          className={nb.icon}
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ) : undefined
                }
              />
            ))
          ) : (
            <PersonLine
              contactId={r.contact?.id ?? null}
              name={name}
              role={partyLabel}
              roleTone="brown"
              phone={phone}
            />
          )}
        </ul>
      </RailSection>
      <ConsultationPanel requirement={r} />
    </>
  );

  return (
    <div
      ref={rootRef}
      data-requirement-detail
      className="-m-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-[#37352f]"
    >
      {/* 위 줄: 왼쪽은 어디인지(희망매물 / 이 손님), 오른쪽은 자주 쓰는 작업 */}
      <header className="flex h-[46px] shrink-0 items-center gap-2 border-b border-[#e9e9e7] bg-white pl-4 pr-5">
        <nav aria-label="위치" className="flex min-w-0 flex-1 items-center gap-0.5 text-[14px]">
          <button type="button" className={nb.ghost} onClick={backToList}>
            <UserSearch />
            희망매물
          </button>
          <span className="text-[#37352f]/25">/</span>
          <span className="min-w-0 truncate px-2 text-[#37352f]" title={name}>
            {name}
          </span>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          {phone && (
            <a href={`tel:${phone}`} className={nb.ghost} title={`${name}에게 전화`}>
              <Phone />
              전화
            </a>
          )}
          <button type="button" className={nb.line} onClick={() => setContactLogOpen(true)}>
            <PhoneCall />
            연락일 정하기
          </button>
          <button type="button" className={nb.line} onClick={openEdit}>
            <Pencil />
            수정
          </button>
          <button type="button" className={nb.solid} onClick={() => openLinkDialog("fit")}>
            <Search />
            매물 찾기
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={nb.icon} aria-label={`${name} 작업 메뉴`}>
                <EllipsisVertical />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {transitions.map((status) => (
                <DropdownMenuItem
                  key={status}
                  disabled={statusMutation.isPending}
                  onSelect={() => changeStatus(status)}
                >
                  <Flag className="size-3.5" />
                  {STATUS_ACTION_LABEL[status]} 바꾸기
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                <Trash2 className="size-3.5" />
                희망 조건 삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          ref={scrollerRef}
          data-requirement-scroller
          className="relative flex min-w-0 flex-1 flex-col overflow-y-auto"
        >
          <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col px-9 pb-14 pt-2">
            {/* 문서의 머리: 이름, 그 아래 속성을 한 줄씩 */}
            <h1 className="mt-5 break-keep text-[32px] font-bold leading-[1.25] tracking-[-0.028em]">
              {name}
            </h1>
            <dl data-requirement-props className="mt-3">
              <DocProp icon={<Flag />} label="상태">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1.5">
                  <Tag tone={STATUS_TONE[currentStatus] ?? "gray"} dot>
                    {getStatusMeta("buyerStatus", currentStatus).label}
                  </Tag>
                  {transitions.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={cn(nb.ghost, "h-6 px-1.5 text-[13px]")}
                      disabled={statusMutation.isPending}
                      onClick={() => changeStatus(status)}
                    >
                      {STATUS_ACTION_LABEL[status]} 바꾸기
                    </button>
                  ))}
                </span>
              </DocProp>
              <DocProp icon={<Siren />} label="긴급도">
                <span className="px-1.5">
                  <Tag tone={URGENCY_TONE[r.urgency] ?? "gray"}>
                    {getStatusMeta("buyerUrgency", r.urgency).label}
                  </Tag>
                </span>
              </DocProp>
              <DocProp icon={<WonCircleIcon />} label="예산">
                <span className="flex min-w-0 items-center gap-1.5 px-1.5">
                  {r.transactionType ? (
                    <>
                      <Tag>{getStatusMeta("transactionType", r.transactionType).label}</Tag>
                      <span className="font-medium tabular-nums">{formatBudget(r)}</span>
                    </>
                  ) : (
                    <span className="text-[#37352f]/45">거래유형을 정하지 않음</span>
                  )}
                </span>
              </DocProp>
              <DocProp icon={<Ruler />} label="희망 평형">
                <span className="px-1.5 tabular-nums">
                  {/* 상세에서는 ㎡와 평을 함께 적는다 ("99.17㎡ (30평) ~ 128.93㎡ (39평)") — 화면 낱말 기준 */}
                  {formatAreaRangeDetailed(r.areaMin, r.areaMax) ?? muted}
                </span>
              </DocProp>
              <DocProp icon={<Building2 />} label="매물 유형">
                <span className="px-1.5">
                  {siteTypeSummary(r) === "—" ? muted : siteTypeSummary(r)}
                </span>
              </DocProp>
              <DocProp icon={<MapPin />} label="희망 지역·단지">
                <span className="flex min-w-0 flex-wrap items-center gap-1 px-1.5">
                  {regions.length + sites.length === 0
                    ? muted
                    : [
                        ...regions.map((label) => <Tag key={`r:${label}`}>{label}</Tag>),
                        ...sites.map((label) => (
                          <Tag key={`s:${label}`} tone="blue">
                            {label}
                          </Tag>
                        )),
                      ]}
                </span>
              </DocProp>
              <DocProp icon={<CalendarDays />} label="입주 희망일">
                <span className="px-1.5 tabular-nums">
                  {r.moveInDate ? (
                    <>
                      {formatDate(r.moveInDate)}
                      <span className="ml-1.5 text-[13px] text-[#37352f]/55">
                        {formatDday(r.moveInDate)}
                      </span>
                    </>
                  ) : (
                    muted
                  )}
                </span>
              </DocProp>
              <DocProp icon={<UserCheck />} label="담당">
                <span className="px-1.5">
                  {r.assignedTo?.name ?? <span className="text-[#37352f]/45">담당자 없음</span>}
                </span>
              </DocProp>
              <DocProp icon={<CalendarClock />} label="연락">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-1.5 tabular-nums">
                  <span>
                    <span className="text-[#37352f]/55">최근 </span>
                    {r.lastContactDate ? formatDate(r.lastContactDate) : "없음"}
                  </span>
                  <span className="text-[#37352f]/25">·</span>
                  <span>
                    <span className="text-[#37352f]/55">다음 </span>
                    {r.nextContactDate ? formatDate(r.nextContactDate) : "정하지 않음"}
                  </span>
                  {followUpState === "overdue" && (
                    <Tag tone="red">기한 지남 {formatDday(r.nextContactDate)}</Tag>
                  )}
                  {followUpState === "today" && <Tag tone="yellow">오늘 연락</Tag>}
                </span>
              </DocProp>
              <DocProp icon={<Clock />} label="등록">
                <span className="px-1.5 tabular-nums text-[#37352f]/65">
                  {formatDate(r.createdAt)}
                </span>
              </DocProp>
            </dl>

            {/* 속성과 본문 사이의 선. 그 아래 첫 글이 고객 메모다 */}
            <div data-requirement-memo className="mt-3 border-t border-[#e9e9e7] pt-3">
              {r.memo ? (
                <p className="whitespace-pre-wrap break-keep text-[15px] leading-[1.65] [overflow-wrap:anywhere]">
                  {r.memo}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={openEdit}
                  className="-mx-1.5 rounded px-1.5 py-1 text-left text-[15px] text-[#37352f]/45 hover:bg-[#37352f]/[0.04]"
                >
                  메모 — 남향 · 학군처럼 숫자로 적기 어려운 조건을 적어 두세요
                </button>
              )}
            </div>

            <MatchSection requirement={r} onFindAll={() => openLinkDialog("all")} />

            {!wide && (
              <div data-requirement-rail="inline" className="mt-8 grid items-start gap-x-6 sm:grid-cols-2">
                {rail}
              </div>
            )}
          </div>
        </div>

        {wide && (
          <aside
            data-requirement-rail="side"
            aria-label="손님과 상담"
            className="w-[344px] shrink-0 overflow-y-auto overflow-x-hidden border-l border-[#e9e9e7] bg-white"
          >
            <div className="px-[18px] pb-14 pt-3">{rail}</div>
          </aside>
        )}
      </div>

      {/* ── 완료 확인: 진행 중인 매칭도 함께 끝난다 ── */}
      <ConfirmDialog
        open={confirmCompleteOpen}
        onOpenChange={setConfirmCompleteOpen}
        title="완료로 바꿀까요?"
        description={`연결한 매물 ${openMatchCount}건의 진행도 함께 끝납니다. 다시 활성으로 바꿔도 끝난 진행은 저절로 다시 열리지 않습니다.`}
        confirmLabel="완료로 바꾸기"
        loading={statusMutation.isPending}
        onConfirm={() => statusMutation.mutate("completed")}
      />

      {/* ── 삭제 / 보류 유도 ── */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={hasLinks ? "삭제 대신 보류 처리" : "희망 조건 삭제"}
        description={
          hasLinks
            ? `연결된 매칭 ${matches.length}건·상담 ${r.consultations?.length ?? 0}건이 있어 삭제할 수 없습니다. 이력을 보존하려면 보류 상태로 전환하세요.`
            : "이 희망 조건을 삭제합니다. 되돌릴 수 없습니다."
        }
        confirmLabel={hasLinks ? "보류로 전환" : "삭제"}
        destructive={!hasLinks}
        loading={deleteMutation.isPending || holdMutation.isPending}
        onConfirm={() => {
          if (hasLinks) holdMutation.mutate();
          else deleteMutation.mutate();
        }}
      />

      {/* ── 매물 연결 (희망매물 화면과 같은 창) ── */}
      <MatchCreateDialog
        open={linkMode !== null}
        onOpenChange={(open) => {
          if (!open) setLinkMode(null);
        }}
        // 중복 연결을 미리 막는 데 쓰는 값(매물 · 희망 조건 · 단계)만 읽는다
        matches={(r.matches ?? []) as unknown as Match[]}
        scope={{ kind: "demand", requirementId: id }}
        initialListingMode={linkMode ?? "fit"}
      />

      {/* ── 연락함 기록 Dialog ── */}
      <ContactLogDialog
        open={contactLogOpen}
        onOpenChange={setContactLogOpen}
        requirementId={id}
        defaultNextContactDate={r.nextContactDate}
        contactName={r.contact?.name}
      />

      {r.buyerIntake?.id && (
        <BuyerIntakeParticipantDialog
          open={participantDialogOpen}
          onOpenChange={setParticipantDialogOpen}
          buyerIntakeId={r.buyerIntake.id}
          existingContactIds={people.map((person) => person.contactId)}
        />
      )}
    </div>
  );
}

/** 불러오는 중 · 실패일 때의 틀. 위 줄 높이와 선은 상세 화면과 같다. */
function PageShell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div
      data-requirement-detail
      className="-m-4 flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-[#37352f]"
    >
      <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-[#e9e9e7] pl-4 pr-5">
        <button type="button" onClick={onBack} className={nb.ghost}>
          <UserSearch />
          희망매물
        </button>
      </div>
      {children}
    </div>
  );
}

/** 없는 희망 조건(404)이거나 형식이 틀린 주소(400)인지 */
function isMissingError(error: unknown) {
  return error instanceof ApiError && (error.statusCode === 404 || error.statusCode === 400);
}
