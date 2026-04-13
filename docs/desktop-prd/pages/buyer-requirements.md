# Buyer Requirements

## 메타

- 페이지명: Buyer Requirements
- 문서 상태: draft
- 우선순위: P0
- Phase: Phase 2
- 구현 상태: partial prototype exists
- 작성일: 2026-04-02
- 최종 수정일: 2026-04-02
- 관련 엔터티: BuyerRequirement, Contact, Consultation, Match, Task, ActivityLog
- 관련 API:
  - `GET /buyer-requirements`
  - `GET /buyer-requirements/due-contacts`
  - `GET /buyer-requirements/:id`
  - `POST /buyer-requirements`
  - `PATCH /buyer-requirements/:id`
  - `PATCH /buyer-requirements/:id/status`
  - `DELETE /buyer-requirements/:id`
  - `GET /contacts/:id`
  - `GET /contacts/:id/consultations`
  - `POST /consultations`
  - `GET /matches`
  - `POST /matches`
  - `PATCH /matches/:id/stage`
  - `GET /tasks`
  - `POST /tasks`
- 관련 화면: Contacts, Contact Detail, Call Workspace, Matches, Properties, Tasks

현재 결정:

- 이 문서는 desktop의 `구매요구조건 목록 페이지`를 기준으로 작성한다.
- `Buyer Requirement Detail`은 별도 하위 화면이지만, 실제 업무 흐름상 이 페이지의 핵심 후속 화면이라 함께 정의한다.

## 1. 페이지 목적

- 이 페이지가 해결해야 하는 핵심 업무:
  - 고객의 구매/임차 희망 조건을 구조화하고, 후속 연락과 매칭 진행을 하나의 흐름으로 관리한다.
- primary 사용자:
  - agent
- secondary 사용자:
  - manager, owner
- 이 페이지가 필요한 이유:
  - BuyerRequirement는 단순 메모가 아니라 `누구에게 어떤 매물을 언제까지 어떤 조건으로 제안할지`를 결정하는 실행 단위다.
  - 연락처만으로는 고객의 실제 니즈를 관리할 수 없고, 매칭/상담/후속 연락도 BuyerRequirement를 기준으로 묶어야 한다.
  - desktop에서는 due follow-up, 매칭 수, 최근 상담, 다음 연락일을 빠르게 스캔하고 바로 행동으로 이어져야 한다.
  - 자주 쓰는 `지역`과 `단지`를 고정해두고 빠르게 선택할 수 있어야 반복 입력 비용이 줄어든다.

## 2. 사용 시점

- 사용자가 이 페이지에 들어오는 대표 상황:
  - 신규 매수/임차 고객의 조건을 등록할 때
  - 기존 고객의 요구사항을 갱신할 때
  - 오늘 연락해야 할 고객을 정리할 때
  - 특정 BuyerRequirement에서 Match 생성/진행을 이어갈 때
  - Call Workspace 또는 Contact Detail에서 구매요구조건 중심으로 전환할 때
- 진입 경로:
  - 사이드바 `구매고객`
  - Contact Detail의 `매수요건` 영역
  - Call Workspace의 `매수조건 열기`
  - Matches에서 고객 기준 역진입
  - due follow-up 알림
- 이전 화면:
  - Contacts
  - Contact Detail
  - Call Workspace
  - Matches
  - Dashboard
- 다음 화면:
  - Buyer Requirement Detail
  - Matches
  - Properties
  - Call Workspace
  - Tasks
- 이 페이지를 나가는 대표 액션:
  - 구매요구조건 상세 열기
  - 다음 연락일 설정
  - Match 생성 또는 기존 Match 확인
  - 상담 기록 또는 전화 상담 시작

## 3. 사용자 역할과 권한

| 역할 | 조회 | 생성 | 수정 | 삭제 | 승인/확정 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| owner | 전체 조회 | 가능 | 가능 | 가능 | 가능 | 상태 정책, 담당자 재배정 가능 |
| manager | 전체 조회 | 가능 | 가능 | 제한적 | 가능 | 팀별 follow-up 관리 |
| agent | 전체 조회 | 가능 | 가능 | 제한적 | 가능 | 본인 담당 조건의 실무 처리 중심 |

