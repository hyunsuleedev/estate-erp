# Contracts

## 메타

- 페이지명: Contracts
- 문서 상태: draft
- 우선순위: P0
- Phase: Phase 2
- 구현 상태: placeholder only
- 작성일: 2026-04-02
- 최종 수정일: 2026-04-02
- 관련 엔터티: Contract, Deal, Contact, Listing, Property, ActivityLog, ContractTemplate(future), ContractDocument(future), ContractDigitalRecord(future)
- 관련 API:
  - 현재 스키마 기준 필요
    - `GET /contracts`
    - `GET /contracts/:id`
    - `POST /contracts`
    - `PATCH /contracts/:id`
  - 후속 필요
    - `POST /contracts/:id/generate-from-template`
    - `POST /contracts/:id/export-pdf`
    - `POST /contracts/:id/print`
    - `GET /contracts/:id/documents`
    - `POST /contracts/:id/documents`
    - `PATCH /contracts/:id/documents/:documentId`
    - `DELETE /contracts/:id/documents/:documentId`
    - `GET /contracts/:id/digital-records`
    - `PATCH /contracts/:id/digital-records`
- 관련 화면: Deals, Contacts, Properties/Listings, Tasks, Calendar

현재 결정:

- 이 문서는 desktop의 `계약서 관리 페이지 + 계약별 문서 허브`를 기준으로 작성한다.
- Contracts 페이지는 `Deal에서 생성/저장된 문서와 디지털 데이터`를 `계약 단위`로 모아서 보여주는 화면이다.
- 즉 Deals가 `거래 실행과 진척 관리`라면, Contracts는 `계약별 자료와 계약 데이터 정리`에 더 가깝다.
- 이 페이지는 단순 파일 보관함이 아니라, 계약서 초안, PDF, 스캔본, 특약 입력값, 지급 일정, 체크리스트 같은 `계약 디지털 자산`을 함께 다뤄야 한다.
- 현재 Prisma의 `Contract.attachments: String[]`는 파일 URL 저장 수준이므로, 장기적으로는 계약 문서 메타데이터 구조가 별도 필요하다.
- 다만 실제 문서 자동화, PDF/인쇄, 파일 저장소 구현은 `Phase 2 보류 항목`으로 두고, 지금은 이 페이지의 역할과 사용자 관점 동선만 설명한다.
- 문서 저장소는 별도 `S3 기반 object storage`를 전제로 한다.

## 1. 페이지 목적

- 이 페이지가 해결해야 하는 핵심 업무:
  - 계약 단위로 문서와 디지털 데이터를 모아서 조회한다.
  - 계약서 초안 작성, PDF 저장, 인쇄, 스캔본 보관을 한 흐름으로 연결한다.
  - 계약금/중도금/잔금 일정과 계약 상태를 문서와 함께 관리한다.
- primary 사용자:
  - agent
- secondary 사용자:
  - manager, owner
- 이 페이지가 필요한 이유:
  - Deal 화면만으로는 계약별 문서와 데이터가 길게 누적되면 관리가 어려워진다.
  - 사용자는 `지금 어떤 계약에 어떤 문서가 준비됐는지`를 계약 기준으로 보고 싶어한다.
  - 계약은 파일만 있는 것이 아니라, 특약, 지급 일정, 당사자, 인쇄본, PDF 등 여러 디지털 자산의 묶음이다.

## 2. 사용 시점

- 사용자가 이 페이지에 들어오는 대표 상황:
  - Deal에서 Contract가 생성된 이후 계약 작업을 이어갈 때
  - 특정 계약의 준비 문서와 저장 자료를 한 번에 확인할 때
  - 계약서 PDF를 다시 열거나 인쇄할 때
  - 계약별 대금 일정과 특약을 검토할 때
- 진입 경로:
  - 사이드바 `계약서 관리`
  - Deal Detail의 `계약서 열기/생성`
  - Contact Detail의 연결 계약 목록
  - Calendar/Task의 계약 관련 일정에서 역진입
- 이전 화면:
  - Deals
  - Contacts
  - Calendar
  - Tasks
- 다음 화면:
  - Contract Detail Workspace
  - Deal Detail
  - Contact Detail
  - Property/Listing Detail
- 이 페이지를 나가는 대표 액션:
  - 계약 상세 열기
  - 계약서 초안 작성
  - PDF 저장
  - 인쇄
  - 문서 업로드/열기

## 3. 사용자 역할과 권한

