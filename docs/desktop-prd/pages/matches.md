# Matches

## 메타

- 페이지명: Matches
- 문서 상태: draft
- 우선순위: P0
- Phase: Phase 2
- 구현 상태: partial prototype exists
- 작성일: 2026-04-02
- 최종 수정일: 2026-04-02
- 관련 엔터티: Match, BuyerRequirement, Listing, Property, Contact, Consultation, Deal, Task, ActivityLog
- 관련 API:
  - `GET /matches`
  - `GET /matches/:id`
  - `POST /matches`
  - `PATCH /matches/:id/stage`
  - `DELETE /matches/:id`
  - `GET /buyer-requirements`
  - `GET /buyer-requirements/:id`
  - `GET /listings`
  - `GET /deals`
  - `POST /deals`
  - `PATCH /deals/:id/stage`
  - `POST /consultations`
  - `POST /tasks`
- 관련 화면: Buyer Requirements, Properties/Listings, Call Workspace, Deals, Tasks

현재 결정:

- 이 문서는 desktop의 `매칭 관리 페이지`를 기준으로 작성한다.
- 현재 구현에는 `고객별`, `칸반`, `리스트` 3가지 뷰가 있으므로 이를 정식 UX로 받아 적는다.
- `거래 전환`은 UX상 Matches에서 시작되지만, 장기적으로는 실제 Deal 생성과 연결되어야 한다.
- `고객별` 뷰는 단순 사람 그룹이 아니라 `고객(Contact) -> 구매조건(BuyerRequirement)들 -> 각 구매조건의 매물(Match)` 계층으로 봐야 한다.
- 추가적으로 `소유자/매물 관점`에서도 Match를 볼 수 있는 구조가 필요하다.

## 1. 페이지 목적

- 이 페이지가 해결해야 하는 핵심 업무:
  - 구매요구조건과 매물을 연결한 뒤, 고객 반응과 협의 단계를 추적하고 거래로 넘긴다.
- primary 사용자:
  - agent
- secondary 사용자:
  - manager, owner
- 이 페이지가 필요한 이유:
  - BuyerRequirement와 Listing이 연결되더라도, 실제로 어느 단계까지 진척됐는지 관리할 별도 실행 단위가 필요하다.
  - Match는 단순 추천 목록이 아니라 `추천 -> 연락 -> 방문 -> 협의 -> 거래 전환`의 파이프라인이다.
  - desktop에서는 여러 매칭을 고객별/단계별로 빠르게 훑고, 드래그에 가까운 속도로 단계 전환해야 한다.

## 2. 사용 시점

- 사용자가 이 페이지에 들어오는 대표 상황:
  - BuyerRequirement에 맞는 Listing을 찾아 추천한 뒤 후속 진행을 관리할 때
  - 어떤 고객에게 어떤 매물을 제안했는지 한 번에 볼 때
  - 현재 방문 단계, 협의 단계, 거래 전환 직전 매칭을 훑을 때
  - 특정 Match를 거래로 넘기거나 종료할 때
- 진입 경로:
  - 사이드바 `매칭`
  - Buyer Requirement Detail의 `매칭 찾기` 또는 `매칭 생성`
  - Property/Listing 화면의 `매칭 추가`
  - Deals/Tasks에서 해당 Match 링크 역진입
- 이전 화면:
  - Buyer Requirements
  - Properties/Listings
  - Contact Detail
  - Call Workspace
- 다음 화면:
  - Match Detail
  - Deals
  - Buyer Requirement Detail
  - Property/Listing Detail
  - Call Workspace
  - Tasks
- 이 페이지를 나가는 대표 액션:
  - Match 상세 보기
  - 단계 변경
  - 거래 전환
  - 종료
  - 관련 고객/매물 화면으로 이동

## 3. 사용자 역할과 권한

