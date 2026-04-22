import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleOff,
  Clock3,
  GitBranch,
  Link2,
  MoreVertical,
  Search,
  Building2,
} from 'lucide-react';
import type { Match } from '@estate-erp/api-client';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Textarea } from '@/components/ui/textarea';

const matchStageMeta: Record<string, { label: string; headerClassName: string; badgeClassName: string }> = {
  suggested: {
    label: '추천됨',
    headerClassName: 'bg-slate-100 text-slate-700',
    badgeClassName: 'bg-slate-100 text-slate-700',
  },
  buyerContacted: {
    label: '구매자 관심',
    headerClassName: 'bg-sky-50 text-sky-700',
    badgeClassName: 'bg-sky-50 text-sky-700',
  },
  viewing: {
    label: '방문',
    headerClassName: 'bg-violet-50 text-violet-700',
    badgeClassName: 'bg-violet-50 text-violet-700',
  },
  ownerContacted: {
    label: '판매자 동의',
    headerClassName: 'bg-amber-50 text-amber-700',
    badgeClassName: 'bg-amber-50 text-amber-700',
  },
  negotiating: {
    label: '조건 협의',
    headerClassName: 'bg-orange-50 text-orange-700',
    badgeClassName: 'bg-orange-50 text-orange-700',
  },
  dealCreated: {
    label: '거래 전환',
    headerClassName: 'bg-emerald-50 text-emerald-700',
    badgeClassName: 'bg-emerald-50 text-emerald-700',
  },
  closed: {
    label: '종료',
    headerClassName: 'bg-zinc-100 text-zinc-600',
    badgeClassName: 'bg-zinc-100 text-zinc-600',
  },
};

const matchBoardStages = ['suggested', 'buyerContacted', 'viewing', 'ownerContacted', 'negotiating'] as const;
const matchStageOrder = [...matchBoardStages, 'dealCreated', 'closed'] as const;
const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-rose-50 text-rose-700' },
  jeonse: { label: '전세', className: 'bg-blue-50 text-blue-700' },
  monthly: { label: '월세', className: 'bg-violet-50 text-violet-700' },
};

const buyerProgressStages = [
  'suggested',
  'buyerContacted',
  'viewing',
  'ownerContacted',
  'negotiating',
  'dealCreated',
] as const;

type MatchBoardStage = (typeof matchBoardStages)[number];
type MatchProgressStage = (typeof buyerProgressStages)[number];
type MatchViewMode = 'buyer' | 'kanban' | 'list';

interface BuyerMatchGroupData {
  buyerReqId: string;
  buyerRequirement: NonNullable<Match['buyerRequirement']>;
  matches: Match[];
}

export const Route = createFileRoute('/_authenticated/matches/')({
  component: MatchesPage,
});

function MatchesPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilters, setStageFilters] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<MatchViewMode>('buyer');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api.matches.findAll(),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage, memo }: { id: string; stage: string; memo?: string }) =>
      api.matches.updateStage(id, { stage, memo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) ?? null,
    [matches, selectedMatchId],
  );

  useEffect(() => {
    if (!selectedMatch) {
      setIsEditingMemo(false);
      setMemoDraft('');
      return;
    }

    setMemoDraft(selectedMatch.memo ?? '');
  }, [selectedMatch?.id]);

  const filteredMatches = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return matches.filter((match) => {
      if (stageFilters.length > 0 && !stageFilters.includes(match.stage)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        getMatchTitle(match),
        match.listing?.property?.site?.roadAddress,
        match.listing?.property?.site?.jibunAddress,
        match.buyerRequirement?.contact?.name,
        match.buyerRequirement?.contact?.phone,
        match.memo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [deferredSearch, matches, stageFilters]);

  const activeMatches = filteredMatches.filter((match) => match.stage !== 'dealCreated' && match.stage !== 'closed');
  const convertedMatches = filteredMatches.filter((match) => match.stage === 'dealCreated');
  const closedMatches = filteredMatches.filter((match) => match.stage === 'closed');
  const viewingMatches = activeMatches.filter((match) => match.stage === 'viewing').length;
  const groupedBuyerMatches = useMemo<BuyerMatchGroupData[]>(() => {
    const grouped = new Map<string, BuyerMatchGroupData>();

    for (const match of filteredMatches) {
      const buyerRequirement = match.buyerRequirement;
      if (!buyerRequirement) {
        continue;
      }

      const existing = grouped.get(match.buyerReqId);
      if (existing) {
        existing.matches.push(match);
        continue;
      }

      grouped.set(match.buyerReqId, {
        buyerReqId: match.buyerReqId,
        buyerRequirement,
        matches: [match],
      });
    }

    return Array.from(grouped.values()).sort((left, right) =>
      (left.buyerRequirement.contact?.name ?? '').localeCompare(
        right.buyerRequirement.contact?.name ?? '',
        'ko',
      ),
    );
  }, [filteredMatches]);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">매칭</h1>
            <span className="text-xs text-muted-foreground">{filteredMatches.length}건</span>
          </div>
          <p className="text-sm text-muted-foreground">
            estate-crm 흐름처럼 추천부터 거래 전환까지 파이프라인으로 관리합니다.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Link2}
          label="진행 매칭"
          value={`${activeMatches.length}건`}
          hint="칸반 파이프라인"
        />
        <MetricTile
          icon={Clock3}
          label="방문 단계"
          value={`${viewingMatches}건`}
          hint="임장 예정/진행"
        />
        <MetricTile
          icon={CheckCircle2}
          label="거래 전환"
          value={`${convertedMatches.length}건`}
          hint="dealCreated"
        />
        <MetricTile
          icon={CircleOff}
          label="종료"
          value={`${closedMatches.length}건`}
          hint="close 처리"
        />
      </div>

      <section className="rounded-xl border border-border/60 bg-background">
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="고객명, 연락처, 매물명으로 검색"
                className="pl-9"
              />
            </div>

            <MultiSelect
              options={matchStageOrder.map((stage) => ({
                value: stage,
                label: matchStageMeta[stage].label,
              }))}
              selected={stageFilters}
              onChange={setStageFilters}
              placeholder="단계 필터"
              maxCount={4}
            />

            <div className="flex items-center gap-1 border rounded-lg p-1 ml-auto">
              <Button
                variant={viewMode === 'buyer' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('buyer')}
                className="gap-1.5 text-xs"
              >
                <GitBranch className="size-3.5" />
                고객별
              </Button>
              <Button
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('kanban')}
                className="gap-1.5 text-xs"
              >
                칸반
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="gap-1.5 text-xs"
              >
                리스트
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 py-3">
          {viewMode === 'buyer' && (
              <div className="space-y-4">
                {groupedBuyerMatches.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">
                    고객별로 묶어 보여줄 매칭이 없습니다.
                  </div>
                ) : (
                  groupedBuyerMatches.map((group) => (
                    <BuyerMatchGroup
                      key={group.buyerReqId}
                      buyerRequirement={group.buyerRequirement}
                      matches={group.matches}
                      onStageChange={(id, stage) => stageMutation.mutate({ id, stage })}
                      isUpdating={stageMutation.isPending}
                      onOpenDetail={setSelectedMatchId}
                    />
                  ))
                )}
              </div>
          )}

          {viewMode === 'kanban' && (
            <div className="space-y-4">
              <div className="flex gap-3">
                {matchBoardStages.map((stage) => (
                  <MatchColumn
                    key={stage}
                    stage={stage}
                    matches={activeMatches.filter((match) => match.stage === stage)}
                    onStageChange={(id, nextStage) => stageMutation.mutate({ id, stage: nextStage })}
                    isUpdating={stageMutation.isPending}
                    onOpenDetail={setSelectedMatchId}
                  />
                ))}
              </div>

              {!isLoading && activeMatches.length === 0 && (
                <div className="rounded-lg border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">
                  조건에 맞는 진행 매칭이 없습니다.
                </div>
              )}

              <div className="grid gap-4 xl:grid-cols-2">
                <ResultPanel
                  title="거래 전환"
                  emptyMessage="거래 전환된 매칭이 없습니다."
                  matches={convertedMatches}
                  isUpdating={stageMutation.isPending}
                  onStageChange={(id, stage) => stageMutation.mutate({ id, stage })}
                  onOpenDetail={setSelectedMatchId}
                />
                <ResultPanel
                  title="종료"
                  emptyMessage="종료된 매칭이 없습니다."
                  matches={closedMatches}
                  isUpdating={stageMutation.isPending}
                  onStageChange={(id, stage) => stageMutation.mutate({ id, stage })}
                  onOpenDetail={setSelectedMatchId}
                />
              </div>
            </div>
          )}

          {viewMode === 'list' && (
            <div className="overflow-hidden rounded-xl border border-border/60">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">단계</th>
                      <th className="px-4 py-3 font-medium">고객</th>
                      <th className="px-4 py-3 font-medium">매물</th>
                      <th className="px-4 py-3 font-medium">조건</th>
                      <th className="px-4 py-3 font-medium">메모</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatches.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          매칭이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredMatches.map((match) => (
                        <tr
                          key={match.id}
                          className="border-t border-border/60 align-top hover:bg-muted/30"
                          onDoubleClick={() => setSelectedMatchId(match.id)}
                          title="더블클릭하여 상세보기"
                        >
                          <td className="px-4 py-3">
                            <Badge className={cn('border-0', matchStageMeta[match.stage].badgeClassName)}>
                              {matchStageMeta[match.stage].label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <p className="font-medium">{match.buyerRequirement?.contact?.name ?? '미지정'}</p>
                              <p className="text-xs text-muted-foreground">
                                {match.buyerRequirement?.contact?.phone ?? '-'}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <p className="font-medium">{getMatchTitle(match)}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                {match.listing?.transactionType && (
                                  <Badge
                                    className={cn(
                                      'border-0',
                                      transactionTypeMeta[match.listing.transactionType]?.className,
                                    )}
                                  >
                                    {transactionTypeMeta[match.listing.transactionType]?.label ?? match.listing.transactionType}
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">{formatMatchPrice(match)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatRequirementSummary(match)}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            <p className="line-clamp-2">{match.memo ?? '-'}</p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end">
                              <MatchActionsMenu
                                currentStage={match.stage}
                                onStageChange={(stage) => stageMutation.mutate({ id: match.id, stage })}
                                disabled={stageMutation.isPending}
                                onOpenDetail={() => setSelectedMatchId(match.id)}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      <MatchDetailDialog
        match={selectedMatch}
        open={selectedMatchId !== null}
        memoDraft={memoDraft}
        isEditingMemo={isEditingMemo}
        isSaving={stageMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMatchId(null);
          }
        }}
        onMemoDraftChange={setMemoDraft}
        onEditMemo={() => setIsEditingMemo(true)}
        onCancelEditMemo={() => {
          setIsEditingMemo(false);
          setMemoDraft(selectedMatch?.memo ?? '');
        }}
        onSaveMemo={() => {
          if (!selectedMatch) {
            return;
          }

          stageMutation.mutate(
            {
              id: selectedMatch.id,
              stage: selectedMatch.stage,
              memo: memoDraft.trim() || undefined,
            },
            {
              onSuccess: () => {
                setIsEditingMemo(false);
              },
            },
          );
        }}
        onStageChange={(stage) => {
          if (!selectedMatch) {
            return;
          }
          stageMutation.mutate({ id: selectedMatch.id, stage });
        }}
      />
    </div>
  );
}

function MatchColumn({
  stage,
  matches,
  onStageChange,
  isUpdating,
  onOpenDetail,
}: {
  stage: MatchBoardStage;
  matches: Match[];
  onStageChange: (id: string, stage: string) => void;
  isUpdating: boolean;
  onOpenDetail: (id: string) => void;
}) {
  const meta = matchStageMeta[stage];

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-muted/20">
      <div className={cn('flex items-center justify-between px-4 py-3 text-sm font-medium', meta.headerClassName)}>
        <span>{meta.label}</span>
        <Badge variant="secondary" className="bg-background/80 text-foreground">
          {matches.length}
        </Badge>
      </div>

      <div className="flex min-h-[440px] flex-1 flex-col gap-3 p-3">
        {matches.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-border/80 bg-background/70 text-sm text-muted-foreground">
            해당 단계의 매칭이 없습니다.
          </div>
        ) : (
          matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              onStageChange={onStageChange}
              isUpdating={isUpdating}
              onOpenDetail={onOpenDetail}
            />
          ))
        )}
      </div>
    </section>
  );
}

