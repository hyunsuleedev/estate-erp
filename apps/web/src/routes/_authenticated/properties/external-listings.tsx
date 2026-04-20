import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CheckCircle,
  ExternalLink,
  Filter,
  Lock,
  Plus,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type {
  ExternalListingGroup,
  ExternalListingGroupStatus,
  ExternalListingTransactionType,
  SnapshotSession,
} from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  MultiSelect,
  type MultiSelectOption,
} from '@/components/ui/multi-select';

const transactionTypes: Array<{
  value: ExternalListingTransactionType;
  label: string;
}> = [
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly', label: '월세' },
];

const statusFilters: Array<{
  value: 'all' | ExternalListingGroupStatus;
  label: string;
}> = [
  { value: 'all', label: '전체' },
  { value: 'unmatched', label: '미매칭' },
  { value: 'matched', label: '매칭' },
  { value: 'verified', label: '확정' },
  { value: 'on_hold', label: '보류' },
];

const statusMeta: Record<
  ExternalListingGroupStatus,
  { label: string; className: string }
> = {
  unmatched: {
    label: '미매칭',
    className: 'bg-amber-50 text-amber-700',
  },
  matched: {
    label: '매칭',
    className: 'bg-blue-50 text-blue-700',
  },
  verified: {
    label: '확정',
    className: 'bg-emerald-50 text-emerald-700',
  },
  on_hold: {
    label: '보류',
    className: 'bg-zinc-100 text-zinc-600',
  },
};

export const Route = createFileRoute(
  '/_authenticated/properties/external-listings',
)({
  component: ExternalListingsPage,
});

function ExternalListingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [transactionType, setTransactionType] =
    useState<ExternalListingTransactionType>('sale');
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'all' | ExternalListingGroupStatus>(
    'all',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [innerTab, setInnerTab] = useState<'new' | 'old'>('new');
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const { data: officeSites = [] } = useQuery({
    queryKey: ['office-sites'],
    queryFn: () => api.officeSites.findAll(),
  });

  const siteOptions = useMemo<MultiSelectOption[]>(
    () =>
      officeSites
        .filter((os) => os.site)
        .map((os) => ({
          value: os.siteId,
          label: os.site!.name,
        })),
    [officeSites],
  );

  // 스냅샷 세션은 (단지, 거래유형) 단일 스코프. 따라서 단지가 정확히 1개 선택된
  // 상태에서만 세션 기능이 활성화된다.
  const scopeSiteId =
    selectedSiteIds.length === 1 ? selectedSiteIds[0] : undefined;

  const { data: activeSession = null } = useQuery({
    queryKey: [
      'external-listing-active-session',
      scopeSiteId,
      transactionType,
    ],
    queryFn: () =>
      api.externalListings.getActiveSession(scopeSiteId!, transactionType),
    enabled: !!scopeSiteId,
  });

  // 거래유형/단지 전환 시 innerTab은 'new'로 리셋.
  useEffect(() => {
    setInnerTab('new');
  }, [scopeSiteId, transactionType]);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: [
      'external-listing-groups',
      transactionType,
      selectedSiteIds,
      status,
      searchQuery,
      activeSession?.id,
      innerTab,
    ],
    queryFn: () =>
      api.externalListings.findAllGroups({
        transactionType,
        // 세션 모드면 siteId 단일 스코프, 아니면 기존 siteIds 멀티
        siteId: activeSession ? scopeSiteId : undefined,
        siteIds: activeSession ? undefined : selectedSiteIds,
        status: status === 'all' ? undefined : status,
        search: searchQuery.trim() || undefined,
        bucket: activeSession ? innerTab : undefined,
      }),
  });

  const canManageSession =
    !!activeSession &&
    (user?.role === 'owner' ||
      user?.role === 'manager' ||
      activeSession.startedById === user?.id);

  const createSessionMutation = useMutation({
    mutationFn: () =>
      api.externalListings.createSession({
        siteId: scopeSiteId!,
        transactionType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          'external-listing-active-session',
          scopeSiteId,
          transactionType,
        ],
      });
      setShowStartConfirm(false);
      setInnerTab('new');
      setShowManualDialog(true);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : '스냅샷 세션 시작에 실패했습니다.';
      setSessionError(msg);
      setShowStartConfirm(false);
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: () =>
      api.externalListings.completeSession(activeSession!.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ['external-listing-active-session'],
      });
      queryClient.invalidateQueries({ queryKey: ['external-listing-groups'] });
      setShowCompleteConfirm(false);
      setSessionError(
        `스냅샷 완료: 구 데이터 ${result.staleListingsMarked}건 처리`,
      );
    },
    onError: (err: unknown) => {
      setSessionError(
        err instanceof Error ? err.message : '완료 처리에 실패했습니다.',
      );
      setShowCompleteConfirm(false);
    },
  });

  const cancelSessionMutation = useMutation({
    mutationFn: () => api.externalListings.cancelSession(activeSession!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['external-listing-active-session'],
      });
      queryClient.invalidateQueries({ queryKey: ['external-listing-groups'] });
      setShowCancelConfirm(false);
    },
    onError: (err: unknown) => {
      setSessionError(
        err instanceof Error ? err.message : '세션 취소에 실패했습니다.',
      );
      setShowCancelConfirm(false);
    },
  });

  const handleManualButtonClick = () => {
    if (!scopeSiteId) {
      setSessionError('수동 입력을 시작하려면 단지를 1개만 선택하세요.');
      return;
    }
    if (activeSession) {
      setShowManualDialog(true);
    } else {
      setShowStartConfirm(true);
    }
  };

  const metrics = useMemo(() => {
    const total = groups.length;
    const unmatched = groups.filter((g) => g.status === 'unmatched').length;
    const verified = groups.filter((g) => g.status === 'verified').length;
    const paidAds = groups.filter(
      (g) => g.mainExternalListing?.seango || g.mainExternalListing?.epju,
    ).length;
    return { total, unmatched, verified, paidAds };
  }, [groups]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">광고노트</h1>
            <span className="text-xs text-muted-foreground">
              {isLoading ? '...' : `${groups.length}건`}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            내 단지에 올라온 외부 매물을 거래유형·단지별로 추적합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeSession && (
            <>
              <Button
                size="sm"
                variant="default"
                disabled={
                  !canManageSession || completeSessionMutation.isPending
                }
                onClick={() => setShowCompleteConfirm(true)}
                title={
                  canManageSession
                    ? undefined
                    : '권한 부족: 본인 세션 또는 매니저/오너만 완료 가능'
                }
              >
                <CheckCircle className="mr-1 size-4" />
                완료
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !canManageSession || cancelSessionMutation.isPending
                }
                onClick={() => setShowCancelConfirm(true)}
              >
                <XCircle className="mr-1 size-4" />
                취소
              </Button>
            </>
          )}
          <Button size="sm" onClick={handleManualButtonClick}>
            <Plus className="mr-1 size-4" />
            수동 입력
          </Button>
        </div>
      </div>

      {activeSession && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <Lock className="size-4 text-amber-700" />
          <span className="text-amber-900">
            스냅샷 세션 진행 중 —{' '}
            <b>{activeSession.startedBy?.name ?? '알 수 없음'}</b>님이{' '}
            {new Date(activeSession.startedAt).toLocaleString('ko-KR')} 시작
          </span>
        </div>
      )}

      {sessionError && (
        <div className="flex items-center justify-between rounded-md border border-muted px-3 py-2 text-xs">
          <span>{sessionError}</span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setSessionError(null)}
          >
            닫기
          </Button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Building2}
          label="전체"
          value={`${metrics.total}건`}
          hint="현재 필터 기준"
        />
        <MetricTile
          icon={AlertCircle}
          label="미매칭"
          value={`${metrics.unmatched}건`}
          hint="호수 확인 필요"
        />
        <MetricTile
          icon={CheckCircle2}
          label="확정"
          value={`${metrics.verified}건`}
          hint="호수 매칭 완료"
        />
        <MetricTile
          icon={Sparkles}
          label="유료 광고"
          value={`${metrics.paidAds}건`}
          hint="선광고 / e편주"
        />
      </div>

      <Tabs
        value={transactionType}
        onValueChange={(v) =>
          setTransactionType(v as ExternalListingTransactionType)
        }
        className="flex flex-col gap-3"
      >
        <TabsList className="self-start">
          {transactionTypes.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="px-6">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <section className="rounded-xl border border-border/60 bg-background">
          <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="동·호수·메모·단지명 검색"
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="size-4 text-muted-foreground" />
                <MultiSelect
                  options={siteOptions}
                  selected={selectedSiteIds}
                  onChange={setSelectedSiteIds}
                  placeholder="관리 단지 선택"
                  className="min-w-[220px]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {statusFilters.map((s) => (
                <Button
                  key={s.value}
                  type="button"
                  variant={status === s.value ? 'default' : 'outline'}
                  size="xs"
                  onClick={() => setStatus(s.value)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          {activeSession && (
            <div className="flex items-center gap-1 border-b border-border/60 px-4 py-2">
              <Button
                size="xs"
                variant={innerTab === 'new' ? 'default' : 'ghost'}
                onClick={() => setInnerTab('new')}
              >
                신규
              </Button>
              <Button
                size="xs"
                variant={innerTab === 'old' ? 'default' : 'ghost'}
                onClick={() => setInnerTab('old')}
              >
                구 데이터
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                완료 시 구 데이터가 내려갑니다
              </span>
            </div>
          )}

          {transactionTypes.map((t) => (
            <TabsContent key={t.value} value={t.value} className="m-0">
              {isLoading ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : groups.length === 0 ? (
                <EmptyState hasSiteFilter={selectedSiteIds.length > 0} />
              ) : (
                <GroupTable groups={groups} transactionType={t.value} />
              )}
            </TabsContent>
          ))}
        </section>
      </Tabs>

      <ManualEntryDialog
        open={showManualDialog}
        onOpenChange={setShowManualDialog}
        siteOptions={siteOptions}
        defaultSiteId={scopeSiteId ?? selectedSiteIds[0]}
        defaultTransactionType={transactionType}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['external-listing-groups'] });
          queryClient.invalidateQueries({
            queryKey: ['external-listing-active-session'],
          });
        }}
      />

      <ConfirmDialog
        open={showStartConfirm}
        onOpenChange={setShowStartConfirm}
        title="새 스냅샷을 시작하시겠습니까?"
        description={
          '현재 목록이 "구 데이터"로 이동하고, 새로 입력한 매물만 "신규"에 표시됩니다. 완료 버튼을 누르기 전까지는 변경되지 않으며, 취소 시 구 데이터가 복구됩니다.'
        }
        confirmLabel="시작"
        onConfirm={() => createSessionMutation.mutate()}
        pending={createSessionMutation.isPending}
      />

      <ConfirmDialog
        open={showCompleteConfirm}
        onOpenChange={setShowCompleteConfirm}
        title="스냅샷을 완료하시겠습니까?"
        description="이번 세션 중 다시 입력되지 않은 매물은 비활성 처리됩니다. Group 정보와 호수 매칭은 보존됩니다."
        confirmLabel="완료"
        onConfirm={() => completeSessionMutation.mutate()}
        pending={completeSessionMutation.isPending}
      />

      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="작업을 취소하시겠습니까?"
        description="세션 락이 해제됩니다. 세션 중 입력한 신규 매물은 그대로 유지됩니다."
        confirmLabel="세션 취소"
        onConfirm={() => cancelSessionMutation.mutate()}
        pending={cancelSessionMutation.isPending}
      />
    </div>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            돌아가기
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? '처리 중...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ hasSiteFilter }: { hasSiteFilter: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
      <Building2 className="size-10 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">
        표시할 외부 매물이 없습니다.
      </p>
      <p className="text-xs text-muted-foreground">
        {hasSiteFilter
          ? '선택한 단지에 수집된 매물이 없습니다. 단지 선택을 조정해보세요.'
          : '크롤러 또는 MCP로 외부 매물 데이터를 수집하면 여기에 표시됩니다.'}
      </p>
    </div>
  );
}

