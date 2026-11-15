# 연결 구매고객 표: Notion 헤더·정렬·너비 조절 비교

2026-11-15. 실행 중인 Notion `작업 트래커 | 모든 작업`과 Estate ERP Electron `/properties`를 조사했다. 아래 비교는 변경 전 조사다. 사용자 승인 후 1차 구현을 적용했으며 완료 범위와 검증은 마지막 절에 기록했다.

## 판단

현재 표의 글자 크기·행 높이·본문 세로선은 이미 Notion에 가까워졌다. 가장 큰 차이는 **헤더와 경계선을 조작할 수 없고, 보기 설정을 사용자가 조정·유지할 수 없다는 것**이다. 단순 색상 조정보다 열 메뉴와 리사이즈를 먼저 붙이는 편이 효과가 크다.

| 항목 | 이번에 확인한 Notion | 현재 연결 구매고객 | 권장 방향 |
| --- | --- | --- | --- |
| 헤더 | 열 전체가 버튼. 호버 배경, 열린 상태, 메뉴 제공 | 아이콘+텍스트 `span`, 기본 커서 | 헤더 전체 클릭·Enter/Space로 열 메뉴 |
| 정렬 | 헤더 → 정렬 → 오름/내림. 실제 행 순서 변경 확인 | 패널 우측 `오래 머문 순 ↔ 단계순` 토글 | 열별 정렬·해제, 현재 기준 명시 |
| 정렬 표시 | 파란 `↑ 상태` 칩과 활성 정렬 아이콘 | 두 가지 모드의 텍스트만 표시 | `예산 상한 ↓`처럼 대상·방향 표시 |
| 열 너비 | 경계 드래그 도중 헤더·본문 함께 변경 | 고정 CSS Grid, 메모만 남는 공간 사용 | 공유 너비 모델과 실시간 드래그 |
| 조작 단서 | 경계 `col-resize`, 파란 핸들; 헤더에 이동 핸들 레이어 | 경계는 시각적 선, 조작 상태 없음 | 클릭·리사이즈·재배치 영역 구분 |
| 열 설정 | 헤더 메뉴에 숨김·고정·콘텐츠 줄바꿈 | 없음 | 숨김·메모 줄바꿈·기본 너비 복구 추가 |
| 설정 유지 | 배포 코드에서 보기 format 변경 경로 확인 | 정렬은 패널 내부 state, 접으면 초기화 가능 | 패널 밖에 사용자별 보기 상태 보관 |

Notion의 열 숨김·고정·줄바꿈은 **메뉴 존재를 확인**했다. 이번에 각 설정을 모두 적용한 것은 아니다. 열 재배치는 핸들과 관련 코드의 존재만 확인했고 실제 열 순서 이동을 검증하지 않았다. Notion 재시작 후 설정 유지와 서버 저장 완료도 이번 검증 범위 밖이다.

## 실제 화면에서 확인한 세부 동작

1. 상태 헤더 클릭으로 속성 메뉴를 열었다. 안정된 상태의 메뉴는 폭 220px, 모서리 10px, 항목 높이 28px였다. 정렬 하위 메뉴는 폭 200px이며 오름차순·내림차순이 나란한 두 항목이다. [메뉴 화면](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/runtime/04-sort-submenu.png), [측정값](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/runtime/sort-submenu.json)
2. 상태 오름차순을 적용하자 기존 `완료 → 진행 중 → 진행 중`에서 `진행 중 → 진행 중 → 완료`로 바뀌고 `↑ 상태` 칩이 나타났다. 상태 값 자체는 그대로였다. [적용 화면](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/runtime/14-status-sorted.png), [행 관측값](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/runtime/sort-applied.json)
3. 상태 열 오른쪽 경계를 40px 이동했다. 최초 100px, 드래그 중 측정 130px, 놓은 뒤 140px, 복원 뒤 100px였다. 다른 열 너비는 동일했다. 히트 영역은 5px, 커서는 `col-resize`였다. [드래그 화면](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/runtime/07-resize-drag.png), [전후 값](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/runtime/resize-proof.json)
4. 구매고객 헤더는 실제 DOM에서도 모두 `span`이며 고객 140px·연락처 140px·거래 74px·예산 180px·면적 120px·단계 164px·담당 84px였다. 메모는 이 화면에서 470px를 차지한다. 긴 메모가 넓은 공간을 차지하는 동안 예산 초과 설명은 잘린다. 사용자가 예산을 넓히고 메모를 줄일 수 있게 하는 것이 구체적인 개선점이다. [현재 ERP 화면](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/runtime/16-erp-expanded.png), [DOM 측정](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/runtime/erp-header.json)

