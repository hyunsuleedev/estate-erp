# Design QA

## Scope

- Viewport: 1500 × 873 CSS px
- State: `/properties`-style list view with single- and multi-listing intakes
- Main screenshot: `output/playwright/intake-deal-connector.png`
- Deal drawer screenshot: `output/playwright/intake-deal-connector-drawer.png`

## Verified design rules

- Every intake renders exactly one availability chip.
- A single-listing intake never renders a connector.
- A multi-listing intake in `거래중` renders exactly one connector because an intake can have at most one active Deal.
- The connector target is resolved from `activeDeal.listingId`, not from transaction type or row position.
- The connector ends immediately before the target listing's transaction badge and does not cover price text.
- Two samples exercise both directions: the first listing is active in one intake, and the second listing is active in another.
- The line remains secondary to the `거래중` chip: 1.25 px stroke, muted in-contract blue, round endpoint, no arrowhead.
- Hover or keyboard focus strengthens the line and lightly highlights the target listing row.

## Interaction checks

- Opened the `매매`-targeted intake and confirmed `DEAL-260727-11`, `매매`, and `26억 8,000만`.
- Opened the `전세`-targeted intake and confirmed `DEAL-260726-08`, `전세`, and `10억 8,000만`.
- Confirmed the status button's accessible name includes the intake status and active listing transaction type.
- Confirmed the target listing is independently keyboard-accessible and identifies the active Deal.
- Browser console: no errors or warnings.

## Build checks

- `npm run build`: passed
- `npm run test:sites`: 4/4 passed

final result: passed
