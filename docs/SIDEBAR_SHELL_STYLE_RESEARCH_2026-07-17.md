# 사이드바 & 앱 배경 디자인 리서치 — 6개 앱

> 조사일: 2026-07-17
> 방법론: 실제 배포 소스 기반 실측 — Linear는 로그인된 앱 DOM `getComputedStyle`, Notion은 `app.notion.com` 실제 CSS 번들, Teable/Orca는 GitHub 소스, Obsidian은 `obsidian-1.12.7.asar` 카빙, Airtable은 npm 패키지(`@airtable/blocks@1.19.0`) 추출.
> **웹에 도는 토큰표는 상당수가 틀렸고, 본문에서 정정한다.**
> 적용 대상: `apps/web` 셸 테마 시스템 (`src/providers/shell-theme-provider.tsx`, `src/app.css`)

---

## 1. LINEAR ⭐ 최고 가치

**아키텍처**: StyleX + 런타임 생성 **LCH** 테마. 토큰명은 해시(`--sx-1ubxoo9`)라 이름은 못 베낌 — 의미 체계만 채용. 내부 디자인시스템 이름은 **"Orbiter"**. 대비 계산에 **APCA** 사용(WCAG 2.x 아님).

> ⚠️ **정정**: 웹에 퍼진 Linear 토큰표(`#08090a`, `#5e6ad2`, Surface-1 `#0f1011`)는 **마케팅 랜딩 값**이며 앱 UI와 무관.

**사이드바** (전부 실측):
- 너비 **220px** (컨테이너 244px = 220 + 좌우 12px)
- 배경 **`transparent`** — `<html>` 캔버스색이 그대로 비침
- 분리: **border 0, shadow 0** → **색 차이만**
- 아이템 **28px 높이 / radius 8px / 13px·500 / 아이콘 14px**
- hover `#f3f4f4` → active `#ededee` — **단 2.1 L 차이**, accent 안 씀, 좌측 바 없음
- 그룹 라벨 **12px/500, `text-transform: none`** ← 대문자 아님!
- 아이콘이 라벨보다 **진함**(관습의 반대)

**레이어링** (핵심):
```
<html> 캔버스 #f3f3f4 (bgSub)  ← 사이드바가 얹힘
콘텐츠 패널   #fbfbfc (bgBase) ← 정확히 +3.0 L
  inset: 8px 8px 36px 244px  ← bottom만 36px 비대칭
  radius 12px / border 0.5px #e4e4e4 / shadowLow(alpha .02·.04)
헤더: 43.5px, transparent, border 0, blur 없음
```

**전체 토큰 (라이트, 실측)**:

| 토큰 | LCH | hex |
|---|---|---|
| `bgSub` (캔버스) | `lch(95.94% 0.5 282)` | `#f3f3f4` |
| `bgBase` (패널) | `lch(98.94% 0.5 282)` | `#fbfbfc` |
| `bgBaseHover` | `lch(96.94% 0.5 282)` | `#f6f6f7` |
| `bgShade` | `lch(93.44% 0.5 282)` | `#ebeced` |
| `bgSelected` | `lch(93.16% 5.817 282.51)` | `#e9eaf6` |
| `bgBorder` | `lch(89.49% 0 282)` | `#e0e0e0` |
| `bgBorderThin` | `lch(90.84% 0 282)` | `#e4e4e4` |
| `labelTitle` | `lch(9.894% 0 282)` | `#1b1b1b` |
| `labelBase` | `lch(19.788% 1.25 282)` | `#2f2f31` |
| `labelMuted` | `lch(39.576% 1.25 282)` | `#5c5d5f` |
| `labelFaint` | `lch(65.3% 1.25 282)` | `#9e9ea0` |
| `controlPrimary` (accent) | `lch(53% 52.26 286.91)` | `#6d78d5` |
| `sidebarLinkBg` (hover) | `lch(96.14% 0.5 282)` | `#f3f3f4` |
| `sidebarLinkBgActive` | `lch(94.04% 0.5 282)` | `#ededee` |

