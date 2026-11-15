# Notion과 매물관리 테이블: 실측 비교 및 개선안

2026-11-14 · 조사 완료, 제품 코드 변경 없음.

현재 표의 어색함은 **글자 크기와 굵기가 여러 단계로 나뉘고, 낮은 행 안에서 칩이 크게 보이는 것**에서 주로 발생한다. 경계선 색과 기본 셀 여백은 이미 상당히 일관적이다. Notion의 형태를 더 많이 붙이기보다 본문·제목·보조 정보의 위계와 행 안의 비율을 정리하는 것이 우선이다. 이는 아래 실측을 바탕으로 한 디자인 판단이다.

## 조사 대상과 방법

- Notion 데스크톱 7.42.3의 현재 열린 **작업 트래커 | 모든 작업**. 3행 × 8열. 초기에는 오른쪽에 상태 속성 편집 패널이 열려 있었다.
- Estate ERP의 실제 Electron `/properties`. 8개 의뢰, 9개 거래. 상세 열 그룹, 첫 행의 연결 구매고객 패널, 상태 선택 팝업이 이미 열린 상태였다.
- REA 6.8.0 CLI로 현재 Notion renderer의 스크립트를 캡처·내보내기한 뒤 선택 번들을 정적으로 분석했다. 원본 TypeScript를 복구했다는 의미는 아니다.
- Electron/CDP로 실제 DOM 크기와 computed style을 측정하고, `CSS.getPlatformFontsForNode`로 실제 글리프를 그린 폰트를 확인했다. CSS에 적힌 폰트 이름만 보고 추측하지 않았다.
- 모든 수치는 **CSS px**다. 두 앱 모두 DPR 2, viewport scale 1. 창 전체 크기는 Notion 1728×990, ERP 1497×990으로 다르다. 아래 비교 부분은 각각 1000×90 CSS px로 캡처했다.
- Notion에서 헤더·제목 hover와 제목 한 번 클릭 → 편집창 → Escape를 관찰했다. 문자를 입력하지 않았으며, 전후 24개 데이터 셀의 표시값 일치를 확인했다. 일시 닫힌 상태 속성 패널은 원래 화면으로 복원했다.

Notion의 헤더와 첫 행:

![Notion 헤더와 첫 행](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/header-first-row.png)

ERP의 헤더와 첫 행:

![ERP 헤더와 첫 행](/Users/hyunsulee/Downloads/notion-table-design-20261114/erp/header-first-row.png)

## 크기와 타이포그래피

표기의 `14 / 400 / 21`은 글자 크기 / 굵기 / 줄높이다. 400은 Regular, 500은 Medium, 600은 SemiBold다.

| 항목 | 현재 Notion 실측 | 현재 ERP 실측 | 해석 |
|---|---|---|---|
| 헤더 높이 | 36 | 34 | 높이 차이는 작지만 글자 크기 차이가 크다 |
| 한 줄 데이터 행 | 37 | 33 | Notion은 내용 36 + 하단 선 1 |
| 두 거래를 담은 ERP 행 | 직접 대응하는 행 없음 | 67 | 업무상 복수 거래 구조이므로 보존 대상 |
| 헤더 글자 | 14 / 400 / 16.8 | 12 / 500 / 17.14 | ERP는 더 작고 굵다 |
| 제목 / 단지명 | 14 / 500 / 21 | 14 / 600 / 20 | ERP 단지명이 더 강하게 강조된다 |
| 일반 텍스트 | 14 / 400 / 21 | 주로 13 / 400 / 18.57 | 본문 크기·줄높이가 다르다 |
| 동·호 | 직접 대응 속성 없음 | 13 / 500 / 18.57 | ERP는 기본 식별정보까지 Medium |
| 가격·월세 | 현재 Notion 표에 숫자 속성 없음 | 14 / 500 / 20 | 가격 정렬 규칙을 Notion에서 관찰했다고 주장하지 않는다 |
| 설명 / 의뢰 메모 | 14 / 400 / 21 | 13 / 400 / 16 | ERP 메모의 줄높이가 특히 조밀하다 |
| 상태·선택 태그 글자 | 14 / 400 / 20 | 12 / 500 / 20 | ERP는 배경은 크고 글자는 작다 |
| 복수 거래의 작은 거래 태그 | 직접 대응 없음 | 11 / 500 / 20 | 글자만 작고 태그 높이는 동일하다 |
| 확인 정보 | 직접 대응 없음 | 주값 12 / 500 / 15, 보조값 10.5 / 400 / 13.13 | 의도적인 2줄 위계지만 주변 크기와 함께 정리 필요 |
| 매칭·광고 버튼 | 직접 대응 없음 | 높이 24, 글자 12 / 400, 아이콘 12 | 업무 기능을 유지하면서 시각 강도만 조정할 대상 |
| 텍스트 셀 좌우 여백 | 8 | 10 | ERP의 실제 여백은 일관되며 이중 padding 문제가 아니다 |

