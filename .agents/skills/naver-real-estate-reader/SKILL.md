---
name: naver-real-estate-reader
description: Read CP-imported own advertisements on Naver, use the naver-complex-collector local SQLite as the exact site-to-complex scope, persist complete advertising-note and duplicate/ranking observations in Estate ERP, and return comparison evidence to a local advertisement Task runner. Never mutate Naver or create a server action workflow.
---

# Naver Real Estate Reader

Treat Estate ERP as durable observation memory and Naver data as a time-stamped
read. Store complete advertising-note observations in `ExternalListingGroup` and
`ExternalListing`. Store each own advertisement's current duplicate/ranking
projection in `OfficeAdvertisementGroup` and `OfficeAdvertisement`.

Do not create an AgentActionRequest, server run, wakeup, or Task. When invoked
from advertisement work, return evidence to `estate-erp-ad-task-runner`; that
runner already owns the claimed ordinary Task.

Read [references/mcp-contract.md](references/mcp-contract.md) before constructing
MCP payloads.

## Workflow

1. Confirm the office and visible local browser session. Stop on login challenge,
   CAPTCHA, account ambiguity, or unexpected UI.
2. Read the complete CP-imported `ListingAdvertisement` scope by stable ID.
   `channel` is the submission CP, `externalAdId` is its provider advertisement
   ID, and `naverArticleNo` is the CP-observed scalar used to identify the own
   Naver row.
3. For a full refresh, process every advertisement returned by the CP import.
   Never reduce scope to only recommendations or selected rows.
4. Resolve the site to Naver `complexNo` only through the enabled local SQLite
   owned by `naver-complex-collector`. If no mapping exists, return
   `unmapped_site`. Add a mapping only through that Skill's explicit user-choice
   workflow; never guess by name or use `Site.naverComplexCode` directly.
5. Start one ERP external-listing snapshot for `(siteId, transactionType)`, read
   the complete Naver scope by exact complex code, and batch-upsert observations.
   Preserve article number, URL, active presence, terms in 만원, confirmation
   date, ranking, grouping, and exposure fields.
6. Complete the snapshot only when capture is complete. Cancel a partial or
   interrupted session so unseen rows are not incorrectly deactivated.
7. For every CP advertisement whose `naverArticleNo` appears in the current
   response, write its own row and full duplicate set with
   `batch_upsert_office_advertisements`. Use `listingAdvertisementId` as owner
   key and mark the matching current row `isMine=true` and `isMain=true`.
8. Return current ranking, duplicate count, competitor price range, cheaper
   comparable warnings, visible floor/exposure evidence, and per-row failures.
   These are observations and recommendations, not permission to change a CP.

## Comparison rules

- Do not join `ExternalListing` to `ListingAdvertisement`; the own match comes
  only from the CP-provided `naverArticleNo` in the current response.
- Missing own article is a comparison error, not permission to guess or silently
  skip.
- Flag an active non-own row with strictly cheaper comparable terms even when it
  ranks behind the own advertisement.
- For monthly rent, cheaper means deposit and monthly rent are both no higher and
  at least one is lower. Opposite-moving terms are incomparable.
- An observation older than two hours is stale for later decisions.
- Never infer historical trends from the current projection.

## Fail closed

- Never write to Naver.
- Never complete partial snapshots.
- Never use a generic model-authored script to click arbitrary UI.
- Never call `update_listing_advertisement` to pretend an external effect
  occurred. CP observations are reconciled only by a complete CP import.
- Never store credentials or hidden reasoning.
