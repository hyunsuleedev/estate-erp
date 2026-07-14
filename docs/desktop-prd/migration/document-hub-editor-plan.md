# 문서 허브 + 문서 편집기 고도화 계획 — 레거시 DocuMngt 수준 도달

**목표**: Estate ERP 계약서 "문서 허브 + 문서 편집기"를 MySpider V2 문서관리(DocuMngt)의
편집 경험 수준으로 끌어올린다. 핵심은 **조항 임베디드 편집**(제N조 문장 안에 금액·날짜·
드롭다운·체크박스가 인라인으로 박힌 문서-shaped 폼)과 **서식 탭 허브**(한 계약 = 여러 서식
탭 + 툴바)다.

**전제**: 이 문서는 계획서다. 구현은 다음 단계. 레거시 분석의 상세 근거는
[documents-legacy-spec.md](./documents-legacy-spec.md)(§2.1 데이터모델, §3 에디터 엔진,
§4 서식 필드그룹)와 [documents-form-catalog.md](./documents-form-catalog.md)(§4 10대 문서
필드 스펙)를 따르고, 여기서는 실물 스크린샷 관찰과 현행 v2 코드 대비 갭·설계·작업 분해에
집중한다.

**작성 기준**: 2026-07. 레거시 실행 화면 캡처(아파트 매매 계약서 편집기) + 디컴파일 소스
(`DMIN001I1M.cs` 3,600줄 / `contract/ContractInputForm.cs` 7,053줄 / `DMLS002Q1M.cs`) +
현행 v2 코드 직접 확인.

---

## 1. 레거시 실물 분석 (스크린샷 기준)

캡처: "문서관리-아파트 매매 계약서" 창 (DMIN001I1M 네이티브 셸 + ContractInputForm 본문).

### 1.1 상단 툴바 (셸 소유 — 서식 탭 전체 공통)

| 구획 | 실물 관찰 | 소스 대응 |
|---|---|---|
| 계약서 종류 콤보 | `아파트` (편집 중엔 비활성 회색) | `cboCntrClsf` — 아파트/오피스텔/부동산/분양권/상가/권리… |
| 거래유형 콤보 | `매매` | `cboCntrTran` — Kind별 허용 거래만 노출 |
| 서식추가 드롭다운 | `서식추가 ▾` 아이콘 버튼 | `drpForm` → `addForm(sCntr_Clsf)` — 31~52 부속 서식 탭 추가. 위임장(31)·자금조달계획서(33)는 같은 서식 N번째 순번(`Cntr_Clsf_Orde`) 자동 부여 |
| 확인설명서 유형 콤보 | `중개대상물확인설명서: 해당없음` | `cboMtceClsf` — `해당없음/주거용건축물/비주거용건축물/토지/입목·광업재단·공장재단` 5지 선택. 선택 시 코드 21 탭 자동 추가/교체 |
| 인쇄매수 | `인쇄매수 [3 ▾]` | `cboCopies` 1~8, INI에 서식별 기본 매수 기억 |
| 액션 버튼 7개 | 인쇄 / 미리보기 / 저장 / 다른저장 / 계약서공유 / e-서비스 / 닫기 | `btnPrint`/`btnPreview`/`btnSave`(dirty 시에만 활성)/`btnSaveAs`(새 Cntr_No 사본)/`btnShare`(공동중개 상대 있을 때만 활성)/EService/`btnClose` |
| 옵션 체크 | `☑메모` `☐알림판 만기도래알림 표시안함` | `chkMemo`/`chkNoNotice` |
| 한줄메모 밴드 | `한줄메모(비공개)` 분홍 배경 1줄 텍스트 | `txtMemo` — 목록 화면 DOCMEMO와 동일 값 |
| 확대/축소 | `※ 확대/축소 [100% ▾]` | 창 크기 기반 줌 |

### 1.2 서식 탭바

- `계약서 [X]` 초록 탭 1개(주 서식). 부속 서식을 추가하면 탭이 우측으로 늘어난다
  (탭[0]=주 서식, 탭[1..n]=확인설명서·위임장·신고서…). 탭 X로 서식 개별 제거.
- 같은 서식 중복 추가는 `isExistInputForm`이 차단(반복 허용 서식 31/33/43 등은 예외).

### 1.3 본문 — "1. 아파트의 표시"

문서 그대로의 표 레이아웃. 라벨 셀(소재지/토지 지목/건물 구조) + 값 셀이 계약서 인쇄물과
같은 배치다.

