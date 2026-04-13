# Contacts

## 메타

- 페이지명: Contacts
- 문서 상태: draft
- 우선순위: P0
- Phase: Phase 2
- 구현 상태: partial prototype exists
- 작성일: 2026-04-02
- 최종 수정일: 2026-04-02
- 관련 엔터티: Contact, ContactRelation, PropertyContact, BuyerRequirement, Consultation, Task, ActivityLog
- 관련 API:
  - `GET /contacts`
  - `GET /contacts/search-by-phone`
  - `GET /contacts/:id`
  - `POST /contacts`
  - `PATCH /contacts/:id`
  - `DELETE /contacts/:id`
  - `GET /contacts/:id/property-contacts`
  - `GET /contacts/:id/buyer-requirements`
  - `GET /contacts/:id/consultations`
  - `GET /contact-relations?contactId=`
  - `POST /contact-relations`
  - `POST /contact-relations/with-contact`
  - `GET /property-contacts?contactId=`
- 관련 화면: Contact Detail, New Contact, Call Workspace, Buyer Requirements, Properties, Consultations, Tasks

현재 결정:

- 이 문서는 desktop의 `연락처 목록 페이지`를 기준으로 작성한다.
- `Contact Detail`과 `New Contact`는 별도 하위 화면이지만, 이 페이지의 핵심 진입/후속 흐름에 포함해 함께 정의한다.

## 1. 페이지 목적

- 이 페이지가 해결해야 하는 핵심 업무:
  - 사무소가 다루는 `모든 사람`을 한곳에서 찾고, 분류하고, 적절한 업무 화면으로 연결한다.
- primary 사용자:
  - agent
- secondary 사용자:
  - manager, owner
- 이 페이지가 필요한 이유:
  - Contact는 매수고객, 소유자, 세입자, 거래처, 가족/전문가 관계를 묶는 기준 엔터티다.
  - 중개 업무는 `사람` 중심으로 시작되는 경우가 많아서, 연락처는 단순 주소록이 아니라 CRM의 허브 역할을 해야 한다.
  - desktop에서는 대량 검색, 그룹 분류, 빠른 상세 진입, 중복 방지가 웹보다 중요하다.

## 2. 사용 시점

- 사용자가 이 페이지에 들어오는 대표 상황:
  - 이름/전화번호만 알고 고객을 찾을 때
  - 신규 문의자를 등록할 때
  - 소유자/매수고객/거래처를 그룹 단위로 훑을 때
  - 특정 연락처의 연결 매물, 매수요건, 상담 이력을 보러 갈 때
  - Call Workspace나 Buyer Requirements에서 사람 기준 허브로 되돌아올 때
- 진입 경로:
  - 사이드바 `연락처`
  - Call Workspace의 `연락처 상세`
  - BuyerRequirement/Property/Task에서 연락처 링크 클릭
  - 전역 검색 결과
- 이전 화면:
  - Dashboard
  - Call Workspace
  - Buyer Requirements
  - Properties
  - Tasks
- 다음 화면:
  - Contact Detail
  - New Contact
  - Buyer Requirements
  - Properties
  - Consultations
  - Call Workspace
- 이 페이지를 나가는 대표 액션:
  - 연락처 상세 열기
  - 신규 연락처 생성
  - 기존 연락처를 통해 매수요건/상담/매물 화면으로 이동

## 3. 사용자 역할과 권한

| 역할 | 조회 | 생성 | 수정 | 삭제 | 승인/확정 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| owner | 전체 조회 | 가능 | 가능 | 가능 | 가능 | 중복 병합/삭제 정책 최종 책임 |
| manager | 전체 조회 | 가능 | 가능 | 제한적 | 가능 | 운영 중복 정리, 그룹 기준 관리 |
| agent | 전체 조회 | 가능 | 가능 | 제한적 | 없음 | 신규 등록과 기본 정보 수정 중심 |

권한 메모:

- Contact 자체 조회는 모든 로그인 사용자에게 허용한다.
- 생성과 수정은 모든 역할이 가능하지만, 삭제는 owner/manager 중심으로 제한하는 것이 안전하다.
- agent 삭제는 `연결된 PropertyContact, BuyerRequirement, Consultation, Task가 없는 경우`로 제한하는 것이 권장된다.
- 현재 서버 구현에는 역할별 분기가 약하므로, 이 문서는 목표 권한 정책을 정의한다.

