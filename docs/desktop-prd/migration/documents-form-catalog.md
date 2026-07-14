# MySpider V2 계약 문서 서식·리포트 전체 카탈로그

레거시 소스: `MySpiderII/MySpiderMgr` (디컴파일)
- 입력 폼: `DocuMngt/contract/` (75개 파일)
- 리포트: `CommModule/print/report/` (+ `addForm/`, `etcForm/`, `template/`)
- 마스터 코드: `CommModule/print/ContractKind.cs`, `ContractTradeType.cs`, `ContractType.cs`, `ContractName.cs` + `DocuMngt/contract/ContractUtil.cs` (`getCntrClsf`)
- 런처: `DocuMngt/DMIN001I2M.cs` (계약서 작성 메인 MDI 컨테이너)

현행 시스템 대응: `prisma/contract-template-catalog.ts` (`MYSPIDER_REFERENCED_TEMPLATE_CODES` 30종)

---

## 1. 아키텍처 개요 — InputForm / WebForm / Report 3계층

레거시는 문서 1종당 최대 3개 클래스가 존재한다.

| 계층 | 역할 | 비고 |
|------|------|------|
| `*InputForm` | 구세대 **네이티브 WinForms 입력 폼** (DevExpress 컨트롤 격자) | 대부분 신버전에서 WebForm으로 대체됨 |
| `*WebForm` | 신세대 **HTML(WebBrowser) 기반 입력/편집 폼** (`HtmlDocument` 직접 조작) | V2 런처(DMIN001I2M)가 실제로 띄우는 쪽 |
| `*Report` | DevExpress XtraReports **인쇄 리포트** | InputForm과 WebForm이 **같은 Report를 공유** |

- 런처 `DMIN001I2M.addForm(sCntr_Clsf)`가 문서코드(`Cntr_Clsf`)별로 폼을 생성한다.
- **V2에서 여전히 네이티브 InputForm으로 뜨는 문서**: 33(주택취득자금조달계획서), 39/40(임대차계약신고서 구서식), 44(임대차계약신고서), 45(임대차계약변경신고서). 나머지는 전부 WebForm.
- 확인설명서는 코드 `21` 하나에 콤보(`cboMtceClsf`) 인덱스 1~4로 Ⅰ~Ⅳ 서식을 분기.
- 메인 계약서(01~06)는 `loadContractInputForm()`에서 거래구분 인덱스로 분기: 0~3(매매/전세/월세/연세)→`ContractWebForm`, 4(교환)→`ChangeWebForm`, 5(전대)→`SubleaseWebForm`, 분양권→`SaleRightWebForm`, 권리 양도/승계→`TransferWebForm`/`SuccessionWebForm`, 입주권→`UnionWebForm`.
- 문서들은 하나의 계약번호(`Cntr_No`)에 묶여 MDI 탭으로 함께 관리된다 (메인 계약서 1 + 부속 서식 N). 33↔46은 동시 등록 금지 같은 상호배제 규칙이 런처에 있다.
- `BasicConfirmation.cs`: "기본 확인서 관리" — 사무소가 자주 쓰는 확인설명서 내용을 저장해 두고 새 확인설명서에 적용하는 프리셋 기능 (현행 ContractClauseTemplate에 해당).
- `AgentCharge.cs`: 중개보수 요율 자동계산 (주택/오피스텔/그 외, 거래금액 구간별 요율+한도, 주거용 오피스텔 85㎡ 초과 예외).
- `ContractUtil.cs`: 금액 한글/한자 변환(`GetHangulFromNum`/`GetHanjaFromNum`), 코드 매핑, 주민번호 마스킹(`asteriskRegiNumber`, 15일 경과 시 자동 마스킹) 등 공용 유틸.

### 코드 체계 (ContractUtil.getCntrClsf)

- **계약서 종류(Cntr_Clsf) 01~06**: 메인 계약서의 물건 종별 — 01 아파트 / 02 오피스텔 / 03 부동산 / 04 분양권 / 05 상가 / 06 권리
- **11~15**: 특수 계약서 (권리금/표준임대차 계열/입주권)
- **21**: 중개대상물확인설명서 (Ⅰ~Ⅳ)
- **31~52**: 부속 서식 (위임장/신고서/동의서/확인서/보관증 등)
- **거래구분(Tran_Clsf)**: 01 매매 / 02 전세 / 03 월세 / 04 교환 / 05 전대 / 06 양도 / 07 승계 / 08 연세
- **ContractType**: BASIC(01) / EXTEND(02, 별지 확장) / SIMPLE(99)
- **당사자 호칭 규칙** (`getCntrStatClsfName`): 매매→매도인/매수인, 전·월세→임대인/임차인, 교환→갑/을, 전대→전대인/전차인, 양도·승계→양도인/양수인, 권리금→임차인/신규임차인, 매매약정→매도약정인/매수약정인

---

## 2. 마스터 문서 코드표 (ContractKind 33종)

