import { getListingAvailability } from '@/lib/listing-status';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useInspectorFocus } from '@/hooks/use-inspector-focus';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Ban,
  ExternalLink,
  FilePlus2,
  FileText,
  Pencil,
  Phone,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Contact, Contract, Deal } from '@estate-erp/api-client';
import { normalizeDealStage } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { tabResourceKeys } from '@/features/tabs/lib/tabResource';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { cn } from '@/lib/utils';
import { formatArea, formatDate, formatMoney, formatPhone, formatRent } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  EntityChip,
  PipelineSteps,
  StatusBadge,
  InspectorTabs,
  inspectorTabIds,
  type InspectorTabItem,
} from '@/components/domain';
import {
  EmptyText,
  PropertyInspectorToolbar,
  SectionTitle as InspectorSectionTitle,
  TextAction,
} from '../properties/-components/property-inspector-view';
import { ContactPicker, DealActionsMenu, DealStagePill } from './-deal-shared';
import { DealCommissionSection } from './-deal-commission';
import { DealPaymentsSection } from './-deal-payments';
import {
  formatCancelledBy,
  formatDealAmount,
  formatNextPaymentLabel,
  getDealLocationLine,
  getDealPipelineHealth,
  getDealShortCode,
  getDealTitle,
  getDealTransactionType,
  getNextDealPaymentSummary,
  getNextDealStage,
  ourSideLabels,
  type DealRowActions,
} from './-deal-view-utils';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청 처리에 실패했습니다.';
}

function todayInput() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

const DEAL_INSPECTOR_MIN_WIDTH = 520;
const DEAL_INSPECTOR_MAX_WIDTH = 640;
const DEAL_INSPECTOR_DEFAULT_WIDTH = 584;

function clampInspectorWidth(value: number) {
  return Math.min(DEAL_INSPECTOR_MAX_WIDTH, Math.max(DEAL_INSPECTOR_MIN_WIDTH, value));
}

/** Esc가 패널이 아니라 떠 있는 대화상자·메뉴를 닫아야 하는 경우 */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="listbox"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

/**
 * 거래 상세 패널. 매물관리의 상세 패널(PropertyInspector)과 같은 방식으로 열린다:
 * 화면을 덮는 시트가 아니라 페이지 오른쪽에 붙는 패널이라, 열어 둔 채로 보드·목록을 계속 쓸 수 있다.
 * 미끄러져 들어오고 나가는 움직임은 app.css의 [data-property-inspector] 규칙을 그대로 쓴다.
 */
export function DealInspector({
  deal,
  contract,
  closing,
  animate,
  referenceDate,
  onClose,
  onExited,
  actions,
}: {
  deal: Deal;
  contract: Contract | null;
  closing: boolean;
  animate: boolean;
  referenceDate: Date;
  onClose: (animate?: boolean) => void;
  onExited: () => void;
  actions: DealRowActions;
}) {
  const [width, setWidth] = useState(DEAL_INSPECTOR_DEFAULT_WIDTH);
  const openOrRevealResource = useTabStore((state) => state.openOrRevealResource);
  // 매물관리 패널과 같다: 전체 화면을 새 탭으로 열고(이미 열려 있으면 그 탭으로 가고) 패널은 닫는다.
  const openInNewTab = () => {
    const route = `/deals/${deal.id}`;
    const meta = getRouteMeta(route);
    openOrRevealResource({
      route,
      kind: meta.kind,
      title: getDealTitle(deal) || meta.title,
      resourceKey: tabResourceKeys.entity('deal', deal.id),
    });
    onClose(false);
  };

  const panelRef = useRef<HTMLElement>(null);
  // 키보드로 열었을 때(미끄러짐 없이 열림)만 포커스를 패널로 옮긴다
  useInspectorFocus(panelRef, !animate, deal.id);

  useEffect(() => {
    if (!closing) return;
    // 숨은 탭이나 모션 줄이기 설정에서는 transitionend가 오지 않을 수 있다.
    const timer = window.setTimeout(
      onExited,
      !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240,
    );
    return () => window.clearTimeout(timer);
  }, [closing, animate, onExited]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      event.preventDefault();
      onClose(false);
    };
    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => window.removeEventListener('keydown', handleWindowKeyDown, true);
  }, [onClose]);

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      id="deal-inspector"
      data-deal-inspector
      data-property-inspector
      data-state={closing ? 'closed' : 'open'}
      data-motion={animate ? 'slide' : 'none'}
      inert={closing}
      aria-hidden={closing || undefined}
      aria-label="거래 상세 패널"
      className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col border-l border-border bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.03)] outline-none"
      style={{ width, maxWidth: '100%' }}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === 'transform') {
          onExited();
        }
      }}
    >
      <DealInspectorResizeHandle width={width} onResize={setWidth} />
      <DealDetailPanel
        key={deal.id}
        deal={deal}
        contract={contract}
        referenceDate={referenceDate}
        actions={actions}
        onClose={onClose}
        onOpenNewTab={openInNewTab}
      />
    </aside>
  );
}