- 소 재 지: 자유 텍스트 1줄
- 토지 지목: **드롭다운**(`대` 등 코드마스터 CC) · 대지권비율 · `분의` · 면적(m²)
- 건물 구조: **드롭다운**(`철근콘크리트구조` 등 CS) · 용 도: 드롭다운(`아파트` 등 CU) · 면적(m²)

### 1.4 본문 — "2. 계약내용" (핵심 관찰)

**표기 옵션 행**: `금액단위: ◉만원 ○천원 ○원 [금액은 숫자로 입력]` (좌) +
`금액인쇄형식: ◉한글 ○漢字` (우) — `priceUnitRadioGroup` / `pricePrintTypeRadioGroup`.
저장은 `Cost_Unit` 코드로, 인쇄 시 `ContractUtil.getContractAmount`가 한글/한자 병기 생성.

**제1조** — 도입문 "위 아파트의 매매에 있어 매수인은 매매대금을 아래와 같이 지불하기로
한다." (Kind×Trade별 문구 치환) + 우측 `☑현 임차보증금 입력란 추가`(`grantOrInterimcheckEdit`
— 체크 시 아래 "현 임대보증금" 행이 표에 나타남).

금액 행들 — **모든 행이 "라벨 + 金 [금액입력] 만원정은 + 후속 문구/컨트롤" 형태로 조항
문장 안에 입력기가 임베디드**되어 있다:

| 행 | 임베디드 컨트롤 | 소스 |
|---|---|---|
| 매매대금 | `金 [99,000] 만원정` | `tradePriceTextEdit` |
| 융자금 | `金 [ ] 만원정은 [현 상태에서 매수인이 승계한다. ▾] ☐공란인쇄` | `loanPriceComboBox` 3지: `현 상태에서 매수인이 승계한다.` / `매도인이 잔금일까지 말소한다.` / `특약사항에 별도 명시한다.` + `chkBlankloan` |
| 현 임대보증금 | `金 [48,000] 만원정은 [매수인이 인수하지 아니한다. ▾]` | `rentGrantPriceComboBox` 3지: `현 상태에서 매수인이 승계한다.` / `특약사항에 별도 명시한다.` / `매수인이 인수하지 아니한다.` |
| 계약금 | `金 [9,900] 만원정은 [계약시에 지불 ▾] 하고 영수함. 영수자( 자필서명 )(인)` + `[계약금영수증]` 버튼 | `contractPriceComboBox` 2지: `계약시에 지불` / `특약사항에 준` |
| 중도금 | `金 [10,000] 만원정은 [2026]년 [07]월 [30]일 📅 에 지불하며, ☐공란인쇄` + `[중도금영수증]` | 년/월/일 분리 입력 + 달력 버튼 + `chkBlankDeposit` |
| 중도금(2차) | 동일 구조 + `☐공란인쇄` + `[중도금영수증]` | `interimDepositTextEdit2` + `chkBlankDeposit2` |
| 잔금 | `金 [79,100] 만원정은 [2026]년 [09]월 [10]일 📅 에 지불하기로함.` + `[잔금영수증]` | 자동계산은 없음(수기) |

**공란인쇄** 의미: 값이 비어도 인쇄물에 해당 행을 공란(≠ 표시)으로 남긴다 — 계약 현장에서
손으로 채우는 관례 지원. (`PrintUtil.setContractAmount(..., "≠", ...)` + `chkBlank*` 조건)

**`☐계약사항2조 직접입력`**(`chkSecUse`) — 체크 시 제2조 자동 문장을 비우고 본문 조항
텍스트에 직접 쓴다.

**제2조** — 문장 안에 날짜 입력이 임베디드: "매도인은 매수인으로부터 매매대금의 잔금을
수령함과 동시에 … 위 아파트의 인도는 `[2026]년 [09]월 [10]일 📅` 로 한다." (임대차면
인도일 + "임대차 기간은 인도일로부터 `[   ]년 [ ]월 [ ]일`까지(`[N]`개월)" 변형).

**제3조~** — 고정 조항 텍스트 스크롤 영역(`Cntr_Part`, 서식·거래구분별 기본 문구 로드,
편집 가능). 그 아래로 특약(RichEdit), 당사자(ucPerson×N)/중개사무소(ucOffc×N) 블록,
영수증·신분증스캔 등 부가 버튼이 이어진다(스크린샷 하단 바깥, 소스 §4.1 확인).

### 1.5 우리(v2)에 없는 요소 목록

