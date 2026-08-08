# Estate ERP MCP contract

## Required sequence

1. Read the full CP-imported `ListingAdvertisement` scope.
2. Start one advertising-note snapshot with
   `create_external_listing_snapshot_session`.
3. Write Naver observations with `batch_upsert_external_listings`.
4. Complete the snapshot only if the scope is complete; otherwise cancel it.
5. In the current Naver response, identify the own row by the CP-provided
   `ListingAdvertisement.naverArticleNo`. Do not query or join `ExternalListing`
   for this step.
6. Write each own advertisement's independent current comparison with
   `batch_upsert_office_advertisements`.
7. Return analysis and recommendations for every CP-imported advertisement to
   the caller. A local advertisement Task runner may use them as evidence.

## Snapshot calls

```json
{
  "siteId": "uuid",
  "transactionType": "sale"
}
```

The `siteId` and Naver `complexNo` must come from an enabled row in the local
SQLite owned by `naver-complex-collector`. Its `externalCode` is the exact Naver
`complexNo`. `Site.naverComplexCode` is at most an explicit import suggestion
and is never a direct collection input. A site with no local row is out of scope
— report `unmapped_site` rather than resolving the complex by name.

Use the returned session ID for
`complete_external_listing_snapshot_session` or
`cancel_external_listing_snapshot_session`. Completion is forbidden for partial
or uncertain captures because it deactivates unseen old advertisements.

## Current comparison projection

Tool: `batch_upsert_office_advertisements`

```json
{
  "groups": [
    {
      "listingAdvertisementId": "uuid",
      "advertisements": [
        {
          "articleNo": "2412345678",
          "isMine": true,
          "isMain": true,
          "ranking": 3,
          "floorInfo": "중/25",
          "verificationTypeCode": "OWNER"
        },
        {
          "articleNo": "2412345680",
          "isMine": false,
          "isMain": false,
          "ranking": 5,
          "price": 149000,
          "floorInfo": "12/25",
          "verificationTypeCode": "DOC"
        }
      ]
    }
  ]
}
```

Every group is keyed by its CP-source `ListingAdvertisement.id`. Exactly one row
is `isMain`, and that row's `articleNo` must equal
`ListingAdvertisement.naverArticleNo`. Persist all visible duplicates, not only
the own row. Preserve Naver's visible `floorInfo`; the server derives
`floorExposureMode` (`exact`, `band`, or `unknown`) so a caller must not provide
or guess it. `verificationTypeCode` is optional source evidence, not a floor
inference. `ExternalListing` IDs are never accepted by this tool and are never
stored on the group.

Analysis must mark the group for staff review whenever any active non-own row
has strictly cheaper comparable terms, even when that row ranks behind the own
advertisement. Rank is supporting evidence, not a prerequisite for the price
warning. For monthly rent, "cheaper" means deposit and monthly rent are both no
higher and at least one is lower; opposite-moving terms are incomparable.

## Duplicate and exception handling

- A full refresh compares every CP-imported advertisement. Selection and stale
  age are not scope filters.
- If one row fails, record the row-level failure and continue only when the
  remaining scopes can still be captured completely.
- If a snapshot scope is partial, cancel that scope and do not mark unseen rows
  inactive.
- Mapping ambiguity is reported as a comparison error. Never guess or edit
  reviewed evidence in place.
