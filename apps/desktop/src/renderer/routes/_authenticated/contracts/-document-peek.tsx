/**
 * 문서관리 옆 상세 패널.
 * 매물관리 · 거래관리의 상세 패널과 같은 방식으로 열린다: 표 위에 오른쪽에서 미끄러져 나오고,
 * 맨 위 줄은 같은 도구 줄(닫기 » · 새 탭으로 확장 ⤢)이다. 확장을 누르면 문서 편집 탭(전체 화면)이
 * 열리고 패널은 닫힌다. Esc로 닫는다.
 * 편집 탭을 열지 않고 계약의 속성 · 당사자 · 문서를 확인하고, 사본 · 삭제를 한다.
 * 속성 줄은 Notion 페이지 속성과 같은 모양(왼쪽 흐린 이름 + 오른쪽 값, 줄 높이 34px)이다.
 * 메모는 이 화면에 두지 않는다 (사용자 결정 2026-11-15).
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronDown, Copy, ExternalLink, FilePlus2, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ContractListItem as Contract } from '@estate-erp/api-client';
import {
  ContractTransactionTypeBadge,
  documentStatusMeta,
  sortContractDocuments,
  transactionReportStatusMeta,
} from './-contract-shared';
import { getContractTitle, selectTagClassName, statusPillClassName } from './-document-list-table';
import { getContactPhone, isBalanceOutstanding, isBalanceOverdue } from './-list-model';
import { PropertyInspectorToolbar } from '../properties/-components/property-inspector-view';
import { ContractPaymentMismatch } from '../deals/-deal-payments';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatDday, formatMoney, formatPhone } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { StatusBadge } from '@/components/domain';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useInspectorOutsideClose } from '@/hooks/use-inspector-outside-close';
import { dealQueries, invalidateDealData } from '@/queries/deals';

/** 계약서가 지나가는 상태 순서. 화면에서 손으로 고른다 (서명·입금·등기는 프로그램이 알 수 없다). */
const CONTRACT_STATUS_ORDER = ['draft', 'signed', 'depositPaid', 'balancePaid', 'registered', 'cancelled'] as const;

/** 계약서 상태 고르기. 바꾸면 바로 저장한다. */
function ContractStatusPicker({ contract }: { contract: Contract }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: string) => api.contracts.update(contract.id, { status }),
    onSuccess: (_, status) => {
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
      void queryClient.invalidateQueries({ queryKey: ['contract', contract.id] });
      invalidateDealData(queryClient);
      toast.success(`계약서 상태를 '${getStatusMeta('contractStatus', status).label}'(으)로 바꿨습니다.`);
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, '계약서 상태를 바꾸지 못했습니다. 다시 시도해 주세요.')),
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={mutation.isPending}
          aria-label="계약서 상태 바꾸기"
          className="inline-flex items-center gap-0.5 rounded-full hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <StatusBadge kind="contractStatus" status={contract.status} className={statusPillClassName} />
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {CONTRACT_STATUS_ORDER.map((status) => (
          <DropdownMenuItem
            key={status}
            disabled={status === contract.status || mutation.isPending}
            onSelect={() => mutation.mutate(status)}
          >
            <StatusBadge kind="contractStatus" status={status} className={statusPillClassName} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 매물관리 · 거래관리 패널의 Esc 규칙과 같다: 떠 있는 창 · 메뉴가 있으면 그쪽이 먼저 닫힌다 */
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]';

export const CONTRACT_INSPECTOR_WIDTH = 480;

const iconButtonClassName =
  'inline-grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&>svg]:size-4';

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[34px] grid-cols-[104px_minmax(0,1fr)] items-center gap-2">
      <dt className="text-[14px] text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] text-foreground">{children}</dd>
    </div>
  );
}

const empty = <span className="text-muted-foreground">비어 있음</span>;

/** 지급 한 줄: 금액이 먼저, 날짜는 흐리게 */
function PaymentValue({ amount, iso }: { amount: number | null; iso?: string | null }) {
  if (amount == null && !iso) return empty;
  return (
    <>
      {amount != null && <span className="tabular-nums">{formatMoney(amount)}</span>}
      {iso && <span className="tabular-nums text-muted-foreground">{formatDate(iso)}</span>}
    </>
  );
}

