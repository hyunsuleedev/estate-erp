---
name: naver-real-estate-reader
description: Collect the raw Naver duplicate-ad JSON for every explicit naverArticleNo in an already completed Esiljang advertisement snapshot, using Playwright with a read-only standard Google Chrome session and a caller-selected local output file. Use when current Esiljang ads need their Naver duplicate sets refreshed. Do not compare advertisers, rank ads, map complexes, use SQLite, or persist anything to Estate ERP.
---

# Naver Real Estate Reader

Use a completed Esiljang advertisement snapshot as the only collection scope.
For each distinct `items[].naverArticleNo`, request Naver's duplicate-ad response
and save the decoded JSON value without classifying its rows. The output is a
standalone local snapshot, not an ERP import or an advertisement decision.

Read [references/snapshot-contract.md](references/snapshot-contract.md) before
preparing a collection or returning a file.

## Keep the boundary narrow

- Require a caller-provided successful `esiljang-ad-reader` snapshot. When the
  caller wants fresh CP data, the caller runs that Skill first and passes its
  completed JSON here.
- Read only explicit, digits-only `naverArticleNo` values. Never infer an
  article number from an address, complex name, unit, URL fragment, or ERP row.
- Deduplicate repeated article numbers before network access. Retain their
  source `externalAdId` values only as collection lineage.
- Preserve each successful Naver response as an unclassified decoded JSON
  value. Do not add `isMine`, `isMain`, ranking, cheaper-price, floor, or
  competitor conclusions.
- Never read or write an ERP database, MCP tool, SQLite file, site mapping,
  task, advertisement record, or external-listing schema.
- Never modify the source Esiljang JSON.

## Prepare the exact collection scope

Run the bundled validator before opening Naver:

```bash
node "$SKILL_DIR/scripts/prepare-collection.mjs" --source "$ESILJANG_JSON"
```

Use only `targets[].naverArticleNo` from its output. A repeated number appears
once, while `sourceAdvertisements` records every input row that supplied it.
Items with no number appear under `skipped` as
`missing_naver_article_no`; continue with all valid targets. If `ready=false`,
return `no_naver_article_numbers` without opening a browser or creating an
output file.

## Read Naver without mutation

1. Load the `playwright` Skill. Launch one unique headed Playwright session with
   the installed standard Google Chrome channel (`channel: "chrome"`). Do not
   use agent-browser, Chrome for Testing, Electron, a persistent user profile,
   or a browser owned by the calling application.
2. Register Playwright's request listener before the first navigation, then
   navigate only within `new.land.naver.com`. Capture the first same-origin
   Bearer authorization header in the Playwright process closure. A legacy or
   fallback display route is not collection evidence; require the first exact
   duplicate-ad API request to return HTTP 200 before continuing. Stop on
   CAPTCHA, login/MFA, consent, access warning, or account ambiguity.
3. Keep the temporary Bearer value only in the Playwright and page process
   memory. Never print, return, log, or write the value or any cookie, request
   headers, browser storage, or profile.
4. Process targets strictly one at a time. In the same page context, request
   exactly:

   ```text
   GET /api/articles?index=0&representativeArticleNo=<naverArticleNo>
   ```

   Use same-origin credentials and the in-memory authorization value. Do not
   call another endpoint to resolve a complex, realtor, site, or owner. Reuse
   the successful first probe response as that target's collected result.

5. Wait 1.5 to 2.2 seconds with random jitter after every request. Never run
   concurrent duplicate-ad requests. For every target, retain only
   `naverArticleNo`, HTTP status, and the decoded
   JSON response on success. On non-2xx, invalid JSON, timeout, challenge, or
   provider failure, retain a safe reason code and HTTP status when available;
   never retain response headers, raw HTML, error stacks, or secret-bearing
   bodies.
6. Treat `401` or `403` as an expired/invalid browser authorization state. One
   fresh normal-page bootstrap is allowed; otherwise record the target failure.
   On `429`, obey a reasonable `Retry-After` once and then stop issuing further
   requests if the provider remains rate-limited.
7. Close the browser after success or technical failure. Leave it visible only
   for an explicit human-resolvable `needs_input` state.

## Write one local JSON snapshot

Build the response envelope described in the reference, then run:

```bash
node "$SKILL_DIR/scripts/write-snapshot.mjs" \
  --source "$ESILJANG_JSON" \
  --responses "$NAVER_RESPONSES_JSON" \
  --output "$CALLER_SELECTED_OUTPUT"
```

`--responses -` may be used to read the response envelope from stdin. The
writer validates target identity, rejects secret-shaped content, computes a
manifest hash, and creates the output atomically with owner-only permissions.
It has no default storage path and refuses to replace an existing file unless
the caller explicitly adds `--overwrite`. It always rejects an output path
equal to the source Esiljang path.

Save successful responses even when another target fails. Mark the file
`partial` rather than `succeeded`, and list every failure or skipped Esiljang
row explicitly. Do not describe a partial file as a complete refresh.

## Return

Return only the output path, snapshot status, counts, manifest hash, and safe
failure reason codes. The JSON file is the collection result. Do not trigger a
comparison, recommendation, upload, ERP import, Task, or CP edit afterward.

## Fail closed

- Never write to Naver or click edit, contact, expose, payment, or advertising
  controls.
- Never store credentials, cookies, tokens, authorization headers, browser
  state, raw HTML, or screenshots in the snapshot or diagnostics.
- Never guess a missing article number or replace it with a complex number.
- Never claim that an article is the user's own row merely because its number
  was used as the representative request parameter.
