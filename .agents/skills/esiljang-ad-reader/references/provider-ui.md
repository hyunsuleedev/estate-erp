# Esiljang provider UI

Use this reference only for read-only navigation and extraction. Treat selectors
as verified starting points, not permission to click nearby controls.

## Allowed locations

- Login: `https://www.aipartner.com/integrated/login?serviceCode=1000`
- Advertisement list: `https://www.aipartner.com/offerings/ad_list`
- Allowed host suffix: `aipartner.com`

The local Electron authentication service fills the login form. The reader must
not read, type, log, or return the credentials. Known login selectors belong to
that local service:

- account: `#member-id`
- password: `#member-pw`
- submit: `#integrated-login > a`

If the local service cannot authenticate, leave the visible window open and
report its status. Do not replace local authentication with skill-authored
credential handling.

## Read the list safely

Start with semantic browser snapshots and the visible table headers. Use DOM
evaluation only for deterministic extraction after confirming the page shape.

Known list anchors from the reference application:

- row candidates: `table tbody tr`
- active-ad row candidate: `table tbody tr.adComplete`
- provider advertisement number inside a row:
  `td:nth-child(3) > div.numberN`
- name or full-address candidates:
  `td.danjiName p.fullName span`,
  `td.danjiName > div > p.fullName > span`, and `p.fullName span`
- total count candidate:
  `#wrap > div.container > div > div > div.sectionWrap > div.statusWrap.ver3 > div.statusItem.statusAll.GTM_offerings_ad_list_total > span.cnt`
- next-page candidate: `.pagination a.btnArrow.next`

Do not assume every `tbody tr` is an advertisement. Exclude header, empty-state,
summary, loading, and pagination rows. Require one unambiguous provider
advertisement ID before accepting a row.

## Map columns by headers

For every page:

1. Capture the current URL, page number, visible headers, total marker, and
   pagination state.
2. Associate cells with normalized visible header labels.
3. Read the stable CP advertisement ID first.
4. Read the full address and unit details exactly as displayed.
5. Read transaction terms, type, direction, status, registration/publication
   date, description, provider management URL, and explicit Naver link or
   article number when present.
6. Preserve unknown columns in `sourceFields` using their visible header labels.
7. Re-snapshot after pagination. Reject a page whose identity set is identical
   to the previous page when the UI claims it advanced.

Do not use a fixed `nth-child` mapping for fields other than a selector that has
been freshly verified against the visible headers.

## Pagination and completeness

- Follow only the list's next-page control.
- Stop when the control is absent or visibly disabled.
- Track the ordered page numbers and a hash or sorted set of row IDs per page.
- Abort on a repeated page, page-number regression, unexpected jump, or
  contradictory next-page state.
- When the provider total is visible, the unique accepted-row count must equal
  it. A mismatch is `partial_snapshot`.
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