| 역할 | 조회 | 생성 | 수정 | 삭제 | 승인/확정 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| owner | 전체 조회 | 가능 | 가능 | 가능 | 가능 | 계약 정책/보관 책임 |
| manager | 전체 조회 | 가능 | 가능 | 제한적 | 가능 | 팀 계약 현황 관리 |
| agent | 전체 조회 | 가능 | 가능 | 제한적 | 가능 | 현장 문서 실무 담당 |

권한 메모:

- Contract 조회는 office 전체 기준으로 허용한다.
- 문서 업로드/편집/PDF 저장/인쇄는 실무상 agent도 가능해야 한다.
- 계약 삭제는 owner/manager 중심이 안전하다.
- 이미 완료되거나 등록된 계약의 핵심 데이터 수정은 추가 확인 절차가 필요할 수 있다.

## 4. 핵심 시나리오

### 시나리오 A: Deal에서 Contract 생성

1. 사용자는 Deal 상세에서 `계약서 생성`을 실행한다.
2. 시스템은 Deal의 매물, 당사자, 금액 정보를 기본값으로 Contract를 만든다.
3. 사용자는 Contracts 페이지로 이동해 계약 상세를 이어서 작성한다.
4. 완료 조건:
   - Contract가 생성되고
   - 해당 계약이 Contracts 목록에 나타난다.

### 시나리오 B: 계약별 자료 목록 확인

1. 사용자는 Contracts 목록에서 특정 계약 row를 선택하거나 더블클릭한다.
2. 시스템은 해당 계약에 연결된 문서/PDF/스캔본/디지털 입력 데이터 목록을 보여준다.
3. 사용자는 어떤 자료가 준비되었고 무엇이 비어 있는지 바로 확인한다.
4. 완료 조건:
   - 계약별 자료 상태를 계약 단위로 파악할 수 있다.

### 시나리오 C: 계약서 작성, PDF 저장, 인쇄

1. 사용자는 계약 상세에서 템플릿을 선택해 계약서 초안을 생성한다.
2. 시스템은 계약 데이터를 템플릿에 매핑해 편집 가능한 문서를 만든다.
3. 사용자는 내용을 수정한 뒤 PDF로 저장하거나 인쇄한다.
4. 완료 조건:
   - 편집 가능한 원본과 PDF 결과물이 계약에 연결되어 저장된다.

### 시나리오 D: 계약 데이터와 일정 관리

1. 사용자는 계약금, 중도금, 잔금, 입주일, 특약을 입력하거나 수정한다.
2. 시스템은 Contract status와 지급 일정 요약을 업데이트한다.
3. 사용자는 일정 누락 없이 계약 진행 상태를 확인한다.
4. 완료 조건:
   - 계약 데이터와 실제 문서가 분리되지 않고 함께 관리된다.

## 5. 화면 구조

예시:

- 상단: 검색 / 상태 필터 / 새 계약
- 본문: 계약 목록
- 상세: 계약 데이터 + 문서 허브

실제 정의:

- 상단 영역:
  - 페이지 제목
  - 전체 계약 수
  - KPI tiles
    - 진행 계약 수
    - 서명 완료 수
    - 잔금 대기 수
    - 자료 누락 계약 수
- 필터/컨트롤 영역:
  - 검색창
  - Contract status filter
  - 거래유형 filter
  - 문서 준비 상태 filter
  - `목록`, `자료 중심` view toggle
- 본문 영역:
  - `목록 뷰`
    - 계약 리스트 표
  - `자료 중심 뷰`
    - 계약 카드 + 문서 수/누락 상태 강조
- 목록 row 기본 정보:
  - 계약 상태
  - 거래유형
  - 매물
  - 계약 당사자
  - 총 거래금액
  - 계약일
  - 자료 수
  - 최근 수정일
- 상세 영역:
  - row 더블클릭 시 Contract Detail Workspace를 연다.
  - desktop MVP에서는 정보량상 `전용 상세 route`가 적합하다.

`Contract Detail Workspace` 상세 레이아웃:

- 상단:
  - 계약 제목
  - Contract status badge
  - 거래유형 badge
  - `PDF 저장`, `인쇄`, `문서 업로드`, `Deal 열기` CTA
  - 최근 수정일
- 좌측 `2/3` 영역:
  - `계약 기본 정보`
    - 연결 Deal
    - 매물
    - 매수인/매도인
    - 총 거래금액
    - 월세일 경우 월세 금액
  - `계약 일정`
    - 계약일
    - 계약금 / 지급일 / 입금 여부
    - 중도금 / 지급일 / 입금 여부
    - 잔금 / 지급일 / 입금 여부
    - 입주일
    - 임대 시작/종료일
  - `특약 및 메모`
    - 특약사항
    - 내부 메모
  - `디지털 입력 데이터`
    - 템플릿 필드값
    - 체크리스트 상태
    - 계약 작성용 구조화 데이터
