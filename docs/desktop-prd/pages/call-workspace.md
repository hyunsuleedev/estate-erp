# Call Workspace

## 메타

- 페이지명: Call Workspace
- 문서 상태: draft
- 우선순위: P0
- Phase: Phase 2
- 구현 상태: deferred until Phase 2
- 작성일: 2026-04-02
- 최종 수정일: 2026-04-02
- 관련 엔터티: Contact, ContactRelation, BuyerRequirement, Consultation, Task, Notification, ActivityLog
- 관련 API:
  - `GET /contacts/search-by-phone`
  - `GET /contacts/:id`
  - `POST /contacts`
  - `PATCH /contacts/:id`
  - `GET /contacts/:id/buyer-requirements`
  - `GET /contacts/:id/consultations`
  - `GET /buyer-requirements`
  - `GET /buyer-requirements/due-contacts`
  - `POST /buyer-requirements`
  - `PATCH /buyer-requirements/:id`
  - `POST /consultations`
  - `PATCH /consultations/:id`
  - `GET /tasks`
  - `POST /tasks`
  - `PATCH /tasks/:id`
  - `Desktop IPC / local CTI bridge event` (planned)
  - `WebSocket office call broadcast` (planned)
- 관련 화면: Dashboard, Contacts, Contact Detail, Buyer Requirements, Consultations, Tasks, Matches, Properties

현재 결정:

- 이 문서는 `선행 설계용 초안`으로 유지한다.
- 실제 구현은 현재 Phase 1 범위에서 제외하고, Phase 2에서 재개한다.
- CTI Bridge 및 로컬 전화 이벤트 연동은 별도 후속 단계에서 붙인다.

## 1. 페이지 목적

- 이 페이지가 해결해야 하는 핵심 업무:
  - 전화가 들어오거나 전화를 거는 순간, 사용자가 `연락처 식별 → 상담 기록 → 매수요구 확인/수정 → 후속 태스크 생성`을 한 화면에서 끝낸다.
- primary 사용자:
  - agent
- secondary 사용자:
  - manager, owner
- 이 페이지가 필요한 이유:
  - 현재 도메인에서 전화는 `Contact`, `Consultation`, `BuyerRequirement`, `Task`를 가장 빠르게 묶어내야 하는 시작점이다.
  - desktop 앱의 차별점인 `CTI Bridge`, `실시간 브로드캐스트`, `다중 패널`, `OS 알림`은 일반 목록형 CRM 화면보다 이 워크스페이스에서 가치가 가장 크다.
  - 전화 중에는 화면 전환 비용이 크므로 연락처 상세, 상담기록, 구매고객, 후속 업무를 따로 이동하면 업무가 끊긴다.

## 2. 사용 시점

- 사용자가 이 페이지에 들어오는 대표 상황:
  - 인바운드 전화가 CTI Bridge를 통해 수신되었을 때
  - 기존 고객에게 아웃바운드 전화를 걸기 직전 또는 직후
  - 통화는 종료됐지만 상담 정리와 후속 액션이 남아 있을 때
  - `다음 연락 예정일`이 도래한 BuyerRequirement를 전화로 후속 처리할 때
- 진입 경로:
  - 인바운드 콜 팝업의 `상담 시작`
  - 연락처 상세의 `전화 상담 열기`
  - 구매고객 목록의 `후속 연락`
  - Tasks의 `전화작업` 태스크 클릭
  - 사이드바의 `Call Workspace` 메뉴
- 이전 화면:
  - Dashboard
  - Contacts
  - Buyer Requirements
  - Tasks
  - 알림/OS 배너
- 다음 화면:
  - Contact Detail
  - Buyer Requirements
  - Matches
  - Properties
  - Tasks
- 이 페이지를 나가는 대표 액션:
  - 전화 상담을 Consultation으로 저장
  - 후속 태스크를 만들고 종료
  - 연락처 또는 구매고객 상세 화면으로 이동
  - 통화를 다른 직원에게 넘기거나 워크스페이스를 최소화

## 3. 사용자 역할과 권한

| 역할 | 조회 | 생성 | 수정 | 삭제 | 승인/확정 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| owner | 전체 콜 세션/기록 조회 | 가능 | 가능 | 가능 | 가능 | 강제 점유 해제, 담당자 변경 가능 |
| manager | 전체 콜 세션/기록 조회 | 가능 | 가능 | 제한적 | 가능 | 팀 콜 분배/재배정 가능 |
| agent | 본인 점유 세션 중심 조회 | 가능 | 가능 | 제한적 | 가능 | 본인이 점유한 세션에서만 저장/종료 가능 |

