---
name: naver-complex-collector
description: Read Naver complex listings for a collection scope stored in the user's local SQLite, then persist only complete listing observations to Estate ERP. Use when the user asks to add or manage collection complexes, import managed ERP sites into a local scope, or refresh competitor/complex advertising notes. Never write to Naver and never use a server collection-source table.
---

# Naver Complex Collector

Keep the collection target mapping local. Estate ERP remains the durable home of
managed sites and collected listing observations, but it does not store or run a
collection schedule/scope.

`naverestate-mcp` reads Naver and knows nothing about Estate ERP. This Skill
carries a locally confirmed Naver `complexNo` into the collector and carries a
complete observation snapshot back into ERP.

## Local scope authority

The database defaults to
`~/.agents/data/naver-complex-collector/scope.sqlite`. Override only for tests or
an isolated profile with `NAVER_COLLECTION_SCOPE_DB_PATH`.

```bash
node scripts/collection-scope.mjs list --enabled true
```

Each enabled local row is an exact mapping:

```text
(siteId, provider="naver") -> externalCode = Naver complexNo
```

Never infer this mapping while collecting. `Site.naverComplexCode` may be an
explicit import suggestion, but it is not authoritative until it is saved in
the local scope. The collector package's own complex-name cache is also not the
office scope.

## Add a target

Only add targets when the user explicitly asks.

1. For an ERP managed site, call `find_office_sites` and select the exact
   `siteId`. For a competitor-only target without an ERP Site, first use
   `search_central_sites` and let the user select or create the intended site.
2. Search Naver with `naver_search_complex`. If multiple candidates exist,
   present them and wait for the user to choose. Never auto-select by name.
3. Resolve the chosen candidate with `naver_resolve_complex` and show its exact
   `complexNo`, name, and address.
4. After confirmation, store the mapping locally:

   ```bash
   node scripts/collection-scope.mjs add \
     --site-id <erp-site-id> --site-name '<name>' \
     --external-code <naver-complex-no> --type apartment
   ```

Use `update`, `disable`, or `remove` only on an explicit user request. Prefer
`disable` when the user may restore the scope later.

## Import managed sites as suggestions

When the user asks to initialize from managed sites:

1. Call `find_office_sites` once.
2. Present sites that already carry a `naverComplexCode` as suggestions.
3. Confirm the list with the user before saving any mapping locally.
4. Add confirmed rows with the script. Report sites without a code as
   `unmapped`; resolve them individually through Naver search and user choice.

There is no automatic server-to-local sync. This avoids silently expanding a
user's collection scope when ERP managed sites change.

## Collect enabled targets

1. Read enabled rows from local SQLite. These rows, and only these rows, are the
   requested scope.
2. For each row and requested transaction type, call
   `create_external_listing_snapshot_session` with its exact ERP `siteId`.
3. Call `naver_collect_complex` with
   `filter.complexNo = local.externalCode`; keep `order="dateDesc"`. Open by
   code, never by a name search.
4. Write observations through `batch_upsert_external_listings`. Preserve article
   number, URL, active presence, terms in 만원, confirmation date, group hints,
   ranking, and exposure fields. Never persist cookies, passwords, OTPs,
   authorization headers, or browser profile data.
5. Call `complete_external_listing_snapshot_session` only after the entire
   target/transaction scope was captured. On any partial capture or interruption,
   call `cancel_external_listing_snapshot_session`; completion deactivates unseen
   rows and is unsafe for partial data.
6. Mark the local source only after successful completion:

   ```bash
   node scripts/collection-scope.mjs mark-collected --site-id <site-id>
   ```

7. Report collected, skipped, and failed counts per local source.

## Fail closed

- Stop on login challenges, CAPTCHA, ambiguous account, unexpected UI, schema
  mismatch, incomplete snapshot, or target identity mismatch.
- Never mutate a Naver listing.
- Never complete a partial ERP snapshot session.
- Never write an observation to a `siteId` different from the local mapping that
  supplied its `complexNo`.
- A missing local mapping is `unmapped_site`, not permission to guess.
- Store no credentials or hidden reasoning. Keep only stable identifiers and a
  concise operational result.