- 우측 `1/3` 영역:
  - `문서 목록`
    - 편집 가능한 원본 문서
    - PDF 버전
    - 업로드된 스캔본/첨부파일
    - 각 문서의 유형, 생성일, 버전, 작성자, 열기 액션
  - `준비 서류 상태`
    - 신분증
    - 등기 관련 서류
    - 위임장
    - 인감/증명서류
    - 거래유형별 추가 서류
  - `관련 이력`
    - ActivityLog
    - 최근 인쇄/PDF 저장 이력
  - 이 영역은 세로 스크롤 가능해야 한다.

리스트 컬럼 정의:

- `상태`
- `거래유형`
- `매물`
- `매수인`
- `매도인`
- `총 거래금액`
- `계약일`
- `문서 수`
- `자료 준비 상태`
- `최근 수정일`

## 6. 조회 데이터

| 항목 | 설명 | 필수 여부 | 출처 |
| --- | --- | --- | --- |
| contractList | 전체 Contract 목록 | 필수 | `GET /contracts` |
| selectedContract | 선택 Contract 상세 | 필수 | `GET /contracts/:id` |
| linkedDeal | 연결 Deal 요약 | 필수 | `deal` include |
| buyerSummary | 계약서상 매수인 | 필수 | `buyerContact` include |
| sellerSummary | 계약서상 매도인 | 필수 | `sellerContact` include |
| attachments | 현재 저장된 첨부파일 URL 목록 | 필수 | `Contract.attachments` |
| contractDocuments | 계약 문서 메타데이터 목록 | 중요 | 후속 document API 필요 |
| digitalRecords | 계약별 구조화 디지털 데이터 | 중요 | 후속 digital-record API 필요 |
| documentChecklist | 준비 서류 체크리스트 | 중요 | 후속 rule/template 기반 생성 필요 |
| statusMetrics | KPI summary | 필수 | `GET /contracts` 후 클라이언트 집계 |

조회 규칙:

- 초기 진입 시:
  - `GET /contracts`로 office 전체 계약을 조회한다.
- 상세 진입 시:
  - `GET /contracts/:id`와 문서/디지털 데이터 목록을 함께 가져와야 한다.
- 목록에서는:
  - 최소한 문서 수, 준비 상태, 계약 상태 요약이 바로 보여야 한다.
- 후속 개선:
  - 문서 수와 준비 상태를 목록 projection에 포함시키는 aggregate query가 필요하다.

## 7. 검색 / 필터 / 정렬

- 기본 검색 대상:
  - 매물명
  - 단지명
  - 주소
  - 매수인 이름/전화번호
  - 매도인 이름/전화번호
  - 특약/메모 키워드
  - 문서명
- 기본 정렬:
  - `updatedAt desc`
- 필터 항목:
  - Contract status
  - 거래유형
  - 계약일 범위
  - 자료 준비 상태
  - PDF 존재 여부
  - 인쇄 여부
- 저장 가능한 뷰:
  - MVP에서는 사용자 저장 뷰 없음
  - 기본 제공 뷰는 `목록`, `자료 중심`
- 역할별 기본 뷰 차이:
  - agent는 `목록`
  - manager/owner는 `목록`과 `자료 중심`을 모두 사용

## 8. 주요 액션

| 액션 | 설명 | 권한 | 성공 결과 | 실패/예외 |
| --- | --- | --- | --- | --- |
| Contract 생성 | Deal 기준으로 Contract 생성 | 전체 | Contract 생성 | Deal 정보 불충분 |
| 상세 열기 | row 더블클릭 또는 액션 버튼 | 전체 | 상세 작업공간 표시 | stale data |
| 계약 데이터 수정 | 일정, 금액, 특약, 메모 수정 | 전체 | 저장 반영 | validation 실패 |
| 템플릿 초안 생성 | 계약서 템플릿으로 편집 원본 생성 | 전체 | 문서 초안 생성 | 템플릿 누락 |
| PDF 저장 | 편집 상태를 PDF 파일로 저장 | 전체 | PDF 생성/보관 | 렌더 실패 |
| 인쇄 | 계약 문서를 출력 | 전체 | 인쇄 작업 시작 | 프린터 오류 |
| 파일 업로드 | 스캔본/첨부파일 업로드 | 전체 | 문서 목록에 추가 | 업로드 실패 |
| 문서 열기 | 저장된 문서/PDF/스캔본 열기 | 전체 | 미리보기 또는 OS 열기 | 파일 없음 |
| 문서 메타 수정 | 문서 유형, 이름, 태그, 메모 수정 | 전체 | 목록 반영 | 저장 실패 |
| 상태 변경 | Contract status 변경 | 전체 | 상태 반영 | 필수 단계 미충족 |

