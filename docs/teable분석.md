# Teable 분석

> 출처: https://github.com/teableio/teable
> 분석 일자: 2026-05-10
> 분석 시점 버전: v1.10.0
> 라이선스: AGPL-3.0 (Community Edition) + EE 유료

## 1. 한 줄 요약

Airtable의 오픈소스 대안. 스프레드시트 UI로 백만 행 데이터베이스를 실시간 협업하며 다루는 No-code DB 플랫폼.

핵심 가치 제안:

- 비개발자도 만질 수 있는 스프레드시트 UI
- 백만 행급 성능 (캔버스 기반 가상 그리드)
- 셀프 호스팅 가능 (AGPL)
- 멀티 뷰 (Grid / Form / Kanban / Gallery / Calendar)
- 네이티브 AI 통합 (멀티 프로바이더)
- 플러그인 확장 가능

## 2. 모노레포 구조

```
.
├── apps/                    (AGPL 3.0)
│   ├── nestjs-backend/      # NestJS 10 API 서버 (48개 feature 모듈)
│   └── nextjs-app/          # Next.js 16 프런트엔드
├── packages/                (MIT)
│   ├── core/                # 도메인 모델, formula 엔진, zod 스키마
│   ├── sdk/                 # 그리드/뷰 컴포넌트 (재사용 가능)
│   ├── db-main-prisma/      # Prisma 스키마 (모델 49개)
│   ├── db-data-prisma/      # 별도 Prisma (사용자 데이터?)
│   ├── openapi/             # OpenAPI 타입 + zod 스키마
│   ├── ui-lib/              # 공용 UI 컴포넌트
│   ├── formula/             # Formula 평가기
│   ├── icons/, common-i18n/, i18n-keys/
│   ├── eslint-config-bases/
│   └── v2/                  # DDD 기반 차세대 아키텍처 (전환 중)
└── plugins/                 (AGPL 3.0)  # 외부 플러그인
```

`pnpm` 모노레포, 9.13.0 이상 필수. Node 22+. Workspace 18개 정도.

## 3. 기술 스택

### 3.1 백엔드 (`apps/nestjs-backend`)

| 영역 | 선택 | 비고 |
|------|------|------|
| 프레임워크 | **NestJS 10** | `@nestjs/{common,core,axios,bullmq,event-emitter,jwt,passport,platform-express,platform-ws,swagger,terminus,websockets}` |
| ORM | **Prisma 6.2.1** | `db-main-prisma` 패키지에 분리 |
| DB | PostgreSQL / SQLite 듀얼 지원 | `make switch-db-mode`로 전환 |
| 쿼리빌더 | **Knex 3 + Kysely 0.28** | 둘 다 사용 — 마이그레이션은 Knex, 타입세이프 동적 쿼리는 Kysely |
| 실시간 | **ShareDB 5.2** + Redis pubsub + WebSocket | 셀 단위 OT(Operational Transform) |
| 큐 | BullMQ 5 + ioredis + Redlock | 분산 락 + 백그라운드 작업 |
| 캐시 | keyv (redis/sqlite 어댑터) | |
| 인증 | Passport — Local, JWT, GitHub, Google, OIDC | + `oauth2orize` (자체 OAuth 서버) |
| 메일 | `@nestjs-modules/mailer` + nodemailer + handlebars | |
| 스토리지 | AWS S3 / MinIO | `@aws-sdk/client-s3`, `lib-storage`, `s3-request-presigner` |
| 파일 처리 | sharp (이미지), pdf-parse, papaparse, xlsx, archiver, unzipper | |
| AI | **`ai` SDK 6.0** + 멀티 프로바이더 | Anthropic, OpenAI, Google, AWS Bedrock, Azure, Cohere, DeepSeek, Mistral, xAI, TogetherAI, OpenRouter, Ollama, OpenAI-compatible |
| 옵저버빌리티 | **OpenTelemetry 풀세트** + Sentry | express, http, ioredis, nestjs-core, pg, pino, runtime-node 인스트루먼트 |
| 검증 | **zod 4** + zod-validation-error + class-validator + Joi | |
| SQL 파서 | `node-sql-parser` | 사용자 SQL 안전 실행 (SQL Query 기능) |
| 패턴매칭 | `ts-pattern` | |
| 함수형 | `effect 3` | v2에서 사용 추정 |
| 컨트랙트 | `@orpc/nest` (oRPC) | v2 마이그레이션용 |
| 미들웨어 | `nestjs-cls` (AsyncLocalStorage), `nestjs-i18n`, `nestjs-pino`, `nestjs-redoc`, `nest-knexjs` | |

