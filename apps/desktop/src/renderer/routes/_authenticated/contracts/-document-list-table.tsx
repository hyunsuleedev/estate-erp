/**
 * 문서관리 목록 — Notion 데이터베이스 표.
 *
 * Notion 데스크톱 7.42의 표 보기를 재서 옮겼다: 머리줄 36px(속성 아이콘 + 이름, 흐린 글자),
 * 행 36px + 선 1px, 칸 안쪽 8px, 글자 14px, 제목 칸만 굵기 500, 칸 사이 옅은 세로선,
 * 상태는 둥근 알약(점 + 글자), 선택 값은 모서리 4px 꼬리표.
 *
 * - 첫 칸(소재지 / 매물)은 옆으로 밀어도 남는다.
 * - 행을 누르거나 Enter · "열기"(매물관리와 같은 버튼)를 누르면 옆 상세 패널(-document-peek)이 열린다.
 *   문서 편집 탭(전체 화면)은 그 패널의 확장 버튼으로 간다.
 * - 사본 · 삭제는 행에 마우스를 올리거나 포커스가 갔을 때 보이는 버튼으로만 한다.
 */
import type { ReactNode } from 'react';
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CircleDashed,
  Copy,
  FileCheck2,
  Files,
  Handshake,
  Tag,
  Trash2,
  Type,
  User,
} from 'lucide-react';
import type { Contract, Deal } from '@estate-erp/api-client';
import {
  ContractTransactionTypeBadge,
  getContractPropertyLabel,
  transactionReportStatusMeta,
} from './-contract-shared';
import {
  getContactPhone,
  getContractDateTone,
  isBalanceOutstanding,
  isBalanceOverdue,
} from './-list-model';
import { cn } from '@/lib/utils';
import { formatDate, formatDday, formatMoney, formatPhone } from '@/lib/format';
import { RowOpenButton, StatusBadge, WonCircleIcon } from '@/components/domain';
import { Skeleton } from '@/components/ui/skeleton';

// ── 공통 모양 (다른 문서관리 부품도 같이 쓴다) ─────────────────────────

/** Notion 선택 값 꼬리표: 높이 20 · 모서리 4 · 좌우 6 · 14px(표에서는 13px) */
export const selectTagClassName =
  'inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-[4px] px-1.5 py-0 text-[13px] font-normal leading-5';

/** Notion 상태 알약: 높이 20 · 둥근 끝 · 왼쪽 7 / 오른쪽 9 · 앞에 8px 점 */
export const statusPillClassName =
  "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full py-0 pl-[7px] pr-[9px] text-[13px] font-normal leading-5 before:mr-[5px] before:size-2 before:shrink-0 before:rounded-full before:bg-current before:opacity-60 before:content-['']";

/** 계약의 표시 이름: 매물이 없으면 첫 문서 제목(독립 문서 묶음) */
export function getContractTitle(contract: Contract): string {
  return (
    getContractPropertyLabel(contract.deal) ||
    (!contract.dealId ? contract.documents?.[0]?.title || '독립 문서 묶음' : '') ||
    '매물 미지정'
  );
}

// ── 칸 ──────────────────────────────────────────────────────────────

const COLUMNS: Array<{
  key: string;
  label: string;
  icon: ReactNode;
  /** px. 첫 칸은 남는 폭을 가져간다 */
  width: number;
  align?: 'right';
}> = [
  { key: 'title', label: '소재지 / 매물', icon: <Type />, width: 248 },
  { key: 'contractDate', label: '계약일', icon: <CalendarDays />, width: 108 },
  { key: 'brokerage', label: '중개', icon: <Handshake />, width: 76 },
  { key: 'type', label: '거래', icon: <Tag />, width: 80 },
  { key: 'amount', label: '금액', icon: <WonCircleIcon />, width: 132, align: 'right' },
  { key: 'interim', label: '중도금일', icon: <CalendarClock />, width: 108 },
  { key: 'balance', label: '잔금일', icon: <CalendarCheck />, width: 144 },
  { key: 'seller', label: '매도(임)인', icon: <User />, width: 132 },
  { key: 'buyer', label: '매수(임)인', icon: <User />, width: 132 },
  { key: 'status', label: '상태', icon: <CircleDashed />, width: 112 },
  { key: 'report', label: '신고', icon: <FileCheck2 />, width: 92 },
  { key: 'docs', label: '문서', icon: <Files />, width: 84 },
];

