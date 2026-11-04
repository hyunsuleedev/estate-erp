# Clean splash

현재 앱 스플래시의 배경색 `#fbfaf7`과 글자색 `#37352f`에 맞춘 독립 시안. 56px 원본 로고, 제품명, 56×2px 로딩 표시만 사용한다. 로고 두 조각은 작은 원근 회전과 함께 등장하고, 대기 중 2.8초 주기로 간격·각도가 조금씩 변한다. 완료 시 180ms 동안 원본 형태로 정렬한 뒤 화면을 전환한다. 광원·입자·추가 장식 없음.

`python3 -m http.server 8777 --bind 127.0.0.1 --directory docs/mockups/clean-splash`

기본 데모는 10초 후 로그인 미리보기로 전환된다. 하단 버튼은 시안 검수용이다. `window.splashPreview.start(readyPromise)` 또는 `finish()`로 준비 완료에 바로 연결할 수 있으며 최소 대기 시간은 없다. 현재 실제 앱 및 인증 시스템에는 연결되지 않았다.