### 3.2 프런트엔드 (`apps/nextjs-app`)

- **Next.js 16** + React 18.3 (페이지 라우터로 보임)
- shadcn/ui + Tailwind (`components.json` 있음)
- Sentry 통합
- Playwright E2E
- i18next + next-i18next
- Babel backup 있음(`babel.config.backup.js`) → SWC 전환 흔적

### 3.3 v2 패키지 (DDD 전환)

`agents.md`에 따르면 v2는 다음 원칙으로 재작성 중:

- **DDD/도메인 모델**: `v2/core/src/domain/**`은 DI 사용 금지 (순수 도메인)
- **DI**: `tsyringe` 직접 import 금지, `@teable/v2-di` 추상화 통해 사용
- **컨테이너**: 환경별 컴포지션 루트 (`@teable/v2-container-node`, `v2-container-browser`)
- **HTTP 컨트랙트**: ts-rest 기반, `packages/v2/contract-http`에 프레임워크 독립적으로 정의
  - 액션 스타일 라우트 권장: `/tables/create`, `/tables/get`, `/tables/rename`
  - **RESTful 중첩 회피**: `/bases/{baseId}/tables/{tableId}` 같은 거 안 씀
- **OpenAPI**: ts-rest 컨트랙트에서 자동 생성 (`@teable/v2-contract-http-openapi`)
- **빌드**: `tsdown` 사용 (tsc는 typecheck만), `dist/` ESM `.js` + `.d.ts` 출력
- **소스 가시성**: `package.json`의 `exports.types`, `exports.import`을 `src/index.ts`로 직결 → Vitest/Vite가 빌드 없이 TS 직접 소비
- **어댑터 분리**:
  - `@teable/v2-adapter-db-postgres-pg`
  - `@teable/v2-adapter-realtime-sharedb`
  - `@teable/v2-adapter-undo-redo-keyv`
- **컨트랙트 구현 분리**: `v2-contract-http`, `v2-contract-http-implementation`, `v2-contract-http-openapi`

## 4. 데이터 모델 (49개)

`prisma/postgres/schema.prisma` (904 lines).

### 4.1 코어 (테이블/필드/뷰/레코드)

- **Space** — 최상위 워크스페이스
- **Base** — Space 내 데이터베이스
- **TableMeta** — 테이블 정의
- **Field** — 필드 정의 (필드 타입, formula, link 포함)
- **View** — 뷰 정의 (Grid/Form/Kanban/Gallery/Calendar)
- **Reference** — 필드 간 참조 그래프
- **Ops** — ShareDB operation 로그
- **SchemaOperation** — 스키마 변경 추적

### 4.2 계산 엔진 (Outbox 패턴)

- **ComputedUpdateOutbox** — 비동기 재계산 작업 큐
- **ComputedUpdateOutboxSeed** — 시드 데이터
- **ComputedUpdateDeadLetter** — 실패한 작업 격리
- **ComputedUpdatePauseScope** — 특정 범위 계산 일시 정지

→ **이게 link/formula 자동 재계산의 핵심**. 트랜잭션에서 outbox에 적재, 워커가 재계산 처리, 실패 시 dead letter로 격리.

### 4.3 사용자/권한

- **User**, **Account**, **Collaborator**, **Invitation**, **InvitationRecord**
- **AccessToken** — API 토큰
- **OAuthApp**, **OAuthAppAuthorized**, **OAuthAppSecret**, **OAuthAppToken** — 자체 OAuth 서버

### 4.4 협업 기능

- **Comment**, **CommentSubscription**
- **Notification**
- **RecordHistory** — 레코드 변경 이력
- **Trash**, **TableTrash**, **RecordTrash** — Soft delete
- **UserLastVisit** — 마지막 방문 추적
- **PinResource** — 즐겨찾기

### 4.5 확장/플랫폼

