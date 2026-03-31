# Estate ERP — 부동산 중개사 전용 ERP 시스템

**프로젝트 기획 보고서 (PRD)**

- 작성일: 2026년 3월 25일
- 작성자: Hyunsu
- 최종 수정: 2026년 3월 28일

---

## 1. 프로젝트 개요

대한민국 부동산 중개사무소를 위한 통합 ERP 시스템. 매물 관리, 고객 매칭, 거래/계약, 회계/정산, 직원 관리, 광고 관리, 서류 자동화를 하나의 플랫폼에서 처리한다.

### 핵심 차별점

- **MCP(Model Context Protocol) 기반 AI 연동 아키텍처** — CRM 자체가 MCP 서버로 동작하여 Claude/ChatGPT 등 외부 AI에서 직접 연결 가능
- **스크래핑, 서류 등 외부 기능은 별도 MCP로 분리**하여 AI가 조합
- **사무소 간 네트워크 매물 공유** — 킬러 피쳐로 네트워크 효과 및 락인 유도

### 비즈니스 모델

SaaS 구독형 (월 과금)

### 타겟 사용자

- **Primary**: 여러 명이 일하는 중개법인/팀
- **Secondary**: 1인 중개사

---

## 2. 기존 estate-crm 분석

기존 프로젝트는 Electron + React + Supabase 기반 테스트 프로젝트로, 22개 테이블의 DB 스키마와 도메인 모델이 설계되어 있다.

### 2.1 가져갈 것

- DB 스키마 설계 (22개 테이블, Prisma로 변환)
- 도메인 모델 / TypeScript 타입 정의
- 비즈니스 로직 설계 (매칭/거래/계약 파이프라인)
- Electron 구조 (main/preload/renderer)

### 2.2 버리는 것

- Supabase 의존성 (직접 구축으로 전환)
- Mock API 레이어
- 보일러플레이트 코드

---

## 3. 기술 스택 결정

### 3.1 백엔드 — NestJS (직접 구축)

Supabase를 완전히 걷어내고 NestJS로 직접 구축한다. Edge Functions 제약, Realtime 연결 수 제한, CTI/AI 에이전트 조율 등 세밀한 서버 로직이 필요하며, 벤더 락인 없이 범용 인프라만 사용한다.

| 구성요소 | 기술 | 용도 |
|---------|------|------|
| ORM | Prisma | 타입 안전 DB 접근 |
| DB | PostgreSQL | 메인 데이터베이스 |
| 캐시/큐 | Redis + BullMQ | 캐시, 잡 큐, Socket 어댑터 |
| 실시간 | Socket.io | CTI 브로드캐스팅, 팀 동기화 |
| 인증 | Passport.js + JWT | 사무소별 인증 |
| 이메일 | Resend + React Email | 트랜잭션 이메일 |
| 파일 | S3 / Cloudflare R2 | 문서/이미지 저장 |

### 3.2 프론트엔드 — Electron 데스크톱 (메인)

한국 부동산 사장님들이 웹앱을 안 믿는 문화적 특성상 "설치형 프로그램"이 필수. CTI Bridge 로컬 통신, 로컬 MCP 서버 호스팅, 시스템 트레이 상주 등 Electron이 필요한 기능적 이유도 있다.

| 구성요소 | 기술 |
|---------|------|
| UI | React 19 + TypeScript |
| 라우팅/데이터 | TanStack (Router, Query, Table, Form) |
| 스타일 | Tailwind CSS v4 + shadcn/ui |
| 빌드 | Vite + electron-builder |

### 3.3 웹 앱 — Vite SPA (사장님용)

Electron 설치 없이 브라우저에서 접근하는 웹 버전. CTI 기능은 제외하되, 매물/고객/거래 관리 등 CRM 핵심 기능을 동일하게 제공한다. 데스크톱 앱과 UI 코드는 독립적으로 유지하되, `packages/shared`(타입/enum)와 `packages/api-client`(API 호출)를 공유한다.

| 구성요소 | 기술 |
|---------|------|
| UI | React 19 + TypeScript |
| 라우팅/데이터 | TanStack (Router, Query, Table, Form) |
| 스타일 | Tailwind CSS v4 + shadcn/ui |
| 빌드 | Vite |

### 3.4 모바일 — React Native (Android only)

전화 수신 감지 + 오버레이 팝업이 핵심 기능으로 PWA로는 불가능. 통화 종료 후 상담 기록 빠른 등록, 연락처 매칭을 위한 로컬 캐시가 필요하여 네이티브 선택. Android만 지원 (통화 녹음, `SYSTEM_ALERT_WINDOW` 오버레이 등 Android 전용 기능 필요). 기존 TypeScript/React 스택과의 코드 공유를 위해 Flutter 대신 React Native 선택.

### 3.5 실시간 통신

| 용도 | 방식 | 레이턴시 |
|------|------|---------|
| CTI 전화 팝업 (데스크톱) | Socket.io (서버 브로드캐스트) | 100~300ms |
| CTI 전화 팝업 (모바일) | 네이티브 전화 이벤트 | 즉시 |
| 매물/태스크 동기화 | Socket.io | 1~3초 |
| 팀 접속 상태 | Socket.io Presence | 실시간 |

---

## 4. 시스템 아키텍처

### 4.1 전체 구조

**Electron 데스크톱 앱** (모든 직원 PC)
- React UI (CRM 전체 기능)
- CTI Bridge 클라이언트 (별도 프로그램과 로컬 통신)
- 시스템 트레이 + OS 네이티브 알림
- 로컬 MCP Host (Electron 메인 프로세스에 내장) — Claude Desktop/ChatGPT 연결 가능
- 자동 업데이트 (electron-updater)

**CTI Bridge** (사무실 메인 PC 1대, 별도 32비트 프로세스)
- 인프록 SDK 연결 (32비트)
- 전화 이벤트 감지
- 로컬 WebSocket/TCP로 Electron에 이벤트 전송

**NestJS 서버** (클라우드)
- CRM API + CRM MCP Server
- WebSocket (CTI 이벤트 브로드캐스트 + 팀 동기화)
- 규칙 엔진 (BullMQ cron jobs)
- Postgres + Redis + S3
- Auth + 멀티테넌시

**React Native 모바일** (직원 폰)
- 전화 수신 감지 + 오버레이 팝업
- 통화 후 상담 기록 빠른 등록
- 푸시 알림

### 4.2 CTI 전화 연동 흐름

**데스크톱 흐름:**

```
전화 수신 → 인프록 서버 → CTI Bridge (32비트) → 로컬 WebSocket → 메인 PC Electron → NestJS 서버 → 모든 직원 Electron에 팝업
```

**모바일 흐름:**

```
전화 수신 → React Native 네이티브 이벤트 → 로컬 캐시 연락처 매칭 → 오버레이 팝업 → 통화 종료 → 상담 기록 등록
```

### 4.3 제품 패키지

| # | 제품 | 설치/접근 대상 | 비고 |
|---|------|-------------|------|
| 1 | CRM 데스크톱 앱 (Electron) | 모든 직원 PC | 메인 제품 (CTI, MCP Host 포함) |
| 2 | CRM 웹 앱 (Vite SPA) | 브라우저 | CTI 없이, 사장님/원격 사용자용 |
| 3 | CTI Bridge (32비트) | 사무실 메인 PC 1대 | 인프록 연동 |
| 4 | 모바일 앱 (React Native) | 직원 안드로이드 폰 | 전화 오버레이 + 녹음 |

### 4.4 NestJS 모듈 구조

```
server/src/modules/
  auth/          # 인증, 구독, 사무소 관리
  properties/    # 매물 CRUD + 비즈니스 로직
  contacts/      # 연락처/고객
  matches/       # 매칭 파이프라인
  deals/         # 거래/계약
  tasks/         # 업무 관리
  cti/           # 전화 이벤트 WebSocket
  insights/      # 규칙 엔진 (가격변동, 확인일 경과 등)
  notifications/ # 알림 (푸시, 인앱)
  mcp/           # CRM MCP Server 인터페이스
```

---

## 5. MCP 아키텍처 (핵심 전략)

### 5.1 전략적 배경

2026년 현재 Monday.com, Asana, GitHub, Sentry, Atlassian 등 주요 SaaS가 MCP 서버를 출시하고 있다. 부동산 중개 분야에서 MCP 기반 AI 연동을 하는 제품은 아직 없으며, 이는 **선점 기회**이다.

### 5.2 CRM MCP Server (최우선)

CRM이 외부 AI에서 연결 가능한 MCP 서버를 제공한다. NestJS API를 잘 만드는 것이 곧 CRM MCP 서버를 만드는 것이다.

**노출하는 MCP 도구 예시:**

