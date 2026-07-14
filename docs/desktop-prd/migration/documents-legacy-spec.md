# 문서관리(Document Management) 레거시 마이그레이션 스펙

**대상**: MySpider V2 `MySpiderMgr/DocuMngt` 모듈 → Estate ERP `contracts` 모듈 확장
**작성 기준**: 디컴파일 소스 분석 (2026-07). 원문 서식 텍스트는 복제하지 않고 구조·흐름·데이터 모델만 추출.
**독자**: 계약서/문서관리 기능을 구현할 서버(NestJS+Prisma)·프론트(React 19+TanStack) 개발자.

관련 현행 코드:
- `apps/server/src/modules/contracts/contracts.service.ts`
- `prisma/schema/crm.prisma` — `Contract`, `ContractDocumentTemplate`, `ContractDocument`, `OfficePrintTemplate`, `ContractClauseTemplate`
- `prisma/contract-template-catalog.ts` — 템플릿 30종 시드
- `apps/desktop/src/renderer/routes/_authenticated/contracts/-document-engine.ts` — A4 HTML 렌더 엔진
- `docs/desktop-prd/pages/contracts.md`, `docs/desktop-prd/legacy-gap-analysis.md`

---

## 0. 레거시 아키텍처 한눈에 보기

```
DMLS002Q1M (문서 목록 그리드)
  │  DMLS001Q01 (목록/단건 조회)   DMDS001D01 (삭제)   DMDS001U02 (제목 인라인수정)
  │  DMDS001U01 (거래신고 상태)    PMLS001Q02 (연동 일정 존재 확인)
  ▼
DMIN001I1M ─or─ DMIN001I2M   ← "문서 편집 셸" (MDI 탭 컨테이너)
  │   INI CONTRACT.Type=1 → I1M(네이티브 WinForms+RichEdit)
  │   그 외(기본)          → I2M(WebBrowser + assetmaker.co.kr/ContractForm/*.html)
  │
  │  탭[0] = 주 서식(계약서 or 단일 서식), 탭[1..n] = 부속 서식(확인설명서·위임장·신고서…)
  │
  │  공통 서비스:
  │   DMDS001Q01  계약 마스터 1건 조회 (Cntr_Type/Cntr_Clsf/Tran_Clsf/Memo/IsShare…)
  │   DMSV001Q04  계약에 포함된 서식 목록 (Orde, Cntr_Clsf, Chck_Setn_Clsf)
  │   DMSV001I01  계약 마스터 저장 (문서 봉투 + 목록 요약 컬럼)
  │   DMSV003Q01 / DMSV003I01  주 계약서 상세 로드/저장 (TPCT01M + TPCT02S + TPCT28S)
  │   DMSV002Q01 / DMSV002I01 / DMSV004I01  확인설명서 로드/저장
  │   DMSV001Q03  특약/계약조항 기본 문구 (Cntr_Part, Rider_Part)
  │   DMSV001Q05  공동중개 여부 확인 (Comm_Ofcr_Id 목록)
  │   CIDS002I01  인쇄 로그
  ▼
CommModule/print  (DevExpress XtraReport 기반 인쇄)
  PrintUtil / ReportPrint / ReportTemplateHelper / PrintPreviewForm
  report/addForm/*Report.cs (34종) + report/template/*.cs (person/offc/land 반복 블록)
```

핵심 개념: **하나의 "계약 문서"(Cntr_No)는 봉투(마스터) + 1개의 주 서식 + N개의 부속 서식 묶음**이다.
현행 Estate ERP의 `Contract`(1) + `ContractDocument`(N) 구조와 정확히 대응된다.

---

## 1. 문서 목록 화면 — DMLS002Q1M

### 1.1 조회 서비스: `DMLS001Q01`

요청 파라미터 (모두 optional, `Offc_Id`만 필수):

| 파라미터 | 의미 | 비고 |
|---|---|---|
| `Offc_Id` | 사무소 | 멀티테넌시 키 |
| `Cntr_No` | 계약번호 단건 | 저장 후 행 갱신(doInsertRow/doUpdateRow)용 |
| `Cntr_Clsf` | 계약서 종류 코드(복수, `'01','02'` IN절) | §3.2 코드표 |
| `Tran_Clsf` | 거래 구분 코드(복수) | §3.3 코드표 |
| `State_Type` | `1`/`2` — 진행중/완료 상태 필터 | INI `CONTRACT.StateType` 기본값 |
| `Union` | `Y` — 공동중개 계약만 | |
| `ShareSend` / `ShareGet` | `Y` — 내가 공유한/공유받은 계약만 | |
| `PeriodOver` | `yyyyMMdd` — 보존기간(기본 5년, INI `Period_Retention`) 경과분 | 삭제 대상 안내 |
| `Date_Clsf` | 날짜 검색 기준 컬럼 | `M.CNTR_DATE`(계약일자)/`M.INER_COST_DATE`(중도금일자)/`M.INER_COST_DATE2`(2차중도금일자)/`M.LASTCOST_DATE`(잔금일자)/`M.REGI_DATE`(등록일자) |
| `Date_From` / `Date_To` | `yyyyMMdd` | |
| `Price_Clsf` | 금액 검색 기준 | `1` 매매가 / `2` 보증금 / `3` 월차임 / `4` 융자금 |
| `Price_From` / `Price_To` | 원 단위 (UI 입력 만원 × 10000) | |
| `SearchClsf` | 텍스트 검색 기준 | `UserName` 고객명 / `PhneNo` 연락처 / `Addr` 소재지 / `OffcName` 공동중개사무소 |
| `SearchText` | 검색어 | |
| `Query` | `DocList like '%01%'` OR절 — 부속서식 포함 검색(bAddSearch) | 계약서 종류 필터 시 "부속 서식으로 포함된 문서"도 함께 찾음 |

### 1.2 목록 컬럼 (그리드 FieldName 기준)

| 컬럼 | 의미 | 특수 동작 |
|---|---|---|
| `HandleKey` | 행 식별키 | 저장 후 refocus |
| `Cntr_No`, `Offc_Id` | 계약 PK (사무소+번호 복합) | 공유 계약은 타 사무소 Offc_Id |
| `Cntr_Type` / `CNTR_TYPE_NAME` | 문서 유형 `01` 계약서 / `02` 확장 / `99` 서식 | `서식` 행은 회색 배경 |
| `Cntr_Clsf` / `CNTR_CLSF_NAME` | 계약서 종류 | `03`(부동산)이면 `Cntr_Subject` 첫 단어를 `[빌라]`처럼 병기 |
| `Cntr_Subject` | 문서 제목(예: "아파트 매매 계약서") | |
| `Subject` | 사용자 지정 제목 | 인라인 수정 대상 |
| `TRAN_CLSF_NAME` | 거래구분명 (매매/전세/월세/…) | |
| `ESTA_ADDR` | 소재지 | "…구 " 이후만 표시(축약), DOCMEMO 있으면 메모 아이콘 오버레이 + 툴팁 |
| `SELL_NAME`, `SELL_PHNE_NO` | 매도(임대)인 | `showCust` 토글로 숨김(개인정보 뷰) |
| `BUY_NAME`, `BUY_PHNE_NO` | 매수(임차)인 | 〃 |
| `COST` + `Month_Cost` | 거래금액/월세 | 만원 환산, 월세는 `5000/50` 형식, 합산 정렬 |
| `LASTCOST` | 잔금 | |
| `CNTR_DATE`, `INER_COST_DATE`, `INER_COST_DATE2`, `LASTCOST_DATE` | 계약일/중도금/2차중도금/잔금일 | 오늘=빨강, 내일=초록, 과거=회색, 미래=노랑 배경. 잔금일 경과 시 CNTR_DATE 빨간 글씨 |
| `REGI_DATE` | 등록일 | |
| `SHAREINFO` | `NONE`/`SEND`/`GET` | SEND/GET → "공유중" 표시 + 하늘색 행 |
| `DOCMEMO` | 한줄메모 | 확장뷰(`SimpleView`)에서만 컬럼 표시 |
| `MEDIATIONTYPE` / `OPNT_OFFC_NAME` | 공동중개 / 상대 사무소명 | 툴팁 |
| `TRAN_REPT_CLSF` | 거래신고 상태 | `신고예정`/`신고완료`/`해당없음`/미지정 — 상태 이미지 렌더, 클릭 시 관리 팝업 |
| `Expiry_Noti_Yn` | 만기 알림 여부 | 편집 셸에 전달 |
| `DocList` | 포함 부속서식 코드 목록 | 부속서식 검색용 |

