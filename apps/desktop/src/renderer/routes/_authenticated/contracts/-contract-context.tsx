/**
 * 계약 컨텍스트 — 연결 거래 정보(EntityChip 점프) + 관련 이력(ActivityLog) 패널.
 */
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import type { ActivityLog, Contract } from '@estate-erp/api-client';
import {
  SummaryRow,
  getContractProperty,
  getContractPropertyLabel,
} from './-contract-shared';
import { api } from '@/lib/api';
import { formatArea, formatDateTime, formatMoney, formatPhone } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { EntityChip } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const ACTION_LABELS: Record<string, string> = {
  create: '생성',
  update: '수정',
  delete: '삭제',
};

const CHANGE_FIELD_LABELS: Record<string, string> = {
  status: '상태',
  transactionType: '거래유형',
  totalPrice: '총 거래금액',
  monthlyRent: '월세',
  contractDate: '계약일',
  statedDeposit: '계약금',
  statedInterimPayment: '중도금',
  statedInterimDate: '중도금 예정일',
  statedBalance: '잔금',
  statedBalanceDate: '잔금 예정일',
  moveInDate: '입주일',
  leaseStartDate: '임대 시작일',
  leaseEndDate: '임대 종료일',
  specialTerms: '특약사항',
  memo: '메모',
  attachments: '첨부',
  buyerContactId: '매수인',
  sellerContactId: '매도인',
};

export function DealInfoTab({ contract }: { contract: Contract }) {
  const deal = contract.deal;
  const property = getContractProperty(deal);
  const propertyLabel = getContractPropertyLabel(deal);
  const unit = property?.unit;

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-base">연결 거래 정보</CardTitle>
        <CardDescription>
          칩을 누르면 해당 거래·매물·연락처 화면으로 이동합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        <div className="flex flex-wrap items-center gap-2">
          {deal ? (
            <EntityChip
              kind="deal"
              id={deal.id}
              label={`거래 · ${getStatusMeta('dealStage', deal.stage).label}`}
              sublabel={formatMoney(deal.agreedPrice)}
            />
          ) : null}
          {property?.id ? (
            <EntityChip
              kind="property"
              id={property.id}
              label={propertyLabel || '매물'}
            />
          ) : null}
          {contract.buyerContact ? (
            <EntityChip
              kind="contact"
              id={contract.buyerContact.id}
              label={`매수 · ${contract.buyerContact.name}`}
              sublabel={formatPhone(contract.buyerContact.phone)}
            />
          ) : null}
          {contract.sellerContact ? (
            <EntityChip
              kind="contact"
              id={contract.sellerContact.id}
              label={`매도 · ${contract.sellerContact.name}`}
              sublabel={formatPhone(contract.sellerContact.phone)}
            />
          ) : null}
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <SummaryRow label="매물" value={propertyLabel || '—'} />
          <SummaryRow
            label="주소"
            value={property?.site?.roadAddress ?? property?.site?.jibunAddress ?? '—'}
          />
          <SummaryRow
            label="면적 (전용)"
            value={unit?.exclusiveAreaM2 ? formatArea(unit.exclusiveAreaM2) : '—'}
          />
          <SummaryRow
            label="거래 단계"
            value={deal ? getStatusMeta('dealStage', deal.stage).label : '—'}
          />
          <SummaryRow label="합의 금액" value={formatMoney(deal?.agreedPrice)} />
          <SummaryRow label="거래 메모" value={deal?.memo ?? '—'} />
        </div>
      </CardContent>
    </Card>
  );
}

export function ActivityLogPanel({
  contractId,
  open,
}: {
  contractId: string;
  open: boolean;
}) {
  const logsQuery = useQuery({
    queryKey: ['activity-logs', 'Contract', contractId],
    queryFn: () =>
      api.activityLogs.list({
        entityType: 'Contract',
        entityId: contractId,
        limit: 50,
      }),
    enabled: open,
  });

  const logs = logsQuery.data?.items ?? [];

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" />
          관련 이력
        </CardTitle>
        <CardDescription>이 계약에 대한 변경 감사 기록입니다.</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        {logsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : logsQuery.isError ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            이력을 불러오지 못했습니다.
            <Button variant="outline" size="sm" onClick={() => logsQuery.refetch()}>
              다시 시도
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            기록된 변경 이력이 없습니다.
          </p>
        ) : (
          <ul className="space-y-3">
            {logs.map((log) => (
              <ActivityLogRow key={log.id} log={log} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityLogRow({ log }: { log: ActivityLog }) {
  const changedFields = log.changes
    ? Object.keys(log.changes).map((key) => CHANGE_FIELD_LABELS[key] ?? key)
    : [];

  return (
    <li className="flex items-start gap-3 rounded-md border border-border/60 px-3 py-2">
      <Badge variant="outline" className="mt-0.5 shrink-0">
        {ACTION_LABELS[log.action] ?? log.action}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{log.user?.name ?? log.actor}</span>
          {changedFields.length > 0 ? (
            <span className="text-muted-foreground">
              {' '}
              — {changedFields.join(', ')}
            </span>
          ) : null}
        </p>
        {log.reason ? (
          <p className="text-xs text-muted-foreground">{log.reason}</p>
        ) : null}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatDateTime(log.createdAt)}
      </span>
    </li>
  );
}