권한 메모:

- BuyerRequirement 조회는 office 전체가 가능하다.
- 생성과 수정은 모든 역할이 가능하되, 담당자 재배정과 삭제는 owner/manager 중심이 안전하다.
- agent 삭제는 연결된 Match/Consultation이 없는 경우로 제한하는 것이 권장된다.
- `승인/확정`은 결재 의미가 아니라 `상태 전환`, `다음 연락 확정`, `담당자 지정`을 뜻한다.

## 4. 핵심 시나리오

### 시나리오 A: 신규 구매고객 조건 등록

1. 사용자는 Contact를 선택하거나 신규 고객을 만든 뒤 BuyerRequirement 생성 화면으로 들어간다.
2. 시스템은 거래유형, 예산, 지역, 면적, 필수/선호 조건, 입주 희망일, 담당자, 다음 연락일을 입력받는다.
3. 사용자는 조건을 저장하고 즉시 매칭 후보 탐색 또는 후속 연락 태스크를 이어서 처리한다.
4. 완료 조건:
   - BuyerRequirement가 `active` 상태로 저장되고
   - Contact와 연결되며
   - 필요 시 `nextContactDate`와 담당자가 같이 설정된다.

### 시나리오 B: 후속 연락 대상 관리

1. 사용자는 목록에서 `다음 연락일이 오늘이거나 지난` BuyerRequirement를 본다.
2. 시스템은 긴급도, 다음 연락일, 최근 상담 내역, 최근 상담일을 함께 보여준다.
3. 사용자는 Call Workspace 또는 상담 기록 생성으로 이동하고, 통화 후 `lastContactDate`와 `nextContactDate`를 갱신한다.
4. 완료 조건:
   - 후속 연락 누락이 줄고
   - 상담과 다음 액션이 BuyerRequirement 기준으로 축적된다.

### 시나리오 C: 매칭 진행 허브

1. 사용자는 Buyer Requirement Detail을 열어 현재 조건과 연결된 Match들을 본다.
2. 시스템은 관련 Listing과 Match stage를 함께 보여주고, 아직 연결되지 않은 상태면 `매칭 찾기` CTA를 제공한다.
3. 사용자는 Match를 생성하거나 stage를 업데이트하고, 필요 시 상담과 태스크를 추가한다.
4. 완료 조건:
   - BuyerRequirement가 단순 요구조건 레코드가 아니라 실제 매칭 진행 허브로 작동한다.

## 5. 화면 구조

예시:

- 좌측: 상태/후속 연락 탐색
- 중앙: 목록 또는 조건 상세
- 우측: 상담/후속 액션

실제 정의:

- 상단 영역:
  - 페이지 제목, 전체 건수, 현재 필터 요약
  - `구매요구조건 추가` CTA
- 좌측 영역:
  - 후속 연락 프리셋 또는 상태 탐색 사이드바
  - 기본 프리셋:
    - `전체`
    - `연락 필요`
    - `활성`
    - `매칭 진행중`
    - `완료`
- 중앙 영역:
  - ViewBar
  - 검색/필터/정렬
  - BuyerRequirement 목록 DataTable
- 입력/편집 보조 영역:
  - `고정 지역` quick pick
  - `고정 단지` quick pick
  - 최근 사용한 지역/단지 quick pick
- 목록 컬럼 정의:
  - `고객명`
    - Contact.name
  - `전화번호`
    - Contact.phone
  - `상태`
    - active, matched, completed, inactive
  - `긴급도`
    - urgent, normal, flexible
  - `거래유형`
    - sale, jeonse, monthly
  - `예산`
    - 매매/전세/월세 조건에 따라 range 요약
  - `희망지역`
    - 대표 지역 1~2개 + 추가 개수 축약 가능
  - `연결 매칭`
    - 전체 Match 수와 진행중 Match 수 요약
  - `마지막 상담내역`
    - 가장 최근 Consultation.content 1줄 요약
  - `마지막 상담일`
    - 가장 최근 Consultation.createdAt
  - `다음 연락일`
    - nextContactDate
  - `담당자`
    - assignedTo.name
