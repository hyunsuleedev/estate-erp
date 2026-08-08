# Estate ERP Interface System

## Direction and feel

- Build a dense, calm operations workbench for Korean real-estate agents who scan and update many records in sequence.
- Treat the desktop property-management table as the canonical reference for other data-heavy pages.
- Favor a Notion-like document grid: full-bleed content, quiet warm neutrals, compact controls, and color reserved for business state.
- The product signature is a property ledger where lifecycle, urgency, matching, and deal progress can be understood and updated without leaving the row.

## Foundation

- Depth: use borders and subtle surface shifts for page and table structure. Reserve a quiet shadow for transient overlays such as popovers and drawers.
- Surfaces: white canvas and table; warm neutral filter/tool surfaces (`bg-[#faf9f6]`, `bg-[#f7f7f5]`) where the existing page pattern calls for them.
- Color: use semantic tokens (`success`, `warning`, `info`, `destructive`, `neutral`) only to communicate state. Do not add decorative accent colors.
- Spacing: 4px base unit. Dense table rows are 40px; compact toolbar controls are 32px; table-cell horizontal padding is 10px.
- Radius: small controls and status pills use 4–6px; table containers stay visually flat; overlays use the shared popover radius.
- Typography: Pretendard. Table headers are 12px/400 muted; normal cells are 12–13px; primary identity cells are 13px/600; table status labels are 11px/500.
- Hierarchy: identity and operational state lead through weight and semantic color. Filters, metadata, and counts remain muted.

## Canonical dense-table pattern

- Pages use the full-bleed workbench layout and the shared `DataTable` `notion` variant.
- Keep primary identity and row actions pinned; open record detail on row double-click when individual cells contain frequent actions.
- Reuse shared table cells, buttons, badges, and editors. Do not hand-roll dropdown, popover, focus, or keyboard behavior.
- Interactive cells stop row click and double-click propagation so editing never opens the detail view accidentally.

## Inline semantic selector

Use this for lifecycle, availability, urgency, and similarly small controlled enums.

- Wrap the page with `CellEditProvider` and use `EditableCell` with `editType="select-chip"`.
- Make the entire cell hit area interactive while preserving the normal compact status badge as the visible trigger.
- Trigger geometry: 40px row hit area; badge `h-6 px-2 text-[11px]`; no extra border, button chrome, or chevron.
- Popover options reuse the exact semantic color of their table badge and clearly mark the current option as `선택됨`.
- Pass `chipValueOf` so legacy-normalized and primitive values correctly mark the current selection.
- While saving, prevent a duplicate edit and reduce the trigger to 60% opacity. On failure, show a concise error toast and refetch the affected query.
- A selection saves immediately and closes the popover. Clicking the already-selected value performs no request.
- Reference implementation: `apps/desktop/src/renderer/routes/_authenticated/buyer-requirements/index.tsx` (`BuyerInlineSelectCell`).

## Selected reference decisions

- Property-management table behavior is the reference for inline status editing.
- Buyer lifecycle status and buyer urgency use the same interaction, with their existing semantic palettes preserved.
- Dense repeated actions should feel immediate; avoid decorative motion. Use only the shared popover transition and respect reduced-motion settings.