Notion의 텍스트·제목 셀은 줄높이 21 + 상하 7.5씩 = 내용 높이 36이다. 이는 배포 코드와 실제 화면이 일치한다. 단, 체크박스·태그·버튼은 속성 타입별 padding을 사용하므로 모든 셀에 상하 7.5를 일괄 적용하는 구조는 아니다.

ERP의 가격·상태 등 내부 stack은 바깥 padding을 음수 margin으로 상쇄한 뒤 내부 padding을 다시 준다. 코드에 `px-2.5`가 두 번 보여도 실제 시작점은 셀 왼쪽 +10이다. 이를 중복 여백으로 판단해 제거하면 오히려 정렬이 깨진다.

### 실제 폰트

| 대상 | 실제 렌더링 폰트 |
|---|---|
| Notion 한글 | Apple SD Gothic Neo — 일반 Regular, 제목 Medium |
| Notion 라틴·숫자 | SF 계열 (`.SF NS`) |
| Notion 이모지 | Apple Color Emoji |
| ERP 한글·숫자 | Pretendard Variable — Regular / Medium / SemiBold |

현재 macOS의 Notion 표는 Inter 하나로 그려지는 표가 아니다. 시스템 글꼴 스택과 문자별 fallback을 사용한다. 같은 14px·500이라도 Pretendard와 Apple SD Gothic Neo의 획·폭·기준선은 다를 수 있다.

**제안:** 첫 개선에서는 Pretendard를 유지하고 크기·굵기·줄높이를 통일한다. 폰트 자체를 시스템 스택으로 바꾸는 것은 Windows 등 플랫폼별 결과까지 달라지는 별도 결정이다.

## 현재 각 열의 너비

Notion의 너비는 현재 사용자가 설정한 보기의 값이다. 아래 숫자를 Notion의 모든 표에 적용되는 고정 규격으로 해석하지 않는다.

| Notion 열 | 너비 | 표시 방식 |
|---|---:|---|
| 작업 이름 | 276 | 14px / 500 제목, hover 시 열기 표시 |
| 상태 | 130 | 20px 높이의 둥근 상태 태그 |
| 담당자 | 142 | 현재 3행 모두 비어 있음; 실제 담당자 텍스트 폰트는 측정하지 않음 |
| 마감일 | 118 | 14px / 400 날짜 텍스트 |
| 우선순위 | 105 | 20px 높이, radius 4 선택 태그 |
| 작업 유형 | 165 | 여러 태그, 가로 간격 8 / 세로 간격 6 |
| 설명 | 266 | 14px / 400 텍스트 |
| 노력 수준 | 137 | 20px 높이, radius 4 선택 태그 |
| 합계 | 1339 | 데이터 열만 합산 |

| ERP 열 | 너비 | 현재 본문 표현 |
|---|---:|---|
| 선택 | 36 | 체크박스 |
| 거래 | 66 | 24px 태그, 12px / 500 |
| 단지 | 240 | 14px / 600 |
| 동 | 58 | 13px / 500 |
| 호 | 58 | 13px / 500 |
| 공급 | 72 | 13px / 400 |
| 타입 | 66 | 13px / 400 |
| 매칭 | 64 | 아이콘 + 개수 |
| 광고 | 64 | 아이콘 + 개수 |
| 확인 | 112 | 주값과 보조값 2줄 |
| 매물상태 | 120 | 24px 태그, 12px / 500 |
| 가격/보증금 | 155 | 14px / 500, 복수 거래 시 구분 태그 추가 |
| 월세 | 82 | 14px / 500 |
| 입주가능일 | 120 | 24px 태그, 12px / 500 |
| 의뢰 메모 | 320 | 13px / 400 / 줄높이 16, 최대 2줄 |
| 합계 | 1633 | 상세 열 그룹이 펼쳐진 상태 |

