import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  ChevronDown,
  Pencil,
  PhoneCall,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatDday, formatMoney, formatPhone } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import {
  ConfirmDialog,
  DetailField,
  EntityChip,
  PageHeader,
  StatusBadge,
} from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SITE_TYPE_LABELS,
  STATUS_TRANSITIONS,
  formatAreaRange,
  formatBudget,
  getFollowUpState,
  regionLabels,
  siteLabels,
} from './-buyer-utils';
import { MatchSection } from './-match-section';
import { ConsultationPanel } from './-consultation-panel';
import { ContactLogDialog } from './-contact-log-dialog';

export const Route = createFileRoute('/_authenticated/buyer-requirements/$id')({
  component: BuyerRequirementDetailPage,
});

function BuyerRequirementDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: requirement,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['buyer-requirements', 'detail', id],
    queryFn: () => api.buyerRequirements.findOne(id),
  });

  // ── 상태 변경 ──────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: (status: string) => api.buyerRequirements.updateStatus(id, status),
    onSuccess: async (_, status) => {
      toast.success(`상태가 '${getStatusMeta('buyerStatus', status).label}'(으)로 변경되었습니다.`);
      await queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] });
    },
    onError: () => toast.error('상태 변경에 실패했습니다.'),
  });

  // ── 삭제 / 비활성 유도 ────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const hasLinks =
    (requirement?.matches?.length ?? 0) > 0 || (requirement?.consultations?.length ?? 0) > 0;

  const deleteMutation = useMutation({
    mutationFn: () => api.buyerRequirements.remove(id),
    onSuccess: async () => {
      toast.success('구매고객 조건이 삭제되었습니다.');
      setDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] });
      navigate({ to: '/buyer-requirements' });
    },
    onError: () => toast.error('삭제에 실패했습니다.'),
  });

  const inactivateMutation = useMutation({
    mutationFn: () => api.buyerRequirements.updateStatus(id, 'inactive'),
    onSuccess: async () => {
      toast.success('비활성 상태로 전환되었습니다.');
      setDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] });
    },
    onError: () => toast.error('상태 변경에 실패했습니다.'),
  });

  // ── 연락함 기록 ───────────────────────────────────────────
  const [contactLogOpen, setContactLogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 pt-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError || !requirement) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">구매고객 조건을 불러오지 못했습니다.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="size-3.5" />
          다시 시도
        </Button>
      </div>
    );
  }

  const r = requirement;
  const followUpState = getFollowUpState(r.nextContactDate);
  const transitions = STATUS_TRANSITIONS[r.status] ?? [];
  const regions = regionLabels(r);
  const sites = siteLabels(r);

  return (
    <div className="pt-4">
      <PageHeader
        backTo="/buyer-requirements"
        title={r.contact?.name ? `${r.contact.name} 고객` : '구매고객 상세'}
        description={
          r.transactionType
            ? `${getStatusMeta('transactionType', r.transactionType).label} · ${formatBudget(r)}`
            : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setContactLogOpen(true)}>
              <PhoneCall className="size-3.5" />
              연락함 기록
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={transitions.length === 0}>
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
                    {getStatusMeta('buyerStatus', status).label}(으)로 전환
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
        {/* ── 좌측 2/3: 조건 요약 + 연결 매칭 ── */}
        <div className="space-y-4 lg:col-span-2">
          {/* 고객/상태 요약 */}
          <section className="rounded-lg border p-4">
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
                담당 {r.assignedTo?.name ?? '미지정'}
                <span className="mx-1.5 text-border">·</span>
                등록 {formatDate(r.createdAt)}
              </span>
            </div>
          </section>

          {/* 연락 관리 */}
          <section
            className={cn(
              'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border p-4',
              followUpState === 'overdue' && 'border-destructive/40 bg-destructive-soft',
              followUpState === 'today' && 'border-warning/40 bg-warning-soft',
            )}
          >
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">연락 관리</span>
            </div>
            <DetailField label="최근 연락일" value={formatDate(r.lastContactDate)} />
            <div className="flex items-center gap-1.5">
              <DetailField label="다음 연락일" value={formatDate(r.nextContactDate)} />
              {followUpState === 'overdue' && (
                <span className="rounded bg-destructive-soft px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                  기한 지남 {formatDday(r.nextContactDate)}
                </span>
              )}
              {followUpState === 'today' && (
                <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">
                  오늘 연락
                </span>
              )}
              {followUpState === 'scheduled' && (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatDday(r.nextContactDate)}
                </span>
              )}
            </div>
          </section>

          {/* 구매조건 요약 */}
          <section className="space-y-2.5 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">구매조건 요약</h3>
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <DetailField label="거래유형">
                {r.transactionType ? (
                  <StatusBadge kind="transactionType" status={r.transactionType} size="sm" />
                ) : (
                  '—'
                )}
              </DetailField>
              <DetailField label="예산" value={formatBudget(r)} />
              {r.transactionType === 'monthly' && (
                <DetailField
                  label="월세 상한"
                  value={r.monthlyRentMax ? `${formatMoney(r.monthlyRentMax)} 이하` : '—'}
                />
              )}
              <DetailField label="면적" value={formatAreaRange(r.areaMin, r.areaMax)} />
              <DetailField
                label="매물유형"
                value={
                  r.siteTypes.length
                    ? r.siteTypes.map((t) => SITE_TYPE_LABELS[t] ?? t).join(', ')
                    : '—'
                }
              />
              <DetailField label="입주 희망일">
                {r.moveInDate ? (
                  <span className="tabular-nums">
                    {formatDate(r.moveInDate)}{' '}
                    <span className="text-xs text-muted-foreground">
                      ({formatDday(r.moveInDate)})
                    </span>
                  </span>
                ) : (
                  '—'
                )}
              </DetailField>
            </div>
            <DetailField label="희망 지역">
              {regions.length ? (
                <span className="flex flex-wrap gap-1">
                  {regions.map((label) => (
                    <span
                      key={label}
                      className="rounded-md border border-border/60 bg-muted px-1.5 py-0.5 text-xs"
                    >
                      {label}
                    </span>
                  ))}
                </span>
              ) : (
                '—'
              )}
            </DetailField>
            <DetailField label="희망 단지">
              {sites.length ? (
                <span className="flex flex-wrap gap-1">
                  {sites.map((name) => (
                    <span
                      key={name}
                      className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs text-primary"
                    >
                      {name}
                    </span>
                  ))}
                </span>
              ) : (
                '—'
              )}
            </DetailField>
          </section>

          {/* 필수/선호 조건 + 메모 */}
          <section className="space-y-2.5 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">필수 · 선호 조건</h3>
            <DetailField label="필수 조건">
              {r.mustConditions.length ? (
                <span className="flex flex-wrap gap-1">
                  {r.mustConditions.map((c) => (
                    <span
                      key={c}
                      className="rounded-md bg-destructive-soft px-1.5 py-0.5 text-xs font-medium text-destructive"
                    >
                      {c}
                    </span>
                  ))}
                </span>
              ) : (
                '—'
              )}
            </DetailField>
            <DetailField label="선호 조건">
              {r.preferConditions.length ? (
                <span className="flex flex-wrap gap-1">
                  {r.preferConditions.map((c) => (
                    <span key={c} className="rounded-md bg-info-soft px-1.5 py-0.5 text-xs text-info">
                      {c}
                    </span>
                  ))}
                </span>
              ) : (
                '—'
              )}
            </DetailField>
            <DetailField label="메모">
              {r.memo ? <span className="whitespace-pre-wrap">{r.memo}</span> : '—'}
            </DetailField>
          </section>

          {/* 연결 매칭 + 매칭 후보 */}
          <MatchSection requirement={r} />
        </div>

        {/* ── 우측 1/3: 상담내역 ── */}
        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)]">
          <ConsultationPanel requirement={r} />
        </div>
      </div>

      {/* ── 삭제 / 비활성 유도 ── */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={hasLinks ? '삭제 대신 비활성 처리' : '구매고객 조건 삭제'}
        description={
          hasLinks
            ? `연결된 매칭 ${r.matches?.length ?? 0}건·상담 ${r.consultations?.length ?? 0}건이 있어 삭제할 수 없습니다. 이력을 보존하려면 비활성 상태로 전환하세요.`
            : '이 구매고객 조건을 삭제합니다. 되돌릴 수 없습니다.'
        }
        confirmLabel={hasLinks ? '비활성으로 전환' : '삭제'}
        destructive={!hasLinks}
        loading={deleteMutation.isPending || inactivateMutation.isPending}
        onConfirm={() => {
          if (hasLinks) inactivateMutation.mutate();
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
