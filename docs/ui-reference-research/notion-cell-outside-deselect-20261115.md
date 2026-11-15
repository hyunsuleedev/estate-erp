# 표 밖 클릭 시 셀 선택 해제 조사

2026-11-15 초기 원인 조사 후, 사용자의 적용 요청으로 아래 개선을 구현했다. 조사 당시의 코드 경로와 미구현 제안은 기록으로 유지하고, 최종 적용 결과는 마지막 절에 기재한다.

## 확인 결과

ERP는 **편집 종료**와 **표의 셀 선택 해제**가 연결되어 있지 않다. 편집창이 닫히거나 브라우저 포커스가 다른 곳으로 이동해도 `selectedCell`이 남아 파란 테두리가 유지된다.

실제 Electron `/properties`에서 `31억 5,000만` 가격 셀을 클릭한 뒤 상단 `동 검색`을 클릭했다. 가격 편집창 수는 1 → 0, 활성 요소는 가격 입력 → 동 검색 입력으로 바뀌었지만 `[data-cell-selected=true]`는 같은 가격 셀에 남았다. 이어 마지막 행 아래의 빈 공간을 클릭해도 유지됐다. 가격 입력값은 변경하지 않았다.

현재 Notion 표에서는 제목 셀을 클릭하고 Escape로 편집을 종료하면 파란 선택 테두리가 남는다. 그 상태에서 표 아래 편집기 배경을 클릭하면 테두리가 사라졌다. 제목 텍스트는 전후 동일했다. 화면 관찰은 Electron CDP 입력과 스크린샷으로 확인했으며, REA의 정적 분석과는 별개의 증거다.

## ERP 코드 경로

- `apps/desktop/src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx:145`: `selectedCell`을 React 상태로 보관한다.
- 같은 파일 `224–233`: `focusedCell`은 `selectedCell`에서 계산한 행·열·의뢰 주소다. 이름과 달리 실제 DOM 포커스를 검사하지 않는다.
- `apps/desktop/src/renderer/components/data-table/cell-editor.tsx:603–605`: 변경 없는 입력의 바깥 클릭은 `onFinish('none')`을 호출한다.
- 같은 파일 `619`: 변경한 입력은 `commitDraft('none')`의 저장 승인 후 종료한다.
- 같은 파일 `252–257`: `finishEdit()`은 `stopEdit()`으로 편집 상태만 지우고, `'none'`이면 즉시 반환한다.
- `property-listings-table.tsx:467–474`: 남아 있는 셀 선택 상태가 파란 outline을 계속 그린다. 복수 의뢰 셀은 `property-listing-cell.tsx`에서 같은 선택 주소의 의뢰 ID를 비교한다.
- 표의 스크롤 컨테이너 `597–603`에는 키보드·스크롤 처리가 있으나 외부 클릭으로 셀 선택을 해제하는 처리는 없다.
- 선택 해제는 Escape 처리와 유효하지 않게 된 셀 주소 정리 등의 경로에만 있다. Escape는 상세 패널이 열려 있을 때 먼저 패널을 닫는다.

따라서 CSS의 focus 스타일 문제가 아니라, 표가 소유한 선택 상태의 해제 경로가 빠진 문제다.

## Notion REA 분석

REA 도구가 현재 세션에 노출되지 않아 설치 가능한 CLI `rea-agents@6.8.0`의 `list-browser-targets`, `inspect-web-page`, `analyze-javascript-application`을 실제 실행했다. 기존에 저장한 번들의 해시를 현재 로드된 스크립트 메타데이터와 대조했다. 관련 Webpack 모듈은 Babel AST의 원본 메서드 범위를 추출했으며 번들 코드를 실행하지 않았다.

확인된 정적 경로:

```text
CollectionViewBlock 배경 onMouseDown(t4)
  → EditorMouseDown 이벤트 중복 처리 방지 (705660.S)
  → 사각 선택 시작 (915157.j)
  → 선택 정리 (602262.y)
  → 테이블 선택 해제 (411282.w)
  → 선택 store 544921.A.setState({ isActive: false })
  → TableSelectionOverlay가 활성 선택을 반환하지 않음
```

`CollectionViewBlock.js:44403–44429`의 배경 핸들러는 데스크톱·왼쪽 버튼·HTMLElement 조건을 검사하며 `44700`, `44789`에서 연결된다. 일반 table view는 허용된다. 선택 시작 함수는 유효한 선택 컨테이너가 없거나 스크롤바 가장자리 입력인 경우 반환한다. 내부 컨트롤이 처리한 이벤트는 같은 채널에서 중복 처리하지 않는 구조다.

`CollectionViewBlock.js:27212` 부근의 선택 계산은 `isActive`와 현재 표의 selection key를 검사한다. **브라우저 blur에 맡기지 않고, 선택의 활성 상태를 명시적으로 끄는 구조**다. 모든 document 클릭을 무조건 처리하는 구현을 확인한 것은 아니다.

현재 번들 해시 대조:

- CollectionViewBlock: `fb7de7b785e73b99e7418d3f801f23af1f99498f2f2c5073f013ce20e7c221d2`
- UISpacePermissionGroupToken: `70553c459d5042c469b626936749a007bc1c79c086ec90fbc7e40cabd0e082b5`
- ClientFramework: 추출 provenance와 현재 REA page evidence의 해시가 일치한다.

REA evidence:

