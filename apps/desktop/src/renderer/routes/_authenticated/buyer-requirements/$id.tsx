import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { BuyerRequirementStatus } from "@estate-erp/api-client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Building,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  MapPin,
  Pencil,
  PhoneCall,
  RefreshCw,
  Ruler,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatDate, formatDday, formatMoney, formatPhone } from "@/lib/format";
import {
  getStatusMeta,
  normalizeBuyerStatus,
  type BuyerStatus,
} from "@/lib/status-config";
import {
  ConfirmDialog,
  DetailField,
  EntityChip,
  PageHeader,
  StatusBadge,
} from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SITE_TYPE_LABELS,
  STATUS_TRANSITIONS,
  formatAreaRange,
  formatBudget,
  getFollowUpState,
  regionLabels,
  siteLabels,
} from "./-buyer-utils";
import { MatchSection } from "./-match-section";
import { ConsultationPanel } from "./-consultation-panel";
import { ContactLogDialog } from "./-contact-log-dialog";

export const Route = createFileRoute("/_authenticated/buyer-requirements/$id")({
  component: BuyerRequirementDetailPage,
});

/** 상태 스텝퍼의 단계별 고정 팔레트 (buyerStatus tone과 동일 톤) */
const BUYER_STATUS_STEPS: {
  status: BuyerStatus;
  dot: string;
  ring: string;
  text: string;
}[] = [
  {
    status: "active",
    dot: "bg-success",
    ring: "ring-success/25",
    text: "text-success",
  },
  {
    status: "hold",
    dot: "bg-warning",
    ring: "ring-warning/25",
    text: "text-warning",
  },
  {
    status: "completed",
    dot: "bg-muted-foreground",
    ring: "ring-muted-foreground/25",
    text: "text-muted-foreground",
  },
];

