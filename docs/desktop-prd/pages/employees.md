# Employees

## 메타

- 페이지명: Employees
- 문서 상태: draft
- 우선순위: P0
- Phase: Phase 2
- 구현 상태: placeholder only
- 작성일: 2026-04-02
- 최종 수정일: 2026-04-02
- 관련 엔터티: Office, User, Task, BuyerRequirement, Consultation, DealParticipant, Deal, ActivityLog, Notification, Office.commissionConfig
- 관련 API:
  - `GET /employees`
  - `POST /employees`
  - `GET /employees/:id`
  - `PATCH /employees/:id`
  - `PATCH /employees/:id/status`
  - `PATCH /employees/:id/role`
  - `POST /employees/:id/reset-password`
  - `GET /employees/:id/performance`
  - `GET /offices/me`
  - `PATCH /offices/me/commission-config`
- 관련 화면: Settings, Deals, Tasks, Calendar, AI Operations

현재 결정:

- 이 문서는 desktop의 `직원관리` 페이지를 기준으로 작성한다.
- 이 페이지는 단순 계정 목록이 아니라 `사무소 팀 운영 콘솔`이다.
- 직원관리의 핵심은 `계정/권한`, `재직 상태`, `담당 업무`, `거래 참여/배분`, `활동 추적`을 한곳에서 보는 것이다.
- 직원 생성 시 로그인 ID는 사무소 코드 기반 자동 발급 흐름이 기본이어야 한다.
- `owner`, `manager`, `agent` 역할은 제품 전반의 접근권한에 직접 영향을 주므로 이 페이지에서 명확히 관리되어야 한다.
- 초기 버전은 `초대 링크`보다 `직접 계정 생성 + 초기 비밀번호 발급` 방식이 현실적이다.
- `마지막 로그인`, `초대 상태`, `세부 권한 세트`는 현재 스키마에 없으므로 후속 확장으로 둔다.

## 1. 페이지 목적

- 이 페이지가 해결해야 하는 핵심 업무:
  - 사무소 직원 계정을 생성, 조회, 수정, 비활성화한다.
  - 역할과 재직 상태를 명확히 관리한다.
  - 직원별 담당 업무와 거래 참여 현황을 확인한다.
  - 수수료 배분 기준과 실제 참여 내역을 연결해 본다.
- primary 사용자:
  - owner
- secondary 사용자:
  - manager
- 이 페이지가 필요한 이유:
  - 부동산 사무소는 권한, 고객 데이터 접근, 거래 참여, 수수료 배분이 직원 단위로 얽혀 있다.
  - 단순 사용자 테이블만으로는 누가 현업에 सक्रिय한지, 어떤 거래를 맡고 있는지 파악하기 어렵다.
  - 직원관리 페이지가 있어야 설정/거래/업무/감사 로그가 한 사람 기준으로 연결된다.

## 2. 사용 시점

- 사용자가 이 페이지에 들어오는 대표 상황:
  - 새 직원을 등록할 때
  - 퇴사자 계정을 비활성화할 때
  - 직원 역할을 `agent -> manager`로 변경할 때
  - 특정 직원의 담당 거래, 업무, 활동량을 점검할 때
  - 수수료 배분 규칙과 실제 참여 내역을 비교할 때
- 진입 경로:
  - 사이드바 `직원관리`
  - Settings의 사무소 설정
  - Deal Detail의 참여자에서 직원 역진입
  - Task assignee 또는 ActivityLog에서 직원 역진입
- 이전 화면:
  - Settings
  - Deals
  - Tasks
  - Calendar
- 다음 화면:
  - Employee Detail Page
  - Deal Detail
  - Task Detail
  - Settings
- 이 페이지를 나가는 대표 액션:
  - 직원 등록
  - 직원 상세 열기
  - 역할 변경
  - 계정 비활성화

## 3. 사용자 역할과 권한

