# 거래·계약·운영 UI 오픈소스 + 상용 SaaS 레퍼런스 조사

> 조사일: 2026-07-17  
> 범위: 매칭, 거래, 계약, 자금 흐름, 공동중개/정산, 네트워크, 협력 중개사, 직원, 서비스 업체, 설정  
> 해석: 요청의 `sass 오픈소스`는 문맥상 **SaaS 오픈소스**로 해석했다. 아래 내용은 코드를 그대로 이식하기 위한 목록이 아니라, 현재 Estate ERP의 기능에 맞는 정보 구조와 상호작용 패턴을 고르기 위한 디자인 조사다.

## 1. 한 줄 결론

한 제품을 통째로 닮게 만드는 것보다 다음 조합이 가장 적합하다.

| Estate ERP 영역 | OSS 1차 | 상용 교차검증 | 가져올 핵심 |
|---|---|---|---|
| 매칭·거래 파이프라인 | [Twenty](https://github.com/twentyhq/twenty), [Plane](https://github.com/makeplane/plane), [Frappe CRM](https://github.com/frappe/crm) | [Pipedrive](https://support.pipedrive.com/en/article/pipeline-view), [Attio](https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views) | 저장 뷰, 압축형 칸반, 단계 집계, 다음 행동, 활동 타임라인 |
| 계약 허브·문서 편집 | [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx), [Documenso](https://github.com/documenso/documenso) | [Juro](https://intercom.help/juro/en/collections/3177789-juro-s-contract-repository), [Ironclad](https://support.ironcladapp.com/hc/en-us/articles/31344994944023-The-Repository-Dashboard-Views) | 문서 준비도, 저장 뷰, 문서 캔버스, 구조화 필드/당사자 패널 |
| 현금흐름·원장·정산 | [ERPNext](https://github.com/frappe/erpnext), [Bigcapital](https://github.com/bigcapitalhq/bigcapital) | [Xero](https://www.xero.com/us/accounting-software/analytics/cash-flow/), [QuickBooks](https://quickbooks.intuit.com/learn-support/en-ca/help-article/accounts-receivable-reports/run-accounts-receivable-aging-report/L4N7PC2hg_CA_en_CA) | 기간 중심 요약, 예정/수납/미수 분리, 에이징, 거래별 드릴다운 |
| 네트워크·채팅·문의 | [Chatwoot](https://github.com/chatwoot/chatwoot) | [Intercom](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained) | 방/문의 목록–대화–매물 맥락의 3단 작업공간 |
| 협력 중개사·업체 | Frappe CRM, Twenty | [Attio](https://attio.com/help/reference/managing-your-data/records/create-and-view-records), [Ramp](https://support.ramp.com/vendor-management-on-ramp/) | 밀도 높은 디렉터리, 저장 뷰, 우측 상세 패널, 관련 거래/활동 |
| 직원·정산 | [Frappe HR](https://github.com/frappe/hrms), ERPNext | [Rippling](https://www.rippling.com/products/payroll), [Deel](https://help.letsdeel.com/hc/en-gb/articles/15011308032145-How-Employees-Can-See-Their-Payslips) | 직원 프로필, 업무·성과·보상 탭, 정산 기간과 지급 상태 |
| 설정 | Twenty, Plane | [Linear](https://linear.app/docs/api-and-webhooks), [Stripe](https://docs.stripe.com/get-started/account/teams/roles) | 섹션형 좌측 내비게이션, 권한별 노출, 키 범위·폐기, 변경사항 저장 상태 |

현재 프로젝트는 React 19 + Tailwind v4 + shadcn/ui이므로, 레퍼런스의 컴포넌트 코드를 복사하기보다 **화면 구조·밀도·상태 모델만 흡수해 기존 토큰과 컴포넌트로 재구현**하는 편이 안전하다.

## 2. 현재 화면에서 확인한 실제 기능

코드 기준으로 다음 화면을 직접 확인했다.

- `matches`: 구매자/매물/단계 기준 보기, 칸반·목록, 활성/방문/전환/완료 KPI, 상담·메모·업무, 매칭에서 거래 전환
- `deals`: 5단계 파이프라인, 칸반·목록, 단계 체류시간과 건강도, 공동중개, 당사자, 합의 조건, 지급 일정, 계약·수수료
- `contracts`: 계약 목록, 서류 준비도, 계약 상세, 문서 허브, 당사자/특약/조항 편집, 지급 타임라인
- `cashflow`: 월간 현금흐름, 수납·미수·연체, 상세 원장, 공동중개 수수료, 직원 정산, 내 정산, 고정비
- `network`: 가입/탐색 방 목록, 공유 매물, 채팅, 멤버, 보낸/받은 문의와 응답 상태
- `partner-brokers`: 협력 중개사 디렉터리, 연락처, 연결 거래, 우리/상대 배분 및 정산
- `employees`: 직원 목록/보드, 역할·상태·업무량, 성과/보상/거래/업무/상담/로그, 계정 관리
- `service-vendors`: 업체 검색, 업종·지역·공개범위·태그·즐겨찾기, 연락처와 발주
- `settings`: 사무소/사용자, 수수료 배분 정책, 언어, 고정비 요약, MCP 키, AI 규칙/신뢰등급, 계약 조항·인쇄 템플릿

이미 기능은 충분하다. 문제는 기능 부족보다 **한 화면에 동일한 시각적 무게로 노출되는 정보가 많고, 목록→판단→행동의 순서가 화면마다 다르다는 점**이다. 재설계의 핵심은 새 기능을 추가하는 것이 아니라 공통 작업 구조를 만드는 것이다.

## 3. 후보 평가와 라이선스

GitHub와 공식 문서를 기준으로 확인했다. 별/릴리스는 조사일 당시 GitHub 표시값이므로 이후 달라질 수 있다.

| 후보 | 조사 시점 활동성 | 라이선스 확인 | Estate ERP에서의 판단 |
|---|---|---|---|
| [Twenty](https://github.com/twentyhq/twenty) | 약 53.1k stars, v2.21.0, 2026-07-16 | [AGPL-3.0 기반, Enterprise 표기 파일 예외](https://github.com/twentyhq/twenty/blob/main/LICENSE) | 거래 칸반, 객체 목록/상세, 설정 IA의 최우선 참고. 코드 복사 전 파일별 라이선스 확인 필요 |
| [Plane](https://github.com/makeplane/plane) | 약 54.6k stars, v1.3.1, 2026-05-14 | [AGPL-3.0](https://github.com/makeplane/plane/blob/preview/LICENSE) | 저장 뷰, 단계/타임라인, 작업 건강도 표현이 좋음 |
| [Frappe CRM](https://github.com/frappe/crm) | 약 3k stars, v1.78.2, 2026-07-16 | [AGPL-3.0](https://github.com/frappe/crm/blob/develop/license.txt) | 거래·중개사·업체의 목록→상세→활동 패턴이 가장 직접적 |
| [Documenso](https://github.com/documenso/documenso) | 약 13.9k stars, v2.14.0, 2026-06-28 | [AGPL-3.0](https://github.com/documenso/documenso/blob/main/LICENSE) | 문서 캔버스와 참여자/필드 배치에 적합. 계약 업무 로직 자체는 별도 설계 필요 |
| [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | 약 43.1k stars, v2.20.15, 2026-04-27 | [GPL-3.0](https://github.com/paperless-ngx/paperless-ngx/blob/main/LICENSE) | 계약 서류 허브, 문서 카드/필터/저장 뷰에 적합 |
| [ERPNext](https://github.com/frappe/erpnext) | 지속적인 v15/v16 개발 | [GPL-3.0](https://github.com/frappe/erpnext/blob/develop/license.txt) | 미수·수납·지급조건·원장 정보 구조의 표준 참고. 화면 전체를 가져오면 지나치게 회계 중심 |
| [Bigcapital](https://github.com/bigcapitalhq/bigcapital) | 약 3.8k stars, v0.25.23, 2026-06-22 | [AGPL-3.0](https://github.com/bigcapitalhq/bigcapital/blob/develop/LICENSE) | 현금흐름/요약/편집형 금액 테이블의 시각적 기준 |
| [Chatwoot](https://github.com/chatwoot/chatwoot) | 약 34.5k stars, v4.15.1, 2026-06-17 | [MIT, `enterprise/` 별도 조건](https://github.com/chatwoot/chatwoot/blob/develop/LICENSE) | 네트워크 채팅과 문의 작업공간의 최우선 참고 |
| [Frappe HR](https://github.com/frappe/hrms) | 약 8.2k stars, v16.13.0, 2026-07-15 | [GPL-3.0](https://github.com/frappe/hrms/blob/develop/license.txt) | 직원 프로필, 성과, 보상/정산 정보 구조에 적합 |

> 라이선스 주의: 화면을 관찰하고 패턴을 재구현하는 것과 코드를 복사하는 것은 다르다. AGPL/GPL 코드나 원본 에셋을 제품에 포함하려면 배포 방식에 따른 의무를 별도로 검토해야 한다. 특히 SaaS에서 AGPL 수정 프로그램을 네트워크로 제공할 때는 소스 제공 의무가 생길 수 있다. 이는 법률 자문이 아니며 실제 채택 전 확인이 필요하다.

## 4. 공통 UI 시스템 방향

모든 화면을 다음 세 가지 셸로 통일하는 것이 좋다.

1. **목록 작업공간**: 제목/기간 → KPI 3~5개 → 저장 뷰와 필터 → 표 또는 칸반 → 우측 상세 패널
2. **레코드 작업공간**: 고정 헤더(상태·담당자·주요 행동) → 중앙 활동/업무 → 우측 핵심 사실 → 하위 탭
3. **문서 작업공간**: 좌측 목차/문서 → 중앙 문서 캔버스 → 우측 필드/당사자/검증 → 고정 저장/인쇄 바

공통 규칙은 아래처럼 잡는다.

- KPI는 장식용 숫자가 아니라 현재 필터의 결과를 반영하고 클릭 시 필터가 되어야 한다.
- 필터는 한 줄의 칩으로 요약하고, 복잡한 조건은 팝오버에서 편집한다.
- 모든 표는 열 표시/정렬/저장 뷰를 공유한다.
- 상태색만으로 의미를 전달하지 않고 아이콘/텍스트/기한을 함께 표시한다.
- 모달은 생성·확인처럼 짧은 작업에만 쓰고, 정보가 많은 상세는 우측 패널 또는 독립 페이지로 전환한다.
- 카드 내부 필드는 기본 4~6개로 제한하고, 나머지는 펼침/상세에서 보여준다.
- `사무소 owner`, `manager`, `agent`별로 같은 데이터를 다른 깊이로 보여준다. 특히 정산과 설정은 역할별 화면을 분리한다.

---

## 5. 페이지별 상세 제안

### 5.1 매칭 목록·매칭 칸반

현재 화면은 구매자/매물/단계/칸반/목록을 모두 제공한다. 기능은 풍부하지만 보기 모드가 많아 사용자가 “무엇을 기준으로 일할지” 먼저 결정해야 한다.

**1차: Plane Views, 2차: Twenty Kanban, 상세: Frappe CRM**

![Plane의 저장 뷰와 칸반](../ui-reference-assets/deals-ops/plane-views.webp)

적용안:

- 기본 보기는 `단계 칸반`, 보조 보기는 `표` 두 개만 둔다. 구매자 중심/매물 중심은 별도 렌더링 모드보다 **저장된 뷰 프리셋**으로 제공한다.
- 상단에 `오늘 방문 예정`, `7일 이상 정체`, `다음 행동 없음`, `거래 전환 후보`를 저장 뷰로 고정한다.
- 칸반 열 헤더에는 건수뿐 아니라 예상 거래가 또는 예상 수수료 합계를 표시한다.
- 카드 필드는 `구매자`, `매물`, `가격/조건 적합도`, `단계 체류일`, `다음 행동`, `방문 일정`으로 제한한다.
- 카드를 열면 Frappe CRM처럼 중앙에 상담/활동 타임라인, 우측에 구매자·매물 핵심 조건을 두고, 하단에 업무와 메모를 분리한다.
- 드래그로 단계를 바꿀 때 다음 단계의 필수 행동을 바로 묻는다. 예: `방문` 이동 시 날짜, `협상` 이동 시 제안가, `거래 생성` 이동 시 담당자 확인.

피할 것:

- Plane의 이슈 키·스프린트 용어를 가져오지 않는다.
- 카드에 매물 스펙을 전부 넣지 않는다. 매칭 판단에 영향을 주는 차이만 강조한다.
- 같은 필터가 상단 탭, 셀렉트, 사이드바에 중복되지 않게 한다.

### 5.2 거래 파이프라인

[Twenty 공식 칸반 문서](https://docs.twenty.com/user-guide/views-pipelines/capabilities/kanban-views)는 카드 이동, 표시 필드, 압축 보기, 열 집계를 지원하고 5~7개의 단계를 권장한다. 현재 5단계 거래 모델과 잘 맞는다.

![Twenty의 압축형 기회 칸반](../ui-reference-assets/deals-ops/twenty-kanban-compact.png)

적용안:

- 5단계는 유지하되 각 열에 `거래 건수 / 거래금액 / 예상 수수료`를 집계한다.
- 상단에 `전체`, `내 거래`, `공동중개`, `연체/정체`, `이번 달 잔금` 저장 뷰를 둔다.
- 카드 밀도는 `압축`과 `상세` 두 단계만 제공한다.
- 압축 카드: 매물명, 거래 유형, 금액, 담당자, 다음 기한. 상세 카드: 공동중개, 계약 상태, 수수료, 건강도까지 표시한다.
- 건강도는 `연체`, `오래 정체`, `일정 없음`, `정상`을 텍스트와 아이콘으로 표시한다. 붉은 테두리 하나에 의존하지 않는다.
- 단계 이동 후 `다음 행동 + 예정일`을 카드에서 바로 입력하게 해 “일정 없음”을 예방한다.
- 완료/종결 건은 기본 칸반에서 접고, 월별/분기별 저장 뷰에서 조회한다.

피할 것:

- 단계별로 서로 다른 카드 레이아웃을 만들지 않는다.
- 필터 6~8개를 항상 펼쳐놓지 않는다. 활성 조건만 칩으로 남긴다.
- 카드 클릭과 드래그가 충돌하지 않도록 드래그 핸들을 명시한다.

### 5.3 거래 상세

Frappe CRM의 상세는 활동을 주 작업으로 두고, 연락처·예상 매출·조직 정보를 우측에 둔다. Estate ERP의 긴 거래 상세를 한 줄로 계속 쌓는 방식보다 적합하다.

![Frappe CRM의 활동 중심 상세 화면](../ui-reference-assets/deals-ops/frappe-crm-lead-page.png)

적용안:

- 고정 헤더: 매물명, 거래 유형, 단계, 건강도, 담당자, `다음 단계`, `계약 열기`, `수납 등록`.
- 중앙 기본 탭: `활동·다음 행동`. 상담, 방문, 협상, 상태 변경, 지급 확인을 하나의 시간순 흐름으로 합친다.
- 우측 요약: 매도/매수 당사자, 합의 금액, 공동중개사, 핵심 날짜, 계약 상태, 수수료 예상액.
- 하위 탭: `조건`, `일정·지급`, `계약`, `참여 직원·배분`, `문서`, `감사 로그`.
- 화면 안에서 수정 가능한 값과 별도 편집 화면이 필요한 값을 구분한다. 단계·담당·다음 행동은 인라인, 계약 조항/배분 규칙은 전용 편집 화면으로 보낸다.
- 우측 패널 상세로 시작하되 복잡한 작업은 `전체 화면으로 열기`를 제공한다.

피할 것:

- 모든 섹션을 동일한 카드 모양으로 연속 배치하지 않는다.
- “다음 행동”과 “업무”를 별도 데이터처럼 보이게 하지 않는다. 시간축 안에서 연결한다.

### 5.4 계약 목록·문서 허브

Paperless-ngx는 문서를 카드/표로 빠르게 스캔하고 저장 필터로 묶는 방식이 좋다. Estate ERP에서는 문서 자체뿐 아니라 **계약별 필수 문서 준비도**에 초점을 맞춰 변형해야 한다.

![Paperless-ngx의 문서 카드와 필터](../ui-reference-assets/deals-ops/paperless-document-cards.png)

적용안:

- 계약 목록의 1차 행 정보는 `계약명/매물`, `상태`, `당사자`, `계약일`, `잔금일`, `필수 문서 준비도`, `미수`로 제한한다.
- `서명 전`, `필수 문서 누락`, `잔금 7일 이내`, `등기 대기`, `취소`를 저장 뷰로 제공한다.
- 상세 문서 허브는 상단에 `필수 n/n`, `선택 n/n`, `다음 작업`, `제출 상태`를 한 줄로 보여준다.
- 문서 카드는 작은 미리보기, 문서명, 필수/선택, 작성/서명/제출 상태, 마지막 수정자만 표시한다.
- 카드/표 전환을 지원하되 문서 수가 많아지면 표를 기본으로 한다.
- `누락된 필수 문서`는 빈 카드가 아니라 상단 작업 목록으로 보여주고, 각 항목에서 즉시 생성한다.

피할 것:

- Paperless의 태그 중심 분류를 그대로 가져오지 않는다. Estate ERP의 1차 분류는 계약과 제출 단계다.
- 계약 상태와 문서 상태를 하나의 배지로 합치지 않는다.

### 5.5 계약서 편집기

Documenso는 문서 캔버스, 참여자, 서명/필드 배치가 명확하다. 현재의 여러 카드형 폼은 입력하기 쉽지만 실제 계약서 결과와의 연결이 약하므로, 구조화 입력과 문서 미리보기를 동시에 보여주는 편이 좋다.

![Documenso의 문서 작업공간](../ui-reference-assets/deals-ops/documenso-document-workspace.gif)

적용안:

- 좌측: 계약 목차와 검증 상태. `부동산 표시`, `금액`, `당사자`, `특약`, `중개사`, `서명`.
- 중앙: 실제 인쇄 결과와 동일한 A4 문서 캔버스. 현재 편집 필드를 강조한다.
- 우측: 선택 필드의 구조화 입력, 당사자 선택, 데이터 출처, 오류/누락 메시지.
- 상단 고정 바: 문서 상태, 마지막 저장 시각, 오류 수, `미리보기`, `인쇄`, `서명 요청`, `완료`.
- 특약은 카드 나열보다 `템플릿 검색 → 조항 삽입 → 순서 변경 → 변수 확인`의 편집 흐름으로 만든다.
- 주소/금액/당사자처럼 거래 데이터에서 온 값은 출처를 표시하고, 원본을 바꿀지 문서만 덮어쓸지 구분한다.
- 자동 저장은 `저장 중`, `저장됨`, `충돌`, `오프라인` 상태를 명시한다.

피할 것:

- Documenso처럼 모든 필드를 자유 드래그로 만들지 않는다. 법정 계약서는 구조가 고정되어야 하므로 서명·도장 등 제한된 요소에만 드래그를 사용한다.
- 문서 캔버스와 폼 값을 별도 탭에 두어 사용자가 왕복하게 만들지 않는다.

### 5.6 계약 지급 타임라인

ERPNext의 [Accounts Receivable 보고서](https://docs.frappe.io/erpnext/accounting-reports)는 지급조건별 청구·지급·잔액과 에이징을 함께 다룬다. 시각적 타임라인만 두는 것보다 실무 확인에 강하다.

![ERPNext의 지급조건 기반 미수 필터](../ui-reference-assets/deals-ops/erpnext-accounts-receivable-payment-terms.png)

적용안:

- 상단에는 `총 거래금액`, `지급 완료`, `남은 금액`, `다음 기한`만 둔다.
- 본문은 `계약금 → 중도금 → 잔금 → 환급/조정` 시간축과 표를 함께 제공한다.
- 각 행에는 예정일/실제일, 예정액/실제액, 지급자/수취자, 방법, 증빙, 상태, 확인자를 표시한다.
- 부분 지급은 새 상태 배지 하나로 끝내지 말고 `예정 5,000만 / 수납 3,000만 / 잔액 2,000만`처럼 숫자를 직접 보여준다.
- 기한이 지난 행에는 `수납 확인`, `일정 변경`, `업무 생성`을 바로 제공한다.
- 지급 확인은 거래 상세, 계약 상세, 원장 어디에서 시작해도 동일한 기록을 갱신하도록 한다.

피할 것:

- 선과 점만 있는 장식적 타임라인을 만들지 않는다.
- 지급 일정과 중개보수 청구 일정을 같은 축에 섞지 않는다.

### 5.7 현금흐름 대시보드

Bigcapital은 금액 중심 보고서와 편집형 표의 위계가 명확하다. 다만 복식부기 언어를 그대로 쓰지 말고 중개업의 월간 영업 질문으로 바꿔야 한다.

![Bigcapital의 계층형 재무 보고서](../ui-reference-assets/deals-ops/bigcapital-screenshot-1.png)

적용안:

- 기간 선택을 화면 제목 옆에 고정하고 모든 숫자/차트/목록이 같은 기간을 따른다.
- 첫 줄 KPI: `이번 달 청구`, `수납`, `미수`, `연체`, `순유입` 중 역할에 맞는 4개.
- 두 번째 줄: 수납 목표 진행률, 주별 유입 추이, 거래단계별 예상 수수료.
- 아래 작업 목록: `7일 내 수납 예정`, `연체`, `정산 대기`, `증빙 누락`.
- KPI 클릭 시 원장의 해당 저장 뷰로 이동한다.
- 전월 대비는 절대액과 비율을 함께 표시하고, 적색/녹색의 의미가 항목마다 뒤집히지 않게 한다.

피할 것:

- 대차대조표/계정과목 등 일반 회계의 전체 구조를 메인에 노출하지 않는다.
- 합계가 표와 카드마다 다른 기간을 사용하지 않게 한다.

### 5.8 수납·미수 원장

ERPNext General Ledger와 Accounts Receivable은 촘촘한 필터, 기간, 계정/상대방 그룹, 청구·지급·잔액을 한 표에서 다룬다. 현재 원장의 강한 기능성을 유지하면서 시각적 우선순위를 정리하는 데 적합하다.

![ERPNext의 General Ledger](../ui-reference-assets/deals-ops/erpnext-general-ledger.png)

적용안:

- 고정 요약 바: 건수, 청구, 수납, 미수, 연체, 부분수납.
- 기본 열: 거래/매물, 당사자, 청구일, 기한, 청구액, 수납액, 잔액, 상태, 담당자, 다음 행동.
- `거래`를 부모 행으로 하고, 매도측/매수측/공동중개/직원배분을 하위 행으로 펼칠 수 있게 한다.
- 기간, 담당자, 상태, 거래유형, 공동중개, 에이징을 저장 뷰로 조합한다.
- 일괄 행동은 `수납 처리`, `청구서/안내`, `담당자 지정`, `업무 생성`만 우선 노출한다.
- 행 클릭 시 우측 패널에서 지급 이력, 배분, 증빙, 관련 계약을 보고 수정한다.
- 칸반은 `청구 예정/청구/부분수납/완료/연체` 추심 흐름을 관리할 때만 제공하고 표의 대체물이 되지 않게 한다.

피할 것:

- 차변/대변 등 내부 회계 용어를 중개사 화면에 그대로 노출하지 않는다.
- 열을 무제한 기본 표시하지 않는다. 고급 열은 열 설정으로 보낸다.

### 5.9 공동중개 수수료·협력사 정산

이 화면은 일반 미수금보다 **한 거래 안의 양방향 자금 흐름**이 중요하다. ERPNext의 지급/미수 표 구조와 Frappe CRM의 관련 레코드 상세를 결합하는 편이 맞다.

적용안:

- 상단을 `받을 금액`, `받은 금액`, `줄 금액`, `지급한 금액`, `상계 대기`로 양분한다.
- 기본 행: 거래/매물, 협력 중개사, 총 수수료, 배분율, 우리 몫, 상대 몫, 수납/지급 상태, 예정일.
- 거래를 펼치면 매도측·매수측의 원천 수수료와 직원 배분까지 추적할 수 있게 한다.
- 파트너 상세에는 누적 거래수, 누적 우리 몫/상대 몫, 미정산, 최근 거래, 세금계산서/증빙을 둔다.
- `상계 처리`는 금액 출처와 대상 거래를 명확히 남기는 전용 확인 흐름을 사용한다.

피할 것:

- 우리 수입과 상대에게 지급할 돈을 한 “수수료” 숫자로 합치지 않는다.
- 파트너 성과 순위와 실제 지급 작업을 같은 표에 섞지 않는다.

### 5.10 직원 정산

Frappe HR은 사람을 중심으로 목표/성과/보상을 탭으로 분리한다. Estate ERP에서는 평가 점수보다 거래 참여와 지급 상태를 중심으로 바꾼다.

![Frappe HR의 직원 중심 성과 상세](../ui-reference-assets/deals-ops/frappe-hrms-appraisal.png)

적용안:

- 화면 첫 선택은 `정산 기간`이며, 그 다음에 직원/팀/상태 필터가 온다.
- 직원 행: 담당 거래, 완료 거래, 발생 수수료, 지급 대상, 지급 완료, 미정산, 마지막 지급일.
- 직원 상세 탭: `요약`, `거래별 배분`, `조정`, `지급 이력`, `정책 적용 내역`.
- 정책에 의해 계산된 값과 수동 조정 값을 시각적으로 분리하고 조정 사유/승인자를 남긴다.
- 지급 전 검토 화면에서 포함 거래, 공제/가산, 최종액을 한 번에 확인한다.

피할 것:

- HR 평가 지표를 정산 화면에 그대로 넣지 않는다.
- 지급 상태를 직원 전체에 한 배지로만 표시하지 않는다. 부분 지급과 제외 거래를 보여준다.

### 5.11 내 수수료

관리자용 직원 정산의 축소판이 아니라, 에이전트가 “얼마가 왜 발생했고 언제 받는가”를 이해하는 개인 화면이어야 한다.

적용안:

- 첫 줄: `이번 달 발생`, `확정`, `지급 예정`, `지급 완료`.
- 거래별로 내 역할, 배분 기준, 계산식, 확정 여부, 지급 예정일을 표시한다.
- `정책 기준액 → 거래별 조정 → 최종 지급액` 계산 설명을 펼쳐볼 수 있게 한다.
- 미확정/보류 건에는 담당 관리자와 사유를 표시한다.
- 내 화면에서는 타 직원 금액과 사무소 전체 이익을 숨긴다.

피할 것:

- owner용 현금흐름 KPI를 재사용하지 않는다.
- 계산 결과만 보여주고 근거를 숨기지 않는다.

### 5.12 고정비

Bigcapital의 계정/비용 목록처럼 반복성과 기간 환산을 명확히 보여주는 것이 중요하다.

![Bigcapital의 계정 목록 패턴](../ui-reference-assets/deals-ops/bigcapital-screenshot-2.png)

적용안:

- KPI: 월 환산 고정비, 연 환산, 이번 달 결제 예정, 비활성.
- 기본 열: 비용명, 카테고리, 금액, 주기, 월 환산액, 다음 결제일, 세액공제 여부, 상태.
- 월/분기/연 단위 비용을 월 환산해 비교하되 실제 결제일도 보존한다.
- 계약기간/자동갱신/해지 알림을 선택 필드로 제공한다.
- 설정 화면에는 요약과 링크만 남기고 실제 CRUD는 고정비 페이지에서 수행한다.

피할 것:

- 일회성 지출과 반복 고정비를 같은 기본 목록에 섞지 않는다.
- 비용 카테고리별 색을 지나치게 많이 쓰지 않는다.

### 5.13 네트워크 방·채팅

Chatwoot의 작업공간은 목록, 대화, 상대/맥락을 동시에 보여준다. Estate ERP의 네트워크에는 `방 목록 → 대화 → 공유 매물/문의`로 번역할 수 있다.

![Chatwoot의 3단 대화 작업공간](../ui-reference-assets/deals-ops/chatwoot-conversation-dashboard.png)

적용안:

- 앱의 전역 내비게이션 안에서 내부 3단 구조를 쓴다: 좌측 `내 방/탐색/문의`, 중앙 `채팅`, 우측 `공유 매물·방 정보·문의 상태`.
- 좌측 방 항목에는 방명, 지역/주제, 최근 메시지, 미확인 수, 멤버 수를 표시한다.
- 중앙 타임라인에는 메시지뿐 아니라 `매물 공유`, `문의 생성`, `문의 수락`, `매물 상태 변경` 시스템 이벤트도 넣는다.
- 입력창에서 매물을 검색해 작은 첨부 카드로 공유하고, 전송 전 공개 범위를 확인한다.
- 우측 맥락 패널은 선택한 메시지/매물/문의에 따라 내용이 바뀐다.
- 창이 좁아지면 우측 패널을 닫고 오버레이로 열며, 중앙 대화 폭은 보존한다.

피할 것:

- Chatwoot의 고객지원 용어인 담당/해결/매크로를 그대로 쓰지 않는다.
- 전역 내비게이션까지 포함한 4열 화면을 만들지 않는다. 네트워크 내부는 최대 3열이다.

### 5.14 공유 매물·네트워크 문의

공유 매물은 일반 매물 카드가 아니라 개인정보를 마스킹한 협업 객체다. 문의는 메시지 한 줄이 아니라 상태와 후속 행동이 있는 업무다.

적용안:

- 공유 카드 기본 정보: 대표 이미지, 지역/단지, 거래유형, 가격, 면적, 검증상태, 공유자, 갱신시각.
- 소유자 연락처와 상세 주소의 마스킹 상태를 명시하고, 권한 요청 행동을 분리한다.
- 채팅 안에서는 2~3줄 압축 카드, 우측 패널에서는 전체 카드로 보여준다.
- 문의는 `받음/보냄` 탭 아래 `대기/응답/수락/거절/종료` 상태를 일관되게 사용한다.
- 문의 행에는 매물, 요청 사무소, 질문 요약, 경과시간, 담당자, 다음 행동을 표시한다.
- 수락 시 협력 거래 또는 매칭으로 전환하는 명확한 후속 CTA를 둔다.

피할 것:

- 큰 매물 카드를 채팅마다 반복해 대화 흐름을 끊지 않는다.
- 문의 상태를 채팅 메시지 텍스트로만 남기지 않는다.

### 5.15 협력 중개사

Frappe CRM의 목록은 저장 뷰와 밀도 높은 표를, 상세는 활동과 핵심 정보를 함께 제공한다.

![Frappe CRM의 저장 뷰 기반 목록](../ui-reference-assets/deals-ops/frappe-crm-lead-list.png)

적용안:

- 저장 뷰: `최근 거래`, `미정산 있음`, `ERP 연결`, `연락처 미완성`, `장기 미활동`.
- 기본 열: 사무소, 대표/등록번호, 전화, 지역, 최근 거래일, 거래 수, 미정산, 연결 상태.
- 행 클릭은 우측 패널을 열고, `개요`, `연락처`, `관련 거래`, `정산`, `메모·활동` 탭을 제공한다.
- 전화/문자/복사 행동은 연락처 옆에 두고, 표 전체에 여러 아이콘을 흩뿌리지 않는다.
- 파트너 건강도는 거래 수가 아니라 응답성, 최근 협업, 미정산, 분쟁/메모를 조합해 설명한다.

피할 것:

- 중개사 상세를 연락처 명함 수준으로 끝내지 않는다.
- `ERP 연동`을 품질 배지처럼 오해하게 만들지 않는다.

### 5.16 직원 관리

직원 목록은 Frappe CRM의 디렉터리 밀도, 상세는 Frappe HR의 사람 중심 구조를 조합한다.

적용안:

- 기본은 표. 보드는 실제로 업무량 재배분을 할 때만 별도 `워크로드` 보기로 제공한다.
- 기본 열: 이름, 역할, 상태, 담당 매물/구매자, 진행 거래, 기한 지난 업무, 이번 달 완료, 미정산.
- 상세 헤더: 프로필, 역할/권한, 자격증, 재직상태, 빠른 연락, 계정 행동.
- 상세 탭: `업무`, `거래·매칭`, `구매자`, `상담`, `성과`, `보상·정산`, `활동 로그`, `계정`.
- 비활성화/비밀번호 초기화는 `계정` 탭의 위험 영역에 모으고 확인 단계를 둔다.
- 보상 정보는 owner/권한자에게만 보이고, manager에게는 필요한 범위만 노출한다.

피할 것:

- 표와 보드가 같은 정보를 다른 모양으로만 보여주지 않는다.
- 프로필 화면의 모든 통계를 같은 크기의 KPI 카드로 만들지 않는다.

### 5.17 서비스 업체

Twenty의 사용자 정의 객체/목록과 Frappe CRM의 레코드 상세 패턴이 적합하다. 소비자용 마켓플레이스 카드보다 업무용 디렉터리가 우선이다.

적용안:

- 저장 뷰: `즐겨찾기`, `우리 사무소`, `전체 공개`, `지역별`, `최근 이용`, `연락처 필요`.
- 기본 열: 업체명, 업종, 서비스 지역, 가격 메모, 대표 연락처, 태그, 공개 범위, 최근 이용, 즐겨찾기.
- 상세 패널: 기본정보, 연락처, 서비스/가격, 지역, 광고/메모, 발주/이용 이력.
- `전화`, `연락처 복사`, `발주`, `즐겨찾기`를 헤더의 주요 행동으로 제한한다.
- 지역·업종·태그는 칩을 남발하지 않고 기본 2개까지만 표시하고 나머지는 `+n`으로 묶는다.

피할 것:

- 업체마다 큰 홍보 이미지를 기본 표에 넣지 않는다.
- 광고 정보가 신뢰/이용 이력보다 높은 우선순위를 갖지 않게 한다.

### 5.18 설정

설정은 서로 다른 수준의 내용을 한 페이지에 카드로 나열하기보다 Twenty처럼 좌측 섹션 내비게이션을 둔 독립 작업공간이 적합하다.

![Twenty의 일관된 객체·내비게이션 구조](../ui-reference-assets/deals-ops/twenty-custom-layouts.webp)

권장 IA:

| 설정 그룹 | 포함 항목 |
|---|---|
| 사무소 | 사무소 프로필, 언어/지역, 운영 기본값 |
| 구성원·권한 | 직원, 역할, 접근권한, 계정 정책 |
| 거래·수수료 | 기본 수수료, 공동중개, 직원 배분 정책 |
| 계약·문서 | 계약 양식, 특약/조항 템플릿, 인쇄/서명 |
| 재무 | 고정비 요약, 청구/수납 기본값, 세금/증빙 |
| 자동화·AI | 규칙, 신뢰등급, 승인 경계, 실행 로그 |
| 연동·API | MCP/API 키, 외부 서비스, 웹훅 |
| 데이터·감사 | 가져오기/내보내기, 보존, 감사 로그 |

적용안:

- 좌측 2차 내비게이션, 중앙 설정 폼, 우측 도움말/영향 범위를 사용한다.
- 변경사항이 있으면 하단 고정 저장 바를 노출한다.
- 각 설정에 적용 범위 `사무소 전체 / 역할 / 개인`을 표시한다.
- 위험한 변경은 영향을 받는 직원·진행 거래·계약 수를 확인시킨다.
- MCP/API 키는 마스킹, 마지막 사용, 생성자, 폐기 행동을 제공한다.
- AI 규칙은 신뢰등급보다 `어떤 조건에서 무엇을 자동 실행하는지`를 먼저 보여주고 실행 로그와 연결한다.
- 고정비는 설정에서 직접 편집하지 않고 요약과 해당 페이지 링크만 둔다.

피할 것:

- 모든 설정을 동일한 카드 크기로 한 화면에 늘어놓지 않는다.
- 개인 설정과 사무소 전체 정책을 같은 저장 버튼으로 묶지 않는다.

---

## 6. 상용 SaaS 교차 검증

오픈소스만으로 방향을 정하면 구현 가능성은 잘 보이지만, 실제로 돈을 내고 쓰는 업무 SaaS가 다듬어 온 우선순위와 권한 설계를 놓칠 수 있다. 따라서 동일한 라우트를 상용 제품과 다시 비교했다.

조사 범위는 **로그인 없이 볼 수 있는 공식 제품 페이지와 공식 도움말**이다. 실제 유료 계정, 관리자 전용 화면, 한국 로컬라이즈 화면은 열지 않았으므로 다음 제약이 있다.

- 공개 화면은 데모 데이터이거나 기능을 강조하도록 정리된 마케팅 이미지일 수 있다.
- 플랜별 기능, 실험 중인 UI, 권한별 차이는 실제 계정에서 달라질 수 있다.
- 상용 제품은 소스·토큰·접근성 구현을 확인할 수 없으므로 픽셀 복제 대상이 아니다.
- 아래의 “채택”은 정보 구조와 상호작용 원칙이며, 제품 문구·브랜드·에셋 복사를 뜻하지 않는다.

### 6.1 상용 UI 이미지 요약

![Attio의 관계형 칸반](../ui-reference-assets/deals-ops-commercial/attio-kanban.png)

Attio는 연결된 회사 속성을 카드에 표시하고, 단계 체류시간·열 접기·계산을 같은 칸반 설정 안에서 다룬다. 매칭처럼 구매자와 매물이 관계로 연결된 화면에 유리하다.

![Pipedrive의 거래 파이프라인](../ui-reference-assets/deals-ops-commercial/pipedrive-pv1.png)

Pipedrive는 파이프라인 선택, 카드 사용자화, 빠른 필터, `rotting` 상태를 한 작업면에서 제공한다. Estate ERP에서는 이를 공동중개·다음 일정·정체 거래로 번역할 수 있다.

![Pipedrive의 거래 상세](../ui-reference-assets/deals-ops-commercial/pipedrive-deal-detail.png)

Pipedrive 상세는 상단 단계 진행, 집중해야 할 활동, 전체 이력, 우측 요약을 분리한다. 현재 거래 상세의 긴 카드 스택을 재구성할 때 직접적인 상용 기준이다.

![Juro의 계약 저장 뷰](../ui-reference-assets/deals-ops-commercial/juro-contract-views.png)

Juro는 계약의 구조화 필드인 smartfield를 열·필터·리마인더로 재사용한다. 계약 문서와 계약 목록이 같은 데이터 모델을 공유해야 한다는 근거가 된다.

![Xero의 단기 현금흐름](../ui-reference-assets/deals-ops-commercial/xero-short-term-cashflow.png)

Xero는 7/30일 예상 잔액을 예정 수입·지출과 연결하고, 연체 항목의 예상일을 수정해 예측 정확도를 높인다. 월간 실적만 보여주는 현재 대시보드의 보완점이다.

![Intercom의 답변 작성 맥락](../ui-reference-assets/deals-ops-commercial/intercom-inbox-workspace.webp)

이 공개 제품 이미지는 대화 중 관련 출처를 찾아 답변 작성기에 넣는 맥락 보조 방식을 보여준다. 별도의 공식 Inbox 도움말에서는 저장 뷰, 표/채팅 전환, 역할별 우측 Details 패널을 설명한다. 두 패턴을 함께 적용하면 네트워크 문의를 단순 “메시지”가 아니라 처리 상태와 연결 매물을 가진 업무로 다룰 수 있다.

![Rippling의 지급 실행 검토](../ui-reference-assets/deals-ops-commercial/rippling-payroll-run.png)

Rippling은 지급 실행 전에 원천 데이터·변경·승인을 검토하게 한다. 직원 정산에서는 세금/복리후생을 복제하지 않고 `정책 계산 → 조정 → 승인 → 지급` 흐름만 채택한다.

![Ramp의 업체 디렉터리](../ui-reference-assets/deals-ops-commercial/ramp-vendor-table.png)

Ramp는 업체 표를 소유자, 누적 지출, 결제·세금·문서 정보와 연결한다. 서비스 업체와 협력 중개사에서 “연락처 목록”을 “관계 및 거래 이력”으로 확장하는 참고가 된다.

![Linear의 API 키 생성 권한과 키 목록](../ui-reference-assets/deals-ops-commercial/linear-api-key-permissions.png)

이 설정 화면은 일반 멤버의 API 키 생성을 켜고 끄며, 생성자와 적용 팀을 포함한 키 목록을 한곳에서 확인하는 예시다. Estate ERP의 MCP 키도 단순 복사 카드가 아니라 생성자·범위·최근 사용·폐기 상태가 보이는 보안 자산 목록으로 바꿔야 한다.

### 6.2 실제 라우트별 OSS + 상용 비교

| 실제 라우트/화면 | 코드에서 확인한 핵심 기능 | OSS 1순위 | 상용 1순위와 공식 근거 | 채택할 상용 패턴 | 피할 점 | 공개 접근 한계 |
|---|---|---|---|---|---|---|
| `/matches` 매칭 목록·칸반 | 구매자/매물/단계 프리셋, KPI, 칸반·표, 거래 전환 | Plane Views + Twenty | [Attio Kanban](https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views) | 연결 레코드의 속성을 카드에 표시, 단계 체류시간 목표, 열/카드 접기, 열 계산, 다중 카드 단계 이동 | 채용·영업 객체처럼 관계를 한쪽 이름으로 축약하지 않기; 축하 confetti 제외 | 공식 도움말의 데모 워크스페이스만 확인. 고급 편집 이력은 Pro/Enterprise 한정 |
| `/matches` 매칭 상세 | 구매자·매물, 상담, 메모, 업무, 활성 거래 | Frappe CRM detail | [Attio Record pages](https://attio.com/help/reference/managing-your-data/records/create-and-view-records) | 레코드 상세/활동/연결 목록을 한 페이지에서 조립하고 패널 너비 조절 | 이메일·캘린더 활동이 매칭 판단보다 앞서지 않기 | 실제 사용자 데이터와 권한별 레이아웃은 계정 필요 |
| `/deals` 파이프라인 | 5단계 칸반, 거래액/예상수수료, 건강도, 공동중개, 필터 | Twenty + Plane | [Pipedrive Pipeline view](https://support.pipedrive.com/en/article/pipeline-view) | 다음 활동 기준 정렬, 정체 거래 표시, 고정 필터, 카드 필드 사용자화, 파이프라인 가시성 | `won/lost` 두 종결 상태로 한국 중개 계약의 완료/종결을 단순화하지 않기 | 도움말의 샘플 화면. 카드/가시성 일부는 플랜·관리자 권한 의존 |
| `/deals` 거래 상세 | 단계/건강도, 당사자, 공동중개, 조건, 일정, 계약, 수수료 | Frappe CRM detail | [Pipedrive Detail view](https://support.pipedrive.com/en/article/detail-view) | 단계별 체류일, Focus 영역, 활동·메일·파일·변경이력 필터, 고정 요약 | 영업 이메일을 주 흐름으로 만들지 말고 방문·협상·지급·계약 이벤트를 우선 | 로그인한 실제 앱이 아닌 도움말 이미지. 앱 패널은 별도 상품/연동일 수 있음 |
| `/contracts` 계약 목록 | 계약/양식/상태/거래/문서준비도/기간/가격 필터, 표·카드 | Paperless-ngx | [Ironclad Unified Repository](https://support.ironcladapp.com/hc/en-us/articles/31344994944023-The-Repository-Dashboard-Views) | 진행 중 워크플로와 완료 레코드의 통합 검색, 저장 뷰, 일괄 작업, 뷰별 리마인더 | 법무팀 CLM의 복잡한 워크플로 상태를 중개 계약에 그대로 추가하지 않기 | 공식 문서는 공개지만 제품 전체 화면·세부 권한은 데모/계정 필요 |
| `/contracts` 문서 허브 | 필수/선택 문서, 누락, 준비도, 생성·편집·복제·삭제·제출 | Paperless-ngx + Documenso | [Juro Contract repository](https://intercom.help/juro/en/collections/3177789-juro-s-contract-repository) | 문서에서 추출한 구조화 필드를 저장 뷰 열·검색·리마인더에 재사용 | 계약 파일과 진행 중 계약을 별도 사일로로 나누지 않기 | 도움말 기사와 샘플 이미지만 공개. 저장 뷰 권한/대량 작업은 플랜 차이 가능 |
| `/contracts` 문서 편집기 | 주택매매 문서, 당사자, 중개사, 특약/조항, 인쇄 | Documenso | [Juro Smartfields](https://intercom.help/juro/en/articles/5652971-adding-and-using-smartfields), [PandaDoc content blocks](https://support.pandadoc.com/en/articles/9714573-content-builder-blocks-new-experience) | 문서 안 구조화 필드와 우측 필드 패널 연결, 필드 locator, 템플릿 기반 입력, 페이지 나눔 예고 | 마케팅 문서용 자유 블록·가격표를 법정 계약서 편집기에 가져오지 않기 | 두 제품 모두 공개 도움말 기준. Juro 편집기 전체 데모와 PandaDoc 신형 편집기는 계정/순차 배포 의존 |
| `/contracts` 지급 타임라인 | 계약금/중도금/잔금/환급, 예정·실제 금액과 날짜, 상태 | ERPNext AR | [QuickBooks A/R Aging](https://quickbooks.intuit.com/learn-support/en-ca/help-article/accounts-receivable-reports/run-accounts-receivable-aging-report/L4N7PC2hg_CA_en_CA) | 요약/상세 전환, 기한 기준 에이징, 30/60/90일 구간, 미수액 드릴다운 | 일반 회계의 고객·송장 용어를 당사자·지급차수보다 앞세우지 않기 | 공식 도움말은 설명 중심이며 최신 전체 보고서 캡처와 인터랙티브 데모는 없음. 지역/구독별 UI 차이 |
| `/cashflow` 대시보드 | 월간 청구·수납·순이익·미수, 목표, 향후 수납/업무 | Bigcapital | [Xero short-term cash flow](https://www.xero.com/us/accounting-software/analytics/cash-flow/) | 7/30일 예상 잔액, 예정 수입/지출 드릴다운, 연체 예상 지급일 수정, 시나리오 항목 | 예측값을 확정 수입처럼 보이게 하지 않기; 은행 연결을 전제하지 않기 | 공식 제품 페이지의 데모 데이터. 60/90일 예측과 자동 예측은 Analytics Plus 등 플랜 의존 |
| `/cashflow/ledger` 원장 | 수납/미수/연체/부분수납, 표·칸반·열설정·일괄작업·거래 패널 | ERPNext GL/AR | [QuickBooks A/R Aging](https://quickbooks.intuit.com/learn-support/en-ca/help-article/accounts-receivable-reports/run-accounts-receivable-aging-report/L4N7PC2hg_CA_en_CA) | 보고일/현재일 기준 선택, 연체 기간 구간, 요약에서 상세 거래로 이동, 사용자화한 보고서 저장 | 송장·계정과목 중심 표를 그대로 복제하지 않기; 표와 칸반 합계가 어긋나지 않게 하기 | Classic/Enhanced 보고서 UI가 병존하며 실제 화면은 로그인 필요 |
| `/cashflow/partner-commissions` 공동중개 | 파트너별 우리/상대 몫, 누적·미정산 | ERPNext + Frappe CRM | [Ramp Vendor Management](https://support.ramp.com/vendor-management-on-ramp/) | 파트너 소유자, 거래/지급/문서/만료 정보를 한 프로필에 연결, 역할별 가시성 | 협력 중개사를 비용 업체로만 취급하지 않기; 받을 돈과 줄 돈 분리 | 공개 도움말로 표·프로필을 확인. 실제 Bill Pay/세금·권한 흐름은 계정 및 지원 국가 의존 |
| `/cashflow/employee-settlements` 직원 정산 | 직원 성과, 발생/미정산 수수료, 활성 거래 | Frappe HR | [Rippling Payroll](https://www.rippling.com/products/payroll) | 전 회차 비교, 변경 원인 드릴다운, 실행 전 검토·승인, 역할별 지급 실행 권한 | 세금·복리후생·국가별 급여 복잡도를 중개보수 정산에 이식하지 않기 | 공식 제품 이미지 중심. 실제 pay run과 가격은 계정/영업 데모 필요 |
| `/cashflow/my-settlement` 내 수수료 | 내 참여 거래, 내 배분액, 정산 상태 | Frappe HR | [Deel employee payslips](https://help.letsdeel.com/hc/en-gb/articles/15011308032145-How-Employees-Can-See-Their-Payslips) | 최근 지급 카드→전체 내역, 총액/공제/최종액 분해, 개인 셀프서비스 | 회사 전체 정산이나 다른 직원 금액 노출 금지; 급여와 수수료 용어 혼합 금지 | 국가/고용형태에 따라 payslip 항목이 다르며 도움말 캡처만 확인 |
| `/cashflow/expenses` 고정비 | 금액, 주기, 카테고리, 세액공제, 활성/비활성 CRUD | Bigcapital | [Ramp recurring bills](https://support.ramp.com/creating-and-managing-recurring-bill-payments-on-ramps-bill-pay/) | 반복 시리즈, 회차별 승인/자동승인, 다음 생성일, 업체·결제수단 연결 | 카드 사용/구매 승인 기능을 고정비 관리의 전면에 두지 않기 | 공개 도움말 GIF 기준. 실제 자동결제와 승인 정책은 계정/지역/권한 의존 |
| `/network` 방·채팅 | 내 방/탐색, 방 목록, 공유 매물, 메시지, 멤버 | Chatwoot | [Intercom Inbox](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained) | 핀한 뷰, 대화 목록, 중앙 스레드, 역할별 우측 맥락, 키보드 작업 | 고객지원의 담당/해결/SLA/AI 상담 용어를 네트워크 방에 그대로 쓰지 않기 | 공식 도움말/제품 이미지. 실제 역할별 레이아웃은 유료 워크스페이스 필요 |
| `/network` 공유 매물 | 마스킹된 매물 카드, 거래/검증 상태, 채팅 첨부 | Chatwoot context | [Intercom customizable sidebar](https://www.intercom.com/help/en/articles/7911926-customize-the-inbox-to-suit-you-and-how-you-work-best), [Teams Shared files](https://support.microsoft.com/en-us/teams/files/file-storage-in-microsoft-teams) | 선택한 메시지와 연결된 매물 맥락 패널, 방의 공유 자료 탭, 역할별 패널 섹션 | 매물을 일반 파일 첨부처럼 만들지 않기; 거대한 카드로 스레드 폭을 침범하지 않기 | Intercom 앱 패널/Teams 파일 저장은 제품 생태계 전제. 부동산 매물 객체의 공개 데모는 아님 |
| `/network` 문의함 | 받은/보낸 문의, 상태 필터, 응답/수락 | Chatwoot inbox | [Intercom table layout](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained) | 표/대화 전환, 구성 가능한 열, 다중 선택, 우측 미리보기, 닫기/보류에 해당하는 빠른 행동 | 지원 티켓 우선순위·SLA를 그대로 도입하지 않기; 문의 상태와 채팅 읽음 상태 혼합 금지 | 표 레이아웃의 일부 필터 기능은 시점별 제약이 공식 도움말에 명시됨 |
| `/partner-brokers` 협력 중개사 | 사무소/대표/연락처/지역/거래/ERP 연결/정산 | Frappe CRM | [Attio Record pages](https://attio.com/help/reference/managing-your-data/records/create-and-view-records) | 회사 객체와 거래 목록의 다대다 관계, 활동·파일·노트, 상세 패널 사용자화 | 영업 enrichment/직원수·산업군을 국내 중개사 신뢰도처럼 쓰지 않기 | 공식 도움말의 예시 회사 레코드. 자동 enrichment와 편집 이력은 플랜 차이 |
| `/employees` 직원 관리 | 역할·상태·업무량, 거래/구매자/상담/성과/보상/계정 | Frappe HR | [Rippling HCM](https://www.rippling.com/products/hr) | 직원을 단일 원천 레코드로 두고 역할·권한·보상·보고서를 연결, 역할 기반 가시성 | 복리후생/기기/IT 앱 전체를 직원 프로필에 추가하지 않기 | 마케팅용 샘플 이미지 중심. 상세 프로필/권한 구성은 데모·계정 필요 |
| `/service-vendors` 서비스 업체 | 업종/지역/공개범위/태그/즐겨찾기, 연락처, 발주 | Frappe CRM + Twenty | [Ramp Vendor Management](https://support.ramp.com/vendor-management-on-ramp/) | 업체 표, 담당자, 누적 이용, 문서/계약 만료, 연락처, 상세 드로어, 중복 병합 | 지출액이 업체 품질의 대리 지표가 되지 않게 하기; 결제 기능 과노출 금지 | 공식 도움말의 미국 결제·세금 맥락. 한국 발주/사업자 문서는 별도 설계 필요 |
| `/settings` 설정 | 사무소/사용자, 배분정책, 언어, 고정비 요약, MCP, AI 규칙, 템플릿 | Twenty + Plane | [Linear API & Webhooks](https://linear.app/docs/api-and-webhooks), [Stripe roles](https://docs.stripe.com/get-started/account/teams/roles), [Stripe API keys](https://docs.stripe.com/keys) | 설정 영역 분리, 관리자/멤버 권한, 키별 제한 범위·생성자·폐기, 테스트/운영 구분 | 개발자용 용어를 owner에게 그대로 노출하지 않기; 모든 설정을 한 페이지에 두지 않기 | 공식 문서와 일부 설정 캡처만 확인. Stripe 역할은 결제업무 기준이라 Estate ERP RBAC에 직접 대응하지 않음 |

### 6.3 상용 제품에서 최종적으로 추가된 원칙

- 매칭/거래 카드에는 **다음 활동과 단계 체류시간**을 기본 필드로 둔다. Pipedrive·Attio 모두 금액보다 이 두 값으로 실제 업무 우선순위를 만든다.
- 계약 문서의 구조화 필드는 편집기에서만 쓰지 않고 **목록 열, 필터, 리마인더, 보고서**까지 재사용한다.
- 자금 화면은 과거 월간 실적과 별도로 **7/30일 예정 현금 흐름**을 제공하되 예상값임을 명시한다.
- 직원 정산은 계산표가 아니라 `변경 검토 → 승인 → 지급 → 이전 회차 비교`의 실행 흐름으로 만든다.
- 네트워크 문의는 채팅 레이아웃과 표 레이아웃을 오가며 처리하고, 공유 매물은 우측 맥락 패널에서 지속적으로 보인다.
- MCP/API 설정은 키 문자열 카드가 아니라 권한, 범위, 마지막 사용, 폐기 이력을 가진 보안 자산으로 관리한다.

## 7. 우선순위가 높은 재설계 순서

### P0 — 공통 셸

- 저장 뷰, 필터 칩, 표 열 설정, 우측 상세 패널, 상태/기한 표현을 공통 컴포넌트로 만든다.
- KPI 클릭→필터, 행 클릭→상세, 상세→전체 화면의 동작을 통일한다.

### P1 — 거래 생산성

- 매칭 칸반, 거래 파이프라인, 거래 상세를 먼저 바꾼다.
- 이유: 가장 자주 쓰이고 이후 계약·정산 화면의 진입점이 된다.

### P2 — 계약 완결성

- 계약 허브, 문서 편집기, 지급 타임라인을 하나의 흐름으로 연결한다.
- `필수 문서 누락`, `다음 지급`, `서명/제출`이 거래 상세의 다음 행동으로 올라오게 한다.

### P3 — 재무 신뢰성

- 현금흐름, 원장, 공동중개, 직원/내 정산을 동일한 금액·상태 체계로 정리한다.
- 금액 카드보다 거래별 원천 기록과 드릴다운을 먼저 확정한다.

### P4 — 관계·운영

- 네트워크 3단 작업공간, 협력 중개사/업체/직원 디렉터리, 설정 IA를 정리한다.

## 8. 선택하지 않은 후보

- [Crater](https://github.com/crater-invoice-inc/crater): 청구/비용 기능은 맞지만 GitHub 최신 릴리스가 2022년으로 표시되어 현재 디자인 시스템의 주 레퍼런스로는 제외했다.
- [Akaunting](https://github.com/akaunting/akaunting): 기능은 유사하지만 현재 라이선스가 BSL 계열이라 “일반적인 오픈소스 참고” 목록의 핵심 후보에서 제외했다.
- ERPNext 전체 UI 복제: 정보 구조는 강하지만 복식부기와 ERP 용어가 중개사의 일상 작업보다 앞선다. 보고서/원장의 일부 패턴만 선별한다.
- Chatwoot 전체 내비게이션 복제: Estate ERP의 전역 내비게이션과 겹친다. 대화 작업공간의 3단 구조만 사용한다.

## 9. 오픈소스 이미지 및 출처 목록

아래 이미지는 공식 저장소 README 또는 공식 문서에서 조사 목적으로 내려받았다. 보고서 안의 이미지를 제품 에셋으로 재배포하지 않는다.

| 로컬 파일 | 원본 | 사용 목적 |
|---|---|---|
| `plane-work-items.webp` | [Plane official README asset](https://media.docs.plane.so/GitHub-readme/github-work-items.webp) | 칸반과 타임라인/의존성 |
| `plane-views.webp` | [Plane official README asset](https://media.docs.plane.so/GitHub-readme/github-views.webp) | 매칭 저장 뷰 |
| `plane-analytics.webp` | [Plane official README asset](https://media.docs.plane.so/GitHub-readme/github-analytics.webp) | 운영 분석 |
| `twenty-crm-tools.webp` | [Twenty official README asset](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-website/public/images/readme/v2-crm-tools-light.webp) | CRM 객체/거래 도구 |
| `twenty-custom-layouts.webp` | [Twenty official README asset](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-website/public/images/readme/v2-tools-light.webp) | 객체/설정 내비게이션 |
| `twenty-kanban-filter.png` | [Twenty Kanban documentation](https://docs.twenty.com/user-guide/views-pipelines/capabilities/kanban-views) | 칸반 필터 |
| `twenty-kanban-compact.png` | [Twenty Kanban documentation](https://docs.twenty.com/user-guide/views-pipelines/capabilities/kanban-views) | 압축형 거래 칸반 |
| `frappe-crm-lead-list.png` | [Frappe CRM official asset](https://raw.githubusercontent.com/frappe/crm/develop/.github/screenshots/LeadList.png) | 저장 뷰·목록 |
| `frappe-crm-lead-page.png` | [Frappe CRM official asset](https://raw.githubusercontent.com/frappe/crm/develop/.github/screenshots/LeadPage.png) | 활동 중심 상세 |
| `paperless-document-cards.png` | [Paperless-ngx official asset](https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/assets/screenshots/documents-smallcards.png) | 계약 문서 카드/필터 |
| `documenso-document-workspace.gif` | [Documenso official README asset](https://github.com/documenso/documenso/assets/13398220/d96ed533-6f34-4a97-be9b-442bdb189c69) | 계약서 문서 작업공간 |
| `erpnext-general-ledger.png` | [ERPNext official docs asset](https://docs.frappe.io/files/general-ledger.png) | 원장 표 |
| `erpnext-accounts-receivable.png` | [ERPNext official docs asset](https://docs.frappe.io/files/accounts-receivable.png) | 미수/에이징 |
| `erpnext-accounts-receivable-payment-terms.png` | [ERPNext official docs asset](https://docs.frappe.io/files/accounts-receivable-based-on-payment-terms.png) | 지급조건 기반 미수 |
| `bigcapital-screenshot-1.png` | [Bigcapital official README-linked asset](https://raw.githubusercontent.com/abouolia/blog/main/public/screenshot-1.png) | 계층형 재무 요약 |
| `bigcapital-screenshot-2.png` | [Bigcapital official README-linked asset](https://raw.githubusercontent.com/abouolia/blog/main/public/screenshot-2.png) | 계정/비용 목록 |
| `bigcapital-screenshot-3.png` | [Bigcapital official README-linked asset](https://raw.githubusercontent.com/abouolia/blog/main/public/screenshot-3.png) | 금액 편집형 표 |
| `chatwoot-conversation-dashboard.png` | [Chatwoot official asset](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/.github/screenshots/dashboard.png) | 네트워크 3단 작업공간 |
| `frappe-hrms-appraisal.png` | [Frappe HR official asset](https://raw.githubusercontent.com/frappe/hrms/develop/.github/hrms-appraisal.png) | 직원 프로필·성과 구조 |

## 10. 상용 이미지 및 출처 목록

상용 이미지는 각 회사의 공식 제품 페이지 또는 공식 도움말에서 내려받았다. 원본 UI의 저작권은 각 회사에 있으며 내부 디자인 조사용으로만 보존한다. `Ramp recurring bill`은 공식 GIF의 첫 프레임을 PNG로 변환했으며, 그 밖의 이미지는 원본 형식을 유지했다.

| 로컬 파일 | 공식 원본 | 대응 화면 |
|---|---|---|
| `attio-kanban.png` | [Attio official asset](https://a.storyblok.com/f/234930/2068x1392/fc60023878/kanban-view.png) · [도움말](https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views) | 매칭·거래 칸반 |
| `attio-collapsed-kanban.png` | [Attio official asset](https://a.storyblok.com/f/234930/2469x1006/c1abfbbb2f/collapse-columns-kanban.png) · [도움말](https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views) | 압축/접힌 파이프라인 |
| `attio-record-page.png` | [Attio official asset](https://a.storyblok.com/f/234930/1829x1067/6aed6cc3ee/full-record-page-overview.png) · [도움말](https://attio.com/help/reference/managing-your-data/records/create-and-view-records) | 협력 중개사·직원·업체 상세 |
| `attio-record-activity.png` | [Attio official asset](https://a.storyblok.com/f/234930/1920x1428/0273484c64/record-page-activity-tab.png) · [도움말](https://attio.com/help/reference/managing-your-data/records/create-and-view-records) | 활동 타임라인 |
| `pipedrive-pv1.png` | [Pipedrive official asset](https://kb-cms.pipedriveassets.com/pv1.png) · [도움말](https://support.pipedrive.com/en/article/pipeline-view) | 거래 파이프라인/선택 |
| `pipedrive-pv9.png` | [Pipedrive official asset](https://kb-cms.pipedriveassets.com/pv9.png) · [도움말](https://support.pipedrive.com/en/article/pipeline-view) | 거래 저장 필터 |
| `pipedrive-deal-detail.png` | [Pipedrive official asset](https://kb-cms.pipedriveassets.com/deal%20detail%20view%20main.png) · [도움말](https://support.pipedrive.com/en/article/detail-view) | 거래 상세 |
| `juro-contract-views.png` | [Juro official help asset](https://downloads.intercomcdn.com/i/o/zrkld6mp/2406211122/0fb044b0dc14c344cb1d4ec739e4/views-step-1.png) · [도움말](https://intercom.help/juro/en/articles/5653144-managing-contracts-using-custom-dashboards-views) | 계약 저장 뷰 |
| `juro-smartfields-editor.gif` | [Juro official help asset](https://downloads.intercomcdn.com/i/o/zrkld6mp/2454022455/ce610d263a150d9c60612445547f/CleanShot+2026-06-03+at+20_11_07.gif) · [도움말](https://intercom.help/juro/en/articles/5652971-adding-and-using-smartfields) | 계약서 필드/캔버스 |
| `xero-short-term-cashflow.png` | [Xero official asset](https://www.xero.com/content/dam/xero/pilot-images/subfeatures/short-term-cash-flow/short-term-cash-flow-analytics.1657855151581.png) · [제품 페이지](https://www.xero.com/us/accounting-software/analytics/cash-flow/) | 현금흐름 대시보드 |
| `xero-projection-breakdown.png` | [Xero official asset](https://www.xero.com/content/dam/xero/pilot-images/subfeatures/short-term-cash-flow/projection-breakdown.1689292275450.png) · [제품 페이지](https://www.xero.com/us/accounting-software/analytics/cash-flow/) | 예정 수입/지출 드릴다운 |
| `intercom-inbox-workspace.webp` | [Intercom official asset](https://www.intercom.com/intercom-marketing-site/img/helpdesk/inbox/I2Y2_-_Product_page_asset_-_Inbox_-_feature_highlight_-_01.webp) · [제품 페이지](https://www.intercom.com/helpdesk/inbox) | 답변 작성기의 출처·대화 맥락 |
| `intercom-context-panel.webp` | [Intercom official asset](https://www.intercom.com/intercom-marketing-site/img/helpdesk/inbox/I2Y2_-_Product_page_asset_-_Inbox_-_feature_highlight_-_05.webp) · [제품 페이지](https://www.intercom.com/helpdesk/inbox) | 문의 진행상태와 첨부 맥락 |
| `rippling-payroll-run.png` | [Rippling official asset](https://images.ctfassets.net/k0itp0ir7ty4/rPDJsWhDMqgLwgFjF7lt5/238737ab54a69c2e96b56e41367112dc/3_2_Run_Payroll_Sync_enUS.png) · [제품 페이지](https://www.rippling.com/products/payroll) | 직원 정산 실행 |
| `rippling-payroll-compare.png` | [Rippling official asset](https://images.ctfassets.net/k0itp0ir7ty4/3l2cvRPvctIOYhH4qLuuZ7/d878a20e1fd42f1c5923ce28a0b0932f/Compare_to_last_pay_run_enUS.png) · [제품 페이지](https://www.rippling.com/products/payroll) | 전 회차 비교 |
| `ramp-vendor-table.png` | [Ramp official asset](https://assets.ramp.com/help-center/vendor-management-on-ramp/attachments/42070093522195.png) · [도움말](https://support.ramp.com/vendor-management-on-ramp/) | 서비스 업체 목록 |
| `ramp-vendor-profile.png` | [Ramp official asset](https://assets.ramp.com/help-center/vendor-management-on-ramp/attachments/44044592396179.png) · [도움말](https://support.ramp.com/vendor-management-on-ramp/) | 업체/협력사 상세 |
| `ramp-recurring-bill.png` | [Ramp official GIF](https://assets.ramp.com/help-center/creating-and-managing-recurring-bill-payments-on-ramps-bill-pay/attachments/29329067593235.gif) · [도움말](https://support.ramp.com/creating-and-managing-recurring-bill-payments-on-ramps-bill-pay/) | 고정비 반복 설정 |
| `linear-api-settings.png` | [Linear official CDN asset](https://webassets.linear.app/images/ornj730p/production/c944abb65e6b46b14d2666d88f8d390699ffd265-2880x1620.png) · [문서](https://linear.app/docs/api-and-webhooks) | API 기능 개요 이미지 |
| `linear-api-key-permissions.png` | [Linear official CDN asset](https://webassets.linear.app/images/ornj730p/production/91976e7722c04bf16f048765228587c090b0bd96-974x303.png) · [문서](https://linear.app/docs/api-and-webhooks) | 키 생성 권한 |

## 11. 공식 문서 링크

- [Twenty: Kanban views](https://docs.twenty.com/user-guide/views-pipelines/capabilities/kanban-views)
- [Twenty: Set up a sales pipeline](https://docs.twenty.com/user-guide/views-pipelines/how-tos/set-up-a-sales-pipeline)
- [Twenty: Navigation](https://docs.twenty.com/user-guide/getting-started/how-tos/navigate-around-twenty)
- [Plane documentation](https://docs.plane.so/)
- [Frappe CRM: Deal](https://docs.frappe.io/crm/deal)
- [Paperless-ngx: Features and screenshots](https://docs.paperless-ngx.com/#screenshots)
- [ERPNext: Accounting reports](https://docs.frappe.io/erpnext/accounting-reports)
- [Attio: Kanban views](https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views)
- [Attio: Record pages](https://attio.com/help/reference/managing-your-data/records/create-and-view-records)
- [Pipedrive: Pipeline view](https://support.pipedrive.com/en/article/pipeline-view)
- [Pipedrive: Detail view](https://support.pipedrive.com/en/article/detail-view)
- [Ironclad: Unified repository and dashboard](https://support.ironcladapp.com/hc/en-us/articles/31344994944023-The-Repository-Dashboard-Views)
- [Juro: Contract repository](https://intercom.help/juro/en/collections/3177789-juro-s-contract-repository)
- [Juro: Contract timeline](https://intercom.help/juro/en/articles/5653128-using-the-contract-template-timeline)
- [PandaDoc: Content builder blocks](https://support.pandadoc.com/en/articles/9714573-content-builder-blocks-new-experience)
- [QuickBooks: A/R Aging report](https://quickbooks.intuit.com/learn-support/en-ca/help-article/accounts-receivable-reports/run-accounts-receivable-aging-report/L4N7PC2hg_CA_en_CA)
- [Xero: Short-term cash flow](https://central.xero.com/s/article/STCF-Cash-Predictions)
- [Ramp: Vendor management](https://support.ramp.com/vendor-management-on-ramp/)
- [Ramp: Recurring bills](https://support.ramp.com/creating-and-managing-recurring-bill-payments-on-ramps-bill-pay/)
- [Rippling: Payroll](https://www.rippling.com/products/payroll)
- [Deel: Employee payslips](https://help.letsdeel.com/hc/en-gb/articles/15011308032145-How-Employees-Can-See-Their-Payslips)
- [Intercom: Inbox](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained)
- [Linear: API and webhooks](https://linear.app/docs/api-and-webhooks)
- [Stripe: User roles](https://docs.stripe.com/get-started/account/teams/roles)
- [Stripe: API keys](https://docs.stripe.com/keys)

## 12. 최종 추천안

Estate ERP에 가장 맞는 시각 방향은 “화려한 SaaS 대시보드”가 아니라 **밀도 높은 중개 업무 콘솔**이다.

- 바탕 구조는 Frappe CRM처럼 목록과 활동을 빠르게 오가게 한다.
- 파이프라인은 Twenty의 압축형 칸반과 Plane의 저장 뷰에 Pipedrive/Attio의 다음 활동·단계 체류시간을 결합한다.
- 계약은 Paperless의 문서 허브와 Documenso의 문서 캔버스에 Juro의 구조화 필드·저장 뷰를 결합한다.
- 금액 화면은 ERPNext의 예정/지급/잔액 정확성과 Bigcapital의 위계에 Xero의 단기 예측을 더한다.
- 네트워크는 Chatwoot의 3단 대화 작업공간과 Intercom의 표/대화 전환·역할별 맥락 패널을 매물/문의에 맞게 바꾼다.
- 직원 정산은 Frappe HR 정보 구조에 Rippling의 검토·승인·이전 회차 비교를 더한다.
- 업체/협력사는 Frappe CRM의 관계 기록과 Ramp의 업체 프로필을 결합하되 결제 중심성은 제거한다.
- 설정은 Twenty의 IA에 Linear/Stripe의 키·권한·범위·폐기 모델을 적용한다.

이 조합이면 현재 기능을 버리지 않고도 페이지마다 제각각인 카드·필터·상세 흐름을 하나의 UI 시스템으로 수렴시킬 수 있다.