편집기(A): ① 조항 임베디드 입력(문장 안 인라인 금액/날짜/드롭다운/체크), ② 금액인쇄형식
한글/漢字 토글(한자 유틸은 있으나 UI 없음), ③ 융자금 처리·현 임대보증금 처리 드롭다운
문구 3지(카탈로그엔 `승계/말소`, `승계/반환` 2지로 축약돼 있음), ④ 융자금·2차중도금
공란인쇄(카탈로그엔 중도금 1개만), ⑤ `현 임차보증금 입력란 추가` 행 토글, ⑥ 계약금
지불시기 드롭다운(현재 text), ⑦ 영수증 즉석 발행 버튼(계약금/중도금/잔금), ⑧ 제1조
도입문·제2조 문장·"영수자(자필서명)(인)" 등 조항 문맥 자체의 렌더, ⑨ 조항 텍스트(제3조~)의
편집기 내 노출(현재는 `bodyText` textarea 1개).

허브(B): ⑩ 서식 탭 시스템(작성된 문서들을 탭으로 전환), ⑪ 서식추가 드롭다운(카탈로그
분류·중복 차단·상호배제), ⑫ 확인설명서 유형 콤보(1문서 4변형), ⑬ 셸 툴바(인쇄매수·
미리보기·인쇄·저장·다른저장·공유), ⑭ 한줄메모 밴드. (공유·e-서비스는 Phase 2+ 비범위.)

---

## 2. 현재 v2 상태

### 2.1 문서 허브 — `-document-hub.tsx` (357줄)

계약 상세 다이얼로그의 "문서 허브" 탭 안 카드 1장. 세 개의 **테이블**:

1. **작성된 문서**: `sortOrder → kindOrder` 정렬, 동일 서식 `N부` 표시, 행별
   수정(편집기 열기)/사본(`copyDocument` — kindOrder 자동 증가, 레거시 다른저장 대응)/삭제.
2. **필수 문서** / 3. **선택 문서**: 템플릿 체크리스트(작성 여부 아이콘 + 상태 배지 +
   거래신고 D-day 배지) + 작성/수정 버튼.

즉 "무엇을 만들었고 무엇이 빠졌나"는 잘 보여주지만, 레거시의 **탭 전환·공용 툴바** 개념은
없다. 문서를 열면 각각 전체화면 Sheet 가 뜬다.

### 2.2 문서 편집기 — `-document-editor.tsx` (1,299줄)

- `template.metadata.documentEngine.fieldGroups` 구동 제네릭 폼: 그룹 = 카드 섹션,
  필드 = **라벨 위 + 입력 아래** 3열 그리드. `appliesTo` 거래유형 필터 적용.
- inputType 별 컨트롤 이미 구현: `amount`(만/천/원 단위 토글 + 실시간 한글 병기 —
  레거시 `Cost_Unit` 대응), `date`(+1/2/3개월 편의 버튼), `select`, `checkbox`,
  `number(+unit)`, `textarea`, `specialTerms`(TipTap rich text + 특약 가져오기/등록 =
  `ContractClauseTemplate`).
- 파생 로직: 한글 병기 미러(`PRIMARY_AMOUNT_MIRRORS`), 임대차 개월수↔만기일 양방향
  (`applyLeasePeriodDerivation` — 레거시 setRentMonth), 부속 서식의 주 서식 값 승계
  (`findPrimaryContractDocument` — 레거시 getMainContractInfo), 서식×거래유형 기본 본문
  주입(`defaultBody` — 레거시 DMSV001Q03).
- 미리보기: Dialog 안 A4 페이지(`ContractDocumentPage`) — **라벨:값 표 나열**
  (`getContractDocumentEngineSections`) + 당사자 반복 행 + `window.print()`.
- 저장: `mergeContractDocumentEngineMetadata` → `document.metadata.documentEngine.fields`
  단일 JSON. 다른 이름으로 저장(onSaveAsNew), Ctrl+S/Ctrl+P, dirty 추적(JSON 비교) 완비.

### 2.3 매매초안 — `-residential-sale-editor.tsx` (769줄)

`base_contract × sale` 전용 구조화 폼. `ResidentialSaleAgreementDraft`
(kr-residential-sale-agreement v1) 스키마 — AgreementSection(계약일/부동산의 표시/매매대금과
지급 일정/인도·소유권 이전/매도인·매수인 배열/중개사무소/특약) + validation + 전용 프리뷰.
입력은 역시 **라벨+입력 그리드**이지 조항 문장이 아니다.

### 2.4 연결 구조

