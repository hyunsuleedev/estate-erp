# Calendar

## 메타

- 페이지명: Calendar
- 문서 상태: draft
- 우선순위: P1
- Phase: Phase 2
- 구현 상태: basic month view exists
- 작성일: 2026-04-02
- 최종 수정일: 2026-04-02
- 관련 엔터티: CalendarEvent, User, Contact, Property, Listing, Match, Deal, ActivityLog, Task(future overlay), Contract(future link)
- 관련 API:
  - `GET /calendar-events`
  - `GET /calendar-events/:id`
  - `POST /calendar-events`
  - `PATCH /calendar-events/:id`
  - `DELETE /calendar-events/:id`
- 관련 화면: Tasks, Contacts, Properties/Listings, Matches, Deals, Contracts

현재 결정:

- 이 문서는 desktop의 `캘린더 페이지`를 기준으로 작성한다.
- Calendar는 별도 데이터 창고가 아니라, CRM 흐름에서 발생한 일정형 이벤트를 시간축에 올려보는 화면이다.
- 현재 구현은 `월간 그리드 + 범위 조회 + 읽기 중심` 수준이다.
- 장기적으로는 `일정 생성/수정`, `드래그 이동`, `팀/개인 필터`, `관련 엔터티 상세 진입`까지 지원해야 한다.
- 현재 `CalendarEvent`는 `propertyId`, `listingId`, `contactId`, `matchId`, `dealId`는 연결 가능하지만 `contractId`, `taskId`는 없다.
- 따라서 계약 일정은 현재 `type=contract + dealId`로 표현될 가능성이 높고, 장기적으로는 `contractId` 직접 연결이 필요하다.

## 1. 페이지 목적

- 이 페이지가 해결해야 하는 핵심 업무:
  - 일정형 업무를 날짜 기준으로 한눈에 확인한다.
  - 방문, 계약, 미팅, 일반 일정 같은 이벤트를 시간축으로 정리한다.
  - 관련 CRM 엔터티와 연결된 일정을 빠르게 찾고 이동한다.
- primary 사용자:
  - agent
- secondary 사용자:
  - manager, owner
- 이 페이지가 필요한 이유:
  - Tasks만으로는 언제 해야 하는지를 직관적으로 보기 어렵다.
  - 부동산 실무는 방문, 계약, 미팅, 잔금일 같은 날짜 중심 이벤트가 많다.
  - desktop에서는 월간/주간 관점으로 팀 일정을 훑는 화면이 필요하다.

## 2. 사용 시점

- 사용자가 이 페이지에 들어오는 대표 상황:
  - 이번 달 방문/계약 일정을 훑을 때
  - 특정 날짜에 몰린 이벤트를 확인할 때
  - 거래/계약 일정이 겹치는지 볼 때
  - 특정 사용자나 일정 유형만 보고 싶을 때
- 진입 경로:
  - 사이드바 `캘린더`
  - Task/Deal/Contract 화면의 일정 보기
  - Contact/Property/Match에서 연결 일정 열기
- 이전 화면:
  - Tasks
  - Deals
  - Contracts
  - Contacts
  - Properties/Listings
- 다음 화면:
  - Event Detail Modal or Panel
  - 관련 Contact / Listing / Match / Deal 화면
- 이 페이지를 나가는 대표 액션:
  - 날짜 이동
  - 이벤트 선택
  - 이벤트 생성/수정
  - 관련 화면으로 이동

## 3. 사용자 역할과 권한

| 역할 | 조회 | 생성 | 수정 | 삭제 | 승인/확정 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| owner | 전체 조회 | 가능 | 가능 | 가능 | 가능 | 전체 일정 가시성 |
| manager | 전체 조회 | 가능 | 가능 | 가능 | 가능 | 팀 스케줄 조정 |
| agent | 전체 조회 | 가능 | 가능 | 제한적 | 가능 | 실무 일정 관리 |

권한 메모:

- 기본적으로 office 전체 CalendarEvent 조회는 허용한다.
- userId별 필터링은 제공하되 데이터 자체는 office scope 안에서 공유된다.
- agent도 자신이 만든 이벤트 수정은 가능해야 한다.
- 팀 전체 일정 삭제는 owner/manager 중심이 안전하다.

## 4. 핵심 시나리오

### 시나리오 A: 월간 일정 확인

1. 사용자는 Calendar 페이지에 진입한다.
2. 시스템은 해당 월의 이벤트를 조회해 월간 그리드에 배치한다.
3. 사용자는 특정 날짜에 어떤 일정이 있는지 빠르게 훑는다.
4. 완료 조건:
   - 이번 달 일정 밀도를 빠르게 이해할 수 있다.

