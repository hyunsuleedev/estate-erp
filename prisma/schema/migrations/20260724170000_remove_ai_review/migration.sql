-- AI 검토함과 규칙 기반 제안 큐를 제품 범위에서 제거한다.
DROP TABLE "proposal_actions";
DROP TABLE "entity_draft_comments";
DROP TABLE "proposals";
DROP TABLE "entity_drafts";
DROP TABLE "rules";

ALTER TABLE "offices"
  DROP COLUMN "agent_enabled",
  DROP COLUMN "agent_trust_config",
  DROP COLUMN "mcp_permission_defaults";

ALTER TABLE "users"
  DROP COLUMN "mcp_permissions";
