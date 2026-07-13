import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CirclePlus,
  FileText,
  Handshake,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RotateCcw,
  Trash2,
  UserRound,
} from 'lucide-react';
import type { PartnerBroker } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatPhone } from '@/lib/format';
import { DataTable, DateCell, ViewBar } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ConfirmDialog, EmptyState, PageHeader } from '@/components/domain';
import { CopyIconButton } from './-copy-button';
import { CreateDialog, EditDialog } from './-broker-dialogs';
import { BrokerDetailSheet } from './-broker-detail-sheet';
import {
  brokerMatchesSearch,
  buildDealCountMap,
  sortBrokers,
  usePartnerDeals,
} from './-broker-utils';

export const Route = createFileRoute('/_authenticated/partner-brokers/')({
  component: PartnerBrokersPage,
});

type ToggleTarget = {
  broker: PartnerBroker;
  action: 'deactivate' | 'reactivate';
};

function PartnerBrokersPage() {
  const qc = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);

  const listQuery = useQuery({
    queryKey: ['partner-brokers', { includeInactive }],
    queryFn: () => api.partnerBrokers.list(includeInactive),
  });
  const data = listQuery.data;

  const dealsQuery = usePartnerDeals();
  const dealCounts = useMemo(
    () => buildDealCountMap(dealsQuery.data ?? []),
    [dealsQuery.data],
  );
  // 서버 dealCount 캐시는 갱신 로직이 없어 0으로 고정 → 거래 목록에서 실시간 집계
  const resolveDealCount = useMemo(
    () =>
      (broker: PartnerBroker) =>
        dealsQuery.data ? (dealCounts.get(broker.id) ?? 0) : broker.dealCount,
    [dealsQuery.data, dealCounts],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerBroker | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toggleTarget, setToggleTarget] = useState<ToggleTarget | null>(null);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const selected = useMemo(
    () => (selectedId ? (data?.find((b) => b.id === selectedId) ?? null) : null),
    [data, selectedId],
  );

  const toggleActive = useMutation({
    mutationFn: ({ broker, action }: ToggleTarget) =>
      action === 'deactivate'
        ? api.partnerBrokers.remove(broker.id)
        : api.partnerBrokers.update(broker.id, { isActive: true }),
    onSuccess: (_result, vars) => {
      toast.success(
        vars.action === 'deactivate'
          ? `${vars.broker.name} 파트너를 비활성화했습니다.`
          : `${vars.broker.name} 파트너를 다시 활성화했습니다.`,
      );
      void qc.invalidateQueries({ queryKey: ['partner-brokers'] });
      setToggleTarget(null);
    },
    onError: (_error, vars) =>
      toast.error(
        vars.action === 'deactivate'
          ? '비활성화에 실패했습니다. 다시 시도해 주세요.'
          : '재활성화에 실패했습니다. 다시 시도해 주세요.',
      ),
  });

  const requestToggle = (broker: PartnerBroker) =>
    setToggleTarget({
      broker,
      action: broker.isActive ? 'deactivate' : 'reactivate',
    });

  const columns = useMemo<ColumnDef<PartnerBroker>[]>(
    () => [
      {
        accessorKey: 'name',
        header: () => <TableHeaderLabel icon={<Building2 className="size-4" />} label="사무소명" />,
        size: 240,
        enableSorting: true,
        cell: ({ row }) => <BrokerNameCell broker={row.original} />,
      },
      {
        id: 'identity',
        header: () => <TableHeaderLabel icon={<UserRound className="size-4" />} label="대표/등록" />,
        size: 170,
        enableSorting: false,
        cell: ({ row }) => <BrokerIdentityCell broker={row.original} />,
      },
      {
        accessorKey: 'ceoPhone',
        header: () => <TableHeaderLabel icon={<Phone className="size-4" />} label="대표폰" />,
        size: 160,
        enableSorting: true,
        cell: ({ row }) => <BrokerPhoneCell value={row.original.ceoPhone} />,
      },
      {
        accessorKey: 'phone',
        header: () => <TableHeaderLabel icon={<Phone className="size-4" />} label="사무소 전화" />,
        size: 160,
        enableSorting: true,
        cell: ({ row }) => <BrokerPhoneCell value={row.original.phone} />,
      },
      {
        accessorKey: 'email',
        header: () => <TableHeaderLabel icon={<Mail className="size-4" />} label="이메일" />,
        size: 190,
        enableSorting: false,
        cell: ({ row }) => <BrokerEmailCell value={row.original.email} />,
      },
      {
        accessorKey: 'address',
        header: () => <TableHeaderLabel icon={<MapPin className="size-4" />} label="주소" />,
        size: 240,
        enableSorting: true,
        cell: ({ row }) => <BrokerTextCell value={row.original.address} />,
      },
      {
        accessorKey: 'dealCount',
        header: () => <TableHeaderLabel icon={<Handshake className="size-4" />} label="거래" />,
        size: 96,
        enableSorting: true,
        cell: ({ row }) => <DealCountCell count={resolveDealCount(row.original)} />,
      },
      {
        id: 'linkedOffice',
        header: () => <TableHeaderLabel icon={<Building2 className="size-4" />} label="가입" />,
        size: 96,
        enableSorting: false,
        cell: ({ row }) => <LinkedOfficeCell broker={row.original} />,
      },
      {
        accessorKey: 'memo',
        header: () => <TableHeaderLabel icon={<FileText className="size-4" />} label="메모" />,
        size: 260,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block line-clamp-2 text-[13px] leading-snug text-slate-600">
            {row.original.memo ?? '-'}
          </span>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: () => <TableHeaderLabel icon={<CalendarDays className="size-4" />} label="수정일" />,
        size: 100,
        enableSorting: true,
        cell: ({ row }) => <DateCell value={row.original.updatedAt} relative />,
      },
      {
        id: 'actions',
        header: '',
        size: 76,
        enableSorting: false,
        cell: ({ row }) => (
          <BrokerActionsCell
            broker={row.original}
            onEdit={() => setEditing(row.original)}
            onToggle={() => requestToggle(row.original)}
          />
        ),
      },
    ],
    [resolveDealCount],
  );

  const filteredBrokers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const brokers = data ?? [];
    if (!query) return brokers;
    return brokers.filter((broker) => brokerMatchesSearch(broker, query));
  }, [data, search]);

  const sortedBrokers = useMemo(
    () => sortBrokers(filteredBrokers, sorting, resolveDealCount),
    [filteredBrokers, sorting, resolveDealCount],
  );

  const emptyMessage = search.trim()
    ? '조건에 맞는 중개사무소가 없습니다.'
    : '등록된 중개사무소가 없습니다. 우측 상단 [파트너 추가]로 공동중개 파트너를 등록해 보세요.';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-[calc(100svh-4rem)] min-h-0 flex-col bg-white">
        <PageHeader
          title="파트너 중개사"
          description="공동중개 파트너 사무소 주소록 — 연결 거래와 수수료 분배까지 확인합니다."
          actions={
            <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={() => setCreateOpen(true)}>
              <CirclePlus className="size-3.5" />
              파트너 추가
            </Button>
          }
          className="mb-2 px-6 pt-4"
        />

        <section className="border-b border-slate-200 bg-white px-3 py-0">
          <ViewBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="사무소명, 대표자, 전화, 이메일 검색..."
            actions={
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                <Switch
                  size="sm"
                  checked={includeInactive}
                  onCheckedChange={setIncludeInactive}
                />
                비활성 포함
              </label>
            }
          />
        </section>

        <section className="flex min-h-0 flex-1 bg-white px-6 py-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            {listQuery.isError ? (
              <EmptyState
                icon={AlertTriangle}
                title="파트너 목록을 불러오지 못했습니다"
                description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
                action={
                  <Button variant="outline" size="sm" onClick={() => void listQuery.refetch()}>
                    다시 시도
                  </Button>
                }
              />
            ) : (
              <DataTable
                columns={columns}
                data={sortedBrokers}
                totalCount={sortedBrokers.length}
                pageCount={1}
                page={1}
                pageSize={Math.max(sortedBrokers.length, 1)}
                sorting={sorting}
                onSortingChange={setSorting}
                pinnedColumns={['name']}
                layout="full-height"
                variant="notion"
                rowHeight="auto"
                isLoading={listQuery.isLoading}
                emptyMessage={emptyMessage}
                onRowClick={(broker) => setSelectedId(broker.id)}
                renderStatusBar={() => (
                  <span>
                    {sortedBrokers.length.toLocaleString()} / {(data?.length ?? 0).toLocaleString()}개 표시
                  </span>
                )}
              />
            )}
          </div>
        </section>

        <BrokerDetailSheet
          broker={selected}
          onClose={() => setSelectedId(null)}
          onEdit={(broker) => setEditing(broker)}
          onToggleActive={requestToggle}
        />

        <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
        <EditDialog broker={editing} onOpenChange={(v) => !v && setEditing(null)} />

        <ConfirmDialog
          open={!!toggleTarget}
          onOpenChange={(open) => !open && setToggleTarget(null)}
          title={
            toggleTarget
              ? toggleTarget.action === 'reactivate'
                ? `${toggleTarget.broker.name} 파트너를 재활성화할까요?`
                : `${toggleTarget.broker.name} 파트너를 비활성화할까요?`
              : ''
          }
          description={
            toggleTarget?.action === 'reactivate'
              ? '재활성화하면 거래 등록 시 공동중개 상대로 다시 선택할 수 있습니다.'
              : '비활성화해도 기존 거래 연결은 유지되며, [비활성 포함] 토글로 언제든 다시 볼 수 있습니다.'
          }
          confirmLabel={toggleTarget?.action === 'reactivate' ? '재활성화' : '비활성화'}
          destructive={toggleTarget?.action === 'deactivate'}
          loading={toggleActive.isPending}
          onConfirm={() => {
            if (toggleTarget) toggleActive.mutate(toggleTarget);
          }}
        />
      </div>
    </TooltipProvider>
  );
}

function TableHeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-slate-500">
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function BrokerNameCell({ broker }: { broker: PartnerBroker }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-1">
      <span className="truncate text-[13px] font-medium text-slate-900">
        {broker.name}
      </span>
      {!broker.isActive && (
        <span className="text-[12px] text-slate-400">비활성</span>
      )}
    </div>
  );
}

function BrokerIdentityCell({ broker }: { broker: PartnerBroker }) {
  if (!broker.ceoName && !broker.licenseNo) {
    return <span className="text-[13px] text-slate-400">-</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-1">
      {broker.ceoName && (
        <span className="truncate text-[13px] font-medium text-slate-800">
          {broker.ceoName}
        </span>
      )}
      {broker.licenseNo && (
        <span className="truncate text-[12px] tabular-nums text-slate-500">
          {broker.licenseNo}
        </span>
      )}
    </div>
  );
}

function BrokerTextCell({ value }: { value?: string | null }) {
  if (!value) return <span className="text-[13px] text-slate-400">-</span>;

  return (
    <span className="block truncate text-[13px] text-slate-700">{value}</span>
  );
}

function BrokerPhoneCell({ value }: { value?: string | null }) {
  if (!value) return <span className="text-[13px] text-slate-400">-</span>;

  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <a
        href={`tel:${value.replace(/[^0-9+]/g, '')}`}
        onClick={(event) => event.stopPropagation()}
        className="truncate text-[13px] tabular-nums text-slate-700 hover:underline"
      >
        {formatPhone(value)}
      </a>
      <CopyIconButton value={formatPhone(value)} label="전화번호" />
    </span>
  );
}