| 코드 | ContractKind enum | 문서명 (한글) | 카테고리 |
|------|-------------------|--------------|----------|
| 01 | APARTMENT | 아파트 (매매/전세/월세/연세 계약서) | 계약서 |
| 02 | OFFICE | 오피스텔 (〃) | 계약서 |
| 03 | REAL_STATE | 부동산 (〃 + 교환/전대) | 계약서 |
| 04 | PURCHASE_RIGHT | 분양권 매매(양도) 계약서 | 계약서 |
| 05 | BUSINESS_SECTION | 상가 (매매/전세/월세/연세 계약서) | 계약서 |
| 06 | RIGHT | 권리 (양도/승계 계약서) | 계약서 |
| 11 | STORE_PREMIUM | 상가건물임대차권리금계약서 | 계약서 |
| 12 | STORE_STANDARD | 상가건물임대차표준계약서 | 계약서 |
| 13 | STANDARD | 표준임대차계약서 (민간임대주택, 임대사업자용) | 계약서 |
| 14 | HOUSE | 주택임대차계약서 (주택임대차표준계약서) | 계약서 |
| 15 | UNION_ENTER | 조합원입주권매매계약서 | 계약서 |
| 21 | (cboMtceClsf 1~4) | 중개대상물 확인·설명서 Ⅰ~Ⅳ | 확인설명서 |
| 31 | PROXY | 부동산거래위임장 | 위임장 |
| 32 | HOUSE_TRADE | 주택거래계약신고서 | 신고서 |
| 33 | HOUSE_OPTAIN | 주택취득자금조달계약서(조달계획서, 구서식) | 신고서(계획서) |
| 34 | TRADE_CONTRACT | 부동산거래계약신고서 | 신고서 |
| 35 | TRADE_CONTRACT_REMOVE | 부동산거래계약해제등신고서 | 신고서 |
| 36 | FACT_CONFIRM | 거래사실확인원 | 확인서 |
| 37 | TRADE_AGREEMENT | 부동산매매약정서 (토지거래허가 전 약정) | 약정서 |
| 38 | SUBLEASE | 전대차동의서 | 동의서 |
| 39 | LEASE_CONDITION | 임대차계약신고서(구) | 신고서 |
| 40 | LEASE_CONDITION_CHANGE | 임대차계약변경신고서(구) | 신고서 |
| 41 | CASH | 현금보관증 | 영수증/보관증 |
| 42 | TRANSFER | 전속중개계약서 | 중개계약서 |
| 43 | PRIVATEINFO | 개인정보수집이용동의서 | 동의서 |
| 44 | LEASE_CONTRACT | 임대차계약신고서 | 신고서 |
| 45 | LEASE_CONTRACT_CHANGE | 임대차계약변경신고서 | 신고서 |
| 46 | HOUSE_PLAN | 주택취득자금조달및입주계획서 | 신고서(계획서) |
| 47 | LEASE | 임대차계약신고/변경신고서 (통합) | 신고서 |
| 48 | RENEWAL | 계약갱신요구권행사여부확인서 | 확인서 |
| 49 | HOUSE_LEASE_DECLAR | 주택임대차계약신고서 | 신고서 |
| 50 | RENTER_AGREE | 임대보증미가입임차인동의서 | 동의서 |
| 51 | NOT_REQUEST | 전세권설정미요청확인서 | 확인서 |
| 52 | RENTER_AGREE2 | 임대보증일부가입임차인동의서 | 동의서 |

---

## 3. 마스터 매핑 테이블 — 전체 서식 파일

타입: **W** = WebForm(HTML)이 현행 편집기, **N** = 네이티브 InputForm이 현행 편집기, **(구)** = 구세대/백업으로만 존재.
거래유형: 매매/전세/월세/연세/교환/전대/양도/승계, 전체 = 거래유형 무관.

### 3.1 계약서 본체

| 코드 | 문서명 | InputForm (네이티브) | WebForm (HTML) | Report | 타입 | 거래유형 |
|------|--------|---------------------|----------------|--------|------|---------|
| 01/02/03/05 | 아파트·오피스텔·부동산·상가 매매/전세/월세/연세 계약서 | `ContractInputForm` | `ContractWebForm` | `ApartmentTradeContractReport` (+`AnnexedReport` 별지) | W | 매매·전세·월세·연세 |
| 03(교환) | 부동산 교환 계약서 | `ChangeContractInputForm` | `ChangeWebForm` | `RealStateExchangeContractReport` | W | 교환 |
| 03(전대) | 부동산 전대차 계약서 | `SubleaseContractInputForm` | `SubleaseWebForm` | `RealStateSubleaseContractReport` | W | 전대 |
| 04 | 분양권 매매(양도) 계약서 | `SalesRightContractInputForm` | `SaleRightWebForm` | `PurchaseRightTradeContractReport` | W | 매매(전매) |
| 06(양도) | 권리 양도 계약서 | `TransferContractInputForm` | `TransferWebForm` | `RightTransferContractReport` | W | 양도 |
| 06(승계) | 권리 의무 승계 계약서 | `SuccessionContractInputForm` | `SuccessionWebForm` | `RightSuccessionContractReport` | W | 승계 |
| 11 | 상가건물임대차권리금계약서 | `BuildingLeasePremiumContractInputForm` | `BuildingPremiumWebForm` | `BuildingLeasePremiumContractReport` | W | 임대차(권리금) |
| 12 | 상가건물임대차표준계약서 | `BuildingLeaseStandardContractInputForm` | `BuildingStandardWebForm` | `BuildingLeaseStandardContractReport` | W | 전세·월세(상가) |
| 13 | 표준임대차계약서 (민간임대주택) | `StandardLeaseContractInputForm` | `StandardLeaseWebForm` | `StandardLeaseContractReport` | W | 전세·월세(등록임대) |
| 14 | 주택임대차계약서 (표준) | `HouseLeaseContractInputForm` | `HouseStandardWebForm` | `HouseLeaseContractReport` (구: `HouseLeaseContractReport_Old`) | W | 전세·월세(주택) |
| 15 | 조합원입주권매매계약서 | `HProjectMembersContractFrom` | `UnionWebForm` | `HProjectMembersContractReport` | W | 매매 |

### 3.2 중개대상물 확인·설명서 (코드 21)

| 서식 | 문서명 | InputForm | WebForm | Report | 타입 | 적용 |
|------|--------|-----------|---------|--------|------|------|
| Ⅰ | 중개대상물 확인·설명서[Ⅰ] (주거용 건축물) | `ConfirmExplanationInputForm1` (구: `~1_bak`) | `ConfirmExplanationWeb1` | `ConfExp1Report` (구: `MediationTargetConfrimExplanation1Report`) | W | 아파트·오피스텔(주거)·주택, 매매·임대 |
| Ⅱ | 중개대상물 확인·설명서[Ⅱ] (비주거용 건축물) | `ConfirmExplanationInputForm2` | `ConfirmExplanationWeb2` | `MediationTargetConfrimExplanation2Report` | W | 상가·업무용, 매매·임대 |
| Ⅲ | 중개대상물 확인·설명서[Ⅲ] (토지) | `ConfirmExplanationInputForm3` | `ConfirmExplanationWeb3` | `MediationTargetConfrimExplanation3Report` | W | 토지, 매매·임대 |
| Ⅳ | 중개대상물 확인·설명서[Ⅳ] (입목·광업재단·공장재단) | `ConfirmExplanationInputForm4` | `ConfirmExplanationWeb4` | `MediationTargetConfrimExplanation4Report` | W | 특수물건 |

