# Esiljang standalone snapshot contract

The Reader returns one provider snapshot to its caller. Collection success does
not depend on a database, tenant, application, workflow engine, or MCP server.

## Inputs

The Reader has no required business identifiers. The provider and scope are
fixed by the Skill:

- `provider`: `esiljang`
- `scope`: `active_advertisements`

Use the one locally saved Esiljang credential. Account selection is not part of
the Reader input.

Never require or synthesize an office ID, tenant ID, workflow run ID, workflow
step ID, attempt number, device ID, snapshot ID, or write target.

## Successful result

Return this shape only after normalization and completeness validation both
succeed:

```json
{
  "status": "succeeded",
  "provider": "esiljang",
  "scope": "active_advertisements",
  "observedAt": "2026-08-04T09:00:00.000Z",
  "expectedTotal": 24,
  "collectedTotal": 24,
  "pageCount": 3,
  "visitedPages": [1, 2, 3],
  "paginationComplete": true,
  "manifestHash": "<sha256>",
  "items": [],
  "warnings": []
}
```

Each item follows `field-mapping.md`. Sort items by `externalAdId` in the final
result so equivalent collections have stable output. `manifestHash` is the
SHA-256 emitted by `scripts/validate-snapshot.mjs` for the canonical manifest.

When the active count is genuinely unavailable, `expectedTotal` may be `null`.
The result may still succeed only after terminal pagination is proven; preserve
the validator warning explaining that count equality could not be checked.

Return the JSON value directly to the caller. If the caller explicitly requests
a file, write the same value to the caller-selected path; do not assume a
project directory or application-owned storage location.

## Non-success result

For a human-resolvable state:

```json
{
  "status": "needs_input",
  "reasonCode": "captcha",
  "message": "열린 이실장 로그인 화면에서 추가 인증을 완료해 주세요."
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

## Consumer boundary

A caller may store, compare, enrich, or map the successful snapshot after the
Reader returns it. Add consumer-specific IDs and idempotency metadata outside
the Reader result. A persistence failure must not retroactively turn a valid
provider read into a Reader failure, and the Reader must not call downstream
skills on the consumer's behalf.
