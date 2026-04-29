import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Handshake, Users, TrendingUp, Calendar } from 'lucide-react';
import type { Deal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/cashflow/partner-commissions')({
  component: PartnerCommissionsPage,
});

function toEok(manwon: number): string {
  const sign = manwon < 0 ? '-' : '';
  const abs = Math.abs(manwon);
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)}억`;
  return `${sign}${abs.toLocaleString()}만`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

type PartnerAggregate = {
  partnerId: string | null;
  partnerName: string;
  partnerPhone: string | null;
  dealCount: number;
  ourShareTotal: number;
  partnerShareTotal: number;
  billedTotal: number;
  collectedTotal: number;
  lastDealAt: string;
  deals: Deal[];
};

function aggregateByPartner(deals: Deal[]): PartnerAggregate[] {
  const map = new Map<string, PartnerAggregate>();
  for (const d of deals) {
    if (!d.isJointBrokerage) continue;
    const key = d.partnerBrokerId ?? `unlinked:${d.partnerBroker?.name ?? '미지정'}`;
    const existing = map.get(key);
    const summary = d.commissionSummary ?? { billed: 0, ourShare: 0, partnerShare: 0, collected: 0 };
    if (existing) {
      existing.dealCount += 1;
      existing.ourShareTotal += summary.ourShare;
      existing.partnerShareTotal += summary.partnerShare;
      existing.billedTotal += summary.billed;
      existing.collectedTotal += summary.collected;
      if (d.stageChangedAt > existing.lastDealAt) existing.lastDealAt = d.stageChangedAt;
      existing.deals.push(d);
    } else {
      map.set(key, {
        partnerId: d.partnerBrokerId,
        partnerName: d.partnerBroker?.name ?? '미지정 파트너',
        partnerPhone: d.partnerBroker?.phone ?? null,
        dealCount: 1,
        ourShareTotal: summary.ourShare,
        partnerShareTotal: summary.partnerShare,
        billedTotal: summary.billed,
        collectedTotal: summary.collected,
        lastDealAt: d.stageChangedAt,
        deals: [d],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.ourShareTotal - a.ourShareTotal);
}

function PartnerCommissionsPage() {
  const { data: deals, isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });

  const partners = useMemo(() => aggregateByPartner(deals ?? []), [deals]);

  const totals = useMemo(() => {
    return partners.reduce(
      (acc, p) => ({
        dealCount: acc.dealCount + p.dealCount,
        ourShareTotal: acc.ourShareTotal + p.ourShareTotal,
        partnerShareTotal: acc.partnerShareTotal + p.partnerShareTotal,
        collectedTotal: acc.collectedTotal + p.collectedTotal,
      }),
      { dealCount: 0, ourShareTotal: 0, partnerShareTotal: 0, collectedTotal: 0 },
    );
  }, [partners]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">공동중개 수수료</h1>
        <p className="text-sm text-muted-foreground">
          파트너 사무소별 공동중개 정산 현황을 집계합니다. 공동중개 거래(<code>isJointBrokerage</code>)만 포함됩니다.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          icon={<Users className="size-4" />}
          label="파트너 사무소"
          value={`${partners.length}곳`}
        />
        <SummaryCard
          icon={<Handshake className="size-4" />}
          label="공동중개 거래"
          value={`${totals.dealCount}건`}
        />
        <SummaryCard
          icon={<TrendingUp className="size-4" />}
          label="누적 우리 몫"
          value={toEok(totals.ourShareTotal)}
          highlight
        />
        <SummaryCard
          icon={<TrendingUp className="size-4" />}
          label="누적 파트너 몫"
          value={toEok(totals.partnerShareTotal)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">파트너별 정산 내역</CardTitle>
          <CardDescription>
            우리 몫 누적액이 큰 파트너 순으로 정렬됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-60 rounded-lg" />
          ) : partners.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>파트너 사무소</TableHead>
                    <TableHead className="text-right">거래</TableHead>
                    <TableHead className="text-right">청구액</TableHead>
                    <TableHead className="text-right">우리 몫</TableHead>
                    <TableHead className="text-right">파트너 몫</TableHead>
                    <TableHead className="text-right">수금 완료</TableHead>
                    <TableHead>최근 거래</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((p) => (
                    <TableRow key={p.partnerId ?? p.partnerName}>
                      <TableCell>
                        <div className="flex flex-col">
                          {p.partnerId ? (
                            <Link
                              to="/partner-brokers"
                              className="font-medium hover:underline"
                            >
                              {p.partnerName}
                            </Link>
                          ) : (
                            <span className="font-medium text-muted-foreground">
                              {p.partnerName}
                            </span>
                          )}
                          {p.partnerPhone && (
                            <span className="text-xs text-muted-foreground">
                              {p.partnerPhone}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline">{p.dealCount}건</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {toEok(p.billedTotal)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                        {toEok(p.ourShareTotal)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {toEok(p.partnerShareTotal)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {toEok(p.collectedTotal)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {formatDate(p.lastDealAt)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center justify-between gap-3 px-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className={
              highlight
                ? 'mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400'
                : 'mt-1 text-lg font-semibold'
            }
          >
            {value}
          </p>
        </div>
        <div className="rounded-md bg-muted/60 p-2 text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-10 text-center">
      <Handshake className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">공동중개 거래가 아직 없습니다</p>
      <p className="mt-1 text-xs text-muted-foreground">
        거래 생성 시 “공동중개”로 체크하면 이 화면에 파트너별 정산 현황이 집계됩니다.
      </p>
    </div>
  );
}