| 역할 | 조회 | 생성 | 수정 | 삭제 | 승인/확정 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| owner | 전체 조회 | 가능 | 가능 | 가능 | 가능 | 거래 전환 정책 최종 책임 |
| manager | 전체 조회 | 가능 | 가능 | 제한적 | 가능 | 팀 전체 단계 관리 |
| agent | 전체 조회 | 가능 | 가능 | 제한적 | 가능 | 본인 실무 중심 |

권한 메모:

- Match 조회는 office 전체 기준으로 허용한다.
- 생성과 단계 변경은 모든 역할이 가능하되, 삭제/대량 정리는 owner/manager 중심이 안전하다.
- `승인/확정`은 결재 의미가 아니라 단계 이동과 거래 전환 실행을 뜻한다.

## 4. 핵심 시나리오

### 시나리오 A: BuyerRequirement에서 Match 생성

1. 사용자는 BuyerRequirement에서 적합한 Listing을 찾는다.
2. 시스템은 `listingId + buyerReqId`로 Match를 생성한다.
3. 사용자는 초기 메모를 남기고 `suggested` 상태로 파이프라인에 올린다.
4. 완료 조건:
   - Match 1건이 생성되고
   - 고객과 매물이 명확히 연결된다.

### 시나리오 B: 고객 반응과 협의 단계 추적

1. 사용자는 `고객 -> 구매조건 -> 매물들` 구조의 구매고객별 뷰 또는 칸반 뷰에서 Match를 확인한다.
2. 시스템은 같은 고객 아래 여러 BuyerRequirement를 분리해서 보여주고, 각 BuyerRequirement마다 `suggested -> buyerInterested -> viewingConfirmed -> viewing -> negotiating` 흐름을 추적한다.
3. 사용자는 현재 단계에 따라 다음 단계로 이동하거나 메모를 남긴다.
4. 완료 조건:
   - 각 Match의 현재 진척도가 명확하고
   - 같은 고객의 여러 구매조건이 서로 섞이지 않으며
   - 각 구매조건별 후보 매물을 함께 비교 가능하다.

### 시나리오 D: 소유자/매물 관점으로 보기

1. 사용자는 특정 소유자 또는 특정 Listing 기준으로 현재 붙어 있는 Match들을 보고 싶다.
2. 시스템은 `소유자(Contact) -> 보유 Listing들 -> 각 Listing에 연결된 Match들` 구조를 제공한다.
3. 사용자는 어느 매물이 어떤 고객들에게 제안됐는지, 어느 단계까지 진행됐는지 확인한다.
4. 완료 조건:
   - BuyerRequirement 관점뿐 아니라 공급측 관점에서도 Match 현황을 파악할 수 있다.

### 시나리오 C: 거래 전환

1. 사용자는 협의가 완료된 Match를 `거래 전환`한다.
2. 시스템은 Match를 `dealCreated`로 바꾸고, 장기적으로는 실제 Deal 생성까지 이어져야 한다.
3. 사용자는 Deal 화면으로 넘어가 계약/수수료/일정 흐름을 계속 처리한다.
4. 완료 조건:
   - Match가 파이프라인에서 빠지고
   - 거래 관리 흐름으로 자연스럽게 이어진다.

## 5. 화면 구조

예시:

- 상단: 검색/필터/뷰 전환
- 본문: 고객별 / 칸반 / 리스트
- 상세: 다이얼로그 또는 우측 패널

실제 정의:

- 상단 영역:
  - 페이지 제목
  - 총 Match 수
  - KPI tiles
    - 진행 매칭
    - 방문 단계
    - 거래 전환
    - 종료
- 필터/뷰 컨트롤 영역:
  - 검색창
  - stage multi-select filter
  - view mode toggle
    - `구매고객별`
    - `칸반`
    - `리스트`
    - 후속 확장: `소유자별` 또는 `매물별`
