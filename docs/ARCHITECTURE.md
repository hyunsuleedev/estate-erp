# Estate ERP Architecture

이 문서는 제품 구조와 기술 선택을 설명한다. 제품 요구사항 자체는 [prd.md](./prd.md)를 기준으로 본다.

## 관련 문서

- [prd.md](./prd.md)
- [DATA_STRUCTURE.md](./DATA_STRUCTURE.md)
- [LOCAL_INFRA.md](./LOCAL_INFRA.md)
- [DECISIONS.md](./DECISIONS.md)

---

## 1. 전체 구조

Estate ERP는 하나의 앱이 아니라, 같은 도메인 모델을 공유하는 여러 실행 환경으로 구성된다.

### 제품 패키지

| 제품 | 역할 |
|------|------|
| Electron 데스크톱 앱 | 메인 업무 환경 |
| 웹 앱 | 브라우저 접근 채널 |
| NestJS 서버 | API, 인증, 멀티테넌시, 규칙 엔진, CRM MCP |
| CTI Bridge | 전화 시스템 연동용 별도 로컬 프로세스 |
| Android 모바일 앱 | 전화 오버레이, 통화 후 입력 |
| 독립 자동화 Skills | CP 수집·실행, 로컬 계정 설정, Skill 소유 브라우저 제어 |

### 시스템 토폴로지

```
Electron Desktop / Web / Mobile
        ↓
    NestJS Server
        ↓
PostgreSQL + Redis + S3/R2
```

CTI Bridge와 독립 자동화 Skills는 서버 밖에서 추가로 연결된다.

```
전화 시스템
→ CTI Bridge
→ Electron Desktop
→ NestJS Server
→ 팀원 앱들
```

---

## 2. 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | NestJS + TypeScript |
| ORM | Prisma |
| DB | PostgreSQL + PostGIS |
| Cache / Queue | Redis + BullMQ |
| Realtime | Socket.io |
| Auth | Auth0 (직원 로그인, MCP OAuth) + 자체 DB의 사용자·사무소·역할 |
| Email | Resend + React Email |
| File Storage | S3 / Cloudflare R2 |
| Desktop | Electron + React 19 + Vite |
| Web | Vite SPA + React 19 |
| Mobile | React Native (Android only) |
| Shared Packages | `packages/shared`, `packages/api-client` |

---

## 3. 서버 아키텍처

### 3.1 NestJS 역할

NestJS 서버는 다음을 담당한다.

- REST API
- 인증과 권한
- 사무소별 멀티테넌시
- WebSocket 브로드캐스트
- BullMQ 규칙 엔진
- CRM MCP Server 인터페이스
- ActivityLog 기반 감사 추적

### 3.2 모듈 기준

현재 핵심 모듈은 다음 범주로 나뉜다.

```
auth
properties / listings
contacts / tenants / property-contacts
buyer-requirements / consultations / matches / deals
tasks / calendar-events / insights
notifications
mcp
```

### 3.3 멀티테넌시

- 모든 비즈니스 데이터는 `office_id`를 가진다.
- 사무소별 격리는 서버 레이어에서 강제한다.
- 법정동 마스터처럼 전역 참조 데이터만 예외다.

### 3.4 감사 추적

- 핵심 엔터티의 변경은 `ActivityLog`로 남긴다.
- 출처는 `web`, `mcp`, `system`으로 구분한다.
- AI 또는 자동화가 만든 변경도 같은 감사 체계에 포함한다.

---

## 4. 데스크톱 / 웹 / 모바일 역할 분리

### 4.1 Electron 데스크톱

데스크톱 앱은 다음 기능 때문에 메인 제품이다.

- 설치형 신뢰감
- 로컬 CTI 연동
- 시스템 트레이 / OS 알림
- 장시간 상주 실행

### 4.2 웹 앱

웹 앱은 CTI가 필요 없는 사용자용 접근 경로다.

- 데스크톱 설치 없이 사용 가능
- 사장님/원격 사용자 대응
- 서버 API와 shared package를 재사용

### 4.3 모바일

모바일은 Android 전용으로 설계한다.

- 전화 수신 감지
- 통화 오버레이
- 통화 종료 후 상담 입력
- 푸시 알림과 현장 사용성 확보

---

## 5. CTI 연동 구조

인프록 SDK 제약 때문에 CTI는 별도 브리지 프로세스로 분리한다.

### 데스크톱 흐름

```
전화 수신
→ 인프록 서버
→ CTI Bridge (32비트)
→ 로컬 WebSocket/TCP
→ 메인 PC Electron
→ NestJS 서버
→ 모든 직원 앱에 브로드캐스트
```

