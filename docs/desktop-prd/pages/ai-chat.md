# AI Chat

## 메타

- 페이지명: AI Chat
- 문서 상태: draft
- 우선순위: P1
- Phase: Phase 1 experimental
- 구현 상태: planned
- 작성일: 2026-04-03
- 최종 수정일: 2026-04-03
- 관련 엔터티: Task, Insight, CalendarEvent, ActivityLog, Notification, ChatSession(future), ChatMessage(future), DesktopAgentSession(future), McpRegistry(future)
- 관련 API:
  - `POST /ai/chat`
  - `GET /ai/chat/sessions`
  - `GET /ai/chat/sessions/:id`
  - `POST /ai/chat/tool-runs/:id/confirm`
  - `POST /desktop-agent/connect`
  - `POST /desktop-agent/tool-result`
  - `GET /desktop-agent/status`
- 관련 화면: Listings, Contacts, Buyer Requirements, Deals, Tasks, Office Sites, AI Operations, Notifications, Settings

현재 결정:

- 이 문서는 desktop의 `사이드바 AI Chat 페이지`를 기준으로 작성한다.
- `AI Chat`은 사용자용 작업 화면이고, `AI Operations`는 owner/manager용 control plane이다.
- Phase 1의 초기 방향은 `서버 AI`보다 `desktop 앱이 로컬 Codex CLI를 감싸는 방식`을 우선 검토한다.
- 이 구조에서도 사용자 입장에서는 `Estate ERP 안의 AI`로 보이게 해야 한다.
- desktop 앱은 `MCP registry manager` 역할을 하며, 세션마다 허용된 MCP만 Codex CLI에 노출한다.
- ERP 데이터 읽기/저장은 `ERP MCP` 또는 서버 API를 통해 처리하고, 로컬에서만 가능한 작업은 `local MCP`를 desktop이 대신 실행한다.
- 외부 데이터 import 또는 고위험 write는 항상 `preview -> confirm -> save` 3단계로 끊는다.
- MVP 범위는 `질문 답변`, `ERP 조회`, `Task/Insight/CalendarEvent 생성`, `외부 데이터 확인 후 내부 업무 생성`까지다.
- Windows 전용 환경을 우선 가정한다.

## 1. 페이지 목적

- 이 페이지가 해결해야 하는 핵심 업무:
  - 사용자가 현재 보고 있는 CRM 문맥을 유지한 채 AI에게 질문하고 후속 액션을 요청한다.
  - AI가 ERP 데이터를 조회하고 `Task`, `Insight`, `CalendarEvent` 같은 저위험 결과물을 만든다.
  - 필요 시 local MCP를 통해 외부 데이터를 확인하고, 결과를 ERP 후속 작업으로 연결한다.
  - 앱 안에서 `CLI 직접 사용`보다 쉬운 AI 작업 경험을 제공한다.
- primary 사용자:
  - owner
  - manager
  - agent
- secondary 사용자:
  - 없음
- 이 페이지가 필요한 이유:
  - 현업은 CLI에 직접 컨텍스트를 설명하는 방식보다 `현재 화면을 알고 있는 AI`를 더 쉽게 쓴다.
  - desktop 앱이 현재 contact, listing, deal, site 문맥을 AI에 자동으로 넘기면 작업 품질이 높아진다.
  - 사용자 Claude/Codex를 외부에서 따로 쓰는 방식보다 일관된 UX와 confirm gate를 제공할 수 있다.

## 2. 사용 시점

- 사용자가 이 페이지에 들어오는 대표 상황:
  - 현재 보고 있는 고객/매물/거래에 대해 AI에게 요약이나 다음 액션을 묻고 싶을 때
  - 특정 단지의 신규 광고를 확인하고 담당자 Task를 만들고 싶을 때
  - 계약/상담/업무 문맥에서 후속 일정을 빠르게 만들고 싶을 때
  - CLI를 열지 않고 앱 안에서 AI를 바로 쓰고 싶을 때
- 진입 경로:
  - 사이드바 `AI Chat`
  - 각 주요 화면의 `AI에게 물어보기` 액션
  - 전역 단축키 또는 command palette future entry