| 카테고리 | 도구 | 설명 |
|---------|------|------|
| 매물 | `search_properties`, `get_property`, `create_property` | 매물 검색/조회/등록 |
| 고객 | `search_contacts`, `get_contact`, `create_contact` | 고객 검색/조회/등록 |
| 상담 | `get_consultations`, `create_consultation` | 상담 기록 조회/등록 |
| 태스크 | `get_tasks`, `create_task`, `complete_task` | 업무 관리 |
| 매칭 | `get_matches`, `create_match` | 매칭 파이프라인 |
| 거래 | `get_deals`, `create_deal`, `update_deal_stage` | 거래 진행 관리 |
| 인사이트 | `get_insights`, `approve_insight` | 감지 알림 관리 |

### 5.3 로컬 MCP 서버 (Electron 호스팅)

사용자 PC에서 실행되어야 하는 MCP. AI가 연결해서 호출한다. 서버에서 돌리면 IP 차단, 로그인 세션, 법적 리스크 문제가 있다.

**네이버 부동산 MCP** (별도 프로젝트):

- `search_listings` — 네이버 매물 검색
- `get_listing_detail` — 매물 상세
- `get_price_history` — 시세 변동
- `compare_prices` — 가격 비교
- `get_ad_rankings` — 광고 순위

**향후 추가 가능:**

- 등기부등본 MCP
- 부동산거래관리시스템(RTMS) MCP
- 기타 정부 시스템 연동

### 5.4 AI 내장 안 함

제품 안에 AI 엔진을 넣지 않는다. CRM MCP가 잘 만들어져 있으면 사용자가 이미 쓰는 Claude/ChatGPT에 연결하면 된다. AI API 비용을 부담하지 않고, AI 모델 업그레이드 혜택을 자동으로 받으며, CRM 본질에 집중할 수 있다.

**대신 규칙 엔진** (BullMQ cron jobs):

- 네이버 매물 가격 변동 감지 → 태스크 자동 생성
- 매물 확인일 7일 경과 → 알림
- 구매고객 조건 매칭 매물 등장 → 알림
- 계약 마감일 임박 → 알림
- 광고 순위 변동 → 알림

---

## 6. 데이터 구조 설계 (개선안)

### 6.1 기존 구조의 문제점

기존 estate-crm의 22개 테이블을 기반으로 하되, 다음 문제점을 개선한다.

| 문제 | 현재 상태 | 영향 |
|------|----------|------|
| 주소 필드 비정규화 | city, district, dong이 자유 텍스트 | 검색/필터 불안정 (서울시 vs 서울특별시) |
| 도로명/지번 미구분 | address 단일 필드 | 등기부(지번) vs 네이버(도로명) 연동 불가 |
| 법정동코드(PNU) 없음 | 미지원 | 정부 시스템 연동 불가 |
| 좌표(lat/lng) 없음 | 미지원 | 지도 기반 매물 표시/매칭 불가 |
| 단지코드 없음 | 미지원 | 네이버/KB 외부 서비스 연동 불가 |
| 매물유형별 유연성 부족 | Building→Dong→Unit 강제 | 단독주택/토지에 억지 Unit 필요 |
| 면적 단위 | 평만 저장 | 공식 단위(m²) 미지원 |
| 멀티테넌시 없음 | office_id 미존재 | SaaS 데이터 격리 불가 |

### 6.2 개선된 주소/매물 구조

```
[기존]
buildings (city, district, dong, address 자유텍스트)
  → dongs → units → properties

[개선안]
offices (SaaS 멀티테넌시 - 최상위)
  → sites (정규화 주소 + 외부 연동 코드)
    → dongs (nullable - 단독주택/토지는 없음)
      → units (nullable - 토지는 없음)
        → properties (office_id + site_id 직접 참조)
```

### 6.3 offices 테이블 (신규)

SaaS 멀티테넌시의 핵심. 모든 데이터가 사무소 단위로 격리된다.

```sql
CREATE TABLE offices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,     -- 사무소 코드 (자동 생성, "GD7291" 등, 직원 loginId 접두사)
  name            text NOT NULL,            -- 사무소명
  license_no      text,                     -- 중개업 등록번호
  ceo_name        text,                     -- 대표 중개사
  phone           text,
  address         text,                     -- 사무소 주소
  subscription    text NOT NULL DEFAULT 'basic'
                  CHECK (subscription IN ('basic','pro','premium')),
  max_users       int NOT NULL DEFAULT 3,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### 6.4 법정동 코드 마스터 (신규)

공공데이터포털(data.go.kr)에서 import하는 읽기 전용 마스터 데이터. 주소 정규화의 근간.

```sql
CREATE TABLE provinces (
  code    varchar(2) PRIMARY KEY,       -- "11" = 서울
  name    text NOT NULL UNIQUE          -- 서울특별시
);

CREATE TABLE districts (
  code          varchar(5) PRIMARY KEY,  -- "11740" = 강동구
  province_code varchar(2) NOT NULL REFERENCES provinces(code),
  name          text NOT NULL,
  UNIQUE (province_code, name)
);

CREATE TABLE wards (
  code          varchar(10) PRIMARY KEY, -- "1174010100" = 고덕동
  district_code varchar(5) NOT NULL REFERENCES districts(code),
  name          text NOT NULL,
  UNIQUE (district_code, name)
);
```

### 6.5 sites 테이블 (개선, 기존 buildings)

주소를 법정동 마스터 FK로 정규화하고 (기존 자유텍스트 제거), 외부 단지코드를 시스템별로 분리하며, 타입별 가변 속성은 JSONB로 관리한다.

```sql
CREATE TABLE sites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id       uuid REFERENCES offices(id),  -- nullable (중앙 데이터)
  type            text NOT NULL CHECK (type IN (
                    'apartment','officetel','villa','house',
                    'commercial','land','living_accommodation')),
  name            text NOT NULL,            -- 단지명/건물명

  -- 법정동 코드 (마스터 테이블 FK — 기존 sido/sigungu/eupmyeondong 자유텍스트 대체)
  ward_code       varchar(10) NOT NULL REFERENCES wards(code),

  -- 도로명주소
  road_name       text,
  road_building_main int,
  road_building_sub  int,
  road_address    text,                     -- 전체 도로명주소 (표시용)

  -- 지번주소
  jibun_main      text,
  jibun_sub       text,
  jibun_address   text,                     -- 전체 지번주소 (표시용)

  -- 좌표 (Prisma fallback + PostGIS geometry)
  lat             numeric,
  lng             numeric,
  -- location     geometry(Point, 5179),   -- PostGIS (migration SQL에서 추가)

  -- 외부 연동 코드 (자체 UUID가 PK, 외부 코드는 매핑용)
  kapt_complex_code  text,                  -- K-apt 단지코드 (아파트만)
  naver_complex_code text,                  -- 네이버 부동산 (아파트+오피스텔+빌라)
  kb_complex_code    text,                  -- KB 부동산
  zip_code        text,

  -- 공통 부가정보
  total_units     int,
  total_dongs     int,
  built_year      int,

  -- 타입별 가변 속성 (JSONB)
  -- 아파트: { parkingCount, heatingType, floorAreaRatio }
  -- 토지:   { landUseZone, landCategory, landArea }
  -- 상가:   { floorInfo, mainUse }
  metadata        jsonb,

  is_locked       boolean NOT NULL DEFAULT false, -- 중앙 데이터 잠금
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_sites_ward ON sites(ward_code);
CREATE INDEX idx_sites_type ON sites(type);
CREATE INDEX idx_sites_kapt ON sites(kapt_complex_code) WHERE kapt_complex_code IS NOT NULL;
CREATE INDEX idx_sites_naver ON sites(naver_complex_code) WHERE naver_complex_code IS NOT NULL;
CREATE INDEX idx_sites_name ON sites USING GIN(name gin_trgm_ops);  -- 퍼지 검색
-- CREATE INDEX idx_sites_location ON sites USING GIST(location);   -- PostGIS 공간 인덱스
```

### 6.6 site_unit_types 테이블 (신규, 평형 카탈로그)

단지별 평형 타입 정의. 네이버 부동산 `pyeongList` API와 1:1 대응. 같은 타입(84A)은 단지 내 어느 동이든 동일한 면적/방수를 가지므로, 단지 레벨에서 한 번만 정의하고 개별 Unit이 FK로 참조한다.

```sql
CREATE TABLE site_unit_types (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id           uuid REFERENCES offices(id),  -- nullable (공공데이터)
  site_id             uuid NOT NULL REFERENCES sites(id),

  name                text NOT NULL,            -- 타입명 (84A, 59B, 133A)
  name_type           text,                     -- 변형 문자 (A, B, C, D)

  -- 면적 (m² 기준)
  exclusive_area_m2   numeric,                  -- 전용면적
  supply_area_m2      numeric,                  -- 공급면적
  contract_area_m2    numeric,                  -- 계약면적

  -- 구조
  room_count          int,                      -- 방 수
  bath_room_count     int,                      -- 욕실 수
  household_count     int,                      -- 해당 타입 총 세대수

  -- 부가 정보
  entrance_type       text,                     -- 주출입(10) / 부출입(20)
  direction           text,                     -- 향 (SS=남남, ES=동남 등)
  is_duplex           boolean NOT NULL DEFAULT false,

  -- 외부 연동
  naver_pyeong_no     text,                     -- 네이버 평형번호

  -- 평면도 이미지
  floor_plan_urls     jsonb,                    -- 평면도 URL

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (site_id, name)
);

