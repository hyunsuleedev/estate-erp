# 연결 구매고객 행의 호버 체크박스 조사

2026-11-15. 사용자가 표시한 위치는 매칭 하위 표의 펼치기 화살표 왼쪽이다. 최초 조사에서는 현재 Notion과 ERP 확인 및 적용 설계를 정리했고, 이후 사용자의 적용 요청에 따라 아래 구현을 완료했다.

## Notion에서 관찰한 동작

현재 열린 `작업 트래커 | 모든 작업`의 행 선택 체크박스를 조사했다. 실제 업무 속성인 체크박스와는 다르며 선택 자체는 페이지 데이터를 수정하지 않는다.

| 상태 | 체크박스 표시 |
| --- | --- |
| 선택하지 않은 행, 포인터 밖 | opacity 0 |
| 제목 또는 다른 데이터 셀에 호버 | 해당 행 opacity 0.7 |
| 체크박스 영역에 호버 | opacity 1 |
| 선택한 뒤 포인터 밖 | 선택된 행 opacity 1 |
| 선택 후 가로 스크롤 0 | 선택되지 않은 다른 행은 opacity 0 |
| 가로 스크롤 중 고정 선택 열 표시 조건 충족 | 선택되지 않은 체크박스도 표시되는 예외가 있음 |

- 보이는 상자는 16×16px, 모서리 3px, 테두리 1px. 라벨 클릭 영역은 36×36px.
- 행의 데이터 열 왼쪽으로 36px 떨어진 별도 영역에 배치한다. 표시 여부 때문에 데이터 열 폭을 바꾸지 않는다.
- 불투명도 전환은 현재 DOM 기준 200ms ease.
- 선택 후에는 `1개 선택됨`과 상태·담당자 등의 작업 막대가 표시됐다.
- Tab으로 네이티브 체크박스에 포커스가 들어간 이번 상태에서는 외부 opacity가 0으로 남았다. ERP 제안에서는 키보드 포커스 시 명시적으로 표시한다.
- 선택과 해제만 조작했고 원래 모든 행 미선택 상태와 가로 스크롤 0으로 복귀했다. 전후 행 텍스트가 동일함을 확인했다.

실제 화면 조작은 직접 CDP, 소스 식별과 정적 분석은 REA CLI 6.8.0을 사용했다. 첫 좌표 기반 선택 시도는 Tab에 따른 가로 스크롤 변화로 선택되지 않아, 이후 현재 네이티브 행 선택 input의 DOM 클릭으로 선택 상태를 확인했다. 이를 업무 데이터 저장 확인으로 해석하지 않는다.

- [행 호버](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/title-hover.png)
- [선택 유지와 작업 막대](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/selected-no-scroll.png)
- [호버·포커스 측정](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/notion-runtime.json)
- [선택 후 비스크롤 상태](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/selected-no-scroll.json)
- [선택·복귀 확인](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/selection-confirmed.json)

## REA 코드 근거와 범위

- 현재 renderer 캡처: `ev_3642154aaefc3f926d92bb27cc4749bf5f1e058aa8aa6467334f038f8daa1009`.
- 선택한 체크박스 모듈 분석: `ev_d6537b977c8dcc6ba2bb9dbf972b73d46e760331e6ac70b94405582e279fe050`.
- 현재 `35535-c81ce25ba4497794.js`의 CDP hash와 기존 원본 SHA-256이 `d8f691979da572dfdf6f2f4dfeedb0c96c75153e2faf6017ffac5af30da234f7`로 일치했다.
- 모듈 82768, 원본 범위 1371–3602를 객체 표현식으로 감싸 분석했다. 2,237 bytes, 파싱 1개 성공, 실패 0. 의미 그래프 미해결 139개, application coverage partial. 외부 모듈과 전체 Notion을 복구한 결과가 아니다.
- [읽기용 모듈](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/checkbox-readable.js:51)은 선택 또는 체크박스 자체 호버 → 1, 블록 호버 → 보통 대비에서 0.7, 고정 선택 열 조건 → 별도 값, 나머지 → 0으로 계산한다. 네이티브 input의 `indeterminate`도 부분 선택 상태와 연결한다.
- 동일 hash가 확인된 `CollectionViewBlock-3d534440245ffe4d.js`는 배치에 `insetInlineStart: -36`을 사용한다. 행 선택 콜백은 펼침과 다른 selection store를 갱신하고 `stopPropagation()`을 호출한다. 이 연결은 배포 코드를 직접 대조했으며 새 REA 정적 분석의 대상은 82768 하나다.