ERP 표가 보이는 영역은 1241px이며 가로로 392px가 더 있다. 고정 열 영역은 530px, 가시 너비의 약 42.7%다. 상세 그룹을 접으면 306px가 줄어든다. **열을 무조건 좁혀 한 화면에 모두 넣기보다 현재 `+/-` 그룹과 가로스크롤을 유지**하면서 단지명·상태 긴 값이 잘리는지 검토해야 한다.

## 상태 태그와 선택 태그

| 항목 | Notion 상태 | Notion 일반 선택 | ERP 상태·거래 |
|---|---|---|---|
| 높이 | 20 | 20 | 24 |
| 글자 | 14 / 400 | 14 / 400 | 12 / 500 |
| 줄높이 | 20 | 20 | 20 |
| 모서리 반경 | 10 — pill | 4 | 4; 날짜는 6 |
| 내부 좌우 여백 | 왼쪽 7 / 오른쪽 9 | 각각 6 | 각각 6 |
| 상태 점 | 8, 뒤 간격 5 | 없음 | 6, 뒤 간격 4 |

Notion의 녹색 상태 태그 실측: 배경 `rgba(0,96,38,.157)`, 글자 `#2a533c`, 점 `#46a171`. 일반 선택 태그의 노란색 예시는 배경 `rgba(209,156,0,.282)`, 글자 `#655121`; 분홍색 예시는 배경 `rgba(183,0,78,.153)`, 글자 `#68354e`다. 이는 현재 밝은 테마에서 측정한 색이다.

**비율이 큰 차이:** ERP 태그는 일반 행 높이의 24/33 ≈ 73%를 차지한다. Notion은 20/37 ≈ 54%다. ERP에서는 태그의 배경은 더 크면서 내부 글자는 더 작고 굵어, 데이터 값보다 작은 버튼들이 늘어선 인상이 강해진다.

상태는 둥글게, 거래 유형은 radius 4의 태그로 구별하는 편이 의미도 명확하다. 배경 태그를 20px로 줄여도 클릭 가능한 셀 영역까지 20px로 줄일 필요는 없다.

## 색, 선, 헤더, hover

| 항목 | Notion 실측 | ERP 실측 |
|---|---|---|
| 본문 기준 색 | `#2c2c2b` | 토큰은 동일하나 단지·동·호에 slate900, 면적에 slate700, 메모에 slate600 혼용 |
| 헤더 글자 | `#7d7a75` | `#6f6c66` |
| 헤더 아이콘 | `#8e8b86` | `#a3a09a` |
| 본문 경계선 | 1px `rgba(42,28,0,.07)` | 1px `#f0efed` |
| 헤더의 열 사이 세로선 | 없음 | 있음 |
| 헤더 아이콘 | CSS 16×16, transform 1.2로 보이는 외곽은 19.2×19.2 | 14×14 |
| 헤더 아이콘과 글자 간격 | 6 | 6 |
| 헤더 글자 시작점 | 셀 왼쪽 +32 | 셀 왼쪽 +30 |
| 헤더 hover | 따뜻한 잉크 약 5.1% 배경 | 이번 비교에서는 별도 hover 상태 측정하지 않음 |

Notion 경계선을 흰 배경에 합성하면 약 `#f0efed`다. 따라서 **경계선이 더 진해서 어색하다는 설명은 이번 측정과 맞지 않는다.** 오히려 헤더까지 이어지는 세로선과 warm-neutral / slate 혼용을 정리하는 편이 근거가 있다.

ERP의 실제 선 색은 JSX의 개별 `border-[#eeeeec]` 등과 다르다. `app.css`의 layer 바깥 전역 border-color 규칙이 Tailwind utility layer보다 우선해 `#f0efed`가 적용된다. 향후 선 색을 수정한다면 computed style을 다시 확인해야 한다.

Notion 제목 hover의 ‘열기’는 바깥 55.02×24, 안쪽 버튼 51.02×20, 글자 12px / 500이다. 바깥 radius 6, 안쪽 radius 4. 본문 전체를 강조하기보다 필요할 때 작은 동작을 드러낸다. 정적 코드의 기본 셀 hover/pressed 배경도 `unset`이지만 다른 wrapper의 상태까지 전부 없다는 뜻은 아니다.

