# Local advertisement comparison contract

## Purpose and trust boundary

This analyzer joins two already completed local snapshots. It performs no network access and no browser automation. Its output is a derived observation, not a provider snapshot and not an ERP record.

The two inputs are accepted only when:

- the Esiljang snapshot is complete and its manifest hash recomputes correctly;
- the Naver snapshot manifest hash recomputes correctly; and
- `naver.source.manifestHash` equals the Esiljang manifest hash.

The analyzer never changes either input. The saved analysis has its own SHA-256 `manifestHash` over the canonical JSON value excluding that field.

## Definitions

### My reference advertisement

For each Esiljang item, `naverArticleNo` is the only identity join key. If the same number is present in the matching Naver response, that row is `ownReferenceAdvertisement`.

Ownership basis:

```text
esiljang_snapshot_explicit_naver_article_no
```

Do not use broker name, broker ID, CP name, address, price, or description as ownership evidence.

### Observed rank

`rank.value` is the 1-based array index of the reference article in the saved response for this endpoint:

```text
/api/articles?index=0&representativeArticleNo=<naverArticleNo>
```

The basis is `naver_duplicate_response_order`. It describes only the saved response at `naver.collectedAt`. It is not a complex search rank, keyword search rank, exposure guarantee, or stable Naver policy.

`rank.total` is the number of rows actually returned. A provider field such as `sameAddrCnt` is preserved separately as `reportedSameAddressCount`; it does not replace the observed row count.

### Representative advertisements

The contract separates two meanings:

- `representativeAdvertisement`: response row 1, classified as `observed_response_leader` with basis `first_response_row`.
- `ownRepresentativeAdvertisement`: the active owned row with the smallest observed rank in the same response, classified as `highest_observed_active_owned_row`.

The first may be mine or a competitor. The second may be the query target or another active advertisement from the same Esiljang snapshot. `officialNaverRepresentativeClaim` is always `false`; the raw response does not provide an official boolean designation.

### Competitor

A valid response row is a competitor only when its article number is absent from every Esiljang source item.

- Another active owned article is listed under `otherOwnAdvertisements`, not `competitors`.
- An owned article marked `거래완료` is excluded from competition and may be listed as an excluded owned row.
- A row without a valid digits-only article number is not classified as a competitor and creates a warning.

### Completed advertisements

An Esiljang item with `providerStatus: "거래완료"` receives state `skipped_completed`. No rank, representative, or competitor comparison is produced for that source item.

## Analysis states

| State                        | Meaning                                                           | Is collection itself successful? |
| ---------------------------- | ----------------------------------------------------------------- | -------------------------------: |
| `analyzed`                   | Non-empty supported response contains the exact reference article |                              yes |
| `empty_response`             | Successful supported response contains zero rows                  |                              yes |
| `skipped_completed`          | CP item is already completed                                      |                   not applicable |
| `missing_article_no`         | Active CP item has no explicit Naver article number               |             no analysis possible |
| `collection_failed`          | Matching Naver target is in `failures`                            |                               no |
| `not_collected`              | Neither a query nor a failure exists for the number               |                               no |
| `unsupported_response_shape` | Saved successful response is not a supported array shape          |                               no |
| `anchor_not_found`           | Non-empty response does not contain the exact CP article number   |                 no reliable rank |

An empty response and a failed request must never be merged into one state.

## Price normalization

All normalized numeric prices use 만원, matching Estate ERP conventions.

Examples:

| Provider text | Normalized |
| ------------- | ---------: |
| `15억 8,000`  |   `158000` |
| `3억`         |    `30000` |
| `3,000`       |     `3000` |
| `500`         |      `500` |

For Naver rows:

- 매매: `dealOrWarrantPrc` is the sale amount.
- 전세: `dealOrWarrantPrc` is the deposit.
- 월세: `dealOrWarrantPrc` is the deposit and `rentPrc` is the monthly rent.

Relations are always expressed as **competitor relative to my reference advertisement**:

- `lower`: competitor is cheaper;
- `same`: equal;
- `higher`: competitor is more expensive;
- `mixed`: monthly deposit and rent move in opposite directions;
- `unknown`: missing/invalid price or mismatched transaction types.

Monthly dominance rules:

```text
lower  := competitorDeposit <= ownDeposit
          AND competitorRent <= ownRent
          AND at least one value is strictly lower

higher := competitorDeposit >= ownDeposit
          AND competitorRent >= ownRent
          AND at least one value is strictly higher
```

No conversion rate between deposit and monthly rent is assumed.

## Confirmation date and floor disclosure

`confirmationDateRelation` compares `articleConfirmYmd` as `YYYYMMDD` and returns `newer`, `same_date`, `older`, or `unknown`, from the competitor's perspective.

Floor comparison is about disclosure specificity, not desirability:

- a numeric or basement floor prefix is `exact`;
- `저`, `중`, or `고` is `band`;
- anything else is `unknown`.

`floorDisclosureRelation` is `competitor_more_specific`, `same_specificity`, `own_more_specific`, or `unknown`.

## Saved output outline

```json
{
  "version": 1,
  "status": "succeeded",
  "analyzer": "local-ad-comparison-analyzer",
  "scope": "esiljang_ads_against_naver_duplicate_groups",
  "policyVersion": 1,
  "analyzedAt": "2026-08-09T10:00:00.000Z",
  "source": {
    "esiljang": {
      "observedAt": "2026-08-08T09:00:00.000Z",
      "manifestHash": "<sha256>"
    },
    "naver": {
      "collectedAt": "2026-08-08T10:00:00.000Z",
      "manifestHash": "<sha256>"
    }
  },
  "counts": {
    "total": 1,
    "active": 1,
    "analyzed": 1,
    "emptyResponse": 0,
    "completedSkipped": 0,
    "issues": 0,
    "competitorAdvertisements": 3
  },
  "analyses": [
    {
      "itemIndex": 0,
      "externalAdId": "ES-1001",
      "naverArticleNo": "2612345678",
      "state": "analyzed",
      "rank": {
        "value": 2,
        "total": 4,
        "basis": "naver_duplicate_response_order"
      },
      "representativeAdvertisement": {},
      "ownRepresentativeAdvertisement": {},
      "leadingCompetitorAdvertisement": {},
      "competitors": [],
      "comparisonSummary": {}
    }
  ],
  "manifestHash": "<sha256>"
}
```

## Status calculation

- `succeeded`: every active item with an article number is either `analyzed` or `empty_response`; expected completed skips do not make the output partial.
- `partial`: at least one item has an issue state and at least one item was otherwise analyzed, empty, or intentionally skipped.
- `failed`: issue states exist and no item produced an analyzed/empty result and no item was intentionally skipped as completed.

The analyzer records facts only. Editing advice, advertisement updates, Task creation, and ERP persistence are separate user-authorized operations.