`index.tsx`(페이지)가 폼 상태 소유 → `-contract-detail.tsx` 문서 허브 탭 →
`DocumentHub.onOpenDocument` → `toDocumentEditorForm`(draft 빌드) → `DocumentEditorSheet`.
엔진은 `packages/shared/src/contract-document-engine.ts`(순수 TS, web/desktop shim 공유),
금액 표기는 `shared/contract-amount.ts`(한글/한자/₩ 병기 완비), 특약 새니타이즈는
`lib/contract-rich-text.ts`(DOMPurify 이중 방어). 카탈로그 시드는
`prisma/contract-template-catalog.ts` — `BASE_CONTRACT_FIELD_GROUPS`에 §4.1 필드가 대부분
이미 정의돼 있다(salePrice/loanAmount/loanHandling/currentTenantDeposit(+Handling)/
downPaymentPayTime/interimPayment(+Date/+BlankPrint)/interimPayment2/balancePayment/
monthlyRent(+PayDay/+Prepaid)/vatMode/secondClauseUsed/bodyText…). 당사자는 `ContractParty`
모델 + `-parties-editor.tsx`로 이미 별도 관리된다.

**요약**: 데이터 파이프라인(필드 정의→편집→저장→프리뷰→인쇄)은 레거시와 동형으로 완성.
부족한 것은 **"문서처럼 보이는 편집면"과 "탭 셸"** 이라는 표현 계층이다.

---

## 3. 갭 분석

### (A) 문서 편집기

| # | 갭 | 현행 | 레거시 | 심각도 |
|---|---|---|---|---|
| A1 | **조항 임베디드 편집** — 제1조 금액 표, 제2조 문장 내 날짜, "만원정은/하고 영수함" 문맥 | 라벨+입력 그리드 (문맥 없음) | 문서 그대로의 표 + 인라인 컨트롤 | **높음** — 이번 작업의 본체 |
| A2 | 금액인쇄형식 **한글/漢字** 토글 | 한글 병기만 (formatContractAmountHanja 유틸은 존재, 미노출) | `pricePrintTypeRadioGroup` ◉한글 ○漢字 | 중간 |
| A3 | **융자금 처리** 드롭다운 3지 | `loanHandling` select `승계/말소` | `현 상태에서 매수인이 승계한다./매도인이 잔금일까지 말소한다./특약사항에 별도 명시한다.` | 중간 (카탈로그 옵션 문구 보강) |
| A4 | **현 임대보증금 처리** 3지 + `현 임차보증금 입력란 추가` 행 토글 | `currentTenantDepositHandling` `승계/반환` 2지, 행 토글 없음 | `rentGrantPriceComboBox` 3지 + `grantOrInterimcheckEdit` | 중간 |
| A5 | **공란인쇄** — 융자금·2차중도금까지 | `interimPaymentBlankPrint` 1개 | `chkBlankloan`/`chkBlankDeposit`/`chkBlankDeposit2` 3개 + 인쇄 시 `≠` 공란 행 유지 | 중간 |
| A6 | 계약금 **지불시기** 드롭다운 | `downPaymentPayTime` text | `계약시에 지불/특약사항에 준` + "하고 영수함. 영수자(자필서명)(인)" 고정 문구 | 낮음 |
| A7 | **영수증 버튼** (계약금/중도금/잔금영수증 즉석 발행) | 없음 (OfficePrintTemplate receipt 시드만 존재) | `InvoiceForm` 연동 버튼 3종 | 낮음 (P5) |
| A8 | `계약사항2조 직접입력` 동작 | `secondClauseUsed` checkbox 는 있으나 제2조 렌더 자체가 없음 | `chkSecUse` — 체크 시 제2조 자동 문장 비움 | A1에 포함 |
| A9 | 조항 텍스트(제3조~)의 문서형 노출 | `bodyText` textarea | 조항 스크롤 + 문구 가져오기(ContractComment) | A1에 포함 |

### (B) 문서 허브

| # | 갭 | 현행 | 레거시 | 심각도 |
|---|---|---|---|---|
| B1 | **서식 탭 시스템** — 한 계약의 documents 를 탭으로 전환하며 편집 | 테이블 행 → 개별 Sheet | MDI 탭 (탭[0]=주 서식) | **높음** |
| B2 | **서식추가 드롭다운** — 카탈로그에서 골라 즉시 탭 추가, 중복 차단, 33↔46 상호배제, 확인설명서 유형 콤보 | 필수/선택 체크리스트에서 "작성" 클릭 (기능적 등가는 있으나 명시 규칙 없음) | `drpForm` + `isExistInputForm` + `cboMtceClsf` | 중간 |
| B3 | **공용 툴바** — 미리보기/인쇄(+매수)/저장/다른저장 을 문서 전환과 무관하게 상시 노출 | 편집기 Sheet 푸터에 문서별로만 존재 | 셸 상단 고정 | 중간 |
| B4 | 한줄메모 밴드 | `Contract.memo` 필드는 계약 정보 탭에 존재 | 편집 셸 상단 상시 노출 | 낮음 (허브 헤더에 노출만) |
| B5 | 인쇄매수 | 없음 (브라우저 인쇄 다이얼로그 위임) | `cboCopies` | 비범위 권장 (브라우저 위임 유지) |
| B6 | 계약서공유/e-서비스 | 없음 | `btnShare`/EService | Phase 2+ 비범위 (legacy-spec G13) |

