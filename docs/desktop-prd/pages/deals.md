# Deals

## 메타

- 페이지명: Deals
- 문서 상태: draft
- 우선순위: P0
- Phase: Phase 2
- 구현 상태: partial prototype exists
- 작성일: 2026-04-02
- 최종 수정일: 2026-04-02
- 관련 엔터티: Deal, Contract, DealParticipant, Match, Listing, Property, Contact, CalendarEvent, ActivityLog, ContractTemplate(future), DealDocument(future), DealDocumentRequirement(future)
- 관련 API:
  - 현재
    - `GET /deals`
    - `GET /deals/:id`
    - `POST /deals`
    - `PATCH /deals/:id/stage`
    - `DELETE /deals/:id`
  - 후속 필요
    - `PATCH /deals/:id`
    - `GET /deals/:id/participants`
    - `POST /deals/:id/participants`
    - `PATCH /deals/:id/participants/:participantId`
    - `GET /contracts?dealId=:id`
    - `POST /contracts`
    - `PATCH /contracts/:id`
- 관련 화면: Matches, Properties/Listings, Contacts, Contracts, Tasks, Calendar

현재 결정:

- 이 문서는 desktop의 `거래관리 페이지 + 거래 상세 작업공간`을 기준으로 작성한다.
- `Deal`은 사무소 내부의 거래 진행 관리이고, `Contract`는 계약서 기준의 법적 상세다.
- Deal 페이지는 거래 파이프라인, 당사자, 수수료, 공동중개, 참여자 배분을 다룬다.
- Contract 페이지는 별도 화면으로 분리하되, Deal 상세에서는 계약 상태와 대금 일정 요약을 반드시 보여준다.
- Deal 상세에서는 `계약서 템플릿 기반 초안 생성`, `필요 서류 체크리스트 자동 준비`, `PDF 저장/인쇄`, `자료 보관함` 진입이 가능해야 한다.
- 문서 자동화는 템플릿과 필드 매핑이 선행되어야 하며, 실제 계약 문서 편집 화면은 Contract Workspace와 강하게 연결된다.
- 문서 자동화와 저장소 구현은 `Phase 2 보류 항목`으로 두고, 이 문서에서는 사용자 관점의 기대 기능만 설명한다.
- 문서 파일 저장소는 별도 `S3 기반 object storage`를 전제로 한다.
- 현재 desktop 구현은 `칸반 보드 + 단계 변경` 수준의 프로토타입이므로, 이 문서는 그보다 넓은 목표 UX를 정의한다.

## 1. 페이지 목적

- 이 페이지가 해결해야 하는 핵심 업무:
  - 매칭 이후 실제 거래로 넘어온 건을 단계별로 관리한다.
  - 거래 당사자, 가격, 수수료, 공동중개, 참여 직원 배분을 한 곳에서 정리한다.
  - 계약서 작성 전후의 진행 상황을 사무소 내부 기준으로 통합 관리한다.
  - 각 Deal에 필요한 계약 문서와 준비 서류를 빠르게 생성, 점검, 저장한다.
- primary 사용자:
  - agent
- secondary 사용자:
  - manager, owner
- 이 페이지가 필요한 이유:
  - Match는 추천/협의 파이프라인이고, Deal은 실제 거래 실행 단위다.
  - 계약은 법적 문서이므로 별도 엔터티가 맞지만, 실무상 사용자는 Deal 화면에서 현재 계약 상태까지 같이 보고 싶어한다.
  - desktop에서는 여러 거래를 빠르게 훑고, 단계 이동과 상세 검토를 반복하는 작업이 많다.

## 2. 사용 시점

- 사용자가 이 페이지에 들어오는 대표 상황:
  - Match를 거래로 전환한 직후
  - 특정 Listing이 최종 선택되어 가격/당사자/수수료를 확정해야 할 때
  - 가계약금, 본계약, 완료 직전 거래를 팀 단위로 모니터링할 때
  - 공동중개나 참여자 배분을 확인할 때
- 진입 경로:
  - 사이드바 `거래관리`
  - Match의 `거래 전환`
  - Property/Listing Detail의 `거래 생성`
  - Contact Detail의 연결 거래 목록
  - Contract 화면에서 역으로 해당 Deal 열기
