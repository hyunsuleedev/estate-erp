# 감사: auth-shell — complete (7.5/10)

로그인/회원가입은 Clerk 임베드 컴포넌트(SignIn/SignUp)로 구현되어 있고, koKR 로컬라이제이션 + 커스텀 에러 문구까지 적용된 완성도 높은 상태다. auth-provider가 Clerk 토큰을 api-client에 주입하고 GET /auth/me로 서버 유저를 동기화하며, 서버는 clerkId 기반 자동 프로비저닝(owner)을 수행해 Clerk 연동이 클라이언트-서버 전 구간 작동한다. 사무소 온보딩(onboarding.office.tsx)은 POST /offices/me로 정상 동작하고 에러/제출중 상태 처리도 갖췄다. 다만 _authenticated 레이아웃의 브레드크럼 라벨 누락, API 장애 시 재시도 UI 부재, 직원의 기존 사무소 합류 경로 부재 등 갭이 남아 있다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- Clerk SignIn/SignUp 임베드 (한국어 koKR 로컬라이제이션 + form_identifier_exists 등 커스텀 에러 문구, main.tsx ClerkProvider)
- 로그인 페이지 브랜드 스플릿 레이아웃 (좌측 제품 소개 + 우측 Clerk SignIn) 및 로그인/회원가입 상호 링크
- auth-provider: Clerk getToken을 api-client tokenProvider로 주입, GET /auth/me 동기화, 401 시 authFailureHandler로 세션 정리, Clerk signOut 연동 로그아웃
- _auth 레이아웃: 인증된 사용자는 office 유무에 따라 /dashboard 또는 /onboarding/office로 리다이렉트, 로딩 중 SplashScreen
- _authenticated 레이아웃: 비인증→/login, office 없음→/onboarding/office 가드 + 사이드바/브레드크럼 셸
- AppSidebar: 역할 기반 메뉴(owner/manager 전용 캐시플로우 하위 메뉴), i18n(react-i18next), 사무소명/유저 표시, 로그아웃
- 온보딩(사무소 생성): 사무소명 필수 검증, 대표자/등록번호/전화/주소 선택 입력, POST /offices/me 호출, ApiError 메시지 표시, 제출중 상태, 생성 후 refresh→대시보드 이동, 로그아웃 탈출구
- 서버 Clerk 연동: clerkId로 유저 조회 후 미존재 시 owner 자동 프로비저닝(loginId 자동 생성, 트랜잭션 + unique 충돌 복구), 직원은 employees 모듈에서 Clerk Admin API로 생성
- index.tsx 루트 리다이렉트 (인증/office 상태별 분기)
- SplashScreen 로딩 화면 (단계 표시 + 진행 바, aria-busy/aria-live)

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- _authenticated.tsx routeLabels에 실제 존재하는 라우트 다수 누락 — cashflow(및 ledger/partner-commissions/employee-settlements/my-settlement/expenses), calls, documents, inbox, partner-brokers, service-vendors, properties/external-listings 진입 시 브레드크럼이 빈 문자열로 렌더링됨. 라벨 추가 또는 라우트 staticData 기반으로 전환 필요
- auth-provider에서 GET /auth/me가 401이 아닌 오류(네트워크/5xx)로 실패하면 isAuthenticated=false 상태로 남아 Clerk 로그인 상태인데도 /login으로 튕김 — 에러 안내 + 재시도 버튼 UI 없음
- 비활성 계정/비활성 사무소(서버 clerk-auth.service가 isActive=false 시 거부) 안내 화면 없음 — 사용자는 이유 모른 채 로그인 화면으로 반복 리다이렉트됨. '계정이 비활성화되었습니다' 전용 화면 필요
- 신규 가입자가 무조건 owner로 프로비저닝되어 사무소 생성만 가능 — 직원이 초대 코드/링크로 기존 사무소에 합류하는 온보딩 경로 없음 (현재는 사장이 직원관리에서 계정을 만들어주는 흐름만 존재). 의도된 설계라면 온보딩 화면에 '직원이신가요? 사장님께 계정 생성을 요청하세요' 안내라도 필요
- 온보딩 주소 입력이 자유텍스트 Input — 도로명주소 검색(다음 우편번호 API 등) 미연동, 법정동 정규화 원칙과 불일치
- 라우트 가드가 컴포넌트 렌더 단계의 <Navigate>로만 처리됨 — TanStack Router beforeLoad 가드 미사용으로 보호 라우트 딥링크 시 화면 플래시 발생 가능
- auth-provider의 login(loginId, password)/register(...) 함수가 파라미터를 버리고 Clerk 모달만 여는 데드코드 스텁 — 레거시 시그니처 제거 또는 정리 필요
- register.tsx는 _auth 래퍼 안의 작은 카드, login.tsx는 자체 풀스크린 스플릿 레이아웃으로 두 페이지 비주얼 일관성 없음
- 브레드크럼 라벨은 한국어 하드코딩인데 사이드바는 react-i18next 사용 — 로컬라이제이션 방식 불일치

## API 갭
- 직원 초대/합류 엔드포인트 없음 — 예: POST /offices/join (초대 코드) 또는 초대 토큰 발급/수락 API. 현재는 POST /offices/me(owner 생성)와 employees 모듈의 관리자 생성만 존재
- GET /auth/me가 비활성 계정/사무소를 401로만 거부 — 프론트가 비활성 사유를 구분 표시할 수 있는 에러 코드/응답 구조 없음 (예: 403 + reason: 'inactive_office')

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_auth.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_auth/login.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_auth/register.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/onboarding.office.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/index.tsx

## 공유 의존성 (수정 금지 영역)
- @/providers/auth-provider (Clerk useAuth/useClerk 래핑 — 전 페이지 공유, 최대 충돌 표면)
- @/lib/api (tokenProvider/authFailureHandler 주입 지점)
- @/components/layout/splash-screen
- @/components/layout/app-sidebar (+ nav-main, nav-favorites, nav-user, team-switcher)
- @/components/ui/sidebar, separator, breadcrumb, button, input, label
- @clerk/react (ClerkProvider는 main.tsx), @clerk/localizations
- @/providers/query-provider (__root)
- react-i18next (sidebar 번역)