## 4. 핵심 시나리오

### 시나리오 A: 이름/전화번호로 기존 연락처 찾기

1. 사용자는 연락처 페이지에서 이름 또는 전화번호를 검색한다.
2. 시스템은 `name`, `phone`, `phone2`, `email` 기준으로 결과를 보여주고, 그룹 사이드바와 필터를 함께 유지한다.
3. 사용자는 목록에서 적절한 연락처를 선택하고 상세 화면으로 들어간다.
4. 완료 조건:
   - 사용자가 원하는 사람을 빠르게 식별하고
   - 매수요건, 상담, 매물 연결 화면으로 이어질 수 있다.

### 시나리오 B: 신규 연락처 등록 전 중복 확인

1. 사용자는 `연락처 추가` 화면으로 이동해 이름과 전화번호를 입력한다.
2. 시스템은 전화번호 7자리 이상 입력 시 기존 Contact 후보를 즉시 조회한다.
3. 사용자는 기존 연락처를 재사용하거나, 신규 등록이 필요한 경우에만 생성한다.
4. 완료 조건:
   - 중복 등록 가능성이 낮아지고
   - 새로운 Contact가 적절한 그룹/태그와 함께 생성된다.

### 시나리오 C: 사람 기준으로 업무 맥락 확인

1. 사용자는 연락처 목록의 행을 더블클릭해 Contact Detail을 연다.
2. 시스템은 상세 화면에서 좌측 2/3에 `연결된 연락처(관계)`, `소유물건`, `구매요구조건`을 보여주고, 우측 1/3에는 `상담내역`을 세로 스크롤 가능한 영역으로 표시한다.
3. 사용자는 필요한 후속 화면으로 이동하거나 정보를 수정한다.
4. 완료 조건:
   - 사용자가 특정 인물의 CRM 맥락을 한 번에 파악할 수 있다.

## 5. 화면 구조

예시:

- 좌측: 그룹 탐색
- 중앙: 목록/검색/필터
- 우측: 상세 또는 하위 페이지 진입

실제 정의:

- 상단 영역:
  - 페이지 제목, 총 연락처 수, 현재 선택된 그룹 뱃지
- 좌측 영역:
  - 고정 연락처 그룹 사이드바
  - `전체 연락처` + 사전 정의된 그룹
  - 그룹별 개수 표시
- 중앙 영역:
  - ViewBar
  - 검색창
  - 필터 칩
  - 정렬
  - `연락처 추가` CTA
  - 결과 DataTable
- 목록 컬럼 정의:
  - `그룹`
    - 고정 그룹 태그를 우선 노출한다.
    - 여러 그룹이 있으면 대표 그룹 1개 + 추가 개수로 축약할 수 있다.
  - `이름`
    - Contact.name
    - 클릭 시 Contact Detail로 이동한다.
  - `전화번호`
    - Contact.phone을 기본 노출한다.
    - Contact.phone2가 있으면 보조 전화는 함께 축약 노출하거나 hover에서 보인다.
  - `소유물건`
    - `PropertyContact.role in (owner, co_owner)` 기준으로 요약한다.
    - 대표 물건명 1~2개와 총 개수를 보여준다.
    - 소유물건이 없으면 `-`로 표시한다.
  - `연결된 구매요청`
    - 활성 BuyerRequirement 존재 여부를 보여준다.
    - 가능하면 `없음 / 1건 / n건` 형태로 노출한다.
  - `마지막 상담내역`
    - 가장 최근 Consultation.content를 1줄 요약으로 보여준다.
    - 상담이 없으면 `-`를 표시한다.
  - `마지막 상담일`
    - 가장 최근 Consultation.createdAt을 노출한다.
    - 상담이 없으면 `-`를 표시한다.
- 우측 영역:
  - 기본 목록 페이지에서는 별도 고정 패널 없음
  - 행 단일 클릭은 선택만 수행한다.
  - 행 더블클릭 시 `Contact Detail` 전체 화면으로 이동한다.
