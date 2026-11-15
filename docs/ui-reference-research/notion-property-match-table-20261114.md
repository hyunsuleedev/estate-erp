# 매물관리 연결 구매고객 표 개선

2026-11-14. 실행 중인 Electron `/properties`의 매칭 펼침 표와 현재 열린 Notion 작업 트래커를 비교하고 적용했다. Notion의 배포 코드를 새로 분석한 작업은 아니며, 기존 [실측 조사](./notion-table-visual-audit-20261114.md)와 이번 화면·computed style 확인을 사용했다.

## 적용

- 헤더 11.5 → 13px / 400, 높이 30 → 36px. 사용자가 선택한 매물 표 헤더 크기에 맞췄다.
- 데이터 본문 12~13 → 14px / 450, 고객명 500. 연락처·면적·메모를 본문색으로 통일했다.
- 기본 행 40 → 37px, 거래·단계 태그 20px. 현재 Notion 데이터 행은 37px였다.
- 연락처 140px, 예산 180px, 면적 120px로 읽을 공간을 확보했다. 거래 열은 아이콘과 13px 헤더가 잘리지 않도록 74px로 조정했다.
- 단계 메뉴는 셀 전체가 누를 수 있는 영역이다. 열려 있는 셀은 파란 테두리로 표시한다.
- 고객 상세를 펼친 행과 아래 상세 영역은 흰 바탕을 유지한다. 화살표 버튼에 상세 영역 연결 정보와 키보드 포커스 표시를 추가했다.
- 연락처는 해당 연락처 상세 링크로 연결한다. 고객 이름은 기존 희망 조건 상세 링크를 유지한다.
- 메모는 최대 두 줄로 표시하고 입력 중에도 14px / 450 / 줄높이 21px를 유지한다.
- 중첩 메모 편집기의 탐색 컨텍스트를 분리했다. Escape 후 바깥 매물 표로 초점이 빠지던 동작을 같은 메모 버튼으로 돌아오도록 수정했다.

## 확인

실제 Electron에서 단계 메뉴 열기·취소, 메모 편집창 열기·취소, 취소 후 화살표 입력 시 초점 유지, 고객 상세 펼치기·접기, 광고 탭 전환·복귀, 종료 고객 펼치기를 확인했다. 단계 선택이나 메모 저장, 일정 생성 등 업무 데이터 변경은 수행하지 않았다. 연락처 상세 링크의 목적지는 DOM에서 확인했다.

- 헤더 13/400, 본문 14/450, 고객명 14/500.
- 기본 행 37px, 단계 태그 20px, 단계 셀 버튼 163×36px(칸 164×36px, 세로선 1px).
- 메모 표시 14/450/21, 입력 14/450/21. Escape 후 활성 요소는 동일한 `matchMemo` 버튼.
- 확인한 화면에서 하위 표 헤더 말줄임·패널 바깥 가로 넘침 없음.
- `pnpm --filter @estate-erp/desktop typecheck` 통과.
- `node --import tsx --test test/matches-ui.test.ts`: 20개 통과.
- 변경 파일 `git diff --check` 통과.

증거: `/Users/hyunsulee/Downloads/notion-table-design-20261114/matching-panel/`

- [변경 후 화면](/Users/hyunsulee/Downloads/notion-table-design-20261114/matching-panel/final.png)
- [단계 메뉴](/Users/hyunsulee/Downloads/notion-table-design-20261114/matching-panel/stage-menu.png)
- [메모 편집](/Users/hyunsulee/Downloads/notion-table-design-20261114/matching-panel/memo-editor.png)
- [상세 펼침](/Users/hyunsulee/Downloads/notion-table-design-20261114/matching-panel/detail-white.png)
- [종료 고객](/Users/hyunsulee/Downloads/notion-table-design-20261114/matching-panel/closed-rows.png)
- [초점 복귀 실측](/Users/hyunsulee/Downloads/notion-table-design-20261114/matching-panel/focus-return.json)

## 단계 선택 메뉴 후속 개선

실행 중인 Notion 상태 선택 메뉴에서 폭 240px, 모서리 6px, 항목 높이 28px, 태그 높이 20px와 그룹 구분을 확인했다. 검색은 사용자가 불필요하다고 하여 최종 구현에서 제외했다.

- 검토 / 진행 / 결과별로 색상 태그를 바로 표시한다. 현재 값의 체크와 키보드·마우스로 가리키는 항목을 구분한다.
- 메뉴는 셀 상단에 맞춰 열린다. 셀 위에 겹치는 항목이 여는 클릭의 pointerup에 선택되지 않도록 클릭 완료 후 연다.
- 조건을 충족하지 못한 단계는 흐리게 표시하고, 포커스하거나 누르면 이동에 필요한 조건을 안내한다. 기존 단계 이동 제한과 거래 전환 흐름을 유지한다.
- 종료된 매칭은 기존 재개 단계와 현재 종료 상태를 표시한다. 현재 값을 다시 선택하면 저장하지 않고 닫는다.
- 실제 Electron에서 검색 입력 없음, 제한된 항목을 눌러도 메뉴 유지, 이유 표시, 방향키 이동과 현재 값 체크의 분리, Escape 후 같은 셀로 포커스 복귀를 확인했다. 이 최종 확인 전후의 단계 값은 동일했다.

증거: `/Users/hyunsulee/Downloads/notion-table-design-20261114/stage-picker/`

- [현재 Notion 선택 메뉴](/Users/hyunsulee/Downloads/notion-table-design-20261114/stage-picker/notion-picker.png)
- [검색을 제거한 최종 메뉴](/Users/hyunsulee/Downloads/notion-table-design-20261114/stage-picker/final.png)
- [이동 제한 안내](/Users/hyunsulee/Downloads/notion-table-design-20261114/stage-picker/blocked-choice.json)
- [방향키와 현재 값 구분](/Users/hyunsulee/Downloads/notion-table-design-20261114/stage-picker/keyboard-focus.json)
- [포커스 복귀와 단계 유지](/Users/hyunsulee/Downloads/notion-table-design-20261114/stage-picker/focus-return.json)
