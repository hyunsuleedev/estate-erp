# 감사: cashflow — partial (6.5/10)

캐시플로우 섹션은 대시보드(index) + 수금 원장(ledger) + 내정산/직원정산/공동중개수수료/고정비 6개 화면으로 구성된다. 원장은 테이블·캘린더 2뷰, 필터/정렬/컬럼 가시성, 수금 처리·세금계산서·조정(할인/면제/대손) 승인 워크플로우, 공동중개 분배 슬라이더까지 갖춘 사실상 프로덕션급 화면이고, 대시보드도 순이익 카드·연체/승인/예정 통합 큐가 잘 동작한다. 반면 고정비 페이지는 API(create/update/remove)가 다 있는데 조회 전용이고, 직원 정산·파트너 분배금 정산은 상태를 바꿀 액션(엔드포인트 포함)이 아예 없으며, PRD가 명시한 칸반 뷰 부재, 원장→거래 상세 컨텍스트 점프 부재, HeroBlock 연도 버그와 employee-settlements의 Hooks 규칙 위반 같은 결함이 남아 있다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 대시보드: 월 네비게이션 + 이번 달 수금 히어로(전월 대비 %, 월 목표 진행바) + 순이익 카드(고정비 반영) + 받을 돈/연체 표시
- 대시보드 '오늘 처리할 것' 통합 큐: 연체(독촉 태스크 생성) / 조정 승인·반려 인라인 / 이번 주 수금 예정 D-day, 우선순위 정렬
- 대시보드 '이번 달 계약 수수료': 신규 계약 채권 합계 + 거래별 수금률 진행바 + 공동중개 표시
- 수금 원장: Deal 그룹 아코디언 테이블 + 월 캘린더(수금예정/입금/잔여약정 이벤트, 범례) 2뷰 전환
- 원장 필터: 기간 프리셋(다가오는/이번달/특정월/전체) + 상태·거래유형·담당자·공동중개·검색 + 정렬, 컬럼 가시성 localStorage 저장
- 다중 선택 → 일괄 독촉 태스크 생성 + CSV 내보내기(UTF-8 BOM)
- 수금 처리 다이얼로그(금액/방식/입금일/메모, 부족분 자동 일부수금), 세금계산서 발행 기록, 수수료 조정 요청→승인/반려 (배너 + 결정 메모)
- 공동중개 분배: 거래 전체 슬라이더(미리보기→확인→적용) + payment 개별 분배 수정, settled 분배 잠금, draft 청구 확정
- 거래 상세 Sheet: 당사자/거래가/담당자/청구 타임라인/진행률 + 하이라이트 스크롤
- 내 수수료(my-settlement): 참여 거래별 역할·배분률·배분액·정산 상태 집계 테이블
- 직원 정산(employee-settlements): owner/manager 권한 가드, 직원별 배분 수수료·미정산 거래 집계
- 고정비(expenses): 템플릿 목록 + 분기/연간→월 환산 합계
- 공동중개 수수료(partner-commissions): 파트너별 거래수/청구액/우리몫/파트너몫/수금 집계
- 한국 실무 표기: 만원→억 변환(toEok), 매도측/매수측 분리, 매매/전세/월세 라벨
- 로딩 스켈레톤·빈 상태·데이터 없음 폴백이 전 화면에 적용

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 고정비(expenses) 페이지가 조회 전용 — api.finance.expenses.create/update/remove와 서버 POST/PATCH/DELETE가 모두 존재하는데 등록·수정·삭제·활성 토글 UI가 전혀 없음. PRD '한번 등록 → 매월 자동 반영'의 등록 진입점 자체가 부재
- 직원 정산 처리 액션 없음 — DealParticipant.settlementStatus를 unsettled→settled로 변경하는 버튼/플로우가 my-settlement·employee-settlements 어디에도 없음 (서버 엔드포인트도 부재). 정산일 입력·일괄 정산 처리 필요
- 파트너 분배금 정산 액션 없음 — CommissionDistribution(status pending→settled, settledAt/settlementMemo 필드 존재)을 지급 완료 처리하는 UI/엔드포인트가 없어 partner-commissions가 집계만 하고 정산 마감을 못 함
- PRD 3뷰 중 칸반 뷰 미구현 — 타임라인(대시보드)·리스트(원장 테이블)·캘린더는 있으나 수금 단계별(pending/partial/collected/overdue) 칸반 뷰 없음
- 원장 상세 Sheet에서 거래 상세(/deals/$id)·매물(/properties)로 가는 컨텍스트 점프 링크 없음(-ledger.tsx에 Link 미사용). 대시보드의 모든 행도 /cashflow/ledger로만 이동하며 해당 거래/청구를 포커스하는 search param 연동 없음
- index.tsx HeroBlock 연도 버그 — '이번 달 계약 수수료' 집계 시 startOfMonth/endOfMonth를 selected.year가 아닌 new Date().getFullYear()로 계산(247-248행)해 연도를 넘겨 이동하면 잘못된 월 범위로 집계됨
- employee-settlements.tsx Hooks 규칙 위반 — if (!canView) return <AccessDenied /> 조기 반환(65행)이 useQueries/useMemo보다 앞에 있어 React 규칙 위반. 또한 직원 수만큼 getPerformance N+1 쿼리 발생
- partner-commissions가 api.deals.findAll() 전체 로드 후 클라이언트 집계 — 파트너별 집계 서버 엔드포인트·기간 필터 없음, 파트너명 링크가 특정 파트너가 아닌 /partner-brokers 목록으로만 이동
- 월 목표가 하드코딩 휴리스틱(max(monthlyExpense*4, 3000)) — 사무소별 수금 목표 설정 기능 없음
- 뮤테이션 에러 처리 미흡 — CollectDialog/TaxInvoiceDialog/AdjustmentRequestDialog에 mutation.error 표시 없음(분배 다이얼로그만 표시), 독촉 성공 알림이 alert() 사용
- CommissionPayment의 예정일(dueDate)·예정액(expectedAmount) 수정 UI 없음 — draft 확정 시에만 dueDate 전달 가능하고 확정 후 일정 변경 불가
- CashflowSummary.monthlyTrend(월별 수금/지출/순이익) 데이터가 API에 있는데 대시보드에 월별 추이 차트가 없고 전월 대비 % 계산에만 사용

