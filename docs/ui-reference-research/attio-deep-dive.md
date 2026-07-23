# Estate ERP용 Attio UI 심층 분석

- 조사일: 2026-07-17
- 제품: [Attio](https://attio.com/) — 상용 CRM
- 조사 범위: 앱 셸, records/objects/lists/views, table, kanban, record page, activity, tasks/notifications, reports, workflows, permissions/settings, Ask Attio와 AI attributes
- 적용 대상: 40–60대 한국 공인중개사가 주로 1440×900 데스크톱에서 사용하는 Estate ERP Web/Desktop
- 근거 범위: 공개 접근 가능한 Attio 공식 Product 페이지와 Help Center, 그 안에 포함된 공식 이미지. 로그인 뒤 최신 화면은 직접 검증하지 않았고 공개 자료로 확인되지 않는 기능은 추정하지 않았다.

## 1. 결론부터

Attio는 Estate ERP가 참고할 상용 UI 중 **레코드 중심 업무 구조가 가장 선명한 후보**다. 특히 `얕은 앱 셸 → 저장된 view → 고밀도 table/kanban → 단일 record workspace → activity/tasks`로 이어지는 문법이 일관된다. 고객, 구매조건, 매칭, 거래처럼 같은 객체를 여러 맥락에서 반복해서 보는 Estate ERP에 잘 맞는다.

다만 Attio를 전면 복제하면 안 된다. Attio는 범용 GTM CRM이므로 부동산 고유의 지도, 단지→동→호실, 양측 수수료, 법정 계약 일정, 광고 채널 상태가 없다. 또한 미세한 회색 텍스트, 작은 아이콘, 속성 중심 용어는 40–60대 중개사에게 학습비용과 가독성 부담을 줄 수 있다.

따라서 권장 결정은 다음과 같다.

| 영역 | 결정 | 이유 |
|---|---|---|
| 앱 셸·전역 검색·빠른 등록 | 강하게 채택 | 반복 탐색 거리를 줄이고 객체/업무 맥락을 안정적으로 유지한다. |
| 목록 table와 저장 view | 강하게 채택 | 매물·고객·요구조건의 많은 필드를 같은 규칙으로 다룰 수 있다. |
| record page와 activity | 강하게 채택 후 도메인화 | 고객/거래의 사실·관계·활동을 한 workspace로 묶는 구조가 좋다. |
| kanban | 매칭·거래에만 선택 채택 | stage 흐름에는 유용하지만 매물장·연락처 기본 화면으로는 정보 손실이 크다. |
| map | Attio를 기준으로 삼지 않음 | 공식 문서상 운영 view는 table/kanban이고, map은 reporting 시각화로 확인된다. |
| tasks/notifications | 보조 패턴만 채택 | Attio Notifications는 알림/요청 popover이며 Estate ERP의 판단형 `/inbox`를 대체하지 못한다. |
| reports | 시각 문법 채택, 지표는 고정 recipe 우선 | 자유 구성 dashboard보다 중개업 KPI와 클릭 가능한 예외 큐가 먼저다. |
| workflow canvas | 관리자 고급 기능으로 유보 | 시각적으로 명확하지만 일반 중개사에게는 조건·트리거 모델이 과하다. |
| Ask Attio/AI attributes | 상호작용 원칙만 채택 | 외부 MCP + HITL 전략에 맞춰 근거, 권한, 변경 diff, 확인, 감사로그를 유지해야 한다. |

## 2. 조사 근거와 한계

### 2.1 공식 근거

- [Navigating your workspace](https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace): sidebar, Home, Notifications, Tasks, Records, Lists, Reports, Automations, Ask Attio Chats.
- [Objects, lists, views 데이터 모델](https://attio.com/help/reference/attio-101/attios-data-model/define-your-data-model-objects-lists-and-views): 같은 record를 여러 업무 맥락과 저장 view로 조직하는 방식.
- [Table views](https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views)와 [Kanban views](https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views): view 유형, 속성 표시, filter/sort, 계산, stage 이동.
- [Create and view records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records)와 [Configure record pages](https://attio.com/help/reference/managing-your-data/records/configure-record-pages): record header, 행동, tabs, details, relationships, activity.
- [Tasks](https://attio.com/help/reference/productivity-collaborating/tasks), [Notifications](https://attio.com/help/reference/account-settings/notifications): 전역/record 업무와 알림·요청 UI.
- [Dashboards](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/dashboards), [Reports](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports), [Reporting product page](https://attio.com/platform/reporting): 대시보드 구성, drill-down, funnel/time-in-stage, geospatial report.
- [Workflows](https://attio.com/help/reference/automations/workflows/create-a-workflow): trigger-step canvas, draft/publish, run 구조.
- [List access](https://attio.com/help/reference/managing-your-data/lists/lists-access), [Sharing and permissions](https://attio.com/help/reference/productivity-collaborating/sharing-and-permissions): workspace/team/member/workflow 수준 접근 제어.
- [Ask Attio](https://attio.com/help/reference/attio-ai/ask-attio/chat-with-ask-attio), [AI attributes](https://attio.com/help/reference/attio-ai/ai-attributes): 문맥형 AI, 권한 상속, 제안 확인, 신뢰도/출처.

### 2.2 확인하지 못한 것

- 실제 로그인 계정의 2026-07-17 build와 공개 Help Center 이미지가 픽셀 단위로 동일한지는 확인하지 못했다.
- 공식 문서가 `table`과 `kanban`을 view 유형으로 명시하므로 **운영용 map view는 확인되지 않았다**. 반면 공식 Reporting 페이지는 geospatial mapping을 명시한다. 따라서 “지도 기능이 전혀 없다”가 아니라 “목록을 조작하는 map view는 공개 근거가 없다”가 정확한 표현이다.
- Attio가 범용 action inbox를 제공한다는 공개 근거는 없다. 공식 navigation은 Notifications, Tasks, Emails 등을 별도로 설명한다.
- 이미지의 색과 치수는 공식 토큰 문서가 아니다. 후반의 수치는 공식 스크린샷을 관찰해 Estate ERP에 맞게 조정한 **설계 recipe**다.

## 3. Attio를 이해하는 핵심: object와 list를 분리한다

Attio에서 record는 회사, 사람, 거래 등 하나의 실체다. object는 같은 종류의 record schema이며, list는 그 record를 특정 업무 프로세스에 올려놓는 맥락이다. 같은 회사 record가 `Strategic Accounts`, `Customer Success`, `Event Invitees` 등 여러 list에 들어가도 원본 신원은 하나로 유지된다. list에는 해당 프로세스에서만 필요한 stage, owner, due date 같은 속성을 추가할 수 있다.

Estate ERP로 옮기면 다음 대응이 가장 자연스럽다.

| Attio 개념 | Estate ERP 대응 | 주의 |
|---|---|---|
| Object | Property, Contact, BuyerRequirement, Match, Deal, Contract, PartnerBroker | 사용자 UI에는 “객체” 대신 매물·고객·거래라는 현업 용어를 쓴다. |
| Record | 개별 매물·연락처·구매조건·거래 | `office_id` tenant 격리는 view filter가 아니라 서버 불변조건이다. |
| List | 오늘 확인할 매물, 계약예정 거래, 후속연락 고객 같은 업무 맥락 | list를 사용자가 무한 생성하게 하기보다 검증된 저장 view를 먼저 제공한다. |
| List attribute | 해당 업무에서만 필요한 stage, 담당, 후속일 | Prisma의 정규화된 source of truth와 충돌하는 임의 필드를 남발하지 않는다. |
| View | 표/칸반 + filter/sort/visible columns | 사용자 개인 view와 사무소 공유 view를 명시적으로 구분한다. |

이 분리는 Estate ERP의 `Contact`와 `ContactRelation`, `Property`와 광고/검증 업무, `BuyerRequirement`와 `Match`에 특히 유용하다. 한 고객을 매도인/매수인 중 하나로 고정하지 않고, 신원 record는 하나로 유지하면서 관계와 업무 맥락을 별도로 보여줄 수 있기 때문이다.

## 4. 화면 구조별 분석

### 4.1 앱 셸

![Attio workspace shell](../ui-reference-assets/attio-deep-dive/01-workspace-shell-sidebar.png)

관찰된 구조:

- 접고 펼칠 수 있는 단일 sidebar 안에 workspace control, quick actions/search, Home/Notifications/Tasks 등의 공통 업무, Records, Lists, Ask Attio Chats가 위계적으로 들어간다.
- 메인 panel은 페이지 제목, 현재 view, `View settings`, filter/sort, primary action을 같은 상단 문법으로 반복한다.
- favorite record/list/dashboard를 sidebar로 끌어와 반복 탐색 거리를 줄인다.
- 키보드 shortcut과 command search가 주요 기능이지만, sidebar 탐색도 그대로 유지된다.

Estate ERP 적용:

- 현재 `홈/매물/고객/거래/네트워크/운영` 6개 현업 그룹은 유지한다. Attio처럼 Records/Lists라는 기술적 분류로 바꾸지 않는다.
- sidebar 폭과 시각 소음을 줄이고, 전역 검색과 빠른 등록을 상단 고정 행동으로 둔다.
- 개인 즐겨찾기는 `자주 쓰는 저장 뷰`, `최근 고객`, `오늘 거래` 정도로 제한한다. 무제한 pin은 sidebar를 다시 복잡하게 만든다.
- `Cmd/Ctrl+K`, `/`, `N` 같은 shortcut을 제공하되 40–60대 사용자가 아이콘만으로 학습하도록 강요하지 않는다. 메뉴 label과 tooltip을 항상 제공한다.

피할 점:

- Attio의 Records/Lists/Chats 섹션을 그대로 복제해 한 도메인이 여러 sidebar 구역에 중복되는 것.
- 작은 흑백 아이콘과 연한 회색 텍스트만으로 현재 위치를 표현하는 것.
- favorite와 사용자 생성 view가 핵심 업무 메뉴보다 위로 쌓이는 것.

### 4.2 Table view

![Attio table view](../ui-reference-assets/attio-deep-dive/02-table-view.png)

Attio table의 강점:

- 첫 열에 record identity를 고정하고 나머지 열은 attribute로 다룬다.
- 열 표시/순서, filter, multi-sort, formatting을 view마다 저장한다.
- cell에서 값을 바로 바꾸고, 필요하면 attribute edit history를 확인한다.
- 일괄 선택 후 list 추가, workflow 실행, email, delete 같은 context action을 제공한다.
- 숫자 열 아래 calculation을 붙여 count, sum, average 등 집계를 현재 view와 함께 읽게 한다.

Estate ERP에 가장 강하게 적용할 페이지는 `/properties`, `/contacts`, `/buyer-requirements`, `/consultations`, `/partner-brokers`다. 단, 중개 도메인의 열 우선순위는 Attio보다 훨씬 강하게 고정해야 한다.

권장 고정 열:

- 매물장: 주소/단지·동호, 거래유형, 가격, 면적, 검증상태, 소유자, 최근연락, 광고상태, 만료/다음행동.
- 연락처: 이름/전화, 관계, 관련 매물·구매조건, 최근 상담, 다음 연락, 담당.
- 구매고객: 희망지역, 예산, 면적, 필수조건, 후보수, 최근 연락, 후속일.

대상 연령을 고려해 Attio보다 row와 대비를 키운다. primary text 14px, secondary 13px, row 40px를 기본으로 하고, 36px compact mode는 사용자가 선택할 때만 허용한다. 상태는 색뿐 아니라 dot+label 또는 icon+label로 표현한다.

### 4.3 Kanban

![Attio kanban view](../ui-reference-assets/attio-deep-dive/03-kanban-view.png)

공식 문서에서 확인되는 기능은 stage drag-and-drop, 카드에 표시할 attribute 선택, 빈 값 숨김, stage/카드 축소, filter/sort, 관계 attribute 사용, 계산, time-in-stage다. 특히 열과 카드를 축소해 넓은 pipeline을 한 화면에서 보는 방식은 정보 밀도 조절에 유용하다.

Estate ERP 적용:

- `/matches`: `추천 → 구매고객 연락 → 방문 → 소유자 연락 → 협상 → 거래생성 → 종료`의 보조 view.
- `/deals`: `선정 → 가계약/계약금 → 계약 → 잔금/완료 → 종료`의 pipeline view.
- `/tasks`: 상태별 board는 보조 view로 유지하되 due date/관련 고객을 숨기지 않는다.

피할 점:

- `/properties`와 `/contacts`의 기본 화면을 kanban으로 만드는 것. 카드에서는 가격·면적·동호·연락·광고 등 비교 열이 사라진다.
- stage 이동만으로 법적/금전 상태가 완료되도록 하는 것. 계약금·서명·잔금처럼 필수 정보가 있는 전이는 검증 dialog를 거쳐야 한다.
- 색이 비슷한 stage dot만으로 상태를 구분하는 것.

### 4.4 Record page

![Attio record page overview](../ui-reference-assets/attio-deep-dive/04-record-page-overview.png)

Attio record page는 다음 층으로 나뉜다.

1. 상단 identity: 이름, icon/logo, favorite, 빠른 행동.
2. 왼쪽 details rail: 핵심 attribute와 list membership.
3. 중앙 tabs: Overview, Activity, Emails, Notes, Tasks, Files, Calls, 관계 tab.
4. highlight widgets: object별 최대 6개 중요 속성.
5. object 단위 page configuration: tab, section, relationship, action 순서.

이 구조는 `/contacts/$id`, `/buyer-requirements/$id`, `/properties/$id`, 거래 상세에 가장 적합하다. 하지만 모든 객체에 같은 tab을 강제하면 안 된다.

권장 object별 변형:

- 연락처: 신원/전화/관계 rail + 활동 timeline + 관련 매물/구매조건/거래 + 다음업무.
- 구매조건: 고객·예산·지역·기한 고정 header + 조건/추천매물/상담/매칭/활동 tabs.
- 매물: 대표 사진·주소·동호·검증·가격 header + 소유자/가격이력/광고/문서/상담. 사진·공적장부가 중요한 만큼 Attio의 일반 record보다 도메인화가 필요하다.
- 거래: stage·매물·양측·예정완료일 header + 수수료/지급/계약/참여자/활동. 매도측과 매수측 수수료는 별도 block으로 유지한다.

Attio의 사용자가 page layout을 구성하는 기능은 Estate ERP 초기에 복제하지 않는다. 사무소별 layout이 달라지면 지원과 교육이 어려워진다. 대신 역할별 기본 recipe와 열 표시 정도만 개인화한다.

### 4.5 Activity timeline

![Attio activity timeline](../ui-reference-assets/attio-deep-dive/05-record-activity-timeline.png)

Attio는 calendar event, 수동 activity, note, attribute update, list entry update, record creation, upcoming task를 한 시간축에서 보여준다. 예정과 과거를 시간 구획으로 나누고, 한 이벤트의 actor·대상·상태를 짧게 압축한다.

Estate ERP가 채택할 점:

- 전화, 상담, 문자/이메일, 가격 변경, 검증, 광고 전송, 방문, 계약일정, 업무를 한 시간축에서 타입별 filter한다.
- 화면상 사람이 읽는 활동 문장과 원본 audit metadata를 연결한다.
- `PriceHistory`와 `ActivityLog`를 같은 의미로 합치지 않는다. 예: “매매가 15.8억→15.5억”은 활동 카드로 보이되, 원본 before/after·actor·source는 상세에서 확인한다.
- 예정 업무와 법정/금전 마감을 timeline 상단에 고정하고, 과거 로그에 묻히지 않게 한다.

Attio처럼 모든 변경을 같은 크기의 회색 문장으로 만들면 중요한 계약/금액 이벤트가 사소한 필드 수정과 섞인다. Estate ERP는 `법정/금전`, `고객 접촉`, `일반 변경`의 시각적 위계를 둬야 한다.

### 4.6 Tasks, Home, Notifications와 “Inbox”의 차이

![Attio home tasks](../ui-reference-assets/attio-deep-dive/06-home-tasks.png)

Attio Tasks는 전역 Tasks page와 record별 Tasks tab에 같은 업무를 노출한다. `t` shortcut, `@record`, `@assignee`, 자연어 due date, due date/assignee grouping, 완료 표시가 공개 문서에서 확인된다. Home은 오늘·내일·지연된 assigned task를 짧게 보여준다.

![Attio notifications](../ui-reference-assets/attio-deep-dive/07-notifications.png)

Notifications는 mentions, replies, email access, task assignment 같은 알림과 Requests를 작은 overlay에서 처리한다. 이는 Estate ERP의 전역 알림 bell에는 적합하지만 `/inbox`와는 목적이 다르다.

| 화면 | Attio에서 얻을 것 | Estate ERP에서 추가할 것 |
|---|---|---|
| `/dashboard` | 오늘 업무와 meeting을 작은 섹션으로 배치 | 미확인 매물, 잔금, 임대만료, AI 검토 등 부동산 예외 큐 우선 |
| `/tasks` | 전역/record 양쪽 접근, group/filter, 빠른 생성 | TaskSource, 시스템 규칙 이유, 고객/매물/거래 context, 법정 기한 |
| 알림 bell | Notifications/Requests 2-tab overlay, 직접 이동 | 매물·거래·네트워크 유형, 읽음/보류, source 표시 |
| `/inbox` | compact list와 요청 tab의 시각 문법만 참고 | AI 제안 근거, before/after diff, 승인/거절/보류/undo, 영향 객체를 가진 3분할 검토 workspace |

결론적으로 Attio Notifications를 Estate ERP 업무함의 레퍼런스로 과대평가하면 안 된다. `/inbox`는 알림 센터가 아니라 **결정과 실행을 위한 HITL queue**다.

### 4.7 Reporting과 map의 정확한 위치

![Attio reporting dashboard](../ui-reference-assets/attio-deep-dive/08-report-dashboard.png)

Attio dashboard는 여러 report를 resize/reorder하고 권한을 설정한다. 공식 Reports 문서는 Insight, Historical values, Funnel, Time in stage, Stage changed를 구분하고 contributing data drill-down과 filter를 설명한다. 이 분류는 Estate ERP 보고 설계에도 좋다.

- Insight: 현재 매물 수, 미확인 수, 예정 수수료, 미수금.
- Historical: 월별 신규 매물, 가격변경, 거래액, 회수율.
- Funnel: 추천→방문→협상→거래 전환.
- Time in stage: 검증 지연, 협상 체류, 계약 후 잔금 대기.
- Stage changed: 이번 달 계약/완료 진입 건수와 금액.

![Attio geospatial report](../ui-reference-assets/attio-deep-dive/09-report-map.png)

공식 Reporting 페이지는 geospatial mapping을 제공한다고 명시한다. 그러나 공식 view 문서는 table과 kanban만 설명한다. 따라서 Attio map은 지역 분포를 보는 **분석 chart**에는 참고할 수 있지만, `/sites`나 `/properties`에서 지도 위 매물을 선택·편집하는 운영 UI의 기준으로는 부족하다.

Estate ERP는 PostGIS를 활용해 별도의 `table ↔ map split`을 설계해야 한다. 지도 selection과 table selection을 양방향 동기화하고, marker cluster, 현재 viewport filter, 거리, 법정동 경계를 지원해야 한다.

### 4.8 Workflow automation

![Attio workflow canvas](../ui-reference-assets/attio-deep-dive/10-workflow-canvas.png)

Attio workflow는 하나 이상의 trigger와 step을 canvas에서 연결하고, 선택한 block 설정을 오른쪽 panel에서 편집한다. draft/publish, invalid block 표시, enable toggle, run viewer, permission이 공식 문서에서 확인된다. Ask Attio가 자연어로 block을 구성하되 사용자가 검토하고 publish한다.

Estate ERP에서는 다음 수준으로 나누는 것이 안전하다.

1. 일반 중개사: “임대만료 30일 전 업무 생성”, “검증 지연 알림” 같은 한글 recipe 선택.
2. 사장/관리자: 대상, 담당, 기한, 알림 채널을 form으로 조정.
3. 고급 관리자/MCP: 조건 분기와 실행 로그를 읽는 rule builder. canvas는 필요가 검증된 뒤 제공.

시각 canvas를 곧바로 도입하면 rule engine의 강력함보다 학습 부담이 먼저 드러난다. Estate ERP 1차 UI에서는 rule list, human-readable 조건 요약, 최근 실행/오류, pause가 우선이다.

### 4.9 Settings와 permissions

![Attio list permissions](../ui-reference-assets/attio-deep-dive/11-list-permissions.png)

Attio는 list/dashboard/workflow마다 Workspace, Teams, Members, Automations의 access를 설정하고 Full access, Read and write, Read only, No access를 구분한다. 권한 설정을 tabular하게 보여주고 각 수준의 결과를 설명하는 점은 좋다.

Estate ERP 적용 원칙:

- `owner / manager / agent` RBAC와 `office_id` tenant 격리를 UI 설정과 분리한다. tenant 격리는 절대 사용자가 완화할 수 없다.
- 설정 화면에는 “누가 무엇을 볼 수 있는가”를 사람이 읽는 요약으로 먼저 보여주고, 세부 matrix는 펼쳐본다.
- 수금/정산, 직원, MCP key, AI 실행 권한은 도메인 단위로 명시한다.
- 자동화/MCP도 사람과 동일하게 actor와 최소 권한을 가진 주체로 표시한다.

피할 점:

- Attio처럼 workspace 기본 권한과 개인/팀 권한의 우선순위를 모든 일반 사용자에게 노출하는 것.
- `No access`가 더 넓은 기본 권한을 이기지 못하는 복잡한 precedence를 그대로 복제하는 것.
- UI에서 숨겼다는 이유로 API 권한도 안전하다고 간주하는 것.

### 4.10 Ask Attio와 AI attributes

![Ask Attio home](../ui-reference-assets/attio-deep-dive/12-ask-attio-home.png)

Ask Attio는 Home, sidebar chat history, quick actions, record, call, workflow editor에서 접근한다. 중요한 설계는 별도 “AI 섬”이 아니라 **현재 보고 있는 record/call/workflow 문맥을 우선하는 것**이다. 공식 문서는 Ask Attio가 사용자의 view permission을 따르고, record/task/note 변경 제안을 사용자가 확인해야 실제 변경된다고 설명한다.

![Ask Attio call recap](../ui-reference-assets/attio-deep-dive/13-ask-attio-call-summary.png)

도구 검색/녹취 읽기와 최종 요약을 단계적으로 보여주는 패턴은 AI가 무엇을 근거로 답했는지 이해시키는 데 유용하다. 다만 Estate ERP는 녹취 개인정보, 통화 동의, 보관 정책과 상담 전환을 더 명확히 표시해야 한다.

![AI attribute confidence](../ui-reference-assets/attio-deep-dive/14-ai-attribute-confidence.png)

![AI web research attribute](../ui-reference-assets/attio-deep-dive/15-ai-web-research-attribute.png)

AI attributes는 text/number/currency/select 계열 필드를 summarize, web research, prompt completion, classify로 채우고, web research 결과에 confidence와 source를 붙일 수 있다. 공식 문서는 일부 작업이 notes/emails가 아니라 record attribute만 참조한다는 제한과 credit 사용도 명시한다.

Estate ERP 적용:

- 내장 AI chat을 중심으로 만들기보다 외부 Codex/ChatGPT가 MCP로 제안하고 `/inbox`에서 검토하는 현재 전략을 유지한다.
- AI 생성 값은 원본과 같은 평문 값처럼 보이지 않게 `AI 제안`, confidence, source, 생성시각을 붙인다.
- 가격, 계약, 수수료, 개인정보 변경은 자동 적용하지 않는다. before/after diff와 승인 actor가 필요하다.
- 통화 요약은 `요약/요구조건/약속/다음업무/불확실 항목`으로 구조화하고 각 항목에서 녹취 timestamp로 돌아갈 수 있게 한다.
- ActivityLog의 `actor = mcp:Codex`, `source = mcp/system`을 화면에 읽기 쉬운 label로 노출한다.

## 5. Estate ERP 라우트별 적용 매핑

### 5.1 홈

| 라우트 | Attio 적합도 | 가져올 패턴 | 반드시 보완/회피 |
|---|---:|---|---|
| `/dashboard` | 중 | Home의 오늘 task/meeting, report dashboard의 drill-down | 자유 dashboard builder보다 긴급 예외 큐를 고정. KPI 카드 과다 금지. |
| `/inbox` | 낮음 | Notifications/Requests의 compact queue, 현재 항목 강조 | 일반 알림 overlay로 축소하지 않기. 근거/diff/영향/승인/undo 3분할 유지. |
| `/tasks` | 높음 | 전역과 record 양쪽 접근, grouping/filter, 빠른 생성 | TaskSource와 규칙 이유, 관련 고객/매물/거래, 법정 기한 추가. |
| `/calendar` | 낮음~중 | Home/quick actions의 upcoming meeting과 record 연결 | 월/주/일/agenda, 재무 overlay, drag 일정은 Estate 자체 설계 유지. |

### 5.2 매물·단지·광고

| 라우트 | Attio 적합도 | 가져올 패턴 | 반드시 보완/회피 |
|---|---:|---|---|
| `/properties` | 높음 | 고정 identity 열, 저장 view, visible columns, filter/sort, bulk action, inline edit history | 주소·가격·면적·검증·소유자·광고·다음행동 열을 고정. 실수 위험 필드는 인라인 편집 제한. |
| `/properties/$id` | 중~높음 | identity header, action row, details rail, Overview/Activity/Files/Tasks | 대표사진, 동호, 소유자, 가격이력, 광고, 공적장부를 전용 tab/section으로 구성. |
| `/properties/new` | 중 | quick create, template에 따른 필드 노출 | Site→Dong→Unit 관계, 단위 변환, 중복 주소/호실 검증을 별도 단계로 제공. |
| `/sites` | 낮음 | record/list 관계와 저장 view | 운영 map, 동/호실 grid, Site→Dong→Unit hierarchy는 Attio로 해결 불가. |
| `/properties/external-listings` | 중 | list-specific stage/owner/due date, table/kanban 전환 | 포털 원본·묶음·추론 호수·중복 후보를 분리하고 출처를 보존. |
| `/properties/naver-my-ads` | 중 | stage/status table, filter, bulk action | 네이버 상태·검증·만료·오류·재전송을 채널 고유 상태로 표시. 일반 CRM stage와 혼합 금지. |

### 5.3 고객·요구조건·상담·통화

| 라우트 | Attio 적합도 | 가져올 패턴 | 반드시 보완/회피 |
|---|---:|---|---|
| `/contacts` | 높음 | person table, 저장 view, 관계 attribute, bulk action | 전화번호와 관계를 우선. 개인/법인, 다중 역할, 중복 병합 후보를 강화. |
| `/contacts` quick sheet | 중~높음 | record quick action과 details 요약 | 전화/문자/상담/업무를 상단 고정하고 전체 record page를 축소 복제하지 않기. |
| `/contacts/$id` | 매우 높음 | record workspace, Activity/Tasks/Files/relationship tabs | 고객 관계, 관련 매물/요구/거래, 최근 통화와 다음행동을 부동산 문법으로 재배치. |
| `/contacts/new` | 중 | 전역 quick create와 최소 필드 | 전화 입력 즉시 중복 검사, 관계/매물 연결은 저장 후 다음 행동으로 제안. |
| `/buyer-requirements` | 높음 | custom object + table/list views | 고객 이름보다 지역·예산·면적·기한·매칭·다음연락을 우선. |
| `/buyer-requirements/$id` | 높음 | record header, 관계 tabs, activity | 추천 근거와 거절/보류 이유, m²/평·만원/억원 동시 표시, 매칭 영향 추가. |
| `/buyer-requirements/new` | 중 | template 기반 create | 복수 지역, 필수/선호, 입주기한을 단계형으로 수집. 범용 attribute form 금지. |
| `/buyer-requirements/$id/edit` | 낮음~중 | edit history와 actor 표시 | 변경으로 재평가될 match 수와 before/after를 보여준다. 신규 form 그대로 재사용하지 않기. |
| `/consultations` | 높음 | Activity table/timeline, record linking, task creation | 상담유형·결과·후속일·관련 매물/요구조건을 구조화. note 한 덩어리로 저장 금지. |
| `/calls` | 중 | Calls page, transcript/summary/record linking, pinned context | Attio는 화상회의 중심이다. Estate는 Android 전화 녹음·수신자 식별·상담 전환·동의 상태를 우선. |
| `/calls/logs` | 중 | search/filter, transcript timestamp, insight template | 오디오/전사/요약/관련 고객을 같은 시간축에 두고 실패·미연결 상태를 표시. |

### 5.4 매칭·거래·계약·수금/정산

| 라우트 | Attio 적합도 | 가져올 패턴 | 반드시 보완/회피 |
|---|---:|---|---|
| `/matches` | 높음 | table↔kanban saved views, time-in-stage, 관계 attribute | 구매조건과 매물 양쪽 요약, 적합 근거/가격차/접촉단계를 표시. 불투명 점수 하나로 축약 금지. |
| `/deals` | 높음 | deal record + pipeline kanban + activity/tasks | 매도/매수 양측, 공동중개, 예정완료일, 수수료·미수 위험을 고정 header로 강화. |
| 거래 상세 | 높음 | configurable record sections, related records, activity | Deal→Contract→Participant 관계와 양측 수수료 block을 전용 component로 만든다. |
| `/contracts` | 낮음~중 | record/task/activity 연결, stage reporting | 계약서 editor, 당사자, 특약, 계약금/중도금/잔금 schedule은 Attio 범위를 벗어난다. |
| `/cashflow` | 중 | dashboard, filter, drill-down, current user scope | 회계 상태를 CRM stage로만 표현하지 말고 예정/청구/수납/배분/지급을 분리. |
| `/cashflow/ledger` | 낮음~중 | dense table, calculated total, edit history | 원장 불변성, 거래 연결, 입출금 방향, 정정/취소는 전용 회계 규칙 적용. |
| `/cashflow/partner-commissions` | 낮음 | related record와 task | 공동중개사, 매도/매수측, 지급예정/지급완료, 증빙을 전용 표로 유지. |
| `/cashflow/employee-settlements` | 낮음 | owner/assignee grouping, report | 사무소 commissionConfig, 역할별 배분, 확정/지급/이의 상태가 필요. |
| `/cashflow/my-settlement` | 낮음~중 | current user filter와 read-only report | 직원이 계산 근거와 거래별 배분을 읽되 임의 수정할 수 없게 한다. |
| `/cashflow/expenses` | 낮음 | settings table의 단순성 | 반복비, 유효기간, 부가세, 증빙 등 비용 전용 form을 사용. |

### 5.5 네트워크·운영·설정

| 라우트 | Attio 적합도 | 가져올 패턴 | 반드시 보완/회피 |
|---|---:|---|---|
| `/network` | 낮음~중 | list membership, comments/mentions, notification | room membership, 공유매물 snapshot, 문의/메시지 흐름은 대화형 workspace로 별도 설계. |
| `/partner-brokers` | 높음 | companies table/record, relationships, activities | 외부 중개사와 내부 Office tenant를 혼동하지 않고 공동중개/미정산/최근연락을 우선. |
| `/employees` | 중 | members/teams/settings table, access summary | owner/manager/agent, 로그인 ID, 정산 규칙, 활성상태를 현업 용어로 표현. |
| `/service-vendors` | 높음 | company directory, saved filters, activity | 업종·지역·연락·최근 의뢰·평가 근거를 추가. 별점 하나로 신뢰 단정 금지. |
| `/documents` | 중 | Files tab, cloud storage link, record relationship | 공적장부 유형, 발급일, 대상 property, 만료/재발급, preview를 전용화. |
| `/documents/photos` | 낮음~중 | record-linked file와 comment | 부동산 사진의 공간별 묶음, 대표사진, 순서, 광고 사용 여부는 별도 gallery가 필요. |
| `/settings` | 중~높음 | 좌측 settings nav, 권한 matrix, workflow access, AI credit/permission 설명 | 멀티테넌시와 RBAC는 서버 불변조건. MCP key scope/revocation와 감사로그를 더 명확히 표시. |
| `/ai-chat` (Web) | 중 | context-aware Ask composer, record/call entry, tool progress | 외부 MCP 전략을 유지하고 write는 `/inbox` 검토로 보낸다. 일반 챗과 실행 제안을 구분. |
| `/login`, `/register`, `/onboarding/office` | 근거 부족 | workspace 개념과 settings 연결 정도 | 공개 자료만으로 Attio의 최신 가입/온보딩 UI를 평가하지 않는다. 기존 Clerk 흐름과 국내 사무소 설정 요구를 기준으로 설계. |

## 6. 40–60대 공인중개사에 맞춘 수정 원칙

Attio가 세련되어 보이는 이유는 요소가 작아서가 아니라 **같은 문법을 반복하고 장식보다 데이터 관계를 앞세우기 때문**이다. Estate ERP는 그 원리는 유지하되 가독성을 올려야 한다.

| Attio에서 관찰되는 경향 | Estate ERP 조정 |
|---|---|
| 작은 icon, 얇은 gray border, 낮은 대비의 secondary text | 아이콘 16–18px, 클릭 영역 최소 36px, secondary text 대비 4.5:1에 가깝게 강화 |
| row와 card가 매우 compact | 기본 row 40px, compact 36px는 선택 옵션; 1440×900에서 17–19행 목표 |
| color dot와 pastel tag | 색+한글 label+형태를 함께 사용; `검증필요`, `계약중`, `보류`를 명시 |
| object/list/attribute 같은 추상 용어 | 매물장, 구매고객, 광고, 상담, 거래, 수금 등 현업 용어 사용 |
| keyboard shortcut 강조 | shortcut은 가속 장치로 제공하되 모든 행동에 가시적 버튼/메뉴 유지 |
| 자유로운 page/list 구성 | 역할별 검증된 recipe를 기본으로 하고 개인화는 열/필터/즐겨찾기 수준부터 시작 |
| 국제 SaaS식 날짜·통화 | `2026. 07. 17.`, 만원/억원, m²/평, 동·층·호를 동시에 이해할 수 있게 표현 |

## 7. 채택·수정·비채택 결정표

### 그대로 가까이 채택

- page title → view selector → filter/sort → primary action의 반복 상단 구조.
- record identity, 빠른 행동, details rail, content tabs의 계층.
- 같은 데이터의 table/kanban saved view와 view별 visible columns.
- 전역 task와 record-linked task의 양방향 접근.
- activity에서 actor, time, target, change를 짧은 문장으로 표현.
- report data point에서 실제 contributing records로 drill-down.
- AI가 현재 record/call context를 우선하고 사용자의 permission을 따르는 원칙.

### 도메인에 맞게 수정

- Attio Lists → 사무소 공유 저장 뷰와 개인 저장 뷰.
- Details rail → 부동산 핵심 사실과 법정/금전 위험을 우선한 summary rail.
- Kanban drag → 필수 정보가 있는 stage 전환 dialog.
- Notifications → 단순 알림 bell에만 사용하고 업무함은 별도 3분할.
- AI attributes → 출처·confidence·검토 상태를 가진 제안 값.
- Dashboard builder → 역할별 preset dashboard + 제한된 배치 조정.

### 비채택

- Records/Lists/Chats라는 기술 용어 중심 sidebar.
- 사용자마다 완전히 다른 record page와 schema를 만드는 자유도.
- 연한 gray text와 pastel color만으로 상태를 구분하는 스타일.
- 운영 map을 reporting map으로 대신하는 것.
- 법적·금전 stage를 단순 drag-and-drop으로 확정하는 것.
- AI 생성 필드를 일반 확정 데이터처럼 조용히 저장하는 것.
- 일반 사용자에게 workflow canvas와 복잡한 permission precedence를 기본 노출하는 것.

## 8. 1440×900 Attio 파생 시각 토큰과 layout recipe

아래 값은 Attio의 공식 디자인 토큰이 아니다. 공개 스크린샷의 비례와 명암을 관찰한 뒤 Estate ERP 대상 연령과 밀도에 맞게 조정한 구현/이미지 생성 기준이다.

### 8.1 색과 표면

```text
canvas                 #FBFBFB
surface                #FFFFFF
surface-subtle         #F4F5F7
border                 #D9DDE3
border-subtle          #E8EAED
text-primary           #262626
text-secondary         #5F6368
text-muted             #757B80
accent                 #2563EB
success                #18794E
warning                #9A5B00
danger                 #B42318
focus-ring             rgba(37, 99, 235, 0.28)
```

- 배경은 warm-neutral에 가깝게 유지하되 본문 contrast를 Attio 공개 이미지보다 한 단계 높인다.
- radius는 button/input 6px, panel/card 8px, pill 999px. 큰 16–24px rounded card는 사용하지 않는다.
- shadow는 dropdown/popover에만 `0 8px 24px rgba(0,0,0,.10)`, 주요 page section은 1px border로 구분한다.
- status background는 8–12% tint, text와 dot은 충분한 대비를 가진 진한 색으로 쓴다.

### 8.2 글자와 아이콘

```text
font-family            Pretendard, Inter, system-ui, sans-serif
page-title             20px / 28px, 650
section-title          15px / 22px, 650
body-primary           14px / 20px, 450–550
body-secondary         13px / 18px, 450
caption                12px / 16px, 500 (보조 정보에만)
icon-default           16px
icon-primary-action    18px
minimum-hit-area       36×36px
```

### 8.3 앱 셸 recipe

```text
viewport               1440×900
sidebar-expanded       216px
sidebar-collapsed      52px
workspace/top bar      48px
page header            52px
view toolbar           44px
content padding        16px horizontal, 12px vertical
```

- sidebar는 6개 현업 그룹, 현재 route 강조, 전역 검색, 빠른 등록, 사용자 menu를 가진다.
- page header에는 breadcrumb보다 현재 page title과 scope가 먼저다.
- view toolbar에는 저장 view, 결과 수, filter, sort, 표시 열, export, primary action을 한 줄로 둔다.
- 1440px에서 고정 secondary sidebar를 추가하지 않는다. 필요 정보는 sheet 또는 record rail로 전환한다.

### 8.4 고밀도 table recipe

```text
usable content width   1224px (sidebar 제외)
table header           38px
default row            40px
compact row            36px
frozen identity col    240–280px
numeric columns        right-aligned
visible rows           약 17–19행
bulk action bar        bottom floating, 44px
```

- 첫 열은 체크박스+identity+보조 식별자를 함께 담고 고정한다.
- 중요한 6–8열은 처음부터 보이고 나머지는 표시 열에서 선택한다.
- cell hover는 옅은 배경과 edit affordance를 함께 제공한다.
- 위험한 값은 double click 즉시 저장보다 popover 확인 또는 undo를 둔다.

### 8.5 Record workspace recipe

```text
content width          1224px
record header          72px
tab bar                40px
details rail           304px
main activity area     920px
rail divider           1px, draggable only where useful
timeline item min      48px
```

- header 1행: identity, status, owner, critical date; 2행: 전화/상담/업무/편집 같은 빠른 행동.
- 왼쪽 rail은 핵심 8–12개 attribute만 먼저 표시하고 `전체 보기`로 확장한다.
- 중앙은 object별 4–6개 tab으로 제한한다. 탭을 가로 scroll해야 할 정도로 늘리지 않는다.
- 법정/금전 alert는 tabs 아래 고정 alert strip으로 두고 timeline에만 묻지 않는다.

### 8.6 Kanban recipe

```text
board padding          12px
column width           272px
column gap             12px
collapsed column       48px
card padding           10px 12px
card gap               8px
card visible fields    identity + 최대 4개
```

- 4개 열을 한 화면에 보고, 이후 열은 horizontal scroll한다.
- 열 header에는 stage, count, 합계/평균, 지연 건수를 표시한다.
- 카드에는 고객/매물 identity, 금액, 다음 행동, 체류일만 둔다.
- drag 후 필수 입력이 필요한 경우 작은 transition sheet를 연다.

### 8.7 Dashboard와 업무함 recipe

- Dashboard: 첫 행은 4개 KPI가 아니라 `오늘 조치할 큐` 60% + `오늘 일정/업무` 40%. 두 번째 행부터 pipeline/report를 배치한다.
- `/inbox`: 320px queue / 560px proposal detail / 344px context-impact rail. 중앙 하단에 승인·거절·보류를 고정한다.
- 알림 popover: 360px, Notifications/Requests 또는 `알림/승인요청` 2-tab, 최대 8개 후 전체 보기.
- empty state는 큰 illustration 대신 이유, 다음 행동, filter 초기화 버튼을 240px 안에서 짧게 제공한다.

## 9. 데모 UI 이미지 생성 prompt에 반영할 특징

### 9.1 공통 prompt block

```text
1440x900 desktop-first Korean real-estate brokerage ERP, inspired by Attio's
record-centric information architecture but not a pixel clone. Warm near-white
canvas, crisp white surfaces, subtle 1px neutral borders, compact 216px left
sidebar grouped as 홈/매물/고객/거래/네트워크/운영, 48px top context bar,
high-density but readable data, Pretendard typography, 14px primary text,
40px table rows, clear Korean labels, small restrained 6-8px corner radius,
no gradients, no glassmorphism, no oversized cards, no marketing hero, no huge
empty whitespace. Use realistic Korean brokerage data, prices in 만원 with 억원
helper text, area in m² and 평, address/동/층/호, visible owner, status, deadline,
recent contact and next action. Status must use icon or dot plus text, never color alone.
```

### 9.2 매물장 table prompt block

```text
Main content is a spreadsheet-like property ledger with frozen identity column,
saved-view selector, search, filter chips, sort and visible-column controls.
Columns: 주소/단지·동호, 거래유형, 가격, 면적, 검증상태, 소유자, 최근연락,
광고상태, 만료/다음행동. Show 17-19 rows, subtle row hover, one selected row,
compact bottom bulk-action bar. Include a secondary table/map toggle but do not
replace the operational table with a decorative map.
```

### 9.3 고객/거래 record prompt block

```text
Record workspace with a 72px identity header and clear quick actions, a 304px
left details rail, and a wide center activity workspace. Tabs are object-specific:
개요/활동/상담/관련매물/업무 for a contact, or 개요/수수료/지급/계약/활동 for
a deal. Activity timeline groups 예정/오늘/이번 주/과거 and visibly separates
customer contact, financial or legal events, and ordinary field changes. Add a
single compact alert strip for overdue follow-up or unpaid commission.
```

### 9.4 매칭/거래 kanban prompt block

```text
Attio-like dense kanban with 272px columns, compact cards, stage count, total
amount and overdue count in every header. Cards show buyer or deal identity,
linked property, budget/price difference, next action and days in stage. Four
columns visible at once, minimal shadows, clear drag affordance. Avoid colorful
toy-like cards and do not hide essential money or deadline fields.
```

### 9.5 AI 검토함 prompt block

```text
Three-pane human-in-the-loop review workspace: 320px proposal queue, 560px
before/after change detail, 344px context and affected-record rail. Show evidence
links, confidence, actor 'mcp:Codex', source, proposed field changes, audit impact,
and fixed 승인/거절/보류 controls with undo notice. This is not a chatbot and not
a generic notification center. No magic sparkle decoration; trust comes from
evidence, permissions, diff and reversible actions.
```

### 9.6 관리단지/지도 prompt block

```text
Keep the Attio-derived compact shell and view toolbar, but use an Estate-specific
split workspace: 44% searchable site/property table and 56% operational map with
marker clusters, legal-dong boundary, synchronized selection and a bottom preview.
When a site is selected, open a domain panel showing Site → Dong → Unit hierarchy
and a Korean apartment 동·호수 grid. Do not use Attio's reporting map as the main
interaction model.
```

### 9.7 Negative prompt

```text
Avoid Notion-like blank document canvas, giant rounded cards, glass blur, neon
gradient, excessive pastel tags, tiny light-gray text, unlabeled icons, mobile
layout, consumer real-estate portal styling, stock photography, decorative KPI
donuts, English placeholder data, arbitrary AI sparkles, and a pixel-for-pixel
copy of Attio branding or assets.
```

## 10. 최종 권장안

Attio에서 가장 가치 있는 것은 색상이나 미니멀한 외형이 아니라 **같은 record를 목록, pipeline, activity, task, report, AI context에서 일관되게 재사용하는 구조**다. Estate ERP는 이 구조를 바탕으로 `Property/Contact/BuyerRequirement/Match/Deal`의 workspace 문법을 통일하되, 지도·단지·광고·계약·수수료는 별도의 부동산 전문 UI로 유지해야 한다.

첫 시각 프로토타입은 Attio 파생 셸 안에 `/properties` 고밀도 table와 `/contacts/$id` record workspace를 나란히 만들어, 같은 토큰과 행동 문법이 목록과 상세에서 실제로 이어지는지 확인하는 것이 가장 효과적이다.

## 11. 이미지 provenance

공식 이미지 15개의 원본 URL, 문서 페이지, 화면 의미, 권리 메모는 [Attio 이미지 출처 목록](../ui-reference-assets/attio-deep-dive/SOURCES.md)에 정리했다. 모든 이미지는 Attio의 상용 저작물이며 이 프로젝트의 오픈소스 자산으로 간주하면 안 된다.
