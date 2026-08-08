# Agentic Workspace Architecture

## 1. Product boundary

Estate ERP is the shared system of record for listings, contacts, managed sites,
CRM work, advertising observations, and ordinary Tasks. It is not an agent
runtime.

The user's subscribed external AI (Codex, Claude, ChatGPT, and similar) connects
to Estate ERP through MCP when the user starts it. The server never waits for,
polls, wakes, leases, or dispatches an AI worker.

```text
User starts subscribed AI
  -> AI reads pending Task(category=advertisement)
  -> claim_task atomically marks it in_progress
  -> local Skills read/compare/write providers
  -> local SQLite stores detailed steps and retries
  -> verified observations are imported into Estate ERP
  -> AI marks the ordinary Task completed
```

## 2. State ownership

| State | Authority |
| --- | --- |
| User request, assignee, priority, due date, pending/in-progress/completed | Estate ERP `Task` |
| CP advertisement ledger (`active/ended`) | Estate ERP `ListingAdvertisement` |
| Naver advertising-note observations | Estate ERP `ExternalListingGroup / ExternalListing` |
| Current own-ad duplicate/ranking projection | Estate ERP `OfficeAdvertisementGroup / OfficeAdvertisement` |
| Managed sites | Estate ERP `OfficeSite` |
| Collection site ↔ Naver complexNo scope | `naver-complex-collector` local SQLite |
| Provider plan, step, attempt, blocker, non-secret receipt | `estate-erp-ad-task-runner` local SQLite |
| CP credentials and authenticated browser state | provider auth Skill local storage/browser |

Removed server concepts include AgentSession, wakeup, agent run/activity,
AdvertisementSyncRun/Step, AgentActionIssue/Request/ExecutionStep/Verification,
and ExternalListingSource.

## 3. Task contract

Advertisement work is an ordinary Task with `category=advertisement`.

- `pending`: available for an external AI to claim.
- `in_progress`: claimed or awaiting explicit recovery/verification.
- `completed`: the provider state was freshly re-read and matches the request.
- `cancelled`: the user cancelled the work.

`claim_task` performs one atomic `pending -> in_progress` transition and assigns
the current ERP user when unassigned. A conflict means another executor or
employee owns the Task.

Task content is human-facing and may include stable domain identifiers. It must
not become a detailed machine step log.

## 4. Local execution

`estate-erp-ad-task-runner` owns one active local run per Task. It coordinates:

1. complete CP read;
2. immutable snapshot import;
3. optional Naver comparison;
4. exact proposed provider changes and current-session user confirmation;
5. visible provider write through a channel-specific manager Skill;
6. fresh provider read and complete CP re-import;
7. Task completion.

CAPTCHA, MFA, account mismatch, target mismatch, provider warning, or ambiguous
outcome fails closed. Secrets never enter Task content, MCP payloads, local run
details, screenshots, or logs.

There is no daemon or server polling loop. Local execution begins only in the
user's AI session.

## 5. Collection scope

`naver-complex-collector` owns exact local mappings:

```text
(siteId, provider=naver) -> externalCode=complexNo
```

A managed site can be imported from Estate ERP only on an explicit user request.
`Site.naverComplexCode` is a suggestion, not live collection authority. Ambiguous
Naver search results require user selection.

Only a complete `(siteId, transactionType)` capture may complete an Estate ERP
snapshot session. Partial captures are cancelled so unseen observations are not
incorrectly deactivated.

## 6. UI

The product exposes:

- 광고관리 → 광고노트
- 광고관리 → 내광고관리
- 업무 → `category=advertisement` Tasks

It does not expose an automation-flow dashboard, AI request inbox, collection
scope manager, agent identity, wakeup status, or step ledger. My Ads can create
an ordinary advertising Task containing the user's request and stable target
IDs.

## 7. MCP surface

Required Task tools:

- `find_tasks`
- `get_task`
- `create_task`
- `claim_task`
- `update_task`

Provider observation/import tools remain domain tools. No MCP tool starts an
agent session, claims a wakeup, records an AgentAction step, or approves an
external effect.

## 8. Verification invariant

A provider click, toast, or acknowledgement is not success. The local Skill must
reopen the same provider record, compare the persisted after-state with the
confirmed plan, and then import a complete CP snapshot. Only then may the Task
be marked `completed`.