## 9. 생성 / 수정 폼 규칙

- 필수 입력값:
  - 생성 시 `dealId`
  - `transactionType`
  - `buyerContactId`
  - `sellerContactId`
  - `totalPrice`
- 기본값:
  - Deal에서 진입 시 Deal 값을 기본 채움
  - status 기본값은 `draft`
- 자동 계산:
  - 매매/전세는 `totalPrice` 중심
  - 월세는 `totalPrice(보증금) + monthlyRent` 구조
  - 템플릿 초안 생성 시 기본 필드 자동 매핑
- 상호 의존 필드:
  - 월세 계약이면 `monthlyRent` 필요
  - 전세/월세는 `leaseStartDate`, `leaseEndDate`가 중요
  - `contractDeposit`, `middlePayment`, `finalPayment` 합은 총액과 논리적으로 맞아야 한다
- 저장 전 검증:
  - 상태가 `signed` 이상이면 계약일 필요
  - `depositPaid` 이상이면 계약금 정보와 지급 여부 일치 필요
  - `balancePaid` 이상이면 잔금 정보와 지급 여부 일치 필요
- 저장 후 후속 액션:
  - 목록 재집계
  - ActivityLog 기록
  - 필요 시 Deal 요약 갱신

## 10. 상태값

이 페이지가 직접 다루는 상태:

- Contract.status
  - `draft`
  - `signed`
  - `depositPaid`
  - `balancePaid`
  - `registered`
  - `cancelled`

상태 전이 규칙:

```text
draft -> signed -> depositPaid -> balancePaid -> registered -> cancelled
```

상태별 UI 차이:

- `draft`
  - 계약 초안 작성 단계
  - 템플릿 생성과 문서 준비 CTA 강조
- `signed`
  - 실제 서명 완료
  - PDF/스캔본 업로드 중요
- `depositPaid`
  - 계약금 완료 상태
  - 다음 지급 일정 강조
- `balancePaid`
  - 잔금 완료 상태
  - 등록/완료 후속 절차 강조
- `registered`
  - 법적 절차까지 마무리된 상태
  - 편집보다 조회 중심
- `cancelled`
  - 취소된 계약
  - 기본 목록에서는 구분 표시 강하게 필요

## 11. 예외 / 빈 상태 / 오류 상태

- 빈 상태:
  - 계약이 없으면 `Deal에서 계약 생성` CTA를 보여준다.
- 검색 결과 없음:
  - 필터에 맞는 계약이 없다고 표시
- 권한 없음:
  - 편집/삭제/문서 수정 액션 비활성화
- 연동 실패:
  - 문서 목록 또는 PDF 생성 실패는 계약 데이터와 분리해서 오류 표시
- 삭제 불가 조건:
  - 지급 일정 기록, 업로드 문서, 완료 상태가 있는 계약
- 충돌 상태:
  - 다른 사용자가 문서나 계약 데이터를 먼저 수정한 경우 재조회 필요
- 구조 한계:
  - 현재 `attachments: string[]`만으로는 문서 유형, 버전, 생성 원본 여부를 표현할 수 없다

## 12. 연결 엔터티와 화면

| 연결 대상 | 연결 방식 | 사용 목적 |
| --- | --- | --- |
| Deal | Contract 1:1 링크 | 거래 맥락과 금액/당사자 기준 확인 |
| Contact | buyer/seller 링크 | 계약 당사자 상세 확인 |
| Property/Listing | 연결 Deal 경유 | 계약 대상 매물 확인 |
| ContractTemplate | 템플릿 선택 | 자동 초안 생성 |
| ContractDocument | 문서 목록 | PDF, 원본 문서, 스캔본 관리 |
| ContractDigitalRecord | 구조화 데이터 | 템플릿 필드값, 체크리스트, 작성 데이터 관리 |
| Task / CalendarEvent | 일정/마감 | 지급일, 계약일 후속 관리 |

## 13. Desktop 전용 요구사항

- 다중 패널 필요 여부:
  - 필요
  - 계약 데이터와 문서 목록을 동시에 봐야 한다
