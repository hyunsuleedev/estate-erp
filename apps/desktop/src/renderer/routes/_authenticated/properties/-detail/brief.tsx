import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, CalendarPlus, ClipboardCopy, ExternalLink, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatPhoneNumber } from '@/lib/contacts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { InlineMemoField } from '../-components/property-inspector-view';
import type { BriefCard, BriefTextOptions, ViewingItem } from './brief-model';
import { H2, nb, Tag, type TagTone } from './ui';

/*
 * 브리핑(손님 전화 받을 때)과 집 보기(임장 잡을 때).
 * 거래 조건마다 카드 한 장. 조건이 하나면 왼쪽에 가격, 오른쪽에 조건 두 줄로 펼친다.
 */

export const availabilityTone: Record<string, TagTone> = {
  available: 'green',
  paused: 'yellow',
  in_contract: 'blue',
  closed: 'gray',
};

export interface BriefMemo {
  key: string;
  label: string;
  value: string | null;
  onSave: (memo: string) => Promise<void>;
}

export function BriefSection({
  cards,
  guest,
  memos,
  onEditListing,
  renderCardMenu,
  copyButton,
  emptyAction,
  emptyText,
}: {
  cards: BriefCard[];
  guest: boolean;
  memos: BriefMemo[];
  onEditListing: (card: BriefCard) => void;
  renderCardMenu: (card: BriefCard) => ReactNode;
  copyButton: ReactNode;
  emptyAction: ReactNode;
  emptyText: string;
}) {
  const single = cards.length === 1;
  return (
    <section id="brief" data-property-offers>
      <H2 title="브리핑" hint={guest ? null : '손님 전화 받을 때'} action={guest || cards.length === 0 ? null : copyButton} />
      {cards.length === 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-md px-4 py-3.5 text-[13px] text-[#37352f]/65 shadow-[0_0_0_1px_#e9e9e7]">
          <span>{emptyText}</span>
          {emptyAction}
        </div>
      ) : (
        <div
          data-brief-cards={single ? 'single' : 'multi'}
          className={cn('mt-2.5 grid gap-3', single ? 'grid-cols-1' : 'grid-cols-[repeat(auto-fit,minmax(270px,1fr))]')}
        >
          {cards.map((card) => (
            <OfferCard
              key={card.row.listing.id}
              card={card}
              single={single}
              guest={guest}
              onEdit={() => onEditListing(card)}
              menu={guest ? null : renderCardMenu(card)}
            />
          ))}
        </div>
      )}

      {!guest && memos.length > 0 && (
        <dl className="mt-3 grid gap-1.5">
          {memos.map((memo) => (
            <div key={memo.key} className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-2">
              <dt className="pt-1.5 text-[13px] text-[#37352f]/65">{memo.label}</dt>
              <dd className="-ml-2 min-w-0 text-[14px] [&_button]:text-[14px]">
                <InlineMemoField label={memo.label} value={memo.value} onSave={memo.onSave} emptyText="메모 추가" />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function OfferCard({
  card,
  single,
  guest,
  onEdit,
  menu,
}: {
  card: BriefCard;
  single: boolean;
  guest: boolean;
  onEdit: () => void;
  menu: ReactNode;
}) {
  const { row } = card;
  const ads = row.activeAds;
  return (
    <article
      data-offer-card={row.listing.transactionType}
      className={cn(
        'rounded-md bg-white shadow-[0_0_0_1px_#e9e9e7]',
        card.busy && 'bg-[#fbfbfa]',
        single
          ? 'grid grid-cols-[228px_minmax(0,1fr)] gap-x-5 py-3 pl-3.5 pr-4'
          : 'px-3.5 pb-2.5 pt-3',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('inline-flex h-5 items-center rounded-[3px] px-1.5 text-[13px]', row.typeClassName)}>
            {row.typeLabel}
          </span>
          {(!guest || card.busy) && (
            <Tag tone={availabilityTone[row.availability] ?? 'gray'} dot>
              {card.statusLabel}
            </Tag>
          )}
          <span className="flex-1" />
          {menu}
        </div>
        <div
          className={cn(
            'flex flex-wrap gap-x-2.5 gap-y-0.5',
            single ? 'mt-2.5 flex-col items-start' : 'mb-0.5 mt-2 items-baseline',
          )}
        >
          <button
            type="button"
            disabled={guest}
            onClick={onEdit}
            title={guest ? undefined : '눌러서 가격·조건 수정'}
            className="-ml-1 rounded px-1 text-left text-[24px] font-bold tabular-nums tracking-[-0.02em] text-[#37352f] transition-colors hover:bg-[#37352f]/[0.06] disabled:hover:bg-transparent"
          >
            {row.priceText}
          </button>
          {card.perPyeong && <span className="text-[13px] tabular-nums text-[#37352f]/65">{card.perPyeong}</span>}
          {row.delta && !guest && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[12px] tabular-nums',
                row.delta.direction === 'down' ? 'text-[rgb(68,131,97)]' : 'text-[rgb(212,76,71)]',
              )}
            >
              {row.delta.direction === 'down' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
              {row.delta.amountText}
              <span className="text-[#37352f]/45">· {row.delta.dateText}</span>
            </span>
          )}
        </div>
      </div>

      <dl
        className={cn(
          single
            ? 'grid grid-cols-2 content-start gap-x-5 border-l border-[#e9e9e7] pl-5'
            : 'mt-1.5 border-t border-[#e9e9e7] pt-1.5',
        )}
      >
        {card.rows.map((item) => (
          <div
            key={item.key}
            className={cn(
              'grid gap-2 py-[3px] text-[14px] leading-[21px]',
              single ? 'grid-cols-[64px_minmax(0,1fr)]' : 'grid-cols-[74px_minmax(0,1fr)]',
            )}
          >
            <dt className="text-[13px] text-[#37352f]/65">{item.label}</dt>
            <dd
              className={cn(
                'min-w-0 tabular-nums',
                item.highlight && 'text-[rgb(24,51,71)]',
                item.warn && 'text-[rgb(203,107,31)]',
                item.muted && 'text-[#37352f]/45',
              )}
            >
              {item.highlight ? <b className="font-semibold">{item.value}</b> : item.value}
              {item.note && <small className="ml-1 text-[12.5px] text-[#37352f]/45">{item.note}</small>}
            </dd>
          </div>
        ))}
        {!guest && (
          <div
            className={cn(
              'grid gap-2 py-[3px] text-[14px] leading-[21px]',
              single ? 'grid-cols-[64px_minmax(0,1fr)]' : 'grid-cols-[74px_minmax(0,1fr)]',
            )}
          >
            <dt className="text-[13px] text-[#37352f]/65">광고</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-1">
              {ads.length === 0 ? (
                <span className="text-[#37352f]/45">
                  {row.endedAdCount > 0 ? `없음 · 종료 ${row.endedAdCount}건` : '없음'}
                </span>
              ) : (
                ads.map((ad) => {
                  const chip = (
                    <Tag tone={ad.stale ? 'orange' : 'green'} dot className="h-[19px]">
                      {ad.channelLabel}
                      {ad.url && <ExternalLink className="size-3 opacity-60" />}
                    </Tag>
                  );
                  return (
                    <span key={ad.id} className="inline-flex items-center gap-1">
                      {ad.url ? (
                        <a href={ad.url} target="_blank" rel="noreferrer" title={`광고가 ${ad.priceText}`}>
                          {chip}
                        </a>
                      ) : (
                        chip
                      )}
                      {ad.stale && (
                        <small className="text-[12.5px] tabular-nums text-[rgb(203,107,31)]">광고가 {ad.priceText}</small>
                      )}
                    </span>
                  );
                })
              )}
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

// ── 카톡 브리핑 복사 ───────────────────────────────────────────────

export function BriefCopyPopover({ build }: { build: (options: BriefTextOptions) => string }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<BriefTextOptions>({
    includeUnit: false,
    includeBusy: false,
    includePerPyeong: true,
  });
  const text = useMemo(() => (open ? build(options) : ''), [open, build, options]);
  const toggle = (key: keyof BriefTextOptions) => setOptions((prev) => ({ ...prev, [key]: !prev[key] }));

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
      <PopoverTrigger className={nb.line}>
        <ClipboardCopy />
        카톡용 브리핑 복사
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[440px] p-3">
        <div className="mb-2 text-[12px] font-medium text-[#37352f]/65">손님에게 보낼 글</div>
        <div className="mb-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-[#37352f]">
          {(
            [
              ['includeUnit', '호수까지 적기'],
              ['includeBusy', '계약 진행 중인 조건도 적기'],
              ['includePerPyeong', '평당가 적기'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="inline-flex cursor-default select-none items-center gap-1.5">
              <input
                type="checkbox"
                checked={options[key]}
                onChange={() => toggle(key)}
                className="size-3.5 accent-[#2383e2]"
              />
              {label}
            </label>
          ))}
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

// ── 집 보기 ────────────────────────────────────────────────────────

export interface Occupancy {
  label: string;
  tone: TagTone;
  /** 내부용: 세입자 이름 · 기간 */
  detail: string | null;
}

export function VisitSection({
  guest,
  occupancy,
  tenantContact,
  viewings,
  onOpenMatch,
  onBook,
  onAddTenant,
}: {
  guest: boolean;
  occupancy: Occupancy;
  tenantContact: { name: string; phone: string } | null;
  viewings: ViewingItem[];
  onOpenMatch: (matchId: string) => void;
  onBook: (() => void) | null;
  onAddTenant: () => void;
}) {
  return (
    <section id="visit">
      <H2
        title="집 보기"
        hint={guest ? null : '임장 잡을 때'}
        action={
          guest || !onBook ? null : (
            <button type="button" className={nb.line} onClick={onBook}>
              <CalendarPlus />
              임장 잡기
            </button>
          )
        }
      />
      <div className="mt-2.5 rounded-md shadow-[0_0_0_1px_#e9e9e7]">
        <div className="px-3.5 py-1">
          <VisitRow label="지금">
            <Tag tone={occupancy.tone} dot>
              {occupancy.label}
            </Tag>
            {!guest && occupancy.detail && (
              <span className="text-[13px] tabular-nums text-[#37352f]/65">{occupancy.detail}</span>
            )}
            {!guest && occupancy.tone === 'gray' && (
              <button type="button" className={cn(nb.ghost, 'h-6 text-[13px]')} onClick={onAddTenant}>
                세입자 추가
              </button>
            )}
          </VisitRow>
          {!guest && tenantContact && (
            <VisitRow
              label="세입자 연락"
              action={
                <a href={`tel:${tenantContact.phone}`} className={nb.icon} aria-label={`${tenantContact.name}에게 전화`}>
                  <Phone />
                </a>
              }
            >
              <span>{tenantContact.name}</span>
              <CopyPhone phone={tenantContact.phone} />
            </VisitRow>
          )}
        </div>
        {!guest && (
          <div className="border-t border-[#e9e9e7] px-3.5 pb-2.5 pt-2">
            <div className="text-[13px] font-semibold text-[#37352f]/65">다가오는 임장 {viewings.length}</div>
            {viewings.length === 0 ? (
              <div className="py-1.5 text-[13px] text-[#37352f]/45">
                {onBook ? '잡힌 임장이 없습니다' : '잡힌 임장이 없습니다. 임장은 아래 "손님 · 거래"에서 손님을 매칭한 뒤 잡습니다.'}
              </div>
            ) : (
              <ul>
                {viewings.map((viewing) => (
                  <li key={viewing.id}>
                    <button
                      type="button"
                      onClick={() => onOpenMatch(viewing.matchId)}
                      className="-mx-1.5 flex w-[calc(100%+12px)] items-center gap-2.5 rounded px-1.5 py-1.5 text-left text-[14px] transition-colors hover:bg-[#37352f]/[0.04]"
                    >
                      <span className="w-[128px] shrink-0 font-semibold tabular-nums">{viewing.whenText}</span>
                      <span className="truncate text-[#37352f]">{viewing.buyerName}</span>
                      <span className={cn('inline-flex h-5 items-center rounded-[3px] px-1.5 text-[13px]', viewing.typeClassName)}>
                        {viewing.typeLabel}
                      </span>
                      <span
                        className={cn(
                          'text-[13px] tabular-nums',
                          viewing.daysLeft <= 1 ? 'font-medium text-[rgb(203,107,31)]' : 'text-[#37352f]/45',
                        )}
                      >
                        {viewing.ddayText}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function VisitRow({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid min-h-[34px] grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-2 text-[14px] [&+&]:border-t [&+&]:border-[#37352f]/[0.06]">
      <span className="text-[13px] text-[#37352f]/65">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{children}</span>
      <span>{action}</span>
    </div>
  );
}

export function CopyPhone({ phone, className }: { phone: string; className?: string }) {
  const copy = async () => {
    try {
      // 보이는 모양 그대로(010-0000-0000) 복사한다 — 목록의 번호 복사와 같게
      const formatted = formatPhoneNumber(phone);
      await navigator.clipboard.writeText(formatted === '-' ? phone : formatted);
      toast.success('전화번호를 복사했습니다.');
    } catch {
      toast.error('복사하지 못했습니다.');
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title="눌러서 번호 복사"
      className={cn(
        '-mx-0.5 rounded-[3px] px-0.5 tabular-nums text-[#37352f]/65 transition-colors hover:bg-[#37352f]/[0.06] hover:text-[#37352f]',
        className,
      )}
    >
      {formatPhoneNumber(phone)}
    </button>
  );
}
