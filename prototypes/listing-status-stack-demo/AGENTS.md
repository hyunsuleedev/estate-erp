# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Prototype Design Decisions

- Reproduce the existing Estate ERP desktop property-management density and visual language instead of introducing a new layout.
- Intake status is the single source of truth, so each intake row renders exactly one status chip.
- An intake can have at most one active Deal. The Deal's `listingId` identifies the only listing currently in progress.
- When an in-contract intake contains two or more listings, a restrained curved connector runs from the right edge of the `거래중` chip to the center of the active Deal's listing sub-row.
- Single-listing rows do not render a connector because the Deal target is already unambiguous.
- The connector is persistent, uses the existing in-contract blue, ends in a small round node, and never uses an arrowhead.
- Clicking the intake status chip reveals the active listing and Deal relationship.
