# Estate ERP PRD

**제품 요구사항 문서**

- 작성일: 2026년 3월 25일
- 작성자: Hyunsu
- 최종 수정: 2026년 7월 27일

이 문서는 제품 범위와 우선순위를 빠르게 이해하기 위한 PRD다. 상세 설계와 전략 메모는 별도 문서로 분리한다.

## 관련 문서

- [ARCHITECTURE.md](./ARCHITECTURE.md): 시스템 구조, MCP/CTI 전략, 모노레포 구성
- [DATA_STRUCTURE.md](./DATA_STRUCTURE.md): ERD, 엔터티 설명, 필드 규칙
- [PRODUCT_STRATEGY.md](./PRODUCT_STRATEGY.md): 시장/경쟁/AI/MCP 전략
- [DECISIONS.md](./DECISIONS.md): 핵심 결정, 미결정 사항, 후속 과제
- [LOCAL_INFRA.md](./LOCAL_INFRA.md): 로컬 개발 인프라 실행 방법
- [AGENTIC_WORKSPACE_ARCHITECTURE.md](./AGENTIC_WORKSPACE_ARCHITECTURE.md): 사람-agent 광고 운영 제어면과 skill 계약
- [desktop-prd/README.md](./desktop-prd/README.md): desktop 페이지 상세 PRD 작성 하네스

---

## 1. 제품 요약

Estate ERP는 대한민국 부동산 중개사무소를 위한 통합 ERP다. 매물 관리, 고객/상담, 매칭, 거래/계약, 일정/업무, 네트워크 매물 공유를 하나의 시스템에서 운영하는 것을 목표로 한다.

초기 제품 전략은 다음 세 가지에 집중한다.

- **CRM 본체를 먼저 완성한다.**
- **AI는 제품에 내장하지 않고 MCP를 통해 외부 AI와 연결한다.**
- **사무소 간 매물 공유 네트워크를 킬러 피쳐로 만든다.**

---

## 2. 대상 사용자와 해결 문제

### 핵심 사용자

- **Primary**: 여러 명이 일하는 중개법인/팀
- **Secondary**: 1인 중개사

### 현재 시장의 문제

- 매물, 고객, 상담, 거래, 일정이 여러 도구와 메신저에 흩어져 있다.
- CTI, 광고, 매물 공유, 직원 관리가 서로 분리돼 있어 운영 비용이 높다.
- 웹 기반 도구만으로는 한국 중개사무소가 요구하는 설치형 신뢰감과 로컬 연동 수요를 충족하기 어렵다.
- AI를 쓰고 싶어도 CRM 데이터와 실제 업무 액션이 연결되지 않는다.

### 해결하려는 핵심 Job

- 매물을 구조화해서 계속 관리하고 상태를 추적한다.
- 고객 조건과 매물을 연결해 상담과 거래로 이어지게 한다.
- 팀 단위로 업무와 일정을 공유하고 담당자를 분명히 한다.
- 전화/상담/거래 흐름을 끊기지 않게 연결한다.
- 외부 AI가 CRM 데이터를 읽고 실제 업무를 수행할 수 있게 한다.

---

## 3. 제품 원칙

### 3.1 데스크톱이 메인 제품이다

웹앱은 보조 접근 채널이고, 메인 사용 환경은 Electron 데스크톱 앱이다. 이유는 다음과 같다.

- 한국 시장에서 설치형 프로그램에 대한 신뢰가 여전히 강하다.
- CTI Bridge, 내장 Codex 실행, 시스템 트레이, OS 알림 등 로컬 기능이 필요하다.
- 장기적으로 모바일/웹보다 데스크톱 중심의 업무 흐름이 더 자연스럽다.

### 3.2 CRM이 먼저고 AI는 두 계층으로 연결한다

