#!/bin/sh
set -e

# Prisma migrate deploy — task 부팅 시 자동 실행
# 단일 task 환경 가정 (multi-task에서는 별도 one-off task로 분리 필요)
echo "[entrypoint] Running prisma migrate deploy..."
cd /app
npx prisma migrate deploy --schema=prisma/schema

echo "[entrypoint] Starting NestJS server..."
cd /app/apps/server
exec node dist/main
