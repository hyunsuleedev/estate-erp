# 감사: contracts — partial (6/10)

계약 목록 + Deal 기반 계약 생성 + 4탭 상세 워크스페이스(요약/계약 정보/문서 허브/거래 정보) + 마이스파이더 서식 코드 매핑 기반 문서 작성·출력 미리보기·인쇄까지 갖춘 비교적 충실한 구현. 다만 서버 /contracts 응답에 deal.property가 합성되지 않는데 UI가 contract.deal?.property 경로를 읽어 목록·상세·문서 기본값의 매물 정보가 항상 "계약"/"호실 미지정"으로 표시되는 치명적 표시 버그가 있다. 또한 계약금/중도금/잔금 입금확인·타임라인, 특약 템플릿(clauseTemplates API는 존재하나 미연동), Deal/Contact로의 컨텍스트 점프, 계약 삭제, 목록 로딩/에러 처리, KPI 타일이 모두 빠져 있어 PRD 대비 갭이 크다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 계약 목록 테이블 (계약일/거래유형/매물/당사자/금액/상태/문서 수/수정일) + 검색 + 상태/거래유형 필터
- Deal 기반 계약 생성 다이얼로그 — 이미 계약된 거래 제외, 당사자/금액 기본값 채움, 당사자 미연결 시 생성 버튼 비활성 (서버측 검증과 일치)
- 계약 상세 워크스페이스 (전체화면 Dialog, 요약/계약 정보/문서 허브/거래 정보 4탭)
- 계약 데이터 수정: 상태, 거래유형(매매/전세/월세/교환/전대/권리양도/권리승계), 총액, 월세, 계약일, 명목 계약금/중도금/잔금+예정일, 입주일, 임대 시작/종료일, 특약, 메모, 첨부 URL
- 문서 허브: 거래유형별 필수/선택 문서 템플릿 목록 + 작성/누락 상태 배지 + documentCount/missingDocumentCount 서버 집계 표시
- 문서 작성/수정 시트 (-document-engine.ts): 25+개 서식 코드→입력폼/리포트 매핑, 카테고리별 필드 그룹, 계약 데이터 자동 기본값, metadata.documentEngine 버전 저장
- 문서 출력 미리보기 (A4 스타일 리포트 페이지, 서명란 포함) + window.print() 인쇄
- 만원→억 표기 (formatPrice: 158000→'15억 8,000만'), ko-KR 날짜 포맷
- 테이블 row 키보드 접근성 (Enter/Space로 상세 열기)
- 상세 로딩 중 placeholder 텍스트, 문서 저장 실패 시 에러 메시지 표시

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 매물 정보 표시 버그: 서버 contractInclude(apps/server/src/modules/contracts/contracts.service.ts:22)가 deal.listing.property만 include하고 deals 모듈처럼 property 합성(deals.service.ts:353 `property: deal.listing?.property`)을 하지 않는데, UI는 contract.deal?.property?.site?.name을 읽음 → 목록 매물 컬럼·상세 제목·문서 엔진 '부동산 표시' 기본값이 항상 '계약'/'호실 미지정'/'-'. enrichContract에 property 합성 추가 또는 UI 경로를 deal.listing.property로 수정 필요 (매물명/호실 검색도 같은 이유로 동작 안 함)
- 계약금/중도금/잔금 입금확인·타임라인 없음: stated*(명목) 금액 입력만 있고 DealPayment(실입금 pending/paid/overdue) 상태 표시, 지급 일정 타임라인 시각화, '거래 대금 탭' 점프 링크가 전부 없음 (안내 문구만 존재)
- 특약 템플릿 미연동: api.contracts.clauseTemplates/createClauseTemplate/updateClauseTemplate API가 클라이언트·서버에 모두 존재하지만 특약사항은 일반 Textarea — 템플릿 선택·삽입·저장 UI 없음
- 컨텍스트 점프 전무: PRD의 'Deal 열기' CTA 없음, 당사자(Contact 상세)·매물(Property/Site) 링크 없음 — '거래 정보' 탭은 정적 텍스트만 표시 (매물→거래→계약 흐름 단절)
- 계약 삭제 불가: UI에 삭제 액션 없고 서버에도 DELETE /contracts/:id 엔드포인트 없음 (PRD: owner/manager 삭제 허용)
- 목록 로딩/에러 상태 미처리: useQuery isLoading/isError 미사용 — 로딩 중에도 '조건에 맞는 계약이 없습니다' 표시, createMutation/updateMutation에 onError 없어 저장 실패가 무반응으로 끝남
- PRD 화면 구조 미달: KPI 타일(진행 계약/서명 완료/잔금 대기/자료 누락 계약 수) 없음, '자료 중심' 카드 뷰 토글 없음, 계약일 범위·문서 준비 상태·PDF 존재 여부 필터 없음
- 저장 전 검증 없음: signed 이상 상태 시 계약일 필수, 계약금+중도금+잔금=총액 정합성, monthly 시 monthlyRent 필수, 전세/월세 시 임대기간 필수 — 클라이언트·서버 모두 미검증 (상태 Select가 전이 규칙 없이 자유 변경)
- 계약 생성 다이얼로그 거래유형 자동 채움 버그: createForm.transactionType 초기값 'sale'이 truthy라 `prev.transactionType ?? deal.transactionType` 폴백이 절대 작동 안 함 — 전세/월세 거래 선택 시에도 '매매'로 남고 월세 필드 비활성
- 문서 엔진 기본값 매핑 버그: site.address(실제 필드는 roadAddress/jibunAddress), Contact.address(스키마에 없는 필드)를 읽어 소재지·갑/을 주소 기본값이 항상 빈 값 — 법정동 주소 자동 채움 불가
- 관련 이력(ActivityLog) 패널 없음: PRD 우측 '관련 이력' 요구 — ActivityLog 조회 API 자체가 api-client에 없음
- PDF 저장 미구현: window.print()만 가능 — PDF 파일 생성 후 ContractDocument에 연결하는 흐름 없음, 문서 삭제도 불가 (status=cancelled 우회만 가능)
- 빈 상태 CTA 없음: 계약 0건일 때 PRD의 'Deal에서 계약 생성' 안내 CTA 없이 검색 결과 없음과 동일 문구
- 면적 평 표기 없음 (문서 엔진이 m²만 표시, sqmToPyeong 미사용), 키보드 단축키(/ 검색 포커스, Cmd+S 저장, Cmd+P 인쇄) 없음