### 모바일 흐름

```
전화 수신
→ Android 네이티브 이벤트
→ 로컬 캐시 연락처 매칭
→ 오버레이 팝업
→ 통화 종료 후 상담 기록
```

---

## 6. MCP 아키텍처

### 6.1 핵심 원칙

CRM 자체를 MCP 서버처럼 설계한다. 즉, NestJS API를 잘 만드는 것이 곧 CRM MCP 도구 체계를 만드는 방향이다.

### 6.2 CRM MCP Server

외부 AI가 다음 범주의 도구를 호출할 수 있어야 한다.

- 매물 검색/조회/등록
- 연락처 검색/조회/등록
- 상담 기록 조회/등록
- 태스크 생성/완료
- 매칭/거래 조회 및 업데이트
- 인사이트/알림 검토

#### 인증과 연결

`/mcp`가 받는 자격은 두 가지뿐이다.

| 자격 | 쓰는 곳 | 확인 방법 |
|------|---------|-----------|
| OAuth 접근 토큰 | Claude, ChatGPT, Codex CLI 같은 외부 AI 클라이언트 | Auth0가 MCP 전용으로 발급한 토큰. 대상(`aud`)이 이 서버의 MCP 주소이고 `mcp:tools` scope가 있어야 한다 |
| `esk_` API 키 | 스크립트·자동화 | `Authorization: Bearer esk_…`. 직원별 1개, 우리 DB에서 확인 |

- **대상 분리**: MCP에는 직원 REST API와 별개의 Auth0 API(resource server)를 둔다. 식별자는 서버가 광고하는 MCP 주소(`MCP_RESOURCE_URL`, 운영 `https://api.estaitt.com/mcp`)와 글자 그대로 같다. MCP 토큰은 REST API에서 거절되고, 데스크톱 앱의 REST 토큰은 `/mcp`에서 거절된다. REST API는 토큰을 받은 앱(`azp`)이 데스크톱 앱인지도 확인한다(`AUTH0_STAFF_CLIENT_IDS`).
- **찾기(discovery)**: 인증 없는 요청에는 `401`과 `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp", scope="mcp:tools"`로 답한다. 그 문서(RFC 9728)가 인가 서버로 Auth0 테넌트를 가리키고, 클라이언트는 Auth0의 `/.well-known/oauth-authorization-server`에서 나머지를 찾는다.
- **클라이언트 등록**: 클라이언트가 스스로 한다. Client ID Metadata Document(CIMD, 권장)와 Dynamic Client Registration(DCR)을 둘 다 켜 둔다. 이렇게 등록된 앱은 Auth0에서 "외부 앱"이라 MCP API의 토큰만 받을 수 있고, 사용자는 처음 연결할 때 Auth0 동의 화면에서 수락해야 한다.
- **로그인**: Auth0 로그인 페이지에서 아이디·비밀번호로 한다. 클라이언트는 `resource`(MCP 주소)와 PKCE를 반드시 보낸다. refresh token이 필요하면 `offline_access`를 함께 요청한다.
- **사용자**: 토큰의 `sub`(Auth0 user_id)로 기존 직원을 찾는다. MCP 로그인으로는 ERP 사용자를 만들지 않는다. 비활성 직원, 사무소 없는 계정은 거절한다. 도구별 권한은 OAuth scope가 아니라 직원의 역할이 정한다.
- 구현: `apps/server/src/modules/mcp/mcp-auth.guard.ts`, `oauth-discovery.controller.ts`, `mcp-oauth.config.ts`.

Auth0 테넌트에 필요한 설정(환경마다 한 번):

1. API 생성: 식별자 = 그 환경의 MCP 주소(끝에 `/` 없음), RS256, Allow Offline Access 켬, 권한 `mcp:tools`. 접근 정책은 사용자 `require_client_grant`, 앱(M2M) `deny_all`.
2. 외부 앱 기본 권한: `client-grants`에 `default_for: third_party_clients`, 그 API, `mcp:tools`, `subject_type: user`. 다른 API에는 만들지 않는다(외부 앱이 REST API 토큰을 받지 못하게).
3. 테넌트 설정: Dynamic Client Registration, Client ID Metadata Document Registration + Dynamic CIMD Registration, Resource Parameter Compatibility Profile, Include Issuer in Authorization Responses, 동의 화면에 권한 설명 사용(`use_scope_descriptions_for_consent`).
4. 아이디·비밀번호 연결을 도메인 수준으로 올린다(`is_domain_connection`). 외부 앱은 도메인 수준 연결만 쓸 수 있다.
5. 서버 환경 변수: `MCP_RESOURCE_URL`, `AUTH0_STAFF_CLIENT_IDS`(그 테넌트의 데스크톱 앱 client ID).

