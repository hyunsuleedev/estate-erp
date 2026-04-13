# AI Employee — Phase 1 Architecture & Spec

Estate ERP의 "AI 직원" 기능 Phase 1 구현 스펙.

- 작성일: 2026-04-11 (초안)
- 갱신일: 2026-04-11 (Checker → Rule 재정의, ListingAdChannel 제거, MCP-Proposal 통합 반영)
- 상태: Phase 1 스캐폴딩 진행 중
- 관련 문서:
  - [prd.md](./prd.md) — 제품 범위
  - [ARCHITECTURE.md](./ARCHITECTURE.md) — 시스템 토폴로지
  - [DATA_STRUCTURE.md](./DATA_STRUCTURE.md) — 데이터 모델 원칙
  - [AI_OPERATIONS.md](./AI_OPERATIONS.md) — 1차 설계 메모 (이 문서가 그 연장선)
  - [agentic-ai-scenarios.pdf](./agentic-ai-scenarios.pdf) — 26 시나리오 발굴

---

## 0. TL;DR

- **"AI 직원"** = 여러 독립 **Rule**이 스케줄 또는 이벤트 트리거로 돌며 통합 `Proposal` 테이블에 제안을 쓰고, 사용자는 단일 "AI 제안"에서 전부 검토한다.
- "Rule" 이라는 이름은 **조건 기반(특정 값이 되거나)** + **이벤트 기반(무슨 일이 생겼을 때)** 둘 다 포괄한다. "Checker" 라는 이전 이름은 주기적 검사만 연상시켜 부적절했다.
- **Phase 1은 LLM 없이** 법 기반 Rule 2개(광고 내림, 임대차 만기) + 승인 루프 + inbox UI만 만든다. LLM을 쓰는 Rule은 Phase 2로 분리.
- "AI 직원" 느낌은 **단일 inbox UI의 착시**에서 나온다. 실제 구현은 독립적인 작은 서비스들의 조합이며, 오케스트레이션 프레임워크(paperclip 같은 것)는 쓰지 않는다.
- **MCP와 Proposal은 같은 승인 큐를 공유**한다. 외부 AI가 쓰기 도구를 호출하면 권한 설정에 따라 바로 실행되거나 Proposal로 변환된다. MCP 권한은 사용자 레벨(`User.mcpPermissions`)에 귀속되며 역할별 기본값(`Office.mcpPermissionDefaults`)이 fallback 이다.

---

## 1. 제품 프레이밍

### 1.1 무엇을 만드는가

사장님·직원이 출근해서 ERP를 열면, **"AI 제안"** 에 밤사이 감지된 제안들이 쌓여 있다.

```
📬 AI 제안                                  [12]

🔴 긴급 (3)
├ 🏠 래미안 101-1503 네이버 광고 내림 필요 (D+0 · 과태료 리스크)
│  이유: 14:30 계약 체결 후 2시간 경과. 공인중개사법상 즉시 삭제 의무.
│  [승인] [거부] [세부]
├ 📋 김철수 전세 계약 D-0 등기부 재발급 필요
└ ⚠️ 고덕자이 102-1405 이중매매 의심 (inform only)

🟡 일반 (6)
├ 📞 박영희 임대차 D-60 갱신 거절 통지 Task 생성 제안
├ 📞 이민수 임대차 D-90 세입자 갱신요구권 발동 알림
└ ...

🔵 참고 (3)
└ ...
```

사용자는 승인/거부/만료만 처리한다. AI 직원이 실제로는 하나의 프로세스인지 여러 cron 잡인지 구분하지 않는다. **UI가 하나이기 때문에 "직원 한 명"으로 느낀다.**

### 1.2 무엇을 만들지 않는가

- ❌ 24시간 돌아가는 LLM 에이전트 프로세스
- ❌ 자체 AI 챗봇 UI (대화형 AI는 MCP를 통해 사용자 외부 AI로)
- ❌ 멀티 에이전트 오케스트레이션 프레임워크
- ❌ Org chart, hire/fire, goal alignment 같은 paperclip식 회사 운영 시뮬레이션
- ❌ Phase 1에서는 LLM 호출 전혀 없음 (Phase 2부터 도입)

### 1.3 MCP Server 전략과의 관계

MCP와 AI Employee는 **대체 관계가 아니라 보완 관계**다.

| 구분 | AI Employee (Rule) | MCP Server |
|---|---|---|
| 방향 | Proactive (AI가 먼저 감지) | Reactive (사용자가 먼저 질문) |
| 트리거 | Cron, 이벤트 | 사용자의 외부 AI 호출 |
| 출력 | Proposal → inbox | 도구 반환값 |
| 실행 위치 | NestJS 내부 | 외부 Claude/ChatGPT |

### 1.4 MCP-Proposal 통합 (Phase 2)

MCP 쓰기 도구는 **권한에 따라 동작이 달라지는 투명 프록시**로 구현된다. 같은 도구 시그니처지만 내부에서:

- **`execute`**: 바로 실행, 결과 반환
- **`propose`**: 자동으로 `Proposal` 생성, `{ status: 'proposal_created', proposalId }` 반환
- **`read`**: 쓰기 거부

외부 AI 입장에서는 "신입 직원이 상사 승인 기다리는" 것과 같은 UX가 자연스럽게 구현된다. 권한 해석 순서:

```
Token → User 조회
  → User.mcpPermissions[category] 있으면 그걸로
  → 없으면 Office.mcpPermissionDefaults[User.role][category]
  → 그것도 없으면 하드코딩 안전 기본값 (대부분 'propose' 또는 'read')
```

**Phase 1 에서의 약속**:
- `Proposal.generatedBy`에 `mcp:{tool_name}` 접두사 허용
- `Proposal.createdByUserId` 필드를 Phase 1 스키마에 포함 (MCP 제안은 요청 사용자 기록, Rule 제안은 null)
- `User.mcpPermissions`, `Office.mcpPermissionDefaults` 필드를 Phase 1 스키마에 포함 (빈 JSON, Phase 2 활성화)
- 인터페이스 변경 없이 Phase 2에서 통합 가능하도록 보장

