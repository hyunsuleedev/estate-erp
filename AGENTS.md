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
- 가격은 **만원** 단위 정수. 15.8억 = `158000`. 예외: 수수료 입금 기록과 직원 정산의 금액은 **원** 단위다(부가세 10%와 3.3% 공제가 만원으로 떨어지지 않는다). 이유는 `prisma/schema/finance.prisma`의 주석.
- 면적은 **m²**로 저장. 평 = m² × 0.3025
- 주소는 자유 글이 아니라 법정동 코드(`Site.wardCode` → Ward → District → Province)
- 좌표는 PostGIS `geometry(Point, 5179)`. 공간 쿼리는 `$queryRaw`
- 날짜는 UTC로 저장하고, 날·달의 경계("오늘", "이달 수금")는 한국 시각으로 자른다. 서버는 UTC로 돈다.
- 법정 중개보수는 상한이라 반올림하지 않고 내린다(`packages/shared/src/commission.ts`).
- "수금"은 우리 통장에 들어온 돈 한 기준이다: 우리가 수금한 청구의 입금 기록과, 상대 사무소가 수금한 청구에서 받은 우리 몫. 캐시플로우·수금 원장·캘린더가 `finance/our-collections.ts`를 함께 읽는다. 공동중개로 상대에게 줄 몫은 보냈는지와 상관없이 따로 보인다.
- 이 영역의 목적은 세무·손익 관리가 아니라 **직원 정산 계산**이다. 직원 몫은 받은 수수료(부가세 제외, 공동중개면 우리 몫)를 배분율로 나눠 정하고, 사무소 경비는 넣지 않는다. 그래서 고정비와 순이익은 2026-11-22에 화면에서 내렸고 2026-11-25에 코드와 표도 제거했다.

### 사무소 격리
- 법정동 마스터를 뺀 모든 업무 데이터에 `office_id`가 있다. 서버는 요청마다 사용자의 사무소로 범위를 좁힌다.
- 새 표를 만들면 `office_id`를 넣고 `apps/server/src/prisma/prisma.service.ts`의 격리 대상 목록에 올린다.
- 단지(Site)·동·호는 예외다. `officeId = null`이면 모든 사무소가 보는 공공 데이터, 값이 있으면 그 사무소의 비공개 데이터다.
- 공지사항(`Notice`)도 예외다. 에스테잇플로우가 모든 사용자에게 알리는 공지라 `office_id`가 없다. 올리는 것은 운영자(`User.isPlatformAdmin`)만 하고, 앱에는 올리는 화면을 두지 않는다(`/notices/admin` API, 운영 화면은 나중에 별도 사이트).

### 장소 → 매물 → 거래
```
Site → Dong → Unit → Property → ListingIntake → Listing → Match → Deal → Contract
```
- 건물형은 모두 Dong을 거친다. 동 구분이 없는 건물은 `isPlaceholder = true`인 Dong 하나를 두고 화면에서 동 선택을 숨긴다. 단독주택·토지는 Site → Property.
- **Property**는 "우리 사무소가 관리하는 이 호실", **ListingIntake**는 한 번 들어온 의뢰, **Listing**은 그 의뢰의 거래 조건 하나(매매·전세·월세)다.
- 상태는 한 칸에 섞지 않는다. 의뢰의 생명주기(`open | hold | closed`)만 저장하고, 확인 상태와 거래 중·완료 여부는 확인 이력과 Deal에서 계산한다.
- 손님 쪽은 Contact → BuyerIntake(구매 의뢰) → BuyerRequirement(희망조건). 역할(소유자, 매수인, 세입자)은 Contact의 속성이 아니라 관계 표로 나타낸다.
- 단계 값(매칭, 거래, 계약 등)은 `packages/shared/src/enums.ts`가 기준이다.