권한 메모:

- `승인/확정`은 결재 의미가 아니라 `콜 세션 점유`, `타 사용자에게 넘기기`, `후속 담당자 확정`을 뜻한다.
- agent는 저장된 상담 자체를 임의 삭제하지 않는다. agent가 버릴 수 있는 것은 `저장 전 로컬 초안`과 `본인이 만든 미저장 세션`이다.
- owner/manager는 다른 사용자가 점유 중인 콜 세션을 관찰하거나 재배정할 수 있다.
- MVP에서는 서버 RBAC보다 UI 제약이 먼저 구현될 수 있다. API 권한 정합성은 별도 보강 필요하다.

## 4. 핵심 시나리오

### 시나리오 A: 신규 인바운드 전화, 기존 연락처 없음

1. 사용자는 인바운드 팝업에서 `상담 시작`을 누른다.
2. 시스템은 수신 전화번호로 `search-by-phone` 조회를 수행하고, 일치 연락처가 없으면 `신규 연락처` 상태로 워크스페이스를 연다.
3. 사용자는 이름과 최소 메모를 입력하고, 통화 내용을 `전화 상담`으로 기록한 뒤 필요한 경우 BuyerRequirement와 Task를 추가한다.
4. 완료 조건:
   - Contact 1건이 생성되고
   - Consultation 1건이 `type=phone`으로 저장되며
   - 필요 시 BuyerRequirement/Task가 연결된다.

### 시나리오 B: 기존 구매고객의 인바운드 또는 아웃바운드 후속 통화

1. 사용자는 기존 고객의 전화번호로 매칭된 Contact를 확인한다.
2. 시스템은 해당 Contact의 활성 BuyerRequirement, 최근 Consultation, 미완료 Task를 우측 패널에 즉시 보여준다.
3. 사용자는 통화 중 BuyerRequirement의 `lastContactDate`, `nextContactDate`, 조건 메모를 갱신하고 후속 태스크를 등록한다.
4. 완료 조건:
   - Consultation이 저장되고
   - BuyerRequirement가 최신 상태로 갱신되며
   - 후속 담당자와 기한이 있는 Task가 연결된다.

### 시나리오 C: 동일 전화가 팀 전체에 브로드캐스트되는 경우

1. 시스템은 같은 office의 여러 desktop 앱에 인바운드 이벤트를 브로드캐스트한다.
2. 첫 번째로 `상담 시작`을 누른 사용자가 세션을 점유하고, 다른 사용자는 `OOO 응대 중` 상태로 본다.
3. manager 또는 owner는 필요 시 세션을 재배정하거나 관찰 모드로 들어간다.
4. 완료 조건:
   - 한 콜 세션에 대해 저장 주체가 한 명으로 명확해지고
   - 중복 Consultation 생성 가능성이 줄어든다.

## 5. 화면 구조

예시:

- 좌측: 콜 큐 / 최근 콜 / 검색
- 중앙: 현재 콜 카드 / 상담 메모 입력 / 빠른 저장
- 우측: 연락처, 구매고객, 최근 상담, 후속 액션

실제 정의:

- 상단 영역:
  - 현재 세션 상태 배너
  - 전화번호
  - 인바운드/아웃바운드 표시
  - 통화 시작 시각, 경과 시간
  - 세션 점유자, `상담 시작`, `넘기기`, `최소화`, `종료 후 정리` 액션
- 좌측 영역:
  - `최근 콜 / 미정리 콜` 리스트
  - 검색창: 이름, 전화번호
  - 필터: 오늘, 미정리, 내 세션, 부재중
  - 같은 번호의 최근 7일 통화 이력 요약
- 중앙 영역:
  - `현재 상담 작성 영역`
  - 연락처 식별 카드
  - 신규 연락처 생성 폼 또는 기존 연락처 요약
  - 전화 상담 메모 입력
  - 빠른 태그 버튼: 관심지역, 예산, 재연락, 방문예정, 계약진행
  - `상담 저장`, `저장 후 태스크 생성`, `저장 후 구매조건 생성` CTA