하단 상태바: 포커스 행의 소재지 + 매도/임대인 + 매수/임차인 표시, 이름 클릭 시 CTI 전화걸기(`Common.callDialForm`).

### 1.3 행동(Actions)

- **더블클릭 / "계약서/서식 수정"** → 편집 셸 열기 (`ContractModeType.UPDATE`). `SHAREINFO != NONE`이면 읽기전용(share) 모드.
- **"계약서/서식 복사"(ShowCopyContract)** → `ContractModeType.COPY`. 자기 사무소 문서면 "계약자 정보도 복사하시겠습니까?" 확인 → `copyPerson`. 저장 시 COPY→NEW로 전환되어 새 `Cntr_No` 발급.
- **삭제(deleteSelectedContract)**:
  1. 권한 체크(`chkTaskBlock("D3")`), 편집 팝업 열려있으면 차단.
  2. 다중 선택 최대 10건 제한.
  3. 확인 다이얼로그(복구 불가 경고, 대표 Subject + "외 N건").
  4. 자기 사무소 문서만 골라 `PMLS001Q02`(Offc_Id, Cntr_No CSV)로 **연동 일정 존재 확인** → 있으면 "일정도 함께 삭제하시겠습니까?" → `Plan_Del=Y/N`.
  5. 건별 `DMDS001D01` 호출: `Offc_Id`(요청자), `Cntr_Offc_Id`(문서 소유 사무소), `Cntr_No`, `Cntr_Info`(로그용 라벨+주소), `Plan_Del`, `Regi_Id`. 공유받은 문서 삭제 = 내 목록에서만 제거되는 구조.
  6. 성공 시 사내 실시간 브로드캐스트 `MyspiderMessage.SendMessage("D3", …)`.
- **제목 인라인 수정** → 그리드 EditForm 팝업("계약서/서식 제목 변경") → `DMDS001U02` (`Offc_Id`, `Cntr_No`, `Subject`, `Regi_Id`).
- **거래신고 관리(DMLS001Q1U)** → `TRAN_REPT_CLSF` 셀 클릭. 신고예정/신고완료 라디오 + 저장 `DMDS001U01`. 공유받은 계약은 불가.
- **한줄메모(Memo)** → DOCMEMO 갱신 팝업.
- **문자보내기 / 매도·매수인 전화걸기** → CTI/SMS 연동.
- **부가 문서**: `InvoiceForm`(중개보수 영수증), `CoverForm`(계약서 표지) — 포커스 행 데이터를 시드로 사용.
- **신규 작성(ShowNewContract)** → §4.1 코드→ContractKind 매핑으로 편집 셸 오픈.
- **PeriodOverList**: 화면 진입 시(INI `CONTRACT.Popup=1`) 보존기간 경과 문서 팝업.
- 목록 컬럼 레이아웃/폭은 서버 저장(`EvrmDBSaveHelper`, layout "04/00/00").

### 1.4 현대 설계 매핑

| 레거시 | 제안 |
|---|---|
| `DMLS001Q01` 필터 | `GET /contracts` + query DSL: `kind[]`, `transactionType[]`, `status`, `isJoint`, `shareDirection(sent|received)`, `retentionOverdue`, `dateField+from/to`, `priceField+min/max`, `searchField+q`. TanStack Table 서버사이드 필터. |
| `HandleKey` refocus | mutation 후 TanStack Query cache patch + row focus |
| 날짜 셀 색상 규칙 | 오늘/내일/경과 badge — 수금 캘린더(CommissionPayment)와 동일 토큰 재사용 |
| `TRAN_REPT_CLSF` | `ContractDocument`(category=`report`)의 `status`(draft/generated/submitted)로 대체하되, 목록에 롤업 컬럼 노출 |
| `DOCMEMO` | `Contract.memo` 그대로 |
| `Plan_Del` 연동 일정 | `CalendarEvent`에 `contractId` FK(신규) → 삭제 시 cascade 여부 확인 다이얼로그 |
| `SHAREINFO` | Phase 2+ — NetworkRoom 기반 계약서 공유(신규 테이블 `ContractShare`) 또는 비범위 처리 |

---

## 2. 계약 데이터 모델

### 2.1 2층 저장 구조

**(a) 계약 마스터 — `DMSV001I01`** (문서 봉투. 목록 화면이 읽는 요약 컬럼 포함)

| 파라미터 | 의미 | 현행 매핑 |
|---|---|---|
| `Offc_Id`, `Cntr_No` | PK. `Cntr_No="0"`이면 신규 발급 후 응답으로 반환 | `Contract.id` |
| `Cntr_Type` | `01` BASIC / `02` EXTEND / `99` SIMPLE | 신규 필드 필요 (§2.5) |
| `Tran_Clsf` | 거래구분 코드 | `Contract.transactionType` |
| `Memo` | 한줄메모 | `Contract.memo` |
| `Esta_Addr` | 대표 소재지 (주 서식에서 추출 `getMasterEstaAddr()`) | property 체인에서 유도 |
| `Cntr_Info` | `[제목]주소` 로그 문자열 | ActivityLog |
| `Expiry_Noti_Yn` | 만기 알림 on/off | 신규 필드 |
| `Cost`, `Month_Cost`, `LastCost` | 목록 요약 금액(원 단위) | `totalPrice`/`monthlyRent`/`statedBalance` |
| `Cntr_Date`, `Iner_Cost_Date`, `Iner_Cost_Date2`, `LastCost_Date` | 요약 일정 | `contractDate`/`statedInterimDate`/(2차 없음)/`statedBalanceDate` |
| `Both_Tran_Cntr_Yn` | 사무소 정보 미기재(쌍방 직거래 양식) | print option |
| `Cntr_Subject` | 문서 제목 | `ContractDocument.title` |
| `Sell_Name`/`Sell_Phne_No`/`Buy_Name`/`Buy_Phne_No` | 대표 당사자(암호화 저장) | `sellerContact`/`buyerContact` |
| `Collabo_Yn` | 공동중개 여부(사무소 블록 2개 이상) | `Deal.isJointBrokerage` |
| grid `0` | 서식 목록 DataTable: `Orde`(탭 순서), `Cntr_Clsf`(서식 코드), `Subject`, `Cntr_Clsf_Orde`(동일 서식 반복 순번 — 위임장 2장 등) | `ContractDocument` rows |