- 이전 화면:
  - Matches
  - Properties/Listings
  - Contacts
  - Contracts
- 다음 화면:
  - Deal Detail Workspace
  - Contract Detail
  - Buyer/Seller Contact Detail
  - Property/Listing Detail
- 이 페이지를 나가는 대표 액션:
  - 거래 단계 변경
  - 거래 상세 열기
  - 계약서 생성 또는 열기
  - 당사자/수수료/공동중개 정보 수정
  - 종료 처리

## 3. 사용자 역할과 권한

| 역할 | 조회 | 생성 | 수정 | 삭제 | 승인/확정 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| owner | 전체 조회 | 가능 | 가능 | 가능 | 가능 | 수수료/정산 정책 최종 책임 |
| manager | 전체 조회 | 가능 | 가능 | 제한적 | 가능 | 팀 거래 현황 관리 |
| agent | 전체 조회 | 가능 | 가능 | 제한적 | 가능 | 실무 입력 중심 |

권한 메모:

- Deal 조회는 office 전체 기준으로 허용한다.
- 생성과 단계 변경은 전 역할 가능하되, 삭제는 owner/manager 중심이 안전하다.
- 수수료 배분과 공동중개 금액 변경은 agent도 가능할 수 있지만, ActivityLog가 강하게 남아야 한다.
- Contract 생성/수정 권한은 Deal 권한과 대체로 맞추되, 최종 정책은 계약 화면 PRD에서 재확정한다.

## 4. 핵심 시나리오

### 시나리오 A: Match에서 Deal 생성

1. 사용자는 Match에서 `거래 전환`을 실행한다.
2. 시스템은 Listing, BuyerRequirement, Contact 문맥을 바탕으로 Deal 초안을 만든다.
3. 사용자는 Deal 상세에서 매수인/매도인, 가격, 수수료, 메모를 보완한다.
4. 완료 조건:
   - Deal이 `preparing` 단계로 생성되고
   - 이후 Deals 화면에서 바로 추적 가능하다.

### 시나리오 B: 진행 거래 보드 관리

1. 사용자는 거래관리 페이지에 들어와 현재 진행 거래를 훑는다.
2. 시스템은 `preparing -> preContract(선택) -> contracted -> settling -> completed` 단계로 보드를 보여주고, `closed`는 별도 아카이브로 분리한다.
3. 사용자는 카드에서 다음 단계로 이동하거나 상세를 연다.
4. 완료 조건:
   - 현재 진행 중인 거래와 막힌 거래가 한눈에 보이고
   - 팀이 동일한 기준으로 단계 상태를 공유한다.

### 시나리오 C: Deal 상세에서 거래 정보 정리

1. 사용자는 보드 카드 또는 리스트 row를 열어 Deal 상세 작업공간으로 들어간다.
2. 시스템은 매물, 당사자, 거래가, 수수료, 공동중개, 참여자 배분, 계약 요약을 보여준다.
3. 사용자는 필요한 정보를 수정하고 저장한다.
4. 완료 조건:
   - 거래 실행에 필요한 핵심 정보가 한 화면에서 정리되고
   - 이후 Contract 화면으로 자연스럽게 이어진다.

### 시나리오 D: 계약 및 완료 관리

1. 사용자는 `contracted` 이후 Deal에서 계약 상태와 대금 일정 진행을 확인한다.
2. 시스템은 연결된 Contract의 상태 요약과 일정 마일스톤을 보여준다.
3. 사용자는 Contract 화면으로 이동해 상세를 처리하거나, Deal을 `completed`로 넘긴다.
4. 완료 조건:
   - Deal과 Contract의 책임 구분이 유지되고
   - 사용자는 현재 어느 화면에서 무엇을 처리해야 하는지 헷갈리지 않는다.

### 시나리오 E: 계약 문서 작성과 보관