정렬을 제거한 후 세 행의 표시값·순서와 모든 열 너비가 시험 전과 동일함을 비교했다. 열린 dialog도 0개였다. 조사 도중 좌표가 바뀌어 열린 빈 담당자 필터는 제거했다. 선택 상태·사이드바 등 앱 전체 상태의 동일성을 검증한 것은 아니다. [복원 검증](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/verification-summary.json)

## REA 코드 근거

REA 6.8.0 CLI로 현재 renderer를 새로 식별·캡처하고, 같은 배포 코드의 정적 분석을 실행했다. 실제 클릭과 드래그는 직접 CDP, ERP 표 확인에는 `electron` skill의 agent-browser와 직접 CDP를 사용했다. REA가 클릭·드래그를 수행했다고 주장하지 않는다.

- 대상: CDP 9333, target `3B2F3CBAE4CECA007EF82860E25B8708`, `https://app.notion.com/p/412639808a278021ab96e375d67c04c2?v=412639808a2780e1885e000ca60d131b`.
- 현재 페이지 Evidence: `ev_e0e87ab614872b780c95c1586833b291bf70c899778222a08480d167a4980bfb`.
- CollectionViewBlock 정적 Evidence: `ev_afb8679be37cf57d81c3dc6c2c0d85656fb419d01243a15b99b22c6f0a4fe205`.
- TableHeaderCellMenu 정적 Evidence: `ev_a6f5f5015aad6a6c347e557362c031b37fade0c6226cbc336a9ac3146e062813`.

드래그는 시작 너비를 저장한 뒤 이동량을 더하고 최소 너비를 적용한다. 이동 중에는 `onTemporaryResize`, 놓으면 `onAccept`, 취소하면 `onCancel`을 호출한다. [동작 코드](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/collection-readable.js:24709)

`onTemporaryResize`는 `temporaryFormat`만 갱신한다. 확정 경로는 `TableHeaderRow.handleColumnResizeAccept`라는 이름으로 undo 가능한 트랜잭션을 만들고 보기 format을 갱신한 뒤 임시 상태를 비운다. 이는 **정적 호출 경로**이며 서버 응답 성공의 증거는 아니다. [확정 경로](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/collection-readable.js:25003)

경계의 파란 강조는 호버 또는 드래그 상태에 연결된다. 너비 변화에는 별도의 보간 애니메이션이 없고, 핸들 배경만 200ms ease-out으로 바뀐다. 같은 코드에 경계 더블클릭으로 렌더된 셀 내용을 측정해 너비를 맞추는 경로도 있다. **더블클릭 자동 맞춤은 코드 확인만 했으며 이번에 직접 실행하지 않았다.** [핸들·자동 맞춤](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/collection-readable.js:24762)

정렬 메뉴는 속성 ID와 `ascending/descending` 방향을 전달한다. 헤더에서 적용한 정렬은 필터 바를 열고 `temporaryState.sorts`를 갱신하는 경로다. 따라서 모든 정렬이 즉시 공용 보기의 영구 설정을 덮어쓴다고 해석하면 안 된다. [정렬 메뉴](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/header-menu-readable.js:2284), [적용 함수](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/header-menu-readable.js:3160)

캡처의 32MiB 본문 예산 때문에 1,018개 스크립트 중 320개의 본문이 빠졌다. 필요한 TableHeaderCellMenu 본문은 동일 renderer에서 보완 취득했으며 REA가 기록한 해시와 SHA-256이 일치했다. CollectionViewBlock 정적 그래프는 semantic node/unknown 보존 한도에 도달했다. 위 함수 설명은 전체 자동 추적이 아니라 해시가 일치하는 배포 소스의 직접 대조를 포함한다. 원래 TypeScript 소스를 복원한 것이 아니다. [출처·해시](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/source-provenance.json), [메뉴 본문 보완](/Users/hyunsulee/Downloads/notion-buyer-table-interactions-20261115/menu-source-provenance.json)

## ERP 적용 순서 제안

**1차: 헤더 메뉴·열별 정렬·리사이즈·설정 유지.** 헤더를 버튼으로 바꾸고 메뉴에 오름차순·내림차순·정렬 해제를 둔다. 경계에는 6~8px 정도의 독립 히트 영역과 얇은 파란 피드백을 둔다. 헤더 높이 36px와 본문의 세로선은 유지한다. 메뉴 클릭과 경계 드래그가 서로 실행되지 않도록 분리한다.

**2차: 숨김·줄바꿈·자동 너비·기본값 복구.** 특히 메모가 공간을 과도하게 차지하는 문제를 사용자가 조정할 수 있게 한다. 고객 기준 열과 선택 영역은 항상 남기는 편이 좋다.

