---
paths:
  - "apps/server/src/modules/mcp/**"
  - "packages/mcp-server/**"
---

# MCP (Model Context Protocol) Rules

## 핵심 전략

- CRM 자체가 MCP Server — NestJS API를 잘 만드는 것 = MCP 서버를 만드는 것
- AI 내장 안 함 — 외부 AI(Claude/ChatGPT)가 MCP로 연결
- 스크래핑/로컬 기능은 별도 MCP (Electron 호스팅)

## CRM MCP 도구 목록

| 카테고리 | 도구 | 설명 |
|---------|------|------|
| 매물 | `search_properties`, `get_property`, `create_property` | 매물 CRUD |
| 고객 | `search_contacts`, `get_contact`, `create_contact` | 고객 CRUD |
| 상담 | `get_consultations`, `create_consultation` | 상담 기록 |
| 태스크 | `get_tasks`, `create_task`, `complete_task` | 업무 관리 |
| 매칭 | `get_matches`, `create_match` | 매칭 파이프라인 |
| 거래 | `get_deals`, `create_deal`, `update_deal_stage` | 거래 관리 |
| 인사이트 | `get_insights`, `approve_insight` | 감지 알림 |
| 복합 | `prepare_client_briefing` | 고객 브리핑 (연락처+상담+매물 종합) |
| 복합 | `get_daily_briefing` | 일일 브리핑 (할일+마감+매칭 종합) |

## 감사 추적 (Activity Logs)

MCP를 통한 모든 데이터 변경은 `activity_logs`에 기록:
- `who`: user_id 또는 "mcp:claude" 또는 "system:rule_engine"
- `what`: 변경 내용
- `source`: "mcp" | "web" | "system"
- `metadata`: 변경 전/후 값. 선택적 `reason` 필드

## 구현 규칙

- 모든 MCP 도구는 NestJS Controller + Service 패턴으로 구현
- MCP 도구명은 snake_case
- 응답은 JSON, 에러 시 명확한 에러 메시지
- `office_id` 필터링은 Prisma middleware에서 자동 처리