- 우측 영역:
  - 활성 BuyerRequirement 카드 목록
  - 최근 Consultation 타임라인
  - 관련 Task 목록
  - 빠른 액션: `연락처 상세`, `매수조건 열기`, `매칭 찾기`, `매물 검색`
- 하단 영역:
  - 통화 종료 후 Wrap-up 패널
  - 다음 연락일, 담당자, 태스크 우선순위, 통화 결과 체크

## 6. 조회 데이터

| 항목 | 설명 | 필수 여부 | 출처 |
| --- | --- | --- | --- |
| activeCallSession | 현재 desktop이 보고 있는 통화 세션 상태 | 필수 | local CTI event / WebSocket |
| matchedContacts | 전화번호 기준 후보 연락처 | 필수 | `GET /contacts/search-by-phone` |
| selectedContact | 선택된 연락처 상세 | 조건부 | `GET /contacts/:id` |
| buyerRequirements | 선택 연락처의 활성/최근 구매고객 조건 | 조건부 | `GET /contacts/:id/buyer-requirements` 또는 `GET /buyer-requirements?contactId=` |
| recentConsultations | 선택 연락처의 최근 상담 기록 | 조건부 | `GET /contacts/:id/consultations` |
| recentTasks | 선택 연락처 관련 미완료 업무 | 조건부 | `GET /tasks` 후 클라이언트 필터 또는 향후 전용 API |
| dueBuyerFollowUps | 오늘 연락 예정 BuyerRequirement | 선택 | `GET /buyer-requirements/due-contacts` |
| notifications | 최소화 상태에서 미처리 콜/후속 알림 | 선택 | Notification / WebSocket |

조회 규칙:

- 초기 진입 시:
  - CTI 이벤트를 받으면 즉시 전화번호를 기준으로 연락처 후보를 조회한다.
  - 결과가 1건이면 자동 선택, 2건 이상이면 후보 선택 상태로 진입한다.
- 선택 변경 시:
  - Contact 변경과 동시에 BuyerRequirement, Consultation, Task 요약을 재조회한다.
- 실시간 갱신 여부:
  - 콜 세션 상태, 점유자 상태, 알림 상태는 실시간 갱신한다.
  - BuyerRequirement/Consultation/Task는 세션 중 생성·수정 성공 시 낙관적 갱신 후 재검증한다.

## 7. 검색 / 필터 / 정렬

- 기본 검색 대상:
  - 전화번호
  - 연락처명
  - 최근 상담 키워드
- 기본 정렬:
  - 좌측 콜 리스트는 `미정리 우선 -> 최신 통화순`
  - 우측 상담 이력은 `최신순`
- 필터 항목:
  - `오늘`
  - `미정리`
  - `내 세션`
  - `부재중`
  - `BuyerRequirement 있음`
  - `Task 있음`
- 저장 가능한 뷰:
  - 기본적으로 저장 뷰는 제공하지 않는다.
  - 다만 manager/owner는 향후 `팀 콜 큐`, `내 팔로업`, `부재중` 프리셋 뷰를 가질 수 있다.
- 역할별 기본 뷰 차이:
  - agent: `내 세션 + 오늘 미정리`
  - manager/owner: `팀 전체 미정리`

## 8. 주요 액션

| 액션 | 설명 | 권한 | 성공 결과 | 실패/예외 |
| --- | --- | --- | --- | --- |
| 세션 점유 | 인바운드 세션을 내가 처리하겠다고 확정 | owner, manager, agent | 다른 사용자 화면은 관찰 모드로 전환 | 이미 다른 사용자가 점유한 경우 충돌 메시지 |
| 연락처 선택 | 후보 연락처 중 상담 대상을 확정 | owner, manager, agent | 우측 패널 컨텍스트가 갱신 | 후보 없음 또는 중복 후보 다수 |
| 신규 연락처 생성 | 이름/전화번호 최소 정보로 연락처 생성 | owner, manager, agent | Contact 생성 후 자동 선택 | 전화번호 중복 또는 필수값 누락 |
| 연락처 수정 | 전화 중 이름, 태그, 메모 보정 | owner, manager, agent | Contact 업데이트 | 다른 사용자가 수정한 경우 최신값 충돌 |
| 전화 상담 저장 | Consultation `type=phone` 생성 | owner, manager, agent | 상담 타임라인 반영, ActivityLog 기록 | contact 미선택, 내용 없음 |
| 구매조건 생성 | 신규 BuyerRequirement 생성 | owner, manager, agent | 우측 카드에 즉시 추가 | 필수 예산/유형 누락 |
| 구매조건 갱신 | last/next contact 및 조건 변경 | owner, manager, agent | BuyerRequirement 업데이트 | 권한 또는 검증 실패 |
| 후속 태스크 생성 | 콜 후 해야 할 일을 연결 생성 | owner, manager, agent | Task 생성, 미완료 업무에 반영 | dueDate/assignee 누락 가능 경고 |
| 세션 넘기기 | 다른 담당자에게 콜 흐름을 양도 | owner, manager, agent | 새 담당자에게 알림 | 대상 미접속 또는 거절 |
| 종료 후 정리 | 통화는 끝났지만 wrap-up 상태로 전환 | owner, manager, agent | 세션이 `wrap_up` 상태가 됨 | 세션 상태 불일치 |
| 워크스페이스 최소화 | 현재 세션을 배경으로 남기고 다른 화면 이동 | owner, manager, agent | 트레이/배지 유지 | 데스크톱 알림 비활성 상태 |

