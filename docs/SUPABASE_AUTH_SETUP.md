# Supabase Auth 셋업 가이드

estate-erp는 **Supabase Auth만 외주**, 나머지는 자체 인프라(현재 docker postgres → Phase 4+ AWS RDS).

## 결정 요약

- **인증**: Supabase Seoul (signInWithPassword)
- **DB**: docker postgres (Phase 1) → AWS RDS Seoul (Phase 4+)
- **사용자 관리**: 사장님 발급 모델 (모델 B)
- **비번 복구**: 사장님이 직접 재설정 (옵션 1)
- **로그인 UI**: Electron 자체 React 폼 (모델 A — NestJS 경유)
- **JWT**: **Supabase JWT 직접 사용** (자체 JWT 발급 X, 단일 토큰)
- **JWT 검증 방식**: 비대칭 ES256/RS256 + JWKS endpoint (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`). Legacy HS256 미사용. 키 회전 자동 지원.
- **권한 결정**: NestJS JwtStrategy가 sub만 신뢰, 자체 DB 조회로 role/officeId 결정 (sub만 신뢰 패턴)
- **권한 변경 즉시 반영**: JWT에 role/officeId 안 박혀 있고 매 요청마다 DB 조회
- **Brute Force 방어**: NestJS `@nestjs/throttler` (auth endpoint 분당 5~30회) + Supabase 자체 rate limit 2중 레이어

## 왜 Frontend 직접이 아니라 NestJS 경유 (Model A) 인가

검토했던 두 패턴:

| | Model A (NestJS 경유, **선택**) | Model B (Frontend 직접) |
|---|---|---|
| 로그인 흐름 | Electron → NestJS `/auth/login` → Supabase | Electron → Supabase 직접 |
| Supabase JS SDK 번들 | NestJS만 | Electron + Web + Mobile 3군데 |
| 합성 이메일 규칙 | 백엔드 1곳 캡슐화 | 클라이언트 3곳 중복 |
| Brute Force 추가 레이어 | NestJS Throttler 가능 | Supabase 자체 한도만 |
| `lastLoginAt`, ActivityLog | 서버사이드 단일 트랜잭션 | 클라이언트 → 별도 API 호출 필요 |
| Latency | +50-100ms (1 hop) | 직접 |

**사장님 발급 모델 + 비번 재설정 옵션 1 + 합성 이메일 + logout('global')은 모두 `service_role`이 필요한 백엔드 전용 작업.** Model B로 가도 login만 직접이고 reset/logout/employee-create는 어차피 NestJS 경유라 **두 갈래로 갈라져 surface area만 늘어남**. login 한 번에 50-100ms 절약하는 것이 Model B의 유일한 이득. → Model A 채택, 단일 경로 유지.

업계 패턴: Supabase 풀세트(Auth+DB+RLS) MVP는 Model B, 커스텀 비즈니스 로직 많은 NestJS+Supabase 프로덕션 B2B는 Model A.

## 합성 이메일 패턴

Supabase는 email 필수 + unique이지만 estate-erp는 loginId 기반. 따라서:

- 합성 이메일: `{loginId}@estate-erp.local`
- 예: `kim_manager` → `kim_manager@estate-erp.local`
- 직원 진짜 이메일은 자체 DB `User.email` 컬럼에 별도 저장 (선택)

## Step 1: Supabase 프로젝트 생성

1. https://supabase.com 가입
2. **New Project**:
   - Name: `estate-erp-prod` (또는 `estate-erp-dev`)
   - Region: **Northeast Asia (Seoul)** `ap-northeast-2`
   - DB Password: 강함 (`openssl rand -base64 32`)
   - Plan: Free (PoC) → Pro $25/월 (운영 시)

## Step 2: Authentication 설정

**Dashboard > Authentication > Providers > Email**:

- ✅ Enabled
- ❌ **Confirm email** — 합성 이메일이라 실재하지 않음
- ❌ **Allow new users to sign up** — 사장님 발급 모델 (셀프 가입 금지)
- ❌ **Allow anonymous sign-ins**
- 비번 정책: Min length 8

**Dashboard > Authentication > Rate Limits**: 기본값 OK (Brute Force 자동).

**Dashboard > Authentication > URL Configuration**:
- 사용 안 함 (Electron 내부 폼이라 redirect 없음)

## Step 3: 환경변수 가져오기

estate-erp는 **Supabase의 새 JWT Signing Keys (비대칭 ES256/RS256) + JWKS endpoint 검증**을 사용합니다. Legacy HS256 JWT Secret은 사용하지 않습니다.

### 가져올 값 (3개)

**Dashboard > Project Settings > API** 페이지:

| 표시 명 | .env 변수 | 비고 |
|---|---|---|
| Project URL | `SUPABASE_URL` | `https://<프로젝트ID>.supabase.co` |
| `anon` `public` (또는 `sb_publishable_...`) | `SUPABASE_ANON_KEY` | 클라이언트 공개 가능 |
| `service_role` `secret` (또는 `sb_secret_...`) | `SUPABASE_SERVICE_ROLE_KEY` | **절대 클라이언트 노출 금지** |

### 가져오지 않아도 되는 값

| 표시 | 이유 |
|---|---|
| Legacy JWT Secret | HS256용, 우리는 ES256 + JWKS 사용 |
| JWT Signing Keys 페이지의 Key ID(`kid`) | 토큰 헤더에 자동 포함, jwks-rsa가 자동 처리 |
| Standby Key | 키 회전 시 사용, 지금은 불필요 (생성도 X) |

### .env 입력

`apps/server/.env`:

```bash
SUPABASE_URL="https://xxxxx.supabase.co"
SUPABASE_ANON_KEY="sb_publishable_..."
SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
SUPABASE_SYNTHETIC_DOMAIN="estate-erp.local"
```

> JWKS endpoint URL은 코드에서 `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`로 자동 구성. 별도 설정 불필요.

### JWKS 검증 빠른 확인 (선택)

`.env`를 채운 후 JWKS endpoint가 정상 응답하는지 확인:

```bash
curl -s "${SUPABASE_URL}/auth/v1/.well-known/jwks.json" | jq .

# 응답 예 — alg가 ES256 또는 RS256이면 OK
# {
#   "keys": [
#     { "kid": "ef715210-...", "kty": "EC", "alg": "ES256", ... }
#   ]
# }
```

`alg`가 ES256/RS256 이외면 `apps/server/src/modules/auth/jwt.strategy.ts`의 `algorithms` 배열에 추가 필요.

## Step 4: 기존 사용자 마이그레이션 (Phase 1)

기존 estate-erp 사용자는 자체 bcrypt 비번으로 등록돼 있고 Supabase 매핑 없음. 두 가지 옵션:

### 옵션 A: 모든 기존 사용자 다시 발급 (간단)

```sql
-- 자체 DB 백업 후
TRUNCATE users CASCADE;
-- 사장님이 NestJS API로 재가입 (POST /auth/register)
-- → 자동으로 Supabase + 자체 DB 동시 생성
```

### 옵션 B: 점진 마이그레이션 (운영 데이터 보존 시)

```typescript
// 마이그레이션 스크립트
for (const user of existingUsers) {
  // 1. Supabase admin.createUser (임시 비번)
  const { data } = await supabase.auth.admin.createUser({
    email: `${user.loginId}@estate-erp.local`,
    password: tempPassword,
    email_confirm: true,
  });

  // 2. 자체 DB User에 supabaseId, syntheticEmail 업데이트 + mustChangePassword: true
  await prisma.user.update({
    where: { id: user.id },
    data: {
      supabaseId: data.user.id,
      syntheticEmail: `${user.loginId}@estate-erp.local`,
      mustChangePassword: true,
    },
  });

  // 3. 사장님이 새 임시 비번을 직원에게 카톡 전달
}
```

## Step 5: 동작 검증

### 5.1 사장님 회원가입 (첫 사무소)

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "loginId": "admin",
    "email": "boss@gmail.com",
    "password": "test1234!",
    "name": "사장님",
    "officeName": "테스트 부동산"
  }'

