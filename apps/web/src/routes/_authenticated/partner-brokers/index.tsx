import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  Building2,
  CalendarDays,
  CirclePlus,
  FileText,
  Handshake,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  UserRound,
} from 'lucide-react';
import type {
  CreatePartnerBrokerDto,
  PartnerBroker,
  UpdatePartnerBrokerDto,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DataTable, DateCell, ViewBar } from '@/components/data-table';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const Route = createFileRoute('/_authenticated/partner-brokers/')({
  component: PartnerBrokersPage,
});

function PartnerBrokersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['partner-brokers'],
    queryFn: () => api.partnerBrokers.list(),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerBroker | null>(null);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

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
        size: 150,
        enableSorting: true,
        cell: ({ row }) => <BrokerTextCell value={row.original.ceoPhone} tabular />,
      },
      {
        accessorKey: 'phone',
        header: () => <TableHeaderLabel icon={<Phone className="size-4" />} label="사무소 전화" />,
        size: 150,
        enableSorting: true,
        cell: ({ row }) => <BrokerTextCell value={row.original.phone} tabular />,
      },
      {
        accessorKey: 'address',
        header: () => <TableHeaderLabel icon={<MapPin className="size-4" />} label="주소" />,
        size: 260,
        enableSorting: true,
        cell: ({ row }) => <BrokerTextCell value={row.original.address} />,
      },
      {
        accessorKey: 'dealCount',
        header: () => <TableHeaderLabel icon={<Handshake className="size-4" />} label="거래" />,
        size: 96,
        enableSorting: true,
        cell: ({ row }) => <DealCountCell count={row.original.dealCount} />,
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
        size: 280,
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
          />
        ),
      },
    ],
    [setEditing],
  );

  const filteredBrokers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const brokers = data ?? [];
    if (!query) return brokers;
    return brokers.filter((broker) => brokerMatchesSearch(broker, query));
  }, [data, search]);

  const sortedBrokers = useMemo(
    () => sortBrokers(filteredBrokers, sorting),
    [filteredBrokers, sorting],
  );

  const emptyMessage = search.trim()
    ? '조건에 맞는 중개사무소가 없습니다.'
    : '등록된 중개사무소가 없습니다.';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-[calc(100svh-5rem)] min-h-0 flex-col bg-white">
        <section className="border-b border-slate-200 bg-white px-3 py-0">
          <ViewBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="사무소명, 대표자, 대표폰 검색..."
            actions={(
              <Button
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs"
                onClick={() => setCreateOpen(true)}
              >
                <CirclePlus className="size-3.5" />
                파트너 추가
              </Button>
            )}
          />
        </section>

        <section className="flex min-h-0 flex-1 bg-white px-6 py-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
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
              isLoading={isLoading}
              emptyMessage={emptyMessage}
              onRowClick={(broker) => setEditing(broker)}
              renderStatusBar={() => (
                <span>
                  {sortedBrokers.length.toLocaleString()} / {(data?.length ?? 0).toLocaleString()}개 표시
                </span>
              )}
            />
          </div>
        </section>

        <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
        <EditDialog
          broker={editing}
          onOpenChange={(v) => !v && setEditing(null)}
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

function BrokerTextCell({
  value,
  tabular = false,
}: {
  value?: string | null;
  tabular?: boolean;
}) {
  if (!value) return <span className="text-[13px] text-slate-400">-</span>;

  return (
    <span
      className={cn(
        'block truncate text-[13px] text-slate-700',
        tabular && 'tabular-nums',
      )}
    >
      {value}
    </span>
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
}: {
  broker: PartnerBroker;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.partnerBrokers.remove(broker.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner-brokers'] }),
  });

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
            aria-label="비활성화"
            variant="ghost"
            size="icon-xs"
            disabled={remove.isPending}
            onClick={(event) => {
              event.stopPropagation();
              if (confirm(`${broker.name} 파트너를 비활성화할까요?`)) {
                remove.mutate();
              }
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>비활성화</TooltipContent>
      </Tooltip>
    </div>
  );
}

function brokerMatchesSearch(broker: PartnerBroker, query: string) {
  return [
    broker.name,
    broker.phone,
    broker.ceoName,
    broker.ceoPhone,
    broker.licenseNo,
    broker.address,
    broker.memo,
  ].some((value) => value?.toLowerCase().includes(query));
}

function sortBrokers(brokers: PartnerBroker[], sorting: SortingState) {
  const activeSort = sorting[0];
  if (!activeSort) return brokers;

  return [...brokers].sort((left, right) => {
    const leftValue = getBrokerSortValue(left, activeSort.id);
    const rightValue = getBrokerSortValue(right, activeSort.id);
    const leftEmpty = isBrokerSortValueEmpty(leftValue);
    const rightEmpty = isBrokerSortValueEmpty(rightValue);

    if (leftEmpty && rightEmpty) return 0;
    if (leftEmpty) return 1;
    if (rightEmpty) return -1;

    const result = compareBrokerValues(leftValue, rightValue);
    return activeSort.desc ? -result : result;
  });
}

function getBrokerSortValue(broker: PartnerBroker, field: string) {
  switch (field) {
    case 'dealCount':
      return broker.dealCount;
    case 'createdAt':
      return Date.parse(broker.createdAt);
    case 'updatedAt':
      return Date.parse(broker.updatedAt);
    case 'name':
      return broker.name;
    case 'phone':
      return broker.phone;
    case 'ceoPhone':
      return broker.ceoPhone;
    case 'address':
      return broker.address;
    default:
      return '';
  }
}

function compareBrokerValues(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right), 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  });
}