**(b) 주 계약서 상세 — `DMSV003I01` / `DMSV003Q01` (`Table_Name="TPCT01M"`)**
매매/임대차 계약서(ContractInputForm 계열)의 전체 필드. 두 에디터 엔진이 **동일 파라미터 셋**으로 호출.

부동산 표시:

| 필드 | 의미 |
|---|---|
| `Esta_Addr` | 소재지 |
| `LandKind` | 지목 (코드마스터 `CC`) |
| `LandArea` | 토지 면적(m²) |
| `Grud_Silt` / `Grud_Chld` | 대지권 비율 (분모/분자 — "N분의 M") |
| `Strt_Struc` | 건물 구조 (코드 `CS`) |
| `Strt_Use` | 건물 용도 (코드 `CU`) |
| `Strt_Size` | 건물 면적(m²) |
| `Rent_Chld` / `RentArea` / `Borrow_Use` | 임대할 부분 / 임대 면적 / 임차 용도(상가만) — 임대차 전용 |

금액 (모두 **원 단위 정수로 환산 저장**. 입력 UI는 `Cost_Unit` 라디오: `03` 만 / `02` 천 / `01` 원):

| 필드 | 의미 | 적용 |
|---|---|---|
| `Sale_Cost` | 매매대금 or 보증금 | 공통 |
| `Cntr_Cost` + `Cntr_Cost_Pay_Time` | 계약금 + 지급 시기 문구 | 공통 |
| `Iner_Cost` + `Iner_Cost_Date` + `Iner_Cost_Print` | 중도금 + 일자 + 공란 인쇄 여부 | 공통 |
| `Iner_Cost2` + `Iner_Cost_Date2` + `Iner_Cost_Print2` | 2차 중도금 (매매 기본 / 임대차는 `Iner_Cost_Divi_Yn` 분납 체크 시) | |
| `LastCost` + `LastCost_Date` | 잔금 + 잔금일 | 공통 |
| `Finc_Cost` + `Finc_Cost_Prcs` + `Finc_Cost_Print` | 융자금 + 승계/말소 처리 + 공란 인쇄 | 매매만 |
| `Silt_Cost` + `Rent_Cert_Cost_Yn` + `Rent_Cert_Prcs` | 현 임차보증금 + 입력란 표시 + 승계/반환 처리 | 매매만 |
| `Mntr` + `Mntr_PreCost_Yn` + `Mntr_Pay_Day` | 월차임 + 선불/후불 + 지급일 (연세는 `일¿월` 인코딩) | 월세/연세 |
| `Rcmd_Tsmt` + `Strt_Rcmd_Tsmt` | 부가세 구분(포함/별도/포괄양도양수) + 금액 | 상가·오피스텔 매매 / 월세 |

계약 조항·일정:

| 필드 | 의미 |
|---|---|
| `Cntr_Date` | 계약 체결일 (제3자 표기일) |
| `Pass_Date` | 인도일 (매매 제2조) / 임대차 인도일 |
| `Rent_Expr_end_Date` + `Rent_Period` | 임대 만기일 + 개월수 (매매는 `99991231`) |
| `Sec_Use_Yn` | 제2조 사용 여부 (N이면 조항 자체 비움) |
| `Send_Date` | 계약서 교부일 (사무소 날짜) |
| `Cntr_Part` | 제3조~제N조 본문 조항 텍스트 (기본값은 `DMSV001Q03`에서 종류·거래구분별 로드) |
| `Rider_Part` | **특약사항 HTML** (RichEdit/SmartEditor 산출물) |
| `Rider_Part_Person_Info_Yn` | 개인정보 수집 동의 문구 자동 삽입 여부 |
| `Rider_Part_Other_print_Yn` | 특약 별지 출력 |
| `Sell_Other_print_Yn` / `Buy_Other_print_Yn` / `Ofcr_Other_print_Yn` | 매도인/매수인/중개사 별지 출력 |
| `Both_Tran_Cntr_Yn` | 중개사무소 란 비활성(직거래 양식) |
| `Plan_Yn` | 일정 연동됨 여부 (로드 시 반환) |

**(c) 당사자 그리드 — `TPCT02S`** (grid "0"): 계약서의 모든 사람+사무소 행.

| 컬럼 | 의미 |
|---|---|
| `Cntr_Clsf` | 서식 코드 (어느 서식의 당사자인지) |
| `Cntr_Stat_Clsf` | **행 역할**: `01` 매도/임대/양도/전대측, `02` 매수/임차/양수/전차측, `99` 중개사무소 |
| `Sub_Id` | 같은 역할 내 순번 (1=대표, 2+=공동) |
| `User_Name` | 성명 |
| `Ownr_Clsf` | 식별번호 유형 (코드 `80`: `01` 주민등록번호→인쇄 시 "생년월일" 대체 가능, 법인/외국인 등) |
| `Rsdt_Regi_No` | 주민/법인/등록번호 — **암호화 저장**, 잔금일 15일 경과 시 뒷자리 `******` 마스킹(`changeRegNumber`) |
| `Addr` | 주소 |
| `Phne_No` / `Mov_Phne_No` | 전화/휴대폰 — 암호화 |
| `Tran_Stak_Silt` / `Tran_Stak_Per` | 거래지분 (분모/분자) |
| `Country` | 국적 |
| `Ofcr_Offc_Name` / `Comm_Ofcr_Id` / `Rent_Regi_No` | (99행) 사무소명 / 공동중개 사무소ID / 개설등록번호 |
| `Cust_Id` | 고객 마스터 FK (연락처 연동) |
| `Number1` | 예비 암호화 필드 |

**(d) 대리인 그리드 — `TPCT28S`** (grid "1"): 당사자별 대리인 최대 2명.
`Cntr_Stat_Clsf` + `Sub_Id`(어느 당사자의) + `Idx`(1/2) + `Agent`(라벨: "대리인"/"공동대리인"/커스텀) + 인적사항 동일 구조.

**(e) 역할 라벨 규칙 — `ContractUtil.getCntrStatClsfName(Tran_Clsf, Cntr_Stat_Clsf)`**

| Tran_Clsf | 01측 | 02측 |
|---|---|---|
| 01 매매(기본) | 매도인 | 매수인 |
| 02 전세 / 03 월세 / 08 연세 | 임대인 | 임차인 |
| 04 교환 | 갑 | 을 |
| 05 전대 | 전대인 | 전차인 |
| 06 양도 / 07 승계 | 양도인 | 양수인 |
| 11 (권리금) | 임차인 | 신규임차인 |
| 37 (매매약정) | 매도약정인 | 매수약정인 |

(enum `ContractPerson`: SELLER, BUYER, LESSOR, LESSEE, GAB, EUL, SUBLESSOR, SUBLESSEE, TRANSFER, TRANSFEREE, NEWLESSEE / `ContractOffice`: DIRECT, PUBLIC)