- 이전 화면:
  - Listings
  - Contacts
  - Buyer Requirements
  - Deals
  - Office Sites
- 다음 화면:
  - 생성된 Task 상세
  - 생성된 CalendarEvent
  - AI Operations의 run/approval 화면
  - 관련 Contact / Listing / Deal / Site 상세
- 이 페이지를 나가는 대표 액션:
  - AI 답변 확인
  - 제안된 후속 Task 생성
  - 외부 데이터 확인 결과 preview 검토
  - confirm 후 ERP 저장

## 3. 사용자 역할과 권한

| 역할 | 조회 | 생성 | 수정 | 삭제 | 승인/확정 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| owner | 가능 | 가능 | 제한적 | 불가 | 가능 | local MCP 사용과 confirm action 모두 가능 |
| manager | 가능 | 가능 | 제한적 | 불가 | 가능 | owner와 유사하되 전역 정책 수정은 아님 |
| agent | 가능 | 제한적 | 불가 | 불가 | 제한적 | 저위험 작업 생성은 가능, 고위험 confirm은 제한 가능 |

권한 메모:

- `AI Chat`은 일반 agent도 쓰게 될 가능성이 높으므로 `AI Operations`보다 권한이 넓다.
- 다만 일반 agent는 `Task`, `CalendarEvent`, 개인 메모성 Insight 정도만 직접 확정 가능한 편이 안전하다.
- 외부 import 확정, 대량 등록, 대외 액션, 거래/계약 상태 변경은 owner/manager confirm 또는 별도 정책이 필요하다.

## 4. 핵심 시나리오

### 시나리오 A: 현재 화면 문맥 질문

1. 사용자는 Contacts 또는 Deals 화면을 보고 있다.
2. 시스템은 현재 열린 엔터티 id와 핵심 요약 정보를 AI Chat 세션 컨텍스트로 붙인다.
3. 사용자는 `이 고객 다음 액션 뭐가 좋지?`라고 묻는다.
4. 완료 조건:
   - 사용자는 별도 설명 없이 현재 화면 문맥을 반영한 답변을 받는다.

### 시나리오 B: 외부 확인 후 Task 생성

1. 사용자는 `네이버 부동산에서 고덕그라시움 신규 물건 확인하고 신규면 유정에게 확인 Task 만들어줘`라고 요청한다.
2. 시스템은 local MCP를 통해 외부 데이터를 확인하고, ERP 기존 데이터와 비교한다.
3. 시스템은 차이 결과와 생성 예정 Task를 preview로 보여준다.
4. 사용자가 confirm하면 Task가 생성된다.
5. 완료 조건:
   - 외부 확인과 내부 후속 업무 생성이 앱 안에서 끊기지 않고 이어진다.

### 시나리오 C: 문서화 가능한 결과 생성

1. 사용자는 상담/매물/거래 문맥에서 요약을 요청한다.
2. 시스템은 ERP MCP를 통해 관련 정보를 모으고 결과를 생성한다.
3. 사용자는 `Task로 저장`, `Insight로 저장`, `일정 만들기` 중 하나를 선택한다.
4. 완료 조건:
   - AI 답변이 일회성 채팅으로 끝나지 않고 실제 운영 데이터로 이어진다.

### 시나리오 D: 위험 작업 전 confirm

1. 사용자는 외부 import 또는 다건 write가 포함된 요청을 한다.
2. 시스템은 즉시 실행하지 않고 preview와 영향 범위를 먼저 보여준다.
3. 사용자는 confirm 또는 cancel을 선택한다.
4. 완료 조건:
   - AI가 실수로 데이터를 바로 저장하거나 변경하지 않는다.

## 5. 화면 구조

예시:

- 좌측: 세션 목록 / 최근 대화 / 빠른 프롬프트
- 중앙: 채팅 스레드 / 툴 실행 결과 / 제안 액션
- 우측: 현재 화면 컨텍스트 / 미리보기 / confirm 패널

실제 정의:

