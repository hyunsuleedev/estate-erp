import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  Archive,
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Handshake,
  MoreVertical,
  Search,
  Users,
} from 'lucide-react';
import type { Deal } from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

const dealStageMeta: Record<string, { label: string; headerClassName: string; badgeClassName: string }> = {
  selection: {
    label: '최종 선택',
    headerClassName: 'bg-slate-100 text-slate-700',
    badgeClassName: 'bg-slate-100 text-slate-700',
  },
  deposit: {
    label: '가계약금',
    headerClassName: 'bg-amber-50 text-amber-700',
    badgeClassName: 'bg-amber-50 text-amber-700',
  },
  contract: {
    label: '본계약',
    headerClassName: 'bg-sky-50 text-sky-700',
    badgeClassName: 'bg-sky-50 text-sky-700',
  },
  completed: {
    label: '완료',
    headerClassName: 'bg-emerald-50 text-emerald-700',
    badgeClassName: 'bg-emerald-50 text-emerald-700',
  },
  closed: {
    label: '종료',
    headerClassName: 'bg-zinc-100 text-zinc-600',
    badgeClassName: 'bg-zinc-100 text-zinc-600',
  },
};

const dealPipelineStages = ['selection', 'deposit', 'contract', 'completed'] as const;
const dealStageOrder = [...dealPipelineStages, 'closed'] as const;
const transactionTypeOptions = ['all', 'sale', 'jeonse', 'monthly'] as const;

const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-rose-50 text-rose-700' },
  jeonse: { label: '전세', className: 'bg-blue-50 text-blue-700' },
  monthly: { label: '월세', className: 'bg-violet-50 text-violet-700' },
};

type DealPipelineStage = (typeof dealPipelineStages)[number];
type DealTransactionFilter = (typeof transactionTypeOptions)[number];

export const Route = createFileRoute('/_authenticated/deals/')({
  component: DealsPage,
});

function DealsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<DealTransactionFilter>('all');
  const [showClosedDeals, setShowClosedDeals] = useState(false);
  const deferredSearch = useDeferredValue(searchQuery);

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => api.deals.updateStage(id, { stage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
  });

  const filteredDeals = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return deals.filter((deal) => {
      const transactionType = deal.listing?.transactionType;
      if (transactionTypeFilter !== 'all' && transactionType !== transactionTypeFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        getDealTitle(deal),
        deal.property?.site?.roadAddress,
        deal.property?.site?.jibunAddress,
        deal.buyerContact?.name,
        deal.buyerContact?.phone,
        deal.sellerContact?.name,
        deal.sellerContact?.phone,
        deal.partnerBrokerName,
        deal.partnerBrokerPhone,
        deal.memo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [deals, deferredSearch, transactionTypeFilter]);

  const activeDeals = filteredDeals.filter((deal) => deal.stage !== 'closed');
  const closedDeals = filteredDeals.filter((deal) => deal.stage === 'closed');
  const activeCommission = activeDeals.reduce((sum, deal) => sum + (deal.commissionTotal ?? 0), 0);
  const completedDeals = activeDeals.filter((deal) => deal.stage === 'completed').length;
  const jointDeals = activeDeals.filter((deal) => deal.isJointBrokerage).length;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">거래관리</h1>
            <span className="text-xs text-muted-foreground">{filteredDeals.length}건</span>
          </div>
          <p className="text-sm text-muted-foreground">
            estate-crm 흐름처럼 거래 단계를 보드 기준으로 관리합니다.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Users}
          label="진행 거래"
          value={`${activeDeals.length}건`}
          hint="selection ~ completed"
        />
        <MetricTile
          icon={CircleDollarSign}
          label="예상 수수료"
          value={activeCommission ? formatPrice(activeCommission) : '-'}
          hint="진행 거래 기준"
        />
        <MetricTile
          icon={Building2}
          label="완료 단계"
          value={`${completedDeals}건`}
          hint="정산 직전 거래"
        />
        <MetricTile
          icon={Handshake}
          label="공동중개"
          value={`${jointDeals}건`}
          hint="협업 거래"
        />
      </div>

      <section className="rounded-xl border border-border/60 bg-background">
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="매물명, 연락처, 공동중개사로 검색"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {transactionTypeOptions.map((value) => (
              <Button
                key={value}
                type="button"
                variant={transactionTypeFilter === value ? 'default' : 'outline'}
                size="xs"
                onClick={() => setTransactionTypeFilter(value)}
              >
                {value === 'all' ? '전체' : transactionTypeMeta[value].label}
              </Button>
            ))}
          </div>
        </div>

        <ScrollArea className="w-full">
          <div className="flex min-w-max gap-4 p-4">
            {dealPipelineStages.map((stage) => (
              <DealColumn
                key={stage}
                stage={stage}
                deals={activeDeals.filter((deal) => deal.stage === stage)}
                onStageChange={(id, nextStage) => stageMutation.mutate({ id, stage: nextStage })}
                isUpdating={stageMutation.isPending}
              />
            ))}
          </div>
        </ScrollArea>

        {!isLoading && activeDeals.length === 0 && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
            조건에 맞는 진행 거래가 없습니다.
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border/60 bg-background">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          onClick={() => setShowClosedDeals((prev) => !prev)}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">종료 거래</h2>
            <Badge variant="secondary">{closedDeals.length}</Badge>
          </div>
          {showClosedDeals ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>

        {showClosedDeals && (
          <div className="border-t border-border/60">
            {closedDeals.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">종료된 거래가 없습니다.</div>
            ) : (
              <div className="divide-y divide-border/60">
                {closedDeals.map((deal) => (
                  <ClosedDealRow
                    key={deal.id}
                    deal={deal}
                    onStageChange={(id, stage) => stageMutation.mutate({ id, stage })}
                    isUpdating={stageMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function DealColumn({
  stage,
  deals,
  onStageChange,
  isUpdating,
}: {
  stage: DealPipelineStage;
  deals: Deal[];
  onStageChange: (id: string, stage: string) => void;
  isUpdating: boolean;
}) {
  const meta = dealStageMeta[stage];

  return (
    <section className="flex w-[320px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-muted/20">
      <div className={cn('flex items-center justify-between px-4 py-3 text-sm font-medium', meta.headerClassName)}>
        <span>{meta.label}</span>
        <Badge variant="secondary" className="bg-background/80 text-foreground">
          {deals.length}
        </Badge>
      </div>

      <div className="flex min-h-[440px] flex-1 flex-col gap-3 p-3">
        {deals.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-border/80 bg-background/70 text-sm text-muted-foreground">
            해당 단계의 거래가 없습니다.
          </div>
        ) : (
          deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onStageChange={onStageChange}
              isUpdating={isUpdating}
            />
          ))
        )}
      </div>
    </section>
  );
}

function DealCard({
  deal,
  onStageChange,
  isUpdating,
}: {
  deal: Deal;
  onStageChange: (id: string, stage: string) => void;
  isUpdating: boolean;
}) {
  const transactionType = deal.listing?.transactionType;
  const nextStage = getNextDealStage(deal.stage);

  return (
    <article className="rounded-xl border border-border/60 bg-background p-3 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {transactionType && (
              <Badge className={cn('border-0', transactionTypeMeta[transactionType]?.className)}>
                {transactionTypeMeta[transactionType]?.label ?? transactionType}
              </Badge>
            )}
            {deal.isJointBrokerage && (
              <Badge variant="outline" className="text-[11px] text-muted-foreground">
                공동중개
              </Badge>
            )}
          </div>

          <div>
            <p className="truncate text-sm font-semibold">{getDealTitle(deal)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {deal.property?.site?.roadAddress ?? deal.property?.site?.jibunAddress ?? '주소 정보 없음'}
            </p>
          </div>
        </div>

        <DealActionsMenu
          currentStage={deal.stage}
          onStageChange={(stage) => onStageChange(deal.id, stage)}
          disabled={isUpdating}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2">
        <MiniStat label="거래가" value={formatDealAmount(deal)} emphasis />
        <MiniStat label="수수료" value={deal.commissionTotal ? formatPrice(deal.commissionTotal) : '-'} />
      </div>

      <div className="mt-3 space-y-2">
        <PartyRow label="매수" name={deal.buyerContact?.name} />
        <PartyRow label="매도" name={deal.sellerContact?.name} />
      </div>

      {deal.partnerBrokerName && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Handshake className="size-3.5" />
          <span>{deal.partnerBrokerName}</span>
        </div>
      )}

      {deal.memo && (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{deal.memo}</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">업데이트 {formatShortDate(deal.updatedAt)}</span>
        {nextStage && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onStageChange(deal.id, nextStage)}
            disabled={isUpdating}
          >
            다음 단계
            <ArrowRight className="size-3" />
          </Button>
        )}
      </div>
    </article>
  );
}

function ClosedDealRow({
  deal,
  onStageChange,
  isUpdating,
}: {
  deal: Deal;
  onStageChange: (id: string, stage: string) => void;
  isUpdating: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{getDealTitle(deal)}</p>
          <Badge className={cn('border-0', dealStageMeta.closed.badgeClassName)}>
            {dealStageMeta.closed.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          매수 {deal.buyerContact?.name ?? '미지정'} · 매도 {deal.sellerContact?.name ?? '미지정'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium">{formatDealAmount(deal)}</p>
          <p className="text-xs text-muted-foreground">
            수수료 {deal.commissionTotal ? formatPrice(deal.commissionTotal) : '-'}
          </p>
        </div>

        <DealActionsMenu
          currentStage={deal.stage}
          onStageChange={(stage) => onStageChange(deal.id, stage)}
          disabled={isUpdating}
        />
      </div>
    </div>
  );
}

function DealActionsMenu({
  currentStage,
  onStageChange,
  disabled,
}: {
  currentStage: string;
  onStageChange: (stage: string) => void;
  disabled: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" disabled={disabled}>
          <MoreVertical className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">단계 변경</DropdownMenuLabel>
        {dealStageOrder.slice(0, -1).map((stage) => (
          <DropdownMenuItem
            key={stage}
            onSelect={() => onStageChange(stage)}
            className={cn(stage === currentStage && 'font-medium text-foreground')}
          >
            {dealStageMeta[stage].label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onStageChange('closed')}
        >
          <Archive className="size-4" />
          거래 종료
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
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

function MiniStat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('text-sm', emphasis && 'font-semibold')}>{value}</p>
    </div>
  );
}

function PartyRow({
  label,
  name,
}: {
  label: string;
  name: string | null | undefined;
}) {
  const displayName = name?.trim() || '미지정';

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Avatar size="sm">
          <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-medium">{displayName}</p>
        </div>
      </div>
    </div>
  );
}

function getDealTitle(deal: Deal) {
  return [deal.property?.site?.name, deal.property?.unit?.name].filter(Boolean).join(' ') || '매물 정보 없음';
}

function getDealStageIndex(stage: string) {
  return dealPipelineStages.indexOf(stage as DealPipelineStage);
}

function getNextDealStage(stage: string) {
  const currentIndex = getDealStageIndex(stage);
  if (currentIndex < 0 || currentIndex >= dealPipelineStages.length - 1) {
    return null;
  }
  return dealPipelineStages[currentIndex + 1];
}

function formatDealAmount(deal: Deal) {
  if (deal.price) {
    return formatPrice(deal.price);
  }

  const listing = deal.listing;
  if (!listing?.transactionType) {
    return '-';
  }

  if (listing.transactionType === 'monthly') {
    const deposit = listing.deposit ? formatPrice(listing.deposit) : '-';
    const monthlyRent = listing.monthlyRent ? formatPrice(listing.monthlyRent) : '-';
    return `${deposit} / ${monthlyRent}`;
  }

  const amount = listing.price ?? listing.deposit;
  return amount ? formatPrice(amount) : '-';
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

function getInitials(name: string) {
  return name.slice(0, 2);
}
