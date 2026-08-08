# Esiljang snapshot field mapping

Normalize provider observations without resolving them to any consumer's site,
unit, listing, or advertisement records. All prices use 만원 as the standalone
snapshot unit.

## Snapshot envelope

The normalization script accepts this shape:

```json
{
  "provider": "esiljang",
  "scope": "active_advertisements",
  "activeFilter": {
    "dataValue": "ad",
    "selected": true,
    "count": 2
  },
  "observedAt": "2026-07-29T08:30:00.000Z",
  "expectedTotal": 2,
  "paginationComplete": true,
  "visitedPages": [1],
  "items": []
}
```

`scope` must be `active_advertisements`. `expectedTotal` is the count shown on
the selected `광고중` control, never the default `전체` count. It may be `null`
only when the active count is unavailable. `paginationComplete` becomes true
only after a clean terminal page while the active filter remains selected.
`activeFilter.dataValue` must be `ad`, `selected` must be true, and its `count`
must equal `expectedTotal` when the count is available.

## Item identity

The provider page exposes identifiers through CSS classes. Treat the Korean
meaning as the field definition and the class name only as its extraction
selector:

- 이실장 매물번호 (`.numberA`) → `externalAdId`
- 네이버 매물번호 (`.numberN`) → `naverArticleNo`
- 의미 미확정 보조번호 (`.numberM`) → 정식 필드에 매핑하지 않음

Every accepted item requires:

- `externalAdId`: the exact 이실장 매물번호 extracted from
  `td:nth-child(3) > div.numberA`.
- `sourcePage`: the page number on which it was observed.
- `providerUrl`: the Esiljang management or detail URL when available.

Never derive `externalAdId` from an arbitrary 8–11 digit string, address,
Naver article number, row position, or display order.

`naverArticleNo` is the optional 네이버 매물번호. Accept it only from:

- `td:nth-child(3) > div.numberN`, when present and numeric;
- another explicitly labelled Naver article-number field; or
- the exact article identifier parsed from a URL on a Naver-owned host.

Do not assume the CP advertisement ID and Naver article number are equal.
The meaning of `.numberM` is not verified. Do not map it to a canonical snapshot
field or use it as either identity. When it is visible, preserve it only as
`sourceFields["보조번호 (의미 미확정)"]` so the raw observation is not lost.

## Address and listing detail

Preserve these office-private observations when visible:

- `complexName`
- `fullAddress`
- `dong`
- `floor`
- `ho`
- `propertyType`
- `unitType`
- `transactionType`
- `direction`
- `features`
- `memo`

Keep `floor` as a string so provider values such as basement, low, middle, or
high floor are not silently converted. Trim a simple trailing `동` or `호` only
from exact `dong` and `ho` fields; never parse them from free-form address text.

A downstream consumer may link these observations to its own domain records.
This Reader must not create, resolve, or change those records.

## Terms

Use:

- `advertisedPrice` for sale price;
- `advertisedDeposit` for lease or monthly-rent deposit;
- `advertisedMonthlyRent` for monthly rent.

Numbers are already interpreted as 만원. Korean text supports forms such as
`15억 8,000`, `15.8억`, `8,000만원`, and `150`. A combined expression such as
`3억/150` must be split into the correct labelled fields during extraction;
the normalizer must not guess its meaning.

Reject negative, non-finite, or fractional 만원 values.

## Dates and status

- `registeredAt`: provider registration or publication date, normalized to an
  ISO timestamp or `YYYY-MM-DD` when only a date is available.
- `providerStatus`: provider text normalized to a stable lowercase string while
  preserving the original value in `sourceFields` if needed.
- `observedAt`: one capture timestamp for the snapshot, not a guessed provider
  date.

Preserve any row status returned by the selected provider `광고중` filter. The
filter selection, not the row's status text, defines snapshot membership. Only
atomic completion of a full snapshot may reconcile unseen previously active
records as ended.

## Optional source evidence

`sourceFields` is an object of visible header label to visible value. Keep it
small and relevant. Do not include HTML, hidden fields, cookies, tokens,
authorization data, or credentials.

Example normalized item:

```json
{
  "provider": "esiljang",
  "externalAdId": "ES-1042087",
  "naverArticleNo": "2612345678",
  "naverUrl": "https://new.land.naver.com/complexes/123?articleNo=2612345678",
  "providerUrl": "https://www.aipartner.com/offerings/ad_list",
  "complexName": "예시아파트",
  "fullAddress": "서울특별시 예시구 예시로 1 101동 1203호",
  "dong": "101",
  "floor": "12",
  "ho": "1203",
  "transactionType": "매매",
  "propertyType": "아파트",
  "unitType": "84A",
  "advertisedPrice": 158000,
  "advertisedDeposit": null,
  "advertisedMonthlyRent": null,
  "direction": "남향",
  "registeredAt": "2026-07-29",
  "providerStatus": "광고중",
  "features": ["로열동", "입주협의"],
  "memo": null,
  "sourcePage": 1,
  "sourceFields": {}
}
```