### 시나리오 B: 관련 엔터티에서 일정 생성

1. 사용자는 Match, Deal, Contact, Property 화면에서 일정 생성을 시작한다.
2. 시스템은 관련 엔터티 ID를 포함한 CalendarEvent 초안을 만든다.
3. 사용자는 제목, 시간, 유형을 저장한다.
4. 완료 조건:
   - 일정이 달력과 관련 화면 양쪽에서 추적 가능하다.

### 시나리오 C: 일정 변경

1. 사용자는 캘린더에서 이벤트를 선택하거나 드래그해 날짜/시간을 바꾼다.
2. 시스템은 `PATCH /calendar-events/:id`로 start/end를 갱신한다.
3. 사용자는 변경된 일정이 즉시 반영된 것을 본다.
4. 완료 조건:
   - 일정 조정이 빠르게 끝나고
   - 관련 문맥은 유지된다.

### 시나리오 D: 일정과 CRM 문맥 연결 확인

1. 사용자는 계약 일정 또는 방문 일정을 클릭한다.
2. 시스템은 해당 이벤트에 연결된 Deal, Match, Contact, Property 정보를 보여준다.
3. 사용자는 필요 시 원본 화면으로 이동한다.
4. 완료 조건:
   - 캘린더가 고립된 일정판이 아니라 CRM 허브 역할을 한다.

## 5. 화면 구조

예시:

- 상단: 날짜 네비게이션 / 뷰 전환 / 필터
- 본문: 월/주/일 캘린더
- 상세: 선택 이벤트 정보 패널

실제 정의:

- 상단 영역:
  - 페이지 제목
  - 현재 연/월 표시
  - 이전/다음 월 이동
  - `오늘` 버튼
  - 후속 확장: 뷰 전환
    - `월`
    - `주`
    - `일`
    - `목록`
- 필터/컨트롤 영역:
  - 사용자 filter
  - 이벤트 유형 filter
  - `내 일정만`
  - 후속 확장: Task overlay toggle
- 본문 영역:
  - 현재 구현:
    - 월간 그리드
    - 각 날짜 셀에 최대 3개 이벤트 노출
    - 초과 시 `+N` 표기
  - 목표 구조:
    - 월간/주간/일간/목록 뷰 지원
    - allDay와 시간 이벤트를 구분
    - 색상으로 type 또는 사용자 구분
- 상세 영역:
  - 현재 구현에는 없다
  - 목표:
    - 클릭 시 Event Detail Modal 또는 우측 패널
    - 제목, 시간, 유형, 설명, 관련 엔터티 링크 노출

월간 셀 표시 규칙:

- 상단에 날짜 숫자
- 오늘은 강조 표시
- 각 이벤트는 짧은 색상 pill로 표시
- 너무 많은 이벤트는 `+N`
- 주말 색상 구분 유지

## 6. 조회 데이터

| 항목 | 설명 | 필수 여부 | 출처 |
| --- | --- | --- | --- |
| eventList | 현재 범위 내 CalendarEvent 목록 | 필수 | `GET /calendar-events` |
| selectedEvent | 선택 이벤트 상세 | 선택 | `GET /calendar-events/:id` |
| eventUser | 이벤트 담당 사용자 | 선택 | `user` include |
| contactSummary | 연결 연락처 | 선택 | `contact` include |
| propertySummary | 연결 부동산 | 선택 | `property` include |
| listingSummary | 연결 매물 | 선택 | `listing` include |
| matchSummary | 연결 Match | 선택 | `match` include |
| dealSummary | 연결 Deal | 선택 | `deal` include |
| contractSummary | 연결 Contract | 중요 | 현재 직접 연결 없음, 후속 구조 필요 |
| taskOverlay | 마감 task overlay | 후속 | Task query 기반 후속 확장 |

조회 규칙:

- 초기 진입 시:
  - 현재 월의 `start/end` 범위로 `GET /calendar-events` 호출
- 월 이동 시:
  - 해당 월 범위를 다시 조회
- 이벤트 선택 시:
  - 목록 데이터가 충분하지 않으면 `GET /calendar-events/:id` 호출
- 후속 개선:
  - userId, type filter를 서버 쿼리로 직접 반영
  - FullCalendar 같은 richer component 채택 시 view range query를 그대로 재사용 가능

## 7. 검색 / 필터 / 정렬

- 기본 검색 대상:
  - 현재 구현에는 없음
  - 후속 목표: 제목, 설명, 관련 연락처명, 매물명
