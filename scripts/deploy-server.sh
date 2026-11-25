#!/usr/bin/env bash
# 운영 서버 배포: 내 Mac에서 이미지를 만들어 ECR에 올리고, EC2에서 받아 다시 띄운다.
#
#   ./scripts/deploy-server.sh              빌드 → ECR 푸시 → EC2에서 pull · up
#   ./scripts/deploy-server.sh --push-env   내 Mac의 .env.prod를 AWS(Parameter Store)에 올리기만 한다
#   ./scripts/deploy-server.sh --skip-build 이미 올린 현재 커밋의 이미지를 다시 띄우기만 한다(환경 변수 반영 포함)
#   ./scripts/deploy-server.sh --logs       서버의 마지막 로그를 본다
#
# EC2에는 SSH가 아니라 AWS Systems Manager로 명령을 보낸다 — 22번 포트를 열 필요가 없고, 내 IP가 바뀌어도
# (VPN) 된다. 서버의 비밀값(.env.prod)은 Parameter Store에 암호화해 두고 EC2가 배포 때 역할로 읽어 간다.
# 명령 기록에 비밀값이 남지 않는다.
#
# 설정은 저장소 맨 위의 .env.deploy에서 읽는다(틀: .env.deploy.example). 순서 전체는 docs/DEPLOY.md.
# 서버는 뜰 때 DB 마이그레이션을 먼저 돌린다(apps/server/docker-entrypoint.sh) — 스키마가 바뀌는 배포 전에는
# RDS 스냅샷을 떠 둔다.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.deploy ]; then
  echo ".env.deploy가 없습니다. .env.deploy.example을 복사해 채우세요." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env.deploy
set +a

: "${AWS_REGION:?AWS_REGION이 비어 있습니다}"
: "${ECR_REPOSITORY:?ECR_REPOSITORY가 비어 있습니다}"
: "${EC2_INSTANCE_ID:?EC2_INSTANCE_ID가 비어 있습니다}"
: "${API_DOMAIN:?API_DOMAIN이 비어 있습니다}"
REMOTE_DIR="${REMOTE_DIR:-/home/ubuntu/estaitflow}"
ENV_PARAMETER="${ENV_PARAMETER:-/estaitflow/prod/env}"
[ -z "${AWS_PROFILE:-}" ] && unset AWS_PROFILE
export AWS_REGION AWS_PAGER=""

MODE="deploy"
case "${1:-}" in
  "") ;;
  --push-env) MODE="push-env" ;;
  --skip-build) MODE="skip-build" ;;
  --logs) MODE="logs" ;;
  *) echo "모르는 옵션: $1" >&2; exit 1 ;;
esac

# EC2에서 셸 스크립트를 돌리고 끝날 때까지 기다려 출력을 보여 준다. 실패하면 0이 아닌 값으로 끝난다.
run_on_server() {
  local script_file="$1" timeout="${2:-600}" command_id status
  python3 - "$script_file" "$timeout" "$EC2_INSTANCE_ID" > "$TMP/command.json" <<'PY'
import json, sys
script = open(sys.argv[1], encoding="utf-8").read()
sys.stdout.write(json.dumps({
    "InstanceIds": [sys.argv[3]],
    "DocumentName": "AWS-RunShellScript",
    "TimeoutSeconds": int(sys.argv[2]),
    "Parameters": {"commands": [script], "executionTimeout": [sys.argv[2]]},
}))
PY
  command_id="$(aws ssm send-command --cli-input-json "file://$TMP/command.json" --query Command.CommandId --output text)"
  while :; do
    status="$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$EC2_INSTANCE_ID" --query Status --output text 2>/dev/null || echo Pending)"
    case "$status" in Pending|InProgress|Delayed) sleep 4 ;; *) break ;; esac
  done
  aws ssm get-command-invocation --command-id "$command_id" --instance-id "$EC2_INSTANCE_ID" --query StandardOutputContent --output text
  if [ "$status" != "Success" ]; then
    echo "서버 명령이 실패했습니다 ($status):" >&2
    aws ssm get-command-invocation --command-id "$command_id" --instance-id "$EC2_INSTANCE_ID" --query StandardErrorContent --output text >&2
    return 1
  fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ "$MODE" = "logs" ]; then
  echo "docker logs --tail 120 estaitflow-server 2>&1" > "$TMP/logs.sh"
  run_on_server "$TMP/logs.sh" 60
  exit 0
fi

if [ "$MODE" = "push-env" ]; then
  if [ ! -f .env.prod ]; then
    echo ".env.prod가 없습니다. .env.prod.example을 복사해 채우세요." >&2
    exit 1
  fi
  # 비어 있는 필수값이 있으면 올리지 않는다(올려도 서버가 뜨지 않는다)
  missing=""
  for key in DATABASE_URL AUTH0_DOMAIN AUTH0_AUDIENCE AUTH0_MGMT_CLIENT_ID AUTH0_MGMT_CLIENT_SECRET \
    AUTH0_STAFF_CLIENT_IDS AUTH0_EVENT_SECRET CONTRACT_PARTY_CRYPTO_KEY; do
    value="$(grep -E "^${key}=" .env.prod | tail -1 | cut -d= -f2- || true)"
    [ -z "$value" ] && missing="$missing $key"
  done
  if grep -qE 'USER:PASSWORD@RDS-ENDPOINT|@RDS-ENDPOINT' .env.prod; then missing="$missing DATABASE_URL(틀 그대로)"; fi
  if [ -n "$missing" ]; then
    echo ".env.prod에 비어 있는 필수값:$missing" >&2
    exit 1
  fi
  aws ssm put-parameter --name "$ENV_PARAMETER" --type SecureString --overwrite --value "file://.env.prod" \
    --query Version --output text | sed 's/^/Parameter Store에 올렸습니다. 버전 /'
  echo "반영하려면 ./scripts/deploy-server.sh --skip-build"
  exit 0
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
if [ -n "${IMAGE_TAG:-}" ]; then
  TAG="$IMAGE_TAG"
