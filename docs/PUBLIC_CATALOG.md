# 공개 광고 플랫폼

## 구현 범위

- `apps/catalog`: 별도 Vite + React 소비자 사이트. 삭제된 업무용 `apps/web`을 복원하지 않음.
- `/`: 지도와 매물 목록을 함께 보는 소비자 검색 화면. 지역/단지명, 거래유형, 건물유형, 가격(월세는 보증금), 전용면적, 가격순 정렬, 단지별 마커, 지도 영역 재검색.
- `/offices/:officeId`: 공개 사무소 정보, 제목·단지명 검색, 매매·전세·월세 필터, 24개 단위 페이지 이동.
- `/homes/:publicationId`: 공개 설명, 명시적으로 선택한 사진, 현재 가격·관리비·면적·층·확인일, 전화 문의.
- `/demo`: 가상 매물 8개/7개 단지 및 AI 생성 사진으로 표시한 예시 화면. 실제 광고나 실제 문의 기능이 아님.
- 관심 매물은 기기 localStorage에 ID만 보관하며 실제 상세는 매번 공개 API로 조회한다. 종료/비공개 광고는 제외한다.
- 공개 광고는 내부 중개사 커뮤니티 공유와 별개다. 커뮤니티 게시 여부로 일반 고객에게 노출되지 않는다.
- `GET /public/homes`, `GET /public/map`: 같은 공개 가능 조건과 검색 필터를 적용한다. 지도는 좌표가 있는 광고 최대 500개를 단지별 집계하며 초과 여부를 표시한다. 매매/전세/월세가 섞이면 비교 불가능한 최저가 대신 개수를 표시한다.
- 데스크톱 매물 상세 → 거래 매물 → **공개 매물 설정**: 제목·설명·HTTPS 사진 주소(최대 12장), 공개 설정, 개별 매물 링크 복사와 사무소 목록 링크.
- `PublicListing`: 외부 CP 관측 이력과 별개의 자체 공개 데이터. 기본 비공개. `(office_id, listing_id)` 복합 FK로 다른 사무소의 거래 조건 연결 차단.
- 인증된 관리 API는 요청 사용자의 officeId로 소유권 검사. 공개 조회는 허용 필드만 Prisma select하며 내부 메모·호수·소유자 연락처·내부 사진을 조회하지 않음.
- 공개 조회마다 기존 `MARKETABLE_LISTING_WHERE`를 적용. 보류, 거래 조건 일시 중단, 점유 거래, 종결, 비활성 사무소는 숨김. 거래 가능 상태로 돌아오면 기존 공개 설정에 따라 다시 노출.
- 공개 사무소가 모든 광고를 비공개로 바꾸면 사무소 페이지도 404. 공개 설정은 유지됐지만 모두 거래 불가하면 빈 목록.
- 광고 공개 전 사무소 전화번호·대표자·등록번호·주소 확인. 외부 공개 응답은 `Cache-Control: no-store`.

## 실행

```bash
pnpm install
pnpm prisma:generate
# 대상 DB와 기존 pending migration을 먼저 확인한 뒤 프로젝트의 migration 절차 사용
pnpm dev:server
pnpm dev:catalog
pnpm dev:desktop
```

이번 변경의 migration은 `prisma/schema/migrations/20261014160000_public_listings/migration.sql`.
운영 DB에는 적용하지 않았다. 검증은 별도 임시 PostgreSQL DB에만 수행했다.

로컬 미리보기: http://127.0.0.1:5180/demo

- catalog의 `VITE_NAVER_MAPS_NCP_KEY_ID`: Naver Cloud Maps 공개 클라이언트 ID. Web Dynamic Map을 활성화하고 웹 서비스 URL에 로컬/운영 origin을 등록해야 한다. 비밀키를 넣지 않는다. SDK는 `oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=...` 사용.
- catalog의 `VITE_API_BASE_URL`: 기본 `/api`; 개발 서버가 localhost:3000으로 프록시. 운영에서는 API origin 또는 같은 origin의 `/api` 프록시 필요.
- desktop의 `VITE_PUBLIC_CATALOG_URL`: 공개 사이트 origin. 개발 기본값 `http://localhost:5180`; 운영 빌드에는 실제 origin 지정 필요.
- 배포 호스트는 `/homes/*`, `/offices/*` 직접 접근에 index.html fallback 필요.

## 검증 결과

