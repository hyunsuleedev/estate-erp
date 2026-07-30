---
name: esiljang-ad-manager
description: Execute an approved Estate ERP AgentActionRequest in a visible local Esiljang session with agent-browser or Orca computer use, verify the persisted result in the same provider UI, and escalate only real human-needed exceptions to Task.
---

# Esiljang Ad Manager

Execute one approved external effect exactly as reviewed. Use the user's visible,
existing local session. Estate ERP authentication and the provider session are
separate boundaries.

## Choose the execution surface

- Use `computer-use-v1`.
- Use agent-browser when Esiljang is a browser page. Use Orca computer use when
  the interaction must pass through a desktop app or an existing browser window.
  Load the matching computer-use skill before operating either surface.
- Keep the user able to observe, take over, or stop the run.

Read [references/execution-policy.md](references/execution-policy.md) before any
live execution or recovery after an ambiguous outcome.

## Execute an approved action

1. Fetch the `AgentActionRequest` by ID.
2. Create or reuse an `agent_start_session` with
   `agentActionRequestId=<request id>` and a stable task key. Do not also attach
   an ERP Task ID.
3. Require `reviewStatus=approved`,
   `executionStatus=awaiting_manual`, and
   `approvedContentHash === contentHash`.
4. Show the assigned reviewer before the first external write:
   - office/listing/article identity;
   - approved final status or price terms in 만원;
   - rationale, evidence capture time, and short content-hash identifier.
5. Open or attach to the visible local Esiljang session. Confirm the expected
   account and exact article identity before interacting.
6. Read the live current values. If the account, target, screen, or current
   values make the approved effect ambiguous, do not write. Call
   `report_agent_action_blocker` with the exact hash/version and a structured
   reason.
7. Apply only the approved final values once. If and only if the approved
   `advertisement.terms.set` payload has `republishAfterSave=true`, continue
   through Esiljang's visible `바로 재광고` flow after the terms are saved.
   Re-snapshot after every navigation or dynamic page change; never reuse stale
   element references.
8. After saving, reload or revisit the same Esiljang advertisement and read its
   persisted active state and price/deposit/monthly-rent values. For an approved
   republish, also require a persisted provider-side publication marker or
   refreshed publication date from the reloaded record. A click acknowledgement
   or toast alone is not proof of republishing.
9. Call `record_agent_action_execution` with the exact content hash, current
   version, and receipt fields `operationKey`, `articleNo`, `observedAt`, and
   `observedAfter`. Set `observedAfter.republished=true` only when step 8
   confirmed the republish in the reloaded record; otherwise set it to false.
   Optional provider URL, confirmation text, and screenshot artifact IDs must
   not contain secrets.
10. The server compares the reloaded Esiljang state with the approved payload. A
   match updates `ListingAdvertisement` and closes the AgentActionRequest. It
   does not create, complete, or cancel an ordinary Task, and it does not
   re-observe Naver.

## Report a blocker

Use `report_agent_action_blocker` for:

- `captcha`
- `mfa`
- `account_mismatch`
- `target_not_found`
- `layout_mismatch`
- `precondition_mismatch`
- `outcome_unknown`
- `provider_warning`
- `other`

Reporting a blocker moves the request to `needs_input` and creates one
`Task(source=ai, category=advertisement)` assigned to the reviewer. Do not also
create a Task manually.

## Keep the interaction bounded

Pin the skill release, browser session alias, target, desired state, operation
key, and approved content hash:

```text
fresh Esiljang read → compare identity/current state → apply once
→ approved republish if requested → reload same Esiljang record
→ read persisted state/publication marker → submit receipt
```

## Fail closed

- Never log or upload passwords, cookies, OTPs, authorization headers, or browser
  profile data.
- Never export the user's browser profile or saved authentication state.
- Use current snapshot references or semantic locators and re-snapshot after page
  changes.
- Stop and report a blocker on CAPTCHA, MFA, consent, layout mismatch, provider
  warning, account switch, target ambiguity, or uncertain outcome.
- Never broaden the approved target, fields, account, capability, or payload.
- Never infer success from a toast or click acknowledgement. Require a fresh
  persisted after-state from the reloaded Esiljang record.
- Never perform `바로 재광고` when `republishAfterSave` is false or absent.
- If submission may have happened but acknowledgement was lost, inspect provider
  state before any retry and report `outcome_unknown` if certainty is not
  restored.