- 하단 영역:
  - DataTable pagination

`Contact Detail` 상세 레이아웃:

- 좌측 `2/3` 영역:
  - 상단: 기본 프로필, 연락처 정보, 그룹/태그, 메모
  - 중단: `연결된 연락처(관계)`
  - 중단 하단: `소유물건`
  - 하단: `구매요구조건`
- 우측 `1/3` 영역:
  - `상담내역` 전용 패널
  - 최신 상담이 위로 오도록 정렬
  - 각 상담은 여러 줄 내용을 그대로 읽을 수 있어야 한다.
  - 패널 자체는 독립 스크롤이 가능해야 한다.
  - 긴 상담 내용은 1줄 truncate가 아니라 `여러 줄 + 스크롤`이 기본이다.

## 6. 조회 데이터

| 항목 | 설명 | 필수 여부 | 출처 |
| --- | --- | --- | --- |
| contactList | 현재 조건의 연락처 목록 | 필수 | `GET /contacts` |
| listGroupSummary | 목록에서 보여줄 대표 그룹/태그 요약 | 필수 | `GET /contacts`의 `tags[]` 가공 |
| listOwnedPropertySummary | 목록에서 보여줄 소유물건 요약 | 필수 | 신규 목록 projection 필요 |
| listBuyerRequirementSummary | 목록에서 보여줄 연결 구매요청 여부/개수 | 필수 | `_count` 또는 전용 summary field |
| listLastConsultationContent | 목록에서 보여줄 마지막 상담내역 | 필수 | 신규 목록 projection 필요 |
| listLastConsultationDate | 목록에서 보여줄 마지막 상담 일시 | 필수 | 신규 목록 projection 필요 |
| totalCount | 전체 연락처 수 | 필수 | `GET /contacts?page=1&limit=1` |
| groupCounts | 그룹별 연락처 수 | 필수 | 그룹 태그별 `GET /contacts` |
| contactCounts | 각 Contact의 연결 요약 | 필수 | `GET /contacts` include `_count` |
| duplicateCandidates | 신규 등록 시 중복 가능 연락처 | 조건부 | `GET /contacts/search-by-phone` |
| contactDetail | 선택 연락처의 전체 정보 | 조건부 | `GET /contacts/:id` |
| propertyContacts | 연락처 기준 연결 매물 | 조건부 | `GET /contacts/:id/property-contacts` |
| buyerRequirements | 연락처 기준 구매요건 | 조건부 | `GET /contacts/:id/buyer-requirements` |
| consultations | 연락처 기준 최근 상담 | 조건부 | `GET /contacts/:id/consultations` |
| relations | 연락처 기준 관계 정보 | 조건부 | `GET /contact-relations?contactId=` 또는 `GET /contacts/:id` include |

조회 규칙:

- 초기 진입 시:
  - 기본 정렬은 `updatedAt desc`
  - 첫 페이지 20건을 조회한다.
  - 목록에는 최소 `그룹, 이름, 전화번호, 소유물건, 연결된 구매요청, 마지막 상담내역, 마지막 상담일`이 보여야 한다.
- 그룹 선택 시:
  - 선택된 그룹 태그를 검색 조건과 결합해 재조회한다.
- 검색 변경 시:
  - 입력 debounce 후 목록을 재조회한다.
- 상세 진입 시:
  - Contact 1건을 중심으로 매물/매수요건/상담/관계를 병렬 조회한다.
  - 상담내역 패널은 우측 1/3 고정 영역에 렌더링한다.
  - 상담내역은 1건 요약이 아니라 다건 리스트를 스크롤 가능한 형태로 보여준다.

## 7. 검색 / 필터 / 정렬

- 기본 검색 대상:
  - 이름
  - 전화번호
  - 보조 전화번호
  - 이메일
- 기본 정렬:
  - `최근 수정순`
- 필터 항목:
  - `매물 연결 있음`
  - `매수요건 있음`
  - `최근 상담 있음`
  - `추가 태그`
  - 그룹 태그
- 저장 가능한 뷰:
  - MVP에서는 저장 뷰를 제공하지 않는다.
  - 후속으로 `내 신규 문의`, `소유자`, `거래처`, `매수요건 미연결` 같은 프리셋 뷰를 검토한다.