## 9. 생성 / 수정 폼 규칙

- 필수 입력값:
  - 신규 연락처 생성: `name`, `phone`
  - 전화 상담 저장: `contactId`, `content`
  - 후속 태스크 생성: `title`
- 기본값:
  - Consultation.type = `phone`
  - Task.source = `manual`
  - Task.category = `call`
  - Task.status = `pending`
  - BuyerRequirement.status = `active`
- 자동 계산:
  - 수신 전화번호는 Contact.phone에 기본 주입
  - 선택된 Contact가 있으면 Consultation.contactId, Task.contactId를 자동 설정
  - 선택된 BuyerRequirement가 있으면 Consultation.buyerReqId를 자동 연결
  - 선택된 Listing/Property 문맥이 있으면 Task/Consultation에 같이 연결
- 상호 의존 필드:
  - `transactionType = monthly`면 `deposit`, `monthlyRentMax` 노출
  - `BuyerRequirement` 후속 연락일을 설정하면 태스크 dueDate 제안
  - 연락처가 바뀌면 우측 BuyerRequirement/Consultation/Task 컨텍스트를 전부 재설정
- 저장 전 검증:
  - 동일 번호 후보가 2건 이상이면 사용자가 명시적으로 Contact를 선택해야 한다.
  - 상담 저장 시 빈 문자열 또는 공백만 있는 내용은 금지한다.
  - 신규 연락처 생성 시 전화번호가 이미 office 내에 존재하면 중복 후보 경고를 먼저 보여준다.
- 저장 후 후속 액션:
  - Consultation 저장 성공 시 `다음 연락일 설정` 또는 `태스크 추가`를 제안한다.
  - 구매조건 생성 후 즉시 `매칭 찾기` CTA를 노출한다.

## 10. 상태값

이 페이지가 직접 다루는 상태:

- `callSessionStatus`
  - `idle`
  - `ringing`
  - `claimed`
  - `in_call`
  - `ended`
  - `wrap_up`
  - `saved`
  - `dismissed`
- `contactMatchStatus`
  - `none`
  - `single`
  - `multiple`
- 연동 상태:
  - `cti_connected`
  - `cti_reconnecting`
  - `cti_disconnected`

메모:

- `callSessionStatus`는 현재 DB 엔터티가 아니라 desktop 런타임 상태다.
- MVP에서 영구 저장되는 것은 `Contact`, `Consultation`, `BuyerRequirement`, `Task`이며, 통화 자체의 세션 수명주기는 IPC/WebSocket 계층에서 관리한다.

상태 전이 규칙:

```text
idle -> ringing -> claimed -> in_call -> ended -> wrap_up -> saved
idle -> ringing -> dismissed
ringing -> claimed -> wrap_up
```

상태별 UI 차이:

- `ringing`:
  - 헤더 배너가 강조되고 `상담 시작` 버튼이 1차 CTA가 된다.
- `claimed`:
  - 점유자 외 사용자는 편집 불가, 관찰 모드로 전환된다.
- `in_call`:
  - 상담 메모 편집, 빠른 태스크/구매조건 액션을 활성화한다.
- `ended`:
  - 통화 타이머는 멈추고 Wrap-up 패널이 열린다.