**Phase 2 에서 구현**:
- Permission-Aware MCP Tool 미들웨어/데코레이터
- `MCPAccessToken` 테이블 (사용자당 여러 토큰 발급)
- Inbox UI 출처 구분 (Rule vs MCP vs Event)
- `get_proposal_status`, `list_my_proposals` 조회 도구

---

## 2. 핵심 개념

### 2.1 Rule

> 하나의 감지 업무를 담당하는 독립 NestJS 서비스.

- **트리거 방식 두 가지** (Phase 1부터 인터페이스에 포함):
  - `schedule`: 크론 표현식 (`@Cron` 또는 `SchedulerRegistry` 동적 등록)
  - `event`: `EventEmitter2` 이벤트 구독 (`listing.price.changed` 등)
- **규칙 출처 두 가지**:
  - 법·정책 기반 (`isSystem=true`): 규칙이 법령이나 실무 표준. 임계값이 코드 상수. 사무소가 **편집 불가**, 하지만 `isActive` 토글로 on/off는 가능.
  - 임계값 기반 (`isSystem=false`): 규칙이 사무소 정책. 임계값은 DB `Rule.config` JSONB 에서 로드. 사무소가 설정 UI에서 직접 조정.
- Phase 1의 두 Rule(`AdTakedownRule`, `LeaseExpiryRule`)은 모두 **법 기반 + 스케줄 기반**.
- Phase 2에 임계값 기반 Rule(예: `StaleListingRule`, `PriceDropAlertRule`)과 이벤트 기반 Rule(예: `PriceChangeReactorRule`)이 동일 인터페이스로 추가된다.

### 2.2 Proposal

> Rule/MCP/Event가 생성하는 "이렇게 했으면 좋겠어요" 제안.

- 통합 테이블 하나. 모든 생성자가 여기에 쓴다
- 상태 머신: `pending → approved | rejected | expired → executed | failed | auto_resolved`
- `trustTier`에 따라 즉시 실행되거나 승인 대기
- 중복 방지(`dedupeKey`)와 만료(`expiresAt`) 필수

### 2.3 Trust Tier

> 승인 피로(approval fatigue)를 막기 위한 3단계 신뢰 계층.

| Tier | 의미 | UX |
|---|---|---|
| `auto` | 낮은 리스크, 되돌릴 수 있음 | 바로 실행 후 사후 로그만 표시 |
| `approval_required` | 외부 영향 또는 되돌리기 어려움 | AI 제안에 대기, 사람이 승인 |
| `inform_only` | 법적/인간관계 판단 필요 | AI는 알리기만, 사람이 직접 행동 |

**Phase 1 기본값은 전부 `approval_required`부터 시작**한다. 운영하면서 안정적인 타입만 사장님이 `auto`로 승격시키는 방식. 반대로 `auto`로 시작하면 사고 난다.

`Office.agentTrustConfig` JSONB 가 제안 타입별 오버라이드를 담는다. 예:
```json
{
  "ad_takedown": "approval_required",
  "lease_renewal_notice": "auto"
}
```

### 2.4 Executor

> 승인된 Proposal의 `actionPayload`를 실제 도메인 서비스 호출로 번역하는 디스패처.

- Phase 1에서는 소수의 `actionType`만 지원 (`create_task`, `mark_ad_takedown`)
- 새 actionType 추가는 Executor의 switch-case에 한 줄 추가
- 실행 실패 시 Proposal을 `failed`로 기록하고 사람이 재시도 결정

**AssignmentService (Task 할당 추상화)**

`create_task` 액션이 Task를 만들기 직전에 `AssignmentService.pickAssignee()` 를 호출한다. Rule은 "언제, 왜, 어떤 Task" 를 결정하고, Assignment는 "누구에게" 를 결정한다. 분리된 이유는 **"누구에게" 는 맥락 판단이 필요해서 SQL만으로 한계**가 있기 때문이다.

- **Phase 1 (휴리스틱)**: 우선순위 기반 규칙으로 결정
  1. Rule/MCP가 명시한 `suggestedAssigneeId` 가 있으면 그걸로
  2. `listingId` 가 있으면 해당 매물의 `PropertyContact.isPrimary=true` 담당자
  3. `buyerReqId` 가 있으면 `BuyerRequirement.assignedToId`
  4. 그래도 없으면 Office owner
- **Phase 2 (LLM 판단)**: 같은 인터페이스 유지, 내부에 LLM 경로 추가. 고려 요소:
  - 오늘 출근자 (`CalendarEvent`, leave status)
  - 각 직원의 현재 open Task 수
  - 해당 매물/단지의 과거 담당 이력
  - 분배 형평성 및 경력/업무 범위
- 스키마 변경 없음. `Proposal.actionPayload` 에 `suggestedAssigneeId`, `assignmentHint` 같은 힌트 필드를 넣을 수 있다.

이 추상화 덕분에 "Rule 은 조건 감지 전용" 이라는 역할 분담이 깨끗해진다.

### 2.5 Rule 두 종류의 차이 — 법 기반 vs 임계값 기반

Phase 1 구현 결정에 영향을 주므로 먼저 구분한다.

**법·정책 기반 Rule**
- 규칙이 공인중개사법·주임법 등 외부 법령에서 옴
- 임계값이 사무소마다 달라질 수 없음 → 코드 상수
- `isSystem = true`: 시스템이 자동으로 모든 사무소에 seed
- `config` 는 빈 객체 또는 메타 정보만
- 예: `AdTakedownRule` (`GRACE_HOURS = 2`), `LeaseExpiryRule` (`180/90/60/30`)

**임계값 기반 Rule**
- 규칙이 사무소의 운영 정책
- 사무소마다 다른 임계값 → `Rule.config` JSONB 에 저장
- `isSystem = false`: 사무소가 직접 생성/수정/삭제
- `evaluate()` 내부에서 `ctx.ruleConfig` 에서 읽어서 사용
- 예: `StaleListingRule` (`{ daysSinceRegister: 14 }`), `PriceDropAlertRule` (`{ dropPercent: 5 }`) — **Phase 2**

