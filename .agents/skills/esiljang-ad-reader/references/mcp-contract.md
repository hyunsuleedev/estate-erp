# Esiljang reader MCP contract

The reader crosses two independent boundaries:

1. Local Electron MCP: credential readiness and an authenticated visible browser
   session.
2. Estate ERP MCP: office-scoped staged snapshot persistence.

Neither boundary may return a password or browser authentication material.

## Local authentication tools

### `cp_auth_status`

Input:

```json
{ "officeId": "<office uuid>" }
```

Require the assigned runner device and a saved `esiljang` credential. Do not
infer that credentials belong to another office.

### `cp_auth_prepare_session`

Input:

```json
{
  "officeId": "<office uuid>",
  "provider": "esiljang"
}
```

Current result fields are `provider`, `deviceId`, `status`, `targetUrl`,
`windowId`, and `message`. A future local bridge may additionally return a
short-lived `sessionAlias` or debugging attachment handle. It must never return
passwords, cookies, tokens, or a reusable browser profile.

Require:

- `provider=esiljang`
- `status=authenticated`
- the workflow's exact `runnerDeviceId`
- an AIPartner target URL
- either an attachable browser handle or a visible `windowId` supported by the
  selected computer-use surface

## Required Estate ERP snapshot tools

The full import requires an office-scoped staging contract. If these tools are
not exposed, return `persistence_contract_unavailable`; do not fall back to
generic listing-advertisement CRUD.

### `begin_cp_advertisement_snapshot`

```json
{
  "officeId": "<office uuid>",
  "provider": "esiljang",
  "workflowRunId": "<run id>",
  "workflowStepId": "<step id>",
  "attempt": 1,
  "observedAt": "2026-07-29T08:30:00.000Z",
  "expectedTotal": 24,
  "idempotencyKey": "advertisement-sync:<run>:cp_import_esiljang:attempt:1"
}
```

Return a `snapshotId`. Reusing the same idempotency key must return the same
open snapshot or its terminal receipt.

### `batch_upsert_cp_advertisement_items`

```json
{
  "officeId": "<office uuid>",
  "snapshotId": "<snapshot id>",
  "provider": "esiljang",
  "items": []
}
```

Each item follows `field-mapping.md`. Upsert staged rows by
`(snapshotId, externalAdId)`. Reject provider or office mismatch. This call must
not mutate canonical `ListingAdvertisement`, `Property`, or `Unit` rows.

### `complete_cp_advertisement_snapshot`

```json
{
  "officeId": "<office uuid>",
  "snapshotId": "<snapshot id>",
  "provider": "esiljang",
  "paginationComplete": true,
  "expectedTotal": 24,
  "collectedTotal": 24,
  "visitedPages": [1, 2, 3],
  "manifestHash": "<sha256 of canonical normalized manifest>"
}
```

The server must validate uniqueness, staged count, provider, office, workflow
attempt, and idempotency before one atomic commit. Only this commit may:

- create or refresh provider observations;
- hand unresolved rows to exact listing/unit resolution;
- reconcile unseen rows from the previous successful Esiljang snapshot as
  ended.

Return a durable receipt containing at least `snapshotId`, `committedAt`,
`createdCount`, `updatedCount`, `endedCount`, and `unresolvedCount`.

### `cancel_cp_advertisement_snapshot`

```json
{
  "officeId": "<office uuid>",
  "snapshotId": "<snapshot id>",
  "provider": "esiljang",
  "reasonCode": "partial_snapshot",
  "message": "Provider total was 24 but only 23 unique advertisements were read"
}
```

Cancellation discards or tombstones only staging data. It must preserve the
last successful canonical snapshot.

## Workflow result

Return this result to the agent control plane:

```json
{
  "status": "succeeded",
  "progress": {
    "current": 24,
    "total": 24,
    "label": "이실장 광고 24건 가져오기 완료"
  },
  "snapshotId": "<snapshot id>",
  "observedAt": "2026-07-29T08:30:00.000Z",
  "pageCount": 3,
  "collectedCount": 24,
  "unresolvedCount": 2,
  "warningCodes": []
}
```

For a human-needed blocker, return `needs_input` plus one stable reason code and
a concise safe message. For technical failure, return `failed`. Do not create a
normal CRM Task, an `AgentActionRequest`, or the Naver comparison from this
reader.

## Current integration gap

At the time this contract was written, the local MCP exposes only
`cp_auth_status` and `cp_auth_prepare_session`, and the Estate ERP MCP exposes
generic `ListingAdvertisement` CRUD rather than the four staging tools above.
Therefore a live full import must fail closed until the staging tools exist.
This is intentional: `ListingAdvertisement.listingId` is already resolved,
while CP collection occurs before the workflow's exact listing/unit resolution
step. The current workflow input's `writeTarget=listing_advertisements` must
also change to the staged target when this contract is implemented.

The local authentication result currently exposes `windowId` but no
agent-browser attachment alias. Use the visible computer-use fallback until a
short-lived attachment bridge exists. Also keep the local login implementation
aligned with the verified Esiljang submit selector `#integrated-login > a`;
the reader itself must never compensate by handling credentials.