- 우측 영역:
  - 기본 목록 페이지에서는 별도 고정 패널 없음
  - 행 단일 클릭은 선택만 수행한다.
  - 행 더블클릭 시 `Buyer Requirement Detail` 전체 화면으로 이동한다.
- 하단 영역:
  - DataTable pagination

`Buyer Requirement Detail` 상세 레이아웃:

- 좌측 `2/3` 영역:
  - 상단: 고객 요약, 연락처, 상태, 긴급도, 담당자, 다음 연락일
  - 중단 상단: `구매조건 요약`
    - 거래유형, 예산, 보증금/월세, 희망지역, 희망 매물유형, 면적, 입주 희망일
  - 중단 하단: `필수 조건 / 선호 조건 / 메모`
  - 하단: `연결 매칭`
    - Match 카드 또는 보드 요약
    - `매칭 찾기`, `매칭 생성`, `매칭 화면으로 이동` CTA
- 우측 `1/3` 영역:
  - `상담내역` 전용 패널
  - 최신 상담이 위로 오도록 정렬
  - 각 상담은 여러 줄 내용을 그대로 읽을 수 있어야 한다.
  - 패널 자체는 독립 스크롤이 가능해야 한다.
  - 하단에는 `전화 상담`, `상담 추가`, `후속 태스크 추가` CTA를 둔다.

`구매요구조건 생성/수정` 입력 UX:

- `희망지역`
  - 자유 입력만이 아니라 `고정 지역` 칩을 먼저 선택할 수 있어야 한다.
  - 고정 지역은 `강동구`, `고덕동`, `송파구` 같은 자주 쓰는 지역 프리셋이다.
- `희망단지`
  - 자유 검색만이 아니라 `고정 단지` 칩을 먼저 선택할 수 있어야 한다.
  - `OfficeSite(관리 단지)`는 빠른 추천 소스 중 하나로만 사용한다.
  - 하지만 구매고객의 관심 단지는 `관리 단지`에 한정되지 않아야 한다.
  - 사용자는 office가 관리하지 않는 일반 `Site`도 자유 검색해서 관심 단지로 고정할 수 있어야 한다.
- 선택 규칙:
  - 지역과 단지는 둘 다 선택 가능해야 한다.
  - 예: `고덕동` + `래미안고덕` + `그라시움`
  - 단지 선택은 지역 입력을 완전히 대체하는 것이 아니라, 더 좁은 선호 조건으로 동작한다.

## 6. 조회 데이터

| 항목 | 설명 | 필수 여부 | 출처 |
| --- | --- | --- | --- |
| buyerRequirementList | 현재 조건의 구매요구조건 목록 | 필수 | `GET /buyer-requirements` |
| dueBuyerRequirements | 연락 필요 목록 | 필수 | `GET /buyer-requirements/due-contacts` 또는 전용 preset query |
| pinnedRegions | 사무소/사용자 기준 고정 지역 목록 | 필수 | 신규 프리셋 저장소 필요 |
| pinnedSites | 구매요구조건 입력에서 빠르게 고를 수 있는 단지 후보 | 필수 | `OfficeSite` + 전체 `Site` 검색 + 별도 관심단지 저장구조 |
| listContactName | 목록의 고객명 | 필수 | `GET /buyer-requirements` include `contact` |
| listContactPhone | 목록의 전화번호 | 필수 | `GET /buyer-requirements` include `contact` |
| listMatchSummary | 목록의 연결 매칭 수 요약 | 필수 | `_count.matches` 또는 전용 summary field |
| listLastConsultationContent | 목록의 마지막 상담내역 | 필수 | 신규 목록 projection 필요 |
| listLastConsultationDate | 목록의 마지막 상담일 | 필수 | 신규 목록 projection 필요 |
| listAssignedTo | 목록의 담당자명 | 필수 | `assignedTo` include |
| buyerRequirementDetail | 단일 BuyerRequirement 상세 | 조건부 | `GET /buyer-requirements/:id` |
| detailMatches | 해당 BuyerRequirement의 Match 목록 | 조건부 | `GET /buyer-requirements/:id` include `matches` |
| detailConsultations | 해당 BuyerRequirement의 상담 목록 | 조건부 | `GET /buyer-requirements/:id` include `consultations` |
| detailContact | 연결된 Contact 요약 | 조건부 | `GET /buyer-requirements/:id` include `contact` |
| followUpTasks | 해당 BuyerRequirement 관련 후속 태스크 | 선택 | `GET /tasks` 전용 filter 필요 또는 후속 전용 API |

