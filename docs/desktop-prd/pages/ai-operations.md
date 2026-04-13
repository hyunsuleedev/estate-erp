# AI Operations

## 메타

- 페이지명: AI Operations
- 문서 상태: draft
- 우선순위: P0
- Phase: Phase 2
- 구현 상태: draft overview exists
- 작성일: 2026-04-02
- 최종 수정일: 2026-04-03
- 관련 엔터티: Task, Insight, InsightRule, CalendarEvent, ActivityLog, AgentProfile(future), AgentRun(future), AgentApproval(future), Notification
- 관련 API:
  - `GET /ai-operations/overview`
  - `GET /ai-operations/agents`
  - `PATCH /ai-operations/agents/:id`
  - `GET /ai-operations/approvals`
  - `PATCH /ai-operations/approvals/:id`
  - `GET /ai-operations/runs`
  - `GET /ai-operations/rules`
  - `PATCH /ai-operations/rules/:id`
  - `GET /ai-operations/costs`
- 관련 화면: AI Chat, Tasks, Calendar, Matches, Deals, Network, Notifications

현재 결정:

- 이 문서는 desktop의 `AI 운영` 페이지를 기준으로 작성한다.
- `AI Chat`은 사용자용 작업 화면이고, `AI 운영`은 owner/manager용 통제 화면으로 분리한다.
- 이 페이지는 `AI가 대신 일하는 화면`이 아니라 `사람이 AI 자동화를 통제하는 control plane`이다.
- 초기 버전은 새 모델을 크게 늘리기보다 기존 `Task`, `Insight`, `InsightRule`, `CalendarEvent`, `ActivityLog`를 AI 운영 관점으로 묶어 보여주는 데 집중한다.
- 초기 버전에서 AI가 직접 확정 실행할 수 있는 범위는 `Task`, `Insight`, `CalendarEvent` 생성까지로 제한한다.
- 고객 메시지 발송, 계약/거래 상태 변경, 연락처 병합/삭제, 외부 네트워크 공유 같은 대외 액션은 `승인 대기`로만 적재한다.
- 장기적으로는 `AgentProfile`, `AgentRun`, `AgentApproval` 모델을 추가해 실제 실행 단위와 비용, 승인 게이트를 정교하게 관리한다.

## 1. 페이지 목적

- 이 페이지가 해결해야 하는 핵심 업무:
  - 사무소별 활성 AI 에이전트와 규칙을 관리한다.
  - 승인 필요한 AI 액션을 한곳에서 검토하고 처리한다.
  - 실행 이력, 결과물, 비용을 run 단위로 추적한다.
  - 어떤 자동화가 어떤 업무를 만들었는지 감사 가능하게 남긴다.
- primary 사용자:
  - owner
- secondary 사용자:
  - manager
- 이 페이지가 필요한 이유:
  - 자동화가 늘수록 `무엇이 자동으로 실행되고 있고 어디까지 허용되는지`를 통제하는 콘솔이 필요하다.
  - 중개 실무에서는 편의성보다 `고객/거래/대외 액션의 통제 가능성`이 더 중요하다.
  - 이 화면이 없으면 AI 기능이 산발적인 토글과 로그로 흩어져 관리가 어려워진다.

## 2. 사용 시점

- 사용자가 이 페이지에 들어오는 대표 상황:
  - 어떤 AI 에이전트가 켜져 있는지 확인할 때
  - 승인 대기 중인 액션을 검토할 때
  - 특정 실행이 어떤 Task/Insight를 만들었는지 추적할 때
  - 월간 비용 또는 에이전트별 사용량을 볼 때
  - 규칙이 과도하게 실행되거나 오작동하는지 점검할 때
- 진입 경로:
  - 사이드바 `AI 운영`
  - 사이드바 `AI Chat`에서 실행 상세 또는 승인 대기 역진입
  - Notification의 승인 대기 알림
  - Task/Insight/ActivityLog에서 관련 실행 역진입
- 이전 화면:
  - Tasks
  - Deals
  - Matches
  - Network
- 다음 화면:
  - Agent Detail Drawer
  - Approval Detail Drawer
  - Run Detail Drawer
  - 관련 Task / Insight / Calendar / ActivityLog 화면
- 이 페이지를 나가는 대표 액션:
  - 에이전트 활성/비활성
  - 승인 처리
  - 실행 상세 열기
  - 규칙 수정

