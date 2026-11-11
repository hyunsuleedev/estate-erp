---
paths:
  - "apps/server/**"
---

# NestJS Server Rules

## 모듈 구조

```
src/modules/
  auth/           # Auth0 직원 인증(토큰 검증·Management API), /auth/me
  properties/     # 매물 CRUD + 비즈니스 로직
  contacts/       # 연락처/고객
  sites/          # 단지/건물
  dongs/          # 동
  units/          # 호실
  matches/        # 매칭 파이프라인
  deals/          # 거래/계약
  tasks/          # 업무 관리
  consultations/  # 상담 기록
  buyer-requirements/ # 구매 희망조건
  calendar-events/    # 캘린더
  cti/            # 전화 이벤트 WebSocket
  insights/       # 규칙 엔진
  notifications/  # 알림 (푸시, 인앱)
  mcp/            # CRM MCP Server
```

## 코드 패턴

- 모든 Controller에 `@UseGuards(JwtAuthGuard)` 적용
- 현재 사용자: `@CurrentUser()` 데코레이터
- DTO는 `class-validator` 데코레이터로 검증
- Service에서 PrismaService 주입하여 DB 접근
- office_id 필터링은 Prisma middleware 또는 서비스 레벨에서 처리

## Auth

- 직원(owner/manager/agent) 로그인 서비스는 Auth0다. 서버는 Auth0 접근 토큰(RS256, `aud` = `AUTH0_AUDIENCE`)을 검증하고, 토큰의 `sub`로 `User.auth0Id`를 찾는다 (`modules/auth/staff-auth.service.ts`).
- 아이디(`loginId`) 문자열로 연결하지 않는다. 사무소·역할·활성 여부는 토큰이 아니라 DB에서 요청마다 읽는다(기억하는 것은 토큰 서명 확인 결과뿐이다).
- 접근 차단의 기준은 DB다: `User.isActive`, `Office.isActive`, `User.tokensValidAfter`(이 시각 이전에 발급된 토큰 거절). Auth0 차단·refresh token 폐기는 뒤처리다 (`modules/auth/auth0-account-sync.service.ts`).
- 실시간 연결은 토큰 만료 시각에 서버가 끊는다. 다시 연결할 때 인증을 처음부터 거친다. 사무소 없는 계정은 연결할 수 없다.
- 처음 로그인한 가입자는 사무소 없는 owner로 만들어지고, 온보딩(`POST /offices/me`)에서 사무소를 만든다.
- 직원 계정 생성·비밀번호 재설정·차단은 Auth0 Management API로 한다 (`modules/auth/auth0-management.service.ts`, `modules/employees`).
- `CurrentUserPayload`: `{ userId, auth0UserId?, officeId, role }`
- 소비자 사이트(apps/catalog) 로그인은 별개의 Clerk 사용자 집합이다 (`ConsumerAuthGuard`).

## 클라이언트 앱 구성

- **Desktop (Electron)**: CTI Bridge, 시스템 트레이, 로컬 MCP Host 포함. 풀 기능.
- **Mobile (React Native, Android only)**: 전화 오버레이 + 녹음, 상담 기록 빠른 등록.
- UI 코드는 각 앱이 독립적으로 보유. `packages/shared` (타입/enum)와 `packages/api-client` (API 호출)만 공유.

## 규칙 엔진 (BullMQ)

- 매물 가격 변동 감지 → 태스크 자동 생성
- 매물 확인일 7일 경과 → 알림
- 구매고객 조건 매칭 매물 등장 → 알림
- 계약 마감일 임박 → 알림
