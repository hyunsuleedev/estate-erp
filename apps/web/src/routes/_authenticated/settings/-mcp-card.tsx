/**
 * MCP 연결 키 카드 — 발급/폐기/복사 + Claude Desktop 연결 가이드.
 * 엔드포인트는 API base URL(VITE_API_BASE_URL) 기준으로 계산한다 (운영 환경 대응).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { ConfirmDialog } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * MCP SSE 엔드포인트 계산.
 * - VITE_API_BASE_URL이 절대 URL(https://api.estaitt.com)이면 그대로 사용
 * - 아니면 dev proxy 경로('/api')를 현재 origin에 붙여 사용
 */
function resolveMcpEndpoint(): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '');
  const origin = /^https?:\/\//.test(base)
    ? base
    : `${window.location.origin}${base.startsWith('/') ? base : `/${base}`}`;
  return `${origin}/mcp`;
}

export function McpApiKeyCard({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const {
    data: status,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['mcp-api-key'],
    queryFn: () => api.mcp.getApiKeyStatus(),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.mcp.generateApiKey(),
    onSuccess: (res) => {
      setFreshKey(res.key);
      toast.success('새 MCP 키를 발급했습니다. 지금 복사해 보관하세요.');
      qc.invalidateQueries({ queryKey: ['mcp-api-key'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'MCP 키 발급에 실패했습니다.'),
  });

  const revokeMutation = useMutation({
    mutationFn: () => api.mcp.revokeApiKey(),
    onSuccess: () => {
      setFreshKey(null);
      setRevokeOpen(false);
      toast.success('MCP 키를 폐기했습니다.');
      qc.invalidateQueries({ queryKey: ['mcp-api-key'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'MCP 키 폐기에 실패했습니다.'),
  });

  const handleCopy = async () => {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('클립보드 복사에 실패했습니다.');
    }
  };

  const endpoint = resolveMcpEndpoint();
  const configJson = freshKey
    ? JSON.stringify(
        {
          mcpServers: {
            'estate-erp': {
              url: endpoint,
              headers: { Authorization: `Bearer ${freshKey}` },
            },
          },
        },
        null,
        2,
      )
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" />
          {t('sections.mcp')}
        </CardTitle>
        <CardDescription>{t('sections.mcpDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">
              키 상태를 불러오지 못했습니다.
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RotateCw className="size-3.5" />
              다시 시도
            </Button>
          </div>
        ) : freshKey ? (
          <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-[13px] dark:border-amber-900/60 dark:bg-amber-950/20">
            <p className="text-amber-800 dark:text-amber-200">
              {t('mcp.justGenerated')}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 font-mono text-[12px]">
                {freshKey}
              </code>
              <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? t('mcp.copied') : t('mcp.copy')}
              </Button>
            </div>

            <div className="space-y-2 rounded-md bg-background p-3">
              <p className="text-[12px] font-semibold">{t('mcp.guideTitle')}</p>
              <ol className="list-decimal space-y-1 pl-5 text-[12px] text-muted-foreground">
                <li>{t('mcp.guideStep1')}</li>
                <li>{t('mcp.guideStep2')}</li>
              </ol>
              <pre className="overflow-x-auto rounded bg-muted/60 p-2 text-[11px]">
                {configJson}
              </pre>
              <p className="text-[11px] text-muted-foreground">
                <span className="font-semibold">{t('mcp.endpointLabel')}:</span>{' '}
                <code>{endpoint}</code>
              </p>
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFreshKey(null);
                setCopied(false);
              }}
            >
              {t('mcp.dismiss')}
            </Button>
          </div>
        ) : status?.hasKey ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-[11px] text-muted-foreground">
                {t('mcp.currentPrefix')}
              </p>
              <code className="rounded bg-muted px-2 py-1 font-mono text-[12px]">
                {status.prefix}···
              </code>
            </div>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-destructive"
                onClick={() => setRevokeOpen(true)}
                disabled={revokeMutation.isPending}
              >
                <Trash2 className="size-3.5" />
                {revokeMutation.isPending ? t('mcp.revoking') : t('mcp.revoke')}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">{t('mcp.empty')}</p>
            {canEdit ? (
              <Button
                size="sm"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="gap-1"
              >
                <KeyRound className="size-3.5" />
                {generateMutation.isPending
                  ? t('mcp.generating')
                  : t('mcp.generate')}
              </Button>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                {t('mcp.ownerOnly')}
              </p>
            )}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title="MCP 키 폐기"
        description={t('mcp.revokeConfirm')}
        confirmLabel={t('mcp.revoke')}
        destructive
        loading={revokeMutation.isPending}
        onConfirm={() => revokeMutation.mutate()}
      />
    </Card>
  );
}