- **Phase 1**: CRM 서버를 MCP 서버로 설계해 외부 AI(Claude Desktop/ChatGPT 등)가 직접 연결하도록 한다.
- **Phase 2**: 앱 내부에 AI 챗을 도입한다. Claude API를 호출하되, MCP와 동일한 도구를 재사용한다.
- AI 도구(함수) 정의를 한번만 하면 외부 MCP 연결과 내부 AI 챗이 동시에 사용한다.
- AI 비용은 외부 API 호출 기반(건당 ~20원)이며, 자체 LLM 호스팅은 사무소 1,000개 이상에서 검토한다.

### 3.3 멀티테넌시는 기본 전제다

- 모든 비즈니스 데이터는 `office_id` 기준으로 분리한다.
- 사용자, 권한, 감사 로그, 네트워크 액션 모두 사무소 단위로 격리한다.

### 3.4 네트워크 효과를 제품 본체에 넣는다

- 단순 CRM으로 끝내지 않고, 사무소 간 **공동 중개 네트워크**를 핵심 차별점으로 둔다.
- 네트워크 공유 매물이 쌓일수록 구독 가치가 커지는 구조를 만든다.

---

## 4. 제품 범위

### 4.1 Phase 1 범위

현재 집중 범위는 **NestJS 서버 + Electron 데스크톱 앱 + AWS 배포**다.

- 인증, 사무소, 사용자, 역할 관리
- 멀티테넌시 격리
- 매물/연락처/상담/매칭/거래/태스크/일정 CRUD
- Listing 중심 파이프라인 설계
- ActivityLog 기반 감사 추적
- 수수료/캐시플로우: CommissionPayment + 타임라인/칸반/리스트 뷰 + 수금 캘린더
- 고정비 관리: OfficeExpenseTemplate
- 공적장부 발급 UI 스캐폴딩 (유료 API 업체 연동 포함)
- 매물 사진 관리 스캐폴딩 (S3 업로드는 Phase 2)
- 리모트 MCP Server 엔드포인트 (`/mcp`, Streamable HTTP, JWT/API key/OAuth 인증)
- 일반 `Task(category=advertisement)` 기반 광고 업무
  - 사용자가 내광고관리 또는 업무 화면에서 요청을 만들고, 사용자가 시작한 외부 AI가 MCP `claim_task`로 원자적으로 선점
  - 서버는 agent를 기다리거나 깨우는 queue/wakeup/run을 두지 않으며 Task에는 pending / in_progress / completed / cancelled만 표시
  - CP 실행의 대상 확인·저장·재광고·재검증 단계와 재시도는 `estate-erp-ad-task-runner` 로컬 SQLite에만 기록
  - 전체 CP 조회가 완전할 때만 ListingAdvertisement 원장을 갱신하고, 저장 후 같은 provider record를 reload해 persisted 값을 확인한 뒤 Task 완료
  - 네이버 비교는 선택 사항이며 광고노트 ExternalListing과 내 광고 비교 projection은 계속 독립 저장
  - 같은 호실의 활성 경쟁 광고 중 더 싼 비교 가능 조건이 하나라도 있으면 순위와 무관하게 경고하고, 순위·층 노출은 판단 근거로 함께 표시
  - CAPTCHA·MFA·계정/대상/저장값 불일치는 로컬 blocker로 남기고 일반 Task를 pending 또는 in_progress로 유지
- 광고노트 수집 범위는 `naver-complex-collector` 로컬 SQLite에 저장
  - 관리단지 가져오기와 경쟁단지 추가는 사용자 명시 요청·후보 확인 뒤 수행
  - ERP 서버에는 수집 범위·스케줄이 아니라 완전한 관측 snapshot만 저장
- AWS 인프라 배포 (ECS Fargate + ALB + RDS + ElastiCache + S3 + ECR)
- GitHub Actions CI/CD
- Electron 자동 업데이트 (electron-updater + S3 + 커스텀 알림 UI)

현재는 아래 항목을 구현 범위에서 제외한다.

