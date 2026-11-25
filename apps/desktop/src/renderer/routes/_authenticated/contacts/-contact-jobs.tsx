import { Link } from '@tanstack/react-router';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { BuyerRequirement, Match } from '@estate-erp/api-client';
import { MatchStage, normalizeMatchStage } from '@estate-erp/shared';
import { ClipboardCopy, Handshake, Home, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatRelativeDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useBuyerMatchActions } from '../projects/-project-buyer-table';
import { getTransactionTypeMeta } from '../properties/-detail/model';
import { H2, nb, Tag, type TagTone } from '../properties/-detail/ui';
import { DealStageBand } from '../wanted-properties/-match-board';
import { BuyerMatchBranchList } from '../wanted-properties/-match-groups';
import {
  formatMatchPrice,
  formatViewingEventTime,
  getMatchStageLabel,
  getMatchTitle,
  getUpcomingViewingEvent,
} from '../wanted-properties/-match-view-utils';
import {
  amountText,
  metaTextClassName,
  partyRoleLabel,
  placeLinkClassName,
  rowClassName,
  TypeChip,
} from './-contact-overview';
import {
  buyerStatusLabels,
  formatAreaSummary,
  formatBudgetSummary,
  formatRegionSummary,
  urgencyLabels,
} from './-detail-cards';

/**
 * 연락처 상세의 "걸린 일": 이 사람과 지금 진행 중인 일을 한 구역에 모으고, 줄마다 어디까지 왔는지를 단계 띠로 보인다
 * (사용자 결정 2026-11-24). 예전에는 거래 · 희망 조건 · 연결한 매물이 따로 떨어진 구역이라 흐름이 읽히지 않았다.
 *
 *  - 내놓은 집 / 사거나 빌리는 집: 이 사람이 당사자인 거래. 띠는 거래 단계(읽기 전용, 누르면 거래 화면).
 *    내놓은 집에는 아직 거래가 되지 않은 집도 든다 — 이 사람의 집을 보고 있는 손님들(집주인 쪽 매칭)을 그 집 아래에 단다.
 *  - 찾는 집: 희망 조건마다, 그 아래에 붙인 매물을 희망매물 화면과 같은 매칭 묶음(매물 카드 · 단계 띠 · 메모)으로 단다.
 *    단계 바꾸기 · 임장 일정 · 매물 연결은 희망매물 화면과 같은 동작이다.
 *
 * 내용이 없으면 구역을 그리지 않는다.
 */

type ContactOverview = Awaited<ReturnType<typeof api.contacts.getOverview>>;
type Deal = ContactOverview['deals'][number];
type OverviewMatch = ContactOverview['matches'][number];

const requirementStatusTone: Record<string, TagTone> = {
  active: 'green',
  matched: 'green',
  hold: 'yellow',
  inactive: 'yellow',
  completed: 'gray',
};

const urgencyTone: Record<string, TagTone> = {
  urgent: 'red',
  normal: 'gray',
  flexible: 'blue',
};

function GroupLabel({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="mb-0.5 mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-[#37352f]/65 first:mt-1">
      {label}
      <span className="font-medium tabular-nums text-[#37352f]/45">{count}</span>
    </h3>
  );
}

const isClosedMatch = (match: Match) => normalizeMatchStage(match.stage) === MatchStage.CLOSED;

