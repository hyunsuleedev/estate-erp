# Task Assignment Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tasks support unassigned queues, explicit assignment metadata, and durable links to buyer requirements, matches, deals, and contracts.

**Architecture:** Keep `Task.status` as the workflow state and use nullable assignment fields for unassigned work. Add direct Prisma FKs for missing CRM contexts, then pass those fields through the NestJS service, API client, MCP tool, and task pages.

**Tech Stack:** NestJS, Prisma multi-file schema, PostgreSQL migrations, Jest, React/TanStack Query.

---

### Task 1: Service Behavior

**Files:**
- Create: `apps/server/src/modules/tasks/tasks.service.spec.ts`
- Modify: `apps/server/src/modules/tasks/tasks.service.ts`

- [ ] Add tests that `create()` persists `createdById`, `assignedById`, `assignedAt`, `buyerReqId`, `matchId`, `dealId`, and `contractId`.
- [ ] Add tests that `update()` stamps `assignedById` and `assignedAt` when a task is assigned, and clears assignment metadata when unassigned.
- [ ] Implement only the service behavior needed for those tests.

### Task 2: Schema and Migration

**Files:**
- Modify: `prisma/schema/task.prisma`
- Modify: `prisma/schema/office.prisma`
- Modify: `prisma/schema/crm.prisma`
- Create: `prisma/schema/migrations/20260502143000_add_task_assignment_context/migration.sql`

- [ ] Add task assignment metadata fields and relations to `User`.
- [ ] Add `buyerReqId`, `matchId`, `dealId`, and `contractId` relations.
- [ ] Add matching PostgreSQL columns, indexes, and `ON DELETE SET NULL` foreign keys.

### Task 3: API Surface

**Files:**
- Modify: `apps/server/src/modules/tasks/tasks.controller.ts`
- Modify: `apps/server/src/modules/mcp/mcp-tools.service.ts`
- Modify: `apps/server/src/modules/agent/executor/executor.service.ts`
- Modify: `packages/api-client/src/modules/tasks.ts`

- [ ] Pass the current user into manual task create/update calls.
- [ ] Expose new context fields in create/update DTOs and task response types.
- [ ] Let MCP and rule executor create tasks with the new context fields.

### Task 4: Task Page UX

**Files:**
- Modify: `apps/desktop/src/renderer/routes/_authenticated/tasks/index.tsx`
- Modify: `apps/web/src/routes/_authenticated/tasks/index.tsx`

- [ ] Fetch active employees for task assignment controls.
- [ ] Add an assignee filter with `전체 담당자`, `미배정`, and employee choices.
- [ ] Add an assignee picker in task rows/cards and form modal.
- [ ] Preserve the existing `내 업무` quick toggle.

### Task 5: Verification

**Commands:**
- `pnpm --filter @estate-erp/server test -- tasks.service.spec.ts`
- `pnpm --filter @estate-erp/server typecheck`
- `pnpm --filter @estate-erp/desktop typecheck`
- `pnpm --filter @estate-erp/web typecheck`
- `pnpm prisma:generate`