- 역할별 기본 뷰 차이:
  - 역할별 기본 차이는 두지 않는다.
  - 다만 owner/manager는 향후 팀별 담당 필터를 추가할 수 있다.

## 8. 주요 액션

| 액션 | 설명 | 권한 | 성공 결과 | 실패/예외 |
| --- | --- | --- | --- | --- |
| 연락처 검색 | 이름/전화/이메일로 검색 | 전체 | 결과 목록 갱신 | 검색 결과 없음 |
| 그룹 선택 | 고정 그룹으로 목록 축소 | 전체 | 그룹별 목록 전환 | 선택 그룹 0건 |
| 상세 열기 | 행 더블클릭 또는 `Enter`로 상세 화면 이동 | 전체 | Contact Detail 진입 | 삭제된 연락처 stale row |
| 신규 연락처 생성 | 기본 정보와 태그를 입력해 생성 | 전체 | Contact 생성 후 상세 이동 | 필수값 누락, 중복 경고 |
| 연락처 수정 | 상세 화면에서 이름/연락처/태그/메모 수정 | 전체 | Contact 업데이트 | 동시 수정 충돌 |
| 연락처 삭제 | Contact를 제거 | owner, manager, 제한적 agent | 목록에서 제거 | 연결 엔터티 존재, 권한 없음 |
| 그룹/태그 관리 | 고정 그룹 태그/추가 태그 편집 | 전체 | 목록/상세 반영 | 잘못된 태그 입력 |
| 연결 맥락 열기 | 매물/매수요건/상담 탭에서 관련 화면으로 이동 | 전체 | 해당 화면으로 전환 | 연결 대상이 삭제됨 |
| 중복 후보 확인 | 신규 등록 전 전화번호 기준 후보 확인 | 전체 | 기존 연락처 재사용 가능 | 7자리 미만으로 조회 불가 |

## 9. 생성 / 수정 폼 규칙

- 필수 입력값:
  - `name`
- 기본값:
  - tags 없음
  - memo 없음
- 자동 계산:
  - 그룹 태그와 추가 태그는 하나의 `tags[]`로 합쳐 저장한다.
  - 신규 등록 시 성공 후 자동으로 상세 페이지로 이동한다.
- 상호 의존 필드:
  - 전화번호가 입력되면 중복 확인 패널이 활성화된다.
  - 그룹 태그를 선택하면 목록 사이드바와 상세 뱃지에 같은 분류가 반영된다.
- 저장 전 검증:
  - 이름은 공백만으로 저장할 수 없다.
  - 이메일은 형식 오류 시 경고한다.
  - 전화번호는 가능한 한 숫자 정규화 기준으로 중복 비교해야 한다.
  - 중복 후보가 있어도 신규 생성은 가능하지만, 사용자가 명시적으로 확인해야 한다.
- 저장 후 후속 액션:
  - 상세로 이동
  - 필요 시 `매수요건 추가`, `상담 기록`, `전화 상담`, `매물 연결` CTA 노출

## 10. 상태값

이 페이지가 직접 다루는 상태:

- 이 페이지는 Contact 자체의 단일 상태 필드를 가지지 않는다.
- 대신 아래 파생 상태를 다룬다.
  - `groupSelectionState`
    - `all`
    - `fixed_group`
  - `duplicateCheckStatus`
    - `idle`
    - `checking`
    - `matched`
    - `clear`
  - `connectionState`
    - `basic_only`
    - `property_linked`
    - `buyer_linked`
    - `multi_context`

상태 전이 규칙:

```text
idle -> checking -> matched
idle -> checking -> clear
basic_only -> property_linked
basic_only -> buyer_linked
property_linked -> multi_context
buyer_linked -> multi_context
```

상태별 UI 차이:

- `duplicateCheckStatus=checking`:
  - 신규 등록 우측 패널에 skeleton 표시
- `matched`:
  - 기존 연락처 경고 카드와 상세 이동 링크 표시
- `clear`:
  - 신규 등록 진행 가능 상태 표시
- `basic_only`:
  - 연결 현황 열에서 카운트가 0으로 노출
