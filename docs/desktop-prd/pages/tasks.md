# Tasks

## 메타

- 페이지명: Tasks
- 문서 상태: draft
- 우선순위: P0
- Phase: Phase 2
- 구현 상태: substantial prototype exists
- 작성일: 2026-04-02
- 최종 수정일: 2026-04-02
- 관련 엔터티: Task, User, Contact, Property, Listing, Consultation, ActivityLog, Match(future), Deal(future), Contract(future), CalendarEvent
- 관련 API:
  - `GET /tasks`
  - `GET /tasks/:id`
  - `POST /tasks`
  - `PATCH /tasks/:id`
  - `POST /tasks/reorder`
  - `POST /tasks/bulk-status`
  - `POST /tasks/bulk-delete`
  - `DELETE /tasks/:id`
- 관련 화면: Contacts, Buyer Requirements, Matches, Deals, Contracts, Consultation, Calendar

현재 결정:

- 이 문서는 desktop의 `업무 관리 페이지`를 기준으로 작성한다.
- Tasks는 개인 할 일 목록이 아니라 `사무소 전체의 실행 작업 허브`다.
- 현재 desktop 구현에는 `작업별`, `상태별`, `보드`, `전체` 4개 뷰가 있으므로 이를 정식 UX로 수용한다.
- `Task.source = manual | system | ai`는 중요한 구분값이므로 장기적으로 UI에서도 더 잘 드러나야 한다.
- 현재 스키마는 `contact/property/listing/consultation` 문맥만 직접 연결하고 있다.
- 반면 category에는 `match`, `deal`, `contract`가 이미 있으므로, 장기적으로는 `matchId`, `dealId`, `contractId` 같은 구조적 연결이 필요하다.
- `docs/DATA_STRUCTURE.md`의 Task 설명은 구버전(`isDone`) 기준이므로, Task의 source of truth는 Prisma 스키마다.

## 1. 페이지 목적

- 이 페이지가 해결해야 하는 핵심 업무:
  - 사무소 안의 후속 업무를 빠르게 만들고, 상태별로 정리하고, 담당과 마감일을 관리한다.
  - 상담/연락처/매물/거래 흐름에서 발생한 작업을 한 곳에서 실행한다.
  - 개인 작업과 팀 작업을 동시에 모니터링한다.
- primary 사용자:
  - agent
- secondary 사용자:
  - manager, owner
- 이 페이지가 필요한 이유:
  - CRM에서 중요한 것은 데이터 저장보다 `후속 작업 누락 방지`다.
  - 상담 이후 콜백, 매물 확인, 계약 준비, 광고 수정 같은 실무가 한눈에 보여야 한다.
  - desktop에서는 다건 처리, 빠른 수정, 상태 이동, 일괄 처리가 중요하다.

## 2. 사용 시점

- 사용자가 이 페이지에 들어오는 대표 상황:
  - 오늘 해야 할 업무와 지연된 업무를 정리할 때
  - 상담 후 follow-up task를 만들거나 수정할 때
  - 팀 전체 진행 상황을 상태별/카테고리별로 볼 때
  - 여러 업무를 한 번에 완료 처리하거나 삭제할 때
- 진입 경로:
  - 사이드바 `업무`
  - Contact / Consultation / Property / Listing 화면의 `할 일 추가`
  - Deals / Contracts / Matches 후속 액션
  - 알림 또는 캘린더 역진입
- 이전 화면:
  - Contacts
  - Consultation
  - Properties/Listings
  - Buyer Requirements
  - Matches
  - Deals
  - Contracts
- 다음 화면:
  - Task Edit Modal
  - 관련 Contact / Listing / Consultation 화면
  - 후속 Calendar 화면
- 이 페이지를 나가는 대표 액션:
  - 새 업무 생성
  - 업무 수정
  - 상태 변경
  - 관련 엔터티 화면으로 이동

## 3. 사용자 역할과 권한

