# Auth0 테넌트에 올리는 것

서버 코드만으로는 끝나지 않고 Auth0 테넌트에도 있어야 하는 설정을 여기에 둔다.

## 비밀번호가 바뀌면 기존 로그인 끊기

사장님은 로그인 화면의 비밀번호 찾기로 메일을 받아 Auth0 화면에서 비밀번호를 바꾼다.
이 변경은 서버를 거치지 않고, Auth0는 비밀번호가 바뀌어도 refresh token을 살려 둔다.
그대로 두면 예전 PC가 계속 접속하므로 Action 두 개로 막는다.

| Action | 트리거 | 하는 일 |
| --- | --- | --- |
| `actions/session-claims.js` | post-login (로그인·토큰 갱신마다) | 접근 토큰에 세션의 로그인 시각을 넣는다. 비밀번호가 바뀌기 전에 로그인한 세션의 토큰 갱신을 거절한다. |
| `actions/password-changed.js` | post-change-password | 서버에 알린다. 서버가 그 계정의 기존 로그인을 바로 끊는다. |

- `session-claims`는 서버에 닿을 필요가 없고 비밀값도 없다. 이것만으로 예전 세션은
  접근 토큰 수명(15분) 안에 끊긴다. 서버는 토큰의 로그인 시각이 `User.tokensValidAfter`
  이전이면 발급 시각과 상관없이 거절한다(`staff-auth.service.ts`). 그래서 refresh token
  폐기가 실패해도 예전 세션이 새로 받은 토큰은 통하지 않는다.
- `password-changed`는 15분을 기다리지 않고 바로 끊기 위한 것이다. 서버는 기준 시각을
  변경 시각으로 올리고, 실시간 연결을 끊고, refresh token을 폐기한다
  (`Auth0PasswordChangeService`). 폐기가 안 끝났으면 503으로 답해 Action이 다시 부른다.
  직원 비밀번호 재설정은 서버가 직접 같은 처리를 하고, 뒤에 오는 알림은 같은 일을
  한 번 더 할 뿐이다.

올리기:

```bash
auth0 login   # 대상 테넌트
API_BASE_URL=https://api.estaitt.com AUTH0_EVENT_SECRET=<서버와 같은 값> \
  apps/server/auth0/deploy-actions.sh
```

- 서버 환경 변수 `AUTH0_EVENT_SECRET`과 Action의 `EVENT_SECRET`은 같은 값이다.
  운영(`NODE_ENV=production`)에서는 이 값이 없으면 서버가 뜨지 않는다.
- Auth0가 `API_BASE_URL`에 닿을 수 있어야 한다. 내 PC의 `localhost` 서버에는 닿지
  못하므로, 로컬 개발에서는 알림 없이 `session-claims`만으로 끊긴다(최대 15분).
  로컬에서 즉시 끊기는 동작을 보려면 알림을 직접 보낸다:

  ```bash
  curl -X POST http://localhost:3000/auth/auth0-events/password-changed \
    -H 'content-type: application/json' \
    -H "x-auth0-event-secret: $AUTH0_EVENT_SECRET" \
    -d '{"userId":"auth0|...","changedAt":"2026-11-15T10:00:00Z"}'
  ```

## DB 연결의 이메일 항목

사장님 가입에서 이메일을 받기 위해 DB 연결(Username-Password-Authentication)의
`options.attributes.email`을 다음처럼 둔다. 연결 옵션은 PATCH할 때 전체가 바뀌므로
현재 옵션을 받아 이 항목만 더해서 보낸다.

```json
{
  "identifier": { "active": true },
  "profile_required": false,
  "signup": { "status": "required", "verification": { "active": false } }
}
```

- `signup.status = required`: 가입(`/dbconnections/signup`)에는 이메일이 꼭 있어야 한다.
- `profile_required = false`: 서버가 Management API로 만드는 직원 계정은 이메일 없이 만든다.
- `identifier.active = true`: 꺼 두면 `/dbconnections/change_password`가 200을 주면서도
  계정을 찾지 못한다(Auth0 로그에 `fcpr` "User does not exist").