주: 주거용 Ⅰ 서식만 2024 개정판 리포트(`ConfExp1Report`, 관리비 세부·임대차 확인사항 ④ 신설)가 별도로 존재하고 나머지는 기존 리포트 유지. 확인설명서에는 "기본확인서 가져오기/추가" 기능이 붙어 있다 (`BasicConfirmation` 프리셋).

### 3.3 부속 서식 (31~52)

| 코드 | 문서명 | InputForm | WebForm | Report | 타입 | 거래유형 |
|------|--------|-----------|---------|--------|------|---------|
| 31 | 부동산거래위임장 | `RealStateTradeProxyInputForm` | `DelegateWebForm` | `RealStateTradeProxyReport` | W | 전체 |
| 32 | 주택거래계약신고서 | `HouseTradeContractInputForm` | `HouseTradeReportWebForm` | `HouseTradeContractReport` | W | 매매(주택) |
| 33 | 주택취득자금조달계획서 (구) | `HouseOptainFundSupplyInputForm` | — | `HouseOptainFundSupplyReport` | **N** | 매매(주택) |
| 33/46(구) | 주택취득자금 조달 및 입주계획서 (구판) | `HouseOptainFundSupplyPlanInputForm` | — | `HouseOptainFundSupplyPlanReport` | (구) | 매매(주택) |
| 34 | 부동산거래계약신고서 | `RealStateTradeContractInputForm` | `TradeReportWebForm` | `RealStateTradeContractReport` | W | 매매 |
| 35 | 부동산거래계약해제등신고서 | `RealStateTradeContractRemoveInputForm` | `TradeCancelReportWebForm` | `RealStateTradeContractRemoveReport` | W | 매매 |
| 36 | 거래사실확인원 | `TradeFactConfirmInputForm` | `TradeFactWebForm` | `TradeFactConfirmReport` | W | 전체 |
| 37 | 부동산매매약정서 | `RealStateTradeAgreementInputForm` | `TradeAgreeWebForm` | `RealStateTradeAgreementReport` | W | 매매(토지거래허가구역) |
| 38 | 전대차동의서 | `SubleaseAgreeInputForm` | `SubleaseAgreeWebForm` | `SubleaseAgreeReport` | W | 전대 |
| 39 | 임대차계약신고서(구) | `LeaseConditionInputForm` | — | `LeaseConditionReport` | **N** | 전세·월세 |
| 40 | 임대차계약변경신고서(구) | `LeaseConditionChangeInputForm` | — | `LeaseConditionChangeReport` | **N** | 전세·월세 |
| 41 | 현금보관증 | `CashReceiptInputForm` | `CashWebForm` | `CashReceipReport` | W | 전체 |
| 42 | 전속중개계약서 | `TransferMediationContractInputForm` | `ExclusiveWebForm` | `TransferMediationContractReport` | W | 전체(중개의뢰) |
| 43 | 개인정보수집이용동의서 | `PrivateInfoAgreeInputForm` | `PrivateWebForm` | `PrivateInfoAgreeReport` | W | 전체 |
| 44 | 임대차계약신고서 | `LeaseInputForm` | — | `LeaseReport` | **N** | 전세·월세 |
| 45 | 임대차계약변경신고서 | `LeaseChangeInputForm` | — | `LeaseChangeReport` | **N** | 전세·월세 |
| 46 | 주택취득자금조달및입주계획서 | `HousFundsPlanInputForm` | `HousePlanWebForm` | `HouseFundsPlanReport` | W | 매매(주택) |
| 47 | 임대차계약신고/변경신고서 (통합) | `LeaseForm` | `LeaseWebForm` | `LeaseContractReport` | W | 전세·월세 |
| 48 | 계약갱신요구권행사여부확인서 | `RenewalInputForm` | `RenewalWebForm` | `RenewalReport` | W | 매매(임차주택 매도 시) |
| 49 | 주택임대차계약신고서 | `HouseLeaseDeclarationInputForm` | `HouseReportWebForm` | `HouseLeaseDeclarationReport` | W | 전세·월세(주택) |
| 50 | 임대보증미가입임차인동의서 (보증금이 우선변제금 이하인 경우) | `RenterAgreeInputForm` | `RenterAgreeWebForm` | `RenterAgreeReport` | W | 전세·월세(등록임대) |
| 51 | 전세권설정미요청확인서 | `NotRequestInputForm` | `NoRequestWebForm` | `NotRequestReport` | W | 전세·월세(등록임대) |
| 52 | 임대보증일부가입임차인동의서 | `RenterAgreeInputForm2` | `RenterAgreeWebForm2` | `RenterAgreeReport2` | W | 전세·월세(등록임대) |

### 3.4 영수증·정산·기타 인쇄물 (`report/etcForm/` — 런처 밖, 별도 진입)

