# Estate ERP UI Demo Report

단일 HTML 보고서: [index.html](./index.html)

## 구성

- 채택한 마스터 UI 시스템과 Attio·Linear 대비 보정 근거
- 세 디자인 방향 비교
- 39개 실제 TanStack route의 페이지별 데모 이미지
- 각 route의 1차 목적, 채택 구조, 대안 A/B, 참고 제품
- 오픈소스·상용·국내 프로그램 조사 원문 링크

## 이미지 화면군

- `assets/screens/foundation/`: 로그인, 온보딩, 홈, AI, 업무, 캘린더, 매물
- `assets/screens/spatial-customer/`: 관리단지, 고객, 상담, 통화, 매칭, 거래, 계약
- `assets/screens/deals-ops/`: 캐시플로우, 원장, 정산, 네트워크, 직원·업체, 자료, 설정
- `assets/reference/`: 선택한 공통 마스터 UI

## 화면별 구현 매니페스트

- `foundation-manifest.md`: route 01–13
- `spatial-customer-manifest.md`: route 14–26
- `finance-ops-manifest.md`: route 27–39

## 열기

브라우저에서 `docs/ui-demo-report/index.html`을 열면 된다. 페이지 검색, 화면군 필터, 이미지 확대, 대안 구조 펼치기를 지원한다.

## 관련 조사

- `../OPEN_SOURCE_AND_COMMERCIAL_SAAS_UI_REFERENCE_REPORT_2026-07-17.md`
- `../ui-reference-research/attio-deep-dive.md`
- `../ui-reference-research/notion-deep-dive.md`
- `../ui-reference-research/attio-notion-route-mapping.md`
- `PROMPT_SYSTEM.md`

프로덕션 앱 코드는 변경하지 않았으며 이 폴더는 UI 방향 검증과 구현 handoff용 산출물이다.
