# 에스테잇플로우 (Estait Flow)

부동산 중개사 전용 SaaS ERP. 기존 estate-crm을 NestJS 기반으로 재구축.

- **제품명(사용자 대면)**: 에스테잇플로우 / 영문·코드 표기: EstaitFlow (법인: Estait Inc., 도메인: estaitt.com)
- **내부 코드네임**: estate-erp — 패키지 스코프(`@estate-erp/*`), repo 폴더, env 변수는 아직 코드네임 유지

## Tech Stack

- **Backend**: NestJS + TypeScript, Prisma, PostgreSQL + PostGIS
- **Cache/Queue**: Redis + BullMQ
- **Realtime**: Socket.io
- **Auth**: Passport.js + JWT
- **Email**: Resend + React Email
- **File Storage**: S3 / Cloudflare R2
- **Desktop**: Electron (React 19 + TanStack + Tailwind v4 + shadcn/ui) — 유일한 프론트엔드
- **Mobile**: React Native (Android only — 전화 오버레이 + 녹음)
- **Build**: Vite + electron-builder
- **Package Manager**: pnpm (monorepo workspaces)

## Monorepo Structure

```
apps/
  server/           # NestJS 백엔드 (src/modules/*)
  desktop/          # Electron (main/ preload/ renderer/)
  mobile/           # React Native (Android only)
  cti-bridge/       # CTI Bridge (32비트)
packages/
  shared/           # 공유 타입, 유틸리티, Enum
  api-client/       # API 클라이언트 (desktop + mobile 공유)
  mcp-server/       # CRM MCP Server 정의
prisma/
  schema.prisma     # DB 스키마 (source of truth)
```

`apps/web`(Vite SPA)은 2026-10-14에 제거했다. desktop과 화면 코드가 이중으로 유지되며 갈라졌기 때문이다. 웹 버전이 다시 필요하면 desktop renderer를 공유 패키지로 분리해 재사용하고, 별도 사본을 만들지 않는다.

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
- User.loginId: 모든 사용자가 직접 생성 (unique)
- User.email: 선택 (nullable)
- User.role: owner / manager / agent
- NestJS @Roles 데코레이터 + Guard 패턴 RBAC

### Site → Dong → Unit → Property → Listing 체인
- Site → Dong → Unit → Property → Listing (모든 건물형: 아파트/오피스텔/빌라/상가/지식산업센터)
- Site → Property → Listing (단독주택/토지)
- 단일 동 건물(빌라, 단일동 오피스텔, 단일동 상가 등)은 `isPlaceholder=true`인 Dong 하나를 자동 생성해 체인을 통일
- Unit.dongId는 NOT NULL — 모든 호실은 반드시 Dong에 속함
- UI는 `Dong.isPlaceholder === true`면 동 선택 UI를 숨기고 바로 호실 그리드 표시
- Property: 사무소가 관리하는 부동산 단위 (siteId, unitId, memo, PropertyContact/Tenant 연결)
- Listing: 매물 거래 정보 (propertyId FK, transactionType, price, isPaused)
- Property 1:N Listing (같은 호실을 매매+전세로 동시에 내놓는 경우)
- SiteUnitType: 평형 카탈로그 (84A, 59B 등), 네이버 pyeongList 1:1 대응
- Unit.floor + Unit.lineNo → 동별 호실 그리드 (네이버 스타일)

### Deal → Contract → DealParticipant
- Deal: 거래 진행 관리 (listingId FK, 파이프라인 + 수수료 총괄)
- Contract: 계약서 상세 (Deal 1:1, 계약금/중도금/잔금 스케줄, 당사자, 임대기간)
- DealParticipant: 거래 참여 직원별 역할/수수료 배분/정산
- 수수료: 매도측(commissionSeller*) + 매수측(commissionBuyer*) 항상 분리
- 공동중개: Deal.isJointBrokerage + partnerBroker* + partnerCommission
- Office.commissionConfig (JSONB): 사장님이 설정하는 기본 수수료 배분 규칙
- ContractStatus: draft → signed → depositPaid → balancePaid → registered → cancelled