/** 연락처를 함께 보일 때 당사자 칸을 넓힌다 */
const PARTY_WIDTH_WITH_PHONE = 216;
const ACTIONS_WIDTH = 68;

const cellBase =
  'h-9 border-b border-border px-2 align-middle text-[14px] leading-[21px] text-foreground';
const cellDivider = 'border-r border-border';

function DateText({
  iso,
  overdue = false,
  mutePast = true,
  suffix,
}: {
  iso: string | null | undefined;
  overdue?: boolean;
  /** 지난 날짜를 흐리게 (치른 중도금 · 잔금). 계약일은 지난 날이 보통이라 흐리게 하지 않는다 */
  mutePast?: boolean;
  /** 날짜 뒤에 붙는 흐린 글 (남은 날) */
  suffix?: string | null;
}) {
  if (!iso) return null;
  const tone = getContractDateTone(iso);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
      <span
        className={cn(
          overdue
            ? 'font-medium text-destructive-strong'
            : tone === 'today'
              ? cn(selectTagClassName, 'bg-destructive-soft text-destructive-strong')
              : tone === 'tomorrow'
                ? cn(selectTagClassName, 'bg-success-soft text-success')
                : tone === 'past' && mutePast
                  ? 'text-muted-foreground'
                  : undefined,
        )}
        title={tone === 'today' ? '오늘' : tone === 'tomorrow' ? '내일' : undefined}
      >
        {formatDate(iso)}
      </span>
      {suffix && (
        <span className={cn('text-[12px]', overdue ? 'text-destructive-strong' : 'text-muted-foreground')}>
          {suffix}
        </span>
      )}
    </span>
  );
}

function AmountText({ contract }: { contract: Contract }) {
  const isRent = ['monthly', 'yearly'].includes(contract.transactionType);
  if (isRent && contract.monthlyRent != null) {
    return (
      <span className="whitespace-nowrap tabular-nums">
        {formatMoney(contract.totalPrice)}
        <span className="text-muted-foreground">
          {' / '}
          {contract.transactionType === 'yearly' ? '연 ' : ''}
          {formatMoney(contract.monthlyRent)}
        </span>
      </span>
    );
  }
  return <span className="whitespace-nowrap tabular-nums">{formatMoney(contract.totalPrice)}</span>;
}

function PartyText({
  name,
  phone,
  showPhone,
}: {
  name: string | null | undefined;
  phone: string | null;
  showPhone: boolean;
}) {
  if (!name) return <span className="text-muted-foreground">미지정</span>;
  return (
    <span className="flex min-w-0 items-baseline gap-1.5" title={name}>
      <span className="truncate">{name}</span>
      {showPhone && phone && (
        <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{formatPhone(phone)}</span>
      )}
    </span>
  );
}

