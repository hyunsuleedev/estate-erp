# Execution policy

## Computer-use-v1 contract

- Input: approved `AgentActionRequest`.
- Human authority: assigned reviewer, owner, or manager.
- Runtime: visible local agent-browser or Orca computer-use session.
- Effect: performed only after a human approved the exact content hash.
- Receipt: operation key, article number, observation timestamp, persisted
  active/price/deposit/monthly-rent state, and optional non-secret artifact ref.
- Completion: the reloaded Esiljang state must match the approved desired state.

## Browser execution contract

- Provider cookie/profile remains local and is never copied into Estate ERP.
- Use the account already selected in the visible browser.
- Use one permanent operation key per external effect.
- Approval binds capability, target, exact final values, evidence, expiry, and
  content hash.
- A lost acknowledgement is not permission to replay. Read provider state first
  and report `outcome_unknown` when certainty cannot be restored.
- Verification reloads and reads the same Esiljang record after saving; Naver is
  not queried again for completion.

## Queue boundary

- `AgentActionRequest` owns review, execution, and verification.
- `Task` owns only exceptional human follow-up.
- Approval, rejection, successful execution, and matched verification never
  mutate a Task.
- `report_agent_action_blocker` and execution mismatch are the only MVP paths
  that create `escalationTaskId`.

## Test matrix

- wrong office/account/capability/target rejected;
- hash or skill version mismatch rejected;
- duplicate operation key has no second effect;
- target/current-state drift produces a blocker without a write;
- lost acknowledgement resolves by read without replay;
- challenge/layout mismatch performs no write and creates one escalation Task;
- screenshots and logs contain no secrets;
- user takeover and disconnect leave a recoverable AgentActionRequest.