전체 근거는 `/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/`에 보관했다. `provenance.json`에 원본 경로·해시·추출 범위를 기록했다.

## ERP 적용 제안

현재 `PropertyMatchPanel`에는 `openMatchId`만 있고 선택 상태가 없다. `MatchRow`의 첫 열은 24px 펼치기 버튼이며 행 전체 클릭도 상세를 펼친다. 패널 왼쪽 여백은 60px, 그 안쪽부터 `overflow-x-auto`가 시작한다.

배치는 `체크박스 · 펼치기 화살표 · 고객명` 순서로 한다. 기존 화살표와 데이터 열 위치를 유지한다.

1. 패널에 `selectedMatchIds: Set<string>`을 두고 `match.id`로 관리한다. 고객 ID나 상위 매물의 체크박스 상태와 섞지 않는다. 선택과 상세 펼침은 독립적이다.
2. 체크박스는 공용 Radix `Checkbox`를 사용하고 이 패널에만 16px, radius 3px, 그림자 없음 스타일을 적용한다. 클릭 영역은 36px로 확보한다.
3. 기본은 숨김, 행 호버는 0.7, 체크박스 호버·선택·키보드 포커스는 1로 한다. 터치 환경에서는 항상 표시한다. 숨긴 상태에서 열이 이동하지 않게 공간은 유지한다.
4. 현재 스크롤 영역 바깥에 단순 `left: -36px`로 놓으면 잘린다. 외부 왼쪽 여백을 24px로 줄이고 스크롤 내부에 36px 선택 여백을 확보하면 기존 열 위치를 유지할 수 있다. 내부 최소 너비도 36px만큼 반영한다.
5. 체크박스를 `ROW_GRID`의 직접 자식으로 삽입하면 열 정렬과 `:first-child` 기반 선·여백 규칙이 깨진다. 상대 위치의 행 래퍼 안에서 체크박스를 별도 배치하고 기존 그리드는 유지한다. 래퍼의 호버 범위가 체크박스와 행을 모두 포함해야 포인터 이동 중 사라지지 않는다.
6. 체크 클릭의 이벤트 전파를 막아 상세가 함께 펼쳐지지 않게 한다. Space는 선택, Enter/클릭으로 화살표는 상세 펼침을 담당한다. 접근성 이름은 `최도윤 선택`처럼 행을 식별하게 한다.
7. 선택 시 패널 안에 작은 `N명 선택됨 · 선택 해제` 표시를 둔다. 복수 고객 작업을 붙일 경우 `매칭 종료` 등 명확한 작업과 연결한다. 기존 API에는 일괄 단계 변경 엔드포인트가 없으므로 이를 지원한다고 전제하지 않는다. 개별 결과·실패·기존 업무 조건을 다루는 것은 별도 구현 범위다.
8. 선택은 현재 매칭 패널 안에서만 유지한다. 패널을 닫거나 광고 탭으로 전환하면 정리하고, 데이터 갱신·종료 그룹 숨김 후 보이지 않는 ID를 선택 집합에서 제거한다. 전체 선택은 현재 표시된 행을 기준으로 계산한다.

검수 항목: 일반 셀 호버, 체크 영역으로 포인터 이동, 선택 후 포인터 이탈, 체크 클릭 시 상세가 열리지 않음, 화살표 클릭 시 체크가 바뀌지 않음, 키보드 Space/Tab, 긴 메모 행, 가로 스크롤 및 좁은 창에서 잘림, 상위 매물 선택과 분리, 패널/광고 전환 시 선택 정리.

현재 ERP의 실제 좌표는 [레이아웃 기록](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/erp-layout.json), 화면은 [정확한 properties renderer 캡처](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/erp-properties-before.png)를 참조한다. `erp-before.png`는 조사 도중 활성 탭이 바뀌어 대시보드를 찍은 파일이므로 매칭 표의 근거로 사용하지 않는다.

