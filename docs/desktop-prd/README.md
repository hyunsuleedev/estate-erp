# Desktop PRD Harness

`desktop` 앱 기준으로 페이지 기능을 상세 PRD로 쪼개는 작업용 하네스다.

이 문서는 다음 상황에서 사용한다.

- 아이디어는 있는데 화면/흐름/권한/상태가 아직 흐릿할 때
- 구현 전에 `빠진 페이지`, `겹치는 기능`, `누락된 상태값`을 먼저 드러내고 싶을 때
- AI를 이용해 페이지 문서를 빠르게 작성하되, 품질 검증 루프를 유지하고 싶을 때

## 목표

- `업무 흐름`을 기준으로 desktop UI를 구조화한다.
- 각 페이지를 `누가`, `언제`, `무엇을`, `어떤 상태에서` 쓰는지 명확히 한다.
- `desktop 전용 요구사항`을 web/mobile과 분리해서 적는다.
- 각 페이지가 어떤 엔터티/API/권한/실시간 이벤트에 의존하는지 문서화한다.

## 핵심 원칙

- 페이지보다 `업무 흐름`이 먼저다.
- 화면 설명보다 `엔터티`, `상태 전이`, `권한`, `예외 처리`가 먼저다.
- 한 번에 시스템 전체를 쓰지 말고 `한 페이지` 또는 `한 워크스페이스` 단위로 쓴다.
- 각 페이지는 반드시 `연결되는 이전/다음 화면`을 적는다.
- `MVP 포함`과 `후순위`를 분리한다.
- `desktop 전용 요소`를 따로 쓴다.

## 산출물

최소 산출물은 아래 네 가지다.

1. `페이지 인벤토리`
2. `업무 흐름 맵`
3. `페이지별 상세 PRD`
4. `열린 질문 / 미결정 사항`

권장 폴더 구조는 다음과 같다.

```text
docs/
  desktop-prd/
    README.md
    _PAGE_TEMPLATE.md
    pages/
      dashboard.md
      ai-chat.md
      ai-operations.md
      call-workspace.md
      contacts.md
      buyer-requirements.md
      properties.md
      matches.md
      deals-contracts.md
      tasks-calendar.md
      network.md
      settings.md
```

## 작업 순서

### 1. 업무 흐름 먼저 적기

먼저 아래 질문에 답한다.

- 신규 인바운드 전화가 왔을 때 사용자는 어디서 시작하는가?
- 기존 고객 상담을 이어갈 때 첫 진입 화면은 어디인가?
- 매수요구와 매물을 연결할 때 어떤 화면을 오가는가?
- 거래 생성 후 계약/일정/정산으로 이어질 때 중심 화면은 무엇인가?

업무 흐름 예시는 다음처럼 짧게 적는다.

```text
인바운드 전화 수신
→ 연락처 검색 또는 신규 생성
→ 상담 기록
→ 매수요구 연결 또는 신규 생성
→ 매칭 후보 조회
→ 매물/현장안내
→ Deal 생성
→ Contract 작성
→ 잔금/완료 처리
```

### 2. 페이지 인벤토리 만들기

페이지를 먼저 다이어그램처럼 나열한다. 구현 상세는 아직 적지 않는다.

권장 1차 인벤토리:

- `App Shell`
- `Dashboard`
- `Call Workspace`
- `Contacts`
- `Consultations`
- `Buyer Requirements`
- `Sites / Units`
- `Properties / Listings`
- `Matches`
- `Deals / Contracts`
- `Tasks / Calendar`
- `Notifications`
- `AI Chat`
- `AI Operations`
- `Network`
- `Office / Employees / Settings`

### 3. 페이지별 상세 PRD 작성

페이지별 문서는 반드시 [`_PAGE_TEMPLATE.md`](/Users/hyunsulee/estate-erp/docs/desktop-prd/_PAGE_TEMPLATE.md) 형식으로 작성한다.

한 번에 한 페이지만 쓴다. 추천 작성 순서는 다음과 같다.

1. `Call Workspace`
2. `Contacts`
3. `Buyer Requirements`
4. `Properties / Listings`
5. `Matches`
6. `Deals / Contracts`
7. `Tasks / Calendar`
8. `Dashboard`
9. `AI Chat`
10. `AI Operations`
11. `Network`
12. `Settings`

### 4. 평가 루프 돌리기

페이지 문서를 쓴 뒤에는 아래 항목만 집중 검토한다.

- 이 페이지가 없으면 업무 흐름이 끊기는가?
- 상태값이 모호한가?
- 역할별 권한 차이가 빠졌는가?
- 리스트/상세/생성/수정/삭제가 섞여서 과도하게 비대해졌는가?
- desktop 전용 기능이 누락됐는가?
- 다음 화면으로 넘어가는 연결이 명확한가?

## 하네스 역할 분리

### Planner

역할:

- 상위 PRD와 데이터 구조를 읽고 `업무 흐름`을 `페이지 단위`로 분해한다.
- 페이지 간 선후 관계와 의존 엔터티를 잡는다.
- 구현이 아니라 문서화 우선순위를 정한다.

출력:

- 페이지 인벤토리
- 페이지별 작성 순서
- 각 페이지의 핵심 JTBD

### Generator

역할:

- 한 페이지씩 상세 PRD를 작성한다.
- 화면 구조, 액션, 상태, 예외, 권한, desktop 전용 UX를 구체화한다.
- API/엔터티 의존성을 문서에 연결한다.

출력:

- `docs/desktop-prd/pages/<page>.md`

### Evaluator

역할:

- 문서 누락, 중복, 권한 충돌, 상태 불일치를 검토한다.
- `이 페이지가 실제 업무를 완결시키는지`를 사용자 관점에서 검증한다.
- 문서가 구현 가능한 수준인지 확인한다.

출력:

- 수정 요청 목록
- 미결정 사항 목록
- MVP 범위 축소 제안

## 실행 프롬프트

### Planner Prompt

```md
당신은 Estate ERP의 제품 기획 Planner다.

참고 문서:
- docs/prd.md
- docs/DATA_STRUCTURE.md
- prisma/schema.prisma

목표:
- Estate ERP를 desktop 앱 기준으로 페이지 단위로 분해한다.
- 페이지보다 업무 흐름이 먼저 드러나야 한다.
- 각 페이지는 핵심 사용자 역할, 주요 엔터티, 인접 페이지를 포함해야 한다.

출력 형식:
1. 핵심 업무 흐름 5개 이내
2. desktop 페이지 인벤토리
3. 페이지별 작성 우선순위
4. 각 페이지의 한 줄 목적
5. 빠진 기능 또는 미결정 사항

주의:
- web/mobile 공통 기능이 아니라 desktop 운영 화면 기준으로 쓴다.
- CTI, 실시간 동기화, 멀티패널 UI, 키보드 중심 작업 가능성을 고려한다.
- 구현 세부보다 문서화 우선순위를 먼저 정한다.
```

### Generator Prompt

```md
당신은 Estate ERP의 제품 기획 Generator다.

입력:
- 상위 PRD: docs/prd.md
- 데이터 구조: docs/DATA_STRUCTURE.md
- 대상 페이지: <PAGE_NAME>
- 템플릿: docs/desktop-prd/_PAGE_TEMPLATE.md

목표:
- 대상 페이지의 상세 PRD를 작성한다.
- 이 페이지를 통해 사용자가 어떤 업무를 끝낼 수 있는지 명확히 한다.

반드시 포함:
- 사용자 역할과 권한
- 진입 조건과 이전/다음 화면
- 화면 레이아웃
- 리스트/상세/생성/수정 액션
- 상태값과 예외 처리
- desktop 전용 요소
- API/엔터티 의존성
- MVP 범위 / 후순위
- 수용 기준

주의:
- 모호한 표현 대신 상태와 액션을 명시한다.
- "관리 가능" 같은 표현 대신 구체적인 사용자 행동을 적는다.
- 실제 중개사 업무 흐름이 끊기지 않도록 인접 화면 연결을 적는다.
```

### Evaluator Prompt

```md
당신은 Estate ERP의 제품 기획 Evaluator다.

입력:
- 상위 PRD: docs/prd.md
- 데이터 구조: docs/DATA_STRUCTURE.md
- 검토 문서: docs/desktop-prd/pages/<PAGE_NAME>.md

목표:
- 문서가 구현 가능한 수준인지 검토한다.
- 빠진 상태값, 권한, 필터, 예외 처리, desktop 요구사항을 찾는다.

출력 형식:
1. 치명적 누락
2. 업무 흐름 단절 위험
3. 권한/상태 불일치
4. desktop 요구사항 누락
5. MVP에서 잘라낼 수 있는 범위
6. 수정 후 수용 가능 여부

주의:
- 예쁘게 요약하지 말고 누락과 리스크를 먼저 지적한다.
- 추상적 평가 대신 구체적 항목을 지적한다.
```

## 페이지 수용 기준

한 페이지 문서는 아래 항목이 모두 채워져야 `초안 완료`로 본다.

- 페이지 목적이 한 문장으로 명확하다.
- 사용자 역할과 권한이 분리돼 있다.
- 진입 경로와 종료 경로가 있다.
- 주요 액션이 모두 명사형이 아니라 동사형으로 정의돼 있다.
- 상태/예외/빈 상태/오류 상태가 있다.
- desktop 전용 요구사항이 있다.
- 연관 엔터티/API가 연결돼 있다.
- MVP 포함 범위와 제외 범위가 나뉘어 있다.
- 수용 기준이 테스트 가능한 문장으로 적혀 있다.

## 먼저 작성할 페이지

현재 프로젝트 문맥상 아래 순서가 가장 합리적이다.

1. `Call Workspace`
2. `Contacts`
3. `Buyer Requirements`
4. `Properties / Listings`
5. `Matches`
6. `Deals / Contracts`

이 여섯 개가 잡히면 CRM 코어 흐름의 대부분이 고정된다.

## 운영 팁

- 페이지 하나를 쓰고 바로 구현으로 넘어가지 말고, 최소 `3~5개 핵심 페이지`를 묶어서 먼저 정렬한다.
- `리스트 화면`, `상세 패널`, `사이드 시트`, `모달`을 한 문서 안에서 역할별로 구분해 적는다.
- `단축키`, `멀티 선택`, `실시간 업데이트`, `알림`, `패널 고정` 같은 desktop UX는 별도 섹션으로 분리한다.
- 문서 중간에 설계가 흔들리면, 페이지를 다시 쪼개기보다 먼저 `업무 흐름`이 틀렸는지 확인한다.