- `Call Workspace`를 포함한 전화 응대 UI
- 인바운드/아웃바운드 콜 세션 처리
- 데스크톱 실시간 통화 팝업
- CTI 연동을 전제로 한 상담 시작 흐름
- 범용 AI 검토함 및 Rule/Proposal/EntityDraft 기반 승인 큐
- 내부 AI 챗 (Phase 2)
- pgvector 기반 의미 매칭 (Phase 2)

### 4.2 Phase 2 범위

- **내부 AI 챗**: Claude API + 도구 호출 + 대화 기억 (ChatSession/ChatMessage)
- **pgvector 의미 매칭**: 매물 설명 임베딩 → SQL 필터 + 벡터 검색 + LLM 판단 3단계
- 웹 앱(Vite SPA)
- 관리자/직원용 CRM UI 고도화
- 사진 업로드 (S3 presigned URL + drag & drop)
- 공적장부 실제 API 연동 (틸코 등)
- 알림, 실시간 동기화 (Socket.io + Redis Adapter), 시스템 트레이
- `Call Workspace`를 포함한 desktop 전화 응대 UI 구현
- 전화 기반 상담 기록 진입 흐름 정리

### 4.3 Phase 3 범위

- Electron과 독립된 로컬 자동화 Skills
- 네이버/CP 외부 데이터 연동
- 보이는 로컬 세션 기반 이실장 `agent-browser`/computer-use executor
- Skill 전용 `config.js` 기반 CP 계정 설정과 온디맨드 로그인
- CTI Bridge
- Electron과 CTI Bridge 간 로컬 통신

### 4.4 Phase 4 범위

- Flutter Android 앱
- Android 네이티브 플러그인/서비스 기반 전화 기능 연동
- `ROLE_CALL_SCREENING` 기반 전화 수신 감지
- 통화 중 오버레이 팝업
- 사용자가 기본 통화앱에서 직접 통화 녹음을 켜도록 유도
- 통화 후 녹음 파일 업로드 및 서버 STT 연동
- 초기 버전은 `READ_CALL_LOG` 없이 출시하고, Play 정책 리스크가 큰 권한은 후순위로 둔다

---

## 5. 핵심 기능

### 5.1 CRM 코어

- 매물 관리
- 연락처/소유주/고객 통합 관리
- 상담 기록
- 구매 고객 조건 관리
- 매칭 파이프라인
- 거래/계약 관리

### 5.2 업무 운영

- 태스크
- 캘린더
- 규칙 기반 알림
- 활동 로그와 감사 추적

### 5.3 공동 중개 네트워크

- 중개방 생성/참여
- 매물 공유
- 공개 항목 마스킹
- 문의와 채팅
- 공동 중개 흐름 연결

### 5.4 CTI 및 모바일 확장

- Flutter를 모바일 앱 본체로 사용하고, 전화/오버레이/설정 이동은 Android 네이티브 레이어로 분리한다.
- 앱은 `default caller ID & spam app` 역할 요청을 통해 통화 감지 흐름을 확보한다.
- 전화 수신 팝업
- 통화 중 `다른 앱 위에 표시` 기반 안내 오버레이
- 기본 통화앱의 통화 녹음 설정 화면 또는 관련 설정으로 이동 유도
- 다른 통화앱의 녹음 버튼을 직접 제어하지 않고, 사용자가 직접 녹음을 시작하는 UX를 전제로 한다.
- 통화 후 상담 기록
- 통화 후 녹음 파일 선택/업로드
- 서버 음성 텍스트 변환과 후속 액션 연결

### 5.5 관리자 기능

- 직원별 활동 추적
- 거래/업무/일정 집계
- 직원 급여 유형 관리 (고정급/혼합/수수료제)

### 5.6 수수료/캐시플로우

