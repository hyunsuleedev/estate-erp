import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowUpRight,
  Handshake,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { PartnerBroker } from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatDate, formatPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DetailField,
  EmptyState,
  EntityChip,
  MoneyText,
  StatusBadge,
} from '@/components/domain';
import { CopyIconButton } from './-copy-button';
import {
  dealAddressLabel,
  dealPriceLabel,
  getPartnerDeals,
  getPartnerDistributions,
  summarizePartnerShare,
  usePartnerDeals,
  type DealWithCommission,
} from './-broker-utils';

export function BrokerDetailSheet({
  broker,
  onClose,
  onEdit,
  onToggleActive,
}: {
  broker: PartnerBroker | null;
  onClose: () => void;
  onEdit: (broker: PartnerBroker) => void;
  onToggleActive: (broker: PartnerBroker) => void;
}) {
  return (
    <Sheet open={!!broker} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 sm:max-w-[560px]"
      >
        {broker && (
          <BrokerSheetBody
            broker={broker}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function BrokerSheetBody({
  broker,
  onEdit,
  onToggleActive,
}: {
  broker: PartnerBroker;
  onEdit: (broker: PartnerBroker) => void;
  onToggleActive: (broker: PartnerBroker) => void;
}) {
  const dealsQuery = usePartnerDeals();

  const partnerDeals = useMemo(
    () => getPartnerDeals(dealsQuery.data ?? [], broker.id),
    [dealsQuery.data, broker.id],
  );

  const shareSummary = useMemo(
    () => summarizePartnerShare(partnerDeals, broker.id),
    [partnerDeals, broker.id],
  );

  return (
    <>
      <SheetHeader className="border-b">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <SheetTitle className="text-base">{broker.name}</SheetTitle>
          {!broker.isActive && <BadgeChip tone="gray">비활성</BadgeChip>}
          <BadgeChip tone={broker.linkedOfficeId ? 'green' : 'gray'}>
            {broker.linkedOfficeId ? 'ERP 가입' : '외부'}
          </BadgeChip>
        </div>
        <SheetDescription>
          공동중개 파트너 상세 · 등록일 {formatDate(broker.createdAt)}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {/* 기본 정보 */}
        <section className="space-y-0.5">
          <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">기본 정보</h3>
          <DetailField label="대표자" value={broker.ceoName ?? undefined} />
          <DetailField label="등록번호">
            {broker.licenseNo ? (
              <span className="tabular-nums">{broker.licenseNo}</span>
            ) : undefined}
          </DetailField>
          <DetailField label="대표폰">
            {broker.ceoPhone ? <PhoneValue phone={broker.ceoPhone} /> : undefined}
          </DetailField>
          <DetailField label="사무소 전화">
            {broker.phone ? <PhoneValue phone={broker.phone} /> : undefined}
          </DetailField>
          <DetailField label="이메일">
            {broker.email ? (
              <span className="flex items-center gap-1">
                <a href={`mailto:${broker.email}`} className="truncate hover:underline">
                  {broker.email}
                </a>
                <CopyIconButton value={broker.email} label="이메일" />
              </span>
            ) : undefined}
          </DetailField>
          <DetailField label="주소" value={broker.address ?? undefined} />
          <DetailField label="메모">
            {broker.memo ? (
              <span className="whitespace-pre-wrap">{broker.memo}</span>
            ) : undefined}
          </DetailField>
          <DetailField label="수정일" value={formatDate(broker.updatedAt)} />
        </section>

        {/* 공동중개 거래 */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground">
              공동중개 거래 {dealsQuery.data ? `${partnerDeals.length}건` : ''}
            </h3>
            <Button asChild variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs">
              <Link to="/deals">
                거래 페이지 열기
                <ArrowUpRight className="size-3" />
              </Link>
            </Button>
          </div>

          {/* 분배 합계 요약 */}
          {shareSummary.total > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2 rounded-md border bg-muted/50 p-2.5 text-center">
              <SummaryStat label="분배 합계" value={shareSummary.total} />
              <SummaryStat label="정산완료" value={shareSummary.settled} valueClassName="text-success" />
              <SummaryStat label="정산대기" value={shareSummary.pending} valueClassName="text-warning" />
            </div>
          )}

          {dealsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : dealsQuery.isError ? (
            <EmptyState
              icon={AlertTriangle}
              title="거래 내역을 불러오지 못했습니다"
              description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
              action={
                <Button variant="outline" size="sm" onClick={() => void dealsQuery.refetch()}>
                  다시 시도
                </Button>
              }
              className="py-8"
            />
          ) : partnerDeals.length === 0 ? (
            <EmptyState
              icon={Handshake}
              title="연결된 거래가 없습니다"
              description="거래 등록 시 공동중개 파트너로 이 사무소를 선택하면 여기에 표시됩니다."
              className="py-8"
            />
          ) : (
            <ul className="space-y-2">
              {partnerDeals.map((deal) => (
                <PartnerDealCard key={deal.id} deal={deal} brokerId={broker.id} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <SheetFooter className="flex-row justify-end border-t">
        <Button variant="outline" size="sm" onClick={() => onEdit(broker)}>
          <Pencil className="size-3.5" />
          정보 수정
        </Button>
        {broker.isActive ? (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onToggleActive(broker)}
          >
            <Trash2 className="size-3.5" />
            비활성화
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onToggleActive(broker)}>
            <RotateCcw className="size-3.5" />
            재활성화
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

function PartnerDealCard({
  deal,
  brokerId,
}: {
  deal: DealWithCommission;
  brokerId: string;
}) {
  const entries = getPartnerDistributions(deal, brokerId);

  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge kind="transactionType" status={deal.transactionType} size="sm" />
        <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
        {deal.isCancelled && (
          <span className="rounded bg-destructive-soft px-1.5 py-0.5 text-xs font-medium text-destructive">
            취소
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {formatDate(deal.createdAt)}
        </span>
      </div>

      <EntityChip
        kind="deal"
        id={deal.id}
        label={dealAddressLabel(deal)}
        sublabel={dealPriceLabel(deal)}
      />

      {entries.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          {entries.map(({ payment, distribution }) => (
            <div
              key={distribution.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-muted-foreground">
                {payment.clientSide === 'seller' ? '매도측' : '매수측'} 수수료 분배{' '}
                {Number(distribution.shareRatio)}%
              </span>
              <span className="flex items-center gap-1.5">
                <MoneyText value={distribution.shareAmount} className="text-xs font-medium" />
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 font-medium',
                    distribution.status === 'settled'
                      ? 'bg-success-soft text-success'
                      : 'bg-warning-soft text-warning',
                  )}
                >
                  {distribution.status === 'settled' ? '정산완료' : '정산대기'}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function PhoneValue({ phone }: { phone: string }) {
  return (
    <span className="flex items-center gap-1">
      <a
        href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
        className="tabular-nums hover:underline"
      >
        {formatPhone(phone)}
      </a>
      <CopyIconButton value={formatPhone(phone)} label="전화번호" />
    </span>
  );
}

function SummaryStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <MoneyText value={value} className={cn('text-sm font-medium', valueClassName)} />
    </div>
  );
}

function BadgeChip({
  tone,
  children,
}: {
  tone: 'green' | 'gray';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
        tone === 'green' ? 'bg-[#eef3ed] text-[#44745a]' : 'bg-[#f1f1ef] text-[#787774]',
      )}
    >
      {children}
    </span>
  );
}
