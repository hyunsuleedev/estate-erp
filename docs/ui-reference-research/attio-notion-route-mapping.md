# Attio × Notion — Estate ERP 전 화면 적용 매핑

> 조사일: 2026-07-17  
> 조사 범위: Web의 실제 업무 라우트 39개 + 라우트 안/데스크톱에 존재하는 보조 작업면 16개 = 55개 기능 단위  
> 기준 문서: `docs/DESIGN_BRIEF.md`, `docs/web-build/DESIGN_SPEC.md`, `apps/web/src/components/layout/nav-config.ts`, 통합 UI 레퍼런스 보고서  
> 출처 원칙: 로그인 뒤 화면을 추정하지 않고 Attio·Notion의 공식 제품/도움말 문서에서 확인되는 기능을 근거로 삼았다. 아래의 “Estate ERP 판단”은 이 근거를 현재 코드와 업무 모델에 대입한 설계 판단이다.

## 1. 결론

Estate ERP의 **구조적 1차 기준은 Attio**, **시각·문서 경험의 2차 기준은 Notion**이 적합하다.

- Attio는 `객체 → 레코드 → 관계 → 활동 → 저장 뷰 → 워크플로`가 한 체계에 묶여 있다. 매물·연락처·구매조건·매칭·거래처럼 서로 연결되고 다음 행동이 중요한 Estate ERP의 운영 코어와 맞는다.
- Notion은 `페이지 → 블록 → 데이터베이스 → 관계 → 문서 협업`에 강하다. 자료실, 계약 특약 작성, 설명문, 내부 지식, 조용한 색·표면, side peek에는 좋은 기준이지만 매물·계약·정산의 상태기계와 데이터 무결성을 책임질 뼈대는 아니다.
- 현재 Estate ERP는 이미 “Notion처럼 차분한 업무 도구”를 디자인 스펙으로 쓰고 있다. 문제는 그 문구가 **빈 문서형 화면, 약한 계층, 큰 여백**으로 번역됐다는 점이다. 앞으로의 의미는 `Notion의 톤`이지 `Notion의 페이지 모델`이 아니다.
- 39개 라우트 판정은 **Attio 19 / Notion 2 / 둘 다 6 / 둘 다 부적합 12**다. “둘 다 부적합”이 많은 이유는 Estate ERP에 동·호수 격자, 수금 원장, 계약 문서 편집, CTI, 공동중개 대화처럼 범용 CRM·문서도구가 대신할 수 없는 전문 작업면이 있기 때문이다.

한 문장으로 정리하면 다음과 같다.

> **Attio의 운영형 CRM 골격에 Notion의 차분한 문서 문법을 얹고, 부동산·재무·공동중개 작업면은 Estate ERP 고유 recipe로 만든다.**

## 2. 판정 기준

| 표기 | 의미 | 적용 원칙 |
|---|---|---|
| **Attio** | 구조와 기본 상호작용을 Attio가 더 잘 설명 | 객체/레코드, 활동, 관계, 저장 뷰, 파이프라인을 기본 골격으로 사용 |
| **Notion** | 구조와 기본 상호작용을 Notion이 더 잘 설명 | 문서, 지식, 캘린더, page peek, 블록 기반 상세를 기본 골격으로 사용 |
| **둘 다** | 서로 다른 층에서 조합해야 완성 | Attio는 구조·행동, Notion은 콘텐츠·표현·협업을 담당 |
| **둘 다 부적합** | 전문 제품 또는 Estate ERP 고유 설계가 필요 | 두 제품의 톤/부품만 제한적으로 참고하고 다른 1차 레퍼런스를 지정 |

판정은 “그 제품에 기능이 있는가”가 아니라 다음 네 질문으로 했다.

1. 40–60대 중개사가 1440×900에서 한눈에 업무를 훑을 수 있는가?
2. `Site → Dong → Unit → Property`, `Contact ↔ BuyerRequirement ↔ Match → Deal → Contract` 관계가 화면에서 안정적으로 유지되는가?
3. 상태, 금액, 권한, 변경 이력을 사용자가 임의 페이지 구성으로 깨뜨릴 수 없는가?
4. 목록을 보다가 상세를 확인하고 다음 행동까지 하는 흐름이 끊기지 않는가?

## 3. 공식 근거에서 확인되는 두 제품의 차이

### 3.1 Attio에서 확인한 핵심