| 역할 | 조회 | 생성 | 수정 | 삭제 | 승인/확정 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| owner | 전체 조회 | 가능 | 가능 | 가능 | 가능 | 전체 운영 관리 |
| manager | 전체 조회 | 가능 | 가능 | 가능 | 가능 | 팀 업무 조정 |
| agent | 전체 조회 | 가능 | 가능 | 제한적 | 가능 | 실무 처리 중심 |

권한 메모:

- 기본적으로 office 전체 Task 조회는 허용한다.
- agent도 자신이 생성한 업무와 실무 업무 수정은 가능해야 한다.
- 일괄 삭제와 대량 정리는 owner/manager 중심이 안전하다.
- 시스템/AI 생성 task의 삭제와 원인 변경은 추가 보호가 필요할 수 있다.

## 4. 핵심 시나리오

### 시나리오 A: 수동 업무 생성

1. 사용자는 상단의 `업무 추가` 버튼을 누른다.
2. 시스템은 제목, 설명, 카테고리, 우선순위, 마감일을 입력할 수 있는 폼을 연다.
3. 사용자는 내용을 저장한다.
4. 완료 조건:
   - Task가 생성되고
   - 현재 선택한 뷰에 바로 반영된다.

### 시나리오 B: 후속 업무 정리

1. 사용자는 `내 업무`, `마감일`, `카테고리`, `상태` 필터를 조합해 현재 집중할 작업을 좁힌다.
2. 시스템은 해당 조건에 맞는 Task만 보여준다.
3. 사용자는 상태, 우선순위, 마감일을 인라인으로 바꾼다.
4. 완료 조건:
   - 오늘 처리해야 할 작업이 명확해지고
   - 빠른 수정이 가능하다.

### 시나리오 C: 상태 기반 작업 흐름 관리

1. 사용자는 `상태별` 뷰 또는 `보드` 뷰에서 작업을 본다.
2. 시스템은 `pending -> in_progress -> completed` 흐름으로 묶어서 보여준다.
3. 사용자는 drag-and-drop 또는 quick action으로 상태를 바꾼다.
4. 완료 조건:
   - 팀이 현재 대기/진행/완료 작업을 공통된 기준으로 본다.

### 시나리오 D: 다건 처리

1. 사용자는 `전체` 뷰에서 여러 Task를 선택한다.
2. 시스템은 bulk action bar를 보여준다.
3. 사용자는 선택된 작업을 진행중, 완료, 삭제 중 하나로 처리한다.
4. 완료 조건:
   - 반복 작업이 빠르게 정리된다.

### 시나리오 E: 컨텍스트 기반 업무

1. 사용자는 상담/연락처/매물/거래 흐름에서 Task를 생성한다.
2. 시스템은 관련 엔터티를 자동 연결해 어떤 문맥의 업무인지 남긴다.
3. 사용자는 Tasks 페이지에서 해당 업무를 보고 후속 조치를 이어간다.
4. 완료 조건:
   - Task가 단순 메모가 아니라 실제 CRM 문맥을 가진다.

## 5. 화면 구조

예시:

- 상단: sticky filter bar + view switcher + 새 업무
- 본문: 선택한 view mode에 따른 task 목록
- 상세: 생성/수정 modal

실제 정의:

- 상단 sticky 영역:
  - `내 업무` toggle
  - 상태 filter
  - 마감일 filter
  - 카테고리 filter
  - 필터 초기화
  - view switcher
    - `작업별`
    - `상태별`
    - `보드`
    - `전체`
  - `업무 추가` 버튼
- 본문 영역:
  - `작업별 뷰`
    - 카테고리별 접이식 테이블
  - `상태별 뷰`
    - 상태 그룹별 접이식 테이블
    - drag-and-drop reorder 및 cross-status 이동
  - `보드 뷰`
    - `pending`, `in_progress`, `completed` 3컬럼 칸반
  - `전체 뷰`
    - 단일 테이블
    - multi-select + bulk action
- 공통 row/card 정보:
  - 제목
  - 상태
  - 담당자
  - 마감일
  - 우선순위
  - 카테고리
  - 필요 시 관련 문맥
