import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Check, ChevronRight, Flag, Loader2, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineMemoField } from '../-components/property-inspector-view';
import type { TodoItem } from './brief-model';
import { CopyPhone } from './brief';
import type { ConfirmSummary, OfferRow, PastIntakeRow, PersonRow, TenantRow } from './model';
import { Avatar, nb, Tag } from './ui';

/*
 * 오른쪽 고정 열: 지금 챙길 것 → 연락처 → 매물 확인 → 광고 → 호실·의뢰 정보(접힘).
 */

export function RailSection({
  title,
  count,
  action,
  children,
  className,
}: {
  title?: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('py-2.5 [&+&]:border-t [&+&]:border-[#e9e9e7]', className)}>
      {title && (
        <div className="flex h-7 items-center gap-1.5 text-[13px] font-semibold text-[#37352f]">
          {title}
          {count !== undefined && count > 0 && (
            <span className="font-medium tabular-nums text-[#37352f]/45">{count}</span>
          )}
          <span className="flex-1" />
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// ── 지금 챙길 것 ───────────────────────────────────────────────────

const todoDot: Record<TodoItem['tone'], string> = {
  danger: 'bg-[rgb(212,76,71)]',
  warn: 'bg-[rgb(203,145,47)]',
  info: 'bg-[#37352f]/30',
};

export function TodosCallout({
  todos,
  onAction,
}: {
  todos: TodoItem[];
  onAction: (todo: TodoItem) => void;
}) {
  return (
    <RailSection className="pt-0.5">
      <div data-property-todos className="mt-1 flex gap-2.5 rounded bg-[rgb(247,246,243)] py-2.5 pl-2.5 pr-3">
        <Flag className="mt-[3px] size-[17px] shrink-0 text-[rgb(203,145,47)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-6 text-[#37352f]">
            지금 챙길 것
            {todos.length > 0 && <span className="ml-1 font-medium text-[#37352f]/45">{todos.length}</span>}
          </div>
          {todos.length === 0 ? (
            <p className="py-1 text-[13px] text-[#37352f]/65">지금 챙길 일이 없습니다.</p>
          ) : (
            <ul>
              {todos.map((todo) => (
                <li key={todo.key} className="flex gap-2 py-[5px]">
                  <span className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', todoDot[todo.tone])} />
                  <div className="min-w-0 flex-1 break-keep text-[13.5px] leading-5 text-[#37352f]">
                    {todo.text}
                    {(todo.sub || todo.actionLabel) && (
                      <small className="block text-[12.5px] leading-[18px] text-[#37352f]/65">
                        {todo.sub}
                        {todo.sub && todo.actionLabel && ' · '}
                        {todo.actionLabel && (
                          <button
                            type="button"
                            onClick={() => onAction(todo)}
                            className="whitespace-nowrap rounded-[3px] px-0.5 font-medium text-[#2383e2] hover:bg-[#2383e2]/[0.08] hover:underline"
                          >
                            {todo.actionLabel}
                          </button>
                        )}
                      </small>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </RailSection>
  );
}

// ── 연락처 ─────────────────────────────────────────────────────────

export function PersonLine({
  contactId,
  name,
  role,
  roleTone,
  badge,
  terms,
  phone,
  detail,
  actions,
}: {
  contactId: string | null;
  name: string;
  role: string;
  roleTone: 'brown' | 'gray' | 'yellow';
  badge?: string | null;
  terms?: string | null;
  phone: string | null;
  detail?: string | null;
  actions?: ReactNode;
}) {
  return (
    <li className="-mx-1.5 flex items-start gap-2.5 rounded px-1.5 py-1.5 hover:bg-[#37352f]/[0.04]">
      <span className="mt-0.5">
        <Avatar name={name} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-[14px] leading-[22px]">
          {contactId ? (
            <Link
              to="/contacts/$id"
              params={{ id: contactId }}
              className="truncate font-semibold text-[#37352f] underline-offset-2 hover:underline"
            >
              {name}
            </Link>
          ) : (
            <b className="truncate font-semibold">{name}</b>
          )}
          <Tag tone={roleTone}>{role}</Tag>
          {badge && <Tag className="text-[12px]">{badge}</Tag>}
        </div>
        {terms && <div className="text-[14px] font-medium leading-[21px] tabular-nums text-[#37352f]">{terms}</div>}
        <div className="truncate text-[13px] leading-[19px] text-[#37352f]/65" title={detail ?? undefined}>
          {phone ? <CopyPhone phone={phone} /> : '전화번호 없음'}
          {detail && ` · ${detail}`}
        </div>
      </div>
      {phone && (
        <a href={`tel:${phone}`} aria-label={`${name}에게 전화`} className={cn(nb.icon, 'mt-0.5')}>
          <Phone />
        </a>
      )}
      {actions}
    </li>
  );
}

export function ContactsSection({
  people,
  tenants,
  addMenu,
}: {
  people: PersonRow[];
  tenants: TenantRow[];
  addMenu: ReactNode;
}) {
  return (
    <RailSection title="연락처" count={people.length + tenants.length} action={addMenu}>
      {people.length === 0 && tenants.length === 0 ? (
        <p className="break-keep rounded bg-[rgb(251,243,219)] px-2.5 py-2 text-[12.5px] leading-5 text-[rgb(64,44,27)]">
          소유자 연락처가 없습니다. 확인 전화를 하려면 소유자나 대리인 번호가 필요합니다.
        </p>
      ) : (
        <ul>
          {people.map((person) => (
            <PersonLine
              key={person.key}
              contactId={person.contactId}
              name={person.name}
              role={person.role}
              roleTone={person.role === '소유자' ? 'brown' : 'gray'}
              badge={person.isPrimary ? '주 연락처' : null}
              phone={person.phone}
              detail={person.detail}
            />
          ))}
          {tenants.map((tenant) => (
            <PersonLine
              key={tenant.key}
              contactId={tenant.contactId}
              name={tenant.name}
              role={tenant.statusKey === 'residing' ? '세입자' : `세입자 · ${tenant.status}`}
              roleTone="yellow"
              terms={[
                tenant.terms,
                tenant.daysToEnd != null
                  ? tenant.daysToEnd >= 0
                    ? `만기 D-${tenant.daysToEnd}`
                    : `만기 ${-tenant.daysToEnd}일 지남`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              phone={tenant.phone}
              detail={tenant.period}
            />
          ))}
        </ul>
      )}
    </RailSection>
  );
}

// ── 매물 확인 ─────────────────────────────────────────────────────

const confirmColor: Record<string, string> = {
  ok: 'rgb(68,131,97)',
  warn: 'rgb(203,107,31)',
  danger: 'rgb(212,76,71)',
  deal: 'rgb(51,126,169)',
  neutral: 'rgb(120,117,110)',
};

export function ConfirmSection({
  summary,
  lines,
  pending,
  onConfirm,
  onOther,
}: {
  summary: ConfirmSummary;
  lines: string[];
  pending: boolean;
  onConfirm: () => void;
  onOther: () => void;
}) {
  const color = confirmColor[summary.state === 'overdue' ? 'danger' : summary.tone];
  return (
    <RailSection title="매물 확인">
      <div data-property-confirm className="flex items-center gap-2 text-[15px] font-semibold" style={{ color }}>
        <span className="size-2 rounded-full" style={{ background: color }} />
        {summary.headline}
      </div>
      {lines.map((line) => (
        <p key={line} className="mt-px text-[12.5px] tabular-nums text-[#37352f]/65">
          {line}
        </p>
      ))}
      <div className="mt-2.5 flex gap-1.5">
        <button
          type="button"
          className={cn(nb.solid, 'flex-1')}
          disabled={pending}
          onClick={onConfirm}
          title="소유자에게 가격과 거래 가능 여부를 확인했으면 누르세요"
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          확인 완료
        </button>
        <button type="button" className={nb.line} onClick={onOther}>
          다른 결과…
        </button>
      </div>
    </RailSection>
  );
}

// ── 광고 ───────────────────────────────────────────────────────────

export function AdsSection({
  rows,
  onOpenMyAds,
  actions,
}: {
  rows: OfferRow[];
  onOpenMyAds: () => void;
  /** 이 매물의 광고를 그 자리에서 기록·요청하는 단추(진행 중 의뢰가 있을 때만) */
  actions?: ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <RailSection
      title="광고"
      action={
        <button type="button" className={cn(nb.ghost, 'h-6 px-1.5 text-[12.5px]')} onClick={onOpenMyAds}>
          내광고관리
          <ChevronRight className="size-3.5" />
        </button>
      }
    >
      {actions && <div className="-ml-1.5 mb-1">{actions}</div>}
      <ul>
        {rows.map((row) => (
          <li
            key={row.listing.id}
            className="flex items-start gap-2 py-1.5 text-[13.5px] leading-5 [&+&]:border-t [&+&]:border-[#37352f]/[0.06]"
          >
            <span className={cn('mt-px inline-flex h-5 shrink-0 items-center rounded-[3px] px-1.5 text-[13px]', row.typeClassName)}>
              {row.typeLabel}
            </span>
            <div className="min-w-0 flex-1">
              {row.activeAds.length === 0 ? (
                <span className="text-[#37352f]/45">CP 광고 없음</span>
              ) : (
                row.activeAds.map((ad) => (
                  <div key={ad.id} className="truncate">
                    {ad.url ? (
                      <a href={ad.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {ad.channelLabel} 게재 중
                      </a>
                    ) : (
                      `${ad.channelLabel} 게재 중`
                    )}
                    {ad.stale && <span className="text-[rgb(203,107,31)]"> · 광고가 {ad.priceText}</span>}
                  </div>
                ))
              )}
              {row.endedAdCount > 0 && (
                <small className="block text-[12.5px] text-[#37352f]/65">지난 광고 {row.endedAdCount}건</small>
              )}
            </div>
          </li>
        ))}
      </ul>
    </RailSection>
  );
}

// ── 호실 · 의뢰 정보 (접힘) ────────────────────────────────────────

export interface InfoProp {
  key: string;
  label: string;
  value: ReactNode;
  hint?: string | null;
}

export function InfoSection({
  props,
  intakeMemo,
  pastIntakes,
}: {
  props: InfoProp[];
  intakeMemo: { value: string | null; onSave: (memo: string) => Promise<void> } | null;
  pastIntakes: PastIntakeRow[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <RailSection>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="-ml-0.5 inline-flex h-[26px] items-center gap-1 rounded pl-0.5 pr-1.5 text-[13px] font-semibold text-[#37352f] hover:bg-[#37352f]/[0.06]"
      >
        <ChevronRight className={cn('size-3.5 text-[#37352f]/45 transition-transform', open && 'rotate-90')} />
        호실 · 의뢰 정보
      </button>
      {open && (
        <div className="mt-1">
          <dl>
            {props.map((prop) => (
              <div key={prop.key} className="grid min-h-8 grid-cols-[88px_minmax(0,1fr)] items-start">
                <dt className="flex h-8 items-center text-[13px] text-[#37352f]/65">{prop.label}</dt>
                <dd className="min-w-0 py-[5px] text-[14px] leading-[22px] tabular-nums text-[#37352f]">
                  {prop.value}
                  {prop.hint && <small className="ml-1.5 text-[13px] text-[#37352f]/45">{prop.hint}</small>}
                </dd>
              </div>
            ))}
          </dl>
          {intakeMemo && (
            <div className="mt-1">
              <div className="text-[13px] text-[#37352f]/65">의뢰 메모</div>
              <div className="-ml-2 text-[14px]">
                <InlineMemoField label="의뢰 메모" value={intakeMemo.value} onSave={intakeMemo.onSave} emptyText="메모 추가" />
              </div>
            </div>
          )}
          {pastIntakes.length > 0 && (
            <div className="mt-2">
              <div className="text-[13px] text-[#37352f]/65">지난 의뢰</div>
              <ul className="mt-1 space-y-2">
                {pastIntakes.map((row) => (
                  <li key={row.id} className="text-[12.5px] leading-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="tabular-nums text-[#37352f]/65">{row.period}</span>
                      <Tag className="text-[12px]">{row.status}</Tag>
                    </div>
                    <div className="truncate text-[13px] tabular-nums text-[#37352f]">{row.offers}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </RailSection>
  );
}