**(f) 서식별 보조 테이블** (Table_Name 파라미터로 같은 서비스 사용):
- `TPCT19S` — 상가건물임대차표준계약서 상세
- `TPCT12S` — 주택임대차계약서(법무부 표준) 상세
- `TPCT27S` — 토지 목록(여러 필지, `ucLand` 반복: `Land_Id`, `Esta_Addr`, `Esta_LandKind`, `Esta_Size`, `Grud_perc_Silt/Chld`, `Esta_Addr_Dong/Ho`)
- `TPCT14S`/`TPCT31S`/`TPCT34S` — 임대차 신고서 계열 반복행 (주택수/융자/기간/차임/갱신)
- 확인설명서: `DMSV002I01`(본문) + `DMSV004I01`(반복 상세행)

**(g) 금액 표기 유틸** — `ContractUtil.GetHangulFromNum`/`GetHanjaFromNum`: 숫자 → 한글("일금 삼억오천만원정")/한자("參億…") 변환 + `(₩350,000,000)` 병기. enum `ContractAmountType`(HANGUL/HANJA), `ContractAmountUnit`(MAN/CHUN/WON). → document-engine에 동일 유틸 필요.

### 2.2 코드 체계 3종 (ContractType × ContractKind × ContractTradeType)

**ContractType (`Cntr_Type`)** — 문서 패밀리:

| enum | 코드 | 의미 |
|---|---|---|
| `BASIC` | `01` | 일반 계약서 (아파트/오피스텔/부동산/분양권/상가/권리 — ContractInputForm 계열, 자유 조합) |
| `EXTEND` | `02` | 규정 서식 계약서 (표준임대차/주택임대차/상가권리금/상가표준/조합원입주권 — 고정 레이아웃) |
| `SIMPLE` | `99` | 단일 서식 (위임장/신고서/동의서/영수증 등 — 종류·거래구분 콤보 잠금) |

**ContractKind (`Cntr_Clsf`)** — 33종 전체 (ContractUtil.getCntrClsf 기준):

| 코드 | enum | 명칭 | Type |
|---|---|---|---|
| 01 | APARTMENT | 아파트 | BASIC |
| 02 | OFFICE | 오피스텔 | BASIC |
| 03 | REAL_STATE | 부동산(자유 제목: 빌라/토지/단독…) | BASIC |
| 04 | PURCHASE_RIGHT | 분양권 | BASIC |
| 05 | BUSINESS_SECTION | 상가 | BASIC |
| 06 | RIGHT | 권리(양도/승계) | BASIC |
| 11 | STORE_PREMIUM | 상가건물임대차권리금계약서 | EXTEND |
| 12 | STORE_STANDARD | 상가건물임대차표준계약서 | EXTEND |
| 13 | STANDARD | 표준임대차계약서 | EXTEND |
| 14 | HOUSE | 주택임대차계약서 | EXTEND |
| 15 | UNION_ENTER | 조합원입주권매매계약서 | EXTEND |
| 21 | (확인설명서) | 중개대상물확인설명서 1~4 (`Chck_Setn_Clsf`: 1 주거용/2 비주거용/3 토지/4 입목·광업재단·공장재단) | 부속 전용 |
| 31 | PROXY | 부동산거래위임장 | SIMPLE |
| 32 | HOUSE_TRADE | 주택거래계약신고서 | SIMPLE |
| 33 | HOUSE_OPTAIN | 주택취득자금조달계획서 | SIMPLE |
| 34 | TRADE_CONTRACT | 부동산거래계약신고서 | SIMPLE |
| 35 | TRADE_CONTRACT_REMOVE | 부동산거래계약해제등신고서 | SIMPLE |
| 36 | FACT_CONFIRM | 거래사실확인원 | SIMPLE |
| 37 | TRADE_AGREEMENT | 부동산매매약정서 | SIMPLE |
| 38 | SUBLEASE | 전대차동의서 | SIMPLE |
| 39 | LEASE_CONDITION | 임대조건신고서(구) | SIMPLE |
| 40 | LEASE_CONDITION_CHANGE | 임대조건변경신고서(구) | SIMPLE |
| 41 | CASH | 현금보관증 | SIMPLE |
| 42 | TRANSFER | 전속중개계약서 | SIMPLE |
| 43 | PRIVATEINFO | 개인정보수집이용동의서 | SIMPLE |
| 44 | LEASE_CONTRACT | 임대차계약신고서 | SIMPLE |
| 45 | LEASE_CONTRACT_CHANGE | 임대차계약변경신고서 | SIMPLE |
| 46 | HOUSE_PLAN | 주택취득자금조달및입주계획서 | SIMPLE |
| 47 | LEASE | 임대차계약신고/변경신고서 | SIMPLE |
| 48 | RENEWAL | 계약갱신요구권행사여부확인서 | SIMPLE |
| 49 | HOUSE_LEASE_DECLAR | 주택임대차계약신고서 | SIMPLE |
| 50 | RENTER_AGREE | 임대보증미가입임차인동의서 | SIMPLE |
| 51 | NOT_REQUEST | 전세권설정미요청확인서 | SIMPLE |
| 52 | RENTER_AGREE2 | 임대보증일부가입임차인동의서 | SIMPLE |

부속 서식 목록은 코드마스터 `49`(사용 가능 서식) − `D9`(비활성)로 구성. BASIC은 `Sub_Cd>'10'`, 그 외 `Sub_Cd>'30'`부터 추가 가능. `33`(자금조달계획서)과 `46`(자금조달및입주계획서)은 상호 배타.

**ContractTradeType (`Tran_Clsf`)** — 거래구분 9종:

| 코드 | enum | 명칭 |
|---|---|---|
| 01 | TRADE | 매매 |
| 02 | LEASE | 전세 |
| 03 | MONTH_RENT | 월세 |
| 04 | EXCHANGE | 교환 |
| 05 | SUBLEASE | 전대 |
| 06 | TRANSFER | 양도 |
| 07 | SUCCESSION | 승계 |
| 08 | YEAR_RENT | 연세 |
| — | TRADECONTRACT / NONE | (내부용) |

**Kind별 허용 TradeType** (setComboCntrTran):
- 아파트/오피스텔/상가: 매매·전세·월세·연세
- 부동산: 매매·전세·월세·연세·교환·전대
- 분양권/조합원입주권: 매매
- 권리: 양도·승계
- 권리금/상가표준/표준임대차/주택임대차: 전세·월세

**주 서식 폼 라우팅** (loadContractInputForm — Kind×Trade → 폼):
- APARTMENT/OFFICE/REAL_STATE/BUSINESS_SECTION × 매매·전세·월세·연세 → `ContractInputForm` (단일 폼, 라벨/패널 가변)
- REAL_STATE × 교환 → `ChangeContractInputForm`, × 전대 → `SubleaseContractInputForm`
- PURCHASE_RIGHT → `SalesRightContractInputForm`
- RIGHT × 양도 → `TransferContractInputForm`, × 승계 → `SuccessionContractInputForm`
- STORE_PREMIUM/STORE_STANDARD/STANDARD/HOUSE/UNION_ENTER → 각 전용 폼(코드 11~15와 동일)