- 상세 영역:
  - 현재 구현은 `TaskFormModal`
  - MVP에서는 modal 유지가 적절하다
  - 장기적으로 content, context, activity가 커지면 우측 detail panel도 검토 가능

리스트 컬럼 정의:

- `No`
- `작업`
- `상태`
- `담당자`
- `마감일`
- `우선순위`
- `카테고리`
- `액션`

## 6. 조회 데이터

| 항목 | 설명 | 필수 여부 | 출처 |
| --- | --- | --- | --- |
| taskList | 전체 Task 목록 | 필수 | `GET /tasks` |
| selectedTask | 개별 Task 상세 | 선택 | `GET /tasks/:id` |
| assigneeSummary | 담당자 정보 | 선택 | `assignedTo` include |
| contactSummary | 관련 연락처 | 선택 | `contact` include |
| propertySummary | 관련 부동산 정보 | 선택 | `property` include |
| listingSummary | 관련 매물 정보 | 선택 | `listing` include |
| consultationSummary | 관련 상담 정보 | 선택 | `consultation` include |
| matchSummary | 관련 Match | 중요 | 현재 없음, 후속 구조 필요 |
| dealSummary | 관련 Deal | 중요 | 현재 없음, 후속 구조 필요 |
| contractSummary | 관련 Contract | 중요 | 현재 없음, 후속 구조 필요 |

조회 규칙:

- 초기 진입 시:
  - `GET /tasks`로 office 전체 Task를 조회한다.
- 각 뷰는:
  - 목록 데이터를 클라이언트에서 그룹화한다.
- 상태별 뷰는:
  - local state로 임시 순서를 유지하고, reorder API로 서버에 반영한다.
- 후속 개선:
  - 데이터가 커지면 server-side filtering, pagination, search가 필요하다.

## 7. 검색 / 필터 / 정렬

- 기본 검색 대상:
  - 제목
  - 내용
  - 관련 연락처명
  - 관련 매물명
  - 관련 업무 문맥 키워드
- 기본 정렬:
  - 현재는 `sortOrder asc`, 그 다음 `createdAt desc`
- 필터 항목:
  - 상태
  - 마감일
  - 카테고리
  - `내 업무만`
  - 후속 필요: source, 담당자, 관련 엔터티 유형
- 저장 가능한 뷰:
  - MVP에서는 사용자 저장 뷰 없음
  - 기본 제공 뷰는 `작업별`, `상태별`, `보드`, `전체`
- 역할별 기본 뷰 차이:
  - agent는 `작업별` 또는 `내 업무` 기반
  - manager/owner는 `상태별`과 `보드`가 유용

## 8. 주요 액션

| 액션 | 설명 | 권한 | 성공 결과 | 실패/예외 |
| --- | --- | --- | --- | --- |
| Task 생성 | 새 업무 생성 | 전체 | 목록 반영 | 제목 누락 |
| Task 수정 | 제목, 설명, 카테고리, 우선순위, 마감일 수정 | 전체 | 저장 반영 | validation 실패 |
| 상태 변경 | pending/in_progress/completed/cancelled 변경 | 전체 | 상태 반영 | 잘못된 상태값 |
| 마감일 수정 | 인라인 date picker로 수정 | 전체 | dueDate 저장 | 날짜 형식 오류 |
| 우선순위 수정 | 인라인 priority 변경 | 전체 | priority 저장 | 값 오류 |
| 담당자 해제/변경 | assignee 조정 | 전체 | assignedTo 반영 | 사용자 선택 미구현 |
| reorder | 상태 그룹 내부 순서 변경 | 전체 | sortOrder 반영 | 동기화 충돌 |
| cross-status 이동 | 다른 상태 그룹으로 이동 | 전체 | status 변경 | 드래그 충돌 |
| bulk 완료/진행/삭제 | 다중 선택 후 일괄 처리 | manager/owner 중심, agent 제한 가능 | 다건 반영 | 일부 실패 |
| 삭제 | 단건 삭제 | 제한적 | 목록 제거 | 시스템 생성 task 보호 필요 |

