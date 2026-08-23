# Esiljang standalone snapshot contract

The Reader saves one provider snapshot and returns its location to the caller.
Collection and storage do not depend on a database, tenant, application,
workflow engine, or MCP server.

The canonical implementation is `scripts/read-active-ads.mjs`. It calls the
bundled normalizer and validator directly in memory, persists only the final
valid result, and returns one JSON value on stdout. Callers must not add a PTY
or temporary snapshot file between collection and validation.

## Inputs

The Reader has no required business identifiers. The provider and scope are
fixed by the Skill:

- `provider`: `esiljang`
- `scope`: `active_advertisements`

Use the one locally saved Esiljang credential. Account selection is not part of
the Reader input.

Never require or synthesize an office ID, tenant ID, workflow run ID, workflow
step ID, attempt number, device ID, or application-owned snapshot ID.

## Successful result

Return this shape only after normalization and completeness validation both
succeed:

```json
{
  "status": "succeeded",
  "provider": "esiljang",
  "scope": "active_advertisements",
  "activeFilter": {
    "dataValue": "ad",
    "selected": true,
    "count": 24
  },
  "observedAt": "2026-08-04T09:00:00.000Z",
  "expectedTotal": 24,
  "collectedTotal": 24,
  "pageCount": 3,
  "visitedPages": [1, 2, 3],
  "paginationComplete": true,
  "manifestHash": "<sha256>",
  "items": [],
  "warnings": [],
  "snapshotFile": {
    "path": "/Users/example/.agents/data/esiljang-ad-reader/snapshots/<file>.json",
    "fileName": "<file>.json",
    "sha256": "<file-sha256>",
    "bytes": 12345,
    "reused": false
  }
}
```

Each item follows `field-mapping.md`. Sort items by `externalAdId` in the final
result so equivalent collections have stable output. `manifestHash` is the
SHA-256 emitted by `scripts/validate-snapshot.mjs` for the canonical manifest.

When the active count is genuinely unavailable, `expectedTotal` may be `null`.
The result may still succeed only after terminal pagination is proven; preserve
the validator warning explaining that count equality could not be checked.

The default archive is
`~/.agents/data/esiljang-ad-reader/snapshots/`. Create the leaf directory with
permission `0700` and each snapshot with permission `0600`. Name a snapshot
`<observedAt>--<manifestHash>.json`, replacing timestamp colons with hyphens.

Persist the successful result without the runtime-only `snapshotFile` field,
then return `snapshotFile` on stdout. `manifestHash` covers the canonical
advertisement manifest; `snapshotFile.sha256` covers the exact pretty-printed
JSON bytes on disk. Persist `activeFilter` so the file independently proves the
selected provider scope. Recompute and compare `manifestHash`, then verify the
stored bytes before returning success.

Create the final filename without overwriting an existing file. If the same
validated snapshot already exists, verify it byte-for-byte and return
`reused=true`. Never save a partial or non-success result.

## Non-success result

`needs_agent` is an internal recoverable handoff, not a user decision:

```json
{
  "status": "needs_agent",
  "reasonCode": "ui_obstruction",
  "message": "에이전트가 열린 이실장 화면을 확인한 뒤 재개해야 합니다.",
  "diagnostics": {
    "browserSession": "esiljang-reader-1234-abcd1234",
    "resumeCommand": "node scripts/read-active-ads.mjs --resume-session esiljang-reader-1234-abcd1234"
  }
}
```

The calling agent inspects that exact session with agent-browser, closes only
UI unrelated to the read workflow, and executes `resumeCommand`. Do not surface
this state as a user question by default.

When the saved credential is missing:

```json
{
  "status": "needs_input",
  "reasonCode": "credentials_missing",
  "message": "로컬 설정창에서 이실장 계정을 저장해 주세요."
}
```

For a technical or provider failure:

```json
{
  "status": "failed",
  "reasonCode": "partial_snapshot",
  "message": "광고중 24건 중 23건만 확인되어 현재 광고 스냅샷을 반환하지 않았습니다.",
  "diagnostics": {
    "expectedTotal": 24,
    "observedTotal": 23,
    "visitedPageCount": 3
  }
}
```

Do not include credentials, browser state, raw HTML, cookies, tokens, or
partially collected advertisement items in a non-success result by default.
Use `snapshot_persistence_failed` when a complete in-memory snapshot cannot be
durably stored; do not return `succeeded` in that case.

## Consumer boundary

A caller may compare, enrich, or map the saved snapshot after the Reader returns
it. Add consumer-specific IDs and idempotency metadata outside the Reader
result. The Reader must not call downstream skills on the consumer's behalf.
