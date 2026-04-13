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

### 시스템 토폴로지

```
Electron Desktop / Web / Mobile
        ↓
    NestJS Server
        ↓
PostgreSQL + Redis + S3/R2
```

CTI와 로컬 MCP는 서버 밖에서 추가로 연결된다.

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
| Auth | Passport.js + JWT |
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
- 로컬 MCP Host
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

### 6.3 로컬 MCP Host

서버가 아니라 사용자 PC에서 동작해야 하는 작업은 Electron 메인 프로세스 쪽 MCP로 분리한다.

예시:

- 네이버 부동산 스크래핑
- 로컬 세션이 필요한 외부 사이트 작업
- 향후 로컬 문서/파일 자동화

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

### 9.1 규칙 엔진

초기 자동화는 BullMQ 기반 규칙 엔진이 담당한다.

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