### Activity Tracking
- PriceHistory: Listing 가격 변경 이력 자동 추적 (listingId FK, before/after)
- ActivityLog: 모든 비즈니스 데이터 변경 감사 추적 (Prisma Middleware 자동 로깅)
- ActivityLog.actor: "user" | "mcp:claude" | "system:rule_engine"
- ActivityLog.source: "web" | "mcp" | "system"

### MCP Strategy
- CRM 자체가 MCP Server (NestJS API = MCP 도구)
- AI 내장 안 함 — 외부 Claude/ChatGPT가 MCP로 연결
- CP 스크래핑·브라우저 자동화는 독립 Skill이 담당
- CP 자격증명은 Skill 전용 로컬 `config.js`에 저장하며 Electron은 보관하거나 로컬 인증 MCP를 호스팅하지 않음
- 광고 자동화의 서버 상태는 일반 `Task(category=advertisement)`만 사용하며 MCP `claim_task`로 중복 실행을 막음
- CP 실행 단계·재시도·검증은 `estate-erp-ad-task-runner` 로컬 SQLite가 소유하고 서버는 agent를 대기·호출·wakeup하지 않음
- 네이버 수집 범위(`siteId ↔ complexNo`)는 `naver-complex-collector` 로컬 SQLite가 소유하며 ERP에는 완전한 관측 결과만 저장

## Dev Commands

```bash
pnpm install           # Install all dependencies
pnpm dev:server        # Start NestJS dev server
pnpm dev:desktop       # Start Electron + Vite HMR
pnpm build             # Build all packages
pnpm typecheck         # TypeScript check
pnpm test              # Run tests
pnpm prisma:migrate    # Run Prisma migrations
pnpm prisma:generate   # Generate Prisma client
```

## Current Phase

**Phase 1 (현재)**: NestJS 서버 + CRM MCP Server
- API 설계, CRUD, Auth + 멀티테넌시, WebSocket, 규칙 엔진

## Database (39 tables)

- 법정동 마스터 3: Province, District, Ward
- 멀티테넌시 2: Office, User
- 장소 5: Site, SiteUnitType, Dong, Unit, OfficeSite
- 매물 3: Property, Listing, PriceHistory
- 연락처 4: Contact, ContactRelation, PropertyContact, Tenant
- CRM 6: BuyerRequirement, Consultation, Match, Deal, Contract, DealParticipant
- 업무/AI 5: Task, Rule, Proposal, CalendarEvent, ActivityLog
- 알림 1: Notification
- 네트워크 5: NetworkRoom, NetworkRoomMember, NetworkSharedProperty, NetworkInquiry, NetworkMessage
- 외부 매물 2: ExternalListingGroup, ExternalListing (광고노트, 사무소별 크롤링 데이터)
- 업체 3: ServiceCategory, ServiceVendor, VendorContact

## Key Pipelines

- CheckStatus (Listing): unverified → verified → in_contract → hold → done
- MatchStage: suggested → buyerInterested → viewingConfirmed → viewing → negotiating → dealCreated → closed
- DealStage: preparing → preContract(선택) → contracted → settling → completed → closed
- TaskSource: manual / system / ai

## Important Notes

- Node.js >= 23.0.0
- UI 개발 / 레이아웃 확인은 항상 Playwright(Chromium)로 먼저 확인한다 (`apps/desktop`도 Vite 렌더러는 브라우저로 확인 가능)
- Electron은 IPC, preload, 시스템 트레이, 네이티브 메뉴, CTI 등 Electron 전용 동작 검증이 필요할 때만 확인한다
- 복잡한 쿼리 (거리 계산, 통계)는 Prisma `$queryRaw` 사용
- Enum 정의는 `packages/shared/src/enums.ts` 참조

## References

- 전체 PRD: @docs/prd.md
- 데이터 구조 상세 (ERD + 필드 설명): @docs/DATA_STRUCTURE.md
- Prisma 스키마 (source of truth): @prisma/schema.prisma
