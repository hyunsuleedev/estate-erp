/**
 * 문서관리 "자료 중심" 보기 — Notion 갤러리 카드.
 * 계약마다 카드 한 장: 무엇을 얼마나 작성했고 무엇이 빠졌는지가 먼저 보인다.
 * 누르거나 Enter를 치면 옆 상세 패널이 열린다. 문서 편집 탭은 그 패널의 확장 버튼으로 간다.
 */
import type { Contract } from '@estate-erp/api-client';
import { ContractTransactionTypeBadge, transactionReportStatusMeta } from './-contract-shared';
import { getContractTitle, selectTagClassName, statusPillClassName } from './-document-list-table';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { StatusBadge } from '@/components/domain';
import { Skeleton } from '@/components/ui/skeleton';

export function DocumentGallery({
  contracts,
  isLoading = false,
  isFiltered,
  selectedId,
  onSelect,
}: {
  contracts: Contract[];
  isLoading?: boolean;
  isFiltered: boolean;
  selectedId: string | null;
  onSelect: (contractId: string | null) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[148px] rounded-[10px]" />
        ))}
      </div>
    );
  }
  if (contracts.length === 0) {
    return (
      <p className="py-10 text-[14px] text-muted-foreground">
        {isFiltered ? '조건에 맞는 계약이 없습니다.' : '계약이 없습니다.'}
      </p>
    );
  }

  return (
    <div data-contract-gallery className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-4">
      {contracts.map((contract) => {
        const missingCount = contract.missingDocumentCount ?? 0;
        const requiredCount = contract.requiredDocumentTemplates?.length ?? 0;
        const reportStatus = contract.transactionReportStatus ?? 'none';
        const report = transactionReportStatusMeta[reportStatus];
        const selected = contract.id === selectedId;
        const title = getContractTitle(contract);

        return (
          <article
            key={contract.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            data-contract-card={contract.id}
            onClick={() => onSelect(contract.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(contract.id);
              }
            }}
            className={cn(
              'flex cursor-default flex-col gap-2.5 rounded-[10px] bg-white px-3.5 pb-3 pt-3 outline-none transition-shadow',
              'shadow-[0_0_0_1px_rgba(42,28,0,0.07),0_2px_4px_rgba(15,15,15,0.05)] hover:shadow-[0_0_0_1px_rgba(42,28,0,0.12),0_3px_8px_rgba(15,15,15,0.08)]',
              'focus-visible:shadow-[0_0_0_2px_var(--color-ring)]',
              selected && 'shadow-[0_0_0_2px_var(--color-info)] hover:shadow-[0_0_0_2px_var(--color-info)]',
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-foreground" title={title}>
                {title}
              </p>
              <p className="truncate text-[13px] text-muted-foreground">
                {contract.sellerContact?.name ?? '매도인 미지정'} · {contract.buyerContact?.name ?? '매수인 미지정'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge kind="contractStatus" status={contract.status} className={statusPillClassName} />
              <ContractTransactionTypeBadge type={contract.transactionType} className={selectTagClassName} />
              <span className="text-[14px] font-medium tabular-nums text-foreground">
                {formatMoney(contract.totalPrice)}
                {['monthly', 'yearly'].includes(contract.transactionType) && contract.monthlyRent != null && (
                  <span className="font-normal text-muted-foreground">
                    {' / '}
                    {contract.transactionType === 'yearly' ? '연 ' : ''}
                    {formatMoney(contract.monthlyRent)}
                  </span>
                )}
              </span>
            </div>

            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px]">
              <dt className="text-muted-foreground">작성 문서</dt>
              <dd className="text-right tabular-nums text-foreground">
                {contract.documentCount ?? 0}건{requiredCount > 0 ? ` / 필수 ${requiredCount}건` : ''}
              </dd>
              <dt className="text-muted-foreground">자료 누락</dt>
              <dd className={cn('text-right tabular-nums', missingCount > 0 ? 'font-medium text-destructive-strong' : 'text-muted-foreground')}>
                {missingCount > 0 ? `${missingCount}건` : '없음'}
              </dd>
              <dt className="text-muted-foreground">거래신고</dt>
              <dd className="flex justify-end">
                {reportStatus === 'none' || !report ? (
                  <span className="text-muted-foreground">없음</span>
                ) : (
                  <span className={cn(selectTagClassName, report.className)}>{report.label}</span>
                )}
              </dd>
            </dl>

            <div className="mt-auto flex items-center justify-between text-[12px] tabular-nums text-muted-foreground">
              <span>계약일 {formatDate(contract.contractDate)}</span>
              <span>수정 {formatDateTime(contract.updatedAt)}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