- 본문 영역:
  - `구매고객별 뷰`
    - 계층 구조는 `Contact -> BuyerRequirement -> Match`
    - 최상단은 고객(Contact) 헤더
    - 그 아래에 고객이 가진 BuyerRequirement 카드들이 반복된다
    - 각 BuyerRequirement 카드 아래에 해당 조건에 연결된 Match lane 또는 카드 리스트를 배치한다
    - 같은 고객이더라도 서로 다른 요구조건은 절대 한 그룹으로 합치지 않는다
  - `칸반 뷰`
    - suggested, buyerInterested, viewingConfirmed, viewing, negotiating 컬럼
    - dealCreated / closed는 하단 결과 패널
  - `리스트 뷰`
    - 단일 표 형태
  - `소유자/매물 관점 뷰` (후속)
    - 계층 구조는 `Owner Contact -> Listing -> Match`
    - Owner Contact은 `PropertyContact.role in (owner, co_owner, representative)` 기반으로 추출
    - BuyerRequirement가 아니라 공급측에서 현재 제안 현황을 보는 데 사용
- 리스트 컬럼 정의:
  - `단계`
  - `고객`
  - `고객 연락처`
  - `매물`
  - `거래유형`
  - `가격`
  - `구매조건 요약`
  - `메모`
  - `등록일 또는 최근 수정일`
  - `액션`
- 상세 영역:
  - 현재 구현은 `Match Detail Dialog`
  - desktop 장기 방향은 `우측 상세 패널` 또는 `확장 다이얼로그`

`Match Detail` 상세 레이아웃:

- 상단:
  - 현재 단계 badge
  - 단계 전환 progress
- 좌측 `1/2` 영역:
  - `구매자 정보`
    - 이름, 연락처, 구매조건 요약, 요건 메모
  - `후속 액션`
    - 전화 상담
    - 상담 기록
    - 후속 태스크
- 우측 `1/2` 영역:
  - `매물 정보`
    - 단지/호실
    - 주소
    - 가격
    - 거래유형
    - 확인상태
  - `매칭 메모`
    - 공용 메모 여러 줄 편집
- 하단:
  - 거래 전환
  - 종료
  - 관련 BuyerRequirement / Listing / Deal로 이동

## 6. 조회 데이터

| 항목 | 설명 | 필수 여부 | 출처 |
| --- | --- | --- | --- |
| matchList | 전체 Match 목록 | 필수 | `GET /matches` |
| groupedBuyerMatches | 구매고객별 그룹 뷰 데이터 | 필수 | `GET /matches` 후 `Contact -> BuyerRequirement -> Match` 그룹화 |
| kanbanColumns | 단계별 Match 묶음 | 필수 | `GET /matches` 후 클라이언트 분류 |
| convertedMatches | 거래 전환된 Match | 필수 | `GET /matches` 후 `stage=dealCreated` |
| closedMatches | 종료된 Match | 필수 | `GET /matches` 후 `stage=closed` |
| selectedMatch | 선택된 Match 상세 | 조건부 | `GET /matches/:id` 또는 목록 데이터 재사용 |
| buyerRequirementSummary | Match에 연결된 고객 조건 | 필수 | `buyerRequirement` include |
| listingSummary | Match에 연결된 매물 요약 | 필수 | `listing -> property -> site/unit` include |
| stageMetrics | KPI summary | 필수 | `GET /matches` 후 클라이언트 집계 |
| dealLinkage | 해당 Match의 실제 Deal 연결 상태 | 선택 | 현재 없음, 후속 확장 필요 |
| ownerGroupedMatches | 소유자/매물 관점 그룹 데이터 | 선택 | `listing -> property -> propertyContacts(owner)` projection 필요 |

조회 규칙:

- 초기 진입 시:
  - 현재는 `GET /matches`로 office 전체를 조회한다.
  - 뷰별 가공은 클라이언트에서 수행한다.
- 검색 변경 시:
  - 고객명, 연락처, 매물명, 주소, 메모 기준으로 필터링한다.
- 상세 열기 시:
  - 선택 Match의 buyerRequirement와 listing 정보를 함께 보여준다.