Phase 1 의 두 Rule은 모두 **법 기반 + 스케줄 기반**이다. `Rule.config` 를 읽지 않는다. 그러나 `Rule` 테이블에 `isSystem=true` 레코드로 seed 하여 사무소가 inbox 설정 화면에서 on/off 토글 할 수 있게 한다.

---

## 3. 스키마 스펙

### 3.1 Proposal 테이블 (신규, 구현됨)

```prisma
model Proposal {
  id        String @id @default(uuid()) @db.Uuid
  officeId  String @map("office_id") @db.Uuid

  type        String   // ad_takedown / lease_renewal_notice / ...
  title       String
  description String
  reasoning   String?

  status    String @default("pending")
                   // pending | approved | rejected | expired | executed | failed | auto_resolved
  priority  String @default("normal")  // urgent | normal | low
  trustTier String @map("trust_tier")  // auto | approval_required | inform_only

  actionType    String? @map("action_type")
  actionPayload Json?   @map("action_payload") @db.JsonB

  generatedBy String  @map("generated_by")
                      // "rule:ad_takedown:v1" | "mcp:update_listing_price" | "event:..."
  dedupeKey   String? @map("dedupe_key")

  // Phase 2 MCP 통합용
  createdByUserId String? @map("created_by_user_id") @db.Uuid

  // 컨텍스트 링크
  listingId  String? @map("listing_id") @db.Uuid
  propertyId String? @map("property_id") @db.Uuid
  contactId  String? @map("contact_id") @db.Uuid
  dealId     String? @map("deal_id") @db.Uuid
  contractId String? @map("contract_id") @db.Uuid
  tenantId   String? @map("tenant_id") @db.Uuid

  // 라이프사이클
  proposedAt     DateTime  @default(now()) @map("proposed_at")
  expiresAt      DateTime? @map("expires_at")
  decidedAt      DateTime? @map("decided_at")
  decidedBy      String?   @map("decided_by") @db.Uuid
  decisionNote   String?   @map("decision_note")
  executedAt     DateTime? @map("executed_at")
  executionError String?   @map("execution_error")

  // Relations (office/listing/property/contact/deal/contract/tenant)

  @@index([officeId, status, priority, proposedAt])
  @@index([officeId, type, status])
  @@index([officeId, dedupeKey])
  @@map("proposals")
}
```

### 3.2 Rule 테이블 (신규, `InsightRule` 대체, 구현됨)

```prisma
model Rule {
  id          String  @id @default(uuid()) @db.Uuid
  officeId    String  @map("office_id") @db.Uuid

  name        String  // "ad_takedown", "lease_expiry" — 코드 레벨 식별자
  displayName String  @map("display_name")
  description String?

  triggerType String  @map("trigger_type")  // schedule | event
  schedule    String?                         // cron expression
  eventName   String? @map("event_name")      // EventEmitter event name

  config      Json    @default("{}") @db.JsonB

  isActive    Boolean @default(true) @map("is_active")
  isSystem    Boolean @default(false) @map("is_system")

  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@unique([officeId, name])
  @@index([officeId, isActive, triggerType])
  @@map("rules")
}
```

**`InsightRule` 테이블은 폐기.** 그 자리를 `Rule` 테이블이 대체한다. `Insight` 테이블은 그대로 유지 (인사이트 알림 개념은 계속 사용).

### 3.3 Office 필드 추가 (구현됨)

```prisma
model Office {
  // ... 기존 필드

  agentEnabled Boolean @default(true) @map("agent_enabled")

  // 제안 타입별 trustTier 오버라이드
  agentTrustConfig Json @default("{}") @map("agent_trust_config") @db.JsonB

  // MCP 권한 역할별 기본값 (Phase 2 사용)
  mcpPermissionDefaults Json @default("{}") @map("mcp_permission_defaults") @db.JsonB
}
```

### 3.4 User 필드 추가 (구현됨)

```prisma
model User {
  // ... 기존 필드

  // MCP 권한 사용자별 오버라이드 (Phase 2 사용)
  mcpPermissions Json? @map("mcp_permissions") @db.JsonB
}
```

### 3.5 Listing 필드 추가 (구현됨)

```prisma
model Listing {
  // ... 기존 필드

  // checkStatus 마지막 전이 시각 — AdTakedownRule 의 데드라인 계산용
  checkStatusChangedAt DateTime? @map("check_status_changed_at")
}
```

Prisma middleware 로 `checkStatus` 필드가 변경될 때 자동 갱신한다 (Phase 1 다음 단계 작업).

### 3.6 ListingAdChannel — 범위에서 제외

원래 초안에서 `ListingAdChannel` 테이블을 두려 했으나, Phase 1에서 **제거** 한다. 대신 `AdTakedownRule` 은 기존 `ExternalListing` 테이블을 재사용한다:

- 사무소는 이미 electron-estate 크롤러로 네이버 매물을 `ExternalListingGroup` / `ExternalListing` 에 적재 중
- 매칭 키: `external_listing_groups.unitId = listings.property → unit` 의 `unitId`
- 감지 쿼리: "우리 Listing이 `in_contract` 또는 `done` 인데, 같은 호실 `ExternalListing` 에 `is_active = true` 가 남아있는가"

이 방식은 인프라가 이미 존재한다는 점에서 훨씬 낮은 비용으로 킬러 기능을 만들 수 있다. 단점은 "우리가 실제로 올린 광고"와 "다른 사무소가 올린 광고"가 뒤섞이는 구분이 약해진다는 것이지만, `ExternalListing.officeId` 로 자기 사무소 귀속 데이터만 보면 된다.

**추가 분별 필요 시 Phase 2에 `ListingAdChannel` 을 보강용으로 도입**한다. Phase 1 에서는 의도적으로 생략한다.

### 3.7 ActivityLog 확장

