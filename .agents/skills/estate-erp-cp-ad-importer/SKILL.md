---
name: estate-erp-cp-ad-importer
description: Import a complete, immutable CP advertisement snapshot JSON into Estate ERP one advertisement at a time. For each local Reader item, resolve the deepest managed Site/Dong/Unit/Property/ListingIntake/Listing match (or omit IDs when unlinked) and submit the raw item plus the resolution in one MCP call; commit ListingAdvertisement rows only after the full manifest resolves. Use when asked to save or connect an Esiljang or other CP Reader snapshot to Estate ERP, resume a partially imported CP snapshot, or reconcile the active CP advertisement ledger. Do not use to crawl a CP site, compare Naver listings, or edit/re-publish advertisements.
---

# Estate ERP CP Advertisement Importer

## Purpose

Consume a successful snapshot already saved by a standalone CP Reader. Read one
local item, resolve it, and submit its raw evidence and Listing decision
together. Do not upload or claim a batch in advance.

Keep the Reader independent: never add office IDs, workflow IDs, or MCP calls
to its snapshot.

## Required reference

Read [references/mcp-contract.md](references/mcp-contract.md) before calling an
MCP tool. It defines matching rules, price mapping, and completion guarantees.

## Workflow

### 1. Verify one saved snapshot

Use the user-supplied path. If none is supplied for Esiljang, select the newest
`.json` in `~/.agents/data/esiljang-ad-reader/snapshots/` and state the path.

Run:

```bash
node scripts/snapshot-items.mjs <snapshot.json> summary
node scripts/snapshot-items.mjs <snapshot.json> begin --account-key <cp-login-id>
```

The helper verifies the canonical manifest and exact file SHA-256. Stop before
any MCP write if verification fails. Never repair, normalize, reorder, or
overwrite the Reader file.

### 2. Begin or resume the server session

Identify the exact CP login ID (`accountKey`) used for this snapshot. Call
`list_office_cp_accounts` for the target channel to reuse an existing office CP
account ID when known, or pass the confirmed CP login ID (never pass a password,
token, or secret config value). If multiple accounts exist and it is ambiguous
which login produced the snapshot, stop and ask the user before calling MCP.

Pass the `begin` output (with `accountKey`) to
`begin_listing_advertisement_snapshot`:

- Stop if an identical completed session is reused.
- Resume if the identical session is still `processing`.
- If another active snapshot for the same channel/account blocks the call,
  inspect its ID with `get_listing_advertisement_snapshot`; finish or explicitly
  cancel it before starting the newer file.
- Never submit new-file items to an older session.

On resume, use `get_listing_advertisement_snapshot.submittedItems` to skip
already resolved externalAdIds. Revisit failed items and unsubmitted local
items only.

### 3. Read, resolve, and submit one item

For each zero-based item index from `0` to `summary.itemCount - 1`, run:

```bash
node scripts/snapshot-items.mjs <snapshot.json> item \
  --session-id <sessionId> --index 0
```

The output contains only `sessionId` and that item's immutable `raw` object.
Resolve the item using the reference algorithm:

1. Derive a complex candidate from `fullAddress`; `complexName` may be null.
2. Confirm one public Site (`search_central_sites`, `find_office_sites`) and add
   only its OfficeSite association when needed (`add_office_site`).
3. Confirm the exact Dong (`find_dongs`) and Unit (`find_units`; for buildings
   without unit numbers, `create_unit` can create the floor space).
4. Reuse or create the office Property (`find_or_create_property`) when Unit is confirmed.
5. Reuse the open/hold ListingIntake and matching open same-transaction Listing
   only when unambiguous (otherwise stop resolution at `propertyId` or `siteId`).

Then make exactly one call to `submit_listing_advertisement_snapshot_item`:

- Readable item (even if unlinked or partially matched): pass `sessionId + raw`
  plus only the deepest resolved identifier (`listingId`, else `propertyId`, else
  `siteId`, or omit all three if no managed match exists) and `resolution`
  evidence when resolved. Missing matches are NOT item errors; ads can be stored
  without a Listing.
- Unreadable item only: pass `sessionId + raw + error` when the raw ad payload
  itself is corrupt or unreadable.

The server computes and stores the item hash. Submitting the same
`externalAdId` again with the same raw item replaces its previous decision, so
a failed item can later become resolved. Different raw data for the same item
is rejected.

To reopen a specific failed item without finding its numeric index, run the
helper with `--external-ad-id <id>` instead of `--index <n>`.

Do not create `ListingAdvertisement` rows directly. Submitted items are durable
progress records until final completion.

### 4. Complete once

Call `get_listing_advertisement_snapshot`. Complete only when the received
count equals the snapshot count and failed count is zero. Then call
`complete_listing_advertisement_snapshot`.

Completion recomputes the Reader manifest and runs one transaction:

- upsert current `ListingAdvertisement` rows scoped by office, CP channel,
  `cpAccountId`, and identity (`Listing` / `Property+transactionType` /
  `externalAdId`); preserve existing manual Listing links if this sync found none;
- set `lastSyncedAt = observedAt` (there is no `source` column; freshness is
  tracked by `lastSyncedAt` and `manualEditedAt`);
- mark missing prior active ads for that CP account as `ended` (in single-account
  offices, missing channel ads with `cpAccountId = null` are reconciled too; in
  multi-account offices, only ads matching the snapshot's `cpAccountId` end);
- auto-verify matching open/executed `AdvertisementChangeRequest` rows (and
  auto-complete a parent batch `Task` if every request in it is verified);
- mark the session `completed`.

If completion fails, the advertisement ledger rolls back and the session stays
resumable. Use `cancel_listing_advertisement_snapshot` only for an invalid or
abandoned source snapshot. Cancellation does not end existing ads.

After completion, call `find_listing_advertisements({ link: "no_listing" })` if
any ads remain unlinked from a Listing, and report them so the user can decide
whether to register listings or link them via `link_listing_advertisement`.

## Output

Report the snapshot path and hashes, `accountKey`, session ID,
received/resolved/failed counts, final created/updated/ended counts, verified
change request count (if any), and any unlinked (`no_listing`) or failed
externalAdIds.
After completion, return the verified ledger result to the caller. When the
user separately requests it, a local advertisement Task runner may pass the
same completed Reader JSON to `naver-real-estate-reader` for an unclassified
local duplicate-ad JSON snapshot. This skill never creates a server workflow or
crawls Naver itself.
