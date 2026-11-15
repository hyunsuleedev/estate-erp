/**
 * Auth0 Action (trigger: post-login). 로그인할 때와 refresh token으로 토큰을 새로 받을
 * 때마다 실행된다.
 *
 * 1. 접근 토큰에 이 세션이 로그인한 시각(초)을 넣는다. refresh token으로 토큰을 새로
 *    받아도 이 시각은 처음 로그인한 때 그대로다. 서버는 이 값으로, 기준 시각
 *    (User.tokensValidAfter) 이전에 로그인한 세션의 토큰을 발급 시각과 상관없이
 *    거절한다(apps/server/src/modules/auth/staff-auth.service.ts).
 * 2. 비밀번호가 바뀌기 전에 로그인한 세션에는 토큰을 새로 주지 않는다. Auth0는
 *    비밀번호가 바뀌어도 refresh token을 살려 두므로, 이 거절이 없으면 예전 PC가
 *    계속 접속한다. 서버가 변경 알림을 받지 못했거나 refresh token 폐기에 실패해도
 *    예전 세션은 접근 토큰 수명 안에 끊긴다.
 *
 * Secrets 없음. 올리는 방법: apps/server/auth0/README.md
 */
const AUTH_TIME_CLAIM = 'https://estaitt.com/auth_time';

exports.onExecutePostLogin = async (event, api) => {
  // 이 세션의 인증 시각들 중 가장 늦은 것(비밀번호 로그인 시각).
  const methods = (event.authentication && event.authentication.methods) || [];
  let authenticatedAtMs = null;
  for (const method of methods) {
    const at = Date.parse(method && method.timestamp);
    if (Number.isFinite(at) && (authenticatedAtMs === null || at > authenticatedAtMs)) {
      authenticatedAtMs = at;
    }
  }
  // 시각을 알 수 없으면 아무것도 하지 않는다. 서버의 발급 시각 검사는 그대로 적용된다.
  if (authenticatedAtMs === null) return;

  const passwordChangedAtMs = Date.parse(event.user.last_password_reset || '');
  if (Number.isFinite(passwordChangedAtMs) && authenticatedAtMs < passwordChangedAtMs) {
    api.access.deny('비밀번호가 변경되었습니다. 다시 로그인해 주세요.');
    return;
  }

  api.accessToken.setCustomClaim(AUTH_TIME_CLAIM, Math.floor(authenticatedAtMs / 1000));
};
