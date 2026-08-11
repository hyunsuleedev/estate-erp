---
name: local-ad-comparison-analyzer
description: Analyze a completed local Esiljang advertisement snapshot together with its matching raw Naver duplicate-ad snapshot. Use when the user asks for 내 광고 순위, 대표광고, 경쟁광고, 가격·확인일·층 노출 비교, or a local comparison JSON without calling Naver, a browser, ERP, MCP, or a server.
---

# Local Ad Comparison Analyzer

## Overview

Turn two immutable local collector snapshots into one immutable comparison JSON.
Keep collection, judgment, display, and advertisement mutation as separate steps.

This Skill makes three different facts explicit:

- **내 기준광고**: the exact `naverArticleNo` recorded by Esiljang.
- **응답상 대표광고**: the first row of the collected Naver duplicate response.
- **내 대표광고**: the highest row in that response whose article number is also an active Esiljang advertisement.

Read [references/analysis-contract.md](references/analysis-contract.md) before changing a rule, consuming the output in another Skill, or explaining a field whose meaning is unclear.

## Required inputs

Require both of these completed files:

1. A successful `esiljang-ad-reader` snapshot.
2. A `naver-real-estate-reader` snapshot whose `source.manifestHash` exactly matches the Esiljang snapshot.

When paths were not supplied, inspect the standard local snapshot folders. Start from the newest Naver snapshot, then select the Esiljang snapshot identified by its source manifest hash. Never pair files by timestamp alone.

Do not invoke either collector automatically unless the user also asked for fresh collection. If no matching pair exists, stop and report the missing lineage.

## Run the analysis

Use the bundled script:

```bash
node scripts/analyze-snapshots.mjs \
  --esiljang /absolute/path/to/esiljang.json \
  --naver /absolute/path/to/naver.json
```

The default output directory is:

```text
~/.agents/data/local-ad-comparison-analyzer/analyses/
```

Use `--output /absolute/path/to/analysis.json` only when the user chose a path. The writer refuses to replace an existing file and writes owner-only permissions.

For a reproducible fixture or test, `--analyzed-at <ISO timestamp>` is allowed. Use the current time for real work.

## Interpret the result

Follow these rules exactly:

1. Treat `rank.value` as a 1-based position in the collected duplicate-response array, not a global Naver search rank.
2. Treat `representativeAdvertisement` as an observed first row only. Do not claim it is an official Naver representative designation.
3. Mark an article as owned only when its number appears explicitly in the Esiljang snapshot. Never infer ownership from `realtorName`, `realtorId`, `cpName`, address, or wording.
4. Exclude other owned advertisements from `competitors`.
5. Exclude advertisements whose Esiljang `providerStatus` is `거래완료` from both analysis and competition.
6. Keep successful empty arrays, collection failures, unsupported response shapes, and a missing target article as different states.
7. Read price relations from the competitor's perspective: `lower` means the competitor is cheaper than my reference advertisement.
8. For monthly rent, call a competitor lower or higher only when deposit and rent move in the same non-worse direction. Use `mixed` when one is lower and the other is higher.

Report the output path, manifest hash, counts, and any non-analyzed states. Do not turn observations into an advertisement edit plan unless the user separately asks for one.

## Boundaries

This Skill is local and read-only with respect to both inputs. It must not:

- open a browser or call Naver;
- log in to Esiljang or another CP;
- read or write ERP, MCP, PostgreSQL, SQLite, or a task queue;
- update, upload, stop, or renew an advertisement;
- create an ERP Task;
- overwrite a collector snapshot or an earlier analysis;
- label a response row as owned without explicit CP article-number evidence.

Use `local-my-ads-viewer --analysis <this JSON>` when the user asks for HTML. This Skill itself emits JSON only.
