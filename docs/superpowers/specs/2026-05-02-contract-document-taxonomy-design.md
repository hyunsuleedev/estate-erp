# 계약 문서 종류 코드표 및 저장 구조 설계

## 목적

마이스파이더 V2의 `DocuMngt` 구조를 참고해 estate-erp의 계약 문서 체계를 정리한다.
이번 문서는 구현 전 설계 기준이다. 핵심 목표는 다음 세 가지다.

- 계약별 필요 문서 목록을 안정적으로 계산한다.
- 규격 문서는 문서별 상세 필드를 구조화한다.
- 표지, 영수증, 정산서, 특약 문구처럼 반복 재사용되는 출력물은 사무소별 양식으로 관리한다.

## 마이스파이더에서 확인한 구조

마이스파이더는 계약 문서를 다음 네 층으로 관리한다.

1. 계약 마스터
   - 저장 호출: `DMSV001I01`
   - 주요 값: `Cntr_No`, `Cntr_Type`, `Tran_Clsf`, `Cntr_Info`, `Esta_Addr`, `Cost`, `Month_Cost`, `LastCost`, `Cntr_Date`, `Sell_Name`, `Buy_Name`, `Collabo_Yn`, `Memo`

2. 계약에 열린 문서 목록
   - 주요 값: `Orde`, `Cntr_Clsf`, `Subject`, `Cntr_Clsf_Orde`
   - `Cntr_Clsf`는 문서 종류 코드다.
   - `Tran_Clsf`는 거래구분 코드다.

3. 문서별 상세 저장
   - 일반 패턴: `DMSV003I01` 저장, `DMSV003Q01` 조회
   - 각 폼은 `Table_Name`으로 실제 저장 테이블을 지정한다.
   - 예: `TPCT01M`, `TPCT12S`, `TPCT18S`, `TPCT36S`

4. 사무소별 재사용 양식
   - 저장/조회: `DMSV005I01`, `DMSV005Q01`
   - `TBName`으로 양식 종류를 지정한다.
   - 예: `TPCTS4S` 영수증, `TPCTS6S` 잔금 정산서, `TPCTS8S` 계약서 표지

보조 공통 테이블도 있다.

- `TPCT02S`: 계약 당사자
- `TPCT28S`: 추가 당사자, 대리인, 공동명의 쪽
- `TPCT27S`: 토지/물건 목록 계열

중개대상물 확인설명서는 별도 패턴이다.

- 저장 호출: `DMSV002I01`
- 조회 호출: `DMSV002Q01`
- 분류 값: `Chck_Setn_Clsf`
- 확인된 분류: `1` 주거용, `2` 비주거용, `3` 토지, `4` 입목/광업재단/공장재단 계열

## estate-erp 저장 원칙

마이스파이더의 구조를 그대로 복제하지 않고, 다음 원칙으로 재설계한다.

1. `Contract`는 계약 마스터다.
   - 계약일, 거래유형, 금액, 당사자, 임대기간, 특약 같은 공통 계약 정보를 보관한다.

2. `ContractDocumentTemplate`은 문서 종류/필수 여부/순서 정의다.
   - 출력 양식이 아니다.
   - 마이스파이더의 `Cntr_Clsf` 문서 목록 역할에 가깝다.
   - 일단 DB로 유지한다. 나중에 사무소별 커스텀이 불필요하면 코드 enum으로 낮출 수 있다.

3. `ContractDocument`는 계약별 실제 문서 인스턴스다.
   - 생성, 업로드, 서명, 제출, 보관 상태와 파일 URL을 관리한다.

4. 핵심 규격 문서는 문서별 상세 테이블을 둔다.
   - 법적 의미가 크고, 검색/검증/자동화가 필요한 문서는 JSON만으로 처리하지 않는다.

5. 표지, 영수증, 정산서, 문구는 사무소별 재사용 양식으로 둔다.
   - `ContractDocument.metadata`는 출력 당시 스냅샷이나 작은 옵션에만 쓴다.

## 문서 종류 코드표

