import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Search,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BUYER_CUSTOMERS,
  DEPENDENCY_META,
  READINESS_META,
  includesBuyerSearch,
  type BuyerCustomerDemo,
  type BuyerRequirementDemo,
  type Readiness,
} from './prototype-data';

type LedgerFilter = 'all' | Readiness;

interface RequirementRow {
  customer: BuyerCustomerDemo;
  requirement: BuyerRequirementDemo;
}

const FILTERS: Array<{ value: LedgerFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'progress', label: '선행 거래 있음' },
  { value: 'review', label: '확인 필요' },
  { value: 'ready', label: '바로 매칭' },
];

export function RequirementLedger() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>('req-han-sale');

  const rows = useMemo<RequirementRow[]>(() => {
    return BUYER_CUSTOMERS.filter((customer) => {
      const matchesReadiness = filter === 'all' || customer.readiness === filter;
      return matchesReadiness && includesBuyerSearch(customer, query);
    }).flatMap((customer) =>
      customer.requirements.map((requirement) => ({ customer, requirement })),
    );
  }, [filter, query]);

  const counts = useMemo(
    () => ({
      customers: BUYER_CUSTOMERS.length,
      requirements: BUYER_CUSTOMERS.reduce(
        (sum, customer) => sum + customer.requirements.length,
        0,
      ),
      blocked: BUYER_CUSTOMERS.filter((customer) => customer.readiness !== 'ready').length,
    }),
    [],
  );

  return (
    <main className="proto-stage-entry flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-6 border-b px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-[-0.02em]">구매고객</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
              요건 {counts.requirements}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            구매 요건마다 자금과 선행 거래조건을 함께 관리합니다.
          </p>
        </div>

        <div className="ml-auto flex items-center divide-x rounded-md border bg-card">
          <SummaryMetric label="고객" value={counts.customers} />
          <SummaryMetric label="구매 요건" value={counts.requirements} />
          <SummaryMetric label="선행조건 있음" value={counts.blocked} emphasis />
        </div>
      </header>

      <section className="flex shrink-0 items-center gap-3 border-b bg-muted/35 px-6 py-2.5">
        <label className="relative block w-[268px]">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="고객, 지역, 선행조건 검색"
            className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-xs outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>

        <div className="flex items-center rounded-md bg-muted p-0.5" aria-label="준비 상태 필터">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={cn(
                'h-7 rounded px-2.5 text-[12px] font-medium transition-colors',
                filter === item.value
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <p className="ml-auto text-[11px] text-muted-foreground">
          행을 누르면 거래 연결 구조를 펼칩니다.
        </p>
      </section>

      <div className="min-h-0 flex-1 overflow-auto pb-20">
        <table className="w-full min-w-[1120px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-muted/95 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
            <tr className="border-b">
              <th className="w-[190px] px-6 py-2.5 font-medium">고객</th>
              <th className="w-[240px] px-3 py-2.5 font-medium">구매 요건</th>
              <th className="w-[285px] px-3 py-2.5 font-medium">선행 거래조건</th>
              <th className="w-[130px] px-3 py-2.5 font-medium">준비도</th>
              <th className="w-[80px] px-3 py-2.5 text-center font-medium">매칭</th>
              <th className="px-3 py-2.5 font-medium">다음 액션</th>
              <th className="w-[42px] px-3 py-2.5" aria-label="펼치기" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ customer, requirement }) => {
              const isExpanded = expandedId === requirement.id;
              const readinessMeta = READINESS_META[customer.readiness];
              return (
                <LedgerRowGroup
                  key={requirement.id}
                  customer={customer}
                  requirement={requirement}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedId(isExpanded ? null : requirement.id)}
                  readinessMeta={readinessMeta}
                />
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <Search className="mb-3 size-7 text-muted-foreground/50" aria-hidden="true" />
            <p className="text-sm font-medium">조건에 맞는 구매고객이 없습니다.</p>
            <button
              type="button"
              className="mt-2 text-xs text-info-strong hover:underline"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              검색과 필터 초기화
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryMetric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="flex h-10 min-w-[92px] items-center gap-2 px-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <strong
        className={cn(
          'ml-auto text-sm font-semibold tabular-nums',
          emphasis && 'text-warning-strong',
        )}
      >
        {value}
      </strong>
    </div>
  );
}

