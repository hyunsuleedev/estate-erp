import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { api } from '@/lib/api';
import { CalendarDays, FileText, Handshake, Home, ListTodo, Plus } from 'lucide-react';
import { formatMoney, formatRelativeDay, formatRelativeDayTime, formatRent } from '@/lib/format';
import { getStatusMeta, type StatusKind, type Tone } from '@/lib/status-config';
import { cn } from '@/lib/utils';
import { getTransactionTypeMeta } from '../properties/-detail/model';
import { H2, nb, Tag, type TagTone } from '../properties/-detail/ui';

/**
 * 연락처 상세의 "이 사람과 한 일" 구역들: 다가오는 일정 · 열린 업무 · 거래 · 연결한 매물(매칭) · 계약서.
 * 손님이 다시 전화했을 때 한 화면에서 지금까지의 일을 보이기 위한 것이다. 내용이 없는 구역은 그리지 않는다
 * (사려는 손님에게 "거래가 없습니다"가 결함처럼 보이지 않게). 한 줄은 상담 기록과 같은 모양이다.
 */

type ContactOverview = Awaited<ReturnType<typeof api.contacts.getOverview>>;
type Deal = ContactOverview['deals'][number];
type Contract = ContactOverview['contracts'][number];

const TONE_TO_TAG: Record<Tone, TagTone> = {
  gray: 'gray',
  neutral: 'gray',
  success: 'green',
  warning: 'yellow',
  info: 'blue',
  violet: 'blue',
  pink: 'red',
  orange: 'orange',
  destructive: 'red',
};

function StatusTag({ kind, value }: { kind: StatusKind; value: string }) {
  const meta = getStatusMeta(kind, value);
  return <Tag tone={TONE_TO_TAG[meta.tone] ?? 'gray'}>{meta.label}</Tag>;
}

/** 거래 당사자의 이름: 매매는 매도인/매수인, 임대차는 임대인/임차인, 양도는 양도인/양수인 */
export function partyRoleLabel(role: 'seller' | 'buyer', transactionType: string): string {
  if (transactionType === 'sale' || transactionType === 'exchange') return role === 'seller' ? '매도인' : '매수인';
  if (transactionType === 'transfer' || transactionType === 'succession') {
    return role === 'seller' ? '양도인' : '양수인';
  }
  return role === 'seller' ? '임대인' : '임차인';
}

/** 금액 한 줄: 월세는 "1억 / 250만", 그 밖에는 "19억 8,000만" */
export function amountText(transactionType: string, price: number | null, deposit: number | null, rent: number | null) {
  if (transactionType === 'monthly') return deposit != null || rent != null ? formatRent(deposit, rent) : null;
  return price != null ? formatMoney(price) : null;
}

export function TypeChip({ type }: { type: string }) {
  const meta = getTransactionTypeMeta(type);
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center rounded-[3px] px-1.5 text-[13px]', meta.className)}>
      {meta.label}
    </span>
  );
}

export const rowClassName = '-mx-1.5 flex min-w-0 items-center gap-2 rounded px-1.5 py-2 text-[14px] leading-[22px] hover:bg-[#37352f]/[0.03]';
export const placeLinkClassName = 'min-w-0 truncate font-semibold text-[#37352f] underline-offset-2 hover:underline';
export const metaTextClassName = 'shrink-0 text-[13px] tabular-nums text-[#37352f]/65';

function Section({
  id,
  title,
  count,
  hint,
  action,
  children,
}: {
  id: string;
  title: string;
  count: number;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section data-contact-overview={id} id={id}>
      <H2 title={title} count={count} hint={hint} action={action} />
      <ol className="mt-1">{children}</ol>
    </section>
  );
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  viewing: '임장',
  contract: '계약',
  meeting: '미팅',
  task: '업무',
  general: '일정',
};

