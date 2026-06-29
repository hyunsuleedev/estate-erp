# 파운데이션 API (페이지 구현 에이전트 필독 — 이 컴포넌트/유틸을 사용할 것, 재구현 금지)

## A. 디자인 토큰 + 도메인 컴포넌트 킷
## lib/format.ts (모두 named export, null/undefined/빈값 → "—")
- formatMoney(manwon: number|null|undefined): string — "15억 8,000만"/"5,000만", 0·null→"—", 음수는 "-" prefix. shared formatPrice 동작 그대로.
- formatRent(deposit: number|null|undefined, monthlyRent: number|null|undefined): string — "1억 / 120", 한쪽 없으면 "— / 120", 둘 다 없으면 "—"
- formatArea(m2: number|string|null|undefined): string — "84.92㎡ (25.7평)", Prisma Decimal 문자열 허용, 평은 toFixed(1)
- formatPhone(phone: string|null|undefined): string — "010-1234-5678"/"02-1234-5678"/"1588-1234", 패턴 불일치 시 원문 반환
- formatDate(d: string|number|Date|null|undefined): string — "2026.06.10"
- formatDateTime(d): string — "06.10 14:30"
- formatDday(d): string — "D-7"/"D-Day"/"D+3" (달력일 기준)
- formatAddressShort({district?, ward?, siteName?}: {각 string|null}): string — "강동구 고덕동 · 래미안고덕"

## lib/status-config.ts
- type Tone = 'gray'|'success'|'warning'|'info'|'violet'|'pink'|'orange'|'destructive'|'neutral'
- type StatusKind = 'checkStatus'|'intakeStatus'|'matchStage'|'dealStage'|'contractStatus'|'commissionStatus'|'dealPaymentStatus'|'taskStatus'|'adStatus'|'transactionType'|'proposalStatus'|'inboxStatus'
- interface StatusMeta { label: string; tone: Tone }
- STATUS_CONFIG: Record<StatusKind, Record<string, StatusMeta>> — transactionType: sale=매매(info), jeonse=전세(success), monthly=월세(orange), yearly_rent=연세(violet). inboxStatus는 api-client DraftStatus 8종(pending/processing/approved/executing/executed/failed/rejected/expired), proposalStatus는 auto_resolved 포함 7종 커버.
- PIPELINE_STEPS: Partial<Record<StatusKind, string[]>> — checkStatus/intakeStatus/matchStage/dealStage/contractStatus(취소 제외 5단계)만 정의
- getStatusMeta(kind: StatusKind, value: string|null|undefined): StatusMeta — 미정의 값은 {label: 원문, tone:'gray'}, null은 {label:'—'}

## components/domain (import { X } from '@/components/domain')
- <StatusBadge kind={StatusKind} status={string|null} size?='sm'|'default' className?> — bg-*-soft+text-* 뱃지, 미정의 값 gray fallback
- <PipelineSteps kind={StatusKind} current={string|null} cancelled? className?> — 가로 스텝퍼(완료=primary 채운 점, 현재=info ring, 미래=빈 점, 라벨 text-xs). PIPELINE_STEPS 미정의 kind면 null 반환. cancelled=true면 전체 흐림+"취소됨" 칩
- <MoneyText value={number|null} suffix? className?> — tabular-nums span, null/0→"—" (suffix는 값 있을 때만)
- <PageHeader title description? actions? backTo?={LinkProps['to']} className?> — h1 text-xl font-semibold, mb-4. backTo 주면 ChevronLeft 링크 버튼
- <FilterBar className?>{children}</FilterBar> — bg-muted/50 rounded-md p-2 flex flex-wrap gap-2 items-center
- <FilterSearch value onChange={(v:string)=>void} placeholder?='검색' className?> — Search 아이콘 input h-8 w-56
- <FilterSelect label value={string|null} onChange={(v:string)=>void} options={{value,label}[]} allLabel?='전체' className?> — value ''/null = 전체, "전체" 선택 시 onChange('') 호출 (내부 sentinel 처리)
- <FilterCount n unit?='건' className?> — "12건", 기본 ml-auto 우측 정렬
- <EmptyState icon={ElementType(lucide 컴포넌트 자체, JSX 아님)} title description? action? className?> — 중앙 정렬, 아이콘 size-10 text-muted-foreground/50
- <EntityChip kind='contact'|'property'|'listing'|'deal'|'contract'|'site' id label sublabel? propertyId? className?> — 라운드 칩. 이동: contact→/contacts/$id, property→/properties/$id, listing→propertyId 있으면 /properties/$id 없으면 /properties 목록, deal→/deals, contract→/contracts, site→/sites (deal/contract/site는 validateSearch 미존재로 목록 이동)
- <ConfirmDialog open onOpenChange title description? confirmLabel?='확인' destructive? onConfirm={()=>void|Promise<void>} loading?> — alert-dialog 기반. 자동으로 닫히지 않음: 성공 시 caller가 onOpenChange(false), loading 중 버튼/닫기 비활성
- <DetailField label value?|children className?> — 라벨 w-24 text-sm text-muted-foreground : 값 text-sm, 빈값 "—"

## components/ui 추가 (shadcn 표준 API)
- alert-dialog.tsx: AlertDialog/Trigger/Content/Header/Footer/Title/Description/Action/Cancel/Portal/Overlay
- progress.tsx: <Progress value={0-100} />
- radio-group.tsx: <RadioGroup> + <RadioGroupItem value>
- alert.tsx: <Alert variant='default'|'destructive'> + AlertTitle + AlertDescription