| Report | 문서명 | 호출 폼 | 카테고리 | 비고 |
|--------|--------|---------|----------|------|
| `ReceiptReport` / `ReceiptReport2` / `ReceiptReportColor` / `ReceiptReportColor2` / `ReceiptReportGray` | 영수증 (계약금·중도금·잔금 등, 흑백/컬러/2단 변형) | `DocuMngt/InvoiceForm` | 영수증 | 3번 영수증 내용 출력 옵션, 발행인 정보 |
| `PayReport` / `PayReportEach` | 중개보수 영수증 (통합 / 매도·매수측 개별) | `DocuMngt/InvoiceForm` | 영수증 | "위 금액을 아래 중개대상물에 대한 중개보수로 영수합니다", 중개(확인)대상물 표시, 중개보수+실비 |
| `TaxReport` | 세금계산서 | `DocuMngt/InvoiceForm` | 영수증(세무) | 공급자/공급받는자, 공급가액/세액, 업태/종목 |
| `BalanceAccountReport` | 매매·전세·월세 대금 정산서 / 잔금 정산서 | `DocuMngt/InvoiceForm` | 정산서 | 정산항목/정산금액/가감, 융자금·장기수선충당금·전기요금 등 |
| `ManagementExpReport` | 관리비(공과금) 정산서 | `DocuMngt/InvoiceForm` | 정산서 | 검침(전기 ㎾h·도시가스·상하수도), 정산기간, 관리사무소 확인분 |
| `FrontCoverReport` | 계약서 표지 (구비서류 체크리스트) | `DocuMngt/CoverForm` | 표지 | 당사자별 구비서류(매도인/매수인/임대인/임차인/전대인/전차인/양도인/양수인/갑/을), 계약·중도금·잔금일, 공동중개사무소 표시 |

### 3.5 계약 문서 외 인쇄물 (`report/` 최상위, 참고)

| Report | 용도 | 호출처 |
|--------|------|--------|
| `AnnexedReport` | 계약서 별지 (공동 당사자 다수·특약 초과분 별지 출력, "오피스텔 매매 계약서 별지" 등) | 각 계약서 Report 내부 |
| `EstaReport` | 매물장 인쇄 | `MyEsta/MEDS001Q1P`, `OpenEsta/OEDS001Q1P` |
| `CustomerReport` | 고객 목록/카드 인쇄 | `CustMngt/CMLS001P1M` 등 |
| `DrawReport` | 도면 인쇄 | `CommModule/drawing/DrawingShowForm` 등 |
| `MapReport` / `ChartReport` | 지도/차트 인쇄 | `CommModule/popup/AreaReport` |
| `WebPageReport` | 웹페이지(공지) 인쇄 | `CommModule/popup/Notice` |

### 3.6 인쇄 템플릿 조각 (`report/template/` — 리포트 조립용 부품 클래스)

| 클래스 | 내용 |
|--------|------|
| `person` / `personExtend` / `personSimple` | 당사자 블록 (매도인/매수인 — 주소·주민(법인)등록번호·성명·印) 기본/확장/간이 |
| `offc` / `offcExtend` / `office` | 개업공인중개사 블록 (사무소명·주소·등록번호·대표·소속공인중개사 서명란) |
| `esta` / `enterEsta` / `findEsta` / `estaHistory` / `land` | 물건 표시 블록 (물건종류·물건번호·소재지·지목·면적 등) |
| `customer` / `consult` / `consultExtend` | 고객·상담내역 인쇄 블록 |

### 3.7 헬퍼 (문서 아님)

`ContractUtil`(코드·금액·마스킹 유틸), `ContractTableHelper`, `AgentCharge`(중개보수 요율), `ucSubForm/`(공용 서브컨트롤: `ucPerson`·`ucOffc`·`ucLand`·`ucEditor`(RichEdit 특약 편집기)·`ucWebEditor`, `TradeFactContractPersonInfo` 등)

---

## 4. 10대 핵심 문서 필드 스펙

### 4.1 아파트(오피스텔/부동산/상가) 매매·전세·월세 계약서
`ContractInputForm` / `ContractWebForm` → `ApartmentTradeContractReport` — 코드 01·02·03·05 × 거래구분 01~03·08

- **표시(1. 아파트의 표시)**: 소재지 / 토지 지목 / 대지권비율(분의) / 건물 구조(철근콘크리트구조 등) / 용도 / 면적(㎡) / (월세) 임대 부분·임차용도
- **계약내용(2. 계약내용)**:
  - 매매: 매매대금 / 계약금 / 중도금(분납 시 중도금(2차)) / 잔금 / 융자금 — 각 금액에 지불일자, 한글·한자 금액 병기(`GetHangulFromNum`), 금액단위(만/천/원) 선택, 공란인쇄 옵션
  - 임대: 보증금 / 계약금 / 중도금 / 잔금 / 차임(월세, 매월·매년 지불일, 선불/후불) / 현 임대보증금 / 월세 지불기한
  - 기간: 인도일("임대인은 위 ~ 까지 임차인에게 인도하며"), 임대차 기간(인도일로부터 N개월, 초일산입/불산입 선택)
- **조문**: 제1조(목적물 표시) / 제2조(직접입력 가능) + 표준 조문 / 쌍방합의계약 문구
- **특약사항**: 리치에디터, 특약 저장/가져오기, 특약사항 별지출력, 개인정보 수집·이용 동의 문구 삽입 토글, 역전세대출특약 프리셋
- **당사자**: 매도인/매수인(임대인/임차인) — 주소·주민등록번호·전화·성명, **공동매도인/공동매수인 추가·삭제**(별지 출력), 자필서명 옵션, 주민등록증 진위확인 안내
- **중개사무소**: 공인중개사무소 N개(공동중개, 중개사무소추가/삭제, 별지출력) — 사무소명칭·주소·등록번호·대표·소속공인중개사
- **부속 기능**: 영수증/중도금영수증/잔금영수증 즉석 발행, 임대료 인상 계산기, 계약사항 저장/가져오기, 상가는 건물가 VAT 표기

### 4.2 주택임대차표준계약서 (코드 14)
`HouseLeaseContractInputForm` / `HouseStandardWebForm` → `HouseLeaseContractReport`

