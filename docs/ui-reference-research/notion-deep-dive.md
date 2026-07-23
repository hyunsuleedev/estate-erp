# Notion UI 심층 분석 — Estate ERP 선택 적용 가이드

> 조사일: 2026-07-17  
> 대상: 40–60대 한국 공인중개사, Electron/Web 1440×900 데스크톱 우선  
> 범위: 앱 셸, 사이드바·검색, 데이터베이스 뷰, 속성·레이아웃, relation·rollup, 상세 페이지, 댓글·활동, 폼, 차트·대시보드, 자동화, 템플릿, 권한, AI  
> 출처: Notion 공식 제품·Help Center와 공식 원본 이미지. 로그인 뒤 화면은 추정하지 않았다.  
> 자산 출처표: [Notion 이미지 provenance](../ui-reference-assets/notion-deep-dive/SOURCES.md)

## 1. 결론부터

Notion은 Estate ERP의 **전체 제품 구조**가 아니라 다음 세 층의 좋은 참고 대상이다.

1. 같은 데이터를 table·board·calendar·timeline·gallery·map으로 바꾸는 **view 문법**
2. 목록 문맥을 유지한 `side peek`와 고정 속성·본문·details panel을 나누는 **상세 레이아웃 문법**
3. 큰 장식 없이 콘텐츠를 앞세우는 **차분한 표면과 협업 문법**

반대로 앱 셸부터 데이터 모델까지 Notion을 그대로 기준으로 삼으면 Estate ERP의 핵심이 약해진다. Notion은 “데이터베이스 행도 페이지이고, 페이지 안은 자유 블록”이라는 정신모델이다. Estate ERP는 `Site → Dong → Unit → Property`, `Contact ↔ BuyerRequirement ↔ Match → Deal → Contract`, 입금·수수료·정산처럼 사용자가 임의로 재구성하면 안 되는 도메인 모델이 중심이다.

따라서 최종 판단은 아래와 같다.

| 층 | Notion 적용 수준 | Estate ERP 원칙 |
|---|---:|---|
| 색·표면·타이포 | 높음 | warm neutral과 낮은 장식성은 유지하되 대비와 글자 크기는 높인다. |
| view tab·filter·sort | 높음 | 같은 레코드 집합을 여러 작업 관점으로 전환한다. |
| quick detail / side peek | 높음 | 읽기·간단 수정은 sheet, 복잡한 편집은 URL 전체 화면으로 승격한다. |
| relation 표시 | 중간 | 관계 chip·linked section만 참고하고 정합성은 Prisma가 소유한다. |
| 문서·댓글 | 높음 | 계약 특약, 상담 메모, 자료실에 제한 적용한다. |
| 앱 정보구조 | 낮음 | 무제한 페이지 트리 대신 고정된 업무 객체와 역할별 내비게이션을 사용한다. |
| 스키마·상태기계 | 매우 낮음 | Property/Deal/Contract 상태와 관계를 사용자 설정 대상으로 만들지 않는다. |
| 재무·감사·권한 | 매우 낮음 | 원장, append-only 감사, `office_id` 격리, RBAC를 별도 도메인 UI로 보존한다. |
| AI mutation | 낮음 | 우측 문맥형 chat은 참고하되 모든 고위험 변경은 diff 승인 큐를 거친다. |

한 문장으로 요약하면 다음과 같다.

> **Notion의 조용한 view·문서 문법을 가져오되, Estate ERP를 “사용자가 조립하는 페이지 모음”으로 만들지 않는다.**

## 2. 조사 방법과 확인 한계

### 2.1 관찰한 근거

- 공개된 Notion 공식 Help Center의 최신 기능 설명을 기준으로 했다.
- 이미지 15개는 해당 문서가 제공하는 `images.ctfassets.net` 원본을 수정 없이 저장했다.
- 기능 존재와 제한은 공식 문서의 명시를 따랐다.
- “Estate ERP에 채택/비채택”은 공식 설명이 아니라 현재 코드·Prisma 모델·사용자 조건에 대입한 설계 판단이다.

### 2.2 확인하지 못한 것

- 로그인된 실제 워크스페이스의 요금제별 UI 차이와 실험 중인 배치는 검증하지 않았다.
- Notion의 내부 디자인 토큰과 정확한 CSS 값은 공개 근거가 아니므로 단정하지 않았다.
- 아래 토큰 recipe는 공식 스크린샷의 시각 특징과 Estate ERP의 기존 `#37352f / #f7f6f3` 기준을 합친 **재설계 제안값**이다.
- 상용 UI의 코드·아이콘·이미지를 제품 자산으로 복제할 수 있다는 의미가 아니다.

## 3. Notion의 핵심 정신모델

