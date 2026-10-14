---
version: alpha
name: Estate ERP Design System
description: 40~60대 한국 중개사를 위한 고밀도 업무 도구. Notion처럼 차분한 웜 뉴트럴 위에 상태 표시에만 색을 쓴다.
omitted:
  - section: spacing
    reason: 공통 간격 토큰을 아직 정의하지 않았으므로 Tailwind 유틸리티에서 근거 없이 스케일을 재구성하지 않는다.
colors:
  background: "#ffffff"
  foreground: "#37352f"
  muted: "#f7f6f3"
  muted-foreground: "#787774"
  muted-foreground-strong: "#6f6d6a"
  border: "#e9e9e7"
  input: "#e9e9e7"
  ring: "#2383e2"
  primary: "#37352f"
  primary-foreground: "#ffffff"
  secondary: "#f1f1ef"
  secondary-foreground: "#37352f"
  accent: "#f1f1ef"
  accent-foreground: "#37352f"
  success: "#0f7b6c"
  success-soft: "#dbeddb"
  warning: "#cb912f"
  warning-soft: "#fdecc8"
  warning-strong: "#8a5a13"
  info: "#2383e2"
  info-soft: "#d3e5ef"
  info-strong: "#1b64b1"
  violet: "#6940a5"
  violet-soft: "#e8deee"
  pink: "#ad1a72"
  pink-soft: "#f5e0e9"
  orange: "#d9730d"
  orange-soft: "#fadec9"
  destructive: "#e03e3e"
  destructive-soft: "#ffe2dd"
  destructive-strong: "#bb3430"
  neutral-soft: "#f1f1ef"
  neutral-strong: "#37352f"
  sidebar: "#f7f6f3"
  sidebar-accent: "#ebebea"
typography:
  sans:
    fontFamily: Pretendard, Pretendard Variable, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Segoe UI, Noto Sans KR, sans-serif
  page-title:
    fontFamily: Pretendard, Pretendard Variable, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Segoe UI, Noto Sans KR, sans-serif
    fontSize: 20px
    fontWeight: 600
  section:
    fontFamily: Pretendard, Pretendard Variable, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Segoe UI, Noto Sans KR, sans-serif
    fontSize: 14px
    fontWeight: 600
  body:
    fontFamily: Pretendard, Pretendard Variable, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Segoe UI, Noto Sans KR, sans-serif
    fontSize: 14px
    fontWeight: 400
  table-cell:
    fontFamily: Pretendard, Pretendard Variable, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Segoe UI, Noto Sans KR, sans-serif
    fontSize: 13px
    fontWeight: 400
  table-header:
    fontFamily: Pretendard, Pretendard Variable, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Segoe UI, Noto Sans KR, sans-serif
    fontSize: 12px
    fontWeight: 500
  badge:
    fontFamily: Pretendard, Pretendard Variable, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Segoe UI, Noto Sans KR, sans-serif
    fontSize: 12px
    fontWeight: 500
  caption:
    fontFamily: Pretendard, Pretendard Variable, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Segoe UI, Noto Sans KR, sans-serif
    fontSize: 11.5px
    fontWeight: 400
rounded:
  sm: 0.25rem
  md: 0.375rem
  lg: 0.5rem
---

# Estate ERP — 디자인 시스템

## Overview

Estate ERP는 40~60대 한국 중개사가 매물·고객·거래를 빠르게 훑고 처리하는 고밀도 업무 도구다. 기본 화면은 흰 종이와 웜 뉴트럴 잉크처럼 조용하게 유지하고, 색은 상태나 주의가 필요한 사실을 전달할 때만 사용한다. 이 문서보다 `apps/desktop/src/renderer/app.css`, `components/domain/StatusBadge`의 실제 토큰과 공유 구현이 우선한다.

## Colors