- 후속 개선:
  - 데이터가 커지면 서버 필터링, pagination, stage별 query가 필요하다.

## 7. 검색 / 필터 / 정렬

- 기본 검색 대상:
  - 고객명
  - 연락처
  - 매물명
  - 주소
  - 메모
- 기본 정렬:
  - 최신 생성순 또는 뷰별 단계 우선순위
- 필터 항목:
  - 단계
  - 거래유형
  - 고객명
  - 지역
  - 거래 전환 여부
  - 종료 여부
- 저장 가능한 뷰:
  - MVP에서는 사용자 저장 뷰 없음
  - 대신 `구매고객별 / 칸반 / 리스트` 세 가지 작업 뷰 제공
- 역할별 기본 뷰 차이:
  - agent는 `구매고객별` 또는 `칸반`이 기본값 후보
  - manager/owner는 `칸반`과 `리스트`가 유용

## 8. 주요 액션

| 액션 | 설명 | 권한 | 성공 결과 | 실패/예외 |
| --- | --- | --- | --- | --- |
| Match 생성 | Listing과 BuyerRequirement 연결 | 전체 | Match 생성 | 중복 Match |
| 단계 변경 | 현재 Match를 다음/임의 단계로 이동 | 전체 | stage 반영 | 허용되지 않는 단계 정책 |
| 메모 수정 | Match 메모 편집 | 전체 | memo 저장 | 저장 실패 |
| 상세 열기 | 더블클릭 또는 메뉴로 상세 열기 | 전체 | Match Detail 표시 | stale data |
| 종료 | Match를 `closed`로 전환 | 전체 | 종료 패널로 이동 | 실수 종료 |
| 거래 전환 | Match를 `dealCreated`로 전환 | 전체 | 거래 전환 상태 반영 | 실제 Deal 미생성 |
| 관련 고객 열기 | BuyerRequirement / Contact로 이동 | 전체 | 관련 화면 진입 | 연결 없음 |
| 관련 매물 열기 | Listing / Property로 이동 | 전체 | 관련 화면 진입 | 연결 없음 |
| 전화/상담 시작 | Call Workspace 또는 Consultation 생성 | 전체 | 후속 커뮤니케이션 시작 | Call Workspace 보류 |
| 후속 태스크 생성 | Task 생성 | 전체 | Task 반영 | 제목 누락 |
| 삭제 | Match 제거 | owner, manager, 제한적 agent | 목록에서 제거 | 이미 거래 전환됨 |

## 9. 생성 / 수정 폼 규칙

- 필수 입력값:
  - `listingId`
  - `buyerReqId`
- 기본값:
  - `stage = suggested`
  - `memo = empty`
- 자동 계산:
  - BuyerRequirement에서 진입 시 `buyerReqId` 자동 세팅
  - Listing에서 진입 시 `listingId` 자동 세팅
- 상호 의존 필드:
  - 같은 Listing + 같은 BuyerRequirement 조합은 중복 금지
  - `dealCreated`로 전환할 때는 실제 Deal 생성 여부를 함께 확인해야 한다.
- 저장 전 검증:
  - buyerReqId, listingId 유효성 확인
  - closed 상태에서 재전환 허용 여부 정의 필요
- 저장 후 후속 액션:
  - 구매고객별 뷰에서 해당 `Contact -> BuyerRequirement` 그룹에 즉시 반영
  - 상세 열기 또는 상담/거래 전환 CTA 유지

## 10. 상태값

이 페이지가 직접 다루는 상태:

- `Match.stage`
  - `suggested`
  - `buyerInterested`
  - `viewingConfirmed`
  - `viewing`
  - `negotiating`
  - `dealCreated`
  - `closed`

상태 전이 규칙:

```text
suggested -> buyerInterested -> viewingConfirmed -> viewing -> negotiating -> dealCreated
suggested -> closed
buyerInterested -> closed
viewingConfirmed -> closed
viewing -> closed
negotiating -> closed
```

