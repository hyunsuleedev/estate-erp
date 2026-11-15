import { Fragment, type ReactNode } from 'react';
import { Check, Eye, EyeOff, Loader2, NotebookPen, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HeaderSpec } from './brief-model';
import { Kbd, nb, Tag, type TagTone } from './ui';

/*
 * 고정 머리: 늘 보인다. 1줄 = 호실과 사양, 2줄 = 거래 조건 가격 · 확인 상태 · 자주 쓰는 작업.
 */

export interface PriceChip {
  id: string;
  typeLabel: string;
  typeClassName: string;
  priceText: string;
  status: { label: string; tone: TagTone } | null;
}

export interface ConfirmChip {
  label: string;
  tone: TagTone;
  sub: string | null;
}

export function TopHeader({
  siteName,
  unit,
  specs,
  guest,
  prices,
  confirm,
  ownerCall,
  confirmPending,
  onEditListing,
  onConfirmMenu,
  onConfirm,
  onFocusComposer,
  onToggleGuest,
  menu,
}: {
  siteName: string;
  unit: string | null;
  specs: HeaderSpec[];
  guest: boolean;
  prices: PriceChip[];
  confirm: ConfirmChip | null;
  ownerCall: { phone: string; name: string } | null;
  confirmPending: boolean;
  onEditListing: (listingId: string) => void;
  onConfirmMenu: () => void;
  onConfirm: (() => void) | null;
  onFocusComposer: () => void;
  onToggleGuest: () => void;
  menu: ReactNode;
}) {
  return (
    <header
      data-property-detail-header
      className="shrink-0 border-b border-[#e9e9e7] bg-white px-7 pb-3 pt-3.5"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px] font-bold leading-[1.3] tracking-[-0.022em] text-[#37352f]">
            {siteName}
            {unit && <span className="ml-2 tabular-nums">{unit}</span>}
          </h1>
          {specs.length > 0 && (
            <div data-property-facts className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[13px] text-[#37352f]/65">
              {specs.map((spec, index) => (
                <Fragment key={spec.key}>
                  {index > 0 && <span className="text-[#37352f]/25">·</span>}
                  <span className="tabular-nums">{spec.text}</span>
                </Fragment>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {guest ? (
            <button type="button" className={nb.line} onClick={onToggleGuest}>
              <EyeOff />
              보여주기 끄기
            </button>
          ) : (
            <>
              <button
                type="button"
                className={nb.ghost}
                onClick={onToggleGuest}
                title="연락처 · 내부 메모 · 다른 손님 · 기록 · 정확한 호수와 층을 가립니다"
              >
                <Eye />
                손님에게 보여주기
              </button>
              {menu}
            </>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
          {prices.map((chip, index) => (
            <Fragment key={chip.id}>
              {index > 0 && <span className="h-[18px] w-px bg-[#e9e9e7]" />}
              <button
                type="button"
                disabled={guest}
                onClick={() => onEditListing(chip.id)}
                title={guest ? undefined : '눌러서 가격·조건 수정'}
                className="-ml-1 inline-flex h-[30px] items-center gap-[7px] rounded pl-1 pr-2 text-[#37352f] transition-colors hover:bg-[#37352f]/[0.06] disabled:hover:bg-transparent"
              >
                <span className={cn('inline-flex h-5 items-center rounded-[3px] px-1.5 text-[13px]', chip.typeClassName)}>
                  {chip.typeLabel}
                </span>
                <b className="text-[17px] font-bold tabular-nums tracking-[-0.015em]">{chip.priceText}</b>
                {chip.status && (
                  <Tag tone={chip.status.tone} dot>
                    {chip.status.label}
                  </Tag>
                )}
              </button>
            </Fragment>
          ))}
          {prices.length === 0 && <span className="text-[13px] text-[#37352f]/45">거래 조건 없음</span>}
          {!guest && confirm && (
            <>
              <span className="h-[18px] w-px bg-[#e9e9e7]" />
              <button
                type="button"
                onClick={onConfirmMenu}
                title="확인 결과 기록"
                className="-ml-1 inline-flex h-[30px] items-center gap-1.5 rounded pl-1 pr-2 transition-colors hover:bg-[#37352f]/[0.06]"
              >
                <Tag tone={confirm.tone} dot>
                  {confirm.label}
                </Tag>
                {confirm.sub && <span className="text-[13px] text-[#37352f]/45">{confirm.sub}</span>}
              </button>
            </>
          )}
        </div>

        {!guest && (
          <div className="flex h-[30px] shrink-0 items-center gap-1">
            {ownerCall && (
              <a href={`tel:${ownerCall.phone}`} className={nb.ghost} title={`${ownerCall.name}에게 전화`}>
                <Phone />
                소유주 전화
              </a>
            )}
            {onConfirm && (
              <button
                type="button"
                className={nb.line}
                disabled={confirmPending}
                onClick={onConfirm}
                title="소유주에게 가격과 거래 가능 여부를 확인했으면 누르세요"
              >
                {confirmPending ? <Loader2 className="animate-spin" /> : <Check />}
                확인 완료
              </button>
            )}
            <button type="button" className={nb.solid} onClick={onFocusComposer}>
              <NotebookPen />
              상담 기록
              <Kbd>R</Kbd>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export function GuestBar({ onExit }: { onExit: () => void }) {
  return (
    <div
      data-guest-bar
      className="flex shrink-0 items-center gap-2.5 bg-[rgb(231,243,248)] px-7 py-2 text-[13px] text-[rgb(24,51,71)]"
    >
      <Eye className="size-[15px] shrink-0" />
      <span className="min-w-0">
        <b className="font-semibold">손님에게 보여주는 중</b> · 연락처, 내부 메모, 다른 손님, 기록, 정확한
        호수와 층을 가렸습니다.
      </span>
      <span className="flex-1" />
      <button type="button" className={cn(nb.line, 'bg-white')} onClick={onExit}>
        끄기
        <Kbd>Esc</Kbd>
      </button>
    </div>
  );
}
