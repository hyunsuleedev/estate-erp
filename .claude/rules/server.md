---
paths:
  - "apps/server/**"
---

# 서버 (NestJS) 규칙

모듈 목록은 적지 않는다. `apps/server/src/modules/`가 기준이다.

## 요청 처리

- 컨트롤러는 `@UseGuards(JwtAuthGuard)`를 달고, 현재 사용자는 `@CurrentUser()`로 받는다. 값은 `{ userId, auth0UserId?, officeId, role }`.
- 역할 제한이 필요한 곳만 `RolesGuard` + `@Roles(...)`를 쓴다. 역할은 `owner / manager / agent`.
- 서비스 메서드는 `officeId`를 인자로 받아 조회·수정 범위를 직접 좁힌다. 요청 맥락(`common/request-context`)을 보고 `PrismaService`가 격리 대상 모델에 `officeId`를 넣어 주지만, 그것에만 기대지 않는다.
- 입력 검증은 서비스에서 한다. 형식이 틀리면 `BadRequestException`, 없으면 `NotFoundException`, 상태가 맞지 않으면 `ConflictException`. 사용자에게 보일 수 있는 메시지는 한국어로 쓴다.
- **요청 본문을 통째로 `data`에 넘기지 않는다.** 받을 칸을 하나씩 골라 넣는다. `{ officeId, ...dto }`는 본문의 `officeId`가 앞의 값을 덮으므로 쓰지 않는다. 중첩 쓰기(`connectOrCreate` 등)도 본문의 객체를 그대로 넘기지 않는다 — 법정동 마스터 같은 공용 표에 줄이 생긴다.
- **다른 표를 가리키는 id는 같은 사무소 것인지 서비스에서 검사한다.** 연락처·매물·매칭·거래를 가리키는 칸의 FK는 대부분 id만 가리켜 DB가 막지 못한다. 업무·일정·상담의 연결 칸은 `tasks/linked-records.ts`의 검사를 쓴다.
- 날·달의 경계는 한국 시각으로 자른다(`new Date()`의 날짜를 그대로 쓰지 않는다). 서버는 UTC로 돈다.
- 여러 표를 함께 바꾸는 일은 `prisma.$transaction` 안에서 한다. 읽은 값과 비교해 쓰는 갱신은 DB의 한 문장(`updateMany` + 조건)으로 한다. 동시에 들어온 요청이 서로 덮어쓰지 않게 하기 위해서다.

## 변경 기록

- `PrismaService`가 감사 대상 모델의 생성·수정·삭제를 `ActivityLog`에 남긴다. 대상 목록은 `prisma/prisma.service.ts`에 있다.
- 누가(`userId`, `actor`), 어디서(`source`: web / mcp / system) 했는지는 요청 맥락에서 읽는다.
- 주민번호·전화번호처럼 민감한 값이 있는 모델은 일부러 대상에서 뺐다(변경 내용에 복사되지 않게).

## 인증

- 직원(owner/manager/agent) 로그인 서비스는 Auth0다. 서버는 Auth0 접근 토큰(RS256, `aud` = `AUTH0_AUDIENCE`)을 검증하고, 토큰의 `sub`로 `User.auth0Id`를 찾는다 (`modules/auth/staff-auth.service.ts`).
- 아이디(`loginId`) 문자열로 연결하지 않는다. 공개 가입으로 남의 아이디를 선점해 계정을 가져가는 일을 막기 위해서다.
- 사무소·역할·활성 여부는 토큰이 아니라 DB에서 요청마다 읽는다. 기억하는 것은 토큰 서명 확인 결과뿐이다.
- 접근 차단의 기준은 DB다: `User.isActive`, `Office.isActive`, `User.tokensValidAfter`. `tokensValidAfter` 이전에 발급됐거나, 그 이전에 로그인한 세션이 갱신해 받은 토큰을 거절한다. 세션의 로그인 시각은 Auth0 Action이 토큰에 넣는다 (`apps/server/auth0/`).
- Auth0 계정 차단과 refresh token 폐기는 뒤처리다. 실패하면 다시 시도한다 (`modules/auth/auth0-account-sync.service.ts`).
- 처음 로그인한 가입자는 사무소 없는 owner로 만들어지고, 온보딩(`POST /offices/me`)에서 사무소를 만든다. 사장님 가입에는 이메일이 필수이고 직원 계정은 이메일 없이 서버가 만든다.
- 직원 계정 생성·비밀번호 재설정·차단은 Auth0 Management API로 한다 (`modules/auth/auth0-management.service.ts`, `modules/employees`).
- `/mcp`는 MCP 전용 토큰과 API 키(`esk_…`)만 받는다. 데스크톱 로그인 토큰은 받지 않는다. 반대로 REST는 `AUTH0_STAFF_CLIENT_IDS`에 있는 앱의 토큰만 받는다.
- 소비자 사이트(`apps/catalog`) 로그인은 별개의 Clerk 사용자 집합이다 (`ConsumerAuthGuard`).

## 실시간

- Socket.io + Redis 어댑터 (`src/realtime`). 연결은 토큰 만료 시각에 서버가 끊고, 다시 연결할 때 인증을 처음부터 거친다. 사무소 없는 계정은 연결할 수 없다.
- 접근을 끊을 때는 `RealtimeService.disconnectUser`도 함께 부른다.
- **신호에는 무엇이 바뀌었는지만 싣는다**(id). 바뀐 내용은 싣지 않고, 화면이 평소 조회로 다시 받는다. 권한과 가리기(수수료 등)가 조회 한 곳에만 있게 하기 위해서다.
- **업무 데이터를 바꾸는 서비스가 신호를 보낸다.** 컨트롤러가 아니라 서비스에서 — MCP 도구도 같은 서비스를 부르기 때문이다. 저장이 끝난 뒤에 보내고(도중에 보내면 화면이 다시 받아도 예전 값이다), 신호를 못 보내도 저장은 성공으로 둔다.
- 신호에는 **영향받는 집·의뢰의 id**도 싣는다. 거래가 바뀌면 그 집의 상세도 다시 받아야 한다(집 상세에 거래 요약이 실려 있다). 지운 것은 지우기 전에 자리를 읽어 둔다.
- 화면은 "무엇이 바뀌면 무엇을 다시 받는가"를 영역마다 함수 하나로 둔다(`apps/desktop/src/renderer/queries/`). 내가 저장한 직후와 신호를 받았을 때가 같은 함수를 부른다. 조회 키도 그 파일에서만 정의한다.
- 새 영역에 쓰기를 만들면 신호(`RealtimeService`, 데스크톱 `REALTIME_SERVER_EVENTS`)와 화면 쪽 갱신 함수를 같이 만든다. 지금 신호가 있는 것: 매물 의뢰 · 거래 조건 · 거래.

## 테스트

- `*.spec.ts`는 jest로 돈다. 대부분 Prisma를 가짜로 바꾼 단위 테스트다.
- SQL을 직접 쓰는 조회나 마이그레이션은 가짜로는 확인되지 않는다. 임시 DB에서 실제로 돌려 본다.
- 운영(`NODE_ENV=production`)에서만 필수인 환경 변수는 `src/config/env.validation.ts`에 있다. 새로 추가하면 `.env.example`에도 적는다.
