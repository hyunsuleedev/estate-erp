# 표의 상세 열기 버튼: 현재 행이면 닫기로 전환

2026-11-15. 조사와 적용 제안을 작성한 뒤, 사용자 요청으로 아래 구현을 적용했다.

## 실제 Notion 동작

현재 열린 `작업 트래커 | 모든 작업`에서 다음 순서로 확인했다.

| 패널 상태 | 해당 행 버튼 | 클릭 결과 |
| --- | --- | --- |
| 닫힘 | 열기 / 사이드 보기에서 열기 | 해당 페이지의 사이드 보기 열기 |
| A 행의 페이지가 열림 | A는 닫기 / 사이드 보기 닫기 | 사이드 보기 닫기 |
| A 행의 페이지가 열림 | B는 열기 | 같은 사이드 보기의 내용을 B로 전환 |
| B로 전환됨 | B는 닫기 | 닫은 뒤 다시 열기 표시 |

아이콘은 열기·닫기 모두 같은 `peekSide` 아이콘이었다. 글자 12px / 500, 버튼 높이 20px도 동일했다. UI 조작은 직접 CDP로 수행했고, REA가 클릭했다고 주장하지 않는다. 조사 후 패널은 닫고 기존 가로 스크롤 위치 357px로 돌렸다.

- [같은 행의 닫기 버튼](/Users/hyunsulee/Downloads/notion-row-peek-20261115/notion-same-row-close.png)
- [다른 행의 열기 버튼](/Users/hyunsulee/Downloads/notion-row-peek-20261115/notion-other-row-open.png)
- [실측 상태 기록](/Users/hyunsulee/Downloads/notion-row-peek-20261115/notion-runtime.json)

## REA와 배포 코드 근거

REA CLI 6.8.0으로 현재 renderer의 스크립트 식별 정보를 확인하고, 버튼 모듈을 정적으로 분석했다.

- 현재 캡처 Evidence: `ev_6b1becc1215ed1eac4dec523ab614f50c322064b0d5675c9a947ef3e2853963e`
- 선택 모듈 정적 분석 Evidence: `ev_990b1e907f0b30cb4af24cec2626601f2124051e98f1845ad3f2ee0833adae5c`
- 런타임 스크립트: `34131-dde2b08fd1964551.js`
- SHA-256: `63426a38b858002b69c39f2a1bac88cdb2e5076c1d6425dc4f1828e579eafa52`. 기존 REA 내보내기 원본과 현재 CDP hash가 일치했다.
- 모듈 `931535`의 원본 byte 범위 139957–143180을 ObjectMethod 그대로 추출하고 객체 표현식으로 감싼 3,229 bytes를 분석했다. 1개 파일 파싱 성공, 파싱 실패 0. 외부 모듈 의존성은 재구성하지 않았으며 의미 그래프에는 218개 미해결 항목이 남는다.

해당 조건문과 클릭 콜백은 동일 배포 소스를 직접 대조했다. 원본 TypeScript 복구나 전체 앱의 자동 추적 완료를 뜻하지 않는다.

[읽기용 코드](/Users/hyunsulee/Downloads/notion-row-peek-20261115/readable-module.js:35)의 조건은 다음과 같다.

```ts
isCurrentSidePeek =
  viewMode === 'side_peek' &&
  isSidePeekOpen() &&
  peekTarget.id === rowPage.id;
```

이 값으로 문구와 툴팁을 고르고, 클릭 콜백에서도 같은 값을 검사해 닫기 함수를 호출한다. 아이콘은 보기 모드에서 선택하며 열림 여부로 교체하지 않는다.

전체 증거와 원본 범위: `/Users/hyunsulee/Downloads/notion-row-peek-20261115/`의 `page.evidence.json`, `static-full.evidence.json`, `module-provenance.json`.

## Estate ERP의 현재 상태