# 응답: { accessToken, refreshToken, user, office }
```

확인:
- 자체 DB `users` 테이블에 row 1개 (`supabase_id`, `synthetic_email` 채워짐)
- Supabase Dashboard > Authentication > Users에 `admin@estate-erp.local` 1개

### 5.2 로그인

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "loginId": "admin", "password": "test1234!" }'

# 응답: { accessToken, refreshToken, user, office }
```

NestJS가:
1. 자체 DB로 `admin` → `admin@estate-erp.local` 변환
2. Supabase로 비번 검증
3. 자체 JWT 발급

### 5.3 사장님이 직원 발급

```bash
curl -X POST http://localhost:3000/employees \
  -H "Authorization: Bearer <admin's accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "loginId": "kim_manager",
    "name": "김매니저",
    "phone": "010-1234-5678",
    "password": "temp1234!",
    "role": "manager"
  }'
```

→ Supabase에 `kim_manager@estate-erp.local` 생성, 자체 DB에 매핑.
→ 사장님이 `temp1234!`를 직원에게 카톡으로 전달.
→ 직원 첫 로그인 시 `mustChangePassword: true` → 비번 변경 강제 화면 (Electron이 처리).

### 5.4 비번 재설정 (사장님이 — 옵션 1)

```bash
curl -X POST http://localhost:3000/employees/<userId>/reset-password \
  -H "Authorization: Bearer <admin's accessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "newPassword": "newTemp5678!" }'

# 응답: { success: true, message: "..." }
```

