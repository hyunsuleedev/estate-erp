#!/usr/bin/env bash
# Auth0에 이 폴더의 Action 두 개를 올리고 각 트리거에 연결한다. 이미 있으면 코드와
# 비밀값을 새로 고친다. 먼저 `auth0 login`으로 대상 테넌트에 로그인한다.
#
#   API_BASE_URL=https://api.estaitt.com AUTH0_EVENT_SECRET=... ./deploy-actions.sh
#
# AUTH0_EVENT_SECRET은 그 서버의 환경 변수와 같은 값이어야 한다.
set -euo pipefail

: "${API_BASE_URL:?API_BASE_URL (서버 주소)를 넣어 주세요}"
: "${AUTH0_EVENT_SECRET:?AUTH0_EVENT_SECRET (서버와 같은 값)을 넣어 주세요}"

HERE="$(cd "$(dirname "$0")" && pwd)"

field() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }

# deploy <action name> <code file> <trigger id> <trigger version> <secrets json>
deploy() {
  local name="$1" file="$2" trigger="$3" version="$4" secrets="$5"
  local payload action_id status bindings
  payload="$(SECRETS="$secrets" python3 - "$file" "$name" "$trigger" "$version" <<'PY'
import json, os, sys
print(json.dumps({
    "name": sys.argv[2],
    "supported_triggers": [{"id": sys.argv[3], "version": sys.argv[4]}],
    "code": open(sys.argv[1], encoding="utf-8").read(),
    "runtime": "node22",
    "secrets": json.loads(os.environ["SECRETS"]),
}))
PY
)"
  action_id="$(auth0 api get "actions/actions?actionName=$name" </dev/null | field "next((a['id'] for a in d.get('actions', []) if a['name'] == '$name'), '')")"
  if [ -z "$action_id" ]; then
    action_id="$(auth0 api post "actions/actions" --data "$payload" </dev/null | field "d['id']")"
    echo "$name: created $action_id"
  else
    auth0 api patch "actions/actions/$action_id" --data "$payload" </dev/null >/dev/null
    echo "$name: updated $action_id"
  fi

  # 빌드가 끝나야 배포할 수 있다.
  for _ in $(seq 1 30); do
    status="$(auth0 api get "actions/actions/$action_id" </dev/null | field "d.get('status')")"
    [ "$status" = "built" ] && break
    sleep 1
  done
  auth0 api post "actions/actions/$action_id/deploy" </dev/null >/dev/null

  # 이 트리거에 이미 연결된 다른 Action은 그대로 두고, 없을 때만 끝에 붙인다.
  bindings="$(auth0 api get "actions/triggers/$trigger/bindings" </dev/null | ACTION_ID="$action_id" NAME="$name" python3 -c "
import json, os, sys
current = json.load(sys.stdin).get('bindings', [])
refs = [{'ref': {'type': 'action_id', 'value': b['action']['id']}, 'display_name': b['display_name']} for b in current]
if not any(r['ref']['value'] == os.environ['ACTION_ID'] for r in refs):
    refs.append({'ref': {'type': 'action_id', 'value': os.environ['ACTION_ID']}, 'display_name': os.environ['NAME']})
print(json.dumps({'bindings': refs}))
")"
  auth0 api patch "actions/triggers/$trigger/bindings" --data "$bindings" </dev/null >/dev/null
  echo "$name: deployed and bound to $trigger"
}

deploy "estaitflow-session-claims" "$HERE/actions/session-claims.js" "post-login" "v3" "[]"

PASSWORD_CHANGED_SECRETS="$(python3 - <<'PY'
import json, os
print(json.dumps([
    {"name": "API_BASE_URL", "value": os.environ["API_BASE_URL"]},
    {"name": "EVENT_SECRET", "value": os.environ["AUTH0_EVENT_SECRET"]},
]))
PY
)"
deploy "estaitflow-password-changed" "$HERE/actions/password-changed.js" "post-change-password" "v2" \
  "$PASSWORD_CHANGED_SECRETS"