- **계약 종류**: 신규 계약 / 합의에 의한 재계약 / 계약갱신요구권 행사에 의한 갱신계약
- **임차주택의 표시**: 소재지 / 토지 지목·면적 / 건물 구조·용도·면적 / 임차할부분(면적)
- **미납 국세·선순위 확정일자 현황**: 없음 / 해당 있음 (임대인 서명 또는 날인) — 각각 체크
- **계약내용**: 보증금 / 계약금 / 중도금 / 잔금(입금계좌) / 차임(월세, 매월 N일 지불, 정액·정액 아닌 경우) / 관리비 (정액/비정액, 부가가치세 포함 여부)
- **입주 전 수리**: 수리 필요 시설 있음(수리할 내용)/없음, 공사시기·소요기간, 수리 완료 시기, 임대인부담/임차인부담
- **계약기간**: 인도일 ~ 까지 (N개월)
- **특약사항** + 추가 특약사항(별지 출력): 주택 인도받은 임차인의 전입신고·확정일자 관련 문구, 동의/미동의 체크
- **당사자**: 임대인(추가/삭제)·임차인(추가/삭제) / 공인중개사무소·공동중개사무소
- **확정일자 부여란**, 중개보수(％), 영수증 3종 즉석 발행

### 4.3 상가건물임대차표준계약서 (코드 12)
`BuildingLeaseStandardContractInputForm` / `BuildingStandardWebForm` → `BuildingLeaseStandardContractReport`

- **임차 상가건물의 표시**: 소재지 / 토지 지목·면적 / 건물 구조·용도·면적 / 임차할부분 / **환산보증금**
- **계약내용**: 보증금(총액) / 계약금 / 중도금 / 잔금 / 차임(월세, 매월 N일 지급, **부가세 포함·불포함**) / 관리비
- **관리비 세부 14항목**: 1.일반관리비 2.청소비 3.경비비 4.소독비 5.승강기유지비 6.냉난방비·급탕비 7.수선유지비 8.위탁관리수수료 9.전기료 10.수도료 11.가스사용료 12.정화조수수료 13.폐기물수수료 14.건물보험료
- **용도**: "(업종)을 위한 용도로 사용한다"
- 계약기간 / 특약사항(별지출력) / 당사자·공동중개사무소 / 영수증 3종 — 4.2와 동일 구조

### 4.4 중개대상물 확인·설명서[Ⅰ] 주거용 건축물 (코드 21-1, 2024 개정 서식)
`ConfirmExplanationInputForm1` / `ConfirmExplanationWeb1` → `ConfExp1Report`

- **머리부**: 거래 형태(매매·교환/임대) / 주택 유형(단독주택/공동주택/주거용 오피스텔/그 밖의 유형) / 확인·설명 근거자료(등기권리증·등기사항증명서·토지대장·건축물대장·지적도·임야도·토지이용계획확인서·확정일자 부여현황·전입세대확인서·국세납세증명서·지방세납세증명서·그 밖의 자료) / 대상물건 상태에 관한 자료요구사항
- **Ⅰ. 개업공인중개사 기본 확인사항**
  - ① 대상물건의 표시: 토지(소재지·면적·공부상 지목·실제이용 상태) / 건축물(전용면적·대지지분·준공년도·용도[건축물대장상/실제]·구조·방향·내진설계 적용여부·내진능력·건축물대장상 위반건축물 여부·위반내용)
  - ② 권리관계: 등기부 기재사항 — 소유권에 관한 사항(토지/건축물), 소유권 외의 권리사항 / 민간임대 등록여부(공공지원/장기일반, 임대의무기간·임대개시일) / 계약갱신 요구권 행사여부 / 다가구주택 확인서류 제출여부
  - ③ 토지이용계획·공법상 이용제한 및 거래규제: 용도지역/용도지구/용도구역, 건폐율·용적률 상한, 도시·군계획시설, 토지거래허가구역, 주택투기지역·토지투기지역·주택거래신고지역, 그 밖의 제한
  - ④ 임대차 확인사항 (신설): 확정일자 부여현황 정보(임대인 자료 제출/열람 동의), 국세 및 지방세 체납정보, 전입세대 확인서, 최우선변제금(소액임차인범위·최우선변제금액), 민간임대주택 임대보증금 보증 설명, 임차인 권리 설명
  - ⑤ 입지조건: 도로와의 관계(m×m, 포장/비포장, 접근성 용이함/불편함), 대중교통(버스/지하철, 도보 소요), 주차장(전용/공동/그 밖의 주차시설), 교육시설(초·중·고등학교 위치)
  - ⑥ 관리에 관한 사항: 경비실 유무, 관리주체(위탁관리/자체관리), **관리비 (금액 총액·부과방식[관리규약에 따라 부과/임대인이 직접 부과/그 밖의 방식]·포함 비목[전기료·수도료·가스사용료·난방비·인터넷 사용료·TV 수신료·그 밖의 비목])**
  - ⑦ 비선호시설(1km 이내): 없음/있음(종류 및 위치)
  - ⑧ 거래예정금액 등: 거래예정금액 / 개별공시지가(㎡당) / 건물(주택)공시가격
  - ⑨~⑪ 취득 시 부담할 조세: 취득세·농어촌특별세·지방교육세, 실제거래가격 신고 관련
- **Ⅱ. 개업공인중개사 세부 확인사항**: 실제 권리관계 또는 공시되지 않은 물건의 권리 사항(법정지상권·유치권·임차인 현황·가압류·체납·경공매 등 자유기술), ⑫ 벽면(균열/누수)·바닥면(깨끗함/보통임/수리필요)·도배 상태(깨끗함/도배필요), ⑬ 환경조건(일조량 풍부함/보통임/불충분, 소음·진동), ⑭ 현장안내(안내자: 개업공인중개사/소속공인중개사/중개보조원[신분고지 여부]/해당 없음)
- **Ⅲ. 중개보수 등에 관한 사항**: 중개보수(요율, 자동계산 `AgentCharge`)·실비·계, 산출내역, 부가세(일반 10%/간이 %/중개보수없음), 지급시기
- **꼬리부**: 시설물 상태(수도·전기·가스[취사용]·소방[단독경보형감지기 수량]·난방방식 및 연료공급[중앙공급/개별공급, 시설작동, 도시가스/기름/연탄 등]·승강기[양호/불량]·배수·그 밖의 시설물) — Ⅱ 서식과 공유, 당사자·중개사 서명(매도인/매수인/임대인/임차인/개업공인중개사), 기본확인서 프리셋 연동, 별지출력

