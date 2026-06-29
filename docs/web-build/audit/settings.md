# 감사: settings — partial (5.5/10)

settings 라우트는 index.tsx 단일 파일이며(보조 파일 없음), 사무소 기본 정보 편집, 수수료 배분(commissionConfig) 설정, MCP API 키 발급/폐기 + Claude Desktop 연결 가이드, 언어 전환, 팀 구성 요약, owner/manager RBAC 읽기 전용 처리까지 동작한다. 그러나 도메인 기대치 중 계약 특약/서식 템플릿, 고정비 템플릿, AI trust(Rule 활성화) 설정 섹션이 없고, 저장 성공/실패 피드백(toast)과 에러 상태 처리가 전무하며, MCP 엔드포인트 URL을 dev 포트 치환 방식으로 만들어 운영 환경에서 잘못된 주소가 안내된다. 핵심 2~3개 설정은 완성도 있게 동작하지만 설정 허브로서의 커버리지와 운영 품질에 갭이 크다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 사무소 정보 편집 (사무소명/대표명/등록번호/대표전화/주소) — PATCH /offices/me, owner/manager만 편집 가능 (RBAC), agent는 읽기 전용 배지 표시
- 수수료 배분 규칙 설정 — Office.commissionConfig JSONB와 1:1 (distributionType, defaultAgentRate, listingAgentRate, buyingAgentRate, dualAgentRate, managerRate, closerBonus), PATCH /offices/me/commission-config, 기본값 정규화(normalizeCommissionConfig) 처리
- MCP API 키 관리 — 발급/폐기/복사, 키 prefix 마스킹 표시, 1회성 노출 경고, Claude Desktop mcpServers 설정 JSON 자동 생성 가이드
- 언어 설정 — ko/en 로케일 전환 (i18n changeLocale)
- 운영 요약 — owner 정보, 전체/활성 직원 수, 매니저 수, 플랜(subscription), 팀 구성원 목록(역할/활성 배지)
- 메트릭 카드 로딩 placeholder (불러오는 중 표시)

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 계약 특약/서식 템플릿 관리 섹션 없음 — 서버(contracts 모듈: clause-templates, print-templates CRUD)와 api-client(api.contracts) 모두 존재하고 contracts 페이지에서 일부 사용 중이나, 도메인 기대치인 '설정에서 템플릿 관리' UI가 settings에 없음. 특약(ContractClauseTemplate)·인쇄 서식(OfficePrintTemplate) CRUD 카드 또는 contracts 페이지로의 링크 추가 필요
- 고정비 템플릿(OfficeExpenseTemplate) 섹션 없음 — api.finance.expenses CRUD가 cashflow/expenses.tsx에서만 사용됨. settings에 고정비 요약 카드 + cashflow/expenses로의 컨텍스트 점프 링크 필요
- AI trust 설정 없음 — api.rules(GET/PATCH /agent/rules, isActive 토글)가 api-client에 있으나 웹 전체에서 미사용. ai-operations 페이지도 정적 placeholder라 Rule 활성화/비활성 UI가 어디에도 없음. settings에 AI 직원 규칙 토글 섹션 필요
- MCP 엔드포인트 URL 버그 — window.location.origin.replace(/:\d+$/, ':3000') (index.tsx:573)는 dev 전용 가정. 운영 환경(포트 없는 origin)에서는 치환이 안 되어 웹 origin + /mcp라는 잘못된 주소가 가이드에 표시됨. API base URL 설정값을 사용하도록 수정 필요
- 저장 성공/실패 피드백 없음 — updateOfficeMutation/updateCommissionMutation/generateMutation/revokeMutation 모두 onError 미처리, sonner(toast)가 ui에 있는데도 미사용. 저장 실패 시 사용자가 인지 불가
- office 조회 에러/빈 상태 처리 없음 — useQuery isError 미처리, office가 없으면(미생성 계정) 빈 폼만 표시되고 createForCurrentUser 흐름 안내 없음
- 수수료 비율 입력 검증 없음 — 0~100% 범위 검증, 숫자 외 입력 방지 없이 toNumber fallback으로 조용히 기본값 대체됨. 매도측+매수측 합계 안내도 없음
- i18n 불일치 — ko/en settings.json에 labels.* 키가 모두 준비되어 있으나 사무소 정보/수수료/운영 요약 섹션은 한국어 하드코딩(언어를 en으로 바꿔도 해당 섹션은 한국어 유지). 언어 카드와 MCP 카드만 t() 사용
- 팀 구성에서 직원 관리(employees 페이지)로의 컨텍스트 점프 링크 없음 — 직원 목록이 read-only로만 나열되고 초대/관리 진입점 없음
- 키 폐기 확인이 window.confirm — shadcn AlertDialog 등 일관된 확인 다이얼로그로 교체 필요
- 단독중개 비율 라벨이 'dualAgentRate'인데 화면 라벨은 '단독중개', i18n 키는 '단독중개 비율 (%)' — closerBonus suffix가 페이지에서는 '만원', i18n에서는 '(%)'로 단위 표기가 서로 모순됨. 실제 의미(만원 고정액 vs %) 확정 후 통일 필요

## API 갭
- PATCH /agent/rules/:name이 isActive만 수정 가능 (rule.controller.ts:65-80, UpdateAgentRuleDto도 isActive만 정의) — Rule.config 파라미터(가격 변동 임계값 등)나 trustTier(auto/approval_required/inform_only) 수준을 사무소가 조정하는 엔드포인트/클라이언트 메서드 없음. AI trust 설정 UI를 만들려면 DTO 확장 필요
- 플랜(subscription) 변경/업그레이드 엔드포인트 없음 — OfficeProfile.subscription은 읽기 전용 표시만 가능 (PRD 9장의 무료/기본/프로 플랜 전환 흐름 미지원, Phase상 의도적일 수 있음)
- 필요한 나머지 API는 모두 존재 — offices.getMe/updateMe/updateCommissionConfig, mcp.getApiKeyStatus/generateApiKey/revokeApiKey, finance.expenses CRUD, contracts clause/print 템플릿 CRUD 모두 api-client + 서버 모듈에 구현되어 있음 (settings UI가 안 쓰고 있을 뿐)

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/settings/index.tsx

## 공유 의존성 (수정 금지 영역)
- @/components/ui/badge
- @/components/ui/button
- @/components/ui/card
- @/components/ui/input
- @/components/ui/label
- @/components/ui/select
- @/lib/api (packages/api-client 래퍼)
- @/providers/auth-provider (useAuth)
- @/i18n (changeLocale, currentLocale, SUPPORTED_LOCALES)
- /Users/hyunsulee/estate-erp/apps/web/src/i18n/locales/ko/settings.json, en/settings.json