| 역할 | 조회 | 생성 | 수정 | 삭제 | 승인/확정 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| owner | 전체 조회 | 가능 | 가능 | 가능 | 가능 | 사무소 최종 관리자 |
| manager | 전체 조회 | 제한적 | 제한적 | 제한적 | 제한적 | owner 제외 일반 직원 관리 |
| agent | 불가 또는 자기 정보만 조회 | 불가 | 불가 | 불가 | 불가 | MVP에서는 페이지 진입 비권장 |

권한 메모:

- owner는 직원 생성, 역할 변경, 비활성화, 비밀번호 초기화까지 수행할 수 있어야 한다.
- manager는 일반 agent 조회/업무 확인은 가능하되, owner 권한 변경이나 사무소 핵심 설정 변경은 막는 편이 안전하다.
- 직원 삭제는 실제 삭제보다 `isActive=false` 비활성화가 기본이다.
- owner가 마지막 owner 계정을 비활성화하는 것은 금지해야 한다.

## 4. 핵심 시나리오

### 시나리오 A: 직원 목록 확인

1. 사용자는 직원관리 페이지에 들어온다.
2. 시스템은 전체 직원 목록과 활성/비활성 현황을 보여준다.
3. 사용자는 역할, 재직 상태, 담당 업무 수를 기준으로 직원을 훑는다.
4. 완료 조건:
   - 현재 사무소 인력 구성을 빠르게 파악할 수 있다.

### 시나리오 B: 새 직원 계정 생성

1. 사용자는 `직원 추가`를 누른다.
2. 시스템은 이름, 전화번호, 역할, 초기 비밀번호 입력 폼과 자동 생성될 loginId preview를 보여준다.
3. 사용자는 저장을 완료한다.
4. 완료 조건:
   - 새 직원 계정이 생성되고
   - 사무소 코드 기반 로그인 ID가 발급된다.

### 시나리오 C: 역할/재직 상태 변경

1. 사용자는 직원 상세페이지를 연다.
2. 시스템은 현재 역할, 활성 상태, 담당 업무/거래 현황을 보여준다.
3. 사용자는 역할을 변경하거나 계정을 비활성화한다.
4. 완료 조건:
   - 접근권한과 재직 상태가 즉시 반영된다.

### 시나리오 D: 직원별 거래/업무 점검

1. 사용자는 특정 직원의 상세페이지를 연다.
2. 시스템은 현재 배정된 Task, BuyerRequirement, DealParticipant 내역, 최근 상담/활동 로그를 보여준다.
3. 사용자는 과부하 여부나 담당 편중을 확인한다.
4. 완료 조건:
   - 직원별 운영 상태를 사람 단위로 파악할 수 있다.

### 시나리오 E: 배분 규칙 확인

1. 사용자는 직원관리 페이지 또는 직원 상세에서 수수료 배분 규칙 요약을 본다.
2. 시스템은 사무소 기본 배분 규칙과 이 직원이 실제 참여 중인 거래 배분 내역을 함께 보여준다.
3. 사용자는 배분 정책과 실제 운용 차이를 점검한다.
4. 완료 조건:
   - 직원 참여/정산 구조를 사람 기준으로 이해할 수 있다.

## 5. 화면 구조

예시:

- 좌측: 직원 목록
- 중앙: 직원 상세 / 편집 폼
- 우측: 최근 활동 / 담당 업무 / 거래 참여

실제 정의:

- 상단 영역:
  - 페이지 제목
  - 전체 직원 수
  - 활성 직원 수
  - manager 수
  - `직원 추가`
- 좌측 영역:
  - 직원 검색
  - 필터
    - 역할
    - 활성/비활성
    - 담당 업무 있음
  - 직원 목록 row
    - 이름
    - loginId
    - 역할
    - 전화번호
    - 활성 상태
    - 진행 중 업무 수
    - 진행 중 거래 수
- 중앙 영역:
  - 직원 목록 표
  - row 더블클릭 시 `Employee Detail Page` 진입
