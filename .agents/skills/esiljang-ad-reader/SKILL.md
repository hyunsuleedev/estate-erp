---
name: esiljang-ad-reader
description: Read every actively advertising Esiljang/AIPartner advertisement and preserve each complete validated result as an append-only local JSON snapshot. Use for direct Codex or Claude requests, scheduled reads, and integrations that need an auditable current Esiljang advertisement snapshot. Never modify, end, republish, or approve advertisements.
---

# Esiljang Ad Reader

Read the authenticated account's complete `광고중` snapshot and save the
validated result without requiring Electron, an application project, a
database, or an MCP server. Let the independent `cp-browser-auth` Skill own the
one locally saved credential and one-time login filling. Treat
`provider=esiljang` and `scope=active_advertisements` as fixed output facts.

## Run the canonical reader

1. Load the agent-browser core Skill and `cp-browser-auth` before a live run.
2. Execute the bundled runner from this Skill directory:

   ```bash
   node scripts/read-active-ads.mjs
   ```

   Use `--pretty` only when human-readable JSON is useful. Do not pass provider,
   account, office, tenant, workflow, device, or persistence identifiers.
3. Treat the runner's single stdout JSON value as the Skill result. Exit code
   `0` means the complete snapshot was both validated and saved. Exit code `3`
   means `needs_agent`, `2` means `needs_input`, and `1` means `failed`.
4. Read `snapshotFile.path` from a successful result. The immutable JSON is
   stored under `~/.agents/data/esiljang-ad-reader/snapshots/` by default.

Use the runner for the normal browser and pagination path. Keep the agent in
control of unexpected page UI instead of encoding every popup into static
rules. Never pass snapshot JSON through a PTY; the runner imports the
normalizer and validator directly.

## Resolve unexpected UI as the agent

When the runner returns `status=needs_agent` and `reasonCode=ui_obstruction`,
do not ask the user merely because a popup appeared:

1. Read `diagnostics.browserSession` and inspect that same headed session:

   ```bash
   agent-browser --session <browserSession> snapshot -i -c
   ```

2. Judge the visible popup, banner, overlay, or notice against the current
   read-only goal. If it is unrelated to selecting and reading `광고중`, click
   its close control with a fresh snapshot ref.
3. Re-snapshot and confirm the obstruction disappeared. Do not click an action
   that changes an advertisement or expands the workflow's scope.
4. Run the exact `diagnostics.resumeCommand`. It restarts collection from page
   1 in the same authenticated browser, so no partial in-memory page is reused.
5. Repeat this inspection-and-resume loop if another unrelated UI obstruction
   appears.

Do not maintain a fixed list of popup texts. The agent decides relevance from
the live UI and the requested workflow.

## Trust the runner's narrow workflow

The runner performs these steps atomically:

- Check or configure the one saved `esiljang` credential through
  `cp-browser-auth` without reading its secret config.
- Create one unique headed agent-browser session restricted to
  `aipartner.com`, with automatic dialog handling disabled.
- Authenticate through the browser-level loopback CDP URL and require the exact
  advertisement-list target.
- Select only
  `.statusWrap.ver3 .statusItem.statusIng.GTM_offerings_ad_list_ad_ing[data-value="ad"]`
  and prove `aria-selected="true"`, stable page identity, and the unchanged
  active count. A mismatch is `active_filter_mismatch`.
- Read every page by visible table headers, using `.numberA` as the stable
  Esiljang identity and `.numberN` only as the optional Naver identity.
- Detect duplicate IDs, repeated pages, filter resets, layout changes, partial
  counts, and pagination contradictions.
- Normalize, sort, validate, and hash the complete in-memory snapshot.
- Atomically persist only that successful final snapshot as a permission-`0600`
  JSON file, verify the stored bytes, return its path and file hash, then close
  the browser. No partial collection or browser state is persisted.

The provider's selected `광고중` filter defines membership. Preserve every row
it returns, including an exceptional row status such as `거래완료`; never add a
second local status filter.

## Keep the responsibility narrow

- Return provider observations without resolving or mutating any consumer's
  site, unit, property, listing, advertisement, or workflow records.
- Do not invoke Naver comparison, reporting, recommendation, application
  persistence, or another downstream workflow. Own only the standalone JSON
  snapshot archive.
- Never click or call edit, exposure-end, delete, republish, payment, approval,
  or bulk-action controls.
- Never return partial advertisement items as a successful current snapshot.

## Handle non-success results

Keep the Skill browser visible for `needs_agent` so the agent can inspect and
resume it. Credential setup remains owned by the separate local configuration
page in `cp-browser-auth`.

Return safe diagnostics for these result codes:

- `needs_agent`: `ui_obstruction`
- `needs_input`: `credentials_missing` or a rare auth state that truly requires
  the account owner
- `failed`: `active_filter_mismatch`, `layout_mismatch`, `partial_snapshot`,
  `provider_unavailable`, `browser_login_unavailable`,
  `snapshot_persistence_failed`

Never expose passwords, cookies, OTPs, authorization headers, browser storage,
raw HTML, or the auth Skill's generated `config.js`.

## Load references only when needed

- Read [references/snapshot-contract.md](references/snapshot-contract.md) before
  returning or persisting a result.
- Read [references/provider-ui.md](references/provider-ui.md) when diagnosing a
  provider/layout failure or changing browser extraction.
- Read [references/field-mapping.md](references/field-mapping.md) when changing
  normalization or consumer field handling.