function LedgerRowGroup({
  customer,
  requirement,
  isExpanded,
  onToggle,
  readinessMeta,
}: {
  customer: BuyerCustomerDemo;
  requirement: BuyerRequirementDemo;
  isExpanded: boolean;
  onToggle: () => void;
  readinessMeta: (typeof READINESS_META)[Readiness];
}) {
  const leadDependency =
    customer.dependencies.find((dependency) => dependency.state !== 'done') ??
    customer.dependencies[0];

  return (
    <>
      <tr
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          'cursor-pointer border-b text-xs outline-none transition-colors hover:bg-muted/45 focus-visible:bg-info-soft/35',
          isExpanded && 'bg-muted/55',
        )}
      >
        <td className="px-6 py-3 align-top">
          <div className="flex items-start gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-soft text-[11px] font-semibold">
              {customer.name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold">{customer.name}</span>
                {customer.requirements.length > 1 && (
                  <span className="rounded bg-violet-soft px-1.5 py-0.5 text-[10px] font-medium text-violet">
                    요건 {customer.requirements.length}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{customer.phone}</p>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                {customer.assignee} · {customer.lastContact}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                requirement.transactionType === '매매'
                  ? 'bg-info-soft text-info-strong'
                  : 'bg-violet-soft text-violet',
              )}
            >
              {requirement.transactionType}
            </span>
            <span className="font-semibold tabular-nums">{requirement.priceLabel}</span>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {requirement.regions.join(' · ')} · {requirement.sizeLabel}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">{requirement.moveLabel}</p>
        </td>
        <td className="px-3 py-3 align-top">
          {leadDependency ? (
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  'mt-1 size-2 shrink-0 rounded-full',
                  DEPENDENCY_META[leadDependency.state].dotClassName,
                )}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{leadDependency.label}</span>
                  {customer.dependencies.length > 1 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{customer.dependencies.length - 1}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {leadDependency.amountLabel ?? leadDependency.detail}
                  {leadDependency.dueLabel ? ` · ${leadDependency.dueLabel}` : ''}
                </p>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">선행조건 없음</span>
          )}
        </td>
        <td className="px-3 py-3 align-top">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold',
              readinessMeta.badgeClassName,
            )}
          >
            <span className={cn('size-1.5 rounded-full', readinessMeta.dotClassName)} />
            {readinessMeta.shortLabel}
          </span>
        </td>
        <td className="px-3 py-3 text-center align-top">
          <span
            className={cn(
              'inline-flex min-w-7 justify-center rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums',
              requirement.matches > 0 ? 'bg-info-soft text-info-strong' : 'bg-muted text-muted-foreground',
            )}
          >
            {requirement.matches}
          </span>
        </td>
        <td className="px-3 py-3 align-top">
          <p className="font-medium">{customer.nextAction}</p>
          <p
            className={cn(
              'mt-1 text-[10px]',
              customer.nextActionDue === '오늘'
                ? 'font-semibold text-destructive-strong'
                : 'text-muted-foreground',
            )}
          >
            {customer.nextActionDue}
          </p>
        </td>
        <td className="px-3 py-3 align-top text-muted-foreground">
          {isExpanded ? (
            <ChevronUp className="size-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4" aria-hidden="true" />
          )}
        </td>
      </tr>

      {isExpanded && (
        <tr className="border-b bg-muted/30">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-[180px_minmax(0,1fr)_220px] items-stretch gap-3">
              <ChainNode
                eyebrow="현재 상황"
                title={customer.currentSituation}
                detail="고객 보유·거주 상태"
                icon={<GitBranch className="size-3.5" aria-hidden="true" />}
              />

              <div className="relative grid grid-cols-2 gap-2 rounded-lg border border-dashed bg-background p-2.5">
                <span className="absolute -left-5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground">
                  <ArrowRight className="size-3" aria-hidden="true" />
                </span>
                {customer.dependencies.map((dependency) => {
                  const meta = DEPENDENCY_META[dependency.state];
                  return (
                    <div key={dependency.id} className="rounded-md bg-muted/60 px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('size-1.5 rounded-full', meta.dotClassName)} />
                        <span className="text-[11px] font-semibold">{dependency.label}</span>
                        <span
                          className={cn(
                            'ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold',
                            meta.badgeClassName,
                          )}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                        {dependency.detail}
                      </p>
                      {(dependency.amountLabel || dependency.dueLabel) && (
                        <p className="mt-1 text-[10px] font-medium">
                          {[dependency.amountLabel, dependency.dueLabel].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="relative">
                <span className="absolute -left-5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground">
                  <ArrowRight className="size-3" aria-hidden="true" />
                </span>
                <ChainNode
                  eyebrow="목표 거래"
                  title={`${requirement.transactionType} ${requirement.priceLabel}`}
                  detail={`${requirement.regions.join(' · ')} · 매칭 ${requirement.matches}건`}
                  icon={<Target className="size-3.5" aria-hidden="true" />}
                  accent
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ChainNode({
  eyebrow,
  title,
  detail,
  icon,
  accent = false,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-background px-3.5 py-3',
        accent && 'border-info/30 bg-info-soft/25',
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        {icon}
        {eyebrow}
      </div>
      <p className="mt-2 text-xs font-semibold leading-5">{title}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}
