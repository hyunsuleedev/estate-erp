# Estate ERP 매물·단지·광고·자료 UI 레퍼런스 조사

> 조사일: 2026-07-17  
> 범위: Desktop의 매물 목록/지도/필터, 매물 상세, 매물 등록, 관리단지·동·호, 광고노트, 내 광고, 공적장부, 사진 자료  
> 해석: 요청의 `sass 오픈소스`는 문맥상 **SaaS 오픈소스**로 해석했다. 아래 프로젝트는 Sass 컴포넌트 라이브러리가 아니라, 실제 업무형 SaaS의 정보구조와 상호작용을 참고하기 위한 대상이다.

## 1. 결론부터

이 영역은 하나의 부동산 오픈소스를 통째로 닮게 만드는 것보다, 각 업무에 검증된 인접 도메인의 패턴을 조합하는 편이 낫다.

| 화면군 | 오픈소스 1순위 | 상용 1순위 | 가져올 핵심 |
|---|---|---|---|
| 매물 목록·필터 | [Twenty](https://github.com/twentyhq/twenty) + [Teable](https://github.com/teableio/teable) | [Reonomy](https://www.reonomy.com/solutions/web-application/) | 저장된 뷰, 조용한 고밀도 테이블, 부동산 카드+지도 분할 |
| 매물 지도 | [Twenty](https://github.com/twentyhq/twenty) view shell + [NocoDB Map](https://nocodb.com/docs/product-docs/views/view-types/map) 시각 참고 | [Reonomy 검색](https://www.reonomy.com/resources/property-search/) | 목록과 지도 동시 유지, 클러스터, 현재 지도영역 재검색 |
| 매물 상세 | [Twenty Record Page](https://docs.twenty.com/user-guide/layout/capabilities/record-pages) | [Airtable Record Detail](https://support.airtable.com/docs/airtable-interface-layout-record-detail) | 목록 문맥을 보존하는 sidesheet, 전체 상세와 동일한 섹션 모델 |
| 매물 등록 | [Shelf 신규 자산](https://www.shelf.nu/knowledge-base/adding-new-assets) | [Airtable Form](https://www.airtable.com/platform/views) | 섹션형 단일 폼, 조건부 필드, 우측 등록 요약 |
| 관리단지·동·호 | [Shelf Locations](https://www.shelf.nu/knowledge-base/locations-vs-categories-vs-tags) | [Buildium](https://www.buildium.com/features/) | 계층 탐색, 점유/공실/만기 요약, 현재의 층×라인 그리드 보존 |
| 광고노트·외부매물 | [Actual Budget Reconciliation](https://actualbudget.org/docs/accounts/reconciliation/) | [Airtable Record Review](https://support.airtable.com/v1/docs/interface-layout-record-review) | 수집 세션을 명시한 대조 작업대, 한 건씩 빠르게 판정 |
| 내 광고·네이버 광고 | [Actual Budget Import Matching](https://actualbudget.org/docs/transactions/importing/) | [Buildium Listings](https://www.buildium.com/features/property-management-websites/) | 미연결/연결/무시 큐와 내부 매물 후보 비교, 채널 배포 상태 |
| 발급 문서 | [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | [DocuWare](https://knowledgecenter.docuware.com/shared/df7fa659-e966-4cb2-9e47-b5a9754755c9) | 결과 목록과 PDF 미리보기의 분할 화면, 저장 필터 |
| 사진 자료 | [Immich](https://github.com/immich-app/immich) | [Google Photos](https://www.google.com/photos/about/) | 대량 선택, 메타데이터 패널, 유사 사진 묶음과 대표 컷 |

전체 시각 문법은 **Twenty의 중립적이고 촘촘한 CRM 셸**을 기준으로 두고, 부동산 특화 화면만 별도 패턴을 얹는 구성이 가장 일관적이다. 이미 프로젝트가 React 19, Tailwind v4, shadcn/ui를 쓰므로 다른 프레임워크를 도입할 이유는 없다. 여기서 복제할 대상은 컴포넌트 코드가 아니라 정보 위계와 상호작용이다.

## 2. 실제 코드에서 확인한 현재 기능과 구조적 이슈

| 실제 라우트 | 현재 기능 | 조사에서 중요하게 본 지점 |
|---|---|---|
| `/properties` | 거래유형 탭, 단지/동/호 검색, 지역·유형·가격·면적·입주일·광고·공동중개 필터, 열 토글, 다중 선택, 인라인 수정, quick sheet | [코드](../../apps/desktop/src/renderer/routes/_authenticated/properties/index.tsx#L382)에 `viewMode`가 `'list'`로 고정되어 있고 setter가 없다. 지도 구현과 클러스터는 존재하지만 사용자가 켤 수 없다.
| `/properties/$id` | 개요, 매칭, 상담, 매물·가격, 거래, 관련인, 사진, 공적장부의 8개 탭 | [코드](../../apps/desktop/src/renderer/routes/_authenticated/properties/$id.tsx#L385)의 상위 탭 수가 많아 관계형 정보가 분절된다.
| `/properties/new` | 단지/호실, 거래조건, 비용, 메모, 소유자/임차인, 중복·거래충돌 확인, 우측 등록 요약 | [등록 요약](../../apps/desktop/src/renderer/routes/_authenticated/properties/new.tsx#L940)은 좋은 골격이다. 폼의 스캔성과 조건부 노출을 다듬는 일이 우선이다.
| `/sites` | 단지 좌측 탐색, 동·평형 필터, 표/배치/점유/만기 4개 모드, 층×라인 호실 그리드, 호실 상세 다이얼로그 | 현행 층×라인 매트릭스는 일반 SaaS에 없는 도메인 자산이다. 범용 테이블로 치환하면 안 된다.
| `/properties/external-listings` | 단지·거래유형 기준 스냅샷 세션, 신규/기존 구분, 호수 텍스트·메모 기록, 중복 비교, 일괄 작업, 세션 완료 | 단순 “외부 매물 목록”이 아니라 **가져온 데이터를 검토하는 광고노트 작업대**다.
| `/properties/my-ads` 및 `/properties/naver-my-ads` | 미연결/연결/무시, 내부 매물 연결, 가격·동일 호실 타 광고·원본 링크 비교 | 두 구현이 겹친다. 실제 내비게이션은 [`/properties/naver-my-ads`](../../apps/desktop/src/renderer/components/layout/nav-config.ts#L81)를 가리킨다.
| `/documents` | 발급 상태, 종류/기간/단지 필터, 발급비, 처리중 polling, 보기/재시도/삭제 | 작업 큐 상태와 문서 열람을 한 목록에서 다룬다. 미리보기 분할이 필요하다.
| `/documents/photos` | 단지·유형·카테고리 필터, 매물별 그룹, 4/6/8열 썸네일, lightbox, 대표 사진·카테고리·삭제 | [업로드는 아직 미구현](../../apps/desktop/src/renderer/routes/_authenticated/documents/photos.tsx#L190)이며, 대량 정리 동작이 부족하다.

## 3. 레퍼런스 신뢰도와 라이선스

### 오픈소스 또는 소스 공개 프로젝트

| 프로젝트 | 라이선스/주의 | 활동성 스냅샷 | 이 보고서에서의 역할 |
|---|---|---|---|
| [Twenty](https://github.com/twentyhq/twenty) | Community 영역 AGPL-3.0, enterprise 표시 파일은 별도 조건. [LICENSE](https://raw.githubusercontent.com/twentyhq/twenty/main/LICENSE) 확인 필요 | 2026-07-17 push 확인 | 전체 CRM 셸, 테이블, record page, side panel |
| [Teable](https://github.com/teableio/teable) | 앱 AGPL-3.0, 일부 packages MIT, 브랜드 자산 제외. [LICENSE](https://raw.githubusercontent.com/teableio/teable/develop/LICENSE) | 2026-07-17 push 확인 | 고밀도 그리드, 조건부 폼 |
| [Shelf](https://github.com/Shelf-nu/shelf.nu) | AGPL-3.0 | 2026-07-16 push 확인 | 장소 계층, 자산 등록/목록 |
| [Actual Budget](https://github.com/actualbudget/actual) | MIT | 2026-07-17 push 확인 | import matching, 중복 병합, reconciliation |
| [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | GPL-3.0 | 2026-07-17 push 확인 | 문서 목록, PDF 상세, 저장된 뷰 |
| [Immich](https://github.com/immich-app/immich) | AGPL-3.0 | 2026-07-17 push 확인 | 사진 그리드, 검색, 태그·정보 패널 |
| [NocoDB](https://github.com/nocodb/nocodb) | **OSI 오픈소스가 아닌 Sustainable Use License**. 내부 업무/비상업 용도 제한이 있고 Map은 배포판/플랜 제약도 있다. [LICENSE](https://raw.githubusercontent.com/nocodb/nocodb/develop/LICENSE.md) | 2026-07-16 push 확인 | 코드 채택 대상이 아니라 Map UI의 시각 참고만 |

라이선스는 “화면을 참고할 수 있다”와 “코드를 복사해 제품에 넣을 수 있다”를 구분해야 한다. 특히 NocoDB는 오픈소스 후보로 분류하지 않았다. 스크린샷과 상표도 코드 라이선스와 별개의 권리이므로 이 보고서 안의 이미지는 내부 디자인 연구용으로만 사용한다.

### 상용 제품 공개 화면의 접근 한계

| 제품 | 공식 공개 근거 | 확인 가능 범위와 한계 |
|---|---|---|
| [Reonomy](https://www.reonomy.com/solutions/web-application/) | 공개 제품 화면, [Property Search](https://www.reonomy.com/resources/property-search/), [Property Page 도움말](https://help.reonomy.com/en/articles/6273472-get-the-most-out-of-the-new-property-page) | 검색/지도 분할과 상세의 정보 구조는 공개. 최신 앱 전체는 미국 대상 trial/유료 로그인 필요.
| [Airtable](https://www.airtable.com/platform/views) | 공식 제품 페이지와 [Record Detail](https://support.airtable.com/docs/airtable-interface-layout-record-detail), [Record Review](https://support.airtable.com/v1/docs/interface-layout-record-review) 도움말 | 편집기 화면이 섞여 있지만 layout 동작은 공식 문서로 확인 가능. 실데이터 운영 화면은 로그인 필요.
| [Buildium](https://www.buildium.com/features/) | 공식 대시보드 이미지, [Listings/Website](https://www.buildium.com/features/property-management-websites/) | 포트폴리오·공실·만기·광고 배포 개념은 공개. 내부 unit 관리 상세는 데모 요청 뒤에 있어 픽셀 단위 근거로 쓰지 않음.
| [DocuWare](https://knowledgecenter.docuware.com/shared/df7fa659-e966-4cb2-9e47-b5a9754755c9) | 2026 early-access 공식 도움말의 실제 화면 | 검색 결과, 열 필터, viewer, index metadata를 공개 화면으로 확인 가능.
| [Google Photos](https://www.google.com/photos/about/) | 공식 제품 페이지와 [Photo Stacks 도움말](https://support.google.com/photos/answer/14169846?hl=en) | consumer UI이므로 권한·문서 연결은 참고 대상 아님. 유사 사진 묶음과 top pick만 차용.
| [네이버페이 부동산](https://land.naver.com/) | 공개 매물 지도와 [단지 매물 화면](https://fin.land.naver.com/complexes/122044?articlePyeongTypeNumbers=3&articleTradeTypes=B1&tab=article) | 국내 가격 표기·거래유형·단지 문맥 검증용. 중개사 광고관리센터는 로그인 뒤이므로 공개 화면만 근거로 삼음.

## 4. 라우트별 상세 제안

### 4.1 `/properties` — 매물 목록과 필터

**오픈소스 1순위: Twenty Table View.** 테이블 위의 view 단위, 필터·정렬·필드 노출, 행 클릭 후 side panel의 결합이 현재 기능과 가장 가깝다. **보조: Teable Grid.** 셀 편집과 열 밀도가 더 강하다.

![Twenty table view](../ui-reference-assets/listings/twenty-table-view.png)

![Teable grid](../ui-reference-assets/listings/teable-grid.png)

**상용 1순위: Reonomy.** 검색어와 적용 필터 칩을 상단에 두고, 결과 카드는 주소·규모·최근 거래·소유자처럼 의사결정 필드만 남긴 뒤 우측 지도와 함께 보여준다.

![Reonomy search and map](../ui-reference-assets/listings-commercial/reonomy-search-map.png)

적용안:

1. 상단 순서를 `저장된 뷰 → 거래유형 → 검색 → 필터 → 정렬 → 열 → 밀도`로 고정한다.
2. 거래유형과 단지/동/호는 항상 보이는 1차 필터, 가격·면적·입주일·광고·공동중개는 “상세 필터” sheet 안의 2차 필터로 둔다.
3. 적용된 2차 조건만 한 줄 chip으로 되돌려 보여주고, 조건 수와 결과 수를 함께 표시한다.
4. 행 단일 클릭은 440~520px quick peek, 더블클릭/제목 클릭은 전체 상세로 통일한다.
5. `내 점검 예정`, `광고중`, `확인 만료`, `공동중개` 같은 팀 공용 saved view를 기본 제공한다.
6. compact 36px 행 높이를 기본으로 두되 comfortable 모드를 제공한다. 가격·면적은 tabular number와 오른쪽 정렬을 쓴다.

피할 점:

- Reonomy처럼 카드 한 건의 높이를 크게 쓰면 중개사의 빠른 스캔량이 급감한다. 기본은 표, 지도 모드의 우측 rail에서만 compact card를 쓴다.
- Airtable/Teable의 무제한 색상 pill을 그대로 따라 하지 않는다. 색은 상태와 위험에만 쓴다.
- 모든 필터를 첫 화면에 펼쳐 지금보다 더 높은 툴바를 만들지 않는다.

### 4.2 `/properties` 지도 모드

**오픈소스 1순위: Twenty의 view/side-panel 구조.** 목록 문맥과 선택 레코드를 유지하는 셸을 그대로 지도 view에도 적용한다. **지도 시각 보조: NocoDB Map.** 공식 문서는 marker field, clustering, geography 데이터 연결을 보여주지만 OSI 오픈소스가 아니고 Map 제공 범위에도 제약이 있어 구현 코드는 쓰지 않는다.

![NocoDB map overview](../ui-reference-assets/listings/nocodb-map-overview.png)

![NocoDB marker clustering](../ui-reference-assets/listings/nocodb-map-clustering.png)

**상용 1순위: Reonomy**, 국내 표기 검증은 **네이버페이 부동산**이다. Reonomy의 “결과 목록+지도”, 네이버의 매매/전세/월세 전환과 가격 마커 문법을 결합한다.

적용안:

- 현재 숨은 구현을 `표 | 지도` segmented control로 노출한다. 지도 선택 시 320~360px 결과 rail과 지도를 나란히 둔다.
- 마커 본문은 가격, 테두리/작은 라벨은 거래유형, cluster는 건수 하나만 표현한다.
- 지도 이동 후 자동 재검색하지 않고 `현재 지도에서 검색` 버튼을 명시한다. 사용자가 원하면 자동 갱신을 켤 수 있게 한다.
- rail 행, 마커, quick peek의 선택 상태를 양방향 동기화한다.
- 좌표가 없는 매물은 조용히 누락하지 말고 `좌표 없음 N건` 보정 큐로 보낸다.
- 지도 위 필터는 거래유형·가격·면적까지만 남기고 나머지는 공통 filter sheet를 재사용한다.

피할 점:

- 소비자 포털처럼 큰 사진 카드와 주변 생활정보를 우선하지 않는다. 내부 ERP에서는 점검상태, 광고상태, 확인일이 더 중요하다.
- 여러 의미를 마커 색 하나에 동시에 담지 않는다. 색은 거래유형 또는 위험 중 한 축만 담당해야 한다.

### 4.3 `/properties/$id` — 매물 상세

**오픈소스 1순위: Twenty Record Page + Side Panel.** 동일 레코드를 빠른 보기와 전체 페이지에서 같은 섹션 모델로 보여주는 점이 좋다.

![Twenty record side panel](../ui-reference-assets/listings/twenty-record-side-panel.png)

![Twenty custom layouts](../ui-reference-assets/listings/twenty-custom-layouts.webp)

**상용 1순위: Airtable Record Detail.** sidesheet로 원래 목록을 보존하고, 관련 레코드·revision history·사전 정의 action을 상세에 배치한다.

![Airtable record detail](../ui-reference-assets/listings-commercial/airtable-record-detail.png)

적용안:

- 헤더에 `단지·동·호 / 거래유형 / 가격 / 점검상태 / 다음 확인일`을 한 덩어리로 고정하고, 우측에는 `상담`, `매칭`, `거래 생성`, `수정`을 둔다.
- 8개 상위 탭은 `개요`, `CRM(매칭·상담·관련인)`, `거래·가격`, `사진`, `문서`의 5개로 줄이고 내부 sub-section에서 원래 데이터 수를 유지한다.
- 개요 오른쪽 320~360px는 다음 행동, 만료 위험, 최근 상담만 둔다. 모든 속성을 카드로 반복하지 않는다.
- quick peek와 전체 상세가 같은 header/section component를 공유하도록 설계한다.
- 가격 변경, 상태 변경, 소유자 변경은 하나의 시간축에서 actor와 before/after를 보여준다.
- 공적장부 탭은 카드 6개보다 발급상태 목록+선택한 PDF 미리보기가 더 빠르다.

피할 점:

- Airtable 편집기처럼 모든 필드를 즉시 inline editable로 만들지 않는다. 가격·상태는 빠른 수정, 계약/소유자 정보는 명시적 편집 폼으로 분리한다.
- 탭 이름을 아이콘만으로 줄이지 않는다. 중개업무 용어와 건수는 계속 보이게 한다.

### 4.4 `/properties/new` — 매물 등록

**오픈소스 1순위: Shelf Add Asset.** 자산의 위치/분류/상태를 한 흐름에서 입력하며, 목록으로 돌아가기 전 확인 가능한 폼 구조다. **보조: Teable Form**의 조건부 필드.

![Shelf add asset form](../ui-reference-assets/listings/shelf-add-asset-form.webp)

![Teable form](../ui-reference-assets/listings/teable-form.png)

**상용 1순위: Airtable Form.** 필드 순서, 조건부 표시, 설명, validation을 폼 단위로 통제하는 원칙을 참고한다.

![Airtable form](../ui-reference-assets/listings-commercial/airtable-form.png)

적용안:

- 현행 `본문 + 320px 등록 요약`을 유지한다. 숙련 사용자는 섹션 사이를 왕복하므로 강제 wizard로 바꾸지 않는다.
- 좌측에 `단지·호실 / 거래 / 비용 / 메모 / 관계인` section anchor와 완료/오류 상태를 둔다.
- 매매/전세/월세 선택 뒤 해당 가격 필드만 노출하고, 입력한 모든 거래유형은 우측 summary에서 한 번에 검증한다.
- 단지·동·호 중복과 기존 거래 충돌을 입력 직후 inline preview로 보여준다. 제출 시점에만 경고하지 않는다.
- 하단 action은 `임시저장`, `등록`, `등록 후 계속 추가`로 명확히 구분한다.
- 메모와 비공개 메모는 배경색보다 lock icon, helper text, 접근 범위로 차이를 설명한다.

피할 점:

- Airtable 공개 설문처럼 넓고 큰 한 열 폼을 그대로 쓰지 않는다. 데스크톱 내부 업무에서는 관련 숫자 필드를 2~3열로 묶어야 한다.
- 단지/호실을 wizard 첫 단계 뒤에 감추지 않는다. 끝까지 sticky summary에서 보여야 잘못된 호실 등록을 줄인다.

### 4.5 `/sites` — 관리단지, 동, 호실 그리드와 상세

**오픈소스 1순위: Shelf Locations + Asset Index.** Building → Floor → Room처럼 깊은 위치 계층을 지원하는 모델이 Site → Dong → Unit과 닮았다.

![Shelf asset index](../ui-reference-assets/listings/shelf-assets-index.webp)

**상용 1순위: Buildium.** 대시보드가 total units를 vacant/occupied와 listed/unlisted로 교차 요약하고, expiring leases를 기간별로 나눈다.

![Buildium dashboard](../ui-reference-assets/listings-commercial/buildium-dashboard.png)

적용안:

- 좌측 단지 tree는 `지역 → 단지`, 본문은 `동/평형 필터 + view mode`로 유지한다. 최근 단지와 즐겨찾기를 맨 위에 둔다.
- 현재 `표 | 배치 | 점유 | 만기`는 단순 탭이 아니라 목적이 다른 saved mode로 취급해 각 모드의 필터와 범례를 기억한다.
- 층×라인 매트릭스는 핵심 차별점이므로 보존한다. 행/열 머리글 고정, zoom-to-fit, 키보드 이동, 미배치 호실 tray를 추가한다.
- 한 화면에서는 색을 한 의미에만 쓴다. `배치`는 활동, `점유`는 소유/전세/월세/공실처럼 모드별로 범례를 교체한다.
- 현재 큰 modal인 호실 상세를 480~560px 우측 drawer로 바꿔 선택한 동·층·라인 문맥을 뒤에 남긴다.
- 만기 모드는 `D-30`, `D-60`, `D-90`, `만료` 구간과 담당자/다음 행동을 보여준다.

피할 점:

- Buildium의 회계/임대수익 중심 대시보드를 그대로 가져오지 않는다. 국내 중개 ERP에서는 소유자 확인, 거래유형, 광고/상담 최신성이 우선이다.
- 범용 spreadsheet로 층×라인 그리드를 대체하지 않는다.

### 4.6 `/properties/external-listings` — 광고노트/외부매물 대조

**오픈소스 1순위: Actual Budget.** import 시 기존 수기 거래와 match하고, 중복을 merge하며, cleared/uncleared/reconciled로 마감 상태를 분리한다. 이 개념이 외부 광고와 내부 호실의 대조에 정확히 대응한다.

![Actual account register](../ui-reference-assets/listings/actual-account-register.webp)

![Actual reconciliation progress](../ui-reference-assets/listings/actual-reconciliation-progress.webp)

**상용 1순위: Airtable Record Review.** 왼쪽 review queue에서 빠르게 다음 건으로 이동하고 오른쪽 상세에서 판정하는 triage layout이다.

![Airtable record review](../ui-reference-assets/listings-commercial/airtable-record-review.png)

적용안:

- 세션 시작 시 화면 상단 전체를 `광고 수집 대조 중 · OO단지 · 매매 · 시작 시각`의 sticky reconcile bar로 전환한다.
- 요약은 `신규`, `변경`, `그대로`, `누락/종료 후보`, `호수 미기록`, `중복 의심`으로 나눈다.
- 왼쪽 300~360px review queue와 중앙 외부매물의 queue+detail 2-pane을 쓴다.
- 가격·동·호·중개사·확인일의 before/after를 셀 안에서 비교한다.
- `세션 완료` 전에 종료될 외부 광고와 미처리 건 수를 preview하고, 완료 뒤에는 session log를 남긴다.
- 한 외부 그룹을 한 행으로 두고 동일 호실/중복 원본은 expandable children으로 접는다.

피할 점:

- Notion식 다색 tag를 모든 열에 쓰지 않는다. 신규/변경/종료 위험 세 의미만 강한 색을 쓴다.
- 세션 완료를 평소 toolbar의 작은 버튼으로 두지 않는다. 마감 효과가 크므로 reconcile bar에서만 실행한다.
- 서버 필터와 클라이언트 필터가 같은 이름으로 중복 노출되지 않도록 하나의 filter model로 합친다.

### 4.7 `/properties/naver-my-ads`와 `/properties/my-ads` — 내 광고 관리

**오픈소스 1순위: Actual Budget Import Matching.** “외부 항목 ↔ 내부 원장 후보”를 보여주고 match/merge/ignore하는 흐름을 차용한다.

**상용 1순위: Buildium Listings.** vacant unit의 listed/unlisted를 함께 보며, 저장된 unit 정보로 공개 listing을 배포한다는 제품 모델이 맞다.

![Buildium listing status dashboard](../ui-reference-assets/listings-commercial/buildium-dashboard.png)

![Buildium public listing output](../ui-reference-assets/listings-commercial/buildium-listing.png)

적용안:

- 두 라우트를 하나의 `내 광고` workspace로 합치고 `연결 필요 / 연결됨 / 무시 / 종료·오류` queue를 둔다.
- 상단 KPI는 총 광고수가 아니라 `연결 필요`, `가격 불일치`, `확인 만료`, `종료 실패`처럼 행동 가능한 수치만 둔다.
- 선택 행에서 좌측 외부 광고, 우측 내부 매물 후보를 비교한다. 단지/동/호/거래유형/가격/확인일은 같은 행에 맞춘다.
- 자동 후보에는 정확 일치, 동일 호실, 가격 근접 등 근거를 표시한다.
- `무시`는 사유와 복원 경로를, `연결 해제`는 이후 광고상태에 미치는 영향을 알려준다.
- 네이버 원본 열기는 보조 action, 내부 연결/오류 해결은 primary action으로 둔다.

피할 점:

- Buildium의 임차인 모집/신청 UI를 가져오지 않는다. Estate ERP의 목표는 광고 채널과 내부 매물의 정합성이다.
- 같은 데이터에 대해 table 버전과 card 버전을 별도 라우트로 유지하지 않는다.
- 공개 네이버 매물 화면을 내부 관리 UI처럼 복제하지 않는다. 공개 페이지는 국내 가격/면적 표기 검증에만 쓴다.

### 4.8 `/documents` 및 상세의 공적장부 — 문서 발급·열람

**오픈소스 1순위: Paperless-ngx.** saved view, 필터 가능한 문서 표, 문서 metadata와 viewer를 연결하는 구조가 좋다.

![Paperless document table](../ui-reference-assets/listings/paperless-documents-table.png)

![Paperless document detail](../ui-reference-assets/listings/paperless-document-detail.png)

**상용 1순위: DocuWare.** 검색 결과와 PDF quick preview를 같은 화면에 두고, full viewer에서는 index metadata를 별도 패널로 다룬다.

![DocuWare search and preview](../ui-reference-assets/listings-commercial/docuware-search-preview.png)

![DocuWare document detail](../ui-reference-assets/listings-commercial/docuware-document-detail.png)

적용안:

- 기본 화면을 `문서 결과 표 60~65% + 선택 문서 미리보기 35~40%`로 둔다. 미리보기를 닫으면 표가 전체 폭을 쓴다.
- `최근 발급`, `처리중`, `실패`, `7일 내 만료`, `단지별` saved view를 제공한다.
- 상태는 발급 job 상태와 문서 유효상태를 분리한다. 예: `발급 실패`와 `발급 완료·만료 임박`은 같은 축이 아니다.
- 문서 상세의 metadata는 문서종류, 대상 매물, 발급일, 만료일, 요청자, 비용, 원본 출처만 우선 노출한다.
- 다중 선택 후 다운로드, 재시도, 삭제를 지원하고 각 action의 대상 수를 버튼에 표시한다.
- 매물 상세의 공적장부도 같은 viewer component를 재사용한다.

피할 점:

- DocuWare의 범용 주석/공유/Teams 기능까지 가져오지 않는다. 현재 핵심은 발급 상태, 만료, 매물 연결이다.
- 처리중 polling 때문에 전체 표가 깜빡이거나 선택/스크롤이 초기화되지 않게 한다.

### 4.9 `/documents/photos` 및 매물 상세 사진 — 사진 자료

**오픈소스 1순위: Immich.** advanced search가 파일명, 설명, OCR, 위치, 태그, 기간, 미디어 타입, 즐겨찾기를 한 filter sheet에 묶고, asset info panel에서 태그를 편집한다.

![Immich advanced search](../ui-reference-assets/listings/immich-advanced-search.webp)

![Immich asset info and tags](../ui-reference-assets/listings/immich-asset-info-tags.webp)

**상용 1순위: Google Photos.** 유사 사진을 stack으로 접고 top pick을 대표 이미지로 정하는 패턴이 현행 대표 사진 기능에 잘 맞는다.

![Google Photos stacks](../ui-reference-assets/listings-commercial/google-photos-stacks.png)

적용안:

- 전역 자료실은 `단지/매물 그룹 + 날짜 흐름`, 매물 상세은 `대표 사진 + 카테고리별 gallery`로 목적을 분리한다.
- 썸네일 장기 선택으로 selection mode에 들어가고 `카테고리 변경`, `대표 지정`, `다운로드`, `삭제`를 일괄 처리한다.
- lightbox 오른쪽에 파일명, 촬영/등록일, 카테고리, 메모, 연결 매물, 등록자를 보여준다.
- 연속 촬영/동일 파일 hash를 stack으로 묶고 대표 컷을 고르게 한다. 자동 묶음은 언제든 풀 수 있어야 한다.
- 카테고리 filter는 하드코딩 chip 나열보다 searchable multi-select로 두고, 자주 쓰는 `외관/거실/방/주방/욕실/도면`만 quick filter로 노출한다.
- 업로드가 구현되면 drag-and-drop 후 대상 매물과 카테고리를 먼저 확인하는 staging tray를 둔다.

피할 점:

- Google Photos의 인물/추억/AI 소비자 기능을 모방하지 않는다. 개인정보 리스크가 크고 업무 가치가 낮다.
- 사진을 고정 8열로만 보여주지 않는다. 3단계 density와 썸네일 종횡비 선택을 제공한다.

## 5. 공통 UI 시스템 제안

### 정보 위계

- 전역 셸과 dense data UI는 Twenty처럼 흰색/중립 회색, 1px 경계, 작은 radius를 기본으로 한다.
- page title 20~24px, body 14px, table 12~13px를 기준으로 한다.
- 브랜드 accent는 선택/primary action에만 쓴다. 성공·경고·위험색은 상태에만 쓴다.
- 숫자는 `font-variant-numeric: tabular-nums`; 가격은 오른쪽 정렬하고 억/만원 표기는 입력값과 원값을 오해하지 않게 한다.

### 모든 데이터 화면이 공유할 툴바

`저장된 뷰 | 필터 | 정렬 | 열 | 밀도 | 검색 ---------------- 선택 작업 / 새로 만들기`

화면마다 필터·검색 순서가 달라지면 학습 비용이 커진다. 같은 toolbar shell을 매물, 광고, 문서, 단지 표에 재사용한다.

### 공통 quick peek

매물, 호실, 외부광고, 문서 모두 다음 구조를 공유할 수 있다.

1. 선택한 레코드의 좁은 drawer를 열어 원 목록/지도/그리드 문맥을 유지한다.
2. 핵심 필드와 다음 행동만 표시한다.
3. `전체 상세 열기`로 이동할 때 선택한 saved view와 scroll 위치를 보존한다.
4. drawer와 full page는 header와 section component를 공유한다.

### 접근성과 키보드

- 상태를 색만으로 구분하지 않고 텍스트/아이콘을 함께 쓴다.
- 12px 글자를 쓰더라도 클릭 target은 최소 32~36px로 유지한다.
- 표 행 이동, drawer 열기, 다음/이전 대조 건, 다중 선택에 키보드 경로를 제공한다.
- 지도 marker, 층×라인 cell, 사진 thumbnail에 실제 업무 문맥을 담은 accessible name을 부여한다.

## 6. 구현 우선순위

| 우선순위 | 범위 | 이유 | 완료 기준 |
|---|---|---|---|
| P0 | `/properties` 공통 toolbar, saved view, quick peek, 지도 토글 노출 | 가장 자주 쓰는 화면이고 숨은 지도 구현을 살릴 수 있음 | 표/지도 전환, 필터 상태 유지, 동일 quick peek |
| P0 | 광고노트 reconcile mode와 내 광고 라우트 통합 | 현재 가장 복잡하고 중복된 인지 모델 | 세션 요약, 대조 queue, 완료 preview, 내 광고 단일 workspace |
| P1 | 매물 상세 5개 상위 탭과 공통 record shell | 8개 탭 분절과 quick sheet 중복 해소 | quick peek/full detail 동일 섹션 |
| P1 | 관리단지 unit drawer와 층×라인 grid polish | 도메인 차별점이며 현재 modal이 문맥을 가림 | sticky header, 단일 의미 색, drawer, 키보드 이동 |
| P1 | 문서 split preview | 구현 난도가 비교적 낮고 발급 확인 속도 향상 | 목록 선택만으로 PDF/metadata 확인 |
| P2 | 사진 selection mode와 upload staging | 업로드 백엔드 준비와 함께 해야 함 | 대량 분류/대표/삭제, 업로드 대상 검증 |
| P2 | 등록 폼 section navigation/조건부 표시 | 현행 골격이 이미 양호함 | 오류 section 이동, 충돌 inline preview, continue-add |

## 7. 이미지 provenance

모든 이미지는 hotlink가 끊겨도 보고서를 볼 수 있도록 로컬에 저장했다. 공식 저장소, 공식 문서 또는 공식 제품 페이지의 원본만 사용했다.

### 오픈소스·소스 공개 레퍼런스

| 로컬 파일 | 공식 원본 URL | 프로젝트/용도 |
|---|---|---|
| `listings/twenty-table-view.png` | [Twenty docs raw](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docs/images/user-guide/table-views/table-view.png) | table view |
| `listings/twenty-record-side-panel.png` | [Twenty docs raw](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docs/images/user-guide/home/side-panel.png) | record side panel |
| `listings/twenty-custom-layouts.webp` | [Twenty website raw](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-website/public/images/releases/2.0/2.0.0-custom-layouts.webp) | configurable record layout |
| `listings/teable-grid.png` | [Teable repo raw](https://raw.githubusercontent.com/teableio/teable/develop/static/assets/images/view-grid.png) | grid |
| `listings/teable-form.png` | [Teable repo raw](https://raw.githubusercontent.com/teableio/teable/develop/static/assets/images/view-form.png) | form |
| `listings/shelf-assets-index.webp` | [Shelf official image](https://qliecghuzfchfjwaisyx.supabase.co/storage/v1/object/public/website-images/knowledgebase/add-assets-index.webp) | asset index |
| `listings/shelf-add-asset-form.webp` | [Shelf official image](https://qliecghuzfchfjwaisyx.supabase.co/storage/v1/object/public/website-images/knowledgebase/add-assets-form.webp) | asset form |
| `listings/nocodb-map-overview.png` | [NocoDB docs image](https://nocodb.com/_next/static/media/overview.0ca98890.png) | map overview; visual reference only |
| `listings/nocodb-map-clustering.png` | [NocoDB docs image](https://nocodb.com/_next/static/media/marker-clustering.afb600d5.png) | clustering; visual reference only |
| `listings/actual-account-register.webp` | [Actual docs image](https://actualbudget.org/assets/images/tour-account-register-overview-ba0a84b45f4ac255c34d2dba4bca8e4e.webp) | register/import review |
| `listings/actual-reconciliation-progress.webp` | [Actual docs image](https://actualbudget.org/assets/images/reconcile-5-2025-95c75fa130f0de21eb6c6bc41ff08436.webp) | reconciliation completion |
| `listings/paperless-documents-table.png` | [Paperless repo raw](https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/dev/docs/assets/screenshots/documents-table.png) | document list |
| `listings/paperless-document-detail.png` | [Paperless repo raw](https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/dev/docs/assets/screenshots/editing.png) | document detail |
| `listings/immich-advanced-search.webp` | [Immich docs image](https://docs.immich.app/assets/images/advanced-search-filters-c201f96631a94cc39f4cd7a6d114448e.webp) | advanced search |
| `listings/immich-asset-info-tags.webp` | [Immich docs image](https://docs.immich.app/assets/images/tag-creation-216cd9b95c958a3adbcbd1edb23ef9bf.webp) | asset info/tags |

### 상용 레퍼런스

| 로컬 파일 | 공식 원본 URL | 제품/용도·주의 |
|---|---|---|
| `listings-commercial/reonomy-search-map.png` | [Reonomy official image](https://images.ctfassets.net/8jgyidtgyr4v/4nZtXpRt94sxp0HsOzngPf/a7aded80b4290e81303c6874e41ebb91/Solutions-Reonomy-Hero-900x650.png) | 부동산 검색 결과+지도 |
| `listings-commercial/airtable-grid.png` | [Airtable official image](https://cdn.sanity.io/images/hlcyrtq5/production/4eca812973a68e2f39824440b7ef33af4dd369b4-2560x1920.png?w=1600) | grouped grid |
| `listings-commercial/airtable-form.png` | [Airtable official image](https://cdn.sanity.io/images/hlcyrtq5/production/836669632d7c6c3a0ab569a4b308bde6b6f6ddd2-2560x1920.png?w=1600) | form view |
| `listings-commercial/airtable-gallery.png` | [Airtable official image](https://cdn.sanity.io/images/hlcyrtq5/production/132b266817e983bbea2656b50ffe34253f4c7232-2560x1920.png?w=1600) | gallery; 저장했으나 본문 1순위 이미지는 Immich/Google Photos를 사용 |
| `listings-commercial/airtable-record-detail.png` | [Airtable support image](https://cdn.airtable.document360.io/d0ee2ee4-3f78-47c7-b388-85e40be9fb89/Images/Documentation/interface_record_detail_list_vis_2024.png) | record detail/sidesheet 설정 화면 |
| `listings-commercial/airtable-record-review.png` | [Airtable support image](https://cdn.airtable.document360.io/d0ee2ee4-3f78-47c7-b388-85e40be9fb89/Images/Documentation/interface_record_review_list_properties_2024(1).png) | review queue 설정 화면 |
| `listings-commercial/buildium-dashboard.png` | [Buildium official image](https://www.buildium.com/wp-content/uploads/2025/02/Buildium-Dashboard-and-Mobile-App.png) | listed/unlisted, 점유, 만기 요약 |
| `listings-commercial/buildium-listing.png` | [Buildium official image](https://www.buildium.com/wp-content/uploads/2024/06/Marketing-Website-02-Listing.png) | 배포된 공개 listing 예시; 내부 관리 화면 아님 |
| `listings-commercial/docuware-search-preview.png` | [DocuWare support image](https://cdn.document360.io/0108e24e-b3e8-446c-b670-66b1d2a9e861/Images/Documentation/image(623).png) | 검색 결과+quick preview |
| `listings-commercial/docuware-document-detail.png` | [DocuWare support image](https://cdn.document360.io/0108e24e-b3e8-446c-b670-66b1d2a9e861/Images/Documentation/image(628).png) | PDF+index metadata |
| `listings-commercial/google-photos-stacks.png` | [Google Photos official image](https://lh3.googleusercontent.com/QN8QmSSyBwGYQYGqBeJ-rSZoGfJVqiIUe2lzG5raCRj78t88kvuw6GXFSMwyeQiyZa1hHtJnEb_OeIMH9eTkYh4AhmjoJnxGE4smPA=e365-pa-nu-s0) | 유사 사진 stack/top pick |

## 8. 핵심 공식 문서 모음

- Twenty: [Layout overview](https://docs.twenty.com/user-guide/layout/overview), [Record pages](https://docs.twenty.com/user-guide/layout/capabilities/record-pages), [Views and pipelines](https://docs.twenty.com/user-guide/views-pipelines/overview)
- Teable: [Form view와 conditional visibility](https://help.teable.io/en/basic/view/form)
- Shelf: [Adding assets](https://www.shelf.nu/knowledge-base/adding-new-assets), [Locations vs categories vs tags](https://www.shelf.nu/knowledge-base/locations-vs-categories-vs-tags), [Asset index settings](https://docs.shelf.nu/advanced-index/asset-index-settings)
- NocoDB: [Grid](https://nocodb.com/docs/product-docs/views/view-types/grid), [Map](https://nocodb.com/docs/product-docs/views/view-types/map), [View availability](https://nocodb.com/docs/product-docs/views)
- Actual Budget: [Importing](https://actualbudget.org/docs/transactions/importing/), [Merging duplicates](https://actualbudget.org/docs/transactions/merging/), [Reconciliation](https://actualbudget.org/docs/accounts/reconciliation/)
- Paperless-ngx: [Usage and UI](https://docs.paperless-ngx.com/usage/)
- Immich: [Searching](https://docs.immich.app/features/searching/), [Tags](https://docs.immich.app/features/tags/), [Features](https://immich.app/features)
- Reonomy: [Web application](https://www.reonomy.com/solutions/web-application/), [Property page](https://help.reonomy.com/en/articles/6273472-get-the-most-out-of-the-new-property-page)
- Airtable: [Views](https://www.airtable.com/platform/views), [Record detail](https://support.airtable.com/docs/airtable-interface-layout-record-detail), [Record review](https://support.airtable.com/v1/docs/interface-layout-record-review)
- Buildium: [Feature overview](https://www.buildium.com/features/), [Property website/listing](https://www.buildium.com/features/property-management-websites/)
- DocuWare: [New client features and limitations](https://knowledgecenter.docuware.com/shared/df7fa659-e966-4cb2-9e47-b5a9754755c9)
- Google Photos: [Product overview](https://www.google.com/photos/about/), [Photo stacks](https://support.google.com/photos/answer/14169846?hl=en)
- 국내 문맥: [네이버페이 부동산](https://land.naver.com/), [공개 단지 매물](https://fin.land.naver.com/complexes/122044?articlePyeongTypeNumbers=3&articleTradeTypes=B1&tab=article)