- `multi_context`:
  - 매물/매수요건/상담 카운트가 함께 표시되고 상세 진입 가치가 높아진다.

## 11. 예외 / 빈 상태 / 오류 상태

- 빈 상태:
  - 연락처가 하나도 없으면 `연락처 추가` CTA를 중심으로 보여준다.
- 검색 결과 없음:
  - 현재 검색/필터 조건에 맞는 연락처가 없다고 명확히 표시한다.
- 권한 없음:
  - 삭제 또는 고위험 수정 액션은 비활성화하고 이유를 툴팁/배너로 안내한다.
- 연동 실패:
  - 목록 조회 실패 시 재시도 버튼을 제공한다.
- 삭제 불가 조건:
  - PropertyContact, BuyerRequirement, Consultation, Task 중 하나라도 연결되어 있으면 기본적으로 삭제를 막고 archive 또는 merge를 유도한다.
- 충돌 상태:
  - 동일 번호의 기존 연락처가 있는데 신규 등록을 시도하면 경고를 보여준다.
  - 이미 열린 상세 화면의 대상이 삭제되면 `연락처를 찾을 수 없습니다` 상태로 전환한다.

## 12. 연결 엔터티와 화면

| 연결 대상 | 연결 방식 | 사용 목적 |
| --- | --- | --- |
| Contact Detail | 행 클릭, 생성 후 이동 | 사람 기준 360도 맥락 확인 |
| New Contact | 상단 CTA | 신규 문의/고객 등록 |
| Buyer Requirements | 상세 탭 및 딥링크 | 매수고객 조건 확인 |
| Properties | 상세 탭 및 딥링크 | 소유자/대리인의 연결 매물 확인 |
| Consultations | 상세 탭 | 최근 상담 맥락 확인 |
| ContactRelation | 상세 탭 | 가족/전문가/공동 명의 관계 확인 |
| Call Workspace | 상세/행 액션 | 전화 상담 시작 |
| Tasks | 후속 화면 | 사람 기준 후속 업무 생성/조회 |

## 13. Desktop 전용 요구사항

- 다중 패널 필요 여부:
  - 필요. 목록 화면은 `좌측 그룹 탐색 + 중앙 목록` 2패널이 기본이다.
  - 상세 화면은 `좌측 2/3 정보 영역 + 우측 1/3 상담내역 패널` 2컬럼 구조가 기본이다.
- 키보드 단축키:
  - `Cmd/Ctrl+F`: 검색 포커스
  - `Cmd/Ctrl+N`: 신규 연락처
  - `Enter`: 선택 행 상세 열기
  - `↑ / ↓`: 목록 행 이동
- 실시간 업데이트:
  - 다른 사용자가 Contact를 생성/수정하면 목록이 부드럽게 갱신돼야 한다.
- 알림 연동:
  - 이 페이지 자체의 실시간 알림은 핵심이 아니지만, Call Workspace/Task에서 사람 링크로 되돌아올 수 있어야 한다.
- 시스템 트레이/OS 이벤트 연동:
  - 직접 연동은 없음
- 로컬 기능 연동:
  - 전화번호 복사, 외부 전화 앱/CTI 호출은 후순위 후보
- 멀티 선택 / 벌크 액션:
  - MVP에서는 제공하지 않는다.
  - 후속으로 태그 일괄 수정, export, merge 후보 검토
- 창 크기 변화 대응:
  - 좁은 폭에서는 그룹 사이드바를 접을 수 있어야 한다.
  - DataTable 컬럼은 핵심 정보 우선으로 축약해야 한다.

## 14. 감사 추적 / 로그

- ActivityLog 기록 대상 액션:
  - Contact 생성
  - Contact 수정
  - Contact 삭제
  - ContactRelation 생성/삭제
  - PropertyContact 생성/수정/삭제
- actor / source 규칙:
  - desktop UI 작업은 `actor=user`
  - source는 현재 `web`로 기록되더라도, 향후 desktop 구분이 필요하면 별도 확장 검토
- 중요 감사 이벤트:
  - 전화번호 변경
  - 그룹/태그 변경
  - 삭제 시도 및 차단
  - 동일 번호 신규 등록