상태별 UI 차이:

- `suggested`
  - 내부 후보 단계. 매물 확인이 유효해야 다음 단계로 이동 가능
- `buyerInterested`
  - 고객 관심을 확인한 상태
- `viewingConfirmed`
  - 집주인·점유자에게 임장 가능 여부를 확인한 상태
- `viewing`
  - 방문/임장 관련 follow-up 강조
- `negotiating`
  - 가격/조건 협의 강조
- `dealCreated`
  - 파이프라인 상으로는 거래 전환 완료
  - 본문에서는 하단 결과 패널로 분리
- `closed`
  - 종료 상태로, active board에서는 제외

## 11. 예외 / 빈 상태 / 오류 상태

- 빈 상태:
  - Match가 하나도 없으면 BuyerRequirement 또는 Listing에서 Match를 생성하라고 안내한다.
- 검색 결과 없음:
  - 현재 필터에 맞는 Match가 없다고 명확히 표시한다.
- 권한 없음:
  - 삭제 또는 고위험 단계 전환 제한 시 이유를 안내한다.
- 연동 실패:
  - stage update 실패 시 이전 상태를 유지하고 오류를 표시한다.
- 삭제 불가 조건:
  - 실제 Deal과 연결된 Match는 삭제보다 종료/보관이 기본이어야 한다.
- 충돌 상태:
  - 동일 `listingId + buyerReqId` 조합 중복 생성 방지
  - `dealCreated`인데 실제 Deal이 없는 상태는 불일치 경고 대상

## 12. 연결 엔터티와 화면

| 연결 대상 | 연결 방식 | 사용 목적 |
| --- | --- | --- |
| Buyer Requirements | 고객명/조건 링크 | 고객 요구조건 확인 |
| Properties / Listings | 매물 정보 링크 | 실제 매물 확인 |
| Call Workspace | 상세 CTA | 전화/상담 진행 |
| Consultations | 상세 CTA 또는 컨텍스트 생성 | 커뮤니케이션 기록 |
| Tasks | 상세 CTA | 후속 업무 연결 |
| Deals | 거래 전환 후 이동 | 계약/수수료/일정 관리 |

## 13. Desktop 전용 요구사항

- 다중 패널 필요 여부:
  - 필요. 뷰 전환이 핵심이고, 상세는 다이얼로그 또는 우측 패널로 즉시 열려야 한다.
- 키보드 단축키:
  - `Cmd/Ctrl+F`: 검색 포커스
  - `1`: 구매고객별 뷰
  - `2`: 칸반 뷰
  - `3`: 리스트 뷰
  - `Enter`: 선택 Match 상세 열기
  - `Cmd/Ctrl+Shift+Right`: 다음 단계 이동
- 실시간 업데이트:
  - 다른 사용자의 stage 변경이 반영돼야 한다.
  - 거래 전환 또는 종료도 즉시 동기화돼야 한다.
- 알림 연동:
  - viewing 진입
  - negotiating 진입
  - dealCreated 전환
- 시스템 트레이/OS 이벤트 연동:
  - 직접 핵심은 아님
- 로컬 기능 연동:
  - Call Workspace와 빠른 연결 필요
- 멀티 선택 / 벌크 액션:
  - MVP 제외
  - 후속으로 일괄 종료, 일괄 담당자 배정 검토
- 창 크기 변화 대응:
  - 칸반 뷰는 가로 스크롤 허용
  - 상세 다이얼로그는 desktop 폭 기준 2단 레이아웃 유지

## 14. 감사 추적 / 로그

- ActivityLog 기록 대상 액션:
  - Match 생성/삭제
  - Match stage 변경
  - Match memo 변경
- actor / source 규칙:
  - desktop UI 작업은 `actor=user`
  - 향후 MCP가 Match를 만들거나 stage를 바꾸면 source 분리
- 중요 감사 이벤트:
  - `buyerInterested`, `viewingConfirmed`, `viewing`, `negotiating`, `dealCreated`, `closed` 전환