→ Supabase 비번 변경 + 모든 세션 무효 + `mustChangePassword: true`.
→ 사장님이 새 비번 카톡 전달.

### 5.5 직원 본인 비번 변경

```bash
curl -X POST http://localhost:3000/employees/me/change-password \
  -H "Authorization: Bearer <employee's accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "temp1234!",
    "newPassword": "myNewSecure!"
  }'
```

→ 현재 비번 검증 → 새 비번 → `mustChangePassword: false`.

## Step 6: Electron 클라이언트 처리 (TODO)

### 첫 로그인 시 비번 변경 강제

```typescript
// /auth/me 응답에 mustChangePassword 포함
const me = await api.auth.me();

if (me.mustChangePassword) {
  navigate('/change-password-required');
}
```

`/change-password-required` 화면에서 `POST /employees/me/change-password` 호출 후 대시보드 이동.

## Phase 2+ TODO

- [ ] Redis 캐시 (`JwtStrategy.validate` 자체 DB 조회를 1분 TTL로) — 부하 감소
- [x] Throttler (`@nestjs/throttler` Brute Force 방어 추가 레이어) — `app.module.ts`에 글로벌 적용 (default 60req/min, auth 그룹 별도 5~30회)
- [ ] Throttler Redis storage 전환 (`ThrottlerStorageRedisService`) — 멀티 인스턴스 환경 대비
- [ ] MCP OAuth 정식 (Supabase OAuth Server + RFC 8707)
- [ ] AWS RDS Seoul 마이그레이션 (Phase 4+ 컴플라이언스)
- [ ] AWS App Runner 배포 (NestJS 호스팅)
- [ ] Realtime: NestJS Socket.io + 연결 시점 1회 검증 + 메모리 컨텍스트 (DB 부하 회피)

## 비번 복구 옵션 (Phase 2+ 검토)

현재 옵션 1 (사장님이 직접) 사용. 미래에:

- **옵션 2**: 진짜 이메일 등록 직원만 자체 reset token + Resend/SES 메일
- **옵션 3**: SMS OTP (한국 통신사 — Coolsms, NHN Cloud 등)
- **옵션 4**: Plus addressing (사장님 Gmail + plus → reset 메일 사장님이 받음)

## 컴플라이언스

- 인증 정보: Supabase Seoul (한국 영토)
- 비즈니스 데이터: 자체 DB (Phase 1: docker postgres / Phase 4+: AWS RDS Seoul)
- 처리방침에 *"인증 처리는 Supabase Inc.에 위탁 처리, AWS Seoul region 보관"* 명시 필요

## 보안 체크리스트

- [x] `SUPABASE_SERVICE_ROLE_KEY`는 NestJS 서버 환경변수에만 (Git 커밋 금지)
- [x] 합성 이메일은 사용자에게 노출 X (loginId만 표시)
- [x] `mustChangePassword: true` 시 강제 비번 변경
- [x] 비번 재설정 시 모든 세션 무효화 (`signOut('global')`)
- [x] 사장님(owner)만 직원 비번 재설정 가능 (`@Roles('owner', 'manager')` + `assertCanManageTarget`)
- [x] Throttler 적용 (`@nestjs/throttler`) — login 분당 10회, register/reset/change 분당 5회, refresh 분당 30회
- [ ] Phase 2+: MFA (Phase 4+ 검토)
