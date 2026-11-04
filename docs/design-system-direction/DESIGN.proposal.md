---
version: alpha
name: Estate ERP — Neutral Ink proposal
description: 한국어 원장 업무를 위한 Electron 데스크톱 디자인 기준. 미확정 제안.
colors:
  canvas: "#FAFAFA"
  subtle: "#F4F4F5"
  hover: "#EDEDEE"
  border: "#E4E4E7"
  input-border: "#8C8C93"
  text: "#18181B"
  text-secondary: "#626269"
  primary: "#27272A"
  primary-hover: "#3F3F46"
  selected: "#EEEEF0"
  selected-text: "#27272A"
  focus: "#2563EB"
  surface: "#FFFFFF"
  on-primary: "#FFFFFF"
  info-bg: "#EFF6FF"
  info-text: "#1D4ED8"
  success-bg: "#F0FDF4"
  success-text: "#166534"
  warning-bg: "#FEFCE8"
  warning-text: "#854D0E"
  danger-bg: "#FEF2F2"
  danger-text: "#B91C1C"
typography:
  title:
    fontFamily: Pretendard, Apple SD Gothic Neo, sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
  body:
    fontFamily: Pretendard, Apple SD Gothic Neo, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  table:
    fontFamily: Pretendard, Apple SD Gothic Neo, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  table-header:
    fontFamily: Pretendard, Apple SD Gothic Neo, sans-serif
    fontSize: 12px
    fontWeight: 500
    lineHeight: 18px
  caption:
    fontFamily: Pretendard, Apple SD Gothic Neo, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 18px
  money:
    fontFamily: Pretendard, Apple SD Gothic Neo, sans-serif
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
rounded:
  sm: 4px
  md: 6px
  lg: 8px
components:
  app:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
  group-header:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.text}"
    height: 44px
  row-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.text}"
    height: 44px
  row-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.selected-text}"
    height: 44px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    height: 32px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    height: 32px
  caption:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
  tag-info:
    backgroundColor: "{colors.info-bg}"
    textColor: "{colors.info-text}"
    height: 24px
  tag-success:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success-text}"
    height: 24px
  tag-warning:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning-text}"
    height: 24px
  tag-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger-text}"
    height: 24px
---
# Estate ERP 디자인 기준 초안

이 문서는 방향을 비교하기 위한 초안입니다. 루트 `DESIGN.md`를 대체하지 않으며 제품에 적용되지 않았습니다. 팔레트는 공식 제품의 색을 복제한 것이 아니라 연구를 바탕으로 만든 자체 제안입니다.

## Overview

목표는 “멋진 SaaS 대시보드”가 아니라, 고객·가격·다음 업무를 빠르고 정확하게 읽을 수 있는 한국어 원장입니다. Electron 데스크톱을 대상으로 합니다. 핵심 특성은 선명한 정보, 절제된 앱 장식, 일관된 밀도입니다.

- 탐색 구조와 정렬·필터·접기 등 익숙한 동작을 유지합니다.
- 전체 배치를 다시 디자인하기 전에 같은 컴포넌트 묶음으로 기준을 비교합니다.
- 추천 출발점은 Neutral Ink입니다. 최종 스타일 선택은 아직 하지 않았습니다.

## Colors

색 이름은 밝기나 개인적 인상 대신 용도를 표현합니다. 버튼 배경과 버튼 글자, 상태 배경과 상태 글자를 한 쌍으로 관리합니다.

- `canvas`: 앱 바탕. `surface`: 목록과 입력의 기본 바탕.
- `subtle`: 고객 묶음·보조 구획. `hover`: 가리킨 행. `selected`: 선택된 행.
- `text`: 읽어야 할 본문. `text-secondary`: 날짜·담당자 등 보조 본문. 중요한 정보에 opacity를 더하지 않습니다.
- `border`: 비대화형 구분선. `input-border`: 입력·체크박스 등 조작 경계. 서로 교환하지 않습니다.
- `primary`: 주요 실행 버튼. `focus`: 키보드 초점. `info/success/warning/danger`: 의미가 있는 상태에만 사용합니다.
- 기존 구함·내놓음·계약 상태 매핑은 실제 `StatusBadge`와 맞춰야 합니다. 데모의 상태 이름을 업무 의미에 그대로 덮어쓰지 않습니다.
- 일반 텍스트는 실제 배경과 4.5:1 이상을 확인합니다. 장식 선까지 전부 진하게 만들지 않습니다.