- CommissionPayment: Deal별 수수료 수금 추적 (매도측/매수측/공동중개 분리)
- 수금 상태 파이프라인: pending → collected / overdue / partial / waived
- 세금계산서 발행 추적 (none → issued → sent)
- OfficeExpenseTemplate: 사무소 고정비 템플릿 (한번 등록 → 매월 자동 반영)
- 캐시플로우 대시보드: 타임라인(월별 시간순) / 칸반(단계별) / 리스트(테이블) 3가지 뷰
- 수금 캘린더: 잔금일/수금 예정일을 월별 달력에 표시
- 순이익 추정: 수금 완료 - 고정비 자동 계산

### 5.7 공적장부 발급

- 6종 장부: 등기부등본(유료 700원), 건축물대장, 토지/임야대장, 지적도, 토지이용계획확인서, 대지권등록부(무료)
- 유료 API 업체 연동 (틸코 / 코리아크레딧뷰로 등)
- 발급 결과 S3/R2 저장 + PublicDocument 메타데이터 DB 관리
- Property 상세 페이지에서 원클릭 발급
- 자료관리 페이지에서 전체 발급 이력 통합 조회

### 5.8 MCP Server

- **리모트 MCP (Estate ERP)**: NestJS Streamable HTTP 엔드포인트 (`/mcp`). Codex/ChatGPT 등 외부 AI가 직접 연결.
- **크롤러 MCP (별도 패키지)**: 네이버 부동산 HTML 파싱 전용. `packages/mcp-crawler`로 분리, `npx @estate-erp/mcp-crawler`로 실행. 사용자 PC에서 로컬 실행 (IP 자연스러움 + 법적 분리).
- **로컬 자동화 Skill** (Phase 3): Electron과 독립 실행. 일반 광고 Task를 claim하고, CP 자격증명 설정·Skill 소유 브라우저 제어·외부 데이터 수집·세부 SQLite 실행 상태를 담당하며 ERP에는 검증된 결과와 Task 상태만 기록.
- 인증: JWT 또는 API Key (`X-API-Key` 헤더). API Key는 만료 없이 자동화 전용.
- 도구 목록: search_listings, get_property, find_tasks, claim_task, update_task, create_consultation, search_buyers, get_deal, upsert_external_listings 등

**크롤러 연동 흐름**:

```
Claude Desktop
  ├── 크롤러 MCP (로컬): crawl_naver_listings → 매물 raw 데이터 반환
  └── Estate ERP MCP (리모트): upsert_external_listings → 광고노트에 등록
  Claude가 크롤러 결과를 ERP 형식에 맞게 자동 변환 (스키마 가이드 기반)
```

**n8n/Zapier 연동**: API Key 인증으로 REST API 직접 호출 가능. 고급 사용자용.

### 5.9 내부 AI 챗 (Phase 2)

- AI Chat Service: NestJS 모듈, Claude API 호출 + 도구 실행
- 도구: MCP와 동일한 함수 재사용 (search_listings, create_task 등). LLM은 SQL을 직접 생성하지 않고 구조화된 함수만 호출.
- 대화 기억: ChatSession / ChatMessage DB 저장. 최근 20개 메시지 + 이전 대화 요약으로 컨텍스트 관리.
- 시스템 프롬프트: 부동산 업무 범위로 제한. 관련 없는 질문은 거부.
- 의미 매칭: SQL 필터(숫자/지역) + pgvector(텍스트 유사도) + LLM(최종 판단) 3단계 파이프라인
- 비용: ~$0.015/회 (~20원), 사무소당 월 ~3만원 추정

---

## 6. 핵심 사용자 흐름

### 6.1 매물 관리 흐름

```
Site/Unit 등록
→ Property 생성
→ ListingIntake 접수
→ Listing 거래 옵션 생성
→ 확인 이력 추적
→ 상담/매칭/거래로 연결
```

상태는 서로 다른 소유 축으로 분리한다.

- 의뢰 생명주기: `ListingIntake.lifecycleStatus = open | hold | closed`
- 확인 상태: `lastVerifiedAt`, `lastCheckResult`, `nextConfirmAt`에서
  `unverified | verified | overdue | no_answer` 파생