기존 `ActivityLog` 테이블의 `actor` 필드에 새 값 허용:
- `"agent:rule:ad_takedown_v1"`
- `"agent:executor"`
- `"agent:mcp:{tool_name}"` (Phase 2)

`entityType` 에 `Proposal` 추가. 모든 Proposal 생성/승인/거부/실행은 자동 로깅.

---

## 4. 모듈 구조 (구현됨)

```
apps/server/src/modules/agent/
├── agent.module.ts                     # NestJS 모듈 진입점, RULE_REGISTRY 주입
│
├── proposal/
│   ├── proposal.service.ts             # CRUD + dedupe + 만료
│   ├── proposal.controller.ts          # REST: list/approve/reject
│   └── proposal.types.ts               # 상태·우선순위 타입
│
├── executor/
│   └── executor.service.ts             # actionType → 도메인 서비스 디스패처
│
└── rule/
    ├── rule.types.ts                   # Rule, RuleContext, ProposalDraft, RULE_REGISTRY
    ├── rule-engine.service.ts          # 모든 Rule 주입, runRule() 경로
    └── implementations/
        ├── ad-takedown.rule.ts         # 법 기반 + 스케줄 (evaluate() 스텁)
        └── lease-expiry.rule.ts        # 법 기반 + 스케줄 (evaluate() 스텁)
```

**새 Rule 추가 = `implementations/`에 파일 하나 추가 + `agent.module.ts`의 `RULE_REGISTRY` 배열에 등록.** 끝.

---

## 5. 인터페이스 스펙

### 5.1 Rule 인터페이스 (구현됨)

`apps/server/src/modules/agent/rule/rule.types.ts` 참조. 핵심:

```typescript
export interface Rule {
  readonly name: string;
  readonly version: string;
  readonly displayName: string;
  readonly description?: string;
  readonly isSystem: boolean;
  readonly defaultActive: boolean;

  readonly triggerType: 'schedule' | 'event';
  readonly schedule?: string;
  readonly eventName?: string;

  readonly defaultConfig?: Record<string, unknown>;

  evaluate(ctx: RuleContext): Promise<ProposalDraft[]>;
}
```

**호환성 원칙**: `RuleContext` 는 필드 추가만, 기존 필드 변경 금지. Phase 2 에 LLM 헬퍼 등 새 필드를 추가해도 기존 Rule 은 건드리지 않는다.

### 5.2 ProposalService (구현됨)

`apps/server/src/modules/agent/proposal/proposal.service.ts` 참조. 주요 메서드:

- `createMany(officeId, drafts, generatedBy)` — dedupe + trustTier 해석 + 자동 승인
- `list(officeId, opts)` — 상태/우선순위/타입 필터
- `getById(id, officeId)`
- `approve(id, officeId, userId, note?)`
- `reject(id, officeId, userId, note)`
- `expireStale()` — 만료 cron
- `resolveTrustTier(officeId, proposalType, fallback)` — Office.agentTrustConfig 해석

### 5.3 ExecutorService (스텁)

`apps/server/src/modules/agent/executor/executor.service.ts` 는 현재 껍데기. 다음 단계에서 다음 actionType 구현:

- `create_task` — `Task` 생성
- `mark_ad_takedown` — `ExternalListing` 에 takedown 요구 상태 기록(어느 테이블에 어떻게 저장할지는 Phase 1 구현 시 결정)

### 5.4 REST API

**Proposal (구현됨)**
```
GET    /proposals?status=pending&priority=urgent&type=ad_takedown
GET    /proposals/:id
POST   /proposals/:id/approve       body: { note?: string }
POST   /proposals/:id/reject        body: { note: string }
```

**Rule (다음 단계 구현)**
```
GET    /agent/rules                    Rule 목록 + 규칙별 최근 통계
                                       반환: [{ id, name, displayName, triggerType,
                                               schedule, isSystem, isActive,
                                               config, stats: { last7dCreated,
                                               last7dApproved, last7dRejected,
                                               rejectRate } }]
GET    /agent/rules/:id                Rule 상세 + 최근 Proposal 샘플
PATCH  /agent/rules/:id                body: { isActive?: boolean, config?: object }
                                       isSystem=true 인 규칙은 isActive 만 허용,
                                       config 변경은 403
PATCH  /agent/settings/global          body: { agentEnabled: boolean }
                                       Office.agentEnabled 토글
```

모든 엔드포인트는 JWT 인증 + `officeId` 스코프 자동 필터. Proposal 구현 파일은 `proposal.controller.ts`. Rule 관련은 `rule/rule.controller.ts` (다음 단계 작성 예정).

---

## 6. Phase 1 Rule 구현 스펙

### 6.1 AdTakedownRule

**목적**: 거래 완료된 매물의 외부 광고(네이버 등)가 아직 살아있는지 감지.

**트리거**: `schedule`, cron `0 */30 * * * *` (30분마다)

**쿼리 개요 (다음 단계에서 구현)**:
```sql
SELECT
  l.id as listing_id,
  l.property_id,
  p.unit_id,
  el.id as external_listing_id,
  el.cp_name,
  el.article_no,
  EXTRACT(EPOCH FROM (NOW() - l.check_status_changed_at)) / 3600 AS hours_elapsed
FROM listings l
JOIN properties p ON p.id = l.property_id
JOIN external_listing_groups g ON g.unit_id = p.unit_id
                               AND g.office_id = l.office_id
JOIN external_listings el ON el.group_id = g.id
                         AND el.is_active = true
                         AND el.office_id = l.office_id
WHERE l.office_id = $1
  AND l.check_status IN ('in_contract', 'done')
  AND l.check_status_changed_at < NOW() - interval '2 hours'
```

**Proposal 생성**:
- `type`: `ad_takedown`
- `priority`: `hoursElapsed > 24` 이면 `urgent`, 아니면 `normal`
- `trustTier`: `ctx.trustTierFor('ad_takedown', 'approval_required')`
- `actionType`: `mark_ad_takedown`
- `actionPayload`: `{ externalListingId }`
- `dedupeKey`: `ad_takedown:${externalListingId}`
- `expiresInHours`: 48
- `reasoning`: `'공인중개사법 제18조의2: 거래 완료 매물은 즉시 광고 삭제 의무. 과태료 최대 500만원.'`