### 2.3 ShowNewContract 메뉴 코드 → Kind 매핑 (목록 상단 신규 메뉴)

`01`→아파트(매매) `02`→오피스텔 `03`→부동산 `04`→분양권 `05`→상가 `06`→권리(양도), `11`~`15`→EXTEND 5종, `31`~`52`→SIMPLE (코드 = Cntr_Clsf 동일). 옵션 `sTrade` 인자로 거래구분 지정.

### 2.4 저장 트랜잭션 순서 (SaveClick)

1. (검증) 확인설명서 금액란 소수점 검사(`checkCostItem` — 원 단위 강제).
2. COPY 모드면 NEW로 전환 + `Cntr_No="0"`, `Offc_Id`=내 사무소.
3. `saveContractMaster()` = `DMSV001I01` → 신규면 응답에서 `Cntr_No` 수신.
4. `saveContract()` = 탭 순서대로 각 서식의 `saveContract`/`saveForm` 호출 (각각 `DMSV003I01`/`DMSV002I01`/… — **서식별 개별 트랜잭션**, 원자성 없음 ← 현대판은 단일 트랜잭션으로 개선).
5. 저장 성공 → `Link_Schedule` INI에 따라 **일정 자동 연동** `savePlan()`: `PlanType.Contract`(계약일)/`InterimDeposit`/`InterimDeposit2`/`Remind`(잔금)/`Expiry`(임대만기, 임대차만) 5종 일정 upsert. 금액 문자열 + 매도·매수 연락처 + 공동중개 사무소 정보 포함.
6. 실시간 알림 `MyspiderMessage.SendMessage("D1"/"D2")` + 목록 행 갱신.
7. "다른저장(SaveAsClick)" = 항상 NEW로 새 `Cntr_No` 발급 (사본 저장).
8. 닫기 시 미저장 변경 감지(`enableSaveButton` dirty tracking — 모든 에디터에 EditValueChanging 후킹) → 저장 확인.

### 2.5 Prisma 매핑 제안

기존 `Contract`(Deal 1:1, 정산·수금의 근거)는 유지하고, **문서 편집 payload는 `ContractDocument.metadata.documentEngine.fields`(JSONB)에 저장**하는 현행 방향을 유지하되 다음을 보강한다.

```prisma
// 신규: 문서 묶음(레거시 Cntr_No 봉투)이 Deal 없이도 존재 가능해야 함
model ContractDocument {
  // ... 기존 필드 유지
  contractId String? @map("contract_id") @db.Uuid   // ← nullable로 완화 (Deal 없는 단독 서식)
  kind       String?                                  // 레거시 Cntr_Clsf 대응 (base/standard_lease/...)
  sortOrder  Int      @default(0) @map("sort_order")  // 레거시 Orde (묶음 내 탭 순서)
  kindOrder  Int      @default(1) @map("kind_order")  // 레거시 Cntr_Clsf_Orde (같은 서식 반복 순번)
}

// 신규: 계약서 당사자 (TPCT02S/TPCT28S 대응)
model ContractParty {
  id           String  @id @default(uuid()) @db.Uuid
  officeId     String  @map("office_id") @db.Uuid
  contractId   String  @map("contract_id") @db.Uuid
  side         String  // "one"(01: 매도/임대측) | "two"(02: 매수/임차측) | "office"(99)
  subId        Int     @default(1)          // 공동 당사자 순번
  role         String? // 표기 라벨 override ("갑", "전대인" 등은 transactionType에서 유도)
  name         String
  idType       String? @map("id_type")      // Ownr_Clsf: resident/corporate/foreign/birth
  idNumber     String? @map("id_number")    // 암호화 필수 (레거시 동일)
  address      String?
  phone        String?
  mobilePhone  String? @map("mobile_phone")
  sharePercent String? @map("share_percent") // 거래지분 "N분의 M"
  country      String?
  contactId    String? @map("contact_id") @db.Uuid // Contact 연동 (레거시 Cust_Id)
  // 대리인: 자기참조
  parentId     String? @map("parent_id") @db.Uuid  // null=본인, 값=이 당사자의 대리인
  agentLabel   String? @map("agent_label")          // "대리인"/"공동대리인"
  // 사무소 행(side=office) 전용
  officeName   String? @map("office_name")
  officeRegNo  String? @map("office_reg_no")
  partnerOfficeId String? @map("partner_office_id") @db.Uuid // 공동중개 Comm_Ofcr_Id
  @@index([officeId, contractId])
  @@map("contract_parties")
}
```

- 금액: 레거시는 원 단위 저장 — Estate ERP 규약(만원 `Int`)에 맞춰 **만원 단위로 통일**, 입력 단위 토글(만/천/원)은 UI 상태로만.
- `Rider_Part`(특약 HTML)는 `ContractDocument.metadata.fields.specialTerms`(현행) 유지하되 rich text(HTML) 허용으로 확장.
- 2차 중도금(`Iner_Cost2`)은 `Contract`에 `statedInterimPayment2`/`statedInterimDate2` 추가 또는 `metadata` 필드로 흡수 — 권장: metadata (인쇄 전용 개념).
- 주민번호 마스킹 규칙(잔금일+15일 후 조회 시 `******`)은 서버 read-path 정책으로 이식.

---

## 3. 두 에디터 엔진 — DMIN001I1M vs DMIN001I2M

### 3.1 공통 구조 (거의 동일한 셸)

- MDI 탭 컨테이너: 탭[0]=주 서식, "서식추가" 드롭다운으로 부속 서식 탭 추가.
- 상단 콤보 3개: 계약서 종류(`cboCntrClsf`) / 제목(`cboCntrSubject`, 코드마스터 45 + 직접입력) / 거래구분(`cboCntrTran`) + 확인설명서 유형(`cboMtceClsf`).
- 우측 링크 패널(WebBrowser, myspider.net ContractLink 페이지 — 부가 서비스 광고/바로가기).
- 버튼: 저장 / 다른저장 / 미리보기 / 인쇄(+매수 `cboCopies`) / 공유(`btnShare` — 공동중개 상대가 있을 때만, `DMSV001Q05`로 확인) / 닫기.
- 옵션: 한줄메모(`txtMemo`), 만기알림 해제(`chkNoNotice`).
- dirty tracking: 모든 입력 컨트롤에 change 이벤트 후킹(`setFormControlEditValueChangeEvent`) → 저장 버튼 활성화. 공유받은(share) 문서는 전 컨트롤 ReadOnly.
- 로드 시퀀스: `DMDS001Q01`(마스터) → `DMSV001Q04`(서식 목록) → 탭 재구성 → 각 폼 `loadSavedData`.

### 3.2 차이점

| | DMIN001I1M | DMIN001I2M |
|---|---|---|
| 렌더러 | 네이티브 WinForms + DevExpress `RichEditControl`(특약) | `WebBrowser`(IE) + 원격 HTML 폼 (`http://assetmaker.co.kr/ContractForm/MainContract.html` 등) + SmartEditor |
| 서브폼 | `*InputForm` 27종 | `*WebForm` 27종 (1:1 대응) |
| 폼 데이터 수집 | 컨트롤 직접 접근 | `doc.InvokeScript("getFormData","mainForm")` → Base64 JSON → Dictionary |
| 특약 HTML | RichEdit → HTML 변환 | `getHTML` JS 호출 |
| 인쇄 | 동일 (XtraReport — 폼에서 값을 뽑아 리포트 파라미터/테이블 채움) | 동일 |
| 선택 조건 | INI `CONTRACT.Type=1` (또는 Debug) | **기본값** |