**3차: 열 재배치·셀 키보드 탐색.** 헤더 드래그 시작과 메뉴 클릭을 구분하고, 열 순서가 바뀌어도 이름·연락처·단계·메모의 직접 액션과 상세 펼침이 유지되어야 한다. 이는 이번 1차보다 범위가 큰 후속 작업이다.

상위 매물 표에는 이미 [열 메뉴](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/routes/_authenticated/properties/-components/property-table-controls.tsx:40)와 [리사이즈](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx:713)가 있다. 공통 메뉴의 label·선택 기능을 일반화하고, 구매고객은 작은 전용 열 모델을 두는 접근이 적절하다. 현재 메뉴는 매물 컬럼 목록과 필수 pin 콜백에 연결돼 있어 그대로 이식하면 안 된다.

현재 [고정 Grid](/Users/hyunsulee/estate-erp/apps/desktop/src/renderer/routes/_authenticated/properties/-components/property-match-panel.tsx:92)를 열 ID·폭·최소폭·비교함수 정의로 바꾸고 헤더와 모든 행이 동일한 너비를 참조하게 한다. 보기 상태는 패널 밖에 둬 접기·다른 매물 펼치기에도 유지한다. 메모 줄바꿈에 따른 높이 변화는 기존 ResizeObserver와 상위 가상 행 측정에 계속 전달해야 한다.

정렬 의미도 명시해야 한다. 예산은 표시 문자열이 아닌 원시 숫자의 **상한 기준**, 면적은 원시 m²의 **상한 기준**, 단계는 업무 진행 순서를 사용하는 안을 권장한다. 월세의 보증금과 월세 금액은 정렬 기준을 구분해야 한다. 거래 전환 고객 상단·종료 고객 하단이라는 기존 그룹은 유지하고 그룹 내부를 정렬한다. 오래 머문 일수를 모르는 고객은 계속 뒤로 둔다.

완료 기준은 헤더 메뉴 키보드 조작과 초점 복귀, 드래그 중 헤더·본문 정렬, 드래그 후 메뉴 오작동 없음, 접었다 열어도 너비·정렬 유지, 정렬 뒤 선택·펼침이 같은 match ID에 남는지, 메모 줄바꿈에 따른 상위 행 높이 갱신을 실제 Electron에서 확인하는 것이다.

## 1차 적용 및 검증

- 8개 헤더의 열 메뉴: 오름차순·내림차순, 현재 정렬 해제, 개별 기본 너비 복구. 예산은 가격·보증금 상한과 월세 상한을 구분한다.
- 정렬 화살표와 현재 기준 칩. 거래 전환·활성·종료 그룹을 유지하며 각 그룹 내부를 정렬한다. 값이 없는 항목은 양방향 모두 마지막이다.
- 8px 경계 조작 영역, 호버·드래그 파란 표시, 실시간 헤더·본문 공통 너비. Esc 취소, 방향키 미세 조절, Home 및 더블클릭 기본 너비 복구.
- 사무소·사용자별 로컬 저장. 접기·재펼침과 renderer 재로딩 후에도 같은 설정을 사용한다. 초기 메모 열은 남는 폭을 채우고 첫 드래그에서 실측 너비를 고정한다.
- 기존 고객 선택, 고객 링크, 단계·메모 액션, 상세 펼침, 구매고객·광고 공유 패널을 유지했다. 열 숨김·재배치·내용 자동 맞춤은 후속 범위다.

실제 Electron CDP 9334 `/properties`에서 고객명 양방향 정렬, 예산 상한 오름차순, 선택·상세의 동일 고객 유지, 예산 열 169→229px 실시간 드래그, 두 행 전체의 열 정렬, Esc 복구, 드래그 후 메뉴 미실행을 확인했다. 방향키 +8px, Home 180px 복구, 접기·재펼침, renderer 재로딩 후 예산 180px·오름차순 복원도 확인했다. [드래그 검증 기록](/Users/hyunsulee/Downloads/buyer-table-interactions-20261115/resize-verification.json), [드래그 후 화면](/Users/hyunsulee/Downloads/buyer-table-interactions-20261115/runtime/resize-after.png)

`@estate-erp/desktop` typecheck 통과. `property-match-table-state.test.ts`와 기존 `matches-ui.test.ts`의 26개 테스트 통과. 원시 금액 비교, 월세 분리, 결측치, 그룹 유지, 안정 정렬, 손상된 저장값·너비 범위를 검증한다.

최종 재조회에서는 `GET /matches?listingId=…`가 HTTP 401을 반환해 기존 오류 화면으로 바뀌었다. 위 성공한 화면 검증과 구분하며, 인증 관련 기존 변경에는 손대지 않았다. 현재 세션의 조회 인증 복구가 필요하다.