- 거래 상태: 비취소 `Deal.stage`에서 `in_contract | completed` 파생
- 옵션 중단: `Listing.isPaused`

### 6.2 매칭 흐름

```
suggested
→ buyerInterested
→ viewingConfirmed
→ viewing
→ negotiating
→ dealCreated
→ closed
```

### 6.3 거래 흐름

```
preparing
→ preContract (선택)
→ contracted
→ settling
→ completed
→ closed
```

### 6.4 공동 중개 흐름

```
중개방 생성
→ 참여 승인
→ Listing 공유
→ 다른 사무소가 문의
→ 수락/거절
→ 공동 중개 진행
```

---

## 6.5 업체 디렉토리 (서비스 업체 관리)

거래 후 하자/수리 이슈 발생 시 중개사가 업체를 빠르게 찾아 연락할 수 있도록 서비스 업체 디렉토리를 제공한다. Contact(사람)와 별도 테이블로 분리하되, 연락처 통합 검색은 DB View로 지원한다.

**배경 — 중개사의 거래 후 업무:**

거래 완료 후에도 매수자가 하자/수리 문제를 중개사에게 의뢰하는 일이 빈번하다. 중개사는 업체 연락처를 폰/카톡/메모장에 흩어서 관리하고 있으며, 3~5곳에 전화해서 가능 여부와 견적을 파악하고, 매도자에게 비용 청구 협상까지 해야 한다.

**1차: 사무소별 업체 관리**

- 사장님/중개사가 ERP에 단골 업체를 직접 등록
- 서비스 카테고리(배관, 도배, 청소 등) + 서비스 지역(구 단위) 기반 검색
- 매물 주소에서 자동으로 지역 매칭 → 해당 지역 업체 리스트 표시
- MCP 도구(`search_vendors`)로 AI 에이전트도 업체 검색 가능

**2차: 플랫폼 공용 업체 풀**

- 플랫폼이 등록/관리하는 공용 업체 목록 (officeId = null, Site 패턴 동일)
- 모든 사무소에서 조회 가능
- 광고비 없음 — 순수 편의 기능으로 제공
- 사무소 개인 업체가 먼저, 공용 업체가 보조로 노출

**Contact와 분리하는 이유:**

- Contact = CRM 관계 대상 (매도자, 매수자, 세입자) — officeId 필수
- ServiceVendor = 서비스 제공 업체 — officeId nullable (공용 풀)
- 업체는 담당자가 여러 명 (대표번호, 기사별 직통) → VendorContact 1:N
- 매물 소유자 검색에 배관업체가 섞이면 안 됨
- PropertyContact, BuyerRequirement 등 기존 CRM 관계에 업체는 엮이지 않음

**CTI 전화 팝업:**

전화 수신 시 Contact + VendorContact 두 테이블을 병렬 검색하여 팝업에 통합 표시. DB View(`all_contacts_view`)로 단일 쿼리 가능. phone 인덱스 기준 2~3ms 이내.

**서비스 카테고리 (대분류 → 세부):**

```
배관/수도: 누수 수리, 배관 교체, 하수구 뚫음, 수전 교체, 동파 복구
보일러/난방: 보일러 수리/교체, 난방배관, 온돌, 정기점검
전기/조명: 누전, 콘센트/스위치, 조명 설치, 분전반, 전기 증설
도배/장판: 전체/부분 도배, 장판/마루 교체, 곰팡이 처리
방수/방충: 욕실/옥상/베란다 방수, 결로/곰팡이, 해충 방제
타일/욕실: 타일 교체, 욕실 리모델링, 변기/세면대, 코킹, 줄눈
잠금/보안: 도어락, 열쇠, 현관문, CCTV, 인터폰
청소: 입주/퇴거 청소, 에어컨, 새집증후군/탈취, 정기 청소
인테리어: 전체/부분 리모델링, 주방, 확장/철거, 페인트
이사: 일반/포장/보관 이사, 사무실, 폐기물 처리
전문가: 법무사, 세무사, 감정평가사, 건축사, 측량사
```

