# 매물관리에서 drawer로 새 매물 등록

2026-11-15. 매물관리의 `새 매물 등록` 버튼을 새 탭 생성에서 오른쪽 등록 패널 열기로 변경했다. 기존 Notion drawer 조사와 앱의 상세 패널 스타일을 재사용했다. 이번 작업에서 Notion을 새로 역분석한 것은 아니다.

| 입력 / 상태 | 동작 |
| --- | --- |
| 새 매물 등록 | 현재 목록을 유지하고 오른쪽 584px 패널을 연다. 새 창·탭을 생성하지 않는다. |
| 입력 | 기존 단지·동·호실, 거래 조건, 비용, 메모, 관련인 폼과 API 저장 절차를 공통 컴포넌트로 재사용한다. |
| 닫기 / Esc | 패널을 닫고 등록 버튼에 포커스를 돌려준다. 현재 목록 탭 수명 동안 초안이 보존된다. 앱 재시작 후 영속 보존을 보장하는 기능은 아니다. |
| 새 탭으로 확장 | 닫기 옆 확장 버튼으로 같은 창의 독립 등록 탭을 연다. 모든 입력값을 전달하고 drawer를 닫는다. 새 탭에 포커스를 유지한다. |
| 메뉴에서 Esc | 단지 검색·Select 메뉴가 먼저 닫히고 등록 패널은 유지된다. |
| 저장 중 | 입력과 닫기 버튼을 비활성화하고 중복 제출·Esc 닫기·다른 상세 패널 전환을 막는다. |
| 저장 실패 | 입력을 유지하고 오류가 보이는 위치로 스크롤·포커스를 이동한다. 재시도할 수 있다. |
| 저장 성공 | 목록 관련 캐시를 갱신하고 초안을 초기화한 뒤, 같은 위치에서 해당 의뢰의 매물 상세를 연다. |

패널은 배경을 어둡게 가리지 않는다. 상단 44px 도구 영역과 이중 꺾쇠 닫기, 200ms 수평 전환, 키보드·모션 줄이기 시 전환 생략은 기존 상세 패널과 같다. 등록 폼은 한 열로 배치하고 하단 등록 버튼을 고정했다. `/properties/new`의 독립 등록 페이지와 단지 화면의 프리필 진입은 유지한다.

구현:

- `properties/new.tsx`: 경로와 검색 파라미터를 제공하는 얇은 페이지 컴포넌트.
- `properties/-property-registration-form.tsx`: 기존 등록 로직·폼을 옮긴 공통 컴포넌트. page/drawer별 완료 동작과 레이아웃을 구분한다.
- `properties/-components/property-registration-drawer.tsx`: 패널 표시·닫기 전환·초점·Escape 처리.
- `properties/index.tsx`: 등록 패널과 기존 상세 패널의 전환 및 완료 콜백.
- `property-inspector-view.tsx`, `-new-form-ui.tsx`, `app.css`: 도구 영역 재사용과 drawer 범위의 폼 스타일.

실제 개발 Electron `http://localhost:5175/properties`에서 agent-browser와 CDP로 확인했다. 해당 renderer의 visibility는 visible, focus는 true였다.

- 새 탭 없이 열기, 배경 목록 유지, 584px 폭, 화면 안에 고정된 하단 버튼 확인.
- `315000` 입력 후 닫고 다시 열어 값 유지 및 닫기 후 포커스 복귀 확인.
- 단지 검색 → 동 → 호실 선택 확인.
- 필수 단지 누락 검증, 오류 표시 및 입력 유지 확인.
- 저장 중 닫기 비활성화, 실패 후 가격 유지, 재시도 완료 후 상세 패널 전환 확인.
- 완료 후 다시 열면 단지·가격이 초기화되고 목록 탭에 불필요한 draft가 남지 않는지 확인.
- 메뉴의 첫 Escape와 패널의 다음 Escape, Enter로 열 때 이동 전환 생략 확인.
- 원래 열려 있던 독립 등록 탭의 2열 레이아웃·등록 요약·정상 렌더링 유지 확인.

저장 검증은 fetch stub으로 POST 3개(실패 1개, 성공 응답 2개)를 가로챘다. 성공 응답에 이미 조회한 의뢰 fixture를 사용해 완료 후 상세 전환을 검증했으며 서버에 실제 매물을 추가하지 않았다. 검수 종료 후 원래 fetch를 복구했다. 실제 서버의 신규 데이터 저장을 검증한 결과는 아니다.

코드 검사:

- desktop TypeScript 검사 통과.
- 등록 유틸리티·상세 창 검사 10개, 변경된 공통 폼의 office-sites 캐시 갱신 검사 1개 통과.
- 더 넓은 관련 검사 23개 중 22개 통과. 관리단지 검사 1개는 `sites/index.tsx`의 행 높이를 40으로 기대하지만 현재 소스가 33이라 실패했다. 해당 행 높이는 이번 작업에서 수정하지 않았다.
- `git diff --check` 통과.

증거: `/Users/hyunsulee/Downloads/property-registration-drawer-20261115/`의 `verified-drawer.png`, `failure.png`, `after-success.png`, `verification.json`, `after-success.json`, `intercepted-requests.json`.

## 확장 버튼 후속 수정

등록 패널에서도 공통 `PropertyInspectorToolbar`의 확장 버튼을 표시한다. 공통 폼이 현재 초안을 탭의 `routeParams.propertyRegistrationDraft`로 전달하고, 수신한 등록 페이지는 이를 자기 `useTabScopedState`에 보관한다. 주소에 입력값을 넣지 않으며, 이미 열려 있는 다른 등록 탭을 덮어쓰지 않는다. 전달 후 목록의 등록 초안은 초기화한다. 저장 중 확장은 비활성화한다.

확장 완료는 일반 닫기의 포커스 복귀와 분리했다. 일반 닫기는 목록의 등록 버튼으로 돌아가지만, 확장은 새 탭을 계속 활성 상태로 유지한다.

실제 Electron에서 기존 초안 31개 필드가 동일하게 전달됨을 확인했다. 별도 검수 초안의 가격 `271234`와 메모도 화면과 탭 초안 양쪽에 유지됐고 새 탭의 visibility가 visible이었다. 검수용 탭만 닫고 사용자의 원래 초안은 새 등록 탭에 남겼다. 서버 저장은 수행하지 않았다. TypeScript 및 관련 탭·상세 창 검사 41개 통과.

증거: 같은 폴더의 `expand-button.png`, `expanded-page.png`, `expand-verification.json`.
