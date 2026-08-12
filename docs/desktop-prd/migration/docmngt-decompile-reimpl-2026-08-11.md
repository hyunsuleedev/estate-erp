# 문서관리(DocuMngt) 디컴파일 분석 + Estate 재구현 메모

- 작성: 2026-08-11
- 소스: 로컬 디컴파일본 `MySpiderII/MySpiderMgr/DocuMngt` (저장소 외부)
- 설치본: 로컬 MySpiderII 1.4.0.0
- 실측: 실행 중 문서관리 목록 + 편집 셸(별 창)

## 1. 레거시 구조 (디컴파일)

```
MSFM001Q1M Ribbon "문서관리"
  └── DMLS002Q1M          목록 그리드 (MDI child, Layout040000)
        │ 더블클릭 / 신규 / 복사
        ▼
  DMIN001I1M | DMIN001I2M  편집 셸 (독립 floating 창)
        └── 서식 탭 × N (ContractWebForm / ContractInputForm …)
```

| 클래스 | 역할 |
|--------|------|
| `DMLS002Q1M` | 목록: 필터·그리드·삭제·메모·거래신고 |
| `DMIN001I1M` | 네이티브 편집 셸 (`CONTRACT.Type=1`) |
| `DMIN001I2M` | HTML WebBrowser 셸 (기본) |
| `DMLS001Q1U` | 거래신고 상태 팝업 |
| `Memo` | 한줄메모 모달 |
| `ContractShare` / `InvoiceForm` / `CoverForm` | 공유·영수증·표지 |

### 목록 API (`DMLS001Q01`)

필터: `Cntr_Clsf`, `Tran_Clsf`, `State_Type`, `Union`, `ShareSend/Get`, `PeriodOver`, `Date_*`, `Price_*`(원=만원×10000), `SearchClsf/Text`, `Query`(DocList like).

응답 요약 컬럼: 신고·공유·중개구분·문서종류·거래구분·소재지·금액·중도/잔금일·메모·매도/매수 연락처.

### 편집 저장 후 목록

`doInsertRow` / `doUpdateRow` — 단건 `DMLS001Q01(Cntr_No)` 로 **행 패치** (전체 재조회 아님).

### 날짜 셀 색 (CustomDraw)

- 오늘 = 빨강 배경 · 내일 = 초록 · 과거 = 회백 · 미래 = 노랑
- 잔금일 경과 시 계약일 빨간 글씨
- 공유 SEND/GET = 하늘색 행

## 2. Estate 대응

- `GET /contracts` 필터 ≈ DMLS001Q01
- `Contract` + `ContractDocument[]` ≈ 봉투 + DocList
- 조항 임베디드 (`-clause-editor`) ≈ ContractInputForm 일부
- 목록에서 바로 여는 탭형 Sheet 편집기 ≈ DMIN 축소판

## 3. 재구현 범위 (완료)

1. **목록을 MySpider 문서관리 밀도로 재구성** (`/contracts`)
   - 제목/설명 문서관리 포지션
   - 고밀도 컬럼: 중개·금액·중도금일·잔금일·메모·신고·당사자(전화)
   - 날짜 셀 시맨틱 색
   - 행 포커스 하단 상태바 (소재지·매도·매수)
   - 진행중/완료 빠른 프리셋
2. **계약서 등록 메뉴 (ShowNewContract / mnuCntr)** — 2026-08-12
   - 레거시 11개 종별 그룹, 종별×거래유형 **30개 조합**을 그대로 카탈로그화
   - 기본 매매·전세·월세에 **연세(Tran_Clsf 08)** 추가
   - 일반 부동산 선택 시 레거시와 같은 **계약대상 22종** 저장
   - 표준임대·주택임대·분양권·권리·상가 권리금 등 전용 서식
   - 확인설명서 4종 + 현행 서식추가 **22종**(Cntr_Clsf·폼·리포트·테이블 매핑 포함)
   - 선택 → 기존 거래 연결 또는 독립 문서 묶음 생성 → `ContractDocument` 를 해당 `templateCode` + 제목으로 생성 → 편집기 오픈
   - 위임장(Cntr_Clsf 31)은 반복 추가, 나머지는 기존 문서를 재사용
   - 파일: `-form-registration-catalog.ts`, `-form-registration-menu.tsx`, `index.tsx` 연동
3. **템플릿 데이터·편집 스키마 정렬**
   - 지원하는 모든 `ContractDocumentKind`에 전용 `fieldGroups` 제공
   - MySpider 폼/Web폼/리포트/테이블을 템플릿 metadata에 저장
   - 계약·지급·일정 값을 템플릿 필드에 자동 채움, 연세는 `annualRent`로 렌더링
   - 코드 47 통합 임대차 신고와 코드 49 주택임대차 신고서를 분리
4. **독립 서식 묶음**
   - 거래를 선택하지 않고도 서식추가에서 독립 `Contract` 봉투를 만들 수 있음
   - `dealId`·매수/매도 연락처는 nullable, 독립 봉투 금액은 0으로 보관
5. 분석 산출물과 카탈로그 회귀 테스트를 코드/문서로 고정
6. **문서 작업공간 우선 흐름**
   - 계약 목록 행을 열면 계약 현황·당사자·이력 허브를 거치지 않고 편집기로 바로 진입
   - 확인·설명서, 계약서, 추가 서식을 한 가로 탭 레일에서 전환
   - 종별·거래유형에 맞는 제1·2조 구조 입력과 제3조 이후 기본 본문 자동 적용
   - 계약사항 템플릿과 특약 템플릿을 분리하고 종별·거래유형 범위로 저장
   - 신분증은 작성 필수 서식에서 제외하고 첨부 증빙으로만 취급

## 4. 의도적 비복제

- 평문 공유 SEND/GET 네트워크
- WinForms MDI / I1·I2 이중 엔진
- 주민번호 평문 목록 노출

WinForms 엔진 자체는 복제하지 않고, 동일한 서식 선택 결과와 데이터 의미를 React 문서 편집기 및 metadata 기반 렌더러로 재현한다.