function BrokerEmailCell({ value }: { value?: string | null }) {
  if (!value) return <span className="text-[13px] text-slate-400">-</span>;

  return (
    <a
      href={`mailto:${value}`}
      onClick={(event) => event.stopPropagation()}
      className="block truncate text-[13px] text-slate-700 hover:underline"
    >
      {value}
    </a>
  );
}

function DealCountCell({ count }: { count: number }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
        count > 0 ? 'bg-[#e7f3f8] text-[#337ea9]' : 'bg-[#f1f1ef] text-[#787774]',
      )}
    >
      거래 {count}
    </span>
  );
}

function LinkedOfficeCell({ broker }: { broker: PartnerBroker }) {
  const linked = Boolean(broker.linkedOfficeId);

  return (
    <span
      className={cn(
        'inline-flex rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5',
        linked ? 'bg-[#eef3ed] text-[#44745a]' : 'bg-[#f1f1ef] text-[#787774]',
      )}
    >
      {linked ? 'ERP 가입' : '외부'}
    </span>
  );
}

function BrokerActionsCell({
  broker,
  onEdit,
  onToggle,
}: {
  broker: PartnerBroker;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            aria-label="수정"
            variant="ghost"
            size="icon-xs"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
          >
            <Pencil className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>수정</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            aria-label={broker.isActive ? '비활성화' : '재활성화'}
            variant="ghost"
            size="icon-xs"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {broker.isActive ? (
              <Trash2 className="size-3.5" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{broker.isActive ? '비활성화' : '재활성화'}</TooltipContent>
      </Tooltip>
    </div>
  );
}