function GroupTable({
  groups,
  transactionType,
}: {
  groups: ExternalListingGroup[];
  transactionType: ExternalListingTransactionType;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="border-b border-border/60 bg-muted/30 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left font-medium">단지</th>
            <th className="px-3 py-2 text-left font-medium">동·호</th>
            <th className="px-3 py-2 text-left font-medium">평형</th>
            <PriceHeader transactionType={transactionType} />
            <th className="px-3 py-2 text-left font-medium">매물 수</th>
            <th className="px-3 py-2 text-left font-medium">최근 순위</th>
            <th className="px-3 py-2 text-left font-medium">상태</th>
            <th className="px-3 py-2 text-left font-medium">최근 관측</th>
            <th className="px-3 py-2 text-left font-medium">원본</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {groups.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              transactionType={transactionType}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceHeader({
  transactionType,
}: {
  transactionType: ExternalListingTransactionType;
}) {
  if (transactionType === 'monthly') {
    return <th className="px-3 py-2 text-left font-medium">보증금 / 월세</th>;
  }
  if (transactionType === 'jeonse') {
    return <th className="px-3 py-2 text-left font-medium">전세가</th>;
  }
  return <th className="px-3 py-2 text-left font-medium">매매가</th>;
}

function GroupRow({
  group,
  transactionType,
}: {
  group: ExternalListingGroup;
  transactionType: ExternalListingTransactionType;
}) {
  const main = group.mainExternalListing;
  const meta = statusMeta[group.status];

  return (
    <tr className="hover:bg-muted/20">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium">{group.site?.name ?? '-'}</span>
          {group.site?.roadAddress && (
            <span className="text-xs text-muted-foreground">
              {group.site.roadAddress}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col">
          <span>{group.buildingName ?? '-'}</span>
          <span className="text-xs text-muted-foreground">
            {group.unit?.name ?? group.inferredHo ?? '호수 미확인'}
          </span>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col">
          <span>{group.areaName ?? '-'}</span>
          {group.exclusiveAreaM2 != null && (
            <span className="text-xs text-muted-foreground">
              {Number(group.exclusiveAreaM2).toFixed(2)}㎡
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        {main ? formatListingPrice(main, transactionType) : '-'}
      </td>
      <td className="px-3 py-3 text-center">{group.listingCount ?? '-'}</td>
      <td className="px-3 py-3">
        {main?.ranking != null ? (
          <div className="flex items-center gap-1">
            <span className="font-medium">{main.ranking}위</span>
            {(main.seango || main.epju) && (
              <Badge className="border-0 bg-fuchsia-50 text-fuchsia-700">
                유료
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
      <td className="px-3 py-3">
        <Badge className={cn('border-0', meta.className)}>{meta.label}</Badge>
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        {formatShortDate(group.lastSeenAt)}
      </td>
      <td className="px-3 py-3">
        {main?.cpPcArticleUrl ? (
          <Button asChild variant="outline" size="xs">
            <a
              href={main.cpPcArticleUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-1 size-3" />
              네이버
            </a>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </td>
    </tr>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="rounded-lg bg-muted/60 p-2 text-muted-foreground">
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}

function formatListingPrice(
  listing: { price: number | null; deposit: number | null; monthlyRent: number | null },
  transactionType: ExternalListingTransactionType,
) {
  if (transactionType === 'monthly') {
    const deposit = listing.deposit ? formatPrice(listing.deposit) : '-';
    const monthlyRent = listing.monthlyRent
      ? formatPrice(listing.monthlyRent)
      : '-';
    return `${deposit} / ${monthlyRent}`;
  }
  if (transactionType === 'jeonse') {
    return listing.deposit ? formatPrice(listing.deposit) : '-';
  }
  return listing.price ? formatPrice(listing.price) : '-';
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

interface ManualEntryForm {
  siteId: string;
  transactionType: ExternalListingTransactionType;
  articleNo: string;
  dongId: string;
  unitId: string;
  /** 호수 미선택 시 평형만 지정 */
  siteUnitTypeId: string;
  direction: string;
  price: string;
  deposit: string;
  monthlyRent: string;
  realtorName: string;
  representativeTelNo: string;
  articleFeatureDesc: string;
}

function createInitialForm(
  siteId: string | undefined,
  transactionType: ExternalListingTransactionType,
): ManualEntryForm {
  return {
    siteId: siteId ?? '',
    transactionType,
    articleNo: '',
    dongId: '',
    unitId: '',
    siteUnitTypeId: '',
    direction: '',
    price: '',
    deposit: '',
    monthlyRent: '',
    realtorName: '',
    representativeTelNo: '',
    articleFeatureDesc: '',
  };
}

function parseManwon(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function ManualEntryDialog({
  open,
  onOpenChange,
  siteOptions,
  defaultSiteId,
  defaultTransactionType,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteOptions: MultiSelectOption[];
  defaultSiteId: string | undefined;
  defaultTransactionType: ExternalListingTransactionType;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<ManualEntryForm>(() =>
    createInitialForm(defaultSiteId, defaultTransactionType),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: siteDetail } = useQuery({
    queryKey: ['site-detail', form.siteId],
    queryFn: () => api.sites.findOne(form.siteId),
    enabled: !!form.siteId,
  });

  const { data: dongs = [] } = useQuery({
    queryKey: ['dongs', form.siteId],
    queryFn: () => api.dongs.findAll(form.siteId),
    enabled: !!form.siteId,
  });

  const { data: units = [] } = useQuery({
    queryKey: ['units', form.siteId, form.dongId],
    queryFn: () =>
      api.units.findAll({ siteId: form.siteId, dongId: form.dongId }),
    enabled: !!form.siteId && !!form.dongId,
  });

  const siteUnitTypes = siteDetail?.siteUnitTypes ?? [];

  const selectedDong = useMemo(
    () => dongs.find((d) => d.id === form.dongId),
    [dongs, form.dongId],
  );
  const selectedUnit = useMemo(
    () => units.find((u) => u.id === form.unitId),
    [units, form.unitId],
  );
  const selectedSiteUnitType = useMemo(
    () => siteUnitTypes.find((t) => t.id === form.siteUnitTypeId),
    [siteUnitTypes, form.siteUnitTypeId],
  );

  const sortedUnits = useMemo(() => {
    return [...units].sort((a, b) => {
      const af = a.floor ?? 0;
      const bf = b.floor ?? 0;
      if (af !== bf) return bf - af;
      return a.name.localeCompare(b.name, 'ko', { numeric: true });
    });
  }, [units]);

  const visibleDongs = useMemo(
    () => dongs.filter((d) => !d.isPlaceholder),
    [dongs],
  );

  const resetForm = () => {
    setForm(createInitialForm(defaultSiteId, defaultTransactionType));
    setErrorMessage(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.siteId) throw new Error('단지를 선택하세요.');
      const articleNo = form.articleNo.trim() || `manual-${Date.now()}`;

      // 호수를 선택한 경우 그 Unit의 SiteUnitType에서 평형/면적 자동 채움.
      // 호수를 모르면 사용자가 고른 평형(siteUnitType)에서 면적을 가져온다.
      const unitType =
        selectedUnit?.siteUnitType ?? selectedSiteUnitType ?? null;

      return api.externalListings.batchUpsert({
        source: 'manual',
        siteId: form.siteId,
        transactionType: form.transactionType,
        listings: [
          {
            articleNo,
            unitId: selectedUnit?.id ?? null,
            buildingName: selectedDong?.name ?? null,
            inferredHo: selectedUnit?.name ?? null,
            areaName: unitType?.name ?? null,
            exclusiveAreaM2:
              unitType?.exclusiveAreaM2 ??
              selectedUnit?.exclusiveAreaM2 ??
              null,
            supplyAreaM2:
              unitType?.supplyAreaM2 ?? selectedUnit?.supplyAreaM2 ?? null,
            floorInfo:
              selectedUnit?.floor != null ? `${selectedUnit.floor}` : null,
            direction: form.direction.trim() || unitType?.direction || null,
            price: form.transactionType === 'sale' ? parseManwon(form.price) : null,
            deposit:
              form.transactionType === 'sale'
                ? null
                : parseManwon(form.deposit),
            monthlyRent:
              form.transactionType === 'monthly'
                ? parseManwon(form.monthlyRent)
                : null,
            realtorName: form.realtorName.trim() || null,
            representativeTelNo: form.representativeTelNo.trim() || null,
            articleFeatureDesc: form.articleFeatureDesc.trim() || null,
          },
        ],
      });
    },
    onSuccess: (result) => {
      if (result.errors.length > 0) {
        setErrorMessage(result.errors[0]?.message ?? '등록 중 오류가 발생했습니다.');
        return;
      }
      onSuccess();
      resetForm();
      onOpenChange(false);
    },
    onError: (err) => {
      setErrorMessage(err instanceof Error ? err.message : '등록에 실패했습니다.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>외부 매물 수동 입력</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-sm">단지 *</Label>
              <Select
                value={form.siteId}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    siteId: v,
                    dongId: '',
                    unitId: '',
                    siteUnitTypeId: '',
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="단지 선택" />
                </SelectTrigger>
                <SelectContent>
                  {siteOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">거래유형 *</Label>
              <Select
                value={form.transactionType}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    transactionType: v as ExternalListingTransactionType,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">매매</SelectItem>
                  <SelectItem value="jeonse">전세</SelectItem>
                  <SelectItem value="monthly">월세</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">매물번호</Label>
              <Input
                placeholder="비워두면 자동 생성"
                value={form.articleNo}
                onChange={(e) => setForm({ ...form, articleNo: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm">동</Label>
              <Select
                value={form.dongId}
                onValueChange={(v) =>
                  setForm({ ...form, dongId: v, unitId: '' })
                }
                disabled={!form.siteId || visibleDongs.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !form.siteId
                        ? '단지 먼저 선택'
                        : visibleDongs.length === 0
                          ? '동 정보 없음'
                          : '동 선택'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {visibleDongs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">호수 (선택)</Label>
              <Select
                value={form.unitId || 'none'}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    unitId: v === 'none' ? '' : v,
                    // 호수를 선택하면 siteUnitType은 Unit에서 자동 유래되므로 초기화
                    siteUnitTypeId: v === 'none' ? form.siteUnitTypeId : '',
                  })
                }
                disabled={!form.dongId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !form.dongId ? '동 먼저 선택' : '호수 선택'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">호수 모름</SelectItem>
                  {sortedUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                      {u.siteUnitType?.name ? ` · ${u.siteUnitType.name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-sm">
                평형 {form.unitId ? '(호수에서 자동)' : '(호수 미선택 시)'}
              </Label>
              <Select
                value={
                  form.unitId
                    ? (selectedUnit?.siteUnitType?.id ?? '')
                    : form.siteUnitTypeId
                }
                onValueChange={(v) => setForm({ ...form, siteUnitTypeId: v })}
                disabled={!form.siteId || !!form.unitId || siteUnitTypes.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      siteUnitTypes.length === 0
                        ? '평형 정보 없음'
                        : '평형 선택'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {siteUnitTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.exclusiveAreaM2
                        ? ` · 전용 ${Number(t.exclusiveAreaM2).toFixed(2)}㎡`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">향</Label>
              <Input
                placeholder="예: 남향"
                value={form.direction}
                onChange={(e) =>
                  setForm({ ...form, direction: e.target.value })
                }
              />
            </div>
            {form.transactionType === 'sale' && (
              <div className="col-span-2">
                <Label className="text-sm">매매가 (만원)</Label>
                <Input
                  type="number"
                  placeholder="예: 158000"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
            )}
            {form.transactionType === 'jeonse' && (
              <div className="col-span-2">
                <Label className="text-sm">전세보증금 (만원)</Label>
                <Input
                  type="number"
                  placeholder="예: 80000"
                  value={form.deposit}
                  onChange={(e) =>
                    setForm({ ...form, deposit: e.target.value })
                  }
                />
              </div>
            )}
            {form.transactionType === 'monthly' && (
              <>
                <div>
                  <Label className="text-sm">보증금 (만원)</Label>
                  <Input
                    type="number"
                    placeholder="예: 5000"
                    value={form.deposit}
                    onChange={(e) =>
                      setForm({ ...form, deposit: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label className="text-sm">월세 (만원)</Label>
                  <Input
                    type="number"
                    placeholder="예: 150"
                    value={form.monthlyRent}
                    onChange={(e) =>
                      setForm({ ...form, monthlyRent: e.target.value })
                    }
                  />
                </div>
              </>
            )}
            <div>
              <Label className="text-sm">등록 중개사</Label>
              <Input
                placeholder="예: 강동부동산"
                value={form.realtorName}
                onChange={(e) =>
                  setForm({ ...form, realtorName: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="text-sm">연락처</Label>
              <Input
                placeholder="예: 02-0000-0000"
                value={form.representativeTelNo}
                onChange={(e) =>
                  setForm({ ...form, representativeTelNo: e.target.value })
                }
              />
            </div>
            <div className="col-span-2">
              <Label className="text-sm">특징/메모</Label>
              <Textarea
                rows={3}
                placeholder="매물 특징, 확인 사항 등"
                value={form.articleFeatureDesc}
                onChange={(e) =>
                  setForm({ ...form, articleFeatureDesc: e.target.value })
                }
              />
            </div>
          </div>
          {errorMessage && (
            <p className="mt-3 text-xs text-destructive">{errorMessage}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
          >
            취소
          </Button>
          <Button
            size="sm"
            disabled={!form.siteId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? '저장 중...' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
