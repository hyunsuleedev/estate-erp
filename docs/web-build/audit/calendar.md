# 감사: calendar — partial (6.5/10)

월/주/일/일정(agenda) 4가지 뷰, 기간 네비게이션, 담당자·유형·내일정 필터(서버 쿼리 반영), 생성·수정·삭제 다이얼로그까지 갖춰 PRD MVP 범위를 이미 초과 구현했고 UI 완성도도 높다. 다만 로딩/에러 상태가 전혀 없고, 이벤트의 CRM 연결(연락처/매물/매칭/거래)을 편집하거나 원본 화면으로 점프하는 기능이 없어 PRD 핵심 수용 기준(시나리오 D)을 충족하지 못한다. 도메인 기대치인 잔금일·수금일·계약일 표시도 CalendarEvent type 색상 수준에 그치고 Contract/CommissionPayment 날짜를 끌어오는 오버레이가 없다. 주/일 타임그리드가 09~18시만 렌더링해 그 외 시간 및 종일 이벤트가 보이지 않는 실질 버그도 있다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 월간 그리드 뷰 (셀당 3개 pill + '+N개 더보기', 오늘 강조, 주말 색상, 선택일 하이라이트)
- 주간/일간 타임그리드 뷰 (더블클릭으로 해당 시간 일정 생성)
- 일정(agenda) 리스트 뷰 (완료/진행중/N시간 후/예정 상태 뱃지, 빈 상태 문구)
- 기간 네비게이션 (이전/다음, 오늘 버튼) + 뷰별 범위 재조회 (getCalendarRange)
- 이벤트 생성/수정/삭제 다이얼로그 (제목·유형·색상·시작/종료·설명) — CRUD 완결
- 담당자 필터, 유형 필터, '내 일정만' 토글 — 모두 서버 쿼리 파라미터로 전달
- 유형별 색상/한글 라벨 (일반/임장/계약/미팅/업무) + 사용자 지정 color 필드 지원
- 선택일 우측 패널 (일정 목록, 빈 상태 처리, '이 날짜에 일정 추가' 버튼)
- 상단 메트릭 (범위 총건수/계약 일정/내 일정/완료·예정)
- 이벤트 컨텍스트 텍스트 표시 (매물 단지명, 연락처명, 거래 stage, 담당자)
- 한국어 날짜·시간 표기 (Intl ko-KR), KST 기준 로컬 date key 처리
- -calendar-view-utils 유틸 단위 테스트 존재 (apps/web/test/calendar-view-utils.test.ts)

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 조회/저장 에러·로딩 상태 전무 — useQuery isLoading/isError 미사용으로 조회 실패 시 빈 달력만 표시(재시도 UI 없음, PRD §11), create/update/delete mutation의 onError 처리·토스트 없음
- 이벤트의 CRM 연결 편집·점프 불가 — 다이얼로그에 contactId/propertyId/listingId/matchId/dealId 선택 UI가 없고, 연결된 Contact/Property/Match/Deal 상세 화면으로 이동하는 링크 없음 (PRD 시나리오 D·수용 기준 위배, formatEventContext 텍스트 표시뿐)
- 잔금일·수금일·계약일 오버레이 없음 — Contract(contractDate/middlePaymentDate/finalPaymentDate)와 CommissionPayment(dueDate)를 캘린더에 표시하는 기능 부재, CalendarEvent 테이블만 조회 (도메인 기대치 핵심)
- 주/일 타임그리드가 hourSlots 09:00~18:00만 렌더링 — 19시 이후/9시 이전 이벤트와 allDay 이벤트(0시 시작)가 주/일 뷰에서 완전히 사라짐, all-day 전용 영역 필요
- 멀티데이 이벤트 미지원 — groupEventsByDate가 start 날짜에만 배치해 end가 이후 날짜인 이벤트가 후속 날짜 셀에 표시 안 됨
- allDay 토글이 생성/수정 폼에 없음 — API(CreateCalendarEventDto.allDay)는 지원하나 UI 미노출 (PRD §9)
- deal.stage가 'deposit' 등 영문 raw 값 그대로 노출 — 한글 라벨 매핑 필요, listing 연결 시 거래유형·가격(만원→억 변환) 표시도 없음
- 종료 시간 제거 불가 — handleSubmit이 end 빈 값을 undefined로 보내 서버가 무시(null 전달 경로 없음), 기존 end가 영구히 남음
- 역할 기반 권한 제어 없음 — agent의 타인 일정 삭제 제한 등 버튼 비활성화 미구현 (PRD §3)
- 드래그앤드롭 일정 이동 미구현 (PRD 시나리오 C 후속 범위), 키보드 단축키(T 오늘/N 새 일정/J·K 이동) 없음 (PRD §13)
- 검색(제목/설명/연락처명) 없음, Task dueDate 오버레이 없음 (PRD 후속 범위)
- 실시간 반영 없음 — 다른 사용자의 일정 변경이 Socket.io 등으로 갱신되지 않음 (PRD §13, Phase 2 성격)

## API 갭
- CalendarEvent에 contractId/taskId FK·include 부재 (prisma schema + calendar-events.service.ts + api-client) — 계약·업무 직접 연결 불가, PRD가 명시한 구조 한계
- 잔금일·수금일·계약일 오버레이용 엔드포인트/메서드 없음 — Contract 일정(contractDate/middlePayment/finalPaymentDate)과 CommissionPayment dueDate를 캘린더 start/end 범위로 묶어 반환하는 GET /calendar-events/overlay(또는 finance 수금 캘린더 API)가 서버·api-client 모두 부재
- GET /calendar-events findAll이 start 필드만 gte/lte 필터 — 범위 이전에 시작해 범위 내에 걸치는(end >= range.start) 이벤트가 누락됨, where 조건을 (start <= range.end AND (end IS NULL OR end >= range.start))로 확장 필요

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/calendar/index.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/calendar/-calendar-view-utils.ts
- /Users/hyunsulee/estate-erp/apps/web/test/calendar-view-utils.test.ts

## 공유 의존성 (수정 금지 영역)
- @/lib/api (api 싱글톤)
- @/providers/auth-provider (useAuth)
- @/lib/utils (cn)
- @/components/ui/badge
- @/components/ui/button
- @/components/ui/dialog
- @/components/ui/input
- @/components/ui/label
- @/components/ui/separator
- @/components/ui/select
- @/components/ui/switch
- @/components/ui/tabs
- @/components/ui/textarea
- @estate-erp/api-client (CalendarEvent/CreateCalendarEventDto/UpdateCalendarEventDto 타입, api.calendarEvents, api.employees)