### 프로젝트
- 의뢰는 프로젝트 없이 존재한다. **Project**는 한 손님과 계속 주고받을 일을 모아 두는 **작업 공간**이고 사용자가 직접 연다. 이름·대표 고객·의뢰가 없어도 열리며(빈 프로젝트를 먼저 만들고 채운다 — Notion의 새 페이지처럼, 사용자 결정 2026-11-22), 서버가 알아서 만들거나 묶지 않는다. 2026-11-21에 "중개 건"(BrokerageCase)에서 이름을 바꿨다.
- 프로젝트의 **대표 고객**은 의뢰의 당사자를 복사한 값이 아니라 사용자가 정한 "누구의 일인가"다. 당사자 목록은 저장하지 않고 담긴 의뢰에서 읽는다.
- **상담은 사람에, 코멘트는 일에** 적는다. 손님과 나눈 대화는 상담(Consultation)이고 연락처를 가리킨다. 직원이 일에 대해 적는 글은 코멘트(`comments` 표, `/comments` API)이고 다섯 축(프로젝트·관리 공간·매물 의뢰·구매 의뢰·거래) 중 정확히 하나를 가리킨다(`num_nonnulls(...) = 1`). "종류 + id"가 아니라 축마다 FK 칸을 둔다.
- **매물 확인은 "오늘 살아 있음을 확인했다"를 찍는 일 하나다**(사용자 결정 2026-11-27·28). 고를 결과가 없고, 의뢰의 확인 칸(확인된 날·다음 확인 날)만 갱신한다. 섞지 않는 것 세 가지: ① 의뢰를 닫는 것은 매물 상태(의뢰 종료)가 한다 — 예전에는 확인 결과 "유효하지 않음"이 의뢰와 매칭까지 닫아 옆의 매물 상태와 같은 일을 두 곳에서 했다. ② 가격을 고치는 것은 거래 조건이 한다. ③ 연락이 안 된 것(부재중)은 찍지 않는다 — 확인되지 않은 채 그대로이고 기한이 지나면 어차피 다시 올라온다. 상담 기록은 집주인과 나눈 이야기를 메모로 적었을 때만 남고, 확인 이력을 담는 표는 두지 않는다. 화면·MCP 도구·통화 분석 제안이 모두 같다: 통화에서 "팔렸다"고 하면 확인이 아니라 의뢰 종료로 반영한다. 확인 칸은 "언제 확인됐나"만 보여 준다.
- **업무(Task)는 프로젝트에 직접 달 수 있다**(`tasks.project_id`, 사용자 결정 2026-11-22). 대표 고객도 의뢰도 없는 빈 프로젝트에서도 할 일을 적기 위해서다. 프로젝트를 풀어도 업무는 남고 연결만 끊긴다. 업무가 있는 프로젝트는 "빈 프로젝트"가 아니다.
- 프로젝트에 빈 자유 문서(페이지)는 넣지 않는다. 가격·조건·일정을 칸이 아니라 글로 적게 되기 때문이다(사용자 결정, 2026-11-21).
- 고객 원장 화면(`/customers-table`, `/customers`)은 2026-11-21에 메뉴에서 뺐고 그 자리에 프로젝트 화면(`/projects`)을 두었다. 원장의 화면·API는 남아 있다.
- 순서는 사람이 정한다(**ProjectStep**). 시스템은 순서를 계산하지 않고 자금 흐름도 계산하지 않는다.
- 고객 원장은 저장된 묶음이 아니라 조회 결과다.
- 프로젝트를 **풀면**(삭제) 메모·직접 적은 단계·코멘트가 지워진다. 그래서 풀기는 대표·매니저만 하고, 평소 정리는 되돌릴 수 있는 **끝내기**로 한다. 아무것도 적지 않은 빈 프로젝트만 만든 사람이 지울 수 있다.
- 새 문서(프로젝트 등)는 대화창이 아니라 **새 탭의 문서**로 연다.

