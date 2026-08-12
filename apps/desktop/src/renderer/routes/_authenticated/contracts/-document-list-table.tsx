/**
 * MySpider DMLS002Q1M 문서관리 목록 그리드 재구현.
 *
 * 레거시 대응:
 * - Layout040000 고밀도 컬럼 (신고·중개·금액·중도/잔금일·메모·당사자)
 * - 날짜 셀 시맨틱 색 (오늘/내일/과거/미래)
 * - 하단 포커스 바 (소재지 + 매도/매수 + 연락처)
 * - 한줄메모 MEMO 배지
 *
 * 수정·삭제는 명시 버튼만 — 행 클릭은 열기만.
 */
import { useMemo, useState } from 'react';
import { Copy, StickyNote, Trash2 } from 'lucide-react';
import type { Contract, Deal } from '@estate-erp/api-client';
import {
  ContractTransactionTypeBadge,
  getContractPropertyLabel,
  transactionReportStatusMeta,
} from './-contract-shared';
import { cn } from '@/lib/utils';
import {
  formatDate,
  formatDateTime,
  formatDday,
  formatMoney,
} from '@/lib/format';
import { StatusBadge } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type DateTone = 'today' | 'tomorrow' | 'past' | 'future' | 'none';

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 레거시 gvList_CustomDrawCell 날짜 배경 규칙 */
export function getContractDateTone(iso: string | null | undefined): DateTone {
  if (!iso) return 'none';
  const value = startOfLocalDay(new Date(iso));
  if (Number.isNaN(value.getTime())) return 'none';
  const today = startOfLocalDay(new Date());
  const diffDays = Math.round((value.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays < 0) return 'past';
  return 'future';
}

const DATE_TONE_CLASS: Record<DateTone, string> = {
  none: '',
  today:
    'rounded px-1.5 py-0.5 bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200',
  tomorrow:
    'rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  past: 'rounded px-1.5 py-0.5 bg-muted text-muted-foreground',
  future:
    'rounded px-1.5 py-0.5 bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
};

function contactPhone(
  contact:
    | { phone?: string | null; phones?: Array<{ phone: string }> }
    | null
    | undefined,
) {
  if (!contact) return null;
  if (contact.phone) return contact.phone;
  const first = contact.phones?.[0]?.phone;
  return first ?? null;
}

function DateCell({
  iso,
  emphasizeOverdue,
}: {
  iso: string | null | undefined;
  emphasizeOverdue?: boolean;
}) {
  if (!iso) {
    return <span className="text-muted-foreground">—</span>;
  }
  const tone = getContractDateTone(iso);
  const overdue = emphasizeOverdue && tone === 'past';
  return (
    <span
      className={cn(
        'inline-block text-xs tabular-nums',
        DATE_TONE_CLASS[tone],
        overdue && 'font-semibold text-destructive',
      )}
    >
      {formatDate(iso)}
    </span>
  );
}

function MoneyCell({ contract }: { contract: Contract }) {
  const total = contract.totalPrice;
  const monthly = contract.monthlyRent;
  if (
    ['monthly', 'yearly'].includes(contract.transactionType) &&
    monthly != null
  ) {
    return (
      <div className="text-right text-xs tabular-nums leading-tight">
        <div className="font-medium">
          {formatMoney(total)}
          <span className="text-muted-foreground">
            /{contract.transactionType === 'yearly' ? '연 ' : ''}
            {formatMoney(monthly)}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="text-right text-xs font-medium tabular-nums">
      {total != null ? formatMoney(total) : '—'}
    </div>
  );
}

function PartyCell({
  label,
  name,
  phone,
  showPhone,
}: {
  label: string;
  name: string | null | undefined;
  phone: string | null;
  showPhone: boolean;
}) {
  return (
    <div className="min-w-0 leading-tight">
      <div className="truncate text-xs font-medium" title={name ?? undefined}>
        <span className="text-[10px] font-normal text-muted-foreground">
          {label}{' '}
        </span>
        {name ?? '—'}
      </div>
      {showPhone && phone ? (
        <div
          className="truncate text-[11px] tabular-nums text-muted-foreground"
          title={phone}
        >
          {phone}
        </div>
      ) : null}
    </div>
  );
}

export function DocumentListTable({
  contracts,
  isFiltered,
  showPhones,
  focusedId,
  onFocus,
  onOpen,
  onCopy,
  isCopying,
  onDelete,
  isDeleting,
}: {
  contracts: Contract[];
  isFiltered: boolean;
  showPhones: boolean;
  focusedId: string | null;
  onFocus: (contractId: string | null) => void;
  onOpen: (contractId: string) => void;
  onCopy: (contract: Contract) => void;
  isCopying: boolean;
  onDelete: (contract: Contract) => void;
  isDeleting: boolean;
}) {
  const focused = useMemo(
    () => contracts.find((item) => item.id === focusedId) ?? null,
    [contracts, focusedId],
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border/60">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="h-8 min-w-[4.5rem] px-2 text-[11px] text-muted-foreground">
                계약일
              </TableHead>
              <TableHead className="h-8 min-w-[3.5rem] px-2 text-[11px] text-muted-foreground">
                중개
              </TableHead>
              <TableHead className="h-8 min-w-[4.5rem] px-2 text-[11px] text-muted-foreground">
                거래
              </TableHead>
              <TableHead className="h-8 min-w-[10rem] px-2 text-[11px] text-muted-foreground">
                소재지 / 매물
              </TableHead>
              <TableHead className="h-8 min-w-[5.5rem] px-2 text-right text-[11px] text-muted-foreground">
                금액(만원)
              </TableHead>
              <TableHead className="h-8 min-w-[5rem] px-2 text-[11px] text-muted-foreground">
                중도금일
              </TableHead>
              <TableHead className="h-8 min-w-[5rem] px-2 text-[11px] text-muted-foreground">
                잔금일
              </TableHead>
              <TableHead className="h-8 min-w-[2.5rem] px-2 text-[11px] text-muted-foreground">
                메모
              </TableHead>
              <TableHead className="h-8 min-w-[7rem] px-2 text-[11px] text-muted-foreground">
                매도(임)인
              </TableHead>
              <TableHead className="h-8 min-w-[7rem] px-2 text-[11px] text-muted-foreground">
                매수(임)인
              </TableHead>
              <TableHead className="h-8 min-w-[4.5rem] px-2 text-[11px] text-muted-foreground">
                상태
              </TableHead>
              <TableHead className="h-8 min-w-[4.5rem] px-2 text-[11px] text-muted-foreground">
                신고
              </TableHead>
              <TableHead className="h-8 min-w-[4.5rem] px-2 text-[11px] text-muted-foreground">
                문서
              </TableHead>
              <TableHead className="h-8 w-28 px-2 text-right text-[11px] text-muted-foreground">
                작업
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.map((contract) => {
              const missingCount = contract.missingDocumentCount ?? 0;
              const propertyLabel =
                getContractPropertyLabel(contract.deal) ||
                (!contract.dealId
                  ? contract.documents?.[0]?.title || '독립 문서 묶음'
                  : '');
              const reportStatus = contract.transactionReportStatus ?? 'none';
              const isFocused = contract.id === focusedId;
              const isJoint = Boolean(contract.deal?.isJointBrokerage);
              const sellerPhone = contactPhone(contract.sellerContact);
              const buyerPhone = contactPhone(contract.buyerContact);
              const balanceTone = getContractDateTone(
                contract.statedBalanceDate,
              );
              const balanceOverdue =
                balanceTone === 'past' &&
                !['balancePaid', 'registered', 'cancelled'].includes(
                  contract.status,
                );

              return (
                <TableRow
                  key={contract.id}
                  tabIndex={0}
                  data-state={isFocused ? 'selected' : undefined}
                  onClick={() => onFocus(contract.id)}
                  onDoubleClick={() => onOpen(contract.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onOpen(contract.id);
                    }
                  }}
                  className={cn(
                    'h-9 cursor-pointer text-sm outline-none hover:bg-muted/40 focus-visible:bg-muted/50',
                    isFocused && 'bg-primary/5',
                    isJoint && 'bg-sky-50/40 dark:bg-sky-950/20',
                  )}
                >
                  <TableCell className="px-2 py-1">
                    <DateCell
                      iso={contract.contractDate}
                      emphasizeOverdue={balanceOverdue}
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <span className="text-xs">
                      {isJoint ? (
                        <Badge
                          variant="outline"
                          className="h-5 border-sky-200 bg-sky-50 px-1.5 text-[10px] text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200"
                        >
                          공동
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">단독</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <ContractTransactionTypeBadge
                      type={contract.transactionType}
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <p
                      className="max-w-56 truncate text-xs font-medium"
                      title={propertyLabel || undefined}
                    >
                      {propertyLabel || '매물 미지정'}
                    </p>
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <MoneyCell contract={contract} />
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <DateCell iso={contract.statedInterimDate} />
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <div className="flex flex-col gap-0.5">
                      <DateCell
                        iso={contract.statedBalanceDate}
                        emphasizeOverdue={balanceOverdue}
                      />
                      {contract.statedBalanceDate &&
                      !['balancePaid', 'registered', 'cancelled'].includes(
                        contract.status,
                      ) ? (
                        <span className="text-[10px] text-muted-foreground">
                          {formatDday(contract.statedBalanceDate)}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    {contract.memo?.trim() ? (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                              <StickyNote className="size-3" />
                              MEMO
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-xs text-xs"
                          >
                            {contract.memo}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <PartyCell
                      label="매도"
                      name={contract.sellerContact?.name}
                      phone={sellerPhone}
                      showPhone={showPhones}
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <PartyCell
                      label="매수"
                      name={contract.buyerContact?.name}
                      phone={buyerPhone}
                      showPhone={showPhones}
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <StatusBadge
                      kind="contractStatus"
                      status={contract.status}
                    />
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <Badge
                      className={cn(
                        'border-0 text-[10px]',
                        transactionReportStatusMeta[reportStatus]?.className ??
                          transactionReportStatusMeta.none.className,
                      )}
                    >
                      {transactionReportStatusMeta[reportStatus]?.label ??
                        reportStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <Badge
                      variant={missingCount > 0 ? 'outline' : 'secondary'}
                      className={cn(
                        'text-[10px]',
                        missingCount > 0 && 'text-destructive',
                      )}
                    >
                      {missingCount > 0
                        ? `누락 ${missingCount}`
                        : `${contract.documentCount ?? 0}건`}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-2 py-1 text-right">
                    <div className="flex justify-end gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-1.5 text-xs"
                        disabled={isCopying}
                        onClick={(event) => {
                          event.stopPropagation();
                          onCopy(contract);
                        }}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                        disabled={isDeleting}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(contract);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {contracts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={14}
                  className="h-28 text-center text-sm text-muted-foreground"
                >
                  {isFiltered
                    ? '조건에 맞는 계약이 없습니다.'
                    : '계약이 없습니다.'}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {/* 레거시 lblAddr / lblSell / lblBuy 하단 바 */}
      <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 bg-muted/20 px-3 py-1.5 text-xs">
        {focused ? (
          <>
            <span className="min-w-0 flex-1 truncate text-foreground">
              <span className="text-muted-foreground">소재지 </span>
              {getContractPropertyLabel(focused.deal) || '—'}
            </span>
            <span className="truncate">
              <span className="text-muted-foreground">매도(임) </span>
              <span className="font-medium text-sky-700 dark:text-sky-300">
                {focused.sellerContact?.name ?? '—'}
              </span>
              {showPhones && contactPhone(focused.sellerContact) ? (
                <span className="ml-1 tabular-nums text-muted-foreground">
                  {contactPhone(focused.sellerContact)}
                </span>
              ) : null}
            </span>
            <span className="truncate">
              <span className="text-muted-foreground">매수(임) </span>
              <span className="font-medium text-rose-700 dark:text-rose-300">
                {focused.buyerContact?.name ?? '—'}
              </span>
              {showPhones && contactPhone(focused.buyerContact) ? (
                <span className="ml-1 tabular-nums text-muted-foreground">
                  {contactPhone(focused.buyerContact)}
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground">
              수정 {formatDateTime(focused.updatedAt)}
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="h-6 px-2 text-[11px]"
              onClick={() => onOpen(focused.id)}
            >
              열기 (더블클릭)
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground">
            행을 선택하면 소재지·당사자가 표시됩니다. 더블클릭으로 문서를
            엽니다.
          </span>
        )}
      </div>
    </div>
  );
}

/** 레거시 State_Type 진행중/완료 프리셋 → Contract.status 값 */
export const DOC_STATE_PRESETS = {
  all: { label: '전체', statuses: [] as string[] },
  active: {
    label: '진행중',
    statuses: ['draft', 'signed', 'depositPaid', 'balancePaid'],
  },
  done: {
    label: '완료',
    statuses: ['registered'],
  },
} as const;

export type DocStatePreset = keyof typeof DOC_STATE_PRESETS;

export function useDocListFocus(initial: string | null = null) {
  const [focusedId, setFocusedId] = useState<string | null>(initial);
  return { focusedId, setFocusedId };
}

/** deal 라벨 헬퍼 (목록 외에서도 재사용) */
export function getDealSummaryLabel(deal: Deal) {
  const propertyLabel = getContractPropertyLabel(deal) || '매물 미지정';
  const buyer = deal.buyerContact?.name ?? '매수인 미지정';
  const seller = deal.sellerContact?.name ?? '매도인 미지정';
  return `${propertyLabel} · ${buyer} / ${seller}`;
}