## 3. 사용자 역할과 권한

| 역할 | 조회 | 생성 | 수정 | 삭제 | 승인/확정 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| owner | 전체 조회 | 가능 | 가능 | 가능 | 가능 | 최종 통제자 |
| manager | 전체 조회 | 제한적 | 가능 | 제한적 | 가능 | 팀 운영 수준 조정 |
| agent | 제한적 조회 | 불가 | 불가 | 불가 | 불가 | 향후 읽기 전용 일부만 검토 가능 |

권한 메모:

- owner는 에이전트 활성화, 예산, 승인 정책, 규칙을 모두 조정할 수 있어야 한다.
- manager는 승인 대기 처리와 일부 규칙 조정은 가능하되, 월간 예산이나 전역 정책 변경은 제한하는 것이 안전하다.
- 일반 agent에게는 이 화면 전체를 열지 않거나, 장기적으로 일부 읽기 전용 요약만 허용하는 편이 낫다.

## 4. 핵심 시나리오

### 시나리오 A: 에이전트 상태 점검

1. 사용자는 AI 운영 페이지에 들어온다.
2. 시스템은 활성 에이전트, 오늘 실행 수, 승인 대기 수, 이번 달 비용 요약을 보여준다.
3. 사용자는 특정 에이전트를 열어 상태, 최근 실행, 담당 업무를 확인한다.
4. 완료 조건:
   - 현재 자동화가 어떤 범위까지 동작 중인지 빠르게 파악할 수 있다.

### 시나리오 B: 승인 대기 처리

1. 사용자는 `승인 대기` 탭을 연다.
2. 시스템은 고객 메시지, 거래 상태 변경, 네트워크 공유 같은 민감 액션 초안을 보여준다.
3. 사용자는 payload와 근거를 검토한 뒤 `승인` 또는 `반려`한다.
4. 완료 조건:
   - 사람 승인 없는 위험 액션이 실행되지 않는다.

### 시나리오 C: 실행 이력 추적

1. 사용자는 특정 Task나 Insight가 왜 만들어졌는지 확인하려고 한다.
2. 시스템은 해당 실행 run의 트리거, 입력 컨텍스트, 생성 결과물, ActivityLog 연결을 보여준다.
3. 사용자는 어떤 규칙과 어떤 에이전트가 이 결과를 만든 것인지 확인한다.
4. 완료 조건:
   - AI 결과물이 감사 가능한 상태로 추적된다.

### 시나리오 D: 규칙 튜닝

1. 사용자는 규칙 탭에서 특정 `InsightRule` 또는 에이전트 규칙을 연다.
2. 시스템은 현재 활성 여부, 조건, 생성 액션, 최근 실행 수를 보여준다.
3. 사용자는 규칙을 비활성화하거나 threshold를 조정한다.
4. 완료 조건:
   - 오탐이 많은 자동화나 과도한 실행을 운영자가 직접 줄일 수 있다.

### 시나리오 E: 비용 점검

1. 사용자는 비용 탭을 연다.
2. 시스템은 이번 달 총 비용, 에이전트별 비용, 실행 수, 승인 대기 전환율을 보여준다.
3. 사용자는 비정상적으로 비용이 높은 에이전트를 비활성화하거나 예산 한도를 조정한다.
4. 완료 조건:
   - AI 운영 비용이 통제 가능한 범위 안에 머문다.

## 5. 화면 구조

예시:

- 상단: KPI / 위험 경고 / 빠른 제어
- 좌측: 에이전트 목록
- 중앙: 승인 대기 / 실행 이력 / 규칙 탭
- 우측: 상세 drawer / payload / 결과물

실제 정의:

- 상단 영역:
  - 페이지 제목
  - 상태 badge
    - `Control Plane Draft`
  - KPI cards
    - 활성 에이전트 수
    - 승인 대기 건수
    - 오늘 실행 수
    - 이번 달 비용
  - 전역 액션
    - `모든 에이전트 보기`
    - `승인 대기 열기`
    - `규칙 관리`
- 좌측 영역:
  - 에이전트 목록
    - 매물 정리봇
    - 상담 요약봇
    - 계약 체크봇
    - 네트워크 매칭봇
  - 각 row 정보
    - 활성 여부
    - 최근 실행 시간
    - 이번 주 실행 수
    - 오류 여부