- 키보드 단축키:
  - `/` 검색 포커스
  - `Ctrl/Cmd + S` 저장
  - `Ctrl/Cmd + P` 인쇄
  - `Ctrl/Cmd + Shift + E` PDF 내보내기 같은 단축키 검토 가능
- 실시간 업데이트:
  - 계약 상태와 문서 목록 변경은 팀 화면에 빠르게 반영되어야 한다
- 알림 연동:
  - 계약일, 지급일, 만기일 알림 필요
- 시스템 트레이/OS 이벤트 연동:
  - 필수 아님
- 로컬 기능 연동:
  - PDF 저장
  - 인쇄 대화상자
  - 파일 열기
  - 파일 드래그앤드롭 업로드
- 멀티 선택 / 벌크 액션:
  - MVP 제외
- 창 크기 변화 대응:
  - 넓은 화면에서는 좌우 2/3 + 1/3 고정
  - 좁은 화면에서는 문서 패널을 탭 또는 접이식으로 전환

## 14. 감사 추적 / 로그

- ActivityLog 기록 대상 액션:
  - Contract 생성
  - 상태 변경
  - 금액/일정 변경
  - 특약 수정
  - 문서 초안 생성
  - PDF 저장
  - 인쇄 실행
  - 파일 업로드/삭제
- actor / source 규칙:
  - desktop 사용자는 `actor=user`, `source=web` 또는 desktop source 확장 필요
- 중요 감사 이벤트:
  - `signed`
  - `depositPaid`
  - `balancePaid`
  - `registered`
  - 문서 최종본 저장

## 15. 비기능 요구사항

- 초기 로딩 목표:
  - 계약 100건 기준 2초 이내 체감 로딩
- 대량 데이터 처리 방식:
  - 목록은 projection 중심
  - 상세에서 문서 메타데이터와 디지털 데이터 추가 로드
- 낙관적 업데이트 여부:
  - 상태 배지 정도만 제한적 가능
  - 문서 저장/PDF/인쇄는 서버 또는 로컬 작업 완료 후 반영이 안전하다
- 오프라인/재시도 전략:
  - 업로드/PDF 실패 시 재시도 가능해야 한다
  - 편집 중 임시 저장이 있으면 좋다
- 접근성/가독성 메모:
  - 상태, 자료 준비 정도, PDF 존재 여부를 멀리서도 읽을 수 있어야 한다
  - 문서 유형 아이콘/배지가 필요하다

## 16. MVP 포함 범위

- 계약 목록
- Contract Detail Workspace
- Deal에서 Contract 생성
- 계약 상태 관리
- 계약 일정 입력/수정
- 특약/메모 입력
- 계약별 저장 문서/디지털 데이터 리스트에 대한 설명
- 계약별 문서 허브로서의 정보 구조 정의

## 17. MVP 제외 범위

- 템플릿 기반 초안 생성 구현
- PDF 저장 구현
- 인쇄 구현
- 계약별 파일 업로드/열기 구현
- 계약별 준비 서류 자동 체크리스트 구현
- S3 기반 문서 저장/버전 관리 구현
- 전자서명 연동
- 외부 기관 제출 자동화
- OCR 자동 추출
- 문서 협업 동시편집
- 고급 버전 diff/merge
- 대량 인쇄

## 18. 열린 질문

- `Contract.attachments`를 유지한 채 메타데이터 테이블을 추가할지, 문서 구조를 별도 엔터티로 완전히 분리할지?
- 계약별 디지털 데이터는 `JSONB snapshot`으로 둘지, 세부 테이블로 쪼갤지?
- 템플릿 원본, 편집 원본, PDF 결과물을 각각 어떤 문서 유형으로 구분할지?
- 인쇄 이력을 별도 엔터티로 둘 필요가 있는가?
- Deal 자료함과 Contract 자료함을 분리할지, Deal에서 생성된 자료를 Contract에서 상속 조회할지?

## 19. 수용 기준

- 사용자는 이 페이지에서 `계약별 저장 문서와 디지털 데이터`를 리스트와 상세 화면에서 확인할 수 있어야 한다.
- 사용자는 특정 계약을 열어 `계약 데이터, 문서 목록, 준비 서류 상태`를 한 번에 볼 수 있어야 한다.
- 사용자는 계약서 초안 생성 후 `PDF 저장`, `인쇄`, `파일 보관`까지 이어서 처리할 수 있어야 한다.
- Deal과 Contract의 관계가 UI에서 명확해야 한다.
- 예외 상황에서 사용자는 왜 PDF 생성, 업로드, 저장이 실패했는지 이해할 수 있어야 한다.