즉 I2M은 "서식 UI를 서버 배포 HTML로 외부화"한 버전이고, I1M은 오프라인/폴백용 네이티브 버전. **저장·로드 서비스와 파라미터 셋은 완전히 동일**(DMSV003Q01/I01, 필드명까지 일치 — HTML input name = 네이티브 컨트롤명). 이것이 곧 "폼 정의는 데이터, 엔진은 하나"라는 마이그레이션 논거다.

### 3.3 현대 설계: 단일 데이터 주도 문서 에디터

1. **폼 스키마 = 데이터**: `ContractDocumentTemplate.metadata.documentEngine`에 `fieldGroups`(필드 키/라벨/타입/조건부 표시 규칙)를 서식별로 시드. 현행 `-document-engine.ts`의 하드코딩된 공통 `getContractDocumentEngineFieldGroups()`를 "템플릿 메타데이터 우선, 공통 폴백" 구조로 확장.
2. **조건부 렌더 규칙**을 스키마에 포함: 레거시의 Kind/TradeType별 가변 로직(§4.1)을 `visibleWhen: { transactionType: ['sale'] }` 같은 선언으로 이식.
3. **탭 묶음** = `Contract` 상세 화면의 문서 리스트(이미 존재). 레거시 "서식추가" = `ContractDocument` 추가 + 템플릿 선택(이미 존재). 부족한 것은 **문서 간 값 승계**(주 계약서의 주소·당사자·금액을 부속 서식 기본값으로 주입 — 레거시는 `getMainContractInfo()`가 TPCT01M/02S/28S를 부속 폼에 전달) → draft 빌더에 `contract` + "primary document fields"를 함께 넘기는 구조로 구현.
4. **에디터 1개**: React 폼(필드 그룹 아코디언) + 우측 A4 라이브 프리뷰. WebBrowser/RichEdit 이원화는 제거. 특약만 rich text 에디터(TipTap 등) 허용.

---

## 4. 주요 서식 필드 그룹 (구현용)

### 4.1 매매/임대차 계약서 (ContractInputForm — BASIC 4종 공통)

제목: `{종류|제목} {매매|전세|월세|연세} 계약서`. 도입문·1조 라벨은 Kind/Trade별 문구 치환(initContractLabels).

**그룹 1. 부동산의 표시**
- 소재지(`Esta_Addr`), 토지: 지목(`LandKind`)·대지권 `Grud_Silt`분의`Grud_Chld`·면적(`LandArea`)㎡
- 건물: 구조(`Strt_Struc`)·용도(`Strt_Use`)·면적(`Strt_Size`)㎡
- 임대차 시 추가: 임대할 부분(`Rent_Chld`)·임대 면적(`RentArea`)㎡·(상가) 임차 용도(`Borrow_Use`)
- `REAL_STATE`+제목에 "토지" 포함 시 건물 행 숨김

**그룹 2. 계약내용 — 금액 스케줄** (단위 라디오: 만/천/원, 한글·한자 병기 자동 생성)
- 매매: 매매대금(`Sale_Cost`) / (선택) 현 임차보증금(`Silt_Cost`+승계·반환 콤보) / 융자금(`Finc_Cost`+승계·말소 콤보+공란인쇄) / (상가·오피스텔) 부가세 구분+금액
- 임대차: 보증금(`Sale_Cost`) / 월세·연세(`Mntr`, 선불·후불, 지급일, 연세는 지급월)
- 공통 스케줄: 계약금(`Cntr_Cost`+지급시기) → 중도금(`Iner_Cost`+일자) → (분납 체크 시) 2차 중도금 → 잔금(`LastCost`+일자)
- 편의 버튼: 인도일 +1월/+2월/+3월, 잔금일 자동, 개월수(`Rent_Period`)↔만기일 양방향 계산(setRentMonth)

**그룹 3. 조항**
- 제2조(인도/임대 기간): 매매 인도일(`Pass_Date`) / 임대차 인도일+만기일(`Rent_Expr_end_Date`)+개월수. `Sec_Use_Yn`으로 비활성 가능
- 제3조~: 본문 조항 텍스트(`Cntr_Part`) — 기본 문구는 `DMSV001Q03` 서식·거래구분별 로드, 사무소 커스텀 가능(ContractComment 팝업의 "문구 가져오기/등록")

**그룹 4. 특약사항** (`Rider_Part`, HTML)
- rich editor + "특약 가져오기/등록"(사무소 특약 라이브러리 = 현행 `ContractClauseTemplate`) + 개인정보 동의 문구 자동 삽입 체크 + 별지 출력 체크 + 인쇄 줄수 초과 감지(`checkOverLine`) 시 별지 유도

**그룹 5. 당사자** (ucPerson × N + ucOffc × N)
- 매도(임대)인 블록 / 매수(임차)인 블록: 성명, 식별유형(`Ownr_Clsf`), 번호(`Rsdt_Regi_No`), 주소, 전화, (확장) 휴대폰·국적·거래지분. "공동○○인 추가/삭제" 버튼, 각 당사자당 대리인 1~2명 토글
- 중개사무소 블록: 내 사무소 자동 채움(대표자/등록번호/주소/전화 — 분사무소 대표 전환 콤보), "공동중개 추가" → 상대 사무소 검색(`Comm_Ofcr_Id` 연결 — 공유 기능의 전제)
- 별지 출력 체크(매도측/매수측/중개사) + 교부일(`Send_Date`)
- 고객 연동: 당사자 입력 시 Contact 검색·연결(`Cust_Id`), 영수증(getContractReceiptInfo) 생성 시 재사용

**그룹 6. 부가 액션**: 영수증 발행(계약금/중도금/2차/잔금별), 신분증 스캔(btnIDCard), 주택임대차 신고 바로가기(btnRentHome), 임대료 인상 계산기(임대차).

### 4.2 중개대상물확인설명서 (ConfirmExplanationInputForm1 — 주거용 기준)

법정 서식 구조 그대로 3부 15항목 (비주거용/토지/입목·재단은 항목 부분 변형):

- **Ⅰ. 개업공인중개사 기본 확인사항**
  - ① 대상물건의 표시 (토지/건축물: 소재지·면적·지목·용도·구조·건축년도·방향·내진설계 등)
  - ② 권리관계 (등기부 기재사항 — 소유권·소유권 외 권리. "반드시 등기부 기재 내용 입력" 경고)
  - ③ 토지이용계획·공법상 이용제한 및 거래규제 (용도지역/지구/구역, 건폐율·용적률, 거래규제)
  - ④ 임대차 확인사항 (확정일자 부여현황, 국세·지방세 체납, 전입세대, 최우선변제금, 민간임대 등록, 계약갱신요구권 — `☞ 계약갱신요구권행사여부확인서 다운로드` 연동)
  - ⑤ 입지조건 (도로·접근성·대중교통·주차장·교육시설)
  - ⑥ 관리에 관한 사항 (경비실, 관리주체, 관리비)
  - ⑦ 비선호시설(1km 이내)
  - ⑧ 거래예정금액 등 (거래예정금액, 개별공시지가, 건물공시가격)
  - ⑨ 취득 시 부담할 조세 (취득세·농어촌특별세·지방교육세 — 재산세/종부세 6/1 기준 안내)
