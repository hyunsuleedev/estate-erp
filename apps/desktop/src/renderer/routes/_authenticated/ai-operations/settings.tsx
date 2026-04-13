import { createFileRoute } from '@tanstack/react-router';
import { Bot, ShieldCheck, Sliders } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/_authenticated/ai-operations/settings')({
  component: AgentSettingsPage,
});

function AgentSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Bot className="size-5" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">AI 직원 설정</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            신뢰 계층(Trust Tier), 전체 on/off, MCP 권한 기본값을 조정합니다.
            Phase 1 후반에 순차적으로 활성화됩니다.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">신뢰 계층 오버라이드</CardTitle>
              <CardDescription>
                제안 타입별로 자동 실행(auto) / 승인 필요(approval_required) /
                알림만(inform_only) 을 직접 지정해요. 기본값은
                <code className="mx-1 rounded bg-muted px-1 text-xs">
                  approval_required
                </code>
                (승인 피로 방지).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">ad_takedown</Badge>
          <Badge variant="outline">lease_renewal_notice</Badge>
          <Badge variant="outline">new_external_listings</Badge>
          <Badge variant="secondary">Phase 1 후반 예정</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Sliders className="size-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">MCP 권한 역할 기본값</CardTitle>
              <CardDescription>
                외부 AI(Claude/ChatGPT) 가 MCP로 접근할 때 역할별(owner /
                manager / agent) 기본 권한을 정의합니다. 개별 사용자 권한은
                사용자 관리에서 오버라이드 가능.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Badge variant="secondary">Phase 2 예정</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
