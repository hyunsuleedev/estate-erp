import { createFileRoute } from '@tanstack/react-router';
import { Bot, ScrollText } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/_authenticated/ai-operations/history')({
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Bot className="size-5" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">실행 이력</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            처리된 제안(승인 · 거부 · 실행 · 만료) 을 시간 순으로 보관합니다.
            "이거 저번에 어떻게 처리했더라?" 질문에 답하는 아카이브입니다.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <ScrollText className="size-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Phase 1 후반 예정</CardTitle>
              <CardDescription>
                AI 제안(`/ai-operations/proposals`)에서 상태 필터로
                `승인됨/거부됨/실행 완료/만료`를 선택하면 이력 조회가 가능합니다.
                별도 테이블 뷰는 추후 이 페이지에 추가됩니다.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">필터: 날짜 · 타입 · 출처</Badge>
            <Badge variant="outline">페이지네이션</Badge>
            <Badge variant="outline">거부 사유 분석</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
