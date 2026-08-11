---
name: local-my-ads-viewer
description: Render matching local Esiljang, raw Naver duplicate-ad, and advertisement comparison JSON as a self-contained My Ads HTML workbench that shows rank, representative, cheaper-price and floor-exposure comparisons and can export local price, floor, or republish request JSON. Use when the user wants to review or draft changes for 내 광고 locally without Estate ERP, MCP, a database, or a server.
---

# Local My Ads Viewer

Render immutable local snapshots and their derived comparison as one offline HTML file. Allow the HTML to author a separate local request JSON while keeping collection, analysis, ERP persistence, and provider mutation separate.

## Require matching inputs

For the full comparison view, require:

1. A successful `esiljang-ad-reader` snapshot.
2. A `naver-real-estate-reader` snapshot whose `source.manifestHash` equals the Esiljang `manifestHash`.
3. A `local-ad-comparison-analyzer` JSON whose Esiljang and Naver source hashes equal those two inputs.

Validate the comparison manifest hash before rendering. Join source rows only by `itemIndex`, `externalAdId`, and explicit `naverArticleNo`. Never infer a relation from address, complex, unit, price, broker, or CP names.

The renderer may omit `--analysis` for a plain raw-collection view, but ranking, representative, ownership, and competitor labels are unavailable in that mode.

## Render and open

Choose a caller-visible `.html` output path, then run:

```bash
node "$SKILL_DIR/scripts/render-report.mjs" \
  --esiljang "$ESILJANG_JSON" \
  --naver "$NAVER_JSON" \
  --analysis "$COMPARISON_JSON" \
  --output "$LOCAL_REPORT_HTML" \
  --open
```

Omit `--open` in a headless environment. Add `--overwrite` only after the user explicitly approves replacing that exact report. The output is one self-contained HTML file with no remote assets, network requests, cookies, credentials, database access, or application dependency.

## Preserve comparison meanings

- Show `rank.value / rank.total` as the saved Naver duplicate-response position. Do not call it a global Naver search rank.
- Show `representativeAdvertisement` as `응답 대표광고`; it means the first saved response row and is not an asserted official Naver designation.
- Show the exact Esiljang article as `내 기준` and the highest active owned response row as `내 대표`.
- Show only analyzer-classified rows as competitors. Never infer ownership from `realtorName`, `realtorId`, or `cpName`.
- Read price relations from the competitor's perspective: `더 낮음` means cheaper than the reference advertisement.
- Keep monthly `mixed` comparisons explicit; do not invent a deposit-to-rent conversion.
- Derive the displayed floor exposure only from the query target's saved Naver `floorInfo`: numeric/B-floor prefixes mean detailed exposure, 저/중/고 prefixes mean band exposure, and other values remain unknown. Label it as Naver-observed, not as a confirmed live CP setting.
- Show `providerStatus=거래완료` under `거래 완료` and exclude it from active comparison counts.
- Keep successful empty responses, failures, uncollected targets, unsupported responses, and missing anchors distinct.
- Preserve each decoded Naver provider row under a local `원본 JSON` disclosure.

## Keep execution separate

The HTML may search, filter, paginate, expand comparison rows, collect exact price/floor change drafts or an explicit republish request, and download them as JSON. Match the Estate ERP My Ads behavior: default `저장 후 재광고` on, allow republish-only requests when terms are unchanged, and allow users to turn republish off for condition-only changes. It must not upload, contact, submit to a provider, create a Task, call Naver, or call Estate ERP.

Use the contract in [references/modification-request-contract.md](references/modification-request-contract.md). The exported bundle must set `directExecutionAuthorized=false` and require confirmation in the current conversation. Disable advertisement requests for completed advertisements. A requested republish must use the existing advertisement's provider `재광고` flow and must never mean manual exposure end plus recreation. Treat a later provider write as a separate explicitly authorized workflow.

## Return

Return the absolute report path, whether it opened, and counts for active rows, completed comparisons, empty responses, issues, reference leaders, competitor leaders, lower-price competition, and competitor advertisements. Mention that condition-change and republish drafts stay in page memory until the user downloads the request JSON.