/** 다가오는 임장 · 일정. 손님으로 보러 가는지, 소유한 집을 보여 주는지 함께 적는다 */
export function UpcomingEventsSection({ events }: { events: ContactOverview['events'] }) {
  if (events.length === 0) return null;
  return (
    <Section
      id="upcoming"
      title="다가오는 임장 · 일정"
      count={events.length}
      action={
        <Link to="/calendar" className={nb.ghost}>
          캘린더
        </Link>
      }
    >
      {events.map((event) => {
        const day = event.start.slice(0, 10);
        return (
          <li
            key={event.id}
            data-contact-event
            data-match-closed={event.matchClosed ? '' : undefined}
            data-viewing-done={event.viewingDone ? '' : undefined}
            className={cn(rowClassName, (event.matchClosed || event.viewingDone) && 'opacity-60')}
          >
            <CalendarDays className="size-4 shrink-0 text-[#37352f]/45" />
            <span className="w-[112px] shrink-0 text-[13px] font-medium tabular-nums text-[#37352f]">
              {event.allDay ? formatRelativeDay(event.start) : formatRelativeDayTime(event.start)}
            </span>
            <Tag tone={event.type === 'viewing' && !event.matchClosed && !event.viewingDone ? 'blue' : 'gray'}>
              {EVENT_TYPE_LABELS[event.type] ?? '일정'}
            </Tag>
            <Link
              to="/calendar"
              search={{ date: day, event: event.id }}
              className={placeLinkClassName}
              title={event.title}
            >
              {event.place ?? event.title}
            </Link>
            {/* 제목이 장소를 되풀이하면("홍길동 고덕그라시움 101동 1001호 임장") 다시 적지 않는다 */}
            {event.place && !event.title.includes(event.place) && (
              <span className="min-w-0 truncate text-[13px] text-[#37352f]/65">{event.title}</span>
            )}
            <span className="ml-auto shrink-0 pl-2 text-[12.5px] text-[#37352f]/45">
              {event.matchClosed ? (
                // 매칭을 닫아도 일정은 지우지 않는다. 캘린더와 같이 "매칭 종료"로 보인다
                <Tag tone="gray">매칭 종료</Tag>
              ) : event.viewingDone ? (
                // 날짜는 앞날이어도, 거래 전환 전에 잡아 둔 임장이고 그 거래가 잔금 완료 · 정산 종료까지 끝났다면 끝난 일이다
                <Tag tone="gray">거래 완료</Tag>
              ) : event.relation === 'owner' ? (
                '소유한 집'
              ) : event.relation === 'buyer' ? (
                '보러 가는 집'
              ) : (
                ''
              )}
            </span>
          </li>
        );
      })}
    </Section>
  );
}

const PRIORITY_LABELS: Record<string, string> = { urgent: '긴급', high: '높음' };

/** 마감이 어제 이전인 업무 */
function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  const now = new Date();
  return new Date(dueDate).getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** 이 사람에게 걸린 열린 업무. 머리의 "업무 추가"로 바로 더한다 */
export function OpenTasksSection({ tasks, onAdd }: { tasks: ContactOverview['tasks']; onAdd: () => void }) {
  if (tasks.length === 0) return null;
  return (
    <Section
      id="tasks"
      title="업무"
      count={tasks.length}
      hint="끝내지 않은 것"
      action={
        <button type="button" className={nb.ghost} onClick={onAdd}>
          <Plus />
          업무 추가
        </button>
      }
    >
      {tasks.map((task) => (
        <li key={task.id} data-contact-task className={rowClassName}>
          <ListTodo className="size-4 shrink-0 text-[#37352f]/45" />
          <Link to="/tasks" search={{ task: task.id }} className={placeLinkClassName} title={task.title}>
            {task.title}
          </Link>
          {PRIORITY_LABELS[task.priority] && <Tag tone="red">{PRIORITY_LABELS[task.priority]}</Tag>}
          <span className="ml-auto flex shrink-0 items-center gap-2 pl-2">
            {task.assignedTo && <span className={metaTextClassName}>{task.assignedTo.name}</span>}
            <span
              className={cn(
                metaTextClassName,
                'min-w-[64px] text-right',
                isOverdue(task.dueDate) && 'font-medium text-[rgb(203,107,31)]',
              )}
            >
              {task.dueDate ? formatRelativeDay(task.dueDate) : '날짜 없음'}
              {isOverdue(task.dueDate) && ' · 지남'}
            </span>
          </span>
        </li>
      ))}
    </Section>
  );
}

