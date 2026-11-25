/**
 * 외부 AI 연결 — 먼저 OAuth 커넥터(주소 붙여 넣기 → 본인 계정으로 로그인·동의), 아래 접힌 구역에 자동화용 API 키.
 * 근거: .claude/rules/mcp.md 인증 절(외부 AI 클라이언트는 OAuth, 자동화는 API 키 `esk_…`)과
 * apps/server/src/modules/mcp/mcp-auth.guard.ts. 서버의 MCP·인증은 여기서 바꾸지 않는다.
 * Claude·ChatGPT의 메뉴 이름은 제품이 자주 바꾸므로 "커넥터 추가"처럼 일반적으로만 적는다.
 * 주소는 API base URL(VITE_API_BASE_URL) 기준으로 계산한다 — 배포 빌드에서는 https://api.estaitt.com/mcp.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Copy, KeyRound, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { ConfirmDialog } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * MCP 엔드포인트 계산.
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

/** 개발 실행에서 나오는 이 컴퓨터 주소인가 (외부 AI 서비스는 닿지 못한다) */
function isLocalEndpoint(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local');
  } catch {
    return false;
  }
}

function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500);
    } catch {
      toast.error('복사하지 못했습니다. 주소를 직접 골라 복사해 주세요.');
    }
  };
  return { copiedKey, copy };
}

export function McpApiKeyCard() {
  const { t } = useTranslation('settings');
  const qc = useQueryClient();
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [keySectionOpen, setKeySectionOpen] = useState(false);
  const { copiedKey, copy } = useCopy();

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
      setKeySectionOpen(true);
      toast.success('새 API 키를 발급했습니다. 지금 복사해 보관하세요.');
      qc.invalidateQueries({ queryKey: ['mcp-api-key'] });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, 'API 키를 발급하지 못했습니다. 다시 시도해 주세요.')),
  });

  const revokeMutation = useMutation({
    mutationFn: () => api.mcp.revokeApiKey(),
    onSuccess: () => {
      setFreshKey(null);
      setRevokeOpen(false);
      toast.success('API 키를 폐기했습니다.');
      qc.invalidateQueries({ queryKey: ['mcp-api-key'] });
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, 'API 키를 폐기하지 못했습니다. 다시 시도해 주세요.')),
  });

  const endpoint = resolveMcpEndpoint();
  const localEndpoint = isLocalEndpoint(endpoint);

  return (
    <section className="border-y border-border/70">
      {/* 1. 커넥터로 연결 (OAuth) — 직원도 각자 이렇게 연결한다 */}
      <div className="pt-4">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">Claude·ChatGPT에 연결하기</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            쓰는 AI의 설정에서 커넥터(사용자 지정 커넥터)를 추가하고, 아래 주소를 붙여 넣은 뒤
            본인 에스테잇플로우 계정으로 로그인하고 동의하면 됩니다. 직원도 각자 자기 계정으로 연결합니다.
          </p>
        </div>
      </div>
      <div className="space-y-2 pb-4 pt-3">
        <ol className="list-decimal space-y-1 pl-5 text-[12px] leading-5 text-muted-foreground">
          <li>Claude 또는 ChatGPT의 설정에서 커넥터 추가를 엽니다.</li>
          <li>아래 주소를 붙여 넣습니다.</li>
          <li>로그인 창이 뜨면 본인 에스테잇플로우 계정으로 로그인하고 접근에 동의합니다.</li>
        </ol>
        <div className="flex items-center gap-2">
          <code
            className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5 font-mono text-[12px]"
            aria-label="연결 주소"
          >
            {endpoint}
          </code>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1"
            onClick={() => void copy('endpoint', endpoint)}
          >
            {copiedKey === 'endpoint' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copiedKey === 'endpoint' ? '복사함' : '주소 복사'}
          </Button>
        </div>
        {localEndpoint ? (
          <p className="text-[11px] text-muted-foreground">
            개발 서버 주소입니다. 외부 AI는 이 주소에 닿지 못할 수 있습니다.
          </p>
        ) : null}
      </div>

      {/* 2. 자동화·Claude Code용 API 키 — 평소에는 접어 둔다 */}
      <Collapsible open={keySectionOpen} onOpenChange={setKeySectionOpen} className="border-t border-border/70">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-3.5 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/35"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">자동화·Claude Code용 API 키</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {status?.hasKey ? '발급한 키가 있습니다' : '사무소 PC의 자동화 도구나 Claude Code에 넣는 키'}
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 pb-5 pt-1">
            <p className="rounded-md bg-warning-soft/45 px-3 py-2 text-xs leading-5 text-warning-strong">
              만료가 없습니다. 대표 계정의 키를 직원과 나눠 쓰지 마세요. 직원은 각자 커넥터로 로그인합니다.
            </p>
            {isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : isError ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-muted-foreground">키 상태를 불러오지 못했습니다.</p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  <RotateCw className="size-3.5" />
                  다시 시도
                </Button>
              </div>
            ) : freshKey ? (
              <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-[13px] dark:border-amber-900/60 dark:bg-amber-950/20">
                <p className="text-amber-800 dark:text-amber-200">{t('mcp.justGenerated')}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1.5 font-mono text-[12px]">
                    {freshKey}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void copy('key', freshKey)}
                    className="gap-1"
                  >
                    {copiedKey === 'key' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copiedKey === 'key' ? t('mcp.copied') : t('mcp.copy')}
                  </Button>
                </div>
                <p className="text-[12px] leading-5 text-muted-foreground">
                  자동화 도구에는 위 주소와 이 키를 <code className="font-mono">Authorization: Bearer 키</code>{' '}
                  모양으로 넣습니다.
                </p>
                <Button size="sm" variant="ghost" onClick={() => setFreshKey(null)}>
                  {t('mcp.dismiss')}
                </Button>
              </div>
            ) : status?.hasKey ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-[11px] text-muted-foreground">{t('mcp.currentPrefix')}</p>
                  <code className="rounded bg-muted px-2 py-1 font-mono text-[12px]">
                    {status.prefix}···
                  </code>
                </div>
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
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-muted-foreground">{t('mcp.empty')}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                  className="gap-1"
                >
                  <KeyRound className="size-3.5" />
                  {generateMutation.isPending ? t('mcp.generating') : t('mcp.generate')}
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title="API 키 폐기"
        description={t('mcp.revokeConfirm')}
        confirmLabel={t('mcp.revoke')}
        destructive
        loading={revokeMutation.isPending}
        onConfirm={() => revokeMutation.mutate()}
      />
    </section>
  );
}