- 상단 영역:
  - 페이지 제목
  - 연결 상태 badge
    - `Codex CLI Connected`
    - `ERP MCP Ready`
    - `Local MCP Optional`
  - 현재 컨텍스트 pill
    - `Contact: 홍길동`
    - `Deal: D-2026-014`
    - `Site: 고덕그라시움`
  - 빠른 액션
    - `현재 화면 문맥 붙이기`
    - `새 세션`
    - `도구 상태`
- 좌측 영역:
  - 세션 목록
  - 최근 프롬프트
  - 즐겨찾기 프롬프트
    - `후속 업무 생성`
    - `현재 거래 리스크 점검`
    - `단지 신규 광고 확인`
- 중앙 영역:
  - 대화 메시지 스레드
  - tool run 카드
    - 사용한 MCP
    - 성공/실패 상태
    - 결과 요약
  - 제안 액션 카드
    - `Task 만들기`
    - `Insight 저장`
    - `일정 생성`
    - `미리보기 열기`
- 우측 영역:
  - 현재 화면 컨텍스트 요약
  - tool preview 패널
  - confirm panel
    - 영향 받는 엔터티 수
    - 생성/수정 예정 필드
    - confirm / cancel
- 하단 영역:
  - 프롬프트 입력창
  - 첨부 토글
    - `현재 화면 포함`
    - `로컬 커넥터 허용`

## 6. 조회 데이터

| 항목 | 설명 | 필수 여부 | 출처 |
| --- | --- | --- | --- |
| currentContext | 현재 보고 있는 엔터티와 화면 문맥 | 필수 | desktop route state |
| chatSession | 현재 대화 세션 | 필수 | `GET /ai/chat/sessions/:id` |
| sessionList | 최근 세션 목록 | 중요 | `GET /ai/chat/sessions` |
| toolAvailability | 현재 세션에서 허용된 MCP/tool 목록 | 중요 | desktop MCP registry |
| desktopAgentStatus | Codex CLI / local runner 연결 상태 | 중요 | `GET /desktop-agent/status` |
| previewDraft | confirm 전 preview payload | 중요 | `POST /ai/chat` 결과 |
| runLog | 최근 tool run 로그 | 선택 | ActivityLog / future AgentRun |

조회 규칙:

- 초기 진입 시:
  - current context, desktop agent status, 최근 세션 목록을 함께 로드한다.
- 화면 컨텍스트가 바뀌면:
  - 사용자가 자동 동기화 여부를 선택할 수 있어야 한다.
- tool run 발생 시:
  - 사용한 MCP와 결과 요약을 즉시 스레드에 반영한다.
- confirm 필요한 액션은:
  - preview payload가 준비될 때까지 저장을 막는다.

## 7. 검색 / 필터 / 정렬

- 기본 검색 대상:
  - 세션 제목
  - 최근 프롬프트
  - 연결된 엔터티 이름
- 기본 정렬:
  - 세션 목록은 updatedAt desc
- 필터 항목:
  - 현재 화면 문맥 포함 여부
  - 외부/local tool 사용 여부
  - confirm 필요 action만 보기 future
- 저장 가능한 뷰:
  - MVP에서는 없음
- 역할별 기본 뷰 차이:
  - owner/manager는 tool run 정보와 confirm 패널을 더 자세히 본다.
  - agent는 단순 대화 중심이 더 적합하다.

## 8. 주요 액션

| 액션 | 설명 | 권한 | 성공 결과 | 실패/예외 |
| --- | --- | --- | --- | --- |
| 질문 보내기 | 현재 컨텍스트 포함 질문 전송 | 전 역할 | 응답 생성 | Codex CLI 미연결 |
| 현재 화면 문맥 붙이기 | 현재 route/entity 요약을 세션에 첨부 | 전 역할 | 문맥 반영 | 현재 선택 엔터티 없음 |
| tool 실행 | ERP MCP 또는 local MCP 호출 | 정책 허용 역할 | 결과 카드 생성 | MCP 미가동 / 권한 부족 |
| Task 생성 | AI 제안 결과로 Task 생성 | 전 역할(정책 제한 가능) | Task 생성 | 권한 부족 / payload 오류 |
| Insight 저장 | AI 결과 저장 | 전 역할 | Insight 생성 | 저장 실패 |
| 일정 생성 | AI 결과로 CalendarEvent 생성 | 전 역할 | 일정 생성 | 날짜 누락 |
| import confirm | 외부 데이터 preview 확정 | owner/manager 중심 | ERP 저장 | confirm 누락 / 정책상 금지 |
| 세션 초기화 | 현재 세션 리셋 | 전 역할 | 새 세션 시작 | 미저장 draft 존재 |

