import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarCheck2,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  GitBranch,
  Search,
  Target,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BUYER_CUSTOMERS,
  DEPENDENCY_META,
  READINESS_META,
  includesBuyerSearch,
  type BuyerCustomerDemo,
  type Readiness,
} from './prototype-data';

type BoardFilter = 'all' | Readiness;

const LANES: Array<{
  readiness: Readiness;
  description: string;
  icon: ReactNode;
}> = [
  {
    readiness: 'ready',
    description: '선행조건 없이 매물 제안 가능',
    icon: <CalendarCheck2 className="size-4" aria-hidden="true" />,
  },
  {
    readiness: 'progress',
    description: '매도·보증금 등 선행 거래 진행 중',
    icon: <Clock3 className="size-4" aria-hidden="true" />,
  },
  {
    readiness: 'review',
    description: '자금·일정·의사결정 확인 필요',
    icon: <CircleAlert className="size-4" aria-hidden="true" />,
  },
];

export function ReadinessBoard() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>('buyer-han');
  const [completedActions, setCompletedActions] = useState<Set<string>>(() => new Set());
  const [showMatches, setShowMatches] = useState(false);

  const customers = useMemo(
    () => BUYER_CUSTOMERS.filter((customer) => includesBuyerSearch(customer, query)),
    [query],
  );

  const visibleLanes = filter === 'all' ? LANES : LANES.filter((lane) => lane.readiness === filter);
  const selected = customers.find((customer) => customer.id === selectedId) ?? null;

  function toggleAction(customerId: string) {
    setCompletedActions((current) => {
      const next = new Set(current);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  function selectFilter(nextFilter: BoardFilter) {
    setFilter(nextFilter);
    setShowMatches(false);
    if (nextFilter === 'all') return;

    const firstCustomer = BUYER_CUSTOMERS.find(
      (customer) => customer.readiness === nextFilter && includesBuyerSearch(customer, query),
    );
    setSelectedId(firstCustomer?.id ?? null);
  }

  return (
    <main className="proto-stage-entry flex h-full min-h-0 flex-col overflow-hidden bg-muted/45">
      <header className="shrink-0 border-b bg-background px-6 pt-4 pb-3">
        <div className="flex items-start gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-[-0.02em]">구매 준비도</h1>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                고객 {BUYER_CUSTOMERS.length}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              어떤 고객에게 지금 무엇을 해야 하는지부터 봅니다.
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <label className="relative block w-[250px]">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="고객·지역·선행조건 검색"
                className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </label>
          </div>
        </div>

        <nav className="mt-4 flex items-center gap-1" aria-label="구매 준비도 필터">
          <BoardFilterButton
            active={filter === 'all'}
            onClick={() => selectFilter('all')}
            label="전체"
            count={BUYER_CUSTOMERS.length}
          />
          {LANES.map((lane) => (
            <BoardFilterButton
              key={lane.readiness}
              active={filter === lane.readiness}
              onClick={() => selectFilter(lane.readiness)}
              label={READINESS_META[lane.readiness].label}
              count={BUYER_CUSTOMERS.filter((customer) => customer.readiness === lane.readiness).length}
              dotClassName={READINESS_META[lane.readiness].dotClassName}
            />
          ))}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 overflow-auto px-4 pt-4 pb-20">
          <div
            className={cn(
              'grid min-h-full items-start gap-3',
              visibleLanes.length === 1 ? 'grid-cols-1' : 'grid-cols-3',
            )}
          >
            {visibleLanes.map((lane) => {
              const laneCustomers = customers.filter(
                (customer) => customer.readiness === lane.readiness,
              );
              const meta = READINESS_META[lane.readiness];

              return (
                <section
                  key={lane.readiness}
                  className={cn(
                    'min-w-0 rounded-lg border bg-background/75',
                    visibleLanes.length === 1 && 'max-w-[520px]',
                  )}
                >
                  <div className="flex items-start gap-2.5 border-b px-3.5 py-3">
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-md',
                        meta.badgeClassName,
                      )}
                    >
                      {lane.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-xs font-semibold">{meta.label}</h2>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
                          {laneCustomers.length}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {lane.description}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 p-2.5">
                    {laneCustomers.map((customer) => (
                      <BuyerReadinessCard
                        key={customer.id}
                        customer={customer}
                        selected={selected?.id === customer.id}
                        actionDone={completedActions.has(customer.id)}
                        onSelect={() => {
                          setSelectedId(customer.id);
                          setShowMatches(false);
                        }}
                        onToggleAction={() => toggleAction(customer.id)}
                      />
                    ))}

                    {laneCustomers.length === 0 && (
                      <div className="flex h-32 flex-col items-center justify-center rounded-md border border-dashed text-center">
                        <Search className="size-5 text-muted-foreground/45" aria-hidden="true" />
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          이 단계에 검색 결과가 없습니다.
                        </p>
                        {query && (
                          <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="mt-2 text-[10px] font-medium text-info-strong hover:underline"
                          >
                            검색 초기화
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        {selected && (
          <ReadinessInspector
            customer={selected}
            actionDone={completedActions.has(selected.id)}
            showMatches={showMatches}
            onToggleMatches={() => setShowMatches((current) => !current)}
            onToggleAction={() => toggleAction(selected.id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </main>
  );
}

function BoardFilterButton({
  active,
  onClick,
  label,
  count,
  dotClassName,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dotClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors',
        active ? 'bg-foreground text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {dotClassName && <span className={cn('size-1.5 rounded-full', dotClassName)} />}
      {label}
      <span className={cn('tabular-nums', active ? 'text-primary-foreground/65' : 'text-muted-foreground')}>
        {count}
      </span>
    </button>
  );
}

function BuyerReadinessCard({
  customer,
  selected,
  actionDone,
  onSelect,
  onToggleAction,
}: {
  customer: BuyerCustomerDemo;
  selected: boolean;
  actionDone: boolean;
  onSelect: () => void;
  onToggleAction: () => void;
}) {
  const primaryRequirement = customer.requirements[0];
  const primaryDependency =
    customer.dependencies.find((dependency) => dependency.state !== 'done') ??
    customer.dependencies[0];

  return (
    <article
      className={cn(
        'rounded-lg border bg-background shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors',
        selected ? 'border-ring/60 ring-2 ring-ring/10' : 'hover:border-muted-foreground/35',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full px-3.5 pt-3 pb-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30"
      >
        <span className="flex items-start gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-soft text-[11px] font-semibold">
            {customer.name.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <strong className="text-[12px]">{customer.name}</strong>
              {customer.requirements.length > 1 && (
                <span className="rounded bg-violet-soft px-1.5 py-0.5 text-[9px] font-semibold text-violet">
                  요건 {customer.requirements.length}
                </span>
              )}
              <span className="ml-auto text-[9px] text-muted-foreground">{customer.assignee}</span>
            </span>
            <span className="mt-1 block truncate text-[10px] text-muted-foreground">
              {customer.currentSituation}
            </span>
          </span>
        </span>

        <span className="mt-3 grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-1">
          <span className="min-w-0 rounded-md bg-muted/75 px-2 py-1.5">
            <span className="block truncate text-[9px] text-muted-foreground">선행조건</span>
            <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-semibold">
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  DEPENDENCY_META[primaryDependency.state].dotClassName,
                )}
              />
              {primaryDependency.label}
            </span>
          </span>
          <ArrowRight className="mx-auto size-3 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 rounded-md bg-info-soft/45 px-2 py-1.5">
            <span className="block truncate text-[9px] text-muted-foreground">목표 거래</span>
            <span className="mt-0.5 block truncate text-[10px] font-semibold">
              {primaryRequirement.transactionType} {primaryRequirement.priceLabel}
            </span>
          </span>
        </span>

        <span className="mt-2.5 flex items-center gap-1.5 text-[10px]">
          <Target className="size-3 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-muted-foreground">
            {primaryRequirement.regions.join(' · ')}
          </span>
          <span className="ml-auto shrink-0 rounded-full bg-info-soft px-1.5 py-0.5 font-semibold text-info-strong">
            매칭 {primaryRequirement.matches}
          </span>
        </span>
      </button>

      <div className="flex items-center gap-2 border-t px-3.5 py-2">
        <button
          type="button"
          onClick={onToggleAction}
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
            actionDone
              ? 'border-success bg-success text-white'
              : 'border-input bg-background text-transparent hover:border-foreground hover:text-muted-foreground',
          )}
          aria-label={`${customer.nextAction} ${actionDone ? '완료 취소' : '완료 처리'}`}
        >
          <Check className="size-2.5" aria-hidden="true" />
        </button>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[10px] font-medium',
            actionDone && 'text-muted-foreground line-through',
          )}
        >
          {customer.nextAction}
        </span>
        <span
          className={cn(
            'shrink-0 text-[9px]',
            customer.nextActionDue === '오늘'
              ? 'font-semibold text-destructive-strong'
              : 'text-muted-foreground',
          )}
        >
          {customer.nextActionDue}
        </span>
      </div>
    </article>
  );
}

function ReadinessInspector({
  customer,
  actionDone,
  showMatches,
  onToggleMatches,
  onToggleAction,
  onClose,
}: {
  customer: BuyerCustomerDemo;
  actionDone: boolean;
  showMatches: boolean;
  onToggleMatches: () => void;
  onToggleAction: () => void;
  onClose: () => void;
}) {
  const readinessMeta = READINESS_META[customer.readiness];
  const totalMatches = customer.requirements.reduce((sum, requirement) => sum + requirement.matches, 0);

  return (
    <aside className="w-[310px] shrink-0 overflow-auto border-l bg-background pb-20">
      <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{customer.name}</h2>
              <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-semibold', readinessMeta.badgeClassName)}>
                {readinessMeta.shortLabel}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {customer.phone} · {customer.assignee}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="상세 패널 닫기"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="space-y-5 p-4">
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            중개 판단
          </p>
          <p className="mt-2 text-[12px] font-semibold leading-5">{customer.readinessReason}</p>
          <div className="mt-3 rounded-md bg-muted/70 px-3 py-2.5">
            <p className="text-[9px] text-muted-foreground">현재 상황</p>
            <p className="mt-1 text-[10px] font-medium leading-4">{customer.currentSituation}</p>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-1.5">
            <GitBranch className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-[11px] font-semibold">선행 거래조건</h3>
          </div>
          <div className="mt-2 space-y-2">
            {customer.dependencies.map((dependency) => {
              const meta = DEPENDENCY_META[dependency.state];
              return (
                <div key={dependency.id} className="rounded-md border p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('size-1.5 rounded-full', meta.dotClassName)} />
                    <span className="text-[10px] font-semibold">{dependency.label}</span>
                    <span className={cn('ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold', meta.badgeClassName)}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[9px] leading-4 text-muted-foreground">
                    {dependency.detail}
                  </p>
                  {(dependency.amountLabel || dependency.dueLabel) && (
                    <p className="mt-1 text-[9px] font-medium">
                      {[dependency.amountLabel, dependency.dueLabel].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-1.5">
            <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-[11px] font-semibold">구매 요건</h3>
          </div>
          <div className="mt-2 space-y-2">
            {customer.requirements.map((requirement) => (
              <div key={requirement.id} className="rounded-md border bg-info-soft/20 p-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-info-soft px-1.5 py-0.5 text-[9px] font-semibold text-info-strong">
                    {requirement.transactionType}
                  </span>
                  <strong className="text-[10px] tabular-nums">{requirement.priceLabel}</strong>
                  <span className="ml-auto text-[9px] text-muted-foreground">
                    매칭 {requirement.matches}
                  </span>
                </div>
                <p className="mt-1.5 text-[9px] text-muted-foreground">
                  {requirement.regions.join(' · ')} · {requirement.sizeLabel}
                </p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onToggleMatches}
            className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-md bg-muted text-[10px] font-semibold transition-colors hover:bg-accent"
          >
            매칭 {totalMatches}건 {showMatches ? '접기' : '모아보기'}
            <ChevronRight
              className={cn('size-3 transition-transform', showMatches && 'rotate-90')}
              aria-hidden="true"
            />
          </button>
          {showMatches && (
            <div className="mt-2 rounded-md border border-dashed p-2.5 text-[9px] leading-5 text-muted-foreground">
              {totalMatches > 0
                ? `${customer.requirements.flatMap((requirement) => requirement.regions).slice(0, 2).join('·')} 권역 추천 매물을 예산과 입주일 순으로 비교합니다.`
                : '현재 요건과 일치하는 추천 매물이 없습니다.'}
            </div>
          )}
        </section>

        <section className="rounded-lg border p-3">
          <div className="flex items-center gap-1.5">
            <CircleDollarSign className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-[11px] font-semibold">다음 액션</h3>
          </div>
          <p className={cn('mt-2 text-[11px] font-semibold leading-5', actionDone && 'text-muted-foreground line-through')}>
            {customer.nextAction}
          </p>
          <p className="mt-1 text-[9px] text-destructive-strong">{customer.nextActionDue}</p>
          <button
            type="button"
            onClick={onToggleAction}
            className={cn(
              'mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-[10px] font-semibold transition-colors',
              actionDone
                ? 'bg-success-soft text-success hover:bg-success-soft/75'
                : 'bg-foreground text-primary-foreground hover:bg-foreground/85',
            )}
          >
            <Check className="size-3" aria-hidden="true" />
            {actionDone ? '완료됨 · 되돌리기' : '완료 처리'}
          </button>
        </section>
      </div>
    </aside>
  );
}
