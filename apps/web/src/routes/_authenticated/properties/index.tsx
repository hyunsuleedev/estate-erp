import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatPrice, sqmToPyeong } from '@estate-erp/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const transactionTypeLabels: Record<string, string> = {
  sale: '매매', jeonse: '전세', monthly: '월세',
};

const checkStatusLabels: Record<string, string> = {
  unverified: '미확인', verified: '확인', in_contract: '계약중', hold: '보류', done: '완료',
};

const checkStatusColors: Record<string, string> = {
  unverified: 'bg-gray-100 text-gray-600',
  verified: 'bg-emerald-50 text-emerald-700',
  in_contract: 'bg-blue-50 text-blue-700',
  hold: 'bg-amber-50 text-amber-700',
  done: 'bg-gray-50 text-gray-400',
};

export const Route = createFileRoute('/_authenticated/properties/')({
  component: PropertiesPage,
});

function PropertiesPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    transactionType: '',
    checkStatus: '',
    search: '',
    includeHidden: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['properties', page, filters],
    queryFn: () =>
      api.properties.findAll({
        page,
        limit: 20,
        transactionType: filters.transactionType || undefined,
        checkStatus: filters.checkStatus || undefined,
        search: filters.search || undefined,
        includeHidden: filters.includeHidden || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">매물관리</h1>
          <span className="text-xs text-muted-foreground">
            {data?.pagination?.total ?? 0}건
          </span>
        </div>
        <Button size="sm" asChild>
          <Link to="/properties/new">
            <Plus className="size-4" />
            매물 등록
          </Link>
        </Button>
      </div>

      {/* Filter + Table panel */}
      <div className="rounded-xl bg-muted/50">
        {/* Filter bar */}
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
          <Search className="size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="검색..."
            value={filters.search}
            onChange={(e) => {
              setFilters((f) => ({ ...f, search: e.target.value }));
              setPage(1);
            }}
            className="h-7 w-40 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
          />
          <div className="h-4 w-px bg-border/60" />
          <select
            value={filters.transactionType}
            onChange={(e) => {
              setFilters((f) => ({ ...f, transactionType: e.target.value }));
              setPage(1);
            }}
            className="h-7 rounded border-0 bg-transparent px-1 text-sm text-muted-foreground focus:outline-none"
          >
            <option value="">전체 거래유형</option>
            <option value="sale">매매</option>
            <option value="jeonse">전세</option>
            <option value="monthly">월세</option>
          </select>
          <div className="h-4 w-px bg-border/60" />
          <select
            value={filters.checkStatus}
            onChange={(e) => {
              setFilters((f) => ({ ...f, checkStatus: e.target.value }));
              setPage(1);
            }}
            className="h-7 rounded border-0 bg-transparent px-1 text-sm text-muted-foreground focus:outline-none"
          >
            <option value="">전체 상태</option>
            <option value="unverified">미확인</option>
            <option value="verified">확인</option>
            <option value="in_contract">계약중</option>
            <option value="hold">보류</option>
            <option value="done">완료</option>
          </select>
          <div className="h-4 w-px bg-border/60" />
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="includeHidden"
              checked={filters.includeHidden}
              onCheckedChange={(checked) =>
                setFilters((f) => ({ ...f, includeHidden: checked === true }))
              }
              className="size-3.5"
            />
            <Label htmlFor="includeHidden" className="text-xs font-normal text-muted-foreground">
              숨김
            </Label>
          </div>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[11px] font-medium uppercase tracking-wider">단지/건물</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider">호실</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider">거래유형</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider">가격</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider">면적</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider">상태</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider">등록일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  매물이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((p) => (
                <TableRow key={p.id} className="group">
                  <TableCell className="text-sm">
                    <Link
                      to="/properties/$id"
                      params={{ id: p.id }}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {p.site?.name ?? '-'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.unit?.name ?? '-'}</TableCell>
                  <TableCell className="text-sm">
                    {transactionTypeLabels[p.transactionType] ?? p.transactionType}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {p.transactionType === 'monthly'
                      ? `${p.deposit ? formatPrice(p.deposit) : '-'} / ${p.monthlyRent ? formatPrice(p.monthlyRent) : '-'}`
                      : p.price
                        ? formatPrice(p.price)
                        : p.deposit
                          ? formatPrice(p.deposit)
                          : '-'}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {p.unit?.exclusiveAreaM2
                      ? `${sqmToPyeong(Number(p.unit.exclusiveAreaM2))}평`
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                      checkStatusColors[p.checkStatus] ?? 'bg-gray-100 text-gray-600',
                    )}>
                      {checkStatusLabels[p.checkStatus] ?? p.checkStatus}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString('ko-KR')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            이전
          </Button>
          <span className="px-2 text-xs text-muted-foreground">
            {page} / {data.pagination.totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
            disabled={page === data.pagination.totalPages}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}
