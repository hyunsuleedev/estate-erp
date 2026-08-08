---
name: esiljang-ad-reader
description: Read every actively advertising Esiljang/AIPartner advertisement through a Skill-owned browser, normalize and validate one complete standalone provider snapshot, and return it to the caller. Use for direct Codex or Claude requests, scheduled reads, and integrations that need current Esiljang advertisement data. Never modify, end, republish, approve, or persist advertisements on the caller's behalf.
---

# Esiljang Ad Reader

Treat Esiljang as the source of the authenticated account's submitted
advertisement details. The agent and this Skill own collection. The independent
`cp-browser-auth` Skill owns local credential setup and one-time login filling.
Do not require Electron, an application project, a database, or an MCP server.

## Keep the responsibility narrow

- Read every row under Esiljang's explicit `광고중` filter. Never treat the
  default `전체` view as the current-ad snapshot.
- Preserve the provider advertisement ID, full address, unit detail, terms,
  dates, status, and Naver identity exposed by Esiljang.
- Return provider observations without resolving or mutating any consumer's
  site, unit, property, listing, advertisement, or workflow records.
- Do not invoke Naver comparison, reporting, recommendation, persistence, or
  another downstream workflow. The caller decides how to use the snapshot.
- Never click or call edit, exposure-end, delete, republish, payment, approval,
  or bulk-action controls.

Read [references/provider-ui.md](references/provider-ui.md) before live browser
work, [references/field-mapping.md](references/field-mapping.md) before
normalization, and [references/snapshot-contract.md](references/snapshot-contract.md)
before returning a result.

## Choose the browser surface

1. Load the agent-browser core skill. Create one unique, headed agent-browser
   session for this collection. Never attach to an Electron window or a browser
   owned by a calling application.
2. Start the session with content boundaries, automatic dialog handling
   disabled, and navigation limited to `aipartner.com` and its subdomains.
3. Open the exact Esiljang login URL and obtain the browser-level loopback CDP
   URL with `agent-browser get cdp-url --json`.
4. Load `cp-browser-auth`. Check its one saved `esiljang` account. If the
   account is missing, let that Skill run its own configuration flow. Then let
   it fill and submit the matching AIPartner login tab through the CDP URL.
5. Require `status=authenticated`, `browserOwner=skill`, provider `esiljang`,
   and the exact advertisement-list URL. Never request a
   password, cookie, token, config file, profile contents, or browser state.
6. Continue every read, navigation, snapshot, and extraction through that same
   agent-browser session. Close it after success or technical failure. Leave it
   visible only for an explicit `needs_input` state such as CAPTCHA or MFA.
7. If agent-browser or the authentication Skill is unavailable, stop with
   `browser_login_unavailable`. Do not fall back to Electron or a local MCP
   server. A Playwright adapter may implement the same Skill-owned browser
   contract in the future.

## Read one complete snapshot

1. Treat `provider=esiljang` and `scope=active_advertisements` as fixed output
   facts, not caller inputs. Never require an application, tenant, office,
   workflow run, workflow step, attempt, device, or persistence identifier.
2. Confirm the authenticated account from a non-secret page marker. Stop on
   account ambiguity, login challenge, CAPTCHA, MFA, consent, or provider
   warning.
3. On the exact advertisement-list page, locate only
   `.statusWrap.ver3 .statusItem.statusIng.GTM_offerings_ad_list_ad_ing[data-value="ad"]`.
   Read its `.cnt` as the active expected total. The `statusAll` count is a
   diagnostic only and must never become `expectedTotal`.
4. Snapshot the filter, click that exact `광고중` control, and treat its POST
   navigation as a possible target replacement. Reattach and re-snapshot.
   Require the exact list URL, `aria-selected="true"`, active page 1, the same
   active count, and a stable row identity set. Stop with
   `active_filter_mismatch` if any condition fails. Preserve every row returned
   by the provider filter; do not add a second local status filter.
5. Only after the filter is proven active, record one capture timestamp, the
   fixed scope, active count, and an empty in-memory item collection. Do not
   begin a database transaction or create consumer-specific records.
6. Read the first page and every following page. Re-snapshot after each
   navigation or dynamic update. Scope extraction and pagination to the active
   advertisement list. Read the 이실장 매물번호 (`.numberA`) as the stable
   identity; never substitute the 네이버 매물번호 (`.numberN`). Extract other
   fields by visible table headers, not by an unverified fixed column order.
7. Normalize each page with `scripts/normalize-snapshot.mjs`. Preserve source
   page and provider URL. Accumulate normalized observations by
   `externalAdId`. Never infer an external ID from arbitrary digits or infer a
   Naver article number from anything except an explicit field or Naver URL.
8. Continue until the provider exposes no next page. Pagination may replace the
   target, so discard DOM references and reattach before reading. On every page,
   re-require the selected `광고중` control and count. Require the active page
   marker and the number of rows containing `.numberA` to remain stable across
   two observations. Detect repeated pages, duplicate IDs, disappearing rows,
   layout changes, filter resets, and pagination loops.
9. Build the final manifest and run `scripts/validate-snapshot.mjs`. Require the
   fixed scope, unique stable IDs, contiguous visited pages,
   `paginationComplete=true`, and exact agreement with the active filter count.
10. Return the complete normalized snapshot and manifest hash exactly as
    described in `references/snapshot-contract.md`. Successful reading must not
    depend on any database, application API, workflow engine, or MCP tool.

## Return incomplete work safely

Return `needs_input` when a person can resolve the condition:

- `credentials_missing`
- `captcha`
- `mfa`
- `account_ambiguous`
- `provider_warning`

Return `failed` for technical or provider failures:

- `active_filter_mismatch`
- `layout_mismatch`
- `partial_snapshot`
- `provider_unavailable`
- `browser_login_unavailable`

Never label partial items as a successful current-ad snapshot. Return only safe
diagnostics such as reason code, observed count, expected count, and visited
page count. Do not return partially collected advertisement details unless the
caller explicitly requests diagnostic evidence and the data contains no
secrets.

## Fail closed

- Never persist or expose passwords, cookies, OTPs, authorization headers,
  browser storage, raw HTML, or screenshots containing secrets.
- Never read, print, edit, snapshot, or upload the `cp-browser-auth` local
  `config.js`. Only execute that Skill's bundled scripts.
- Never let a popup or dialog approve itself. Stop when it changes scope or
  state.
- Never mutate advertisements or any caller-owned records.
- Never claim success from a loaded page, toast, one-page row count, or script
  exit alone. Require the final completeness validator to succeed.
