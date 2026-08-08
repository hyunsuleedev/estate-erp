# 감사: deals — partial (4.5/10)

거래 파이프라인 페이지는 칸반 보드(계약 준비/가계약/본계약/중도금·잔금/잔금 완료 5그룹) + Notion 스타일 리스트 뷰 + 종료 거래 아카이브 + 상세 Sheet가 잘 구현되어 있고, DealPayment 지급 스케줄 D-day 표시·긴급 정렬·만원→억 표기 등 시각적 완성도는 높다. 그러나 사실상 읽기 전용 뷰어 수준이다: 거래 생성/수정 UI가 전혀 없고, 단계 변경 외 모든 mutation 미구현, 에러 처리 부재(서버가 Contract 없는 중도금·잔금 전이를 거부해도 조용히 실패), 계약서·매물·연락처·수수료 페이지로의 컨텍스트 점프가 하나도 없으며, shared/commission.ts 법정 요율 계산기를 쓰지 않고 수수료를 단순 1/2로 나눠 표시한다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 칸반 보드 뷰: preparing(계약 준비)/preContract(가계약)/contracted(본계약)/settling(중도금·잔금)/completed(잔금 완료) 5컬럼 + 컬럼별 건수·금액 합계
- 리스트 뷰: 단계별 그룹 접기/펼치기, 행번호, 매도/매수/금액/다음 일정/태그 컬럼 (Notion 스타일)
- 종료(closed) 거래 접이식 아카이브 + 합계
- 검색(매물명·주소·매수인·매도인·공동중개사·메모·특약, useDeferredValue) + 거래유형(매매/전세/월세) 필터
- 단계 변경: 카드/행 드롭다운 메뉴 + '다음 단계' 버튼 + 거래 종료(closed), PATCH /deals/:id/stage 연동 및 쿼리 무효화
- 거래 상세 Sheet: 단계별 '다음 액션' 체크리스트, 당사자(매도/매수/공동중개사) 표시 + tel: 전화 링크
- DealPayment 지급 스케줄 표시: 가계약금/계약금/중도금/잔금 kind 라벨, D-day 계산, D-3 이내 긴급 강조(빨간 보더), 완료(paid) 체크 표시
- 지급 임박순 카드 정렬(sortDealsForDisplay) + 카드 진행도 ProgressBars
- 가계약(preContract) 단계 및 preContract 결제 kind 지원
- 만원→억 표기(formatPrice: 15.8억 = '15억 8,000만'), 월세는 '보증금 / 월세' 분리 표기
- 공동중개 배지(보드/리스트/상세) 및 partnerBroker 이름/전화 표시
- 특약사항·메모 표시, 수수료 요약(commissionSummary.billed) 표시
- 로딩 상태, 빈 보드 컬럼/빈 검색 결과/빈 지급 스케줄 빈 상태 문구

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 거래 생성 UI 전무 — PRD MVP '새 거래 생성' 버튼/폼이 없음. api.deals.create는 존재하나 미사용. 매물/Match에서 넘어오는 생성 플로우의 수신 측도 없음
- 거래 정보 수정 불가 — 상세 Sheet의 당사자·합의가격·메모·특약·공동중개 정보가 전부 읽기 전용. PRD MVP '당사자/가격/메모 수정, 수수료 및 공동중개 정보 수정'이 통째로 빠짐 (서버에 PATCH /deals/:id 자체가 없어 백엔드 작업 선행 필요)
- 단계 변경 에러 처리 없음 — 서버 deals.service.ts는 settling/completed/closed 전이 시 Contract 존재를 요구해 BadRequest를 던지는데, stageMutation에 onError/토스트가 없어 사용자는 실패를 인지할 수 없음
- 계약서 열기/생성 CTA 없음 — 상세의 '계약 문서 준비' 타일이 /contracts 라우트(존재함)로 연결되지 않음. Deal→Contract 핵심 흐름 단절, Contract 상태/존재 여부 요약도 미표시
- 컨텍스트 점프 전무 — Link/useNavigate 사용 0건. 매물(properties)·당사자(contacts)·수수료(cashflow)·공동중개사(partner-brokers) 상세로 이동 불가. '수수료 페이지' 텍스트가 span일 뿐 링크 아님
- 수수료 매도/매수측 표시가 commissionSummary.billed를 단순 1/2로 나눈 가짜 값 — shared/commission.ts의 법정 요율 계산기(getLegalMaxRate, calculateCommissionAmount) 미사용, 수수료 계산기 UI 없음, ourShare/partnerShare(공동중개 분배) 미표시
- 직원 배분 섹션이 placeholder('정산 모듈과 연결 후 표시됩니다') — api.finance.commissionPayments.findByDeal(GET /finance/commission-payments/deal/:dealId) + distributions PATCH가 이미 존재함에도 미연동
- DealPayment 스케줄이 읽기 전용 — 입금 확인(완료 처리)·일정/금액 수정 UI 없음 (서버에 DealPayment 수정 엔드포인트도 없음)
- 거래 취소 UI 없음 — PATCH /deals/:id/cancel(cancelReason/cancelledBy 지원)이 api-client에 있으나 UI는 stage='closed'로만 종료해 '취소'와 '정상 종료'가 구분되지 않음. DELETE(삭제)도 미노출
- 쿼리 에러 상태 UI 없음 — useQuery isError 미처리, 네트워크 실패 시 빈 화면
- 필터 부족 — stage 필터, 공동중개 여부, 참여 직원, Contract 상태 필터 없음 (PRD 7절). 거래유형 필터만 존재
- KPI 타일 미구현 — PRD의 진행 거래 수/예상 수수료 총액/완료 거래 수/공동중개 거래 수 타일 대신 건수 배지 + 진행 합계 1개만 표시
- 칸반 드래그앤드롭 없음 — 단계 이동이 드롭다운/버튼으로만 가능
- '담당' 컬럼(AssigneeStack)이 담당 직원이 아닌 매도/매수 연락처 이니셜을 표시 — 의미 오류 (DealParticipant 데이터 미사용)
- 실시간 동기화 없음 — 다른 사용자의 stage 변경이 반영되지 않음 (PRD 13절, Phase 2 항목이라 우선순위 낮음)

## API 갭
- PATCH /deals/:id — 당사자/합의가격/메모/특약/공동중개(partnerBrokerId, ourSide) 일반 수정 엔드포인트가 서버(deals.controller.ts)와 api-client 모두 없음 (PRD '후속 필요' 명시)
- DealPayment 수정 엔드포인트 — 입금 확인(paid 처리), 일정/금액 변경용 PATCH /deals/:dealId/payments/:id 류가 서버·api-client 모두 없음 (payments는 include로 읽기만 가능)
- api-client contracts.findAll에 dealId 쿼리 파라미터 없음 — Deal 상세에서 연결 Contract 요약을 가져올 방법이 없음 (Deal 응답 projection에도 contract 미포함)
- DealParticipant 단위 API 부재 — finance/commission-payments distributions로 우회 가능하나 PRD가 명시한 GET/POST/PATCH /deals/:id/participants 형태는 없음 (api.finance.commissionPayments.findByDeal은 존재하나 페이지 미사용)

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/deals/index.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/deals/-deal-view-utils.ts

## 공유 의존성 (수정 금지 영역)
- @/components/ui/avatar
- @/components/ui/badge
- @/components/ui/button
- @/components/ui/dropdown-menu
- @/components/ui/input
- @/components/ui/scroll-area
- @/components/ui/sheet
- @/lib/api
- @/lib/utils (cn)
- @estate-erp/api-client (Deal, DealPayment 타입)
- @estate-erp/shared (formatPrice)