페이지 본문은 흰색, 보조 툴바와 펼침 영역은 웜 뉴트럴 표면을 사용한다. 카드와 행은 그림자보다 경계선으로 구분하며, `info`는 포커스·활성 상태에 사용하는 유일한 구조적 블루다.

상태 색은 `StatusBadge`의 의미 매핑을 따른다. 연한 배경과 진한 글자를 한 쌍으로 사용하고, 페이지에서 같은 의미의 색을 다시 정의하지 않는다. 작은 보조 문구가 흰 배경 위에서 명확해야 할 때는 `muted-foreground-strong`을 사용한다.

## Typography

한국어 본문은 Pretendard 계열을 사용한다. 마케팅용 대형 디스플레이 타이포는 도입하지 않으며, 본문은 14px, 테이블은 13px, 헤더와 배지는 12px를 기준으로 한다. 금액·면적·날짜·전화번호는 `tabular-nums`와 공유 포맷 유틸리티를 사용한다.

## Layout

목록 화면은 앱 셸 아래에서 여백 없이 시작하는 평면형 데이터베이스 구조를 기본으로 한다. 첫 번째 툴바 행에는 검색·현재 요약·주요 생성 액션을 두고, 두 번째 행에는 보기 전환·필터·결과 수·밀도 조절을 둔다. 툴바를 별도 카드 안에 넣지 않고 얇은 하단 경계선으로 본문과 구분한다.

테이블 행은 40px 내외의 밀도를 유지하고 헤더·행·그룹 사이에는 얇은 구분선을 사용한다. 행 클릭은 빠른 확인 시트나 상세 화면으로 연결하고, 관련 데이터의 개수 칩은 필요할 때 행 아래에 인라인으로 펼친다.

거래 파이프라인은 단계별 칸반과 그룹형 리스트를 같은 데이터 관점으로 제공한다. 데스크톱 기본 뷰포트에서 핵심 단계가 한 화면에 들어오도록 열 너비를 조절하며, 다음 일정과 정체 상태는 카드 전체를 칠하지 않고 작은 라벨이나 메타데이터로 표시한다.

## Elevation & Depth

계층은 표면색 변화와 경계선으로 만든다. 일반 목록과 카드의 그림자는 `shadow-xs` 수준을 넘지 않고, 드래그 미리보기·모달처럼 실제로 떠 있는 요소에만 더 강한 그림자를 허용한다.

## Shapes

버튼·입력·배지·일반 카드는 `rounded-md`를 기본으로 한다. `rounded-lg`는 칸반 열이나 페이지 단위 보관함처럼 더 큰 컨테이너에만 사용하고, 같은 화면에서 불필요하게 여러 반경을 섞지 않는다.

## Components

`components/domain/`의 `StatusBadge`, `PageHeader`, `FilterBar`, `EmptyState`, `MoneyText`, `EntityChip`, `ConfirmDialog`, `DetailField`, `PipelineSteps`를 우선 사용한다. 같은 역할의 컴포넌트나 상태 색 매핑을 페이지 내부에 다시 만들지 않는다.

시트와 드롭다운은 짧은 ease-out 전환을 사용하고, 반복 빈도가 높은 셀 편집과 키보드 작업에는 애니메이션을 넣지 않는다. 모든 전환은 변경 속성을 명시하며 `prefers-reduced-motion`을 존중한다.

## Do's and Don'ts

- Do use borders and warm-neutral surface shifts for hierarchy.
- Do keep secondary controls neutral so data and urgent states remain easy to scan.
- Do use one semantic meaning per color and keep status labels readable without relying on color alone.
- Do keep web and desktop renderers visually aligned when they share the same workflow.
- Don't introduce page-local status palettes or bypass `StatusBadge` for an existing status kind.
- Don't use saturated decoration, gradients, oversized headings, or heavy card shadows in operational screens.
- Don't tint an entire row or card when a compact status label communicates the same fact.
- Don't hard-code fixed `max-height` values that truncate data lists.
