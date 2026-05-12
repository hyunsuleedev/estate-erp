#!/bin/sh
set -e

cd /app

# One-off seed task 모드 — SEED_SCRIPT 가 설정되면 마이그레이트 스킵하고 시드만 실행
if [ -n "$SEED_SCRIPT" ]; then
  SCRIPT_PATH="prisma/${SEED_SCRIPT}.ts"
  if [ ! -f "$SCRIPT_PATH" ]; then
    echo "[entrypoint] SEED_SCRIPT '$SEED_SCRIPT' 가 가리키는 $SCRIPT_PATH 파일이 없습니다." >&2
    exit 2
  fi
  echo "[entrypoint] Running one-off seed: $SCRIPT_PATH"
  # tsx 는 server workspace 의 dependency 이므로 거기 .bin 을 사용한다.
  exec apps/server/node_modules/.bin/tsx "$SCRIPT_PATH"
fi

# Prisma migrate deploy — task 부팅 시 자동 실행
# 단일 task 환경 가정 (multi-task에서는 별도 one-off task로 분리 필요)
echo "[entrypoint] Running prisma migrate deploy..."
npx prisma migrate deploy --schema=prisma/schema

echo "[entrypoint] Starting NestJS server..."
cd /app/apps/server
exec node dist/main
