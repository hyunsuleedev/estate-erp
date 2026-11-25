# 운영 배포 (AWS · EC2 한 대)

서버를 AWS에 올리는 순서다. 구성은 **EC2 한 대(Caddy + NestJS 서버) + RDS(PostgreSQL) + ElastiCache(Redis) + ECR**이고,
리전은 서울(ap-northeast-2)이다. 예전의 ECS Fargate 구성(`.github/workflows/deploy-server.yml`)은 쓰지 않는다.

저장소에 있는 것:

| 파일 | 하는 일 |
| --- | --- |
| `docker-compose.prod.yml` | EC2에서 도는 구성 (caddy + server) |
| `Caddyfile` | HTTPS 인증서 자동 발급, `server:3000`으로 넘기기 |
| `scripts/deploy-server.sh` | 내 Mac에서 빌드 → ECR 푸시 → EC2에서 받아 띄우기 (EC2에는 SSH가 아니라 Systems Manager로 명령을 보낸다) |
| `scripts/publish-desktop.sh` | 데스크톱 설치 파일을 만들어 Cloudflare R2(자동 업데이트 주소)에 올리기 |
| `.env.prod.example` | 서버 환경 변수 틀 (채운 `.env.prod`는 git에 올리지 않는다) |
| `.env.deploy.example` | 배포 스크립트 설정 틀 (채운 `.env.deploy`도 올리지 않는다) |

## 1. 계정과 권한

- [ ] 루트 계정에 MFA를 건다.
- [ ] 내 Mac의 AWS CLI 로그인: `aws login --profile estaitflow`(브라우저 승인, 임시 자격 증명). 배포에는 ECR 푸시, Systems Manager 명령 보내기(`ssm:SendCommand`), Parameter Store 쓰기 권한이 필요하다.
- [ ] EC2용 IAM 역할 1개: `AmazonEC2ContainerRegistryReadOnly` + `AmazonSSMManagedInstanceCore`, 그리고 서버 비밀값 파라미터(`/estaitflow/prod/env`) 하나를 읽는 권한.
- [ ] Budgets로 월 예산 알림을 건다.

## 2. 네트워크 · DB · Redis · ECR

NAT Gateway는 만들지 않는다.

- [ ] 보안그룹 `estaitflow-ec2-sg`: 80 · 443 전체. 22번은 열지 않는다(Systems Manager로 접속한다).
- [ ] 보안그룹 `estaitflow-rds-sg`: 5432를 `estaitflow-ec2-sg`에서만.
- [ ] 보안그룹 `estaitflow-redis-sg`: 6379를 `estaitflow-ec2-sg`에서만.
- [ ] **RDS**: PostgreSQL 17, `db.t4g.micro`, Single-AZ, gp3 20GB, 자동 백업 7일, 퍼블릭 액세스 아니요, 삭제 방지 켬, 보안그룹 `estaitflow-rds-sg`. 처음 DB 이름을 `estaitflow`로 만든다.
- [ ] **ElastiCache**: 노드형(서버리스 아님), 클러스터 모드 끔, `cache.t4g.micro` 1대, 보안그룹 `estaitflow-redis-sg`.
  - 파라미터 그룹을 새로 만들어 `maxmemory-policy = noeviction`으로 둔다. 기본값은 메모리가 차면 키를 지워서, 대기열(BullMQ)의 일이 사라질 수 있다.
  - 전송 암호화를 켜면 주소가 `rediss://`로 시작한다.
- [ ] **ECR**: 프라이빗 리포지토리 `estaitflow-server`, 수명 주기 정책 "최신 이미지 5개만 유지".

## 3. EC2와 도메인

- [ ] EC2: Ubuntu 24.04 LTS (ARM64), `t4g.small`, gp3 30GB, IAM 역할 연결, 보안그룹 `estaitflow-ec2-sg`.
- [ ] Elastic IP를 받아 EC2에 붙인다.
- [ ] EC2에 Docker · Compose 플러그인 · AWS CLI를 설치하고 `ubuntu` 사용자를 `docker` 그룹에 넣는다. 스왑 2GB를 만든다.
- [ ] DNS: `api.estaitt.com`의 레코드를 EC2의 Elastic IP를 가리키는 A 레코드로 **바꾼다**(지금은 예전 로드밸런서를 가리키는 CNAME이 있다). Cloudflare를 쓰면 프록시를 끈 "DNS only"로 둔다.