조회 규칙:

- 초기 진입 시:
  - 기본 정렬은 `createdAt desc`
  - 첫 페이지 20건을 조회한다.
  - 목록에는 최소 `고객명, 전화번호, 상태, 긴급도, 거래유형, 예산, 희망지역, 연결 매칭, 마지막 상담내역, 마지막 상담일, 다음 연락일, 담당자`가 보여야 한다.
  - 생성/수정 화면에서는 `고정 지역`, `고정 단지`, `최근 사용한 지역/단지`를 먼저 보여줘야 한다.
- 프리셋 선택 시:
  - `연락 필요`는 `status=active`이고 `nextContactDate <= now`인 항목 중심으로 보여준다.
- 검색 변경 시:
  - 고객명, 연락처, 지역, 메모, 조건 키워드 기준 debounce 검색을 제공해야 한다.
- 상세 진입 시:
  - BuyerRequirement 1건을 중심으로 Contact, Match, Consultation을 병렬 조회한다.
  - 상담내역 패널은 우측 1/3 고정 영역에서 다건 스크롤로 보여준다.

## 7. 검색 / 필터 / 정렬

- 기본 검색 대상:
  - 고객명
  - 전화번호
  - 지역
  - 메모
  - 조건 키워드
- 기본 정렬:
  - `등록일순`
- 필터 항목:
  - `상태`
  - `긴급도`
  - `거래유형`
  - `다음 연락일 이전`
  - `담당자`
  - `연결 매칭 있음`
  - `최근 상담 있음`
  - `고정 지역`
  - `고정 단지`
- 저장 가능한 뷰:
  - MVP에서는 사용자 저장 뷰는 제외
  - 프리셋 뷰는 제공
    - `연락 필요`
    - `매칭 대기`
    - `진행중`
    - `완료`
- 역할별 기본 뷰 차이:
  - agent: `내 담당 + 연락 필요`가 빠른 진입값 후보
  - manager/owner: `전체 연락 필요`가 더 유용할 수 있다.

## 8. 주요 액션

| 액션 | 설명 | 권한 | 성공 결과 | 실패/예외 |
| --- | --- | --- | --- | --- |
| 검색/필터 | 고객명, 상태, 거래유형, 연락일 기준 탐색 | 전체 | 목록 갱신 | 결과 없음 |
| 상세 열기 | 행 더블클릭 또는 `Enter`로 상세 이동 | 전체 | Buyer Requirement Detail 진입 | 삭제된 row |
| 신규 조건 생성 | 새로운 BuyerRequirement 생성 | 전체 | 조건 저장 후 상세 이동 | 필수값 누락 |
| 조건 수정 | 예산, 지역, 면적, 메모, 담당자, 연락일 갱신 | 전체 | BuyerRequirement 업데이트 | 동시 수정 충돌 |
| 고정 지역 선택 | 미리 저장한 지역 프리셋을 빠르게 적용 | 전체 | regions 입력 반영 | 프리셋 없음 |
| 고정 단지 선택 | 관리 단지 기반 단지 프리셋을 빠르게 적용 | 전체 | preferred complex 입력 반영 | 관리 단지 없음 |
| 상태 변경 | active/matched/completed/inactive 전환 | 전체 | 상태 반영 | 정책상 허용되지 않는 전이 |
| 다음 연락일 설정 | follow-up 날짜 갱신 | 전체 | 연락 필요 목록 반영 | 과거 날짜 입력 경고 |
| 전화 상담 시작 | Call Workspace로 이동 | 전체 | 통화/상담 흐름 시작 | Call Workspace 보류 또는 비활성 |
| 상담 기록 추가 | BuyerRequirement 컨텍스트로 Consultation 생성 | 전체 | 최근 상담 패널 반영 | 내용 없음 |
| 매칭 찾기 | Matches 또는 Listing 탐색 화면으로 이동 | 전체 | 매칭 작업 시작 | 조건 부족 |
| 매칭 생성 | Listing과 직접 연결 | 전체 | Match 생성 | 중복 Match |
| 후속 태스크 생성 | 연락/임장/자료발송 등 Task 생성 | 전체 | Task 생성 | 제목 누락 |
| 삭제 | BuyerRequirement 제거 | owner, manager, 제한적 agent | 목록에서 제거 | Match/Consultation 연결 존재 |

