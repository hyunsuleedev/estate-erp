# AI 운영 설계 메모

`Paperclip`의 핵심 아이디어인 control plane, governance, audit, budget, ticketing을
`Estate ERP`에 맞게 번안한 1차 설계 메모다.

## 1. 제품 프레이밍

- 목표는 "제로휴먼 회사"가 아니라 "중개사무소용 AI 운영 콘솔"이다.
- AI는 사람을 대체하는 주체가 아니라, 규칙 기반으로 보조 업무를 수행하는 워커다.
- 고객/거래/대외 액션은 승인 기반으로 처리한다.

## 2. 초기 화면 구성

- `AI 운영 > 에이전트`
- `AI 운영 > 승인 대기`
- `AI 운영 > 실행 이력`
- `AI 운영 > 규칙`
- `AI 운영 > 비용`

현재는 상위 진입 페이지부터 연결하고, 하위 탭은 이후 단계에서 추가한다.

## 3. 기존 모델과의 연결

현재 스키마에 이미 다음 모델이 존재한다.

- `Task`: 후속 액션 생성 대상
- `Insight`: 규칙 엔진/AI 감지 결과 저장
- `InsightRule`: 사무소별 자동화 규칙 설정
- `CalendarEvent`: 일정성 액션 생성
- `ActivityLog`: 실행 감사 추적

따라서 1차 구현은 새 모델을 크게 늘리기보다, 기존 모델을 AI 운영 콘솔 관점으로 묶어
보여주는 것부터 시작하는 것이 안전하다.

## 4. MVP 원칙

- AI는 1차에서 `Task`, `Insight`, `CalendarEvent` 생성만 수행한다.
- 상태 변경, 메시지 발송, 네트워크 공유는 승인 대기만 만든다.
- 모든 실행은 `ActivityLog`와 연결해 추적한다.
- 사무소별 활성화 여부와 예산은 분리 관리한다.

## 5. 권장 Prisma 추가 모델

실제 자동화가 붙기 시작하면 아래 모델을 추가하는 편이 좋다.

### AgentProfile

- 사무소별 에이전트 정의
- 예: `listing-curator`, `consultation-summarizer`, `contract-checker`
- 주요 필드
  - `office_id`
  - `key`
  - `name`
  - `description`
  - `is_active`
  - `budget_monthly`
  - `config` (`JsonB`)

### AgentRun

- 개별 실행 단위
- 주요 필드
  - `office_id`
  - `agent_profile_id`
  - `status` (`queued`, `running`, `completed`, `failed`, `awaiting_approval`)
  - `trigger_type` (`rule`, `schedule`, `manual`, `event`)
  - `trigger_ref_type`
  - `trigger_ref_id`
  - `input_context` (`JsonB`)
  - `output_summary`
  - `cost_input_tokens`
  - `cost_output_tokens`
  - `cost_krw`
  - `started_at`
  - `finished_at`

### AgentApproval

- 승인 필요 액션 큐
- 주요 필드
  - `office_id`
  - `agent_run_id`
  - `approval_type` (`message_send`, `deal_update`, `contact_merge`, `network_share`)
  - `title`
  - `payload` (`JsonB`)
  - `status` (`pending`, `approved`, `rejected`, `expired`)
  - `approved_by`
  - `approved_at`

## 6. 권장 NestJS 모듈

- `ai-operations`
  - 대시보드 집계
  - 에이전트 상태 조회
  - 승인 대기 목록
- `agent-runs`
  - 실행 생성/재시도/상태 조회
- `agent-approvals`
  - 승인/반려 처리
- `agent-rules`
  - `InsightRule`와 연동되는 규칙 관리

## 7. 이벤트 트리거 후보

- 새 상담 생성
- 통화 종료 후 상담 요약 필요
- 매물 확인일 경과
- 가격 변경 감지
- 계약금/중도금/잔금 일정 임박
- 네트워크 문의 도착 후 미응답

## 8. 구현 순서

1. `AI 운영` 메뉴 및 진입 화면 추가
2. `InsightRule` 기반 자동 태스크/인사이트 생성
3. `AgentRun`, `AgentApproval` 모델 추가
4. 승인 대기함과 실행 이력 UI 추가
5. 비용/예산 집계 및 제한

## 9. 하지 말아야 할 것

- 초기부터 고객 메시지를 자동 발송하지 않기
- 계약/거래 상태를 승인 없이 직접 변경하지 않기
- 장시간 무제한 루프 에이전트를 허용하지 않기
- 사무소별 격리 없는 공용 AI 상태를 만들지 않기