1. 사용자는 Deal 상세에서 계약서 템플릿을 선택해 초안을 생성한다.
2. 시스템은 Deal, Contract, Contact, Listing 데이터를 템플릿 필드에 자동 매핑하고, 거래 유형별 필요 서류 목록도 자동 제안한다.
3. 사용자는 컴퓨터에서 문서를 수정하고, PDF로 저장하거나 바로 인쇄하며, 최종 파일을 Deal 자료함에 보관한다.
4. 완료 조건:
   - 계약서 초안 작성 시간이 줄어들고
   - 각 Deal의 문서와 준비 서류 상태가 한 곳에 남는다.

## 5. 화면 구조

예시:

- 상단: KPI / 검색 / 필터
- 본문: 칸반 보드 또는 리스트
- 상세: 우측 상세 패널 또는 전용 detail route

실제 정의:

- 상단 영역:
  - 페이지 제목
  - 전체 거래 수
  - KPI tiles
    - 진행 거래 수
    - 예상 수수료 총액
    - 완료 단계 거래 수
    - 공동중개 거래 수
- 필터/컨트롤 영역:
  - 검색창
  - 거래유형 filter
  - stage filter
  - `진행 거래만 / 종료 포함` toggle
  - view mode toggle
    - `보드`
    - `리스트`
  - `새 거래 생성` 버튼
- 본문 영역:
  - `보드 뷰`
    - 컬럼: `preparing`, `preContract`, `contracted`, `settling`, `completed`
    - 각 컬럼은 Deal 카드 리스트
    - `closed`는 하단 접이식 아카이브
  - `리스트 뷰`
    - 거래를 표 형태로 보여주고, 정렬/대량 검토에 사용
- 카드/row 공통 정보:
  - 거래유형
  - 공동중개 여부
  - 매물명
  - 주소 요약
  - 거래가
  - 수수료 총액
  - 매수인
  - 매도인
  - 최근 수정일
- 상세 영역:
  - 카드 클릭 또는 row 더블클릭 시 Deal Detail Workspace를 연다.
  - desktop MVP에서는 `전용 상세 route` 또는 `우측 슬라이드 패널` 중 하나로 구현 가능하나, 정보량상 `전용 상세 route`가 더 적합하다.

`Deal Detail Workspace` 상세 레이아웃:

- 상단:
  - Deal 제목
  - stage badge
  - 거래유형 badge
  - `계약서 열기/생성` CTA
  - 최근 수정일
- 좌측 `2/3` 영역:
  - `매물 정보`
    - 단지/동/호 또는 site/unit 표기
    - 주소
    - Listing 거래유형/호가 요약
  - `거래 당사자`
    - 매수인
    - 매도인
    - 연락처 열기 CTA
  - `거래 조건`
    - 최종 거래가
    - 매도측 수수료율/금액
    - 매수측 수수료율/금액
    - 수수료 총액
    - VAT
  - `공동중개`
    - 공동중개 여부
    - 상대 중개사무소명
    - 상대 연락처
    - 상대 수수료
  - `참여 직원 배분`
    - DealParticipant 목록
    - 역할
    - side
    - 배분 금액/비율
    - 정산 상태
  - `메모`
    - 여러 줄 편집 가능
- 우측 `1/3` 영역:
  - `계약 요약`
    - Contract 존재 여부
    - 계약 상태
    - 계약일
    - 계약금/중도금/잔금 일정 요약
    - 입주일 또는 임대기간
  - `관련 이력`
    - 관련 Match 링크
    - 최근 ActivityLog
    - 후속 Task/CalendarEvent 요약
  - `문서/서류`
    - 사용 가능한 계약서 템플릿
    - 생성된 문서 목록
    - 필요 서류 체크리스트
    - `작성 시작`, `PDF 저장`, `인쇄`, `업로드`, `파일 열기` CTA
  - 이 영역은 세로 스크롤 가능해야 한다.

리스트 컬럼 정의:

- `단계`
- `거래유형`
- `매물`
- `주소`
- `거래가`
- `매수인`
- `매도인`
- `수수료 총액`
- `공동중개`
- `계약 상태`
- `최근 수정일`

## 6. 조회 데이터

