# 매물관리 펼침 광고 표

2026-11-15. `/properties`의 광고 펼침 영역을 연결 구매고객 표의 기존 Notion 참고 규칙에 맞췄다. 이번에는 Notion 배포 코드를 새로 분석하지 않았다.

- 둥근 카드 외곽선·파란 테두리·행 사이 간격을 제거하고 연속된 표로 변경했다.
- 머리글은 아이콘 포함 13px/400, 높이 36px. 본문은 14px/450, 행 높이 37px.
- 머리글에는 세로선을 두지 않고 데이터 셀에만 얇은 세로선을 넣었다.
- 거래·상태 태그는 높이 20px. 상태에는 작은 점을 표시한다.
- 거래 / 광고 채널 / 상태 / 가격·보증금 / 월세 / 등록일 / 메모 / 원문을 분리했다. 가격은 180px, 남는 폭은 메모에 배정한다. 긴 채널명·금액·메모는 말줄임하고 전체 값을 title로 제공한다.
- 원문 링크의 URL과 새 창 열기 동작은 유지하고 기존 표와 같은 중립색·hover·키보드 focus 스타일로 맞췄다.
- 빈 상태에서도 열 머리글을 유지한다. 작은 폭에서는 공유 패널의 가로 스크롤을 사용한다.
- 가상 행의 광고 패널 높이 추정을 새 머리글·행 높이에 맞췄다.

변경 위치: `properties/index.tsx`의 `PropertyAdPanel`, `estimatePropertyAdPanelHeight`, `-components/property-match-panel.tsx`의 광고 콘텐츠 최소 폭.

실제 개발 Electron(9334, `/properties`)에서 agent-browser로 펼침·탭 전환·스크린샷을 확인했다. 한 건과 매매·전세 두 건 광고의 열 정렬, 13px/400 머리글, 14px/450 본문, 머리글 세로선 0px·본문 세로선 1px를 확인했다. 이후 데이터 새로고침 시 광고 건수가 0으로 바뀌어 빈 표와 매칭 → 광고 전환도 확인했다. 광고·매칭 업무 데이터 저장은 수행하지 않았다.

TypeScript 검사와 공유 광고/매칭 패널의 기존 회귀 검사 2개 통과. `git diff --check` 통과.

증거: `/Users/hyunsulee/Downloads/property-ad-table-20261115/`의 `before.png`, `after.png`, `empty.png`, `empty-verification.json`.