### 4.5 중개대상물 확인·설명서[Ⅱ] 비주거용 건축물 (코드 21-2)
`ConfirmExplanationInputForm2` / `ConfirmExplanationWeb2` → `MediationTargetConfrimExplanation2Report`

- Ⅰ 서식과 공통 골격 (①대상물건 표시 / ②권리관계 / ③토지이용계획 / 시설물 상태 / 중개보수)
- 차이: 용도 구분 **상업용/공업용/업무용/그 밖의 경우**, ④입지조건(교육시설 없음), ⑤관리에 관한 사항, ⑥거래예정금액 등, ⑩벽면·바닥면(도배 없음), 소방시설이 **소화전/비상벨**로 대체, 환경조건(일조 등) 없음, 민간임대 등록여부·계약갱신요구권은 유지
- 세부 확인사항의 권리금 관련 언급 없음 (권리금은 별도 11 서식)

### 4.6 부동산거래계약신고서 (코드 34)
`RealStateTradeContractInputForm` / `TradeReportWebForm` → `RealStateTradeContractReport`

- **접수부**: 접수번호/접수일시/처리기간(지체없이), 시장·군수·구청장 귀하, 신고인 서명
- ① 매도인 / ② 매수인 (각 추가·삭제): 성명(법인명) / 주민(법인)등록번호 / 국적 / 체류자격(비자코드, 외국인만 기재) / 주소(법인소재지) / 거래지분 비율(분의) / 전화번호·휴대전화번호 / 외국인의 부동산등 매수용도(주거용[아파트/단독주택/그 밖의 주택]/레저용/상업용/공업용/그 밖의 용도)
- ③ 법인신고서등: 제출/별도제출/해당 없음
- ④⑤ 개업공인중개사 (추가·삭제): 성명/전화번호/상호/등록번호/사무소 소재지
- ⑥ 소재지/지목/면적 (필지 추가·삭제): 거래대상 종류(토지/건축물[유형]/토지 및 건축물, 공급계약 또는 전매[분양권/입주권, 준공전/준공후, 임대주택 분양전환]) / 소재지 / 지목 / 토지면적·토지 거래지분 / 대지권비율 / 건축물면적·건축물 거래지분
- ⑦ 계약대상 면적 / ⑧ 물건별 거래가격 (분양가격·발코니 확장 등 선택비용·추가 지급액 등·권리가격) / ⑧⑨ 총 실제거래가격(전체, 합계)
- ⑩ 종전 부동산 / ⑪ 계약의 조건 및 참고사항
- 계약 체결일 / 중도금 지급일 / 잔금 지급일
- **계약서 자료 가져오기**: 메인 계약서에서 매도인·매수인·중개사·소재지·실제거래가격 자동 인입

### 4.7 주택임대차계약신고서 (코드 49)
`HouseLeaseDeclarationInputForm` / `HouseReportWebForm` → `HouseLeaseDeclarationReport`

- ① 임대인 / ② 임차인 (각 추가·삭제): 성명(법인·단체명) / 주민등록번호 / 주소(법인·단체 소재지) / 전화번호·휴대전화번호
- ③ 임대 목적물 현황: 종류(아파트/연립/다세대/단독/다가구/오피스텔/고시원/그 밖의 주거용, 건물명·동·층·호) / ④소재지(주소) / ⑤임대면적(㎡)·방의 수(칸)
- ⑥ 신규 계약: 임대료(보증금/월차임), 계약기간, 체결일
- ⑦ 갱신 계약: 종전 임대료 → 갱신 임대료, ⑧계약갱신요구권 행사 여부(행사/미행사)
- 신고인 서명, 제출인(제출 대행 시), 공인중개사무소·공동중개사무소
- 계약서 자료 가져오기 연동

### 4.8 중개보수 영수증 + 영수증 계열 (`InvoiceForm`)
`PayReport`/`PayReportEach`, `ReceiptReport` 계열, `TaxReport`, `BalanceAccountReport`, `ManagementExpReport`

- **중개보수 영수증** (`PayReport`/`PayReportEach`): 일련번호/작성일자 / 귀하(수취) / 일금·원정(₩) / "위 금액을 아래 중개대상물에 대한 중개보수로 영수합니다" / 중개(확인)대상물 표시(소재지·거래구분·거래금액·계약일자) / 중개보수 및 실비 내역(중개보수 계) / 발행 사무소(명칭·주소·등록번호·연락처 출력 옵션) / 매도·매수측 각각 발행(Each)
- **영수증** (`ReceiptReport` 5종): 발행인 성명·주소 / 영수 금액(원정) / "상기 금액을 위 표시 부동산에 대한 (계약금/중도금/잔금)으로" / 부동산의 표시 / 지급수단(현금/수표/어음/외상미수금) / 흑백·컬러·2매 변형
- **세금계산서** (`TaxReport`): 공급자/공급받는자(등록번호·상호·대표자명·주소·업태·종목) / 품목·규격·수량·단가·공급가액·세액·비고 / 합계금액
- **정산서** (`BalanceAccountReport`): "매 매 대 금 정 산 서"(전세/월세/잔금 변형) — 매매대금 총액 / 계약금·중도금·잔금 기지급액 / 정산항목·정산금액·가감 / 융자금·장기수선충당금·전기요금 등 / 정산 합계금액
- **관리비(공과금) 정산서** (`ManagementExpReport`): 물건 소재지 / 정산기간(부터~까지) / 검침(전기 ㎾h·도시가스·상하수도 사용량) / 관리비 정산금(관리사무소 확인분) / 월 납입액 / 기타사항

### 4.9 개인정보수집이용동의서 (코드 43)
`PrivateInfoAgreeInputForm` / `PrivateWebForm` → `PrivateInfoAgreeReport`