```css
shadowLow:    0px 3px 6px -2px lch(0% 0 0/.02), 0px 1px 1px lch(0% 0 0/.04);
shadowMedium: 0 6px 18px lch(0% 0 0/.02), 0 3px 9px lch(0% 0 0/.04), 0 1px 1px lch(0% 0 0/.04);
shadowHigh:   0 9px 48px lch(0% 0 0/.08), 0 6px 24px lch(0% 0 0/.1), 0 1px 1px lch(0% 0 0/.04);
```

**성격**: 극저대비. 중립 표면 **C=0.5 / H=282** — 사실상 무채색이지만 아주 살짝 냉색. 이게 "Linear 느낌"의 핵심. `normal` 웨이트가 **450** (Inter Variable 가변축). radius: controls 8px / rounded 9999px. z-index: sidebar 96 / popover 500 / dialog 700 / tooltip 1100.

**다크 미실측** — 워크스페이스가 라이트였고 다크 CSS 블록이 런타임 미로드. 필요 시 다크 워크스페이스에서 재추출 필요.

---

## 2. NOTION

> ⚠️ **정정 3건**: 사이드바는 `#f7f6f3`도 `#fbfbfa`도 **아닌 `#f9f8f7`**. 다크 `#252525` 틀림 → **`#202020`**. 변수명은 `--theme--*`가 아니라 **`--c-*` / `--ca-*`** (`--theme--*`는 notion-enhancer가 만든 이름).

Notion 자체 셸 CSS 원문:
```css
#skeleton-sidebar{ background-color:#f9f8f7;
  box-shadow:inset calc(var(--direction,1) * -1px) 0 0 0 #f0efed;
  display:flex; width:240px; flex-direction:column;
  padding:12px 14px; overflow:hidden }
body.dark #skeleton-sidebar{ background-color:#202020;
  box-shadow:inset calc(var(--direction,1) * -1px) 0 0 0 #2c2c2b }
#skeleton.isElectron #skeleton-sidebar{ padding-top:46px }
#skeleton{ background:#fff; position:fixed; height:100vh; width:100vw }
body.dark #skeleton{ background:#191919 }
```

- 캔버스 `#fff` / `#191919`. **캔버스 = 콘텐츠 표면, flush, radius 0** — 인셋/플로팅 아님
- 분리: **border 아닌 `inset -1px box-shadow`** + `--direction` 변수로 RTL 무료 대응
- 4단 표면: `--c-bacPri` `#fff`/`#191919` → `--c-bacSec` `#f9f8f7`/`#202020` → `--c-bacTer` `#f0efed`/`#383836` → `--c-bacEle` `#fff`/`#202020`
- 선택 `--ca-sidIteSelBac` = `rgba(0,0,0,.03)` / 다크 `rgba(255,255,255,.055)` — **불투명 색 아닌 알파**
- hover `--ca-butHovBac` = `rgba(55,53,47,.06)` / `rgba(255,255,255,.055)`
- 그룹 라벨 `--c-sidSecCol` = `#91918e` / `#9b9b9b`
- 액센트 `--c-palUiBlu600` = `#2383e2` (hover `#0077d4`)

**"웜 뉴트럴"의 수치적 증거**: 회색 자체보다 **알파 오버레이가 갈색** — `--ca-bacSecTra` = `rgba(66,35,3,.03)`, `--ca-borPriTra` = `rgba(28,19,1,.11)`, `--cl-palGra30` = `rgba(84,72,49,.04)`. 전 램프가 R>G>B. 다크도 `rgba(255,255,235,.1)`(노란끼). 사이드바↔캔버스 대비 **단 3%**.

---

## 3. AIRTABLE ⚠️ 사이드바는 대부분 추정

**한계**: 메인 앱은 로그인 벽 뒤 + 토큰 비공개. 아래는 Extension SDK(`@airtable/blocks` `/ui`) 토큰 — 앱 크롬이 아님.