## 4. 내 Mac에서 준비

```bash
cp .env.deploy.example .env.deploy   # EC2 인스턴스 ID, 도메인
cp .env.prod.example .env.prod       # 서버 비밀값
```

`.env.prod`에서 꼭 채울 것: `DATABASE_URL`(끝에 `?sslmode=require`), `REDIS_URL`, `AUTH0_*` 여섯 개, `MCP_RESOURCE_URL`,
`CONTRACT_PARTY_CRYPTO_KEY`.

`CONTRACT_PARTY_CRYPTO_KEY`는 계약서의 주민(법인)번호 · 전화번호를 암호화하는 키다. **한 번 정하면 바꾸지 않는다** —
바꾸거나 잃으면 이미 저장한 값을 풀 수 없다. 비밀번호 관리 프로그램에도 따로 보관한다.

## 5. 첫 배포

```bash
./scripts/deploy-server.sh --push-env   # .env.prod를 암호화해 Parameter Store에 올린다 (처음 한 번, 값이 바뀔 때)
./scripts/deploy-server.sh              # 빌드 → 푸시 → 띄우기
```

서버는 뜰 때 `prisma migrate deploy`를 먼저 돌린다. 첫 배포에서 표와 확장(postgis · pg_trgm · pgcrypto)이 만들어진다.

초기 데이터는 EC2에서 한 번 실행한다(Systems Manager 세션이나 `aws ssm send-command`로). 법정동(`seed-legal-dong`), 계약서 서식(`seed-contract-templates`):

```bash
cd ~/estaitflow
docker compose -f docker-compose.prod.yml run --rm -e SEED_SCRIPT=seed-legal-dong server
```

## 6. Auth0

- [ ] `API_BASE_URL=https://api.estaitt.com`으로 `apps/server/auth0/deploy-actions.sh`를 실행한다(순서: `apps/server/auth0/README.md`).
- [ ] Auth0의 MCP API 식별자가 `MCP_RESOURCE_URL`과 같은지 본다.

## 7. 확인

- [ ] `https://api.estaitt.com/api-docs`가 HTTPS로 열린다.
- [ ] 데스크톱 앱(`VITE_API_BASE_URL=https://api.estaitt.com`)에서 로그인, 매물 · 프로젝트 만들기 · 고치기, 두 창 사이 실시간 반영.
- [ ] 외부 AI에서 `https://api.estaitt.com/mcp` 연결과 도구 호출.
- [ ] 가동 감시(UptimeRobot 등)를 `/api-docs`에 건다.

## 그 뒤의 배포

```bash
./scripts/deploy-server.sh
```

- 스키마가 바뀌는 배포 전에는 RDS 스냅샷을 뜬다. 마이그레이션이 실패하면 서버가 뜨지 못한다.
- 되돌리기: 이전 커밋을 체크아웃하고 `./scripts/deploy-server.sh --skip-build`(그 커밋의 이미지가 ECR에 남아 있을 때). 스키마는 되돌려지지 않는다.
- 환경 변수를 바꿨으면 `--push-env` 뒤에 `--skip-build`.
- 로그: `./scripts/deploy-server.sh --logs`.

## 데스크톱 앱 배포와 자동 업데이트

설치 파일과 업데이트 목록은 Cloudflare R2 저장소 `estaitflow-releases`에 올리고, `https://releases.estaitt.com/desktop/`으로 내려받는다.

```bash
# apps/desktop/package.json의 version을 올린 뒤
ESTATE_ERP_MAC_IDENTITY="Developer ID Application: …" ./scripts/publish-desktop.sh
```

- 설치된 앱은 `latest-mac.yml` · `latest.yml`을 읽어 새 버전을 찾는다. 스크립트는 설치 파일을 먼저, 목록을 맨 나중에 올린다.
- macOS는 서명한 앱만 자동 업데이트가 된다. Windows 설치 파일은 Windows에서 만들어 `--upload`로 올린다.
