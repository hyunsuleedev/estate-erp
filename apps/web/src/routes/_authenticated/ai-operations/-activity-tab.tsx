import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RefreshCw, ScrollText } from 'lucide-react';
import type { ActivityLog } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { EmptyState, FilterBar, FilterCount, FilterSelect } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ENTITY_TYPE_OPTIONS = [
  { value: 'Listing', label: '매물' },
  { value: 'ListingIntake', label: '의뢰' },
  { value: 'Property', label: '매물(관리)' },
  { value: 'Contact', label: '연락처' },
  { value: 'Deal', label: '거래' },
  { value: 'Contract', label: '계약' },
  { value: 'Task', label: '업무' },
  { value: 'Consultation', label: '상담' },
  { value: 'Match', label: '매칭' },
  { value: 'BuyerRequirement', label: '구매고객' },
  { value: 'Tenant', label: '세입자' },
];

const ACTION_LABELS: Record<string, string> = {
  create: '생성',
  update: '수정',
  delete: '삭제',
};

const SOURCE_META: Record<string, { label: string; className: string }> = {
  web: { label: '웹', className: 'bg-neutral-soft text-neutral-strong' },
  mcp: { label: 'MCP', className: 'bg-violet-soft text-violet' },
  system: { label: '시스템', className: 'bg-info-soft text-info' },
};

function entityTypeLabel(entityType: string): string {
  return (
    ENTITY_TYPE_OPTIONS.find((o) => o.value === entityType)?.label ?? entityType
  );
}

function actorLabel(log: ActivityLog): string {
  if (log.user?.name) return log.user.name;
  if (log.actor.startsWith('system')) return '시스템';
  if (log.actor.startsWith('mcp')) return `AI (${log.actor.slice(4) || 'MCP'})`;
  return log.actor === 'user' ? '사용자' : log.actor;
}

function changesSummary(log: ActivityLog): string {
  if (log.reason) return log.reason;
  if (!log.changes) return '—';
  const keys = Object.keys(log.changes);
  if (keys.length === 0) return '—';
  const shown = keys.slice(0, 4).join(', ');
  return keys.length > 4 ? `${shown} 외 ${keys.length - 4}건` : shown;
}

export function ActivityTab() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['activity-logs', { page, entityType: entityType || undefined }],
    queryFn: () =>
      api.activityLogs.list({
        page,
        limit: 50,
        entityType: entityType || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border py-12">
        <p className="text-sm text-muted-foreground">실행 로그를 불러오지 못했습니다.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="size-3.5" />
          다시 시도
        </Button>
      </div>
    );
  }

  const logs = data?.items ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-3">
      <FilterBar>
        <FilterSelect
          label="대상"
          value={entityType}
          onChange={(v) => {
            setEntityType(v);
            setPage(1);
          }}
          options={ENTITY_TYPE_OPTIONS}
        />
        <FilterCount n={pagination?.total ?? 0} />
      </FilterBar>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="기록된 활동이 없습니다"
          description="데이터가 변경되면 감사 로그가 이곳에 쌓입니다."
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs text-muted-foreground">시각</TableHead>
                  <TableHead className="text-xs text-muted-foreground">행위자</TableHead>
                  <TableHead className="text-xs text-muted-foreground">출처</TableHead>
                  <TableHead className="text-xs text-muted-foreground">작업</TableHead>
                  <TableHead className="text-xs text-muted-foreground">대상</TableHead>
                  <TableHead className="text-xs text-muted-foreground">변경 내용</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const source = SOURCE_META[log.source] ?? {
                    label: log.source,
                    className: 'bg-neutral-soft text-neutral-strong',
                  };
                  return (
                    <TableRow key={log.id} className="h-10 text-sm">
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate">
                        {actorLabel(log)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`border-0 text-[10px] ${source.className}`}
                        >
                          {source.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </TableCell>
                      <TableCell className="text-xs">
                        {entityTypeLabel(log.entityType)}
                        <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                          {log.entityId.slice(0, 8)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                        {changesSummary(log)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {pagination.page} / {pagination.totalPages} 페이지
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="이전 페이지"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="다음 페이지"
                disabled={page >= pagination.totalPages || isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