- 개인정보 수집자: 공인중개사(사무소명 인입)
- 1. 수집 항목: 필수(고객명·주소·전화번호·휴대폰번호·주민등록번호[계약서작성시]·생년월일[계약서작성시]) / 선택(이메일)
- 2. 개인정보의 수집방법 / 3. 수집 및 이용목적(매물관리·계약서 작성·고객관리[수신이력·발신이력·계약관련 안내문자]) / 4. 보유 및 이용기간 / 5. 동의 거부권 및 거부에 따른 불이익 안내
- ①② 개인정보 제공자: 성명 + (서명) (동의/미동의), 수집일자
- 계약서 당사자 자동 인입, 계약당 N매(Orde 순번) 발행

### 4.10 현금보관증 (코드 41)
`CashReceiptInputForm` / `CashWebForm` → `CashReceipReport`

- 보관 금액(金 ~ 원정, 한글 금액 병기) / 보관 사유
- 보관자의 인적사항: 성명·상호·주소·연락처
- "상기 금액을 ~" 확인 문구, 귀하(교부 상대), 기타사항, (인)

---

## 5. 현행 카탈로그(`prisma/contract-template-catalog.ts`) 대응표

### 5.1 기존 30코드 ↔ 레거시 매핑 (커버됨)

| 현행 template code | 레거시 코드/문서 | 비고 |
|--------------------|-----------------|------|
| `base_contract` | 01/02/03/05 매매·전세·월세·연세 계약서 (`ContractWebForm`) | 물건종별 4종 × 거래 4종을 1코드로 흡수 |
| `purchase_right_contract` | 04 분양권 매매(양도) 계약서 | |
| `union_member_right_contract` | 15 조합원입주권매매계약서 | |
| `commercial_premium_contract` | 11 상가건물임대차권리금계약서 | |
| `right_transfer_contract` | 06 권리 양도 계약서 | |
| `right_succession_contract` | 06 권리 의무 승계 계약서 | |
| `standard_lease_contract` | 14 주택임대차표준계약서 | ⚠ 레거시 13 "표준임대차계약서"와 명칭 충돌 주의 (5.3 참조) |
| `commercial_standard_lease_contract` | 12 상가건물임대차표준계약서 | |
| `house_lease_contract` | 14 주택임대차계약서 (일반) | 레거시에서는 14 하나가 표준서식·일반 겸용 |
| `sublease_contract` | 03×전대 부동산 전대차 계약서 | |
| `sublease_agreement` | 38 전대차동의서 | |
| `identity` | (문서 아님 — 주민등록증 진위확인 안내 기능) | 레거시엔 별도 서식 없음 |
| `broker_explanation` | 21 확인설명서 총칭 | |
| `broker_explanation_residential` | 21-Ⅰ 주거용 (`ConfExp1Report` 2024 개정) | |
| `broker_explanation_non_residential` | 21-Ⅱ 비주거용 | |
| `broker_explanation_land` | 21-Ⅲ 토지 | |
| `broker_explanation_special` | 21-Ⅳ 입목·광업재단·공장재단 | |
| `registry_document` | (문서 아님 — 확인설명서 근거자료 항목) | |
| `real_estate_transaction_report` | 34 부동산거래계약신고서 | |
| `real_estate_transaction_cancel_report` | 35 부동산거래계약해제등신고서 | |
| `house_transaction_report` | 32 주택거래계약신고서 | |
| `lease_declaration` | 44/47/49 임대차계약신고서 계열 | 39(구)는 승계 불필요 |
| `lease_change_declaration` | 45/47 임대차계약변경신고서 | 40(구)는 승계 불필요 |
| `renewal_confirmation` | 48 계약갱신요구권행사여부확인서 | |
| `guarantee_non_enrollment_agreement` | 50 임대보증미가입임차인동의서 | |
| `guarantee_partial_enrollment_agreement` | 52 임대보증일부가입임차인동의서 | |
| `jeonse_registration_not_requested` | 51 전세권설정미요청확인서 | |
| `cash_receipt_document` | 41 현금보관증 | |
| `privacy_agreement` | 43 개인정보수집이용동의서 | |
| `broker_fee_receipt` | 중개보수 영수증 (`PayReport`/`PayReportEach`) | |

OfficePrintTemplate 시드 중 `contract_cover`(→`FrontCoverReport`), `receipt`(→`ReceiptReport` 계열), `settlement`(수수료 정산)도 부분 대응.

### 5.2 현행 카탈로그에 **없는** 레거시 문서 (갭 리스트)

