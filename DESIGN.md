---
version: 1
name: Estate ERP Design System
description: 40~60대 한국 중개사를 위한 고밀도 업무 도구. Notion처럼 차분한 웜 뉴트럴 위에 상태 표시에만 색을 쓴다. 이 파일은 코드에 이미 구현된 토큰의 문서화이며, ground truth는 항상 apps/*/src/app.css 와 components/domain/ 이다.

scope:
  - apps/web (Vite SPA)
  - apps/desktop/src/renderer (Electron 렌더러 — web과 동일 규칙)
precedence:
  1: "코드 토큰 — apps/web/src/app.css @theme, components/domain/StatusBadge, lib/format.ts"
  2: "이 문서 (DESIGN.md) — 토큰의 의미와 사용 규칙"
  3: "docs/web-build/DESIGN_SPEC.md — 레이아웃 패턴·IA·코드 컨벤션 상세"
  reference: "docs/reference/notion-design-analysis.md — Notion 원본 분석 (참고용, 기준 아님)"

colors:
  # 뉴트럴 (Notion풍 웜 톤 — 순수 회색·순흑 금지)
  background: "#ffffff"        # 페이지 배경
  foreground: "#37352f"        # 기본 텍스트 (primary 버튼 배경으로도 사용)
  muted: "#f7f6f3"             # 보조 영역 배경 (필터바, 사이드바)
  muted-foreground: "#787774"  # 보조 텍스트
  border: "#e9e9e7"            # 카드·행 구분은 그림자 대신 이 선으로
  secondary: "#f1f1ef"         # hover, 눌린 배경
  sidebar: "#f7f6f3"
  sidebar-accent: "#ebebea"    # 사이드바 활성 항목
  ring: "#2383e2"              # 포커스 링

  # 시맨틱 — 색은 상태 표시에만 쓴다. hex 직접 쓰지 말고 Tailwind 토큰으로.
  success: "#0f7b6c"           # + success-soft #dbeddb
  warning: "#cb912f"           # + warning-soft #fdecc8
  info: "#2383e2"              # + info-soft #d3e5ef — 앱의 유일한 포인트 블루
  violet: "#6940a5"            # + violet-soft #e8deee
  pink: "#ad1a72"              # + pink-soft #f5e0e9
  orange: "#d9730d"            # + orange-soft #fadec9
  destructive: "#e03e3e"       # + destructive-soft #ffe2dd
  neutral-strong: "#37352f"    # 종결(done/closed) 상태 뱃지

typography:
  fontFamily: "Pretendard, Pretendard Variable, -apple-system, …"  # 한국어 앱 — Inter 아님
  # 고밀도 업무 도구 스케일. 마케팅용 대형 디스플레이 타이포 없음.
  page-title:   { fontSize: 18px, fontWeight: 600 }   # PageHeader
  section:      { fontSize: 14px, fontWeight: 600 }   # 카드/섹션 제목
  body:         { fontSize: 14px, fontWeight: 400 }   # text-sm — 기본 본문
  table-cell:   { fontSize: 13px, fontWeight: 400 }   # 테이블 행
  table-header: { fontSize: 12px, fontWeight: 500, color: "{colors.muted-foreground}" }
  badge:        { fontSize: 12px, fontWeight: 500 }   # text-xs font-medium
  caption:      { fontSize: 11.5px, fontWeight: 400, color: "{colors.muted-foreground}" }
  numeric: "금액·순위·날짜는 항상 tabular-nums, 테이블에서 text-right"

rounded:
  sm: 0.25rem   # 뱃지, 인풋
  md: 0.375rem  # 기본 — 버튼, 카드
  lg: 0.5rem    # 페이지 단위 큰 컨테이너만

elevation:
  rule: "그림자는 shadow-xs~sm까지만. 구분은 border(#e9e9e7)가 기본. 무거운 drop-shadow 금지."

density:
  table-row: "h-10 (40px)"
  page-scale: "한 화면에 최대한 많은 행 — 여백보다 정보 밀도 우선, 단 border와 muted 배경으로 숨쉴 곳 유지"
---

# Estate ERP — 디자인 시스템

> UI를 작성하기 전에 이 파일을 읽는다. 여기 없는 값을 임의로 만들지 않는다.
> 위 YAML은 `apps/web/src/app.css` `@theme`에 이미 구현된 값의 문서화다 —
> 값이 다르면 **코드가 맞고 이 문서를 고친다.**

## 톤 — "Notion처럼 차분한 업무 도구"

화면은 종이 문서처럼 조용해야 한다. 흰 배경, 웜 뉴트럴 텍스트(#37352f),
보조 영역만 `bg-muted`(#f7f6f3). 색은 **상태를 말할 때만** 등장한다 —
장식용 그라데이션, 일러스트, 마케팅용 대형 타이포는 쓰지 않는다.
대상 사용자는 40~60대 한국 중개사다: 정보 밀도는 높게, 조작은 단순하게,
글자는 흐리지 않게.

## 색 사용 규칙

1. **hex 직접 사용 금지.** Tailwind 토큰(`text-success`, `bg-warning-soft`)만 쓴다.
2. **상태 뱃지는 `StatusBadge` 컴포넌트가 단일 소스다.** 파이프라인별 색 매핑을
   페이지에서 다시 정의하지 않는다. 매핑표는 `docs/web-build/DESIGN_SPEC.md` §3.
3. 뱃지 스타일은 항상 `bg-*-soft text-*` (연한 배경 + 진한 글자), `text-xs font-medium`.
4. `info`(#2383e2)가 앱의 유일한 액션 블루다 — 포커스 링, 활성 탭, 진행중 상태.
   두 번째 구조적 액센트를 도입하지 않는다.
5. 경고성 사실(경쟁 대비 차액, 순위 밀림)은 `warning`, 실패·파기는 `destructive`.
6. 종결 상태(done/closed)는 `neutral-strong` — 회색이되 흐리지 않게.

## 타이포그래피

- **Pretendard 고정.** Inter·serif·display 폰트를 추가하지 않는다.
- 대형 헤드라인 없음 — 최대가 PageHeader 18px다. 이 앱에는 히어로 섹션이 없다.
- 본문 `text-sm`(14px), 테이블 13px, 뱃지·헤더 12px. 11px 밑으로 내려가지 않는다
  (사용자 연령대 고려).
- 숫자는 예외 없이 `tabular-nums`. 금액·면적·날짜·전화는
  `lib/format.ts` 유틸로만 포맷한다 (`formatMoney`, `formatArea`, `formatDate` 등 —
  인라인 포맷 금지).

## 레이아웃 원칙

- 목록 페이지 골격: `PageHeader` → `FilterBar` → `DataTable`(행 h-10).
  행 클릭 → 우측 `Sheet`(≥480px) 또는 상세 라우트.
- 폼: 필드 8개 이하 `Dialog`, 초과하면 전용 라우트.
- 다이얼로그 목록은 화면 높이만큼 쓴다 — `max-h` 고정값으로 자르지 않는다.
- 사람이 판단할 사실(가격 차액, 순위)은 시스템이 **관측만 표시**하고
  지시형 문구("~을 검토하세요")를 쓰지 않는다 — human-in-the-loop 원칙.
- 빈 상태는 `EmptyState` 공유 컴포넌트 (lucide 아이콘 1개, 일러스트 금지).

## 모션

빈도가 규칙이다 — **얼마나 자주 보는 UI인지**가 애니메이션 여부를 정한다:

| 빈도 | 처리 |
|---|---|
| 셀 편집·키보드 액션 (수십~수백회/일) | **무애니메이션** — 절대 넣지 않는다 |
| 시트·드롭다운 (수십회/일) | 짧고 강한 ease-out, ≤300ms |
| 모달·다이얼로그 (가끔) | 표준 200ms, 닫힘은 150ms (나가는 게 항상 빠르게) |

- 진입은 ease-out 계열 — `ease-in` 금지 (시작이 느려 둔하게 느껴짐)
- `transition: all` 금지 — 속성을 명시한다
- 등장은 `scale(0.95)+opacity`에서 — `scale(0)` 금지
- 팝오버는 트리거 기준 origin (`--radix-*-transform-origin`), 모달만 중앙
- 버튼은 `active:scale-[0.98]` 프레스 피드백 필수
- `prefers-reduced-motion` 전역 가드가 app.css에 있다 — 제거하지 않는다

## 공유 컴포넌트 우선

`components/domain/`의 `StatusBadge` `PageHeader` `FilterBar` `EmptyState`
`MoneyText` `EntityChip` `ConfirmDialog` `DetailField` `PipelineSteps` 를
가져다 쓴다. 같은 역할의 컴포넌트를 페이지 안에서 다시 만들지 않는다.

## Do / Don't

### Do
- 카드·행 구분은 `border`로, 그림자는 `shadow-xs`까지만
- 새 상태 색이 필요하면 `app.css` `@theme`에 토큰부터 추가하고 문서 갱신
- web과 desktop 렌더러는 같은 규칙 — 한쪽만 고치지 않는다
- 모든 목록에 로딩 스켈레톤(5행) + 에러 상태(재시도 버튼)

### Don't
- 순흑(#000)·순회색(#888 계열)·쨍한 원색 사용
- 마케팅 스타일 (pill CTA, 히어로 밴드, 대형 디스플레이 타이포, 스티커 팔레트)
- 페이지별 로컬 상태 색 정의 (StatusBadge 우회)
- `max-h-[NNNpx]` 하드코딩으로 목록 잘라내기
- i18n 신규 도입 — 텍스트는 한국어 하드코딩 (기존 t() 사용처만 유지)
