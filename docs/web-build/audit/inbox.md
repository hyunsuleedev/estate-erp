# 감사: inbox — partial (6/10)

AI 업무함(EntityDraft 승인 큐)의 핵심 흐름은 상당히 완성도 있게 구현됨 — 4탭(대기/재처리/승인/처리됨), 우선순위 필터, 퀵 승인/거부, 벌크 항목 선택, 코멘트→AI 재작성 루프, 한국 표준 매매계약서 미리보기(한글 금액 스펠아웃 포함)와 인라인 편집까지 동작한다. 그러나 사이드바에 진입점이 아예 등록되지 않아 직접 URL로만 접근 가능하고, 카테고리별 렌더러가 contract_draft 1개뿐이라 나머지 카테고리는 raw JSON으로 노출되며, 에러 상태 처리와 관련 엔티티(매물/거래/계약)로의 컨텍스트 점프가 전무하다. 서버(inbox 모듈)와 api-client는 엔드포인트가 거의 완비되어 갭은 대부분 프론트 측이다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 4탭 큐 (처리 대기/재처리/승인됨/처리됨) — 서버 scope 매핑(pending/processing/approved+executing/executed·failed·rejected·expired)과 일치
- 우선순위(긴급/일반/참고) 필터 필과 탭별 건수 배지
- 카드 목록: 우선순위 점, 카테고리·결정모드(confirm/approval)·Agent 대기·상태 배지, 상대시각, generatedBy, 코멘트 수
- 접힘 카드 퀵 액션 (승인/거부 — approval 모드, 비벌크 한정)
- 상세 다이얼로그: contract_draft 전용 한국 표준 부동산매매계약서 렌더러 (-renderers/contract-document.tsx, 한글 금액 '…원整' 스펠아웃, 만원→원화 변환, 특약, 매도/매수인 서명란, ko/en 양어)
- contract_draft 인라인 편집 (매매대금/계약금/중도금/잔금/잔금일/특약) → 편집분 자동 저장 후 decide
- 벌크 작업(*_bulk operation): 항목별 체크박스, 전체선택(indeterminate), 10건 프리뷰+더보기, enabled 플래그 병합 후 승인
- 코멘트→재작성 루프: 코멘트 등록 시 status=processing 전이, 처리중 배너, readAt 기준 '반영됨' 마킹된 코멘트 스레드 (서버 submitRevision으로 pending 복귀)
- 거부 다이얼로그 — 사유 필수 입력 (감사 기록)
- 로딩 스켈레톤 + 탭별 빈 상태 메시지
- 실행 실패 시 executionError 표시
- i18n ko/en 완비 (inbox.json)
- 서버측 완비: dedupeKey 중복 방지, executor 분기(server 즉시 실행/agent 픽업/manual), DraftExecutorService dispatch(task/consultation/commission_payment/contract/listing), expiresAt cron 만료

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 사이드바에 업무함 메뉴 미등록 — sidebar.json에 'items.inbox: 업무함' 키만 있고 app-sidebar.tsx navItems에 /inbox 항목이 없어 직접 URL로만 접근 가능. 메뉴 추가 + 대기 건수 배지 필요
- 카테고리별 렌더러가 contract_draft 1개뿐 — ad_takedown, commission_adjustment, post_naver_ad, check_status_update, send_kakao, naver_ad_repost 등은 raw JSON <pre>로 노출됨. -renderers/에 카테고리별 카드/상세 렌더러 추가 필요
- 컨텍스트 점프 전무 — InboxItem의 listingId/propertyId/contactId/dealId/contractId/paymentId와 실행 결과 resultEntityId가 응답에 있으나 카드/상세 어디에서도 /properties·/deals·/contracts 등 상세 페이지 링크 미구현
- 쿼리 에러 상태 미처리 — listQuery.isError 시 빈 상태('처리할 업무가 없습니다 👏')로 오인 표시. mutation 실패(ConflictException: 이미 처리됨 등) 시 토스트/에러 피드백 없음
- snooze/unsnooze(보류) 기능 UI 부재 — api-client·서버 엔드포인트는 존재하나 보류 버튼/보류 해제 UI 없음 (서버 list는 snoozedUntil 필터링까지 구현됨)
- processing(AI 재작성) 상태 실시간 갱신 없음 — refetchInterval/WebSocket invalidation 없이 수동 새로고침 의존 (재작성 완료 후 pending 복귀를 알 수 없음)
- contract_draft 외 카테고리 인라인 편집 불가 — 서버 PATCH는 임의 proposedChanges 허용하나 UI에서 편집 버튼이 contract_draft에만 노출
- 코멘트 작성자 이름 미표시 — comments에 authorId만 있고 사용자 이름 해석 없음 (서버 include에 author 관계 미포함)
- 처리됨(resolved) 탭에서 결정 정보 미노출 — decisionNote(거부 사유), decidedBy, 실행 결과 링크 미표시. resolved 탭 카운트도 없음
- 카테고리 필터 UI 없음 — API list는 category 파라미터를 지원하나 화면에는 우선순위 필터만 존재
- 페이지네이션 없음 — limit 200 고정 풀 로딩. 탭 카운트용으로 4개 목록 쿼리를 각각 limit 200으로 중복 호출 (경량 카운트 API 필요)
- 만원→억 표기 엣지 케이스 — CardSummaryLine(index.tsx:552)에서 1억 미만 가격이 '0억 5,000만'으로 표시됨 (eok===0 가드 없음)
- expiresAt 만료 임박 표시 없음 — pending draft가 곧 만료되는지 카드에서 알 수 없음

## API 갭
- 경량 카운트 엔드포인트 없음 (예: GET /inbox/counts) — 현재 탭 배지를 위해 목록 4개를 limit 200으로 풀 페치. 사이드바 배지 도입 시 필수
- GET /inbox 응답의 comments에 author(작성자 이름) 미포함 — inbox.service의 include에 author 관계 추가 또는 authorName 필드 필요
- 목록 페이지네이션(cursor/offset) 미지원 — resolved 이력이 쌓이면 limit 200으로 잘림
- api-client에 submitRevision 메서드 없음 — 서버 POST /inbox/:id/revision은 존재 (웹에서 수동 재작성 반영/테스트 UI를 만들려면 클라이언트 메서드 추가 필요)
- inbox.controller.ts:29 list()의 scope 타입이 'pending'|'resolved'|'all'로 선언되어 'processing'|'approved'가 타입에서 누락 (런타임은 서비스가 처리하므로 동작은 함 — 타입 정합성 결함)

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/inbox/index.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/inbox/-renderers/contract-document.tsx

## 공유 의존성 (수정 금지 영역)
- @/lib/api (api.inbox.*)
- @/lib/utils (cn)
- @/components/ui/badge
- @/components/ui/button
- @/components/ui/skeleton
- @/components/ui/dialog
- @/components/ui/input
- @/components/ui/label
- @/components/ui/textarea
- @estate-erp/api-client (InboxItem, DraftDecisionMode, DraftPriority 타입)
- react-i18next + src/i18n/locales/{ko,en}/inbox.json
- @tanstack/react-query
