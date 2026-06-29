# 감사: ai-operations — stub (1/10)

AI 운영 페이지는 정적 소개 카드 4개(운영 에이전트, 승인 게이트, 실행 이력/비용, 1차 구현 범위)만 렌더링하는 콘셉트 설명 화면이다. API 호출, 상태 관리, 인터랙션, 로딩/에러 처리가 전혀 없어 PRD의 control plane(KPI, 에이전트/승인/실행이력/규칙/비용 5탭, 상세 drawer) 중 구현된 것이 없다. api-client에 api.rules(목록/isActive 토글)와 api.proposals(목록/승인/반려)가 이미 존재해 규칙 탭과 Proposal 이력은 즉시 구현 가능하지만 페이지에서 전혀 사용하지 않는다. 승인 큐 기능은 별도 inbox 페이지에 이미 구현돼 있어 이 페이지와의 역할 분담 정리가 필요하다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 라우트 존재 및 사이드바 페이지 타이틀('AI 운영') 등록
- Control Plane Draft 배지 + 페이지 헤더(아이콘/설명)
- 정적 개요 카드 4개: 운영 에이전트 소개, 승인 게이트 정책, 실행 이력/비용 원칙, 1차 구현 범위 (모두 하드코딩 텍스트)

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- KPI 대시보드 없음 — 활성 규칙 수, 승인 대기 건수, 오늘 실행 수, 이번 달 비용 카드 미구현. 서버 overview 엔드포인트가 없으므로 우선 api.rules.list + api.proposals.list({status:'pending'}) 클라이언트 집계로 대체 구현 가능
- 규칙(Rule) 탭 없음 — api.rules.list()로 Rule 목록(displayName, triggerType, schedule, isActive) 표시 + api.rules.update(name, {isActive})로 on/off 토글하는 UI가 전혀 없음 (api-client 메서드는 이미 존재)
- Proposal 승인 대기/이력 뷰 없음 — api.proposals.list/approve/reject가 존재하나 미사용. pending 큐 + status 필터(approved/rejected/executed/failed)별 이력 리스트, reasoning/actionPayload 표시, 승인/반려 CTA 필요. 단, inbox 페이지가 이미 InboxItem 기반 승인 큐를 구현하고 있어 두 화면의 역할(Proposal vs InboxItem) 정리 선행 필요
- 실행 이력(run) 탭 없음 — 서버에 AgentRun 모델/엔드포인트 자체가 부재. MVP로는 Proposal(generatedBy, proposedAt, executedAt, executionError) projection 또는 Task(source=ai/system) 집계로 대체 표시 가능
- 데이터 패칭이 전혀 없어 로딩 스켈레톤/에러 재시도/빈 상태(empty state) 처리 전무 — PRD 11절의 탭별 empty state 요구 미충족
- 상세 drawer 없음 — 선택한 규칙/Proposal의 payload JSON, 생성 근거(reasoning), 결과물 링크, ActivityLog 링크를 보여주는 우측 패널 미구현
- 컨텍스트 점프 없음 — Proposal의 listingId/propertyId/contactId/dealId/contractId로 매물/연락처/거래 상세 페이지로 이동하는 링크 미구현 (PRD 시나리오 C 실행 추적 불가)
- 권한 분기 없음 — owner/manager 전용 화면인데 agent 역할 진입 차단 또는 읽기 전용 처리 없음
- 규칙 config(threshold) 수정 폼 없음 — PRD 시나리오 D. 서버 PATCH /agent/rules/:name도 isActive만 받으므로 서버 확장 동반 필요
- 비용 탭 없음 — 월간 비용/토큰 사용량/에이전트별 비용 집계 엔드포인트 자체가 서버에 없음
- 검색/필터/정렬 없음 — approval type, run status, 에이전트 활성 상태 필터 등 PRD 7절 전체 미구현

## API 갭
- GET /ai-operations/overview — KPI 집계(활성 규칙 수, 승인 대기 수, 오늘 실행 수, 월 비용) 엔드포인트 및 api-client 메서드 없음
- GET /ai-operations/runs — AgentRun 모델/실행 로그 엔드포인트 없음 (rule-engine.service 실행 내역이 어디에도 노출되지 않음)
- GET /ai-operations/costs — 비용/토큰 사용량 집계 엔드포인트 없음
- PATCH /agent/rules/:name 의 config 수정 미지원 — 서버 rule.controller.ts와 api-client UpdateAgentRuleDto 모두 isActive만 허용, PRD의 threshold/config 튜닝 불가
- ActivityLog 조회 API 없음 — 서버에 activity-logs 컨트롤러 부재, api-client에도 모듈 없음 (실행 결과 감사 추적 연결 불가)
- 규칙별 최근 실행 수 집계 없음 — GET /agent/rules 응답에 최근 7일 실행 수/최근 실행 시각 필드 없음
- 실패 Proposal 재시도(retry) 엔드포인트 없음 — PRD 8절 '실패 실행 재시도' 액션 구현 불가

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/ai-operations/index.tsx

## 공유 의존성 (수정 금지 영역)
- @/components/ui/badge
- @/components/ui/card
- lucide-react (Bot 아이콘)