---

## 4. 상세 설계

### 4.1 데이터 — "서버 스키마 변경 없음"이 결론

조항 임베디드 값들은 **전부 이미 존재하는 저장 경로에 들어간다**:

- 필드 값: `ContractDocument.metadata.documentEngine.fields` (string 맵) — 현행 그대로.
  조항 에디터는 **새 키를 만들지 않고 카탈로그 `BASE_CONTRACT_FIELD_GROUPS` 의 기존 키**
  (salePrice/loanAmount/loanHandling/…)를 그대로 읽고 쓴다. 제네릭 편집기·프리뷰·주서식
  승계와 값 호환이 공짜로 유지된다.
- 필드 정의: `ContractDocumentTemplate.metadata.documentEngine.fieldGroups` (카탈로그 시드).
- **카탈로그 시드 보강만 필요** (`prisma/contract-template-catalog.ts`):
  1. `loanHandling` options → `['현 상태에서 매수인이 승계한다.', '매도인이 잔금일까지 말소한다.', '특약사항에 별도 명시한다.']` (verbatim)
  2. `currentTenantDepositHandling` options → `['현 상태에서 매수인이 승계한다.', '특약사항에 별도 명시한다.', '매수인이 인수하지 아니한다.']`
  3. 신규 필드: `loanBlankPrint`(checkbox, 융자금 공란인쇄), `interimPayment2BlankPrint`,
     `currentTenantDepositRowEnabled`(checkbox — `현 임차보증금 입력란 추가`),
     `downPaymentPayTime` type text→select options `['계약시에 지불', '특약사항에 준']`
  4. `balancePaymentDate`는 이미 date. 중도금 날짜도 date — 년/월/일 분리 입력은 UI 표현일
     뿐 저장은 ISO date 유지.
- **표기 옵션(금액단위/한글·漢字)**: 문서 단위 인쇄 옵션이므로
  `document.metadata.documentEngine.printOptions = { amountUnit: 'man'|'cheon'|'won', amountNotation: 'hangul'|'hanja' }`
  로 저장(신규 JSON 키 — fields 맵은 string 관례 유지, 옵션은 별도 객체가 깔끔).
  `mergeContractDocumentEngineMetadata` 에 printOptions 인자 추가.
- **저장값 단위는 계속 만원 Int 문자열**. 단위 토글은 기존 `AmountEngineFieldControl`
  방식(입력 해석/표시만 변경)을 그대로 따른다. 한자 표기는 렌더 시점
  `formatContractAmountWithWon(manwon, 'hanja')` 호출로 끝 — 유틸 이미 완비.
- Prisma/NestJS 변경: **없음**. (영수증 발행(P5)까지 가면 ActivityLog `print` 액션 정도가
  후보이나 이번 범위 밖.)
- `residentialSaleAgreement` 스냅샷과의 관계: §4.4 참조.

### 4.2 컴포넌트 — 조항 임베디드 에디터

**접근법 선택**: (a) 완전 데이터 주도(조항 문장 템플릿+슬롯을 metadata 스키마로) vs
(b) 서식별 전용 컴포넌트. **권장: 하이브리드 (b′)** —