- 중앙 영역:
  - 탭
    - `에이전트`
    - `승인 대기`
    - `실행 이력`
    - `규칙`
    - `비용`
  - `에이전트` 탭
    - 에이전트 카드
    - 설명
    - 허용 액션 범위
    - 최근 생성한 Task/Insight/CalendarEvent
  - `승인 대기` 탭
    - 대기 액션 리스트
    - approval type badge
    - title
    - 요약 payload
    - 생성 시각
    - 승인/반려 CTA
  - `실행 이력` 탭
    - run 리스트
    - trigger type
    - status
    - 생성 결과 수
    - cost
    - startedAt / finishedAt
  - `규칙` 탭
    - InsightRule 목록
    - 에이전트별 규칙 요약
    - 활성 토글
    - 최근 7일 실행 수
  - `비용` 탭
    - 월간 비용 요약
    - 에이전트별 비용 차트
    - 토큰 사용량
    - 승인 전환율
- 우측 상세 drawer:
  - 선택한 에이전트/승인/run/규칙 상세
  - 입력 컨텍스트
  - 생성 결과물 링크
  - ActivityLog 링크
  - 승인 payload JSON 또는 사람이 읽는 diff

## 6. 조회 데이터

| 항목 | 설명 | 필수 여부 | 출처 |
| --- | --- | --- | --- |
| overviewMetrics | AI 운영 요약 KPI | 필수 | `GET /ai-operations/overview` |
| agentList | 에이전트 목록 | 중요 | `GET /ai-operations/agents` |
| approvalQueue | 승인 대기 목록 | 중요 | `GET /ai-operations/approvals` |
| runList | 실행 이력 목록 | 중요 | `GET /ai-operations/runs` |
| ruleList | 활성/비활성 규칙 목록 | 중요 | `GET /ai-operations/rules` |
| costSummary | 비용 요약 | 중요 | `GET /ai-operations/costs` |
| taskResults | AI가 생성한 Task 목록 | 선택 | `Task(source=ai)` |
| insightResults | AI/규칙이 생성한 Insight 목록 | 선택 | `Insight` |
| calendarResults | AI가 생성한 일정 목록 | 선택 | `CalendarEvent` |
| activityLinks | 실행과 연결된 ActivityLog 목록 | 선택 | `ActivityLog` |

조회 규칙:

- 초기 진입 시:
  - overview, agent list, approval queue count는 함께 로드되어야 한다.
- 탭 전환 시:
  - 실행 이력, 규칙, 비용은 lazy load 가능하다.
- 상세 열기 시:
  - 선택한 에이전트/run/approval의 payload와 결과물 링크를 추가 조회한다.
- 초기 MVP:
  - 새 모델이 없으면 `Task`, `Insight`, `CalendarEvent`, `ActivityLog`를 묶은 projection으로 일부를 대체한다.

## 7. 검색 / 필터 / 정렬

- 기본 검색 대상:
  - 에이전트 이름
  - approval title
  - run trigger ref
  - rule type
- 기본 정렬:
  - 승인 대기: createdAt desc
  - 실행 이력: startedAt desc
  - 규칙: 최근 실행 수 desc 또는 type asc
- 필터 항목:
  - 에이전트 활성 상태
  - approval type
  - run status
  - trigger type
  - 비용 범위
  - 결과물 유형: task / insight / calendar
- 저장 가능한 뷰:
  - MVP에서는 사용자 저장 뷰 없음
  - 기본 탭은 `에이전트`, `승인 대기`, `실행 이력`, `규칙`, `비용`
- 역할별 기본 뷰 차이:
  - owner는 `승인 대기` 또는 `비용` 중심이 유용하다.
  - manager는 `승인 대기` 또는 `실행 이력` 중심이 유용하다.

## 8. 주요 액션