- `wrap_up`:
  - 사용자가 저장 또는 폐기를 결정하기 전까지 미정리 배지로 남는다.
- `saved`:
  - 세션은 좌측 최근 콜로 내려가고 다음 화면 이동을 제안한다.
- `cti_disconnected`:
  - 인바운드 이벤트 자동 수신을 중단하고 수동 검색 모드로 전환한다.

## 11. 예외 / 빈 상태 / 오류 상태

- 빈 상태:
  - 현재 활성 통화가 없으면 `전화번호 검색 후 수동 상담 시작` 상태를 보여준다.
- 검색 결과 없음:
  - `신규 연락처 생성` 폼을 즉시 노출한다.
- 권한 없음:
  - 다른 사용자가 점유 중인 세션에서 agent는 읽기 전용 모드로 본다.
- 연동 실패:
  - CTI 연결이 끊기면 상단에 `실시간 수신 불가` 배너를 띄우고 수동 모드로 전환한다.
- 삭제 불가 조건:
  - 저장된 Consultation 자체는 이 페이지에서 삭제하지 않는다.
- 충돌 상태:
  - 같은 번호에 대해 다른 사용자가 방금 Contact를 만들었을 경우 `새로 생성하지 말고 기존 연락처에 붙이기` 안내를 보여준다.
  - 같은 콜 세션에서 중복 저장이 감지되면 가장 최근 저장 Consultation을 기준으로 세션을 잠근다.

## 12. 연결 엔터티와 화면

| 연결 대상 | 연결 방식 | 사용 목적 |
| --- | --- | --- |
| Contact Detail | 딥링크 이동 | 연락처의 전체 이력과 관계 확인 |
| Buyer Requirements | 우측 패널 카드 + 딥링크 | 통화 중 구매조건 확인/수정 |
| Consultations | 타임라인 인라인 조회 | 최근 상담 맥락 파악 |
| Tasks | 우측 패널 + 생성 모달 | 후속 작업 연결 |
| Matches | CTA 이동 | 구매조건 저장 직후 매칭 후보 탐색 |
| Properties | CTA 이동 | 상담 중 언급한 매물/호실 열기 |
| Notifications | 최소화/부재중 알림 | 세션 복귀 유도 |
| Dashboard | 수동 진입 | 전화 업무 허브 역할 |

## 13. Desktop 전용 요구사항

- 다중 패널 필요 여부:
  - 필요. `좌측 콜 리스트 + 중앙 상담 작성 + 우측 관련 정보` 3패널이 기본이다.
- 키보드 단축키:
  - `Enter`: 선택된 콜 세션 열기
  - `Cmd/Ctrl+Enter`: 상담 저장
  - `Cmd/Ctrl+Shift+T`: 후속 태스크 생성
  - `Esc`: 현재 세션 최소화
  - `Cmd/Ctrl+K`: 번호/이름 검색 포커스
- 실시간 업데이트:
  - CTI 수신 이벤트
  - 세션 점유자 변경
  - 같은 Contact에 대한 타 사용자 수정 알림
- 알림 연동:
  - OS 알림, 앱 배지, 사이드바 뱃지
  - 최소화 상태의 미정리 콜 알림
- 시스템 트레이/OS 이벤트 연동:
  - 통화 수신 시 앱 포커스 또는 배너 표시
  - 사용자가 선택하면 트레이 상태에서도 워크스페이스를 복원
- 로컬 기능 연동:
  - CTI Bridge와의 로컬 IPC/WebSocket 연결
  - 향후 로컬 녹음 파일 선택/업로드 진입점
- 멀티 선택 / 벌크 액션:
  - MVP에서는 제공하지 않는다.
  - 다만 좌측 리스트에서 `미정리 콜 일괄 닫기`는 후순위 후보로 둔다.
- 창 크기 변화 대응:
  - 기본은 3패널
  - 좁은 폭에서는 우측 패널을 탭/시트로 접는다.
  - 팝업 윈도우 모드에서도 최소 핵심 편집 기능은 유지해야 한다.

## 14. 감사 추적 / 로그

- ActivityLog 기록 대상 액션:
  - Contact 생성/수정
  - Consultation 생성/수정
  - BuyerRequirement 생성/수정
  - Task 생성/수정
- actor / source 규칙:
  - desktop UI에서 저장한 변경은 `actor=user`, `source=web` 또는 향후 `source=desktop` 확장 검토
  - MCP 또는 시스템 자동화가 후속 Task를 만들면 해당 source를 그대로 사용