## 9. 생성 / 수정 폼 규칙

- 필수 입력값:
  - `contactId`
  - 실무상 최소 하나의 조건 묶음
    - `transactionType`
    - `regions` 또는 `siteTypes` 또는 `희망단지`
    - 가격/보증금/월세 중 하나
- 기본값:
  - status = `active`
  - urgency = `normal`
  - assignedToId = 현재 사용자 또는 비어 있음
- 자동 계산:
  - Contact Detail 또는 Call Workspace에서 진입하면 `contactId`를 자동 세팅
  - 전화 상담 후 생성 시 `lastContactDate`는 상담일 기준 제안 가능
  - `nextContactDate`를 넣으면 follow-up 프리셋에 자동 반영
  - `고정 단지` 선택 시 해당 단지의 지역 정보가 있으면 `regions` 후보를 같이 제안할 수 있다.
  - `OfficeSite`에 없는 단지를 선택해도 저장 가능해야 한다.
- 상호 의존 필드:
  - `transactionType=monthly`면 보증금과 월세 상한을 함께 노출
  - `transactionType=sale/jeonse`면 price range 중심으로 노출
  - `siteTypes`, `regions`, `희망단지`가 모두 비면 저장 전 경고
  - `moveInDate`가 임박할수록 urgency 제안 가능
- 저장 전 검증:
  - 필수/선호 조건 텍스트는 중복 토큰 없이 정리
  - 예산 범위는 min <= max
  - 면적 범위는 min <= max
  - 다음 연락일이 과거이면 경고 후 저장 여부 확인
  - 같은 단지를 중복 선택하지 않도록 방지해야 한다.
- 저장 후 후속 액션:
  - `매칭 찾기`
  - `전화 상담`
  - `후속 태스크 추가`

## 10. 상태값

이 페이지가 직접 다루는 상태:

- `buyerRequirement.status`
  - `active`
  - `matched`
  - `completed`
  - `inactive`
- 파생 상태:
  - `followUpState`
    - `overdue`
    - `today`
    - `scheduled`
    - `none`
  - `matchState`
    - `no_match`
    - `matching`
    - `deal_converted`
    - `closed`

상태 전이 규칙:

```text
active -> matched -> completed
active -> inactive
matched -> completed
matched -> active
completed -> active
inactive -> active
```

상태별 UI 차이:

- `active`:
  - 기본 작업 대상
  - `매칭 찾기`, `전화 상담`, `다음 연락일 설정` CTA 활성화
- `matched`:
  - 연결 Match가 존재하고 진행중임을 강조
- `completed`:
  - 조건 충족 또는 거래 종료 후 보관성 상태
- `inactive`:
  - 당장 추적하지 않는 상태
- `followUpState=overdue/today`:
  - 목록에서 색상 또는 뱃지로 강하게 표시해야 한다.

## 11. 예외 / 빈 상태 / 오류 상태

- 빈 상태:
  - BuyerRequirement가 하나도 없으면 `연락처에서 구매요구조건 추가` 흐름을 안내한다.
- 검색 결과 없음:
  - 현재 조건에 맞는 구매요구조건이 없다고 명확히 표시한다.
- 권한 없음:
  - 삭제/재배정/상태변경이 제한되면 이유를 안내한다.
- 연동 실패:
  - 목록이나 상세 조회 실패 시 재시도 버튼 제공