## 선택과 편집

Notion 제목을 한 번 클릭하자 해당 셀에 맞춘 편집창이 열렸다. 편집 중에도 **14px / 500 / 줄높이 21**을 유지한다. 관찰한 셀은 276×37, 편집창은 276×38이며 셀의 왼쪽·위보다 각각 1px 바깥에서 시작했다. radius 6, 흰 배경, 얇은 외곽선과 낮은 불투명도의 두 단계 그림자를 사용한다. 텍스트 wrapper padding은 상하 8 / 좌우 9다.

배포 코드에서 확인한 선택 표현은 안쪽 2px 파란 테두리, radius 2, 선택 범위 배경 `rgba(35,131,226,.07)`다. 이는 정적 구조 확인이며, 이번에는 드래그 범위 선택을 실제로 조작하지 않았다.

ERP 공통 편집기 소스는 현재 입력을 `13px / 줄높이16`으로 지정한다. 반면 화면의 가격은 `14px / 줄높이20`이다. **표시 상태와 입력 상태가 서로 다른 타이포그래피를 쓰는 경로가 존재**하므로, 셀별 표시·편집 토큰을 공유하는 것이 개선 후보다. 이 차이는 이번에 ERP 가격을 클릭해 재현한 결과가 아니라 현재 소스와 표시 상태를 대조한 결과다.

## 제안하는 첫 적용 범위

아래는 아직 적용하지 않은 제안이다. 기존 매물 업무 구조를 보존하며 진행한다.

1. **본문 글자 체계:** 일반 본문 14px / 400 / 줄높이21, 단지명만 500. 주요 값마다 500~600을 사용하는 상태를 정리한다. 확인 정보처럼 의미가 있는 보조 정보만 별도 작은 크기를 허용한다. Pretendard는 유지한다.
2. **행과 태그의 비율:** 한 줄 기본 행 37px, 태그 높이20을 기준으로 조정한다. 상태는 pill, 거래·유형은 radius4. 태그 글자도 14px / 400을 출발점으로 삼되 긴 상태명과 좁은 열에서 실제 잘림을 확인한다. 클릭 영역은 셀 전체로 유지한다.
3. **헤더:** 높이36, 14px / 400, 세로 구분선 제거. 본문 선은 유지한다. 헤더 아이콘은 우선 일관된16px로 조정해 검수한다. 이16px 제안은 Notion의 transform 후19.2px와 동일하다는 뜻은 아니다.
4. **텍스트·배경 색 통일:** warm-neutral 본문/보조 토큰으로 slate 혼용을 없앤다. 상세 그룹 헤더와 본문의 배경 계열도 맞춘다. 기존 테마의 가독성 보정을 유지할 수 있으므로 모든 회색을 Notion hex에 강제로 맞출 필요는 없다.
5. **편집 전후 일치:** 일반 표시와 입력에 같은 글자 크기·굵기·줄높이를 사용한다. 기존 한 번 클릭, 키보드 이동, 저장/오류 처리를 유지하면서 시각 변화만 줄인다.
6. **여백은 후순위:** 좌우10을8로 조정할 수 있지만 현재10도 일관적이다. 먼저 타이포그래피·칩·헤더를 고친 후 실화면에서 결정한다. `+/-` 그룹, 거래별 여러 줄, 매칭·광고 기능을 제거하지 않는다.

행 높이를 바꿀 때 한 줄 행만 고정하면 안 된다. 복수 거래 stack, 2줄 메모, 펼친 상세 패널은 각자의 내용 높이를 보존해야 한다. 예를 들어 거래당 내용36이라면 두 거래는 내용72 + 외곽 하단선1을 기준으로 검토할 수 있다.

현재 가상화 추정값은 거래당40인데 실측은 단일33 / 두 거래67이다. 50행 초과 시 사용하는 추정·실측을 함께 정리할 필요가 있다. 이번8행에서는 가상화가 꺼져 있어 실제 스크롤 오류가 재현됐다는 의미는 아니다.

## 근거 파일과 코드 위치

