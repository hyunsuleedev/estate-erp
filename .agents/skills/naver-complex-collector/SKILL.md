---
name: naver-complex-collector
description: Read Naver complex listings for an office's registered collection scope, using ExternalListingSource as the only authority for which complex maps to which Naver complexNo. Never guess a complex mapping and never write to Naver.
---

# Naver Complex Collector

Two MCP servers, one boundary. `naverestate-mcp` reads Naver and knows nothing
about Estate ERP. Estate ERP MCP owns every durable write. This skill is the only
thing that connects them — it carries `externalCode` from ERP into the collector
and carries observations back into ERP.

Never add ERP credentials, ERP tool calls, or ERP concepts to `naverestate-mcp`.
Never let the collector's local `data/complex-name-cache.json` decide what to
collect; it is that package's own memory, not the office's.

## The mapping rule

`ExternalListingSource` is the single authority for "which Naver complex is this
ERP site":

```
ExternalListingSource (officeId, siteId, provider="naver")
  → externalCode = Naver complexNo
```

`Site.naverComplexCode` is only a default suggestion used when registering. It is
never a collection input. If the two disagree, `ExternalListingSource` wins —
the office may have corrected it on purpose.

Resolve `siteId` → `externalCode` through this table and nothing else. Do not
search Naver by complex name to decide what to open.

## Collect a registered scope

1. Confirm the office and the visible local browser session. Stop on login
   challenges, CAPTCHA, account ambiguity, or unexpected UI.
2. Read the office's enabled sources with
   `find_external_listing_sources` (`provider="naver"`, `isEnabled=true`).
   These rows, and only these, are the collection scope.
3. For each source, call `create_external_listing_snapshot_session` with that
   source's `siteId` and one `transactionType`. The session owns the transaction
   axis; the source does not carry one.
4. Call `naver_collect_complex` with `filter.complexNo = source.externalCode`.
   Keep the default `order: "dateDesc"`. Open the complex by code, never by a
   name search.
5. Write observations with `batch_upsert_external_listings`. Preserve article
   number, source URL, active presence, terms in 만원, confirmation date, group
   hints, ranking, and exposure fields. Never persist cookies, passwords, OTPs,
   authorization headers, or browser profile data.
6. Call `complete_external_listing_snapshot_session` only if that scope was
   captured completely. On partial collection or interruption, call
   `cancel_external_listing_snapshot_session` — completion deactivates unseen
   rows and must not run on a partial capture.
7. Report per-source counts: collected, skipped, failed.

## Handle an unregistered complex

A site with no `ExternalListingSource` row is out of scope. It is not an error to
recover from silently and not something to infer.

- Do not search Naver by name and pick a plausible complex.
- Do not fall back to `Site.naverComplexCode`.
- Report it as `unmapped_site` with the `siteId` and site name, and continue with
  the remaining sources.

Registration is a separate, human-facing path (below), not a step this workflow
performs on its own.

## Register a new source

Only when the user explicitly asks to add a collection target.

1. `naver_search_complex` with the site name as keyword.
2. If more than one candidate returns, present them and let the user choose. Do
   not auto-select on ambiguity — a wrong complexNo silently poisons every later
   collection.
3. `naver_resolve_complex` to obtain `complexNo`.
4. Hand the resolved `complexNo` to the user for registration. Registration is
   owner/manager-only and is deliberately **not** exposed through MCP — report
   the `siteId` and `complexNo` and stop. Staff register it in the UI
   (`POST /external-listing-sources`, or the bulk
   `POST /external-listing-sources/import-from-office-sites` which auto-registers
   managed sites already carrying `Site.naverComplexCode` and reports the rest as
   `no_external_code`).

`type` uses ERP vocabulary (`apartment`, `officetel`, `villa`, ...), matching
`Site.type`. Naver's filter codes are the collector's concern, not ERP's.

## Fail closed

- Stop on incomplete snapshots, layout or schema mismatch, ambiguous target
  identity, or inaccessible data.
- Never mutate a Naver listing. This skill reads only.
- Never complete a snapshot session for a scope you did not fully capture.
- Never write a collected observation to a `siteId` other than the one on the
  source row that produced its `externalCode`.
- Treat an observation older than two hours as stale for later action review.
- Record concise rationale and stable evidence IDs, never hidden reasoning.