**향후 확장 가능성 (Phase 2+):**

- ServiceIssue (하자 이슈 트래킹) — 접수 → 업체 연락 → 견적 → 협상 → 수리 → 완료
- ServiceQuote (업체별 견적 비교)
- 업체 리뷰/평점 시스템
- 단지별 하자 빈도 통계

---

## 7. 제품 패키지

| 제품                 | 대상            | 역할                    |
| -------------------- | --------------- | ----------------------- |
| Electron 데스크톱 앱 | 모든 직원 PC    | 메인 제품               |
| 웹 앱                | 브라우저 사용자 | CTI 제외 CRM 접근       |
| CTI Bridge           | 사무실 메인 PC  | 전화 시스템 연동        |
| Android 모바일 앱    | 직원 폰         | 전화 오버레이/상담 등록 |

---

## 8. 성공 조건

초기 제품이 성공했다고 판단하려면 아래가 만족되어야 한다.

- 매물, 고객, 상담, 거래, 태스크가 한 흐름으로 이어진다.
- 사무소 단위 데이터 격리가 안정적으로 동작한다.
- 외부 AI가 MCP를 통해 읽기/쓰기 액션을 수행할 수 있다.
- 데스크톱 앱이 일상 업무의 메인 진입점이 된다.
- 공동 중개 네트워크가 “부가 기능”이 아니라 실제 사용되는 업무 채널이 된다.
- 수수료 캐시플로우가 사장님의 월간 재무 파악 도구가 된다.
- 내부 AI 챗이 매물 검색/매칭 제안을 정확히 수행한다. (Phase 2)

---

## 9. 가격 및 사업 모델

SaaS 구독형 모델을 전제로 한다. 광고 노출 기능이 없는 업무 효율화 도구이므로 경쟁사(중개왕 3만원, 부기사 3만원) 대비 낮은 진입 가격으로 시작하고 기능 추가에 따라 인상한다.

| 플랜 | 월 가격  | 광고노트 단지 | 핵심 기능                         |
| ---- | -------- | ------------- | --------------------------------- |
| 무료 | 0원      | 2개           | CRM 기본 (매물/고객/상담/거래)    |
| 기본 | 9,900원  | 20개          | 수수료 정산 + 광고노트 + 공적장부 |
| 프로 | 29,900원 | 무제한        | 직원관리 + 내부 AI 챗 + MCP       |

Phase 1은 기본(9,900원)으로 출시. CTI/공적장부 API 연동이 완료되는 Phase 2에서 가격 재검토.
가격, 패키징, 세부 상업 정책은 [PRODUCT_STRATEGY.md](./PRODUCT_STRATEGY.md)에서 관리한다.

---

## 10. 주요 리스크

| 리스크                         | 대응 방향                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------- |
| 외부 스크래핑 차단             | 로컬 실행, 대체 데이터 소스 준비                                              |
| CTI 특정 벤더 의존             | 브리지 추상화                                                                 |
| Android 권한/Play 정책 제약    | `ROLE_CALL_SCREENING` 중심으로 시작하고 `READ_CALL_LOG`는 초기 범위에서 제외  |
| 제조사별 통화앱/녹음 설정 차이 | 앱별 딥링크 + 일반 설정 fallback + 사용자 가이드                              |
| Electron 보안/운영 부담        | 자동 업데이트, 보안 기준 유지                                                 |
| 개발 범위 과대                 | Phase별 축소, 코어 흐름 우선                                                  |
| 단순 CRM으로 차별화 실패       | 네트워크 공유 + MCP 연결에 집중                                               |
| AI API 비용 증가               | 사무소당 월 ~3만원 추정, 플랜 가격에 반영                                     |
| 광고노트 서버 부하             | 사무소당 단지 수 제한 (무료 2개 / 유료 20개), 30일 이상 비활성 매물 자동 삭제 |

