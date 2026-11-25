import { getListingAvailability } from '@/lib/listing-status';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useInspectorFocus } from '@/hooks/use-inspector-focus';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  Ban,
  ExternalLink,
  FilePlus2,
  FileText,
  Handshake,
  Pencil,
  Phone,
  RotateCcw,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Contact, DealContract as Contract, Deal, DealListItem } from '@estate-erp/api-client';
import { normalizeDealStage } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { apiErrorMessage } from '@/lib/api-error';
import { invalidateListingDerivedCaches } from '@/lib/listing-cache';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  AssigneeSelect,
  ContactPicker,
  type PickedContact,
  DateQuickInput,
  DealActionsMenu,
  DealStagePill,
  isoToDateInput,
  ManwonInput,
  PartnerBrokerSelect,
} from './-deal-shared';
import { DealCommissionSection } from './-deal-commission';
import {
  isUnconfirmedContactName,
  UNCONFIRMED_CONTACT_MESSAGE,
} from '../contracts/-contract-shared';
import { DealPaymentsSection } from './-deal-payments';
import {
  formatCancelledBy,
  formatDaysLabel,
  formatShortDate,
  formatDealAmount,
  formatNextPaymentLabel,
  getDealLocationLine,
  getDealPipelineHealth,
  getDealTitle,
  getDealTransactionType,
  getNextDealPaymentSummary,
  getNextDealStage,
  getOurSideLabel,
  type DealRowActions,
  getPartyLabels,
} from './-deal-view-utils';
import { useInspectorOutsideClose } from '@/hooks/use-inspector-outside-close';

function getErrorMessage(error: unknown, fallback = '요청을 처리하지 못했습니다. 다시 시도해 주세요.') {
  return apiErrorMessage(error, fallback);
}

function todayInput() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

const DEAL_INSPECTOR_MIN_WIDTH = 440;
const DEAL_INSPECTOR_MAX_WIDTH = 640;
const DEAL_INSPECTOR_DEFAULT_WIDTH = 584;