| 액션 | 설명 | 권한 | 성공 결과 | 실패/예외 |
| --- | --- | --- | --- | --- |
| 에이전트 활성화 | 특정 에이전트 켜기 | owner/manager | 활성 상태 반영 | 예산/정책 제한 |
| 에이전트 비활성화 | 특정 에이전트 끄기 | owner/manager | 새 실행 중단 | 실행 중 run 존재 |
| 승인 | 승인 대기 액션 확정 | owner/manager | 후속 액션 실행 | 이미 처리됨 |
| 반려 | 승인 대기 액션 거절 | owner/manager | rejected 반영 | 이미 처리됨 |
| 규칙 활성/비활성 | InsightRule 또는 에이전트 규칙 토글 | owner/manager | 규칙 상태 반영 | 연계 실행 충돌 |
| 규칙 수정 | threshold/config 변경 | owner/manager | 규칙 저장 | 잘못된 config |
| 실행 상세 열기 | run 상세 확인 | owner/manager | payload/결과 확인 | 데이터 누락 |
| 실패 실행 재시도 | 특정 run 다시 큐잉 | owner | 재실행 생성 | 정책상 금지 |

## 9. 생성 / 수정 폼 규칙

- 필수 입력값:
  - 규칙 수정 시 `type`, `config`
  - 승인 처리 시 `status`
- 기본값:
  - InsightRule.isActive는 `true`
  - Task.source는 `ai` 또는 `system`
- 자동 계산:
  - 비용 합계, 실행 수, 승인 대기 수는 집계로 계산한다.
  - 에이전트별 최근 실행 시각은 latest run 기준으로 계산한다.
- 상호 의존 필드:
  - 에이전트 비활성화 시 연결된 규칙도 함께 비활성화할지 정책이 필요하다.
  - 승인 대기 액션이 반려되면 관련 run status도 함께 갱신돼야 한다.
- 저장 전 검증:
  - 승인 가능한 사용자 권한 확인
  - 규칙 config 스키마 검증
  - 월간 예산 초과 여부 확인
- 저장 후 후속 액션:
  - overview metrics 재조회
  - 관련 탭 리스트 invalidation
  - ActivityLog 기록

## 10. 상태값

이 페이지가 직접 다루는 상태:

- Agent status(future)
  - `active`
  - `inactive`
  - `paused`
- Run status(future)
  - `queued`
  - `running`
  - `completed`
  - `failed`
  - `awaiting_approval`
- Approval status(future)
  - `pending`
  - `approved`
  - `rejected`
  - `expired`
- Trigger type(future)
  - `rule`
  - `schedule`
  - `manual`
  - `event`
- Task source(current)
  - `manual`
  - `system`
  - `ai`

상태 전이 규칙:

```text
run: queued -> running -> completed | failed | awaiting_approval
approval: pending -> approved | rejected | expired
agent: inactive -> active -> paused
```

상태별 UI 차이:

- `awaiting_approval` run:
  - 승인 대기 배지와 payload 미리보기 강조
- `failed` run:
  - 오류 원인과 재시도 CTA 노출
- `paused` agent:
  - 최근 실행은 보이되 새 실행은 막힘

## 11. 예외 / 빈 상태 / 오류 상태

- 빈 상태:
  - 아직 AI 운영이 활성화되지 않았으면 `에이전트 켜기`와 안내 문구 필요
- 검색 결과 없음:
  - run/approval/rule 각 탭별 empty state 필요
- 권한 없음:
  - agent는 진입 차단 또는 읽기 전용 안내
- 연동 실패:
  - 비용 집계 실패, 실행 이력 로드 실패 시 재시도 필요
- 삭제 불가 조건:
  - 감사 추적상 run/approval 자체 삭제는 피하는 편이 안전하다
- 충돌 상태:
  - 승인 대기를 동시에 두 사용자가 처리하면 stale state 재조회 필요
- 구조 한계:
  - 초기에는 AgentRun/Approval 모델이 없어 projection이 불완전할 수 있다

## 12. 연결 엔터티와 화면

| 연결 대상 | 연결 방식 | 사용 목적 |
| --- | --- | --- |
| AI Chat | 사용자용 AI 작업 화면 | 실행 결과와 승인 흐름 역진입 |
| Task | AI 생성 후속 업무 | 실행 결과 확인 |
| Insight | 규칙/AI 감지 결과 | 경고/인사이트 추적 |
| InsightRule | 자동화 규칙 | 정책 튜닝 |
| CalendarEvent | 일정성 결과물 | 후속 일정 생성 |
| ActivityLog | 감사 추적 | 누가 무엇을 실행했는지 확인 |
| Notification | 승인 대기 알림 | 빠른 처리 유도 |
| Tasks | 생성 결과 역진입 | 실행 결과 검증 |
| Deals | 승인 필요한 거래 액션 연결 | 고위험 액션 검토 |
| Network | 승인 필요한 대외 공유 액션 연결 | 대외 액션 게이트 |