- 조항 문장(국어 조사 치환 "아파트를/부동산을", Kind×Trade별 도입문, "만원정은/하고
  영수함" 등)은 스키마로 일반화하면 슬롯 DSL이 폭발한다. 레거시도 이 부분은 코드였다.
- 대신 **값은 engineFields 키**, **문장은 TS 상수/컴포넌트**로: 서식별 조항 정의를
  `shared`(또는 route 로컬)의 순수 데이터 상수
  `CLAUSE_LAYOUTS[templateCode][transactionType]` 로 두고, 각 조항은
  `Array<TextSegment | FieldSlot>` (FieldSlot = engineFields key + 인라인 컨트롤 종류)로
  기술한다. 렌더러는 하나.

**신규 공용 프리미티브** (`-clause-editor.tsx`, web/desktop 각 1부 — 관례상 앱별 복제,
로직 없는 표현 컴포넌트라 복제 비용 낮음):

1. `ClauseArticle` — `제N조` 헤더 밴드 + 본문 flow 컨테이너 (인쇄물과 같은 표/문장 배치,
   `inline-flex flex-wrap items-baseline` 문장 흐름).
2. `ClauseAmountRow` — `라벨 | 金 [input] 만원정(은) | 후속 슬롯…` 행. 내부는 기존
   `AmountEngineFieldControl` 을 라벨 없는 인라인 변형(`variant="inline"`)으로 재사용 —
   단위 토글은 행별이 아니라 **문서 상단 라디오 1개**가 모든 금액 입력의 해석 단위를
   지배한다(레거시 동일). 한글 병기는 행 아래 작은 캡션으로 유지.
3. `ClauseInlineDate` — 문장 안 `[YYYY]년 [MM]월 [DD]일 📅` (내부 저장 ISO, 표시만 분리.
   shadcn Popover 달력 병용).
4. `ClauseInlineSelect` / `ClauseInlineCheck` — 문장 폭에 맞는 소형 select/checkbox
   (`공란인쇄`, 처리 드롭다운).
5. `AmountNotationBar` — `금액단위 ◉만원 ○천원 ○원 / 금액인쇄형식 ◉한글 ○漢字` 옵션 바
   (printOptions 바인딩).

**base_contract 조항 에디터** (`-base-contract-clause-editor.tsx`):
`1. {Kind}의 표시` 표(소재지/지목/대지권/구조/용도/면적 — 기존 필드 키) →
`2. 계약내용` (AmountNotationBar + 제1조 도입문 + `☑현 임차보증금 입력란 추가` + 금액 행
7종 §1.4 표 그대로 + `☐계약사항2조 직접입력`) → 제2조(임베디드 날짜, 매매/임대차 변형,
chkSecUse 시 비활성) → 제3조~(bodyText — 조항 문단 뷰 + 클릭 시 편집, 기본 문구는 기존
`CONTRACT_TEMPLATE_BODY_CLAUSES` 시드) → 특약(기존 RichTextEditor + 특약 도구 재배치) →
당사자 요약(ContractParty 읽기 + "당사자 탭에서 편집" 점프 — 편집기 안 중복 편집은 피함)
→ 중개사무소.

**편집기 셸 통합**: `DocumentEditorSheet` 에서 `template.code === 'base_contract'` 이면
제네릭 `DocumentInputFormSection` 목록 대신 조항 에디터를 렌더. **값 상태·저장·dirty·
승계·미리보기 파이프는 전부 기존 것**(updateEngineField/saveDocument) 재사용 — 표현
계층만 교체된다.

**미리보기/인쇄와의 관계**: 조항 레이아웃 상수를 프리뷰도 공유한다.
`ContractDocumentPage` 에 서식별 분기를 추가해 base_contract 는 같은
`CLAUSE_LAYOUTS` 를 **읽기 전용 모드**(FieldSlot → 값 텍스트, 빈 값은 공란인쇄 체크 시
`≠` 공란 유지, 아니면 행 생략)로 렌더 — "편집면 = 인쇄면" 정합이 구조적으로 보장된다.
shared 의 `getContractDocumentEngineSections` 는 다른 서식의 fallback 으로 유지.

### 4.3 서식 탭 허브 + 툴바

문서 허브 탭을 2단 구조로 개편 (`-document-hub.tsx` 개편):

```
[허브 헤더] 한줄메모(Contract.memo 인라인) · 준비 상태 배지 · 거래신고 D-day
[툴바]     [서식추가 ▾] | 미리보기 · 인쇄 · 저장 · 다른저장(사본) · 삭제   (활성 탭 대상)
[탭바]     [매매 계약서] [확인설명서Ⅰ] [위임장] [위임장(2)] [+]
[본문]     활성 문서의 편집기 인라인 렌더 (base_contract → 조항 에디터,
           그 외 → 제네릭 fieldGroups 폼)
[하단]     필수/선택 체크리스트 (미작성 템플릿 안내 — 기존 테이블 축약 유지)
```

- **탭 = `sortContractDocuments(contract.documents)`**, `kindOrder>1` 은 `(N)` 병기.
  탭 X = 기존 삭제 mutation(확인 다이얼로그 유지).
- **서식추가 드롭다운**: 템플릿 카탈로그를 필수/선택 그룹으로 나눠 노출. 규칙(카탈로그
  §5.3-5 이식): 이미 작성된 단일 인스턴스 서식 비활성, 반복 허용 서식(위임장·개인정보동의서
  등)은 "N부 추가", `주택취득자금조달계획서`↔`주택취득자금조달및입주계획서` 상호배제,
  확인설명서는 계약당 1종(주거용/비주거용/토지/특수 중 택1 — 레거시 `cboMtceClsf` 를
  드롭다운 서브메뉴로 표현).
- **폼 상태 소유 이동**: 현재 index.tsx 가 소유한 `documentEditorForm` 을 "활성 문서"
  단위로 유지하고, 탭 전환 시 dirty 확인(기존 Sheet 닫기 확인 로직 재사용). 문서 편집
  Sheet 는 하위호환(다른 진입점)으로 유지하거나 허브 인라인으로 일원화 — **권장:
  허브 인라인으로 일원화**, Sheet 는 제거(코드 경로 단순화).
- 인쇄매수·확대축소는 브라우저에 위임(비범위 명시).

### 4.4 매매초안(residentialSaleAgreement)과의 관계 — 결정 필요 사항

`base_contract × sale` 은 현재 조항 에디터의 1차 대상이면서 유일하게
`ResidentialSaleAgreementDraft` 전용 폼이 걸려 있는 조합이다. 두 저장 포맷(스냅샷 vs
engineFields)이 공존하면 정합 문제가 생긴다. **권장**:

- P1에서 조항 에디터는 engineFields 를 단일 진실로 사용.
- 기존 문서에 `residentialSaleAgreement` 스냅샷만 있으면 열 때 engineFields 로 1회
  매핑(read-path 변환, `readResidentialSaleAgreement` 재사용)하고 저장 시 engineFields 로
  기록. 스냅샷은 읽기 하위호환으로만 유지, `-residential-sale-editor.tsx` 는 조항 에디터
  정착 후 제거. (검증 로직 `validateResidentialSaleAgreement` 중 금액 합계·필수일자 검사는
  engineFields 기반 검사로 이식.)

---

## 5. 단계별 작업 분해

| Phase | 산출물 | 주요 파일 (web + desktop 미러) | 작업량 |
|---|---|---|---|
| **P1. 매매 계약서 조항 임베디드 에디터** | 조항 프리미티브 5종 + base_contract×sale 조항 에디터 + AmountNotationBar(만/천/원·한글/漢字) + 카탈로그 시드 보강(융자금 3지·공란인쇄 2종·행 토글·지불시기 select) + printOptions 저장 + 매매초안 이관(§4.4) | 신규 `contracts/-clause-editor.tsx`, `-base-contract-clause-editor.tsx`; 수정 `-document-editor.tsx`, `prisma/contract-template-catalog.ts`, `shared/contract-document-engine.ts`(printOptions·mergeContractDocumentEngineMetadata), `index.tsx`(저장 페이로드) | **대** (1주±) — 프리미티브가 이후 전 Phase 의 기반 |
| **P2. 임대차 변형** | base_contract×jeonse/monthly 조항 레이아웃(보증금/차임+지급일+선불후불/제2조 임대차 기간+개월수↔만기 기존 파생 재사용/현 임대보증금 행 제외) + 상가 부가세 행 | `CLAUSE_LAYOUTS` 확장, `-base-contract-clause-editor.tsx` | 중 (2~3일) — P1 프리미티브 재사용 |
| **P3. 확인설명서 (주거용 Ⅰ부터)** | ①~⑮ 항목의 문서형 렌더 — 조항 문장이 아니라 **법정 서식 표+체크박스 그리드**이므로 별도 프리미티브(ChecklistTable) 1개 추가, 기존 `BROKER_EXPLANATION_RESIDENTIAL_FIELD_GROUPS` 시드 그대로 소비 | 신규 `-broker-explanation-editor.tsx`(선택 — 제네릭 폼 유지 후 표 렌더만 개선하는 축소안도 가능), 카탈로그 미세 보강 | 중 (Ⅰ만) — Ⅱ~Ⅳ는 후속 |
| **P4. 서식 탭 허브 + 툴바** | 탭바 + 서식추가 드롭다운(중복 차단·33↔46 상호배제·확인설명서 1종 규칙) + 공용 툴바 + 한줄메모 밴드 + 편집기 인라인화(Sheet 일원화 제거) | `-document-hub.tsx` 개편, `-contract-detail.tsx`, `index.tsx`(폼 상태/dirty 이동) | 중~대 (3~5일) |
| **P5. 미리보기/인쇄 정합 (+영수증)** | 조항 레이아웃 공유 읽기 전용 프리뷰(공란인쇄 `≠` 행 유지 규칙, 한자 표기 인쇄), 특약 줄수 초과 감지→별지 유도(legacy checkOverLine 대응), 영수증 버튼 3종(OfficePrintTemplate receipt 렌더러 — 최소 구현) | `-document-editor.tsx` 프리뷰 분기, `-clause-editor.tsx` print 모드, 신규 영수증 렌더 | 중 (영수증 제외 시 소) |

P1↔P4 는 독립적이라 순서 교체 가능하나, **P1 먼저**를 권장한다(§6). P3 은 P1 프리미티브
의존이 낮아 병렬 가능.

---

## 6. 권장 시작점과 리스크

**시작점: P1 (base_contract × sale 조항 임베디드 에디터).**
근거: ① 스크린샷의 본체이자 사용 빈도 1위 서식, ② 필요한 데이터(카탈로그 필드·금액 유틸·
승계·dirty·프리뷰)가 모두 준비돼 있어 순수 표현 계층 작업으로 범위가 잘 닫힘, ③ 여기서
만든 프리미티브가 P2/P3/P5 의 기반, ④ 서버 무변경이라 롤백 리스크 최소.

**리스크와 트레이드오프**:

1. **WinForms 픽셀 재현은 목표가 아니다.** 레거시는 고정 창 크기의 픽셀 배치 폼이다.
   웹에서는 반응형 제약 아래 **"문서-shaped 편집 경험"**(조항 문맥 안에서 입력, 편집면 ≈
   인쇄면)을 목표로 하고, 년/월/일 3분할 입력 같은 표현은 date input+달력으로 대체한다.
   100% 동일 배치를 요구하는 사용자 기대는 온보딩 문서로 관리.
2. **조항 원문 복제 금지 정책 유지.** documents-legacy-spec 원칙("원문 서식 텍스트는
   복제하지 않는다")에 따라 제3조~ 기본 문구는 기존 v2 자체 시드
   (`CONTRACT_TEMPLATE_BODY_CLAUSES`)를 쓴다. 단, `현 상태에서 매수인이 승계한다.` 같은
   **선택지 문구·조항 관용구는 업계 표준 표현**이라 verbatim 사용(법적 의미 보존이 우선).
3. **두 저장 포맷 공존 기간**(engineFields vs residentialSaleAgreement) — §4.4 이관
   전략을 P1 에 포함해 기간을 최소화. 이관 전 저장된 문서의 열람 하위호환 테스트 필수.
4. **web/desktop 이중 유지보수** — 로직은 shared 엔진에, 앱에는 표현 컴포넌트만 두는
   기존 관례 유지. 조항 레이아웃 상수는 shared 로 올려 중복을 데이터가 아닌 렌더러로 한정.
5. **engineFields 전량 string 관례** — checkbox 'true'/'' 등 기존 관례를 조항 에디터도
   그대로 따른다(제네릭 편집기와 값 호환 유지). 타입 강화는 이번 범위에서 하지 않음.
6. **공란인쇄 의미론** — "빈 값이어도 행 인쇄"는 프리뷰(P5)까지 가야 완결된다. P1 에서는
   체크박스 저장까지만 하고 인쇄 반영은 P5 로 미룬다는 것을 명시.

---

## 7. 레거시의 나쁜 패턴 — 재현 금지 (현행 설계가 이미 준수)

| 레거시 패턴 | 문제 | 현행 v2 |
|---|---|---|
| MDI `FormClosing` 부작용 (탭 닫기 이벤트에 저장/정리 로직 결합) | 표시 로직과 데이터 부작용 결합 | 명시적 mutation + dirty 확인 다이얼로그 — 유지 |
| 서식별 개별 트랜잭션 저장(DMSV003I01 를 탭 순서대로 반복 — 원자성 없음) | 부분 저장 실패 시 불일치 | 문서 단건 저장 API + 계약 마스터 분리 — 유지 (P4 탭 허브도 "활성 문서만 저장" 모델 유지, 일괄 저장 금지) |
| WebBrowser + 원격 HTML 폼(assetmaker.co.kr) 이원 엔진 | 배포 결합·오프라인 불가·XSS | 단일 데이터 주도 엔진 + DOMPurify 새니타이즈 — 유지 |
| 컨트롤 직접 접근 값 수집(폼=데이터) | 폼 정의 하드코딩 | fieldGroups 메타데이터 구동 — 조항 에디터도 값은 동일 키 사용 |
| 우측 광고 링크 패널(pnlLinkInfo) | 업무 화면 오염 | 도입하지 않음 |
| 인쇄 직전 복호화 + 클라이언트 마스킹 | 개인정보 취급 경로 분산 | 서버 read-path 마스킹(ContractParty) — 유지 |
