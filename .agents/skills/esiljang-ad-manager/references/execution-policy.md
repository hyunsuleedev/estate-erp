# Local execution policy

## Authority

Input is a claimed Estate ERP advertisement Task plus an exact local plan. The
human authority is the user's confirmation in the current conversation. A Task
title alone does not authorize unspecified provider effects.

## Runtime and progress

- Runtime is a visible local agent-browser or Orca computer-use session.
- Detailed progress is stored only by `estate-erp-ad-task-runner` in local
  SQLite. Estate ERP stores only the ordinary Task and verified business data.
- One stable operation key is used per external effect.
- A failed later republish step does not erase a verified earlier terms save.
  Recovery starts at the first locally non-succeeded step after re-reading the
  provider.

## Completion

Completion requires a provider reload showing the same article and exact
confirmed state. A non-secret receipt is returned to the task runner, which
performs a complete CP read/import before marking the Task completed.

## Lost acknowledgement

A lost acknowledgement is not permission to replay. Read provider state first.
If certainty cannot be restored, return `outcome_unknown` and keep the ERP Task
in progress for explicit recovery.

## Test matrix

- wrong account or target causes no write;
- local active-run uniqueness prevents duplicate execution;
- current-state drift causes no write;
- modify-only, republish-only, and combined plans run only applicable steps;
- lost acknowledgement resolves by read without replay;
- challenge/layout mismatch stores no secret and returns a blocker;
- final success requires reloaded provider state, not a toast;
- user takeover leaves a locally resumable run and an ordinary ERP Task.