function DealInspectorResizeHandle({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}) {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      onResize(clampInspectorWidth(startWidth + startX - pointerEvent.clientX));
    };
    const stopResizing = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      cleanupRef.current = null;
    };
    cleanupRef.current?.();
    cleanupRef.current = stopResizing;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing, { once: true });
  };

  return (
    <div
      role="separator"
      aria-label="상세 패널 너비 조절"
      aria-orientation="vertical"
      aria-valuemin={DEAL_INSPECTOR_MIN_WIDTH}
      aria-valuemax={DEAL_INSPECTOR_MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      className="group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none outline-none"
      onPointerDown={handlePointerDown}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onResize(clampInspectorWidth(width + 24));
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onResize(clampInspectorWidth(width - 24));
        }
      }}
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-[#6c9b7a] group-focus-visible:bg-[#6c9b7a]" />
    </div>
  );
}

type DealInspectorTab = 'summary' | 'people' | 'payments' | 'commission';

const TRANSACTION_CHIP: Record<string, string> = {
  sale: 'bg-[#fdebec] text-[#8f4b46]',
  jeonse: 'bg-[#e7f3f8] text-[#337ea9]',
  monthly: 'bg-[#fbf3db] text-[#8f6b1f]',
};

/** 머리 영역의 작은 상태 칩 (매물 상세 패널의 StatusChip과 같은 모양) */
function HeaderChip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 이름 14칸 + 값. 매물 상세 패널의 "매물 정보" 줄과 같은 모양이다. */
function FactRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex min-w-0 items-baseline gap-3">
      <dt className="w-16 shrink-0 text-[12.5px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate text-[13px]',
          value ? 'font-medium tabular-nums text-[#2f2e2a]' : 'text-[#c9c7c1]',
        )}
      >
        {value || '-'}
      </dd>
    </div>
  );
}

/**
 * 거래 상세의 내용. 오른쪽 패널(DealInspector)과 전체 화면(/deals/$id)이 같이 쓴다.
 * 전체 화면에서는 닫을 패널이 없으므로 onClose를 주지 않고, 위 막대에는 작업 메뉴만 남는다.
 */