export function ContactJobsSection({
  contactId,
  contactName,
  deals,
  ownerMatches,
  requirements,
  requirementsLoading,
  newRequirementAction,
}: {
  contactId: string;
  contactName: string;
  deals: Deal[];
  /** 이 사람의 집(소유 · 대리)에 붙은 진행 중인 매칭 — 개요의 matches 가운데 side가 seller인 것 */
  ownerMatches: OverviewMatch[];
  requirements: BuyerRequirement[];
  requirementsLoading: boolean;
  /** 구역 머리 오른쪽의 "희망매물 만들기" */
  newRequirementAction: ReactNode;
}) {
  // 여기서 한 일(단계 바꾸기 · 임장 일정 · 거래 전환 · 매칭 삭제 · 매칭 상세에서 적은 상담 · 업무)은 이 화면의 다른 구역
  // — 다가오는 일정, 업무, 거래, 내 집을 보는 손님, 상담 기록 — 도 바꾼다. 매칭 쪽 동작은 ["matches"] 등만 새로 읽으므로,
  // 이 구역이 떠 있는 동안 저장이 하나 끝날 때마다 이 연락처에 딸린 조회(개요 · 상담 · 희망 조건 · 소유 매물)를 새로 읽는다.
  const queryClient = useQueryClient();
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') return;
        void queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === 'contacts' && query.queryKey[1] === contactId && query.queryKey.length > 2,
        });
      }),
    [queryClient, contactId],
  );

  const matchQueries = useQueries({
    queries: requirements.map((requirement) => ({
      queryKey: ['matches', 'by-requirement', requirement.id],
      queryFn: () => api.matches.findAll({ buyerReqId: requirement.id }),
    })),
  });
  // 내놓은 집마다 그 집을 보는 손님들. 같은 집의 매칭은 한 번만 읽는다.
  const ownerListings = useMemo(() => {
    const byListing = new Map<string, OverviewMatch>();
    for (const match of ownerMatches) if (!byListing.has(match.listingId)) byListing.set(match.listingId, match);
    return [...byListing.values()];
  }, [ownerMatches]);
  const listingMatchQueries = useQueries({
    queries: ownerListings.map((listing) => ({
      queryKey: ['matches', 'by-listing', listing.listingId],
      queryFn: () => api.matches.findAll({ listingId: listing.listingId }),
    })),
  });
  const allMatches = [
    ...matchQueries.flatMap((query) => query.data ?? []),
    ...listingMatchQueries.flatMap((query) => query.data ?? []),
  ];
  const { actions, dialogs, openCreate } = useBuyerMatchActions(allMatches);

  const sellerDeals = deals.filter((deal) => deal.role === 'seller');
  const buyerDeals = deals.filter((deal) => deal.role !== 'seller');

  if (!requirementsLoading && deals.length === 0 && requirements.length === 0 && ownerListings.length === 0) {
    return null;
  }

  return (
    <section data-contact-jobs id="jobs">
      <H2
        title="걸린 일"
        count={deals.length + ownerListings.length + requirements.length}
        action={newRequirementAction}
      />

      {sellerDeals.length + ownerListings.length > 0 && (
        <>
          <GroupLabel label="내놓은 집" count={sellerDeals.length + ownerListings.length} />
          <ol data-contact-deals="seller">
            {sellerDeals.map((deal) => (
              <DealRow key={deal.id} deal={deal} />
            ))}
            {ownerListings.map((listing, index) => {
              const query = listingMatchQueries[index];
              return (
                <OwnerListingBlock
                  key={listing.listingId}
                  listing={listing}
                  matches={query?.data ?? null}
                  matchesPending={query?.isPending ?? true}
                  onRetryMatches={() => void query?.refetch()}
                  actions={actions}
                />
              );
            })}
          </ol>
        </>
      )}
      {buyerDeals.length > 0 && (
        <>
          <GroupLabel label="사거나 빌리는 집" count={buyerDeals.length} />
          <ol data-contact-deals="buyer">
            {buyerDeals.map((deal) => (
              <DealRow key={deal.id} deal={deal} />
            ))}
          </ol>
        </>
      )}

      {requirementsLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-[72px] w-full rounded-md" />
          <Skeleton className="h-[72px] w-full rounded-md" />
        </div>
      ) : (
        requirements.length > 0 && (
          <>
            <GroupLabel label="찾는 집" count={requirements.length} />
            <ol data-contact-requirements id="requirements">
              {requirements.map((requirement, index) => {
                const query = matchQueries[index];
                return (
                  <RequirementBlock
                    key={requirement.id}
                    contactName={contactName}
                    requirement={requirement}
                    matches={query?.data ?? null}
                    matchesPending={query?.isPending ?? true}
                    onRetryMatches={() => void query?.refetch()}
                    actions={actions}
                    onCreateMatch={() => openCreate(requirement.id)}
                  />
                );
              })}
            </ol>
          </>
        )
      )}
      {dialogs}
    </section>
  );
}

