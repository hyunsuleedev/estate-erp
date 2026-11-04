# 에스테잇플로우 — 아파트 스플래시

8770에서 선택한 아파트 시안의 스플래시 전용 버전. 로그인 폼, 헤더, 단계 설명, 도면 라벨, 나침반, 재생 도구를 제거했다. 기존 단지 모델 및 카메라 → 도면 → 로고 흐름은 유지한다.

```sh
cd docs/mockups/architectural-splash
npm install --ignore-scripts
npm start
```

http://127.0.0.1:8770/ — 새로고침하면 다시 재생. 기본 9초 뒤 로고에서 정지하며, 하단의 로딩 표시는 실제 준비 완료 신호 전까지 지속된다. 데모 시간이 실제 앱 준비 상태를 뜻하지 않는다.

호스트 연결:

```js
// 실제 앱이 준비되면 호출. 9초의 나머지 구간을 기다리지 않는다.
window.estaitSplash.finish(() => {
  // 로고로 마무리하고 스플래시가 사라진 뒤 앱 화면을 표시한다.
});
// 또는 window.dispatchEvent(new Event('estait:ready'));
// 준비 완료 이벤트: estait:splash-complete
// 호스트가 화면을 제거할 때: window.estaitSplash.dispose()
```

아직 실제 Electron/웹 앱의 인증·시작 수명주기에 연결하지 않은 독립 화면이다. 빠른 준비 시 현재 장면에서 로고로 280ms 안에 교차 전환하고, 콜백이 있으면 180ms 동안 사라진 뒤 콜백을 실행한다. 애니메이션만 끝난 경우에는 화면을 임의로 닫지 않는다.

- 동작 줄이기 설정: 정적인 최종 로고, 전환 애니메이션 생략.
- `?fallback=1`: WebGL을 사용할 수 없을 때의 정적 대체 화면.
- 탭이 숨겨지면 렌더링 정지. 화면 제거 시 GPU 자원 해제.
- 변경 전 시안: `../archives/architectural-study-before-splash-only.zip`.
