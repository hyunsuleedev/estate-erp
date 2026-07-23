# Estate ERP 페이지 데모 이미지 생성 기준

> 생성 방식: built-in ImageGen `ui-mockup`  
> 기준일: 2026-07-17  
> 공통 시각 참조: `assets/reference/master-estate-operational-system.png`

## 공통 방향

- 선택안 1의 고밀도 표·레코드 구조를 기본으로 한다.
- Attio에서는 `record → relation → activity → task` 문법을, Linear에서는 정렬·선택·focus·keyboard·undo의 완성도를 참고한다.
- Notion은 문서·layout·side peek에만, 지도·동호수·계약·재무·CTI·중개방은 Estate 전용 recipe에만 사용한다.
- 공식 제품을 픽셀 단위로 복제하거나 로고·상표·샘플 데이터를 가져오지 않는다.

## Master prompt block

```text
Use case: ui-mockup
Asset type: full-screen desktop UI demo for an Estate ERP HTML design report
Primary request: create a production-grade 1440×900 Korean real-estate brokerage ERP page using the supplied Estate Operational System as the primary visual reference.
Input image 1: master Estate ERP visual-system reference; preserve its warm-light shell, exact alignment rhythm, high-density working surface, selected states, and record context rail.
Style: original Estate ERP, warm neutral, high-density operational SaaS, Attio-like record clarity and Linear-level interaction craft without copying either brand.
Layout: 216px sidebar, 48px global header, 56px page header, 40px toolbar, 14px Korean body, 40px table rows where applicable, crisp structural dividers, 6px radius, almost no shadow.
Palette: #F7F6F3 canvas, #FFFFFF surface, #2F2D2A text, #6F6B65 secondary, #D8D5CF border, #3F63D8 primary, restrained green/amber/red status accents.
Data: realistic Korean broker office, legal-dong addresses, prices in 억/만원, area in ㎡ and 평, named owner/tenant/agent, explicit status, recent contact, deadline and next action.
Constraints: status uses icon plus text; money and dates align; no color-only meaning; legal/financial transitions require confirmation and audit; all content is filled and realistic.
Avoid: generic shadcn demo, huge cards, wide empty canvas, tiny low-contrast text, gradient, glassmorphism, pastel pill overload, consumer property portal style, emoji navigation, AI sparkles, English placeholder data, brand imitation, clipped columns, duplicate labels, nonsensical Korean.
```

## Route-specific prompt block

각 페이지 생성 시 master block 뒤에 아래 내용을 추가한다.

```text
Route: <actual TanStack route>
Page purpose: <the single job this page must help the broker finish>
Composition: <table / record / wizard / map / grid / timeline / document / ledger / conversation>
Required regions: <headers, panels, details, actions>
Required text: <exact Korean page title, key tabs, columns, statuses, actions>
Realistic sample data: <domain-specific records and values>
Primary state shown: <selected row, open detail, validation warning, overdue item, approval diff, etc.>
Interaction affordances: <filter, saved view, bulk action, quick peek, full-page promotion, keyboard hint, undo, confirmation>
Reference image 2..N: <official product screenshots used only for the named interaction or information pattern>
```

## QA 기준

1. 39개 route 모두 고유한 정보구조를 가져야 하며 제목만 바꾼 복제 화면은 실패다.
2. 1440×900 동비율에서 sidebar, header, toolbar, 주요 작업면, 다음 행동이 잘리지 않아야 한다.
3. 한글 제목·핵심 금액·상태·날짜·CTA가 식별 가능해야 한다.
4. 선택된 행/핀/레코드가 여러 패널에서 같은 대상을 가리켜야 한다.
5. 법적·금전·AI 변경에는 근거, before/after, 영향, 확인 또는 audit 문맥이 있어야 한다.
6. 페이지 이미지와 HTML card의 route·제목·recipe가 일치해야 한다.

## 라이선스와 provenance

- 생성 이미지는 UI 방향 검증용 데모다.
- 참조한 Attio, Linear, Notion 등 상용 화면은 각 회사의 저작물이며 이 저장소의 오픈소스 자산이 아니다.
- 생성 결과는 참조 제품의 로고·상표·고유 아이콘·샘플 레코드를 포함하지 않도록 작성한다.
- 이미지별 참고 근거와 대안 구조는 HTML 보고서 및 세 화면군 manifest에 기록한다.