- 기본 정렬:
  - `start asc`
- 필터 항목:
  - userId
  - type
  - `내 일정만`
  - 후속: 관련 엔터티 유형
- 저장 가능한 뷰:
  - MVP에서는 사용자 저장 뷰 없음
  - 기본 제공 뷰는 현재 `월`
  - 후속 제공: `주`, `일`, `목록`
- 역할별 기본 뷰 차이:
  - agent는 `월` 또는 `주`
  - manager/owner는 팀 일정 모니터링을 위해 `월`과 `목록`이 유용

## 8. 주요 액션

| 액션 | 설명 | 권한 | 성공 결과 | 실패/예외 |
| --- | --- | --- | --- | --- |
| 월 이동 | 이전/다음 월로 이동 | 전체 | 해당 범위 재조회 | 없음 |
| 오늘로 이동 | 현재 날짜가 있는 범위로 이동 | 전체 | 오늘 포함 월 표시 | 없음 |
| 이벤트 상세 열기 | 셀 내 이벤트 클릭 | 전체 | 상세 표시 | 상세 UI 미구현 |
| 이벤트 생성 | 새 일정 추가 | 전체 | CalendarEvent 생성 | 날짜/시간 오류 |
| 이벤트 수정 | 제목/시간/설명/유형 수정 | 전체 | 저장 반영 | validation 실패 |
| 드래그 이동 | 날짜/시간 변경 | 전체 | start/end 갱신 | 충돌/저장 실패 |
| 이벤트 삭제 | 일정 제거 | 제한적 | 목록에서 제거 | 권한/문맥 보호 |
| 관련 화면 열기 | Contact/Listing/Match/Deal로 이동 | 전체 | 원본 화면 진입 | 연결 없음 |

## 9. 생성 / 수정 폼 규칙

- 필수 입력값:
  - `title`
  - `start`
- 기본값:
  - `type = general`
  - `allDay = false`
  - `userId = current user`
- 자동 계산:
  - 월간 셀에서 생성하면 해당 날짜를 기본 start로 채운다
  - 관련 화면에서 생성하면 해당 엔터티 ID를 자동 채운다
- 상호 의존 필드:
  - `allDay=true`면 시간 입력을 단순화할 수 있다
  - 계약 일정이면 현재는 `dealId + type=contract` 조합이 유력하다
  - 후속에는 `contractId` 직접 연결이 필요하다
- 저장 전 검증:
  - start는 유효한 datetime이어야 한다
  - end가 있으면 start 이후여야 한다
  - 관련 엔터티 ID는 office scope 안에서 유효해야 한다
- 저장 후 후속 액션:
  - 현재 범위 재조회
  - ActivityLog 기록
  - 관련 화면의 일정 요약 갱신 가능해야 한다

현재 구현 메모:

- desktop Calendar 화면에는 아직 생성/수정 UI가 없다.
- API는 create/update/delete를 이미 지원한다.
- 서비스 주석상 FullCalendar 호환을 의식하고 있으므로 richer UI로 확장하기 쉽다.

## 10. 상태값

이 페이지가 직접 다루는 상태:

- CalendarEvent.type
  - `general`
  - `viewing`
  - `contract`
  - `meeting`
  - `task`
- CalendarEvent.allDay
  - `true`
  - `false`

상태 전이 규칙:

```text
CalendarEvent는 별도 lifecycle status보다 start/end와 type 중심으로 관리한다.
```

상태별 UI 차이:

- `viewing`
  - 현장 방문 일정으로 강조 색상 필요
- `contract`
  - 계약 일정으로 강한 시각 구분 필요
- `meeting`
  - 일반 미팅
- `task`
  - task 유래 이벤트
- `allDay=true`
  - 상단 all-day 영역 또는 날짜 pill 중심 노출이 적합

## 11. 예외 / 빈 상태 / 오류 상태

- 빈 상태:
  - 해당 월 이벤트가 없으면 빈 달력으로 보여주되 안내 문구 제공 가능
- 검색 결과 없음:
  - 검색 UI 도입 후 별도 empty state 필요
- 권한 없음:
  - 생성/삭제/수정 버튼 비활성화
- 연동 실패:
  - 범위 조회 실패 시 재시도 UI 필요
- 삭제 불가 조건:
  - 시스템 생성 계약 일정 등 보호가 필요한 이벤트는 soft restriction 필요
- 충돌 상태:
  - 다른 사용자가 이미 시간을 바꾼 경우 최신 값 재조회 필요