| estate code | 이름 | 마이스파이더 근거 | 저장 분류 | 추천 상세 모델 |
| --- | --- | --- | --- | --- |
| `base_contract` | 일반 매매/전세/월세 계약서 | `Cntr_Clsf` 01~06 + `Tran_Clsf` 01~07, `TPCT01M` | 규격 문서 | `ContractAgreementDetail` |
| `purchase_right_contract` | 분양권 계약 | `Cntr_Clsf` 04, `SalesRightContractInputForm`, `TPCT01M` | 규격 문서 | `PurchaseRightContractDetail` |
| `union_member_right_contract` | 조합원입주권 매매계약서 | `Cntr_Clsf` 15, `TPCT32S` | 규격 문서 | `UnionMemberRightContractDetail` |
| `commercial_premium_contract` | 상가건물 임대차 권리금 계약서 | `Cntr_Clsf` 11, `TPCT20S` | 규격 문서 | `CommercialPremiumContractDetail` |
| `right_transfer_contract` | 권리 양도 계약서 | `Cntr_Clsf` 06 + `Tran_Clsf` 06, `TPCT01M` | 규격 문서 | `RightTransferContractDetail` |
| `right_succession_contract` | 권리의무 승계 계약서 | `Cntr_Clsf` 06 + `Tran_Clsf` 07, `TPCT01M` | 규격 문서 | `RightSuccessionContractDetail` |
| `standard_lease_contract` | 표준임대차계약서 | `Cntr_Clsf` 13, `TPCT18S` | 규격 문서 | `StandardLeaseContractDetail` |
| `commercial_standard_lease_contract` | 상가건물 임대차 표준계약서 | `Cntr_Clsf` 12, `TPCT19S` | 규격 문서 | `CommercialStandardLeaseContractDetail` |
| `house_lease_contract` | 주택임대차계약서 | `Cntr_Clsf` 14, `TPCT12S` | 규격 문서 | `HouseLeaseContractDetail` |
| `sublease_contract` | 전대차 계약서 | `SubleaseContractInputForm`, `TPCT01M` | 규격 문서 | `SubleaseContractDetail` |
| `sublease_agreement` | 전대차 동의서 | `Cntr_Clsf` 38, `TPCT29S` | 규격 문서 | `SubleaseAgreementDetail` |
| `broker_explanation_residential` | 중개대상물 확인설명서 주거용 | `Chck_Setn_Clsf` 1 | 규격 문서 | `BrokerExplanationDetail` |
| `broker_explanation_non_residential` | 중개대상물 확인설명서 비주거용 | `Chck_Setn_Clsf` 2 | 규격 문서 | `BrokerExplanationDetail` |
| `broker_explanation_land` | 중개대상물 확인설명서 토지 | `Chck_Setn_Clsf` 3 | 규격 문서 | `BrokerExplanationDetail` |
| `broker_explanation_special` | 중개대상물 확인설명서 특수 물건 | `Chck_Setn_Clsf` 4 | 규격 문서 | `BrokerExplanationDetail` |
| `real_estate_transaction_report` | 부동산거래계약 신고서 | `Cntr_Clsf` 34, `TPCT26S` | 규격 문서 | `TransactionReportDetail` |
| `real_estate_transaction_cancel_report` | 부동산거래계약 해제등 신고서 | `Cntr_Clsf` 35, `TPCT25S` | 규격 문서 | `TransactionCancelReportDetail` |
| `house_transaction_report` | 주택거래계약 신고서 | `Cntr_Clsf` 32, `TPCT23S` | 규격 문서 | `HouseTransactionReportDetail` |
| `lease_declaration` | 임대차계약 신고서 | `Cntr_Clsf` 44/47/49, `TPCT30S`/`TPCT33S`/`TPCT36S` | 규격 문서 | `LeaseDeclarationDetail` |
| `lease_change_declaration` | 임대차계약 변경신고서 | `Cntr_Clsf` 45, `TPCT30S` | 규격 문서 | `LeaseChangeDeclarationDetail` |
| `renewal_confirmation` | 계약갱신요구권 행사 여부 확인서 | `Cntr_Clsf` 48, `TPCT35S` | 규격 문서 | `RenewalConfirmationDetail` |
| `guarantee_non_enrollment_agreement` | 임대보증 미가입 임차인 동의서 | `Cntr_Clsf` 50, `TPCT37S` | 규격 문서 | `GuaranteeAgreementDetail` |
| `guarantee_partial_enrollment_agreement` | 임대보증 일부가입 임차인 동의서 | `Cntr_Clsf` 52, `TPCT39S` | 규격 문서 | `GuaranteeAgreementDetail` |
| `jeonse_registration_not_requested` | 전세권설정 미요청 확인서 | `Cntr_Clsf` 51, `TPCT38S` | 규격 문서 | `JeonseRegistrationNotRequestedDetail` |
| `cash_receipt_document` | 현금보관증 | `Cntr_Clsf` 41, `TPCT15S` | 규격 문서 | `CashReceiptDetail` |
| `privacy_agreement` | 개인정보 수집이용 동의서 | `Cntr_Clsf` 43, `TPCT16S` | 규격 문서 | `PrivacyAgreementDetail` |
| `contract_cover` | 계약서 표지 | `TPCTS8S` | 사무소 양식 | `OfficePrintTemplate` |
| `receipt` | 일반 영수증 | `TPCTS4S` | 사무소 양식 | `OfficePrintTemplate` |
| `broker_fee_receipt` | 중개보수 영수증 | `TPCTS5S` | 사무소 양식 | `OfficePrintTemplate` |
| `balance_statement` | 잔금 정산서 | `TPCTS6S` | 사무소 양식 | `OfficePrintTemplate` |
| `management_fee_statement` | 관리비/공과금 정산서 | `TPCTS7S` | 사무소 양식 | `OfficePrintTemplate` |
| `contract_clause` | 기본 계약사항 문구 | `DMSV001Q01/I03/U01/D01` | 사무소 문구 | `ContractClauseTemplate` |
| `special_terms_clause` | 기본 특약사항 문구 | `DMSV001Q02/I04/U02` | 사무소 문구 | `ContractClauseTemplate` |
| `basic_confirmation_clause` | 기본 확인서 문구 | `DMSV004Q01`, `DMSV004I01` | 사무소 문구 | `ContractClauseTemplate` |

