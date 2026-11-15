# 에스테잇플로우 (Estait Flow)

부동산 중개사무소용 업무 프로그램. NestJS 서버와 Electron 데스크톱 앱으로 이뤄진다.

- **제품명**: 에스테잇플로우 / EstaitFlow (법인 Estait Inc., 도메인 estaitt.com)
- **코드네임**: estate-erp — 패키지 스코프(`@estate-erp/*`), 폴더, 환경 변수 이름에 남아 있다
- **1차 고객**: 직원 5명 이상의 중개법인

이 파일은 에이전트(Claude, Codex 등)가 작업 전에 읽는 지침이다. `CLAUDE.md`는 이 파일을 가져온다.

## 이 문서를 쓰는 원칙

- 코드가 이미 말해 주는 것은 적지 않는다. 테이블 수, 도구 목록, 모듈 목록처럼 코드가 바뀌면 틀리는 숫자와 목록은 넣지 않고 위치만 알려 준다.
- 여기 적는 것은 코드만 봐서는 알기 어려운 규칙과 이유다.
- 문서와 코드가 다르면 코드가 맞다. 발견하면 문서를 고친다.

## 저장소 구성

```
apps/
  server/       NestJS 서버 (src/modules/*, src/realtime, src/prisma)
  desktop/      Electron 앱 (src/main, src/preload, src/renderer) — 직원이 쓰는 유일한 화면
  cti-bridge/   전화 연동 브리지 (C#, 계획 단계: docs/CTI_BRIDGE_PLAN.md)
  catalog/      소비자 사이트. 분리 당시 소스로만 남아 있고 후속 작업은 별도 저장소에서 한다
packages/
  shared/       서버·화면이 함께 쓰는 enum·유틸 (단계 값의 기준은 src/enums.ts)
  api-client/   서버 API 호출 함수와 응답 타입
prisma/
  schema/       DB 스키마. 영역별 .prisma 파일로 나뉘어 있다
  schema/migrations/   마이그레이션 SQL
  seed*.ts      시드 스크립트
```

- 웹 앱(`apps/web`)은 2026-10-14에 지웠다. 화면 코드가 desktop과 두 벌로 갈라졌기 때문이다. 웹이 다시 필요하면 desktop renderer를 공유 패키지로 떼어 쓰고 사본을 만들지 않는다.
- 모바일 앱과 `packages/mcp-server`는 저장소에 없다.

## 실행과 검증

Node.js 23 이상, pnpm.

```bash
pnpm install
pnpm infra:up            # PostgreSQL(PostGIS) + Redis (Docker)
pnpm prisma:generate
pnpm dev:server          # 서버 http://localhost:3000 (파일이 바뀌면 다시 뜬다)
pnpm dev:desktop         # Electron + 화면 개발 서버

pnpm typecheck           # 전체 타입 검사
pnpm --filter @estate-erp/server test     # 서버 (jest)
pnpm --filter @estate-erp/desktop test    # 데스크톱 (node:test)
pnpm prisma:migrate      # 마이그레이션 만들기·적용 (개발)

pnpm --filter @estate-erp/desktop package   # 앱 폴더만 만들기 (dist/, 설치 파일 없음)
pnpm --filter @estate-erp/desktop make      # 설치 파일 만들기 (electron-builder)
```

- 데스크톱은 electron-vite로 빌드하고(`apps/desktop/electron.vite.config.ts` → `out/`) electron-builder로 설치 파일을 만든다(`electron-builder.config.ts` → `dist/`). 쓰는 패키지는 main·preload·화면 모두 번들에 넣으므로 전부 `devDependencies`에 둔다. `dependencies`에 적으면 그 패키지가 앱의 `node_modules`로 들어가고, 그 안의 선택 의존성을 찾는 `require`가 `app.asar` 밖까지 올라간다(이유는 `electron.vite.config.ts`의 main 주석).
- 패키지(`shared`, `api-client`)를 고치면 `pnpm --filter <패키지> build` 뒤에 서버·데스크톱 타입 검사를 다시 돌린다.
- 일을 끝냈다고 말하기 전에 고친 쪽의 타입 검사와 관련 테스트를 돌린다. 실패가 있으면 그대로 보고한다.

### 로컬 환경에서 조심할 것

- **서버가 둘이다.** `pnpm dev:server`(3000)와, 소스를 마운트하지 않은 Docker 서버(3001)다. 데스크톱이 어느 쪽을 보는지는 `apps/desktop/.env.local`의 `VITE_API_BASE_URL`이 정한다. 3001은 이미지를 다시 빌드해야 서버 변경이 반영된다:
  `docker compose -f docker-compose.dev.yml -f docker-compose.backend.yml up -d --build server`
- **DB와 Docker 서버는 다른 작업 세션도 함께 쓴다.** 마이그레이션 적용과 이미지 재빌드는 사용자에게 먼저 묻는다. 스키마 변경의 동작 확인은 임시 DB(복사본을 만들어 `prisma migrate deploy`, 끝나면 삭제)에서 한다.
- **화면 확인은 브라우저로 먼저 한다.** 화면 개발 서버를 Chromium/Playwright로 열면 개발 전용 로그인으로 들어갈 수 있다. Electron 창은 IPC, preload, 탭, 트레이, 전화처럼 Electron에서만 되는 동작을 볼 때만 쓴다. 성능 수치는 실제 Electron 창에서 잰다.