## 9. 생성 / 수정 폼 규칙

- 필수 입력값:
  - prompt 본문
- 기본값:
  - `현재 화면 문맥 포함`은 on
  - local MCP 사용은 off 또는 마지막 상태 기억
- 자동 계산:
  - 세션 제목은 첫 질문 또는 현재 엔터티 기준 자동 생성
- 상호 의존 필드:
  - local MCP 사용이 켜져도 연결된 커넥터가 없으면 실행 불가
  - confirm 필요한 action은 preview payload 없이는 확정 불가
- 저장 전 검증:
  - 현재 사용자 역할 확인
  - MCP availability 확인
  - office scope 확인
- 저장 후 후속 액션:
  - ActivityLog 기록
  - 생성된 Task/Insight/CalendarEvent 링크 반환

## 10. 상태값

이 페이지가 직접 다루는 상태:

- chat session status
  - `idle`
  - `streaming`
  - `tool_running`
  - `awaiting_confirm`
  - `completed`
  - `failed`
- desktop agent status
  - `disconnected`
  - `connecting`
  - `connected`
  - `error`
- preview status
  - `none`
  - `ready`
  - `confirmed`
  - `cancelled`

상태 전이 규칙:

```text
idle -> streaming -> tool_running -> completed
tool_running -> awaiting_confirm -> confirmed -> completed
streaming | tool_running -> failed
desktop agent: disconnected -> connecting -> connected | error
```

상태별 UI 차이:

- `streaming`
  - 메시지 영역에 응답 스트리밍 표시
- `tool_running`
  - 어떤 MCP를 실행 중인지 명시
- `awaiting_confirm`
  - 입력창보다 preview panel과 confirm CTA를 우선 노출
- `error`
  - MCP 연결 오류 또는 CLI 재연결 CTA 제공

## 11. 예외 / 빈 상태 / 오류 상태

- 빈 상태:
  - 첫 진입 시 빠른 프롬프트 예시와 현재 화면 문맥 설명 필요
- 검색 결과 없음:
  - 세션 검색 결과 empty state 필요
- 권한 없음:
  - local import confirm 또는 고위험 write는 제한 이유를 명시
- 연동 실패:
  - Codex CLI 미설치, 미로그인, local MCP 실행 실패, ERP MCP 응답 실패
- 삭제 불가 조건:
  - ActivityLog와 연결된 tool run 로그는 하드 삭제하지 않는 편이 안전하다
- 충돌 상태:
  - preview 후 원본 ERP 데이터가 바뀌면 stale preview 안내 후 재실행 필요

## 12. 연결 엔터티와 화면

| 연결 대상 | 연결 방식 | 사용 목적 |
| --- | --- | --- |
| Listings | 현재 화면 문맥 | 매물 조회/후속 작업 |
| Contacts | 현재 화면 문맥 | 사람 중심 질의/후속 연락 |
| Deals | 현재 화면 문맥 | 거래 리스크 점검과 후속 일정 |
| Office Sites | 현재 화면 문맥 | 단지/호실 기반 질의 |
| Task | AI 생성 결과 | 후속 업무 저장 |
| Insight | AI 생성 결과 | 운영 메모/경고 저장 |
| CalendarEvent | AI 생성 결과 | 일정성 액션 저장 |
| ActivityLog | tool run 추적 | 감사 추적 |
| AI Operations | run/approval 역진입 | 운영 통제와 상세 추적 |

## 13. Desktop 전용 요구사항

- 다중 패널 필요 여부:
  - 높음
  - 대화, 현재 문맥, preview를 동시에 봐야 한다.