## API 갭
- GET /contracts 응답의 deal에 property 미합성 — contracts.service.ts enrichContract에서 deals 모듈처럼 `property: deal.listing?.property` 매핑 필요 (UI 매물 표시 전체가 깨지는 원인)
- DELETE /contracts/:id — 서버 엔드포인트와 api.contracts.remove 모두 없음
- DELETE /contracts/:id/documents/:documentId — 문서 삭제 엔드포인트/클라이언트 메서드 없음 (PRD 후속 API 목록에 명시)
- POST /contracts/:id/export-pdf — PDF 저장 엔드포인트 없음 (현재 window.print만)
- ActivityLog 조회 API — api-client에 activity-logs 모듈 자체가 없어 PRD '관련 이력' 패널 구현 불가
- GET /contracts 응답에 deal.payments(DealPayment) 미포함 — 입금확인 상태 표시를 위해 include 추가 또는 별도 조회 필요 (현재는 deals.findOne 재호출로만 가능)
- 파일 업로드(presigned URL) API 없음 — 문서 fileUrl 수동 입력만 가능 (Phase 2 범위)

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/contracts/index.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/contracts/-document-engine.ts

## 공유 의존성 (수정 금지 영역)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/api.ts (api 인스턴스)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/utils.ts (cn)
- @/components/ui/* — badge, button, card, dialog, input, label, scroll-area, select, sheet, table, tabs, textarea
- @estate-erp/api-client — Contract/ContractDocument/ContractDocumentTemplate/Deal 타입 및 contracts/deals 모듈
- @estate-erp/shared — formatPrice
- /Users/hyunsulee/estate-erp/apps/web/src/components/layout/app-sidebar.tsx (사이드바 /contracts 진입점, 소유 아님)