- 중요 감사 이벤트:
  - 같은 번호에 대한 신규 Contact 생성
  - BuyerRequirement의 `nextContactDate` 변경
  - 상담 저장 후 후속 Task 생성
  - manager/owner의 세션 재배정

## 15. 비기능 요구사항

- 초기 로딩 목표:
  - CTI 이벤트 수신 후 1초 이내에 워크스페이스가 열려야 한다.
  - 전화번호 매칭 결과는 300ms~800ms 이내에 1차 표시가 되어야 한다.
- 대량 데이터 처리 방식:
  - 상담 이력은 최근 10건만 먼저 로딩하고 추가 조회는 지연 로딩한다.
  - Task는 미완료 항목 우선으로 요약한다.
- 낙관적 업데이트 여부:
  - 상담 저장, 태스크 생성, BuyerRequirement 업데이트는 낙관적 반영 가능
  - Contact 중복 가능성이 있는 생성은 서버 확정 후 반영
- 오프라인/재시도 전략:
  - CTI는 로컬 이벤트이므로 서버 저장 실패 시 `미저장 초안` 상태로 남겨 재시도해야 한다.
  - 서버 연결이 끊겨도 사용자는 메모를 잃지 않아야 한다.
- 접근성/가독성 메모:
  - 통화 중 빠르게 읽어야 하므로 숫자, 이름, 상태 배지는 대비가 명확해야 한다.
  - 메모 입력 영역은 기본 4~6줄 높이를 확보한다.

## 16. MVP 포함 범위

- 인바운드/아웃바운드 전화 세션을 위한 dedicated desktop workspace
- 전화번호 기반 Contact 자동 탐색
- 신규 Contact 생성 및 기존 Contact 선택
- `type=phone` Consultation 생성
- BuyerRequirement 요약 조회 및 최소 수정
- 후속 Task 생성
- 세션 최소화 및 미정리 상태 유지
- 팀 내 단일 세션 점유 개념

## 17. MVP 제외 범위

- 녹음 파일 업로드와 STT 요약
- AI 상담 요약/추천 액션 자동 생성
- 통화 품질 분석, 응답 SLA 대시보드
- 영구 `CallLog` 엔터티와 통화시간 리포트
- 소프트폰 다이얼 패드, 실제 전화 발신 제어
- 벌크 콜 캠페인, 자동 재배정 룰

## 18. 열린 질문

- 현재 스키마에는 영구 `Call` 또는 `CallLog` 엔터티가 없다. MVP는 `세션 상태는 클라이언트/실시간 계층`, `결과 저장은 Consultation`으로 충분한가?
- `Consultation`에 최소한 `direction`, `startedAt`, `endedAt`, `ctiCallId`, `phoneSnapshot` 필드를 추가해야 하는가?
- CTI 이벤트를 office 전체에 브로드캐스트할 때, 세션 점유 상태를 어디에 저장할 것인가? 서버 메모리, Redis, 또는 Notification 기반 임시 상태 중 무엇이 맞는가?
- 아웃바운드 전화는 앱에서 직접 시작하는가, 아니면 외부 전화기/CTI에서 시작된 후 워크스페이스만 열어주는가?
- manager/owner가 다른 사용자의 통화 내용을 실시간으로 보는 권한을 어디까지 허용할 것인가?

## 19. 수용 기준

- 사용자는 이 페이지에서 `전화번호를 기준으로 적절한 연락처를 찾거나 새로 만들고, 전화 상담을 기록`할 수 있어야 한다.
- 사용자는 최소 클릭/입력으로 `활성 BuyerRequirement와 최근 상담 맥락`을 찾을 수 있어야 한다.
- 인바운드 전화가 수신되면 같은 office의 여러 사용자 중 한 명만 세션을 점유하고 저장 주체가 명확해야 한다.
- 통화 종료 후 사용자는 같은 화면에서 `후속 태스크 생성 또는 다음 연락일 설정`까지 끝낼 수 있어야 한다.
- CTI 또는 서버 연결에 문제가 생겨도 사용자는 `메모 초안`을 잃지 않아야 한다.
- 역할별 권한 차이가 UI와 API 모두에서 일치해야 한다.
- 연관 화면으로의 이동이 명확해야 한다.