- **Ⅱ. 개업공인중개사 세부 확인사항**
  - ⑩ 실제 권리관계 또는 공시되지 않은 물건의 권리 사항 (의뢰인 고지사항 서술)
  - ⑪ 내부·외부 시설물의 상태 (수도·전기·가스·소방(단독경보형감지기)·난방(개별공급 시 사용연한)·승강기·배수 등)
  - ⑫ 벽면·바닥면 및 도배 상태
  - ⑬ 환경조건 (일조량·소음·진동)
  - ⑭ 현장안내 (안내자, 동행 여부)
- **Ⅲ. 중개보수 등에 관한 사항**
  - ⑮ 중개보수·실비 금액과 산출내역 (요율 협의 + 부가세 별도 안내)
- 당사자·중개사 서명란 (계약서와 동일 TPCT02S 재사용), 별지출력 옵션

저장: `DMSV002I01`(+반복행 `DMSV004I01`), 금액은 **원 단위 강제**(저장 전 소수점 검증). 유형 전환은 `Chck_Setn_Clsf`(1~4)로 저장되어 재오픈 시 해당 폼 로드.

→ 마이그레이션: 항목①~⑮를 `fieldGroups` 스키마로 시드(주거용/비주거용/토지/특수 4종 변형). 공적장부 발급 모듈(등기부·건축물대장·토지이용계획)과 ②·③ 자동 채움 연계는 Phase 2 확장 포인트.

### 4.3 SIMPLE 서식 공통 패턴

모든 SIMPLE 폼은 `setCntrNo(offcId, cntrNo, mode)` + `saveForm(cntrNo[, kindOrder])` + `getEstaAddr()` + `showPrintPreview()` 4개 인터페이스로 통일되어 있음 → 현대판 "템플릿 코드 → draft 빌더 → 프리뷰" 제네릭 파이프라인(현행 document-engine)과 동형. 위임장(31)·자금조달계획서(33/46)·개인정보동의서(43)·임대차신고서(47)는 같은 묶음에 **여러 장 반복 가능**(`Cntr_Clsf_Orde`) — 현행 모델에 반복 순번 필드 추가 필요(§2.5).

---

## 5. 인쇄/리포트 시스템

### 5.1 레거시 파이프라인

1. 각 입력폼의 `showPrintPreview()`가 서식별 `XtraReport` 서브클래스(34종, `report/addForm/*Report.cs` + 루트 7종) 인스턴스 생성.
2. 값 주입 3방식:
   - `PrintUtil.setParameter(report, "parameterN", editControl)` — 스칼라 필드
   - `PrintUtil.setCellValue / setContractAmount(XRTable, cellName, …)` — 고정 표 셀
   - `ReportTemplateHelper.setPersonInfo/setOffcInfo/setLandInfo(...)` — **반복 블록**: `template/person.cs`·`offc.cs`·`land.cs` 등의 XRTable 조각을 Y좌표 누적하며 스택 (공동 당사자/대리인/필지 수만큼)
3. 조립 규칙: 한글·한자 금액 병기, 별지 출력 시 본문에는 "별지출력" 플레이스홀더 행, 특약 줄수 초과 감지, 잔금일+15일 주민번호 마스킹, 복호화(`Common.Decrypt`)는 인쇄 직전.
4. `ReportPrint.showPrintPreview()` → `PrintPreviewForm`(미리보기 + PDF 등 Export, 계약 문서는 `bExport=true`) 또는 `showPrint()` → 프린터 다이얼로그. 양면 인쇄 옵션(INI `Duplex`), 매수(`Copies`), 인쇄 비밀번호(`PrintPswdYn`).
5. 인쇄 완료 시 `CIDS002I01` 인쇄 감사 로그 (Target="계약", Target_Id=Cntr_No, Task="인쇄").
6. 부가 출력물: `etcForm/` — 영수증 5종 변형(Receipt*), 표지(FrontCoverReport), 정산(BalanceAccountReport/PayReport), 세금(TaxReport).

### 5.2 현대 매핑 (document-engine.ts 확장)

| 레거시 | 현대 |
|---|---|
| XtraReport 서브클래스 | A4 HTML 섹션 렌더 (`getContractDocumentEngineSections`) + `window.print()` — 방향 유지 |
| parameter/cell 주입 | `fields` 병합(default ← template.metadata ← document.metadata) — 이미 구현됨 |
| person/offc/land 반복 블록 | **미구현** — sections에 배열 행(공동 당사자 N명, 대리인, 공동중개 사무소 N개, 필지 N개) 렌더 추가 필요 |
| 한글/한자 금액 병기 | `formatManwon`만 존재 — `GetHangulFromNum` 동등 유틸 이식 필요 ("금 삼억원정(₩300,000,000)") |
| 별지 출력 | 페이지 분리 렌더 옵션 (`pageBreak` + 별지 섹션) |
| 특약 줄수 초과 감지 | A4 높이 측정 → 별지 전환 제안 (CSS 페이지 분할 측정) |
| 인쇄 로그 CIDS002I01 | ActivityLog(action=`print`, entityType=`ContractDocument`) |
| PrintPreviewForm Export | 브라우저 print-to-PDF 우선, 서버 사이드 PDF(Playwright)는 Phase 2 |
| 영수증/표지/정산 출력 | `OfficePrintTemplate`(type=receipt/contract_cover/settlement) 기반 렌더 — 시드는 있으나 렌더러 미구현 |
| 양면/매수/인쇄 비밀번호 | 브라우저 print 다이얼로그 위임 (비범위) |

---

## 6. 갭 리스트 — 레거시 문서관리 vs 현행 contracts 모듈