- **Plugin**, **PluginInstall**, **PluginPanel**, **PluginContextMenu**
- **Dashboard** — BI 대시보드
- **Integration** — 외부 통합
- **Template**, **TemplateCategory** — 템플릿 마켓플레이스
- **Setting** — 시스템 설정
- **Waitlist** — 가입 대기열

### 4.6 첨부

- **Attachments**, **AttachmentsTable**

### 4.7 작업 큐

- **Task**, **TaskRun**, **TaskReference**

### 4.8 노드/공유

- **BaseNode**, **BaseNodeFolder**, **BaseShare** — 베이스 트리/공유

## 5. 백엔드 feature 모듈 (48개)

`apps/nestjs-backend/src/features/` 하위:

```
access-token, aggregation, ai, attachments, auth,
base, base-node, base-share, base-sql-executor,
builtin-assets-init, calculation, canary, chat,
collaborator, comment, dashboard, data-loader,
database-view, export, field, graph, health,
import, integrity, invitation, mail-sender, model,
next, notification, oauth, organization, pin,
plugin, plugin-context-menu, plugin-panel,
record, selection, setting, share, space,
table, table-domain, template, trash, undo-redo,
user, v2, view
```

주목할 모듈:

- **calculation/** — formula·link 자동 재계산 엔진 (link.service, reference.service, field-calculation.service, batch.service, system-field.service). README가 따로 있음.
- **share-db/** (features 외 root) — ShareDB 통합 (auth.middleware, share-db.adapter, sharedb-redis.pubsub)
- **base-sql-executor/** — 사용자가 SQL 직접 실행 (`node-sql-parser`로 화이트리스트 검증)
- **integrity/** — 데이터 무결성 검사
- **canary/** — 카나리 배포 / 실험 기능?
- **graph/** — 필드 의존성 그래프 시각화
- **ai/, chat/** — AI Chat 기능 (chart-completion 포함)
- **next/** — Next.js 통합 (백엔드가 프런트 정적 자산도 서빙하는 듯)
- **v2/** — v2 아키텍처 진입점

## 6. SDK 패키지 (재사용 가능 컴포넌트)

`packages/sdk/src/` 의 주요 디렉토리:

```
components/
├── grid/                    # 캔버스 기반 가상 그리드 (백만 행)
├── grid-enhancements/
├── cell-value/, cell-value-editor/
├── editor/, expand-record/, create-record/
├── filter/, sort/, group/, search/
├── field/, hide-fields/
├── comment/, collaborator/
├── plate/, markdown-editor/  # rich-text
├── upload/, color/, table/
└── ...
```

### 6.1 Grid 컴포넌트 핵심

`packages/sdk/src/components/grid/`:

| 파일 | LOC | 역할 |
|------|-----|------|
| Grid.tsx | 784 | 그리드 진입점 |
| InteractionLayer.tsx | 923 | 마우스/키보드 인터랙션 |
| InfiniteScroller.tsx | 319 | 가상 스크롤 |
| TouchLayer.tsx | 297 | 터치 인터랙션 |
| RenderLayer.tsx | 251 | 캔버스 렌더링 레이어 |
| CellScroller.tsx | 114 | 셀 스크롤 |
| **합계** | ~2,942 | |

`renderers/` 하위:

- `base-renderer/` — 기본 도형 그리기
- `cell-renderer/` — 셀 타입별 렌더러
- `layout-renderer/` — 레이아웃 계산

→ DOM 가상화가 아닌 **단일 캔버스에 직접 그리기** 방식. React 트리 거치지 않으므로 백만 행 처리 가능.

## 7. 프런트엔드 블록 구조

`apps/nextjs-app/src/features/app/blocks/`:

```
admin, base, billing, chart, dashboard, db-connection,
design, erd, graph, import-table, setting, share,
space, space-setting, table, table-list, trash, view
```

`view/` 하위:

```
calendar/, form/, gallery/, grid/, kanban/, list/, plugin/
field/, search/, tool-bar/, hooks/, types.ts
```

→ 뷰 5종(Calendar/Form/Gallery/Grid/Kanban) 각각이 별도 디렉토리.

## 8. 핵심 아키텍처 포인트

### 8.1 ShareDB 기반 실시간 협업

`apps/nestjs-backend/src/share-db/`:

- `share-db.adapter.ts` — Postgres 백엔드 어댑터
- `sharedb-redis.pubsub.ts` — Redis pub/sub로 멀티 인스턴스 동기화
- `auth.middleware.ts` — WebSocket 연결 인증
- `repair-attachment-op/` — 첨부파일 op 복구 로직

ShareDB가 OT(Operational Transform) 처리 → 동시 편집 충돌 자동 해결.

### 8.2 Outbox 기반 비동기 재계산

스키마 모델 4개:

```
ComputedUpdateOutbox     → 작업 큐
ComputedUpdateOutboxSeed → 시드/초기 상태
ComputedUpdateDeadLetter → 실패 격리
ComputedUpdatePauseScope → 부분 일시정지
```

흐름 (추정):

1. 사용자가 셀 변경
2. 트랜잭션 안에서 outbox에 의존 필드 업데이트 작업 적재
3. 트랜잭션 커밋 후 워커가 outbox 폴링/이벤트 수신
4. 의존 그래프 따라 순차 재계산
5. 실패 시 dead letter로 이동, 운영자가 별도 처리

→ **트랜잭션 일관성 + 비동기 처리 + 실패 격리**를 한 패턴으로 해결.

### 8.3 듀얼 어댑터 추상화 (v2)

```
@teable/v2-adapter-db-postgres-pg     # DB
@teable/v2-adapter-realtime-sharedb   # 실시간
@teable/v2-adapter-undo-redo-keyv     # Undo/Redo 저장
```

→ 도메인은 포트(인터페이스)만 알고, 어댑터는 환경별로 갈아끼움.

### 8.4 자체 OAuth 서버

`oauth2orize` 사용, 4개 모델로 풀 OAuth 2.0 구현:

```
OAuthApp           — 등록된 앱
OAuthAppSecret     — 시크릿 (다중 시크릿 지원)
OAuthAppAuthorized — 사용자별 승인 이력
OAuthAppToken      — 발급된 토큰
```

→ 외부 통합/AI 에이전트가 Teable에 OAuth로 접근 가능.

### 8.5 듀얼 Prisma 패키지

- `db-main-prisma` — 메타데이터 (테이블 정의, 사용자, 권한)
- `db-data-prisma` — 사용자 데이터?

→ 메타와 데이터를 다른 DB로 분리할 가능성 (확인 필요).

### 8.6 액션 스타일 API 라우트 (v2)

`agents.md`에서 명시:

```
✅ /tables/create, /tables/get, /tables/rename
❌ /bases/{baseId}/tables/{tableId}
```

→ RESTful 중첩 자원보다 **명시적 액션 + camelCase**를 선호. RPC 스타일에 가까움.

### 8.7 플러그인 시스템

```
Plugin           — 플러그인 등록
PluginInstall    — 베이스/스페이스에 설치
PluginPanel      — 사이드 패널 확장
PluginContextMenu — 우클릭 메뉴 확장
```

→ 백엔드 모듈 + 데이터 모델 양쪽으로 플러그인 지원.

## 9. estate-erp 관점 시사점

> Teable은 "수평 No-code DB", estate-erp는 "수직 도메인 SaaS"라서 컨셉은 다르지만, 패턴/기술 선택에서 가져올 만한 것들이 많음.

### 9.1 직접 참고 가능

| Teable 패턴 | estate-erp 응용 |
|--------------|----------------|
| **OAuth2orize + OAuthApp 모델** | 지금 작업 중인 `prisma/schema/oidc.prisma`에 그대로 참고. 외부 AI(Claude/ChatGPT) MCP 인증, n8n/Zapier 연동을 자체 OAuth 서버로 제공할 때 모델 4개(App/Secret/Authorized/Token) 구조 차용. |
| **ShareDB + Redis pubsub** | 매물/계약 동시 편집 협업이 필요해지면 직접 참고. Phase 2에서 매물 정보 동시 수정 시 충돌 해결. |
| **Outbox 패턴 (ComputedUpdateOutbox)** | 가격 변동 감지 → PriceHistory 기록 → Rule Engine 트리거 → Proposal 생성의 비동기 체인을 outbox + dead letter 패턴으로 견고하게 만들 수 있음. 지금은 미들웨어 직접 호출이라 실패 시 흔적이 사라짐. |
| **node-sql-parser로 사용자 SQL 화이트리스트** | MCP에서 SQL Text-to-SQL을 거부했는데, 만약 사장님 SQL 콘솔을 열어준다면 이 패턴으로 안전하게. |
| **Trash/TableTrash/RecordTrash 패턴** | 매물/계약/연락처 soft-delete 표준화. ActivityLog와 함께 복구 UX 만들 때 참고. |
| **RecordHistory** | ActivityLog와 별도로, "필드 단위 변경 이력"이 필요할 때 (계약 금액 변경 추적 등). |
| **UserLastVisit** | "최근 본 매물/연락처" UX. |
| **OpenTelemetry 풀스택 인스트루먼트** | Phase 1+에서 운영 가시성 확보. 인스트루먼트 패키지 목록 그대로 참고 가능. |

### 9.2 아키텍처 영감

- **48개 feature 모듈 분리** — estate-erp도 NestJS feature 모듈을 더 잘게 쪼갤 여지. 지금 도메인 39개 테이블이라 비슷한 규모인데, 매물/연락처/거래/네트워크/외부매물 정도로만 갈라져 있다면 모듈 단위 책임이 너무 커질 수 있음.
- **packages/sdk 재사용** — desktop과 web에 공통 컴포넌트가 늘어나면 packages/ui 같은 SDK 분리 검토. 지금은 desktop/web 각각이 shadcn 직접 사용 중.
- **v2 패키지 DDD 분리** — 코어 도메인(Site/Property/Listing 체인)을 DI 없이 순수 함수로 빼고, 어댑터(Prisma, MCP, 광고노트 크롤러)는 각자 패키지로. 단, 지금 단계에선 오버엔지니어링이라 Phase 2+에서 재검토.
- **액션 스타일 라우트** — REST 중첩보다 RPC 스타일이 MCP 도구 정의와 1:1 매핑하기 좋음. estate-erp의 MCP 도구가 이미 `create_*`, `find_*`, `get_*`, `update_*` 형태라 이 철학과 정합적.

### 9.3 직접 채택은 부적합한 것

- **ShareDB**: 매물 100만 건 동시 편집 시나리오 없음. 오버킬.
- **Canvas Grid 직접 작성**: 매물 그리드는 호실 그리드(네이버 스타일)로 100×30 정도 규모, 일반 React 가상화로 충분.
- **Plugin 시스템**: 도메인이 좁아 플러그인 추상화 비용 > 이득.
- **자체 SQL 실행**: MCP/AI에 SQL 노출 안 하기로 결정됨 (PRD §11).
- **Formula 엔진**: estate-erp는 사용자 정의 수식 필드가 없음.

## 10. 흥미로운 디테일

- **`canary` 모듈**: 실험 기능 토글? 카나리 배포?
- **`integrity` 모듈**: 주기적 데이터 무결성 검사. estate-erp도 광고노트 외부 매물 ↔ Property 매칭 무결성 검사에 응용 가능.
- **`base-node`/`base-share`**: 베이스를 트리 구조로 폴더링 + 외부 공유 링크. estate-erp의 NetworkSharedProperty와 컨셉 비슷.
- **`undo-redo` 모듈**: keyv 백엔드. estate-erp는 매물 일괄 편집 후 되돌리기에 응용 가능.
- **`builtin-assets-init`**: 초기 시드 자산 (템플릿, 아이콘?)
- **`mail-sender`**: 단순 mailer가 아닌 별도 모듈. 큐 기반일 가능성.

## 11. UI 분석

### 11.1 데모/사이트에서 직접 확인한 것

**1M Rows Demo** (`https://app.teable.ai/share/shrVgdLiOvNQABtW0yX/view`):

- DOM에 `canvas` 단 1개 — 그리드 전체를 캔버스로 그림 (ARIA snapshot이 거의 비어있음으로 확인)
- 툴바 영역만 일반 DOM (Hidden fields / Filter / Sort / Group / Row height + Add Record)
- 우상단 푸터에 통계 (`100000+ records`, `Average ###`, `Filter ##` `Sum ###`) — 칼럼별 집계 자동 계산
- 상태 변화: 필터 활성화 시 Filter 버튼 색상 = violet 계열 / 정렬 = orange / 그룹 = emerald
- 셀 색상 코딩: 왼쪽 ID (회색 배경 텍스트), 숫자(녹색), 평점(별 시각화), 태그(다양한 색상 칩)
- 페이지 자체에 React Skeleton (`Skeleton h-7 w-full`)으로 로딩 처리

### 11.2 코드에서 본 UI 아키텍처

**컴포넌트 계층**:

```
View.tsx (라우터)
├─ GridView / FormView / GalleryView / KanbanView / CalendarView / PluginView
   ↓ 각자 ViewBase → ViewBaseInner 분리
ToolBar (뷰별 분리)
├─ GridToolBar / KanbanToolBar / FormToolBar / GalleryToolBar / CalendarToolBar
└─ 공통: CreateRecordModal + GridViewOperators + Others (메뉴/공유)
```

**툴바 패턴** (`GridToolBar.tsx`):

```tsx
<div className="flex h-[48px] items-center border-t px-1 py-2 sm:gap-1 sm:px-2 md:gap-2 md:px-4">
  <CreateRecordModal>
    <Button size="xs" variant="outline" disabled={!permission['record|create']}>
      <Plus /> {t('addRecord')}
    </Button>
  </CreateRecordModal>
  <div className="flex flex-1 justify-between @container/toolbar">
    <GridViewOperators disabled={!isViewConfigurable} />
    <Others />
  </div>
</div>
```

→ **컨테이너 쿼리** (`@container/toolbar`)로 툴바 너비에 따라 버튼 텍스트 표시/숨김. 미디어 쿼리가 아니라 컨테이너 쿼리. shadcn 클래스 (`@2xl/toolbar:inline`)로 텍스트 표시 토글.

**ToolBarButton 패턴** (`GridViewOperators.tsx`):

```tsx
<ViewFilter ...>
  {(text, isActive, hasWarning) => (
    <ToolBarButton
      isActive={isActive}
      text={text}
      className={cn(
        'max-w-[200px]',
        isActive && 'bg-violet-100 dark:bg-[#241A31] hover:bg-violet-200',
        hasWarning && 'border-yellow-500'
      )}
    >
      <FilterIcon />
      {hasWarning && <AlertTriangle />}
    </ToolBarButton>
  )}
</ViewFilter>
```

→ **render-prop 패턴**. SDK가 상태(`isActive`, `hasWarning`, 표시 텍스트)를 계산해서 자식에게 넘김. 앱은 디자인만 책임.

→ **색상 코딩**: 활성 필터=violet, 정렬=orange, 그룹=emerald. 다크모드는 별도 hex.

→ **경고 상태**: 필터 칼럼이 삭제됐거나 권한 없으면 yellow border + AlertTriangle 아이콘.

**ExpandRecord 헤더**:

```tsx
<div className="flex items-center gap-4 px-4 border-b h-12">
  <Button size="icon-xs" variant="ghost" onClick={onPrev}><ChevronUp /></Button>
  <Button size="icon-xs" variant="ghost" onClick={onNext}><ChevronDown /></Button>
  {/* prev/next 네비게이션 */}
  {showTitle && <Title />}
  {/* width 측정해서 점진 표시 */}
  <Button onClick={onCopyUrl}><Link /></Button>
  <Button onClick={onCommentToggle}><MessageSquare /> {commentCount}</Button>
  <Button onClick={onRecordHistoryToggle}><History /></Button>
  <DropdownMenu>
    <Trigger><MoreHorizontal /></Trigger>
    <Content>
      <Item><CopyPlus /> Duplicate</Item>
      <Item><Trash /> Delete</Item>
    </Content>
  </DropdownMenu>
  <Button onClick={onClose}><X /></Button>
