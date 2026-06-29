import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const operatingAgentItems = [
  '매물 정리봇: 가격 변동, 확인일 경과, 숨김 후보를 정리합니다.',
  '상담 요약봇: 통화/상담 기록을 요약하고 후속 업무를 제안합니다.',
  '계약 체크봇: 계약금, 중도금, 잔금 일정 누락을 감시합니다.',
  '네트워크 매칭봇: 공유 매물과 문의 흐름을 따라 후속 액션을 만듭니다.',
];

const approvalGateItems = [
  '고객에게 직접 발송되는 메시지/알림',
  '계약 상태, 거래 단계 등 핵심 상태 변경',
  '연락처 병합, 삭제, 개인정보 정리',
  '외부 네트워크 공유/회수 같은 대외 액션',
];

const auditItems = [
  '모든 실행을 run 단위로 기록하고 ActivityLog와 연결',
  '어떤 규칙과 컨텍스트로 실행됐는지 추적',
  '비용, 도구 호출, 결과 생성물을 한 화면에 집계',
];

const phaseOneItems = [
  'AI는 우선 Task, Insight, CalendarEvent 생성까지만 허용',
  '승인이 필요한 액션은 승인 대기함으로만 적재',
  '사무소별 규칙, 예산, 에이전트 활성화 상태를 분리 관리',
];

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-sm text-foreground/90">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-primary/70" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** AI 운영 원칙 — 기존 콘셉트 카드 4종 (control plane 설계 원칙 안내) */
export function PrinciplesTab() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>운영 에이전트</CardTitle>
          <CardDescription>업무 단위별로 책임이 분리된 AI 워커를 둡니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <BulletList items={operatingAgentItems} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>승인 게이트</CardTitle>
          <CardDescription>
            고객/거래/외부 네트워크에 영향이 있는 액션은 자동 실행하지 않습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BulletList items={approvalGateItems} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>실행 이력과 비용</CardTitle>
          <CardDescription>
            누가 무엇을 왜 실행했는지 남겨서 사후 감사가 가능해야 합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BulletList items={auditItems} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1차 구현 범위</CardTitle>
          <CardDescription>
            기존 Task, Insight, CalendarEvent, ActivityLog를 활용해 작게 시작합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BulletList items={phaseOneItems} />
        </CardContent>
      </Card>
    </div>
  );
}