| 우선순위 | 레거시 코드/문서 | 제안 template code | 근거 |
|---------|-----------------|--------------------|------|
| **높음** | 31 부동산거래위임장 (`DelegateWebForm`/`RealStateTradeProxyReport`) | `transaction_power_of_attorney` | 대리 계약 시 필수. 위임장 카테고리 자체가 현행 카탈로그에 없음 |
| **높음** | 42 전속중개계약서 (`ExclusiveWebForm`/`TransferMediationContractReport`) | `exclusive_brokerage_contract` | 공인중개사법 별지 제15호 서식. 중개의뢰 접수 흐름의 시작점 |
| **높음** | 46 주택취득자금조달및입주계획서 (`HousePlanWebForm`/`HouseFundsPlanReport`) | `house_funds_and_occupancy_plan` | 규제지역·6억 초과 매매 신고 시 법정 첨부. 33(구서식)은 승계 불필요 |
| **높음** | 04(거래구분 교환) 부동산 교환 계약서 (`ChangeWebForm`/`RealStateExchangeContractReport`) | `exchange_contract` | `base_contract`가 교환 조문(갑/을 쌍방 평가액·차액 정산)을 못 담음 |
| 중간 | 36 거래사실확인원 (`TradeFactWebForm`/`TradeFactConfirmReport`) | `transaction_fact_confirmation` | 대출·세무용 발급 요청 빈번. 인감증명 첨부 확인 문구 |
| 중간 | 37 부동산매매약정서 (`TradeAgreeWebForm`/`RealStateTradeAgreementReport`) | `pre_sale_agreement` | 토지거래허가구역 허가 전 약정. 토지 거래 사무소 필수 |
| 중간 | 13 표준임대차계약서 — 민간임대주택 특별법 (`StandardLeaseWebForm`/`StandardLeaseContractReport`) | `private_rental_standard_lease_contract` | 5.3 명칭 충돌 참조. 등록임대사업자 물건 중개 시 법정 서식 (50·51·52 동의서 세트와 한 묶음) |
| 중간 | 매매/전세/월세 대금 정산서·잔금 정산서 (`BalanceAccountReport`) | `balance_settlement_sheet` | 현행 `settlement` 프린트 템플릿은 수수료 내부 정산용. 이것은 당사자 교부용 잔금 정산서 |
| 중간 | 관리비(공과금) 정산서 (`ManagementExpReport`) | `management_fee_settlement_sheet` | 입주·퇴거일 관리비 검침 정산. 임대차 실무 빈도 높음 |
| 낮음 | 세금계산서 (`TaxReport`) | `tax_invoice` (또는 의도적 제외) | 전자세금계산서 의무화로 종이 서식 가치 낮음 — 제외 결정을 명시적으로 기록 권장 |
| 낮음 | 일반 영수증 — 계약금/중도금/잔금 (`ReceiptReport` 5종) | `payment_receipt` | `broker_fee_receipt`(중개보수)와 별개. 현행 `receipt` 프린트 템플릿을 문서 템플릿으로 승격 검토 |
| 낮음 | 계약서 표지·구비서류 체크리스트 (`FrontCoverReport`) | (현행 `contract_cover` 유지) | 당사자별 구비서류 리스트 데이터를 template data에 추가하면 동등 |
| 낮음 | 47 임대차계약신고/변경신고서 통합 서식 (`LeaseWebForm`) | (44+45로 흡수) | 현행 `lease_declaration`+`lease_change_declaration` 2코드 체제 유지 권장 |

### 5.3 매핑 주의사항

1. **"표준임대차계약서" 명칭 충돌**: 레거시 13(민간임대주택 특별법상 표준임대차계약서, 국토부 서식 — 임대사업자 의무 사용)과 14(법무부 주택임대차표준계약서)는 서로 다른 법정 서식이다. 현행 `standard_lease_contract` 시드는 법무부 서식(=레거시 14)을 인용하고 있으므로, 레거시 13은 별도 코드(`private_rental_standard_lease_contract`)가 필요하다. 13에는 임대보증금 보증(보증대상 금액) 설명, 개인정보 제3자 제공 동의 섹션이 포함되며 50·51·52 서식과 세트로 쓰인다.
2. **확인설명서 Ⅰ은 2024 개정판 기준으로 재구현**: 레거시도 주거용만 `ConfExp1Report`로 재작성했다 (④임대차 확인사항, 관리비 부과방식·비목, ⑭현장안내 신설). Ⅱ~Ⅳ는 구 리포트 유지 상태.
3. **별지(Annex) 시스템**: 레거시는 공동 당사자 초과분·긴 특약·긴 권리관계를 별지로 넘기는 출력 옵션(`AnnexedReport`, "매도인 별지출력", "특약사항 별지출력", ContractType.EXTEND=02)이 전 서식에 공통이다. 신규 문서 엔진에서 페이지 오버플로 정책으로 일반화 필요.
4. **계약서 자료 가져오기**: 모든 부속 서식(31~52)에 메인 계약서로부터 당사자·소재지·금액 자동 인입 버튼이 있다. 현행 시스템에서는 Contract → 문서 생성 시 서버측 프리필로 대응.
5. **문서 세트 규칙**: 33↔46 동시 등록 금지, 확인설명서는 계약당 1종(cboMtceClsf), 개인정보동의서·위임장은 계약당 N매(Orde 순번) — 문서 생성 밸리데이션으로 이식 필요.
6. **금액 표기 엔진**: 한글/한자 금액(壹貳參…원정) + ₩ 병기, 만/천/원 단위 선택, 공란인쇄(≠) — `ContractUtil.getContractAmount` 로직 이식 필요.
7. **주민번호 마스킹**: 계약 후 15일 경과 시 주민번호 뒷자리 자동 마스킹(`changeRegNumber`/`asteriskRegiNumber`) — 개인정보 보호 정책으로 이식 가치 있음.

---

## 6. 카테고리별 집계

| 카테고리 | 문서 수 | 목록 |
|----------|--------|------|
| 계약서 | 15 | 매매/전세/월세/연세(아파트·오피스텔·부동산·상가, 4×4를 1서식이 처리), 교환, 전대차, 분양권, 권리양도, 권리승계, 입주권, 권리금(11), 상가표준(12), 민간임대표준(13), 주택표준(14) |
| 확인설명서 | 4 | 주거용Ⅰ / 비주거용Ⅱ / 토지Ⅲ / 입목·광업재단·공장재단Ⅳ |
| 신고서·계획서 | 11 | 32, 33(구), 34, 35, 39(구), 40(구), 44, 45, 46, 47, 49 |
| 동의서 | 4 | 38 전대차, 43 개인정보, 50 임대보증미가입, 52 임대보증일부가입 |
| 확인서 | 3 | 36 거래사실확인원, 48 계약갱신요구권, 51 전세권설정미요청 |
| 위임장 | 1 | 31 부동산거래위임장 |
| 중개계약서 | 1 | 42 전속중개계약서 |
| 약정서 | 1 | 37 부동산매매약정서 |
| 영수증·보관증·세무 | 4 | 41 현금보관증, 일반 영수증(5변형), 중개보수 영수증(2변형), 세금계산서 |
| 정산서 | 2 | 매매·전세·월세·잔금 대금 정산서, 관리비(공과금) 정산서 |
| 표지·별지 | 2 | 계약서 표지(구비서류), 별지(Annex) |
| **합계** | **48종** (구서식 3종 포함) | |