## 15. 비기능 요구사항

- 초기 로딩 목표:
  - 전체 Match 목록 1초 내 표시
  - 뷰 전환은 클라이언트 가공만으로 즉시 반응
- 대량 데이터 처리 방식:
  - 현재 전체 조회 기반
  - 규모가 커지면 stage filter/pagination/server query 필요
- 낙관적 업데이트 여부:
  - stage 변경, memo 수정은 낙관적 반영 가능
  - 거래 전환은 Deal 생성과 묶이면 서버 확정 후 반영이 안전
- 오프라인/재시도 전략:
  - stage 변경 실패 시 원상복귀와 메시지 표시
- 접근성/가독성 메모:
  - stage 색상은 직관적이어야 하고, 고객/매물/가격이 카드에서 빠르게 읽혀야 한다.

## 16. MVP 포함 범위

- Match 생성
- 3가지 뷰
  - 구매고객별
  - 칸반
  - 리스트
- 구매고객별 계층 구조
  - `고객 -> 구매조건들 -> 각 구매조건의 매물들`
- 더블클릭 기반 상세 열기
- stage 변경
- 메모 수정
- 거래 전환/종료 액션
- BuyerRequirement / Listing 컨텍스트 표시

## 17. MVP 제외 범위

- 자동 추천 Match 생성 엔진
- 대량 Match import
- 담당자/우선순위 필드
- Match별 다중 메모/활동 타임라인
- drag and drop 칸반
- 거래 전환 시 계약 초안 자동 생성
- 정식 `소유자별` 전용 뷰
- 공급측 전용 요구조건 엔터티

## 18. 열린 질문

- `dealCreated`가 단순 stage 값인지, 실제 `Deal` 생성이 반드시 동반되어야 하는지 정해야 한다.
- Match 상세를 계속 dialog로 둘지, 우측 고정 패널 또는 전체 상세 페이지로 옮길지 결정이 필요하다.
- 상담/태스크가 Match에 직접 연결될 때 어떤 컨텍스트를 자동 세팅할지 더 명확히 정해야 한다.
- 현재 `GET /matches`는 전체 조회만 있고 서버 필터가 없다. 규모가 커질 때 어떤 query shape로 확장할지 정해야 한다.
- `closed`에서 다시 active 단계로 되돌리는 복구 흐름을 허용할지 정해야 한다.
- `소유자별` 또는 `매물별` 뷰를 만들 때, 현재 `Listing -> Property -> PropertyContact(owner)`만으로 충분한지, 아니면 공급측의 별도 조건 엔터티가 필요한지 정해야 한다.
- 공급측 조건이 중요해지면 `SellerRequirement` 또는 `ListingOwnerPreference` 같은 구조가 필요한지 검토해야 한다.

## 19. 수용 기준

- 사용자는 이 페이지에서 `구매고객과 매물을 연결한 뒤 진행 단계를 추적`할 수 있어야 한다.
- 사용자는 `구매고객별`, `칸반`, `리스트` 세 가지 뷰로 같은 Match 데이터를 볼 수 있어야 한다.
- `구매고객별` 뷰에서는 한 고객 아래 여러 구매조건이 분리되어 보여야 하고, 각 구매조건 아래에 해당 매물들이 연결돼 보여야 한다.
- Match는 `suggested -> buyerInterested -> viewingConfirmed -> viewing -> negotiating -> dealCreated -> closed` 흐름으로 관리되어야 한다.
- 목록/카드/레인에서는 최소 `고객, 연락처, 매물, 가격, 조건 요약, 현재 단계`를 빠르게 파악할 수 있어야 한다.
- Match는 `더블클릭`으로 상세를 열 수 있어야 한다.
- 거래 전환은 장기적으로 실제 Deal 생성과 논리적으로 연결되어야 한다.
- 역할별 권한 차이가 UI와 API 모두에서 일치해야 한다.
