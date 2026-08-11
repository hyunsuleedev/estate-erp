# Naver duplicate-ad snapshot contract

This Skill converts one completed Esiljang advertisement snapshot plus a set of
read-only Naver responses into one standalone local JSON file. A database,
office, site, complex mapping, workflow, task, or MCP server is not part of the
contract.

## Source input

The source must be a successful result from `esiljang-ad-reader`:

```json
{
  "status": "succeeded",
  "provider": "esiljang",
  "scope": "active_advertisements",
  "observedAt": "2026-08-08T09:00:00.000Z",
  "expectedTotal": 2,
  "collectedTotal": 2,
  "paginationComplete": true,
  "manifestHash": "<sha256>",
  "items": [
    {
      "externalAdId": "ES-1001",
      "naverArticleNo": "2612345678"
    }
  ]
}
```

`naverArticleNo` may be absent or `null`; that item is recorded as skipped.
Any non-null value must already be a digits-only string. The collector does not
derive it from another field. The source file is opened read-only and is never
used as an output path.

## Prepared scope

`scripts/prepare-collection.mjs` emits a deterministic plan:

```json
{
  "version": 1,
  "ready": true,
  "source": {
    "provider": "esiljang",
    "scope": "active_advertisements",
    "observedAt": "2026-08-08T09:00:00.000Z",
    "manifestHash": "<sha256>"
  },
  "sourceItemTotal": 2,
  "targetTotal": 1,
  "skippedTotal": 1,
  "targets": [
    {
      "naverArticleNo": "2612345678",
      "sourceAdvertisements": [{ "itemIndex": 0, "externalAdId": "ES-1001" }]
    }
  ],
  "skipped": [
    {
      "itemIndex": 1,
      "externalAdId": "ES-1002",
      "reasonCode": "missing_naver_article_no"
    }
  ]
}
```

Repeated article numbers produce one target with multiple source references.
Target order is stable by article number.

## Browser response envelope

Pass this transient value to `scripts/write-snapshot.mjs` through a protected
temporary file or stdin:

```json
{
  "collectedAt": "2026-08-08T10:00:00.000Z",
  "results": [
    {
      "naverArticleNo": "2612345678",
      "status": "succeeded",
      "httpStatus": 200,
      "response": []
    },
    {
      "naverArticleNo": "2612345679",
      "status": "failed",
      "httpStatus": 429,
      "reasonCode": "rate_limited",
      "message": "Naver remained rate-limited after one permitted retry."
    }
  ]
}
```

There must be at most one result per prepared target and no result for an
unknown number. A missing result becomes `not_collected`. Successful `response`
is the decoded Naver JSON value, preserved without row classification. The
envelope must not contain headers, cookies, authorization values, raw HTML, or
browser state.

## Saved snapshot

```json
{
  "version": 1,
  "status": "succeeded",
  "provider": "naver",
  "scope": "duplicate_advertisements_by_article",
  "collectedAt": "2026-08-08T10:00:00.000Z",
  "source": {
    "provider": "esiljang",
    "scope": "active_advertisements",
    "observedAt": "2026-08-08T09:00:00.000Z",
    "manifestHash": "<source-sha256>"
  },
  "sourceItemTotal": 1,
  "requestedTotal": 1,
  "succeededTotal": 1,
  "failedTotal": 0,
  "skippedTotal": 0,
  "queries": [
    {
      "naverArticleNo": "2612345678",
      "sourceAdvertisements": [{ "itemIndex": 0, "externalAdId": "ES-1001" }],
      "httpStatus": 200,
      "response": []
    }
  ],
  "failures": [],
  "skipped": [],
  "manifestHash": "<snapshot-sha256>"
}
```

Status semantics:

- `succeeded`: every prepared target succeeded and no source item was skipped.
- `partial`: at least one target succeeded, but another target failed or a
  source item lacked `naverArticleNo`.
- `failed`: no prepared target succeeded. A source with no article numbers is
  rejected before file creation as `no_naver_article_numbers`.

`manifestHash` is SHA-256 over the canonical saved value excluding the hash
field itself. The writer stores the decoded response value; it does not promise
byte-for-byte preservation of the provider's whitespace or object key order.

## Explicit non-goals

The snapshot contains no ownership flag, main-ad flag, comparison, ranking,
price recommendation, complex mapping, SQLite identity, ERP identity, or
database schema projection. A later caller may consume the file, but this Skill
does not invoke that caller or reinterpret a persistence failure as a Naver read
failure.