export function DealDetailPanel({
  deal,
  contract,
  referenceDate,
  actions,
  onClose,
  onOpenNewTab,
}: {
  deal: Deal;
  contract: Contract | null;
  referenceDate: Date;
  actions: DealRowActions;
  onClose?: (animate?: boolean) => void;
  /** 전체 화면을 새 탭으로 연다 (패널에서만) */
  onOpenNewTab?: () => void;
}) {
  const transactionType = getDealTransactionType(deal);
  const nextPayment = getNextDealPaymentSummary(deal, referenceDate);
  const pipelineHealth = getDealPipelineHealth(deal, referenceDate);
  const participantNames = [
    ...new Set((deal.participants ?? []).map((participant) => participant.user.name)),
  ];
  const currentStage = normalizeDealStage(deal.stage);
  const nextStage = getNextDealStage(currentStage);
  const canSkipPreContract = currentStage === 'preparing';
  const canCreateContract = ['contracted', 'settling', 'completed', 'closed'].includes(currentStage);
  const billed = deal.commissionSummary?.billed ?? 0;
  const [tab, setTab] = useState<DealInspectorTab>('summary');
  const [termsOpen, setTermsOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);

  const priceLabel =
    transactionType === 'sale'
      ? '매매가'
      : transactionType === 'jeonse'
        ? '전세금'
        : '합의 가격';
  const nextActions = getNextActions(deal.isCancelled ? 'cancelled' : deal.stage);
  const tabs: Array<InspectorTabItem<DealInspectorTab>> = [
    { value: 'summary', label: '요약' },
    { value: 'people', label: '매물·당사자' },
    { value: 'payments', label: '대금·계약', count: deal.payments?.length },
    { value: 'commission', label: '수수료' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {onClose ? (
        <PropertyInspectorToolbar
          onClose={onClose}
          onOpenNewTab={onOpenNewTab}
          headerActions={<DealActionsMenu deal={deal} actions={actions} />}
        />
      ) : (
        <div className="flex h-11 shrink-0 items-center justify-end px-3">
          <DealActionsMenu deal={deal} actions={actions} />
        </div>
      )}

      {/* 머리 영역: 거래 이름 → 주소 → 금액 → 상태 */}
      <div className="shrink-0 px-6 pb-4">
        <h2 className="text-[23px] font-bold leading-[1.25] tracking-[-0.025em] text-[#2f2e2a]">
          {getDealTitle(deal)}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
          <span>{getDealLocationLine(deal)}</span>
          <span className="text-[#c9c7c1]">·</span>
          <span className="font-mono text-[11.5px] text-[#a9a7a1]">{getDealShortCode(deal.id)}</span>
        </div>

        <div className="mt-4 flex min-w-0 items-center gap-2.5">
          {transactionType ? (
            <span
              className={cn(
                'inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11.5px] font-semibold',
                TRANSACTION_CHIP[transactionType] ?? 'bg-[#f1f1ef] text-[#787774]',
              )}
            >
              {getStatusMeta('transactionType', transactionType).label}
            </span>
          ) : null}
          <span className="min-w-0 truncate text-[20px] font-bold leading-none tracking-[-0.025em] tabular-nums text-[#2f2e2a]">
            {formatDealAmount(deal)}
          </span>
          {billed ? (
            <span className="shrink-0 text-[12.5px] text-muted-foreground">
              예상 수수료 {formatMoney(billed)}
            </span>
          ) : null}
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <DealStagePill stage={currentStage} />
          {deal.isJointBrokerage ? (
            <HeaderChip className="bg-[#f1f1ef] text-[#5f5e5b]">공동중개</HeaderChip>
          ) : null}
          {deal.isCancelled ? (
            <HeaderChip className="bg-[#fdebec] text-[#8f4b46]">취소됨</HeaderChip>
          ) : pipelineHealth.isAtRisk ? (
            <HeaderChip
              className={
                pipelineHealth.state === 'overdue'
                  ? 'bg-[#fdebec] text-[#8f4b46]'
                  : pipelineHealth.state === 'stale'
                    ? 'bg-[#fbf3db] text-[#9f6b00]'
                    : 'bg-[#f1f1ef] text-[#5f5e5b]'
              }
            >
              {pipelineHealth.label}
            </HeaderChip>
          ) : null}
        </div>
      </div>

      <InspectorTabs
        idPrefix="deal-inspector"
        ariaLabel="거래 상세 구역"
        tabs={tabs}
        value={tab}
        onChange={setTab}
      />

      <div
        role="tabpanel"
        id={inspectorTabIds('deal-inspector', tab).panel}
        aria-labelledby={inspectorTabIds('deal-inspector', tab).tab}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {tab === 'summary' && (
          <div className="space-y-7">
            {deal.isCancelled ? (
              <section>
                <InspectorSectionTitle>취소된 거래</InspectorSectionTitle>
                <dl className="space-y-2.5">
                  <FactRow label="취소일" value={deal.cancelledAt ? formatDate(deal.cancelledAt) : null} />
                  <FactRow label="취소 주체" value={formatCancelledBy(deal.cancelledBy)} />
                  <FactRow label="사유" value={deal.cancelReason} />
                </dl>
              </section>
            ) : null}

            <section>
              <InspectorSectionTitle count={nextActions.length}>지금 할 일</InspectorSectionTitle>
              <ul className="divide-y divide-[#f1f0ec]">
                {nextActions.map((action) => (
                  <li key={action} className="flex min-h-9 items-center gap-2.5 py-1.5 text-[13px] text-[#2f2e2a]">
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[#529cca]" />
                    {action}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <InspectorSectionTitle>진행 상황</InspectorSectionTitle>
              <PipelineSteps kind="dealStage" current={currentStage} cancelled={deal.isCancelled} />
              <dl className="mt-3.5 grid grid-cols-2 gap-x-6 gap-y-2.5">
                <FactRow
                  label="현 단계"
                  value={`${pipelineHealth.stageAgeDays}일째${
                    pipelineHealth.targetDays > 0 ? ` / 목표 ${pipelineHealth.targetDays}일` : ''
                  }`}
                />
                <FactRow label="단계 변경" value={formatDate(deal.stageChangedAt)} />
                <FactRow label="다음 일정" value={formatNextPaymentLabel(nextPayment)} />
                <FactRow label="진행 상태" value={pipelineHealth.description} />
              </dl>
            </section>

            <section>
              <InspectorSectionTitle
                action={
                  <TextAction icon={<Pencil />} label="조건 수정" onClick={() => setTermsOpen(true)} />
                }
              >
                합의 조건
              </InspectorSectionTitle>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                <FactRow
                  label={priceLabel}
                  value={deal.agreedPrice != null ? formatMoney(deal.agreedPrice) : null}
                />
                {transactionType === 'monthly' ? (
                  <FactRow
                    label="보증금"
                    value={deal.agreedDeposit != null ? formatMoney(deal.agreedDeposit) : null}
                  />
                ) : null}
                {transactionType === 'monthly' ? (
                  <FactRow
                    label="월세"
                    value={deal.agreedMonthlyRent != null ? formatMoney(deal.agreedMonthlyRent) : null}
                  />
                ) : null}
                <FactRow
                  label="입주 예정"
                  value={deal.agreedMoveInDate ? formatDate(deal.agreedMoveInDate) : null}
                />
              </dl>
            </section>

            <section>
              <InspectorSectionTitle>특약사항</InspectorSectionTitle>
              {deal.specialTerms ? (
                <p className="whitespace-pre-line text-[13px] leading-[1.6] text-[#2f2e2a]">
                  {deal.specialTerms}
                </p>
              ) : (
                <EmptyText>등록된 특약사항이 없습니다.</EmptyText>
              )}
            </section>

            <section>
              <InspectorSectionTitle>메모</InspectorSectionTitle>
              {deal.memo ? (
                <p className="whitespace-pre-line text-[13px] leading-[1.6] text-[#2f2e2a]">{deal.memo}</p>
              ) : (
                <EmptyText>등록된 메모가 없습니다.</EmptyText>
              )}
            </section>
          </div>
        )}

        {tab === 'people' && (
          <div className="space-y-7">
            <section>
              <InspectorSectionTitle>매물</InspectorSectionTitle>
              {deal.propertyId ? (
                <div className="space-y-2">
                  <EntityChip
                    kind="property"
                    id={deal.propertyId}
                    label={getDealTitle(deal)}
                    sublabel={
                      deal.property?.unit?.exclusiveAreaM2
                        ? formatArea(deal.property.unit.exclusiveAreaM2)
                        : undefined
                    }
                  />
                  {deal.listing ? (
                    <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                      호가{' '}
                      {deal.listing.transactionType === 'monthly'
                        ? formatRent(deal.listing.deposit, deal.listing.monthlyRent)
                        : formatMoney(deal.listing.price ?? deal.listing.deposit)}
                      <span className="text-[#c9c7c1]">·</span>
                      <StatusBadge
                        kind="listingAvailability"
                        status={getListingAvailability(deal.listing)}
                        size="sm"
                      />
                    </p>
                  ) : null}
                </div>
              ) : (
                <EmptyText>연결된 매물이 없습니다. (매물 없이 생성된 거래)</EmptyText>
              )}
            </section>

            <section>
              <InspectorSectionTitle>당사자</InspectorSectionTitle>
              <div className="divide-y divide-[#f1f0ec]">
                <PartyDetailRow label="매도" contact={deal.sellerContact ?? null} />
                <PartyDetailRow label="매수" contact={deal.buyerContact ?? null} />
              </div>
            </section>

            <section>
              <InspectorSectionTitle count={participantNames.length || undefined}>
                담당 직원
              </InspectorSectionTitle>
              {participantNames.length ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-[#2f2e2a]">
                  {participantNames.map((participantName) => (
                    <span key={participantName} className="inline-flex items-center gap-1.5">
                      <UserRound className="size-3.5 text-[#a9a7a1]" aria-hidden="true" />
                      {participantName}
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyText>배정된 담당 직원이 없습니다.</EmptyText>
              )}
            </section>

            <section>
              <InspectorSectionTitle>공동중개</InspectorSectionTitle>
              {deal.isJointBrokerage ? (
                <>
                  <div className="flex min-h-11 items-center gap-3 py-1.5">
                    <span className="w-16 shrink-0 text-[12.5px] text-muted-foreground">파트너</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[#2f2e2a]">
                        {deal.partnerBroker?.name ?? '파트너 미지정'}
                      </p>
                      {deal.partnerBroker?.phone ? (
                        <p className="text-[12px] tabular-nums text-[#a9a7a1]">
                          {formatPhone(deal.partnerBroker.phone)}
                        </p>
                      ) : null}
                    </div>
                    {deal.partnerBroker?.phone ? (
                      <a
                        href={`tel:${deal.partnerBroker.phone}`}
                        aria-label="파트너 전화"
                        className="inline-grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
                      >
                        <Phone className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                  <dl className="mt-1">
                    <FactRow label="우리 담당" value={ourSideLabels[deal.ourSide ?? 'both'] ?? '양측'} />
                  </dl>
                </>
              ) : (
                <EmptyText>단독중개 거래입니다.</EmptyText>
              )}
            </section>
          </div>
        )}

        {tab === 'payments' && (
          <div className="space-y-7">
            <section>
              <DealPaymentsSection deal={deal} referenceDate={referenceDate} />
            </section>

            <section>
              <InspectorSectionTitle
                action={
                  contract ? (
                    <Link
                      to="/contracts"
                      className="inline-flex items-center gap-1 text-[12px] font-normal text-muted-foreground hover:text-foreground"
                    >
                      계약 관리에서 열기
                      <ExternalLink className="size-3" />
                    </Link>
                  ) : canCreateContract && !deal.isCancelled ? (
                    <TextAction
                      icon={<FilePlus2 />}
                      label="계약서 작성"
                      onClick={() => setContractOpen(true)}
                    />
                  ) : undefined
                }
              >
                계약 요약
              </InspectorSectionTitle>
              {contract ? (
                <>
                  <div className="mb-3 flex items-center gap-2 text-[13px] text-[#2f2e2a]">
                    <FileText className="size-3.5 text-[#a9a7a1]" aria-hidden="true" />
                    계약서 연결됨
                    <StatusBadge kind="contractStatus" status={contract.status} size="sm" />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                    <FactRow
                      label="계약일"
                      value={contract.contractDate ? formatDate(contract.contractDate) : null}
                    />
                    <FactRow
                      label="총 거래금액"
                      value={contract.totalPrice != null ? formatMoney(contract.totalPrice) : null}
                    />
                    <FactRow
                      label="잔금일"
                      value={contract.statedBalanceDate ? formatDate(contract.statedBalanceDate) : null}
                    />
                    {contract.leaseStartDate || contract.leaseEndDate ? (
                      <FactRow
                        label="임대기간"
                        value={`${contract.leaseStartDate ? formatDate(contract.leaseStartDate) : '—'} ~ ${contract.leaseEndDate ? formatDate(contract.leaseEndDate) : '—'}`}
                      />
                    ) : null}
                  </dl>
                </>
              ) : (
                <EmptyText>
                  아직 계약서가 없습니다.{' '}
                  {canCreateContract
                    ? '중도금/잔금 단계로 진행하기 전에 계약서를 작성해 주세요.'
                    : '본계약 단계로 이동한 뒤 계약서를 작성할 수 있습니다.'}
                </EmptyText>
              )}
            </section>
          </div>
        )}

        {/* 수수료 구역은 고른 계산 기준을 자기 안에 들고 있다. 탭을 옮겨도 그 값이
            남도록 떼어 내지 않고 숨기기만 한다. */}
        <div className="space-y-4" hidden={tab !== 'commission'}>
          <DealCommissionSection key={deal.id} deal={deal} />
        </div>
      </div>

      {/* 아래 막대: 다음 단계로 넘기는 동작 (매물 상세 패널의 "매물 확인 완료" 자리) */}
      {!deal.isCancelled ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-[#ecebe8] px-6 py-3">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
            onClick={() => actions.onRequestCancel(deal)}
          >
            <Ban className="size-3.5" />
            거래 취소
          </button>
          {canSkipPreContract ? (
            <button
              type="button"
              disabled={actions.isUpdating}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground disabled:opacity-50"
              onClick={() => actions.onRequestStage(deal, 'contracted')}
            >
              가계약 없이 본계약
            </button>
          ) : null}
          {nextStage ? (
            <button
              type="button"
              disabled={actions.isUpdating}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full bg-[#2f2e2a] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1f1e1b] disabled:opacity-50',
                !canSkipPreContract && 'ml-auto',
              )}
              onClick={() => actions.onRequestStage(deal, nextStage)}
            >
              다음: {getStatusMeta('dealStage', nextStage).label}
              <ArrowRight className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      <EditTermsDialog deal={deal} open={termsOpen} onOpenChange={setTermsOpen} />
      <CreateContractDialog deal={deal} open={contractOpen} onOpenChange={setContractOpen} />
    </div>
  );
}

function PartyDetailRow({ label, contact }: { label: string; contact: Contact | null }) {
  return (
    <div className="flex min-h-11 items-center gap-3 py-1.5">
      <span className="w-16 shrink-0 text-[12.5px] text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">
        {contact ? (
          <EntityChip
            kind="contact"
            id={contact.id}
            label={contact.name}
            sublabel={formatPhone(contact.phone)}
          />
        ) : (
          <span className="text-[13px] text-[#c9c7c1]">미지정</span>
        )}
      </div>
      {contact?.phone ? (
        <a
          href={`tel:${contact.phone}`}
          aria-label={`${contact.name} 전화`}
          className="inline-grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
        >
          <Phone className="size-3.5" />
        </a>
      ) : null}
    </div>
  );
}

/**
 * 합의 조건 수정 — 서버에 일반 PATCH /deals/:id 가 없어
 * PATCH /deals/:id/stage(동일 stage 유지)로 가격/메모만 갱신한다.
 */
function EditTermsDialog({
  deal,
  open,
  onOpenChange,
}: {
  deal: Deal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const transactionType = getDealTransactionType(deal);
  const [price, setPrice] = useState(deal.agreedPrice != null ? String(deal.agreedPrice) : '');
  const [deposit, setDeposit] = useState(deal.agreedDeposit != null ? String(deal.agreedDeposit) : '');
  const [monthlyRent, setMonthlyRent] = useState(
    deal.agreedMonthlyRent != null ? String(deal.agreedMonthlyRent) : '',
  );
  const [memo, setMemo] = useState(deal.memo ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      api.deals.updateStage(deal.id, {
        stage: deal.stage,
        agreedPrice: price ? Number(price) : undefined,
        agreedDeposit: deposit ? Number(deposit) : undefined,
        agreedMonthlyRent: monthlyRent ? Number(monthlyRent) : undefined,
        memo: memo || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deals'] });
      void queryClient.invalidateQueries({ queryKey: ['commission-payments'] });
      toast.success('합의 조건이 저장되었습니다.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const showPrice = transactionType !== 'monthly';
  const showDeposit = transactionType === 'monthly';
  const showMonthlyRent = transactionType === 'monthly';
  const priceLabel =
    transactionType === 'sale'
      ? '매매가 (만원)'
      : transactionType === 'jeonse'
        ? '전세금 (만원)'
        : '합의 가격 (만원)';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>합의 조건 수정</DialogTitle>
          <DialogDescription>
            금액은 만원 단위입니다. 당사자·특약 변경은 거래 수정 API가 준비되면 지원됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {showPrice ? (
            <div className="grid gap-1.5">
              <Label>{priceLabel}</Label>
              <Input type="number" min={0} value={price} onChange={(event) => setPrice(event.target.value)} />
              {Number(price) > 0 ? (
                <p className="text-xs text-muted-foreground">= {formatMoney(Number(price))}</p>
              ) : null}
            </div>
          ) : null}
          {showDeposit ? (
            <div className="grid gap-1.5">
              <Label>보증금 (만원)</Label>
              <Input type="number" min={0} value={deposit} onChange={(event) => setDeposit(event.target.value)} />
            </div>
          ) : null}
          {showMonthlyRent ? (
            <div className="grid gap-1.5">
              <Label>월세 (만원)</Label>
              <Input
                type="number"
                min={0}
                value={monthlyRent}
                onChange={(event) => setMonthlyRent(event.target.value)}
              />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label>메모</Label>
            <Textarea rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 본계약 단계의 Deal 컨텍스트에서 계약서를 바로 생성한다. */
function CreateContractDialog({
  deal,
  open,
  onOpenChange,
}: {
  deal: Deal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const transactionType = getDealTransactionType(deal);
  const [contractDate, setContractDate] = useState(todayInput());
  const [totalPrice, setTotalPrice] = useState(() => {
    const initial = deal.agreedPrice ?? deal.agreedDeposit;
    return initial != null ? String(initial) : '';
  });
  const [buyer, setBuyer] = useState<Contact | null>(deal.buyerContact ?? null);
  const [seller, setSeller] = useState<Contact | null>(deal.sellerContact ?? null);

  const mutation = useMutation({
    mutationFn: () =>
      api.contracts.create({
        dealId: deal.id,
        transactionType: transactionType ?? undefined,
        buyerContactId: buyer?.id,
        sellerContactId: seller?.id,
        totalPrice: totalPrice ? Number(totalPrice) : undefined,
        monthlyRent: deal.agreedMonthlyRent ?? undefined,
        contractDate: contractDate || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
      void queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('계약서가 생성되었습니다. 이제 중도금/잔금 단계로 진행할 수 있습니다.');
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const valid = Boolean(buyer && seller && Number(totalPrice) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>계약서 작성</DialogTitle>
          <DialogDescription>
            기본 정보로 계약서를 생성합니다. 대금 일정·특약 등 상세는 계약 관리 화면에서 이어서 작성하세요.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>매도인 (임대인) *</Label>
            <ContactPicker value={seller} onChange={setSeller} />
          </div>
          <div className="grid gap-1.5">
            <Label>매수인 (임차인) *</Label>
            <ContactPicker value={buyer} onChange={setBuyer} />
          </div>
          <div className="grid gap-1.5">
            <Label>총 거래금액 (만원) *</Label>
            <Input
              type="number"
              min={1}
              value={totalPrice}
              onChange={(event) => setTotalPrice(event.target.value)}
            />
            {Number(totalPrice) > 0 ? (
              <p className="text-xs text-muted-foreground">= {formatMoney(Number(totalPrice))}</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label>계약일</Label>
            <Input type="date" value={contractDate} onChange={(event) => setContractDate(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button type="button" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            계약서 생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getNextActions(stage: string) {
  if (stage === 'cancelled') {
    return ['취소 사유 기록 확인', '수수료 청구 취소/조정 확인', '관련 일정 정리'];
  }
  if (normalizeDealStage(stage) === 'preparing') {
    return ['최종 합의 조건 확인', '계약 당사자·필요 서류 확인', '가계약 여부와 본계약 일정 결정'];
  }
  if (stage === 'preContract') {
    return ['가계약금 입금 확인', '본계약 일정 확정', '계약 필요 서류 안내'];
  }
  if (stage === 'contracted') {
    return ['계약서 서명·날인', '계약금 입금 확인', '중도금 일정 캘린더 등록', '확인설명서 교부'];
  }
  if (stage === 'settling') {
    return ['잔금 일정 재확인', '등기·인도 준비 상태 점검', '수수료 청구 상태 확인'];
  }
  if (stage === 'completed') {
    return ['수수료 수금 확인', '직원 배분 정산', '거래 자료 보관'];
  }
  return ['거래 상태 확인', '후속 업무 정리'];
}