DCR을 켜면 누구나 테넌트에 앱을 등록할 수 있다(초당 5회 제한). 등록 주소를 IP 등으로 제한하는 기능은 Auth0 Enterprise 요금제에만 있다. 등록된 외부 앱은 MCP API 말고는 접근할 수 없다.

### 6.3 독립 로컬 Skills

사용자 PC의 브라우저와 계정이 필요한 CP 작업은 Electron 메인 프로세스가 아니라
독립 Skill로 분리한다. Skill은 ERP의 원격 MCP를 데이터 경계로 사용한다.

예시:

- 이실장·부동산뱅크 광고 수집 및 승인된 광고 실행
- 네이버 부동산 읽기
- Skill 전용 `config.js` 설정과 Skill 소유 agent-browser 로그인

Electron은 CP 비밀번호를 저장하지 않으며 CP 인증용 로컬 MCP를 열지 않는다.

### 6.4 제품 내장 AI를 하지 않는 이유

- 모델 비용을 제품이 직접 부담하지 않기 위해
- 모델 업그레이드 속도를 외부 AI에 위임하기 위해
- 제품은 데이터/권한/업무 흐름에 집중하기 위해

---

## 7. 데이터 모델의 핵심 구조

상세 스키마는 [DATA_STRUCTURE.md](./DATA_STRUCTURE.md)를 본다. 여기서는 제품 구조를 이해하는 데 필요한 최소 개념만 정리한다.

### 7.1 장소와 매물의 체인

아파트/오피스텔:

```
Site → Dong → Unit → Property → Listing
```

빌라/다세대:

```
Site → Unit → Property → Listing
```

단독/토지:

```
Site → Property → Listing
```

### 7.2 Listing 중심 설계

- `Property`는 장소 레코드다.
- 거래유형, 가격, 확인상태 같은 실제 거래 정보는 `Listing`이 가진다.
- 따라서 매칭, 거래, 가격 이력, 네트워크 공유는 `Listing`을 중심으로 연결된다.

### 7.3 주요 크로스컷팅 규칙

- 가격은 만원 단위
- 면적은 m² 기준
- 주소는 법정동 코드 기반 정규화
- 외부 단지 코드는 별도 컬럼으로 유지

---

## 8. 모노레포 구조

```
apps/
  server/
  desktop/
  web/
  mobile/
  cti-bridge/
packages/
  shared/
  api-client/
  mcp-server/
prisma/
docs/
```

### 구조 원칙

- UI 코드는 desktop/web에서 독립적으로 가져간다.
- 타입/enum/API 호출은 workspace package에서 공유한다.
- Prisma schema를 source of truth로 유지한다.

---

## 9. 자동화 레이어

광고 provider 자동화는 서버 규칙 엔진과 분리한다. 사용자가 자신의 외부 AI를
시작하면 MCP로 `Task(category=advertisement, status=pending)`를 조회하고
`claim_task`로 선점한다. 상세 단계·재시도·검증은 로컬 Skill SQLite에 남고,
서버에는 일반 Task 상태와 완전하게 검증된 광고 관측 결과만 저장한다.

서버는 광고 agent session, wakeup, run, action request를 생성하거나 polling하지
않는다. 네이버 단지 수집 범위도 로컬 `naver-complex-collector`가 소유한다.

### 9.1 규칙 엔진

ERP 내부 알림·기한 업무 자동화는 BullMQ 기반 규칙 엔진이 담당한다.

예시:

- 매물 확인일 경과
- 가격 변동 감지
- 매칭 후보 발생
- 계약 일정 임박

### 9.2 n8n 검토

n8n은 나중에 외부 자동화 레이어로 붙일 수 있지만, 초기 핵심은 아니다.

- 장점: 시각적 워크플로우, 재시도, 스케줄링
- 단점: 설치/운영 부담, 품질 통제 약화

현 시점 방침은 **CRM API와 웹훅을 먼저 잘 설계**하는 것이다.

---

## 10. 구현 참고 포인트

- 멀티테넌시 강제
- MCP 도구 설계와 API 설계 일치
- ActivityLog 기본 포함
- 데스크톱과 서버가 느슨하게 결합되도록 유지
- 외부 연동은 서버가 아니라 로컬에서 실행 가능한 구조를 우선 고려
