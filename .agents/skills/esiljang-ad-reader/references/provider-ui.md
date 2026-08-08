# Esiljang provider UI

Use this reference only for read-only navigation and extraction. Treat selectors
as verified starting points, not permission to click nearby controls.

## Allowed locations

- Login: `https://www.aipartner.com/integrated/login?serviceCode=1000`
- Advertisement list: `https://www.aipartner.com/offerings/ad_list`
- Allowed host suffix: `aipartner.com`

The local credential broker fills the login form in the Skill-owned
agent-browser tab over a loopback CDP connection. The reader must not read,
type, log, or return the credentials. Known login selectors belong to that
broker:

- account: `#member-id`
- password: `#member-pw`
- submit: `#integrated-login > a`

If the local service cannot authenticate, leave the visible agent-browser
session open only when human input can resolve the state and report its status.
Do not replace local authentication with skill-authored credential handling and
never open AIPartner in an Electron `BrowserWindow`.

## Select the current-ad scope first

The list initially selects `전체`; it mixes currently advertised rows with
states such as `결제대기`. It is not a valid current-ad snapshot.

- exact active filter:
  `.statusWrap.ver3 .statusItem.statusIng.GTM_offerings_ad_list_ad_ing[data-value="ad"]`
- exact provider URL attribute:
  `https://www.aipartner.com/offerings/ad_list`
- active count: the filter's direct `.cnt` text
- selected proof after navigation: `aria-selected="true"`

Snapshot the status controls, verify the filter's title is `광고중`,
`data-value` is `ad`, and `data-url` is the exact advertisement-list URL, then
click only that control. This read-only filter click sends a POST and may replace
the page target. Discard all refs, reattach, and take a fresh snapshot. Require
the exact list URL, selected proof, active page 1, the unchanged active count,
and a row-ID set stable across two observations before starting a snapshot.

The selected provider filter is authoritative. Preserve the header-mapped
`광고상태` for every returned row, including an exceptional status such as
`거래완료`; do not apply a second local status filter. Stop with
`active_filter_mismatch` only when the exact provider filter selection or count
cannot be proven.

## Read the list safely

Start with semantic browser snapshots and the visible table headers. Use DOM
evaluation only for deterministic extraction after confirming the page shape.

Known list anchors from the reference application:

- active list root: `.singleSection.listSection`
- row candidates: `.singleSection.listSection table tbody tr`
- 이실장 매물번호 inside a row:
  `td:nth-child(3) > div.numberA`
- 네이버 매물번호 inside a row when published:
  `td:nth-child(3) > div.numberN`
- 의미 미확정 보조번호: `td:nth-child(3) > div.numberM`
- name or full-address candidates:
  `td.danjiName p.fullName span`,
  `td.danjiName > div > p.fullName > span`, and `p.fullName span`
- active expected-total candidate:
  `.statusWrap.ver3 .statusItem.statusIng.GTM_offerings_ad_list_ad_ing[data-value="ad"] > .cnt`
- all-status count (diagnostic only, never `expectedTotal`):
  `.statusWrap.ver3 .statusItem.statusAll.GTM_offerings_ad_list_total > .cnt`
- next-page candidate:
  `.singleSection.listSection .pagination a.btnArrow.next`
- active-page marker:
  `.singleSection.listSection .pagination .btnPage.on[data-value]`

Do not assume every `tbody tr` is an advertisement. Exclude header, empty-state,
summary, loading, and pagination rows. Require one unambiguous 이실장 매물번호
from `.numberA` before accepting a row. Do not use the 네이버 매물번호 from
`.numberN` as the CP identity. Do not map `.numberM` to a canonical field or
expose it in the primary UI; preserve it only as
`sourceFields["보조번호 (의미 미확정)"]` until its provider meaning is independently
verified.

## Map columns by headers

For every page:

1. Capture the current URL, page number, visible headers, total marker, and
   pagination state.
2. Associate cells with normalized visible header labels.
3. Read the stable 이실장 매물번호 from `.numberA` first. Read the 네이버
   매물번호 from `.numberN` as `naverArticleNo` only when it contains digits and
   is explicitly present.
4. Read the full address and unit details exactly as displayed.
5. Read transaction terms, type, direction, status, registration/publication
   date, description, provider management URL, and explicit Naver link or
   article number when present.
6. Preserve unknown columns in `sourceFields` using their visible header labels.
7. Re-snapshot after pagination. Reject a page whose identity set is identical
   to the previous page when the UI claims it advanced.
8. Re-require the selected `광고중` filter and preserve every returned row's
   status without local filtering.

Do not use a fixed `nth-child` mapping for fields other than a selector that has
been freshly verified against the visible headers.

## Pagination and completeness

- Follow only the next-page or numbered-page control inside
  `.singleSection.listSection`.
- Prefer a normal browser click. If the visible numbered link does not advance,
  verify its `data-value` and use a narrowly scoped DOM `.click()` on that exact
  link; never call an unverified provider function directly.
- Stop when the control is absent or visibly disabled.
- Track the ordered page numbers and a hash or sorted set of row IDs per page.
- Treat every pagination click as a possible document or CDP target replacement.
  Discard stale element references, reattach, and take a fresh snapshot.
- Wait until the active `.btnPage.on` value matches the requested page and the
  count of rows containing an 이실장 매물번호 (`.numberA`) is unchanged across
  two observations.
- Abort on a repeated page, page-number regression, unexpected jump, or
  contradictory next-page state.
- When the active filter count is visible, the unique accepted-row count must
  equal it. A mismatch is `partial_snapshot`. Never compare against the `전체`
  count.
- When the total is not visible, require a clean terminal page and preserve a
  warning that total-count verification was unavailable.

## Detect human-needed states

Stop without collecting further data when the page shows:

- a login form after session preparation;
- CAPTCHA, MFA, phone verification, consent, or password-change prompts;
- an account or office selector with more than one plausible choice;
- a warning that requires confirmation;
- an unexpected provider domain;
- a table with missing or ambiguous advertisement identity.

Never dismiss or accept these states automatically.

## Prohibited controls

Do not click controls whose text or semantics include edit, save, delete,
exposure end, end advertisement, re-advertise, register, payment, apply,
approve, select all, or bulk processing. The separate `esiljang-ad-manager`
skill owns approved mutations.
