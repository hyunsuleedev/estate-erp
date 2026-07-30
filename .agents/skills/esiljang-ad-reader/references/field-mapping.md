# Esiljang snapshot field mapping

Normalize provider observations without resolving them to public site or unit
data. All prices use Estate ERP's 만원 unit.

## Snapshot envelope

The normalization script accepts this shape:

```json
{
  "provider": "esiljang",
  "observedAt": "2026-07-29T08:30:00.000Z",
  "expectedTotal": 2,
  "paginationComplete": true,
  "visitedPages": [1],
  "items": []
}
```

`expectedTotal` may be `null` only when the provider does not expose a total.
`paginationComplete` becomes true only after a clean terminal page.

## Item identity

Every accepted item requires:

- `externalAdId`: the exact Esiljang provider advertisement ID.
- `sourcePage`: the page number on which it was observed.
- `providerUrl`: the Esiljang management or detail URL when available.

Never derive `externalAdId` from an arbitrary 8–11 digit string, address,
Naver article number, row position, or display order.

`naverArticleNo` is optional. Accept it only from:

- an explicitly labelled Naver article-number field; or
- the exact article identifier parsed from a URL on a Naver-owned host.

Do not assume the CP advertisement ID and Naver article number are equal.

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

The downstream resolver may link these observations to an office-scoped
listing and a public Unit. This reader must not create or change a Unit.

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

The staged record may preserve any provider status. Only atomic completion of a
full snapshot may reconcile unseen previously active records as ended.

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
