---
paths:
  - "apps/server/**"
---

# NestJS Server Rules

## 모듈 구조

```
src/modules/
  auth/           # Passport.js + JWT, 사무소 관리
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

- 회원가입 시 Office + User 동시 생성
- JWT payload: `{ sub: userId, officeId, email }`
- JWT_SECRET fallback: 'dev-secret-change-in-production'

## 클라이언트 앱 구성

- **Desktop (Electron)**: CTI Bridge, 시스템 트레이, 로컬 MCP Host 포함. 풀 기능.
- **Mobile (React Native, Android only)**: 전화 오버레이 + 녹음, 상담 기록 빠른 등록.
- UI 코드는 각 앱이 독립적으로 보유. `packages/shared` (타입/enum)와 `packages/api-client` (API 호출)만 공유.

## 규칙 엔진 (BullMQ)

- 매물 가격 변동 감지 → 태스크 자동 생성
- 매물 확인일 7일 경과 → 알림
- 구매고객 조건 매칭 매물 등장 → 알림
- 계약 마감일 임박 → 알림