function isBrokerSortValueEmpty(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '';
}

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreatePartnerBrokerDto>({ name: '' });

  const mutation = useMutation({
    mutationFn: () => api.partnerBrokers.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-brokers'] });
      onOpenChange(false);
      setForm({ name: '' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>파트너 사무소 추가</DialogTitle>
          <DialogDescription>
            거래 시 공동중개 상대로 선택할 수 있도록 주소록에 저장합니다.
          </DialogDescription>
        </DialogHeader>

        <BrokerFormFields form={form} onChange={setForm} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name}
          >
            <CirclePlus className="size-3.5" />
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  broker,
  onOpenChange,
}: {
  broker: PartnerBroker | null;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<UpdatePartnerBrokerDto>({});

  const open = !!broker;

  useEffect(() => {
    if (!broker) {
      setForm({});
      return;
    }

    setForm({
      name: broker.name,
      phone: broker.phone ?? undefined,
      ceoName: broker.ceoName ?? undefined,
      ceoPhone: broker.ceoPhone ?? undefined,
      licenseNo: broker.licenseNo ?? undefined,
      address: broker.address ?? undefined,
      memo: broker.memo ?? undefined,
    });
  }, [broker]);

  const handleOpenChange = (v: boolean) => {
    if (!v) setForm({});
    onOpenChange(v);
  };

  const mutation = useMutation({
    mutationFn: () => api.partnerBrokers.update(broker!.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-brokers'] });
      handleOpenChange(false);
    },
  });

  if (!broker) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>파트너 사무소 수정</DialogTitle>
          <DialogDescription>
            거래 {broker.dealCount}건 · 이 파트너의 이름/연락처를 업데이트합니다.
          </DialogDescription>
        </DialogHeader>

        <BrokerFormFields
          form={form as CreatePartnerBrokerDto}
          onChange={(f) => setForm(f)}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BrokerFormFields({
  form,
  onChange,
}: {
  form: CreatePartnerBrokerDto;
  onChange: (f: CreatePartnerBrokerDto) => void;
}) {
  const set = <K extends keyof CreatePartnerBrokerDto>(
    key: K,
    value: CreatePartnerBrokerDto[K],
  ) => onChange({ ...form, [key]: value });

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="grid gap-1.5 md:col-span-2">
        <Label>사무소명 *</Label>
        <Input
          value={form.name ?? ''}
          onChange={(e) => set('name', e.target.value)}
          placeholder="예) 중앙부동산공인중개"
        />
      </div>
      <div className="grid gap-1.5">
        <Label>대표자</Label>
        <Input
          value={form.ceoName ?? ''}
          onChange={(e) => set('ceoName', e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>대표폰</Label>
        <Input
          value={form.ceoPhone ?? ''}
          onChange={(e) => set('ceoPhone', e.target.value)}
          placeholder="010-0000-0000"
        />
      </div>
      <div className="grid gap-1.5">
        <Label>등록번호</Label>
        <Input
          value={form.licenseNo ?? ''}
          onChange={(e) => set('licenseNo', e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>전화번호</Label>
        <Input
          value={form.phone ?? ''}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="02-555-1234"
        />
      </div>
      <div className="grid gap-1.5 md:col-span-2">
        <Label>주소</Label>
        <Input
          value={form.address ?? ''}
          onChange={(e) => set('address', e.target.value)}
        />
      </div>
      <div className="grid gap-1.5 md:col-span-2">
        <Label>메모</Label>
        <Textarea
          value={form.memo ?? ''}
          onChange={(e) => set('memo', e.target.value)}
          rows={3}
          placeholder="예) 김사장님 매도 매물 잘 맡김. 공동 50:50 선호."
        />
      </div>
    </div>
  );
}