## 지켜야 할 규칙

### 단위와 이름
- TypeScript는 `camelCase`, DB 컬럼은 `snake_case`(`@map`), Prisma 모델은 `PascalCase`
- 가격은 **만원** 단위 정수. 15.8억 = `158000`
- 면적은 **m²**로 저장. 평 = m² × 0.3025
- 주소는 자유 글이 아니라 법정동 코드(`Site.wardCode` → Ward → District → Province)
- 좌표는 PostGIS `geometry(Point, 5179)`. 공간 쿼리는 `$queryRaw`

### 사무소 격리
- 법정동 마스터를 뺀 모든 업무 데이터에 `office_id`가 있다. 서버는 요청마다 사용자의 사무소로 범위를 좁힌다.
- 새 표를 만들면 `office_id`를 넣고 `apps/server/src/prisma/prisma.service.ts`의 격리 대상 목록에 올린다.
- 단지(Site)·동·호는 예외다. `officeId = null`이면 모든 사무소가 보는 공공 데이터, 값이 있으면 그 사무소의 비공개 데이터다.

### 장소 → 매물 → 거래
```
Site → Dong → Unit → Property → ListingIntake → Listing → Match → Deal → Contract
```
- 건물형은 모두 Dong을 거친다. 동 구분이 없는 건물은 `isPlaceholder = true`인 Dong 하나를 두고 화면에서 동 선택을 숨긴다. 단독주택·토지는 Site → Property.
- **Property**는 "우리 사무소가 관리하는 이 호실", **ListingIntake**는 한 번 들어온 의뢰, **Listing**은 그 의뢰의 거래 조건 하나(매매·전세·월세)다.
- 상태는 한 칸에 섞지 않는다. 의뢰의 생명주기(`open | hold | closed`)만 저장하고, 확인 상태와 거래 중·완료 여부는 확인 이력과 Deal에서 계산한다.
- 손님 쪽은 Contact → BuyerIntake(구매 의뢰) → BuyerRequirement(희망조건). 역할(소유자, 매수인, 세입자)은 Contact의 속성이 아니라 관계 표로 나타낸다.
- 단계 값(매칭, 거래, 계약 등)은 `packages/shared/src/enums.ts`가 기준이다.

### 중개 건
- 의뢰는 건 없이 존재한다. **BrokerageCase**는 갈아타기처럼 여러 의뢰가 물려 있을 때 사용자가 직접 묶는 것이고, 서버가 알아서 묶지 않는다.
- 순서는 사람이 정한다(**BrokerageCaseStep**). 시스템은 순서를 계산하지 않고 자금 흐름도 계산하지 않는다.
- 고객 원장은 저장된 묶음이 아니라 조회 결과다.

### 인증
- 직원 로그인은 Auth0. 서버는 접근 토큰의 `sub`로 `User.auth0Id`를 찾는다. 아이디 문자열로 연결하지 않는다.
- 사무소·역할·활성 여부는 토큰이 아니라 요청마다 DB에서 읽는다. 접근을 끊는 기준은 DB(`isActive`, `tokensValidAfter`)다.
- 상세는 `.claude/rules/server.md`, Auth0 테넌트에 올리는 것은 `apps/server/auth0/README.md`.

### 외부 AI 연결 (MCP)
- 제품에 AI를 넣지 않는다. 서버가 MCP 서버(`/mcp`)이고 사용자의 Claude·ChatGPT가 붙는다.
- 외부 사이트 수집과 브라우저 자동화는 서버가 하지 않는다. 사용자 PC의 로컬 Skill이 하고, 서버에는 완전한 결과만 저장한다.
- 상세는 `.claude/rules/mcp.md`.

### 화면
- 색과 타이포의 기준은 `DESIGN.md`. 톤은 차분하고 전문적으로, 상자와 띠보다 선과 여백을 쓴다.
- 사용자에게 보이는 문구를 새로 쓸 때는 같은 화면의 기존 문구와 말투를 맞춘다.

## 어디에 무엇이 있나

| 알고 싶은 것 | 볼 곳 |
| --- | --- |
| 표와 칸, 제약 | `prisma/schema/*.prisma` (주석에 이유가 적혀 있다) |
| 단계·상태 값 | `packages/shared/src/enums.ts` |
| 서버 API | `apps/server/src/modules/<영역>/*.controller.ts`, 실행 중이면 `/api-docs` |
| MCP 도구 | `apps/server/src/modules/mcp/mcp-tools.service.ts` |
| 화면 | `apps/desktop/src/renderer/routes/_authenticated/<화면>/` |
| 업무 용어의 뜻 | `CONTEXT.md` |
| 영역별 요약과 불변 조건 | `docs/DATA_STRUCTURE.md` |
| 제품 범위와 방향 | `docs/prd.md`, `docs/PRODUCT_STRATEGY.md`, `docs/DECISIONS.md` |

`docs/` 안에서 파일 이름에 날짜가 붙은 보고서와 `docs/mockups`, `docs/ui-reference-research` 등은 그 시점의 조사·시안이다. 지금의 사실로 읽지 않는다.

## 작업 방식

- 커밋과 푸시는 사용자가 요청할 때만 한다.
- 되돌리기 어려운 일(데이터 삭제, 공용 DB 변경, 테넌트 설정 변경, 배포)은 먼저 묻는다.
- 확인하지 못한 것은 확인하지 못했다고 말한다.