## 9. 생성 / 수정 폼 규칙

- 필수 입력값:
  - `title`
- 기본값:
  - `source = manual`
  - `status = pending`
  - `priority = medium`
  - `category = other`
- 자동 계산:
  - 없음
- 상호 의존 필드:
  - context 기반 생성이면 관련 엔터티 ID가 함께 들어가야 한다
  - 향후 `deal/contract/match` task는 구조적 FK가 필요하다
- 저장 전 검증:
  - 제목 공백 금지
  - dueDate는 유효한 날짜여야 한다
  - 상태/우선순위/카테고리는 허용된 enum 값이어야 한다
- 저장 후 후속 액션:
  - 목록 재집계
  - ActivityLog 기록
  - 관련 화면에서 생성한 경우 원래 화면의 문맥 요약도 갱신 가능해야 한다

현재 구현 메모:

- 생성/수정 modal에는 현재 `담당자`, `source`, `context FK` 입력 UI가 없다.
- 담당자는 목록 인라인에서 해제만 가능하고, 명시적 재지정 UI는 아직 부족하다.
- 컨텍스트 자동 연결은 API/스키마로는 가능하지만, 현재 일반 생성 modal에서는 노출되지 않는다.

## 10. 상태값

이 페이지가 직접 다루는 상태:

- Task.status
  - `pending`
  - `in_progress`
  - `completed`
  - `cancelled`
- Task.priority
  - `urgent`
  - `high`
  - `medium`
  - `low`
- Task.source
  - `manual`
  - `system`
  - `ai`

상태 전이 규칙:

```text
pending -> in_progress -> completed
pending -> cancelled
in_progress -> cancelled
completed -> reopened(future, 현재 없음)
```

상태별 UI 차이:

- `pending`
  - planning queue
- `in_progress`
  - 적극 처리 중인 업무
- `completed`
  - 완료선/완료 집계에 포함
- `cancelled`
  - 현재 UI에서는 기본적으로 숨겨지는 경향이 있다
  - 장기적으로 별도 archive/hidden 상태 처리 필요

## 11. 예외 / 빈 상태 / 오류 상태

- 빈 상태:
  - 필터 조건에 맞는 Task가 없으면 `업무 추가` CTA와 함께 빈 상태 표시
- 검색 결과 없음:
  - 검색 UI 추가 시 별도 empty state 필요
- 권한 없음:
  - bulk delete, 시스템 task 수정 등은 비활성화
- 연동 실패:
  - reorder나 bulk action 실패 시 최신 상태 재조회 필요
- 삭제 불가 조건:
  - 시스템 생성 task 또는 규칙 기반 task는 즉시 삭제 제한 가능
- 충돌 상태:
  - 두 사용자가 동시에 상태/우선순위를 바꾸면 마지막 저장이 덮어쓸 수 있음
- 구조 한계:
  - category가 `deal/contract/match`여도 실제 FK 연결이 없어 문맥 탐색이 약하다

## 12. 연결 엔터티와 화면

| 연결 대상 | 연결 방식 | 사용 목적 |
| --- | --- | --- |
| Contact | `contactId` | 콜백/후속 연락 문맥 |
| Property | `propertyId` | 현장 확인/소유자 확인 문맥 |
| Listing | `listingId` | 광고/매물 관리 문맥 |
| Consultation | `consultationId` | 상담 후 follow-up 문맥 |
| Match | future `matchId` | 매칭 후속 작업 |
| Deal | future `dealId` | 거래 준비/정산 작업 |
| Contract | future `contractId` | 계약 준비/서류 작업 |
| CalendarEvent | 후속 연동 | 마감일을 일정으로 확장 |

## 13. Desktop 전용 요구사항

- 다중 패널 필요 여부:
  - 낮음
  - 목록과 modal 중심이 적합하다