else
  TAG="$(git rev-parse --short HEAD)"
  if [ "$MODE" = "deploy" ] && [ -n "$(git status --porcelain -- apps/server packages/shared prisma pnpm-lock.yaml)" ]; then
    # 커밋하지 않은 서버 변경이 들어간 이미지는 커밋 번호만으로 구분되지 않는다
    TAG="$TAG-dirty-$(date +%Y%m%d%H%M%S)"
    echo "주의: 커밋하지 않은 서버 변경이 있습니다. 이미지 태그: $TAG"
  fi
fi
IMAGE="$REGISTRY/$ECR_REPOSITORY:$TAG"

if [ "$MODE" = "deploy" ]; then
  echo "== 1/3 이미지 만들기 (linux/arm64) =="
  docker build --platform linux/arm64 -f apps/server/Dockerfile -t "$IMAGE" .

  echo "== 2/3 ECR에 올리기 =="
  aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY"
  docker push "$IMAGE"
else
  echo "== 빌드를 건너뜁니다. 이미지: $IMAGE =="
  aws ecr describe-images --repository-name "$ECR_REPOSITORY" --image-ids "imageTag=$TAG" --query 'imageDetails[0].imageTags[0]' --output text >/dev/null \
    || { echo "ECR에 이 태그의 이미지가 없습니다: $TAG (IMAGE_TAG=<태그>로 지정할 수 있습니다)" >&2; exit 1; }
fi

echo "== 3/3 EC2에서 받아 다시 띄우기 =="
# compose · Caddyfile은 비밀값이 없어 그대로 보낸다. .env.prod는 EC2가 Parameter Store에서 역할로 읽는다.
cat > "$TMP/deploy.sh" <<EOF
set -e
mkdir -p '$REMOTE_DIR' && cd '$REMOTE_DIR'
echo '$(base64 < docker-compose.prod.yml | tr -d '\n')' | base64 -d > docker-compose.prod.yml
echo '$(base64 < Caddyfile | tr -d '\n')' | base64 -d > Caddyfile
printf 'SERVER_IMAGE=%s\nAPI_DOMAIN=%s\n' '$IMAGE' '$API_DOMAIN' > .env
umask 077
aws ssm get-parameter --region '$AWS_REGION' --name '$ENV_PARAMETER' --with-decryption --query Parameter.Value --output text > .env.prod
umask 022
aws ecr get-login-password --region '$AWS_REGION' | docker login --username AWS --password-stdin '$REGISTRY' >/dev/null 2>&1
docker compose -f docker-compose.prod.yml pull -q server
docker compose -f docker-compose.prod.yml up -d --remove-orphans 2>&1 | tail -6
echo '서버가 뜨기를 기다립니다(마이그레이션 포함, 최대 4분)...'
for i in \$(seq 1 48); do
  status=\$(docker inspect -f '{{.State.Health.Status}}' estaitflow-server 2>/dev/null || echo starting)
  running=\$(docker inspect -f '{{.State.Running}}' estaitflow-server 2>/dev/null || echo false)
  restarts=\$(docker inspect -f '{{.RestartCount}}' estaitflow-server 2>/dev/null || echo 0)
  if [ "\$status" = healthy ]; then echo '서버가 떴습니다.'; break; fi
  if [ "\$restarts" -ge 2 ] || { [ "\$running" != true ] && [ \$i -gt 3 ]; }; then echo '서버가 뜨지 못합니다. 마지막 로그:'; docker logs --tail 60 estaitflow-server 2>&1; exit 1; fi
  if [ \$i -eq 48 ]; then echo '4분 안에 뜨지 않았습니다. 마지막 로그:'; docker logs --tail 60 estaitflow-server 2>&1; exit 1; fi
  sleep 5
done
# Caddyfile이 바뀌었어도 이미 떠 있는 Caddy는 다시 읽지 않는다. 끊김 없이 다시 읽힌다(바뀐 게 없으면 아무 일도 없다).
# 읽지 못하면 배포를 실패로 끝낸다 — 성공으로 넘기면 바꾼 설정이 적용된 줄 알게 된다.
if ! reload_out=\$(docker compose -f docker-compose.prod.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>&1); then
  echo "\$reload_out" | tail -5
  echo 'Caddy가 새 Caddyfile을 읽지 못했습니다. 예전 설정으로 계속 돕니다 — Caddyfile을 고쳐 다시 배포하세요.'
  exit 1
fi
docker image prune -af --filter 'until=168h' >/dev/null 2>&1 || true
docker compose -f docker-compose.prod.yml ps --format 'table {{.Name}}\t{{.Status}}'
EOF
run_on_server "$TMP/deploy.sh" 600

echo
echo "배포 끝: https://$API_DOMAIN/api-docs"
