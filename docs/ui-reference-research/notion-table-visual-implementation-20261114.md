# 매물관리 표 시각 개선 — 구현 및 Electron 검수

2026-11-14. [Notion 실측 조사](./notion-table-visual-audit-20261114.md)의 첫 적용 범위를 실제 `/properties`에 반영했다. 기존 작업 중 변경사항을 보존한 상태에서 제품 파일 5개를 수정·추가했다.

| 항목 | 이전 | 반영 후 실측 |
|---|---|---|
| 기본 한 줄 행 | 33px | 37px |
| 두 거래 행 | 67px | 73px, 각 거래 셀 36px |
| 헤더 | 34px, 글자12/500 | 36px, 글자14/400, 세로 구분선0px |
| 본문 | 13~14px, 굵기400~600 혼용 | 주본문14/400/줄높이21, 단지명만500 |
| 상태·거래·입주 태그 | 높이24, 글자11~12/500 | 높이20, 글자14/400/줄높이20 |
| 상태 모양 | 반경4, 점6 | pill, 점8; 선택 메뉴에도 같은 모양·점 표시 |
| 가격·메모 입력 | 13px/줄높이16 | 14px/400/줄높이21 |
| 긴 메모 | 조밀한 두 줄 | 21px씩 두 줄, 내용에 따라 행58px |

Pretendard, 좌우10px 여백, 본문 경계선 색은 유지했다. 본문에 섞여 있던 slate 색은 warm-neutral 토큰으로 정리했다. 고정 열의 hover/선택 배경은 불투명하게 만들어 가로스크롤할 때 뒤쪽 글자가 비치지 않게 했다.

14px 헤더와 긴 상태명이 잘리지 않도록 거래·공급·타입·매칭·광고 열을74px, 상태 열을148px로 조정했다. 가격155px, 입주120px, 단지240px 등은 유지했다. 메모 열은 남는 너비를 사용한다.

행 내용 높이36을 거래 stack, 활성 거래 연결선, 가상 스크롤 추정치가 공유한다. `tr`과 `td`의 최소 기준을 함께 맞춰, 상태·가격·입주 버튼도 셀 안의36px 전체 높이를 사용한다. 긴 텍스트는 테이블 레이아웃에 따라 더 높은 행을 만들 수 있다.

메모의 상하 여백을 두 줄 제한 요소 바깥으로 분리해 세 번째 줄 일부가 보이던 현상을 수정했다. 표 바깥 지도·상세 화면에서 함께 쓰는 거래 태그에는 기존 기본 규격을 유지했다. 공통 편집기의 새 타이포그래피는 매물 표의 스크롤 영역이 제공하는 CSS 변수로 적용한다.

## 실제 Electron 확인

실행 중인 Electron의 `http://localhost:5175/properties`를 agent-browser/CDP로 조작했다. 최종 renderer는1728×991 CSS px, DPR2였다. 조사 시점과 창 크기가 다르므로 전체 스크린샷의 축척 비교보다 CSS 실측을 기준으로 삼았다.

- 기본 행37, 두 거래 행73, 각 거래 셀36, 헤더36, 상태·거래 태그20을 확인했다.
- 가격을 클릭해 입력창의14px/400/21px를 확인했다. 임시 값을 입력한 뒤 Escape로 취소했고 원래 가격이 유지됐다.
- 두 번째 거래의 가격을 열어 해당 거래 값인지 확인했다. 값을 바꾸지 않고 Tab을 눌러 같은 거래의 월세 셀로 이동했고, 선택 영역은36px였다.
- 상태·입주 선택 메뉴의 현재 값 표시와14px/20px 태그를 확인했다. 값을 선택해 저장하지 않고 닫았다.
- 긴 메모 편집창의 자동 확장과240px 최대 높이를 확인했다. 여러 줄 임시 입력 후 Escape로 취소했고 원문이 유지됐다.
- 상세 열 그룹의11↔15열 전환, 연결 구매고객 패널 열기·닫기를 확인했다.
- 가로스크롤 후 고정 열 배경과 긴 메모의 두 줄 표시를 확인했다.
- 최종 표시값 비교는 일치했다. 앱은 상세 열 그룹이 접힌 상태, 패널과 편집창이 닫힌 상태로 두었다.

자동 검사:

- `pnpm --filter @estate-erp/desktop typecheck` 통과.
- `node --import tsx --test test/cell-edit-state.test.ts test/property-cell-navigation.test.ts`: 12개 통과.
- 변경 대상 `git diff --check` 통과.

현재8개 의뢰로 검수했다. 가상화 추정치는 수정했지만50행 초과 대량 목록의 성능이나 실제 저장 API 왕복을 이번 시각 변경 검수에서 별도로 재검증하지 않았다. 검수 중 업무 데이터는 저장하지 않았다.

## 결과와 근거

- [최종 화면](/Users/hyunsulee/Downloads/notion-table-design-20261114/implementation/final-collapsed.png)
- [상세 열 펼친 화면](/Users/hyunsulee/Downloads/notion-table-design-20261114/implementation/final-expanded.png)
- [상태 선택 화면](/Users/hyunsulee/Downloads/notion-table-design-20261114/implementation/status-menu.png)
- [최종 실측](/Users/hyunsulee/Downloads/notion-table-design-20261114/implementation/final-verification.json), [최종 상태·값 일치](/Users/hyunsulee/Downloads/notion-table-design-20261114/implementation/final-state.json)
- [복수 거래 Tab 이동](/Users/hyunsulee/Downloads/notion-table-design-20261114/implementation/navigation-and-date-verification.json), [입주 메뉴 최종 확인](/Users/hyunsulee/Downloads/notion-table-design-20261114/implementation/date-options-verified.json)
- [이번 변경만 포함한 패치](/Users/hyunsulee/Downloads/notion-table-design-20261114/implementation/change.patch)

제품 코드:

- [공유 높이 기준](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/routes/_authenticated/properties/-property-table-metrics.ts:1)
- [행·셀·헤더](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx:445)
- [열·표시 컴포넌트](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/routes/_authenticated/properties/index.tsx:1420)
- [편집창 스타일](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/components/data-table/cell-editor.tsx:758)
- [매물 표의 편집 스타일 변수](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/app.css:169)