CREATE INDEX idx_site_unit_types_site ON site_unit_types(site_id);
```

### 6.7 units 테이블 (개선)

면적을 공식 단위(m²)로 저장하고, `floor`/`lineNo`로 동별 그리드 좌표를 관리한다. `site_unit_type_id` FK로 평형 카탈로그를 참조하여 면적 중복 저장을 제거한다.

```sql
CREATE TABLE units (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id           uuid REFERENCES offices(id),  -- nullable
  site_id             uuid NOT NULL REFERENCES sites(id),
  dong_id             uuid REFERENCES dongs(id),    -- nullable
  site_unit_type_id   uuid REFERENCES site_unit_types(id),  -- 평형 타입 FK

  name                text NOT NULL,            -- 호수 (3501호)
  floor               int,                      -- 층 (35)
  line_no             int,                      -- 라인번호 (그리드 컬럼)

  -- 면적 (SiteUnitType에서 가져오는 것이 정석, 타입 미지정 시 fallback)
  exclusive_area_m2   numeric,    -- 전용면적 m²
  supply_area_m2      numeric,    -- 공급면적 m²

  is_piloti           boolean NOT NULL DEFAULT false,  -- 필로티 여부

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_units_site_dong_floor ON units(site_id, dong_id, floor);
```

### 6.8 properties 테이블 (개선)

unit_id를 nullable로 변경하고 site_id를 직접 참조하여, 토지/단독주택도 유연하게 지원한다.

```sql
-- 핵심 변경: unit_id nullable + site_id 직접 참조
site_id         uuid NOT NULL REFERENCES sites(id),
unit_id         uuid REFERENCES units(id),    -- nullable (토지/단독은 null)
office_id       uuid NOT NULL REFERENCES offices(id),

-- 매물 유형별 연결 방식:
-- 아파트/오피스텔: site → dong → unit → property (풀 체인)
-- 빌라/다세대:     site → unit → property (dong 생략)
-- 단독주택:        site → property (unit/dong 없음)
-- 토지:            site → property (unit/dong 없음)
-- 상가:            site → unit → property
```

### 6.9 추가 모델 (Prisma 스키마 기준)

**OfficeSite** — 사무소별 관리 단지 즐겨찾기

```
office_id + site_id 복합키. 사무소가 관심 있는 단지를 즐겨찾기로 등록.
```

**ContactRelation** — 사람 간 관계

```
main_contact_id + related_contact_id + relation_type (parent, spouse, child, sibling, colleague, friend, referral, other)
```

**PropertyContact** — 매물-연락처 역할 매핑

```
property_id + contact_id + role (owner, buyer, tenant, agent, referrer, other)
```

**Tenant** — 세입자 정보

```
property_id + contact_id + 보증금/월세/계약기간 등
```

**CalendarEvent** — 일정

```
office_id + user_id + event_type (viewing, meeting, call, deadline, personal, other) + 시작/종료 시간
```

### 6.10 공동 중개망 테이블 (신규, 킬러 피쳐)

카카오톡 그룹방처럼 "중개방(Room)" 기반의 매물 공유 네트워크. 부동산 지역회, 동종업자 모임 등이 활용하는 공동 중개 플랫폼.

**핵심 컨셉:**
- 모든 사용자가 접근 가능한 **공개 중개방** (1개, 시스템 제공)
- 사용자가 직접 **중개방 생성** 가능 (지역회, 특정 그룹용)
- 방 참여/생성 모두 **방장(admin) 승인** 필요
- 매물 공유 시 **공개 항목을 공유자가 선택** (마스킹 — 다른 사무소의 매물 추적/뺏기 방지)
- **연락처 공개** + **인앱 문의** + **채팅**

#### NetworkRoom (중개방)

```sql
CREATE TABLE network_rooms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,              -- 방 이름 ("강동구 공동중개", "서울 오피스텔 모임")
  description     text,                       -- 방 설명
  type            text NOT NULL DEFAULT 'private'
                  CHECK (type IN ('public', 'private')),
  created_by      uuid NOT NULL REFERENCES offices(id),  -- 방 생성 사무소
  region          text,                       -- 지역 태그 (강동구, 송파구 등)
  max_members     int,                        -- 최대 참여 사무소 수 (null = 무제한)
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

- `public`: 시스템 제공 공개방 (검색/목록에 노출, 참여는 승인 필요)
- `private`: 사용자가 만든 비공개방 (초대 또는 가입 신청 + 승인)

#### NetworkRoomMember (방 참여자)

```sql
CREATE TABLE network_room_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL REFERENCES network_rooms(id),
  office_id       uuid NOT NULL REFERENCES offices(id),
  role            text NOT NULL DEFAULT 'member'
                  CHECK (role IN ('admin', 'member')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'left')),
  joined_at       timestamptz,                -- 승인된 시점
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (room_id, office_id)
);
```

- 방 생성자 → 자동으로 `admin` + `approved`
- 가입 신청 → `pending` → admin이 `approved` / `rejected`
- admin은 다른 멤버를 admin으로 승격 가능

#### NetworkSharedProperty (공유 매물)

```sql
CREATE TABLE network_shared_properties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL REFERENCES network_rooms(id),
  property_id     uuid NOT NULL REFERENCES properties(id),
  office_id       uuid NOT NULL REFERENCES offices(id),  -- 공유한 사무소
  shared_by       uuid NOT NULL REFERENCES users(id),    -- 공유한 사용자

  -- 공개 항목 선택 (마스킹)
  show_site_name  boolean NOT NULL DEFAULT true,   -- 단지명
  show_dong       boolean NOT NULL DEFAULT false,  -- 동
  show_unit       boolean NOT NULL DEFAULT false,  -- 호수
  show_price      boolean NOT NULL DEFAULT true,   -- 가격
  show_area       boolean NOT NULL DEFAULT true,   -- 면적
  show_floor      boolean NOT NULL DEFAULT false,  -- 층수
  show_memo       boolean NOT NULL DEFAULT false,  -- 메모
  show_photos     boolean NOT NULL DEFAULT false,  -- 사진

  -- 공유자 연락처 (방 참여자에게 공개)
  contact_name    text,                       -- 담당자명
  contact_phone   text,                       -- 담당자 전화
  description     text,                       -- 공유 시 코멘트 ("급매", "이번주 내 계약 가능")

  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (room_id, property_id)
);
```

- 같은 매물을 여러 중개방에 공유 가능 (방마다 공개 항목 다르게 설정 가능)
- `is_active = false`로 공유 철회 (삭제 대신)
- 원본 property가 `done`이 되면 자동 비활성화

#### NetworkInquiry (매물 문의)

```sql
CREATE TABLE network_inquiries (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_property_id      uuid NOT NULL REFERENCES network_shared_properties(id),
  from_office_id          uuid NOT NULL REFERENCES offices(id),
  from_user_id            uuid NOT NULL REFERENCES users(id),
  status                  text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  message                 text,                -- 문의 내용
  response                text,                -- 응답 내용
  responded_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);
```

#### NetworkMessage (중개방 채팅)

```sql
CREATE TABLE network_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL REFERENCES network_rooms(id),
  office_id       uuid NOT NULL REFERENCES offices(id),
  user_id         uuid NOT NULL REFERENCES users(id),
  content         text NOT NULL,
  -- 매물 참조 (매물 카드를 채팅에 첨부할 때)
  shared_property_id uuid REFERENCES network_shared_properties(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

**전체 흐름:**

```
1. 방장이 중개방 생성 ("강동구 공동중개방")
2. 다른 사무소가 가입 신청 → 방장 승인
3. 참여 사무소가 내 매물장에서 매물 선택 → 공개 항목 체크 → 중개방에 공유
4. 다른 참여자가 공유 매물 목록 확인 (마스킹된 정보만)
5. 관심 있으면 "문의하기" → 공유자에게 알림
6. 공유자가 문의 수락 → 상세 정보 교환 / 채팅
7. 공동 중개 진행 → 각자 CRM에서 Deal 관리
```

### 6.11 전체 테이블 목록 (30개)

| 그룹 | 테이블 | 설명 |
|------|--------|------|
| 마스터 | provinces | 시도 (법정동 마스터) |
| 마스터 | districts | 시군구 (법정동 마스터) |
| 마스터 | wards | 읍면동 (법정동 마스터) |
| 테넌시 | offices | 사무소 (멀티테넌시) |
| 테넌시 | users | 사용자/인증 |
| 장소 | sites | 건물/단지 (wardCode FK, 외부 코드 매핑, metadata JSONB) |
| 장소 | site_unit_types | 평형 카탈로그 (84A, 59B 등 타입별 면적/방수) |
| 장소 | dongs | 동 |
| 장소 | units | 호실 (floor, lineNo, siteUnitTypeId FK) |
| 장소 | office_sites | 사무소별 관리 단지 즐겨찾기 |
| 매물 | properties | 내부 매물장 (핵심) |
| 매물 | price_histories | 가격 변경 이력 |
| 연락처 | contacts | 연락처 (소유주/고객 통합) |
| 연락처 | contact_relations | 사람 간 관계 |
| 연락처 | property_contacts | 매물-연락처 역할 매핑 |
| 연락처 | tenants | 세입자 정보 |
| CRM | buyer_requirements | 구매고객 희망조건 |
| CRM | consultations | 상담기록 |
| CRM | matches | 매칭 파이프라인 |
| CRM | deals | 거래 |
| 업무 | tasks | 업무/할일 |
| 업무 | insights | 인사이트 알림 |
| 업무 | insight_rules | 감지 규칙 설정 |
| 업무 | calendar_events | 캘린더 |
| 업무 | activity_logs | 활동 로그 (감사 추적) |
| 네트워크 | network_rooms | 중개방 (공동 중개망) |
| 네트워크 | network_room_members | 중개방 참여자 |
| 네트워크 | network_shared_properties | 중개방 공유 매물 (마스킹) |
| 네트워크 | network_inquiries | 공유 매물 문의 |
| 네트워크 | network_messages | 중개방 채팅 |

---

## 7. 주요 기능 범위

### 7.1 핵심 CRM

- 매물 관리 (등록/수정/필터/숨김/지도뷰)
- 고객/연락처 관리 (소유주/매수자 통합)
- 상담 기록 관리
- 구매고객 희망조건 관리
- 매칭 파이프라인: `suggested → buyerContacted → viewing → ownerContacted → negotiating → dealCreated`
- 거래 파이프라인: `selection → deposit → contract → completed → closed`
- 계약 관리 + 체크리스트

### 7.2 ERP 확장

- 회계/정산 (수수료 계산, 매출 관리)
- 직원 관리 (권한, 성과, 활동 추적)
- 광고 관리 (네이버 광고 연동)
- 서류 자동화 (계약서, 확인서 등)

### 7.3 업무/일정

- 태스크 관리 (칸반/리스트)
- 캘린더
- 규칙 기반 태스크 자동 생성
- 마감 임박/지연 알림

### 7.4 CTI 전화 연동

- 전화 수신 시 고객 정보 팝업 (데스크톱 + 모바일)
- 통화 후 상담 기록 빠른 등록
- 통화 이력 추적

### 7.5 공동 중개망 (킬러 피쳐)

카카오톡 그룹방처럼 "중개방(Room)" 기반의 매물 공유 네트워크. 부동산 지역회, 동종업자 모임 등이 활용. 구독자가 늘수록 공유 매물 풀이 커지는 네트워크 효과로 락인을 유도한다.

**중개방 관리:**
- 시스템 제공 공개 중개방 (모든 사용자 접근 가능, 참여는 승인 필요)
- 사용자가 직접 중개방 생성 (지역회, 특정 그룹용 비공개방)
- 방 참여/생성 모두 방장(admin) 승인 필요
- 방장은 멤버 승인/거절/추방, 관리자 위임 가능

**매물 공유:**
- 내 매물장(properties)에서 선택하여 중개방에 공유
- 공유 시 공개 항목을 공유자가 직접 선택 (마스킹) — 단지명, 동/호, 가격, 면적, 층수, 메모, 사진 각각 on/off
- 같은 매물을 여러 중개방에 공유 가능 (방마다 공개 범위 다르게 설정)
- 마스킹 이유: 다른 사무소가 매물 추적해서 빼갈 수 있으므로

**소통:**
- 공유 매물에 "문의하기" → 공유자에게 인앱 알림
- 공유자 연락처(담당자명/전화) 공개
- 중개방 내 채팅 기능 (매물 카드 첨부 가능)
- 문의 수락/거절 관리

**흐름:**
1. 방장이 중개방 생성 ("강동구 공동중개방")
2. 다른 사무소가 가입 신청 → 방장 승인
3. 참여 사무소가 내 매물장에서 매물 선택 → 공개 항목 체크 → 중개방에 공유
4. 다른 참여자가 공유 매물 목록 확인 (마스킹된 정보만)
5. 관심 있으면 "문의하기" → 공유자에게 알림
6. 공유자가 문의 수락 → 상세 정보 교환 / 채팅
7. 공동 중개 진행 → 각자 CRM에서 Deal 관리

### 7.6 대시보드/분석

- KPI 요약 (매물/고객/거래/일정)
- 거래 실적 분석 (관리자)
- 직원 활동 관리 (관리자)
- 월별 거래/유형 분포

---

## 8. 핵심 파이프라인

### 8.1 매칭 파이프라인

구매고객의 조건과 매물을 매칭하는 프로세스.

```
suggested          매칭 제안 (자동/수동)
→ buyerContacted   매수자에게 연락
→ viewing          임장/방문
→ ownerContacted   소유주에게 연락
→ negotiating      가격 협상
→ dealCreated      거래 생성
→ closed           완료
```

### 8.2 거래 파이프라인

```
selection    매물 선정
→ deposit    계약금 입금
→ contract   계약 체결
→ completed  잔금/이전 완료
→ closed     거래 종료
```

### 8.3 매물 확인 상태

```
unverified     미확인 (기본값)
→ verified     확인 완료
→ in_contract  계약 진행 중
→ hold         보류
→ done         완료/거래종료
```

---

## 9. 개발 로드맵

### Phase 1: NestJS 서버 + CRM MCP Server

- API 설계 (= MCP 도구 설계)
- 매물/고객/태스크/매칭/거래 CRUD
- Auth + 멀티테넌시 (사무소별 데이터 격리)
- WebSocket 기반 실시간 동기화
- 규칙 엔진 (BullMQ)
- CRM MCP Server 인터페이스
- **→ 이 시점에서 Claude/ChatGPT 연결 가능**

### Phase 2: Electron 데스크톱 앱 + 웹 앱

- React UI (CRM 전체 화면)
- 서버 API 연동
- 웹 앱 (Vite SPA) — CTI 없이 동일 CRM 기능
- CTI Bridge 클라이언트 (로컬 WebSocket)
- 시스템 트레이 + 알림
- 자동 업데이트
- 로컬 MCP Host 기반 구조

### Phase 3: 로컬 MCP + CTI Bridge

- 네이버 부동산 MCP (별도 프로젝트, Playwright)
- CTI Bridge 프로그램 (32비트, 인프록 SDK)
- Electron ↔ CTI Bridge 로컬 통신

### Phase 4: React Native 모바일 (Android only)

- 전화 수신 감지 + `SYSTEM_ALERT_WINDOW` 오버레이 팝업
- 통화 녹음 (Android `MediaRecorder`)
- 통화 후 상담 기록 빠른 등록
- 매물 확인/메모/사진
- 일정/태스크 확인 및 완료
- 푸시 알림
- Foreground Service로 백그라운드 전화 감지

---

## 10. 모노레포 구조

```
estate-erp/
  apps/
    server/              # NestJS 백엔드
      src/modules/       # auth, properties, contacts, ...
    desktop/             # Electron 앱
      main/              # Main process (CTI, tray, MCP host)
      preload/           # Preload scripts
      renderer/          # React UI
    web/                 # Vite SPA (사장님용 웹 버전, CTI 없음)
    mobile/              # React Native (Android only)
    cti-bridge/          # CTI Bridge (32비트 별도)
  packages/
    shared/              # 공유 타입, 유틸리티, Enum
    api-client/          # API 클라이언트 (desktop + web + mobile 공유)
    mcp-server/          # CRM MCP Server 정의
  prisma/
    schema.prisma        # DB 스키마
  docs/
```

---

## 11. SaaS 수익 모델

| 플랜 | 대상 | 주요 기능 | 예상 가격 |
|------|------|----------|----------|
| 기본 | 1인 중개사 | 매물/고객/일정 기본 관리 | 월 3~5만원 |
| 프로 | 팀/법인 | 직원 관리, 성과 분석, 규칙 자동화 | 인당 월 5~8만원 |
| 프리미엄 | 대형 법인 | MCP 연동, CTI, 고급 분석, 네트워크 공유 | 별도 협의 |

---

## 12. 시장 분석 및 경쟁 우위

### 12.1 경쟁 환경

**국내**: 다방 Pro, 직방 Pro, 한방 등이 있으나, MCP 기반 AI 연동이나 사무소 간 매물 공유 네트워크를 제공하는 제품은 아직 없다.

**글로벌 참고**: Attio(AI-native CRM, 8만+ 스타트업), Compass(미국 최대 부동산 중개, 음성 AI), Zillow(미국 최대 부동산 포털, AI Mode), Salesforce/HubSpot(범용 CRM)이 MCP 기반 AI 에이전트 전략을 공격적으로 추진 중. 상세 분석은 §18 참고.

**오픈소스 참고**: Twenty CRM(NestJS+PostgreSQL, MCP 네이티브, #1 오픈소스 CRM)은 Estate ERP와 거의 동일한 기술 스택으로, MCP 서버 구현과 멀티테넌시 패턴을 코드 레벨에서 직접 참고. Frappe CRM(Python+MariaDB)은 CRM 도메인 설계 패턴(View 시스템, SLA, Assignment Rule) 참고. 상세 분석은 §18.7 참고.

### 12.2 핵심 경쟁 우위

| 차별화 요소 | 국내 경쟁사 | 글로벌 참고 (Attio/Compass) | Estate ERP |
|------------|-----------|---------------------------|------------|
| AI 연동 | 없거나 기본 챗봇 | Attio: AI 코어 내장 + MCP 21개 도구 | MCP 기반 — 외부 AI가 CRM 직접 제어 |
| 매물 공유 | 포털 의존 | Compass: 고객 대시보드 | 사무소 간 직접 네트워크 공유 (킬러 피쳐) |
| 전화 연동 | CTI 별도 구매 | Attio: Call Intelligence (녹음→요약→CRM 링크) | 통합 CTI (데스크톱 + 모바일) + Phase 4 녹음→상담 자동화 |
| 자동화 | 없음 | Attio: 노코드 워크플로우 빌더 | 규칙 엔진 + AI 에이전트 조합 |
| 설치 형태 | 웹 기반 | Attio: 웹 기반 | Electron 설치형 (한국 시장 신뢰감) |
| 확장성 | 폐쇄형 | Attio: App SDK + 마켓플레이스 | MCP 오픈 생태계 |
| 감사 추적 | 없음 | Attio: Enterprise 감사 로그 | Phase 1부터 ActivityLog 기본 제공 |

---

## 13. 리스크 평가

| 리스크 | 영향 | 확률 | 대응 |
|--------|------|------|------|
| 네이버 스크래핑 차단 | 높음 | 중 | 사용자 로컬 실행, IP 분산, API 전환 준비 |
| MCP 표준 변경 | 중 | 중 | 추상화 레이어로 격리 |
| Electron 보안 이슈 | 높음 | 저 | 보안 업데이트 자동화, CSP 설정 |
| 사용자 이탈 (네트워크) | 높음 | 중 | 데이터 Export 제공, 가치 지속 창출 |
| CTI 인프록 지원 종료 | 중 | 저 | 브리지 추상화, 대안 SDK 준비 |
| SaaS 시장 진입 장벽 | 높음 | 중 | 무료 체험 + 마이그레이션 지원 |
| 개발 리소스 부족 | 높음 | 높 | MVP 범위 최소화, Phase별 점진 개발 |

---

## 14. 고려 사항: n8n 자동화 레이어

네이버 스크래핑 등 자동화 워크플로우를 직접 MCP로 구현하는 대신, n8n(셀프호스팅 워크플로우 자동화)을 활용하는 방안을 검토 중이다.

**장점:**

- Playwright 스크래핑 코드 직접 작성 감소
- 비주얼 워크플로우 에디터 — 스크래핑 로직 수정 시 앱 업데이트 불필요
- 스케줄링, 에러 핸들링, 재시도 내장
- n8n 워크플로우를 MCP 도구로 노출 가능
- Electron이 가벼워짐

**고려할 점:**

- 사무실마다 n8n 셀프호스팅 환경 필요 (설치/관리 부담)
- 스크래핑 워크플로우 품질 관리
- n8n 라이선스 확인 필요
- MCP 직접 구현 대비 통제력 낮음

**결론**: 미결정. Phase 3에서 MCP 직접 구현과 n8n 중 판단. CRM API를 REST/웹훅으로 잘 설계하는 것이 핵심.

---

## 15. 핵심 결정 요약

| 항목 | 결정 | 이유 |
|------|------|------|
| 백엔드 | NestJS (직접 구축) | Supabase 한계, 전체 통제 필요 |
| DB | Postgres + Prisma | 기존 스키마 활용, 타입 안전 |
| 실시간 | Socket.io | CTI 브로드캐스팅, 유연한 Room 관리 |
| 큐/잡 | BullMQ + Redis | 규칙 엔진, 알림, 스케줄 |
| 파일 | S3 / Cloudflare R2 | 범용, 저비용 |
| 데스크톱 | Electron | 설치형 신뢰감, 로컬 기능 필요 |
| 웹 앱 | Vite SPA | CTI 불필요 사용자용, desktop과 UI 코드 독립 |
| 모바일 | React Native (Android only) | 전화 감지/녹음 네이티브 필수, TS 스택 공유 |
| AI | 내장 안 함 | MCP로 외부 AI에 위임 |
| MCP | CRM MCP Server 최우선 | AI 시대 핵심 경쟁력 |
| CTI | 별도 32비트 프로그램 | 인프록 SDK 32비트 제약 |
| 로컬 캐시 | 안 함 (MVP) | 복잡도 대비 가치 낮음 |
| 스크래핑 | 사용자 로컬에서만 | IP 차단, 세션, 법적 리스크 |
| 킬러 피쳐 | 네트워크 매물 공유 | 네트워크 효과, 락인 |
| 주소 체계 | 법정동코드 + 도로명 + 지번 | 정부 시스템 + 외부 서비스 연동 |

---

## 16. 향후 추가 기능 (Phase 2+)

### 16.1 수수료 정산 모듈

Phase 1에서는 DealParticipant(거래 담당자 배정)와 ActivityLog(기여 이력)만 기록하고, 정산은 수동 처리. Phase 2에서 아래 기능 추가 예정.

**거래별 기여 리포트:**
- ActivityLog 기반으로 거래별 직원 활동 내역을 사장님에게 보고
- 매물 등록, 상담, 임장, 협상, 계약 등 단계별 기여자와 시점 시각화
- Deal → DealParticipant(담당자) + ActivityLog(상세 활동) 조합

**정산 계산 엔진:**
- Office.commissionConfig 기반 자동 계산 (사무소별 배분 규칙 적용)
- 한국 중개사무소 보상 모델 지원: 순수 성과급(수수료의 N%), 기본급 + 인센티브, 고정급
- 거래별 수수료 배분 자동 제안 → 사장님이 검토/조정 후 확정
- 복수 직원 참여 시 role/side 기반 자동 분배

**Settlement 테이블 (확정/지급 기록):**
- 사장님이 월말 정산 확정 시 금액 freeze (commissionConfig 변경에 영향 안 받음)
- 정산 상태 관리: pending → confirmed → paid
- 지급 내역/일자 기록
- 월별/분기별 정산 리포트

**직원 성과 대시보드:**
- 직원별 참여 거래 수, 총 수수료, 인센티브 합계
- 기간별(월/분기/연) 실적 추이
- 역할별 기여 분석 (매물 확보 몇 건, 임장 몇 건, 계약 마무리 몇 건)

### 16.2 기타 향후 기능

- 회계 연동 (세금계산서, 부가세 신고 자료)
- 급여 관리 (기본급 + 인센티브 통합 급여 명세)
- 서류 자동화 (계약서, 확인설명서, 중개대상물 확인서 템플릿)
- 고객용 대시보드 (Compass One 패턴 — 매수자/매도자에게 진행 현황 공유)
- 광고 관리 (네이버 광고 순위/비용 추적)

---

## 17. 미결정 사항

- 프로젝트명 확정
- 배포 인프라 선정 (Railway / Render / AWS ECS / 기타)
- 도메인/브랜딩
- 인증 방식 상세 설계 (사무소 초대, 역할 관리)
- 멀티테넌시 패턴 상세 (스키마 분리 vs RLS vs tenant_id)
- MCP 인증/보안 (외부 AI 접근 시 API 키 관리)
- CTI Bridge 구체적 기술 선택 (Node.js 32비트 / C# / C++)
- 모바일 앱 최소 기능 범위 (Android only — 전화 오버레이, 녹음, 상담 기록)
- 정산 모듈 상세 설계 (Settlement 테이블, commissionConfig 구조, 정산 프로세스 흐름)
- 워크플로우 상세 설계 (매물 등록 ~ 계약 완료 전체 흐름)
- n8n vs MCP 직접 구현 (Phase 3)

---

## 18. 경쟁사 AI 에이전트 전략 분석

2026년 현재 글로벌 CRM/ERP 플랫폼과 부동산 소프트웨어는 AI 에이전트를 핵심 전략으로 채택하고 있으며, MCP(Model Context Protocol) 생태계가 폭발적으로 성장 중이다. 13개월간 2,200% 성장하여 10,000+ 활성 MCP 서버가 운영 중이다.

### 19.1 Salesforce Agentforce

가장 공격적인 AI 에이전트 전략. Atlas Reasoning Engine 기반의 자율적 에이전트로, 추론 → 행동 → 관찰 루프(ReAct)를 돌며 다단계 목표를 자율적으로 실행한다.

- 18,500개 고객사, 월 30억 건 워크플로우 실행, 조직당 평균 12개 에이전트 운영
- 멀티 에이전트 오케스트레이션: 주 에이전트가 작업을 최적 전문가 에이전트에 라우팅
- 2025년 7월부터 네이티브 MCP 클라이언트 탑재 — 모든 MCP 호환 서버에 연결 가능
- 자체 배포: 83% 해결율, 단 1%만 인간 상담 필요
- **주의**: B2B 구현의 77%가 데이터 품질 문제로 실패 — 기초 데이터 정합성이 핵심

### 19.2 HubSpot Breeze AI

"하이브리드 인간-AI 팀" 철학. 4개 코어 에이전트(Customer, Prospecting, Content, Data) + 20개+ 마켓플레이스 에이전트.

- Customer Agent: 지원 티켓 50%+ 자동 해결, 실제 사례에서 인간 처리 티켓 77% 감소
- Breeze Context Layer: 구조화 데이터(CRM) + 비정형 데이터(이메일, 통화 녹음) + 외부 데이터 통합
- Audit Cards (2026년 1월): 에이전트가 정확히 뭘 했는지, 어떤 CRM 속성을 변경했는지 추적
- MCP 서버 공식 제공 (Remote + Developer), Claude/Cursor 등에서 CRM 데이터 직접 접근

### 19.3 Compass (부동산 — 미국 최대 중개)

음성 우선 AI가 핵심. 2025년 6월 출시한 음성 AI 어시스턴트로 중개사가 화면 터치 없이 전체 업무 운영 가능.

- **Compass One** (2025년 2월): 업계 최초 올인원 클라이언트 대시보드. 에이전트와 고객이 매물 컬렉션, 투어 기록, 시장 분석, 거래 진행 상황을 실시간 공유
- 자동 생성: 이메일 초안, CMA(비교 시장 분석), 마케팅 패키지, 부동산 설명문
- AI가 구매자 행동 패턴(어떤 매물을 얼마나 보는지) 분석 → 연락 타이밍 알림
- Q4 매출 $1.7B(사상 최고), "AI 자동화가 중개 문서 작업의 2/3를 처리"

### 19.4 Zillow (부동산 — 미국 최대 포털)

- **AI Mode** (2026년 3월): 대화형 인터페이스로 매물 비교, 리모델링 비용 추정, 금리 추세 분석, 협상 전략 제안
- **Zillow Pro** (2025년 10월): 에이전트용 AI 스위트. 고객 구매 신호 감지 → 자동 알림, 검색 활동 기반 개인화 메시지 작성
- 통화 요약, 대화 자동 요약, 후속 태스크 자동 제안
- Zestimate: 신경망 기반 주택 가치 평가, 상장 주택 오차율 1.83%

### 19.5 Attio (SaaS CRM — AI-native 스타트업)

"AI-native CRM for startups and builders" 표방. 8만+ 스타트업 사용. HubSpot/Salesforce 대안으로 빠르게 성장 중. Estate ERP의 MCP 서버 설계와 데이터 모델 확장성에 가장 직접적인 참고 대상.

**핵심 아키텍처:**
- **유연한 데이터 모델**: Standard Objects(Company, Person, Deal) + Custom Objects(자유 생성). Graph 기반 관계 모델로 오브젝트 간 연결이 유연
- **AI 코어 내장**: Research Agent(웹 자동 리서치 → CRM 레코드 저장), AI 데이터 변환(비정형 → 정형 자동 변환), 시맨틱 검색(통화/이메일/노트 주제 기반 검색)
- **자동 Enrichment**: 100+ 소스에서 회사 정보(매출, 직원수, 위치) 자동 채움. 이메일/캘린더 연동 시 연락처 자동 생성
- **Relationship Intelligence**: 이메일/캘린더 동기화로 연락처 자동 생성, 커뮤니케이션 빈도 기반 관계 강도 자동 계산

**Call Intelligence (통화 인텔리전스):**
- Zoom/Google Meet/Teams 통화 자동 녹음 → 100+ 언어 트랜스크립션 → AI 요약 → CRM 레코드 자동 링크
- **Focus Mode**: 핵심 의사결정자 발언만 집중 확인
- 구매 신호, 반대 의견, 차단 요소 실시간 감지
- 통화 내용 기반 후속 태스크 자동 생성
- Pro 플랜($69-86/석/월)에 포함

**MCP 서버 (21개 도구, Estate ERP MCP 설계 핵심 참고):**

| 카테고리 | 도구 수 | 주요 도구 |
|---------|---------|----------|
| Records | 5 | `search-records`, `create-record`, `upsert-record`, `list-attribute-definitions` |
| Notes | 4 | `create-note`, `semantic-search-notes`, `search-notes-by-metadata` |
| Tasks | 2 | `create-task`, `update-task` |
| Meetings/Calls | 4 | `search-meetings`, `semantic-search-call-recordings`, `get-call-recording` |
| Emails | 3 | `search-emails-by-metadata`, `semantic-search-emails`, `get-email-content` |
| Workspace | 3 | `list-workspace-members`, `list-workspace-teams`, `whoami` |

- **권한 모델**: Read 자동 승인, Write는 사용자 확인 필요. OAuth 기반 인증
- **통합 검색**: `search-records` 하나로 Person/Company/Deal/Custom Object 모두 검색
- **스키마 조회**: `list-attribute-definitions`로 AI가 사용 가능한 필드/옵션 자동 파악
- **Upsert 패턴**: 이메일/도메인 기반 매칭으로 중복 레코드 방지

**Developer Platform:**
- **App SDK**: TypeScript + React로 CRM 내부 커스텀 앱 개발. Entry point(record action, widget, text selection), 서버 함수, 웹훅 지원
- **REST API**: OAuth 2.0, 양방향 데이터 동기화, 실시간 웹훅
- **App Store**: 커스텀 앱 퍼블리시 가능. Linear, Aircall, Pandadoc 등 연동 앱 보유
- 연간 28,755 커밋 — 빠른 개발 속도

**노코드 자동화:**
- 드래그앤드롭 워크플로우 빌더
- 트리거(CRM 이벤트 + 외부 도구) → 액션(이메일, Slack, 태스크, AI 분류)
- 템플릿: 딜 성사 → CS 핸드오프, AI 딜 요약, 이탈 위험 고객 연락, 리뉴얼 추적

**가격:**
- Free: $0 (3석, 기본 CRM, 무제한 연락처)
- Plus: $29-36/석/월 (이메일, enrichment, 통합)
- Pro: $69-86/석/월 (자동화, Call Intelligence, 권한)
- Enterprise: 별도 (SSO/SAML, 감사 로그, 데이터 레지던시)

### 19.6 공통 패턴

- **MCP는 이제 필수**: Salesforce, HubSpot, Attio, Compass, Microsoft Dynamics 365 모두 MCP 지원
- **데이터 품질이 AI 에이전트 성공의 핵심** (Salesforce 77% 실패 사례)
- **감사 추적(Audit)**: AI가 뭘 했는지 투명하게 보여주는 것이 신뢰 확보에 필수 (HubSpot Audit Cards, Attio Enterprise 감사 로그)
- **MCP 도구 설계 패턴**: 통합 검색 도구 + 스키마 조회 도구 + Read/Write 권한 분리 (Attio 21개 도구 구조 참고)
- **통화 → CRM 자동 연동**: 녹음 → 트랜스크립션 → AI 요약 → 레코드 링크 (Attio Call Intelligence, Compass 음성 AI)
- **자동 Enrichment**: 외부 소스에서 데이터 자동 보강 (Attio 100+ 소스, HubSpot Breeze Context Layer)
- 한국 부동산 중개 소프트웨어 중 MCP 기반 AI 연동을 제공하는 제품은 아직 없음 — **선점 기회**

### 19.7 오픈소스 CRM 참고 프로젝트

코드 구조와 설계 패턴 수준에서 직접 참고할 수 있는 오픈소스 CRM 프로젝트.

**로컬 참고자료 위치:**
- Twenty CRM: `~/Documents/reference-crm/twenty/` (full clone)
- Frappe CRM: `~/Documents/reference-crm/frappe-crm/` (shallow clone)

#### Twenty CRM (github.com/twentyhq/twenty) — 핵심 참고 대상

**Estate ERP와 거의 동일한 기술 스택**: NestJS + TypeORM + PostgreSQL + Redis + BullMQ + Passport.js + JWT + S3/R2 + Resend + React.

| 영역 | Twenty 구현 | Estate ERP 적용 |
|------|------------|----------------|
| MCP | `engine/api/mcp/` — NestJS 내장 MCP 서버. ObjectMetadata에서 CRUD 도구 자동 생성 | MCP 서버 구현 시 코드 구조 직접 참고 |
| 멀티테넌시 | TwentyORM — TypeORM 래핑하여 자동 `workspaceId` 필터링 | Prisma Middleware에서 `officeId` 자동 필터링 |
| 권한 | ObjectPermission + FieldPermission (RBAC, 오브젝트별+필드별) | `@Roles` Guard 패턴 확장 가능 |
| API | GraphQL(주력) + REST(GraphQL 래핑). Cursor-based pagination | REST(주력) + MCP. 페이지네이션 패턴 참고 |
| 실시간 | Redis Pub/Sub + GraphQL Subscriptions | Socket.io (우리 선택 유지, CTI에 적합) |
| 워크플로우 | DAG 기반 워크플로우 빌더 (MANUAL/SCHEDULED/WEBHOOK/EVENT 트리거) | BullMQ + InsightRule. Phase 2+에서 노코드 빌더 참고 |
| N+1 방지 | DataLoader 패턴 — GraphQL 리졸버 자동 통합 | NestJS 서비스 레이어에 적용 |
| View | TABLE/KANBAN/CALENDAR/BOARD/GRID 5가지 + 필터/정렬/그룹/집계 저장 | Phase 2 프론트엔드 뷰 시스템 참고 |
| 감사 로그 | ActivityLog (userId, action, entityType, entityId, changes JSON) | 동일 설계 이미 채택 |
| 데이터 모델 | Metadata-Driven (동적 오브젝트/필드 정의) | 불채택 — 부동산 도메인은 고정 스키마가 적합 |

**주요 코드 참고 포인트:**

- `packages/twenty-server/src/engine/api/mcp/` — MCP 프로토콜 구현 (JSON-RPC 2.0, 도구 카탈로그, 도구 실행)
- `packages/twenty-server/src/engine/twenty-orm/` — ORM 래퍼 (자동 테넌트 필터링, 소프트 딜리트, DataLoader)
- `packages/twenty-server/src/engine/metadata-modules/workflow/` — 워크플로우 엔진 (DAG, BullMQ 실행)
- `packages/twenty-server/src/engine/metadata-modules/object-permission/` — RBAC 구현
- `packages/twenty-server/src/engine/core-modules/tool-provider/` — MCP 도구 레지스트리

#### Frappe CRM (github.com/frappe/crm) — 패턴 참고

**스택**: Python + Frappe Framework + MariaDB + Vue 3 + Socket.io. 스택은 다르지만 CRM 도메인 패턴이 잘 설계됨.

**참고할 패턴 (코드 레벨은 아니지만 설계 레벨):**

1. **Dynamic View System** — 필터/컬럼/정렬/그룹바이를 사용자가 저장하는 커스텀 뷰. 매물 목록을 "내 급매물", "고덕동 아파트", "이번주 확인 필요" 등으로 저장
2. **SLA 템플릿 시스템** — 매물 확인 기한(7일), 문의 응답 기한(24시간) 등 재사용 가능한 기한 템플릿. InsightRule의 `config`에 적용 가능
3. **자동 상태 변경 로깅** — 파이프라인 스테이지 변경 시 자동으로 ActivityLog 생성. Prisma Middleware의 `changes` JSONB에 자동 캡처
4. **Assignment Rule** — 조건 기반 자동 담당자 배정 (지역별, 매물유형별). BuyerRequirement의 `assignedToId` 자동 설정에 적용 가능
5. **Field Metadata API** — 엔티티별 사용 가능한 필드/옵션 목록 노출. MCP `list_field_definitions` 도구와 직결

**불채택**: Frappe Framework 종속성, Python (타입 안전 부족), DocType 시스템 (유연하지만 커스텀 로직 제한), Bench 기반 멀티테넌시 (SaaS 부적합)

#### 두 프로젝트의 전략적 활용

- **Twenty**: 코드 레벨에서 직접 참고 (동일 스택). MCP 서버 구현, Prisma Middleware 멀티테넌시, RBAC, 워크플로우 엔진
- **Frappe CRM**: 설계 패턴 참고 (다른 스택). CRM 도메인 모델, View 시스템, SLA, Assignment Rule

---

## 19. Estate ERP 적용 전략

경쟁사 분석을 바탕으로, 현실적으로 적용 가능한 전략을 정리한다.

### 19.1 MCP 도구 설계 패턴 (Attio 참고)

Attio의 21개 MCP 도구 구조를 벤치마크로, Estate ERP CRM MCP Server의 도구를 체계적으로 설계한다.

**카테고리별 도구 구조:**

| 카테고리 | Estate ERP 도구 (예시) | Attio 대응 |
|---------|----------------------|-----------|
| 매물 | `search_properties`, `get_property`, `create_property`, `upsert_property` | Records CRUD |
| 고객 | `search_contacts`, `get_contact`, `create_contact`, `upsert_contact` | Records CRUD |
| 상담 | `get_consultations`, `create_consultation`, `search_consultations` | Notes |
| 태스크 | `get_tasks`, `create_task`, `complete_task` | Tasks |
| 매칭/거래 | `get_matches`, `create_match`, `get_deals`, `update_deal_stage` | Records (Deal) |
| 인사이트 | `get_insights`, `approve_insight` | — (Attio에 없는 도메인 고유 기능) |
| 스키마 | `list_field_definitions`, `get_enums` | `list-attribute-definitions` |
| 워크스페이스 | `whoami`, `get_office_info`, `list_users` | Workspace |

**Attio에서 가져오는 핵심 패턴:**

1. **통합 검색 도구**: `search_records` 하나로 매물/고객/거래를 엔티티 타입 파라미터로 검색 — AI가 "고덕동 매물 찾아줘"를 한 번에 처리
2. **스키마 조회 도구**: `list_field_definitions`로 AI가 사용 가능한 필드/Enum 옵션을 자동 파악 — AI가 올바른 값을 넣을 수 있음
3. **Upsert 패턴**: 전화번호 기반 연락처 upsert — 이미 있으면 업데이트, 없으면 생성. 중복 방지
4. **Read/Write 권한 분리**: 검색/조회는 자동 승인, 생성/수정은 사용자 확인 필요

**복합 워크플로우 도구 (추가):**

기본 CRUD 외에 복합 작업 도구를 추가하여 AI가 한 번의 호출로 복잡한 업무를 처리할 수 있게 한다.

- `prepare_client_briefing`: 연락처 조회 + 최근 상담 이력 + 관심 매물 조회 + 요약문 생성을 한 번에 처리
- `get_daily_briefing`: 오늘 연락해야 할 고객, 마감 임박 건, 새 매칭 후보를 한 번에 브리핑
- NestJS 서비스에 메서드 하나 추가하는 것만으로 구현 가능

### 19.2 이벤트 웹훅 시스템

BullMQ 규칙 엔진이 감지한 이벤트를 외부로 발행하여, 나중에 외부 AI 에이전트나 n8n 등이 받아서 후속 작업을 할 수 있게 한다.

**흐름:**

```
매물 가격 변동 → BullMQ 감지 → Insight 생성 + 웹훅 발행 → Socket.io로 데스크톱 앱에 알림
```

**Phase 1 방침**: 웹훅 엔드포인트는 미리 만들어두되, 실제 AI 자동 트리거는 사용자 수/수익이 충분해진 후 옵션으로 제공. 현재는 규칙 엔진 감지 → 앱 알림 → 사용자가 AI에게 직접 지시하는 pull 방식이 현실적.

### 19.3 감사 추적 (Activity Logs + MCP 소스 추적)

HubSpot Audit Cards 패턴을 참고. 모든 비즈니스 데이터 변경(create/update/delete)을 자동으로 추적한다. 웹 UI, MCP(AI), 시스템(규칙 엔진) 모든 출처를 포함.

**기록 필드:**

- **who**: `user_id` FK (nullable, 직원 작업이면 설정) + `actor` 문자열 ("user", "mcp:claude", "system:rule_engine")
- **what**: `action` + `entity_type` + `entity_id` + `changes` JSONB (변경 전/후 값)
- **source**: `"web"` | `"mcp"` | `"system"`
- **reason**: 선택적 (AI가 보내주면 저장)

**추적 대상**: 핵심 비즈니스 엔티티 10개 — Property, Contact, PropertyContact, Tenant, BuyerRequirement, Match, Deal, Consultation, Task, NetworkSharedProperty. 장소 마스터(Site/Dong/Unit), 시스템 데이터(Insight/InsightRule), PriceHistory(별도 이력 테이블), 네트워크 채팅(NetworkMessage) 등은 제외.

**구현 방식**: NestJS Prisma Middleware에서 create/update/delete를 자동 가로채기. AsyncLocalStorage(CLS context)로 요청 컨텍스트(현재 사용자, 소스)를 미들웨어에 전달.

**참고**: AI의 "이유"는 CRM 서버가 알 수 없음. MCP 요청에는 "누가 뭘 언제"만 포함되며, 이것만으로도 문제 추적은 충분. 다만 MCP 도구 호출 시 선택적 `reason` 필드를 받을 수 있게 설계해두면, AI가 보내주는 경우 같이 저장 가능.

### 19.4 고객용 대시보드 (Compass One 패턴)

Compass One의 클라이언트 대시보드 컨셉을 참고. 중개사와 고객(매수자/매도자) 사이의 정보 비대칭을 없애는 고객용 웹/앱 대시보드.

**핵심 기능:**

- 중개사가 추천한 매물 목록을 카드로 표시 (사진/가격/면적/위치)
- 고객이 "관심있음 / 방문 원함 / 패스" 피드백을 탭 한 번으로 제공 → CRM에 자동 반영
- 임장 루트를 지도에 표시
- 거래 진행 상태(매물 선정 → 계약금 → 계약 → 잔금)를 파이프라인으로 실시간 표시

**현실적 구현 방침**: 고객 대시보드는 기존 CRM 데이터의 읽기 전용 뷰이므로, 새 테이블이 필요 없음. `matches`, `viewings`, `deals` 테이블이 이미 있으므로, 고객용 프론트엔드(웹앱/모바일 웹) + 인증 방식(공유 링크/PIN)만 추가하면 됨. Phase 2 이후 진행 예정.

### 19.5 자동 Enrichment (Attio 패턴, Phase 3)

Attio의 자동 enrichment(100+ 소스에서 회사 정보 자동 채움) 컨셉을 부동산 도메인에 적용한다.

**Phase 3에서 네이버 MCP와 연계:**
- 네이버 부동산에서 단지 정보(세대수, 준공년도, 평형 정보) 자동 보강
- K-apt에서 아파트 관리비/공시지가 정보 가져오기
- KB 시세 연동으로 매물 시세 자동 업데이트

**구현 방식:** 로컬 MCP 서버(Electron 호스팅)가 네이버/K-apt 스크래핑 → CRM MCP Server의 `upsert` 도구로 데이터 보강. 사용자 개입 없이 백그라운드 동기화.

### 19.6 통화 녹음 → 상담 기록 자동 생성 (Attio Call Intelligence 패턴, Phase 4)

Attio Call Intelligence의 "녹음 → 트랜스크립션 → AI 요약 → CRM 자동 연동" 패턴을 CTI/모바일에 적용한다.

**흐름:**
```
모바일 통화 녹음 → 서버 업로드 → 외부 AI(MCP)가 트랜스크립션 + 요약 → create_consultation MCP 도구 호출 → 상담 기록 자동 생성
```

**Phase 1 준비:** Consultation 테이블 설계는 이미 완료. 향후 `audioUrl`, `transcript` 필드 추가 가능성을 염두에 두되, Phase 1에서는 추가하지 않음.

### 19.7 오픈소스 참고 패턴 적용 (Twenty + Frappe CRM)

오픈소스 CRM 프로젝트에서 Estate ERP에 적용할 구체적 패턴.

**Phase 1 — 서버 구현 시 바로 적용:**

1. **Prisma Middleware 자동 테넌트 필터링** (Twenty의 TwentyORM 패턴)
   - 모든 쿼리에 `officeId` 조건 자동 주입
   - AsyncLocalStorage로 요청 컨텍스트(현재 사용자, 사무소) 전달
   - Twenty의 `twenty-orm/` 코드 구조 직접 참고

2. **MCP 서버 NestJS 내장** (Twenty의 `engine/api/mcp/` 패턴)
   - JSON-RPC 2.0 프로토콜 구현
   - 도구 카탈로그 (`get_tool_catalog`) + 도구 실행 (`execute_tool`)
   - 엔티티별 CRUD 도구 자동 노출 (NestJS 모듈 메타데이터에서 생성)

3. **파이프라인 상태 변경 자동 로깅** (Frappe CRM 패턴)
   - Deal.stage, Match.stage, Property.checkStatus 변경 시 ActivityLog 자동 생성
   - Prisma Middleware의 `$beforeUpdate`에서 이전 값과 비교 → `changes` JSONB 기록

4. **RBAC Guard 패턴** (Twenty의 ObjectPermission 패턴)
   - NestJS `@Roles('owner', 'manager')` 데코레이터 + Guard
   - 엔티티별 권한 (Property는 agent도 CRUD 가능, Office 설정은 owner만)
   - MCP 도구에도 동일 권한 적용 (Read 자동, Write는 역할 확인)

**Phase 2 — 프론트엔드 구현 시 적용:**

5. **커스텀 뷰 시스템** (Twenty 5가지 뷰 + Frappe Dynamic View)
   - 사용자가 저장하는 필터/컬럼/정렬/그룹바이 뷰
   - 매물 목록: "내 급매물", "고덕동 아파트", "확인 기한 임박" 등
   - View 메타데이터 테이블 (viewFields, viewFilters, viewSorts)

6. **자동 담당자 배정 규칙** (Frappe CRM Assignment Rule 패턴)
   - 조건 기반 자동 배정 (지역별, 매물유형별, 라운드로빈)
   - InsightRule의 확장으로 구현 (type: `auto_assignment`, config에 조건/배정 규칙)

7. **SLA 기반 기한 관리** (Frappe CRM SLA Template 패턴)
   - 매물 확인 기한 (등록 후 7일), 문의 응답 기한 (24시간), 계약 진행 기한
   - InsightRule에서 기한 초과 감지 → Insight 알림 생성

### 19.8 적용하지 않는 것들

- **자체 AI 내장** — 리소스 부족. MCP 위임 전략 유지
- **음성 AI (Compass)** — Phase 4 이후 고려
- **에이전트 마켓플레이스 (HubSpot)** — 사용자 수 충분해진 후 고려
- **멀티 에이전트 오케스트레이션 (Salesforce)** — MCP 도구를 잘 나눠놓으면 외부 AI가 알아서 오케스트레이션
- **Custom Objects / 유연한 스키마 (Attio, Twenty)** — 부동산 도메인은 스키마가 고정적. Site/Unit/Property 체인이 이미 최적화됨. Twenty의 Metadata-Driven 접근은 범용 CRM에는 적합하지만 도메인 특화 ERP에는 과잉
- **GraphQL (Twenty)** — REST + MCP 조합이 우리 규모에 적합. GraphQL은 프론트엔드 복잡도 증가 대비 이점 부족
- **App SDK / 앱 마켓플레이스 (Attio)** — Phase 2+ 이후, 사용자 충분해진 후 고려
- **시맨틱 검색 (Attio)** — Phase 2+에서 pg_vector로 상담 기록/메모 주제 기반 검색 고려
- **노코드 자동화 빌더 UI (Attio, Twenty)** — Phase 2+에서 InsightRule을 사장님이 직접 설정하는 UI로 확장 고려. Twenty의 DAG 워크플로우 빌더 참고

---

## Appendix: Enums 정의

```typescript
// 매물 유형
enum SiteType {
  apartment = 'apartment',
  officetel = 'officetel',
  villa = 'villa',
  house = 'house',
  commercial = 'commercial',
  land = 'land',
  living_accommodation = 'living_accommodation',
}

// 거래 유형
enum TransactionType {
  sale = 'sale',
  jeonse = 'jeonse',
  monthly = 'monthly',
}

// 매물 확인 상태
enum CheckStatus {
  unverified = 'unverified',
  verified = 'verified',
  in_contract = 'in_contract',
  hold = 'hold',
  done = 'done',
}

// 매칭 스테이지
enum MatchStage {
  suggested = 'suggested',
  buyerContacted = 'buyerContacted',
  viewing = 'viewing',
  ownerContacted = 'ownerContacted',
  negotiating = 'negotiating',
  dealCreated = 'dealCreated',
  closed = 'closed',
}

// 거래 스테이지
enum DealStage {
  selection = 'selection',
  deposit = 'deposit',
  contract = 'contract',
  completed = 'completed',
  closed = 'closed',
}

// 태스크 출처
enum TaskSource {
  manual = 'manual',
  system = 'system',
  ai = 'ai',
}

// 구독 플랜
enum SubscriptionPlan {
  basic = 'basic',
  pro = 'pro',
  premium = 'premium',
}

// 캘린더 이벤트 유형 (FullCalendar 기준)
enum CalendarEventType {
  viewing = 'viewing',       // 현장 방문/임장
  contract = 'contract',     // 계약 일정
  meeting = 'meeting',       // 미팅/상담
  task = 'task',             // 할 일
  general = 'general',       // 일반
}

// 네트워크 문의 상태
enum NetworkInquiryStatus {
  pending = 'pending',
  accepted = 'accepted',
  rejected = 'rejected',
  expired = 'expired',
}
```

---

## Appendix: 가격/면적 단위 규칙

**가격**: 만원 (10,000 KRW) 단위. 예시: 15.8억 = `158000` (만원)

**면적**: m² 기준 저장. 평 변환은 VIEW에서 계산: `m² × 0.3025`

```typescript
// 가격 포맷팅 예시
formatPrice(158000) // → "15억 8,000만원"
formatPrice(85000)  // → "8억 5,000만원"
formatPrice(3000)   // → "3,000만원"

// 면적 변환
toSquareMeters(pyeong: number) = pyeong / 0.3025
toPyeong(m2: number) = m2 * 0.3025
```