`properties/index.tsx`의 단지 셀 버튼은 문구 `열기`, 툴팁 `사이드 보기에서 열기`, 클릭 `openPropertyInspector(group.intakeId)`가 고정되어 있다. `selectedIntakeId`와 `isInspectorClosing`은 이미 페이지에 있지만 이 버튼에서 사용하지 않는다. `columns`의 memo 의존성에도 이 두 상태가 없다.

실행 중인 `/properties`에서 101동 3404호 패널을 열어도 버튼 DOM의 문구·접근성 이름·툴팁이 열기로 남는 것을 확인했다. `erp-runtime.json`에 패널 열림과 버튼 값을 함께 기록했다. agent-browser 조사 중 사용자가 탭과 화면을 조작하여 대상이 바뀐 시도가 있었으므로 마지막 확인은 URL로 다시 찾은 정확한 renderer의 DOM 클릭과 스크린샷을 사용했다. 확인 후 조사로 연 패널은 닫았다.

## 적용 제안

버튼에서 다음 상태 하나를 파생한다.

```ts
const isCurrentInspector =
  selectedIntakeId === group.intakeId && !isInspectorClosing;
```

1. 현재 행이면 문구·툴팁·접근성 이름을 닫기로 바꾸고 `closePropertyInspector()`를 호출한다. 다른 행이면 기존 `openPropertyInspector(group.intakeId)`를 호출한다.
2. 비교 키는 `property.id`가 아니라 `intakeId`다. 패널과 표 행이 의뢰를 기준으로 동작하고 같은 물건에 이전 의뢰가 함께 보일 수 있기 때문이다.
3. 기존 아이콘, 크기, 호버 노출 방식은 활용한다. `aria-expanded`와 패널을 가리키는 `aria-controls`를 추가한다.
4. 열 정의의 memo 의존성에 `selectedIntakeId`, `isInspectorClosing`, `closePropertyInspector`를 넣어 현재 행 표시가 즉시 갱신되게 한다.
5. 기존 닫기 함수를 사용해 닫힘 애니메이션, 상태 정리, 표 포커스 복귀를 유지한다. 이 토글은 단지 셀의 작은 버튼에 적용하고, 지도 선택과 다른 탐색에 공유하는 열기 함수 자체는 토글로 바꾸지 않는다.

검수할 흐름: A 열기 → A 닫기, A 열린 상태에서 B 열기 → B 닫기, 패널 자체 닫기·Escape 후 버튼 복귀, 동일 물건의 다른 의뢰 행 구분, 닫힘 중 재열기, 키보드 실행.

## 적용 완료 및 검증

`properties/index.tsx`의 단지 셀에 `isCurrentInspector`를 연결했다. 현재 의뢰의 버튼 문구·툴팁·접근성 이름을 닫기로 바꾸고, 클릭 시 기존 닫기 함수를 호출한다. `aria-expanded`, `aria-controls`와 패널 ID를 연결하고 열 정의의 memo 의존성도 갱신했다.

실제 Electron에서 agent-browser의 snapshot, click, focus, press, hover, screenshot으로 다음을 확인했다.

- A 열기, A에서 B로 전환, 같은 행 버튼으로 닫기.
- 패널 닫기 버튼과 Escape 이후 모든 행이 열기로 복귀.
- Enter로 열기.
- 동일한 102동 3401호의 현재 의뢰와 이전 의뢰 중 열린 의뢰 하나만 닫기 표시.
- 닫힘 애니메이션 도중 재열기는 실제 renderer의 DOM 클릭으로 별도 확인: 닫히는 동안 `closed`/열기, 재열기 이후 `open`/닫기.
- 타입 검사 통과. 기존 `property-window.test.ts`, `property-detail-ui.test.ts` 41개 통과. 변경 파일 `git diff --check` 통과.

[최종 Electron 화면](/Users/hyunsulee/Downloads/notion-row-peek-20261115/implementation/final.png), [상태별 확인 기록](/Users/hyunsulee/Downloads/notion-row-peek-20261115/implementation/runtime-checks.json), [닫힘 중 재열기](/Users/hyunsulee/Downloads/notion-row-peek-20261115/implementation/rapid-reopen.json).