전체 증거 디렉터리: `/Users/hyunsulee/Downloads/notion-table-design-20261114/`

- [Notion 원본 실측](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/metrics-initial.json), [실제 폰트](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/platform-fonts.json), [hover 실측](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/hover-metrics.json).
- [Notion 편집창 실측](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/title-editor-metrics.json), [편집창 화면](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/title-editor.png), [24개 값 일치 및 패널 복원 확인](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/restored-state.json).
- [ERP 실측 보고서](/Users/hyunsulee/Downloads/notion-table-design-20261114/erp/audit.md), [측정 JSON](/Users/hyunsulee/Downloads/notion-table-design-20261114/erp/measurements.json), [실제 폰트와 경계선 CSS 근거](/Users/hyunsulee/Downloads/notion-table-design-20261114/erp/font-and-border-evidence.json).
- [REA 정적 분석 보고서](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/static/audit.md), [원본·파생 파일 SHA-256](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/static/provenance.json).

| 코드 근거 | 위치 — 정적 Notion 파일은 원본을 읽기 좋게 포맷한 파생 파일 |
|---|---|
| Notion 기본36, font14, line21, hover unset | [SelectTokens.js](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/static/readable/SelectTokens.js:69) |
| Notion 타입별 padding | [TableStyleProviders.js](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/static/readable/TableStyleProviders.js:7) |
| Notion 제목 Medium | [BlockPropertyRouter.js](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/static/readable/BlockPropertyRouter.js:4189) |
| Notion 헤더 세로선 해제 | [CollectionViewBlock.js](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/static/readable/CollectionViewBlock.js:25371) |
| Notion 상태만 둥근 토큰 | [SelectTokenComponent.js](/Users/hyunsulee/Downloads/notion-table-design-20261114/notion/static/readable/SelectTokenComponent.js:970) |
| ERP 전역 경계선 색, 색 토큰, 폰트 | [app.css](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/app.css:9) |
| ERP td 여백·셀 스타일 | [property-listings-table.tsx](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx:472) |
| ERP 헤더 스타일 | [property-listings-table.tsx](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx:645) |
| ERP 단지명 | [properties/index.tsx](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/routes/_authenticated/properties/index.tsx:1440) |
| ERP 상태 표시 | [properties/index.tsx](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/routes/_authenticated/properties/index.tsx:4715) |
| ERP 공통 입력 타이포그래피 | [cell-editor.tsx](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/components/data-table/cell-editor.tsx:753) |

실행한 REA 증거 ID:

| 작업 | Evidence ID |
|---|---|
| 현재 페이지 캡처 | `ev_6b3c71e872ef2167a70237369bff1a410af47360e784cc851abf4778323ee3fe` |
| 스크립트 내보내기 | `ev_1ab032a0a505fce22458b575c196de12bf8a32550874d67f98ab48c110bae746` |
| 현재 화면 캡처 | `ev_a02b712fbc05227423151a294a685ab119c1dc84a3c728c8fce7eab281c83eae` |
| 테이블 정적 분석 | `ev_d16a720cb3f955152cc96b5582f265e0a9ee081717ea545d7d90c06ffa75adee` |
| 속성 렌더러 정적 분석 | `ev_a37d61979eaf9411a3b3a5af3e44fb3cf06b6e06dc6c8f7b12b187d1a4e9d351` |
| 기본 셀·태그 정적 분석 | `ev_1cbade65df64bf7cedf2fc02a452da588d90b8a4729f5007bfbe219b8fbcd54b` |

## 조사 범위의 한계

REA 캡처에는992개 스크립트가 목록화됐지만32MiB 제한으로296개 소스가 생략됐다. 정적 분석은 선택한8개 소스를 대상으로 했으며 일부 분석의 노드·별칭·체크포인트 한도에 도달했다. 따라서 전체 Notion 코드나 모든 분기의 복구·검증을 주장하지 않는다. 이번 결론의 주요 값은 현재 화면 실측과 해당 코드의 명시적 상수를 교차 확인한 것이다.

현재 Notion 표에는 숫자·체크박스 속성이나 실제 담당자 값이 없고, 긴 텍스트의 자동 행 확장·실패·저장 중·다크 테마는 이번 조사에서 조작하지 않았다. 위 제안은 아직 구현·시각 검수가 끝난 변경사항이 아니다.
