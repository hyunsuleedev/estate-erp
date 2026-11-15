/**
 * Auth0 Action (trigger: post-change-password).
 *
 * 비밀번호가 바뀌면 에스테잇플로우 서버에 알려, 그 계정의 기존 로그인을 모두 끊게
 * 한다(접근 토큰 거절, 실시간 연결 끊기, refresh token 폐기). Auth0는 비밀번호가
 * 바뀌어도 refresh token을 살려 두므로 이 알림이 없으면 예전 PC가 계속 접속한다.
 *
 * Secrets:
 *   API_BASE_URL  서버 주소 (예: https://api.estaitt.com). 이 뒤에 /auth/auth0-events/... 가 붙는다.
 *   EVENT_SECRET  서버의 AUTH0_EVENT_SECRET과 같은 값.
 *
 * 올리는 방법: apps/server/auth0/README.md
 */
exports.onExecutePostChangePassword = async (event) => {
  const baseUrl = (event.secrets.API_BASE_URL || '').replace(/\/+$/, '');
  const secret = event.secrets.EVENT_SECRET;
  if (!baseUrl || !secret) {
    console.log('password-changed: API_BASE_URL or EVENT_SECRET is not set');
    return;
  }
  const body = JSON.stringify({
    userId: event.user.user_id,
    changedAt: event.user.last_password_reset || new Date().toISOString(),
  });
  // 서버가 잠깐 응답하지 않아도 알림을 잃지 않도록 몇 번 다시 보낸다.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(
        `${baseUrl}/auth/auth0-events/password-changed`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-auth0-event-secret': secret,
          },
          body,
          signal: AbortSignal.timeout(5000),
        },
      );
      if (response.ok) return;
      console.log(`password-changed: server answered ${response.status} (attempt ${attempt})`);
    } catch (error) {
      console.log(`password-changed: ${error && error.message} (attempt ${attempt})`);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
};