## 15. 비기능 요구사항

- 초기 로딩 목표:
  - 첫 목록은 1초 이내 표시
  - 검색 반응은 debounce 포함 300~700ms 내 체감 응답
- 대량 데이터 처리 방식:
  - 페이지네이션 기본 20건
  - 그룹 카운트는 별도 조회 캐시 허용
- 낙관적 업데이트 여부:
  - 태그/메모 수정은 낙관적 반영 가능
  - 신규 생성과 삭제는 서버 성공 후 반영
- 오프라인/재시도 전략:
  - 생성/수정 실패 시 입력 폼 상태는 유지해야 한다.
  - 검색 실패 시 기존 결과를 즉시 비우지 않고 오류 상태를 덧씌우는 편이 낫다.
- 접근성/가독성 메모:
  - 전화번호와 이름은 목록에서 빠르게 스캔 가능해야 한다.
  - 그룹 배지와 추가 태그는 시각적으로 구분돼야 한다.

## 16. MVP 포함 범위

- 그룹 사이드바 기반 연락처 목록
- 이름/전화/이메일 검색
- 고정 그룹 + 추가 태그 필터
- 매물 연결/매수요건 있음 필터
- 신규 연락처 생성
- 전화번호 중복 후보 확인
- Contact Detail에서 기본 정보/연결 매물/매수요건/상담/관계 탭 조회
- 기본 수정과 제한적 삭제 정책

## 17. MVP 제외 범위

- 연락처 병합(Merge)
- CSV 일괄 import/export
- 벌크 태그 수정
- 담당자별 분배/ownership 모델
- Contact 전용 활동 타임라인 통합 뷰
- 연락처 archive 상태 필드
- 명함 OCR, 카카오/문자 자동 수집

## 18. 열린 질문

- `소유자`, `매수/투자` 같은 그룹은 수동 태그로 둘지, PropertyContact/BuyerRequirement에서 일부 자동 파생할지 결정이 필요하다.
- 현재 `GET /contacts` 응답에는 `소유물건 요약`, `마지막 상담내역`, `마지막 상담일`이 없다. 연락처 목록 전용 projection API를 추가할지, 기존 응답을 확장할지 결정이 필요하다.
- 삭제보다 `archive`가 맞는가? 현재 스키마에는 archive 상태가 없다.
- 같은 전화번호를 여러 Contact가 공유하는 상황을 허용할 것인가?
- desktop에서는 상세를 전체 페이지로 열지, 우측 패널 미리보기로 바꿀지 결정이 필요하다.
- 중복 병합 기능이 없으면 운영 단계에서 데이터 정합성이 얼마나 빨리 무너지는가?

## 19. 수용 기준

- 사용자는 이 페이지에서 `이름 또는 전화번호만으로 원하는 연락처를 빠르게 찾고 상세 화면으로 들어갈` 수 있어야 한다.
- 사용자는 최소 클릭/입력으로 `새 연락처를 등록하면서 기존 번호 중복 여부를 확인`할 수 있어야 한다.
- 사용자는 한 연락처를 기준으로 `연결 매물, 매수요건, 상담 이력, 관계 정보`를 확인할 수 있어야 한다.
- 연락처 목록의 행은 `더블클릭`으로 상세 화면이 열려야 한다.
- 상세 화면에서는 `연결된 연락처(관계), 소유물건, 구매요구조건`이 주 정보 영역에 보이고, `상담내역`은 우측 1/3 영역에서 스크롤 가능한 여러 줄 리스트로 보여야 한다.
- 그룹 사이드바와 목록 필터는 충돌 없이 함께 동작해야 한다.
- 연락처 목록에는 최소 `그룹, 이름, 전화번호, 소유물건, 연결된 구매요청 여부, 마지막 상담내역, 마지막 상담일`이 보여야 한다.
- `마지막 상담내역`과 `마지막 상담일`은 가장 최근 Consultation 기준으로 계산되어야 한다.
- 삭제가 허용되지 않는 연락처는 왜 삭제할 수 없는지 이해할 수 있어야 한다.
- 역할별 권한 차이가 UI와 API 모두에서 일치해야 한다.