Notion 공식 문서는 데이터베이스를 “페이지의 모음”으로 설명한다. 표의 한 행이 독립 페이지로 열리고, 속성 외에도 자유로운 본문을 가질 수 있다. 같은 데이터베이스는 여러 view로 표시할 수 있다. [What is a database](https://www.notion.com/help/what-is-a-database)

이 구조가 좋은 이유는 목록과 상세, 구조화 데이터와 비정형 설명 사이의 이동 비용이 작기 때문이다. 그러나 Estate ERP에서는 이 유연성이 그대로 장점이 되지 않는다.

| Notion 정신모델 | 장점 | Estate ERP 위험 |
|---|---|---|
| 모든 행은 페이지 | 표에서 상세 문서로 자연스럽게 이동 | 매물·계약이 자유 문서처럼 보이면 필수 필드와 상태 규칙의 중요도가 약해진다. |
| 페이지 안은 블록 | 설명·사진·체크리스트·파일을 자유 배치 | 핵심 금액·법정 날짜·소유 관계가 본문 아래로 밀릴 수 있다. |
| 사용자가 view와 property 구성 | 팀별 업무 방식에 유연 | 교육·지원이 어려워지고 사무소마다 같은 화면의 의미가 달라진다. |
| relation·rollup으로 연결·집계 | 관계 탐색과 가벼운 집계가 빠름 | 계약 수수료·입금 잔액을 일반 rollup처럼 보이면 회계적 근거와 잠금이 사라진다. |
| 페이지 공유·상속 권한 | 문서 협업이 쉬움 | 가장 넓은 권한이 우선하는 공유 문법을 tenant 격리 대신 사용할 수 없다. |

## 4. 기능별 심층 분석

### 4.1 앱 셸과 사이드바

Notion의 현재 사이드바는 Home, AI chat, Meetings, Inbox, Library 같은 상위 진입점과 Teamspaces·Shared·Private·Favorites를 한 rail에 둔다. 페이지는 제한 없이 중첩할 수 있고 drag로 재구성할 수 있다. 사이드바를 접거나 구획의 순서·표시 개수를 조정할 수도 있다. [Navigate with the sidebar](https://www.notion.com/help/navigate-with-the-sidebar)

![Notion 사이드바 구획 설정](../ui-reference-assets/notion-deep-dive/sidebar-section-settings.png)

좋은 점:

- workspace, 개인, 공유, 즐겨찾기의 소유 범위를 같은 rail에서 설명한다.
- 중요한 상위 행동의 위치가 안정적이다.
- 최근 항목과 즐겨찾기로 긴 트리를 반복 탐색하지 않게 한다.
- 배경과 선택 상태의 차이가 작아도 아이콘·라벨·indent로 계층을 읽게 한다.

Estate ERP 적용:

- `/dashboard`, `/inbox`, `/ai-chat`와 `매물·공간 / 고객·상담 / 거래·계약 / 업무·운영`의 고정 그룹은 그대로 유지한다.
- Notion의 `Favorites / Recents` 개념만 도입해 자주 보는 매물·고객·거래로 빨리 이동하게 한다.
- 역할별 메뉴 숨김은 현재 `owner / manager / agent` 규칙을 따르고 사용자가 페이지를 drag해 핵심 메뉴를 바꾸게 하지 않는다.
- `Private`는 개인 문서가 아니라 “내 저장 뷰·내 업무·내 수수료”처럼 명확한 업무 범위로 번역한다.

가져오지 않을 것:

- 무제한 페이지 중첩
- 사용자가 핵심 업무 객체의 위치를 마음대로 바꾸는 sidebar
- hover해야만 생성·설정 행동이 보이는 저발견성 UI
- 동일 rail에서 업무 route와 임의 문서를 구분 없이 섞는 구조

### 4.2 전역 검색과 command palette

Notion 전역 검색은 `cmd/ctrl + P` 또는 `K`로 열고, 최근 페이지·검색 결과를 중앙 modal에서 보여준다. relevance·수정일·생성일 정렬과 title, creator, teamspace, 범위, 날짜 필터를 제공한다. 공식 문서상 database search는 제목과 property value를 찾지만 페이지 본문은 찾지 않고, workspace search는 페이지 본문을 찾지만 댓글·토론과 일부 property value는 결과에 포함하지 않는다. CJK 검색은 지원하지만 개선 중이라고 명시한다. [Search in your workspace](https://www.notion.com/help/search)

![Notion workspace search](../ui-reference-assets/notion-deep-dive/workspace-search.png)

Estate ERP 적용:

- `⌘/Ctrl+K`를 **탐색 + 빠른 등록 + 명령**의 단일 진입점으로 사용한다.
- 결과를 `매물 / 단지 / 연락처 / 구매조건 / 거래 / 계약 / 문서 / 명령` 그룹으로 고정한다.
- 최근 방문과 즐겨찾기를 검색 전 기본 결과로 둔다.
- 결과 행에는 이름만이 아니라 식별 보조값을 함께 노출한다. 예: `래미안고덕 · 103동 1204호 · 매매 15.8억`.
- “전화번호 뒷자리, 하이픈 제거, 한글 초성, 도로명/지번, 동·호수, 억/만원”은 Notion search를 복제하지 말고 Estate 전용 정규화 규칙으로 만든다.

중요한 차이:

- Notion은 콘텐츠 위치를 찾는 검색이다.
- Estate ERP는 동일 이름의 사람·단지·매물을 **구분하고 즉시 행동**해야 하는 업무 검색이다.
- 따라서 검색 결과마다 `전화`, `상담 추가`, `매물 열기`, `거래 열기` 같은 안전한 quick action을 제공한다.

### 4.3 데이터베이스 view 체계

Notion의 가장 강한 참고점은 같은 데이터에서 여러 view를 만드는 방식이다. 공식 문서는 table, board, timeline, calendar, list, gallery, chart를 기본 view로 설명하고, Help Center에는 dashboard, form, map, feed도 독립 view로 제공한다. 각 view는 filter·sort·group과 표시 property를 별도로 가질 수 있다. [Views, filters, sorts & groups](https://www.notion.com/help/views-filters-and-sorts)

![Notion 데이터베이스 view 전환](../ui-reference-assets/notion-deep-dive/database-view-switcher.png)

#### Table

- 각 행이 상세 페이지로 열린다.
- 여러 행을 선택해 property를 bulk edit할 수 있다.
- 열 순서·폭·줄바꿈·계산을 조정할 수 있다. [Table view](https://www.notion.com/help/tables)

Estate 적용: `/properties`, `/contacts`, `/buyer-requirements`, `/deals`, `/contracts`, `/cashflow/ledger`의 기본 탐색 뷰. 다만 핵심 식별열·금액·상태열은 사용자가 제거할 수 없는 고정 영역으로 둔다.

#### Board

- status뿐 아니라 assignee, priority, select, relation 등으로 group할 수 있다.
- card size·표시 property·이미지·숨김 column을 조절할 수 있다. [Board view](https://www.notion.com/help/boards)

Estate 적용: `/matches`, `/deals`, 광고 lifecycle, `/tasks`. 단, drag는 초안 이동까지만 허용하고 계약·입금·정산처럼 법적·재무적 의미가 있는 전이는 확인 절차를 거친다.

#### Calendar

- date property를 월·주 관점으로 시각화한다.
- database item의 날짜와 별도 Notion Calendar를 연결할 수 있다. [Calendar view](https://www.notion.com/help/calendars)

Estate 적용: `/calendar`에서 상담·방문·일반 업무와 계약금·중도금·잔금·신고·임대만료·광고만료를 겹쳐 보되, 일정 유형별 고정 아이콘과 라벨을 붙인다.

#### Timeline

- date range를 시간부터 연도 단위까지 표시한다.
- 왼쪽 table을 함께 열고, bar 길이를 조정하며, 표시 date property를 바꿀 수 있다. [Timeline view](https://www.notion.com/help/timelines)

Estate 적용: 계약 지급 일정, 임대 기간, 광고 노출 기간을 “읽는 view”로 사용한다. 금액 지급 완료를 bar drag만으로 처리하지 않는다.

#### Gallery

- page cover 또는 Files & media를 card preview로 보여주는 이미지 중심 view다. [Gallery view](https://www.notion.com/help/galleries)

Estate 적용: `/documents/photos`와 매물 사진 선택에만 사용한다. 핵심 매물 목록의 기본값으로 쓰면 정보 밀도가 급격히 떨어진다.

#### Map

2026-07-17 현재 Notion은 공식 Map view를 제공한다. `Place` property가 필요하며 pin을 누르면 database page가 열린다. 공식 문서는 한 번에 최대 100개 item을 표시하고, 주소 검색이 제3자 제공자에 의존해 지역별 품질이 달라질 수 있다고 명시한다. [Map view](https://www.notion.com/help/maps)

![Notion map view](../ui-reference-assets/notion-deep-dive/map-view.png)

Estate 적용 판단:

- `table ↔ map` view tab과 pin에서 상세를 여는 상호작용은 참고할 가치가 있다.
- `/properties`, `/sites`는 100개 제한과 단순 Place property로 구현하면 안 된다.
- 실제 위치는 `Ward + PostGIS Point(5179)`, 현재 지도 bounds, clustering, 거리·반경·법정동 필터를 사용한다.
- 권장 기본은 지도 60% + 동기화 목록 40%이며 `현재 지도에서 재검색`을 명시한다.

### 4.4 view 설정과 상세 열기 방식

Notion은 view별로 상세 페이지를 `Side peek / Center peek / Full page` 중 하나로 열 수 있다. table·board·list·timeline은 기본적으로 side peek, gallery·calendar는 center peek를 사용한다고 공식 문서가 설명한다. [Views, filters, sorts & groups](https://www.notion.com/help/views-filters-and-sorts)

Estate ERP에서 가장 직접적으로 가져올 수 있는 패턴이다.

| 열기 방식 | Estate 사용 | 피해야 할 사용 |
|---|---|---|
| Side sheet | 매물·연락처·구매조건의 빠른 확인, 전화·메모·업무 생성 | 긴 등록 폼, 계약서 편집, 다중 tab을 다시 중첩 |
| Center dialog | 단일 확인, 매칭 후보 비교, 짧은 상태 전이 | 목록을 가리고 장시간 작성하는 상세 workspace |
| Full page | 매물·연락처·거래·계약의 전체 편집과 URL 공유 | 단순 속성 하나 바꾸기 |

1440×900에서 232px sidebar와 440px sheet를 동시에 열면 본문은 약 768px만 남는다. 따라서 sheet가 열릴 때 sidebar를 icon rail로 접거나 table의 보조열을 자동 숨겨야 한다.

### 4.5 property와 database page layout

Notion property는 text, number, select, multi-select, status, person, file, checkbox, URL, email, phone, created/edited metadata, relation, rollup, formula, button, ID, Place 등을 제공한다. view별 conditional color도 지원한다. [Database properties](https://www.notion.com/help/database-properties)

Layouts는 database page의 정보를 다음처럼 나눈다.

- 제목 아래 최대 4개의 pinned property
- 본문 main area
- 접히는 오른쪽 details panel
- 속성을 묶는 property group과 독립 module
- 같은 database의 모든 page에 공통 적용되는 layout

[Layouts](https://www.notion.com/help/layouts)

![Notion database layout builder](../ui-reference-assets/notion-deep-dive/database-layout-builder.png)

Estate ERP 적용 recipe:

- 매물 상세 pinned: `검증 상태 / 거래·가격 / 담당자 / 다음 확인일`
- 연락처 상세 pinned: `전화 / 주요 역할 / 담당자 / 다음 후속일`
- 구매조건 상세 pinned: `상태 / 예산 / 선호 지역 / 다음 후속일`
- 거래 상세 pinned: `DealStage / 거래금액 / 다음 마감 / 담당자`
- 계약 상세 pinned: `ContractStatus / 계약일 / 다음 지급일 / 잔금일`

본문에는 사진, 활동, 관계, 문서처럼 판단에 필요한 내용을 둔다. details panel에는 식별코드·생성/수정자·외부 연동 ID 같은 보조 속성을 둔다. 위험·금액·법정 날짜는 접힌 panel 안으로 숨기지 않는다.

Notion보다 강하게 보정할 점:

- 40–60대 사용자에게 12px 저대비 property label은 작다. 13px 이상과 더 높은 대비를 쓴다.
- status는 pastel tag만 사용하지 않고 명시 라벨·아이콘·위험 설명을 함께 둔다.
- hover에만 편집 affordance를 두지 않는다. 활성 행과 keyboard focus에서 편집 가능성을 분명히 표시한다.
- 핵심 property 순서는 사용자 자유 layout이 아니라 제품 recipe가 소유한다.

### 4.6 relation과 rollup

Notion relation은 다른 database의 page를 한쪽 또는 양쪽 방향으로 연결한다. 한 relation을 1개 page로 제한하거나 여러 page를 허용할 수 있고, 연결된 page의 보조 property도 함께 표시할 수 있다. Rollup은 relation을 따라 count, sum, average, min/max, 날짜 범위 등을 계산한다. 공식 문서는 rollup의 rollup은 지원하지 않으며, CSV로 내보낸 relation은 URL text가 되어 재가져오기로 관계를 복원할 수 없다고 명시한다. [Relations & rollups](https://www.notion.com/help/relations-and-rollups)

![Notion 양방향 relation](../ui-reference-assets/notion-deep-dive/relation-two-databases.png)

![Notion rollup 설정](../ui-reference-assets/notion-deep-dive/rollup-configuration.png)

가져올 것:

- `Contact ↔ Property`, `Contact ↔ BuyerRequirement`, `BuyerRequirement ↔ Match ↔ Property`, `Deal ↔ Contract`를 chip·linked section으로 탐색하는 문법
- 관계 선택기에서 이름 외 보조 property를 보여주는 방식
- 관계가 비어 있을 때 “관련 매물 연결” 같은 명시적 empty action
- 상세 화면에서 양쪽 관계를 모두 확인하는 구조

가져오지 않을 것:

- 사용자가 relation cardinality를 임의로 바꾸는 설정
- `Site → Dong → Unit` 체인을 일반 relation picker로 입력
- 거래 참여 직원 수수료, 입금 잔액, 파트너 채무를 rollup 값 하나로 확정
- FK 삭제·복원 규칙을 UI relation 동작에 맡기는 것

Estate에서는 Prisma 관계가 source of truth이고, Notion relation은 **관계를 보여주고 이동하는 시각 언어**로만 사용한다.

### 4.7 상세 페이지, 댓글, 활동, 버전

Notion은 page 상단 전체 댓글, 본문 block 댓글, database property 댓글을 제공한다. 댓글을 resolve/reopen하고 `@mention`으로 Inbox 알림을 보낸다. [Comments, mentions & reactions](https://www.notion.com/help/comments-mentions-and-reminders)

![Notion 우측 댓글 panel](../ui-reference-assets/notion-deep-dive/comments-sidebar.png)

좋은 점:

- 본문을 가리지 않고 우측에서 문맥별 토론을 이어간다.
- 해결 여부를 분리해 열린 논의만 관리할 수 있다.
- page/block/property라는 논의 범위가 명확하다.

Estate 적용:

- 계약 조항, 공적장부 파일, 상담 메모, 광고 반려 사유처럼 “내용에 대한 협업”에 댓글을 사용한다.
- 연락처·매물의 다음 행동은 댓글이 아니라 Task/Consultation으로 승격한다.
- 금액·상태 변경은 댓글 thread가 아니라 구조화된 변경 이력과 승인 사유를 남긴다.

Notion version history는 plan에 따라 7/30/90일 또는 무제한 범위를 제공하고, 수정 중에는 일정 간격으로 page version을 기록한다. 공식 문서는 version comparison이 모든 변경을 포착하지 않으며 database 복원 시 각 database page 본문은 개별 복원이 필요할 수 있다고 설명한다. [Delete & restore content](https://www.notion.com/help/duplicate-delete-and-restore-content)

따라서 Notion의 Updates/Version history는 Estate의 다음 기록을 대체할 수 없다.

- `PriceHistory`: before/after 가격
- `ActivityLog`: actor, source, entity, action, before/after
- 계약 status와 지급 일정의 변경 사유
- AI/MCP 실행의 근거·승인자·실행 결과·undo
- 정산기간 잠금·재오픈 기록

### 4.8 Forms

Notion form은 database에 연결되어 질문이 property로 저장된다. workspace 밖의 응답자도 사용할 수 있으며 모든 plan에서 기본 form을 만들 수 있다고 공식 문서가 설명한다. [Forms](https://www.notion.com/help/forms)

![Notion form builder](../ui-reference-assets/notion-deep-dive/form-builder.png)

Estate 적용 후보:

- 외부 구매고객 문의 → BuyerRequirement 초안
- 매물 의뢰 → Contact + Property 후보 초안
- 협력업체 등록 요청 → ServiceVendor 검토 큐
- 사무소 내부 점검표·자료 요청

반드시 추가할 도메인 보호:

- 응답은 production record에 즉시 확정하지 않고 intake 상태로 저장한다.
- 전화번호 중복, 주소/법정동, 가격 단위, 면적 단위, 개인정보 동의를 검증한다.
- `Site → Dong → Unit` 후보를 찾아 사용자가 확인한 뒤 연결한다.
- 외부 제출과 직원 내부 작성의 권한·필수항목을 분리한다.
- spam, rate limit, 보관기간, 삭제 요청을 명시한다.

Notion의 “질문 → property” 직결은 빠르지만, Estate에서는 “응답 → 검증 → 관계 연결 → record 확정”의 중간 단계가 필요하다.

### 4.9 Templates

Notion database template은 새 page의 property와 본문 구조를 미리 채우고 database별로 반복 사용한다. 일·주·월·년 반복 생성도 지원한다. 공식 문서는 relation을 template에 미리 넣으면 새 page가 모두 같은 기존 page와 연결됨을 주의시킨다. [Database templates](https://www.notion.com/help/database-templates)

![Notion database template 메뉴](../ui-reference-assets/notion-deep-dive/database-template-menu.png)

Estate에서 좋은 사용:

- 상담 유형별 메모 구조: 매도 상담, 매수 상담, 임대 갱신
- 업무 checklist: 신규 매물 검증, 계약 전 확인, 잔금일 준비
- 광고 반려 대응 template
- 내부 자료실 문서 template

제한할 사용:

- 계약 당사자·금액·지급일을 복제하는 계약 template
- 특정 Contact/Property relation이 채워진 template
- 법정 서류를 자유 블록 template만으로 관리
- 직원이 상태기계와 수수료 계산 규칙을 template로 우회

### 4.10 Chart와 Dashboard

Notion chart view는 vertical/horizontal bar, line, donut을 제공하고 색·축·label 등을 조절한다. chart의 부분을 누르면 구성 data를 table drilldown으로 볼 수 있다. [Chart view](https://www.notion.com/help/charts)

![Notion chart 설정](../ui-reference-assets/notion-deep-dive/chart-customization.png)

Dashboard view는 table, board, calendar, chart, timeline 같은 widget을 한 화면에 배치하고 크기를 조절한다. 여러 source에 filter를 적용하는 global filter도 제공한다. 공식 문서상 Dashboard view는 Business/Enterprise plan 기능이다. [Dashboards view](https://www.notion.com/help/dashboards)

![Notion dashboard global filter](../ui-reference-assets/notion-deep-dive/dashboard-global-filter.png)

Estate에서 가져올 것:

- widget title에서 원본 저장 뷰로 drilldown
- 사무소/담당자/기간의 상단 global scope
- 역할별 같은 dashboard 구조에 다른 data scope 적용
- table과 chart를 같은 filter 문법으로 연결

Estate에서 고정할 것:

- 첫 화면 1행은 사용자가 제거할 수 없는 `오늘 조치할 큐`
- `검토 필요 / 오늘 후속 / 계약·잔금 / 임대·광고 만료`를 먼저 표시
- KPI와 chart는 아래에 두고 구성 record로 반드시 이동 가능하게 한다.
- donut 남용, 큰 숫자 카드 적층, 의미 없는 빈 widget은 금지한다.

재무 화면 주의:

- Notion chart·number·rollup은 운영 통계를 보는 도구이지 회계 원장이 아니다.
- `/cashflow`, `/cashflow/ledger`, 직원·파트너 정산은 예정/확정/수금/지급/조정/잠금 근거를 별도 row와 subtotal로 표현한다.
- chart에서 보인 금액을 사용자가 직접 수정하게 하지 않는다.

### 4.11 Automations와 database buttons

Notion database automation은 property 변화·page 추가 같은 trigger와 property 수정, 다른 database page 생성·수정, 알림 등의 action을 연결한다. Database button은 한 번의 명시적 click으로 property 수정, page 생성, 알림, email, webhook 같은 행동을 실행하고 confirmation을 붙일 수 있다. 공식 FAQ는 automation이 다른 automation을 trigger하지 못하고, view filter 조건과 database lock이 실행에 영향을 줄 수 있다고 설명한다. [Database automations](https://www.notion.com/help/database-automations), [Database buttons](https://www.notion.com/help/database-buttons)

![Notion database automation panel](../ui-reference-assets/notion-deep-dive/database-automations.png)

좋은 시각 패턴:

- automation을 database 문맥 안의 우측 panel로 연다.
- trigger → action을 한 문장으로 요약한다.
- 실행 중인 rule과 새 automation 진입을 분리한다.
- 수동 button은 레코드 바로 옆에 행동의 이름을 명시한다.

Estate 적용:

- `/settings`의 규칙 엔진 UI에서 `언제 / 조건 / 무엇을 / 누구 이름으로`를 문장형으로 보여준다.
- 실행 전 예상 대상 수와 변경 필드를 preview한다.
- rule version, 활성화자, 마지막 실행, 성공/실패, 재시도를 표시한다.
- 계약·가격·입금·정산 mutation은 manual approval 또는 별도 권한을 요구한다.
- ActivityLog actor를 `user`, `mcp:Codex`, `system:rule_engine`으로 분명히 노출한다.

Notion처럼 사용자가 임의 schema와 webhook을 조합하게 하기보다, Estate가 검증한 trigger/action catalogue를 제공하는 편이 안전하다.

### 4.12 권한과 공유

Notion은 Full access, Can edit, Can edit content, Can create, Can comment, Can view를 구분한다. Business/Enterprise에서는 Person 또는 Created by property에 따라 database page-level access rule도 만들 수 있다. 동시에 공식 문서는 여러 경로로 권한을 받으면 **가장 넓은 access가 우선**한다고 설명한다. [Sharing & permissions settings](https://www.notion.com/help/sharing-and-permissions)

![Notion database page-level access rule](../ui-reference-assets/notion-deep-dive/page-level-access-rule.png)

가져올 시각 언어:

- 권한 이름 옆에 가능한 행동을 평문으로 설명
- 사람·팀·일반 access를 구획
- inheritance와 override를 현재 화면에서 확인
- access request를 Inbox에서 승인·거절
- 민감한 action은 confirmation과 영향 설명 제공

가져오지 않을 권한 모델:

- page share가 `office_id` tenant 경계보다 우선하는 구조
- “가장 넓은 권한 우선”을 직원·정산·계약에 그대로 적용
- URL을 아는 사람이 내부 record에 접근하는 public link
- filter로 숨긴 row를 보안 경계로 간주
- UI에서 숨겼다는 이유로 API 접근도 막혔다고 가정

Estate의 source of truth는 NestJS Guard, `@Roles`, Prisma middleware의 `office_id`, object/action scope다. Notion은 **권한을 사람이 이해하게 설명하는 UI**만 참고한다.

### 4.13 Notion AI와 Agent

현재 공식 문서상 Notion Agent는 보고 있는 page 문맥, `@mention`한 page·person, 선택한 source, 연결 앱을 사용하고 page와 database를 생성·수정할 수 있다. Agent는 사용자와 같은 권한을 갖는다. 공식 문서는 Agent가 automation, database template, page layout, formula·rollup·button 같은 advanced property, comment, sharing permission 등을 생성·수정하지 못하는 범위도 명시한다. [Notion Agent](https://www.notion.com/help/notion-agent)

![Notion Agent 우측 chat](../ui-reference-assets/notion-deep-dive/notion-agent.png)

Notion AI for databases는 page 내용의 summary·tag·translation 같은 Basic Autofill과 더 복잡한 Custom Agent Autofill을 구분한다. [Notion AI for databases](https://www.notion.com/help/autofill)

가져올 것:

- 현재 record를 유지한 우측 chat/floating mode
- 입력창 위의 현재 대상과 source chip
- 명령 전에 관련 page·record를 `@`로 명시하는 방식
- 긴 결과를 chat bubble이 아니라 page/report canvas로 만드는 방식
- 대화 history와 pinned thread

Estate에 맞게 바꿀 것:

- `/ai-chat`: 질문·검색·초안 작성은 바로 결과를 보여준다.
- `/inbox`: record mutation은 `대상 / 근거 / before / after / 영향 / 승인 / undo`를 가진 제안으로 보낸다.
- Contact/Property/Deal/Contract를 만들 때 dedupe와 relation 후보를 먼저 보여준다.
- 금액·상태·개인정보·계약 일정은 AI가 조용히 직접 수정하지 않는다.
- 응답의 source를 `web / CRM record / uploaded file / MCP tool`로 구분한다.
- 실패·부분 성공·권한 부족을 성공 답변 안에 숨기지 않는다.

Notion AI의 “문맥 안에서 바로 일한다”는 방향은 좋지만 Estate에서는 **실행 속도보다 변경 가시성과 책임성**을 한 단계 더 강하게 설계해야 한다.

## 5. Estate ERP 실제 라우트별 적용 매핑

| 화면/라우트 | Notion에서 가져올 것 | Estate 고유 보강 | Notion 기준 적합도 |
|---|---|---|---:|
| 전역 authenticated 셸 | warm rail, Favorites/Recents, command search | 고정 업무 객체군, role badge, AI 검토 badge | 중간 |
| `/dashboard` | multi-view widget, global filter, drilldown | 첫 행 행동 큐 고정, 사무소/내 담당 scope | 중간 |
| `/inbox` | right context panel, confirmation | 3분할 목록·diff·영향, 승인/거절/undo | 낮음 |
| `/ai-chat` | contextual side chat, source chip, result page | mutation은 승인 큐, CRM entity chip | 높음 |
| `/properties` | view tabs, filter/sort, side peek | 고정 식별열, 억/만원·㎡/평, 검증·광고·소유자 | 높음 |
| `/properties/$id` | 4 pinned properties, main/details, comments | 가격·검증·소유 관계 고정, activity canonical | 높음 |
| `/properties/new` | form section·progressive disclosure | Site/Dong/Unit 체인, 중복검사, 도메인 validation | 낮음 |
| 외부·내 광고 | saved views, board, automation summary | 채널별 전송/검수/노출/반려/만료 상태 분리 | 중간 |
| `/sites` 목록/지도 | table↔map tab, pin detail | PostGIS, bounds query, cluster, 동·호실 matrix | 낮음 |
| `/contacts` | table + side peek, relation chip | 복수 역할, 전화 중복, 상담/통화 quick action | 높음 |
| `/contacts/$id` | layout, activity/comments, linked sections | 구조화 상담·소유·요구·다음 행동 | 높음 |
| 구매고객 목록·상세 | view/filter, relation, layout | 지역·예산·면적·필수/선호, match 재평가 | 높음 |
| `/consultations` | database template, page comments | 날짜·유형·결과·후속을 구조화 Activity로 유지 | 높음 |
| `/calls` | contextual page, summary/autofill 표현 | CTI, audio/transcript sync, 상담·업무 전환 | 중간 |
| `/tasks` | table/board/calendar, relation, template | 관련 매물·고객·거래 필수, system/AI source | 높음 |
| `/calendar` | database calendar/timeline, linked item | 재무·법정·상담 layer와 고정 색 의미 | 높음 |
| `/matches` | relation-heavy board, side peek | 양쪽 요약, 적합 근거, 접촉 단계 이중성 | 중간 |
| `/deals` | table↔board, pinned status, linked records | stage guard, 수수료 양측 분리, 공동중개 | 중간 |
| `/contracts` | document body, comments, layout, template 일부 | A4 문서, 당사자, 지급일정, 서명·법정 상태 | 중간 |
| `/cashflow` | dashboard/filter/drilldown 표현 | 확정·예정·수금·지급·조정·잠금 | 낮음 |
| `/cashflow/ledger` | dense table 외형 | 불변 transaction, subtotal, 증빙, reconciliation | 매우 낮음 |
| 파트너·직원 정산 | relation chip, page-level 설명 | 계산 근거, 기간 잠금, 민감정보 격리 | 매우 낮음 |
| `/network` | comment/mention의 미세 상호작용 | 방·대화·공유매물·문의 3패널, 공개범위 | 낮음 |
| 직원·협력업체 | people/company table, relation, side peek | role/RBAC, 정산 분리, 의뢰·지출 문맥 | 중간 |
| `/documents` | 가장 직접적인 page/block/template/comments | 문서종류, 관련 record, 보안등급, OCR·검증 | 매우 높음 |
| `/documents/photos` | gallery, Files & media | 대량 업로드, 중복·품질, 대표·순서, 원본 관리 | 중간 |
| `/settings` | sectioned settings, automation/permission 설명 | office/RBAC/commission/MCP/audit 고정 IA | 중간 |

## 6. Notion을 전체 디자인 기준으로 삼을 때의 위험

### 위험 1 — 빈 문서 캔버스가 업무 우선순위를 덮는다

Notion의 큰 page title과 넓은 여백은 작성과 읽기에는 좋지만 1440×900 매물장에서는 한 번에 보이는 행을 줄인다. Estate의 목록 화면은 표준 density에서 15–18행이 보여야 한다.

### 위험 2 — Page와 database의 혼합 정신모델

사용자가 매물·고객·계약을 “페이지”로 이해하면 본문 작성과 property 입력의 중요도가 뒤섞인다. Estate는 `record header + 고정 핵심 field + activity + 문서 본문`의 순서를 제품이 결정해야 한다.

### 위험 3 — 상태 의미가 약하다

Pastel tag와 조용한 색은 문서 도구에는 자연스럽지만 검증 지연, 계약 진행, 잔금 미수, 광고 반려를 빠르게 구분하기 어렵다. 색 외에 label, icon, 기한, 다음 행동을 함께 쓴다.

### 위험 4 — 저대비·hover 의존

Notion의 얇은 경계와 hover-only control은 숙련 사용자에게는 조용하지만 40–60대 사용자에게 발견성과 정확성을 떨어뜨릴 수 있다. 핵심 action, 선택 행, focus, error는 상시 보이는 대비를 확보한다.

### 위험 5 — 과도한 사용자 정의

property·view·layout을 모두 자유롭게 하면 사무소마다 화면 의미가 달라져 교육과 지원이 어려워진다. 개인화는 column 순서, density, filter, sort, saved view 수준으로 제한하고 schema와 상태는 제품이 소유한다.

### 위험 6 — 활동 기록과 감사 기록의 혼동

댓글·Updates·Version history는 협업에는 좋지만 가격 변경, 계약 상태, AI/MCP mutation, 정산 잠금의 append-only audit가 아니다. Activity timeline과 감사 원장을 분리한다.

### 위험 7 — 금융 UX 부족

number·relation·rollup·chart는 계산을 보여줄 수 있지만 원금, 예정, 입금, 잔액, 조정, 증빙, 잠금의 회계 workflow를 보장하지 않는다. Cashflow와 ledger는 Xero/Bigcapital 계열 문법을 우선한다.

### 위험 8 — 공유 권한을 tenant 보안으로 착각

Notion도 page-level access를 제공하지만 broadest access 우선과 상속·공유 관계를 갖는다. Estate는 `office_id`와 RBAC가 항상 우선이며, network 공유는 별도 공개 DTO와 만료/철회를 사용한다.

### 위험 9 — Map을 공간 검색으로 오해

Notion Map은 주소 pin을 가볍게 보는 view다. 100-item 표시 제한, 제3자 주소 품질, 단순 text filter는 부동산 공간 검색을 대신하지 못한다.

### 위험 10 — AI가 작업과 승인을 한 표면에서 섞는다

Notion Agent는 문맥 안에서 즉시 일을 수행하는 경험에 초점을 둔다. Estate에서는 계약·가격·개인정보·금액 변경을 chat 결과만으로 확정하면 책임 경계가 흐려진다. AI 결과와 실행 승인을 분리한다.

## 7. 선택적으로 가져올 Notion의 강점

1. **조용한 chrome**: 장식보다 data와 문서를 먼저 보이게 한다.
2. **view tab**: 같은 레코드 집합을 업무 관점별로 빠르게 전환한다.
3. **progressive disclosure**: 고정 핵심 property와 접히는 세부 property를 나눈다.
4. **side peek**: 목록 문맥을 유지한 채 record를 확인한다.
5. **row-as-detail affordance**: 행이 상세로 열린다는 규칙을 일관되게 만든다.
6. **relation chip**: 연결 record를 텍스트 URL이 아니라 사람이 읽는 객체로 표시한다.
7. **문맥형 댓글**: 문서·property에 대한 논의를 정확한 위치에 남긴다.
8. **template**: 반복되는 상담·점검·문서 구조를 표준화한다.
9. **global filter와 drilldown**: dashboard 숫자가 실제 record로 이어진다.
10. **contextual AI**: 현재 화면과 source를 유지한 채 보조 작업을 한다.

## 8. 1440×900 시각 토큰과 레이아웃 recipe

아래 값은 Notion의 비공개 토큰을 주장하는 것이 아니다. 공식 공개 화면의 특징을 Estate ERP의 기존 warm-neutral 기준과 40–60대 가독성에 맞춰 재구성한 구현 recipe다.

### 8.1 Color recipe

| 역할 | 제안값 | 사용 원칙 |
|---|---|---|
| Canvas | `#FCFCFB` | 넓은 본문 기본. 완전한 회색 카드 배경으로 덮지 않는다. |
| Sidebar | `#F7F6F3` | 현재 Estate 방향과 Notion의 warm rail을 연결한다. |
| Surface | `#FFFFFF` | table, sheet, dialog. card마다 그림자를 주지 않는다. |
| Hover | `#F1F0ED` | 행·메뉴 hover. 선택과는 구분한다. |
| Selected | `#E8F1FA` | active row/view; 텍스트 대비를 함께 높인다. |
| Text primary | `#37352F` | Notion 계열 warm black. |
| Text secondary | `#6F6E69` | 설명·보조값. 더 옅게 쓰지 않는다. |
| Border | `#E3E2DE` | 1px hairline. 중요한 구획은 `#D4D2CC`. |
| Primary action | `#2383E2` | 저장·등록 같은 한 화면 1차 행동에만 사용. |
| Danger | `#D44C47` | 오류·취소·미수 위험. 색과 icon/label 병행. |
| Warning | `#D9730D` | 만료 임박·검토 필요. 배경은 8–12% tint. |
| Success | `#448361` | 완료·검증. 단, “완료”와 “확정 입금”은 라벨 분리. |

### 8.2 Typography recipe

| 용도 | 크기/행간/굵기 | 비고 |
|---|---|---|
| 화면 제목 | `24/32, 700` | Notion의 큰 문서 title보다 작게 해 데이터 공간을 확보한다. |
| record 제목 | `22/30, 700` | 주소·고객명은 한 줄 truncate + 전체 tooltip. |
| 섹션 제목 | `16/24, 650` | card title보다 정보 구획 label 역할. |
| 본문 | `14/21, 400` | `Pretendard Variable, Inter, system-ui`. |
| 표 본문 | `14/20, 400–500` | 한글/숫자 혼합 가독성, 최소 13.5px. |
| 표 header | `12.5/18, 600` | `#6F6E69`, 대문자 letter spacing 금지. |
| 보조 설명 | `12.5/18, 400` | 저대비 11px 사용 금지. |
| 금액 | `14/20, 600`, tabular nums | `15.8억`, `158,000만원`의 단위를 일관되게 표시. |

### 8.3 Shape·spacing·density

- 기본 spacing: 4px grid, 주요 간격 8/12/16/24px
- control 높이: 기본 36px, compact 32px, 위험/주요 버튼 38–40px
- table 행: standard 38px, compact 32px, comfortable 44px
- hit target: 시각 크기와 별개로 최소 36×36px
- radius: input·button 6px, sheet·dialog 8px, tag 4–6px
- shadow: popover/dialog에만 약한 2단계 shadow; table/card에는 border 우선
- tag: 2px 6px, 12.5px, pastel background + 짙은 text; 업무 핵심 상태는 icon·기한 병행
- icon: Lucide 16px 기본, navigation 18px, stroke 1.75–2
- motion: 120–180ms; row 변화·sheet 이동만 사용하고 장식 animation은 배제

### 8.4 1440×900 AppShell recipe

```text
┌─ Sidebar 232 ─┬──────────────── Main 1208 ────────────────┐
│ Office/User   │ Global header 44: breadcrumb | search | + │
│ Search        ├────────────────────────────────────────────┤
│ 시작          │ Page header 68–76: title, count, actions   │
│ 매물·공간     ├────────────────────────────────────────────┤
│ 고객·상담     │ View bar 40: tabs | filter/sort/columns    │
│ 거래·계약     ├────────────────────────────────────────────┤
│ 업무·운영     │ Optional active-filter bar 36–40           │
│               ├────────────────────────────────────────────┤
│ Favorites     │ Dense working surface: 15–18 rows          │
│ Recent        │                                            │
│ Settings      │                                            │
└───────────────┴────────────────────────────────────────────┘
```

규칙:

- page padding은 table/map 화면 16–20px, document/detail 24–32px로 나눈다.
- 목록은 card 안에 다시 넣지 않고 working surface 자체를 table로 쓴다.
- top KPI card가 필요해도 최대 4개, 높이 72–88px를 넘기지 않는다.
- 우측 quick detail은 420–460px. 열리면 sidebar를 56px icon rail로 접을 수 있다.
- sticky 영역은 global header, view bar, table header까지만 사용한다.

### 8.5 DataIndex recipe

적용: 매물, 연락처, 구매고객, 상담, 광고, 거래, 직원, 협력업체.

```text
Page title + total count + primary action
View tabs: 전체 | 내 담당 | 검토 필요 | 저장 뷰 +
Toolbar: Search | Filter | Sort | Columns | Density | Bulk
Active filters: removable chips + 모두 지우기
Dense table/map/board
Selection → bottom bulk bar
Row click → side peek; Enter/Cmd+Enter → full page
```

Notion에서 가져오는 것은 view와 peek의 문법이다. 첫 2–4개 식별열, 상태·금액·다음 행동, bulk action 범위는 Estate가 고정한다.

### 8.6 RecordWorkspace recipe

적용: 매물, 연락처, 구매조건, 거래, 계약, 파트너.

```text
Identity header: icon/type, title, subtitle, status, 3 quick actions
Pinned strip: exactly 4 critical properties
Tabs: 개요 | 활동 | 관계 | 문서/사진 | 업무
Main 68%: decision content and activity
Details 32%: grouped secondary properties, collapsible
Persistent footer only during edit: 취소 | 저장
```

Notion layout과 달리 필수 property를 사용자 drag 대상으로 만들지 않는다. 문서형 본문은 개요 탭의 한 module로 제한한다.

### 8.7 Dashboard recipe

```text
Header: 오늘, office/my scope, date
Row 1 fixed action queues: AI 검토 | 오늘 후속 | 계약·잔금 | 만료
Row 2: 오늘 일정 60% | 내 업무 40%
Row 3: deal funnel 60% | cash outlook 40%
Every number/card opens the exact filtered records
```

Notion의 자유 dashboard 편집은 owner-only 보조 기능으로 제한하고 기본 행동 큐는 잠근다.

### 8.8 MapSplit recipe

```text
Toolbar and saved views
Map 60–65% | synchronized result list 35–40%
Map: cluster, selected pin, legal-dong boundary, current-bounds search
List row: address, price, area, verification, owner, next action
Pin/row selection opens compact detail; full edit is separate route
```

Notion Map의 탭과 pin→page 연결만 참고하고 spatial query와 결과 제한은 Estate가 소유한다.

## 9. 이미지 생성·데모 UI용 prompt recipe

### 9.1 공통 master prompt

```text
Create a production-grade 1440×900 desktop Korean real-estate brokerage ERP UI.
Visual direction: Notion-inspired calm warm-neutral workspace, but denser, clearer, and more operational.
Use a 232px pale warm-gray left sidebar, a 44px global header, near-white canvas, dark warm text, hairline gray borders, restrained blue primary action, 6px controls, almost no decorative shadows.
Typography: highly legible Korean Pretendard-style sans serif, 14–15px table text, 12.5–13px labels, 24px page title; optimized for brokers aged 40–60.
Show fixed domain navigation, view tabs, saved filters, dense spreadsheet-like rows, explicit status labels with icons, KRW prices in 억/만원 and areas in ㎡/평, clear next-action and deadline columns.
Use Notion-like side peek, relation chips, pinned key properties, grouped details panel, and quiet comments/AI panels only where useful.
The interface must feel like a trustworthy daily operations console, not a blank document editor.
No giant empty canvas, no oversized cards, no gradients, no glassmorphism, no floating decorative widgets, no emoji-heavy navigation, no tiny low-contrast text, no pastel color-only statuses, no consumer real-estate marketing hero.
Fill the screen with realistic Korean sample data and preserve strong alignment and visible interaction states.
```

### 9.2 매물 목록 + quick detail prompt 추가문

```text
Page: 매물관리.
Show view tabs 전체 매물 / 내 담당 / 검증 필요 / 광고 만료, a compact filter bar, and 16 visible rows.
Columns: 주소·동호수, 거래유형, 가격, 면적, 층, 검증상태, 소유자, 광고채널, 다음확인일, 담당자.
Select one row and open a 440px right side peek with four pinned properties, owner/contact relation chips, recent activity, and phone/상담/업무 quick actions.
Collapse the sidebar to an icon rail while the side peek is open so the table remains readable.
```

### 9.3 매물 상세 prompt 추가문

```text
Page: 매물 상세 record workspace.
Header shows full Korean address, property type, verification state, and edit/phone/create-deal actions.
Pin exactly four critical properties: 거래·가격, 검증상태, 담당자, 다음 확인일.
Use tabs 개요 / 활동 / 소유·임차 / 광고 / 사진·문서 / 업무.
Main column contains a compact photo strip, price and occupancy facts, and an activity timeline; right details column groups building, unit, external IDs, created/edited metadata.
Do not make it look like a consumer listing page or a free-form Notion document.
```

### 9.4 AI 검토함 prompt 추가문

```text
Page: AI 검토함, three-pane desktop approval workspace.
Left 30%: dense proposal queue with priority, target record, source, time, and risk.
Center 45%: evidence, before/after field diff, exact proposed mutation, approve/reject/hold actions.
Right 25%: related customer/property/deal context, recent activity, permission and impact summary.
Use Notion-like quiet panels and source chips, but stronger borders and persistent actions.
Never show a generic chat bubble as the approval mechanism; include undo window and actor/source labels.
```

### 9.5 계약 상세 prompt 추가문

```text
Page: 계약 상세 workspace.
Combine a calm Notion-like document reading area with a rigid ERP header.
Pin ContractStatus, 계약일, 다음 지급일, 잔금일.
Show parties and related Deal as relation chips; include tabs 계약 개요 / 계약서 / 지급 일정 / 당사자 / 활동 / 문서.
The contract document area has structured clauses and comments, while money, dates, signatures, and legal state remain fixed outside the free-form editor.
Show a payment timeline for 계약금·중도금·잔금 with 예정/지급/지연 labels and evidence links.
```

### 9.6 대시보드 prompt 추가문

```text
Page: 오늘의 사무소 대시보드.
Use a Notion-dashboard-inspired grid with a fixed first row of four action queues, not decorative KPI cards.
Second row: today's calendar and my tasks. Third row: deal funnel and 30/90-day cash outlook.
Add a single office/my-scope global filter and make every number visibly drillable to records.
Avoid donut-chart overload and large blank widgets.
```

## 10. 최종 채택 체크리스트

### 채택

- [ ] warm neutral shell과 얕은 chrome
- [ ] view tab + 저장 filter/sort/column/density
- [ ] table/board/calendar/timeline/gallery/map의 목적별 전환
- [ ] side peek / center confirm / full page의 명확한 승격 규칙
- [ ] 4개 pinned property + main/details 분할
- [ ] relation chip과 linked section
- [ ] 문서·property 문맥 댓글
- [ ] 반복 상담·점검·문서 template
- [ ] dashboard global scope와 record drilldown
- [ ] 현재 record/source를 유지하는 우측 AI panel

### 비채택

- [ ] 무제한 page tree와 route 재구성
- [ ] 사용자 정의 schema가 Prisma 모델을 우회
- [ ] 큰 빈 문서 canvas를 모든 상세의 기본값으로 사용
- [ ] 12px 이하 저대비 본문과 hover-only 핵심 action
- [ ] 색만으로 검증·계약·입금 상태 구분
- [ ] drag 한 번으로 법적·재무 상태 확정
- [ ] rollup을 수금·수수료 원장의 source of truth로 사용
- [ ] page share/filter를 tenant 보안으로 사용
- [ ] Notion Map을 PostGIS 검색의 대체재로 사용
- [ ] AI가 고위험 record를 diff·승인 없이 직접 수정

## 11. 공식 출처 모음

- [Notion 제품 개요](https://www.notion.com/product/notion)
- [Navigate with the sidebar](https://www.notion.com/help/navigate-with-the-sidebar)
- [Search in your workspace](https://www.notion.com/help/search)
- [What is a database](https://www.notion.com/help/what-is-a-database)
- [Views, filters, sorts & groups](https://www.notion.com/help/views-filters-and-sorts)
- [Table view](https://www.notion.com/help/tables)
- [Board view](https://www.notion.com/help/boards)
- [Timeline view](https://www.notion.com/help/timelines)
- [Calendar view](https://www.notion.com/help/calendars)
- [Gallery view](https://www.notion.com/help/galleries)
- [Map view](https://www.notion.com/help/maps)
- [Database properties](https://www.notion.com/help/database-properties)
- [Layouts](https://www.notion.com/help/layouts)
- [Relations & rollups](https://www.notion.com/help/relations-and-rollups)
- [Comments, mentions & reactions](https://www.notion.com/help/comments-mentions-and-reminders)
- [Delete & restore content](https://www.notion.com/help/duplicate-delete-and-restore-content)
- [Forms](https://www.notion.com/help/forms)
- [Database templates](https://www.notion.com/help/database-templates)
- [Chart view](https://www.notion.com/help/charts)
- [Dashboards view](https://www.notion.com/help/dashboards)
- [Database automations](https://www.notion.com/help/database-automations)
- [Database buttons](https://www.notion.com/help/database-buttons)
- [Sharing & permissions settings](https://www.notion.com/help/sharing-and-permissions)
- [Audit log](https://www.notion.com/help/audit-log)
- [Notion Agent](https://www.notion.com/help/notion-agent)
- [Notion AI for databases](https://www.notion.com/help/autofill)