## app.css 신규 Tailwind 유틸 (상태 표시 전용)
text-success/warning/info/violet/pink/orange, bg-success-soft/warning-soft/info-soft/violet-soft/pink-soft/orange-soft/destructive-soft/neutral-soft, text-neutral-strong

### 킷 주의사항
- radix-ui@1.4.3 우산 패키지가 AlertDialog/Progress/RadioGroup을 모두 re-export하므로 @radix-ui/* 개별 패키지 설치 불필요 — package.json 변경 없음.
- EntityChip: 어떤 라우트에도 validateSearch가 아직 없음 → deal/contract/site는 목록 페이지로, listing은 ?listing= 검색 파라미터 없이 propertyId 기반 /properties/$id로 이동. 다음 웨이브가 deals/contracts/sites에 validateSearch(dealId 등)를 추가하면 entity-chip.tsx의 switch만 갱신하면 됨.
- intakeStatus의 active 라벨은 스펙에 미정의라 '진행중'으로 채택 (checkStatus in_contract='거래중'과 구분됨). 변경 원하면 status-config.ts 한 곳만 수정.
- git status에 보이는 app-sidebar.tsx/nav-main.tsx/team-switcher.tsx/global-search.tsx/nav-config.ts 변경은 병렬 셸 에이전트 소유 — 본 작업에서 건드리지 않음.
- typecheck에서 apps/web 외부 발 에러는 이번 실행에서 나타나지 않음 (전체 통과).
- ConfirmDialog는 성공 시 자동으로 닫히지 않는 제어형 — mutation onSuccess에서 onOpenChange(false) 호출 필요.
- Toaster는 next-themes useTheme를 쓰지만 ThemeProvider 부재 시 'system'으로 fallback되어 정상 동작.

## B. 앱 셸 (수정 금지 — 참고용)
[nav-config.ts] type NavRole='owner'|'manager'|'agent'; type NavGroupKey='home'|'listings'|'customers'|'deals'|'network'|'operations'; interface NavItem{path,label,icon:LucideIcon,group:NavGroupKey,roles?:NavRole[],children?:{path,label,roles?}[]}; NAV_GROUPS:{key,label}[]; NAV_ITEMS:NavItem[]; ALL_NAV_PATHS:string[]; getNavGroups(role?:string):{key,label,items:NavItem[]}[] (role 필터+빈 그룹 제외); ROUTE_LABELS:Record<routeId,string> (예: '/_authenticated/properties/$id':'매물 상세'); getBreadcrumb(routeId:string,pathname:string):{label:string,to?:string}[] — 새 라우트 추가 시 ROUTE_LABELS에 routeId:라벨만 추가하면 브레드크럼 자동 반영, 누락 시 가장 가까운 네비 항목 라벨 fallback. [NavMain] ({label:string,items:NavItem[]}) — 그룹 1개 렌더. [GlobalSearch] () — props 없음, 자체 ⌘K 리스너+쿼리 보유. [NotificationBell] () — props 없음. [QuickCreate] () — props 없음. [OfficeSwitcher] ({office:{name:string}}) — 내부에서 api.offices.getMe() 조회해 플랜 배지 표시. 셸 사용처: routes/_authenticated.tsx 헤더(h-14 border-b)에 GlobalSearch/NotificationBell/QuickCreate 장착됨 — 페이지 에이전트는 중복 장착 금지.

### 셸 주의사항
- pnpm --filter web typecheck 통과 (exit 0, apps/web 외부 발 에러도 현재 없음)
- 단지 검색은 api.officeSites.searchCentral(q) 사용 (api.sites에는 search 메서드 없음 — findAll 무파라미터). 단지 상세 라우트가 없어 선택 시 /sites 목록으로 이동
- 매물 검색 결과 선택 시 listing.propertyId로 /properties/$id 이동 (listing 전용 상세 라우트 없음)
- cross-entity 통합 검색 API는 여전히 부재 — 현재는 3개 엔드포인트 병렬 호출. 추후 서버에 통합 검색 추가 시 global-search.tsx만 교체하면 됨
- 알림은 api-client에 notifications 모듈이 없어 빈 상태만 구현 (notification-bell.tsx에 TODO 주석). Wave 1.5 서버 알림 모듈 완성 후 연결 필요
- MeResponse.office에 subscription이 없어 플랜 배지는 OfficeSwitcher 내부에서 api.offices.getMe()로 별도 조회 (queryKey ['office','me'], staleTime 5분)
- nav-favorites.tsx는 기존 t('favorites') 키 유지 (신규 i18n 키 추가 없음, 동작 변경 없음). app-sidebar/nav-main의 sidebar 네임스페이스 의존은 제거됨
- cashflow 인덱스(/cashflow) 브레드크럼은 '거래 > 수금/정산'으로 표시 (하위메뉴 라벨 '캐시플로우'와 구분), 하위 페이지는 '거래 > 수금/정산(링크) > 수금 원장' 체인
- 본문 패딩은 기존 p-4 pt-0 그대로 유지 — 헤더에 border-b가 추가되어 페이지 첫 요소가 보더에 붙음. 페이지들이 자체 상단 여백(PageHeader 등)을 가지면 자연스러움
- 브라우저(Playwright) 시각 검증은 Clerk 로그인 게이트 때문에 이번 웨이브에서 생략 — Wave V 전 페이지 순회에서 확인 권장