### 권한과 보이는 범위
- 사무소 안에서 매물·고객·거래는 모든 직원이 본다. 예외는 돈이다.
- 중개사(agent)에게는 **담당으로 배정된 거래의 수수료**(청구·요약·조정)만 보인다. 수수료 조회, 거래 응답, MCP 도구가 모두 같은 기준이다(`finance/commission-payment.service.ts`의 `paymentScopeFor`). 거래를 만들면 만든 사람이 담당이 된다 — 담당이 비면 그 거래는 직원 정산과 중개사 화면에서 빠진다.
- 캐시플로우·수금 원장은 대표·매니저, 직원 정산·급여·배분율·수수료 면제는 대표. 매물 삭제와 협의 수수료 정하기는 대표·매니저.
- 화면에서 숨긴 것은 서버에서도 막는다. MCP 도구는 서비스를 바로 부르더라도 화면이 거치는 권한·가리기를 똑같이 거친다.

### 인증
- 직원 로그인은 Auth0. 서버는 접근 토큰의 `sub`로 `User.auth0Id`를 찾는다. 아이디 문자열로 연결하지 않는다.
- 사무소·역할·활성 여부는 토큰이 아니라 요청마다 DB에서 읽는다. 접근을 끊는 기준은 DB(`isActive`, `tokensValidAfter`)다.
- 상세는 `.claude/rules/server.md`, Auth0 테넌트에 올리는 것은 `apps/server/auth0/README.md`.

### 외부 AI 연결 (MCP)
- 제품에 AI를 넣지 않는다. 서버가 MCP 서버(`/mcp`)이고 사용자의 Claude·ChatGPT가 붙는다.
- 외부 사이트 수집과 브라우저 자동화는 서버가 하지 않는다. 사용자 PC의 로컬 Skill이 하고, 서버에는 완전한 결과만 저장한다.
- 상세는 `.claude/rules/mcp.md`.

### 화면
- 색과 타이포의 기준은 코드다: `apps/desktop/src/renderer/app.css`의 토큰과 `components/domain/`의 공유 컴포넌트. 따로 둔 디자인 문서는 없다(`DESIGN.md`는 2026-11-16에 지웠다). 톤은 차분하고 전문적으로, 상자와 띠보다 선과 여백을 쓴다.
- 사용자에게 보이는 문구를 새로 쓸 때는 같은 화면의 기존 문구와 말투를 맞춘다. 낱말과 주소·금액·날짜 표기의 기준은 `CONTEXT.md`의 "화면 낱말과 표기"다.
- 표기와 입력은 공용 함수를 쓴다: 주소 `formatPlaceLabel`(shared), 금액·면적·날짜 `lib/format.ts`, "15억 8천" 같은 금액 글 읽기 `lib/manwon.ts`, 전화번호 입력과 중복 확인 `lib/phone.ts`, 오류 문구 `lib/api-error.ts`, 탭 제목 `hooks/use-tab-title.ts`. 화면마다 따로 만들지 않는다.
- 상세 화면의 기준은 연락처·희망 조건 상세다: 위 얇은 줄, 큰 이름, 속성 한 줄씩, 본문 구역, 오른쪽 열.
- 프로젝트 상세는 **작업 공간**이다(2026-11-23): 큰 이름 아래 머리 두 줄(상태·담당·시작·의뢰 / 고객)만 두고 속성을 한 줄씩 늘어놓지 않는다(사용자 지적: 자리만 차지한다). 본문은 보기 탭(개요·매물·매칭·거래·보수·자료실), 오른쪽 열은 업무와 상담·코멘트를 **그 자리에서 적는** 곳이다. 자료실은 파일 표가 생길 때까지 예시 화면이다.
- 전체 검색(⌘K)과 알림은 사이드바에 있다. 제목줄에는 넣지 않는다.