| 항목 | 설명 | 필수 여부 | 출처 |
| --- | --- | --- | --- |
| dealList | 전체 Deal 목록 | 필수 | `GET /deals` |
| pipelineColumns | 단계별 Deal 묶음 | 필수 | `GET /deals` 후 클라이언트 분류 |
| activeMetrics | KPI summary | 필수 | `GET /deals` 후 클라이언트 집계 |
| selectedDeal | 선택된 Deal 상세 | 필수 | `GET /deals/:id` |
| propertySummary | Deal에 연결된 Listing/Property 정보 | 필수 | `listing -> property -> site/unit` include |
| buyerSummary | 매수인 정보 | 선택 | `buyerContact` include |
| sellerSummary | 매도인 정보 | 선택 | `sellerContact` include |
| contractSummary | 연결 Contract 요약 | 중요 | 현재 projection 없음, 후속 API 필요 |
| participantSummary | 참여 직원/배분 정보 | 중요 | 현재 projection 없음, 후속 API 필요 |
| originMatch | Deal이 어떤 Match에서 왔는지 | 중요 | 현재 스키마 없음, 후속 구조 필요 |
| relatedTasks | 후속 업무/알림 | 선택 | 후속 API 또는 aggregate query 필요 |
| availableTemplates | 선택 가능한 계약 문서 템플릿 | 중요 | 후속 Template API 필요 |
| requiredDocuments | 거래 유형별 준비 서류 체크리스트 | 중요 | 후속 rule/template 기반 생성 필요 |
| storedDocuments | Deal에 저장된 계약서/PDF/첨부 문서 목록 | 중요 | 후속 file storage metadata API 필요 |

조회 규칙:

- 초기 진입 시:
  - `GET /deals`로 office 전체 거래를 조회한다.
  - 진행 거래와 종료 거래를 분리한다.
- 카드/row 선택 시:
  - 목록 데이터만으로 부족하면 `GET /deals/:id`를 추가 호출한다.
- 상세 진입 시:
  - Contract 요약, DealParticipant, ActivityLog를 함께 가져오는 projection이 필요하다.
  - 문서 자동화가 들어가면 템플릿 목록, 필요 서류 상태, 저장된 파일 메타데이터도 함께 필요하다.
- 후속 개선:
  - 거래 수가 많아지면 stage/transactionType/updatedAt 기반 서버 필터링과 pagination이 필요하다.

## 7. 검색 / 필터 / 정렬

- 기본 검색 대상:
  - 매물명
  - 단지명
  - 주소
  - 매수인 이름/전화번호
  - 매도인 이름/전화번호
  - 상대 중개사무소명/연락처
  - 메모
- 기본 정렬:
  - `updatedAt desc`
- 필터 항목:
  - Deal stage
  - 거래유형
  - 공동중개 여부
  - Contract 존재 여부
  - Contract 상태
  - 종료 거래 포함 여부
  - 참여 직원
- 저장 가능한 뷰:
  - MVP에서는 사용자 저장 뷰 없음
  - 기본 제공 뷰는 `보드`, `리스트`
- 역할별 기본 뷰 차이:
  - agent는 `보드` 기본
  - manager/owner는 `보드`와 `리스트`를 모두 사용

## 8. 주요 액션