**토큰 (사실)**:
- ✅ 액센트 **`#2d7ff9`** (`blueBright: rgb(45,127,249)`)
- 뉴트럴이 **채도 0 순수 회색**: `dark` `#333333`(기본 텍스트), `light` `#757575`, `lightGray1` `#fafafa`, `lightGray2` `#f2f2f2`, `lightGray3` `#e8e8e8`, `lightGray4` `#e0e0e0`. `darken1~4` = 검정 알파 .05/.1/.25/.5
- `radii.default = **3px**` / large 6px — 각진 인상
- `fontWeights = { strong: 500 }` — **700 bold 없음**. 위계는 크기·색으로만
- `space = [0,4,8,16,32,64,128]` — 지수적
- fontSizes 홀수(9/11/13/15/17/19/21px), 본문 **13px**
- 컨트롤 **small 28px / default 32px / large 36px**
- `borders.default = '1px solid hsla(0,0%,0%,0.1)'`

**팔레트 50색** (5단계 × 10계열): blue `#2d7ff9`/`#1283da`/`#2750ae`/`#9cc7ff`/`#cfdfff` · cyan `#18bfff` · teal `#20d9d2` · green `#20c933` · yellow `#fcb400` · orange `#ff6f2c` · red `#f82b60` · pink `#ff08c2` · purple `#8b46ff` · gray `#666666`

> "Airtable = 채도 높은 사이드바" 가설은 절반만 맞음: 팔레트는 화려하지만 **레코드/필드/라벨용**이고 **크롬은 회색**. 2025 리디자인은 base 색 강조를 오히려 줄였음.

**훔칠 가치 최고 — `textColorsByBackgroundColor`**: 50색 각각에 올릴 텍스트 색을 하드코딩 배포. Bright/base 배경 → `white`, Dark1 → 같은 계열 Light2, Light1/Light2 → **계열별 색조가 밴 짙은 색** (blue→`rgb(0,0,60)`, orange→`rgb(83,0,0)`, purple→`rgb(12,0,62)`). 런타임 대비 계산 없이 룩업으로 끝.

**사이드바 추정값**: bg `#fafafa`/`white` · 아이템 28~32px · radius 3~6px · 13px/500 · 아이콘 16px · hover `darken1`(검정 5%) · active `darken2`(10%) 또는 base색 파스텔

---

## 4. TEABLE (오픈소스 — 전부 사실)

`packages/ui-lib/src/shadcn/global.shadcn.css`, shadcn HSL 컨벤션.

| 변수 | Light | Dark |
|---|---|---|
| `--background` | `#ffffff` | `220 5% 8%` = `#131415` |
| `--foreground` | `#030712` | `#d7dbe0` |
| `--card` | `#ffffff` | `#181a1b` |
| `--popover` | `#ffffff` | `#232425` |
| `--secondary` | `#f3f4f6` | `#1d1f20` |
| `--muted` | `#f9fafb` | `#060709` |
| `--muted-foreground` | `#6b7280` | `#898c90` |
| `--accent` | `#f3f4f6` | `210 100% 98% / 0.08` |
| `--primary` | `#111827` | `#e0e3e6` |
| `--border` | `0 0% 0% / 0.08` | `0 0% 100% / 0.08` |
| `--border-high` | `0 0% 0% / 0.12` | — |
| `--input` | `0 0% 0% / 0.06` | `0 0% 100% / 0.15` |
| `--surface` | `0 0 0% / 0.04` | `0 0% 100% / 0.06` |
| `--radius` | `0.5rem` (8px) | — |

- **사이드바 bg = `bg-background`** — 콘텐츠와 동일 색. 분리는 **`border-r` 1px 단독**, flush
- 폭 **288px**, min 176 → 자동 collapse, max 480. `re-resizable` + zustand persist
- 아이템 **28px(`h-7`) + 상하 2px 마진**, `text-sm`(14px) `font-normal`, 아이콘 16px, radius 6px
- **active = `bg-accent` = hover와 완전 동일** ← 접근성 약점, 가져올 때 고칠 것
- 그룹 라벨 14px `text-muted-foreground` — 대문자/트래킹 없음
- 폰트 `Inter Variable`

**💡 알파 기반 border/surface**: `--border: 0 0% 0% / 0.08` — 라이트/다크에서 검정↔흰색만 스왑, 알파 동일. Tailwind v4 궁합 최고. 라이트 모드엔 card/popover/background 전부 `#fff`라 깊이 계층이 없음. Dark `--muted`가 background보다 어두움(의도적 반전).

