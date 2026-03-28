import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const Route = createFileRoute('/_authenticated/contacts/')({
  component: ContactsPage,
});

function ContactsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', page, search],
    queryFn: () =>
      api.contacts.findAll({
        page,
        limit: 20,
        search: search || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">연락처</h1>
          <span className="text-xs text-muted-foreground">
            {data?.pagination?.total ?? 0}건
          </span>
        </div>
        <Button size="sm" asChild>
          <Link to="/contacts/new">
            <Plus className="size-4" />
            연락처 추가
          </Link>
        </Button>
      </div>

      {/* Filter + Table panel */}
      <div className="rounded-xl bg-muted/50">
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
          <Search className="size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="이름, 전화번호 검색..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-7 w-52 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[11px] font-medium uppercase tracking-wider">이름</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider">전화번호</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider">이메일</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider">태그</TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-wider">등록일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                  연락처가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((c) => (
                <TableRow key={c.id} className="group">
                  <TableCell className="text-sm">
                    <Link
                      to="/contacts/$id"
                      params={{ id: c.id }}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {c.phone ?? '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.email ?? '-'}
                  </TableCell>
                  <TableCell>
                    {c.tags?.length > 0 ? (
                      <div className="flex gap-1">
                        {c.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString('ko-KR')}
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
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>이전</Button>
          <span className="px-2 text-xs text-muted-foreground">{page} / {data.pagination.totalPages}</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))} disabled={page === data.pagination.totalPages}>다음</Button>
        </div>
      )}
    </div>
  );
}