| 액션 | 설명 | 권한 | 성공 결과 | 실패/예외 |
| --- | --- | --- | --- | --- |
| Deal 생성 | Listing/Property 또는 Match에서 새 Deal 생성 | 전체 | `preparing` Deal 생성 | Listing 미존재 |
| 상세 열기 | 카드 클릭 또는 row 더블클릭 | 전체 | 상세 작업공간 표시 | stale data |
| 단계 변경 | 현재 Deal을 다음/임의 단계로 이동 | 전체 | stage 저장 | 필수 정보 미입력 |
| 거래 정보 수정 | 당사자, 가격, 메모 수정 | 전체 | 저장 반영 | validation 실패 |
| 수수료 수정 | 매도/매수측 수수료, 총액, VAT 수정 | 전체 | 수수료 값 반영 | 계산 불일치 |
| 공동중개 설정 | 공동중개 여부 및 상대 중개사 정보 입력 | 전체 | 관련 필드 저장 | 필수 정보 누락 |
| 참여자 배분 수정 | DealParticipant 추가/수정 | 전체 | 배분 정보 반영 | 합계 불일치 |
| 계약서 생성/열기 | Deal 기준 Contract 화면 진입 | 전체 | Contract 화면 연결 | 계약 API 미구현 |
| 템플릿으로 계약서 초안 생성 | 선택한 템플릿으로 계약 문서 초안 생성 | 전체 | 편집 가능한 문서 생성 | 템플릿/필드 매핑 누락 |
| 필요 서류 자동 준비 | 거래 유형에 맞는 체크리스트 생성 | 전체 | 준비 항목 생성 | 규칙 미정의 |
| PDF 저장 | 현재 계약 문서를 PDF로 저장 | 전체 | PDF 파일 생성/보관 | 렌더 실패 |
| 인쇄 | 계약 문서를 기본 프린터 또는 선택 프린터로 출력 | 전체 | 인쇄 작업 시작 | 프린터 없음/오류 |
| 파일 보관 | 생성 문서, 스캔본, 첨부 자료 업로드/저장 | 전체 | Deal 자료함에 저장 | 업로드 실패 |
| 종료 처리 | Deal을 `closed`로 이동 | 전체 | 종료 아카이브로 이동 | 종료 사유 미정 |
| 삭제 | 잘못 생성된 Deal 삭제 | owner/manager 중심 | 목록에서 제거 | Contract/participant 연결 존재 |

## 9. 생성 / 수정 폼 규칙

- 필수 입력값:
  - 생성 시 `listingId` 또는 `propertyId`
  - `settling` 단계 이상으로 올리기 전 연결 Contract
- 기본값:
  - 생성 시 stage는 `preparing`
  - Match에서 생성 시 관련 Listing과 buyer 문맥을 최대한 자동 채움
  - 가격은 Listing의 대표 가격을 초기값으로 제안 가능
- 자동 계산:
  - `commissionTotal = commissionSellerAmount + commissionBuyerAmount`
  - VAT는 office 정책이 있으면 자동 제안, 없으면 수동 입력 허용
  - 템플릿 선택 시 거래유형, 당사자, 금액, 주소, 날짜 필드를 자동 채운다
- 상호 의존 필드:
  - `isJointBrokerage=true`면 `partnerBrokerName`과 `partnerCommission` 입력이 필요하다
  - 수수료율과 수수료 금액은 상호 보정 가능해야 한다
  - DealParticipant의 rate/amount는 Deal 수수료 총액과 논리적으로 연결된다
- 저장 전 검증:
  - `contracted`: 연결 Contract 없이 진입 가능하며 이 단계에서 계약서를 작성
  - `settling` 이상: 연결 Contract가 반드시 필요
  - `preContract`는 선택 단계이며, 가계약이 없으면 `preparing`에서 `contracted`로 바로 이동 가능
- 저장 후 후속 액션:
  - board/list 재집계
  - ActivityLog 기록
  - 계약 단계 진입 시 Contract CTA 강조
  - 문서 초안 생성 시 Deal 자료함에 초안 버전이 추가될 수 있다

## 10. 상태값

이 페이지가 직접 다루는 상태:

- Deal.stage
  - `preparing`
  - `preContract` (선택)
  - `contracted`
  - `settling`
  - `completed`
  - `closed`
- Contract.status 요약 표시
  - `draft`
  - `signed`
  - `depositPaid`
  - `balancePaid`
  - `registered`
  - `cancelled`

상태 전이 규칙:

```text
preparing -> preContract(선택) -> contracted -> settling -> completed -> closed
```

보조 상태 전이:

```text
draft -> signed -> depositPaid -> balancePaid -> registered -> cancelled
```

상태별 UI 차이:

- `preparing`
  - 최종 조건, 당사자, 계약 일정과 필요 서류 확인
- `preContract`
  - 가계약을 진행한 거래만 가계약금과 본계약 일정 강조
- `contracted`
  - Contract 요약 패널과 `계약서 열기` CTA를 가장 강하게 노출
- `settling`
  - 중도금·잔금 일정과 인도·등기 준비 강조
