---
name: esiljang-ad-reader
description: Read every current Esiljang/AIPartner advertisement for one Estate ERP office through its authenticated local browser session, stage one complete CP snapshot for later exact listing and unit resolution, and return durable workflow progress. Use for Esiljang full imports and scheduled My Ads refreshes. Never modify, end, republish, or approve an advertisement.
---

# Esiljang Ad Reader

Treat Esiljang as the source of the office's submitted advertisement details and
Estate ERP as durable memory. The agent and this skill are the collector.
Electron only owns encrypted credentials and the authenticated local browser
session.

## Keep the responsibility narrow

- Read all current Esiljang advertisements for exactly one office.
- Preserve the CP advertisement ID, full address, unit detail, terms, dates, and
  Naver identity exposed by Esiljang.
- Stage observations without guessing `Site`, `Dong`, `Unit`, `Property`, or
  `ListingAdvertisement` relationships. The downstream
  `resolve_exact_listing_and_unit` step owns that decision.
- Do not run the Naver comparison directly. Successful completion unlocks the
  existing `naver-real-estate-reader` workflow step.
- Never click or call edit, exposure-end, delete, republish, payment, approval,
  or bulk-action controls.

Read [references/provider-ui.md](references/provider-ui.md) before live browser
work, [references/field-mapping.md](references/field-mapping.md) before
normalization, and [references/mcp-contract.md](references/mcp-contract.md)
before constructing persistence payloads.

## Choose the browser surface

1. Prefer agent-browser when the local CP MCP returns an attachable session
   alias or debugging endpoint for the authenticated Electron window.
2. Otherwise use the visible `computer-use-v1` window identified by `windowId`.
3. Load the matching browser-control skill before operating either surface.
4. Keep the window visible and interruptible. Never export cookies, save browser
   state, copy a profile, or ask the user to reveal a password to the agent.
5. If neither surface can attach to the prepared session, stop with
   `session_attach_unavailable`.

## Run a complete import

1. Bind the run to the supplied `officeId`, workflow run, workflow step,
   `runnerDeviceId`, provider `esiljang`, and scope `all_advertisements`. Reject
   missing or conflicting identity.
2. Require the CP snapshot tools in the MCP contract. Do not substitute generic
   `create_listing_advertisement` or `update_listing_advertisement`; those
   require an already-resolved internal listing and cannot represent an atomic
   full import.
3. Call local `cp_auth_status`. Require a saved Esiljang credential on the
   assigned device. Call `cp_auth_prepare_session` and require
   `status=authenticated`, the same `deviceId`, an allowed AIPartner URL, and a
   usable browser handle.
4. Confirm the expected office or account from a non-secret page marker. Stop
   on account ambiguity, login challenge, CAPTCHA, MFA, consent, or provider
   warning.
5. Begin one staged snapshot with a stable idempotency key derived from the
   workflow run, step, and attempt. Record the capture start time and provider
   total when visible.
6. Read the first page and every following page. Re-snapshot after each
   navigation or dynamic update. Extract rows by the visible table headers and
   stable provider identity, not by an unverified fixed column order.
7. Normalize each page with `scripts/normalize-snapshot.mjs`. Preserve source
   page and management URL. Batch-upsert only normalized staged observations.
   Never infer an external ID from arbitrary digits or infer a Naver article
   number from anything except an explicit field or Naver URL.
8. Continue until the provider exposes no next page. Detect repeated pages,
   duplicate IDs, disappearing rows, unexpected layout changes, and
   pagination loops.
9. Build the final manifest and run `scripts/validate-snapshot.mjs`. Require
   unique stable IDs, all visited pages, `paginationComplete=true`, and exact
   agreement with the provider total when it is available.
10. Complete the snapshot only after validation succeeds. Completion may
    reconcile previously active rows as ended; a partial or failed snapshot
    must preserve the last successful canonical state.
11. Return a structured result containing `snapshotId`, counts, page count,
    `observedAt`, warning codes, and unresolved mapping count. Let the workflow
    engine unlock the resolver and Naver comparison steps.

## Cancel incomplete work

Cancel the staged snapshot before returning a non-success result when any of
these occurs:

- `credentials_missing`
- `captcha`
- `mfa`
- `account_mismatch`
- `layout_mismatch`
- `partial_snapshot`
- `provider_unavailable`
- `session_attach_unavailable`
- `persistence_contract_unavailable`

Use `needs_input` only when a person can resolve the condition, such as missing
credentials, CAPTCHA, MFA, or account choice. Use `failed` for technical or
provider failures. A row that cannot yet map to an internal unit is not an
import failure; preserve it for the resolver.

## Fail closed

- Never persist passwords, cookies, OTPs, authorization headers, browser storage,
  profile data, raw HTML, or screenshots containing secrets.
- Never let an arbitrary popup or dialog approve itself. Read it and stop if it
  changes scope or state.
- Never use the legacy Python program's mutation, scheduling, anti-detection,
  configuration-file, or token-storage behavior.
- Never mark unseen advertisements ended unless a complete snapshot has been
  atomically committed.
- Never put office-private observations into public `Unit` data. Preserve them
  in the office-scoped import until the resolver links them.
- Never claim success from a loaded page, toast, row count from one page, or
  script exit alone. Require a committed snapshot receipt.