- 구조 한계:
  - 현재 `contractId`, `taskId`가 없어 계약/업무와의 직접 연결이 약하다

## 12. 연결 엔터티와 화면

| 연결 대상 | 연결 방식 | 사용 목적 |
| --- | --- | --- |
| Contact | `contactId` | 미팅/상담/콜백 일정 |
| Property | `propertyId` | 현장 방문/확인 일정 |
| Listing | `listingId` | 매물 관련 일정 |
| Match | `matchId` | 매칭 후속 일정 |
| Deal | `dealId` | 거래/계약 준비 일정 |
| Contract | future `contractId` | 계약 상세 일정 직접 연결 |
| Task | future overlay or `taskId` | 마감일과 캘린더 통합 |

## 13. Desktop 전용 요구사항

- 다중 패널 필요 여부:
  - 중간
  - 달력과 상세 패널 동시 표시가 유용하다
- 키보드 단축키:
  - 화살표 또는 `J/K` 월 이동 검토 가능
  - `T` 오늘로 이동
  - `N` 새 일정
- 실시간 업데이트:
  - 새 이벤트, 시간 변경, 삭제는 팀 화면에 빠르게 반영되어야 한다
- 알림 연동:
  - 시작 직전 알림, 계약일 알림, 방문 일정 알림 필요
- 시스템 트레이/OS 이벤트 연동:
  - 후속 알림에서 고려 가능
- 로컬 기능 연동:
  - 필수 아님
- 멀티 선택 / 벌크 액션:
  - MVP 제외
- 창 크기 변화 대응:
  - 월간 그리드는 최소 셀 높이 유지
  - 좁은 폭에서는 목록형 또는 condensed view 필요

## 14. 감사 추적 / 로그

- ActivityLog 기록 대상 액션:
  - 이벤트 생성
  - 시간 변경
  - 제목/설명 수정
  - 연결 엔터티 변경
  - 삭제
- actor / source 규칙:
  - desktop 수동 조작은 `actor=user`, `source=web` 또는 desktop source 확장 필요
  - 시스템 생성 일정은 `actor=system:*`
- 중요 감사 이벤트:
  - 계약 일정 변경
  - 방문 일정 변경
  - 거래 연결 일정 삭제

## 15. 비기능 요구사항

- 초기 로딩 목표:
  - 월간 이벤트 300건 기준 2초 이내 체감 로딩
- 대량 데이터 처리 방식:
  - 범위 기반 조회 유지
  - 렌더링은 셀당 event overflow 전략 필요
- 낙관적 업데이트 여부:
  - 드래그 이동은 제한적 낙관적 업데이트 가능
  - 생성/삭제는 서버 확정 후 반영이 안전하다
- 오프라인/재시도 전략:
  - 저장 실패 시 이전 시간대로 복원
- 접근성/가독성 메모:
  - 색상만으로 type을 구분하지 않도록 텍스트/아이콘 보완 필요
  - 일정이 많은 날도 overflow 표기가 명확해야 한다

## 16. MVP 포함 범위

- 월간 캘린더 뷰
- 월 이동
- 범위 기반 이벤트 조회
- 날짜별 이벤트 pill 표시
- 이벤트 유형/사용자 필터 구조 정의
- 관련 엔터티 연결 규칙 정의

## 17. MVP 제외 범위

- 주간/일간/목록 뷰 구현
- 인라인 이벤트 생성 UI
- 드래그앤드롭 편집 UI
- 외부 캘린더 연동
- recurring event
- task overlay 실제 구현
- contractId/taskId 구조 확장

## 18. 열린 질문

- Calendar는 office 전체 일정이 기본인가, 개인 일정이 기본인가?
- Task의 dueDate를 별도 CalendarEvent 없이 overlay만 할 것인가?
- 계약 일정은 `dealId`로 충분한가, `contractId`가 꼭 필요한가?
- 일정 상세를 modal로 할지 우측 패널로 할지?
- userId 필터를 owner/manager만 볼 수 있게 제한할 필요가 있는가?

## 19. 수용 기준

- 사용자는 이 페이지에서 `월 기준 일정 분포와 중요한 이벤트`를 빠르게 파악할 수 있어야 한다.
- 사용자는 일정이 `어떤 연락처/매물/매칭/거래와 연결된 것인지` 이해할 수 있어야 한다.
- 범위 이동 시 필요한 이벤트가 정확히 다시 조회되어야 한다.
- 예외 상황에서 사용자는 왜 조회나 저장이 실패했는지 이해할 수 있어야 한다.
