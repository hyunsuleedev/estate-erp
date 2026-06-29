# 감사: dashboard — partial (4/10)

단일 파일(dashboard.tsx, 183줄)로 구성된 사장님 첫 화면. 6개 KPI 카드(총 매물/연락처/진행 매칭/진행 거래/미완료 업무/오늘 일정), 캐시플로우 요약 바(만원→억 변환 적용, /cashflow 링크), 미완료 업무·오늘 일정 5건 리스트가 동작하며 빈 상태와 일부 로딩 스켈레톤도 있다. 그러나 도메인 기대치인 만기 임박 세입자, 미확인 매물, 승인 대기 inbox 카운트가 전부 없고(필요한 api-client 메서드는 이미 존재), KPI가 '이번달' 단위가 아닌 누적 총량 위주이며, 에러 처리와 항목별 컨텍스트 점프가 전무하다. 카운트를 위해 matches/deals/tasks 전체 목록을 fetch하는 비효율도 있다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- KPI 카드 6개: 총 매물, 연락처, 진행 매칭(stage!==closed), 진행 거래(stage!==closed), 미완료 업무, 오늘 일정 건수
- 캐시플로우 요약 바: 수금 완료/수금 예정/미수금(조건부 빨강 강조)/순이익 표시, 클릭 시 /cashflow로 이동
- 만원→억 변환 표기(toEok: 158000 → 15.8억) 한국 실무 표기 적용
- 미완료 업무 패널: 상위 5건 + dueDate ko-KR 표기 + 빈 상태 문구
- 오늘 일정 패널: 상위 5건 + 시간 ko-KR 표기 + 이벤트 색상 점 + 빈 상태 문구
- 로딩 스켈레톤 (KPI는 properties/contacts 기준, cashflow 바 별도)
- / 루트 접근 시 /dashboard로 리다이렉트되는 메인 진입점 역할

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 만기 임박 세입자 위젯 없음 — api.tenants.expiring(days)가 이미 존재하고 서버 GET /tenants/expiring도 구현돼 있으나 대시보드에서 미사용. 계약만료 D-day 리스트 카드 추가 필요
- 미확인 매물(checkStatus=unverified) 카운트/리스트 없음 — api.listings.findAll({checkStatus:'unverified'})로 조회 가능. 매물 페이지로 점프하는 KPI 카드 추가 필요
- 승인 대기 inbox(Proposal) 카운트 없음 — api.inbox.list({scope:'pending'}) / api.proposals.list({status:'pending'}) 존재. /inbox 라우트로 점프하는 배지형 카드 필요
- KPI가 이번달 단위가 아님 — 도메인 기대치는 '이번달 수금/계약/신규의뢰'인데 현재는 누적 총 매물·연락처 카운트. 이번달 계약 건수(Contract), 이번달 신규 BuyerRequirement 카드 없음
- 에러 처리 전무 — 7개 useQuery 모두 isError 무시. API 실패 시 KPI가 0으로 표시되어 잘못된 수치를 보여줌. 에러 상태 UI(재시도 버튼) 필요
- 컨텍스트 점프 부재 — cashflow 바 외에 KPI 카드(→/matches, /deals, /tasks), 업무 항목(→/tasks 상세), 일정 항목(→/calendar) 모두 클릭 불가. Link 연결 필요
- 카운트 목적으로 matches/deals/tasks 전체 목록 fetch — 데이터 증가 시 대시보드 로딩 저하. 집계 전용 엔드포인트 또는 count 파라미터 필요
- isLoading이 properties/contacts만 반영 — matches/deals/tasks/events 로딩 중에는 KPI가 0으로 깜빡임(스켈레톤 미적용)
- 오늘 일정 queryKey가 ['calendar-events','today']로 날짜 미포함 — 자정 경과 후에도 전날 캐시가 재사용될 수 있음. queryKey에 날짜 문자열 포함 필요
- 수금 캘린더/잔금일 임박 알림 등 PRD 5.6의 사장님 월간 재무 파악 요소 미반영 (cashflow.data.deals의 balanceDueDate 데이터는 이미 응답에 포함됨)

## API 갭
- 대시보드 집계 엔드포인트 없음 (예: GET /dashboard/summary) — 현재 matches.findAll()/deals.findAll()/tasks.findAll()은 페이지네이션·count 옵션이 없는 전체 조회라 카운트용으로 비효율. 서버 모듈(apps/server/src/modules)에 dashboard 모듈 부재
- api.contracts.findAll()에 기간 필터 없음 — '이번달 계약 건수' KPI를 만들려면 contractDate 범위 필터 또는 count 파라미터 필요
- api.buyerRequirements.findAll()에 생성일 범위 필터 없음 — '이번달 신규 의뢰' KPI 구현 불가 (status 필터만 존재)
- inbox/proposals count 전용 엔드포인트 없음 — list 호출로 대체 가능하나 배지 카운트용 경량 엔드포인트(GET /inbox/count?scope=pending)가 있으면 효율적

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/dashboard.tsx

## 공유 의존성 (수정 금지 영역)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/api.ts (api 싱글톤)
- /Users/hyunsulee/estate-erp/apps/web/src/components/ui/skeleton.tsx
- @estate-erp/api-client modules: properties, contacts, matches, deals, tasks, calendar-events, finance(cashflow)
- @tanstack/react-router (Link), @tanstack/react-query, lucide-react
