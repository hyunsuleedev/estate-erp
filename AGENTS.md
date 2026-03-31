# Estate ERP

부동산 중개사 전용 SaaS ERP. 기존 estate-crm을 NestJS 기반으로 재구축.

## Tech Stack

- **Backend**: NestJS + TypeScript, Prisma, PostgreSQL + PostGIS
- **Cache/Queue**: Redis + BullMQ
- **Realtime**: Socket.io
- **Auth**: Passport.js + JWT
- **Email**: Resend + React Email
- **File Storage**: S3 / Cloudflare R2
- **Desktop**: Electron (React 19 + TanStack + Tailwind v4 + shadcn/ui)
- **Web**: Vite SPA (React 19 + TanStack + Tailwind v4 + shadcn/ui)
- **Mobile**: React Native (Android only — 전화 오버레이 + 녹음)
- **Build**: Vite + electron-builder
- **Package Manager**: pnpm (monorepo workspaces)

## Monorepo Structure

```
apps/
  server/           # NestJS 백엔드 (src/modules/*)
  desktop/          # Electron (main/ preload/ renderer/)
  web/              # Vite SPA (사장님용 웹 버전, CTI 없음)
  mobile/           # React Native (Android only)
  cti-bridge/       # CTI Bridge (32비트)
packages/
  shared/           # 공유 타입, 유틸리티, Enum
  api-client/       # API 클라이언트 (desktop + web + mobile 공유)
  mcp-server/       # CRM MCP Server 정의
prisma/
  schema.prisma     # DB 스키마 (source of truth)
```

## Key Conventions

### Naming
- TypeScript: `camelCase` (e.g., `buyerReqId`, `officeId`)
- DB/Prisma schema: `snake_case` (e.g., `buyer_req_id`, `office_id`)
- Prisma model: `PascalCase` (e.g., `BuyerRequirement`, `NetworkInquiry`)

### Price & Area
- 가격: 만원 단위 (10,000 KRW). 예: 15.8억 = `158000`
- 면적: m² 기준 저장. 평 = m² × 0.3025

### Address & Location
- 법정동 마스터 테이블: Province → District → Ward (공공데이터 import)
- Site는 `wardCode` FK로 주소 참조 (자유텍스트 아님)
- 외부 단지코드: kaptComplexCode, naverComplexCode, kbComplexCode (각각 nullable)
- PostGIS geometry(Point, 5179) — 공간 쿼리는 `$queryRaw` 사용

### Multi-tenancy
- 모든 데이터 테이블에 `office_id` 필수 (법정동 마스터 제외)
- Prisma middleware로 격리

### Auth & User
- Office.code: 사무소 코드 (자동 생성, "GD7291" 등)
- User.loginId: owner는 이메일, 직원은 자동생성 ("GD7291-0001")
- User.email: owner 필수, 직원 선택
- User.role: owner / manager / agent
- NestJS @Roles 데코레이터 + Guard 패턴 RBAC

### Site → Unit 체인
- Site → Dong → Unit → Property (아파트/오피스텔 풀 체인)
- Site → Unit → Property (빌라, dong 생략)
- Site → Property (단독주택/토지, unit/dong 없음)
- SiteUnitType: 평형 카탈로그 (84A, 59B 등), 네이버 pyeongList 1:1 대응
- Unit.floor + Unit.lineNo → 동별 호실 그리드 (네이버 스타일)

### Deal → Contract → DealParticipant
- Deal: 거래 진행 관리 (파이프라인 + 수수료 총괄)
- Contract: 계약서 상세 (Deal 1:1, 계약금/중도금/잔금 스케줄, 당사자, 임대기간)
- DealParticipant: 거래 참여 직원별 역할/수수료 배분/정산
- 수수료: 매도측(commissionSeller*) + 매수측(commissionBuyer*) 항상 분리
- 공동중개: Deal.isJointBrokerage + partnerBroker* + partnerCommission
- Office.commissionConfig (JSONB): 사장님이 설정하는 기본 수수료 배분 규칙
- ContractStatus: draft → signed → depositPaid → balancePaid → registered → cancelled

### Activity Tracking
- PriceHistory: 매물 가격 변경 이력 자동 추적 (before/after)
- ActivityLog: 모든 비즈니스 데이터 변경 감사 추적 (Prisma Middleware 자동 로깅)
- ActivityLog.actor: "user" | "mcp:Codex" | "system:rule_engine"
- ActivityLog.source: "web" | "mcp" | "system"

### MCP Strategy
- CRM 자체가 MCP Server (NestJS API = MCP 도구)
- AI 내장 안 함 — 외부 Codex/ChatGPT가 MCP로 연결
- 스크래핑 등 로컬 기능은 별도 MCP (Electron 호스팅)

## Dev Commands

```bash
pnpm install           # Install all dependencies
pnpm dev:server        # Start NestJS dev server
pnpm dev:desktop       # Start Electron + Vite HMR
pnpm dev:web           # Start web app (Vite)
pnpm build             # Build all packages
pnpm typecheck         # TypeScript check
pnpm test              # Run tests
pnpm prisma:migrate    # Run Prisma migrations
pnpm prisma:generate   # Generate Prisma client
```

## Current Phase

**Phase 1 (현재)**: NestJS 서버 + CRM MCP Server
- API 설계, CRUD, Auth + 멀티테넌시, WebSocket, 규칙 엔진

## Database (33 tables)

- 법정동 마스터 3: Province, District, Ward
- 멀티테넌시 2: Office, User
- 장소 5: Site, SiteUnitType, Dong, Unit, OfficeSite
- 매물 2: Property, PriceHistory
- 연락처 4: Contact, ContactRelation, PropertyContact, Tenant
- CRM 6: BuyerRequirement, Consultation, Match, Deal, Contract, DealParticipant
- 업무 5: Task, Insight, InsightRule, CalendarEvent, ActivityLog
- 알림 1: Notification
- 네트워크 5: NetworkRoom, NetworkRoomMember, NetworkSharedProperty, NetworkInquiry, NetworkMessage

## Key Pipelines

- CheckStatus: unverified → verified → in_contract → hold → done
- MatchStage: suggested → buyerContacted → viewing → ownerContacted → negotiating → dealCreated → closed
- DealStage: selection → deposit → contract → completed → closed
- TaskSource: manual / system / ai

## Important Notes

- Node.js >= 23.0.0
- Property `isHidden` controls visibility in listing views
- 복잡한 쿼리 (거리 계산, 통계)는 Prisma `$queryRaw` 사용
- Enum 정의는 `packages/shared/src/enums.ts` 참조

## References

- 전체 PRD: @docs/prd.md
- 데이터 구조 상세 (ERD + 필드 설명): @docs/DATA_STRUCTURE.md
- Prisma 스키마 (source of truth): @prisma/schema.prisma
