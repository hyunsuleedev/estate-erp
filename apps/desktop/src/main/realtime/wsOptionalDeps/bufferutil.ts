/**
 * `ws`(socket.io가 Node에서 쓰는 WebSocket 구현)의 선택 의존성 `bufferutil` 자리.
 *
 * `bufferutil`은 네이티브 모듈이라 설치하지 않는다. 그런데 Vite는 설치되지 않은 선택
 * 의존성을 빈 모듈(프로덕션)이나 불러오는 순간 예외를 던지는 모듈(개발)로 바꿔 넣는다.
 * main 번들에서는 그 결과 48바이트 이상의 프레임을 보내지 못하거나(로그인 토큰이 든
 * 연결 요청이 여기 해당한다) 앱이 아예 뜨지 않는다. 그래서 `vite.main.config.ts`가
 * `bufferutil`을 이 파일로 돌린다. 동작은 `ws` 안의 순수 JS 구현과 같다.
 */
export function mask(
  source: Uint8Array,
  maskBytes: Uint8Array,
  output: Uint8Array,
  offset: number,
  length: number,
): void {
  for (let index = 0; index < length; index += 1) {
    output[offset + index] = (source[index] ?? 0) ^ (maskBytes[index & 3] ?? 0);
  }
}

export function unmask(buffer: Uint8Array, maskBytes: Uint8Array): void {
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] = (buffer[index] ?? 0) ^ (maskBytes[index & 3] ?? 0);
  }
}