- Employee Detail Page:
  - 상단 헤더
    - 이름
    - 역할 badge
    - 활성 상태 badge
    - loginId
    - 전화번호
    - `수정`
    - `비밀번호 초기화`
    - `비활성화`
  - 상단 요약 바
    - 진행 중 Task 수
    - 담당 BuyerRequirement 수
    - 진행 중 Deal 참여 수
    - 최근 ActivityLog 시간
  - 본문 레이아웃
    - 좌측 `2/3`
      - `기본 정보`
      - `권한/역할`
      - `담당 업무`
      - `담당 고객/요구조건`
      - `거래 참여/배분`
    - 우측 `1/3`
      - `최근 활동`
      - `최근 상담`
      - `알림/주의`
  - 우측 영역은 세로 스크롤 가능해야 한다.

직원 목록 컬럼 정의:

- `이름`
- `로그인 ID`
- `역할`
- `전화번호`
- `활성 상태`
- `진행 Task`
- `진행 Deal`
- `최근 활동`

Employee Detail Page 섹션 정의:

- `기본 정보`
  - 이름
  - loginId
  - 이메일
  - 전화번호
  - 생성일
- `권한/역할`
  - role
  - isActive
  - 향후 세부 권한셋(future)
- `담당 업무`
  - assigned Task 목록
  - due date, priority, status
- `담당 고객/요구조건`
  - assigned BuyerRequirement 목록
  - 고객명, 상태, 다음 연락일
- `거래 참여/배분`
  - DealParticipant 목록
  - role, side, commissionRate, commissionAmount, settlementStatus
  - 사무소 기본 배분 규칙 요약
- `최근 활동`
  - ActivityLog 타임라인
- `최근 상담`
  - createdById 기준 Consultation 목록
- `알림/주의`
  - 비활성 계정
  - 진행 중 거래가 많은 직원
  - 미정산 거래 참여 건

## 6. 조회 데이터

| 항목 | 설명 | 필수 여부 | 출처 |
| --- | --- | --- | --- |
| employeeList | 사무소 직원 목록 | 필수 | `GET /employees` |
| selectedEmployee | 선택 직원 상세 | 중요 | `GET /employees/:id` |
| officeSummary | 사무소 코드/최대 사용자 수/구독 정보 | 중요 | `GET /offices/me` |
| assignedTasks | 직원에게 배정된 Task 목록 | 중요 | `Task(assignedToId=userId)` |
| assignedRequirements | 직원 담당 BuyerRequirement 목록 | 중요 | `BuyerRequirement(assignedToId=userId)` |
| consultationsByUser | 직원이 생성한 Consultation 목록 | 선택 | `Consultation(createdById=userId)` |
| dealParticipations | 직원의 DealParticipant 목록 | 중요 | `DealParticipant(userId=userId)` |
| activitySummary | 직원 관련 최근 ActivityLog | 중요 | `ActivityLog(userId=userId)` |
| commissionConfig | 사무소 기본 수수료 배분 규칙 | 선택 | `Office.commissionConfig` |

조회 규칙:

- 초기 진입 시:
  - 직원 목록과 officeSummary를 함께 로드해야 한다.
- 직원 선택 시:
  - 기본 정보, 배정 업무, 거래 참여, 최근 활동을 함께 가져와야 한다.
- 상세페이지 진입 시:
  - Employee Detail projection이 없다면 aggregate query가 필요하다.

## 7. 검색 / 필터 / 정렬

- 기본 검색 대상:
  - 이름
  - loginId
  - 전화번호
- 기본 정렬:
  - 활성 직원 우선
  - 그 다음 이름 asc 또는 최근 활동순 desc
- 필터 항목:
  - 역할: owner / manager / agent
  - 활성 상태
  - 진행 중 Task 있음
  - 진행 중 Deal 참여 있음
- 저장 가능한 뷰:
  - MVP에서는 사용자 저장 뷰 없음
