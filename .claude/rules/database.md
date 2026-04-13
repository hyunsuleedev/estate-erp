---
paths:
  - "prisma/**"
  - "apps/server/src/modules/**"
  - "packages/shared/**"
---

# Database Rules

## 테이블 구조 (35개)

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
- 건물형 전체 (아파트/오피스텔/빌라/다세대/상가/지식산업센터): site → dong → unit → property
- 단독주택/토지: site → property (unit/dong 없음)
- 단일 동 건물은 `dongs.is_placeholder = true`인 Dong 하나 자동 생성 → 체인 항상 통일
- `units.dong_id`는 NOT NULL (단일 동은 placeholder Dong 참조)

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

### 외부 시장 매물 (광고노트)
- `external_listing_groups` — 호실 단위 외부 매물 그룹 (electron-estate HouseProperty 대응). 사용자가 확인한 unitId·memo·inferredHo를 기억. 크롤러가 덮어쓰지 못함.
- `external_listings` — 개별 외부 매물 1건 (electron-estate Offer 대응). 네이버 articleNo 기준 unique `[officeId, source, articleNo]`.
- **멀티테넌시**: 모든 외부 매물은 `office_id` NOT NULL. 사무소가 자기 책임으로 수집·입력한 데이터를 자기 네임스페이스에만 저장.
- **법적 회피**: 서버는 크롤링하지 않음. 입력 경로는 (a) Electron 로컬 크롤러, (b) MCP 도구 `external_listing.create`, (c) 수동 UI — 모두 동일 API 엔드포인트.
- **매칭 로직 (electron-estate 방식)**:
  1. 새 `articleNo`가 DB에 있으면 해당 그룹에 병합
  2. 없으면 네이버 `sameAddr` 그룹(`representativeArticleNo` + 묶인 매물들) 내 다른 articleNo 중 DB에 있는 것 찾아 그룹 병합
  3. 둘 다 없으면 새 그룹 생성 (`unitId = null`, 사용자가 UI에서 수동 링크)
- **호수 추정**: Phase 1에서는 자동 추정 없음. 사용자가 UI에서 `inferredHo` 텍스트 입력 또는 `unitId` 수동 링크.
- **ActivityLog 제외**: 외부 매물은 감사 추적 대상 아님 (크롤러 upsert로 activity_logs 오염 방지).
- Group → Listing 1:N, Group의 `main_external_listing_id`로 대표 매물 지정 (네이버 representative 대응).

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