- 키보드 단축키:
  - `N` 새 업무
  - `/` 검색 포커스
  - `Esc` modal 닫기
  - `Space` 또는 지정 키로 빠른 완료 처리 검토 가능
- 실시간 업데이트:
  - 상태 변경, bulk 처리, reorder는 팀 화면에 빠르게 반영되어야 한다
- 알림 연동:
  - overdue, today due task 알림 필요
- 시스템 트레이/OS 이벤트 연동:
  - 필수 아님
- 로컬 기능 연동:
  - 필수 아님
- 멀티 선택 / 벌크 액션:
  - `전체` 뷰에서 지원
- 창 크기 변화 대응:
  - 보드는 3컬럼 기준
  - 좁은 폭에서는 테이블 가로 스크롤 허용

## 14. 감사 추적 / 로그

- ActivityLog 기록 대상 액션:
  - Task 생성
  - 제목/내용 수정
  - 상태 변경
  - 우선순위 변경
  - 마감일 변경
  - 담당자 변경
  - bulk status
  - bulk delete
- actor / source 규칙:
  - manual UI는 `actor=user`, `source=web` 또는 desktop source 확장 필요
  - 규칙 엔진 생성은 `actor=system:rule_engine`
  - AI 생성은 `actor=mcp:*`, `source=mcp`
- 중요 감사 이벤트:
  - overdue task 완료 처리
  - 시스템 생성 task 삭제
  - 계약/거래 관련 task 대량 변경

## 15. 비기능 요구사항

- 초기 로딩 목표:
  - Task 300건 기준 2초 이내 체감 로딩
- 대량 데이터 처리 방식:
  - 현재는 전체 조회 후 클라이언트 그룹화
  - 이후 서버 필터링과 pagination 고려
- 낙관적 업데이트 여부:
  - status, priority, dueDate는 제한적 낙관적 업데이트 가능
  - bulk 작업은 서버 성공 후 반영이 안전하다
- 오프라인/재시도 전략:
  - update/reorder 실패 시 이전 상태 복원 또는 재조회
- 접근성/가독성 메모:
  - 우선순위와 overdue 상태가 즉시 보여야 한다
  - 완료된 task는 line-through 처리 유지

## 16. MVP 포함 범위

- 4개 view mode
- 상태/마감일/카테고리/내 업무 필터
- Task 생성/수정 modal
- 인라인 상태/우선순위/마감일 수정
- 상태별 drag-and-drop
- 리스트 bulk action
- Contact / Property / Listing / Consultation 문맥 연결

## 17. MVP 제외 범위

- 고급 검색
- 저장된 개인 뷰
- task comment thread
- subtask 계층 구조
- recurring task
- 자동 assignee recommendation
- Match / Deal / Contract 구조적 FK 연결 구현
- Calendar 양방향 동기화

## 18. 열린 질문

- `Task`에 `matchId`, `dealId`, `contractId`를 추가해야 하는가?
- 현재 `sortOrder`는 전역 순서에 가까운데, 상태 그룹별 순서로 봐야 하는가?
- cancelled task를 별도 archive view로 보여줄 것인가?
- 담당자 지정 UI는 user picker까지 포함해 강화해야 하는가?
- system/ai 생성 task를 일반 task와 같은 방식으로 수정/삭제해도 되는가?
- 검색을 MVP에 넣을지, 현재 필터만으로 충분한지?

## 19. 수용 기준

- 사용자는 이 페이지에서 `오늘 해야 할 업무와 지연된 업무`를 빠르게 식별할 수 있어야 한다.
- 사용자는 최소 클릭으로 `상태, 우선순위, 마감일`을 바꿀 수 있어야 한다.
- 사용자는 `작업별`, `상태별`, `보드`, `전체` 뷰를 상황에 맞게 전환할 수 있어야 한다.
- 관련 화면에서 생성된 Task는 어떤 문맥의 후속 업무인지 이해 가능해야 한다.
- 예외 상황에서 사용자는 왜 저장, reorder, bulk 작업이 실패했는지 이해할 수 있어야 한다.