</div>
```

→ `useMeasure`로 헤더 너비 측정 → 너비 < 300px이면 타이틀 숨김 / < 200px이면 일부 버튼 숨김. **점진적 폭 적응 패턴**.

→ Modal/Panel/Drawer 모드 전환 가능 (`ExpandRecordModel` enum) — 같은 컴포넌트가 모달/사이드패널/풀페이지로 변신.

→ Prev/Next로 같은 뷰의 다른 레코드 순회. 매물 상세 패널에 그대로 응용 가능.

**사이드바** (`SpaceSideBar.tsx`):

```tsx
const pageRoutes = [
  { href: '/space',              text: '모든 스페이스',  Icon: Home },
  { href: '/space/shared-base',  text: '공유 베이스',    Icon: Database },
  { href: `/enterprise/${id}`,   text: '조직 패널',      Icon: Building2, hidden: !isOrgAdmin },
  { href: '/admin/setting',      text: '관리자',         Icon: ShieldUser, hidden: !isAdmin },
  { href: '/space/trash',        text: '휴지통',         Icon: Trash2 },
];
```

→ 권한 기반 메뉴 항목 hidden 토글. 활성 라우트는 `bg-accent` 적용.

→ 그 아래 PinList(즐겨찾기) + SpaceList(워크스페이스 트리) 순서로 배치.

### 11.3 핵심 UI 패턴 정리

| 패턴 | 위치 | 설명 |
|------|------|------|
| **단일 캔버스 그리드** | `packages/sdk/grid/` | DOM 가상화 X, 캔버스에 직접 그리기. RenderLayer/InteractionLayer/TouchLayer 분리 |
| **render-prop SDK** | `<ViewFilter>{(text, isActive) => ...}</ViewFilter>` | SDK가 상태 계산, 앱이 디자인 책임 |
| **컨테이너 쿼리** | `@container/toolbar @2xl/toolbar:inline` | 미디어 쿼리 대신 컨테이너 쿼리로 반응형 |
| **상태별 색상 토큰** | `bg-violet-100 dark:bg-[#241A31]` | Filter=violet / Sort=orange / Group=emerald |
| **width 측정 점진 표시** | `useMeasure` + `MIN_TITLE_WIDTH` | 너비별로 표시 요소 점진 토글 |
| **Modal/Panel/Drawer 일체화** | `ExpandRecordModel` enum | 같은 컴포넌트가 표시 모드만 바꿈 |
| **컬럼 집계 푸터** | Grid 하단 통계 영역 | 합계/평균/카운트 등 자동 계산 |
| **Skeleton 로딩** | `<Skeleton h-7 w-full />` | shadcn skeleton 일관 사용 |
| **권한 기반 hidden** | `pageRoutes[].hidden` | 메뉴 항목 자체를 권한에 따라 안 그림 |
| **prev/next 레코드 네비** | ExpandRecord 헤더 | 같은 뷰 내 ↑↓로 다른 레코드 순회 |

### 11.4 디자인 시스템

- **shadcn/ui 직접 사용** (`packages/ui-lib/src/shadcn/ui/` — 46개 컴포넌트)
- 추가 자체 컴포넌트: `tree.tsx`, `field.tsx`, `input-group.tsx`, `input-otp.tsx`
- 차트: `chart.tsx` (recharts 추정)
- 토스트: sonner + 자체 toaster 둘 다 (`sonner.tsx`, `toaster.tsx`, `toast.tsx`)
- Tailwind v3 (lucide-react + 자체 `@teable/icons`)
- 다크모드: `class` 전략 (`<html class="light">` 확인됨)
- 색상은 CSS variables + Tailwind palette 혼합 (`bg-violet-100 dark:bg-[#241A31]`)

### 11.5 estate-erp 관점에서 가져올 UI 패턴

**즉시 적용 가능**:

1. **컨테이너 쿼리 툴바** — desktop 매물 상세의 필터/정렬/그룹 영역. 사이드패널 너비에 따라 버튼 텍스트 토글. 지금은 미디어 쿼리만 쓰는데, 컨테이너 쿼리로 바꾸면 사이드시트에서도 동일 컴포넌트 재사용 가능.

2. **상태별 색상 토큰** — 매물 확인상태 (verified=green, in_contract=orange, hold=yellow, done=gray)를 Tailwind 일관 토큰으로. 지금 desktop에서 색상이 컴포넌트마다 즉석 결정되는 경향.

3. **render-prop 필터/정렬 SDK** — `<MatchFilter>{(text, isActive) => ...}</MatchFilter>` 같이 매칭/거래/광고노트 필터를 SDK 컴포넌트로 통일. 매물 검색, 매칭 검색, 광고노트 검색이 지금 각자 구현돼있을 텐데 통일 가능.

4. **prev/next + Modal/Panel 일체화** — 매물 상세 패널을 desktop에서 시트로 열든 별도 페이지로 열든 같은 컴포넌트. 사장님이 매물 리스트를 화살표로 순회하는 워크플로우 개선.

5. **권한 기반 hidden** — owner/manager/agent 사이드바 메뉴 토글. 지금 어떻게 구현됐는지 확인해서 패턴 통일.

6. **컬럼 집계 푸터** — 매물 리스트 / 거래 리스트 하단에 합계/평균. 거래 리스트에서 "이번 달 수수료 합계" 같은 게 자동 노출되면 사장님이 좋아할 만함.

7. **Skeleton 로딩 일관화** — 페이지/패널 진입 시 skeleton 통일. shadcn skeleton 그대로.

**참고만 (직접 채택은 신중)**:

8. **단일 캔버스 그리드** — 호실 그리드(100×30)나 매물 리스트(수천 행)는 일반 React 가상화로 충분. 캔버스는 진짜 백만 행 다룰 때만.

9. **width 측정 점진 표시** — `react-use`의 `useMeasure`로 헤더가 좁아지면 요소 숨김. 매물 카드 헤더에 응용 가능하지만 오버엔지니어링 위험.

### 11.6 색상 코딩 사례 (그대로 차용 가능)

estate-erp의 다양한 상태 표시에 그대로 적용 가능한 매핑:

```
필터 활성:   bg-violet-100 / dark:bg-[#241A31]
정렬 활성:   bg-orange-100 / dark:bg-[#2F2518]
그룹 활성:   bg-emerald-100 / dark:bg-[#0C3026]
경고:        border-yellow-500 + AlertTriangle icon
```

estate-erp에 매핑 제안:

| 상태 | 토큰 |
|------|------|
| 매물 확인 (verified) | emerald |
| 협상중 (in_contract / negotiating) | orange |
| 보류 (hold) | yellow |
| 완료 (done) | gray |
| AI 제안 대기 (Proposal pending) | violet |
| 광고노트 비활성 30일+ | red border (warning) |

## 12. 추가로 파볼 만한 곳

심화 분석이 필요할 때 우선순위:

1. **`features/calculation/`** — link/formula 재계산 엔진의 실제 코드 (의존 그래프 알고리즘)
2. **`share-db/`** — ShareDB Postgres adapter 구현 (OT 어떻게 처리하는지)
3. **`features/oauth/` + OAuthApp 모델** — OAuth 서버 흐름 전체
4. **`features/v2/` + `packages/v2/`** — DDD 마이그레이션 전략 (estate-erp의 장기 리팩토링 참고)
5. **`packages/sdk/src/components/grid/InteractionLayer.tsx`** — 캔버스 그리드 인터랙션 처리 패턴
6. **`packages/v2/contract-http`** — ts-rest 컨트랙트 + zod + OpenAPI 자동 생성 흐름

---

## 부록: 모델 49개 카테고리별 정리

| 카테고리 | 모델 |
|---------|------|
| 워크스페이스 | Space, Base, BaseNode, BaseNodeFolder, BaseShare, PinResource |
| 테이블/필드 | TableMeta, Field, View, SchemaOperation |
| 레코드/연산 | Ops, Reference, RecordHistory |
| 계산 엔진 | ComputedUpdateOutbox, ComputedUpdateOutboxSeed, ComputedUpdateDeadLetter, ComputedUpdatePauseScope |
| 사용자/권한 | User, Account, Collaborator, Invitation, InvitationRecord, AccessToken |
| OAuth | OAuthApp, OAuthAppSecret, OAuthAppAuthorized, OAuthAppToken |
| 협업 | Comment, CommentSubscription, Notification, UserLastVisit |
| Soft delete | Trash, TableTrash, RecordTrash |
| 첨부 | Attachments, AttachmentsTable |
| 확장 | Plugin, PluginInstall, PluginPanel, PluginContextMenu, Dashboard, Integration |
| 템플릿 | Template, TemplateCategory |
| 시스템 | Setting, Waitlist |
| 작업 | Task, TaskRun, TaskReference |
| Enum | ProvisionState |

총 49개 모델 + 1개 enum.