function Party({
  contact,
  showPhones,
}: {
  contact: Contract['sellerContact'];
  showPhones: boolean;
}) {
  if (!contact?.name) return <span className="text-muted-foreground">미지정</span>;
  const phone = getContactPhone(contact);
  return (
    <>
      <span>{contact.name}</span>
      {showPhones && phone && (
        <a
          href={`tel:${phone}`}
          className="tabular-nums text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {formatPhone(phone)}
        </a>
      )}
    </>
  );
}

export function ContractPeek({
  contract,
  showPhones,
  closing,
  animate,
  onClose,
  onExited,
  onOpen,
  onCopy,
  isCopying,
  onDelete,
  isDeleting,
}: {
  contract: Contract;
  showPhones: boolean;
  /** 닫히는 중: 미끄러져 나간 뒤 onExited가 불린다 */
  closing: boolean;
  /** 미끄러지는 움직임을 쓸지 (키보드로 열고 닫을 때는 쓰지 않는다) */
  animate: boolean;
  onClose: (animate?: boolean) => void;
  onExited: () => void;
  /** 문서 편집 탭(전체 화면) 열기. documentId를 주면 그 문서가 앞에 온다 */
  onOpen: (contractId: string, documentId?: string) => void;
  onCopy: (contract: Contract) => void;
  isCopying: boolean;
  onDelete: (contract: Contract) => void;
  isDeleting: boolean;
}) {
  const title = getContractTitle(contract);
  const isRent = ['monthly', 'yearly'].includes(contract.transactionType);
  const reportStatus = contract.transactionReportStatus ?? 'none';
  const report = transactionReportStatusMeta[reportStatus];
  const documents = sortContractDocuments(contract.documents ?? []).filter(
    (document) => document.status !== 'cancelled',
  );
  const missing = contract.missingDocuments ?? [];
  const missingCount = contract.missingDocumentCount ?? missing.length;
  const overdue = isBalanceOverdue(contract);
  // 계약서 요약과 거래 대금 일정이 다른지 보려고 거래를 읽는다 (거래 상세 패널과 같은 캐시)
  const dealQuery = useQuery({
    ...dealQueries.detail(contract.dealId),
    enabled: Boolean(contract.dealId) && contract.status !== 'cancelled',
  });

  // 매물관리 패널과 같다: 전체 화면(문서 편집 탭)을 열고 패널은 닫는다.
  const expand = (documentId?: string) => {
    onOpen(contract.id, documentId);
    onClose(false);
  };

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
      id="contract-inspector"
      data-contract-peek
      data-property-inspector
      data-state={closing ? 'closed' : 'open'}
      data-motion={animate ? 'slide' : 'none'}
      inert={closing}
      aria-hidden={closing || undefined}
      aria-label="문서 상세 패널"
      className="absolute inset-y-0 right-0 z-50 flex min-h-0 flex-col border-l border-border bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.03)]"
      style={{ width: CONTRACT_INSPECTOR_WIDTH, maxWidth: '100%' }}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === 'transform') {
          onExited();
        }
      }}
    >
      <PropertyInspectorToolbar
        onClose={onClose}
        onOpenNewTab={() => expand()}
        headerActions={
          <>
            <button
              type="button"
              className={iconButtonClassName}
              disabled={isCopying}
              onClick={() => onCopy(contract)}
              aria-label="사본 만들기"
              title="사본 만들기"
            >
              <Copy />
            </button>
            <button
              type="button"
              className={cn(iconButtonClassName, 'hover:text-destructive')}
              disabled={isDeleting}
              onClick={() => onDelete(contract)}
              aria-label="계약서 삭제"
              title="계약서 삭제"
            >
              <Trash2 />
            </button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-3">
        <h2 className="break-keep text-[22px] font-bold leading-[1.3] tracking-[-0.01em] text-foreground">{title}</h2>

        <dl className="mt-4">
          <Property label="상태">
            <ContractStatusPicker contract={contract} />
          </Property>
          <Property label="거래">
            <ContractTransactionTypeBadge type={contract.transactionType} className={selectTagClassName} />
            <span className={cn(selectTagClassName, contract.deal?.isJointBrokerage ? 'bg-info-soft text-info-strong' : 'bg-neutral-soft text-muted-foreground')}>
              {contract.deal?.isJointBrokerage ? '공동중개' : '단독중개'}
            </span>
            {contract.dealId ? (
              <Link
                to="/deals"
                search={{ dealId: contract.dealId }}
                className="inline-flex items-center gap-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                거래 열기
                <ExternalLink className="size-3" />
              </Link>
            ) : null}
          </Property>
          <Property label={isRent ? '보증금 / 차임' : '거래금액'}>
            <span className="font-medium tabular-nums">
              {formatMoney(contract.totalPrice)}
              {isRent && contract.monthlyRent != null && (
                <span className="font-normal text-muted-foreground">
                  {' / '}
                  {contract.transactionType === 'yearly' ? '연 ' : ''}
                  {formatMoney(contract.monthlyRent)}
                </span>
              )}
            </span>
          </Property>
          <Property label="계약일">
            {contract.contractDate ? <span className="tabular-nums">{formatDate(contract.contractDate)}</span> : empty}
          </Property>
          <Property label="계약금">
            <PaymentValue amount={contract.statedDeposit} />
          </Property>
          <Property label="중도금">
            <PaymentValue amount={contract.statedInterimPayment} iso={contract.statedInterimDate} />
          </Property>
          <Property label="잔금">
            <PaymentValue amount={contract.statedBalance} iso={contract.statedBalanceDate} />
            {contract.statedBalanceDate && isBalanceOutstanding(contract.status, contract.deal) && (
              <span className={cn('text-[13px] tabular-nums', overdue ? 'font-medium text-destructive-strong' : 'text-muted-foreground')}>
                {formatDday(contract.statedBalanceDate)}
              </span>
            )}
          </Property>
          <Property label="매도(임)인">
            <Party contact={contract.sellerContact} showPhones={showPhones} />
          </Property>
          <Property label="매수(임)인">
            <Party contact={contract.buyerContact} showPhones={showPhones} />
          </Property>
          <Property label="거래신고">
            {reportStatus === 'none' || !report ? (
              <span className="text-muted-foreground">없음</span>
            ) : (
              <span className={cn(selectTagClassName, report.className)}>{report.label}</span>
            )}
          </Property>
          <Property label="수정">
            <span className="tabular-nums text-muted-foreground">{formatDateTime(contract.updatedAt)}</span>
          </Property>
        </dl>

        {dealQuery.data ? (
          <ContractPaymentMismatch deal={dealQuery.data} contract={contract} className="mt-3" />
        ) : null}

        <section className="mt-5 border-t border-border pt-4">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
            문서
            <span className="font-normal tabular-nums text-muted-foreground">{documents.length}</span>
          </h3>
          {documents.length === 0 ? (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className="text-[14px] text-muted-foreground">작성한 문서가 없습니다.</p>
              <button
                type="button"
                onClick={() => expand()}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[13px] text-foreground transition-colors hover:bg-[rgba(33,27,23,0.05)]"
              >
                <FilePlus2 className="size-3.5" />
                계약서 쓰기
              </button>
            </div>
          ) : (
            <ul className="-mx-1.5 mt-1">
              {documents.map((document) => {
                const meta = documentStatusMeta[document.status];
                return (
                  <li key={document.id}>
                    <button
                      type="button"
                      onClick={() => expand(document.id)}
                      className="flex h-[30px] w-full items-center gap-2 rounded-md px-1.5 text-left text-[14px] text-foreground transition-colors hover:bg-[rgba(33,27,23,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <FileText className="size-4 shrink-0 text-[#8e8b86]" />
                      <span className="min-w-0 flex-1 truncate underline decoration-[rgba(42,28,0,0.16)] underline-offset-[3px]">
                        {document.title}
                      </span>
                      {meta && <span className={cn(selectTagClassName, meta.className)}>{meta.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {missingCount > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[13px]">
              <span className="text-destructive-strong">누락 {missingCount}</span>
              {missing.map((name) => (
                <span key={name} className={cn(selectTagClassName, 'bg-destructive-soft text-destructive-strong')}>
                  {name}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
