---
name: estate-erp-ad-task-runner
description: Run an Estate ERP Task whose category is advertisement using the user's local CP and Naver Skills. Use when the user asks Codex or Claude to process pending advertising work, update or take down CP ads, refresh CP snapshots, or optionally save raw Naver duplicate-ad JSON. The ERP Task is the only server-visible work state; detailed steps, retries, evidence, and failures stay in local SQLite.
---

# Estate ERP Advertisement Task Runner

Use an ordinary Estate ERP `Task` as the work request and coordination lock.
Never create a server agent session, wakeup, run, action request, or detailed
workflow. The user starts their subscribed AI; the ERP server does not wake it.

Read [references/task-contract.md](references/task-contract.md) before changing a
Task or invoking a provider-writing Skill.

## Boundary

- ERP owns Task status and verified business snapshots.
- This Skill owns the execution plan, detailed steps, attempts, diagnostics, and
  non-secret evidence in local SQLite.
- CP reader/importer Skills refresh durable observations in ERP only after a
  complete read.
- Raw Naver duplicate-ad collection is optional and runs only when the Task or
  current user explicitly requests it. Its JSON stays local and unclassified.
- Provider credentials remain in the provider auth Skill. Never copy them into
  Task content, SQLite details, screenshots, or MCP payloads.

The local database defaults to
`~/.agents/data/estate-erp-ad-task-runner/state.sqlite`. Override only for tests
or an explicitly isolated profile with `ESTATE_ERP_AD_TASK_DB_PATH`.

## Run one Task

1. Call `find_tasks` with `category="advertisement"` and `status="pending"`.
   If the user named a Task, call `get_task` and verify the same category and
   status. Never reinterpret a general Task as provider-write authorization.
2. Call `claim_task` immediately before execution. This atomically assigns the
   Task to the current ERP user and changes it to `in_progress`. If it conflicts,
   stop; another executor or employee owns it.
3. Load the linked `AdvertisementChangeRequest` items for this Task via
   `find_advertisement_change_requests({ includeClosed: false })` (matching the
   requests whose `task.id` equals the claimed Task ID) and inspect the
   office's CP accounts with `list_office_cp_accounts`. A single batch Task may
   contain multiple `publish` / `update` / `readvertise` / `takedown` requests.
4. Start the local run:

   ```bash
   node scripts/run-state.mjs begin --task-id <task-id> --task-json '<task-json>'
   ```

   A reused active run means this Task is already running locally. Resume it
   after inspecting `show`; do not start a duplicate provider session.
5. Translate the Task and its `AdvertisementChangeRequest` rows into an exact
   local plan. Verify each target by `listingAdvertisementId` (or `listingId`
   for `publish`), `channel`, `cpAccount.accountKey`, `externalAdId`,
   `baseSnapshot`, and `targetValue` (prices in 만원; jeonse uses `deposit`).
   Confirm the active login account matches the request's `accountKey` before
   mutating any CP record. Read the current CP state with the appropriate reader
   and import a complete snapshot with `estate-erp-cp-ad-importer` (passing
   `--account-key <accountKey>`) before proposing changes.
6. Only when explicitly requested, pass the completed Esiljang Reader JSON to
   `naver-real-estate-reader` and save its raw duplicate-ad JSON to the selected
   local path. Do not compare rows, classify ownership, or upload that Naver
   snapshot to ERP.
7. Present the exact provider changes to the user: target, CP account
   (`accountKey`), action (`publish`/`update`/`readvertise`/`takedown`), current
   value, and `targetValue`. Obtain clear confirmation in the current
   conversation before the first provider write.
8. Invoke the provider manager Skill with the confirmed local plan. Transition
   each `AdvertisementChangeRequest` through MCP and record detailed transitions
   in local SQLite:
   - Before writing: `update_advertisement_change_request({ id, status: "in_progress" })`
   - Right after confirmed UI write: `update_advertisement_change_request({ id, status: "executed" })`
   - On block/failure: `update_advertisement_change_request({ id, status: "failed", failureReason })`

   ```bash
   node scripts/run-state.mjs step --run-id <run-id> --key target_confirm --status running
   node scripts/run-state.mjs step --run-id <run-id> --key target_confirm --status succeeded
   ```

   The provider manager owns its necessary UI sequence. Do not mirror those
   steps into ERP Task content.
9. Re-read the provider's persisted state with the reader and import the complete
   post-change CP snapshot via `estate-erp-cp-ad-importer`. Never mark a request
   `verified` directly — `complete_listing_advertisement_snapshot` automatically
   verifies matching `AdvertisementChangeRequest` rows when observed values
   match `targetValue` (and auto-completes the parent `Task` once every request
   in the batch is verified). Mark success only when observed state matches
   the confirmed plan.
10. Finish the local run and verify `update_task` with `status="completed"`
    (unless already auto-completed by snapshot verification) once provider
    persistence is re-read and verified:

    ```bash
    node scripts/run-state.mjs finish --run-id <run-id> --status completed \
      --result-json '{"verified":true}'
    ```

    Keep any user-facing result short, for example “광고 수정 완료 및 재조회
    검증”. Do not replace the original request or its stable target identifiers;
    update only the status, or append a one-line `실행 메모` to the existing
    content.

## Failure and resume

- CAPTCHA, MFA, login ambiguity, target mismatch, or unclear consent: stop before
  writing, record `needs_input`, and set the ERP Task back to `pending`. If the
  blocker must be visible in ERP, append a concise `실행 메모` without replacing
  the original request or target identifiers. Never store the challenge response
  or secret.
- Provider write attempted but final state is unverified: record `failed`; keep
  the Task `in_progress` until the user decides whether to retry or cancel. Do
  not claim success from a toast or click alone.
- User cancels the request: finish the local run as `cancelled` and update the
  Task to `cancelled`.
- A new run after failure creates a new local run. Historical attempts remain
  local and are never uploaded as a server workflow.

Inspect state with:

```bash
node scripts/run-state.mjs show --task-id <task-id>
node scripts/run-state.mjs list --status running
```

## Invariants

- One active local run per Task, plus the server's atomic Task claim.
- No polling loop, worker daemon, server wakeup, or hidden background execution.
- No provider mutation without exact target resolution and current-session user
  confirmation.
- No “completed” Task until provider persistence is re-read and verified.
- No Naver writes. Naver Skills are observation-only.
