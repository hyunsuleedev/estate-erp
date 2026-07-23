# Estate ERP UI 레퍼런스 조사 보고서

> 조사일: 2026-07-17  
> 범위: Desktop/Web의 실존 라우트·숨은 보조 화면 39종, 세부 작업면을 포함한 55개 기능 단위  
> 대상 사용자: 40–60대 한국 공인중개사, 1440×900 데스크톱 우선, 높은 정보 밀도  
> 용어: 요청의 “sass 오픈소스”는 문맥상 **SaaS 오픈소스**로 해석했다.

## 1. 결론부터

Estate ERP에는 한 제품을 통째로 닮게 만드는 것보다 아래처럼 업무 성격별 강점을 조합한 **고밀도 운영형 데스크톱 SaaS**가 맞다.

| 영역 | 오픈소스 기준점 | 상용 기준점 | Estate ERP에 적용할 핵심 |
|---|---|---|---|
| 앱 셸·레코드 | [Twenty](https://github.com/twentyhq/twenty) | [Attio](https://attio.com/), [HubSpot CRM](https://www.hubspot.com/products/crm) | 얕은 사이드바, 전역 검색·빠른 등록, 객체별 저장 뷰, 레코드 본문+활동 타임라인 |
| 문서·레이아웃 문법 | Paperless-ngx, Documenso | [Notion](https://www.notion.com/), Juro | side peek/full page 승격, 고정 핵심 속성+접히는 상세, 관계 칩, 문서·댓글·검증일 |
| 고밀도 목록·뷰 | [Teable](https://github.com/teableio/teable) | [Airtable Views](https://www.airtable.com/platform/views) | 표/칸반/지도 전환, 열 고정·숨김·재정렬, 필터 칩, 행 밀도 전환 |
| 업무함·업무 | [Plane](https://github.com/makeplane/plane), [Vikunja](https://github.com/go-vikunja/vikunja) | [Linear Triage](https://linear.app/docs/triage), [Asana My Tasks](https://help.asana.com/s/article/my-tasks?language=en_US) | AI 검토는 근거가 있는 승인 큐, 개인 업무는 시간 구획·저장 뷰, 문맥 안에서 즉시 완료 |
| 고객·상담·통화 | [Frappe CRM](https://github.com/frappe/crm), [Meetily](https://github.com/Zackriya-Solutions/meetily) | [Attio](https://attio.com/), [HubSpot CRM](https://www.hubspot.com/products/crm), [Gong](https://help.gong.io/docs/review-what-happened-in-a-call) | 한 화면에 신원·요구·활동·다음 할 일, 오디오-전사-구조화 요약과 후속조치 연결 |
| 거래·파이프라인 | Frappe CRM, Twenty | [Pipedrive](https://www.pipedrive.com/en/features/pipeline-management) | 단계별 금액·체류일·다음 행동이 보이는 표/칸반 이중 뷰 |
| 계약·문서 | [Documenso](https://github.com/documenso/documenso) | [Juro](https://intercom.help/juro/en/articles/5653144-managing-contracts-using-custom-dashboards-views), [DocuSign](https://www.docusign.com/products/electronic-signature), [PandaDoc](https://www.pandadoc.com/) | 계약 저장 뷰와 문서 중심 작업공간, 당사자/특약/지급일정/서명상태의 동시 가시성 |
| 수금·정산 | [Bigcapital](https://github.com/bigcapitalhq/bigcapital), [ERPNext](https://github.com/frappe/erpnext) | [Xero](https://www.xero.com/au/accounting-software/dashboard/), [Stripe Dashboard](https://docs.stripe.com/dashboard/basics) | 요약→예정→미수→원장 drill-down, 모든 금액에 출처·상태·변경이력 |
| 중개방 | [Chatwoot](https://github.com/chatwoot/chatwoot) | [Slack](https://slack.com/), [Intercom Inbox](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained) | 방 목록/대화/매물·문의 컨텍스트의 3패널 구조 |
| 문서·사진 | [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx), [Immich](https://github.com/immich-app/immich) | [Google Drive](https://workspace.google.com/products/drive/), [Dropbox](https://www.dropbox.com/) | 미리보기 우선, 메타데이터·연결 객체, 대량 업로드/선택/태깅 |
| 직원·업체 | [Frappe HR](https://github.com/frappe/hrms), [Twenty](https://github.com/twentyhq/twenty) | [Rippling](https://www.rippling.com/), [Ramp](https://support.ramp.com/vendor-management-on-ramp/) | 직원은 역할·정산, 업체는 업종·의뢰·지출을 분리하고 각각의 활동을 탭으로 구성 |
| AI 대화·운영 | [LibreChat](https://github.com/danny-avila/LibreChat), [Langfuse](https://github.com/langfuse/langfuse) | [ChatGPT Canvas](https://help.openai.com/en/articles/9930697-using-canvas-in-chatgpt), [Braintrust](https://www.braintrust.dev/docs/observe) | 대화와 결과물을 분리, 도구 실행·승인·변경 diff, 추적/비용/오류 감사 |

가장 중요한 방향은 **“큰 빈 문서 캔버스를 모든 업무의 기본값으로 쓰는 현재 해석”에서 “오늘 처리할 일과 다음 행동이 먼저 보이는 운영 콘솔”로 이동하는 것**이다. 구조적 1차 기준은 Attio, 문서·레이아웃 문법의 2차 기준은 Notion으로 삼는다. 매물장은 Teable/Airtable, 업무함은 Plane/Linear, 고객 상세는 Attio/Frappe CRM/HubSpot, 정산은 Bigcapital/Xero, 계약은 Notion의 문서 문법과 Documenso/Juro·PandaDoc의 전문 작업공간을 조합하는 편이 가장 현실적이다.

국내 현업 프로그램인 **부동산이지와 한방은 전체 시각 시스템의 기준점이 아니라 한국 중개 업무의 누락을 막는 도메인 기준점**으로 사용했다. 동·호수 그리드, 공적장부, 포털별 광고 상태, 계약·신고 기한, 통화 후 상담 전환, 전국망·지역망은 해외 SaaS만 보고 설계하면 빠지기 쉬운 부분이다.

## 2. 조사 방식과 한계

1. `nav-config.ts`와 Desktop/Web의 TanStack route 파일을 대조해 화면 유형을 수집했다. 사이드바에 드러나지 않는 구매고객 상세·편집, 통화 로그, 사진 자료, Web AI 채팅도 포함했다.
2. 현재 디자인 기준은 `docs/DESIGN_BRIEF.md`, `docs/web-build/DESIGN_SPEC.md`, 기존 비교 감사 문서와 로컬 스크린샷을 사용했다.
3. 후보는 가급적 공식 저장소 README, 공식 문서, 공식 제품/도움말 페이지의 설명과 이미지를 사용했다. 검색결과 썸네일이나 출처가 불명확한 Dribbble 재가공물은 기준점에서 제외했다.
4. 현재 작업 환경의 인앱 브라우저 세션이 제공되지 않아 로그인 뒤의 상용 제품을 임의 계정으로 탐색하지 않았다. 따라서 공개 공식 제품 페이지·도움말에서 실제로 확인되는 화면만 분석했고, 보이지 않는 상태는 추정하지 않았다.
5. 활동성·릴리스 정보는 조사일 기준이며 바뀔 수 있다. 코드 라이선스와 로고·상표·스크린샷 권리는 별개다.

## 3. 현재 UI의 문제 진단

### 현재 매물장

![현재 매물장 표](./screenshots/properties-datatable-ref.png)

### 현재 관리단지 목록과 상세 시트

![현재 관리단지 목록](./screenshots/sites-v5-01-list.png)

![현재 관리단지 상세 시트](./screenshots/sites-v5-02-sheet.png)

현재 화면에서 반복되는 문제는 다음과 같다.

- 배경·표면·경계선이 모두 밝은 중성색에 가까워서 **제목, 작업영역, 선택행, 위험상태의 계층이 약하다**.
- 카드와 여백이 실제 업무량보다 커서 1440×900에서 보이는 행 수가 적고, 중개사가 종이 매물장처럼 빠르게 훑기 어렵다.
- 일반 shadcn과 Notion의 **큰 문서 캔버스 패턴을 데이터 화면에 그대로 적용한 해석**이 도메인 우선순위를 대신한다. Notion의 다양한 database view·side peek·layout은 유용하지만, 매물의 검증상태·가격·동/층·소유자·광고·만료·다음 연락은 제품이 고정한 순서로 한 시선에 정렬되어야 한다.
- 사이드바와 보조 패널이 동시에 넓은데, 남은 본문에도 큰 공백이 생겨 정보 밀도 대비 화면 점유가 비효율적이다.
- 상세가 시트, 대화상자, 전체 페이지 사이에서 일관된 규칙 없이 바뀌면 사용자가 현재 위치와 저장 여부를 놓치기 쉽다.
- Desktop과 Web이 유사 CSS를 따로 보유해 의미 토큰과 캘린더 등 일부 스타일이 갈라질 위험이 있다.

보존할 장점도 있다. 현재의 따뜻한 중성색, shadcn 기반 접근성, 역할별 메뉴, 빠른 시트 상세는 버릴 필요가 없다. 다만 **명도 대비, 밀도, 상태표현, 레코드 구조**를 강화해야 한다.

## 4. 목표 UI 시스템

### 4.1 화면 골격

```text
┌──────── 220~232px 사이드바 ────────┬──────────── 48px 전역 헤더 ────────────────┐
│ 사무소/사용자                       │ 검색 · 빠른등록 · 최근항목 · 알림           │
│ 홈/매물/고객/거래/네트워크/운영     ├────────────────────────────────────────────┤
│ 즐겨찾기 저장 뷰                    │ 페이지 헤더: 제목 · 범위 · 기본 행동          │
│                                     ├────────────────────────────────────────────┤
│                                     │ 뷰 탭 · 필터 칩 · 정렬 · 열 · 밀도           │
│                                     ├──────────────────────┬─────────────────────┤
│                                     │ 주 목록/보드/지도      │ 480~560px 빠른 상세  │
└─────────────────────────────────────┴──────────────────────┴─────────────────────┘
```

- 전역 셸은 Twenty와 Linear처럼 얕고 안정적으로 유지한다. 페이지마다 별도 서브사이드바를 남발하지 않는다.
- 목록 행을 열면 기본은 오른쪽 빠른 상세, 복잡한 편집·계약·감사 로그는 전체 상세 페이지로 승격한다.
- 페이지 헤더 아래의 뷰·필터·열·밀도 툴바 위치를 모든 데이터 화면에서 고정한다.
- 매물, 고객, 구매조건, 거래, 계약 사이의 이동은 브레드크럼만이 아니라 관계 칩과 최근 항목으로 지원한다.

### 4.2 밀도와 가독성

| 항목 | 권고 |
|---|---|
| 본문 글자 | 기본 14px/20px, 보조 12–13px; 40–60대 사용자를 위해 12px 본문 남발 금지 |
| 목록 높이 | `compact 32px / standard 36px(기본) / comfortable 44px` |
| 입력 높이 | 기본 36px, 주요 검색 40px |
| 헤더 | 앱 헤더 48px, 페이지 헤더 56–64px |
| 상세 시트 | 480–560px, 문서·계약은 720px 또는 전체 화면 |
| 카드 | KPI 요약과 독립된 의사결정에만 사용; 데이터 목록을 카드 격자로 바꾸지 않음 |
| 숫자 | 가격·면적·수수료는 tabular numerals, 단위 정렬, 음수/미수/예정 상태 분리 |

### 4.3 색과 상태

- 배경은 따뜻한 중성색을 유지하되 `canvas / sidebar / surface / elevated / selected`를 명확히 분리한다.
- 파란색 또는 청록색 하나만 기본 행동과 선택에 사용하고, 상태색을 장식색으로 쓰지 않는다.
- 상태는 색만으로 구분하지 말고 텍스트·아이콘·형태를 함께 사용한다.
- `unverified → verified → in_contract → hold → done`처럼 순서가 있는 상태는 동일한 색상 팔레트보다 **진행 위치와 다음 행동**이 드러나는 단계 컴포넌트를 쓴다.
- 위험 작업은 빨간 버튼보다 영향 범위, 되돌리기 가능 여부, 감사 로그 생성 여부를 먼저 설명한다.

### 4.4 공통 컴포넌트 계층

```text
Foundations
  color · typography · spacing · radius · shadow · density · motion
shadcn wrappers
  Button · Input · Dialog · Sheet · Popover · Tabs · Table
Domain components
  Money · Area · Address · CheckStatus · RelationChip · AuditActor
  PropertyIdentity · ContactIdentity · DealStage · PaymentStatus
Page recipes
  DataIndex · RecordWorkspace · Pipeline · FinanceLedger
  ConversationWorkspace · DocumentWorkspace · SettingsSection
```

Desktop/Web에 복제된 스타일을 계속 따로 확장하기보다 `packages/ui` 또는 동등한 공유 계층에 토큰, 도메인 셀, 표 툴바, 레코드 셸을 모으는 것이 안전하다.

## 5. 오픈소스 후보 검토

| 프로젝트 | 시각적으로 배울 것 | 라이선스/도입 판단 | 활동성(조사일 기준) |
|---|---|---|---|
| Twenty | 앱 셸, 객체/레코드, 저장 뷰, 커맨드, 관계형 CRM | 대부분 AGPL-3.0, Enterprise 표기 파일 별도. **패턴 참고 후 독립 구현** 권고 | 활발, 2026-07 릴리스 확인 |
| Teable | 스프레드시트형 고밀도 grid, kanban/calendar/gallery/form | Community AGPL-3.0, Enterprise 파일 별도. 표 구현 패턴 참고 | 활발, 2026-07 릴리스 확인 |
| Frappe CRM | 리드/딜 한 화면, 활동 타임라인, 통화, 사용자 정의 뷰 | AGPL-3.0. 고객·상담 UX 참고 | 활발, 2026-07 릴리스 확인 |
| Plane | 업무 목록/보드, 저장 뷰, 분석, 키보드 작업 | AGPL-3.0. 업무함/업무 UX 참고 | 활발, 2026-05 릴리스 확인 |
| Vikunja | 개인 업무의 목록/표/칸반/캘린더와 필터 | [AGPL-3.0-or-later](https://github.com/go-vikunja/vikunja/blob/main/LICENSE). 업무 뷰와 인라인 조작 참고 | 활발, 2026-04 릴리스 확인 |
| Cal.diy | 일정 생성, 예약/캘린더 설정, 온보딩 | [MIT](https://github.com/calcom/cal.diy/blob/main/LICENSE); 팀·조직 등 상용 Cal.com 기능을 제거한 커뮤니티판 | 활동 중, production 사용 주의문 확인 |
| Meetily | 통화·미팅 전사와 구조화 요약 | [MIT](https://github.com/Zackriya-Solutions/meetily/blob/main/LICENSE.md). Community의 전사·요약만 참고하고 화자 분리는 별도 검증 | 활발, 2026-06 릴리스 확인 |
| Bigcapital | 회계 대시보드, 거래·원장, 보고서 구조 | AGPL-3.0. 회계 컴포넌트 직접 가져오기보다 정보구조 참고 | 활발, 2026-06 릴리스 확인 |
| ERPNext | AR, 지급조건, 총계정원장, 운영 도메인 깊이 | GPL-3.0. 시각보다 업무 모델과 표 구조 참고 | 지속 운영 |
| Documenso | 문서 준비, 수신자, 필드 배치, 서명 상태 | AGPL-3.0. 계약 작업공간 참고 | 활발, 2026-06 릴리스 확인 |
| Chatwoot | 방/대화/컨텍스트 3패널, 할당·상태·메모 | [LICENSE](https://github.com/chatwoot/chatwoot/blob/develop/LICENSE): `enterprise/` 밖 커뮤니티 코드는 MIT, Enterprise 코드는 별도 | 활발, 2026-06 릴리스 확인 |
| Paperless-ngx | 문서 목록/카드, 태그, 미리보기, 메타데이터 | GPL-3.0. 자료실 패턴 참고 | 활발, 2026-04 릴리스 확인 |
| Immich | 사진 타임라인, 대량 선택, 정보 패널, 검색 | [AGPL-3.0](https://github.com/immich-app/immich/blob/main/LICENSE). 사진 UX 참고 | 활발 |
| Frappe HR | 직원 디렉터리, 평가·근태·급여 문맥 | GPL-3.0. 직원 화면 참고 | 활발, 2026-07 릴리스 확인 |
| Open Condo | 건물/세대/업체라는 부동산 도메인 구조 | MIT. 화면은 다소 오래되어 **도메인만 참고** | 활동 중, 2026-07 UI 릴리스 확인 |
| LibreChat | 대화, 도구/에이전트 선택, 아티팩트 UX | [MIT](https://github.com/danny-avila/LibreChat/blob/main/LICENSE); 별도 유료 서비스 범위는 구분 | 활동 중 |
| Langfuse | trace 목록, span tree, input/output/비용/지연 | 기본 MIT, `ee/` 제외. AI 감사 화면 참고 | 활동 중 |

### 제외 또는 주의

- NocoDB는 매물 지도 아이디어가 좋지만 현재 라이선스가 OSI 오픈소스가 아닌 Sustainable Use 계열이므로 이 보고서에서는 **source-available 보조 참고**로만 취급한다.
- Open WebUI도 현재 커스텀 브랜딩 조건 때문에 순수 오픈소스 후보로 단정하지 않는다.
- AGPL/GPL 저장소의 JSX·CSS를 직접 복사하면 배포 방식에 따라 의무가 생길 수 있다. 이 프로젝트에서는 공식 화면을 분석해 shadcn/TanStack 기반으로 독립 구현하고, 실제 코드 재사용은 별도 법무·라이선스 검토 뒤 결정하는 편이 안전하다.

## 6. 대표 이미지 아틀라스

아래 이미지는 전체 페이지에서 반복해 사용할 핵심 패턴을 보여준다. 각 페이지 권고표의 `이미지` 열은 이 아틀라스 또는 페이지군별 수집 이미지로 연결된다.

### 6.1 Twenty — CRM 셸과 레이아웃

![Twenty CRM tools](./ui-reference-assets/global/twenty-crm-tools.webp)

![Twenty layouts](./ui-reference-assets/global/twenty-layouts.webp)

**가져올 것:** 얕은 앱 셸, 객체별 목록/칸반, 레코드 관계, 커맨드 중심 작업.  
**피할 것:** 지나치게 작은 저대비 텍스트와 CRM의 영어권 필드 구조를 그대로 적용하는 것.

### 6.2 Teable — 고밀도 grid와 kanban

![Teable grid](./ui-reference-assets/global/teable-grid.png)

![Teable kanban](./ui-reference-assets/global/teable-kanban.png)

**가져올 것:** 같은 데이터의 뷰 전환, 열 중심 조작, 빠른 인라인 편집.  
**피할 것:** 스프레드시트처럼 모든 필드를 무제한 노출해 검증·거래 규칙을 약화하는 것.

### 6.3 Frappe CRM — 고객/리드 단일 작업공간과 통화

![Frappe CRM lead page](./ui-reference-assets/global/frappe-crm-lead-page.png)

![Frappe CRM call UI](./ui-reference-assets/global/frappe-crm-call-ui.png)

**가져올 것:** 핵심 속성, 활동, 메모, 연락 행동을 한 레코드 문맥에 배치.  
**피할 것:** 오른쪽 속성 열을 지나치게 길게 만들어 중요도 없이 모든 필드를 나열하는 것.

### 6.4 Plane과 Linear — 업무·검토 큐

![Plane work items](./ui-reference-assets/global/plane-work-items.webp)

![Linear inbox](./ui-reference-assets/global-commercial/linear-inbox.png)

![Linear triage](./ui-reference-assets/home-customer-commercial/linear-triage.png)

![Linear custom view](./ui-reference-assets/global-commercial/linear-custom-views.png)

**가져올 것:** 개인 업무에는 선택 가능한 고밀도 행·저장 뷰·키보드 이동을, AI 검토 큐에는 제안 근거·변경 diff·승인/거절/보류·undo를 적용한다.  
**피할 것:** 개발 이슈트래커의 용어와 어두운 테마를 그대로 복제하는 것.

### 6.5 HubSpot — 고객 레코드 행동

![HubSpot CRM contact](./ui-reference-assets/global-commercial/hubspot-crm-record.webp)

**가져올 것:** 전화·메일·메모·업무·미팅을 고객 헤더에서 즉시 시작하고, AI 요약을 보조 행동으로 두는 구조.  
**피할 것:** 마케팅/세일즈 기능을 모두 노출해 중개 핵심 업무를 묻히게 하는 것.

### 6.6 Chatwoot — 대화 작업공간

![Chatwoot dashboard](./ui-reference-assets/global/chatwoot-dashboard.png)

**가져올 것:** 대화목록/메시지/고객·객체 컨텍스트의 3패널과 할당·상태.  
**피할 것:** 중개방을 단순 메신저로 축소해 공유 매물과 문의의 구조 데이터를 잃는 것.

### 6.7 Paperless·Frappe HR — 자료와 직원

![Paperless documents](./ui-reference-assets/global/paperless-documents.png)

![Frappe HR](./ui-reference-assets/global/frappe-hrms.png)

### 6.8 Xero·Bigcapital — 현금 흐름과 원장

![Xero cashflow forecast](./ui-reference-assets/global-commercial/xero-cashflow-forecast.png)

![Bigcapital accounting](./ui-reference-assets/deals-ops/bigcapital-screenshot-1.png)

**가져올 것:** 수금 예정과 실제를 시간축으로 분리하고, 요약 카드에서 원장 행까지 내려가는 구조.  
**피할 것:** 회계 용어를 설명 없이 그대로 노출하거나 총 수수료 하나로 매도/매수/파트너/직원 몫을 합치는 것.

### 6.9 Langfuse·Braintrust — AI 실행 감사

![Langfuse trace](./ui-reference-assets/global/langfuse-trace.png)

![Braintrust logs](./ui-reference-assets/global-commercial/braintrust-logs.png)

**가져올 것:** 실행목록→span tree→입력/출력·비용·지연·오류의 drill-down.  
**피할 것:** 기술 trace를 일반 중개사에게 그대로 노출하는 것. 사용자 화면에는 승인·변경·결과 중심, 관리자 화면에는 trace 중심으로 나눈다.

### 6.10 Attio·Airtable — 상용 record와 grid

![Attio record workspace](./ui-reference-assets/home-customer-commercial/attio-record.png)

![Airtable grid](./ui-reference-assets/listings-commercial/airtable-grid.png)

**가져올 것:** 속성/관계/활동의 명확한 구역, expanded record, 저장 뷰와 열 단위 조작.  
**피할 것:** 범용 데이터베이스의 무제한 자유도를 도메인 검증 규칙보다 앞세우는 것.

### 6.11 Attio·Notion 심층 비교 — 운영 골격과 문서 문법

![Attio 고밀도 table view](./ui-reference-assets/attio-deep-dive/02-table-view.png)

![Attio record overview](./ui-reference-assets/attio-deep-dive/04-record-page-overview.png)

![Notion database view switcher](./ui-reference-assets/notion-deep-dive/database-view-switcher.png)

![Notion database layout builder](./ui-reference-assets/notion-deep-dive/database-layout-builder.png)

공식 공개 화면과 도움말을 15개 UI 축, 39개 실제 라우트, 16개 보조 작업면에 대입했다. 최종 판정은 **Attio 19 / Notion 2 / 둘 다 6 / 둘 다 부적합 12**다.

- **Attio가 1차 기준인 이유:** object/record, 저장 view, relation, activity, task, pipeline, report가 같은 레코드 문맥을 유지한다. 매물·연락처·구매조건·매칭·거래의 운영 골격과 가장 잘 맞는다.
- **Notion이 2차 기준인 이유:** table/board/calendar/timeline/gallery/map/dashboard 전환, side peek, 고정 속성+details panel, 문서 본문·댓글·검증이 강하다. 자료실·계약 조항·설정·온보딩·캘린더에 선택적으로 적용한다.
- **둘 다 쓰지 않는 영역:** 동·호수 격자, PostGIS 지도 검색, A4 계약 편집, 수금·정산 원장, CTI 수신, 공동중개 대화, AI diff 승인 큐는 전문 제품과 Estate ERP 고유 recipe가 필요하다.
- **중요한 보정:** Attio도 작은 글자와 compact row가 많아 기본 행을 40px, 본문을 14px로 키운다. Notion은 큰 공백과 사용자 자유 layout을 제한하고 핵심 상태·금액·다음 행동의 위치를 제품이 소유한다.

세부 근거와 이미지 provenance는 [Attio 심층 보고서](./ui-reference-research/attio-deep-dive.md), [Notion 심층 보고서](./ui-reference-research/notion-deep-dive.md), [전 라우트 비교표](./ui-reference-research/attio-notion-route-mapping.md)에 분리했다.

### 6.12 Reonomy·Gong — 지도 검색과 통화 workspace

![Reonomy search and map](./ui-reference-assets/listings-commercial/reonomy-search-map.png)

![Gong transcript workspace](./ui-reference-assets/home-customer-commercial/gong-transcript.jpg)

**가져올 것:** 목록과 지도의 동기화, 검색 필터의 지속성, 녹취/요약/후속행동의 단일 문맥.  
**피할 것:** 해외 상업용 부동산의 owner/contact 모델을 국내 주거·중개 모델에 그대로 적용하는 것.

### 6.13 Pipedrive·Juro — 파이프라인과 계약

![Pipedrive pipeline](./ui-reference-assets/deals-ops-commercial/pipedrive-pv1.png)

![Juro contract views](./ui-reference-assets/deals-ops-commercial/juro-contract-views.png)

**가져올 것:** 단계 집계·카드 사용자 정의, 계약 저장 뷰와 문서 상태.  
**피할 것:** 영업 pipeline을 계약 법적 상태와 동일시하거나, 계약서를 자유형 문서로만 취급하는 것.

### 6.14 Intercom·Rippling — 대화 context와 정산 검토

![Intercom inbox workspace](./ui-reference-assets/deals-ops-commercial/intercom-inbox-workspace.webp)

![Rippling payroll review](./ui-reference-assets/deals-ops-commercial/rippling-payroll-run.png)

**가져올 것:** 답변의 근거 context, 검토 전후 금액 차이와 원천 데이터 연결.  
**피할 것:** AI 답변을 무검증 사실처럼 보이게 하거나, 급여 UX를 중개 수수료 정산 규칙과 혼동하는 것.

### 6.15 DocuWare·Google Photos — 자료 preview와 사진 묶음

![DocuWare document preview](./ui-reference-assets/listings-commercial/docuware-search-preview.png)

![Google Photos stacks](./ui-reference-assets/listings-commercial/google-photos-stacks.png)

**가져올 것:** 검색 결과와 미리보기의 동시 가시성, 유사 사진 묶음과 대표 선택.  
**피할 것:** 파일 폴더와 사진 타임라인만 제공하고 CRM 객체 관계를 숨기는 것.

## 7. 페이지별 조사 — 인증·전역 셸·홈

| 화면/라우트 | 기능 해석 | 오픈소스 1순위 | 상용 1순위 | Estate ERP에 가져올 디자인 | 피할 점·이미지 |
|---|---|---|---|---|---|
| 로그인 `/login` | 사무소 사용자 진입, 오류·계정 복구 | Twenty 인증 화면 | Linear/Slack 로그인 | 가운데 400–440px 단일 카드, owner 이메일 또는 직원 자동발급 아이디를 한 문장으로 설명, MFA·Caps Lock·오류를 입력 바로 아래 표시 | 마케팅 일러스트로 폼을 밀어내지 않기. 인증 실패 원인을 모호한 토스트로만 표시하지 않기 |
| 회원가입 `/register` | owner 계정 및 사무소 생성 시작 | Twenty workspace 생성 | HubSpot/Notion 가입 | 이메일→인증→사무소 설정의 짧은 단계, 현재 단계와 남은 작업 표시, 비밀번호 조건을 입력 전에 노출 | 한 화면에 사용자·사무소·요금제·초기설정을 모두 요구하지 않기 |
| 사무소 온보딩 `/onboarding/office` | Office 생성과 tenant 경계 설정 | Plane workspace setup, Twenty onboarding | Slack/Linear workspace onboarding | 첫 화면은 사무소명 중심의 최소 생성, 선택 사업자 정보는 명확히 표시. 생성 뒤 `직원 초대/첫 매물/연락처 가져오기` 시작 체크리스트와 설정 진입 제공 | 최초 화면에 수수료·권한·연동까지 넣지 않기. 고급 설정은 나중으로 미루기 |
| 전역 앱 셸 `_authenticated.tsx` (URL prefix 없음) | 모든 업무의 탐색, 검색, 빠른 등록 | Twenty | Linear | 220–232px 그룹형 사이드바, 상단 전역 검색, `+ 빠른 등록`에서 매물/고객/상담/업무/거래 선택, 즐겨찾기 뷰와 최근 항목 | 각 페이지가 새 서브사이드바를 만드는 구조 금지. [Twenty](./ui-reference-assets/global/twenty-layouts.webp), [Linear](./ui-reference-assets/global-commercial/linear-new-ui-2.png) |
| 대시보드 `/dashboard` | 오늘의 운영 우선순위와 경영 요약 | Twenty Dashboards, Plane Analytics | HubSpot dashboard, Xero/Stripe | 상단 `오늘 처리` 3–5개, 중단 `거래/광고/수금 위험`, 하단 추세·직원·활동. KPI 카드는 클릭 시 필터된 원장/목록으로 이동 | 장식용 숫자 카드 8개 이상 금지. owner와 agent에게 같은 숫자를 노출하지 않기. [Twenty](./ui-reference-assets/home-customer/twenty-dashboard.png), [Plane](./ui-reference-assets/global/plane-analytics.webp) |
| 업무함 `/inbox` | 시스템/AI 제안, 알림, 승인·거절 | Plane Intake, Chatwoot | Linear Triage/Intelligence | 좌측 범주·중앙 고밀도 목록·우측 제안 상세, J/K 이동, 승인/거절/보류, 변경 전후 diff와 근거, 일괄 처리, 완료 후 undo | 알림과 승인요청을 한 평면 목록에 섞지 않기. AI 제안은 영향 객체·필드·근거·되돌리기 가능성을 숨기지 않기. [Linear Triage](./ui-reference-assets/home-customer-commercial/linear-triage.png), [AI 제안](./ui-reference-assets/home-customer-commercial/linear-ai.png) |
| 업무 `/tasks` | 개인/팀 할 일, 기한, 관련 객체 | Plane, Vikunja | Linear, Asana | `내 업무/오늘/지연/팀/자동생성` 저장 뷰, 표↔보드, 관련 매물·고객·거래 칩, 빠른 완료·재배정, 반복업무 | 칸반을 기본값으로 강제하지 않기. 제목만 보이고 관련 고객/매물이 숨는 카드 금지. [Plane](./ui-reference-assets/global/plane-work-items.webp) |
| 캘린더 `/calendar` | 일정·업무·계약금/중도금/잔금·광고 만료 | Twenty Calendar, Plane | Google Calendar, Asana | 월/주/일/아젠다 뷰, 일정 유형별 최소 색상, 겹침 표시, 오른쪽 빠른 생성, 계약·매물 링크, 재무 일정은 독립 토글 레이어로 표시 | 모든 유형을 무지개색으로 만들지 않기. 시간 없는 업무와 시간 약속을 같은 표현으로 섞지 않기 |

### 홈 화면 공통 규칙

- 대시보드는 보고서가 아니라 **행동 큐**다. `오늘 연락`, `검증 지연`, `광고 만료`, `지급 예정`, `계약 위험`을 클릭 가능한 업무 단위로 보여준다.
- 업무함은 알림센터와 다르다. 읽음/안읽음보다 `승인 필요 / 조치 필요 / 정보 / 완료`가 우선이다.
- 업무와 캘린더는 동일 `Task`/`CalendarEvent`를 다른 관점으로 보여주되, 어느 화면에서 수정해도 관련 객체와 감사 이력이 유지되어야 한다.
- Linear의 저대비·키보드 효율은 참고하되, Estate ERP 기본 테마는 더 밝고 글자 크기·행 높이를 한 단계 높인다.

## 8. 페이지별 조사 — 매물·단지·광고

| 화면/라우트 | 기능 해석 | 오픈소스 1순위 | 상용 1순위 | Estate ERP에 가져올 디자인 | 피할 점·이미지 |
|---|---|---|---|---|---|
| 매물장 `/properties` | 매물 검색·검증·비교·대량 작업 | Teable grid, Twenty table | Airtable grid, CoStar/Reonomy search | 상단 저장 뷰, 필터 칩, 표/지도 전환, 고정 식별열, 가격·면적 tabular 정렬, 선택행 오른쪽 상세, 대량 담당/상태/광고 작업 | 카드 목록을 기본값으로 두지 않기. 주소·가격·검증·소유자·광고만료가 가로 스크롤 뒤로 밀리지 않게 함. [Teable grid](./ui-reference-assets/listings/teable-grid.png) |
| 매물 지도 `/properties`의 map view | 공간 탐색, 밀집 구역과 조건 비교 | Teable의 뷰 모델 + 지도 컴포넌트 독립 구현 | CoStar/Reonomy/Zillow map | 지도 60–65% + 동기화 목록 35–40%, 클러스터 금액/건수, 현재 지도에서 재검색, 선택 pin↔행 동기화, 거래유형·가격·면적 필터 유지 | 지도 전체화면에서 핵심 비교행을 잃지 않기. NocoDB 지도 이미지는 source-available 보조 참고일 뿐 코드 후보가 아님 |
| 매물 상세 `/properties/$id` | 매물 신원, 가격·광고·관계자·상담·매칭·임대·이력 | Twenty record, Frappe CRM lead page | HubSpot record + Zillow/Redfin content hierarchy | 고정 헤더에 주소/검증/거래유형/가격/빠른행동, 본문은 `개요·광고·관계자/상담·매칭·임대·활동`, 오른쪽에는 다음 행동/만료/위험. 가격변경은 전후값과 actor를 타임라인에 표시 | 모든 정보를 같은 카드 무게로 만들지 않기. 소비자 포털의 큰 사진 hero는 핵심 업무를 밀어내므로 보조 탭에 둠. [Twenty record](./ui-reference-assets/listings/twenty-record-side-panel.png), [Frappe](./ui-reference-assets/global/frappe-crm-lead-page.png) |
| 매물 등록 `/properties/new` | Site→Dong→Unit 연결과 매물/가격/관계자 입력 | Teable form, Twenty create record | Airtable form, Buildium listing setup | `위치/호실 → 거래/가격 → 소유자/임차인 → 광고/사진 → 확인` 단계, 기존 Site/Unit 검색을 우선, 저장 전 중복 매물 경고, 우측 실시간 요약, 임시저장 | 40개 필드를 한 긴 폼에 나열하지 않기. Site 주소를 자유텍스트로 받지 않기. [Teable form](./ui-reference-assets/listings/teable-form.png) |
| 관리단지 `/sites` | 단지/동/호실 구조, 보유매물·만료·업무 | Open Condo(도메인), Teable(표) | Buildium property/unit, AppFolio portfolio | 좌측 단지 목록, 중앙 동/호실 현황, 우측 선택 호실 상세의 master-detail. 동 탭과 평형 필터, 공실/매물/계약/임차 상태를 셀 안에 짧게 표시 | Open Condo의 오래된 시각을 복제하지 않기. 목록+시트가 전체 폭을 과도하게 먹지 않도록 패널 크기 기억 |
| 동·호실 배치판 `/sites` 내부 | `floor + lineNo` 격자와 Unit 상태 | Open Condo 모델 + 독립 grid | Buildium/AppFolio unit board | 세로 층, 가로 라인, sticky 축, 셀에는 호수·평형·매물수·임차/계약 상태; 드래그보다 클릭 상세, 범례와 확대/축소, 빈 placeholder 동 명확히 표시 | 색만으로 상태 구분하지 않기. 실제 건축 배치와 데이터 격자의 차이를 설명 없이 섞지 않기 |
| 호실 상세 `/sites` 내부 dialog/sheet | Unit, Property, Tenant, Task 관계 | Twenty side panel | Airtable expanded record, Buildium unit detail | 상단 호실 신원과 상태, `매물·거주/임대·연락처·업무·이력` 탭, 빠른 매물등록. 단순 조회는 sheet, 구조/주소 변경은 전체 편집 | sheet 안에 또 dialog를 중첩하지 않기. Dong/Unit 식별키 변경은 일반 인라인 편집으로 허용하지 않기 |
| 광고노트 `/properties/external-listings` | 외부 포털 매물 수집·검토·내부 매물 전환 | Teable grid, Twenty import flow | Airtable intake, CoStar/LoopNet result list | 출처·수집시각·중복가능성·담당·전환상태를 첫 열에 배치, 원문/내부후보 split view, `무시/연결/신규전환` 일괄 작업 | 외부 HTML을 그대로 본문에 크게 렌더링하지 않기. 자동수집과 사용자가 확인한 사실을 같은 신뢰도로 표시하지 않기 |
| 내 광고 `/properties/naver-my-ads` | 광고 상태·만료·성과·오류 관리 | Teable + Plane analytics | Naver 광고관리 문법 + Meta/Google Ads Manager | `게재중/검수/중단/만료/오류` 저장 뷰, 매물 식별정보와 포털 상태를 나란히, 만료 countdown, 갱신/중단 일괄 작업, 성과는 노출·문의·비용 최소 KPI | 소비자 네이버 매물 카드 디자인을 복제하지 않기. ERP 상태와 포털 상태를 하나의 badge로 합치지 않기 |
| 레거시 내 광고 `/properties/my-ads` | 코드에 남은 별도 route | 동일한 광고관리 패턴 | 동일 | 기능이 `naver-my-ads`와 같으면 route/명칭을 통합하고 redirect. 다르면 포털 중립 `내 광고` 허브 아래 Naver 탭으로 명시 | 같은 데이터를 두 메뉴/두 URL에서 다른 상태로 보여주지 않기 |

### 매물 화면의 권장 정보 우선순위

1. **식별:** 법정동/단지/동/호실, 매물 ID.
2. **거래 판단:** 거래유형, 가격, 면적, 층, 입주가능일.
3. **신뢰:** 확인상태, 확인일, 정보 출처, 마지막 변경자.
4. **행동:** 소유자 최근 연락, 다음 업무, 광고 만료, 활성 매칭.
5. **부가:** 사진, 설명, 외부 포털 메타데이터.

이 순서를 표 열, 상세 헤더, 모바일/좁은 폭 우선순위에 공통으로 적용한다. 소비자용 부동산 포털은 사진과 탐색에는 좋지만, 중개 ERP의 **검증·관계·다음 행동** 구조까지 대신하지 못한다.

## 9. 페이지별 조사 — 연락처·구매고객·상담·통화

| 화면/라우트 | 기능 해석 | 오픈소스 1순위 | 상용 1순위 | Estate ERP에 가져올 디자인 | 피할 점·이미지 |
|---|---|---|---|---|---|
| 연락처 `/contacts` | 사람/법인 검색, 관계·최근활동·그룹 | Frappe CRM Contact, Twenty Views | Attio/HubSpot contacts | `전체/매도인/매수인/임대인/임차인/파트너` 저장 뷰, 이름·전화·관계·관련매물·최근연락·다음업무를 고정, 중복후보 일괄 병합 진입 | 그룹을 별도 영구 서브사이드바로 만들어 폭을 낭비하지 않기. 관계 하나만 강제하지 않기. [Frappe contacts](./ui-reference-assets/home-customer/frappe-contact-list.png) |
| 연락처 빠른 상세 `/contacts` sheet | 목록을 떠나지 않고 전화/메모/업무 | Twenty record side panel | Airtable expanded record, Attio quick view | 헤더에 전화/문자/상담/업무, 본문에 핵심 관계·최근활동 5개·관련 객체. 복잡한 관계 편집은 전체 상세로 이동 | 빠른 상세에 전체 상세의 모든 탭을 복제하지 않기 |
| 연락처 상세 `/contacts/$id` | 통합 고객 360, 다중 관계와 활동 | Frappe CRM record, Twenty record | HubSpot contact record, Attio record | 좌측 신원/연락/관계, 중앙 활동 타임라인, 우측 관련 매물·구매조건·거래·다음업무. 통화/상담/문자/가격변경을 한 시간축에서 타입별 필터 | 속성 카드를 여러 열에 흩뜨려 활동 흐름을 끊지 않기. [HubSpot](./ui-reference-assets/global-commercial/hubspot-crm-record.webp) |
| 연락처 추가 `/contacts/new` | 최소 신원 입력, 중복검사, 관계 연결 | Twenty create record | Attio/HubSpot create contact | 전화번호 입력 즉시 중복 후보, 이름/전화/유형만으로 빠른 저장, 저장 뒤 매물·구매조건·상담 연결을 다음 행동으로 제안 | 첫 등록에서 주소·메모·모든 관계를 필수로 만들지 않기 |
| 구매고객 `/buyer-requirements` | 요구조건 검색·우선순위·매칭 진행 | Frappe CRM list, Twenty custom object | Attio list, HubSpot leads | 고객명보다 `희망지역·유형·예산·면적·기한·매칭수·최근연락·다음행동`을 중심으로, 조건 chip과 저장 뷰, 지연/조건충돌 표시 | 요구조건을 연락처의 긴 메모로 축소하지 않기. 조건을 잘라 읽기 어려운 카드만 사용하지 않기 |
| 구매고객 상세 `/buyer-requirements/$id` | 조건, 상담, 추천매물, 매칭 파이프라인 | Frappe CRM all-in-one lead page | Attio record, HubSpot lead workspace | 고정 요약에 고객+예산+지역+기한, 본문 `조건/상담/매칭/활동`, 추천매물은 적합/보류/거절 이유 기록, 오른쪽 다음 연락/미해결 질문 | 매칭 점수를 근거 없이 단일 숫자로 보여주지 않기. [Frappe record](./ui-reference-assets/global/frappe-crm-lead-page.png) |
| 구매조건 등록 `/buyer-requirements/new` | 고객 선택과 구조화된 요구 수집 | Twenty custom object form | Attio create record | 기존 연락처 검색→조건→우선순위→메모의 단계형 입력, 가격은 만원/억원 보조 표시, 면적은 m²/평 동시 변환, 복수 지역·필수/선호 분리 | 가격/면적 단위를 입력자 기억에 맡기지 않기. 연락처 중복 등록을 유도하지 않기 |
| 구매조건 편집 `/buyer-requirements/$id/edit` | 조건 변경과 기존 매칭 영향 확인 | Twenty record edit | Attio/HubSpot property edit | 현재값과 수정값, 수정 시 무효화/재평가될 매칭 수, 저장 뒤 재매칭 옵션. 중요한 예산·지역 변경은 활동 로그에 의미 있는 요약 | 신규 폼을 그대로 재사용해 변경 영향과 이력을 숨기지 않기 |
| 상담기록 `/consultations` | 접촉 결과와 후속조치, 관련 객체 연결 | Frappe CRM activity, Twenty timeline | Attio Activity, HubSpot activities | 날짜/유형/담당/고객/관련매물·구매조건/결과/후속일을 한 행에, quick add, 우측 상세, `후속 미등록` 필터 | 메모 본문만 보여주고 누가·언제·무엇과 관련됐는지 숨기지 않기. [Attio Activity](./ui-reference-assets/home-customer-commercial/attio-activity.png) |
| 통화기록 `/calls` | CTI 수신/발신, 녹취·요약·CRM 전환 | Frappe CRM call UI, Meetily | Gong, Aircall | 통화목록과 상세 workspace, 전화번호→연락처 매칭 상태, 오디오와 타임스탬프 전사 동기화, 구조화 요약/태그, 한 클릭으로 상담·업무·연락처·구매조건 생성, 원음과 AI 요약 구분 | 재생기만 크게 두지 않기. 미확인 번호 자동병합과 검증되지 않은 화자 확정 금지. [Frappe Call](./ui-reference-assets/global/frappe-crm-call-ui.png), [Gong](./ui-reference-assets/home-customer-commercial/gong-transcript.jpg) |
| 통화 원본 로그 `/calls/logs` (Desktop) | 기술/감사 로그와 연결 실패 점검 | Frappe CRM Call Log | Aircall analytics/admin log | 일반 통화기록과 분리된 관리자 표, device/방향/상태/연결 contact/녹음/오류, 재처리·연결 교정, 원본 ID 복사 | 일반 agent 메뉴에서 기술 필드를 기본 노출하지 않기. 실패 로그를 조용히 숨기지 않기 |

### 고객 레코드의 핵심 설계

고객은 `Contact` 하나가 매도인·매수인·임대인·임차인·파트너 역할을 동시에 가질 수 있으므로, 상용 CRM처럼 단일 lifecycle stage를 사람 자체에 강제하면 안 된다. **사람의 신원은 Contact에, 각 거래 문맥과 상태는 관계/구매조건/Deal에 둔다.**

연락처 상세의 기본 시선 흐름은 `누구인가 → 지금 무엇을 원하거나 소유하는가 → 최근 무슨 일이 있었는가 → 다음에 무엇을 해야 하는가`여야 한다. 이것이 HubSpot의 행동 헤더와 Frappe CRM의 통합 레코드에서 가져올 가장 가치 있는 부분이다.

## 10. 페이지별 조사 — 매칭·거래·계약·수금/정산

| 화면/라우트 | 기능 해석 | 오픈소스 1순위 | 상용 1순위 | Estate ERP에 가져올 디자인 | 피할 점·이미지 |
|---|---|---|---|---|---|
| 매칭 `/matches` | 구매조건↔매물 후보와 접촉 단계 관리 | Plane views, Twenty kanban | Attio kanban, Pipedrive pipeline | 기본은 구매고객별 그룹 표, 보조로 단계 칸반. 연결된 고객·매물 속성과 적합근거·가격차·최근접촉·다음행동, 단계별 건수와 체류일을 함께 표시 | 부동산 적합도를 불투명한 점수 하나로 축약하지 않기. 한 매칭의 buyer/owner 양쪽 접촉단계를 섞지 않기 |
| 매칭 상세 dialog | 추천 이유, 상담, 단계 전환, Deal 생성 | Frappe CRM record | Attio record page, Pipedrive deal detail | 좌측 양쪽 요약, 중앙 단계·활동, 우측 차이/리스크. 단계 전환 시 필요한 필드만 문맥형으로 받고 `Deal 생성` 전 중복검사 | 작은 dialog 안에서 전체 거래 생성 폼을 열지 않기 |
| 거래 목록 `/deals` | 파이프라인·예상수수료·마감위험 관리 | Frappe CRM deals, Twenty pipeline | Pipedrive, HubSpot pipeline | 표↔칸반, 상단 단계·담당·예정일·공동중개 저장 뷰, 카드에는 거래물건/양측/예상수수료/다음 마감/체류일, drag 뒤 undo와 로그 | 금액·마감일 없는 예쁜 카드 금지. drag만으로 되돌릴 수 없는 계약상태를 확정하지 않기. [Twenty kanban](./ui-reference-assets/deals-ops/twenty-kanban-compact.png) |
| 거래 상세 `/deals` 내부 | Deal, 수수료, 지급, 참여자, 활동 | Frappe CRM lead page, Twenty record | Pipedrive detail, Attio record | 고정 헤더에 단계/매물/양측/예정완료일, 본문 `개요·수수료·지급·계약·활동`, 우측 다음 마감과 위험. 매도측/매수측/파트너/직원 배분을 별도 블록 | 총수수료만 크게 보여주고 구성항목을 숨기지 않기. activity와 회계 이벤트를 분리된 섬으로 만들지 않기 |
| 계약 허브 `/contracts` | 계약 상태별 목록과 문서 진입 | Documenso documents | Juro views, DocuSign/PandaDoc agreements | `초안/서명완료/계약금/잔금/등기/취소` 저장 뷰, 계약번호·물건·당사자·금액·다음 지급·문서상태·담당을 한 행에, 임박 마감 강조 | ContractStatus와 서명상태를 하나로 합치지 않기 |
| 계약 상세 | 계약 당사자·특약·지급·문서 상태 | Documenso document detail | DocuSign/PandaDoc agreement detail | 좌측 문서/계약 구조, 중앙 선택 섹션, 우측 당사자·검증·상태. 상단에는 `마지막 저장/서명상태/다음 지급/감사기록` 고정 | 카드들을 세로로 쌓아 계약 전체 맥락을 잃지 않기. [Documenso](./ui-reference-assets/deals-ops/documenso-document-workspace.gif) |
| 계약 문서 편집기 | 조항·특약·당사자·금액을 실제 문서에 반영 | Documenso field placement | PandaDoc editor, Juro contract editor | 3패널: 왼쪽 문서 목차, 중앙 A4 미리보기, 오른쪽 선택 조항/필드 편집. 자동계산 값과 직접 입력 값 구분, 미완성/충돌 검증, 버전 비교 | 일반 CRM form과 A4 미리보기를 별개 화면으로 왕복시키지 않기. 자동 값에 조용히 수기 override를 허용하지 않기 |
| 지급 일정 타임라인 | 계약금·중도금·잔금·등기 단계 | ERPNext payment terms | Xero/QuickBooks invoice·A/R timeline | 날짜축에 예정/지급/지연, 금액과 상대방, 증빙, 담당자를 함께 표시; 일정 변경은 이전값 유지, 캘린더/업무 생성 | 단계를 색 점만으로 표시하지 않기. 계약상태 전환과 실제 입금 확인을 같은 행동으로 처리하지 않기 |
| 캐시플로우 `/cashflow` | owner/manager용 수금·지출·정산 전망 | Bigcapital dashboard | Xero dashboard/forecast, QuickBooks | `가용/이번달 유입/미수/지급예정` 요약, 30/90일 cash in/out, 미수·마감 위험 큐, 차트 클릭 시 원장 필터 | 매출과 수금, 예상과 실제를 섞은 KPI 금지. [Xero](./ui-reference-assets/global-commercial/xero-cashflow-forecast.png), [Bigcapital](./ui-reference-assets/deals-ops/bigcapital-screenshot-2.png) |
| 수금 원장 `/cashflow/ledger` | 거래별 채권·입금·잔액·증빙 | Bigcapital/ERPNext ledger | Xero/QuickBooks transaction list, Stripe Balance | 고정 거래/계약 열, 예정일·입금일·총액·입금·잔액·상태, subtotal/group, 표↔단계보드, 우측 증빙/활동, CSV export | 스프레드시트처럼 직접 잔액을 수정하지 않기. 원천 이벤트와 수기 조정 구분. [ERPNext ledger](./ui-reference-assets/deals-ops/erpnext-general-ledger.png) |
| 공동중개 수수료 `/cashflow/partner-commissions` | 파트너별 지급 예정·확정·완료 | Bigcapital payables | Xero bills, Ramp vendor payments | 파트너/거래/총수수료/우리 몫/파트너 몫/지급일/증빙, 파트너별 합계, 승인→지급→완료 단계와 일괄 지급 준비 | Deal의 `partnerCommission`과 실제 지급내역을 같은 셀에서 덮어쓰지 않기 |
| 직원 정산 `/cashflow/employee-settlements` | 직원별 배분·조정·승인·지급 | ERPNext payroll pattern, Frappe HR | Deel/Rippling payroll | 정산기간, 직원별 거래 기여·규칙·조정·세전/지급액·상태, 상세에서 원 거래까지 추적, 잠금/재오픈 감사 | 배분 근거를 총액 뒤에 숨기지 않기. 기간 확정 후 조용한 수정 금지 |
| 내 수수료 `/cashflow/my-settlement` | agent 개인의 예상·확정·지급 내역 | Frappe HR self-service | Deel/Rippling employee view | 상단 `예상/확정/지급` 3값, 거래별 역할·기준액·배분율·조정·지급일, 계산 설명과 이의 제기 진입 | 경영자용 전체 재무를 노출하지 않기. 다른 직원과 비교 순위를 기본 제공하지 않기 |
| 고정비 설정 `/cashflow/expenses` | 반복비용 규칙과 실제 발생 관리 | Bigcapital/ERPNext recurring expense | Ramp recurring spend, QuickBooks expenses | 비용 항목/주기/금액/다음발생/결제수단/활성, 월별 합계와 갱신 알림, 설정과 실제 원장 행을 연결 | 개인 예산 앱의 봉투·가계부 문법을 가져오지 않기. 설정과 실제 지출을 동일 표에서 편집하지 않고 삭제보다 비활성/종료일을 우선 |

### 거래와 돈 화면의 불변 규칙

- `DealStage`, `ContractStatus`, 지급상태, 정산상태는 서로 다른 상태기계다. 한 개의 진행 bar로 합치지 않는다.
- 모든 금액은 `예상 / 계약 확정 / 청구·수금 예정 / 실제 입출금 / 정산 완료` 중 어디에 속하는지 라벨을 붙인다.
- 사용자가 합계를 클릭하면 구성 원장 행까지 내려가야 하고, 원장 행에서는 원 Deal/Contract/Participant로 돌아갈 수 있어야 한다.
- 단계 변경, 금액 override, 정산 확정, 취소에는 actor/source와 before/after가 남는다는 사실을 UI에서 예측 가능하게 보여준다.

## 11. 페이지별 조사 — 네트워크·직원·업체·자료·설정

| 화면/라우트 | 기능 해석 | 오픈소스 1순위 | 상용 1순위 | Estate ERP에 가져올 디자인 | 피할 점·이미지 |
|---|---|---|---|---|---|
| 중개방 `/network` | 방, 메시지, 공유매물, 문의·응답 | Chatwoot | Slack + Intercom Inbox | 3패널: 방 목록 260px / 대화 / 컨텍스트 320px. 방 행에 미읽음·마지막활동·참여사무소, 메시지 안 매물은 구조 카드, 우측에 공유매물/활성문의/멤버. 문의는 open/answered/closed 상태 | 일반 채팅 bubble만으로 매물·문의 상태를 표현하지 않기. 정보성 메시지와 시스템/감사 이벤트 구분. [Chatwoot](./ui-reference-assets/deals-ops/chatwoot-conversation-dashboard.png) |
| 공유 매물·문의함 `/network` 서브뷰 | 공동중개 요청과 답변, 매물 공유 | Chatwoot conversation context | Intercom table layout, Teams shared files | 받은/보낸/상태별 문의 표↔대화 전환, 우측 미리보기, 구조화 조건 카드와 내부 매물 선택, 원본 공유 범위·만료·철회 표시 | 내부 비공개 필드가 카드에 자동 포함되지 않게 미리보기·권한 표시. 문의 처리상태와 채팅 읽음상태를 합치지 않기 |
| 파트너 중개사 `/partner-brokers` | 사무소 디렉터리, 관계·실적·연락 | Twenty companies, Frappe CRM organization | HubSpot companies, Attio companies | 목록에 사무소명/지역/전문유형/담당/최근공동거래/미정산/최근연락, 빠른 상세에 연락·방 초대·공동중개 이력, 신뢰지표는 근거 공개 | 별점 하나로 신뢰를 단정하지 않기. `Office` tenant와 외부 파트너 데이터를 혼동하지 않기 |
| 직원 `/employees` | 사용자, 역할, 활성상태, 성과·정산 진입 | Frappe HR | Rippling, Deel, BambooHR | 디렉터리 표+우측 peek, 역할/상태/입사일/최근활동/업무량/정산상태, 상세 탭 `프로필·권한·업무·거래·정산·활동`, 초대 상태 | 권한, 고용정보, 실적을 한 긴 폼으로 합치지 않기. 직원간 수수료 개인정보를 과다 노출하지 않기. [Frappe HR](./ui-reference-assets/global/frappe-hrms.png) |
| 업체 디렉터리 `/service-vendors` | 이사·수리·법무 등 외부 업체 검색·추천 | Twenty companies | Ramp vendor management | 업종/지역/가능시간/담당/최근의뢰/누적지출/문서 필터, 표+빠른 상세, 연락·고객에게 공유·업무·발주 생성, 추천과 사무소 내부평가 구분 | 소비자 리뷰앱처럼 별점·사진을 우선하지 않기. 개인 연락처와 업체를 중복 저장하지 않도록 관계 모델 명확히 |
| 자료실 `/documents` | 계약·등기·신분·사무소 문서 검색·연결 | Paperless-ngx | Google Drive, DocuWare | 표/카드 전환, 좌측 저장 뷰 또는 필터 drawer, 중앙 목록, 우측 미리보기·메타데이터; 문서종류/관련매물·고객·계약/날짜/보안등급/업로더, OCR 검색 | 폴더 계층만 강제하지 않기. 파일명만으로 문서 의미를 판단하게 하지 않기. [Paperless](./ui-reference-assets/listings/paperless-documents-table.png) |
| 사진 자료 `/documents/photos` | 매물 사진 대량 업로드·선택·연결 | Immich | Google Photos, Dropbox | 촬영일 타임라인+매물/단지/업로더 필터, 대량선택 toolbar, 우측 정보·연결 객체, 중복/저화질 경고, 대표사진 지정과 순서 편집 | 고정 크기 썸네일만 보여 메타데이터를 숨기지 않기. 원본 삭제와 관계 해제를 같은 행동으로 만들지 않기. [Immich](./ui-reference-assets/listings/immich-advanced-search.webp) |
| 설정 `/settings` | 사무소·사용자·권한·수수료·템플릿·MCP·AI·비용 | Twenty settings, Plane settings | Linear API & Webhooks, Stripe roles/API keys | 왼쪽 설정 카테고리+오른쪽 640–800px 본문, `사무소/직원·권한/업무규칙/수수료/계약템플릿/연동/MCP·AI/보안·감사`. MCP 키는 생성자·범위·최근사용·폐기를 목록화하고, 섹션별 저장·변경 요약·owner-only를 명확히 | 한 페이지에 모든 카드를 세로 적재하지 않기. 자동저장/명시저장을 섞지 않기. 위험 설정은 영향 객체 수와 롤백 방법 표시 |

### 중개방과 자료실의 공통 원칙

대화와 파일은 독립된 섬이 아니라 Property, Contact, BuyerRequirement, Deal, Contract의 **증거와 문맥**이다. Chatwoot/Intercom에서 컨텍스트 패널을, Paperless/Drive에서 preview+metadata를 가져오되, Estate ERP에서는 관련 객체와 공유 범위가 항상 먼저 보이게 한다.

설정은 제품 기능 목록이 아니라 관리자의 결정 구조로 재편한다. 현재 설정 카드가 늘어날수록 `사무소 운영`, `돈`, `문서`, `연동/AI`, `보안`의 5개 상위 범주가 안정적인 기준이 된다.

## 12. 페이지별 조사 — AI 채팅·AI 운영/HITL

| 화면/라우트 | 기능 해석 | 오픈소스 1순위 | 상용 1순위 | Estate ERP에 가져올 디자인 | 피할 점·이미지 |
|---|---|---|---|---|---|
| AI 채팅 Web `/ai-chat` | CRM MCP를 사용하는 대화·검색·초안·변경 제안 | LibreChat + Twenty AI pattern | ChatGPT Canvas | 좌측 대화목록, 중앙 대화, 필요할 때 오른쪽 결과물/레코드 canvas. 답변 안에 출처 레코드 칩, 도구실행 카드, `조회됨/변경 제안/승인 대기/완료` 상태, 실제 변경은 diff 승인 | 일반 챗봇처럼 텍스트 답만 쌓지 않기. tool call JSON과 내부 ID를 일반 사용자에게 그대로 보여주지 않기. [Twenty AI](./ui-reference-assets/global/twenty-ai-agents.webp) |
| AI 운영·HITL `/inbox`·설정의 관리자 view | 에이전트 실행, 승인, 실패, 비용·지연·감사 | Langfuse | Braintrust, LangSmith | 상단 성공률/승인대기/실패/비용, trace 표에 actor/model/tool/대상/결과/지연, 우측 span tree와 input/output/diff. 재실행은 원본 보존, 민감정보 masking, 사용자용 제안으로 이동 링크 | 관측 UI를 일반 업무함에 그대로 합치지 않기. 실패를 모델명/에러코드만으로 설명하지 않기. [Langfuse](./ui-reference-assets/global/langfuse-trace.png), [Braintrust](./ui-reference-assets/global-commercial/braintrust-logs.png) |

AI는 브랜드 장식이 아니라 `ActivityLog.actor = mcp:Codex`와 `source = mcp/system`을 사람이 이해할 수 있게 보여주는 인터페이스여야 한다. 조회는 바로 수행해도 되지만 데이터 변경·계약 생성·금액 수정·외부 공유는 **대상, 변경 전후, 영향, 승인자, 되돌리기**를 같은 카드 안에서 확인하게 한다.

## 12.1 국내 상용 프로그램 교차 확인

해외 상용 SaaS의 정교한 상호작용 문법만 가져오면 한국 공인중개사의 실제 업무 흐름을 놓칠 수 있다. 공개된 2026년 공식 안내와 매뉴얼을 기준으로 부동산이지와 한방을 별도로 대조했다.

| 국내 제품 | 공식 자료에서 확인한 강점 | 연결할 Estate ERP 화면 | 가져올 것 | 그대로 가져오지 않을 것 |
|---|---|---|---|---|
| [부동산이지](https://slashpage.com/bdseasy?lang=ko) | 아파트 동·호수 그리드, 일반 매물 지도, 매물·고객·광고·계약·기한의 연결, 전화 수신 정보와 상담일지·콜백·고객 생성 흐름 | `/sites`, `/properties`, `/contacts`, `/calls`, `/consultations`, `/contracts`, `/calendar` | `Site → Dong → Unit`의 공간적 그리드, 지도와 표의 동일 필터, 통화 직후 상담·업무 생성, 공적장부와 원장 연결 | 큰 빈 공간, 상단 전체 업무 메뉴의 깊은 드롭다운, 상태를 색점만으로 설명하는 방식 |
| [한방 2026 매뉴얼](https://www.karhanbang.com/helpdesk/HTML2/html/2026_manual_01.pdf) | 공개/비공개 필드, 전국망·지역망·한방 포털과 네이버·KB 등 채널별 전송, 공적장부 통합조회, 공동중개와 계약 업무 | `/properties/external-listings`, `/properties/naver-my-ads`, `/network`, `/documents`, `/contracts`, `/calendar` | 채널별 전송·검증·만료·철회 상태, 외부 공개 전 개인정보 preview, 법정일·광고일·계약일의 명시적 기한 관리 | 오래된 중첩 메뉴와 작은 입력창을 현대 UI처럼 복제하는 것, 여러 포털 상태를 `광고중` 하나로 합치는 것 |

### 국내 도메인에서 반드시 보존할 UI

1. **동×층×라인 그리드:** 범용 CRM 표로 치환하지 않는다. 호실의 점유·매물·검증·계약 상태를 겹쳐 볼 수 있는 Estate ERP 고유 작업면으로 발전시킨다.
2. **채널별 광고 원장:** 네이버·KB·한방·기타 외부 채널마다 `전송 전/검증 중/노출/반려/만료/철회/오류`와 마지막 동기화 시각을 독립 표시한다.
3. **법정·계약 기한:** 계약금·중도금·잔금뿐 아니라 실거래 신고, 광고 만료, 임대 만기, 공적장부 재확인 시점을 캘린더와 업무에 연결한다.
4. **한국식 숫자와 주소:** 가격은 만원 저장값과 억/만원 표현, 면적은 m²와 평, 주소는 법정동과 도로명을 같은 레코드에서 일관되게 보여준다.
5. **통화 후 30초 흐름:** 발신자 식별→이전 상담 확인→통화→상담일지/콜백/신규 고객/후속 업무 생성이 끊기지 않아야 한다.

![부동산이지 동·호수 그리드](./ui-reference-assets/korean-commercial/bds-unit-grid.png)

**해석:** 국내 제품에서도 층×호실 그리드가 중개사의 핵심 기억 장치로 쓰인다. Estate ERP는 이 형태를 보존하되, 넓은 공백을 줄이고 고정 헤더·축·범례, 상태 중첩, 키보드 이동, 우측 빠른 상세를 더해야 한다.

![부동산이지 매물 지도](./ui-reference-assets/korean-commercial/bds-map.png)

**해석:** 가격 라벨만 많이 겹치는 소비자 포털 지도를 복제하기보다 왼쪽 결과 목록, 지도 범위 재검색, 유형/거래/검증 필터, 선택 매물의 우측 상세를 결합한다. 지도와 표는 같은 query state를 공유해야 한다.

국내 상용 화면은 도메인 흐름과 용어를 검증하기 위한 내부 리서치 자료다. 이미지 원본과 권리 메모는 [국내 상용 이미지 출처](./ui-reference-assets/korean-commercial/SOURCES.md)에 기록했다.

## 13. 우선순위와 구현 순서

UI를 페이지별로 독립 리뉴얼하면 다시 일관성이 무너진다. 아래 순서가 위험과 재작업을 가장 줄인다.

### P0 — 기반과 대표 recipe

1. Desktop/Web 공통 토큰: 색, 서체, 3단 밀도, 표면, 상태, focus, motion.
2. 공통 `AppShell`, 전역 검색, 빠른 등록, 저장 뷰/즐겨찾기.
3. `DataIndex` recipe: 페이지 헤더, 뷰 탭, 필터 칩, 열/밀도, 표, 선택, 우측 peek.
4. `RecordWorkspace` recipe: 고정 신원 헤더, 활동 중심 본문, 관계/다음행동 rail.
5. 도메인 셀: `Money`, `Area`, `Address`, `Status`, `Relation`, `DueDate`, `AuditActor`.

P0 검증 화면은 매물장, 연락처, 거래 목록, 매물 상세 네 개면 충분하다. 이 네 화면에서 80%의 공통 규칙을 결정할 수 있다.

### P1 — 매일 가장 많이 쓰는 흐름

1. 대시보드→업무함→업무/캘린더.
2. 매물장→매물 상세→상담/매칭 생성.
3. 연락처→구매고객 상세→추천매물/매칭.
4. 통화기록→연락처 연결→상담/업무 생성.
5. 매칭→거래 전환→거래 상세.

P1의 완료 기준은 예쁜 정적 화면이 아니라 다음 흐름이 실제로 끊김 없이 작동하는 것이다.

```text
통화 수신
  → 연락처 식별/신규 생성
  → 상담 결과 기록
  → 구매조건 또는 매물과 연결
  → 후속 업무 생성
  → 매칭 후보 확인
  → 거래 전환
```

### P2 — 문서·돈·협업·관리

1. 계약 허브와 A4 문서 편집기.
2. cashflow 대시보드→원장→파트너/직원 정산.
3. 중개방 3패널과 구조화된 매물/문의 카드.
4. 문서/사진 preview+metadata 작업공간.
5. 직원/업체 디렉터리와 카테고리형 설정.
6. AI 채팅 결과 canvas와 관리자 trace/HITL.

### 권장 첫 시각 프로토타입 8종

| 순서 | 화면 | 이유 |
|---|---|---|
| 1 | 전역 셸 + 매물장 표/지도 | 전체 제품의 밀도와 탐색 규칙을 결정 |
| 2 | 매물 상세 | 가장 복잡한 부동산 레코드 recipe 검증 |
| 3 | 연락처/구매고객 상세 | CRM 관계·활동·다음행동 recipe 검증 |
| 4 | 업무함 | 시스템/AI 제안과 승인 패턴 검증 |
| 5 | 매칭/거래 칸반 | 단계·금액·체류일·다음행동의 카드 문법 검증 |
| 6 | 계약 편집기 | 문서 중심 3패널 recipe 검증 |
| 7 | cashflow/원장 | 숫자·상태·drill-down 문법 검증 |
| 8 | 중개방 | 대화와 구조화 객체를 결합하는 패턴 검증 |

## 14. 화면별 품질 기준

리디자인 시 다음 항목을 화면마다 확인한다.

### 정보와 행동

- 5초 안에 `이 화면은 무엇이며 지금 처리할 일은 무엇인가`가 보이는가?
- 목록의 식별열과 판단열이 가로 스크롤 없이 보이는가?
- 상태가 과거 보고가 아니라 다음 행동과 연결되는가?
- 합계/KPI를 클릭하면 근거 목록으로 내려가는가?
- 관련 Property/Contact/Requirement/Deal/Contract로 한 번에 이동 가능한가?

### 밀도와 접근성

- 1440×900 standard density에서 대표 표 15–18행이 보이는가?
- 14px 본문과 충분한 명도 대비를 유지하는가?
- selected/hover/focus/disabled/error를 색만으로 구분하지 않는가?
- 가격과 면적의 만원·억원, m²·평 변환이 입력과 조회에서 동일한가?
- 키보드 tab 순서와 J/K 또는 화살표 목록 이동이 예측 가능한가?

### 안전과 감사

- 삭제·병합·단계 확정·금액 수정의 영향 범위를 저장 전에 알 수 있는가?
- AI/시스템/사용자 변경을 actor와 source로 구분하는가?
- 자동 저장 상태, 실패, 충돌, 오프라인 상태가 보이는가?
- 민감한 전화번호·계약·정산 정보가 역할과 공유 범위에 따라 가려지는가?
- 작업 완료 뒤 undo 또는 복구 경로가 있는가?

## 15. 최종 디자인 결정안

### 채택

- **기본 문법:** Twenty의 앱 셸·레코드 구조.
- **표와 뷰:** Teable/Airtable의 고밀도 grid와 저장 뷰.
- **활동과 관계:** Frappe CRM/HubSpot의 record workspace.
- **업무 처리:** Plane/Linear의 목록→상세, 키보드, 일괄 처리.
- **문서:** Documenso/DocuSign의 캔버스·당사자·상태 분리.
- **돈:** Bigcapital/ERPNext/Xero의 요약→원장 drill-down.
- **대화:** Chatwoot/Intercom의 3패널과 context rail.
- **자료:** Paperless/Drive의 preview+metadata.
- **AI 운영:** Langfuse/Braintrust의 trace 구조를 관리자가 이해하는 감사 화면으로 번역.

### 비채택

- 한 제품의 색·radius·로고·상표성 화면을 그대로 복제.
- Notion형 큰 공백과 카드 과다 사용.
- 소비자 부동산 포털의 큰 사진 hero를 내부 운영 화면 기본값으로 사용.
- ERPNext의 회계·설정 전체 메뉴를 중개사에게 그대로 노출.
- Linear의 작은 글자와 낮은 대비를 그대로 적용.
- AGPL/GPL 저장소의 컴포넌트 코드를 출처·의무 검토 없이 복사.

## 16. 출처와 이미지 provenance

대표 이미지의 원본 URL과 코드 라이선스 메모는 다음 파일에 기록했다.

- [오픈소스 공통 이미지 출처](./ui-reference-assets/global/SOURCES.md)
- [상용 공통 이미지 출처](./ui-reference-assets/global-commercial/SOURCES.md)
- 페이지군별 세부 조사: [홈·고객](./ui-reference-research/home-customer.md), [매물·단지](./ui-reference-research/listings.md), [거래·계약·운영](./ui-reference-research/deals-ops.md)
- 페이지군별 원본 이미지는 `ui-reference-assets/home-customer*`, `listings*`, `deals-ops*`에 보관한다.

주요 공식 근거:

- [Twenty repository와 license](https://github.com/twentyhq/twenty)
- [Twenty 공개 Figma](https://www.figma.com/file/xt8O9mFeLl46C5InWwoMrN/Twenty)
- [Plane repository](https://github.com/makeplane/plane)
- [Frappe CRM repository](https://github.com/frappe/crm)
- [Teable repository](https://github.com/teableio/teable)
- [Bigcapital repository](https://github.com/bigcapitalhq/bigcapital)
- [Documenso repository](https://github.com/documenso/documenso)
- [Chatwoot repository](https://github.com/chatwoot/chatwoot)
- [Paperless-ngx repository](https://github.com/paperless-ngx/paperless-ngx)
- [Linear Workspaces](https://linear.app/docs/workspaces), [Inbox](https://linear.app/docs/inbox), [Custom Views](https://linear.app/docs/custom-views), [Display options](https://linear.app/docs/display-options)
- [Vikunja Views](https://vikunja.io/help/views/), [Cal.diy repository](https://github.com/calcom/cal.diy), [Meetily repository](https://github.com/Zackriya-Solutions/meetily)
- [Frappe CRM Contact](https://docs.frappe.io/crm/contact), [Call Log](https://docs.frappe.io/crm/call-log)
- [Linear Triage](https://linear.app/docs/triage), [Triage Intelligence](https://linear.app/docs/triage-intelligence)
- [HubSpot dashboards](https://knowledge.hubspot.com/dashboards/manage-your-dashboards), [record index](https://knowledge.hubspot.com/records/view-and-filter-records-in-the-updated-index-page), [record layout](https://knowledge.hubspot.com/object-settings/customize-records), [activities](https://knowledge.hubspot.com/records/manually-log-activities-on-records)
- [Asana My Tasks](https://help.asana.com/s/article/my-tasks?language=en_US), [Calendar view](https://help.asana.com/s/article/calendar-view?language=en_US), [Google Calendar event creation](https://support.google.com/calendar/answer/72143?hl=en-uk)
- [Gong call review](https://help.gong.io/docs/review-what-happened-in-a-call), [transcript](https://help.gong.io/docs/view-a-call-transcript)
- [Aircall Call History](https://support.aircall.io/en-gb/articles/10375394967325), [Call Timeline](https://support.aircall.io/hc/en-gb/articles/16582448402077-Call-timeline)
- [Airtable grid view](https://support.airtable.com/airtable-grid-view), [Airtable views](https://www.airtable.com/platform/views)
- [HubSpot CRM](https://www.hubspot.com/products/crm), [pipeline management](https://www.hubspot.com/products/crm/pipeline-management)
- [Pipedrive pipeline](https://www.pipedrive.com/en/features/pipeline-management)
- [Attio Lists](https://attio.com/help/reference/managing-your-data/lists/create-lists), [Kanban](https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views), [record pages](https://attio.com/help/reference/managing-your-data/records/create-and-view-records)
- [Juro contract Views](https://intercom.help/juro/en/articles/5653144-managing-contracts-using-custom-dashboards-views), [contract timeline](https://intercom.help/juro/en/articles/5653128-using-the-contract-template-timeline)
- [Intercom Inbox](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained)
- [Ramp vendor management](https://support.ramp.com/vendor-management-on-ramp/), [recurring bills](https://support.ramp.com/creating-and-managing-recurring-bill-payments-on-ramps-bill-pay/)
- [Linear API and Webhooks](https://linear.app/docs/api-and-webhooks), [Stripe roles](https://docs.stripe.com/get-started/account/teams/roles), [Stripe API keys](https://docs.stripe.com/keys)
- [Stripe Dashboard](https://docs.stripe.com/dashboard/basics)
- [Xero dashboard](https://www.xero.com/au/accounting-software/dashboard/)
- [Braintrust observability](https://www.braintrust.dev/docs/observe), [trace anatomy](https://www.braintrust.dev/docs/observe/examine-traces)
- [ChatGPT Canvas](https://help.openai.com/en/articles/9930697-using-canvas-in-chatgpt)
- [부동산이지 공식 안내](https://slashpage.com/bdseasy?lang=ko), [매물 접수·원장 매뉴얼](https://slashpage.com/bdseasy/5r398nmnx4zvkmvwje7y), [통화·고객관리 앱](https://slashpage.com/bdseasy/4z7pvx2kz34evmek8653)
- [한방 2026 사용자 매뉴얼](https://www.karhanbang.com/helpdesk/HTML2/html/2026_manual_01.pdf)

상용 제품 UI는 기능과 상호작용을 비교하기 위한 내부 리서치 자료다. 각 회사의 상표와 스크린샷을 제품 마케팅에 재사용하지 않고, Estate ERP의 도메인·토큰·컴포넌트로 독립 구현한다.
