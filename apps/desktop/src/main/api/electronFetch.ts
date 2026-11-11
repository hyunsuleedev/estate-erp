import { net } from 'electron';

/**
 * main 프로세스의 HTTP 요청을 Chromium 네트워크 스택으로 보낸다. Node의 fetch와 달리
 * OS에 설정된 프록시와 시스템 인증서 저장소를 따른다(회사 프록시, TLS 검사 환경).
 * 화면의 요청과 같은 길로 나간다.
 *
 * `net`은 앱이 준비된 뒤에만 쓸 수 있으므로 부를 때 꺼내 쓴다. 쿠키와 저장된 HTTP
 * 인증 정보는 싣지 않는다(이 요청들은 bearer 토큰이나 본문의 값으로 인증한다).
 */
export const electronFetch: typeof fetch = (input, init) =>
  net.fetch(
    typeof input === 'string' || input instanceof Request ? input : String(input),
    { ...init, credentials: 'omit' },
  );
