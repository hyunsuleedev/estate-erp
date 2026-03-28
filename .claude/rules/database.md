---
paths:
  - "prisma/**"
  - "apps/server/src/modules/**"
  - "packages/shared/**"
---

# Database Rules

## 테이블 구조 (33개)

### 법정동 코드 마스터 (공공데이터 import, 읽기 전용)
- `provinces` → `districts` → `wards` (시도 → 시군구 → 읍면동)
- 코드 기반 PK: Province("11"), District("11740"), Ward("1174010100")
- 데이터 소스: 국토교통부 법정동코드 (data.go.kr)

### 멀티테넌시
- `offices` — 모든 데이터의 최상위. 모든 테이블에 `office_id` FK 필수.

### 멀티테넌시 상세
- `offices` — code 필드 (자동 생성 "GD7291" 등, 직원 loginId 접두사)
- `users` — loginId (owner: 이메일, 직원: "GD7291-0001"), role (owner/manager/agent)

### 장소/매물 체인
- `sites` → `dongs` → `units` → `properties`
- `site_unit_types` — 평형 카탈로그 (84A, 59B 등), 네이버 pyeongList 1:1 대응
- sites: `is_public` + `office_id` nullable — 공공데이터(null, true) vs 사무소 비공개(UUID, false)
- sites: 가시성 쿼리 패턴: `WHERE is_public = true OR office_id = ?`
- sites: `ward_code` FK → Ward (법정동 코드 참조, 자유텍스트 아님)
- sites: 도로명 + 지번 이중 주소, PostGIS geometry(Point, 5179)
- sites: 자체 UUID PK + 외부 매핑 코드 (kapt_complex_code, naver_complex_code, kb_complex_code)
- sites: 타입별 가변 속성은 `metadata` JSONB (parkingCount, heatingType 등)
- dongs/units: `office_id` nullable (공공데이터 공유)
- units: floor + lineNo → 동별 호실 그리드 (네이버 스타일), siteUnitTypeId FK
- sites: `is_locked` — 공공데이터 수정 방지
- `office_sites` — 사무소별 관리 단지 즐겨찾기 (Office ↔ Site M:N, 공공+비공개 통합)
- `price_histories` — 매물 가격 변경 이력 자동 추적 (before/after 값)

### 감사 추적
- `activity_logs` — 모든 비즈니스 데이터 변경 자동 로깅 (Prisma Middleware)
- actor: "user" | "mcp:claude" | "system:rule_engine", source: "web" | "mcp" | "system"
- userId FK (nullable) — 직원 작업이면 설정
- changes JSONB — 변경 전/후 값
- 추적 대상: 핵심 10개 (Property, Contact, PropertyContact, Tenant, BuyerRequirement, Match, Deal, Consultation, Task, NetworkSharedProperty)

### 매물 유형별 연결
- 아파트/오피스텔: site → dong → unit → property (풀 체인)
- 빌라/다세대: site → unit → property (dong 생략)
- 단독주택/토지: site → property (unit/dong 없음)

### 연락처 체계
- `contacts` — 모든 사람 (소유주/매수자/세입자 구분 없이)
- `contact_relations` — 사람 간 관계 (parent, spouse, child, sibling, lawyer, tax_agent, other)
- `property_contacts` — 매물-연락처 역할 (owner, co_owner, representative, lawyer, tax_agent)
- `tenants` — 세입자 상세 (보증금/월세/계약기간)

### 공동 중개망 (킬러 피쳐)
- `network_rooms` — 중개방 (public: 공개방, private: 비공개방). 방장 승인제.
- `network_room_members` — 방 참여자 (admin/member, pending/approved/rejected/left)
- `network_shared_properties` — 공유 매물. 기존 properties에서 선택, 필드별 마스킹(show_* boolean). 매물 추적/뺏기 방지.
- `network_inquiries` — 공유 매물 문의 (pending → accepted/rejected/expired)
- `network_messages` — 중개방 채팅 (매물 카드 첨부 가능)

### 거래/계약/정산
- `deals` — 거래 관리 (수수료 매도측/매수측 분리, 공동중개 필드)
- `contracts` — 계약 상세 (Deal 1:1, 당사자, 금액 스케줄, 임대기간, 첨부파일)
- `deal_participants` — 거래 참여 직원 (역할/side/수수료 배분/정산)
- Office.commissionConfig JSONB — 사장님이 설정하는 기본 수수료 배분 규칙
- `notifications` — 인앱 알림 (WebSocket push + DB 저장)

### 핵심 Enums
- `SiteType`: apartment, officetel, villa, house, commercial, land, living_accommodation
- `CheckStatus`: unverified → verified → in_contract → hold → done
- `MatchStage`: suggested → buyerContacted → viewing → ownerContacted → negotiating → dealCreated → closed
- `DealStage`: selection → deposit → contract → completed → closed
- `ContractStatus`: draft → signed → depositPaid → balancePaid → registered → cancelled
- `DealParticipantRole`: listing_agent, buying_agent, dual_agent, manager, assistant, closer
- `DealParticipantSide`: seller, buyer, both
- `TaskSource`: manual, system, ai
- `CalendarEventType`: viewing, contract, meeting, task, general

## Prisma 규칙

- Model명: PascalCase (`BuyerRequirement`)
- 필드명: camelCase → `@map("snake_case")`로 DB 컬럼 매핑
- 테이블명: `@@map("snake_case_plural")`
- 가격 필드: `Int` 타입, 만원 단위
- 면적 필드: `Decimal` 타입, m² 단위
- 새 테이블 추가 시 반드시 `officeId` 포함 (마스터 테이블 제외)
- 공간 쿼리(반경 검색 등)는 PostGIS + `$queryRaw` 사용
- sites.metadata JSONB 접근도 `$queryRaw` 또는 Prisma JsonFilter 사용
