# Notion side peek → 매물 상세 패널

2026-11-12. 사용자가 열어 둔 Notion 데스크톱의 사이드 보기와 해당 화면에서 로드된 renderer 번들을 조사하고, 로컬 EstaitFlow Electron의 매물 상세 패널에 적용했다.

## 조사 범위와 근거

- Notion 7.42.3의 현재 열린 사이드 보기를 CDP 9333에서 확인했다. 원본 Notion 문서의 내용을 편집하거나 이동하지 않았다.
- `reverse-engineer-anything` 스킬을 읽고 REA 6.8.0 CLI의 `inspect-web-page`, `export-web-scripts`, `analyze-javascript-application`을 사용했다. 이 세션에 REA MCP 도구가 없어 CLI를 사용했으며 MCP 설정이나 분석 엔진을 설치·변경하지 않았다.
- 실제 화면의 DOM/CSS·스크린샷과 정적 코드 분석을 구분했다. 코드에 보이는 분기는 실행을 관측했다는 뜻이 아니다.
- 조사 산출물: `/Users/hyunsulee/Downloads/notion-drawer-analysis-20261112/`.

| 근거 | 파일 | REA Evidence ID |
| --- | --- | --- |
| 열린 페이지의 수동 관측·접근성·스크립트 소스 캡처 | `rea-open-panel.json` | `ev_08b786b781fad0dbbac5db969d1ab82c565802aaf8a7403abe4885eb59df5330` |
| 캡처된 스크립트의 로컬 내보내기 | `rea-export.json` | `ev_a60898e0e3eec20f53e010cc50221723c3307b4c5e6d54df49f6b3b51d19014f` |
| 선택한 peekRenderer 번들의 정적 분석 | `rea-peek-code.json` | `ev_97f385c5c908c4103f5e9f4d49a206404906f8e83389088f6cf7f53375b365c3` |
| 위 분석의 요약 뷰 | `rea-peek-summary.json` | `ev_ca5416f8d45135d5fc8c101673c0459328c15af999c1a946fb63c0c717109786` |

전체 앱 분석은 아니다. 스크립트 캡처에는 리소스 예산 때문에 누락된 소스가 있으며, 정적 분석은 캡처된 `peekRenderer-258378c397b66074.js` 하나로 한정했다. REA도 선택 범위 밖 소스와 동적 관계를 미확인으로 보고한다. `peek-readable.js`는 이 번들을 읽기 편하게 포맷한 조사용 사본이며 제품에 복사하지 않았다.

## 확인한 디자인과 작동 방식

| 항목 | 실제 화면에서 관측 | 선택 번들에서 확인한 정적 구현 |
| --- | --- | --- |
| 패널 배치 | 화면 오른쪽, 상하 끝에 붙은 사이드 보기. 그 뒤의 표가 어두워지지 않음 | absolute, top/right/bottom 0. 사이드 보기에는 `enableCaptureClick: false` |
| 크기 | 관측 시 폭 564px, 상단 도구 영역 44px | 폭은 상태값을 사용하고 리사이저를 표시. 564px는 보편적 고정값이라고 단정할 수 없음 |
| 접기 | 도구 영역 왼쪽의 24×24px 버튼, 오른쪽 이중 꺾쇠 20px | 사이드 보기 닫기 상태를 별도로 관리 |
| 확장 | 바로 옆 24×24px 버튼, 대각선 확장 아이콘 16px. 같은 문서의 전체 페이지 링크 | 페이지 이동 링크 |
| 전환 | computed transition에 width/transform 0.2s 표시 | 열림은 translateX 0, 닫힘은 패널 폭만큼 이동. 애니메이션 종료 콜백에서 닫기 정리 |

Notion 자체의 열기·닫기 전 과정을 프레임 단위로 실행 관측한 것은 아니다. 종료 후 제거 순서는 선택 번들의 정적 근거다. EstaitFlow에 적용한 전환은 아래 실제 실행 검사로 별도 확인했다.

## 적용한 변경

| 이전 | 적용 후 | 목적 |
| --- | --- | --- |
| 오른쪽 X와 텍스트형 전체 페이지 버튼 | 왼쪽 위에 이중 꺾쇠와 대각선 확장 아이콘, 각각 24px 버튼 | 패널의 공간 방향과 조작을 연결하고 제목 위의 장식을 줄임 |
| 별도 제목 라벨이 있는 헤더 | 44px 도구 영역, 오른쪽에 기존 작업 메뉴 | 내용 제목과 중복되는 라벨 제거 |
| 목록을 덮는 어두운 배경 | 배경 가림 제거, 왼쪽 경계선과 약한 그림자 | 상세를 보면서 목록의 다른 행을 선택 가능 |
| 12px 이동과 페이드로 등장, 닫을 때 즉시 제거 | 오른쪽에서 200ms 슬라이드, 닫는 전환 후 제거 | 여닫기가 동일한 공간 방향을 사용 |
| 매물마다 패널을 새로 열 수 있는 동작 | 다른 행을 열면 패널 위치를 유지하며 내용만 교체 | 연속 조회 시 불필요한 반복 이동 방지 |