- 역할별 기본 뷰 차이:
  - owner는 전체 직원 목록 중심
  - manager는 활성 직원과 업무 분배 중심

## 8. 주요 액션

| 액션 | 설명 | 권한 | 성공 결과 | 실패/예외 |
| --- | --- | --- | --- | --- |
| 직원 추가 | 새 직원 계정 생성 | owner/manager | user 생성 | maxUsers 초과, loginId 충돌 |
| 직원 상세 열기 | 직원 상세페이지 진입 | owner/manager | 상세 로드 | stale data |
| 역할 변경 | owner/manager/agent 변경 | owner | 권한 반영 | 마지막 owner 문제 |
| 계정 비활성화 | isActive=false 처리 | owner/manager | 목록/접근권한 갱신 | 진행 중 업무 다수 |
| 기본 정보 수정 | 이름/전화/이메일 수정 | owner/manager | user 갱신 | 검증 실패 |
| 비밀번호 초기화 | 초기 비밀번호 재설정 | owner | 재로그인 필요 상태 | 권한 없음 |
| 담당 거래 열기 | DealParticipant에서 Deal 상세 이동 | owner/manager | Deal Detail 열기 | linked data 없음 |

## 9. 생성 / 수정 폼 규칙

- 필수 입력값:
  - 직원 생성 시 `name`, `role`, `password`
- 기본값:
  - role은 `agent`
  - isActive는 `true`
- 자동 계산:
  - loginId는 사무소 코드 + 일련번호 방식 자동 생성이 기본
  - 진행 Task 수, Deal 참여 수는 aggregate 계산
- 상호 의존 필드:
  - owner 계정은 이메일을 요구할지 정책 결정이 필요하다
  - 비활성화 전 담당 Task/BuyerRequirement를 다른 직원에게 넘길지 선택지가 필요할 수 있다
- 저장 전 검증:
  - maxUsers 초과 여부 확인
  - 마지막 owner 비활성화 금지
  - loginId 중복 금지
- 저장 후 후속 액션:
  - 직원 목록 재조회
  - 관련 Task/Deal assignee projection invalidation
  - ActivityLog 기록

## 10. 상태값

이 페이지가 직접 다루는 상태:

- User role
  - `owner`
  - `manager`
  - `agent`
- User active
  - `active`
  - `inactive`
- DealParticipant settlementStatus
  - `unsettled`
  - `settled`

상태 전이 규칙:

```text
user: active -> inactive
role: agent -> manager -> owner
settlement: unsettled -> settled
```

상태별 UI 차이:

- inactive 직원:
  - 목록 회색 처리
  - 수정은 가능하지만 새 배정은 막는 것이 안전하다
- owner:
  - 삭제/비활성화 경고 강화
- unsettled 배분 건:
  - 경고 badge 노출

## 11. 예외 / 빈 상태 / 오류 상태

- 빈 상태:
  - 직원이 없으면 `직원 추가` CTA와 사무소 코드 안내 필요
- 검색 결과 없음:
  - 이름/loginId 검색 결과 없음 안내
- 권한 없음:
  - agent는 접근 차단
- 연동 실패:
  - 목록 또는 상세 로드 실패 시 재시도 필요
- 삭제 불가 조건:
  - 마지막 owner 비활성화 금지
- 충돌 상태:
  - 다른 관리자가 역할을 바꾼 경우 재조회 필요
- 구조 한계:
  - 현재 스키마에는 마지막 로그인, 초대 상태, 부서/직급 개념이 없다

## 12. 연결 엔터티와 화면

