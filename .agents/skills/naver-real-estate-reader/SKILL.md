---
name: naver-real-estate-reader
description: Read every CP-imported own advertisement on Naver, persist durable advertising-note memory plus the current duplicate/ranking comparison, and return analysis and recommendations for staff review. Never mutate an external advertisement or approve an action.
---

# Naver Real Estate Reader

Treat Estate ERP as durable memory and Naver page data as a time-stamped
observation. Store complete advertising-note observations in
`ExternalListingGroup` and `ExternalListing`. Independently write the current
per-own-ad duplicate/ranking projection to `OfficeAdvertisementGroup` and
`OfficeAdvertisement`; this projection powers My Ads Management. Never connect,
join, or pass an `ExternalListing` row to `ListingAdvertisement` or
`AgentActionRequest`.

## Run the workflow

1. Confirm the office and visible local browser session. Use agent-browser or
   Orca computer use in the office user's existing session. Stop on login
   challenges, CAPTCHA, account ambiguity, or unexpected UI.
2. Read the complete CP-imported `ListingAdvertisement` scope by stable ID. The
   `channel` is the submission CP (`esiljang`, `budongsanbank`, and so on);
   `externalAdId` is the CP advertisement ID. `naverArticleNo` is a scalar value
   supplied by the CP import, not a relation to advertising-note data.
3. For a full My Ads refresh, process every advertisement returned by the CP
   import. Never reduce the comparison scope to selected, stale, or
   recommendation-only rows.
4. Call `create_external_listing_snapshot_session` for one
   `(siteId, transactionType)` scope. The `siteId` comes from an
   `ExternalListingSource` row, which is also the only authority for that site's
   Naver `complexNo`. Never resolve a complex by name search, and never read
   `Site.naverComplexCode` as a collection input. A site with no source row is
   reported as `unmapped_site`, not guessed.
5. Read the complete requested Naver scope and call
   `batch_upsert_external_listings`. Preserve article number, source URL,
   active presence, terms in 만원, confirmation date, group hints, ranking, and
   exposure fields visible in the page data. Never persist cookies, passwords,
   OTPs, authorization headers, or browser profile data.
6. If and only if the scope is complete, call
   `complete_external_listing_snapshot_session`; this marks unseen old rows
   inactive. On partial collection or interruption, call
   `cancel_external_listing_snapshot_session`.
7. For every imported advertisement whose CP-provided `naverArticleNo` appears
   in the current Naver response, write its current own-ad and duplicate set
   directly with `batch_upsert_office_advertisements`. Use
   `listingAdvertisementId` as the owner key and mark the matching captured row
   as both `isMine` and `isMain`. Do not resolve that match through
   `ExternalListing`.
8. Compare the refreshed rows and persist concise analysis signals and
   recommendations. Report counts for CP-imported, compared, failed, and
   recommendation rows. Do not invent advertisement policy.
9. Stop. Staff edit and review a proposed CP change in My Ads Management. That
   UI creates the exact-hash `AgentActionRequest`; the CP executor applies it
   only after approval.

Read [references/mcp-contract.md](references/mcp-contract.md) before constructing
tool payloads or handling snapshots, duplicates, and exceptions.

## Keep comparison and action responsibilities separate

- A normal comparison, recommendation, proposal, approval, rejection,
  successful execution, or verification never creates or changes a `Task`.
- If the current Naver comparison response does not contain the CP-provided
  `ListingAdvertisement.naverArticleNo`, report the row as a comparison error;
  do not query advertising-note data as a fallback, guess, silently skip it, or
  create an AgentActionRequest.
- Runtime exceptions after approval belong to the channel-specific CP executor,
  which escalates a real human-needed blocker through the request.
- Produce current ranking, duplicate count, competitor price range, and visible
  floor/exposure evidence for every imported advertisement.
- Flag any active non-own row with strictly cheaper comparable terms even when
  it ranks behind the own advertisement. Ranking is supporting evidence, never
  a prerequisite for this warning.
- Treat an observation older than two hours as stale for later action review.
- Never infer a historical ranking trend; this workflow stores the current
  comparison, not daily rank history.

## Fail closed

- Stop on incomplete snapshots, layout/schema mismatch, ambiguous target
  identity, or inaccessible data.
- Do not use a generic model-authored script to click arbitrary UI.
- Do not call direct `update_listing_advertisement` to represent an external
  effect. CP import may refresh observed source fields, but only a matched CP
  execution receipt may reconcile an approved mutation.
- Do not expose or call approval/rejection through MCP.
- Do not silently deactivate unseen ads after a partial collection.
- Record concise rationale and stable evidence IDs, never hidden reasoning.