- 소비자 앱 production build 및 API client typecheck 통과.
- 서버 typecheck 통과.
- 공개 서비스·기존 거래 가능 상태 테스트와 PostgreSQL/HTTP 통합 테스트: 3 suites, 15 tests 통과.
- 임시 PostgreSQL 17 + PostGIS에서 migration SQL 적용 성공. 실제 DB에 저장 후 가격 반영, 비공개, hold/closed/paused/contracted 숨김, 계약 취소 후 노출, 다른 사무소 저장 차단 및 FK 에러 P2003 확인.
- Nest HTTP 검증: 비로그인 관리 조회 401, 다른 사무소 조회 404, 허용하지 않은 입력/사진 URL/페이지 400, 공개 상세 200 및 no-store 확인. 통합 테스트의 Clerk 토큰 확인은 테스트용 대체 구현이며 실제 Clerk 로그인 검증은 아님.
- IAB를 사용할 수 없어 Ego Browser로 소비자 UI 검증. 거래 필터 3→1개, 없는 검색어 0개, 상세 이동, 390px 모바일 목록·상세 확인. 모바일 document scrollWidth=390으로 가로 넘침 없음.
- 실제 Estate ERP Electron(CDP 9333)의 독립 컴포넌트 fixture에서 입력·공개 저장·링크 복사·비공개 저장·Escape 닫기 확인. fixture API는 예시 응답이며 실제 로그인한 사무소의 게재 acceptance는 미검증.
- desktop 전체 typecheck는 기존 상담·네트워크·업무·매물 신규 화면의 status/checkStatus/includeInactive 관련 오류 17개로 실패. 새 파일에서 보고된 타입 오류는 없음.
- 실행 환경 Node 22.20은 저장소 요구 Node >=23보다 낮아 경고가 발생했다.

```bash
pnpm --filter @estate-erp/server test --runInBand public-listings listing-state
# 통합 테스트: disposable local DB에 현재 schema 설치 후 명시적으로 지정
PUBLIC_CATALOG_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/estate_public_qa \
  pnpm --filter @estate-erp/server test --runInBand public-listings listing-state
```

통합 테스트는 환경변수가 없으면 skip. local host 및 estate_public_qa DB 이름을 요구한다.
데스크톱 fixture: 개발 서버의 `/test/fixtures/public-listing/index.html`.

## 지도 중심 화면 검증 (2026-10-15)

- catalog build 및 모델 테스트 5개 통과. 서버 typecheck 통과.
- 임시 PostgreSQL 17에서 공개 서비스/거래 상태/HTTP 통합 테스트 15개 통과. 지도 좌표, 가격 경계, 영역 밖 제외, 잘못된 쿼리 400, 보류/종결 광고 지도 제외를 추가 확인했다.
- Ego Browser 실제 화면: 검색 8→2, 없는 검색 0, 관심 저장 1개 및 상세 열기, 390px 모바일 상세 확인. 가로 넘침 없음.
- 현재 로컬 네이버 지도 키가 인증 거부된다. 인증 실패 처리 중 SDK가 해제된 마커를 정리하며 화면 전체가 사라지던 오류를 수정했다. 지도 영역에는 재시도 안내를 표시한다.
- **실제 지도 타일/이동/마커 클릭/위성 전환 acceptance는 인증 설정 해결 전까지 미완료**. SDK 연결 코드와 API 구현을 실제 지도 검증 완료로 간주하지 않는다.
- 콘셉트와 실제 화면을 비교: 전체 화면 지도 영역, 상단 검색 필터, 좌측 매물 목록, 상세 패널, 모바일 목록/지도 전환을 구현. 콘셉트 지도 이미지를 실제 지도 대용으로 사용하지 않는다.
- 현재 스크린샷: `output/public-catalog-map/` (gitignore 대상). 앞 절의 기존 Electron 검증은 이전 광고 편집기 작업 결과이며 이번 지도 화면 검증과 별개다.

## 남은 범위

유효한 네이버 Maps 키/origin 설정 및 실제 지도 동작 검증, 온라인 문의 접수/ERP 상담 생성, 사진 업로드 UI, 관심 알림, SEO/소셜 메타데이터, 운영 배포. 전화 문의는 링크만 제공하며 통화 기록을 ERP에 자동 생성하지 않는다.

## shadcn 스타일 정돈 (2026-10-15)

- catalog에 Tailwind v4, shadcn new-york/Radix 구성과 의미 기반 테마 토큰을 추가했다. 업무용 desktop 파일은 변경하지 않았다.
- Button, Badge, InputGroup, Select, Popover, Field, Empty, Skeleton, ToggleGroup으로 입력/선택/피드백을 통일했다. 매물 행은 구분선 중심으로 정리하고 중립색 텍스트와 짙은 청록색 강조를 사용한다.
- 공식 shadcn CLI에는 lint 명령이 없다. `pnpm --filter @estate-erp/catalog lint`는 ESLint(접근성 및 공통 입력 컴포넌트 사용 규칙)와 Stylelint(CSS 속성 및 직접 hex 색상 금지)를 실행한다. 생성된 ui primitive 파일은 ESLint 대상에서 제외하고 적용 시 소스/import를 검토했다.
- lint, production build, 기존 검색 모델 테스트 5개 통과. 실제 브라우저에서 가격 범위 오류, 필터 적용 후 트리거 포커스 복귀, 매물 상세와 390px 모바일 화면을 확인했다.
- 증거는 `output/catalog-shadcn/`. 지도 SDK 인증 실패는 여전히 별도 미해결이며 이번 스타일 변경으로 해결됐다고 간주하지 않는다.

