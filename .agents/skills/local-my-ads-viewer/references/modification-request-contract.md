# Local advertisement request

The HTML exports one bundle for condition changes, republishing, or both. Treat it as an exact local draft, not as execution authorization.

## Bundle

```json
{
  "version": 2,
  "kind": "local_advertisement_request_bundle",
  "createdAt": "2026-08-09T12:00:00.000Z",
  "createdBy": "local-my-ads-viewer",
  "source": {
    "report": { "version": 2, "generatedAt": "..." },
    "esiljang": { "manifestHash": "...", "observedAt": "..." },
    "naver": { "manifestHash": "...", "collectedAt": "..." },
    "comparison": { "manifestHash": "...", "analyzedAt": "..." }
  },
  "executionPolicy": {
    "directExecutionAuthorized": false,
    "requiresCurrentConversationConfirmation": true,
    "verifyExactTargetAndLiveValuesBeforeWrite": true,
    "republishExistingAdvertisementOnly": true,
    "prohibitManualEndAndRecreate": true
  },
  "requestCount": 1,
  "requests": []
}
```

Require matching source hashes when combining the request with snapshots. `comparison` may be `null` when the report was rendered without analysis.

## Request

Each request contains:

- `requestId`, `createdAt`, and `updatedAt`.
- `status=pending_conversation_confirmation`.
- `action=modify_advertisement`, `republish_advertisement`, or `modify_and_republish_advertisement`, based on the requested effects.
- `target`: exact provider, Esiljang `externalAdId`, explicit Naver article number, provider URL, address, and transaction type.
- `observed`: source observation time, provider status, prices in 만원, and the Naver-observed floor disclosure.
- `desired`: complete desired price values, active state, optional floor mode, and `republishAfterSave`.
- `changes`: only user-entered changes, with before/after values.
- `comparisonContext`: saved rank, cheaper-competitor count, floor comparison, and observed representative article number.
- `userNote`: optional non-secret text.
- `executionPolicy`: repeats the no-direct-execution boundary.

Interpret desired price fields as integer 만원 values:

- Sale: `advertisedPrice`.
- Jeonse: `advertisedDeposit`.
- Monthly or short-term rent: `advertisedDeposit` and `advertisedMonthlyRent`.

Interpret `desired.floorExposureMode` as:

- `null`: leave the live provider setting unchanged.
- `exact`: request detailed floor exposure.
- `band`: request low/middle/high band exposure.

Interpret `desired.republishAfterSave` as:

- `false`: save only the listed condition changes; do not start republishing.
- `true`: after any listed condition changes are persisted and verified, start the existing advertisement's provider `재광고` flow. If there are no condition changes, this is a valid republish-only request.

A republish request appears in `changes` as `field=republishAfterSave`, `after=true`, and `executionMode=existing_advertisement_republish_flow`. It is an effect request, not proof of a current boolean provider state.

`observed.floorExposure` is inferred only from the query target's saved Naver `floorInfo`: numeric/B-floor prefixes are `exact`, 저/중/고 prefixes are `band`, and everything else is `unknown`. Do not treat it as proof of the current CP control value.

## Consumer rules

Before a provider write:

1. Validate `version`, `kind`, `requestCount`, source hashes, unique request IDs, and exact target identifiers.
2. Reject secrets in `userNote` and ignore unknown fields.
3. Ask the user to confirm the exact target and final values in the current conversation. The downloaded file alone is not confirmation.
4. Re-read the live CP record and stop on account, target, status, or value drift.
5. Apply only fields listed in `changes`; a `null` floor mode means no floor-setting write.
6. For republishing, open the exact existing advertisement's `재광고` flow only. Never simulate it by ending exposure and recreating the advertisement.
7. Verify saved conditions first, then verify the persisted republish marker or date after the provider flow.