/** 작은 창(1100px 노트북)에서 패널이 목록을 다 가리지 않게, 처음 폭은 창의 40% 안으로 둔다 */
function initialInspectorWidth() {
  if (typeof window === 'undefined') return DEAL_INSPECTOR_DEFAULT_WIDTH;
  return clampInspectorWidth(Math.min(DEAL_INSPECTOR_DEFAULT_WIDTH, Math.round(window.innerWidth * 0.4)));
}

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
  const [width, setWidth] = useState(initialInspectorWidth);
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

  // 패널 밖을 누르면 닫는다 (떠 있는 창 · 줄의 열기 단추는 밖이 아니다)
  useInspectorOutsideClose(() => onClose());

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
  // 담당은 맡은 비중이 있는 사람이다 (직원 정산 대상). 비중이 하나도 없던 옛 거래는 배정된 사람을 보인다.
  const sharingParticipants = (deal.participants ?? []).filter((participant) => participant.sharePercent != null);
  const participantNames = [
    ...new Set(
      (sharingParticipants.length ? sharingParticipants : (deal.participants ?? [])).map(
        (participant) => participant.user.name,
      ),
    ),
  ];
  const { user } = useAuth();
  const canChooseAssignee = user?.role === 'owner' || user?.role === 'manager';
  const currentStage = normalizeDealStage(deal.stage);
  const isDone = currentStage === 'completed' || currentStage === 'closed';
  // 잔금 완료 다음은 정산 종료다 (진행 단계 띠에는 없지만 아래 막대의 다음 단추로 넘긴다)
  const nextStage = currentStage === 'completed' ? 'closed' : getNextDealStage(currentStage);
  const canSkipPreContract = currentStage === 'preparing';
  const canCreateContract = ['contracted', 'settling', 'completed', 'closed'].includes(currentStage);
  const billed = deal.commissionSummary?.billed ?? 0;
  const [tab, setTab] = useState<DealInspectorTab>('summary');
  const [paymentAddRequest, setPaymentAddRequest] = useState<{ seq: number; kind?: string } | null>(null);
  const navigateToContract = useNavigate();
  const [termsOpen, setTermsOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  // 계약서 없이 중도금/잔금 이후로 넘기려 하면 계약서 작성부터 열고, 만든 뒤 그 단계로 넘긴다
  const [contractAdvanceStage, setContractAdvanceStage] = useState<string | null>(null);
  const nextNeedsContract = Boolean(
    nextStage && ['settling', 'completed', 'closed'].includes(nextStage) && !contract,
  );

  const priceLabel =
    transactionType === 'sale'
      ? '매매가'
      : transactionType === 'jeonse'
        ? '전세금'
        : '합의 가격';
  const nextActions = getNextActions(deal, contract, nextPayment);
  // 대금 일정의 잔금일 (계약서에 잔금일이 비어 있을 때 계약 요약에 보인다)
  const dealBalanceDate =
    (deal.payments ?? [])
      .filter((payment) => payment.kind === 'balance' && payment.status !== 'cancelled' && payment.scheduledDate)
      .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))[0]?.scheduledDate ?? null;
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
        // 전체 화면(새 탭): 위 얇은 줄에 어디인지(거래관리 / 이 거래)와 돌아갈 길을 둔다
        <div className="flex h-11 shrink-0 items-center gap-1 px-3">
          <nav aria-label="위치" className="flex min-w-0 flex-1 items-center gap-0.5 text-[13px]">
            <Link
              to="/deals"
              search={{ dealId: deal.id }}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
            >
              <Handshake className="size-3.5" />
              거래관리
            </Link>
            <span className="text-[#37352f]/25">/</span>
            <span className="min-w-0 truncate px-2 text-[#37352f]" title={getDealTitle(deal)}>
              {getDealTitle(deal)}
            </span>
          </nav>
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
          {billed && !deal.isCancelled ? (
            <span className="shrink-0 text-[12.5px] text-muted-foreground">
              {/* 끝난 거래는 예상이 아니라 정해진 수수료다 */}
              {isDone ? '수수료' : '예상 수수료'} {formatMoney(billed)}
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
                  <FactRow label="취소 주체" value={formatCancelledBy(deal.cancelledBy, transactionType)} />
                  <FactRow label="사유" value={deal.cancelReason} />
                </dl>
              </section>
            ) : null}

            <section>
              <InspectorSectionTitle count={nextActions.length}>지금 할 일</InspectorSectionTitle>
              <ul className="divide-y divide-[#f1f0ec]">
                {nextActions.map((action) => {
                  const go = action.go;
                  // 계약서 작성은 본계약 단계부터 된다. 그 전에는 눌러도 갈 곳이 없으니 글로만 둔다.
                  const actionable =
                    go !== undefined &&
                    !(go === 'contract' && (!canCreateContract || deal.isCancelled)) &&
                    !(go === 'openContract' && !contract) &&
                    !(go === 'addPayment' && deal.isCancelled) &&
                    !(go === 'terms' && deal.isCancelled);
                  const content = (
                    <>
                      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[#529cca]" />
                      <span className="min-w-0 flex-1">{action.label}</span>
                      {actionable ? (
                        <ArrowRight className="size-3.5 shrink-0 text-[#a9a7a1] transition-colors group-hover:text-foreground" />
                      ) : null}
                    </>
                  );
                  return (
                    <li key={action.label}>
                      {actionable ? (
                        <button
                          type="button"
                          className="group flex min-h-9 w-full items-center gap-2.5 rounded-sm py-1.5 text-left text-[13px] text-[#2f2e2a] hover:bg-[rgba(55,53,47,0.04)]"
                          onClick={() => {
                            if (go === 'contract') {
                              setContractAdvanceStage(null);
                              setContractOpen(true);
                            } else if (go === 'openContract') {
                              if (contract) {
                                void navigateToContract({
                                  to: '/contracts',
                                  search: { editorContractId: contract.id },
                                });
                              }
                            } else if (go === 'addPayment') {
                              setTab('payments');
                              setPaymentAddRequest((previous) => ({
                                seq: (previous?.seq ?? 0) + 1,
                                kind: action.kind,
                              }));
                            } else if (go === 'terms') {
                              setTermsOpen(true);
                            } else if (go) {
                              setTab(go);
                            }
                          }}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="flex min-h-9 items-center gap-2.5 py-1.5 text-[13px] text-[#2f2e2a]">{content}</div>
                      )}
                    </li>
                  );
                })}
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
                <FactRow label="다음 일정" value={formatNextPaymentLabel(nextPayment, deal)} />
                <FactRow
                  label="진행 상태"
                  value={deal.isCancelled ? '취소됨' : pipelineHealth.description}
                />
              </dl>
            </section>

            <section>
              <InspectorSectionTitle
                action={
                  // 취소한 거래는 조건을 고치지 않는다 (서버도 막는다). 되살린 뒤에 고친다.
                  deal.isCancelled ? undefined : (
                    <TextAction icon={<Pencil />} label="조건 수정" onClick={() => setTermsOpen(true)} />
                  )
                }
              >
                합의 조건
              </InspectorSectionTitle>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                {transactionType !== 'monthly' ? (
                  <FactRow
                    label={priceLabel}
                    value={(() => {
                      const price =
                        deal.agreedPrice ?? (transactionType === 'jeonse' ? deal.agreedDeposit : null);
                      return price != null ? formatMoney(price) : null;
                    })()}
                  />
                ) : null}
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
                <EmptyText>매물 없이 만든 거래입니다. (다른 사무소 매물 공동중개 등)</EmptyText>
              )}
            </section>

            <section>
              <InspectorSectionTitle>당사자</InspectorSectionTitle>
              <div className="divide-y divide-[#f1f0ec]">
                <PartyDetailRow label={getPartyLabels(transactionType).seller} contact={deal.sellerContact ?? null} />
                <PartyDetailRow label={getPartyLabels(transactionType).buyer} contact={deal.buyerContact ?? null} />
              </div>
            </section>

            {isDone && !deal.isCancelled && deal.propertyId ? (
              <DealPropertyTransitionSection dealId={deal.id} />
            ) : null}

            <section>
              <InspectorSectionTitle count={participantNames.length || undefined}>
                담당 직원
              </InspectorSectionTitle>
              {/* 대표·매니저가 한 사람 담당을 바꿀 수 있으면 고르는 칸이 이름을 보여 준다 (비었을 때의 안내도 그 칸이 한다) */}
              {canChooseAssignee && sharingParticipants.length <= 1 && !deal.isCancelled ? (
                <DealAssigneeEditor deal={deal} />
              ) : (
                <>
                  <DealAssigneeEditor deal={deal} />
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
                </>
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
                    <FactRow label="우리 담당" value={getOurSideLabel(deal.ourSide, transactionType)} />
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
              <DealPaymentsSection
                deal={deal}
                contract={contract}
                referenceDate={referenceDate}
                addRequest={paymentAddRequest}
              />
            </section>

            <section>
              <InspectorSectionTitle
                action={
                  contract ? (
                    <Link
                      to="/contracts"
                      search={{ editorContractId: contract.id }}
                      className="inline-flex items-center gap-1 text-[12px] font-normal text-muted-foreground hover:text-foreground"
                    >
                      계약서 열기
                      <ExternalLink className="size-3" />
                    </Link>
                  ) : canCreateContract && !deal.isCancelled ? (
                    <TextAction
                      icon={<FilePlus2 />}
                      label="계약서 작성"
                      onClick={() => {
                        setContractAdvanceStage(null);
                        setContractOpen(true);
                      }}
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
                  {isDone && isContractStillDrafting(contract) ? (
                    <p className="mb-3 text-[12.5px] text-warning">
                      거래는 끝났는데 계약서가 아직 작성 중입니다. 계약서 열기에서 상태를 정리해 주세요.
                    </p>
                  ) : null}
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
                      value={
                        contract.statedBalanceDate
                          ? formatDate(contract.statedBalanceDate)
                          : dealBalanceDate
                            ? // 계약서에 잔금일이 없으면(계약서를 만든 뒤 잔금 일정을 넣은 경우) 바로 위 대금 일정의 값을 보인다
                              `${formatDate(dealBalanceDate)} (대금 일정)`
                            : null
                      }
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
      {deal.isCancelled && actions.onRequestRestore ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-[#ecebe8] px-6 py-3">
          <span className="text-[12.5px] text-muted-foreground">취소된 거래입니다.</span>
          <button
            type="button"
            disabled={actions.isUpdating}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-[#2f2e2a] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1f1e1b] disabled:opacity-50"
            onClick={() => actions.onRequestRestore?.(deal)}
          >
            <RotateCcw className="size-3.5" />
            거래 되살리기
          </button>
        </div>
      ) : null}
      {!deal.isCancelled && (nextStage || !isDone) ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-[#ecebe8] px-6 py-3">
          {/* 끝난 거래(잔금 완료·정산 종료)에서는 취소를 아래 막대에 두지 않는다. 바로잡을 일이 있으면 ⋮ 메뉴에서 */}
          {!isDone ? (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
              onClick={() => actions.onRequestCancel(deal)}
            >
              <Ban className="size-3.5" />
              거래 취소
            </button>
          ) : null}
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
              onClick={() => {
                if (nextNeedsContract) {
                  setContractAdvanceStage(nextStage);
                  setContractOpen(true);
                } else {
                  actions.onRequestStage(deal, nextStage);
                }
              }}
            >
              다음: {getStatusMeta('dealStage', nextStage).label}
              <ArrowRight className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      <EditTermsDialog deal={deal} open={termsOpen} onOpenChange={setTermsOpen} />
      {/* 열 때마다 새로 그린다: 창을 연 순간의 거래 금액·당사자·계약금 날짜로 채운다
          (늘 그려 두면 처음 그린 때의 값이 남아, 조건을 고친 뒤에도 옛 금액이 들어 있었다) */}
      {contractOpen ? (
        <CreateContractDialog
          deal={deal}
          open
          onOpenChange={setContractOpen}
          advanceToStage={contractAdvanceStage}
        />
      ) : null}
    </div>
  );
}

/**
 * 담당 바꾸기 (대표·매니저). 한 사람이 맡은 거래만 여기서 바꾸고, 여러 사람으로 나눈 거래는
 * 수수료/정산의 담당 배분에서 바꾼다 (나눈 비중이 사라지지 않게).
 */
function DealAssigneeEditor({ deal }: { deal: Deal }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canChoose = user?.role === 'owner' || user?.role === 'manager';
  const sharing = (deal.participants ?? []).filter((participant) => participant.sharePercent != null);
  const current = sharing[0]?.userId ?? deal.participants?.[0]?.userId ?? '';
  const mutation = useMutation({
    mutationFn: (userId: string) => api.deals.setAssignee(deal.id, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deals'] });
      void queryClient.invalidateQueries({ queryKey: ['settlement'] });
      toast.success('담당을 바꿨습니다.');
    },
    onError: (error) => toast.error(getErrorMessage(error, '담당을 바꾸지 못했습니다. 다시 시도해 주세요.')),
  });
  if (!canChoose || deal.isCancelled) return null;
  if (sharing.length > 1) {
    return (
      <p className="mb-2 text-[12.5px] text-muted-foreground">
        {sharing.map((participant) => `${participant.user.name} ${participant.sharePercent}%`).join(' · ')} — 여러 명으로 나눈 담당은 수수료/정산의 담당 배분에서 바꿉니다.
      </p>
    );
  }
  return (
    <div className="mb-2 max-w-[240px]">
      <AssigneeSelect
        value={current}
        disabled={mutation.isPending}
        onChange={(userId) => {
          if (userId !== current && !mutation.isPending) mutation.mutate(userId);
        }}
      />
      {!current ? (
        <p className="mt-1 text-[12px] text-warning">담당이 없으면 직원 정산에서 빠집니다.</p>
      ) : null}
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
 * 거래 조건 수정 — 당사자, 합의 금액, 입주 예정일, 특약, 메모, 공동중개.
 * 금액·공동중개가 바뀌면 서버가 자동으로 만든 수수료 청구를 새 조건에 맞춘다
 * (사람이 정한 수수료가 있으면 그대로 두고 알려 준다).
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
  return open ? <EditTermsDialogInner deal={deal} onOpenChange={onOpenChange} /> : null;
}

function EditTermsDialogInner({
  deal,
  onOpenChange,
}: {
  deal: Deal;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const transactionType = getDealTransactionType(deal);
  const isMonthly = transactionType === 'monthly';
  const digits = (value: number | null | undefined) => (value != null ? String(value) : '');
  const [price, setPrice] = useState(
    digits(transactionType === 'jeonse' ? (deal.agreedPrice ?? deal.agreedDeposit) : deal.agreedPrice),
  );
  const [deposit, setDeposit] = useState(digits(deal.agreedDeposit));
  const [monthlyRent, setMonthlyRent] = useState(digits(deal.agreedMonthlyRent));
  const [moveInDate, setMoveInDate] = useState(isoToDateInput(deal.agreedMoveInDate));
  const [seller, setSeller] = useState<PickedContact | null>(deal.sellerContact ?? null);
  const [buyer, setBuyer] = useState<PickedContact | null>(deal.buyerContact ?? null);
  const [isJoint, setIsJoint] = useState(deal.isJointBrokerage);
  const [ourSide, setOurSide] = useState<'seller' | 'buyer' | 'both'>(
    deal.ourSide === 'seller' || deal.ourSide === 'buyer' ? deal.ourSide : 'both',
  );
  const [partnerBrokerId, setPartnerBrokerId] = useState(deal.partnerBrokerId ?? '');
  const [specialTerms, setSpecialTerms] = useState(deal.specialTerms ?? '');
  const [memo, setMemo] = useState(deal.memo ?? '');

  const toAmount = (value: string) => (value ? Number(value) : null);
  const mutation = useMutation({
    mutationFn: () =>
      api.deals.update(deal.id, {
        ...(isMonthly
          ? { agreedDeposit: toAmount(deposit), agreedMonthlyRent: toAmount(monthlyRent) }
          : { agreedPrice: toAmount(price) }),
        agreedMoveInDate: moveInDate || null,
        sellerContactId: seller?.id ?? null,
        buyerContactId: buyer?.id ?? null,
        isJointBrokerage: isJoint,
        ourSide: isJoint ? ourSide : 'both',
        partnerBrokerId: isJoint ? partnerBrokerId || null : null,
        specialTerms: specialTerms.trim() || null,
        memo: memo.trim() || null,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['deals'] });
      void queryClient.invalidateQueries({ queryKey: ['commission-payments'] });
      if (result.commissionNotice === 'kept') {
        toast.success('거래 조건을 저장했습니다.', {
          description: '수수료는 따로 정한 금액이 있어 그대로 두었습니다. 수수료 탭에서 확인하세요.',
        });
      } else if (result.commissionNotice === 'synced') {
        toast.success('거래 조건을 저장했습니다.', {
          description: '수수료 청구 금액도 새 조건에 맞췄습니다.',
        });
      } else {
        toast.success('거래 조건을 저장했습니다.');
      }
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error, '거래 조건을 저장하지 못했습니다. 다시 시도해 주세요.')),
  });

  const priceLabel = transactionType === 'jeonse' ? '전세금' : '매매가';

  return (
    <Dialog open onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>거래 조건 수정</DialogTitle>
          <DialogDescription>
            금액이나 공동중개를 바꾸면 수수료 청구도 새 조건에 맞춰집니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {isMonthly ? (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="deal-terms-deposit">보증금</Label>
                <ManwonInput id="deal-terms-deposit" value={deposit} onChange={setDeposit} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="deal-terms-rent">월세</Label>
                <ManwonInput id="deal-terms-rent" value={monthlyRent} onChange={setMonthlyRent} />
              </div>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="deal-terms-price">{priceLabel}</Label>
              <ManwonInput id="deal-terms-price" value={price} onChange={setPrice} />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="deal-terms-move-in">입주 예정일</Label>
            <DateQuickInput id="deal-terms-move-in" value={moveInDate} onChange={setMoveInDate} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid min-w-0 gap-1.5">
              <Label>{isMonthly || transactionType === 'jeonse' ? '임대인' : '매도인'}</Label>
              <ContactPicker value={seller} onChange={setSeller} />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label>{isMonthly || transactionType === 'jeonse' ? '임차인' : '매수인'}</Label>
              <ContactPicker value={buyer} onChange={setBuyer} />
            </div>
          </div>

          <div className="grid gap-2 border-t pt-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isJoint} onCheckedChange={(checked) => setIsJoint(checked === true)} />
              공동중개 거래
            </label>
            {isJoint ? (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">우리 담당 측</Label>
                  <Select value={ourSide} onValueChange={(value) => setOurSide(value as typeof ourSide)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['seller', 'buyer', 'both'] as const).map((side) => (
                        <SelectItem key={side} value={side}>
                          {getOurSideLabel(side, transactionType)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">상대 중개사</Label>
                  <PartnerBrokerSelect value={partnerBrokerId} onChange={setPartnerBrokerId} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="deal-terms-special">특약사항</Label>
            <Textarea
              id="deal-terms-special"
              rows={3}
              value={specialTerms}
              onChange={(event) => setSpecialTerms(event.target.value)}
              placeholder="예: 에어컨 2대 포함, 잔금일 협의 가능"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="deal-terms-memo">메모</Label>
            <Textarea id="deal-terms-memo" rows={2} value={memo} onChange={(event) => setMemo(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>
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

/** 본계약 단계의 Deal 컨텍스트에서 계약서를 바로 생성한다. 단계 메뉴(-deal-actions)도 같은 창을 쓴다. */
export function CreateContractDialog({
  deal,
  open,
  onOpenChange,
  advanceToStage = null,
}: {
  deal: DealListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 계약서를 만든 뒤 넘길 단계 (아래 막대의 "다음"에서 열었을 때) */
  advanceToStage?: string | null;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const transactionType = getDealTransactionType(deal);
  // 계약일: 대금 일정에 계약금 날짜를 넣어 두었으면 그날(보통 계약하는 날)을, 없으면 오늘을 넣어 둔다.
  // 예전에는 늘 오늘이라, 계약금 날짜와 다른 계약일이 저장되고 캘린더·대시보드의 계약일과 어긋났다.
  const [contractDate, setContractDate] = useState(() => {
    const planned = (deal.payments ?? []).find(
      (payment) => payment.kind === 'contract' && payment.status !== 'cancelled' && payment.scheduledDate,
    );
    return planned ? isoToDateInput(planned.scheduledDate) || todayInput() : todayInput();
  });
  const isMonthly = transactionType === 'monthly';
  const isLease = isMonthly || transactionType === 'jeonse';
  const [totalPrice, setTotalPrice] = useState(() => {
    const initial = isMonthly ? deal.agreedDeposit : (deal.agreedPrice ?? deal.agreedDeposit);
    return initial != null ? String(initial) : '';
  });
  const [buyer, setBuyer] = useState<PickedContact | null>(deal.buyerContact ?? null);
  const [seller, setSeller] = useState<PickedContact | null>(deal.sellerContact ?? null);

  const mutation = useMutation({
    mutationFn: async () => {
      const created = await api.contracts.create({
        dealId: deal.id,
        transactionType: transactionType ?? undefined,
        buyerContactId: buyer?.id,
        sellerContactId: seller?.id,
        totalPrice: totalPrice ? Number(totalPrice) : undefined,
        monthlyRent: deal.agreedMonthlyRent ?? undefined,
        contractDate: contractDate || undefined,
      });
      const contractId = created?.id ?? null;
      if (advanceToStage) {
        try {
          await api.deals.updateStage(deal.id, { stage: advanceToStage });
          return { advanced: true, advanceError: null, contractId };
        } catch (error) {
          return { advanced: false, advanceError: getErrorMessage(error, '단계를 바꾸지 못했습니다.'), contractId };
        }
      }
      return { advanced: false, advanceError: null, contractId };
    },
    onSuccess: ({ advanced, advanceError, contractId }) => {
      // 특약·당사자는 계약서에서 이어서 적는다: 만든 계약서를 바로 열 수 있게 한다
      const openContract = contractId
        ? {
            action: {
              label: '계약서 열기',
              onClick: () => void navigate({ to: '/contracts', search: { editorContractId: contractId } }),
            },
          }
        : undefined;
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
      void queryClient.invalidateQueries({ queryKey: ['deals'] });
      if (advanced) {
        invalidateListingDerivedCaches(queryClient);
        toast.success(
          `계약서를 만들고 '${getStatusMeta('dealStage', advanceToStage!).label}' 단계로 넘겼습니다.`,
          openContract,
        );
      } else if (advanceError) {
        toast.error(`계약서는 만들었지만 단계를 넘기지 못했습니다: ${advanceError}`, openContract);
      } else {
        toast.success('계약서를 만들었습니다. 이제 중도금/잔금 단계로 넘길 수 있습니다.', openContract);
      }
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error, '계약서를 만들지 못했습니다. 다시 시도해 주세요.')),
  });

  const missing = [
    !seller ? (isLease ? '임대인' : '매도인') : null,
    !buyer ? (isLease ? '임차인' : '매수인') : null,
    !(Number(totalPrice) > 0) ? (isMonthly ? '보증금' : '거래금액') : null,
  ].filter(Boolean);
  const valid = missing.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>계약서 작성</DialogTitle>
          <DialogDescription>
            {advanceToStage
              ? `'${getStatusMeta('dealStage', advanceToStage).label}' 단계로 넘기려면 계약서가 있어야 합니다. 기본 정보로 계약서를 만들고 바로 넘깁니다.`
              : '기본 정보로 계약서를 만듭니다.'}{' '}
            특약·당사자 상세는 계약서 관리에서 이어서 적습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>{isLease ? '임대인' : '매도인'} *</Label>
            <ContactPicker value={seller} onChange={setSeller} />
          </div>
          <div className="grid gap-1.5">
            <Label>{isLease ? '임차인' : '매수인'} *</Label>
            <ContactPicker value={buyer} onChange={setBuyer} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="deal-contract-total">
              {isMonthly ? '보증금' : transactionType === 'jeonse' ? '전세금' : '매매가'} *
            </Label>
            <ManwonInput id="deal-contract-total" value={totalPrice} onChange={setTotalPrice} />
            {isMonthly && deal.agreedMonthlyRent ? (
              <p className="text-xs text-muted-foreground">
                월세 {formatMoney(deal.agreedMonthlyRent)}은 거래의 합의 조건에서 가져옵니다.
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="deal-contract-date">계약일</Label>
            <DateQuickInput id="deal-contract-date" value={contractDate} onChange={setContractDate} />
          </div>
          {!valid ? (
            <p className="text-xs text-muted-foreground">채워야 할 칸: {missing.join(', ')}</p>
          ) : null}
          {isUnconfirmedContactName(seller?.name) || isUnconfirmedContactName(buyer?.name) ? (
            <p className="text-xs text-warning">
              {UNCONFIRMED_CONTACT_MESSAGE} 초안은 만들 수 있지만, 계약서를 서명완료 이후로 바꾸려면 이름이 있어야 합니다.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            type="button"
            disabled={!valid || mutation.isPending}
            onClick={() => {
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            {advanceToStage ? '계약서 만들고 넘기기' : '계약서 만들기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "지금 할 일" — 단계만 보고 늘 같은 말을 하지 않고, 거래의 실제 상태(계약서·대금 일정·수수료)를 보고 정한다.
 */
/** "지금 할 일" 한 줄. go가 있으면 누르면 그 일을 하는 자리(탭·창)로 바로 간다. */
type NextAction = {
  label: string;
  go?: 'payments' | 'addPayment' | 'contract' | 'openContract' | 'commission' | 'terms' | 'people';
  /** go가 addPayment일 때 추가 창에 미리 고를 대금 종류 */
  kind?: string;
};

function getNextActions(
  deal: Deal,
  contract: Contract | null,
  nextPayment: ReturnType<typeof getNextDealPaymentSummary>,
): NextAction[] {
  const keep = (items: Array<NextAction | null>) => items.filter((item): item is NextAction => item !== null);
  if (deal.isCancelled) {
    return [
      { label: '취소 사유 기록 확인' },
      { label: '받은 돈이 있으면 돌려줌·위약금 처리 메모 확인', go: 'payments' },
      { label: '관련 업무·일정 정리' },
    ];
  }
  const stage = normalizeDealStage(deal.stage);
  const payments = (deal.payments ?? []).filter((payment) => payment.status !== 'cancelled');
  const has = (kind: string) => payments.some((payment) => payment.kind === kind);
  const unpaid = (kind: string) =>
    payments.some((payment) => payment.kind === kind && payment.status !== 'paid');
  const summary = deal.commissionSummary;
  const commissionLeft = summary ? Math.max(0, summary.billed - summary.collected) : 0;
  const nextPaymentText =
    nextPayment?.payment.scheduledDate
      ? `${nextPayment.label} 받기 (${formatShortDate(nextPayment.payment.scheduledDate)} · ${formatDaysLabel(nextPayment.daysUntil)})`
      : null;

  if (stage === 'preparing') {
    return [
      { label: '최종 합의 조건 확인', go: 'terms' },
      { label: '계약 당사자·필요 서류 확인', go: 'people' },
      { label: '가계약 여부와 본계약 일정 결정' },
    ];
  }
  if (stage === 'preContract') {
    return keep([
      has('pre_contract')
        ? unpaid('pre_contract')
          ? { label: '가계약금 입금 확인', go: 'payments' }
          : null
        : { label: '가계약금 일정 넣기', go: 'addPayment', kind: 'pre_contract' },
      has('contract')
        ? { label: '본계약 일정 확정', go: 'payments' }
        : { label: '본계약 일정 확정', go: 'addPayment', kind: 'contract' },
      { label: '계약 필요 서류 안내' },
    ]);
  }
  if (stage === 'contracted') {
    return keep([
      contract ? null : { label: '계약서 작성', go: 'contract' },
      unpaid('contract')
        ? { label: '계약금 입금 확인', go: 'payments' }
        : has('contract')
          ? null
          : { label: '계약금 일정 넣기', go: 'addPayment', kind: 'contract' },
      has('balance') ? null : { label: '중도금·잔금 일정 넣기', go: 'addPayment', kind: 'balance' },
      { label: '확인설명서 교부' },
    ]);
  }
  if (stage === 'settling') {
    return keep([
      nextPaymentText
        ? { label: nextPaymentText, go: 'payments' }
        : has('balance')
          ? null
          : { label: '잔금 일정 넣기', go: 'addPayment', kind: 'balance' },
      { label: '등기·인도 준비 상태 점검' },
      commissionLeft > 0 ? { label: `수수료 ${formatMoney(commissionLeft)} 받을 준비`, go: 'commission' } : null,
    ]);
  }
  if (stage === 'completed') {
    return keep([
      contract && isContractStillDrafting(contract)
        ? { label: '계약서가 아직 작성 중입니다 · 계약서 열기', go: 'openContract' }
        : null,
      commissionLeft > 0 ? { label: `남은 수수료 ${formatMoney(commissionLeft)} 받기`, go: 'commission' } : null,
      { label: '직원 배분 정산 확인', go: 'commission' },
      commissionLeft > 0 ? null : { label: '정산 종료로 넘기기' },
    ]);
  }
  return keep([
    contract && isContractStillDrafting(contract)
      ? { label: '계약서가 아직 작성 중입니다 · 계약서 열기', go: 'openContract' }
      : null,
    { label: '끝난 거래입니다. 계약서·자료를 보관하세요.' },
  ]);
}

function DealPropertyTransitionSection({ dealId }: { dealId: string }) {
  const queryClient = useQueryClient();
  const [archiveExistingOwners, setArchiveExistingOwners] = useState(true);
  const [registerNewOwners, setRegisterNewOwners] = useState(true);
  const [markBuyersResident, setMarkBuyersResident] = useState(false);
  const [closeExistingLeases, setCloseExistingLeases] = useState(true);
  const [createNewLease, setCreateNewLease] = useState(true);

  const previewQuery = useQuery({
    queryKey: ['deals', dealId, 'property-transition-preview'],
    queryFn: () => api.deals.getPropertyTransitionPreview(dealId),
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      const preview = previewQuery.data;
      if (!preview || !preview.eligible) {
        throw new Error('반영할 변경 사항이 없습니다.');
      }
      if (preview.kind === 'sale') {
        return api.deals.applyPropertyTransition(dealId, {
          archiveExistingOwners,
          registerNewOwners,
          markBuyersResident,
        });
      }
      return api.deals.applyPropertyTransition(dealId, {
        closeExistingLeases,
        createNewLease,
      });
    },
    onSuccess: async () => {
      toast.success('매물 소유·임대차 정보를 반영했습니다.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['deals'] }),
        queryClient.invalidateQueries({ queryKey: ['properties'] }),
        queryClient.invalidateQueries({ queryKey: ['sites'] }),
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
      ]);
    },
    onError: (caught) => {
      toast.error(apiErrorMessage(caught, '매물 정보 반영에 실패했습니다.'));
    },
  });

  const preview = previewQuery.data;
  if (!preview || !preview.eligible) return null;

  return (
    <section>
      <InspectorSectionTitle>소유 · 임대차 변경 반영</InspectorSectionTitle>
      <div className="space-y-3 rounded-md border border-[#e9e9e7] bg-[#f7f6f3]/60 p-3 text-[13px]">
        <p className="text-[12.5px] text-muted-foreground">
          {preview.kind === 'sale'
            ? '거래가 끝나 매물의 소유권을 새 매수인에게 넘길 수 있습니다.'
            : '거래가 끝나 매물의 임대차 계약과 세입자 정보를 갱신할 수 있습니다.'}
        </p>

        {preview.kind === 'sale' ? (
          <div className="space-y-2">
            {preview.currentOwners.length > 0 && (
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={archiveExistingOwners}
                  onCheckedChange={(checked) => setArchiveExistingOwners(checked === true)}
                />
                <span>
                  {`기존 소유자 이전 처리 (${preview.currentOwners.map((owner) => owner.name).join(', ')})`}
                </span>
              </label>
            )}
            {preview.proposedBuyers.length > 0 && (
              <>
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={registerNewOwners}
                    onCheckedChange={(checked) => setRegisterNewOwners(checked === true)}
                  />
                  <span>
                    {`새 소유자 등록 (${preview.proposedBuyers.map((buyer) => buyer.name).join(', ')})`}
                  </span>
                </label>
                {registerNewOwners && (
                  <label className="ml-5 flex items-start gap-2 text-[12.5px] text-muted-foreground">
                    <Checkbox
                      checked={markBuyersResident}
                      onCheckedChange={(checked) => setMarkBuyersResident(checked === true)}
                    />
                    <span>직접 입주(거주 중)로 표시</span>
                  </label>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {preview.currentLeases.length > 0 && (
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={closeExistingLeases}
                  onCheckedChange={(checked) => setCloseExistingLeases(checked === true)}
                />
                <span>
                  {`기존 임대차 퇴거 처리 (${preview.currentLeases
                    .map((lease) => lease.tenants.map((tenant) => tenant.name).join(', ') || '세입자')
                    .join(' · ')})`}
                </span>
              </label>
            )}
            {preview.proposedBuyers.length > 0 && (
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={createNewLease}
                  onCheckedChange={(checked) => setCreateNewLease(checked === true)}
                />
                <span>
                  {`새 임대차·세입자 등록 (${preview.proposedBuyers.map((buyer) => buyer.name).join(', ')})`}
                </span>
              </label>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={applyMutation.isPending}
            onClick={() => applyMutation.mutate()}
          >
            {applyMutation.isPending ? '반영 중...' : '매물에 반영'}
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * 계약서 상태는 사람이 바꾸는 값이라 거래가 끝나도 저절로 바꾸지 않는다. 다만 거래가 잔금 완료·정산 종료인데
 * 계약서가 아직 작성 중이면 알려서 계약서를 열어 상태를 정리하게 한다.
 */
function isContractStillDrafting(contract: Contract) {
  return contract.status === 'draft';
}