상세 전략과 경쟁 환경은 [PRODUCT_STRATEGY.md](./PRODUCT_STRATEGY.md)를 참조한다.

---

## 11. 비범위 / 후순위

초기 단계에서 바로 하지 않는 것:

- 자체 LLM 호스팅 (GPU 서버) — 사무소 1,000개 이상에서 검토
- Text-to-SQL (LLM이 SQL 직접 생성) — 보안 리스크, 구조화된 함수 호출로 대체
- 노코드 자동화 빌더 UI
- 고객용 대시보드의 정식 출시
- 음성 AI 기반 자동 상담 요약 상용화
- 앱 마켓플레이스나 플러그인 생태계
- 현재 Phase 1에서의 `Call Workspace` 및 전화 응대 UI 구현
- 모바일이 기본 전화앱 자체를 대체하는 방향
- 다른 통화앱의 녹음 버튼/상태를 직접 제어하는 기능
- 초기 버전의 시스템 통화기록(`READ_CALL_LOG`) 기반 자동 수집

이 항목들은 대부분 Phase 2+ 이후 확장 대상으로 본다.

---

## 12. 인프라 아키텍처

### 12.1 AWS 구성 (Step 3)

```
[GitHub Actions] → Docker 빌드 → [ECR] → [ECS Fargate] 배포
                                            │
[ALB] ← HTTPS + 도메인                       │
  │                                          │
  ├── /api/*    → REST API (앱용)             │
  ├── /mcp/*    → MCP SSE (외부 AI 연결)       │
  └── /ai/*     → 내부 AI 챗 (Phase 2)        │
                                            │
  ├──→ [RDS PostgreSQL 15 + PostGIS + pgvector] (Private Subnet)
  ├──→ [ElastiCache Redis 7] (Private Subnet, BullMQ + Socket.io Adapter)
  └──→ [S3] (공적장부 PDF / 매물 사진 / Electron 업데이트 파일)
```

네트워크: VPC 내 Public Subnet(ECS) + Private Subnet(RDS/Redis) 분리. 보안그룹으로 DB/Redis 는 ECS 에서만 접근 가능.

### 12.2 비용 추정

| 사무소 수 | 월 서버비       | 사무소당 |
| --------- | --------------- | -------- |
| 10개      | ~$15 (프리티어) | ~$1.5    |
| 50개      | ~$60            | ~$1.2    |
| 200개     | ~$150           | ~$0.75   |
| 1,000개   | ~$600           | ~$0.6    |

### 12.3 Electron 자동 업데이트

- `electron-updater` + S3 feed (`latest.yml` + 설치파일)
- `autoDownload: false` → 사용자 확인 후 다운로드
- 커스텀 알림 UI: Main 프로세스에서 이벤트 발생 → IPC → Renderer(React)에서 shadcn 기반 토스트/모달 표시
- 프로그레스 바 + "지금 재시작" 버튼
- `electron-forge` maker (Squirrel.Windows + ZIP.macOS) + publisher-s3

### 12.4 광고노트 서버 부하 관리

- 사무소당 광고노트 단지 수 제한: 무료 2개 / 기본 20개 / 프로 무제한
- batch upsert (최대 200건/요청) + 스냅샷 세션 기반
- `isActive=false` + `lastSeenAt` 30일 이전 → ExternalListing 자동 삭제
- `raw` JSONB 7일 후 null 처리 (용량 70% 절감)

---

## 13. 참고 메모

- 상세 시스템 구조: [ARCHITECTURE.md](./ARCHITECTURE.md)
- 상세 데이터 구조: [DATA_STRUCTURE.md](./DATA_STRUCTURE.md)
- 시장/AI 전략: [PRODUCT_STRATEGY.md](./PRODUCT_STRATEGY.md)
- 결정 및 TODO: [DECISIONS.md](./DECISIONS.md)
