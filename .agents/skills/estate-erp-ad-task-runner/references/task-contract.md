# Task contract

Estate ERP exposes ordinary Tasks through MCP. Advertisement automation uses no
special server queue or execution model.

## Required tools

- `find_tasks({ category: "advertisement", status: "pending" })`
- `get_task({ id })`
- `claim_task({ id })`: atomically changes `pending` to `in_progress` and assigns
  the current ERP user if the Task was unassigned. A conflict means stop.
- `update_task({ id, status, content? })`

Relevant read/import tools include `find_listing_advertisements`,
`get_listing_advertisement`, `begin_listing_advertisement_snapshot`,
`submit_listing_advertisement_snapshot_item`, and
`complete_listing_advertisement_snapshot`. Use the exact current MCP schemas;
do not invent fields from this summary.

## Interpretation

- `category` must be `advertisement`.
- `status=pending`: available to claim.
- `status=in_progress`: claimed or deliberately left for verification/recovery.
- `status=completed`: provider state was re-read and matches the requested work.
- `status=cancelled`: the user cancelled the work.

Task content is a human request, not a machine-authored step log. It should name
the intended result and stable domain identifiers when available. Detailed
provider plans and diagnostics stay in local SQLite. Status updates must not
replace the original request or target identifiers. If a user-facing result or
blocker is needed, append one short `실행 메모` to the existing content.

## Failure mapping

- No provider write occurred and user input is required: local `needs_input`,
  Task back to `pending` with a concise blocker.
- A provider write may have occurred but cannot be verified: local `failed`,
  Task remains `in_progress` for explicit recovery.
- User cancels: both local run and Task become `cancelled`.
