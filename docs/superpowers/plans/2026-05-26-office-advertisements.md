# Office Advertisements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OfficeAdvertisementGroup and OfficeAdvertisement as the persisted Naver “my ads” inventory, grouped by main office ad with related competitor ads, then expose it in 내광고관리 for unit confirmation and internal advertisement registration.

**Architecture:** Keep this separate from ExternalListingGroup because ExternalListing is scoped to watched market complexes, while OfficeAdvertisement covers the office’s complete external ad inventory. The group stores the object-level matching state and optional internal ListingAdvertisement link; child rows store individual Naver article observations, including the office’s own main ad and related competitor ads.

**Tech Stack:** Prisma split schema, NestJS modules/controllers/services, Jest service tests, shared TypeScript API client, React 19 desktop renderer with TanStack Query.

---

### Task 1: Database Models

**Files:**
- Create: `prisma/schema/office-advertisement.prisma`
- Modify: `prisma/schema/office.prisma`
- Modify: `prisma/schema/property.prisma`

- [ ] **Step 1: Add Prisma models**

Create `OfficeAdvertisementGroup` with office scoped Naver group fields, optional `listingId`, optional `listingAdvertisementId`, group status, main advertisement pointer, observed price aggregates, and source hints. Create `OfficeAdvertisement` for article rows with source, articleNo, sourceUrl, ownership flag, realtor info, price, ranking, confirmation, and raw JSON.

- [ ] **Step 2: Add relations**

Add `officeAdvertisementGroups` and `officeAdvertisements` to `Office`; add optional relations from `Listing` and `ListingAdvertisement` to `OfficeAdvertisementGroup`.

- [ ] **Step 3: Validate Prisma schema**

Run: `pnpm --filter @estate-erp/server prisma:generate`

Expected: Prisma client generation completes without schema errors.

### Task 2: Server Module

**Files:**
- Create: `apps/server/src/modules/office-advertisements/office-advertisements.service.ts`
- Create: `apps/server/src/modules/office-advertisements/office-advertisements.controller.ts`
- Create: `apps/server/src/modules/office-advertisements/office-advertisements.module.ts`
- Create: `apps/server/src/modules/office-advertisements/office-advertisements.service.spec.ts`
- Modify: `apps/server/src/app.module.ts`

- [ ] **Step 1: Write service tests**

Cover `findAllGroups`, `batchUpsert`, and `linkGroupToListing`. Verify office isolation, own ad grouping, related ad preservation, duplicate article upsert, and creating a ListingAdvertisement only after the target listing belongs to the same office.

- [ ] **Step 2: Implement service**

Implement:
- `findAllGroups(officeId, query)` with filters: status, search, source, onlyUnlinked, page, limit.
- `batchUpsert(officeId, dto)` that upserts groups and child advertisements by `[officeId, source, articleNo]`, preserves user-confirmed `listingId` and status, and sets `mainAdvertisementId`.
- `linkGroupToListing(officeId, groupId, dto)` that validates listing ownership, creates or reuses `ListingAdvertisement`, and marks the group `linked`.

- [ ] **Step 3: Implement controller and module**

Expose:
- `GET /office-advertisements/groups`
- `POST /office-advertisements/batch`
- `POST /office-advertisements/groups/:id/link-listing`
- `PATCH /office-advertisements/groups/:id`

- [ ] **Step 4: Register module**

Import `OfficeAdvertisementsModule` in `AppModule`.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @estate-erp/server test -- office-advertisements`

Expected: service tests pass.

### Task 3: API Client

**Files:**
- Create: `packages/api-client/src/modules/office-advertisements.ts`
- Modify: `packages/api-client/src/client.ts`
- Modify: `packages/api-client/src/index.ts`

- [ ] **Step 1: Add types**

Define `OfficeAdvertisementGroup`, `OfficeAdvertisement`, filter DTOs, batch upsert DTOs, and link DTOs.

- [ ] **Step 2: Add client methods**

Expose `findAllGroups`, `batchUpsert`, `updateGroup`, and `linkGroupToListing`.

- [ ] **Step 3: Typecheck client consumers**

Run: `pnpm --filter @estate-erp/api-client typecheck`

Expected: package typecheck passes.

### Task 4: Desktop 내광고관리 UI

**Files:**
- Modify: `apps/desktop/src/renderer/routes/_authenticated/properties/my-ads.tsx`

- [ ] **Step 1: Add Naver confirmation query**

Fetch `api.officeAdvertisements.findAllGroups({ onlyUnlinked: true, source: 'naver' })` alongside existing internal ads.

- [ ] **Step 2: Add tabs**

Add `내부광고`, `네이버 확인필요`, `연결완료`, `무시됨` modes using the current Notion table style.

- [ ] **Step 3: Render grouped Naver rows**

In `네이버 확인필요`, show group rows with status, site, dong hint, unit confirmation status, transaction, own ad price, related ad min/max, related count, last seen, and actions.

- [ ] **Step 4: Add link action shell**

Provide a dialog shell for selecting internal listing and confirming link. If full listing search is not already available in context, scope the first implementation to opening the dialog with the selected group and leave the server action wired behind a disabled state until listing selection data is loaded.

- [ ] **Step 5: Verify desktop UI**

Run: `pnpm --filter desktop typecheck`, then use Electron `agent-browser` to inspect `/properties/my-ads`.

Expected: tabs render, existing internal advertisement table still works, and Naver rows render from API data when present.

### Task 5: Full Verification

**Files:**
- All changed files

- [ ] **Step 1: Run targeted tests**

Run:
- `pnpm --filter @estate-erp/server test -- office-advertisements`
- `pnpm --filter desktop typecheck`

- [ ] **Step 2: Inspect git diff**

Run: `git diff --stat` and verify only planned files changed.

- [ ] **Step 3: Summarize remaining migration step**

If no migration SQL is generated in this environment, explicitly tell the user to run the repo’s migration command after reviewing the Prisma schema changes.