- `completed`
  - 잔금 완료 후 수수료 수금과 참여자 배분 정산 강조
- `closed`
  - 기본 보드에서 제외
  - 아카이브 섹션에서만 노출

## 11. 예외 / 빈 상태 / 오류 상태

- 빈 상태:
  - 진행 거래가 없으면 보드에 안내 문구와 `새 거래 생성` CTA 노출
- 검색 결과 없음:
  - 현재 필터 조건에 맞는 거래가 없다고 명확히 표시
- 권한 없음:
  - 생성/삭제/민감 수정 액션 비활성화
- 연동 실패:
  - Contract/participant 정보를 불러오지 못하면 상세의 해당 섹션만 오류 상태 표시
  - PDF 생성/인쇄 실패 시 사용자가 실패 원인과 재시도 방법을 이해할 수 있어야 한다
- 삭제 불가 조건:
  - Contract가 연결된 Deal
  - DealParticipant 또는 일정이 이미 붙은 Deal
- 충돌 상태:
  - 다른 사용자가 먼저 stage나 금액을 수정한 경우 최신 상태 재조회 필요
- 의미 충돌:
  - 현재 `closed`가 완료 보관인지 취소 종료인지 구분되지 않으므로, 장기적으로 `closeReason`이 필요하다

## 12. 연결 엔터티와 화면

| 연결 대상 | 연결 방식 | 사용 목적 |
| --- | --- | --- |
| Match | `거래 전환` 또는 원본 링크 | 이 Deal이 어디서 시작됐는지 확인 |
| Property/Listing | Deal의 대상 매물 | 매물 상세와 호가/주소 확인 |
| Contact | buyer/seller 링크 | 당사자 정보 및 상담 이력 확인 |
| Contract | Deal 1:1 링크 | 계약서 상세와 대금 일정 관리 |
| DealParticipant | 상세 내 참여자 섹션 | 직원 배분과 정산 준비 |
| Task / CalendarEvent | 관련 일정/업무 | 후속 일정과 마감 관리 |
| ContractTemplate | 템플릿 선택 | 계약서 자동 초안 생성 |
| DealDocument | Deal 자료함 | PDF, 스캔본, 첨부 자료 보관 |
| DealDocumentRequirement | 준비 서류 체크리스트 | 거래별 필요 서류 관리 |

## 13. Desktop 전용 요구사항

- 다중 패널 필요 여부:
  - 필요
  - 보드 진입 화면과 상세 작업공간을 빠르게 왕복해야 한다
- 키보드 단축키:
  - `/` 검색 포커스
  - `Enter` 선택 Deal 상세 열기
  - `[` / `]` 또는 지정 단축키로 이전/다음 단계 이동 가능하면 좋다
- 실시간 업데이트:
  - stage 변경과 금액 수정은 다른 사용자 화면에도 빠르게 반영되어야 한다
- 알림 연동:
  - 계약일/대금일정 임박 알림 연동 필요
- 시스템 트레이/OS 이벤트 연동:
  - 필수 아님
- 로컬 기능 연동:
  - 첨부파일 열기
  - PDF 저장
  - OS 인쇄 대화상자 호출
  - 로컬 임시 저장/자동저장
- 멀티 선택 / 벌크 액션:
  - MVP 제외
- 창 크기 변화 대응:
  - 최소 1440px 이상에서 보드 4컬럼이 자연스럽게 보여야 한다
  - 좁은 폭에서는 리스트 뷰 또는 가로 스크롤 허용

## 14. 감사 추적 / 로그

- ActivityLog 기록 대상 액션:
  - Deal 생성
  - stage 변경
  - 가격 변경
  - 수수료 변경
  - 공동중개 필드 변경
  - DealParticipant 변경
  - Contract 생성/연결
- actor / source 규칙:
  - desktop 사용자는 `actor=user`, `source=web` 또는 desktop source 확장 필요
- 중요 감사 이벤트:
  - `contracted` 단계 진입
  - `completed` 처리
  - `closed` 처리
  - 수수료 총액 및 배분 변경
  - 계약서 초안 생성
  - PDF 저장
  - 인쇄 실행
  - 자료 업로드/삭제

