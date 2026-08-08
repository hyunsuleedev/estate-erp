import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  GitBranch,
  Home,
  Phone,
  Search,
  Target,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BUYER_CUSTOMERS,
  DEPENDENCY_META,
  READINESS_META,
  includesBuyerSearch,
  type BuyerCustomerDemo,
} from './prototype-data';

const MATCH_NAMES: Record<string, string[]> = {
  'req-han-sale': ['고덕아르테온 84A · 25.8억', '고덕그라시움 84B · 26.5억'],
  'req-han-jeonse': ['고덕센트럴아이파크 84A · 전세 11억'],
  'req-kang-sale': ['올림픽파크포레온 84A · 24.2억', '고덕자이 84B · 23.8억'],
  'req-choi-sale': ['잠실엘스 84A · 32.7억'],
  'req-bae-sale': [
    '고덕롯데캐슬베네루체 84A · 19.4억',
    '헬리오시티 59B · 20.8억',
    '고덕센트럴아이파크 84A · 21.2억',
  ],
  'req-yoon-sale': [],
  'req-jeong-sale': ['강동헤리티지자이 59A · 13.8억', '고덕강일제일풍경채 59B · 14.4억'],
};

export function CustomerWorkbench() {
  const [query, setQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(BUYER_CUSTOMERS[0].id);
  const [selectedRequirementId, setSelectedRequirementId] = useState(
    BUYER_CUSTOMERS[0].requirements[0].id,
  );
  const [focusedDependencyId, setFocusedDependencyId] = useState(
    BUYER_CUSTOMERS[0].dependencies[0].id,
  );
  const [showMatches, setShowMatches] = useState(false);
  const [completedActions, setCompletedActions] = useState<Set<string>>(() => new Set());

  const visibleCustomers = useMemo(
    () => BUYER_CUSTOMERS.filter((customer) => includesBuyerSearch(customer, query)),
    [query],
  );

  const customer =
    visibleCustomers.find((item) => item.id === selectedCustomerId) ?? visibleCustomers[0] ?? null;
  const requirement =
    customer?.requirements.find((item) => item.id === selectedRequirementId) ??
    customer?.requirements[0] ??
    null;
  const focusedDependency =
    customer?.dependencies.find((item) => item.id === focusedDependencyId) ??
    customer?.dependencies[0] ??
    null;

  function selectCustomer(nextCustomer: BuyerCustomerDemo) {
    setSelectedCustomerId(nextCustomer.id);
    setSelectedRequirementId(nextCustomer.requirements[0].id);
    setFocusedDependencyId(nextCustomer.dependencies[0]?.id ?? '');
    setShowMatches(false);
  }

  function toggleAction(customerId: string) {
    setCompletedActions((current) => {
      const next = new Set(current);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  return (
    <main className="proto-stage-entry flex h-full min-h-0 flex-col overflow-hidden bg-muted/25">
      <header className="flex h-[72px] shrink-0 items-center border-b bg-background px-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-[-0.02em]">구매고객 워크벤치</h1>
            <span className="rounded-full bg-neutral-soft px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              고객 {BUYER_CUSTOMERS.length}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            한 고객의 여러 요건과 선행 거래를 한 화면에서 연결합니다.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-5 text-[11px] text-muted-foreground">
          {(['ready', 'progress', 'review'] as const).map((readiness) => (
            <div key={readiness} className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', READINESS_META[readiness].dotClassName)} />
              <span>{READINESS_META[readiness].label}</span>
              <strong className="text-foreground tabular-nums">
                {BUYER_CUSTOMERS.filter((customerItem) => customerItem.readiness === readiness).length}
              </strong>
            </div>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[350px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r bg-background">
          <div className="shrink-0 border-b p-3">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="고객, 전화번호, 지역 검색"
                className="h-9 w-full rounded-md border bg-muted/30 pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto pb-20">
            {visibleCustomers.map((item) => {
              const readinessMeta = READINESS_META[item.readiness];
              const isActive = customer?.id === item.id;
              const unresolvedCount = item.dependencies.filter(
                (dependency) => dependency.state !== 'done',
              ).length;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectCustomer(item)}
                  className={cn(
                    'group flex w-full items-start gap-3 border-b px-4 py-3 text-left outline-none transition-colors hover:bg-muted/55 focus-visible:bg-info-soft/35',
                    isActive && 'bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      isActive ? 'bg-foreground text-primary-foreground' : 'bg-neutral-soft',
                    )}
                  >
                    {item.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <strong className="text-[13px]">{item.name}</strong>
                      <span className="text-[10px] text-muted-foreground">
                        요건 {item.requirements.length}
                      </span>
                      <span className={cn('ml-auto size-2 rounded-full', readinessMeta.dotClassName)} />
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                      {item.currentSituation}
                    </span>
                    <span className="mt-2 flex items-center gap-1.5 text-[10px]">
                      <span className={cn('rounded px-1.5 py-0.5 font-semibold', readinessMeta.badgeClassName)}>
                        {readinessMeta.shortLabel}
                      </span>
                      {unresolvedCount > 0 && (
                        <span className="text-muted-foreground">미확인 {unresolvedCount}개</span>
                      )}
                      <span className="ml-auto text-muted-foreground">{item.lastContact}</span>
                    </span>
                  </span>
                  <ChevronRight
                    className={cn(
                      'mt-2 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100',
                      isActive && 'opacity-100',
                    )}
                    aria-hidden="true"
                  />
                </button>
              );
            })}

            {visibleCustomers.length === 0 && (
              <div className="px-6 py-16 text-center">
                <UserRound className="mx-auto size-7 text-muted-foreground/50" aria-hidden="true" />
                <p className="mt-3 text-xs text-muted-foreground">검색 결과가 없습니다.</p>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="mt-2 text-xs font-medium text-info-strong hover:underline"
                >
                  검색 초기화
                </button>
              </div>
            )}
          </div>
        </aside>

        {customer && requirement ? (
          <section className="min-h-0 overflow-auto pb-20">
            <div className="border-b bg-background px-6 py-4">
              <div className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-neutral-soft text-base font-bold">
                  {customer.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">{customer.name}</h2>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold',
                        READINESS_META[customer.readiness].badgeClassName,
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          READINESS_META[customer.readiness].dotClassName,
                        )}
                      />
                      {READINESS_META[customer.readiness].label}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" aria-hidden="true" /> {customer.phone}
                    </span>
                    <span>담당 {customer.assignee}</span>
                    <span>최근 연락 {customer.lastContact}</span>
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-1 rounded-md bg-muted p-0.5" aria-label="구매 요건 선택">
                  {customer.requirements.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedRequirementId(item.id);
                        setShowMatches(false);
                      }}
                      className={cn(
                        'h-7 rounded px-2.5 text-[11px] font-medium transition-colors',
                        requirement.id === item.id
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {item.transactionType} 요건 {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_270px] gap-4 p-5">
              <div className="min-w-0 space-y-4">
                <section className="rounded-lg border bg-background">
                  <div className="flex items-center border-b px-4 py-3">
                    <GitBranch className="mr-2 size-4 text-muted-foreground" aria-hidden="true" />
                    <h3 className="text-sm font-semibold">거래 연결 구조</h3>
                    <p className="ml-2 text-[10px] text-muted-foreground">
                      현재 상황 → 해결할 조건 → 목표 거래
                    </p>
                  </div>

                  <div className="grid grid-cols-[minmax(150px,0.9fr)_30px_minmax(220px,1.25fr)_30px_minmax(170px,1fr)] items-center gap-1 p-4">
                    <WorkbenchNode
                      icon={<Home className="size-4" aria-hidden="true" />}
                      label="현재 상황"
                      title={customer.currentSituation}
                      detail="고객의 출발점"
                    />
                    <ArrowConnector />

                    <div className="space-y-2">
                      {customer.dependencies.map((dependency) => {
                        const meta = DEPENDENCY_META[dependency.state];
                        const isFocused = focusedDependency?.id === dependency.id;
                        return (
                          <button
                            key={dependency.id}
                            type="button"
                            onClick={() => setFocusedDependencyId(dependency.id)}
                            className={cn(
                              'w-full rounded-lg border px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring/30',
                              isFocused && 'border-ring/50 bg-info-soft/25',
                            )}
                          >
                            <span className="flex items-center gap-1.5">
                              <span className={cn('size-2 rounded-full', meta.dotClassName)} />
                              <strong className="text-[11px]">{dependency.label}</strong>
                              <span
                                className={cn(
                                  'ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold',
                                  meta.badgeClassName,
                                )}
                              >
                                {meta.label}
                              </span>
                            </span>
                            <span className="mt-1.5 block truncate text-[10px] text-muted-foreground">
                              {[dependency.amountLabel, dependency.dueLabel]
                                .filter(Boolean)
                                .join(' · ') || dependency.detail}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <ArrowConnector />
                    <WorkbenchNode
                      icon={<Target className="size-4" aria-hidden="true" />}
                      label="목표 거래"
                      title={`${requirement.transactionType} ${requirement.priceLabel}`}
                      detail={`${requirement.regions.join(' · ')} · ${requirement.moveLabel}`}
                      accent
                    />
                  </div>

                  {focusedDependency && (
                    <div className="mx-4 mb-4 flex items-center gap-3 rounded-md bg-muted/60 px-3 py-2.5">
                      <CircleDollarSign className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold">{focusedDependency.label}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {focusedDependency.detail}
                        </p>
                      </div>
                      <span className="ml-auto shrink-0 text-[10px] font-medium">
                        {[focusedDependency.amountLabel, focusedDependency.dueLabel]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  )}
                </section>

                <section className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border bg-background p-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                      <h3 className="text-xs font-semibold">선택한 구매 요건</h3>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[11px]">
                      <InfoPair label="거래·주거" value={`${requirement.transactionType} · ${requirement.homeType}`} />
                      <InfoPair label="예산" value={requirement.priceLabel} />
                      <InfoPair label="지역" value={requirement.regions.join(' · ')} />
                      <InfoPair label="면적" value={requirement.sizeLabel} />
                      <InfoPair label="희망 일정" value={requirement.moveLabel} wide />
                    </dl>
                  </div>

                  <div className="rounded-lg border bg-background p-4">
                    <div className="flex items-center">
                      <Target className="mr-2 size-4 text-muted-foreground" aria-hidden="true" />
                      <h3 className="text-xs font-semibold">추천 매물</h3>
                      <span className="ml-auto rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-semibold text-info-strong tabular-nums">
                        {requirement.matches}건
                      </span>
                    </div>
                    {showMatches ? (
                      <div className="mt-3 space-y-1.5">
                        {(MATCH_NAMES[requirement.id] ?? []).length > 0 ? (
                          MATCH_NAMES[requirement.id].map((match) => (
                            <div key={match} className="rounded-md bg-muted/65 px-2.5 py-2 text-[10px] font-medium">
                              {match}
                            </div>
                          ))
                        ) : (
                          <p className="rounded-md bg-muted/65 px-2.5 py-3 text-center text-[10px] text-muted-foreground">
                            아직 추천할 매물이 없습니다.
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowMatches(false)}
                          className="mt-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                        >
                          접기
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowMatches(true)}
                        className="mt-3 flex h-9 w-full items-center justify-center gap-1 rounded-md bg-muted text-[11px] font-medium transition-colors hover:bg-accent"
                      >
                        추천 매물 {requirement.matches}건 보기
                        <ChevronRight className="size-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </section>
              </div>

              <aside className="space-y-4">
                <section className="rounded-lg border bg-background p-4">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
                    <h3 className="text-xs font-semibold">다음 액션</h3>
                  </div>
                  <p
                    className={cn(
                      'mt-3 text-[13px] font-semibold leading-5',
                      completedActions.has(customer.id) && 'text-muted-foreground line-through',
                    )}
                  >
                    {customer.nextAction}
                  </p>
                  <p className="mt-1 text-[10px] text-destructive-strong">기한 {customer.nextActionDue}</p>
                  <button
                    type="button"
                    onClick={() => toggleAction(customer.id)}
                    className={cn(
                      'mt-4 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-[11px] font-semibold transition-colors',
                      completedActions.has(customer.id)
                        ? 'bg-success-soft text-success hover:bg-success-soft/75'
                        : 'bg-foreground text-primary-foreground hover:bg-foreground/85',
                    )}
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                    {completedActions.has(customer.id) ? '완료됨 · 되돌리기' : '완료 처리'}
                  </button>
                </section>

                <section className="rounded-lg border bg-background p-4">
                  <h3 className="text-xs font-semibold">중개 판단 메모</h3>
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    {customer.readinessReason}
                  </p>
                  <div className="mt-3 border-t pt-3 text-[10px] text-muted-foreground">
                    <p className="flex justify-between">
                      <span>담당자</span>
                      <strong className="font-medium text-foreground">{customer.assignee}</strong>
                    </p>
                    <p className="mt-2 flex justify-between">
                      <span>최근 연락</span>
                      <strong className="font-medium text-foreground">{customer.lastContact}</strong>
                    </p>
                  </div>
                </section>
              </aside>
            </div>
          </section>
        ) : (
          <div className="flex items-center justify-center text-sm text-muted-foreground">
            고객을 선택해 주세요.
          </div>
        )}
      </div>
    </main>
  );
}

function ArrowConnector() {
  return (
    <div className="flex items-center justify-center text-muted-foreground">
      <ArrowRight className="size-4" aria-hidden="true" />
    </div>
  );
}

function WorkbenchNode({
  icon,
  label,
  title,
  detail,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-background p-3',
        accent && 'border-info/30 bg-info-soft/25',
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-[12px] font-semibold leading-5">{title}</p>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p>
    </div>
  );
}

function InfoPair({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn(wide && 'col-span-2')}>
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