---

## 5. OBSIDIAN (v1.12.7 asar 카빙)

> ⚠️ **정정**: dark secondary `#161616` 틀림 → **`#262626`**(base-20). 공식 docs의 `--accent-h: 254/80%/68%`도 실제 CSS에선 **258/88%/66%**.

| 토큰 | Light | Dark |
|---|---|---|
| `--color-base-00` | `#ffffff` | `#1e1e1e` |
| `--color-base-05` | `#fcfcfc` | `#212121` |
| `--color-base-10` | `#fafafa` | `#242424` |
| `--color-base-20` | `#f6f6f6` | `#262626` |
| `--color-base-30` | `#e0e0e0` | `#363636` |
| `--color-base-35` | `#d4d4d4` | `#3f3f3f` |
| `--color-base-50` | `#ababab` | `#666666` |
| `--color-base-70` | `#5a5a5a` | `#bababa` |
| `--color-base-100` | `#222222` | `#dadada` |

- `--background-primary` = base-00, `--background-secondary` = base-20 → **사이드바** `#f6f6f6` / `#262626`
- **다크에서 사이드바가 캔버스보다 어두움** ← Orca와 정반대
- hover = `rgba(var(--mono-rgb-100), 0.067)` — 라이트=검정 6.7%, 다크=흰색 6.7%
- nav item **13px**, padding **4px 24px 4px 8px**, radius 4px, margin-bottom 2px, **굵기 변화 없음**
- **선택만 accent 15%**: `hsla(var(--color-accent-hsl), 0.15)`
- 리본(좌측 아이콘 레일) 44px. 헤더 40px. Radius: s4/m8/l12/xl16. Font UI: 12/13/15/20px

**💡 반투명(vibrancy)**: `.is-translucent`가 CSS로는 투명화 + `rgba(var(--mono-rgb-0), 0.6)` 틴트만 하고 **블러는 OS 네이티브가 처리**. `--mono-rgb-0`이 라이트=`255,255,255`/다크=`0,0,0`이라 한 줄로 양 테마 대응. `backdrop-filter`와 네이티브 vibrancy는 macOS에서 상호 배타적.

---

## 6. ORCA (stablyai/orca — MIT 오픈소스, Electron + React + Tailwind v4)

- `--radius: 0.625rem`(10px)에서 파생: sm 6px / md 8px / lg 10px / xl 14px. 폰트 `Geist`

| 토큰 | Light | Dark |
|---|---|---|
| `--background` (캔버스) | `#fff` | `#0a0a0a` |
| `--editor-surface` | `#ffffff` | `#1e1e1e` |
| `--card` / `--popover` | `#fff` | `#171717` |
| `--muted` / `--secondary` | `#f5f5f5` | `#262626` |
| `--muted-foreground` | `#737373` | `#a1a1a1` |
| `--border` | `#e5e5e5` | `rgb(255 255 255 / 0.07)` |
| `--sidebar` | `#fafafa` | `#171717` |
| `--sidebar-accent` | `#f5f5f5` | `#262626` |
| `--worktree-sidebar` | `#f5f5f5` | `#2a2a2a` |

- **다크에서 사이드바가 캔버스보다 밝음** — 소스 주석에 의도 명시
- 폭 min 220 / max 500, 드래그 리사이즈. macOS `hiddenInset` + `vibrancy: 'under-window'`

**💡 사이드바 테마 3모드**: `'default' | 'match-terminal' | 'tinted'`
- tinted: `background = color-mix(in srgb, {tint} {n}%, var(--background))`, 기본 8% / 최대 35%

**💡 `color-mix` 파생 규칙** (임의 배경색에서 전 토큰 자동 생성):
```
accent = color-mix(in srgb, {fg} 9%,  {bg})
border = color-mix(in srgb, {fg} 7%,  {bg})
ring   = color-mix(in srgb, {fg} 44%, {bg})
card   = 4%,  muted = 7%,  muted-foreground = 62%
```