### 화면 언어 (한국어·영어)
- 화면 코드의 문구는 **한글로 그대로 적는다.** 번역 키를 만들지 않는다. 빌드할 때 한글 문구가 번역 함수 호출로 바뀌고(`apps/desktop/scripts/i18n/core.mjs`), 영어 화면에서는 사전(`apps/desktop/src/renderer/i18n/en/<영역>.json`)에서 그 한글을 찾아 보여 준다. 한국어 화면의 동작은 바뀌지 않는다.
- 새 문구를 적었으면 영어를 사전에 더한다: 그 화면의 영역 파일 `strings`에 `"한글": "English"`. 같은 한글이 그 파일에서만 다른 뜻이면 `files`에 파일 자리를 열쇠로 넣는다. 빠진 것은 `pnpm --filter @estate-erp/desktop i18n:check`로 본다. 사전에 없으면 영어 화면에 한글이 그대로 나온다(깨지지는 않는다).
- 값이 끼는 문구는 템플릿 문자열 하나로 적는다(`` `${n}건 선택` `` → 사전의 `"{0}건 선택": "{0} selected"`). 문장을 `+`나 JSX 조각으로 이어 붙이면 영어에서 어순을 바꿀 수 없다.
- **번역되면 안 되는 한글**에는 `// i18n-ignore`(그 줄)나 `// i18n-ignore-file`(파일 전체)을 단다: 계약서·서식에 인쇄되는 글, 서버에 값으로 저장되어 다시 읽히는 글, 사용자가 친 한글을 읽는 데 쓰는 글("억", "동"·"호" 떼기), 다른 프로그램이 읽는 정해진 꼴의 글.
- `label === '전체'` 같은 견주기는 빌드가 한글과도 그 번역과도 같다고 보게 바꾼다. `includes`·`startsWith`·`split` 같은 검사의 인자는 번역하지 않는다(대개 서버가 준 글이나 사용자가 친 글에 하므로). 번역된 이름표에 이런 검사를 하지 말고 코드 값(enum)으로 가린다. `'만원'.length`처럼 글자 수·자리를 세는 한글 글자열도 번역하지 않는다(번역하면 수가 달라진다) — 변수에 담아 세는 것은 빌드가 알 수 없으니 그 줄에 `// i18n-ignore`를 단다.
- 금액은 영어에서 `₩1.58B`·`₩50M`처럼 적는다(`formatPrice`). 금액을 손으로 `${n}만`처럼 잇지 말고 `lib/format.ts`를 쓴다 — 손으로 이은 것은 영어에서 숫자를 바꿔 적을 수 없다.
- 언어는 설정 › 계정 및 언어에서 고르고, 고르지 않으면 한국어다(기기 언어를 따라가지 않는다). 바꾸면 열린 화면을 모두 다시 불러오는데, 작성 중인 것이 있는 화면(열린 대화창·저장 전 변경·올리는 중인 파일 — 탭을 버려도 되는지 가리는 기준과 같다)은 그것이 끝날 때까지 예전 언어로 남는다(`i18n/locale-reload.ts`).
- 서버는 오류 문구를 한글로만 준다. 영어 화면은 그 문구를 사전(`en/_server.json`)에서 찾아 바꿔 보여 준다(`lib/api-error.ts`). 서버에 새 오류 문구를 적으면 거기에도 더한다.

## 어디에 무엇이 있나

| 알고 싶은 것 | 볼 곳 |
| --- | --- |
| 표와 칸, 제약 | `prisma/schema/*.prisma` (주석에 이유가 적혀 있다) |
| 단계·상태 값 | `packages/shared/src/enums.ts` |
| 서버 API | `apps/server/src/modules/<영역>/*.controller.ts`, 실행 중이면 `/api-docs` |
| MCP 도구 | `apps/server/src/modules/mcp/mcp-tools.service.ts` |
| 화면 | `apps/desktop/src/renderer/routes/_authenticated/<화면>/` |
| 업무 용어의 뜻, 화면 낱말과 표기 | `CONTEXT.md` |
| 영역별 요약과 불변 조건 | `docs/DATA_STRUCTURE.md` |
| 제품 범위와 방향 | `docs/prd.md`, `docs/PRODUCT_STRATEGY.md`, `docs/DECISIONS.md` |

`docs/` 안에서 파일 이름에 날짜가 붙은 보고서와 `docs/mockups`, `docs/ui-reference-research` 등은 그 시점의 조사·시안이다. 지금의 사실로 읽지 않는다.

## 작업 방식

- 커밋과 푸시는 사용자가 요청할 때만 한다.
- 되돌리기 어려운 일(데이터 삭제, 공용 DB 변경, 테넌트 설정 변경, 배포)은 먼저 묻는다.
- 확인하지 못한 것은 확인하지 못했다고 말한다.