## 거래구분 코드 매핑

마이스파이더의 `Tran_Clsf`는 estate-erp의 `transactionType`과 일부 확장 거래를 분리해서 다룬다.

| 마이스파이더 코드 | 의미 | estate-erp 값 |
| --- | --- | --- |
| `01` | 매매 | `sale` |
| `02` | 전세 | `jeonse` |
| `03` | 월세 | `monthly` |
| `04` | 교환 | `exchange` |
| `05` | 전대 | `sublease` |
| `06` | 양도 | `transfer` |
| `07` | 승계 | `succession` |

현재 `Contract.transactionType`은 `sale / jeonse / monthly` 중심이다. 권리양도, 전대차, 승계, 교환까지 계약 문서 범위에 넣으려면 `transactionType` 확장 또는 문서 상세 모델의 `documentTransactionType` 필드가 필요하다.

## 추천 모델 경계

### 이미 추가한 모델 유지

`ContractDocumentTemplate`

- 문서 종류 코드
- 표시명
- 필수 여부
- 적용 거래유형
- 표시 순서
- 사무소 커스텀 여부

`ContractDocument`

- 계약별 문서 인스턴스
- 문서 상태
- 파일 URL
- 생성/서명/제출 시각
- 출력 당시 snapshot

### 추가 추천 모델

`OfficePrintTemplate`

- 표지, 영수증, 중개보수 영수증, 잔금 정산서, 관리비 정산서의 사무소별 재사용 양식
- 마이스파이더의 `TPCTS4S~TPCTS8S`에 대응

필드 후보:

- `officeId`
- `type`
- `title`
- `transactionType`
- `isDefault`
- `data JsonB`
- `createdById`

`ContractClauseTemplate`

- 기본 계약사항, 특약사항, 기본 확인서, 기타 안내 문구
- 마이스파이더의 `ContractComment`, `SpecialComment`, `BasicConfirmation`에 대응

필드 후보:

- `officeId`
- `type`
- `contractKind`
- `transactionType`
- `title`
- `content`
- `isDefault`
- `sortOrder`

`ContractParty`

- 공동명의, 대리인, 법인 담당자, 공동중개 출력 당사자를 계약 당시 스냅샷으로 관리
- 마이스파이더의 `TPCT02S`, `TPCT28S`에 대응
- 기존 `buyerContactId`, `sellerContactId`는 대표 당사자용으로 유지 가능

필드 후보:

- `contractId`
- `side`
- `role`
- `contactId`
- `nameSnapshot`
- `phoneSnapshot`
- `addressSnapshot`
- `registrationNoEncrypted`
- `shareRatio`
- `sortOrder`

## 구현 순서 제안

1. 문서 코드 seed 정비
   - 현재 `ContractDocumentTemplate` seed를 위 코드표 기준으로 재작성한다.
   - `code`, `category`, `transactionTypes`, `isRequired`, `sortOrder`를 정한다.

2. `OfficePrintTemplate` 추가
   - 표지/영수증/정산서부터 구현한다.
   - 마이스파이더의 `TPCTS4S~8S` 역할을 estate-erp 방식으로 만든다.

3. `ContractClauseTemplate` 추가
   - 기본 계약사항, 특약사항, 기본 확인서 문구를 사무소별로 저장한다.

4. `ContractParty` 추가 여부 결정
   - 공동명의/대리인/공동중개 출력이 계약서 생성의 핵심이 되면 먼저 추가한다.
   - 단순 MVP에서는 기존 Contact 관계와 `ContractDocument` snapshot으로 지연 가능하다.

5. 핵심 규격 문서 상세 테이블 추가
   - 1차: `ContractAgreementDetail`, `BrokerExplanationDetail`, `LeaseDeclarationDetail`
   - 2차: `RenewalConfirmationDetail`, `GuaranteeAgreementDetail`
   - 3차: 분양권, 권리양도/승계, 표준임대차, 전대차

## 열린 결정 사항

- `Contract.transactionType`을 권리양도, 전대차, 승계까지 확장할지 별도 문서 거래유형으로 둘지 결정해야 한다.
- `ContractDocumentTemplate`을 장기적으로 DB에 둘지 코드 enum으로 낮출지는 실제 커스텀 수요를 보고 판단한다.
- 거래대장은 디컴파일 범위에서 독립 폼/테이블 근거가 명확하지 않았다. 잔금 정산서와 관리비 정산서는 확인됐고, 거래대장은 추가 확인 후 별도 코드로 둘지 결정한다.