- 현재 페이지: `ev_58be34c9657cd08cd8219bef2a06de06a513b7fea671dc211cbf954d62a9d0f2`
- 정적 분석 원본: `ev_94807534450780c82918ba90d604f3103cd728370770e14d1dce9fcdfb194e02`
- 정적 분석 요약: `ev_fdb6db8adda19e3f49aea2d712bc1004780617ab981a9d9849cbb560be0c092e`

정적 분석에는 그래프 노드·unknown 보관 상한과 26,176개의 미해결 항목이 보고됐다. 전체 Notion 코드의 완전한 복원이나 해당 클릭의 함수 실행 추적을 주장하지 않는다. 위 결론은 해시가 일치하는 원본의 직접 코드 추적과 실제 전후 화면 관찰을 함께 근거로 한다.

## 적용 제안 — 미구현

1. 표의 셀 영역을 벗어난 클릭에서 **셀 선택만** 해제한다. 행 체크박스 선택은 별도 상태로 유지한다.
2. 표 아래 빈 공간도 해제 대상이다. `scrollerRef.contains(target)`만 검사하면 안 된다. `flex-1` 스크롤 컨테이너가 빈 공간까지 포함하기 때문이다.
3. 셀 편집 팝업·해당 셀의 선택 메뉴·달력처럼 포털로 렌더링되는 UI는 셀 내부 작업으로 구분한다. 모든 팝업을 일괄 예외 처리하면 관계없는 툴바 메뉴에서도 선택이 남는다.
4. 편집 중에는 기존 저장·검증 흐름과 연결한다. 값이 같거나 저장이 승인된 경우 해제하고, 유효성 오류·저장 실패·한글 조합·저장 대기 중인 입력은 보존한다.
5. 비동기 저장 완료가 새로 선택한 다른 셀을 해제하지 않도록 원래 행·열·의뢰 주소와 현재 선택 주소를 비교한다. 기존의 저장 후 클릭 대상 복구 흐름도 유지한다.
6. `cell-navigation.tsx`에 표 소유의 명시적인 선택 해제 통로를 두고, 편집기의 외부 종료와 편집하지 않는 상태의 외부 클릭이 함께 사용하도록 한다. `onBlur`만으로 처리하지 않는다.

현재 E2E의 “outside click” 사례는 다른 표 셀로 이동하는 경우이며, 표 밖 필터·빈 공간을 누르는 회귀 사례는 없다. 구현 시 이 두 경우와 편집 팝업 유지, 저장 오류, 복수 의뢰 셀 전환을 검증해야 한다.

## 로컬 증거

`/Users/hyunsulee/Downloads/notion-cell-deselect-20261115/`

- `erp-price-editing-confirmed.{json,png}`
- `erp-price-after-filter-confirmed.{json,png}`
- `erp-price-after-blank-confirmed.{json,png}`
- `erp-agent-browser-outside.png`: 정확한 `/properties` 탭을 선택하고 agent-browser click·eval·screenshot으로 재확인.
- `notion-title-selected.png`: Escape로 편집 종료 후 파란 셀 선택 테두리.
- `notion-after-background.png`: 같은 표 아래 배경 클릭 후 선택 테두리 제거.
- `page.evidence.json`, `static.evidence.json`, `static.summary.json`
- `static/module-*.{raw,readable}.js`, `static/module-*.provenance.json`: 원본 경로·해시·문자/바이트 범위 포함.

초기 실패 캡처 `erp-editing`, `erp-after-filter-click`, `erp-after-blank-click`는 열린 메뉴와 입력 타이밍 때문에 가격 셀을 선택하지 못한 시도이므로 재현 근거로 사용하지 않는다. Notion JSON의 단순 `z-index:87` 탐색은 선택 outline의 존재 여부를 정확히 나타내지 않으므로 전후 스크린샷으로 판정했다.

## 적용 및 검증 완료

- `PropertyListingsTable`은 편집하지 않는 상태의 외부 클릭을 받아 셀 선택만 해제한다. 판정 경계는 스크롤 컨테이너가 아닌 실제 table이므로 마지막 행 아래 빈 공간도 포함한다.
- 편집 중에는 편집기의 기존 저장·검증 처리가 외부 클릭을 소유한다. 승인된 외부 종료는 `cellNavigation.clear`로 원래 행·열·의뢰가 여전히 선택돼 있는 경우에만 해제한다.
- 셀 자체의 Select 포털을 ref로 구분한다. 관련 없는 툴바 팝업까지 셀 내부로 간주하던 전역 wrapper 예외를 제거했다.
- 실제 Electron `/properties`에서 `agent-browser` 및 CDP로 17개 회귀 항목을 통과했다: 입력 내부 유지, 필터/빈 공간 해제, Escape, 행 체크박스 보존, 첫 툴바 클릭, 날짜 피커와 월 이동, 유효성 오류, 저장 대기/실패/성공, 다음 셀 이동, 복수 의뢰의 정확한 선택과 F2, 원래 가격 보존.
- 저장 검증 요청 3개는 renderer fetch stub이 가로채 실패/성공을 모사했다. 비즈니스 쓰기를 서버로 전달하지 않았으며 원래 fetch를 복구했다. 실제 서버 저장 성공 검증을 의미하지 않는다.
- 기존 셀 편집·탐색 단위 테스트 12개, desktop TypeScript 검사, `git diff --check` 통과.
- 회귀 스크립트: `apps/desktop/test/e2e/property-cell-outside-selection.mjs`.
- 최종 증거: `/Users/hyunsulee/Downloads/notion-cell-deselect-20261115/implementation/results.json`, `after-filter-click.png`, `after-blank-click.png`, `save-failure-preserved.png`, `verified-table.png`.