**확장 버튼은 같은 창의 새 상세 탭을 연다.** 해당 창에 같은 매물의 상세 탭이 이미 있으면 `tabResourceKeys.entity("property", property.id)`로 기존 탭을 활성화한다. 원래 매물 목록 탭은 유지한다. 별도 창 열기는 오른쪽 작업 메뉴의 **새 창으로 열기**에서 선택할 수 있다. 별도 상세 창은 사이드바가 접힌 상태로 시작하며 제목 표시줄의 펼치기 버튼을 유지한다. 새 창 열기 실패 시 기존 패널을 남기고 오류를 표시하는 처리도 유지했다.

기존 업무 탭, 상담·가격 수정·확인 버튼, 본문 정보와 584px 기본 폭 및 520–640px 너비 조절 범위는 유지했다. 키보드 열기·닫기와 OS 모션 줄이기 설정에는 이동 전환을 생략한다. 로딩·오류 상태에서도 접기 도구를 표시한다.

구현 위치:

- `apps/desktop/src/renderer/routes/_authenticated/properties/-components/property-inspector-view.tsx`: 공통 도구 영역과 아이콘·툴팁.
- `apps/desktop/src/renderer/routes/_authenticated/properties/index.tsx`: 열기/닫기 상태, 종료 후 정리, 목록과 패널의 연결, 기존 별도 창 열기.
- `apps/desktop/src/renderer/app.css`: transform 전환, 진입 스타일, 모션 줄이기. 기존 페이드 키프레임 제거.

## 실제 Electron 검증

실행 중인 개발 Electron(CDP 9334, 로컬 Vite 5175)의 매물관리 화면에서 `agent-browser` snapshot/click/dblclick/screenshot과 CDP 입력·프레임 관측을 사용했다. 화면이 가려져 hidden 상태인 동안의 시도는 시각 검증으로 인정하지 않고, 앱을 표시한 뒤 다시 확인했다. 매물 데이터는 변경하지 않았다.

- 마우스 열기: 오른쪽에서 이동하는 중간 프레임과 최종 translateX 0 확인.
- 마우스 닫기: 닫힘 상태의 이동 프레임 후 DOM 제거 확인.
- 목록 클릭: 패널을 유지. 다른 행 더블클릭: 같은 패널 DOM 안의 매물 내용 교체.
- Esc: 패널 닫힘과 목록 포커스 복귀. Enter: 이동 없이 패널 열림.
- 작업 메뉴가 열린 상태의 Esc: 메뉴만 닫히고 패널 유지.
- 키보드 및 마우스 너비 조절. 검사 후 원래 584px로 복원.
- 모션 줄이기: 진입 중간 이동 없음, 닫기 즉시 정리.
- 닫히는 중 다른 행 열기: 종료 타이머가 새 패널을 제거하지 않는지 확인.
- 확장: 새 BrowserWindow에서 해당 매물의 전체 상세가 렌더링됨. 별도 창 메뉴에서는 원래 목록 탭을 유지하고 패널을 닫음. 검사에서 만든 상세 창은 닫고 원래 창에 패널을 다시 열어 둠.

화면 증거는 위 산출물 폴더의 `notion-side-peek.png`, `estate-side-peek.png`, `estate-expanded-window.png`, 실행 기록은 `estate-motion-checks.json`, `estate-additional-checks.json`에 있다.

## 코드 검사와 제한

- 데스크톱 TypeScript 검사 통과.
- 수정한 두 TSX 파일 ESLint 오류 0개. `properties/index.tsx`의 범위 밖 경고 4개는 남아 있다.
- drawer/별도 창 관련 기존 소스 회귀 검사 10개 통과. 변경된 전환과 배경 정책에 맞춰 관련 기대값을 수정했다.
- 더 넓은 `data-table.test.ts` + `property-window.test.ts` 실행에서는 총 49개 중 38개 통과, 11개 실패를 관측했다. 실패는 표의 아웃라인·컬럼·정렬·검색 배치·지도 전환 등에 대한 소스 형태 검사다. 이번 변경 전의 동일 실행 기준을 별도로 확보하지 않았으므로 모두 기존 실패라고 단정하지 않는다. 이 작업에서 해당 검사나 표 구현을 추가로 수정하지 않았다. 원본 결과는 `broader-tests.txt`에 보관했다.
- 이 작업은 로컬 구현과 실제 개발 Electron 검증이다. 커밋·배포 및 설치 패키지 검증은 수행하지 않았다.

후속 사이드바 기본값 변경: TypeScript 검사와 `tab-registry`, `property-window`, `app-sidebar` 검사 85개 통과. 재시작한 실제 Electron에서 새 상세 창의 sidebarOpen=false 및 여백 0px, 펼치기/접기 버튼 작동, 원래 창의 sidebarOpen=true 유지를 확인했다.

후속 확장 동작 변경: TypeScript 검사와 `property-window`, `tab-registry`, `native-tab-actions` 검사 86개 통과. 실제 Electron에서 기존 창 수를 유지하면서 목록 옆 상세 탭이 생기는 것을 확인했다. 같은 매물 확장을 반복해도 탭 수는 2개로 유지되고 같은 상세 탭 ID가 활성화됐다. 작업 메뉴의 별도 창 열기도 실제 창 생성과 sidebarOpen=false를 확인했으며 검사에서 만든 창만 닫았다. 화면 증거: `/tmp/estate-expand-same-window-tab.png`.