## 15. 비기능 요구사항

- 초기 로딩 목표:
  - 진행 거래 100건 기준 2초 이내 체감 로딩
- 대량 데이터 처리 방식:
  - 초기에는 전체 조회 후 클라이언트 그룹화
  - 이후 stage/updatedAt 기반 서버 필터링과 pagination 도입
- 낙관적 업데이트 여부:
  - stage 변경만 제한적 낙관적 업데이트 가능
  - 금액/수수료/배분 수정은 서버 확정 후 반영이 안전하다
- 오프라인/재시도 전략:
  - 저장 실패 시 마지막 편집값 유지 및 재시도
  - 단계 변경 실패 시 직전 상태 복원
- 접근성/가독성 메모:
  - 금액, 수수료, 단계 badge는 멀리서도 구분 가능해야 한다
  - 공동중개 여부는 작은 badge가 아니라 즉시 인지 가능한 표시가 필요하다
  - 문서 상태와 준비 서류 상태도 배지/체크리스트로 빠르게 읽혀야 한다

## 16. MVP 포함 범위

- 보드 뷰
- 종료 거래 접이식 아카이브
- 검색
- 거래유형 필터
- 단계 변경
- Deal 상세 작업공간
- 당사자/가격/메모 수정
- 수수료 및 공동중개 정보 수정
- Contract 요약과 `계약서 열기/생성` CTA
- 참여자 배분 기본 조회/수정
- 계약 관련 문서 기능에 대한 설명과 진입 지점 정의

## 17. MVP 제외 범위

- 계약서 템플릿 자동화 작성
- Deal별 필요 서류 체크리스트 자동 생성
- PDF 저장
- 인쇄
- S3 기반 Deal 자료함 저장/버전 관리
- 전자계약 또는 서명 연동
- 계약서 파일 OCR/자동 파싱
- 세금계산서/정산 자동화
- 종료 사유 분석 대시보드
- 대량 편집
- 복수 Deal 일괄 stage 이동
- 문서 협업 편집
- 문서 버전 비교/복원 고급 기능

## 18. 열린 질문

- Deal이 어떤 Match에서 생성됐는지 추적하려면 `originMatchId` 같은 필드가 필요한가?
- `closed`를 완료 보관과 취소 종료로 나눌 것인가?
- Deal 상세를 `우측 패널`로 할지 `전용 route`로 할지 최종 선택이 필요한가?
- DealParticipant 배분은 Office.commissionConfig 자동 제안으로 시작할지, 전부 수동 입력으로 둘지?
- Contract 요약을 Deal API projection에 포함할지, 별도 query로 가져올지?
- 현재 Deal 목록 API에는 participant/contract가 없는데, 목록 성능과 상세 완결성 사이에서 어떤 projection 전략이 적절한가?
- 계약서 템플릿은 어떤 형식으로 관리할 것인가?
- 템플릿 변수 치환과 자유 편집을 같은 editor에서 처리할 것인가?
- PDF 생성은 서버 렌더링으로 할지 desktop 로컬 렌더링으로 할지?
- Deal 자료함의 파일 버전과 권한 규칙을 어떻게 둘 것인가?

## 19. 수용 기준

- 사용자는 이 페이지에서 `진행 거래의 현재 단계와 핵심 정보를 빠르게 파악`할 수 있어야 한다.
- 사용자는 최소 클릭으로 `거래 당사자, 가격, 수수료, 공동중개 정보`를 수정할 수 있어야 한다.
- 사용자는 Deal과 Contract의 차이를 이해한 채 `계약서 생성/열기` 흐름으로 이동할 수 있어야 한다.
- 사용자는 Deal에서 계약서 초안을 만들고, PDF 저장과 인쇄, 자료 보관까지 이어서 처리할 수 있어야 한다.
- 역할별 권한 차이가 UI와 API 모두에서 일치해야 한다.
- 예외 상황에서 사용자는 왜 저장이나 단계 변경이 실패했는지 이해할 수 있어야 한다.
- Match에서 넘어온 거래가 Deal 화면에서 끊기지 않고 이어져야 한다.
