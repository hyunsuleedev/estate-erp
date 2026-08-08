---
name: estate-erp-cp-ad-importer
description: Import a complete, immutable CP advertisement snapshot JSON into Estate ERP one advertisement at a time. For each local Reader item, resolve the managed Site/Dong/Unit/Property/ListingIntake/Listing and submit the raw item plus the final Listing decision in one MCP call; commit ListingAdvertisement rows only after the full manifest resolves. Use when asked to save or connect an Esiljang or other CP Reader snapshot to Estate ERP, resume a partially imported CP snapshot, or reconcile the active CP advertisement ledger. Do not use to crawl a CP site, compare Naver listings, or edit/re-publish advertisements.
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
node scripts/snapshot-items.mjs <snapshot.json> begin
```

The helper verifies the canonical manifest and exact file SHA-256. Stop before
any MCP write if verification fails. Never repair, normalize, reorder, or
overwrite the Reader file.

### 2. Begin or resume the server session

Pass the exact `begin` output to
`begin_listing_advertisement_snapshot`.

- Stop if an identical completed session is reused.
- Resume if the identical session is still `processing`.
- If another active snapshot blocks the call, inspect its ID with
  `get_listing_advertisement_snapshot`; finish or explicitly cancel it before
  starting the newer file.
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
2. Confirm one public Site and add only its OfficeSite association when needed.
3. Confirm the exact Dong and Unit. Never fabricate an ID.
4. Reuse or create the office Property for that Unit.
5. Reuse the open/hold ListingIntake when present.
6. Reuse the same-transaction Listing, create it under the current intake, or
   create a new intake with its initial Listing.

Then make exactly one call:

- Resolved: `submit_listing_advertisement_snapshot_item` with
  `sessionId + raw + listingId + resolution`.
- Unresolved: the same tool with `sessionId + raw + error`.

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

- upsert current ListingAdvertisement rows by office, CP channel, and
  `externalAdId`;
- attach each row to the agent-confirmed Listing;
- mark missing prior `cp_sync` ads from that channel as `ended`;
- mark the session `completed`.

If completion fails, the advertisement ledger rolls back and the session stays
resumable. Use `cancel_listing_advertisement_snapshot` only for an invalid or
abandoned source snapshot. Cancellation does not end existing ads.

There is no MCP tool for creating public Units. Record a missing exact Unit as
an item error; do not synthesize one.

## Output

Report the snapshot path and hashes, session ID, received/resolved/failed
counts, final created/updated/ended counts, and any unresolved externalAdIds.
After completion, return the verified ledger result to the caller. A local
advertisement Task runner may optionally invoke the Naver comparison workflow;
this skill never creates a server workflow or crawls Naver itself.