## API 갭
- DealParticipant 정산 처리 엔드포인트 부재 — 예: PATCH /deals/:dealId/participants/:participantId/settle (settlementStatus, settlementDate) + api-client 메서드. deals.controller.ts에는 create/stage/cancel/delete만 존재
- CommissionDistribution 정산 처리 엔드포인트 부재 — 예: POST /finance/commission-payments/:id/distributions/:distId/settle (settledAt, settlementMemo). commission-payment.controller.ts에 분배 교체(PATCH)만 있고 정산 마감 없음
- 파트너별 수수료 집계 엔드포인트 부재 — 예: GET /finance/partner-commissions?from=&to= (현재 partner-commissions.tsx가 deals.findAll() 전체를 받아 클라이언트에서 집계)
- CommissionPayment 일정/금액 수정 엔드포인트 부재 — 확정(pending) 이후 dueDate·expectedAmount를 변경할 PATCH /finance/commission-payments/:id 없음 (confirm 시 dueDate만 1회 전달 가능)
- 사무소 월 수금 목표 설정/조회 API 부재 — 대시보드 목표가 monthlyExpense*4 휴리스틱 하드코딩

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/cashflow/index.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/cashflow/ledger.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/cashflow/-ledger.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/cashflow/my-settlement.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/cashflow/employee-settlements.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/cashflow/expenses.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/cashflow/partner-commissions.tsx

## 공유 의존성 (수정 금지 영역)
- @/lib/api (api.finance.*, api.tasks, api.deals, api.employees, api.partnerBrokers)
- @/lib/utils (cn)
- @/providers/auth-provider (useAuth)
- @/components/ui/button
- @/components/ui/badge
- @/components/ui/skeleton
- @/components/ui/input
- @/components/ui/label
- @/components/ui/dialog
- @/components/ui/select
- @/components/ui/popover
- @/components/ui/sheet
- @/components/ui/card
- @/components/ui/table
- @estate-erp/api-client 타입 (LedgerView, LedgerDealGroup, CashflowSummary, Employee, Deal 등)
- @/components/layout/app-sidebar.tsx (cashflow 하위 메뉴 링크)