/** 거래 한 줄 + 그 아래 거래 단계 띠. 띠를 누르면 거래 화면으로 간다(단계는 거래관리에서 바꾼다). */
function DealRow({ deal }: { deal: Deal }) {
  const amount = amountText(deal.transactionType, deal.agreedPrice, deal.agreedDeposit, deal.agreedMonthlyRent);
  return (
    <li
      data-contact-deal
      className={cn('border-t border-[#e9e9e7] pb-2.5 pt-1 first:border-t-0', deal.isCancelled && 'opacity-60')}
    >
      <div className={rowClassName}>
        <Handshake className="size-4 shrink-0 text-[#37352f]/45" />
        <Link to="/deals/$id" params={{ id: deal.id }} className={placeLinkClassName}>
          {deal.place ?? '다른 사무소 매물'}
        </Link>
        <span className="shrink-0 text-[13px] text-[#37352f]/65">
          {partyRoleLabel(deal.role, deal.transactionType)}
        </span>
        <TypeChip type={deal.transactionType} />
        {amount && <span className="shrink-0 text-[13px] font-medium tabular-nums">{amount}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
          {deal.isCancelled && <Tag tone="red">취소됨</Tag>}
          {!deal.isCancelled && deal.commission && (
            <span className={metaTextClassName}>
              {deal.commission === 'collected' ? '수수료 받음' : '수수료 받는 중'}
            </span>
          )}
          <span className={cn(metaTextClassName, 'w-[72px] text-right')}>
            {formatRelativeDay(deal.stageChangedAt)}
          </span>
        </span>
      </div>
      {!deal.isCancelled && (
        <div className="overflow-x-auto pl-6">
          <Link
            to="/deals/$id"
            params={{ id: deal.id }}
            aria-label={`${deal.place ?? '거래'} 거래 화면에서 단계 보기`}
            className="block min-w-[480px] rounded-lg outline-none transition-[filter] hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-[#2383e2]/40"
          >
            <DealStageBand stage={deal.stage} />
          </Link>
        </div>
      )}
    </li>
  );
}

/** 내놓은 집 한 채(아직 거래 전)와 그 집을 보고 있는 손님들 — 매칭 묶음을 손님 쪽으로 보여 준다. */
function OwnerListingBlock({
  listing,
  matches,
  matchesPending,
  onRetryMatches,
  actions,
}: {
  listing: OverviewMatch;
  matches: Match[] | null;
  matchesPending: boolean;
  onRetryMatches: () => void;
  actions: ReturnType<typeof useBuyerMatchActions>['actions'];
}) {
  const amount = amountText(listing.transactionType, listing.price, listing.deposit, listing.monthlyRent);
  const open = (matches ?? []).filter((match) => !isClosedMatch(match));
  return (
    <li data-contact-owner-listing className="border-t border-[#e9e9e7] pb-1.5 pt-1 first:border-t-0">
      <div className={rowClassName}>
        <Home className="size-4 shrink-0 text-[#37352f]/45" />
        <Link to="/properties/$id" params={{ id: listing.propertyId }} className={placeLinkClassName}>
          {listing.place ?? '매물'}
        </Link>
        <TypeChip type={listing.transactionType} />
        {amount && <span className="shrink-0 text-[13px] font-medium tabular-nums">{amount}</span>}
        <span className={cn(metaTextClassName, 'ml-auto pl-2')}>
          {matches ? `보고 있는 손님 ${open.length}명` : ''}
        </span>
      </div>
      {matchesPending ? (
        <Skeleton className="ml-6 mt-1 h-9 w-full max-w-[420px] rounded-md" />
      ) : !matches ? (
        <p className="ml-6 mt-1 text-[13px] text-[#37352f]/65">
          {'매칭을 불러오지 못했습니다 · '}
          <button type="button" className="underline underline-offset-2 hover:text-[#37352f]" onClick={onRetryMatches}>
            다시 시도
          </button>
        </p>
      ) : (
        open.length > 0 && (
          <div
            data-contact-match-lanes
            className="overflow-x-auto [&_[data-match-branch]]:grid-cols-1! [&_[data-match-branch]]:pr-0!"
          >
            <BuyerMatchBranchList matches={open} actions={actions} counterparty="buyer" className="mb-1 ml-2 mr-0" />
          </div>
        )
      )}
    </li>
  );
}

/** 희망 조건 한 건과 그 아래 붙인 매물들(희망매물 화면의 매칭 묶음). */
function RequirementBlock({
  contactName,
  requirement,
  matches,
  matchesPending,
  onRetryMatches,
  actions,
  onCreateMatch,
}: {
  contactName: string;
  requirement: BuyerRequirement;
  matches: Match[] | null;
  matchesPending: boolean;
  onRetryMatches: () => void;
  actions: ReturnType<typeof useBuyerMatchActions>['actions'];
  onCreateMatch: () => void;
}) {
  const regions = formatRegionSummary(requirement);
  const list = matches ?? [];
  const open = list.filter((match) => !isClosedMatch(match));
  const closedCount = list.length - open.length;
  const requirementText = [
    formatBudgetSummary(requirement),
    formatAreaSummary(requirement),
    regions || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li data-contact-requirement className="border-t border-[#e9e9e7] py-2.5 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {requirement.transactionType && <TypeChip type={requirement.transactionType} />}
        <Link
          to="/buyer-requirements/$id"
          params={{ id: requirement.id }}
          className="text-[17px] font-bold tabular-nums tracking-[-0.015em] text-[#37352f] underline-offset-2 hover:underline"
        >
          {formatBudgetSummary(requirement)}
        </Link>
        <Tag tone={requirementStatusTone[requirement.status] ?? 'gray'} dot>
          {buyerStatusLabels[requirement.status] ?? requirement.status}
        </Tag>
        {requirement.urgency !== 'normal' && (
          <Tag tone={urgencyTone[requirement.urgency] ?? 'gray'}>
            {urgencyLabels[requirement.urgency] ?? requirement.urgency}
          </Tag>
        )}
        <span className="flex-1" />
        {requirement.nextContactDate && (
          <span className={metaTextClassName}>다음 연락 {formatDate(requirement.nextContactDate)}</span>
        )}
        {open.length > 0 && (
          <MatchBriefingPopover contactName={contactName} requirementText={requirementText} matches={open} />
        )}
      </div>
      <p className="mt-0.5 text-[13px] leading-5 text-[#37352f]/65">
        {formatAreaSummary(requirement)}
        {regions ? ` · ${regions}` : ''}
        {requirement.moveInDate ? ` · 입주 ${formatDate(requirement.moveInDate)}` : ''}
      </p>
      {requirement.memo && (
        <p className="mt-1 whitespace-pre-wrap break-keep text-[13px] leading-[1.6] text-[#37352f]/80 [overflow-wrap:anywhere]">
          {requirement.memo}
        </p>
      )}

      {matchesPending ? (
        <Skeleton className="mt-2 h-9 w-full max-w-[420px] rounded-md" />
      ) : !matches ? (
        <p className="mt-2 text-[13px] text-[#37352f]/65">
          {'매칭을 불러오지 못했습니다 · '}
          <button type="button" className="underline underline-offset-2 hover:text-[#37352f]" onClick={onRetryMatches}>
            다시 시도
          </button>
        </p>
      ) : open.length === 0 ? (
        <div data-contact-no-match className="mt-1.5 flex items-center gap-1.5 text-[13px]">
          <span className="text-[#37352f]/65">
            {closedCount > 0 ? '진행 중인 매칭 없음' : '아직 보여 준 집이 없습니다'}
          </span>
          <button
            type="button"
            aria-label={`${contactName} 매칭 생성`}
            className={cn(nb.ghost, 'h-6 px-1.5 text-[13px]')}
            onClick={onCreateMatch}
          >
            <Plus />
            매물 연결
          </button>
        </div>
      ) : (
        // 본문 폭(최대 828px)에서는 매칭 한 건을 [매물 카드 | 단계 띠] 대신 위아래로 둔다(희망매물 화면의 좁은 창과 같은 모양).
        // 띠는 최소 560px이라 더 좁아지면 이 칸만 가로로 굴린다.
        <div
          data-contact-match-lanes
          className="overflow-x-auto [&_[data-match-branch]]:grid-cols-1! [&_[data-match-branch]]:pr-0!"
        >
          <BuyerMatchBranchList
            matches={open}
            actions={actions}
            className="mb-1 ml-2 mr-0"
            addLabel={`${contactName}에게 매물 더 연결`}
            onAdd={onCreateMatch}
          />
        </div>
      )}
      {closedCount > 0 && (
        <Link
          to="/buyer-requirements/$id"
          params={{ id: requirement.id }}
          className="mt-0.5 inline-block text-[13px] text-[#37352f]/65 underline-offset-2 hover:underline"
        >
          {`종료한 매칭 ${closedCount}건 보기`}
        </Link>
      )}
    </li>
  );
}

// ── 매칭 브리핑 ─────────────────────────────────────────────────────────────
// 이 손님에게 보여 주는 집들을 한 글로 묶어 카톡에 붙여 넣게 한다(매물 상세의 "카톡용 브리핑 복사"와 같은 흐름).
// 글은 지금 화면의 값으로 만들 뿐이고 저장하지 않는다.

function buildMatchBriefing({
  contactName,
  requirementText,
  matches,
  includeUnit,
  includeStage,
}: {
  contactName: string;
  requirementText: string;
  matches: Match[];
  includeUnit: boolean;
  includeStage: boolean;
}) {
  const lines = [`${contactName} 님, 찾으시는 조건으로 보고 있는 집입니다.`, `조건: ${requirementText}`, ''];
  matches.forEach((match, index) => {
    const title = includeUnit
      ? getMatchTitle(match)
      : (match.listing?.property?.site?.name ?? getMatchTitle(match));
    lines.push(`${index + 1}. ${title}`);
    const type = match.listing?.transactionType ? `${getTransactionTypeMeta(match.listing.transactionType).label} ` : '';
    lines.push(`   ${type}${formatMatchPrice(match)}`);
    if (includeStage) {
      const viewing = getUpcomingViewingEvent(match);
      lines.push(
        viewing
          ? `   진행: ${getMatchStageLabel(match.stage)} · 임장 ${formatViewingEventTime(viewing)}`
          : `   진행: ${getMatchStageLabel(match.stage)}`,
      );
    }
  });
  return lines.join('\n');
}

function MatchBriefingPopover({
  contactName,
  requirementText,
  matches,
}: {
  contactName: string;
  requirementText: string;
  matches: Match[];
}) {
  const [open, setOpen] = useState(false);
  const [includeUnit, setIncludeUnit] = useState(false);
  const [includeStage, setIncludeStage] = useState(true);
  const text = useMemo(
    () => (open ? buildMatchBriefing({ contactName, requirementText, matches, includeUnit, includeStage }) : ''),
    [open, contactName, requirementText, matches, includeUnit, includeStage],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('브리핑을 복사했습니다. 카톡에 붙여 넣으세요.');
      setOpen(false);
    } catch {
      toast.error('복사하지 못했습니다. 글을 직접 선택해 복사하세요.');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger data-contact-match-briefing className={cn(nb.ghost, 'h-6 px-1.5 text-[13px]')}>
        <ClipboardCopy />
        매칭 브리핑
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[440px] p-3">
        <div className="mb-2 text-[12px] font-medium text-[#37352f]/65">손님에게 보낼 글</div>
        <div className="mb-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-[#37352f]">
          <label className="inline-flex cursor-default select-none items-center gap-1.5">
            <input
              type="checkbox"
              checked={includeUnit}
              onChange={() => setIncludeUnit((value) => !value)}
              className="size-3.5 accent-[#2383e2]"
            />
            동 · 호수까지 적기
          </label>
          <label className="inline-flex cursor-default select-none items-center gap-1.5">
            <input
              type="checkbox"
              checked={includeStage}
              onChange={() => setIncludeStage((value) => !value)}
              className="size-3.5 accent-[#2383e2]"
            />
            진행 단계 적기
          </label>
        </div>
        <textarea
          readOnly
          value={text}
          aria-label="브리핑 글"
          className="block min-h-[200px] w-full resize-y rounded-md bg-[rgb(247,246,243)] px-3 py-2.5 text-[13.5px] leading-[1.6] text-[#37352f] outline-none"
        />
        <div className="mt-2.5 flex justify-end gap-1.5">
          <button type="button" className={nb.ghost} onClick={() => setOpen(false)}>
            닫기
          </button>
          <button type="button" className={nb.solid} onClick={() => void copy()}>
            <ClipboardCopy />
            복사
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