- 삭제 불가 조건:
  - 연결된 Match 또는 Consultation이 있으면 기본적으로 삭제 대신 `inactive` 또는 `completed`를 유도한다.
- 충돌 상태:
  - 같은 Contact에 유사한 활성 BuyerRequirement가 이미 있으면 중복 경고를 제공한다.
  - 같은 Listing과 같은 BuyerRequirement의 Match가 이미 존재하면 중복 생성 금지

## 12. 연결 엔터티와 화면

| 연결 대상 | 연결 방식 | 사용 목적 |
| --- | --- | --- |
| Contact Detail | 고객명 클릭, 상세 상단 링크 | 사람 기준 360도 정보 확인 |
| Call Workspace | 우측 CTA | 전화 상담 및 후속 연락 |
| Consultations | 우측 패널 | BuyerRequirement 기준 상담 맥락 확인 |
| Matches | 하단 매칭 영역, CTA | 매칭 생성/진행 |
| Properties/Listings | 매칭 후보 탐색 | 실제 매물 연결 |
| Tasks | 후속 태스크 생성 | 연락/임장/자료발송 관리 |

## 13. Desktop 전용 요구사항

- 다중 패널 필요 여부:
  - 필요. 목록 화면은 `좌측 프리셋 탐색 + 중앙 목록` 2패널이 기본이다.
  - 상세 화면은 `좌측 2/3 조건/매칭 + 우측 1/3 상담내역` 2컬럼 구조가 기본이다.
- 키보드 단축키:
  - `Cmd/Ctrl+F`: 검색 포커스
  - `Cmd/Ctrl+N`: 신규 구매요구조건
  - `Enter`: 선택 행 상세 열기
  - `Cmd/Ctrl+Enter`: 저장
  - `Cmd/Ctrl+Shift+C`: 전화 상담 시작
- 실시간 업데이트:
  - Call Workspace 또는 다른 사용자가 상담을 저장하면 `lastContactDate`, `마지막 상담내역`, `다음 연락일`이 즉시 갱신돼야 한다.
  - Match stage 변경도 요약 영역에 빠르게 반영돼야 한다.
- 알림 연동:
  - `다음 연락일 도래`
  - `새 Match 생성`
  - `담당자 재배정`
- 시스템 트레이/OS 이벤트 연동:
  - due follow-up 알림은 데스크톱 알림 대상이 될 수 있다.
- 로컬 기능 연동:
  - Call Workspace 또는 CTI 기반 상담 시작 진입점과 연결
- 멀티 선택 / 벌크 액션:
  - MVP에서는 제외
  - 후속으로 `상태 일괄 변경`, `담당자 일괄 지정`, `다음 연락일 일괄 설정` 검토
- 창 크기 변화 대응:
  - 좁은 폭에서는 우측 상담 패널을 탭/시트로 접어야 한다.

## 14. 감사 추적 / 로그

- ActivityLog 기록 대상 액션:
  - BuyerRequirement 생성/수정/삭제
  - 상태 변경
  - 담당자 변경
  - 다음 연락일 변경
- actor / source 규칙:
  - desktop UI는 `actor=user`
  - MCP가 후속 정리를 하면 source 구분 필요
- 중요 감사 이벤트:
  - `nextContactDate` 변경
  - `status` 변경
  - `assignedToId` 변경
  - Match 생성으로 인한 `matched` 전환

## 15. 비기능 요구사항

- 초기 로딩 목표:
  - 목록 첫 렌더 1초 이내
  - due follow-up 프리셋 전환은 500ms 이내 체감 응답
- 대량 데이터 처리 방식:
  - 페이지네이션 기본 20건
  - 목록에는 summary field를 미리 계산해 내려주는 편이 좋다.
- 낙관적 업데이트 여부:
  - 상태 변경, 다음 연락일 수정은 낙관적 반영 가능
  - Match 생성은 서버 확정 후 반영
- 오프라인/재시도 전략:
  - 수정 실패 시 폼 상태 유지
  - 상담 저장 실패 시 BuyerRequirement 컨텍스트를 잃지 않아야 함