**Phase 1 의존성**:
1. `Listing.checkStatusChangedAt` 필드 ✅ (스키마 완료)
2. Prisma middleware 로 `checkStatus` 전이 시 `checkStatusChangedAt` 자동 갱신 (다음 단계)
3. `ExternalListing` 데이터가 이미 쌓여 있어야 함 (이미 운영 중)

### 6.2 LeaseExpiryRule

**목적**: 임대차 만기 전 단계별 알림 생성.

**트리거**: `schedule`, cron `0 0 6 * * *` (매일 06:00)

**단계별 Proposal**:
- D-180 ~ D-90: `type: lease_renewal_prepare`, `priority: low`
  - actionType: `create_task`, due D-90
- D-90 ~ D-60: `type: lease_renewal_notice`, `priority: normal`
  - actionType: `create_task`, due D-60
- D-60 ~ D-30: `type: lease_rejection_deadline`, `priority: urgent`
  - actionType: `create_task`, due D-30
- D-30 ~ D-0: `type: lease_contract_prep`, `priority: normal`
  - actionType: `create_task`, due contractEnd

**dedupeKey**: `lease:${tenantId}:${stage}` — 같은 세입자의 같은 단계는 한 번만

**trustTier**: 기본 `auto` (Task 생성은 되돌리기 쉬움)

---

## 7. UI 스펙 (Electron, 다음 단계)

### 7.1 사이드바 — "AI 운영" 그룹

기존 사이드바에 **"AI 운영"** 그룹 추가 (`apps/desktop/src/renderer/components/layout/app-sidebar.tsx`). 하위 메뉴 4개:

```
AI 운영                                     ← 그룹 헤더 (아이콘: Bot)
├── 📬 AI 제안      /agent/proposals    (Proposal 페이지)        [배지: urgent 수]
├── 📋 규칙 관리        /agent/rules        (Rule 리스트 페이지)
├── 📜 실행 이력        /agent/history      (처리된 Proposal 조회)
└── ⚙️  설정            /agent/settings     (trustConfig, 전체 on/off)
```

- "AI 제안" 옆에 배지: `pending` + `urgent` 카운트 (빨간색). 사이드바 `sidebar-badges` 엔드포인트로 주기 갱신.
- 이 구조는 `AI_OPERATIONS.md` 의 초기 메뉴 구성과 합치됨.
- Phase 1 필수 2페이지는 **AI 제안**과 **규칙 관리**. 이력/설정은 후반 추가.

### 7.2 AI 제안 페이지 (`/agent/proposals`)

> **역할**: 매일 사용하는 실시간 승인 큐. AI 직원이 감지한 것을 처리.

**본질**: Proposal 테이블의 `pending` 상태 레코드를 우선순위 그룹으로 보여주고 승인/거부를 받는다. Phase 1 주력 페이지.

**레이아웃**:
```
┌─ AI 운영 > AI 제안 ──────────────────────────┐
│                                                │
│  [🔴 긴급 3]  [🟡 일반 6]  [🔵 참고 3]  ↻       │
│                                                │
│  필터: [상태: pending ▼] [타입: 전체 ▼]         │
│        [출처: 전체 ▼]                            │
│                                                │
│  🔴 긴급                                         │
│  ┌──────────────────────────────────────────┐ │
│  │ 🏠 래미안 101-1503 네이버 광고 내림 필요   │ │
│  │    14:30 계약 체결 후 2시간 경과           │ │
│  │    근거: 공인중개사법 제18조의2 (500만원)  │ │
│  │    [링크: 래미안고덕 101-1503]             │ │
│  │    [출처: rule:ad_takedown]                │ │
│  │    [승인] [거부]  ▼ 세부      만료 46시간   │ │
│  └──────────────────────────────────────────┘ │
│  ...                                           │
│                                                │
│  🟡 일반  ...                                    │
│  🔵 참고  ...                                    │
└────────────────────────────────────────────────┘
```

**카드 구성**:
- 제목 + 타입 아이콘
- `reasoning` (법적 근거/데이터 근거) — 기본 접힘, 펼치면 전체 표시
- 컨텍스트 링크 썸네일 (listingId/propertyId/contactId 가 있으면 해당 객체 요약)
- 출처 배지 (Phase 1: `rule:...` / Phase 2: `mcp:...`, `event:...`)
- 버튼: `[승인] [거부] [세부]`
- 만료 임박 시 빨간 테두리 + 카운트다운

**데이터 소스**:
- `GET /proposals?status=pending` (이미 구현)
- 그룹핑은 클라이언트에서 `priority` 로
- 5초 polling 또는 Socket.io 구독 (Phase 1 은 polling 으로 단순하게)

**승인 플로우**:
1. `[승인]` 클릭 → 낙관적 UI (카드가 즉시 사라짐 + 토스트)
2. `POST /proposals/:id/approve` body: `{ note? }`
3. 서버: status → approved, Executor 트리거, executed/failed 로 최종 상태 전이
4. 실패 시 AI 제안에 다시 노출 or 별도 배지

**거부 다이얼로그**:
```
┌─ 제안 거부 ─────────────────────────┐
│ 이 제안을 왜 거부하시나요?             │
│ ( ) 이미 처리함                        │
│ ( ) 잘못된 감지 (false positive)       │
│ ( ) 지금은 아님                        │
│ ( ) 해당 사항 없음                     │
│ ( ) 기타: _________________           │
│                                       │
│ 거부 사유는 규칙 개선에 활용돼요.      │
│                                       │
│          [취소]  [거부 확정]           │
└───────────────────────────────────────┘
```
→ `POST /proposals/:id/reject` body: `{ note: "이미 처리함" }`. `decisionNote` 에 저장되어 규칙 튜닝 데이터가 된다.

