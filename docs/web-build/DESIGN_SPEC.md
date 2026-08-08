# Estate ERP Web — 빌드 디자인 스펙 (모든 구현 에이전트 필독)

> 토큰·색·타이포 요약은 루트 `/DESIGN.md`가 상위 문서다. 이 문서는 그 아래에서
> 레이아웃 패턴·상태 뱃지 매핑·IA·코드 컨벤션의 상세를 담당한다. 충돌 시
> 코드(app.css/@theme, StatusBadge) > /DESIGN.md > 이 문서 순으로 따른다.
> 여기서 벗어나는 임의 디자인 금지.
> 대상 사용자: 40~60대 한국 중개사. 정보 밀도 높게, 그러나 차분하고 깔끔하게.

## 1. 톤 — "Notion처럼 차분한 업무 도구"

- 기존 `app.css`의 warm neutral 팔레트(#37352f / #f7f6f3)를 유지한다. 화려한 색 금지.
- 색은 **상태 표시에만** 사용한다. 장식용 그라데이션/큰 일러스트 금지.
- 그림자는 `shadow-xs`~`shadow-sm`까지만. 카드 구분은 주로 `border`로.
- 라운드는 `rounded-md` 기본, 페이지 단위 큰 컨테이너만 `rounded-lg`.
- 페이지 배경은 흰색, 보조 영역(필터바, 사이드 패널 헤더)은 `bg-muted`.

## 2. 시맨틱 컬러 토큰 (app.css에 정의됨 — 직접 hex 쓰지 말 것)

`--color-success`(#0f7b6c), `--color-warning`(#cb912f), `--color-info`(#2383e2),
`--color-violet`(#6940a5), `--color-pink`(#ad1a72), `--color-orange`(#d9730d)
+ 각각 `*-soft` (badge 배경용 연한 톤). Tailwind에서 `text-success`, `bg-success-soft` 형태로 사용.

## 3. 상태 뱃지 컬러 매핑 (StatusBadge 컴포넌트가 단일 소스)

| 파이프라인 | 매핑 |
|---|---|
| Listing.checkStatus | unverified=gray, verified=success, in_contract=info, hold=warning, done=neutral(진한 회색) |
| ListingIntake.status | unverified=gray, active=success, in_contract=info, hold=warning, done=neutral |
| MatchStage | suggested=gray, buyerInterested=info, viewingConfirmed=orange, viewing=violet, negotiating=warning, dealCreated=success, closed=neutral |
| DealStage | preparing=gray, preContract=violet, contracted=info, settling=orange, completed=success, closed=neutral |
| ContractStatus | draft=gray, signed=info, depositPaid=violet, balancePaid=success, registered=neutral, cancelled=destructive |
| CommissionPayment.status | draft=gray, pending=warning, partial=orange, collected=success, overdue=destructive, waived=gray, cancelled=gray |
| DealPayment.status | pending=warning, partial=orange, paid=success, overdue=destructive, cancelled=gray |
| Task.status | pending=gray, in_progress=info, completed=success, cancelled=gray |
| 광고 status | planned=gray, draft=gray, active=success, paused=warning, ended=neutral, error=destructive |

뱃지 스타일: 연한 배경 + 진한 글자 (`bg-*-soft text-*`), `text-xs font-medium`, 점(dot) 없음.

## 4. 포맷팅 규칙 (lib/format.ts의 유틸만 사용 — 인라인 포맷 금지)

- **금액**: 만원 단위 Int → `formatMoney(158000)` = "15억 8,000" / `formatMoney(5000)` = "5,000만" / `formatMoney(123456)` = "12억 3,456". 0/null → "—". 테이블에서는 `tabular-nums text-right`.
- **월세 표기**: `formatRent(deposit, monthlyRent)` = "1억 / 120".
- **면적**: `formatArea(84.92)` = "84.92㎡ (25.7평)" — 평 = m²×0.3025, 소수 1자리.
- **전화**: `formatPhone("01012345678")` = "010-1234-5678".
- **날짜**: `formatDate` = "2026.06.10", `formatDateTime` = "06.10 14:30", 상대시간은 기존 `time-ago.ts`.
- **주소 축약**: `formatAddressShort(site)` = "강동구 고덕동 · 래미안고덕" (구 + 동 + 단지명).

## 5. 공통 레이아웃 패턴

### 목록 페이지 (기본형)
```
<PageHeader title="매물장" description?  actions={<Button>+ 매물 등록</Button>} />
<FilterBar>  ← 검색 input + Select 필터들 + 결과 카운트. 한 줄, bg-muted/50 rounded-md p-2
<DataTable / 칸반 / 그리드>  ← 본문. 행 클릭 → 우측 Sheet 상세 또는 상세 페이지
```
- 테이블 밀도: 행 높이 `h-10`, `text-sm`, 헤더 `text-xs text-muted-foreground`.
- 행 클릭으로 상세 진입이 원칙. 수정/삭제는 상세 안에서 또는 행 끝 DropdownMenu.
- 목록 우측 상세는 `Sheet`(side="right", min 480px) 우선. 독립 URL이 필요한 복잡한 상세만 별도 라우트.

### 칸반 (Match/Deal/수금)
- 컬럼 헤더: 단계명 + 카운트 + 합계금액(해당 시). 카드는 흰 배경 border, 드래그 없으면 단계 변경 버튼/메뉴 제공.

### 폼
- 생성/수정 폼이 필드 ≤8개면 `Dialog`, 그 이상이면 전용 라우트(위저드).
- 필수 표시는 라벨 뒤 `*`. 저장 성공 시 `toast.success`, 목록 invalidate.
- 모든 mutation 에러는 `toast.error(메시지)`로 노출.

### 빈 상태
- `<EmptyState icon={} title="등록된 매물이 없습니다" description="..." action={<Button>}/>` — 일러스트 금지, lucide 아이콘 1개.

## 6. 공유 컴포넌트 (components/domain/ — 페이지 에이전트는 만들지 말고 가져다 쓸 것)

- `StatusBadge status= kind=` — 위 매핑표의 단일 구현.
- `PipelineSteps current= kind=` — 상세 화면 상단 단계 표시 (점-선 스텝퍼, 완료=primary, 현재=info ring).
- `MoneyText value= className=` — tabular-nums 적용.
- `PageHeader title description actions` 
- `FilterBar` + `FilterSelect`
- `EmptyState`
- `EntityChip kind="contact|property|listing|deal" …` — 이름/요약 + 클릭 시 해당 상세로 점프. 컨텍스트 연결 표시에 사용.
- `ConfirmDialog` — 삭제 등 파괴적 액션 공통.
- `DetailField label children` — 상세 패널의 라벨:값 행.

## 7. 앱 셸 / IA (foundation 에이전트 소관 — 페이지 에이전트는 건드리지 말 것)

사이드바 그룹 (업무 흐름 순):
```
[홈]      대시보드 · 업무함(inbox) · 업무(tasks) · 캘린더
[매물]    매물장(properties) · 관리단지(sites) · 광고노트(external-listings) · 내 광고(naver-my-ads)
[고객]    연락처 · 구매고객(buyer-requirements) · 상담기록 · 통화기록
[거래]    매칭 · 거래(deals) · 계약(contracts) · 수금/정산(cashflow…)
[네트워크] 중개방(network) · 파트너 중개사
[운영]    직원 · 업체 디렉토리 · 자료실(documents) · AI 운영 · 설정
```
상단바: SidebarTrigger + breadcrumb(네비 config에서 자동 생성) + 우측에 전역 검색(⌘K Command 팔레트), 알림 종, "+ 빠른 등록" 버튼.

## 8. 코드 컨벤션

- 텍스트는 **한국어 하드코딩** (i18n 추가 금지 — 기존 t() 사용처만 유지).
- 데이터: TanStack Query. queryKey는 `['도메인', 필터객체]` 형태, mutation 후 관련 키 invalidate.
- API 호출은 `packages/api-client` 메서드만 사용. 없으면 api-client에 추가하고 서버 모듈 확인.
- 타입은 `packages/shared` enum/타입 재사용. UI에서 enum 문자열 비교 시 shared 상수 import.
- 새 파일은 자기 라우트 폴더(`routes/_authenticated/<page>/`) 또는 `components/<page>/` 아래에만. **다른 페이지 폴더·공유 파일 수정 금지** (충돌 방지).
- 페이지 보조 컴포넌트는 라우트 폴더 안에 `-`prefix 파일로 (TanStack Router 비라우트 컨벤션).
- 모든 목록 쿼리에 로딩 스켈레톤(`Skeleton` 행 5개)과 에러 상태(재시도 버튼) 필수.
- 화면 검증: 구현 후 `pnpm --filter web typecheck` 통과 필수.

## 9. 도메인 표기 사전 (라벨 통일)

매물장=ListingIntake/Listing 묶음, 의뢰=ListingIntake, 매물=Listing, 관리단지=OfficeSite,
구매고객=BuyerRequirement, 매칭=Match, 거래=Deal, 가계약=preContract, 본계약=contracted,
수금=CommissionPayment, 분배=CommissionDistribution, 조정=CommissionAdjustment,
업무함=EntityDraft inbox, 광고노트=ExternalListing(시장 관찰), 내 광고=OfficeAdvertisement,
거래유형: sale=매매, jeonse=전세, monthly=월세 (만원 단위).
단계 라벨: suggested=내부 후보 · buyerInterested=고객 관심 · viewingConfirmed=임장 가능 확인 · viewing=임장 · negotiating=협상 · dealCreated=거래전환 · closed=종료 / preparing=계약 준비 · preContract=가계약 · contracted=본계약 · settling=중도금/잔금 · completed=잔금완료 · closed=정산종료
