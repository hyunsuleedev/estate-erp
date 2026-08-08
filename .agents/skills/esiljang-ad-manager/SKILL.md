---
name: esiljang-ad-manager
description: Execute an exact, user-confirmed local advertisement plan in a visible Esiljang session, record detailed progress in the estate-erp-ad-task-runner local SQLite, and verify the persisted provider result. Use only after an Estate ERP advertisement Task has been claimed and the current conversation has confirmed the exact target and changes.
---

# Esiljang Advertisement Manager

Execute the exact local plan supplied by `estate-erp-ad-task-runner`. There is no
server AgentActionRequest, approval queue, wakeup, run, or execution-step API.
The claimed ERP Task is the user-visible work state; this Skill's detailed state
is local.

Read [references/execution-policy.md](references/execution-policy.md) before any
live write or recovery after an ambiguous outcome.

## Required input

Require all of the following from the caller:

- claimed advertisement `taskId` and local `runId`;
- exact Estate ERP `listingAdvertisementId`;
- expected Esiljang account and stable provider article number;
- observed current state;
- exact desired active state and price/deposit/rent values in 만원;
- whether floor exposure, save, exposure end, or republish is requested;
- confirmation from the user in the current conversation.

Reject a vague instruction such as “가격 맞춰줘” without resolved final values.
Never broaden the target or add a provider effect because it seems useful.

## Choose the execution surface

- Use a visible local browser/computer-use surface.
- Use agent-browser for a browser page. Use Orca computer use when the existing
  authenticated provider session is available only through a desktop window.
  Load the matching computer-use skill before operating it.
- If authentication is missing, use `cp-browser-auth`. Credentials remain in
  that Skill's local config and must never enter ERP, Task content, run SQLite,
  screenshots, or logs.
- Keep the user able to observe, take over, or stop the run.

## Execute the confirmed plan

For each applicable step, write `running` and then its observed terminal state
through `estate-erp-ad-task-runner/scripts/run-state.mjs step`. Use stable keys:

```text
target_confirm -> terms_save -> saved_state_verify -> republish_start
-> exposure_end_consent -> verification_prepare -> save_send -> final_verify
```

Skip inapplicable steps; do not invent them in ERP.

1. `target_confirm`: attach to the visible session and verify the expected
   account, exact article number, and live current values. A mismatch is a
   no-write blocker.
2. `terms_save`: apply only confirmed fields and save once. Null or omitted
   floor mode means leave it unchanged.
3. `saved_state_verify`: reload or revisit the record and read persisted terms.
4. `republish_start`: only when explicitly requested, open the existing
   advertisement's `재광고` flow. Do not manually end and recreate it.
5. `exposure_end_consent`: confirm the same target and accept only the expected
   provider consent/warning. A take-down-only plan uses the dedicated exposure
   end path.
6. `verification_prepare` and `save_send`: complete only the provider material
   and consent explicitly required for this confirmed plan. Re-snapshot after
   each navigation; never reuse stale element references.
7. `final_verify`: reopen the exact advertisement from the provider list and
   read its persisted active state, terms, optional floor mode, and republish
   marker/date. A toast or click acknowledgement is not completion evidence.

Return a non-secret receipt to the caller containing the article number,
observed timestamp, persisted state, and concise confirmation text. The caller
then re-reads/imports the complete CP snapshot and completes the ERP Task.

## Blockers and ambiguous outcomes

For CAPTCHA, MFA, account mismatch, target missing, layout mismatch,
precondition drift, provider warning, or missing consent:

- stop before the first uncertain write;
- record the current local step as `needs_input` with a concise message;
- return control to the task runner, which updates the ordinary ERP Task.

If a write may have happened but acknowledgement was lost, inspect provider
state before any retry. If certainty cannot be restored, record `failed` with
`outcome_unknown`; never replay the effect.

## Fail closed

- Never log passwords, cookies, OTPs, authorization headers, or browser profile
  data.
- Never read or edit the auth Skill's `config.js` directly.
- Never mutate a different account, article, field, or value.
- Never republish unless the confirmed plan explicitly requests it.
- Never report success without a fresh persisted after-state.
