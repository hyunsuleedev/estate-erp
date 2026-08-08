# Estate ERP CP snapshot MCP contract

## Boundary and state

The CP Reader saves an immutable local JSON file. This importer reads one item
at a time and maps it to Estate ERP. The server never crawls the CP provider and
the Reader never knows an Estate ERP office.

```text
session: processing -> completed
                   \-> cancelled

item:    absent -> resolved
                \-> failed
        resolved <-> failed  (same raw item may be resubmitted before completion)
```

Only one processing session may exist for an office and CP channel. The same
manifest is idempotent.

Raw and decision data remain separate:

- `raw`: the Reader item, stored unchanged as JSON data;
- `itemHash`: server-computed canonical hash of `raw`;
- `resolution`: agent evidence and chosen IDs;
- `ListingAdvertisement`: canonical ledger row, written only at completion.

## MCP sequence

1. `begin_listing_advertisement_snapshot`
2. For each local JSON item:
   - resolve Site/Dong/Unit/Property/Intake/Listing;
   - call `submit_listing_advertisement_snapshot_item` once with either a
     resolved decision or an error.
3. `get_listing_advertisement_snapshot`
4. `complete_listing_advertisement_snapshot`

Use `cancel_listing_advertisement_snapshot` only for an invalid or abandoned
snapshot. There is no append, claim, resolve, fail, or retry call: one submit
call records both the raw item and its current outcome.

## Resolve one local item

### 1. Extract matching tokens without changing raw

In working memory, derive:

- complex candidate from `complexName`, or the portion of `fullAddress` between
  the ward and `<number>동 <number>호` suffix;
- Dong and Unit tokens without optional `동` and `호` suffixes;
- transaction mapping: `매매|sale -> sale`, `전세|jeonse -> jeonse`,
  `월세|monthly -> monthly`.

Keep original text in resolution evidence.

### 2. Resolve Site and management association

1. Call `find_office_sites` and check normalized name/address matches.
2. If absent, call `search_central_sites` with the complex candidate and, when
   needed, a fuller address fragment.
3. Select only an unambiguous public Site whose name and location agree with
   `fullAddress`.
4. Call `add_office_site` if that existing Site is not managed.

`add_office_site` creates only a private OfficeSite association. Do not mutate
public Site/Dong/Unit facts.

### 3. Resolve Dong and Unit

1. Call `find_dongs({ siteId })` and match the normalized Dong token.
2. Call `find_units({ siteId, dongId })` and match the normalized Unit token.
3. Confirm the Unit belongs to the chosen Dong and Site.

Submit an error when no exact Unit exists. The MCP has no public Unit creation
operation.

### 4. Resolve or create Property

Call `find_properties({ siteId, unitId })`. Reuse the exact office Property or
call `create_property({ siteId, unitId })` when absent.

### 5. Resolve Intake and Listing

Call `find_listing_intakes({ propertyId, includeClosed: false })` and
`find_listings({ propertyId, transactionType, includeClosed: false })`.

- Reuse the current same-transaction Listing when present.
- If an open/hold intake exists, call
  `create_listing({ intakeId, propertyId, transactionType, ...initialTerms })`.
- If no current intake exists, call
  `create_listing_intake({ propertyId, lifecycleStatus: "open", listings:
  [{ transactionType, ...initialTerms }] })` and use its nested Listing.

Do not reopen a closed intake solely for this import. Do not overwrite an
existing Listing's terms; the advertisement keeps observed terms separately.

| CP transaction | Initial Listing fields |
| --- | --- |
| sale / 매매 | `price = advertisedPrice` |
| jeonse / 전세 | `price = advertisedDeposit` |
| monthly / 월세 | `deposit = advertisedDeposit`, `monthlyRent = advertisedMonthlyRent` |

### 6. Submit the item once

Resolved input:

```json
{
  "sessionId": "...",
  "raw": { "externalAdId": "64850265", "fullAddress": "..." },
  "listingId": "...",
  "resolution": {
    "fullAddress": "명일동 래미안솔베뉴 105동 704호",
    "complexCandidate": "래미안솔베뉴",
    "siteId": "...",
    "dongId": "...",
    "unitId": "...",
    "propertyId": "...",
    "intakeId": "...",
    "transactionType": "sale",
    "matchBasis": "exact_site_name_and_dong_unit"
  }
}
```

Failed input:

```json
{
  "sessionId": "...",
  "raw": { "externalAdId": "64850265", "fullAddress": "..." },
  "error": "관리 단지에는 있지만 1동 2810호 Unit을 찾지 못함"
}
```

Submit exactly one outcome. The server checks that the final `listingId`
belongs to the authenticated office; evidence IDs are not a second write path.

## Completion guarantees

Completion is rejected unless:

- submitted count equals the Reader count when count is available;
- every submitted item is resolved;
- externalAdIds are unique;
- the manifest recomputed from all submitted raw items matches the Reader hash;
- no two current CP items resolve to the same Listing for one channel.

Only then does one SQL transaction update the advertisement ledger and end
missing prior `cp_sync` rows. A partial import never changes that ledger.