| 연결 대상 | 연결 방식 | 사용 목적 |
| --- | --- | --- |
| User | 직원 계정 본체 | 이름/로그인/역할/활성 상태 |
| Office | 사무소 정보 | code, maxUsers, commissionConfig |
| Task | assignedToId 연결 | 업무 배정 현황 |
| BuyerRequirement | assignedToId 연결 | 고객 담당 현황 |
| Consultation | createdById 연결 | 상담 활동 확인 |
| DealParticipant | userId 연결 | 거래 참여/배분/정산 |
| ActivityLog | userId 연결 | 직원별 변경 이력 |
| Settings | 사무소 설정 연동 | maxUsers, 배분 규칙 |
| Deals | 참여 거래 역진입 | 실적/정산 확인 |

## 13. Desktop 전용 요구사항

- 다중 패널 필요 여부:
  - 중간
  - 목록과 상세를 빠르게 오가야 한다.
- 키보드 단축키:
  - `/` 직원 검색 포커스
  - `Enter` 상세 열기
  - `Cmd/Ctrl + N` 직원 추가
- 실시간 업데이트:
  - 역할/활성 상태 변경 후 즉시 반영 필요
- 알림 연동:
  - 직접적 필요는 낮음
- 시스템 트레이/OS 이벤트 연동:
  - 필요 없음
- 로컬 기능 연동:
  - 필요 없음
- 멀티 선택 / 벌크 액션:
  - MVP 제외
- 창 크기 변화 대응:
  - 좁은 폭에서는 목록/상세를 분리 전환해야 한다.

## 14. 감사 추적 / 로그

- ActivityLog 기록 대상 액션:
  - 직원 생성
  - 역할 변경
  - 활성/비활성 변경
  - 비밀번호 초기화
- actor / source 규칙:
  - desktop 수동 조작은 `actor=user`, `source=web` 또는 desktop source 확장 필요
- 중요 감사 이벤트:
  - owner 권한 변경
  - 계정 비활성화
  - 배분 규칙 관련 변경

## 15. 비기능 요구사항

- 초기 로딩 목표:
  - 직원 목록 100명 기준 2초 이내 체감 로딩
- 대량 데이터 처리 방식:
  - 목록은 경량 projection, 상세는 aggregate fetch
- 낙관적 업데이트 여부:
  - 역할/활성 상태 변경은 서버 응답 후 확정이 안전하다
- 오프라인/재시도 전략:
  - 생성/수정 실패 시 폼 draft 유지 필요
- 접근성/가독성 메모:
  - 역할 badge와 활성 상태는 색상 외 텍스트도 함께 보여야 한다.
  - loginId와 이름이 헷갈리지 않게 둘 다 분명히 보여야 한다.

## 16. MVP 포함 범위

- 직원 목록
- 직원 추가
- 직원 상세페이지
- 역할 변경
- 계정 활성/비활성
- loginId 자동 발급 흐름
- 담당 Task/BuyerRequirement/DealParticipant 요약
- 사무소 기본 배분 규칙 요약

## 17. MVP 제외 범위

- 이메일 초대 링크 방식
- 세부 권한셋 커스텀
- 마지막 로그인 추적
- 부서/직급 체계
- 급여/급여정산
- 벌크 import / 벌크 비활성화

## 18. 열린 질문

- manager에게 직원 생성 권한을 줄지 owner만 허용할지?
- 비활성화 시 담당 업무를 자동 재배정할지?
- loginId 규칙을 `사무소코드-0001`로 고정할지 다른 prefix도 허용할지?
- 직원 상세에 실적 지표를 얼마나 깊게 넣을지?
- 향후 초대 링크 기반 온보딩을 넣을지?

## 19. 수용 기준

- 사용자는 이 페이지에서 `직원 계정을 생성하고 역할/활성 상태를 관리`할 수 있어야 한다.
- 사용자는 호실/거래 화면을 보지 않고도 `직원별 담당 업무와 거래 참여 현황`을 파악할 수 있어야 한다.
- owner 권한과 마지막 owner 보호 규칙이 UI와 API에서 일치해야 한다.
- 비활성 직원은 새 업무/거래 배정 대상에서 제외돼야 한다.
- 직원 정보 변경은 감사 가능하게 기록돼야 한다.