**💡 디바이더 3:1 기준**: `--border`(장식)와 `--tab-group-split-divider`(구조, `#868690`/`#71717a`)를 전용 토큰으로 분리 — "Default must meet >=3:1 against `--card`".

---

# 최종 비교표

| | 사이드바 bg (L/D) | 캔버스 bg (L/D) | 콘텐츠 표면 | 분리 방식 | Active 스타일 | 밀도 (아이템 h) | 시그니처 |
|---|---|---|---|---|---|---|---|
| **Linear** | `transparent` (캔버스 비침) | `#f3f3f4` / 미측정 | `#fbfbfc` (+3.0 L) | 색차만 (border 0, shadow 0) | 중립 pill r8px, 2.1 L 차, accent 없음 | **28px** / 13px·500 / 14px 아이콘 | inset 8·8·36·244, r12px 플로팅 패널 + LCH C=0.5 H=282 |
| **Notion** | `#f9f8f7` / `#202020` | `#fff` / `#191919` | = 캔버스 (flush) | inset -1px box-shadow | 알파 `rgba(0,0,0,.03)` | 240px 폭 / ~28px | 갈색끼 알파 오버레이 = 웜의 정체 |
| **Airtable** | `#fafafa`/`white` 추정 | 추정 | flush 추정 | 1px `hsla(0,0%,0%,0.1)` | darken 알파 or base색 파스텔 | 28/32/36px / 13px | 50색 텍스트 룩업, radius 3px, bold 없음 |
| **Teable** | = `--background` | `#fff` / `#131415` | = 캔버스 | `border-r` 1px 단독 | `bg-accent` (=hover ⚠️) | 28px+2px / 14px | 알파 border `0 0% 0% / 0.08` |
| **Obsidian** | `#f6f6f6` / `#262626` | `#fff` / `#1e1e1e` | = primary | 색차 | **accent 15%** hsla | 13px / r4px | `.is-translucent` + OS vibrancy |
| **Orca** | `#fafafa`/`#171717` | `#fff` / `#0a0a0a` | `--editor-surface` | border (다크는 알파 .07) | 중립 accent | Tailwind 기본 / r10px | `color-mix` 파생 + tinted 3모드 |

### 수렴점 (독립적으로 도달 → 강한 신호)
1. **28~32px 아이템 + 13~14px 텍스트 + 16px 아이콘** — 5/6이 수렴
2. **border는 알파로** — Teable·Airtable·Orca 독립 도달
3. **크롬은 뉴트럴, 색은 데이터에**
4. **그룹 라벨 대문자화는 아무도 안 함**

### 즉시 이식 가능 (우선순위)
1. Teable의 알파 border/surface
2. Orca의 `color-mix` 파생 규칙 — 테마 변형을 토큰 재정의 없이 런타임 지원
3. Linear의 플로팅 패널 (0.5px 헤어라인 + 극미 shadow)
4. Airtable의 `textColorsByBackgroundColor` — `checkStatus`/`DealStage`/`MatchStage` 뱃지에
5. Obsidian의 `--mono-rgb-0` 트릭
6. Orca의 divider 3:1 토큰 분리

### 안 가져올 것
- Teable의 active = hover 동일 (접근성 약점)
- Teable의 `beforeInteractive` sidebar-width 주입 (Vite SPA엔 불필요)

### 남은 공백
① Linear 다크 hex (다크 워크스페이스에서 재추출 필요) ② Airtable 앱 크롬 실측 (로그인 벽)

### 주요 출처
- Linear 앱 DOM 실측 + `ThemeProvider.D1aeQDiP.js`
- `app.notion.com/_assets/main-860c3847362226b9.css`
- [teableio/teable](https://github.com/teableio/teable) `packages/ui-lib/src/shadcn/global.shadcn.css`
- `@airtable/blocks@1.19.0` `dist/cjs/ui/theme/default_theme/tokens.js`
- [obsidian-releases v1.12.7](https://github.com/obsidianmd/obsidian-releases/releases/tag/v1.12.7) asar 내 `app.css`
- [stablyai/orca](https://github.com/stablyai/orca) `src/renderer/src/assets/main.css`