- 접근성/가독성 메모:
  - 예산, 지역, 연락일, 긴급도는 목록에서 빠르게 스캔 가능해야 한다.
  - 우측 상담 패널은 여러 줄 읽기 전용이 기본이다.

## 16. MVP 포함 범위

- BuyerRequirement 목록
- 상태/긴급도/거래유형/다음 연락일 기반 필터
- due follow-up 프리셋
- 신규 생성, 기본 수정, 상태 변경
- 고정 지역 quick pick
- 전체 Site 검색 + 고정 단지 quick pick
- 더블클릭 기반 상세 열기
- 상세 화면의 조건 요약
- 연결 Match 요약
- 우측 1/3 상담내역 스크롤 패널
- Call Workspace/Consultation/Task/Matches 진입 CTA

## 17. MVP 제외 범위

- 자동 추천 매칭 엔진 고도화
- BuyerRequirement 병합
- 대량 import/export
- 스코어링 기반 우선순위 자동 추천
- 벌크 편집
- AI 기반 조건 추출/요약 자동화

## 18. 선호 지역/단지 구조화 플랜

현재 MVP에서는 아래처럼 단순 구조를 유지한다.

- `regions: string[]`
  - 사용자가 선택한 희망 지역 이름 목록
- `희망단지`
  - UI에서 선택할 수는 있지만, 스키마에는 아직 정규화된 저장 구조가 없음
- `OfficeSite`
  - 관리 단지 추천 소스로 활용 가능하지만, 구매고객 선호 단지의 source of truth는 아님

장기적으로는 `BuyerRequirement`의 지역/단지 선호를 정규화된 관계 구조로 분리한다.

### 목표 구조

```text
BuyerRequirement
  ├── BuyerRequirementPreferredRegion[]
  └── BuyerRequirementPreferredSite[]
```

### BuyerRequirementPreferredRegion

목적:

- 희망 지역을 문자열이 아니라 행정구역 기준으로 정규화한다.
- 향후 필터링, 자동 매칭, 통계, 즐겨찾기 재사용을 쉽게 만든다.

권장 필드:

- `id`
- `officeId`
- `buyerReqId`
- `regionType`
  - `province | district | ward`
- `provinceCode?`
- `districtCode?`
- `wardCode?`
- `sortOrder`
- `isPrimary`
- `createdAt`

설계 원칙:

- 실제 주소 참조 체계는 기존 `Province / District / Ward`를 재사용한다.
- `ward`가 가장 구체적인 선호 지역이다.
- `district`나 `province`는 넓은 선호 범위를 표현할 때만 허용한다.
- 저장 시에는 표시용 이름도 계산 가능하지만, source of truth는 코드 값이다.

### BuyerRequirementPreferredSite

목적:

- 고객이 특정 단지를 직접 선호하는 경우를 구조적으로 저장한다.
- 사무소 관리 단지 여부와 무관하게 모든 `Site`를 선택 가능하게 만든다.

권장 필드:

- `id`
- `officeId`
- `buyerReqId`
- `siteId`
- `sortOrder`
- `isPrimary`
- `note?`
- `createdAt`

설계 원칙:

- `siteId`는 기존 `Site`를 참조한다.
- `OfficeSite`는 추천/빠른 선택 소스일 뿐이고, 저장은 `BuyerRequirementPreferredSite`가 담당한다.
- 고객은 여러 단지를 선호할 수 있고, 우선순위가 있으면 `sortOrder` 또는 `isPrimary`로 표현한다.

### 의미 규칙

- `희망 지역`과 `희망 단지`는 동시에 가질 수 있다.
- 단지 선호는 지역 선호를 대체하지 않고, 더 강한 좁은 조건으로 작동한다.
- 예:
  - 지역: `강동구`, `고덕동`
  - 단지: `래미안고덕`, `그라시움`
- 자동 매칭 시 우선순위는 아래처럼 해석한다.
  - 1순위: 선호 단지 직접 일치
  - 2순위: 선호 Ward 일치
  - 3순위: 선호 District 일치

### 마이그레이션 플랜