## 구현 및 Electron 검수

`property-match-panel.tsx`에 패널별 `selectedMatchIds`와 공용 Checkbox를 이용한 선택 영역을 추가했다. 고객 행 왼쪽 36px 영역에 16px 체크박스를 두고, 행 호버 0.7 / 체크 영역 호버·선택·키보드 focus-visible 1 / 나머지 0으로 표시한다. 터치 환경에서는 항상 표시한다. 마우스 클릭으로 생긴 포커스는 해제 후 체크박스를 계속 노출하지 않는다.

머리글에는 표시된 고객 전체 선택과 부분 선택 표시를 추가했다. 탭 옆에는 선택 인원과 선택 해제를 표시한다. 상세 펼침과 상위 매물 선택은 독립적이며 광고 탭 전환·패널 닫기·종료 그룹 숨김 시 보이지 않는 선택을 정리한다. 단계·메모 등 업무 데이터 변경이나 일괄 작업은 추가하지 않았다.

선택 여백을 스크롤 내부로 옮겨 기존 9개 열의 좌표·너비·높이가 변경 전과 동일함을 확인했다. 화살표·고객명 위치와 흰색 상세 배경은 유지한다. 체크박스 테두리는 작은 호버 상태에서도 식별되도록 이 패널의 미선택 상태에만 `data-[state=unchecked]:!border-muted-foreground/50`을 적용했다. 앱의 전역 unlayered 테두리 규칙보다 우선하도록 했으며 최종 computed border alpha 0.5 / 행 호버 opacity 0.7을 확인했다.

- 실제 Electron `http://localhost:5175/properties`에 agent-browser로 연결해 snapshot, click, hover, Tab/Space, screenshot 검수. CDP로 해당 renderer의 DOM 좌표·상태·스크린샷도 확인했다.
- 17개 동작 확인: 일반 셀 호버, 36px 클릭 영역, 선택 유지, 상위 매물 선택 분리, 상세 펼침 분리, 키보드 포커스/Space, 전체·부분 선택, 종료 그룹/광고 탭/패널 닫기 정리.
- 6개 레이아웃 확인: 1050px renderer 너비에서 선택 영역 잘림 없음, 긴 메모 줄바꿈 시 중앙 정렬, 가로 스크롤 및 복귀, 터치 에뮬레이션 시 상시 표시. 화면 크기와 입력 에뮬레이션은 검수 후 해제했다.
- `pnpm --filter @estate-erp/desktop typecheck` 통과. 기존 `matches-ui.test.ts` 20개 통과. 새 소스 문자열 검사 테스트는 추가하지 않았다.
- 직접 CDP 마우스 입력은 현재 포인터 상태와 일치하지 않는 시도가 있어 검증 실패를 통과로 취급하지 않았다. 최종 입력 검수는 agent-browser로 다시 수행했고 위 23개 확인이 통과했다.

근거: [동작 검수](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/implementation/verification.json), [레이아웃 검수](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/implementation/layout-verification.json), [최종 호버 화면](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/implementation/final-hover.png), [선택 화면](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/implementation/selected.png).

### 전체 선택 호버 범위 정정

사용자 피드백에 따라 머리글 래퍼의 `group/match-selection`을 제거했다. 미선택 전체 선택 체크박스는 고객·예산·단계 헤더 호버로 표시되지 않고, 체크박스의 36px 클릭 영역 호버에만 표시된다. 행 체크박스의 행 호버, 선택/부분 선택 및 키보드 포커스 표시 규칙은 그대로다.

실제 Electron에서 고객·예산·단계 헤더 호버 시 opacity 0, 전체 선택 체크박스 자체 호버 시 1, 다른 헤더로 포인터 이동 후 0을 확인했다. [검수 기록](/Users/hyunsulee/Downloads/notion-match-checkbox-20261115/implementation/header-hover-correction.json)의 첫 5개 검증이 이 수정의 근거다. 이후 행 호버 확인은 사용자 조작 중 포인터 상태가 달라 완료 근거에 포함하지 않았다. 업무 단계 값은 변경하지 않았다.
