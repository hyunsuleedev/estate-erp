---
paths:
  - "prisma/**"
  - "apps/server/src/prisma/**"
---

# DB 규칙

표와 칸의 목록은 적지 않는다. `prisma/schema/*.prisma`가 기준이고, 왜 그렇게 했는지는 그 파일의 주석에 있다. 영역별 요약은 `docs/DATA_STRUCTURE.md`.

## 이름과 타입

- 모델은 `PascalCase`, 필드는 `camelCase` + `@map("snake_case")`, 표는 `@@map("snake_case_복수형")`
- 가격은 `Int`, 만원 단위. 면적은 `Decimal`, m² 단위
- id는 UUID. 법정동 마스터만 코드가 PK다 (Province `"11"`, District `"11740"`, Ward `"1174010100"`)
- 좌표는 `Unsupported("geometry(Point, 5179)")`. Prisma로 읽고 쓸 수 없으므로 `$queryRaw`를 쓴다

## 새 표를 만들 때

1. `office_id`를 넣는다(법정동 마스터 제외).
2. `apps/server/src/prisma/prisma.service.ts`의 `TENANT_SCOPED_MODELS`에 올린다. 빠지면 그 표는 사무소 격리 없이 조회된다.
3. 변경 이력이 필요하면 `AUDITED_MODELS`에도 올린다. 주민번호·전화번호가 든 표와, 수집기가 대량으로 덮어쓰는 표(외부 매물 등)는 올리지 않는다.
4. 같은 사무소 안에서만 이어져야 하는 관계는 `(office_id, id)` 조합 FK로 건다. 다른 사무소의 행을 가리키는 일을 DB가 막게 하기 위해서다.

## 마이그레이션

- 위치는 `prisma/schema/migrations/`. 개발에서는 `pnpm prisma:migrate`, 배포에서는 `prisma migrate deploy`.
- Prisma가 표현하지 못하는 것(CHECK, 조건부 unique index, 조합 FK, PostGIS)은 마이그레이션 SQL에 직접 쓴다. 이런 제약은 스키마 파일에는 주석으로만 남으므로, 표를 고칠 때 그 표의 마이그레이션도 찾아본다.
- 이미 적용된 마이그레이션 파일은 고치지 않는다. 새 파일을 만든다.
- 데이터를 옮기는 마이그레이션은 실제 데이터의 복사본에서 먼저 돌려 본다. 로컬 DB는 다른 작업 세션도 쓰므로 적용 전에 사용자에게 묻는다.
- 칸을 지울 때는 그 칸을 읽는 서버 코드, `packages/api-client` 타입, 화면, 시드를 함께 지운다.

## 공공 데이터와 사무소 데이터

- Site·Dong·Unit은 `office_id`가 비어 있을 수 있다. 비어 있으면 모든 사무소가 보는 공공 데이터다.
- Site를 읽을 때는 `isPublic = true OR officeId = 내 사무소`로 좁힌다. `isLocked`인 공공 데이터는 사무소가 고칠 수 없다.
- 사무소가 관리하는 단지는 `OfficeSite`로 표시한다.

## 시드

- `prisma/seed*.ts`. 법정동(`seed-legal-dong.ts`)은 공공데이터에서 가져오는 읽기 전용 마스터다.
- 데모 시드(`seed-demo.ts`)는 데모 사무소의 데이터만 지우고 다시 만든다. 공용 DB에서 돌리기 전에 사용자에게 묻는다.