- 키보드 단축키:
  - `Ctrl + K` 또는 `/` 입력 포커스
  - `Ctrl + Enter` 전송
  - `Esc` preview cancel
- 실시간 업데이트:
  - 현재 화면 컨텍스트 변경 감지 필요
- 알림 연동:
  - confirm 대기 또는 생성된 Task 완료 알림은 선택적으로 연동 가능
- 시스템 트레이/OS 이벤트 연동:
  - 초기에는 불필요
- 로컬 기능 연동:
  - 필수
  - Codex CLI 실행, local MCP 실행, 파일 접근이 desktop 쪽에 필요하다.
- 멀티 선택 / 벌크 액션:
  - 초기에는 제외
- 창 크기 변화 대응:
  - 좁은 폭에서는 우측 preview panel을 drawer로 전환해야 한다.
- 운영 환경 제약:
  - 초기 MVP는 Windows only

## 14. 감사 추적 / 로그

- ActivityLog 기록 대상 액션:
  - tool run 시작/완료/실패
  - confirm/cancel
  - Task/Insight/CalendarEvent 생성
- actor / source 규칙:
  - AI 채팅 실행은 `actor=mcp:Codex` 또는 향후 별도 internal AI actor key
  - source는 `desktop` 또는 `mcp`
- 중요 감사 이벤트:
  - 외부 데이터 import confirm
  - 대량 write 제안
  - 로컬 커넥터 사용

## 15. 비기능 요구사항

- 초기 로딩 목표:
  - 페이지 진입 후 chat UI와 상태 표시가 2초 이내 체감 로딩
- 대량 데이터 처리 방식:
  - 긴 세션은 가상화 또는 pagination 필요
- 낙관적 업데이트 여부:
  - 대화 출력은 스트리밍 표시 가능
  - confirm 후 write는 서버 응답 후 확정이 안전하다
- 오프라인/재시도 전략:
  - Codex CLI 연결 실패 시 재연결 버튼 필요
  - local MCP 실패 시 같은 prompt를 다시 보내지 않고 tool run만 재시도 가능해야 한다
- 접근성/가독성 메모:
  - 사용자가 지금 `AI가 답하는 중인지`, `툴을 돌리는 중인지`, `confirm을 기다리는지`를 구분할 수 있어야 한다.

## 16. MVP 포함 범위

- 사이드바 `AI Chat` 페이지 추가
- desktop 앱이 감싸는 local Codex CLI runner
- app-managed MCP registry
- ERP MCP 연결
- 현재 화면 문맥 자동 첨부
- `Task`, `Insight`, `CalendarEvent` 생성
- local MCP 결과 preview
- `preview -> confirm -> save` 가드레일
- ActivityLog 기반 기본 실행 추적

## 17. MVP 제외 범위

- 서버 중심 AI orchestration
- 다중 사용자 shared chat session
- background autonomous agents
- billing / budget / approval queue full control plane
- Mac 지원
- 고객 메시지 자동 발송
- 거래/계약 상태 자동 변경

## 18. 열린 질문

- Codex CLI 인증을 사용자별로 둘지, 디바이스별 공용으로 둘지?
- 로컬 MCP 설치와 버전 업데이트를 앱이 관리할지 수동으로 둘지?
- local MCP 사용 가능 여부를 role별로 얼마나 나눌지?
- 외부 import 결과를 어느 필드까지 preview에서 보여줄지?
- `AI Chat` 결과를 `AI Operations` run 화면과 언제부터 정식으로 연결할지?

## 19. 수용 기준

- 사용자는 이 페이지에서 `현재 보고 있는 CRM 문맥을 유지한 채 AI에게 질문`할 수 있어야 한다.
- 사용자는 CLI를 직접 열지 않고도 `ERP 조회와 저위험 업무 생성`을 수행할 수 있어야 한다.
- 외부 데이터 기반 작업은 반드시 `preview -> confirm -> save`를 거쳐야 한다.
- 역할별 권한 차이가 UI와 API 모두에서 일치해야 한다.
- `AI Chat`과 `AI Operations`의 역할 차이가 사용자에게 혼동 없이 드러나야 한다.
