# syntax=docker/dockerfile:1.7

###############################################################################
# Estate ERP NestJS Server — Multi-stage Dockerfile
#
# 빌드 전략 (목표 이미지 ~600-800MB):
#   1) deps       : 모든 deps install (dev 포함, 빌드용)
#   2) builder    : shared + server 빌드 (prisma generate 포함)
#   3) prod-deps  : prod-only deps만 별도 install
#   4) runner     : prod-deps + dist + prisma client만 복사 (chown 한 번)
#
# 핵심 최적화:
#   - prisma binaryTargets에 Alpine만 명시 → engine 1~2개만 (40MB vs 200MB+)
#   - runner는 dev deps(tsc/eslint/jest 등) 없음 → ~600MB 절약
#   - chown은 COPY --chown으로 처리 → 별도 레이어 X (1.3GB 절약)
###############################################################################

ARG NODE_VERSION=23
ARG PNPM_VERSION=10.33.0

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
RUN apk add --no-cache libc6-compat openssl wget \
    && corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

###############################################################################
# Stage: deps — 전체 deps install (빌드용, dev 포함)
###############################################################################
FROM base AS deps
COPY .npmrc* pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/desktop/package.json ./apps/desktop/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/api-client/package.json ./packages/api-client/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

###############################################################################
# Stage: builder — shared + nest build (prisma generate 자동)
###############################################################################
FROM deps AS builder
COPY tsconfig.base.json* ./
COPY prisma ./prisma
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

RUN pnpm --filter @estate-erp/shared build \
    && pnpm --filter @estate-erp/server build

###############################################################################
# Stage: prod-deps — server만의 prod-only deps install (별도 cache)
#   workspace에서 prisma client는 dev이지만 generate한 .prisma는 builder에서 복사
###############################################################################
FROM base AS prod-deps
COPY .npmrc* pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/desktop/package.json ./apps/desktop/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/api-client/package.json ./packages/api-client/

# server + 그 의존 workspace(shared)만 prod deps install
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod \
        --filter @estate-erp/server... \
        --filter @estate-erp/shared

###############################################################################
# Stage: runner — 슬림 prod 이미지
###############################################################################
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nestjs

# Prisma schema (migrate 등 runtime에 필요)
COPY --chown=nestjs:nodejs prisma ./prisma

# pnpm workspace 메타파일
COPY --chown=nestjs:nodejs .npmrc* pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --chown=nestjs:nodejs apps/server/package.json ./apps/server/
COPY --chown=nestjs:nodejs packages/shared/package.json ./packages/shared/

# prod-only deps만 가져오기 (dev deps 없음 = ~600MB 절약)
# node_modules에는 @estate-erp/shared symlink가 있어야 하지만 builder의 hoisted layout을 그대로 신뢰
COPY --chown=nestjs:nodejs --from=prod-deps /app/node_modules ./node_modules

# builder에서 prisma generate 결과 (prisma는 dev dep이지만 generate 산출물은 runtime 필요)
COPY --chown=nestjs:nodejs --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=nestjs:nodejs --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
# prisma CLI도 복사 (entrypoint에서 migrate deploy 실행용)
COPY --chown=nestjs:nodejs --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --chown=nestjs:nodejs --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --chown=nestjs:nodejs --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Workspace 패키지 — pnpm이 의존자(apps/server) node_modules 안에 symlink로 둠
# apps/server/node_modules/@estate-erp/shared → ../../packages/shared
COPY --chown=nestjs:nodejs --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --chown=nestjs:nodejs --from=builder /app/packages/shared/dist ./packages/shared/dist

# 서버 빌드 산출물
COPY --chown=nestjs:nodejs --from=builder /app/apps/server/dist ./apps/server/dist

# Entrypoint script (prisma migrate deploy + node dist/main)
COPY --chown=nestjs:nodejs apps/server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER nestjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/api-docs || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