export function DocumentListTable({
  contracts,
  isLoading = false,
  isFiltered,
  showPhones,
  selectedId,
  onSelect,
  onCopy,
  isCopying,
  onDelete,
  isDeleting,
  addRow,
}: {
  contracts: Contract[];
  isLoading?: boolean;
  isFiltered: boolean;
  showPhones: boolean;
  /** 옆 상세 패널에 열려 있는 계약 */
  selectedId: string | null;
  /** 옆 상세 패널 열기(null이면 닫기) */
  onSelect: (contractId: string | null) => void;
  onCopy: (contract: Contract) => void;
  isCopying: boolean;
  onDelete: (contract: Contract) => void;
  isDeleting: boolean;
  /** 표 맨 아래 "+ 새 계약서" 줄 (Notion의 "새 항목" 줄) */
  addRow?: ReactNode;
}) {
  const widthOf = (key: string, width: number) =>
    showPhones && (key === 'seller' || key === 'buyer') ? PARTY_WIDTH_WITH_PHONE : width;
  const tableMinWidth =
    COLUMNS.reduce((sum, column) => sum + widthOf(column.key, column.width), 0) + ACTIONS_WIDTH;
  const columnCount = COLUMNS.length + 1;

  return (
    <table
      data-contract-list-table
      className="w-full table-fixed border-separate border-spacing-0 text-left"
      style={{ minWidth: tableMinWidth }}
    >
      <colgroup>
        {COLUMNS.map((column, index) => (
          <col key={column.key} style={index === 0 ? undefined : { width: widthOf(column.key, column.width) }} />
        ))}
        <col style={{ width: ACTIONS_WIDTH }} />
      </colgroup>
      <thead>
        <tr>
          {COLUMNS.map((column, index) => (
            <th
              key={column.key}
              scope="col"
              className={cn(
                'sticky top-0 z-[2] h-9 border-b border-border bg-white px-2 text-[14px] font-normal leading-[21px] text-muted-foreground',
                cellDivider,
                index === 0 && 'left-0 z-[3]',
                column.align === 'right' && 'text-right',
              )}
            >
              <span className={cn('inline-flex min-w-0 max-w-full items-center gap-1.5', column.align === 'right' && 'justify-end')}>
                <span aria-hidden className="shrink-0 text-[#8e8b86] [&>svg]:size-4">
                  {column.icon}
                </span>
                <span className="truncate">{column.label}</span>
              </span>
            </th>
          ))}
          <th scope="col" className="sticky top-0 z-[2] h-9 border-b border-border bg-white">
            <span className="sr-only">작업</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {isLoading
          ? Array.from({ length: 8 }).map((_, row) => (
              <tr key={row}>
                {Array.from({ length: columnCount }).map((__, col) => (
                  <td key={col} className={cn(cellBase, col < columnCount - 1 && cellDivider)}>
                    {col < columnCount - 1 && (
                      <Skeleton className={cn('h-3.5 rounded-sm', col === 0 ? 'w-40' : 'w-14')} />
                    )}
                  </td>
                ))}
              </tr>
            ))
          : contracts.map((contract) => {
              const title = getContractTitle(contract);
              const missingCount = contract.missingDocumentCount ?? 0;
              const reportStatus = contract.transactionReportStatus ?? 'none';
              const report = transactionReportStatusMeta[reportStatus] ?? {
                label: reportStatus,
                className: transactionReportStatusMeta.none.className,
              };
              const selected = contract.id === selectedId;
              const isJoint = Boolean(contract.deal?.isJointBrokerage);
              const overdue = isBalanceOverdue(contract);
              // 칸마다 불투명한 바탕을 준다: 옆으로 밀 때 고정된 첫 칸 뒤로 글자가 비치지 않게.
              const rowTone = selected
                ? 'bg-[#eef5fd]'
                : 'bg-white group-hover:bg-[#f9f8f7] group-focus-visible:bg-[#f9f8f7]';

              return (
                <tr
                  key={contract.id}
                  tabIndex={0}
                  aria-selected={selected}
                  data-contract-row={contract.id}
                  onClick={() => onSelect(contract.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(contract.id);
                    }
                  }}
                  className="group cursor-default outline-none"
                >
                  <td className={cn(cellBase, cellDivider, rowTone, 'sticky left-0 z-[1]', selected && 'shadow-[inset_2px_0_0_var(--color-info)]')}>
                    <span className="block truncate font-medium" title={title}>
                      {title}
                    </span>
                    <RowOpenButton
                      label={title}
                      current={selected}
                      controls="contract-inspector"
                      onToggle={() => onSelect(selected ? null : contract.id)}
                    />
                  </td>
                  <td className={cn(cellBase, cellDivider, rowTone)}>
                    <DateText iso={contract.contractDate} mutePast={false} />
                  </td>
                  <td className={cn(cellBase, cellDivider, rowTone)}>
                    {isJoint ? (
                      <span className={cn(selectTagClassName, 'bg-info-soft text-info-strong')}>공동</span>
                    ) : (
                      <span className="text-muted-foreground">단독</span>
                    )}
                  </td>
                  <td className={cn(cellBase, cellDivider, rowTone)}>
                    <ContractTransactionTypeBadge type={contract.transactionType} className={selectTagClassName} />
                  </td>
                  <td className={cn(cellBase, cellDivider, rowTone, 'text-right')}>
                    <AmountText contract={contract} />
                  </td>
                  <td className={cn(cellBase, cellDivider, rowTone)}>
                    <DateText iso={contract.statedInterimDate} />
                  </td>
                  <td className={cn(cellBase, cellDivider, rowTone)}>
                    <DateText
                      iso={contract.statedBalanceDate}
                      overdue={overdue}
                      suffix={
                        contract.statedBalanceDate && isBalanceOutstanding(contract.status)
                          ? formatDday(contract.statedBalanceDate)
                          : null
                      }
                    />
                  </td>
                  <td className={cn(cellBase, cellDivider, rowTone)}>
                    <PartyText
                      name={contract.sellerContact?.name}
                      phone={getContactPhone(contract.sellerContact)}
                      showPhone={showPhones}
                    />
                  </td>
                  <td className={cn(cellBase, cellDivider, rowTone)}>
                    <PartyText
                      name={contract.buyerContact?.name}
                      phone={getContactPhone(contract.buyerContact)}
                      showPhone={showPhones}
                    />
                  </td>
                  <td className={cn(cellBase, cellDivider, rowTone)}>
                    <StatusBadge kind="contractStatus" status={contract.status} className={statusPillClassName} />
                  </td>
                  <td className={cn(cellBase, cellDivider, rowTone)}>
                    {reportStatus === 'none' ? (
                      <span className="text-muted-foreground">없음</span>
                    ) : (
                      <span className={cn(selectTagClassName, report.className)}>{report.label}</span>
                    )}
                  </td>
                  <td className={cn(cellBase, cellDivider, rowTone)}>
                    {missingCount > 0 ? (
                      <span className={cn(selectTagClassName, 'bg-destructive-soft text-destructive-strong')}>
                        누락 {missingCount}
                      </span>
                    ) : (
                      <span className="tabular-nums text-muted-foreground">{contract.documentCount ?? 0}건</span>
                    )}
                  </td>
                  <td className={cn(cellBase, rowTone, 'px-1')}>
                    <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      <RowButton
                        label="사본 만들기"
                        disabled={isCopying}
                        onClick={() => onCopy(contract)}
                      >
                        <Copy />
                      </RowButton>
                      <RowButton
                        label="계약 삭제"
                        disabled={isDeleting}
                        danger
                        onClick={() => onDelete(contract)}
                      >
                        <Trash2 />
                      </RowButton>
                    </div>
                  </td>
                </tr>
              );
            })}
        {!isLoading && contracts.length === 0 && (
          <tr>
            <td colSpan={columnCount} className="h-24 border-b border-border px-2 text-[14px] text-muted-foreground">
              {isFiltered ? '조건에 맞는 계약이 없습니다.' : '계약이 없습니다.'}
            </td>
          </tr>
        )}
        {addRow && !isLoading && (
          <tr>
            <td colSpan={columnCount} className="h-[37px] border-b border-border p-0">
              {addRow}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function RowButton({
  label,
  disabled,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        'inline-flex size-6 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:bg-[rgba(33,27,23,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40 [&>svg]:size-3.5',
        danger ? 'hover:text-destructive' : 'hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** deal 라벨 (계약 생성 창의 거래 선택) */
export function getDealSummaryLabel(deal: Deal) {
  const propertyLabel = getContractPropertyLabel(deal) || '매물 미지정';
  const buyer = deal.buyerContact?.name ?? '매수인 미지정';
  const seller = deal.sellerContact?.name ?? '매도인 미지정';
  return `${propertyLabel} · ${buyer} / ${seller}`;
}