## 13. Desktop 전용 요구사항

- 다중 패널 필요 여부:
  - 높음
  - 리스트와 상세 payload, 결과물 링크를 동시에 봐야 한다.
- 키보드 단축키:
  - `/` 검색 포커스
  - `Enter` 선택 항목 상세 열기
  - `Cmd/Ctrl + Enter` 승인 처리에 사용할 수 있으면 좋다
- 실시간 업데이트:
  - 승인 대기 수와 실행 상태는 near real-time 반영이 유용하다.
- 알림 연동:
  - 승인 대기 생성 시 Notification과 연결돼야 한다.
- 시스템 트레이/OS 이벤트 연동:
  - 필수는 아님
- 로컬 기능 연동:
  - 필요 없음
- 멀티 선택 / 벌크 액션:
  - 초기에는 제외
- 창 크기 변화 대응:
  - 좁은 폭에서는 우측 상세 drawer를 overlay로 전환해야 한다.

## 14. 감사 추적 / 로그

- ActivityLog 기록 대상 액션:
  - 에이전트 활성화/비활성화
  - 규칙 수정
  - 승인/반려
  - 수동 재실행
- actor / source 규칙:
  - 사람 조작은 `actor=user`, 시스템 실행은 `actor=system:rule_engine` 또는 AI actor 규칙 필요
- 중요 감사 이벤트:
  - 고객/거래/네트워크 관련 승인
  - 예산 변경
  - 규칙 threshold 변경

## 15. 비기능 요구사항

- 초기 로딩 목표:
  - overview와 승인 대기 count가 2초 이내 체감 로딩
- 대량 데이터 처리 방식:
  - 실행 이력과 승인 대기는 pagination 필요
- 낙관적 업데이트 여부:
  - 승인/반려는 서버 응답 후 확정이 안전하다
- 오프라인/재시도 전략:
  - 승인 처리 실패 시 사용자 의사결정이 사라지지 않도록 draft 상태 유지 필요
- 접근성/가독성 메모:
  - 민감 액션은 `자동 실행 안 됨`을 명확히 보여야 한다.
  - 비용과 실행 이력은 숫자만이 아니라 변화 추세도 보여주는 편이 좋다.

## 16. MVP 포함 범위

- AI 운영 진입 대시보드
- 에이전트 카드 목록
- 승인 게이트 설명과 승인 대기 리스트
- 기존 Task / Insight / CalendarEvent / ActivityLog 기반 실행 결과 집계
- InsightRule 기반 규칙 목록
- 기본 비용/실행 수 요약

## 17. MVP 제외 범위

- 완전한 AgentRun 모델 기반 세부 추적
- 완전한 AgentApproval 큐 모델
- 자동 고객 메시지 발송
- 승인 없는 거래/계약 상태 변경
- 무제한 장시간 루프형 에이전트
- 사무소 간 공유 AI 상태

## 18. 열린 질문

- agent 사용자에게는 이 화면을 완전히 숨길지, 일부 읽기 전용 대시보드를 줄지?
- AgentProfile/Run/Approval 모델을 언제 추가할지?
- 비용은 토큰 기준, KRW 기준, 작업 단위 기준 중 무엇을 primary KPI로 볼지?
- 승인 대기 액션을 Notification 중심으로 처리할지, AI 운영 페이지 중심으로 처리할지?
- AI actor naming을 `mcp:Codex`, `system:rule_engine`, 별도 internal agent key로 어떻게 표준화할지?

## 19. 수용 기준

- 사용자는 이 페이지에서 `현재 어떤 AI 자동화가 켜져 있고 무엇을 하고 있는지`를 이해할 수 있어야 한다.
- 사용자는 승인 필요한 액션을 `한 화면에서 검토하고 승인/반려`할 수 있어야 한다.
- 사용자는 특정 결과물이 `어떤 실행과 어떤 규칙에서 나왔는지` 추적할 수 있어야 한다.
- 역할별 권한 차이가 UI와 API 모두에서 일치해야 한다.
- 고객/거래/대외 액션은 승인 없이 실행되지 않아야 한다.
