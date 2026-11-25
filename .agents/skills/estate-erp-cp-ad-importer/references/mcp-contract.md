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

Only one processing session may exist for an office, CP channel, and CP account. The same
manifest is idempotent.

Raw and decision data remain separate:

- `raw`: the Reader item, stored unchanged as JSON data;
- `itemHash`: server-computed canonical hash of `raw`;
- `resolution`: agent evidence and chosen IDs (required when `listingId` is set);
- `ListingAdvertisement`: canonical ledger row, written only at completion,
  scoped with `cpAccountId` and `lastSyncedAt`.

## MCP sequence

1. `list_office_cp_accounts` (confirm the office `accountKey` — CP login ID,
   never a password)
2. `begin_listing_advertisement_snapshot` (requires `accountKey`)
3. For each local JSON item:
   - resolve Site/Dong/Unit/Property/Intake/Listing as deeply as unambiguously
     possible (partial or unlinked items are valid);
   - call `submit_listing_advertisement_snapshot_item` once with either the
     deepest resolved ID (or none) or an `error` when the raw ad itself is
     unreadable.
4. `get_listing_advertisement_snapshot`
5. `complete_listing_advertisement_snapshot`

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
   For buildings without unit numbers, `create_unit` can create a floor space
   unit.
3. Confirm the Unit belongs to the chosen Dong and Site.

If no exact Unit/Site match can be confirmed, do not submit an error — simply
submit the item without `propertyId`/`listingId` (pass `siteId` if confirmed,
or omit all link IDs if unlinked).

### 4. Resolve or create Property

When Unit is confirmed, call `find_or_create_property({ siteId, unitId })` (or
`find_properties` + `create_property`) to reuse or create the office Property.

### 5. Resolve Intake and Listing

When Property is confirmed, call `find_listing_intakes({ propertyId, includeClosed: false })` and
`find_listings({ propertyId, transactionType, includeClosed: false })`.

- Reuse the current same-transaction Listing when there is an unambiguous match.
- Otherwise submit only `propertyId` (do not guess or auto-create a mismatched
  Listing).
- Do not reopen a closed intake or overwrite an existing Listing's terms; the
  advertisement keeps observed terms separately.

| CP transaction | Initial Listing fields (if user registers later) |
| --- | --- |
| sale / 매매 | `price = advertisedPrice` |
| jeonse / 전세 | `price = advertisedDeposit` |
| monthly / 월세 | `deposit = advertisedDeposit`, `monthlyRent = advertisedMonthlyRent` |

### 6. Submit the item once

Resolved or unlinked input (pass only the deepest known ID among `listingId`,
`propertyId`, `siteId`, or omit all three when unlinked):

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

Failed input (use only when the raw ad itself is corrupt/unreadable, NOT for
unmatched listings):

```json
{
  "sessionId": "...",
  "raw": { "externalAdId": "64850265", "fullAddress": "..." },
  "error": "광고 가격·거래유형 원문을 읽을 수 없음"
}
```

Submit exactly one outcome. The server checks that any supplied `listingId` /
`propertyId` belongs to the authenticated office; evidence IDs are not a second
write path.

## Completion guarantees

Completion is rejected unless:

- submitted count equals the Reader count when count is available;
- every submitted item has no `error`;
- externalAdIds are unique;
- the manifest recomputed from all submitted raw items matches the Reader hash;
- no two current CP items in the same session resolve to the same Listing for
  that channel and CP account (`cpAccountId`).

Only then does one SQL transaction update the advertisement ledger (preserving
existing manual links when an item is submitted unlinked, setting
`lastSyncedAt = observedAt`, respecting newer `manualEditedAt` overrides), end
missing prior active rows for that `cpAccountId` (or channel-wide in single-account
offices), and auto-verify matching `AdvertisementChangeRequest` rows. A partial
import never changes that ledger.