1. Phase 2 초반
   - UI는 기존 `regions:string[]`를 유지하되 `고정 지역`, `고정 단지` 선택 UX를 먼저 제공
   - 단지는 임시로 메모/보조 구조 또는 draft 상태로만 취급 가능

2. Phase 2 후반 또는 Phase 3
   - `BuyerRequirementPreferredRegion`
   - `BuyerRequirementPreferredSite`
   - 두 관계 테이블 추가

3. 데이터 이관
   - 기존 `regions:string[]` 값은 가능한 범위에서 `Ward` 또는 `District`로 매핑해 backfill
   - 매핑이 애매한 값은 migration note로 남기고 수동 보정 대상에 넣는다

4. API 확장
   - `GET /buyer-requirements`
   - `GET /buyer-requirements/:id`
   - create/update DTO에 `preferredRegions`, `preferredSites`를 추가

5. 검색/매칭 확장
   - 지역 문자열 검색 대신 코드 기반 질의를 우선 사용
   - Site 직접 선호를 Match 추천과 Listing 필터에 반영

### 호환성 원칙

- `regions:string[]`는 바로 제거하지 않는다.
- 중간 단계에서는 아래 중 하나로 운영한다.
  - 표시/검색 캐시 필드로 유지
  - legacy input 필드로 유지 후 점진 축소
- 완전 전환 전까지 UI는 구버전/신버전 데이터를 모두 읽을 수 있어야 한다.

## 19. 열린 질문

- 같은 Contact에 활성 BuyerRequirement를 여러 개 둘 수 있는가? 가능하다면 거래유형별로 1개씩인지, 지역/예산별로 여러 개도 허용할지 정해야 한다.
- 현재 `GET /buyer-requirements` 응답에는 `마지막 상담내역`, `마지막 상담일`, `담당자 정보`, `_count.matches` 타입 정합성이 부족하다. 목록 projection API 확장 또는 타입 정리가 필요하다.
- 현재 BuyerRequirement 스키마에는 `희망단지`를 구조적으로 저장하는 필드가 없다. 단지 선호를 진짜 검색 조건으로 쓰려면 `Site`와의 별도 관계 테이블이 필요하다.
- `고정 지역`은 office 공통 프리셋으로 둘지, 사용자별 개인 프리셋까지 허용할지 정해야 한다.
- `고정 단지`는 `OfficeSite`를 추천 소스로만 쓸지, `BuyerRequirementPreferredSite` 같은 전용 관계 테이블로 저장할지 정해야 한다.
- 상세 화면에서 Match를 inline 편집할지, Matches 화면으로 넘길지 범위를 정해야 한다.
- `matched` 상태는 Match 1건만 있어도 되는지, 실질적인 고객 반응이 있어야 하는지 정의가 필요하다.
- 삭제보다 `inactive` 전환이 기본 정책이 되어야 하는가?

## 20. 수용 기준

- 사용자는 이 페이지에서 `고객의 구매/임차 조건을 구조화해서 저장하고 후속 연락 일정을 관리`할 수 있어야 한다.
- 목록에는 최소 `고객명, 전화번호, 상태, 긴급도, 거래유형, 예산, 희망지역, 연결 매칭, 마지막 상담내역, 마지막 상담일, 다음 연락일, 담당자`가 보여야 한다.
- 사용자는 구매요구조건 입력 시 `고정 지역`과 `고정 단지`를 빠르게 선택할 수 있어야 한다.
- `고정 단지`는 `관리 단지(OfficeSite)`에 없는 일반 Site도 선택하고 저장할 수 있어야 한다.
- 사용자는 `다음 연락이 필요한` BuyerRequirement를 빠르게 찾을 수 있어야 한다.
- 목록 행은 `더블클릭`으로 상세 화면이 열려야 한다.
- 상세 화면에서는 `조건 요약과 연결 매칭`이 주 정보 영역에 보이고, `상담내역`은 우측 1/3 영역에서 스크롤 가능한 여러 줄 리스트로 보여야 한다.
- BuyerRequirement에서 `상담`, `전화`, `매칭`, `후속 태스크`로 자연스럽게 이어져야 한다.
- 역할별 권한 차이가 UI와 API 모두에서 일치해야 한다.