### 7.3 규칙 관리 페이지 (`/agent/rules`)

> **역할**: 사장님이 "AI 직원이 어떤 규칙으로 일하고 있나" 를 보고 조정.

**본질**: Rule 테이블 레코드 목록 + 규칙별 최근 통계. 전체 on/off, 개별 on/off, (Phase 2) config 편집.

**레이아웃**:
```
┌─ AI 운영 > 규칙 관리 ──────────────────────────┐
│                                                │
│  전체 AI 직원:     [●────] ON                   │
│                   (끄면 모든 규칙이 정지)        │
│                                                │
│  ─── 활성 규칙 (2) ───                           │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ 📢 광고 내림 감지                          │ │
│  │ 🏛 법령 기반 · 스케줄 · 매 30분             │ │
│  │ 거래 완료된 매물의 외부 광고가 살아있는지… │ │
│  │                                            │ │
│  │ 지난 7일: 8건 감지                         │ │
│  │   ├ 승인 7건 (87.5%)                       │ │
│  │   └ 거부 1건 (12.5%)                       │ │
│  │                                            │ │
│  │ [●──] ON         [최근 제안 보기 →]         │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ 🏠 임대차 만기 알림                        │ │
│  │ 🏛 법령 기반 · 스케줄 · 매일 06:00          │ │
│  │ 주택임대차보호법 상 갱신 거절 기한…        │ │
│  │                                            │ │
│  │ 지난 7일: 3건 감지 (전부 자동 실행)        │ │
│  │                                            │ │
│  │ [●──] ON         [최근 제안 보기 →]         │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ─── 비활성 규칙 (0) ───                         │
│                                                │
│  ─── Phase 2 예정 ───                            │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ 💸 방치된 매물 감지   🔒 Phase 2             │ │
│  │ 임계값 기반 · N일 동안 매칭 0개인 매물      │ │
│  └──────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

**규칙 카드 구성**:
- 이름 + 설명
- 메타 배지: 출처(`🏛 법령 기반` / `⚙️ 임계값 기반`) · 트리거(`스케줄 / 이벤트`) · 주기/이벤트명
- 통계: 지난 7일 감지 수 / 승인·거부율 (자동 실행은 "자동 실행" 표시)
- on/off 토글
- 우측: "최근 제안 보기" → 모달 또는 사이드 패널로 최근 Proposal 10개 미리보기

**상세 패널 (카드 클릭 또는 "최근 제안 보기")**:
- 규칙 메타 정보 전체
- (Phase 2) 임계값 config 편집 폼 — `isSystem=false` 일 때만
- 최근 10개 Proposal 테이블: 제안 시각, 승인/거부/만료, 거부 사유
- 거부 사유 분포 차트 (Phase 2, 충분한 데이터 쌓이면)
- 수동 실행 버튼 "지금 한 번 실행" (개발/테스트용)

**전체 on/off**:
- 상단 토글이 `Office.agentEnabled` 직접 조작
- OFF 시: 모든 Rule 의 cron/event 리스너가 중지되고 카드는 회색 처리, "AI 직원이 정지됐어요" 안내
- 수동 재개 버튼

**법령 기반 규칙 보호**:
- `isSystem=true` 규칙은 on/off 만 가능, config 편집 버튼은 "법령 기반 — 편집 불가" 잠금
- 사장님이 끄려고 하면 "이 규칙은 공인중개사법/주임법 기반이에요. 끄시면 과태료 리스크가 있어요." 경고

**데이터 소스** (다음 단계 구현):
- `GET /agent/rules` — 목록 + 통계
- `GET /agent/rules/:id` — 상세 + 최근 Proposal
- `PATCH /agent/rules/:id` — isActive / config
- `PATCH /agent/settings/global` — agentEnabled

### 7.4 실행 이력 페이지 (`/agent/history`)

**역할**: 처리된 Proposal 아카이브 조회. 읽기 전용. "이거 작년에 어떻게 처리했더라?" 같은 질문에 답.

- 필터: 상태(executed/rejected/expired), 날짜, 타입, 출처
- 테이블 형태 (AI 제안의 카드형과 대비)
- 페이지네이션
- Phase 1 후반에 구현

### 7.5 설정 페이지 (`/agent/settings`)

**역할**: 신뢰 계층(trustConfig) 조정 + 전역 on/off.

- 전역 on/off는 규칙 관리 페이지와 중복 표시 (어디에서든 접근 가능)
- 제안 타입별 trustTier 오버라이드 (`Office.agentTrustConfig`)
  - 예: "광고 내림 제안: `auto` / `approval_required` / `inform_only`"
- Phase 2: MCP 권한 기본값 편집
- Phase 2: LLM 비용 한도 설정
- Phase 1 후반에 구현

---

## 8. 관측·운영

### 8.1 메트릭

- Rule별 실행 횟수/실행 시간/에러율
- Proposal 생성 수 (type별, office별)
- 승인/거부 비율 (type별)
- 거부된 제안의 `decisionNote` 분포
- 평균 Proposal → 승인 소요 시간
- 만료된 Proposal 수

### 8.2 로그

모든 Rule 실행은 `ActivityLog` 에 기록:
- `actor: "agent:rule:ad_takedown_v1"`
- `source: "system"`
- `action: "run"` / `"create"` / `"skip"` (dedupe 시)
- `changes: { proposalIds, skipCount }`

### 8.3 서킷 브레이커

연속 실패 5회 → `Rule.isActive=false` 자동 전환 + 관리자 알림 (다음 단계).

---

## 9. Phase 1 범위와 비범위

### 9.1 범위 (현재 진행 중)

- [x] `Proposal` 테이블 + 마이그레이션 스키마
- [x] `Rule` 테이블 + 마이그레이션 스키마 (`InsightRule` 대체)
- [x] `Listing.checkStatusChangedAt` 필드
- [x] `Office.agentTrustConfig`, `agentEnabled`, `mcpPermissionDefaults` 필드
- [x] `User.mcpPermissions` 필드
- [x] `Proposal.createdByUserId` 필드 (Phase 2 MCP 통합 호환)
- [x] `apps/server/src/modules/agent/` 전체 모듈 골격
- [x] `Rule` 인터페이스 (`rule.types.ts`)
- [x] `ProposalService` CRUD + dedupe + 만료
- [x] `ProposalController` REST API
- [x] `RuleEngineService` (runRule 경로)
- [x] `AdTakedownRule` / `LeaseExpiryRule` 스텁 (evaluate 내부는 TODO)
- [x] `ExecutorService` 스텁
- [x] `AgentModule` → `AppModule` 등록
- [ ] DB 마이그레이션 실행 (사용자 직접)
- [ ] Prisma middleware: `Listing.checkStatus` 변경 시 `checkStatusChangedAt` 갱신
- [ ] `LeaseExpiryRule.evaluate()` 실제 쿼리 구현
- [ ] `AdTakedownRule.evaluate()` 실제 쿼리 구현
- [ ] `ExecutorService` 에 `create_task`, `mark_ad_takedown` 핸들러
- [ ] `@nestjs/schedule` 연동 (동적 크론 등록)
- [ ] `Rule` 테이블에 시스템 규칙 upsert (onModuleInit)
- [ ] `RuleController` + `GET/PATCH /agent/rules` + `PATCH /agent/settings/global`
- [ ] Electron 사이드바에 "AI 운영" 그룹 추가 + sidebar-badges 로 urgent 카운트
- [ ] Electron AI 제안 페이지 (`/agent/proposals`) — Phase 1 주력
- [ ] Electron 규칙 관리 페이지 (`/agent/rules`) — Phase 1 주력
- [ ] Electron 실행 이력 페이지 (`/agent/history`) — Phase 1 후반
- [ ] Electron 설정 페이지 (`/agent/settings`) — Phase 1 후반
- [ ] 만료 cron 잡
- [ ] ActivityLog 통합

### 9.2 비범위 (Phase 2 이후)

- ❌ LLM 기반 Rule (등기부 파서, 상담 메모 추출, 느낌 매칭 등)
- ❌ `ClaudeService`, `BullMQ` 기반 비동기 LLM 잡
- ❌ 비용 추적 및 사무소별 예산 가드
- ❌ 프롬프트 버전 관리
- ❌ MCP Permission-Aware 미들웨어 / `MCPAccessToken` 테이블 / MCP 제안 조회 도구
- ❌ 메타 Rule (거절 이유 학습 기반 자동 개선 제안)
- ❌ 이벤트 기반 Rule 실제 구현 (인터페이스는 Phase 1, 사용은 Phase 2)
- ❌ 임계값 기반 Rule (`StaleListingRule` 등)
- ❌ 배치 승인 UI
- ❌ 모바일 inbox
- ❌ `ListingAdChannel` 테이블 (Phase 2 보강용으로 도입 검토)

### 9.3 Phase 2 호환성 가드

Phase 2 에 LLM/이벤트/MCP/임계값 Rule 을 붙일 때 Phase 1 코드를 수정하지 않도록 다음을 Phase 1 에 미리 준비:

1. ✅ **`generatedBy` 형식이 `type:name:version`**: `"rule:ad_takedown:v1"` / Phase 2 에 `"mcp:update_listing_price"` 추가 가능
2. ✅ **`RuleContext` 가 확장 가능한 인터페이스**: `event`, `ruleConfig` 필드가 이미 존재. LLM 헬퍼 등 추가 가능
3. ✅ **`actionPayload` 가 JSONB**: 새 actionType 추가 시 스키마 변경 불필요
4. ✅ **`Rule` 테이블에 `triggerType` 필드**: 이벤트 기반 Rule 이 별도 테이블 없이 같은 테이블에 들어옴
5. ✅ **`Proposal.createdByUserId` 필드**: MCP 통합 시 요청 사용자 기록
6. ✅ **`User.mcpPermissions`, `Office.mcpPermissionDefaults` 스키마**: Phase 2 에서 해석 로직만 붙이면 됨
7. **체커 실행 동기/비동기 추상화**: 현재 동기. Phase 2 에 LLM Rule 이 BullMQ 잡으로 비동기 실행돼야 하면 `RuleEngineService.runRule()` 내부만 확장

---

## 10. 구현 순서

### 완료 (이 세션)
- Prisma 스키마 전체
- NestJS agent 모듈 스캐폴딩
- Rule 인터페이스 + 두 Rule 스텁
- ProposalService / ProposalController 실제 로직
- ExecutorService / RuleEngineService 스텁
- 타입체크 통과

### 다음 세션 우선 작업
1. **DB 마이그레이션 실행** (사용자)
   ```bash
   cd /Users/hyunsulee/estate-erp
   pnpm --filter server prisma:migrate
   # 또는
   pnpm prisma migrate dev --schema=prisma/schema --name add_agent_rule_and_proposal
   ```
2. `Listing.checkStatus` 변경 감지 Prisma middleware
3. `LeaseExpiryRule.evaluate()` 실제 쿼리 구현 (단순한 쪽 먼저)
4. `ExecutorService` 의 `create_task` 핸들러
5. 통합 테스트: LeaseExpiryRule → Proposal 생성 → 승인 → Task 생성
6. `@nestjs/schedule` 설치 + `RuleEngineService.onModuleInit` 에 동적 cron 등록
7. Rule 테이블 seed 로직
8. `AdTakedownRule.evaluate()` 실제 쿼리 구현
9. `ExecutorService` 의 `mark_ad_takedown` 핸들러
10. Electron inbox UI 시작

### 그 다음 작업
11. 설정 화면 (trust tier, Rule on/off)
12. 만료 cron
13. ActivityLog 통합
14. 서킷 브레이커

---

## 11. 결정 사항 기록 (DECISIONS.md 이관 필요)

- **AI 내장 안 함 ⇒ AI Employee + Approval Queue 로 재정의**: `CLAUDE.md` 의 기존 "AI는 제품에 내장하지 않는다" 문구는 "자체 AI 챗봇 UI 안 만듦" 의 의미로 재해석. 서버 내부 LLM 호출(Phase 2)은 허용.
- **paperclip 포팅 안 함**: 개념(Approval, Trust Tier, 예산 가드)만 차용. 코드 기반은 직접 구현.
- **Phase 1은 SQL only**: LLM 통합은 Proposal 루프가 검증된 후로 연기.
- **Trust Tier 기본값은 approval_required**: 승인 피로 대비 안전한 쪽부터 시작, 운영하며 auto 로 승격.
- **단일 inbox UI**: 시나리오별 화면을 따로 만들지 않음. "AI 직원 한 명" 느낌은 통합 UI 에서만 나옴.
- **Checker → Rule 재정의**: "Checker" 는 주기적 검사만 연상시켜 부적절. Rule 이 스케줄 + 이벤트 + 조건 + 법령 모두를 포괄.
- **`InsightRule` → `Rule` 로 대체**: `Insight` 테이블은 유지. 규칙 엔진의 규칙 레코드는 `Rule` 테이블로 통합.
- **`ListingAdChannel` Phase 1 범위에서 제외**: `ExternalListing` 인프라를 재사용해 AdTakedownRule 구현. 필요 시 Phase 2 에 보강용으로 도입.
- **MCP 권한은 사용자 레벨에 귀속**: `User.mcpPermissions` 가 주(主), `Office.mcpPermissionDefaults[role]` 이 fallback. `MCPAccessToken` 은 인증 수단일 뿐 권한을 갖지 않음.
- **이벤트 기반 Rule 인터페이스를 Phase 1 에 포함**: 실제 구현/사용은 Phase 2 지만, `RuleContext.event`, `Rule.triggerType = 'event'` 는 처음부터 인터페이스에 존재.
- **Phase 1 실행 파이프라인은 `@nestjs/schedule` in-process cron**: Phase 2 에서 BullMQ 로 전환. Phase 1 Rule 은 전부 SQL 기반 밀리초 단위라 in-process 로 충분하고, `dedupeKey` 가 중복 안전망. 전환 시점: LLM Rule 도입, 다중 인스턴스, 10개 이상 Rule, 50개 이상 사무소 중 하나라도 해당될 때. 전환 비용은 `RuleEngineService` 한 파일만 수정 (Rule 구현체와 인터페이스는 불변). 단일 인스턴스 보장을 위해 Phase 1 에 `RULE_ENGINE_ENABLED` 환경변수 가드 도입.

---

## 12. 열려있는 질문

- **dedupe 기간**: 같은 dedupeKey 의 Proposal 이 `rejected` 로 끝났을 때, 며칠 후에 다시 만들 수 있게 할 것인가?
- **`expireStale` cron 주기**: 1시간? 하루?
- **만료된 Proposal 의 데이터 보존 기간**: 영구? 6개월 후 archive?
- **LeaseExpiryRule 의 trustTier=auto 가 정말 맞나**: Task 자동 생성이 진짜 Task 랑 섞이는 부작용은 없나? 초기에는 approval 로 시작하는 게 안전할 수도.
- **`mark_ad_takedown` 의 실제 구현**: 어디에 takedown 요구 상태를 기록하나? `ExternalListing` 에 필드 추가? `Task` 만 생성? Phase 1 다음 단계 결정 포인트.
- **Inbox UI 주소**: `/agent/inbox` 로 할지, 기존 사이드바 구조에 맞게 다른 경로로 갈지?

---

## 부록 A — paperclip 에서 차용/비차용

| 개념 | 차용 여부 | 우리 버전 |
|---|---|---|
| Approval 테이블 shape | ✅ | `Proposal` 테이블 |
| Trust Tier (auto/approval/inform) | ✅ | 그대로 채택 |
| 예산 가드 (`budget_incidents`) | 🟡 Phase 2 | 사무소별 월 AI 비용 한도 |
| Heartbeat 개념 | 🟡 이름만 | 실제는 NestJS `@Cron` + EventEmitter |
| Agent org chart | ❌ | 우리는 Rule 평면 구조 |
| 멀티 에이전트 오케스트레이션 | ❌ | 단일 inbox UI 로 충분 |
| Adapter 시스템 (Claude/Codex/Cursor) | ❌ | NestJS 내부 함수 호출 |
| `heartbeat_runs` 테이블 | ❌ | `ActivityLog` 로 대체 |
| Session 유지 | ❌ | Rule 은 stateless |
| Workspace/worktree 클론 | ❌ | 필요 없음 |
| Ticket 시스템 | ❌ | 기존 `Task` 테이블 활용 |
| Goal hierarchy | ❌ | 필요 없음 |

## 부록 B — 26 시나리오의 Phase 배치

`agentic-ai-scenarios.pdf` 의 26개 시나리오를 Phase 로 분배:

### Phase 1 (법 기반 Rule, SQL only)
- 12. 광고 내림 컴플라이언스 → `AdTakedownRule`
- 15. 임대차 만기 → `LeaseExpiryRule`

### Phase 2 (LLM Rule, 이벤트 Rule, 임계값 Rule, MCP 통합)
- 1. 모닝 브리핑 (집계는 SQL Rule, 요약은 LLM Rule)
- 3. 매물 인테이크 (LLM Rule + MCP 이벤트 트리거)
- 4. 매칭 제안 (SQL 필터 + LLM 스코어)
- 11. 공부 검증 (Vision LLM Rule, 이벤트 트리거)
- 18. 주간 시장 브리핑 (LLM Rule)
- **MCP-Proposal 통합** (Permission-Aware 프록시)

### Phase 3
- 6, 8, 9, 10, 13, 14, 16, 17, 19, 20, 21, 22, 25, 26

### Phase 4+ (모바일/CTI 의존)
- 2, 5, 7, 23, 24

---

_이 문서는 리뷰 후 안정화되면 `AI_OPERATIONS.md` 의 MVP 원칙을 본 스펙으로 대체한다._