/** 이 사람이 당사자인 거래. 수수료는 받았는지만 적는다(금액은 수수료/정산 화면에서) */
export function DealsSection({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) return null;
  return (
    <Section id="deals" title="거래" count={deals.length}>
      {deals.map((deal) => {
        const amount = amountText(deal.transactionType, deal.agreedPrice, deal.agreedDeposit, deal.agreedMonthlyRent);
        return (
          <li key={deal.id} data-contact-deal className={cn(rowClassName, deal.isCancelled && 'opacity-60')}>
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
              {deal.isCancelled ? <Tag tone="red">취소됨</Tag> : <StatusTag kind="dealStage" value={deal.stage} />}
              {!deal.isCancelled && deal.commission && (
                <span className={metaTextClassName}>
                  {deal.commission === 'collected' ? '수수료 받음' : '수수료 받는 중'}
                </span>
              )}
              <span className={cn(metaTextClassName, 'w-[72px] text-right')}>
                {formatRelativeDay(deal.stageChangedAt)}
              </span>
            </span>
          </li>
        );
      })}
    </Section>
  );
}

/** 이 손님에게 연결한 매물(진행 중인 매칭). 매물 이름을 누르면 그 매물로, 단계는 희망 조건 화면에서 바꾼다 */
export function MatchesSection({ matches }: { matches: ContactOverview['matches'] }) {
  if (matches.length === 0) return null;
  return (
    <Section id="matches" title="연결한 매물" count={matches.length} hint="보여 주는 중인 집">
      {matches.map((match) => {
        const amount = amountText(match.transactionType, match.price, match.deposit, match.monthlyRent);
        return (
          <li key={match.id} data-contact-match className={rowClassName}>
            <Home className="size-4 shrink-0 text-[#37352f]/45" />
            <Link to="/properties/$id" params={{ id: match.propertyId }} className={placeLinkClassName}>
              {match.place ?? '매물'}
            </Link>
            <TypeChip type={match.transactionType} />
            {amount && <span className="shrink-0 text-[13px] font-medium tabular-nums">{amount}</span>}
            <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
              <Link to="/buyer-requirements/$id" params={{ id: match.buyerReqId }} title="희망 조건에서 보기">
                <StatusTag kind="matchStage" value={match.stage} />
              </Link>
              <span className={cn(metaTextClassName, 'w-[72px] text-right')}>{formatRelativeDay(match.updatedAt)}</span>
            </span>
          </li>
        );
      })}
    </Section>
  );
}

/** 이 사람이 당사자인 계약서 */
export function ContractsSection({ contracts }: { contracts: Contract[] }) {
  if (contracts.length === 0) return null;
  return (
    <Section id="contracts" title="계약서" count={contracts.length}>
      {contracts.map((contract) => {
        const amount =
          contract.transactionType === 'monthly'
            ? formatRent(contract.totalPrice, contract.monthlyRent)
            : formatMoney(contract.totalPrice);
        return (
          <li key={contract.id} data-contact-contract className={rowClassName}>
            <FileText className="size-4 shrink-0 text-[#37352f]/45" />
            <Link
              to="/contracts"
              search={{ editorContractId: contract.id }}
              className={placeLinkClassName}
            >
              {contract.place ?? '계약서'}
            </Link>
            <span className="shrink-0 text-[13px] text-[#37352f]/65">
              {partyRoleLabel(contract.role, contract.transactionType)}
            </span>
            <TypeChip type={contract.transactionType} />
            <span className="shrink-0 text-[13px] font-medium tabular-nums">{amount}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
              <StatusTag kind="contractStatus" value={contract.status} />
              <span className={cn(metaTextClassName, 'text-right')}>
                {contract.statedBalanceDate
                  ? `잔금 ${formatRelativeDay(contract.statedBalanceDate)}`
                  : contract.contractDate
                    ? `계약 ${formatRelativeDay(contract.contractDate)}`
                    : ''}
              </span>
            </span>
          </li>
        );
      })}
    </Section>
  );
}

/** 이 사람이 판(넘긴) 집인지: 매도인·임대인으로 잔금까지 끝난 거래가 있는 매물 */
export function soldPropertyIds(deals: Deal[]): Set<string> {
  return new Set(
    deals
      .filter(
        (deal) =>
          deal.role === 'seller' &&
          !deal.isCancelled &&
          deal.transactionType === 'sale' &&
          (deal.stage === 'completed' || deal.stage === 'closed') &&
          deal.propertyId,
      )
      .map((deal) => deal.propertyId as string),
  );
}