- Attio는 객체를 사람·회사·거래 같은 레코드 유형으로, 리스트를 특정 워크플로의 레코드 집합과 **리스트 전용 속성**을 갖는 문맥으로 구분한다. 뷰는 기초 데이터를 바꾸지 않고 표/칸반, 필터, 정렬, 표시 속성을 저장한다. [Attio 데이터 모델](https://attio.com/help/reference/attio-101/attios-data-model/define-your-data-model-objects-lists-and-views)
- 레코드 페이지는 Overview, Activity, Emails, Files, Notes, Tasks, Calls, 관계 탭과 상세 속성 패널을 한곳에 묶는다. 속성 편집 이력도 값에서 바로 열 수 있다. [Attio 레코드 페이지](https://attio.com/help/reference/managing-your-data/records/create-and-view-records)
- 표와 칸반에서 표시 속성을 정하고, 관계로 연결된 레코드의 속성까지 필터·정렬·표시할 수 있다. 칸반은 time in stage와 단계별 계산을 지원한다. [Attio 칸반 뷰](https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views), [필터·정렬](https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views)
- 레코드는 quick action, CSV, 워크플로, 연동, 이메일·캘린더 동기화, Ask Attio를 통해 생성될 수 있고, 전역 `⌘/Ctrl+K`에서 빠른 등록을 시작할 수 있다. [레코드 생성](https://attio.com/help/reference/managing-your-data/records/create-and-view-records)
- 객체 권한은 Full / Read and write / Read only로 나누고 workspace·team·member·automation에 적용한다. [객체 접근 관리](https://attio.com/help/reference/managing-your-data/objects/manage-access-to-objects)
- 워크플로는 trigger와 step으로 구성되고, 자연어로 초안을 만들 수 있다. [워크플로 개요](https://attio.com/help/reference/automations/workflows/overview-of-workflows), [워크플로 생성](https://attio.com/help/reference/automations/workflows/create-a-workflow)
- Ask Attio는 레코드·리스트·메일·노트·통화와 웹을 검색하고, 레코드/업무/노트 생성·수정과 워크플로 구성을 수행한다. 노트 변경 등은 적용 전 제안을 검토하게 한다. [Ask Attio](https://attio.com/help/reference/attio-ai/ask-attio/chat-with-ask-attio)
- 보고서는 Insight, Historical values, Funnel, Time in stage, Stage changed 유형을 제공하며 구성 레코드로 drill-down한다. [Attio 보고서](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports)
- Call Intelligence는 회의 녹음, 전사, 요약·인사이트를 레코드에 연결한다. [Attio Call Intelligence](https://attio.com/help/reference/productivity-collaborating/call-intelligence)

### 3.2 Notion에서 확인한 핵심

- Notion 데이터베이스는 **페이지의 모음**이며 각 행이 다시 문서 본문을 갖는 페이지다. [Notion 데이터베이스](https://www.notion.com/help/what-is-a-database)
- 같은 데이터베이스를 table, board, timeline, calendar, list, gallery, chart, dashboard, form, map 등으로 표시할 수 있고, 상세를 side peek / center peek / full page로 열 수 있다. [Notion 데이터베이스 뷰](https://www.notion.com/help/views-filters-and-sorts)
- relation은 다른 데이터베이스의 페이지를 연결하고 rollup은 관계의 숫자·날짜 등을 집계한다. [관계와 rollup](https://www.notion.com/help/relations-and-rollups)
- 데이터베이스 레이아웃은 핵심 속성을 본문에, 보조 속성을 접히는 오른쪽 details panel에 배치할 수 있다. [Notion 레이아웃](https://www.notion.com/help/guides/build-the-perfect-workflow-with-customizable-layouts)
- 데이터베이스 버튼은 속성 수정, 페이지 생성, 알림, 메일, webhook 같은 일련의 행동을 실행하고 확인 화면을 붙일 수 있다. [Notion 데이터베이스 버튼](https://www.notion.com/help/database-buttons)
- teamspace와 페이지는 별도의 공유·권한 계층을 갖고, Business/Enterprise에서는 database page-level access도 제공한다. [Teamspace](https://www.notion.com/help/intro-to-teamspaces), [공유·권한](https://www.notion.com/en-gb/help/sharing-and-permissions)
- 위키는 페이지 owner와 검증 만료를 관리한다. [위키·검증 페이지](https://www.notion.com/en-gb/help/wikis-and-verified-pages)
- dashboard view는 표·보드·캘린더·차트·타임라인 위젯을 조합하고 global filter를 적용한다. [Notion Dashboard](https://www.notion.com/help/dashboards)
- Notion Agent는 페이지와 데이터베이스를 만들고 수정하며 연결 도구와 웹을 검색한다. Enterprise Search는 허용된 출처와 인용을 함께 보여준다. [Notion Agent](https://www.notion.com/help/guides/get-started-with-your-personal-agent-in-notion), [Enterprise Search](https://www.notion.com/product/enterprise-search)
- 파일·이미지·PDF는 페이지 블록이나 Files & media 속성에 넣고 gallery/board에 표시할 수 있다. [파일·미디어](https://www.notion.com/help/images-files-and-media)

## 4. 15개 UI 축 비교

| UI 축 | Attio | Notion | Estate ERP 판단 |
|---|---|---|---|
| 1. 제품 정신모델 | 객체와 레코드를 중심으로 관계를 관리하는 CRM | 페이지와 블록을 중심으로 지식과 데이터베이스를 조립 | 운영 데이터는 **Attio**, 설명·지식은 **Notion**. Prisma 모델을 Notion 페이지처럼 임의 구성하게 하지 않는다. |
| 2. 앱 셸·탐색 | Records, Lists, Reports, Automations, Favorites와 전역 quick action이 업무 객체 중심 | Teamspace, Shared, Private 아래 페이지 트리가 콘텐츠 위치 중심 | 셸은 **Attio 80%**. Notion식 무제한 중첩 페이지 트리는 금지하고 즐겨찾기·최근 항목만 차용한다. |
| 3. 밀도·시각 톤 | 비교적 고밀도 표/칸반, 얕은 chrome, record action 중심 | 넓은 문서 캔버스, 조용한 중성색, 약한 경계, 콘텐츠 중심 | 구조·밀도는 Attio, `#37352f / #f7f6f3`의 차분함은 Notion. 저대비·큰 공백은 차용하지 않는다. |
| 4. 데이터 모델 | 객체/레코드, 전역 속성과 리스트 전용 속성을 구분 | 모든 DB 행이 페이지; 관계와 rollup으로 연결 | `Property`, `Contact`, `Deal`은 Attio식 객체. 거래별 역할·수수료는 명시 모델로 두고 Notion rollup을 계산 원장처럼 쓰지 않는다. |
| 5. 목록·저장 뷰 | 표/칸반, 관계 속성, 저장 필터·정렬, bulk action | 다양한 뷰 수와 side/center/full peek가 강점 | 매물·고객·거래 목록은 Attio. calendar/gallery/map와 열기 방식은 Notion을 보조 참고한다. |
| 6. 레코드·페이지 상세 | Overview/Activity/Email/File/Note/Task/Call/관계 탭 + details | 속성 + 자유 본문 + 사용자 정의 layout/details panel | 업무 레코드는 Attio, 계약 특약·설명·체크리스트 본문은 Notion. 고정 핵심 필드는 자유 블록 아래로 밀리지 않게 한다. |
| 7. 관계 표현 | 관계 객체와 연결 속성을 레코드/뷰에 직접 표출 | relation/rollup과 backlink가 유연 | 양방향 관계 탐색은 둘 다. 정합성·카디널리티·삭제 규칙은 Estate DB가 소유한다. |
| 8. 활동·감사 | 이메일, 회의, 노트, 속성·리스트 변경, 업무를 레코드 시간축에 결합 | 댓글·멘션·페이지 업데이트와 버전 기록 중심 | 상담·통화·가격변경·상태변경은 Attio식 canonical activity. Notion 댓글은 문서 피드백에만 사용한다. |
| 9. 업무·캘린더 | 업무가 레코드와 직접 연결되고 Home/레코드에서 생성 | task DB와 다양한 뷰, Notion Calendar의 일정 밀도·연결 문서가 강점 | 업무는 **둘 다**, 캘린더 화면은 **Notion 우세**. 관련 매물·고객 칩은 Attio식으로 유지한다. |
| 10. 대화·통화 | 이메일 동기화, Call Intelligence, 레코드 문맥이 강점 | 댓글·AI Meeting Notes는 문서 협업 중심 | 통화 workspace는 Attio. 중개방의 실시간 3패널 대화는 둘 다 부적합하다. |
| 11. 문서·지식·파일 | 파일/노트를 레코드 문맥에 붙이는 방식 | 블록 편집, 위키, owner·검증, PDF·미디어가 강점 | 자료실·내부 지식은 Notion, 계약/매물 증빙의 메타데이터와 관계는 Attio식으로 결합한다. |
| 12. 권한·멀티테넌시 | object/list/dashboard/workflow 단위 접근 | workspace/teamspace/page/database page 단위 공유 | UI 문법은 둘 다 참고하되 실제 격리는 `office_id + RBAC`가 최상위다. “공유 링크”가 tenant 경계를 우회하지 못하게 한다. |
| 13. 자동화·HITL | trigger-step canvas, record/list action, Ask Attio로 workflow 생성 | database automation/button, confirmation, webhook | 일반 자동화는 Attio, 문서 안의 명시적 버튼은 Notion. AI 변경은 둘 다 그대로 쓰지 않고 Estate의 diff 승인 큐를 둔다. |
| 14. AI·검색·MCP | 레코드 문맥에서 검색·요약·업데이트·업무·워크플로 실행 | 지식 검색·인용, 페이지/DB 작성·수정, 연결 도구 검색 | 행동은 Attio, 출처와 결과물 캔버스는 Notion. 모든 mutation은 대상·before/after·영향·승인·undo를 붙인다. |
| 15. 대시보드·재무 | 파이프라인 funnel/time-in-stage와 구성 레코드 drill-down | 여러 DB view를 조합한 유연한 dashboard | 거래 운영은 Attio, 개인화 위젯은 Notion 보조. 현금·원장·정산은 둘 다 회계적 무결성이 부족하므로 별도 recipe가 필요하다. |

## 5. 39개 실제 라우트 판정

### 5.1 인증·홈·개인 업무 — 8개

| # | 화면/라우트 | 판정 | 가져올 패턴 | 그대로 가져오지 않을 것 / 이유 |
|---:|---|---|---|---|
| 1 | 로그인 `/login` | **둘 다 부적합** | 두 제품의 절제된 단일 폼 톤만 참고 | Estate는 owner 이메일과 직원 자동발급 ID라는 이중 진입 규칙, MFA·Caps Lock·사무소 코드 오류가 필요하다. 범용 SaaS 인증 화면을 디자인 시스템 기준으로 삼을 이유가 없다. |
| 2 | 회원가입 `/register` | **둘 다** | Attio의 CRM workspace 시작 맥락 + Notion의 짧은 단계·진행감 | 사용자·사무소·수수료·직원·연동을 한 번에 받지 않는다. owner 계정 인증 뒤 office 생성으로 넘긴다. |
| 3 | 사무소 온보딩 `/onboarding/office` | **둘 다** | Attio의 import/동기화/업무 객체 설정 + Notion의 teamspace 시작 체크리스트 | 데이터 모델을 사용자가 새로 설계하게 하지 않는다. 필수는 사무소명과 기본 지역 정도로 끝내고 첫 매물·직원초대·가져오기를 후속 체크리스트로 둔다. |
| 4 | 대시보드 `/dashboard` | **Attio** | reports, funnel, time in stage, 구성 레코드 drill-down | Notion식 자유 위젯 배치는 owner가 필요한 위험 큐를 밀어낼 수 있다. 기본 레이아웃은 고정하고 역할별 범위만 바꾼다. |
| 5 | AI 검토함 `/inbox` | **둘 다 부적합** | Attio의 제안 검토와 Notion 버튼의 confirmation은 미세 패턴만 참고 | 둘 다 `대상·근거·before/after·영향·승인·undo`를 한 행/카드에 모은 운영형 제안 큐의 충분한 기준이 아니다. Linear Triage + Estate 고유 HITL이 1차다. |
| 6 | AI 채팅 `/ai-chat` | **둘 다** | Attio의 레코드 문맥·실행 + Notion의 검색 출처·긴 결과물 페이지 | 텍스트 챗만 쌓지 않는다. 대화 중앙, 레코드/보고서 결과물 우측 canvas, mutation diff 승인 카드가 필요하다. |
| 7 | 업무 `/tasks` | **둘 다** | Attio의 record-linked task + Notion의 table/board/calendar와 문서형 상세 | 칸반만 기본으로 두지 않고 `내 업무/오늘/지연/팀/자동생성` 저장 뷰를 고정한다. 관련 객체 없는 제목만의 할 일은 피한다. |
| 8 | 캘린더 `/calendar` | **Notion** | DB 날짜와 일정의 연결, 월/주 view, 밀도 조절, 연결 문서 | Notion의 범용 일정색을 그대로 쓰지 않는다. 계약금·중도금·잔금·신고·광고만료를 별도 레이어와 명시 라벨로 구분한다. |

### 5.2 매물·공간 — 6개

| # | 화면/라우트 | 판정 | 가져올 패턴 | 그대로 가져오지 않을 것 / 이유 |
|---:|---|---|---|---|
| 9 | 매물 목록 `/properties` | **Attio** | object all-records, 저장 뷰, 관계 속성, bulk action, 표/칸반 | Attio의 CRM 열만 복제하지 않는다. 주소·가격·면적·검증·소유자·광고만료·다음 연락을 고정 식별열로 설계하고 지도 view는 별도 고유 recipe로 둔다. |
| 10 | 매물 상세 `/properties/$id` | **Attio** | record header actions, overview/activity/notes/files/relationship tabs, details panel | Notion 자유 본문이 핵심 가격·검증상태·소유관계보다 먼저 나오면 안 된다. 소비자 포털형 사진 hero도 피한다. |
| 11 | 매물 등록 `/properties/new` | **둘 다 부적합** | Attio quick create와 Notion form은 단순 필드 수집 참고만 사용 | `Site → Dong → Unit`, 중복검사, 거래·가격, 소유자/임차인, 광고/사진이 조건부로 연결되는 도메인 위저드가 필요하다. |
| 12 | 광고노트 `/properties/external-listings` | **Attio** | intake list, 상태 속성, 원본 record와 내부 후보의 관계, workflow/bulk action | 외부 수집 사실과 직원 확인 사실을 한 필드로 합치지 않는다. 원문과 내부 후보의 split view를 추가한다. |
| 13 | 내 광고 `/properties/naver-my-ads` | **Attio** | status list/kanban, 저장 뷰, time in stage, 일괄 갱신 작업 | 포털 상태와 ERP 상태를 하나의 status로 모델링하지 않는다. Naver·KB·한방 등 채널별 전송/검수/노출/반려/만료를 독립 표시한다. |
| 14 | 관리단지 `/sites` | **둘 다 부적합** | 선택 호실의 빠른 상세에는 Attio record panel을 제한적으로 사용 | 핵심은 `동 × 층 × 라인` 격자와 Unit/Property/Tenant 상태 중첩이다. 범용 table/board/gallery로 대체할 수 없다. |

### 5.3 고객·상담·통화 — 9개

| # | 화면/라우트 | 판정 | 가져올 패턴 | 그대로 가져오지 않을 것 / 이유 |
|---:|---|---|---|---|
| 15 | 연락처 `/contacts` | **Attio** | People object, 저장 뷰, 관계 속성, 최근 활동·다음 업무 | 사람 자체에 단일 lifecycle을 강제하지 않는다. 한 Contact가 매도인·매수인·임대인·임차인 역할을 동시에 가질 수 있다. |
| 16 | 연락처 상세 `/contacts/$id` | **Attio** | 활동 중심 record, 전화/메모/업무 quick action, 관계 탭 | 속성을 여러 카드로 흩뜨리지 않는다. `신원 → 소유/요구 → 최근 활동 → 다음 행동` 순서를 고정한다. |
| 17 | 연락처 추가 `/contacts/new` | **Attio** | 전역 quick create, 입력 즉시 중복 후보, 저장 후 관련 record 연결 | 처음부터 모든 관계·주소·메모를 필수로 받지 않는다. 이름/전화/유형으로 저장 후 관계를 잇는다. |
| 18 | 구매고객 `/buyer-requirements` | **Attio** | custom object, 관계 속성, 필터·저장 뷰 | 고객명보다 지역·예산·면적·기한·매칭수·최근 연락이 먼저다. 요구조건을 Contact의 자유 메모로 축소하지 않는다. |
| 19 | 구매고객 상세 `/buyer-requirements/$id` | **Attio** | record overview/activity/relationship, 연결된 property 속성 노출 | 적합도를 설명 없는 한 숫자로 만들지 않는다. 추천·보류·거절 이유와 최근 접촉을 같이 기록한다. |
| 20 | 구매조건 등록 `/buyer-requirements/new` | **Attio** | custom record create, 기존 Contact 연결, 템플릿 | Notion form처럼 모든 조건을 독립 질문으로 늘어놓지 않는다. 가격 억/만원, 면적 ㎡/평, 필수/선호, 복수지역을 도메인 입력으로 만든다. |
| 21 | 구매조건 편집 `/buyer-requirements/$id/edit` | **Attio** | attribute edit history와 관련 record 확인 | 신규 폼을 그대로 재사용하지 않는다. 예산·지역 변경이 기존 Match를 몇 개 재평가하는지 먼저 보여준다. |
| 22 | 상담기록 `/consultations` | **Attio** | Activity timeline, 수동 meeting/activity, 여러 record 연결 | Notion note만 남기지 않는다. 날짜·유형·담당·관련 고객/매물·결과·후속일을 구조 필드로 유지한다. |
| 23 | 통화 관리 `/calls` | **Attio** | Call Intelligence의 녹음·전사·요약·레코드 연결, context-aware AI | Attio는 온라인 회의 중심이므로 국내 CTI 수신 팝업을 그대로 해결하지 못한다. 전화번호 매칭, 원음/AI 요약 구분, 상담·업무 전환은 Estate 고유 보강이다. |

### 5.4 매칭·거래·계약·재무 — 8개

| # | 화면/라우트 | 판정 | 가져올 패턴 | 그대로 가져오지 않을 것 / 이유 |
|---:|---|---|---|---|
| 24 | 매칭 `/matches` | **Attio** | 관계 속성을 카드/표에 표시, status kanban, time in stage | 일반 sales pipeline처럼 한 대상만 보여주지 않는다. BuyerRequirement와 Property 양쪽 요약, 적합 근거, buyer/owner 접촉 단계를 함께 설계한다. |
| 25 | 거래관리 `/deals` | **Attio** | Deal object, table↔kanban, stage, value, next task, report funnel | drag만으로 계약상 의미가 있는 상태를 확정하지 않는다. 매도/매수/파트너/직원 수수료를 총액 하나로 축약하지 않는다. |
| 26 | 계약서 관리 `/contracts` | **둘 다** | Attio의 계약 record/활동/상태 + Notion의 문서 본문·layout·댓글·검증 | 계약 허브는 Attio, 조항 읽기/작성은 Notion. 실제 A4 편집·서명·지급일정은 Juro/PandaDoc/Documenso식 전문 workspace가 필요하다. |
| 27 | 캐시플로우 `/cashflow` | **둘 다 부적합** | Attio report의 drill-down과 Notion dashboard의 widget 구성은 보조 | 예상/확정/수금/지출/정산의 회계적 구분과 30/90일 현금흐름은 Xero·Bigcapital식 재무 recipe가 필요하다. |
| 28 | 수금 원장 `/cashflow/ledger` | **둘 다 부적합** | Attio table의 고정 열·필터만 참고 | 잔액은 직접 편집 속성이 아니다. 원 Deal/Contract, 예정·실입금, 증빙, 조정, subtotal을 갖는 불변 원장이 필요하다. |
| 29 | 공동중개 수수료 `/cashflow/partner-commissions` | **둘 다 부적합** | 관련 Partner record 링크에만 Attio 사용 | 채무·승인·지급·증빙은 CRM list나 Notion DB로 설계할 수 없다. Ramp/Xero payables가 1차다. |
| 30 | 직원 정산 `/cashflow/employee-settlements` | **둘 다 부적합** | 직원 record로 돌아가는 관계 링크만 차용 | 정산기간 잠금, 기여·배분규칙·조정·세전/지급액·재오픈 감사가 필요하다. Deel/Rippling payroll이 1차다. |
| 31 | 내 수수료 `/cashflow/my-settlement` | **둘 다 부적합** | 개인화 필터/current user 개념만 참고 | 계산 설명, 예상/확정/지급 구분, 이의제기와 타 직원 정보 차단이 핵심이다. 직원 self-service 재무 화면으로 별도 설계한다. |

### 5.5 운영·네트워크·자료·설정 — 8개

| # | 화면/라우트 | 판정 | 가져올 패턴 | 그대로 가져오지 않을 것 / 이유 |
|---:|---|---|---|---|
| 32 | 고정비 설정 `/cashflow/expenses` | **둘 다 부적합** | Attio workflow의 반복 트리거와 Notion button은 보조 | 반복비용 규칙과 실제 발생 원장, 종료일·비활성·갱신을 분리해야 한다. 회계/지출관리 제품이 1차다. |
| 33 | 네트워크 `/network` | **둘 다 부적합** | Attio 관계 record와 Notion comment는 부품만 사용 | 방 목록/대화/공유매물·문의 컨텍스트의 3패널, 공개필드 마스킹, 문의 상태가 필요하다. Chatwoot/Intercom/Slack이 1차다. |
| 34 | 파트너 중개사 `/partner-brokers` | **Attio** | Companies object, contacts/activities/deals/notes/files 관계 | 내부 tenant Office와 외부 PartnerBroker를 같은 객체처럼 다루지 않는다. 신뢰 점수는 근거 없이 별점화하지 않는다. |
| 35 | 직원관리 `/employees` | **Attio** | People/User/Workspace 관계, record tabs, 역할별 object access의 표현 | HR 원장·급여·권한 자체는 Attio가 기준이 아니다. 디렉터리와 활동 구조만 사용하고 민감한 정산/권한은 분리한다. |
| 36 | 협력업체 `/service-vendors` | **Attio** | Company/custom object, 업종·지역 view, 연락/업무/거래 관계 | 소비자 리뷰 카드처럼 사진·별점을 우선하지 않는다. 최근 의뢰·누적 지출·담당자·문서를 운영 속성으로 둔다. |
| 37 | 자료실 `/documents` | **Notion** | 문서 page, block, relation, owner·verification, PDF/media, comments | 폴더 트리만 강제하지 않는다. 관련 매물/고객/계약, 보안등급, 문서종류, OCR 상태는 구조 메타데이터로 고정한다. |
| 38 | 사진 자료 `/documents/photos` | **둘 다 부적합** | Notion gallery와 Attio files tab은 선택 상세에만 참고 | 대량 업로드·중복/저화질·촬영일 타임라인·대표사진·순서 편집·원본 삭제가 필요한 DAM이다. Immich/Google Photos가 1차다. |
| 39 | 설정 `/settings` | **둘 다** | Attio의 object/workflow/dashboard 권한 IA + Notion의 workspace/teamspace/page 권한 설명 | 한 페이지 카드 적층은 피한다. Estate의 `사무소/직원·권한/수수료/문서/연동·MCP·AI/보안·감사` 카테고리를 고정하고, MCP 키는 scope·최근 사용·폐기를 별도 원장으로 둔다. |

## 6. 16개 보조 작업면 판정 — 39 + 16 = 55

| # | 보조 작업면 | 판정 | 적용 요약 |
|---:|---|---|---|
| 40 | 전역 authenticated 앱 셸 | **Attio** | 객체군 사이드바, Favorites/최근 항목, 전역 검색·빠른 등록. Notion식 무제한 페이지 트리는 제외. |
| 41 | `/properties` 지도 view | **둘 다 부적합** | 지도 60–65% + 동기화 목록 + `현재 지도에서 재검색` + pin↔행 동기화가 필요. Reonomy/CoStar 계열 참고. |
| 42 | `/sites` 동·호실 배치판 | **둘 다 부적합** | sticky 층/라인 축과 호실 셀 내 다중 상태를 가진 Estate 고유 UnitMatrix. |
| 43 | `/sites` 호실 빠른 상세 | **Attio** | 호실 record header + 매물/거주·임대/연락처/업무/이력 탭. 구조키 변경은 전체 편집으로 승격. |
| 44 | `/contacts` 빠른 상세 sheet | **Attio** | 전화·상담·메모·업무 action과 최근 활동 5개만 보여주는 compact record. |
| 45 | `/matches` 매칭 상세 dialog | **Attio** | 양쪽 관계 요약 + stage/activity + Deal 전환. 단, 큰 생성 폼은 dialog 중첩 금지. |
| 46 | `/deals` 거래 상세 workspace | **Attio** | header/stage, overview, fee/payment/contract/activity tabs, 다음 마감. |
| 47 | `/contracts` 계약 상세 | **둘 다** | Attio record의 상태·관계 + Notion layout의 문서/속성 분리. |
| 48 | 계약 문서 편집기 | **둘 다 부적합** | Notion block은 조항 편집에만 참고. A4 preview, 목차, 필드, 자동값/수기값, 버전 비교는 전문 editor로 설계. |
| 49 | 계약금·중도금·잔금 타임라인 | **둘 다 부적합** | 예정/지급/지연, 금액, 상대방, 증빙, 일정 변경 이력을 한 축에 표시. |
| 50 | 수금 원장 kanban | **둘 다 부적합** | Attio kanban의 time-in-stage는 참고하되 돈의 원천과 잔액은 card drag로 변경하지 않는다. |
| 51 | 중개방 공유매물·문의함 | **둘 다 부적합** | 대화 읽음과 문의 open/answered/closed를 분리하고 공유범위·만료·철회를 구조화한다. |
| 52 | AI 운영/HITL 관리자 view | **둘 다 부적합** | Attio/Notion agent UI가 아니라 Langfuse/Braintrust식 trace + Estate diff approval가 필요. |
| 53 | Desktop 통화 원본 로그 `/calls/logs` | **Attio** | call record/연결 레코드 문법을 사용하되 device·원본 ID·오류·재처리는 관리자 표로 분리. |
| 54 | Desktop 레거시 내 광고 `/properties/my-ads` | **Attio** | `/properties/naver-my-ads`와 같은 status list로 통합하고 포털별 탭 또는 redirect 처리. |
| 55 | Desktop CTI 수신 팝업 | **둘 다 부적합** | 발신자 식별→이전 상담→통화→상담/콜백/업무 생성의 30초 흐름은 국내 CTI 고유 mini-workspace. |

## 7. 디자인 시스템에 실제로 배치하는 방법

### 7.1 Attio에서 1차로 가져올 5개 recipe

1. **AppShell**
   - 사무소/사용자, 업무 객체군, Favorites/최근 항목, 전역 검색, 빠른 등록을 안정된 위치에 둔다.
   - 페이지마다 새로운 서브사이드바를 만들지 않는다.

2. **DataIndex**
   - `PageHeader → 저장 뷰 → 필터/정렬/열/밀도 → 표·칸반·지도 → 선택 상세` 순서를 고정한다.
   - 매물, 연락처, 구매고객, 광고, 거래, 파트너, 직원, 업체에 같은 recipe를 사용한다.

3. **RecordWorkspace**
   - 고정 신원 헤더, 3–5개 즉시 행동, Overview/Activity/Relations/Files 같은 탭, 접히는 상세 속성 패널을 사용한다.
   - 매물·고객·구매조건·거래·파트너에 기본 적용한다.

4. **ActivityTimeline**
   - 전화, 상담, 업무, 메모, 가격·상태 변경, AI/MCP 변경을 한 시간축에 넣고 type filter를 둔다.
   - `ActivityLog.actor/source/before/after`를 사람이 읽는 이벤트로 번역한다.

5. **PipelineView**
   - 표↔칸반, 단계별 건수/금액, time in stage, 다음 행동, 관계 record 미리보기를 공통화한다.
   - MatchStage, DealStage, 광고 lifecycle은 서로 다른 상태기계로 유지한다.

### 7.2 Notion에서 2차로 가져올 5개 패턴

1. **차분한 표면과 타이포:** warm neutral과 작은 그림자, 장식색 절제는 유지하되 선택·경계·위험 대비는 현재보다 높인다.
2. **Side peek / full page 승격:** 목록 문맥을 유지하는 빠른 조회와 복잡한 편집의 URL 전체 화면을 명확히 구분한다.
3. **DocumentWorkspace:** 계약 특약, 내부 지침, 상담 상세 메모는 블록형 본문·목차·댓글을 사용한다.
4. **Owner + verification:** 계약 템플릿, 광고 지침, 사무소 문서에는 소유자·최종 검토일·검증 만료를 붙인다.
5. **관계 표시:** 관련 문서를 inline linked view로 보여주되 실제 관계는 Prisma FK/관계 테이블이 소유한다.

### 7.3 둘 다에서 가져오지 않을 것

- 무제한 사용자 정의 객체/속성으로 Prisma의 source of truth를 우회하는 기능
- 사용자가 업무 핵심 KPI를 마음대로 제거할 수 있는 완전 자유 대시보드
- 12px 이하 저대비 본문과 넓은 빈 캔버스
- 색만으로 상태를 구분하는 tag/board
- drag 한 번으로 계약·입금·정산 상태가 확정되는 상호작용
- 페이지 공유가 `office_id` 격리나 역할 권한보다 우선하는 모델
- AI가 기록을 조용히 수정하고 결과 문장만 남기는 방식

## 8. 화면별 최종 소유권

디자인 시스템을 한 제품처럼 일관되게 만들려면 “누구를 참고할지”보다 **어떤 recipe가 화면을 소유하는지**를 고정해야 한다.

| Recipe | 1차 기준 | 적용 화면 |
|---|---|---|
| `AppShell` | Attio | 전역 셸, 검색, 빠른 등록, 즐겨찾기 |
| `DataIndex` | Attio | 매물, 연락처, 구매고객, 상담, 광고, 거래, 파트너, 직원, 업체 |
| `RecordWorkspace` | Attio | 매물·연락처·구매고객·거래·파트너 상세 |
| `DocumentWorkspace` | Notion + Juro/Documenso | 계약, 자료실, 템플릿, 긴 상담 메모 |
| `TaskCalendar` | Attio + Notion | 업무는 Attio, 캘린더 표현은 Notion |
| `ApprovalInbox` | Estate 고유 + Linear | AI 검토함, 위험 변경 승인 |
| `UnitMatrix` | Estate 고유 + 국내 중개 프로그램 | 관리단지·동·호실 |
| `MapSplit` | Estate 고유 + Reonomy/CoStar | 매물 지도, 광고 원문 위치 검토 |
| `FinanceLedger` | Estate 고유 + Xero/Bigcapital/Ramp | 캐시플로우, 원장, 파트너/직원 정산, 고정비 |
| `ConversationWorkspace` | Estate 고유 + Chatwoot/Intercom | 중개방, 문의, 공유매물 |
| `CallWorkspace` | Attio + 국내 CTI | 통화 목록·전사·요약과 수신 팝업 |
| `AgentOps` | Estate 고유 + Langfuse/Braintrust | AI trace, 비용, 실패, diff, 승인 |

## 9. 최종 디자인 결정

### 1차 기준 — Attio

다음 항목은 설계 리뷰에서 Attio를 먼저 대조한다.

- 앱 셸과 전역 quick action
- 데이터 목록·저장 뷰·bulk action
- 레코드 상세의 신원/행동/활동/관계 구조
- 연락처·구매고객·매칭·거래 파이프라인
- 통화/상담이 record context로 들어오는 방식
- 객체·워크플로 권한을 설명하는 방식

### 2차 기준 — Notion

다음 항목에서만 Notion을 먼저 대조한다.

- 차분한 중성색과 표면 톤
- 문서·특약·지식 본문
- side peek와 full page의 문맥 전환
- 파일/PDF/미디어의 본문 배치
- 댓글, owner, 검증 만료
- 캘린더의 밀도와 연결 문서

### Estate ERP 고유 기준

다음은 Attio/Notion을 섞어 만들지 말고 별도의 컴포넌트·검수 기준을 둔다.

- `UnitMatrix`: 동·층·라인·호실
- `PropertyMapSplit`: 지도↔표 동기화
- `ApprovalInbox`: AI/MCP diff 승인
- `ContractEditor`: A4·조항·당사자·자동값·버전
- `PaymentTimeline`과 `FinanceLedger`
- `BrokerageConversation`: 대화·공유매물·문의
- `CTIPopup`: 수신자 식별과 30초 후속 입력

결론적으로 `DESIGN_SPEC.md`의 “Notion처럼 차분한 업무 도구”는 아래처럼 해석을 바꾸는 것이 안전하다.

> **“Attio처럼 행동과 관계가 명확하고, Notion처럼 차분하게 읽히는 고밀도 중개 운영 도구.”**

이 문장이 이후 앱 셸, 표, 레코드, 문서, 상태, AI 승인 디자인의 공통 판단 기준이 된다.

## 10. 공식 출처 모음

### Attio

- [데이터 모델: objects, lists, views](https://attio.com/help/reference/attio-101/attios-data-model/define-your-data-model-objects-lists-and-views)
- [레코드 생성과 레코드 페이지](https://attio.com/help/reference/managing-your-data/records/create-and-view-records)
- [칸반 뷰](https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views)
- [뷰 필터와 정렬](https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views)
- [레코드 활동](https://attio.com/help/reference/managing-your-data/records/add-record-activities)
- [업무](https://attio.com/help/reference/productivity-collaborating/tasks)
- [객체 접근 권한](https://attio.com/help/reference/managing-your-data/objects/manage-access-to-objects)
- [워크플로](https://attio.com/help/reference/automations/workflows/overview-of-workflows)
- [보고서](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports)
- [Ask Attio](https://attio.com/help/reference/attio-ai/ask-attio/chat-with-ask-attio)
- [Call Intelligence](https://attio.com/help/reference/productivity-collaborating/call-intelligence)

### Notion

- [데이터베이스의 개념](https://www.notion.com/help/what-is-a-database)
- [뷰·필터·정렬·열기 방식](https://www.notion.com/help/views-filters-and-sorts)
- [관계와 rollup](https://www.notion.com/help/relations-and-rollups)
- [데이터베이스 레이아웃](https://www.notion.com/help/guides/build-the-perfect-workflow-with-customizable-layouts)
- [데이터베이스 설정](https://www.notion.com/help/customize-your-database)
- [Dashboard view](https://www.notion.com/help/dashboards)
- [데이터베이스 버튼](https://www.notion.com/help/database-buttons)
- [Teamspace](https://www.notion.com/help/intro-to-teamspaces)
- [공유와 권한](https://www.notion.com/en-gb/help/sharing-and-permissions)
- [위키와 검증 페이지](https://www.notion.com/en-gb/help/wikis-and-verified-pages)
- [파일과 미디어](https://www.notion.com/help/images-files-and-media)
- [Notion Agent](https://www.notion.com/help/guides/get-started-with-your-personal-agent-in-notion)
- [Enterprise Search](https://www.notion.com/product/enterprise-search)
- [Calendar view](https://www.notion.com/en-gb/help/calendars)

## 11. 후속 데모 이미지·HTML용 재사용 화면 recipe 20종

39개 라우트마다 서로 다른 레이아웃을 새로 만들면 시각 일관성이 깨지고 비교안만 117개가 된다. 아래 20개 recipe를 공통 골격으로 만들고, recipe마다 **구조 변형 A/B/C**를 한 번씩 제작하면 최대 60개 프레임으로 모든 라우트를 검증할 수 있다. 색·타이포·버튼 모양을 바꾼 안은 구조 변형으로 세지 않는다.

### 공통 변형 축

모든 recipe의 세 안은 다음 네 축만 의도적으로 바꾼다.

1. **정보 위계:** 신원/현재상태, 오늘 처리할 일, 분석 요약, 예외·위험 중 무엇을 첫 시선에 두는가.
2. **패널:** 1면 집중형, 목록+상세 2패널, 탐색+작업+컨텍스트 3패널 중 무엇을 쓰는가.
3. **뷰:** table, board, map, calendar, timeline, document, conversation 중 어떤 표현이 기본인가.
4. **상호작용:** 빠른 조회, 인라인 편집, 다중 선택·일괄 작업, drag, 단계형 입력, 승인·undo 중 무엇을 중심 행동으로 두는가.

### Recipe와 3개 구조 변형

| # | 재사용 recipe | 적용 라우트/작업면 | 변형 A | 변형 B | 변형 C | 비교할 핵심 축 |
|---:|---|---|---|---|---|---|
| 1 | **AuthGate** | `/login` | 중앙 단일 카드: 로그인만 노출 | 좌측 제품 신뢰/도움 + 우측 폼 | 사무소 선택/최근 계정 + 폼 | **위계:** 입력 vs 안내. **패널:** 1/2. **상호작용:** owner 이메일·직원 ID 자동판별 vs 명시 선택. 최종안은 40–60대에게 오류가 가장 설명적인 구조를 고른다. |
| 2 | **WorkspaceSetup** | `/register`, `/onboarding/office` | 화면당 1질문 단계형 | 좌측 단계목록 + 우측 폼 | 최소 생성 후 시작 체크리스트 | **위계:** 계정 vs 사무소. **패널:** 1/2. **상호작용:** wizard vs progressive setup. 회원가입은 A, 사무소 후속 설정은 C가 유력하다. |
| 3 | **AppShell** | 전역 authenticated 셸 | 220px 고정 사이드바 + 48px 헤더 | 축소 가능한 72/224px rail | 사이드바 + 즐겨찾기/최근항목 보조 drawer | **위계:** 업무 객체 vs 최근 문맥. **패널:** 1 navigation/2 navigation. **상호작용:** hover 확장, `⌘K`, 빠른 등록. 페이지별 서브사이드바는 어느 안에도 두지 않는다. |
| 4 | **ActionDashboard** | `/dashboard` | 오늘 처리 큐 우선, KPI는 아래 | KPI/위험 2열 + 하단 활동 | 역할별 대시보드 탭 + drill-down drawer | **위계:** 행동 vs 분석. **패널:** 1/2. **뷰:** queue/chart. **상호작용:** KPI 클릭→필터 원장. owner와 agent 데이터 범위를 같은 프레임에 섞지 않는다. |
| 5 | **ApprovalInbox** | `/inbox`, AI 운영/HITL | 목록 + 480px diff 상세 | 범주/목록/diff 3패널 | 카드 스택 + 한 건 집중 검토 | **위계:** 영향·위험 vs 생성시각. **패널:** 2/3/1. **뷰:** dense row/card. **상호작용:** J/K, 승인·거절·보류, 일괄 승인, undo. 위험 mutation은 B가 유력하다. |
| 6 | **AIChatCanvas** | `/ai-chat` | 대화 1면 + inline 결과 카드 | 대화 + 우측 결과물 canvas | 좌측 대화목록 + 대화 + 레코드 컨텍스트 3패널 | **위계:** 대화 vs 결과물. **패널:** 1/2/3. **뷰:** chat/document/record. **상호작용:** 출처 열기, 결과 저장, mutation diff 승인. 긴 보고서는 B, 빠른 검색은 A가 적합하다. |
| 7 | **DataIndex** | `/properties`, `/properties/external-listings`, `/properties/naver-my-ads`, `/contacts`, `/buyer-requirements`, `/consultations`, `/partner-brokers`, `/employees`, `/service-vendors` | 전폭 고밀도 table + row sheet | table + 480–560px 고정 peek | 저장 뷰 목록 + table/board 본문 | **위계:** 식별열 vs 상태/다음행동. **패널:** 1+overlay/2/2. **뷰:** table↔board. **상호작용:** 다중 선택·bulk, 열·밀도, 저장 필터. 기본은 B, 저빈도 관리 화면은 A가 유력하다. |
| 8 | **MapSplitIndex** | `/properties` map view, 광고 위치 검토 | 지도 65% + 결과목록 35% | 결과 table 55% + 지도 45% | 전폭 지도 + 하단 비교 tray | **위계:** 공간 탐색 vs 행 비교. **패널:** 좌우/상하. **뷰:** map+table. **상호작용:** pin↔행 동기화, 현재 지도 재검색, 선택 2–4건 비교. 중개 운영 기본은 A다. |
| 9 | **RecordWorkspace** | `/properties/$id`, `/contacts/$id`, `/buyer-requirements/$id`, 매칭/거래/파트너/직원/업체 상세 | 중앙 활동 + 좌측/우측 속성 rail | 고정 헤더 + 탭 본문 + 우측 다음행동 | 목록 문맥을 남긴 560px quick sheet | **위계:** 신원·현재상태·다음행동. **패널:** 3/2/sheet. **뷰:** overview/activity/relations. **상호작용:** quick action, 관계 점프, edit history. 전체 상세는 B, 빠른 조회는 C로 역할을 나눈다. |
| 10 | **StructuredWizard** | `/properties/new`, `/contacts/new`, `/buyer-requirements/new`, `/buyer-requirements/$id/edit` | 상단 stepper + 한 열 폼 | 좌측 단계 + 중앙 폼 + 우측 live summary | 한 화면 섹션형 + sticky 검증/저장 rail | **위계:** 현재 입력 vs 완성 결과. **패널:** 1/3/2. **상호작용:** 임시저장, 중복 경고, 조건부 단계, 영향 preview. 매물은 B, 연락처는 A보다 더 짧은 quick create, 구매조건 편집은 C가 유력하다. |
| 11 | **UnitMatrix** | `/sites`, 동·호실 배치판, 호실 상세 | 좌측 단지 + 중앙 격자 + 우측 호실 상세 | 전폭 격자 + hover preview/sheet | 단지 overview 위 + 동별 격자 아래 | **위계:** 공간 구조 vs 선택 호실. **패널:** 3/1+sheet/상하. **뷰:** floor×line grid. **상호작용:** sticky 축, 확대/축소, 키보드 이동, 상태 layer toggle. 1440×900 주 작업은 A가 유력하다. |
| 12 | **TaskIndex** | `/tasks` | 오늘/지연 그룹의 고밀도 목록 | table↔board 저장 뷰 | 좌측 내 업무 범주 + 중앙 목록 + 우측 객체 peek | **위계:** 마감 vs 관련 객체. **패널:** 1/2/3. **뷰:** list/table/board. **상호작용:** 빠른 완료·재배정·일괄변경. 개별 agent는 A, manager는 C가 적합하다. |
| 13 | **OperationsCalendar** | `/calendar` | 월 grid + 우측 agenda | 주 time-grid + 좌측 layer filters | agenda/table + mini calendar | **위계:** 날짜 조망 vs 오늘 실행. **패널:** 1+drawer/2. **뷰:** month/week/agenda. **상호작용:** drag, 빠른 생성, 계약·업무 record 열기, 재무 layer toggle. 월은 A, 통화·방문 일정은 B, 마감 관리는 C가 적합하다. |
| 14 | **PipelineWorkspace** | `/matches`, `/deals`, 광고 lifecycle | 전폭 kanban + card peek | grouped table + 우측 상세 | 상단 funnel/위험 + 하단 table↔board | **위계:** 단계 vs 체류·위험. **패널:** 1+sheet/2/상하. **뷰:** kanban/table/report. **상호작용:** drag+undo, 단계변경 dialog, 일괄 담당, 구성 record drill-down. 운영 기본은 B, 회의용은 A/C다. |
| 15 | **CallWorkspace** | `/calls`, `/calls/logs`, CTI 팝업 | 통화 목록 + 전사/오디오 상세 | 목록 + 상세 + 연락처/후속조치 3패널 | 수신 mini popup → 통화 후 확장 sheet | **위계:** 발신자 식별 vs 전사 vs 다음행동. **패널:** 2/3/popup. **뷰:** transcript/timeline/log table. **상호작용:** 타임스탬프 재생, 연락처 연결, 상담·업무 생성, 재처리. 일반 기록은 B, 실시간 수신은 C다. |
| 16 | **ContractDocumentWorkspace** | `/contracts`, 계약 상세·편집기·지급일정 | 계약 table 허브 + 우측 preview | 목차/문서/필드 3패널 editor | 계약 overview + 지급 timeline + 문서 탭 | **위계:** 상태·다음 지급 vs 문서 내용. **패널:** 2/3/상하. **뷰:** table/document/timeline. **상호작용:** 조항 편집, 자동값 검증, 버전 비교, 서명·지급 상태 분리. 허브 A, 편집 B, 진행관리 C로 모두 유지한다. |
| 17 | **FinanceControl** | `/cashflow`, `/cashflow/ledger`, `/cashflow/partner-commissions`, `/cashflow/employee-settlements`, `/cashflow/my-settlement`, `/cashflow/expenses` | 요약+30/90일 흐름+위험 큐 | 전폭 원장 table + 증빙/활동 peek | 정산 대상 grouped table + 승인 drawer | **위계:** 전망 vs 원천 거래 vs 승인. **패널:** dashboard/2/2. **뷰:** chart+queue/ledger/settlement. **상호작용:** drill-down, subtotal, 기간 잠금, 승인·재오픈, CSV. 캐시플로우 A, 원장 B, 파트너·직원 정산 C로 분기한다. |
| 18 | **ConversationWorkspace** | `/network`, 공유매물·문의함 | 방 목록/대화/컨텍스트 3패널 | 문의 table + 우측 대화 preview | 공유매물 feed + 하단 thread | **위계:** 대화 vs 구조화 문의/매물. **패널:** 3/2/1+thread. **뷰:** chat/table/feed. **상호작용:** 공개범위 preview, 상태변경, 답변 연결, 만료·철회. 일상 방은 A, owner 처리 큐는 B가 적합하다. |
| 19 | **AssetLibrary** | `/documents`, `/documents/photos` | 문서 table + 우측 preview/metadata | 사진 촬영일 timeline + info panel | 관련 객체별 gallery + bulk toolbar | **위계:** 검색 메타데이터 vs 시각 자산. **패널:** 2/2/1+toolbar. **뷰:** table/timeline/gallery. **상호작용:** OCR 검색, 대량선택, 관계 연결, 대표사진·순서, 삭제 vs 관계해제. 문서는 A, 사진 탐색은 B, 매물 편집 문맥은 C다. |
| 20 | **SettingsConsole** | `/settings` | 좌측 카테고리 + 720px 섹션 폼 | 설정 검색 + 결과 anchor + 본문 | 관리자 현황/위험 요약 + 설정 drawer | **위계:** 범주 vs 검색 vs 위험. **패널:** 2/1/2. **뷰:** form/audit table/key ledger. **상호작용:** 섹션별 저장, 변경요약, owner-only, 키 생성·폐기, 영향 확인. 평상시 A, 대규모 설정은 B, 보안/MCP는 C가 적합하다. |

### 데모 제작 규칙

- 각 recipe는 **1440×900, 동일 토큰, 동일한 현실적 한국 중개 데이터**로 A/B/C를 나란히 만든다.
- 세 안 사이에서 색상·폰트·radius만 바꾸지 않는다. 구조 변형은 반드시 정보 위계, 패널, 뷰, 상호작용 중 두 축 이상이 달라야 한다.
- 공통 컴포넌트는 같은 형태를 유지한다. 예를 들어 `StatusBadge`, `MoneyText`, `EntityChip`, 필터 칩이 변형마다 다른 스타일이 되면 구조 비교가 불가능하다.
- 한 route가 여러 recipe를 사용할 수 있다. `/properties`는 `DataIndex + MapSplitIndex`, `/contracts`는 `DataIndex + RecordWorkspace + ContractDocumentWorkspace` 조합이다.
- 최종 선택은 예쁜 안이 아니라 `첫 행동까지 시간`, `한 화면에서 보이는 핵심 레코드 수`, `패널 왕복 횟수`, `오류·위험 발견률`로 검증한다.

먼저 데모화할 8개는 `AppShell`, `DataIndex`, `RecordWorkspace`, `UnitMatrix`, `PipelineWorkspace`, `ContractDocumentWorkspace`, `FinanceControl`, `ConversationWorkspace`다. 이 8개가 확정되면 나머지 12개는 같은 토큰과 패널 규칙으로 빠르게 파생할 수 있다.