## 네이버 부동산 참고 구성 개선

실제 `new.land.naver.com`의 지도/단지 목록 화면을 브라우저에서 확인하고 검색·분류·조건 필터를 세 층으로 분리했다. 상단 검색, 건물 종류 메뉴, 거래·가격·면적 조건 순서로 배치하며 중복 건물유형 드롭다운을 제거했다. 매물 행은 단지명 → 거래유형과 가격 → 전용면적/층 → 소개/중개사 순서로 정리했다. 상세는 떠 있는 카드 대신 목록 옆에 맞닿는 패널이다. 네이버 콘텐츠나 매물 데이터를 데모에 복제하지 않았다.

㎡/평 전환은 목록과 상세에 함께 반영한다. 실제 브라우저에서 오피스텔 1건 필터, 42㎡→12.7평, 고덕 검색 2건, 상세 84㎡→25.4평 및 390px 모바일 가로 넘침 없음을 확인했다. lint/build/기존 모델 테스트 5개 통과. 스크린샷은 `output/catalog-naver-reference/`. 네이버 지도 인증 거부는 미해결이며 전체 지도 경험의 검증은 아직 완료되지 않았다.

## Estait 브랜드 마감

지도 검색 구조를 유지하면서 잉크색 masthead, 건물 형태 SVG 심벌, Manrope 숫자와 Noto Sans KR 본문, 코발트 거래유형 강조를 적용했다. 저장 상태를 배경색으로 구분하고 마우스 버튼 눌림에 150ms 이내 피드백을 제공한다. 키보드 포커스 상태에서는 눌림 transform을 적용하지 않고 reduced-motion에서는 전환을 제거한다.

lint와 production build 통과. 실제 390px 브라우저에서 검색 2건, 목록/상세 확인 및 scrollWidth=390 검증. 증거는 `output/catalog-slick/`. 네이버 지도 인증 문제는 계속 미해결 상태다.

## Consumer redesign and housing requests (2026-10-15)

- Consumer UI: compact white masthead, map-first layout with a 400px single-column listing sidebar and small thumbnails. Card borders and spacing style each listing row; mobile defaults to the map. Existing saved/filter/detail flows are retained. Request form uses a Radix dialog and shared shadcn controls.
- Clerk React provider uses `VITE_CLERK_PUBLISHABLE_KEY` (same instance as server). Korean login/sign-up and account menu. Consumer guard verifies session tokens and `CATALOG_AUTH_ORIGINS`; it never provisions ERP employee accounts. The current Clerk dashboard controls which sign-in methods are offered.
- `GET /public/request-regions?q=고덕` searches legal wards; `POST /public/requests` accepts a UUID idempotency key, ward, type, transaction, max budget in 만원, requirements, name, phone, and explicit consent. `GET /public/requests` returns only the authenticated consumer's latest 50 receipts.
- Routing means **offices with an OfficeSite in the selected ward**, not physical radius. Only active offices with active owners/managers qualify. A transaction creates one buyer Task per office, persisted notifications per owner/manager, and a consumer receipt. WebSocket notifications emit after commit. No recipient yields an error; duplicate retries do not resend. Five new requests per consumer per rolling day.
- Platform-owned `ConsumerRequest` intentionally has no office_id; office-scoped Tasks contain the contact/requirements. Platform history stores no contact data. Consumers cannot read office Tasks. This first version supports phone consultation, not in-site offers/chat or request cancellation. Office tasks retain the supplied consent timestamp.
- `/demo` is explicitly non-delivering: no API writes or contact persistence. Form completion is a preview, never a real receipt.
- Migration: `20261015150000_consumer_requests`. Local DB at 127.0.0.1:5432 and Docker daemon were unavailable during this change; migration/application and signed-in ERP delivery are not verified. Do not claim live delivery from mock service tests or demo UI.
- Set the server `CATALOG_AUTH_ORIGINS` to comma-separated exact consumer origins before enabling real submissions. Apply migrations to the intended database, run server, verify signed-in request → recipient Task/notification. Do not use the ERP employee `/auth/me` flow for consumers.