## Typography

한국어는 현재 앱의 Pretendard 계열을 유지합니다. 파일이 실제 번들에 포함되는지 별도 확인하고, 브랜드를 위해 영문 서체만 교체하지 않습니다.

- 제목 20/28px, 본문·원장 14/20px, 열 제목·보조정보 12/18px.
- 고객명 600, 금액 600, 일반 조건 400. 모든 문장을 semibold로 만들지 않습니다.
- 숫자·날짜·전화번호는 tabular-nums. 금액은 우측 정렬, 이름·매물은 좌측 정렬.
- 10px 보조 라벨로 정보를 몰아넣지 않습니다. 긴 문구는 줄임표와 전체값 접근 방식을 함께 둡니다.

## Layout

공통 간격은 4 / 8 / 12 / 16 / 24 / 32px입니다. 아이콘 광학 보정은 허용하지만 새로운 간격은 이유를 기록합니다.

- 기본 데이터 행 44px. 압축 보기 40px는 선택 가능성만 검토합니다.
- 고객 묶음 헤더 44px, 열 제목 36px, 기본 조작부 32px, 아이콘 16px.
- 툴바는 보기·검색·필터·정렬·주요 생성의 역할을 고정합니다. 화면별로 순서를 바꾸지 않습니다.
- 원장의 기존 열을 유지하고, 좁은 데스크톱 창에서는 헤더와 본문이 같은 영역에서 가로 스크롤합니다.
- 창 1280×800과 1440×900에서 먼저 확인합니다. 고객원장에 모바일 카드 배치를 추가하지 않습니다.
- 비교 보드의 작은 원장 조각은 스타일 검사용입니다. 실제 고객원장의 레이아웃 변경 제안이 아닙니다.

## Elevation & Depth

앱 기본 표면과 원장에는 그림자를 넣지 않습니다. 메뉴·팝오버·모달에만 하나의 공통 그림자 값을 사용합니다. 일반 표면을 유리 효과나 큰 그림자로 띄우지 않습니다.

## Shapes

선택 표시와 작은 태그 4px, 버튼·입력 6px, 메뉴·모달 8px를 사용합니다. 원장 전체를 둥근 카드 여러 개로 분해하지 않습니다. 임의로 7·9·11·13px 반경을 계속 추가하지 않습니다.

## Components

첫 검증 대상은 Button / Input / Checkbox / FilterTrigger / SortMenu / CustomerGroupHeader / MoneyCell / StatusBadge / Popover입니다.

각 컴포넌트는 default, hover, pressed, focus-visible, disabled, selected, error 중 해당 상태를 명시합니다. 버튼의 disabled는 실제 disabled 속성을 사용합니다. hover만으로 기능을 숨기지 않습니다.

색은 CSS 변수, 크기는 공통 토큰, 동작은 기존 React/shadcn 컴포넌트가 담당합니다. `DESIGN.md` 자체가 CSS나 동작을 자동으로 변경하지 않습니다. 루트 디자인 문서와 토큰 변경은 함께 반영합니다.

## Do's and Don'ts

- 고객명·매물·금액·상담의 읽기 순서를 먼저 확인합니다.
- 정렬 메뉴와 열 제목이 같은 정렬 상태를 가리키도록 유지합니다.
- 마우스와 키보드로 실제 Electron 흐름을 확인합니다. 웹 미리보기는 Electron 검증을 대체하지 않습니다.
- 반복 셀 작업에 애니메이션을 넣지 않습니다. 메뉴 전환은 필요한 경우 120ms ease-out, reduced motion에서는 제거합니다.
- 컴포넌트별 hex 값, 의미 없는 컬러 아바타, 큰 카드·그라데이션을 추가하지 않습니다.
- 흐린 글자, 낮은 대비, 과한 여백을 “슬릭”의 기준으로 삼지 않습니다.

근거 및 적용 경로: [RESEARCH.md](RESEARCH.md). 실제 색과 컴포넌트 비교: [palette.html](palette.html).
