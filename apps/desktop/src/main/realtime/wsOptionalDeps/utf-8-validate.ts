import { isUtf8 } from 'node:buffer';

/**
 * `ws`의 선택 의존성 `utf-8-validate` 자리. 이유는 옆의 `bufferutil.ts`와 같다.
 * Electron의 Node에는 `buffer.isUtf8`이 있어 `ws`가 이 모듈을 실제로 부르지는 않지만,
 * 번들에 들어가는 자리는 채워 둬야 한다.
 */
export default function isValidUTF8(buffer: Uint8Array): boolean {
  return isUtf8(buffer);
}