/** 헤더 바(border-b + bg-muted/40)가 있는 섹션 카드 — MatchSection과 동일한 골격 */
function DetailSection({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border", className)}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** 구매조건 한 항목 카드 — 아이콘 + 라벨 + 값 */
function RequirementCard({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5 rounded-lg border p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="text-sm font-medium">
        {children == null || children === "" ? (
          <span className="font-normal text-muted-foreground">—</span>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** 구매고객 상태 스텝퍼 — 현재 상태 강조 + 전환 가능 상태 버튼 */
function BuyerStatusFlow({
  current,
  transitions,
  pending,
  onSelect,
}: {
  current: BuyerStatus | null;
  transitions: BuyerRequirementStatus[];
  pending: boolean;
  onSelect: (status: BuyerRequirementStatus) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start">
        {BUYER_STATUS_STEPS.map((step, index) => {
          const meta = getStatusMeta("buyerStatus", step.status);
          const isCurrent = current === step.status;
          return (
            <div
              key={step.status}
              className="flex flex-1 flex-col items-center gap-1.5"
            >
              <div className="flex w-full items-center">
                <div
                  className={cn(
                    "h-px flex-1",
                    index === 0 ? "bg-transparent" : "bg-border",
                  )}
                />
                <div
                  className={cn(
                    "size-3 shrink-0 rounded-full",
                    isCurrent
                      ? cn(step.dot, "ring-4", step.ring)
                      : "border border-border bg-background",
                  )}
                />
                <div
                  className={cn(
                    "h-px flex-1",
                    index === BUYER_STATUS_STEPS.length - 1
                      ? "bg-transparent"
                      : "bg-border",
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-xs whitespace-nowrap",
                  isCurrent
                    ? cn("font-semibold", step.text)
                    : "text-muted-foreground",
                )}
              >
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>
      {transitions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {transitions.map((status) => (
            <Button
              key={status}
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={pending}
              onClick={() => onSelect(status)}
            >
              {getStatusMeta("buyerStatus", status).label}(으)로 전환
              <ArrowRight className="size-3.5" />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function BuyerRequirementDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const matchRef = useRef<HTMLDivElement>(null);

  const {
    data: requirement,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["buyer-requirements", "detail", id],
    queryFn: () => api.buyerRequirements.findOne(id),
  });

  // ── 상태 변경 ──────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: (status: BuyerRequirementStatus) =>
      api.buyerRequirements.updateStatus(id, status),
    onSuccess: async (_, status) => {
      toast.success(
        `상태가 '${getStatusMeta("buyerStatus", status).label}'(으)로 변경되었습니다.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] });
    },
    onError: () => toast.error("상태 변경에 실패했습니다."),
  });

  // ── 삭제 / 보류 유도 ──────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const hasLinks =
    (requirement?.matches?.length ?? 0) > 0 ||
    (requirement?.consultations?.length ?? 0) > 0;

  const deleteMutation = useMutation({
    mutationFn: () => api.buyerRequirements.remove(id),
    onSuccess: async () => {
      toast.success("구매고객 조건이 삭제되었습니다.");
      setDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] });
      navigate({ to: "/customers" });
    },
    onError: () => toast.error("삭제에 실패했습니다."),
  });

  const holdMutation = useMutation({
    mutationFn: () => api.buyerRequirements.updateStatus(id, "hold"),
    onSuccess: async () => {
      toast.success("보류 상태로 전환되었습니다.");
      setDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["buyer-requirements"] });
    },
    onError: () => toast.error("상태 변경에 실패했습니다."),
  });

  // ── 연락함 기록 ───────────────────────────────────────────
  const [contactLogOpen, setContactLogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 pt-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-56 w-full rounded-lg" />
          </div>
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError || !requirement) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          구매고객 조건을 불러오지 못했습니다.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="size-3.5" />
          다시 시도
        </Button>
      </div>
    );
  }

  const r = requirement;
  const followUpState = getFollowUpState(r.nextContactDate);
  const currentStatus = normalizeBuyerStatus(r.status);
  const transitions =
    STATUS_TRANSITIONS[currentStatus ?? r.status] ?? [];
  const regions = regionLabels(r);
  const sites = siteLabels(r);

  const scrollToMatch = () => {
    matchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="pt-4">
      <PageHeader
        backTo="/customers"
        showTitle
        title={r.contact?.name ? `${r.contact.name} 고객` : "구매고객 상세"}
        description={
          r.transactionType
            ? `${getStatusMeta("transactionType", r.transactionType).label} · ${formatBudget(r)}`
            : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setContactLogOpen(true)}>
              <PhoneCall className="size-3.5" />
              연락 기록
            </Button>
            <Button variant="outline" size="sm" onClick={scrollToMatch}>
              <Sparkles className="size-3.5" />
              매칭 제안
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={transitions.length === 0}
                >
                  상태 변경
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {transitions.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate(status)}
                  >
                    {getStatusMeta("buyerStatus", status).label}(으)로 전환
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" asChild>
              <Link to="/buyer-requirements/$id/edit" params={{ id }}>
                <Pencil className="size-3.5" />
                수정
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {/* ── 좌측 2/3: 의뢰 정보 + 진행 상태 + 구매조건 + 매칭 ── */}
        <div className="space-y-4 lg:col-span-2">
          {/* 의뢰 정보 (고객/상태 + 연락 관리) */}
          <DetailSection title="의뢰 정보">
            <div className="flex flex-wrap items-center gap-2">
              {r.contact && (
                <EntityChip
                  kind="contact"
                  id={r.contact.id}
                  label={r.contact.name}
                  sublabel={formatPhone(r.contact.phone)}
                />
              )}
              <StatusBadge kind="buyerStatus" status={r.status} />
              <StatusBadge kind="buyerUrgency" status={r.urgency} />
              <span className="ml-auto text-xs text-muted-foreground">
                담당 {r.assignedTo?.name ?? "미지정"}
                <span className="mx-1.5 text-border">·</span>
                등록 {formatDate(r.createdAt)}
              </span>
            </div>
            <div
              className={cn(
                "mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border px-3 py-2",
                followUpState === "overdue" &&
                  "border-destructive/40 bg-destructive-soft",
                followUpState === "today" &&
                  "border-warning/40 bg-warning-soft",
              )}
            >
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">연락 관리</span>
              </div>
              <DetailField
                label="최근 연락일"
                value={formatDate(r.lastContactDate)}
                className="py-0"
              />
              <div className="flex items-center gap-1.5">
                <DetailField
                  label="다음 연락일"
                  value={formatDate(r.nextContactDate)}
                  className="py-0"
                />
                {followUpState === "overdue" && (
                  <span className="rounded bg-destructive-soft px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                    기한 지남 {formatDday(r.nextContactDate)}
                  </span>
                )}
                {followUpState === "today" && (
                  <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">
                    오늘 연락
                  </span>
                )}
                {followUpState === "scheduled" && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {formatDday(r.nextContactDate)}
                  </span>
                )}
              </div>
            </div>
          </DetailSection>

          {/* 진행 상태 스텝퍼 */}
          <DetailSection title="진행 상태">
            <BuyerStatusFlow
              current={currentStatus}
              transitions={transitions}
              pending={statusMutation.isPending}
              onSelect={(status) => statusMutation.mutate(status)}
            />
          </DetailSection>

          {/* 구매조건 카드 */}
          <DetailSection title="구매조건">
            <div className="grid gap-3 sm:grid-cols-2">
              <RequirementCard icon={Wallet} label="예산">
                {r.transactionType ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge
                      kind="transactionType"
                      status={r.transactionType}
                      size="sm"
                    />
                    <span className="tabular-nums">{formatBudget(r)}</span>
                  </span>
                ) : (
                  formatBudget(r)
                )}
              </RequirementCard>
              <RequirementCard icon={Ruler} label="공급평형">
                <span className="tabular-nums">
                  {formatAreaRange(r.areaMin, r.areaMax)}
                </span>
              </RequirementCard>
              <RequirementCard icon={Building2} label="매물유형">
                {r.siteTypes.length
                  ? r.siteTypes
                      .map((t) => SITE_TYPE_LABELS[t] ?? t)
                      .join(", ")
                  : null}
              </RequirementCard>
              <RequirementCard icon={CalendarDays} label="입주 희망일">
                {r.moveInDate ? (
                  <span className="tabular-nums">
                    {formatDate(r.moveInDate)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({formatDday(r.moveInDate)})
                    </span>
                  </span>
                ) : null}
              </RequirementCard>
              <RequirementCard icon={MapPin} label="희망 지역">
                {regions.length ? (
                  <span className="flex flex-wrap gap-1">
                    {regions.map((label) => (
                      <span
                        key={label}
                        className="rounded-md border border-border/60 bg-muted px-1.5 py-0.5 text-xs font-normal"
                      >
                        {label}
                      </span>
                    ))}
                  </span>
                ) : null}
              </RequirementCard>
              <RequirementCard icon={Building} label="희망 단지">
                {sites.length ? (
                  <span className="flex flex-wrap gap-1">
                    {sites.map((name) => (
                      <span
                        key={name}
                        className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-normal text-primary"
                      >
                        {name}
                      </span>
                    ))}
                  </span>
                ) : null}
              </RequirementCard>
            </div>
            {r.transactionType === "monthly" &&
              (r.monthlyRentMin || r.monthlyRentMax) && (
                <p className="mt-3 text-xs tabular-nums text-muted-foreground">
                  월세 범위{" "}
                  {r.monthlyRentMin ? formatMoney(r.monthlyRentMin) : "—"} ~{" "}
                  {r.monthlyRentMax ? formatMoney(r.monthlyRentMax) : "—"}
                </p>
              )}
            {r.memo && (
              <div className="mt-3 rounded-md bg-muted/50 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">요건 메모</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                  {r.memo}
                </p>
              </div>
            )}
          </DetailSection>

          {/* 연결 매칭 + 매칭 후보 */}
          <div ref={matchRef} className="scroll-mt-4">
            <MatchSection requirement={r} />
          </div>
        </div>

        {/* ── 우측 1/3: 상담내역 ── */}
        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)]">
          <ConsultationPanel requirement={r} />
        </div>
      </div>

      {/* ── 삭제 / 보류 유도 ── */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={hasLinks ? "삭제 대신 보류 처리" : "구매고객 조건 삭제"}
        description={
          hasLinks
            ? `연결된 매칭 ${r.matches?.length ?? 0}건·상담 ${r.consultations?.length ?? 0}건이 있어 삭제할 수 없습니다. 이력을 보존하려면 보류 상태로 전환하세요.`
            : "이 구매고객 조건을 삭제합니다. 되돌릴 수 없습니다."
        }
        confirmLabel={hasLinks ? "보류로 전환" : "삭제"}
        destructive={!hasLinks}
        loading={deleteMutation.isPending || holdMutation.isPending}
        onConfirm={() => {
          if (hasLinks) holdMutation.mutate();
          else deleteMutation.mutate();
        }}
      />

      {/* ── 연락함 기록 Dialog ── */}
      <ContactLogDialog
        open={contactLogOpen}
        onOpenChange={setContactLogOpen}
        requirementId={id}
        defaultNextContactDate={r.nextContactDate}
        contactName={r.contact?.name}
      />
    </div>
  );
}