function BuyerMatchGroup({
  buyerRequirement,
  matches,
  onStageChange,
  isUpdating,
  onOpenDetail,
}: {
  buyerRequirement: NonNullable<Match['buyerRequirement']>;
  matches: Match[];
  onStageChange: (id: string, stage: string) => void;
  isUpdating: boolean;
  onOpenDetail: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const buyerName = buyerRequirement.contact?.name ?? '미지정';
  const activeCount = matches.filter((match) => !['dealCreated', 'closed'].includes(match.stage)).length;
  const convertedCount = matches.filter((match) => match.stage === 'dealCreated').length;
  const closedCount = matches.filter((match) => match.stage === 'closed').length;
  const sortedMatches = [...matches].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

  return (
    <section className="rounded-xl border border-border/60 bg-background">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="rounded-md border border-border/60 bg-muted/30 p-1 text-muted-foreground">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>

        <Avatar>
          <AvatarFallback>{getInitials(buyerName)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{buyerName}</p>
          <p className="truncate text-sm text-muted-foreground">
            {buyerRequirement.contact?.phone ?? '연락처 없음'}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge variant="secondary">매칭 {matches.length}</Badge>
          {activeCount > 0 && (
            <Badge className="border-0 bg-sky-50 text-sky-700">진행 {activeCount}</Badge>
          )}
          {convertedCount > 0 && (
            <Badge className="border-0 bg-emerald-50 text-emerald-700">거래 {convertedCount}</Badge>
          )}
          {closedCount > 0 && (
            <Badge className="border-0 bg-zinc-100 text-zinc-600">종료 {closedCount}</Badge>
          )}
        </div>
      </button>

      {expanded && (
        <>
          <div className="border-t border-border/60 px-4 py-3 text-sm text-muted-foreground">
            {formatRequirementSummaryFromBuyerRequirement(buyerRequirement)}
          </div>

          <div className="border-t border-border/60 px-4 py-4">
            <div className="space-y-3">
              {sortedMatches.map((match, index) => (
                <div key={match.id} className="relative pl-6">
                  <span className="absolute left-0 top-6 h-px w-4 bg-border" />
                  {index < sortedMatches.length - 1 && (
                    <span className="absolute left-0 top-6 bottom-[-16px] w-px bg-border" />
                  )}
                  <BuyerMatchLane
                    match={match}
                    onStageChange={onStageChange}
                    isUpdating={isUpdating}
                    onOpenDetail={onOpenDetail}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function BuyerMatchLane({
  match,
  onStageChange,
  isUpdating,
  onOpenDetail,
}: {
  match: Match;
  onStageChange: (id: string, stage: string) => void;
  isUpdating: boolean;
  onOpenDetail: (id: string) => void;
}) {
  const transactionType = match.listing?.transactionType;

  return (
    <article
      className="rounded-xl border border-border/60 bg-muted/10 px-3 py-3"
      onDoubleClick={() => onOpenDetail(match.id)}
      title="더블클릭하여 상세보기"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="min-w-0 xl:w-64">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold">{getMatchTitle(match)}</p>
                {transactionType && (
                  <Badge className={cn('border-0', transactionTypeMeta[transactionType]?.className)}>
                    {transactionTypeMeta[transactionType]?.label ?? transactionType}
                  </Badge>
                )}
                {match.stage === 'closed' && (
                  <Badge className="border-0 bg-zinc-100 text-zinc-600">종료</Badge>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="size-3.5" />
                <span className="truncate">
                  {match.listing?.property?.site?.roadAddress ?? match.listing?.property?.site?.jibunAddress ?? '주소 정보 없음'}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium">{formatMatchPrice(match)}</p>
            </div>

            <MatchActionsMenu
              currentStage={match.stage}
              onStageChange={(stage) => onStageChange(match.id, stage)}
              disabled={isUpdating}
              onOpenDetail={() => onOpenDetail(match.id)}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center">
            {buyerProgressStages.map((stage, index) => (
              <ProgressNode
                key={stage}
                stage={stage}
                state={getProgressNodeState(match.stage, stage)}
                isClosed={match.stage === 'closed'}
                isLast={index === buyerProgressStages.length - 1}
                onAdvance={() => {
                  const nextStage = getNextMatchStage(match.stage);
                  if (nextStage) {
                    onStageChange(match.id, nextStage);
                  }
                }}
                onClose={() => onStageChange(match.id, 'closed')}
                onJump={() => onStageChange(match.id, stage)}
                disabled={isUpdating}
              />
            ))}
          </div>
        </div>
      </div>

      {match.memo && (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{match.memo}</p>
      )}
    </article>
  );
}

function ProgressNode({
  stage,
  state,
  isClosed,
  isLast,
  onAdvance,
  onClose,
  onJump,
  disabled,
}: {
  stage: MatchProgressStage;
  state: 'completed' | 'current' | 'pending';
  isClosed: boolean;
  isLast: boolean;
  onAdvance: () => void;
  onClose: () => void;
  onJump: () => void;
  disabled: boolean;
}) {
  const baseClassName = cn(
    'rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
    state === 'completed' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
    state === 'current' && 'border-sky-200 bg-sky-50 text-sky-700',
    state === 'pending' && 'border-zinc-200 bg-zinc-50 text-zinc-500',
    isClosed && 'border-zinc-200 bg-zinc-50 text-zinc-400',
  );
  const lineClassName = cn(
    'h-px w-4',
    state === 'completed' && 'bg-emerald-300',
    state !== 'completed' && 'bg-border',
    isClosed && 'bg-border',
  );
  const label = matchStageMeta[stage].label;

  if (isClosed) {
    return (
      <div className="flex items-center">
        <div className={baseClassName}>{label}</div>
        {!isLast && <div className={lineClassName} />}
      </div>
    );
  }

  if (state === 'current' && stage !== 'dealCreated') {
    const canAdvance = getNextMatchStage(stage) !== null;

    return (
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(baseClassName, 'cursor-pointer hover:bg-accent')}
              disabled={disabled}
            >
              {label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {canAdvance && (
              <DropdownMenuItem onSelect={onAdvance}>
                <CheckCircle2 className="size-4" />
                다음 단계로 이동
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onSelect={onClose}>
              <CircleOff className="size-4" />
              종료
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!isLast && <div className={lineClassName} />}
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <button
        type="button"
        className={cn(baseClassName, 'cursor-pointer hover:bg-accent')}
        onClick={onJump}
        disabled={disabled}
      >
        {label}
      </button>
      {!isLast && <div className={lineClassName} />}
    </div>
  );
}

function MatchCard({
  match,
  onStageChange,
  isUpdating,
  onOpenDetail,
}: {
  match: Match;
  onStageChange: (id: string, stage: string) => void;
  isUpdating: boolean;
  onOpenDetail: (id: string) => void;
}) {
  const nextStage = getNextMatchStage(match.stage);
  const buyerName = match.buyerRequirement?.contact?.name ?? '미지정';

  return (
    <article
      className="rounded-xl border border-border/60 bg-background p-3 shadow-xs"
      onDoubleClick={() => onOpenDetail(match.id)}
      title="더블클릭하여 상세보기"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback>{getInitials(buyerName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{buyerName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {match.buyerRequirement?.contact?.phone ?? '연락처 없음'}
              </p>
            </div>
          </div>

          <div>
            <p className="truncate text-sm font-medium">{getMatchTitle(match)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {match.listing?.transactionType && (
                <Badge className={cn('border-0', transactionTypeMeta[match.listing.transactionType]?.className)}>
                  {transactionTypeMeta[match.listing.transactionType]?.label ?? match.listing.transactionType}
                </Badge>
              )}
              <span className="text-xs font-medium text-foreground">{formatMatchPrice(match)}</span>
            </div>
          </div>
        </div>

        <MatchActionsMenu
          currentStage={match.stage}
          onStageChange={(stage) => onStageChange(match.id, stage)}
          disabled={isUpdating}
          onOpenDetail={() => onOpenDetail(match.id)}
        />
      </div>

      <div className="mt-3 rounded-lg bg-muted/40 p-2">
        <p className="text-[11px] text-muted-foreground">매수 요건</p>
        <p className="mt-1 text-sm">{formatRequirementSummary(match)}</p>
      </div>

      {match.memo && (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{match.memo}</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">업데이트 {formatShortDate(match.updatedAt)}</span>
        {nextStage && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onStageChange(match.id, nextStage)}
            disabled={isUpdating}
          >
            {nextStage === 'dealCreated' ? '거래 전환' : '다음 단계'}
            <ArrowRight className="size-3" />
          </Button>
        )}
      </div>
    </article>
  );
}

function ResultPanel({
  title,
  emptyMessage,
  matches,
  isUpdating,
  onStageChange,
  onOpenDetail,
}: {
  title: string;
  emptyMessage: string;
  matches: Match[];
  isUpdating: boolean;
  onStageChange: (id: string, stage: string) => void;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge variant="secondary">{matches.length}</Badge>
      </div>
      <div className="divide-y divide-border/60">
        {matches.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          matches.map((match) => (
            <div
              key={match.id}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/20"
              onDoubleClick={() => onOpenDetail(match.id)}
              title="더블클릭하여 상세보기"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium">{match.buyerRequirement?.contact?.name ?? '미지정'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {getMatchTitle(match)} · {formatMatchPrice(match)}
                </p>
              </div>
              <MatchActionsMenu
                currentStage={match.stage}
                onStageChange={(stage) => onStageChange(match.id, stage)}
                disabled={isUpdating}
                onOpenDetail={() => onOpenDetail(match.id)}
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function MatchActionsMenu({
  currentStage,
  onStageChange,
  disabled,
  onOpenDetail,
}: {
  currentStage: string;
  onStageChange: (stage: string) => void;
  disabled: boolean;
  onOpenDetail?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreVertical className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {onOpenDetail && (
          <>
            <DropdownMenuItem onSelect={onOpenDetail}>
              상세 보기
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-xs text-muted-foreground">단계 변경</DropdownMenuLabel>
        {matchStageOrder.slice(0, -1).map((stage) => (
          <DropdownMenuItem
            key={stage}
            onSelect={() => onStageChange(stage)}
            className={cn(stage === currentStage && 'font-medium text-foreground')}
          >
            {matchStageMeta[stage].label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onStageChange('closed')}>
          <CircleOff className="size-4" />
          종료
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MatchDetailDialog({
  match,
  open,
  memoDraft,
  isEditingMemo,
  isSaving,
  onOpenChange,
  onMemoDraftChange,
  onEditMemo,
  onCancelEditMemo,
  onSaveMemo,
  onStageChange,
}: {
  match: Match | null;
  open: boolean;
  memoDraft: string;
  isEditingMemo: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onMemoDraftChange: (value: string) => void;
  onEditMemo: () => void;
  onCancelEditMemo: () => void;
  onSaveMemo: () => void;
  onStageChange: (stage: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {!match ? null : (
          <>
            <DialogHeader>
              <DialogTitle>매칭 상세</DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <section className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">진행 단계</h3>
                    <p className="text-xs text-muted-foreground">
                      현재 단계에서 다음 단계 이동 또는 종료를 처리할 수 있습니다.
                    </p>
                  </div>
                  <Badge className={cn('border-0', matchStageMeta[match.stage].badgeClassName)}>
                    {matchStageMeta[match.stage].label}
                  </Badge>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <div className="flex min-w-max items-center">
                    {buyerProgressStages.map((stage, index) => (
                      <ProgressNode
                        key={stage}
                        stage={stage}
                        state={getProgressNodeState(match.stage, stage)}
                        isClosed={match.stage === 'closed'}
                        isLast={index === buyerProgressStages.length - 1}
                        onAdvance={() => {
                          const nextStage = getNextMatchStage(match.stage);
                          if (nextStage) {
                            onStageChange(nextStage);
                          }
                        }}
                        onClose={() => onStageChange('closed')}
                        onJump={() => onStageChange(stage)}
                        disabled={isSaving}
                      />
                    ))}
                  </div>
                </div>
              </section>

              <div className="grid gap-4 xl:grid-cols-2">
                <InfoPanel title="구매자 정보">
                  <InfoRow label="이름" value={match.buyerRequirement?.contact?.name ?? '미지정'} />
                  <InfoRow label="연락처" value={match.buyerRequirement?.contact?.phone ?? '-'} />
                  <InfoRow
                    label="희망 조건"
                    value={
                      match.buyerRequirement
                        ? formatRequirementSummaryFromBuyerRequirement(match.buyerRequirement)
                        : '조건 미정'
                    }
                  />
                  <InfoRow label="요건 메모" value={match.buyerRequirement?.memo ?? '-'} />
                </InfoPanel>

                <InfoPanel title="매물 정보">
                  <InfoRow label="매물" value={getMatchTitle(match)} />
                  <InfoRow label="주소" value={match.listing?.property?.site?.roadAddress ?? match.listing?.property?.site?.jibunAddress ?? '-'} />
                  <InfoRow label="가격" value={formatMatchPrice(match)} />
                  <InfoRow label="등록일" value={formatFullDate(match.createdAt)} />
                </InfoPanel>
              </div>

              <section className="rounded-xl border border-border/60 bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">매칭 메모</h3>
                    <p className="text-xs text-muted-foreground">
                      현재 모델에서는 공용 메모 한 개만 저장됩니다.
                    </p>
                  </div>

                  {isEditingMemo ? (
                    <div className="flex items-center gap-2">
                      <Button type="button" size="xs" variant="outline" onClick={onCancelEditMemo} disabled={isSaving}>
                        취소
                      </Button>
                      <Button type="button" size="xs" onClick={onSaveMemo} disabled={isSaving}>
                        저장
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" size="xs" variant="outline" onClick={onEditMemo}>
                      메모 수정
                    </Button>
                  )}
                </div>

                {isEditingMemo ? (
                  <Textarea
                    className="mt-4 min-h-28"
                    placeholder="매칭 메모를 입력하세요"
                    value={memoDraft}
                    onChange={(event) => onMemoDraftChange(event.target.value)}
                  />
                ) : (
                  <div className="mt-4 rounded-lg bg-muted/30 px-3 py-3 text-sm leading-6 text-muted-foreground">
                    {match.memo?.trim() ? match.memo : '등록된 메모가 없습니다.'}
                  </div>
                )}
              </section>

              <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-4">
                {match.stage !== 'dealCreated' && match.stage !== 'closed' && (
                  <Button
                    type="button"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => onStageChange('dealCreated')}
                    disabled={isSaving}
                  >
                    거래 전환
                  </Button>
                )}
                {match.stage !== 'closed' && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => onStageChange('closed')}
                    disabled={isSaving}
                  >
                    종료
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  닫기
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-background p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Link2;
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

function getMatchTitle(match: Match) {
  return [match.listing?.property?.site?.name, match.listing?.property?.unit?.name]
    .filter(Boolean)
    .join(' ') || '매물 정보 없음';
}

function getProgressNodeState(
  currentStage: string,
  stage: MatchProgressStage,
): 'completed' | 'current' | 'pending' {
  if (currentStage === 'closed') {
    return 'pending';
  }

  if (currentStage === 'dealCreated') {
    return 'completed';
  }

  const currentIndex = buyerProgressStages.indexOf(currentStage as MatchProgressStage);
  const nodeIndex = buyerProgressStages.indexOf(stage);

  if (nodeIndex < currentIndex) {
    return 'completed';
  }

  if (nodeIndex === currentIndex) {
    return 'current';
  }

  return 'pending';
}

function formatMatchPrice(match: Match) {
  const listing = match.listing;
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

function formatRequirementSummary(match: Match) {
  const requirement = match.buyerRequirement;
  if (!requirement?.transactionType) {
    return '조건 미정';
  }

  if (requirement.transactionType === 'monthly') {
    const deposit = requirement.depositMax ? formatPrice(requirement.depositMax) : '협의';
    const monthlyRent = requirement.monthlyRentMax ? formatPrice(requirement.monthlyRentMax) : '협의';
    return `월세 · 보증금 ${deposit} / 월세 ${monthlyRent}`;
  }

  if (requirement.transactionType === 'jeonse') {
    const price = requirement.depositMax ? formatPrice(requirement.depositMax) : '협의';
    return `전세 · ${price}`;
  }

  const price = requirement.priceMax ? formatPrice(requirement.priceMax) : '협의';
  return `매매 · ${price}`;
}

function formatRequirementSummaryFromBuyerRequirement(
  requirement: NonNullable<Match['buyerRequirement']>,
) {
  const regionLabels = (requirement.preferredRegions ?? [])
    .map((r) => r.ward?.name ?? r.district?.name ?? r.province?.name ?? '')
    .filter(Boolean);
  const regionText = regionLabels.length > 0 ? regionLabels.join(', ') : '지역 협의';
  const siteTypes = requirement.siteTypes ?? [];
  const siteTypeText = siteTypes.length > 0
    ? siteTypes.map((type) => siteTypeLabel[type] ?? type).join(', ')
    : '유형 협의';

  return `${regionText} · ${siteTypeText} · ${formatBudgetSummary(requirement)}`;
}

const siteTypeLabel: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  house: '주택',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박',
};

function formatBudgetSummary(requirement: NonNullable<Match['buyerRequirement']>) {
  if (requirement.transactionType === 'monthly') {
    const deposit = requirement.depositMax ? formatPrice(requirement.depositMax) : '협의';
    const monthlyRent = requirement.monthlyRentMax ? formatPrice(requirement.monthlyRentMax) : '협의';
    return `월세 ${deposit} / ${monthlyRent}`;
  }

  if (requirement.transactionType === 'jeonse') {
    return `전세 ${requirement.depositMax ? formatPrice(requirement.depositMax) : '협의'}`;
  }

  if (requirement.transactionType === 'sale') {
    return `매매 ${requirement.priceMax ? formatPrice(requirement.priceMax) : '협의'}`;
  }

  return '예산 협의';
}

function getNextMatchStage(stage: string) {
  const currentIndex = matchStageOrder.indexOf(stage as (typeof matchStageOrder)[number]);
  if (currentIndex < 0 || currentIndex >= matchStageOrder.length - 2) {
    return null;
  }
  return matchStageOrder[currentIndex + 1];
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

function formatFullDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getInitials(name: string) {
  return name.slice(0, 2);
}