| # | 갭 | 심각도 | 비고 |
|---|---|---|---|
| G1 | **Deal 없는 단독 서식 작성 불가** — 레거시는 문서관리가 독립 진입점(전화 오면 위임장부터 쓰는 흐름). 현행은 `Contract`가 Deal 1:1 필수 + 당사자 Contact 필수 | 높음 | `ContractDocument.contractId` nullable화 또는 "빠른 서식" 경로 신설 |
| G2 | **당사자 모델 부재** — 공동 매도/매수인 N명, 당사자별 대리인 1~2명, 공동중개 사무소 N개, 식별번호 유형·거래지분. 현행은 buyer/seller Contact 2명뿐 | 높음 | `ContractParty` 신설 (§2.5) |
| G3 | **서식별 필드 스키마 부재** — 현행 fieldGroups는 전 서식 공통 6그룹(제네릭 텍스트). 부동산 표시(지목/구조/용도/대지권), 금액 스케줄(융자금·현임차보증금·부가세·2차중도금·선불후불), 확인설명서 ①~⑮가 없음 | 높음 | 템플릿 metadata에 서식별 fieldGroups 시드 + 조건부 표시 규칙 |
| G4 | **개인정보 보호 체계 부재** — 주민번호 암호화 저장, 잔금+15일 마스킹, 고객정보 컬럼 토글, 인쇄 비밀번호 | 높음 | 서버 암호화 + read-path 마스킹 정책 |
| G5 | **금액 한글/한자 표기** 미구현 | 중간 | 유틸 이식 (documents-engine) |
| G6 | **일정 자동 연동 없음** — 계약금/중도금/잔금/만기 5종 CalendarEvent 자동 생성 + 삭제 시 연동 삭제 확인 | 중간 | CalendarEvent에 contractId FK. CommissionPayment 수금일과도 정합 |
| G7 | **문서 목록 필터 축소** — 날짜기준 5종/금액기준 4종/텍스트기준 4종/보존기간 경과/공동중개 필터 부재 | 중간 | GET /contracts 쿼리 확장 |
| G8 | **복사/다른저장 없음** — 계약서 복사(+당사자 포함 여부), Save-As | 중간 | duplicate API |
| G9 | **거래신고 상태 추적 약함** — 신고예정/완료/해당없음 + 목록 롤업. 현행 ContractDocument.status로 표현 가능하나 UI 없음 | 중간 | |
| G10 | **인쇄 반복 블록/별지/페이지 제어 미구현** (§5.2) | 중간 | |
| G11 | **특약·조항 라이브러리 연동 미완** — `ContractClauseTemplate` 모델·시드는 있으나 에디터에서 "가져오기/등록" 흐름 없음. 서식·거래구분별 기본 본문(`DMSV001Q03` 대응)도 자동 주입 안 됨 | 중간 | |
| G12 | **문서 간 값 승계 없음** — 주 계약서 → 부속 서식(확인설명서·위임장·신고서) 기본값 자동 채움 | 중간 | draft 빌더 확장 |
| G13 | **계약서 공유(사무소 간)** — ContractShare/SHAREINFO/읽기전용 모드 | 낮음 | Phase 2+, 공동중개 네트워크와 통합 설계 |
| G14 | **영수증/표지 출력물 렌더러 없음** (시드만 존재) | 낮음 | |
| G15 | **인쇄 감사 로그 없음** | 낮음 | ActivityLog 확장 |
| G16 | **같은 서식 반복(위임장 2장 등) 순번 관리** | 낮음 | `kindOrder` 필드 |
| G17 | **연세(YEAR_RENT)·교환·전대·양도·승계 거래구분 미지원** — 현행 transactionType은 sale/jeonse/monthly 3종 | 중간 | shared enum 확장 여부 결정 필요 (계약 문서 레벨에서만 확장하고 Listing은 3종 유지 권장) |

---

## 7. 단계별 작업 분해

### Phase M1 — 데이터 모델·서식 스키마 기반 (서버)
1. `ContractParty` 모델 추가 + 암호화 필드 처리(주민번호/전화) + 마스킹 read 정책 (G2, G4)
2. `ContractDocument`에 `kind`/`sortOrder`/`kindOrder` 추가, `contractId` nullable 검토 (G1, G16)
3. shared enum: `ContractDocumentKind`(33종 중 1차 지원 셋), 거래구분 확장안 확정 (G17)
4. 템플릿 시드 확장: 서식별 `documentEngine.fieldGroups`(§4.1 매매/임대차, §4.2 확인설명서 주거용부터) + 조건부 표시 규칙 스키마 (G3)
5. `GET /contracts` 필터 확장 + 목록 응답에 요약 컬럼(잔금일·거래신고 상태·문서 수) (G7, G9)

### Phase M2 — 편집기 (데스크톱)
1. document-engine: 서식별 fieldGroups 로딩(템플릿 메타 우선) + 조건부 렌더 + 당사자 배열 편집 UI(공동/대리인/공동중개 추가·삭제) (G2, G3)
2. 금액 입력 UX: 단위 토글(만/천/원), 한글 병기 실시간 표시, 스케줄(계약금→중도금→2차→잔금) + 날짜 편의 버튼(+1/2/3월, 개월수↔만기 계산) (G5)
3. 특약 rich text + `ContractClauseTemplate` 가져오기/등록, 서식·거래구분별 기본 본문 자동 주입 (G11)
4. 주 서식 → 부속 서식 값 승계 draft 빌더 (G12)
5. 복사/다른저장 (G8)

### Phase M3 — 출력·연동
1. A4 렌더 반복 블록(당사자/사무소/필지) + 별지 출력 + 페이지 초과 감지 (G10)
2. 한글/한자 금액, 주민번호 마스킹 인쇄 규칙 (G4, G5)
3. 일정 자동 연동(5종 CalendarEvent) + 삭제 연동 확인 (G6)
4. 인쇄 ActivityLog (G15)
5. 영수증(계약금/중도금/잔금별)·표지 렌더러 — `OfficePrintTemplate` 소비 (G14)

### Phase M4 — 확장 (Phase 2 제품 로드맵과 정렬)
1. 확인설명서 비주거용/토지/특수 변형 + 공적장부 자동 채움 연계
2. 거래신고 워크플로(신고예정 알림 → 신고완료) — Rule Engine 연동
3. 계약서 공유(공동중개 네트워크 통합) (G13)
4. 서버사이드 PDF 생성 + S3 보관(`ContractDocument.fileUrl`)
5. 보존기간 경과 문서 안내(PeriodOverList 대응 — Proposal 큐로)

---

## 부록 A. 레거시 서비스 ID 레퍼런스

| Service | 역할 |
|---|---|
| `DMLS001Q01` | 문서 목록/단건 조회 |
| `DMDS001Q01` | 계약 마스터 1건 조회 (편집 셸 진입) |
| `DMDS001D01` | 계약 삭제 (`Plan_Del` 일정 연동 삭제 포함) |
| `DMDS001U01` | 거래신고 상태 변경 |
| `DMDS001U02` | 제목(Subject) 변경 |
| `DMSV001I01` | 계약 마스터 저장 (+서식 목록 grid) |
| `DMSV001Q03` | 서식·거래구분별 기본 본문/특약 문구 |
| `DMSV001Q04` | 계약 내 서식 목록 |
| `DMSV001Q05` | 공동중개 사무소 확인 (공유 버튼 활성 조건) |
| `DMSV002Q01` / `DMSV002I01` / `DMSV004I01` | 확인설명서 로드/저장/반복행 |
| `DMSV003Q01` / `DMSV003I01` | 서식 상세 로드/저장 (Table_Name: TPCT01M/12S/19S/…) |
| `PMLS001Q02` | 계약 연동 일정 존재 확인 |
| `CIDS002I01` | 인쇄 감사 로그 |

## 부록 B. 레거시 테이블 레퍼런스

| 테이블 | 내용 |
|---|---|
| `TPCT01M` | 주 계약서 상세 (부동산 표시 + 금액 스케줄 + 조항 + 인쇄 옵션) |
| `TPCT02S` | 당사자 (01 매도측 / 02 매수측 / 99 사무소, Sub_Id 순번) |
| `TPCT28S` | 대리인 (당사자별 Idx 1~2) |
| `TPCT27S` | 필지 목록 (다필지 토지) |
| `TPCT12S` | 주택임대차계약서 상세 |
| `TPCT19S` | 상가건물임대차표준계약서 상세 |
| `TPCT14S`/`TPCT31S`/`TPCT34S` | 임대차 신고서 계열 반복행 |
