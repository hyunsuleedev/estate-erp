# 감사: design-system / 공통 UI 기반 (apps/web) — partial (5.5/10)

Tailwind v4 @theme 기반 Notion풍 웜 뉴트럴 토큰(Pretendard, radius 3단계)과 shadcn 27종, Notion식 data-table 시스템(view-bar/셀 에디터/PriceCell·AreaCell), 공유 패키지의 formatPrice/sqmToPyeong 등 기반은 탄탄하다. 그러나 상태 뱃지 컬러가 페이지마다 충돌(같은 거래유형이 3가지 색 체계), EmptyState 7곳 이상 로컬 중복, Toaster 미마운트로 toast가 동작하지 않는 버그, 다크모드 선언만 있고 비활성, 사이드바 IA에 inbox/documents/network/ai-operations 누락, 상단바에 전역 검색·알림 부재 등 셸과 일관성 레이어가 미완성이다. i18n은 스캐폴드만 있고 라우트 43개 중 3개만 사용해 사실상 하드코딩 한국어 앱이다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- Tailwind v4 @theme 토큰: Notion풍 웜 뉴트럴 팔레트(#37352f/#f7f6f3/#e9e9e7), 포인트 블루 #2383e2, destructive #e03e3e, radius sm/md/lg
- Pretendard 한글 폰트 스택 + antialiasing 전역 적용
- shadcn ui 27종: avatar, badge, breadcrumb, button, calendar, card, checkbox, collapsible, command, dialog, dropdown-menu, input, label, multi-select, popover, scroll-area, select, separator, sheet, sidebar, skeleton, sonner, switch, table, tabs, textarea, tooltip
- 앱 셸: collapsible icon 사이드바 + OfficeSwitcher 헤더 + NavMain(15항목, 수수료/정산은 owner/manager role-gated 하위메뉴) + NavFavorites(즐겨찾기 단지 5개) + NavUser 푸터 + SidebarRail
- 상단 헤더: SidebarTrigger + 2단계 브레드크럼 (하드코딩 routeLabels 맵)
- data-table 패키지(2,457줄): Notion식 view-bar(1,078줄), 인라인 cell-editor, pagination, 타입별 셀(PriceCell/AreaCell/StatusBadgeCell/TransactionTypeCell/DateCell/TextCell/FloorCell/HiddenIndicator)
- 금액 표기 유틸 @estate-erp/shared formatPrice (158000 → "15억 8,000만") + sqmToPyeong/pyeongToSqm — 단일 소스
- quick-sheet.tsx: Properties/Contacts 공용 시트 프리미티브(SheetSection, SheetEmptyState, notice tone)
- i18n 스캐폴드: ko/en × 4 네임스페이스(common/sidebar/settings/inbox), LanguageDetector + localStorage 영속, 기본 ko
- 반응형 기초: useIsMobile(768px) + shadcn sidebar 모바일 Sheet 전환
- feature-placeholder-page.tsx: 미구현 라우트용 통일 placeholder
- splash-screen + auth 가드 + 온보딩 리다이렉트가 _authenticated 레이아웃에 정리됨

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- [P0] 상태 뱃지 컬러 시스템 부재 — 거래유형 컬러가 3곳에서 충돌(cells.tsx: 매매 rose/전세 blue/월세 cyan ↔ deals: blue/emerald/amber ↔ matches: 전세 blue/월세 violet). CheckStatus/MatchStage/DealStage/ContractStatus/수금상태의 라벨+컬러를 packages 또는 lib 단일 모듈(status-config)로 통합 필요. properties는 Notion hex 직접 지정, 나머지는 Tailwind 팔레트로 톤도 분열
- [P0] Toaster 미마운트 버그 — ui/sonner.tsx만 존재하고 __root.tsx에 <Toaster />가 없어 properties/$id.tsx의 toast() 호출이 화면에 표시되지 않음
- [P0] 사이드바 IA 누락 — 라우트가 존재하는 업무함(inbox)/자료관리(documents)/네트워크(network)/AI 운영(ai-operations)/내광고관리(naver-my-ads)가 navItems에 없음 (sidebar.json 키는 이미 존재)
- [P1] 브레드크럼 routeLabels 하드코딩+불완전 — calls, cashflow 하위 5개, inbox, documents, partner-brokers, service-vendors, external-listings 등에서 빈 라벨. 라우트 메타 기반으로 전환 필요
- [P1] 공용 EmptyState 컴포넌트 부재 — contacts/$id, cashflow 3곳, service-vendors, properties/$id, external-listings 등 7곳 이상 로컬 중복 구현. 아이콘+제목+설명+CTA 패턴 통일 필요
- [P1] 상단바 기능 부재 — 전역 검색(Cmd+K 커맨드 팔레트가 셸 레벨에 없음, command.tsx는 2개 페이지 내부 전용), 알림 벨, 빠른 생성(+) 버튼 없음
- [P1] 시맨틱 컬러 토큰 부족 — success/warning/info 토큰이 없어 페이지마다 emerald/amber/sky 직접 사용. '깔끔하고 편안한 톤' 유지를 위해 Notion hex 팔레트를 @theme 토큰으로 승격 필요
- [P2] 다크모드 미완 — @custom-variant dark + .dark 블록이 사이드바 변수만 커버, 본문 토큰은 라이트 hex 고정, ThemeProvider/토글 부재. 지원할지 제거할지 결정 필요
- [P2] i18n 커버리지 ~7% — 라우트 43개 중 3개만 useTranslation, common.json 14키뿐. 상태 라벨/빈 상태/브레드크럼 전부 하드코딩 한국어. ko 단일 언어로 갈 거면 i18n 의존 제거, 유지할 거면 도메인 네임스페이스 확충 필요
- [P2] 주소 축약 표기 유틸 부재 — lib에 formatAddress/shortAddress 없음, 페이지별 즉석 조합(동/호 표시 로직이 properties/index.tsx 내부 함수로 갇혀 있음)
- [P2] 공용 사람/매물 카드, 파이프라인(단계) 시각화 컴포넌트 부재 — deals/matches가 각자 칸반 헤더·뱃지 DIY
- [P2] OfficeSwitcher가 정적 표시 전용(cursor-default, 'Estate ERP' 하드코딩) — 전환 기능 없으면 컴포넌트명/UX 정리 필요
- [P2] alert-dialog(삭제 확인), form(react-hook-form 래퍼), progress, radio-group, alert 등 ERP 필수 shadcn 컴포넌트 미설치
- [P3] DateCell 상대시간 로직과 lib/time-ago.ts 중복 가능성 — 단일화 필요
- [P3] properties/index.tsx 2,540줄 등 거대 라우트 파일에 공용화 가능한 셀렉터/필터 UI가 갇혀 있음

## API 갭
- 전역 검색용 cross-entity 검색 엔드포인트 (커맨드 팔레트에서 매물/연락처/거래 통합 검색) — 현재 api-client에 없음
- 셸 알림 센터용 Notification 목록/읽음 처리 api-client 메서드 (DB 테이블은 존재하나 웹 셸에서 소비하는 코드 없음)
- OfficeSwitcher가 실제 전환 기능을 가지려면 사용자별 복수 사무소 조회 API 필요 (현 데이터 모델상 1:1이므로 정적 표시가 맞다면 불필요)

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/app.css
- /Users/hyunsulee/estate-erp/apps/web/src/routes/__root.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/layout/app-sidebar.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/layout/feature-placeholder-page.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/layout/splash-screen.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/nav-main.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/nav-favorites.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/nav-user.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/team-switcher.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/quick-sheet.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/ui/ (27 components)
- /Users/hyunsulee/estate-erp/apps/web/src/components/data-table/data-table.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/data-table/view-bar.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/data-table/cells.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/data-table/cell-editor.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/i18n/index.ts
- /Users/hyunsulee/estate-erp/apps/web/src/i18n/locales/ko/sidebar.json
- /Users/hyunsulee/estate-erp/apps/web/src/i18n/locales/ko/common.json
- /Users/hyunsulee/estate-erp/apps/web/src/hooks/use-mobile.ts
- /Users/hyunsulee/estate-erp/apps/web/src/lib/utils.ts
- /Users/hyunsulee/estate-erp/apps/web/src/lib/time-ago.ts
- /Users/hyunsulee/estate-erp/packages/shared/src/utils.ts

## 공유 의존성 (수정 금지 영역)
- @estate-erp/shared (formatPrice, sqmToPyeong, enums) — 모든 금액/면적 표기의 단일 소스
- components/ui/* — 전 페이지가 의존하는 shadcn 27종 (특히 sidebar.tsx, badge.tsx, table.tsx)
- components/data-table/* — properties/contacts 등 리스트 페이지의 핵심 그리드
- components/quick-sheet.tsx — Properties/Contacts 시트 공유
- providers/auth-provider.tsx — role-gated 사이드바 메뉴와 라우트 가드가 의존
- lib/api.ts — NavFavorites 등 셸 자체가 api.officeSites에 의존
- lib/utils.ts (cn), lib/time-ago.ts
- hooks/use-mobile.ts — sidebar 반응형 전환
- i18n/* — 셸(sidebar/settings/inbox)만 실사용
