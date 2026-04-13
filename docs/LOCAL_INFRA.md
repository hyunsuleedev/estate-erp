# Local Infra

개발용 앱 프로세스는 호스트에서 실행하고, 인프라만 Docker로 띄운다.

대상 서비스:

- PostgreSQL + PostGIS
- Redis

## 시작

```bash
pnpm infra:up
```

서비스 상태 확인:

```bash
pnpm infra:ps
pnpm infra:logs
```

종료:

```bash
pnpm infra:down
```

## 서버 실행 순서

```bash
cp apps/server/.env.example apps/server/.env
pnpm infra:up
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev:server
```

## 포트

- PostgreSQL: `127.0.0.1:5432`
- Redis: `127.0.0.1:6379`

## 주의사항

- 이미 로컬에 떠 있는 PostgreSQL/Redis가 있으면 포트 충돌이 난다.
- PostgreSQL 이미지는 로컬 Dockerfile에서 `postgres:17-bookworm` 위에 PostGIS 패키지를 설치한다.
- `postgis`, `pg_trgm` extension 생성은 Docker init script가 아니라 Prisma migration이 담당한다.
- DB 데이터는 Docker named volume에 저장된다. 완전히 초기화하려면 `docker compose -f docker-compose.dev.yml down -v`를 사용한다.
